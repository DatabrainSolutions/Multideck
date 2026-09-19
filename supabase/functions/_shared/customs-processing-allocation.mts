import { Decimal, sum } from "./customs-calculation-decimal.mts"

export type ProcessingInputLot = {
  originalF44Evidence?: string
  entryDate?: string
  commodityCode?: string
  origin?: string
  id: string
  entryReference: string
  entryItemReference: string
  quantity: string
  unit: string
  originalCustomsValueGbp: string
  previouslyDischargedQuantity: string
  evidence: string
}
export type ProcessingConsumption = {
  inputLotId: string
  outputItemId: string
  quantity: string
  unit: string
  yieldEvidence: string
}

/** Reconciles explicitly reviewed consumption, not an inferred yield formula.
 * Original values must remain separate from processed-product invoice values.
 * This is not a customs debt, VAT, eligibility or cross-declaration ledger.
 * The caller must supply the retained prior-discharge balance and validate the
 * applicable authorisation/tax basis before using the allocations in a result. */
export function allocateProcessingInputs(lots: ProcessingInputLot[], consumption: ProcessingConsumption[]) {
  const present = (v: unknown): v is string => typeof v === "string" && !!v.trim()
  if (!lots.length || !consumption.length || lots.some(lot => !present(lot.id)) || new Set(lots.map(lot => lot.id)).size !== lots.length) throw new Error("Select unique original input lots and their reviewed consumption.")
  const known = new Set(lots.map(lot => lot.id))
  const originalItems = new Set<string>()
  for (const lot of lots) {
    const entry = typeof lot.entryReference === "string" ? lot.entryReference.trim().toUpperCase() : ""
    const item = typeof lot.entryItemReference === "string" ? lot.entryItemReference.trim() : ""
    const key = JSON.stringify([entry, /^\d{1,12}$/.test(item) ? BigInt(item).toString() : item])
    if (originalItems.has(key)) throw new Error("Use one retained balance per original entry item; separate lot IDs must not duplicate its quantity or value.")
    originalItems.add(key)
  }
  const pairs = new Set<string>()
  for (const row of consumption) {
    if (!known.has(row.inputLotId) || !present(row.outputItemId) || !present(row.yieldEvidence)) throw new Error("Link each consumed quantity to an original input lot, output item and yield evidence.")
    const key = JSON.stringify([row.inputLotId, row.outputItemId])
    if (pairs.has(key)) throw new Error("Combine duplicate input-lot consumption for the same output item.")
    pairs.add(key)
  }
  const allocations = lots.map(lot => {
    if (![lot.entryReference, lot.entryItemReference, lot.unit, lot.evidence].every(present)) throw new Error("Retain each original entry, item, quantity unit and supporting evidence.")
    const quantity = Decimal.parse(lot.quantity), value = Decimal.parse(lot.originalCustomsValueGbp), previous = Decimal.parse(lot.previouslyDischargedQuantity)
    if (quantity.n <= 0n || value.n < 0n || previous.n < 0n || previous.compare(quantity) > 0) throw new Error("Original quantities must be positive, with non-negative values and valid prior-discharge balances.")
    const rows = consumption.filter(row => row.inputLotId === lot.id).map(row => {
      if (row.unit !== lot.unit) throw new Error("Express consumed quantities in the original lot's unit; do not infer a unit conversion.")
      const used = Decimal.parse(row.quantity)
      if (used.n <= 0n) throw new Error("Consumed input quantities must be positive.")
      const share = used.div(quantity)
      return { outputItemId: row.outputItemId, used, quantity: used.evidence(), originalValueShare: share.evidence(), originalCustomsValueGbp: value.mul(share).evidence(), yieldEvidence: row.yieldEvidence }
    })
    const used = sum(rows.map(row => row.used)), remaining = quantity.sub(previous).sub(used)
    if (remaining.n < 0n) throw new Error(`Input lot ${lot.id} is overused after its previous discharges. Review consumption across all output items.`)
    return { inputLotId: lot.id, previous: previous.evidence(), used: used.evidence(), remaining: remaining.evidence(), allocations: rows.map(({ used: _used, ...row }) => row) }
  })
  return { input: structuredClone({ lots, consumption }), allocations, autoPopulationAllowed: false as const }
}
