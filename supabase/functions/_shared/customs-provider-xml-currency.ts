import { XMLParser, XMLValidator } from "npm:fast-xml-parser@5.11.1";
import type { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts";

const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const rows = (v: unknown): any[] => v == null ? [] : Array.isArray(v) ? v : [v];
const scalar = (v: unknown): unknown => typeof v === "string" ? v : object(v)["#text"];

/** Enrich a narrow read result only. Never return XML or treat currency as finality.
 * Reject unsupported declarations/entities and prefixed elements rather than
 * guessing namespace equivalence. Decimal strings are never parsed as numbers. */
export function confirmProviderXmlCurrencies(payload: unknown, evidence: ReturnType<typeof extractProviderTaxEvidence>) {
  const notifications = rows(object(payload).notification);
  for (const notice of evidence.notices) {
    const candidates = notifications.filter(n => notice.notificationId && object(n).notification_id === notice.notificationId);
    if (candidates.length !== 1) continue;
    const xml = object(candidates[0]).hmrc_xml_response;
    if (typeof xml !== "string" || !xml.trim()) continue;
    try {
      if (xml.length > 1_000_000 || /<!|&|<\/?[\w-]+:/.test(xml)) throw new Error("Unsupported XML");
      let depth = 0, count = 0;
      for (const tag of xml.matchAll(/<[^>]*>/g)) {
        if (tag[0].startsWith("<?")) continue;
        if (tag[0].startsWith("</")) depth--;
        else if (!tag[0].endsWith("/>")) depth++;
        if (++count > 20000 || depth > 40 || depth < 0) throw new Error("XML limits");
      }
      if (depth !== 0 || XMLValidator.validate(xml) !== true) throw new Error("Invalid XML");
      const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, processEntities: false, trimValues: false }).parse(xml);
      const response = object(parsed.Response ?? object(parsed.MetaData).Response);
      if (scalar(response.FunctionCode) !== "13" || scalar(object(response.Status).NameCode) !== notice.statusCode) throw new Error("Mismatched notice");
      const jsonResponse = object(object(object(candidates[0]).hmrc_response).Response);
      // Identical amounts do not establish the same declaration revision.
      // If either representation carries an identity, require its exact match;
      // do not infer an omitted version or accept repeated identity elements.
      for (const [xmlPart, jsonPart, keys] of [
        [response, jsonResponse, ["ID", "FunctionalReferenceID"]],
        [object(response.Declaration), object(jsonResponse.Declaration), ["ID", "FunctionalReferenceID", "VersionID"]],
      ] as const) {
        for (const key of keys) {
          const xmlValue = scalar(xmlPart[key]), jsonValue = jsonPart[key];
          if (xmlPart[key] === undefined && jsonValue === undefined) continue;
          if (typeof xmlValue !== "string" || typeof jsonValue !== "string" || xmlValue !== jsonValue) throw new Error("Mismatched declaration identity");
        }
      }
      const facts = rows(object(object(response.Declaration).GoodsShipment).GovernmentAgencyGoodsItem).flatMap(item => rows(object(item.Commodity).DutyTaxFee).map(tax => ({ sequence: scalar(item.SequenceNumeric), tax })));
      if (facts.length !== notice.facts.length) throw new Error("Mismatched rows");
      const confirmed = notice.facts.map(fact => {
        // Tax type alone is not a unique measure. Preserve distinct regimes and
        // rates without matching by position or choosing a convenient amount.
        const matches = facts.filter(row => row.sequence === fact.sequence && scalar(row.tax.TypeCode) === fact.taxType
          && (scalar(row.tax.DutyRegimeCode) ?? null) === fact.dutyRegime
          && (scalar(row.tax.TaxRateNumeric) ?? null) === fact.rate);
        const jsonMatches = notice.facts.filter(row => row.sequence === fact.sequence && row.taxType === fact.taxType
          && row.dutyRegime === fact.dutyRegime && row.rate === fact.rate);
        // Currency is a property of the source tax row, independent of whether
        // CDS supplied a submission link (partial quotas can add new items).
        // Keep itemId null and reconciliation blocked for those derived rows.
        if (matches.length !== 1 || jsonMatches.length !== 1) return null;
        const tax = matches[0].tax, payment = object(tax.Payment);
        const amounts = [[payment.TaxAssessedAmount, fact.assessedAmount], [payment.PaymentAmount, fact.paymentAmount], [tax.AdValoremTaxBaseAmount, fact.baseAmount], [tax.DeductAmount, fact.deductionAmount]];
        const currencies: string[] = [];
        for (const [value, expected] of amounts) {
          if (expected === null) { if (value !== undefined) return null; continue; }
          const node = object(value), currency = node["@_currencyID"];
          if (scalar(value) !== expected || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
          currencies.push(currency);
        }
        const unit = object(tax.TaxRateNumeric)["@_unitCode"];
        fact.rateUnit = typeof unit === "string" && /^[A-Z0-9]{1,4}$/.test(unit) ? unit : null;
        return currencies.length && new Set(currencies).size === 1 ? currencies[0] : null;
      });
      notice.facts.forEach((fact, index) => { fact.currency = confirmed[index]; });
      if (confirmed.some(currency => !currency)) notice.issues.push("Some XML currencies or amounts could not be matched unambiguously to the retained tax rows.");
    } catch {
      notice.issues.push("Retained XML could not be validated for currency confirmation. Amounts remain unconfirmed.");
    }
  }
  return evidence;
}
