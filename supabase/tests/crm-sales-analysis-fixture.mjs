export function salesNarrativeFixture() {
  const first = '60000000-0000-0000-0000-000000000001'
  const second = '60000000-0000-0000-0000-000000000002'
  return {
    version: 1, from: '2026-06-24T10:00:00Z', to: '2026-09-22T10:00:00Z',
    totalDocuments: 2, includedDocuments: 2, totalDeals: 2, includedDeals: 2, truncated: false,
    deals: [
      { id: first, name: 'Regional distribution', outcome: 'lost', closedAt: '2026-09-20T10:00:00Z', ownerId: null, pipelineId: null, pipelineName: 'Freight', stageId: null, stageName: 'Lost', daysInStage: null },
      { id: second, name: 'Manufacturing imports', outcome: 'open', closedAt: null, ownerId: null, pipelineId: null, pipelineName: 'Freight', stageId: null, stageName: 'Proposal', daysInStage: 12 },
    ],
    documents: [
      { id: `loss_feedback:${first}`, dealId: first, kind: 'loss_feedback', text: 'Customer requires weekly status updates, rather than calling for progress.', recordedAt: '2026-09-20T10:00:00Z' },
      { id: 'action_outcome:70000000-0000-0000-0000-000000000002', dealId: second, kind: 'action_outcome', text: 'Agreed weekly progress reports so the team does not need to chase shipments.', recordedAt: '2026-09-21T10:00:00Z' },
    ],
  }
}

export function salesThemeFixture() {
  const documents = salesNarrativeFixture().documents
  return [{ label: 'Proactive shipment updates', description: 'Customers want regular shipment updates without chasing.', memberships: [
    { sourceId: documents[0].id, excerpt: 'requires weekly status updates' },
    { sourceId: documents[1].id, excerpt: 'Agreed weekly progress reports' },
  ] }]
}
