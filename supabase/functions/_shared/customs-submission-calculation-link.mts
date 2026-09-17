import { calculationUsesCurrentRules } from "./customs-calculation-version.mts"
import { ukCustomsDate } from "./customs-calculation-date.mts"

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
// JSON object order is immaterial; array order remains part of the submitted
// revision. Do not project away input fields to manufacture a historical match.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}

export type SubmissionCalculationLink = {
  schemaVersion: 1
  checkedAt: string
  calculationId: string | null
  state: "linked-estimate" | "linked-calculation" | "unavailable"
  reasons: string[]
}

/** Bind once when preparing the submission snapshot. Never choose a newer
 * calculation after a provider assessment arrives. A link identifies evidence;
 * it does not authorise a manual tax amount or certify the assessment. */
export function submissionCalculationLink(declarationId: string, draft: unknown, candidate: unknown, checkedAt: string): SubmissionCalculationLink {
  const row = object(candidate), result = object(object(row.evidence).result)
  const reasons: string[] = []
  const timestamp = new Date(checkedAt)
  if (!Number.isFinite(timestamp.getTime())) throw new Error("A valid submission preparation time is required.")
  if (object(draft).direction !== "import") throw new Error("Calculation links apply to import declarations only.")
  if (row.kind !== "calculation" || row.declaration_id !== declarationId || typeof row.id !== "string" || !row.id) reasons.push("No saved calculation was found for this declaration.")
  else {
    if (canonical(row.draft_snapshot) !== canonical(draft)) reasons.push("The saved calculation does not describe the submitted draft.")
    if (result.date !== ukCustomsDate(timestamp)) reasons.push("The saved calculation is not from the submission preparation date.")
    if (!calculationUsesCurrentRules(result)) reasons.push("The saved calculation uses an older or unrecognised calculation policy.")
    if (typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > timestamp.getTime()) reasons.push("The calculation time cannot be matched to this submission.")
  }
  const linked = reasons.length === 0
  return { schemaVersion: 1, checkedAt, calculationId: linked ? row.id as string : null,
    state: !linked ? "unavailable" : result.autoPopulationAllowed === true ? "linked-calculation" : "linked-estimate", reasons }
}

/** Narrow public projection from a retained server-owned submission snapshot. */
export function retainedSubmissionCalculationLink(snapshot: unknown): SubmissionCalculationLink | null {
  const source = object(snapshot), link = object(source.calculationLink)
  if (source.schemaVersion !== 1 || link.schemaVersion !== 1 || link.checkedAt !== source.capturedAt ||
    typeof link.checkedAt !== "string" || !Number.isFinite(Date.parse(link.checkedAt)) ||
    !["linked-estimate", "linked-calculation", "unavailable"].includes(String(link.state)) ||
    !Array.isArray(link.reasons) || link.reasons.length > 10 || link.reasons.some(reason => typeof reason !== "string" || reason.length > 500)) return null
  if (link.state === "unavailable" ? link.calculationId !== null :
    typeof link.calculationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link.calculationId) || link.reasons.length > 0) return null
  return { schemaVersion: 1, checkedAt: link.checkedAt, calculationId: link.calculationId as string | null,
    state: link.state as SubmissionCalculationLink["state"], reasons: link.reasons as string[] }
}

/** Verify historical ownership and exact inputs without applying today's rule
 * version/date to an old submission. Historical evidence must stay reproducible. */
export function retainedCalculationMatches(snapshot: unknown, candidate: unknown, declarationId: string): boolean {
  const source = object(snapshot), declaration = object(source.declaration), row = object(candidate)
  const link = retainedSubmissionCalculationLink(snapshot)
  return !!link?.calculationId && declaration.id === declarationId && row.id === link.calculationId
    && row.declaration_id === declarationId && row.kind === "calculation"
    && typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at))
    && Date.parse(row.created_at) <= Date.parse(link.checkedAt)
    && object(declaration.genericPayload).direction === "import"
    && canonical(row.draft_snapshot) === canonical(declaration.genericPayload)
}
