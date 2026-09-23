/** Pure decision model. Produces proposals only; it has no database or posting access. */
export type Money = string
const SCALE = 10_000n
const MAX = 999_999_999_999_999_999n

export function moneyUnits(value: Money): bigint {
  if (typeof value !== "string" || !/^-?\d{1,14}(\.\d{1,4})?$/.test(value)) throw new Error("Use a decimal amount with up to four places.")
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".")
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"))
  if (units > MAX) throw new Error("Amount exceeds the ledger limit.")
  return negative ? -units : units
}

export function moneyString(units: bigint): Money {
  const absolute = units < 0n ? -units : units
  return `${units < 0n ? "-" : ""}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, "0")}`
}

export type AccrualPolicy = {
  id: string
  revision: number
  legalEntityId: string
  currency: string
  approvedBy: string | null
  autoFinalise: boolean
  underPercent: Money
  underCap: Money
  overPercent: Money
  overCap: Money
}

export type CostSnapshot = {
  legalEntityId: string
  jobId: string
  chargeId: string
  currency: string
  /** Server-owned version/fingerprint covering estimates, all actuals and accrual movements. */
  revision: string
  originalEstimate: Money | null
  currentEstimate: Money
  actualCost: Money
  openAccrual: Money
  finalInvoice: boolean
  serviceConfirmed: boolean
  disputed: boolean
  hasCreditOrCancellation: boolean
  exactInvoiceMatch: boolean
  periodOpen: boolean
  /** Verified against the original posting, not merely today's charge-code mapping. */
  expenseAccountId: string | null
  accrualAccountId: string | null
  accountsValidated: boolean
  mirrorReady: boolean
  sourceDocumentIds: string[]
}

export type FinalisationApproval = {
  id: string
  actorId: string
  reason: string
  snapshotRevision: string
  policyRevision: number
  legalEntityId: string
  chargeId: string
}

export type AccrualDecision = {
  modelVersion: "cost-accrual-v1"
  status: "blocked" | "review" | "partial" | "awaiting_invoice" | "finalise" | "settled"
  reasons: string[]
  currentEstimate: Money
  actualCost: Money
  openAccrual: Money
  targetAccrual: Money
  adjustment: Money
  favourableVariance: Money
  expectedTotalCost: Money
  profitMovement: Money
  withinTolerance: boolean | null
  authority: "none" | "policy" | "human"
  evidence: { revision: string; policyId: string | null; policyRevision: number | null; approvalId: string | null; sourceDocumentIds: string[] }
  journal: Array<{ accountId: string; jobId: string; chargeId: string; debit: Money; credit: Money }>
}

export function evaluateCostAccrual(snapshot: CostSnapshot, policy: AccrualPolicy | null, approval?: FinalisationApproval): AccrualDecision {
  const estimate = moneyUnits(snapshot.currentEstimate)
  const actual = moneyUnits(snapshot.actualCost)
  const open = moneyUnits(snapshot.openAccrual)
  if (snapshot.originalEstimate !== null && moneyUnits(snapshot.originalEstimate) < 0n) throw new Error("Original cost estimate cannot be negative.")
  if (estimate < 0n || open < 0n) throw new Error("Cost estimates and open accruals cannot be negative.")
  if (!snapshot.revision || !snapshot.chargeId || !snapshot.jobId || !snapshot.legalEntityId || !/^[A-Z]{3}$/.test(snapshot.currency)) throw new Error("Incomplete charge identity.")
  const reasons: string[] = []
  let withinTolerance: boolean | null = null
  if (policy) {
    const percent = moneyUnits(actual > estimate ? policy.overPercent : policy.underPercent)
    const cap = moneyUnits(actual > estimate ? policy.overCap : policy.underCap)
    if (!policy.id || !Number.isSafeInteger(policy.revision) || policy.revision < 1 || percent < 0n || percent > 100n * SCALE || cap < 0n) throw new Error("Invalid tolerance policy.")
    // Validate both directions, including the unused direction, before accepting the policy.
    for (const value of [policy.underPercent, policy.overPercent]) if (moneyUnits(value) < 0n || moneyUnits(value) > 100n * SCALE) throw new Error("Invalid tolerance percentage.")
    for (const value of [policy.underCap, policy.overCap]) if (moneyUnits(value) < 0n) throw new Error("Invalid tolerance cap.")
    if (policy.legalEntityId !== snapshot.legalEntityId || policy.currency !== snapshot.currency) throw new Error("Policy belongs to another entity or currency.")
    const variance = actual > estimate ? actual - estimate : estimate - actual
    // Both limits must pass. Multiplication avoids rounding a boundary into acceptance.
    withinTolerance = variance <= cap && variance * 100n * SCALE <= estimate * percent
  }
  if (!snapshot.serviceConfirmed) reasons.push("service_not_confirmed")
  if (!snapshot.periodOpen) reasons.push("period_not_open")
  if (!snapshot.accountsValidated || !snapshot.expenseAccountId || !snapshot.accrualAccountId || snapshot.expenseAccountId === snapshot.accrualAccountId) reasons.push("nominal_mapping_required")
  if (!snapshot.mirrorReady) reasons.push("mirror_not_ready")
  if (snapshot.disputed) reasons.push("cost_disputed")
  if (snapshot.hasCreditOrCancellation || actual < 0n) reasons.push("credit_or_cancellation_requires_review")
  if ((actual !== 0n || snapshot.finalInvoice) && (!snapshot.exactInvoiceMatch || !snapshot.sourceDocumentIds.length)) reasons.push("exact_invoice_match_required")
  if (snapshot.finalInvoice && actual === 0n) reasons.push("zero_cost_release_requires_separate_review")

  const blocked = reasons.length > 0
  let authority: AccrualDecision["authority"] = "none"
  if (approval) {
    if (approval.snapshotRevision !== snapshot.revision || approval.policyRevision !== policy?.revision || approval.legalEntityId !== snapshot.legalEntityId || approval.chargeId !== snapshot.chargeId) reasons.push("approval_is_stale_or_out_of_scope")
    else if (!approval.id || !approval.actorId || !approval.reason.trim()) reasons.push("approval_evidence_required")
    else authority = "human"
  }
  if (reasons.length) authority = "none"
  if (!reasons.length && policy?.approvedBy?.trim() && policy.autoFinalise && withinTolerance && snapshot.finalInvoice) authority = authority === "human" ? "human" : "policy"
  const finalise = snapshot.finalInvoice && authority !== "none"
  const outstanding = estimate > actual ? estimate - actual : 0n
  let status: AccrualDecision["status"] = actual > 0n ? "partial" : "awaiting_invoice"
  if (blocked) status = "blocked"
  else if (reasons.length) status = "review"
  else if (snapshot.finalInvoice && !finalise) {
    status = "review"
    reasons.push(!policy?.approvedBy?.trim() ? "approved_policy_required" : withinTolerance ? "finalisation_approval_required" : "outside_tolerance")
  } else if (finalise) status = open === 0n ? "settled" : "finalise"
  else if (actual > estimate) { status = "review"; reasons.push("partial_cost_exceeds_estimate") }
  // Never release or increase an existing ledger balance while the evidence is blocked/reviewable.
  const target = status === "blocked" || status === "review" ? open : finalise ? 0n : outstanding
  const delta = target - open
  const magnitude = delta < 0n ? -delta : delta
  const zero = "0.0000"
  const journal: AccrualDecision["journal"] = delta === 0n ? [] : [
    { accountId: snapshot.expenseAccountId!, jobId: snapshot.jobId, chargeId: snapshot.chargeId, debit: delta > 0n ? moneyString(magnitude) : zero, credit: delta < 0n ? moneyString(magnitude) : zero },
    { accountId: snapshot.accrualAccountId!, jobId: snapshot.jobId, chargeId: snapshot.chargeId, debit: delta < 0n ? moneyString(magnitude) : zero, credit: delta > 0n ? moneyString(magnitude) : zero },
  ]
  return {
    modelVersion: "cost-accrual-v1", status, reasons, currentEstimate: moneyString(estimate), actualCost: moneyString(actual), openAccrual: moneyString(open),
    targetAccrual: moneyString(target), adjustment: moneyString(delta), favourableVariance: moneyString(estimate - actual),
    expectedTotalCost: moneyString(actual + (finalise ? 0n : outstanding)), profitMovement: moneyString(-delta), withinTolerance, authority,
    evidence: { revision: snapshot.revision, policyId: policy?.id ?? null, policyRevision: policy?.revision ?? null, approvalId: authority === "human" ? approval!.id : null, sourceDocumentIds: [...new Set(snapshot.sourceDocumentIds)].sort() }, journal,
  }
}

export type ArrivalObservation = { days: number; invoiced: boolean }
/** Kaplan–Meier estimate: open charges are censored observations, not discarded or called failures. */
export function invoiceArrivalEstimate(observations: ArrivalObservation[], ageDays: number, horizonDays: number, minimumSample = 20) {
  if (!Number.isInteger(ageDays) || ageDays < 0 || !Number.isInteger(horizonDays) || horizonDays < 1 || !Number.isInteger(minimumSample) || minimumSample < 2) throw new Error("Invalid invoice ageing interval.")
  for (const row of observations) if (!Number.isInteger(row.days) || row.days < 0 || typeof row.invoiced !== "boolean") throw new Error("Invalid invoice history.")
  const atRiskNow = observations.filter((row) => row.days > ageDays).length
  const throughDay = observations.reduce((max, row) => Math.max(max, row.days), 0)
  if (observations.length < minimumSample || atRiskNow < 5 || throughDay < ageDays + horizonDays) return { probability: null, sampleSize: observations.length, atRiskNow, reason: "insufficient_history" as const }
  const events = new Map<number, { arrivals: number; censored: number }>()
  for (const row of observations) {
    const event = events.get(row.days) ?? { arrivals: 0, censored: 0 }
    if (row.invoiced) event.arrivals++; else event.censored++
    events.set(row.days, event)
  }
  let atRisk = observations.length, survival = 1, survivalAtAge = 1, survivalAtHorizon = 1
  for (const [day, event] of [...events].sort(([a], [b]) => a - b)) {
    survival *= 1 - event.arrivals / atRisk
    if (day <= ageDays) survivalAtAge = survival
    if (day <= ageDays + horizonDays) survivalAtHorizon = survival
    atRisk -= event.arrivals + event.censored
  }
  if (survivalAtAge <= 0) return { probability: null, sampleSize: observations.length, atRiskNow, reason: "insufficient_history" as const }
  return { probability: Math.max(0, Math.min(1, 1 - survivalAtHorizon / survivalAtAge)), sampleSize: observations.length, atRiskNow, reason: "historical_estimate_not_release_authority" as const }
}
