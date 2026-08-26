type DataRow = Record<string, unknown>

export type AccountScoreEvidenceSource = {
  id: string
  kind: "activity" | "email" | "shipment"
  claim: string
  title: string
  href: string
  observedAt: string | null
}

export type AccountScoreExplanation = {
  summary: string
  confidence: number | null
  calculatedAt: string | null
  sources: AccountScoreEvidenceSource[]
}

type ScoreExplanationInput = {
  accountId: string
  healthScore: number | null
  churnRiskScore: number | null
  insights: DataRow[]
  activities: DataRow[]
  emails: DataRow[]
  shipments: DataRow[]
}

const closedStatuses = new Set(["archived", "closed", "dismissed", "expired", "rejected", "resolved"])
const healthTypes = new Set(["account_health", "customer_health", "health", "relationship_health"])
const churnTypes = new Set(["churn", "churn_risk", "customer_churn_risk", "retention_risk"])

function record(value: unknown): DataRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataRow : {}
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function code(value: unknown) {
  return (text(value) ?? "").toLowerCase().replace(/[\s-]+/g, "_")
}

function evidenceReferences(evidence: DataRow) {
  const candidates = [evidence.sources, evidence.sourceRecords, evidence.records, evidence.evidence]
  const references = candidates.find(Array.isArray)
  if (Array.isArray(references)) return references.map(record)
  return text(evidence.sourceTable) || text(evidence.sourceType) ? [evidence] : []
}

function referencedScore(evidence: DataRow, kind: "health" | "churnRisk") {
  const values = kind === "health"
    ? [evidence.healthScore, evidence.scoreValue, evidence.score]
    : [evidence.churnRiskScore, evidence.riskScore, evidence.scoreValue, evidence.score]
  for (const value of values) {
    const parsed = number(value)
    if (parsed !== null) return parsed
  }
  return null
}

function matchesScore(evidence: DataRow, kind: "health" | "churnRisk", currentScore: number) {
  const referenced = referencedScore(evidence, kind)
  return referenced !== null && Math.abs(referenced - currentScore) < 0.01
}

function referenceIdentity(reference: DataRow) {
  return {
    table: code(reference.sourceTable ?? reference.table ?? reference.sourceType ?? reference.recordType),
    id: text(reference.sourceId ?? reference.recordId ?? reference.id),
  }
}

function sourceForReference(
  reference: DataRow,
  accountId: string,
  activities: DataRow[],
  emails: DataRow[],
  shipments: DataRow[],
): AccountScoreEvidenceSource | null {
  const identity = referenceIdentity(reference)
  if (!identity.id) return null

  if (["activity", "crm_activity", "crm_activities"].includes(identity.table)) {
    const activity = activities.find((item) => text(item.id ?? item.CRMActivity_ID) === identity.id)
    const title = activity ? text(activity.subject ?? activity.CRMActivity_Subject) : null
    if (!activity || !title) return null
    return {
      id: `activity:${identity.id}`,
      kind: "activity",
      claim: title,
      title,
      href: `/crm/accounts/${encodeURIComponent(accountId)}#activity-${encodeURIComponent(identity.id)}`,
      observedAt: text(activity.occurredAt ?? activity.CRMActivity_ActivityAt),
    }
  }

  if (["comm_messages", "comm_threads", "email", "email_thread"].includes(identity.table)) {
    const email = emails.find((item) => [text(item.id), text(item.threadId)].includes(identity.id))
    const title = email ? text(email.subject) : null
    const threadId = email ? text(email.threadId) : null
    if (!email || !title || !threadId) return null
    return {
      id: `email:${identity.id}`,
      kind: "email",
      claim: title,
      title,
      href: `/inbox?thread=${encodeURIComponent(threadId)}`,
      observedAt: text(email.occurredAt),
    }
  }

  if (["booking", "job", "job_header", "job_shipmentsummary", "shipment"].includes(identity.table)) {
    const shipment = shipments.find((item) => [text(item.id ?? item.Job_ID), text(item.reference)].includes(identity.id))
    const reference = shipment ? text(shipment.reference) : null
    if (!shipment || !reference) return null
    const route = text(shipment.route)
    const title = route ? `${reference} · ${route}` : reference
    return {
      id: `shipment:${identity.id}`,
      kind: "shipment",
      claim: title,
      title,
      href: `/bookings/${encodeURIComponent(reference.toLowerCase())}`,
      observedAt: text(shipment.eta),
    }
  }

  return null
}

function explanationFor(
  kind: "health" | "churnRisk",
  score: number | null,
  input: ScoreExplanationInput,
): AccountScoreExplanation | null {
  if (score === null) return null
  const supportedTypes = kind === "health" ? healthTypes : churnTypes

  for (const insight of input.insights) {
    const type = code(insight.CRMAIInsight_InsightTypeCode ?? insight.insightType)
    const status = code(insight.CRMAIInsight_StatusCode ?? insight.status)
    const summary = text(insight.CRMAIInsight_Summary ?? insight.summary)
    const evidence = record(insight.CRMAIInsight_EvidenceJSON ?? insight.evidence)
    if (!supportedTypes.has(type) || closedStatuses.has(status) || !summary || !matchesScore(evidence, kind, score)) continue

    const references = evidenceReferences(evidence).slice(0, 12)
    const resolvedSources = references.map((reference) => sourceForReference(reference, input.accountId, input.activities, input.emails, input.shipments))
    if (!references.length || resolvedSources.some((source) => source === null)) continue
    const sources = resolvedSources
      .filter((source): source is AccountScoreEvidenceSource => source !== null)
      .filter((source, index, all) => all.findIndex((candidate) => candidate.id === source.id) === index)
      .slice(0, 4)

    const confidence = number(insight.CRMAIInsight_ConfidenceScore ?? insight.confidence)
    return {
      summary,
      confidence: confidence === null ? null : Math.max(0, Math.min(confidence, 1)),
      calculatedAt: text(insight.CRMAIInsight_CreatedAt ?? insight.calculatedAt),
      sources,
    }
  }

  return null
}

export function resolveAccountScoreExplanations(input: ScoreExplanationInput) {
  return {
    health: explanationFor("health", input.healthScore, input),
    churnRisk: explanationFor("churnRisk", input.churnRiskScore, input),
  }
}
