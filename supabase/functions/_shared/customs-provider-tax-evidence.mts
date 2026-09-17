/** Read-only extraction from the retained iCustoms notification envelope.
 * Observed shared-tenant DMSTAX shape, 2026-09-14; no customer values embedded.
 * HMRC: https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/notifications.html
 * This is NOT an AssessmentLine adapter: JSON omits XML currency attributes and
 * does not establish liability disposition or finality. Never use payment as tax.
 */
export type ProviderTaxFact = {
  sequence: string
  itemId: string | null
  taxType: string | null
  assessedAmount: string | null
  paymentAmount: string | null
  baseAmount: string | null
  rate: string | null
  dutyRegime: string | null
  deductionAmount: string | null
  rateUnit: string | null
  currency: string | null
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === "string" ? value.trim() : ""
const rows = (value: unknown): unknown[] => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
const decimal = (value: unknown): string | null => typeof value === "string" && /^\d{1,24}(?:\.\d{1,12})?$/.test(value) ? value : null

/** submittedSnapshot must come from the immutable provider-response snapshot, not
 * today's editable item order. Missing sequence links remain explicit. */
export function extractProviderTaxEvidence(payload: unknown, submittedSnapshot: unknown) {
  const body = record(payload), submitted = record(submittedSnapshot)
  const submittedItems = rows(submitted.items)
  if (submittedItems.length > 1000) return { notices: [], issues: ["The submitted snapshot exceeds the item review limit."], reconciliationReady: false as const }
  const items = submittedItems.map(record)
  // Mirrors ICUSS_DeclarationSnapshotJSON schemaVersion 1. Item order is
  // incidental; the accepted CUSTI_ItemNumber is the submission sequence.
  const identities = items.map(item => text(record(item.payload).id))
  const numbers = items.map(item => item.itemNumber)
  const validIdentities = submitted.schemaVersion === 1 && identities.length > 0 && identities.every(Boolean)
    && new Set(identities).size === identities.length
    && numbers.every(number => typeof number === "number" && Number.isInteger(number) && number > 0 && number <= 9999)
    && new Set(numbers).size === numbers.length
  const identitiesBySequence = new Map(items.map((item, index) => [String(item.itemNumber), identities[index]]))
  const notifications = rows(body.notification)
  const issues: string[] = []
  if (notifications.length > 100) return { notices: [], issues: ["The retained response exceeds the notification review limit."], reconciliationReady: false as const }
  const notices: { notificationId: string | null; classification: "indicative" | "provisional" | "final" | "unclassified"; statusCode: string | null; facts: ProviderTaxFact[]; validationIssues: string[]; issues: string[] }[] = []
  let totalTaxRows = 0
  for (const value of notifications) {
    const notification = record(value), response = record(record(notification.hmrc_response).Response)
    if (text(response.FunctionCode) !== "13") continue
    const noticeIssues: string[] = []
    const facts: ProviderTaxFact[] = []
    const goods = rows(record(record(response.Declaration).GoodsShipment).GovernmentAgencyGoodsItem)
    const statusCode = text(record(response.Status).NameCode) || null
    // CDS 03 DSSD v2.32 DMSTAX: the HMRC status code is authoritative,
    // not the provider's display label. Final notice status is not proof
    // that every tax row is attributable or ready for reconciliation.
    const classification = statusCode === "67" ? "indicative" as const
      : statusCode === "115" ? "provisional" as const
      : statusCode === "4" ? "final" as const : "unclassified" as const
    if (!validIdentities) noticeIssues.push("The submitted item identities are missing or duplicated.")
    if (!goods.length) noticeIssues.push("The tax notice contains no item breakdown.")
    if (goods.length > 1000) { issues.push("The retained tax notice exceeds the item review limit."); continue }
    const sequenceCounts = new Map<string, number>()
    for (const entry of goods) {
      const sequence = text(record(entry).SequenceNumeric)
      sequenceCounts.set(sequence, (sequenceCounts.get(sequence) ?? 0) + 1)
    }
    for (const entry of goods) {
      const item = record(entry), sequence = text(item.SequenceNumeric)
      const validSequence = /^[1-9]\d{0,3}$/.test(sequence)
      const uniqueSequence = sequenceCounts.get(sequence) === 1
      if (!validSequence || !uniqueSequence) noticeIssues.push("The tax notice has an invalid or repeated item sequence.")
      const itemId = validIdentities && validSequence && uniqueSequence ? identitiesBySequence.get(sequence) ?? null : null
      if (!itemId) noticeIssues.push(`Tax item ${sequence || "(missing sequence)"} cannot be linked to the submitted items.`)
      const taxes = rows(record(item.Commodity).DutyTaxFee)
      if (!taxes.length) noticeIssues.push(`Tax item ${sequence} has no tax rows.`)
      if (taxes.length > 500) { noticeIssues.push(`Tax item ${sequence} exceeds the tax-row review limit.`); continue }
      totalTaxRows += taxes.length
      // Bound the entire response, not merely each nested list. Fail closed
      // rather than returning an apparently complete subset of its tax facts.
      if (totalTaxRows > 10000) return { notices: [], issues: ["The retained response exceeds the total tax-row review limit."], reconciliationReady: false as const }
      for (const entry of taxes) {
        const tax = record(entry), payment = record(tax.Payment)
        const taxType = /^[A-Z0-9]{3}$/.test(text(tax.TypeCode)) ? text(tax.TypeCode) : null
        const assessedAmount = decimal(payment.TaxAssessedAmount), paymentAmount = decimal(payment.PaymentAmount)
        const baseAmount = decimal(tax.AdValoremTaxBaseAmount), rate = decimal(tax.TaxRateNumeric)
        const dutyRegime = /^\d{3}$/.test(text(tax.DutyRegimeCode)) ? text(tax.DutyRegimeCode) : null
        const deductionAmount = decimal(tax.DeductAmount)
        if (!taxType || assessedAmount === null) noticeIssues.push(`Tax item ${sequence} has a missing or invalid assessed amount or tax type.`)
        if (payment.PaymentAmount !== undefined && paymentAmount === null) noticeIssues.push(`Tax item ${sequence} has an invalid payment amount.`)
        if (tax.AdValoremTaxBaseAmount !== undefined && baseAmount === null) noticeIssues.push(`Tax item ${sequence} has an invalid tax base.`)
        if (tax.TaxRateNumeric !== undefined && rate === null) noticeIssues.push(`Tax item ${sequence} has an invalid tax rate.`)
        if (tax.DutyRegimeCode !== undefined && dutyRegime === null) noticeIssues.push(`Tax item ${sequence} has an invalid duty regime.`)
        if (tax.DeductAmount !== undefined && deductionAmount === null) noticeIssues.push(`Tax item ${sequence} has an invalid relief amount.`)
        facts.push({ sequence, itemId, taxType, assessedAmount, paymentAmount, baseAmount, rate, dutyRegime, deductionAmount, rateUnit: null, currency: null })
      }
    }
    const validationIssues = [...new Set(noticeIssues)]
    noticeIssues.push("Confirm currency attributes from the retained XML, liability treatment and assessment status before reconciliation.")
    if (classification === "indicative") noticeIssues.push("This notice is indicative customs debt, not a confirmed final assessment.")
    if (classification === "provisional") noticeIssues.push("This customs debt is provisional and may change. Do not treat it as a final assessment.")
    if (classification === "final") noticeIssues.push("HMRC reports final customs debt. Item links, currencies and liability treatment must still be verified before comparing totals.")
    notices.push({ notificationId: text(notification.notification_id) || null, classification, statusCode, facts, validationIssues, issues: [...new Set(noticeIssues)] })
  }
  return { notices, issues, reconciliationReady: false as const }
}
