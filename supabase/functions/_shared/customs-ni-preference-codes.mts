import { isQuotaPreference } from "./customs-quota-claim.mts"

const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
/** DE 4/17 is the UK code; NIIMP + item EUPRF carries an EU mismatch.
 * HMRC Group 4, Northern Ireland Preference Mismatch, checked 15 Sep 2026.
 * This resolves declared codes only, never origin eligibility or a tariff rate.
 */
export function niPreferenceCodes(input: { preferenceCode?: unknown; additionalInformationStatements?: unknown; headerAdditionalInformationCode?: unknown; jurisdiction?: unknown }) {
  const uk = text(input.preferenceCode)
  const rows = Array.isArray(input.additionalInformationStatements) ? input.additionalInformationStatements.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : []
  const overrides = rows.filter(row => text(row.statementCode).toUpperCase() === "EUPRF")
  const issues: string[] = []
  if (!overrides.length) return { uk, xi: uk, issues }
  if (input.jurisdiction !== "NI") issues.push("EUPRF applies only to Northern Ireland imports.")
  if (overrides.length !== 1) issues.push("Keep one EUPRF statement for this item; duplicate EU preference codes are ambiguous.")
  const xi = text(overrides[0].statementDescription)
  if (!/^\d{3}$/.test(xi)) issues.push("Enter the three-digit EU preference code as the EUPRF statement text.")
  if (text(input.headerAdditionalInformationCode).toUpperCase() !== "NIIMP" && !rows.some(row => text(row.statementCode).toUpperCase() === "NIIMP")) issues.push("EUPRF requires NIIMP on the declaration or this item.")
  if (isQuotaPreference(uk) || isQuotaPreference(xi)) issues.push("Do not use EUPRF for a quota claim; follow the Northern Ireland quota completion rules.")
  return { uk, xi, issues }
}
