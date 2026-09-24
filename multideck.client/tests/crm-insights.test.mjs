import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSalesInsightFilters, dealWinRate, stageDurationLabel, closeDateComparison } from '../src/lib/crm-insights.ts'

test('win rate uses completed decisions and no decisions remain unknown', () => {
  assert.equal(dealWinRate(0, 0), null)
  assert.equal(dealWinRate(0, 4), 0)
  assert.equal(dealWinRate(3, 1), 75)
  assert.equal(dealWinRate(5, 0), 100)
})

test('shared report URLs only admit supported cohorts and valid record identifiers', () => {
  assert.deepEqual(parseSalesInsightFilters('?days=1&pipeline=no&owner=%27%3Bselect'), { days: 90, pipelineId: null, ownerId: null })
  assert.deepEqual(parseSalesInsightFilters('?days=365&pipeline=30000000-0000-0000-0000-000000000001&owner=40000000-0000-0000-0000-000000000001'), { days: 365, pipelineId: '30000000-0000-0000-0000-000000000001', ownerId: '40000000-0000-0000-0000-000000000001' })
  assert.equal(parseSalesInsightFilters('').days, 90)
})

test('unknown stage time never looks like a zero-day result and regional English formats remain supported', () => {
  assert.equal(stageDurationLabel(null), 'Not measured')
  assert.equal(stageDurationLabel(NaN), 'Not measured')
  assert.equal(stageDurationLabel(0.2), 'Less than a day')
  assert.equal(stageDurationLabel(1), '1 day')
  assert.equal(stageDurationLabel(12.24, 'en-GB'), '12.2 days')
  assert.equal(stageDurationLabel(12.24, 'en-US'), '12.2 days')
})

test('close-date comparisons need two recorded dates and use the actual date interval', () => {
  assert.equal(closeDateComparison(null, '2026-10-20'), null)
  assert.equal(closeDateComparison('not-a-date', '2026-10-20'), null)
  assert.equal(closeDateComparison('2026-09-28', '2026-10-20')?.days, 22)
  assert.equal(closeDateComparison('2026-10-20', '2026-10-20')?.days, 0)
  assert.equal(closeDateComparison('2026-10-20', '2026-10-18')?.days, -2)
})

test('theme projections count unique canonical deals while preserving exact multi-theme evidence', async () => {
  const { projectSalesThemes } = await import('../src/lib/crm-insights.ts')
  const deal = (id, outcome, ownerId = 'owner-a', pipelineId = 'pipeline-a') => ({ id, name: id, outcome, ownerId, pipelineId, pipelineName: 'New business', stageId: 'proposal', stageName: 'Proposal', closedAt: null, daysInStage: 3 })
  const source = (sourceId, dealId, recordedAt = '2026-09-10T12:00:00Z') => ({ sourceId, dealId, recordedAt, kind: 'action_outcome', excerpt: 'Customer asked for a reliable collection window.' })
  const analysis = { schemaVersion: 3, narrative: { from: '2026-06-24T12:00:00Z', to: '2026-09-22T12:00:00Z', deals: [deal('a', 'won'), deal('b', 'open'), deal('c', 'lost', 'owner-b')] }, themes: [
    { id: 'reliability', label: 'Service reliability', description: 'Recorded service concerns', memberships: [source('1', 'a'), source('2', 'a'), source('3', 'b'), source('4', 'missing'), source('5', 'c'), source('6', 'a', 'not-a-date')] },
    { id: 'scheduling', label: 'Collection timing', description: 'Recorded schedule discussions', memberships: [source('1', 'a'), source('3', 'b')] },
  ] }
  const result = projectSalesThemes(analysis, { days: 90, ownerId: null, pipelineId: null }, '2026-09-22T12:00:00Z')
  assert.deepEqual(result.themes[0].counts, { won: 1, open: 1, lost: 1 })
  assert.equal(result.documents, 4)
  assert.equal(result.deals, 3)
  assert.equal(result.themes[0].memberships[0].excerpt, analysis.themes[0].memberships[0].excerpt)
  assert.equal(result.themes[1].deals.length, 2)
  assert.deepEqual(result.stages[0].dealIds, ['b'])
  assert.equal(projectSalesThemes(analysis, { days: 90, ownerId: 'owner-b', pipelineId: null }, '2026-09-22T12:00:00Z').themes[0].counts.lost, 1)
  assert.equal(projectSalesThemes(analysis, { days: 90, ownerId: null, pipelineId: 'other' }, '2026-09-22T12:00:00Z').themes.length, 0)
})

test('theme periods apply to recorded feedback, cap at analysis coverage and reject legacy output', async () => {
  const { projectSalesThemes } = await import('../src/lib/crm-insights.ts')
  const membership = (sourceId, recordedAt) => ({ sourceId, dealId: 'a', recordedAt, kind: 'loss_feedback', excerpt: 'The lead time did not meet the requirement.' })
  const analysis = { schemaVersion: 3, narrative: { from: '2026-06-24T12:00:00Z', to: '2026-09-22T12:00:00Z', deals: [{ id: 'a', outcome: 'lost', ownerId: null, pipelineId: null }] }, themes: [{ id: 'timing', label: 'Lead time', description: '', memberships: [membership('old', '2026-08-01T12:00:00Z'), membership('recent', '2026-09-10T12:00:00Z'), membership('before-coverage', '2026-02-10T12:00:00Z'), membership('future', '2026-09-23T12:00:00Z')] }] }
  const filters = { days: 30, ownerId: null, pipelineId: null }
  assert.deepEqual(projectSalesThemes(analysis, filters, '2026-09-22T12:00:00Z').themes[0].memberships.map(row => row.sourceId), ['recent'])
  assert.equal(projectSalesThemes(analysis, { ...filters, days: 365 }, '2026-09-22T12:00:00Z').documents, 2)
  assert.equal(projectSalesThemes({ ...analysis, schemaVersion: 2 }, filters, '2026-09-22T12:00:00Z').themes.length, 0)
})
