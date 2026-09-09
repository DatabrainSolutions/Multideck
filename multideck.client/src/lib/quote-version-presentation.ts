import type { QuoteWorkflowVersion, QuoteWorkflowWorkspace } from "@/lib/quote-workflow-api"
import { readQuoteCargoLines } from "@/lib/quote-cargo"

export function quoteVersionSnapshot(version: QuoteWorkflowVersion) {
  const payload = version.CusQuoteVersion_SnapshotJSON?.quote
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null
}

/** Historical content must never inherit missing fields from the latest Quote. */
export function quoteWorkspaceFromVersion(
  workspace: QuoteWorkflowWorkspace,
  version: QuoteWorkflowVersion,
): QuoteWorkflowWorkspace | null {
  const payload = quoteVersionSnapshot(version)
  if (!payload) return null
  const { charges, ...quotePayload } = payload
  if (
    quotePayload.shipmentFacts != null &&
    (typeof quotePayload.shipmentFacts !== "object" || Array.isArray(quotePayload.shipmentFacts))
  )
    return null
  if (
    charges != null &&
    (!Array.isArray(charges) || charges.some((line) => !line || typeof line !== "object" || Array.isArray(line)))
  )
    return null
  try {
    readQuoteCargoLines(quotePayload.shipmentFacts?.cargoLines)
  } catch {
    return null
  }
  const historicalCharges = Array.isArray(charges) ? charges : []
  const totals = historicalCharges.reduce(
    (result, line) => ({
      cost: result.cost + Number(line.costLocal || 0),
      sell: result.sell + Number(line.sellLocal || 0),
    }),
    { cost: 0, sell: 0 },
  )
  return {
    ...workspace,
    quote: {
      ...quotePayload,
      id: workspace.quote.id,
      reference: workspace.quote.reference,
      lifecycle: version.CusQuoteVersion_StatusCode,
      customerId: quotePayload.customerId ?? "",
      shipmentFacts: quotePayload.shipmentFacts ?? {},
      // This is current workflow metadata, not part of the issued content.
      acceptedVersionId: workspace.quote.acceptedVersionId,
    },
    charges: historicalCharges,
    totals: {
      ...totals,
      profit: totals.sell - totals.cost,
      marginPct: totals.sell ? ((totals.sell - totals.cost) / totals.sell) * 100 : null,
    },
  }
}
