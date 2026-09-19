import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { HttpError } from "./backend.ts";
import { retainedCalculationMatches, retainedSubmissionCalculationLink } from "./customs-submission-calculation-link.mts";
import { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts";
import { confirmProviderXmlCurrencies } from "./customs-provider-xml-currency.ts";
import { compareFinalProviderAssessment } from "./customs-provider-assessment.mts";
import { calculationHistoryFilter } from "./customs-calculation-history.mts";
import type { CalculationResult } from "./customs-duty-calculation.mts";

export const ASSESSMENT_ADAPTER_VERSION = "final-gbp-ni-v2";

/** Caller must authorise import declaration write access, without requiring a
 * draft: this appends evidence and never changes submitted declaration fields. */
export async function recordAssessmentComparison(admin: SupabaseClient, actorId: string, declarationId: string, sourceId: unknown) {
  if (typeof sourceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) throw new HttpError(422, "Select a retained provider response.");
  const source = await admin.from("Customs_ProviderResponseHistory").select("id,declaration_snapshot,response_payload")
    .eq("declaration_id", declarationId).eq("id", sourceId).maybeSingle();
  if (source.error) throw new HttpError(503, "The retained response could not be loaded. Try again.");
  if (!source.data) throw new HttpError(404, "That retained response is unavailable.");
  const link = retainedSubmissionCalculationLink(source.data.declaration_snapshot);
  if (!link?.calculationId) throw new HttpError(422, "This submission has no linked calculation to compare. A later calculation cannot replace it.");
  const saved = await admin.from("Customs_CalculationAudit").select("id,declaration_id,kind,created_at,draft_snapshot,evidence")
    .eq("declaration_id", declarationId).eq("id", link.calculationId).eq("kind", "calculation").maybeSingle();
  if (saved.error) throw new HttpError(503, "The submitted calculation could not be loaded. Try again.");
  if (!retainedCalculationMatches(source.data.declaration_snapshot, saved.data, declarationId)) throw new HttpError(422, "The retained response and calculation do not describe the same submission.");
  const evidence = confirmProviderXmlCurrencies(source.data.response_payload, extractProviderTaxEvidence(source.data.response_payload, source.data.declaration_snapshot));
  if (evidence.issues.length || !evidence.notices.length) throw new HttpError(422, "This response does not contain a complete readable tax notice.");
  let notices;
  try {
    notices = evidence.notices.map(notice => ({ notificationId: notice.notificationId, ...compareFinalProviderAssessment(notice, saved.data!.evidence.result as CalculationResult) }));
  } catch { throw new HttpError(422, "The retained calculation cannot be compared safely. Review its original evidence."); }
  const { data, error } = await admin.rpc("customs_record_assessment_comparison", {
    p_actor: actorId, p_declaration: declarationId, p_source: sourceId, p_calculation: link.calculationId,
    p_adapter_version: ASSESSMENT_ADAPTER_VERSION, p_evidence: { notices, calculationState: link.state },
  });
  if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "22023" ? 409 : 503,
    "The comparison could not be recorded. No declaration figures have changed.");
  return { id: data as string };
}

/** Existing declaration read permission applies to the entire returned page. */
export async function assessmentComparisonHistory(admin: SupabaseClient, declarationId: string, before?: string) {
  let query = admin.from("Customs_AssessmentComparisons").select("id,source_id,calculation_id,actor_auth_id,created_at,adapter_version,evidence")
    .eq("declaration_id", declarationId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
  if (before) {
    try { query = query.or(calculationHistoryFilter(before)); }
    catch { throw new HttpError(422, "The history position is invalid. Reload comparison history."); }
  }
  const { data, error } = await query;
  if (error) throw new HttpError(503, "Comparison history could not be loaded. Try again.");
  const history = (data ?? []).slice(0, 20), last = history.at(-1);
  return { history, nextCursor: (data?.length ?? 0) > 20 && last ? `${last.created_at}|${last.id}` : null };
}
