import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { HttpError } from "./backend.ts";
import { calculationFromDraft, calculationCurrencies, calculationPreflight, calculationCostRows } from "./customs-calculation-draft.mts";
import { fetchHmrcMonthlyRates, selectHmrcExchangeRate } from "./customs-hmrc-exchange-rates.mts";
import { ukCustomsDate } from "./customs-calculation-date.mts";
import { calculationUsesCurrentRules } from "./customs-calculation-version.mts";
import type { Rate, CalculationResult } from "./customs-duty-calculation.mts";
import { createTariffClient, type TariffSnapshot } from "./customs-tariff-reference.mts";
import { calculationHistoryFilter, calculationHistoryPage } from "./customs-calculation-history.mts";
import { retainTariffEvidence } from "./customs-reference-evidence.mts";
import { fetchAirfreightPublication, airportFromPublication, type AirfreightPublication, type AirfreightAirport } from "./customs-airfreight-reference.ts";
import { fetchVatExpensePublication } from "./customs-vat-expense-reference.ts";
import { fetchTariffExchangeReference } from "./customs-tariff-exchange-reference.ts";
import { submissionCalculationLink } from "./customs-submission-calculation-link.mts";
import type { ProcessingTariffEvidence } from "./customs-ni-processing-release.mts";
import { niPreferenceCodes } from "./customs-ni-preference-codes.mts";

const fetchOfficialTariff = createTariffClient({ clientId: Deno.env.get("HMRC_TARIFF_CLIENT_ID") ?? "", clientSecret: Deno.env.get("HMRC_TARIFF_CLIENT_SECRET") ?? "" });

const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";

/** Existing submission write authorisation must run before this scoped read. */
export async function prepareSubmissionCalculationLink(admin: SupabaseClient, declarationId: string, draft: unknown, checkedAt: string) {
  const { data, error } = await admin.from("Customs_CalculationAudit").select("id,declaration_id,kind,created_at,draft_snapshot,evidence")
    .eq("declaration_id", declarationId).eq("kind", "calculation")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new HttpError(503, "Calculation evidence could not be checked. No submission was sent; try again.");
  return submissionCalculationLink(declarationId, draft, data, checkedAt);
}

export async function calculationHistory(admin: SupabaseClient, declarationId: string, options: { before?: string; itemId?: string } = {}) {
  const scoped = () => admin.from("Customs_CalculationAudit").select("*").eq("declaration_id", declarationId);
  let query = scoped().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(31);
  if (options.before) {
    try { query = query.or(calculationHistoryFilter(options.before)); }
    catch { throw new HttpError(422, "The history position is invalid. Reload calculation history."); }
  }
  if (options.itemId && options.itemId.length > 200) throw new HttpError(422, "The item reference is invalid.");
  const [page, calculation, override] = await Promise.all([
    query,
    scoped().eq("kind", "calculation").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    options.itemId ? scoped().eq("kind", "override").eq("evidence->>itemId", options.itemId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (page.error || calculation.error || override.error) throw new HttpError(503, "Calculation history is unavailable. The calculation audit migration must be installed before saving results.");
  return { ...calculationHistoryPage(page.data ?? []), latestCalculation: calculation.data, latestItemOverride: override.data };
}

async function append(admin: SupabaseClient, actorId: string, declarationId: string, draft: unknown, evidence: unknown, kind = "calculation", parent: string | null = null) {
  const { data, error } = await admin.rpc("customs_append_calculation", {
    p_actor: actorId, p_declaration: declarationId, p_draft: draft, p_kind: kind, p_evidence: evidence, p_parent: parent,
  });
  if (error) throw new HttpError(error.code === "40001" ? 409 : error.code === "42501" ? 403 : 503,
    error.code === "40001" ? kind === "override"
      ? "The declaration or calculation changed while you were reviewing it. Reload calculation history and review the latest workings before saving your override."
      : "The declaration changed during calculation. Save and calculate again."
      : "The calculation could not be saved to its audit trail. No submission fields were changed.");
  return data;
}

/** Call only after declarationForUser(..., true) has authorised this caller.
 * References are loaded server-side. Client rate snapshots are not trusted. */
export async function calculateSavedDeclaration(admin: SupabaseClient, actorId: string, declarationId: string, draft: Record<string, unknown>, tariffProvider: typeof fetchOfficialTariff = fetchOfficialTariff) {
  const evidence = await calculateDraftEvidence(draft, tariffProvider);
  const id = await append(admin, actorId, declarationId, draft, evidence);
  return { id, ...evidence };
}

/** Read-only preview: no database client, audit append, draft save or submission.
 * The route must authorise the declaration before accepting unsaved inputs. */
export async function previewDeclarationCalculation(draft: Record<string, unknown>, tariffProvider: typeof fetchOfficialTariff = fetchOfficialTariff) {
  const issues = calculationPreflight(draft);
  if (issues.length) return { result: null, issues };
  try {
    const evidence = await calculateDraftEvidence(draft, tariffProvider);
    return { result: evidence.result, issues: evidence.result.issues };
  } catch (error) {
    if (error instanceof HttpError && error.status === 422) return { result: null, issues: [error.message] };
    throw error;
  }
}

async function calculateDraftEvidence(draft: Record<string, unknown>, tariffProvider: typeof fetchOfficialTariff) {
  const preflightIssues = calculationPreflight(draft);
  if (preflightIssues.length) throw new HttpError(422, preflightIssues.join(" "));
  const clock = new Date();
  const date = ukCustomsDate(clock);
  const currencies = calculationCurrencies(draft);
  let publication: unknown = null;
  const rates: Rate[] = [];
  const retrievedAt = clock.toISOString();
  let vatExpensePublication: Awaited<ReturnType<typeof fetchVatExpensePublication>> | null = null;
  const expenseSetup = record(record(draft.dutyCalculationSetup).costs);
  if (calculationCostRows(draft).some(cost => record(record(expenseSetup[cost.id]).vatExpense).method === "national")) {
    try { vatExpensePublication = await fetchVatExpensePublication(); }
    catch { throw new HttpError(503, "HMRC's national incidental-expense schedule could not be verified. No calculation was saved; check the source and try again."); }
  }
  let airfreightReferenceEvidence: { publication: AirfreightPublication; airport: AirfreightAirport | null; issues: string[]; appliesTo: "published-reference-only" } | null = null;
  const airCosts = calculationCostRows(draft).filter(cost => ["AR", "AS", "BR", "BS"].includes(cost.code));
  if (airCosts.length) {
    const loadingAirport = text(draft.loadingLocationId);
    if (!/^[A-Z]{3}$/.test(loadingAirport)) throw new HttpError(422, "Enter the three-letter airport of loading from the air waybill before calculating airfreight.");
    let source: AirfreightPublication;
    try { source = await fetchAirfreightPublication(); }
    catch (error) { throw new HttpError(503, error instanceof Error ? error.message : "Official airport reference unavailable. Previous calculations are retained."); }
    airfreightReferenceEvidence = { publication: source, airport: null, issues: [], appliesTo: "published-reference-only" };
    try { airfreightReferenceEvidence.airport = airportFromPublication(source, loadingAirport); }
    catch (error) { airfreightReferenceEvidence.issues.push(error instanceof Error ? error.message : "Airport reference could not be resolved."); }
  }
  if (currencies.length) {
    try {
      publication = await fetchHmrcMonthlyRates(date);
      for (const currency of currencies) {
        const rate = selectHmrcExchangeRate(publication, currency, date, retrievedAt);
        rates.push({ currency, rate: rate.rate, direction: rate.direction, source: rate.sourceUrl, validFrom: rate.validFrom, validTo: rate.validTo, retrievedAt, reference: `${currency}:${rate.validFrom}:${rate.validTo}:${rate.rate}` });
      }
    } catch (error) { throw new HttpError(503, error instanceof Error ? error.message : "Official exchange rates are unavailable. Previous calculations are retained."); }
  }
  let calculated: ReturnType<typeof calculationFromDraft>;
  const setup = record(draft.dutyCalculationSetup);
  let tariffs: Record<string, TariffSnapshot | { error: string }> | undefined;
  const vatTariffs: Record<string, TariffSnapshot | { error: string }> = {};
  const processingTariffs: ProcessingTariffEvidence = {};
  if (setup.rateSource !== "operator") {
    tariffs = {};
    const items = (Array.isArray(draft.items) ? draft.items : []).map(record);
    const pending = new Map<string, Promise<TariffSnapshot>>();
    // Bound provider concurrency and deduplicate identical lookups within a run.
    for (let offset = 0; offset < items.length; offset += 4) {
      await Promise.all(items.slice(offset, offset + 4).map(async item => {
        const deriveNiRisk = setup.jurisdiction === "NI" && !!record(record(setup.items)[text(item.id)]).niRiskFacts;
        const request = { code: text(item.commodityCode), origin: text(item.nonPreferentialOrigin), date, dataset: setup.jurisdiction === "NI" && (setup.niTariff === "EU" || deriveNiRisk) ? "xi" as const : "uk" as const };
        const key = JSON.stringify(request);
        try {
          let operation = pending.get(key);
          if (!operation) { operation = tariffProvider(request); pending.set(key, operation); }
          tariffs![text(item.id)] = await operation;
          if (request.dataset === "xi") {
            const vatRequest = { ...request, dataset: "uk" as const }, vatKey = JSON.stringify(vatRequest);
            let vatOperation = pending.get(vatKey);
            if (!vatOperation) { vatOperation = tariffProvider(vatRequest); pending.set(vatKey, vatOperation); }
            try { vatTariffs[text(item.id)] = await vatOperation; }
            catch (error) { vatTariffs[text(item.id)] = { error: error instanceof Error ? error.message : "UK VAT evidence could not be retrieved." }; }
          }
        } catch (error) { tariffs![text(item.id)] = { error: error instanceof Error ? error.message : "The official tariff lookup failed." }; }
      }));
    }
    const originalOutputs = new Set(items.filter(item => setup.jurisdiction === "NI" && item.procedureCode === "4051" && record(record(setup.niProcessingRelease)[text(item.id)]).basis === "original-inputs").map(item => text(item.id)));
    if (originalOutputs.size) {
      const worksheet = record(setup.processingInputs);
      const consumption = (Array.isArray(worksheet.consumption) ? worksheet.consumption : []).map(record);
      const lots = (Array.isArray(worksheet.lots) ? worksheet.lots : []).map(record);
      if (lots.length > 1000 || consumption.length > 10000) throw new HttpError(422, "The processing worksheet exceeds the supported original-lot or consumption limit.");
      const required = new Set(consumption.filter(row => originalOutputs.has(text(row.outputItemId))).map(row => text(row.inputLotId)));
      const activeLots = lots.filter(lot => required.has(text(lot.id)));
      for (let offset = 0; offset < activeLots.length; offset += 4) {
        await Promise.all(activeLots.slice(offset, offset + 4).map(async lot => {
          const lookup = async (dataset: "uk" | "xi"): Promise<TariffSnapshot | { error: string }> => {
            const request = { code: text(lot.commodityCode), origin: text(lot.origin), date, dataset };
            try {
              const key = JSON.stringify(request);
              let operation = pending.get(key);
              if (!operation) { operation = tariffProvider(request); pending.set(key, operation); }
              return await operation;
            } catch (error) { return { error: error instanceof Error ? error.message : "Original-input tariff evidence is unavailable." }; }
          };
          // Sequential within each lot keeps total provider concurrency at four.
          processingTariffs[text(lot.id)] = { duty: await lookup("xi"), vat: await lookup("uk") };
        }));
      }
    }
  }
  let tariffExchangeReference: Awaited<ReturnType<typeof fetchTariffExchangeReference>> | null = null;
  // Fetch tariff FX for the requested duty treatment, not an unclaimed alternative.
  const savedItems = (Array.isArray(draft.items) ? draft.items : []).map(record);
  if (Object.values(processingTariffs).some(lookup => !("error" in lookup.duty) && lookup.duty.measures.some(measure => measure.typeCode === "103" && measure.components.some(component => component.attributes.monetary_unit_code === "EUR"))) || [...Object.entries(tariffs ?? {}), ...Object.entries(vatTariffs)].some(([id, snapshot]) => {
    if ("error" in snapshot) return false;
    const item = savedItems.find(item => text(item.id) === id);
    const pairedNi = setup.jurisdiction === "NI" && !!record(record(setup.items)[id]).niRiskFacts;
    const codes = niPreferenceCodes({ ...item, headerAdditionalInformationCode: draft.headerAdditionalInformationCode, jurisdiction: setup.jurisdiction });
    const preference = pairedNi ? codes[snapshot.request.dataset] : text(item?.preferenceCode);
    const review = pairedNi ? record(record(record(setup.niPreferences)[id])[snapshot.request.dataset]) : record(record(setup.preferences)[id]);
    const authorisedUse = setup.jurisdiction === "GB" && item?.procedureCode === "4400" && snapshot.request.dataset === "uk" && ["140", "115"].includes(preference);
    const authorisedUseReview = record(record(setup.authorisedUses)[id]);
    const remedyReview = record(record(record(setup.items)[id]).remedyReview);
    const remedyIds = new Set(Array.isArray(remedyReview.selections) ? remedyReview.selections.map(row => text(record(row).measureId)) : []);
    return !("error" in snapshot) && snapshot.measures.some(measure => {
      const baseDuty = preference && preference !== "100" ? ["200", "300"].includes(preference) && ["142", "144"].includes(measure.typeCode) && measure.preferenceCode === preference && (!review.measureId || review.measureId === measure.id) : measure.typeCode === "103";
      const reviewedRemedy = setup.jurisdiction === "GB" && snapshot.request.dataset === "uk" && remedyIds.has(measure.id) && ["551", "552", "553", "554"].includes(measure.typeCode);
      const reviewedAuthorisedUse = authorisedUse && measure.id === authorisedUseReview.measureId && measure.preferenceCode === preference && measure.typeCode === (preference === "140" ? "105" : "115");
      return (baseDuty || reviewedRemedy || reviewedAuthorisedUse) && measure.components.some(component => component.attributes.monetary_unit_code === "EUR");
    });
  })) {
    try { tariffExchangeReference = await fetchTariffExchangeReference(date); }
    catch (error) { throw new HttpError(503, error instanceof Error ? error.message : "Official tariff conversion evidence is unavailable. Previous calculations are retained."); }
  }
  // The saved declaration remains unchanged. Its conversion date is not authority
  // for a new draft estimate; preserve the effective input date in the result.
  try { calculated = calculationFromDraft({ ...draft, customsConversionDate: date }, rates, retrievedAt, tariffs, vatTariffs, tariffExchangeReference?.selectedRate, processingTariffs); }
  catch { throw new HttpError(422, "The saved calculation inputs are malformed. Review the invoice items and adjustments."); }
  if (airfreightReferenceEvidence) {
    const airport = airfreightReferenceEvidence.airport;
    calculated.result.referenceNotices = [{ source: airfreightReferenceEvidence.publication.source,
      message: airport ? `HMRC currently lists ${airport.code} (${airport.location}), zone ${airport.zone}, at ${airport.customsPercentage}% customs inclusion. This is published reference evidence only: the entered percentage remains the estimate input until movement/date applicability is verified.` : "The loading airport could not be matched to a valid HMRC entry. Its original publication is retained in this calculation's evidence." }];
  }
  if (vatExpensePublication) {
    calculated.result.referenceNotices = [...(calculated.result.referenceNotices ?? []), { source: vatExpensePublication.source, message: `HMRC's national incidental-expense guidance matched the reviewed schedule when retrieved at ${vatExpensePublication.retrievedAt}. The publication is retained with this estimate; consignment eligibility and calculation certification remain separate checks.` }];
  }
  if (airfreightReferenceEvidence?.issues.length) {
    calculated.result.issues.push(...airfreightReferenceEvidence.issues);
    calculated.result.totals = null; calculated.result.autoPopulationAllowed = false;
    delete calculated.result.liabilityTotals;
    for (const line of calculated.result.lines) {
      line.status = "needs-information";
      delete line.duty; delete line.vat; delete line.customsValue; delete line.vatBase; delete line.vatLiability; delete line.vatTaxes; delete line.vatTaxRoundingDifference;
      line.taxes = []; line.workings = [];
    }
  }
  const processingReferenceEvidence = retainTariffEvidence(Object.fromEntries(Object.entries(processingTariffs).map(([id, lookup]) => [id, lookup.duty])), Object.fromEntries(Object.entries(processingTariffs).map(([id, lookup]) => [id, lookup.vat])));
  const evidence = { ...calculated, dateBasis: "draft-uk-today", exchangeRatePublication: publication, tariffExchangeReference, tariffReferenceEvidence: retainTariffEvidence(tariffs, vatTariffs), processingReferenceEvidence, airfreightReferenceEvidence, vatExpensePublication, retrievedAt, sourceKind: tariffs ? "official-tariff" : "operator-rate-estimate", submissionFieldsChanged: false };
  return evidence;
}

export async function overrideCalculation(admin: SupabaseClient, actorId: string, declarationId: string, draft: unknown, payload: Record<string, unknown>) {
  if (record(draft).direction !== "import") throw new HttpError(422, "Duty and VAT calculation overrides apply to import declarations only.");
  const parentId = text(payload.calculationId), itemId = text(payload.itemId), reason = text(payload.reason);
  const duty = text(payload.duty), vat = text(payload.vat);
  if (!/^[0-9a-f-]{36}$/i.test(parentId) || !itemId || reason.length < 10 || reason.length > 2000 || !/^\d{1,16}\.\d{2}$/.test(duty) || !/^\d{1,16}\.\d{2}$/.test(vat)) throw new HttpError(422, "Enter duty and VAT in GBP with two decimal places and a reason of 10–2,000 characters.");
  const { data, error } = await admin.from("Customs_CalculationAudit").select("*").eq("id", parentId).eq("declaration_id", declarationId).eq("kind", "calculation").maybeSingle();
  if (error || !data) throw new HttpError(404, "Calculation not found.");
  const result = record(data.evidence).result as CalculationResult;
  if (result?.date !== ukCustomsDate()) throw new HttpError(409, "This estimate is from a previous UK date. Calculate again before recording an override.");
  if (!calculationUsesCurrentRules(result)) throw new HttpError(409, "Calculation rules have changed. Calculate again and review the new workings before recording an override.");
  const line = result?.lines?.find(l => l.itemId === itemId);
  if (!line || line.duty === undefined || line.vat === undefined) throw new HttpError(422, "Complete the calculation before overriding its estimate.");
  const evidence = { itemId, reason, original: { duty: line.duty, vat: line.vat }, replacement: { duty, vat }, appliesTo: "estimate-only", submissionFieldsChanged: false };
  return { id: await append(admin, actorId, declarationId, draft, evidence, "override", parentId), ...evidence };
}
