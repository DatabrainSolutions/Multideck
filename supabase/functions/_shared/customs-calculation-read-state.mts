import { ukCustomsDate } from "./customs-calculation-date.mts"
import { calculationUsesCurrentRules } from "./customs-calculation-version.mts"

type EvidenceRow = Record<string, unknown>
const object = (value: unknown): EvidenceRow | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as EvidenceRow : null

/** Read-time freshness only. Never rewrite the immutable evidence or assume a
 * bounded history page contains an override's parent calculation. */
export function calculationReadState(rows: unknown[], today = ukCustomsDate()): unknown[] {
  const calculations = new Map<string, EvidenceRow>()
  for (const value of rows) {
    const row = object(value)
    if (row?.kind === "calculation" && typeof row.recordId === "string") calculations.set(row.recordId, row)
  }
  return rows.map(value => {
    const row = object(value)
    if (!row) return value
    const parent = row.kind === "override" && typeof row.parentCalculationId === "string" ? calculations.get(row.parentCalculationId) : null
    const calculation = row.kind === "calculation" ? row : parent?.declarationId === row.declarationId ? parent : null
    const result = object(calculation?.result)
    const reasons: string[] = []
    if (row.outOfDate !== false || (calculation && calculation.outOfDate !== false)) reasons.push("The saved declaration has changed, or its revision could not be confirmed.")
    if (!calculation || !result) reasons.push(row.kind === "override"
      ? "The parent calculation evidence is not available in this history page. Open the full calculation history before relying on this override."
      : "The recorded calculation result is missing or could not be read.")
    else {
      if (result.date !== today) reasons.push("The calculation date is not today's UK date.")
      if (!calculationUsesCurrentRules(result)) reasons.push("The calculation uses an older or unrecognised rule or precision version.")
    }
    return { ...row, outOfDate: reasons.length > 0, freshnessCheckedOn: today, freshnessReasons: reasons }
  })
}
