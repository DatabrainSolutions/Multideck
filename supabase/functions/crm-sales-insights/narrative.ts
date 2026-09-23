type Row = Record<string, unknown>
export type NarrativeKind = "loss_feedback" | "action_outcome"
export type NarrativeDeal = {
  id: string; name: string; outcome: "open" | "won" | "lost"; closedAt: string | null; ownerId: string | null
  pipelineId: string | null; pipelineName: string; stageId: string | null; stageName: string; daysInStage: number | null
}
export type NarrativeDocument = { id: string; dealId: string; kind: NarrativeKind; text: string; recordedAt: string }
export type SalesNarrative = {
  version: 1; from: string | null; to: string | null; totalDocuments: number; includedDocuments: number
  totalDeals: number; includedDeals: number; truncated: boolean; documents: NarrativeDocument[]; deals: NarrativeDeal[]
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const string = (value: unknown) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : ""
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
const id = (value: unknown) => typeof value === "string" && uuid.test(value) ? value : null
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
function invalid(): never { throw new Error("The analysis could not be matched to the recorded feedback.") }

/** Only the native, access-checked corpus can become model input. No browser text is accepted. */
export function buildSalesNarrative(value: unknown): SalesNarrative {
  if (value === undefined || value === null) return { version: 1, from: null, to: null, totalDocuments: 0, includedDocuments: 0, totalDeals: 0, includedDeals: 0, truncated: false, documents: [], deals: [] }
  const source = row(value)
  if (!Array.isArray(source.documents) || !Array.isArray(source.deals) || source.documents.length > 40 || source.deals.length > 40) invalid()
  const deals = source.deals.map(candidate => {
    const deal = row(candidate)
    if (!id(deal.id) || !["open", "won", "lost"].includes(String(deal.outcome))) invalid()
    return {
      id: String(deal.id), name: string(deal.name).slice(0, 180), outcome: deal.outcome as NarrativeDeal["outcome"], closedAt: date(deal.closedAt), ownerId: id(deal.ownerId),
      pipelineId: id(deal.pipelineId), pipelineName: string(deal.pipelineName).slice(0, 120), stageId: id(deal.stageId), stageName: string(deal.stageName).slice(0, 120),
      daysInStage: typeof deal.daysInStage === "number" && Number.isFinite(deal.daysInStage) && deal.daysInStage >= 0 ? deal.daysInStage : null,
    }
  })
  const dealIds = new Set(deals.map(deal => deal.id))
  if (dealIds.size !== deals.length) invalid()
  const documents = source.documents.map(candidate => {
    const document = row(candidate), kind = document.kind as NarrativeKind
    const body = string(document.text), recordedAt = date(document.recordedAt), sourceId = string(document.id)
    if (!["loss_feedback", "action_outcome"].includes(kind) || !sourceId.startsWith(`${kind}:`) || !id(sourceId.slice(kind.length + 1)) || !id(document.dealId) || !dealIds.has(String(document.dealId)) || !body || body.length > 600 || !recordedAt) invalid()
    return { id: sourceId, dealId: String(document.dealId), kind, text: body, recordedAt }
  })
  if (new Set(documents.map(document => document.id)).size !== documents.length) invalid()
  const totalDocuments = count(source.totalDocuments), totalDeals = count(source.totalDeals)
  if (totalDocuments === null || totalDeals === null || totalDocuments < documents.length || totalDeals < deals.length || new Set(documents.map(document => document.dealId)).size !== deals.length) invalid()
  return { version: 1, from: date(source.from), to: date(source.to), totalDocuments, includedDocuments: documents.length, totalDeals, includedDeals: deals.length, truncated: source.truncated === true || totalDocuments > documents.length || totalDeals > deals.length, documents, deals }
}

export const salesThemesSchema = {
  type: "array", maxItems: 5, items: {
    type: "object", additionalProperties: false, required: ["label", "description", "memberships"], properties: {
      label: { type: "string", maxLength: 64 }, description: { type: "string", maxLength: 240 },
      memberships: { type: "array", minItems: 2, maxItems: 40, items: {
        type: "object", additionalProperties: false, required: ["sourceId", "excerpt"], properties: {
          sourceId: { type: "string", maxLength: 80 }, excerpt: { type: "string", minLength: 12, maxLength: 180 },
        },
      } },
    },
  },
}

/** The model names semantic groups; membership, quotations and all numeric measures remain source-owned. */
export function parseSalesThemes(value: unknown, narrative: SalesNarrative) {
  if (!Array.isArray(value) || value.length > 5) invalid()
  const documents = new Map(narrative.documents.map(document => [document.id, document]))
  const labels = new Set<string>(), membershipsPerSource = new Map<string, number>()
  return value.map((candidate, index) => {
    const theme = row(candidate), label = string(theme.label), description = string(theme.description)
    if (!label || label.length > 64 || !description || description.length > 240 || labels.has(label.toLowerCase()) || !Array.isArray(theme.memberships) || theme.memberships.length < 2 || theme.memberships.length > 40 || Object.keys(theme).some(key => !["label", "description", "memberships"].includes(key))) invalid()
    labels.add(label.toLowerCase())
    const used = new Set<string>()
    const memberships = theme.memberships.map(candidate => {
      const member = row(candidate), sourceId = string(member.sourceId), excerpt = string(member.excerpt), source = documents.get(sourceId)
      if (!source || used.has(sourceId) || excerpt.length < 12 || excerpt.length > 180 || !source.text.includes(excerpt) || Object.keys(member).some(key => !["sourceId", "excerpt"].includes(key))) invalid()
      used.add(sourceId)
      const appearances = (membershipsPerSource.get(sourceId) ?? 0) + 1
      if (appearances > 2) invalid()
      membershipsPerSource.set(sourceId, appearances)
      return { sourceId, dealId: source.dealId, kind: source.kind, excerpt, recordedAt: source.recordedAt }
    })
    if (new Set(memberships.map(member => member.dealId)).size < 2) invalid()
    return { id: `theme.${index + 1}`, label, description, memberships }
  })
}
