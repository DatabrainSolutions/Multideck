import { assertEquals } from "jsr:@std/assert@1"
import { resolveAccountScoreExplanations } from "./score-explanations.ts"

const activity = { id: "activity-1", subject: "Quarterly review confirmed stable volumes", occurredAt: "2026-08-24T10:00:00Z" }
const shipment = { id: "shipment-1", reference: "MD-22455", route: "Felixstowe → Rotterdam", eta: "2026-08-28T12:00:00Z" }

Deno.test("returns only current explanations backed by visible source records", () => {
  const result = resolveAccountScoreExplanations({
    accountId: "account-1",
    healthScore: 75,
    churnRiskScore: 20,
    activities: [activity],
    shipments: [shipment],
    emails: [],
    insights: [{
      CRMAIInsight_InsightTypeCode: "customer_health",
      CRMAIInsight_StatusCode: "new",
      CRMAIInsight_Summary: "Health is supported by stable shipment volumes and the latest account review.",
      CRMAIInsight_ConfidenceScore: 0.82,
      CRMAIInsight_CreatedAt: "2026-08-25T08:00:00Z",
      CRMAIInsight_EvidenceJSON: {
        healthScore: 75,
        sources: [
          { sourceTable: "CRM_Activities", sourceId: "activity-1" },
          { sourceTable: "Job_Header", sourceId: "shipment-1" },
        ],
      },
    }],
  })

  assertEquals(result.health?.sources.map((source) => source.kind), ["activity", "shipment"])
  assertEquals(result.health?.confidence, 0.82)
  assertEquals(result.churnRisk, null)
})

Deno.test("rejects stale, unsupported and closed explanations", () => {
  const base = {
    accountId: "account-1",
    healthScore: 75,
    churnRiskScore: 20,
    activities: [activity],
    shipments: [],
    emails: [],
  }
  const stale = resolveAccountScoreExplanations({ ...base, insights: [{ insightType: "health", summary: "Old reason", evidence: { score: 74, sources: [{ sourceTable: "CRM_Activities", sourceId: "activity-1" }] } }] })
  const unsupported = resolveAccountScoreExplanations({ ...base, insights: [{ insightType: "health", summary: "Partly unlinked reason", evidence: { score: 75, sources: [{ sourceTable: "CRM_Activities", sourceId: "activity-1" }, { sourceTable: "CRM_Activities", sourceId: "missing" }] } }] })
  const closed = resolveAccountScoreExplanations({ ...base, insights: [{ insightType: "health", status: "dismissed", summary: "Dismissed reason", evidence: { score: 75, sources: [{ sourceTable: "CRM_Activities", sourceId: "activity-1" }] } }] })

  assertEquals(stale.health, null)
  assertEquals(unsupported.health, null)
  assertEquals(closed.health, null)
})
