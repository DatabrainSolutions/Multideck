/** Only calculation inputs leave the editor for a preview. Notes, contacts,
 * provider state and UI changes do not schedule tariff work. */
export function customsPreviewInput(draft: Record<string, unknown>) {
  const fields = ["direction", "declarationCategory", "declarationType", "dutyCalculationSetup", "invoiceHeaders", "items", "importAdjustments", "loadingLocationId", "headerAdditionalInformationCode", "importerEori", "warehouseIdentifier", "warehouseType", "additionalAuthorisationHolders", "authorisationCategory", "authorisationIdentifier", "freightChargeAmount", "freightChargeCurrency", "freightChargeApportionment", "insuranceCostAmount", "insuranceCostCurrency", "containerPackingCostAmount", "containerPackingCostCurrency", "vatValueAdjustmentAmount", "vatValueAdjustmentCurrency", "vatValueAdjustmentApportionment"]
  return Object.fromEntries(fields.filter(key => draft[key] !== undefined).map(key => [key, draft[key]]))
}

/** Latest input wins even when the transport ignores cancellation. No retries
 * and no persistence: a caller explicitly schedules every operation. */
export function createLiveCalculationRequest<T>(request: (input: Record<string, unknown>, signal: AbortSignal) => Promise<T>) {
  let revision = 0
  let controller: AbortController | undefined
  return {
    cancel() { revision++; controller?.abort() },
    async run(input: Record<string, unknown>, onResult: (value: T) => void, onError: (error: unknown) => void) {
      controller?.abort()
      const current = ++revision
      controller = new AbortController()
      try { const value = await request(input, controller.signal); if (current === revision) onResult(value) }
      catch (error) { if (current === revision) onError(error) }
    },
  }
}
