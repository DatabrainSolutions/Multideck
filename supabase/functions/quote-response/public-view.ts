// The issued PDF is the customer's document. Only these summary fields may
// accompany it; a saved operational snapshot must never cross this boundary.
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return value
  return undefined
}

export function customerQuoteResponseView(value: unknown) {
  const view = record(value)
  if (view.state === "expired" || view.state === "revoked") return { state: view.state }
  if (view.state === "responded") {
    if (!["accepted", "declined", "challenged"].includes(String(view.decision))) throw new Error("Invalid quote response decision")
    return { state: view.state, decision: text(view.decision), respondedAt: text(view.respondedAt) }
  }
  if (view.state !== "active") throw new Error("Invalid quote response view")
  const quote = record(view.quote)
  const snapshot = record(quote.snapshot)
  const saved = record(snapshot.quote)
  const charges = Array.isArray(saved.charges) ? saved.charges : []
  return {
    state: "active",
    expiresAt: text(view.expiresAt) ?? null,
    documentId: text(view.documentId),
    quote: {
      id: text(quote.id),
      reference: text(quote.reference),
      versionNumber: typeof quote.versionNumber === "number" && Number.isInteger(quote.versionNumber) ? quote.versionNumber : undefined,
      snapshot: {
        quote: {
          currency: text(saved.currency),
          loadingPoint: text(saved.loadingPoint),
          dischargePoint: text(saved.dischargePoint),
          validTo: text(saved.validTo),
          charges: charges.filter((item) => {
            const charge = record(item)
            return Object.keys(charge).length > 0 && charge.showToCustomer !== false
          }).map((item) => {
            const charge = record(item)
            return { sellCurrency: text(charge.sellCurrency), sellAmount: amount(charge.sellAmount), sellLocal: amount(charge.sellLocal) }
          }),
        },
      },
    },
  }
}
