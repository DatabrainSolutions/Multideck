import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { requiresExplicitActionApproval } from '../functions/agent-dexter/email-approval.mjs'

const source = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/deal-stage-review.ts', import.meta.url), 'utf8'))
const { dealStageActionReview } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const deal = { recordId: 'deal', sourceTable: 'CRM_Opportunities', name: 'Reviewed deal', editVersion: 4, pipelineId: 'pipeline', pipeline: 'Freight', stageId: 'first', stage: 'New', probabilityPct: 10 }
const stage = { recordId: 'second', sourceTable: 'CRM_PipelineStages', name: 'Negotiation', pipelineId: 'pipeline', pipeline: 'Freight', probabilityPct: 60, updatedAt: 'stage-version', pipelineUpdatedAt: 'pipeline-version', isConversion: false }
const args = { target_id: 'deal', stage_id: 'second', pipeline_id: 'pipeline', expected_version: 4, expected_stage_updated_at: 'stage-version', expected_pipeline_updated_at: 'pipeline-version' }
const records = () => new Map([['deal', { ...deal }], ['second', { ...stage }]])

test('stage review uses queried names and shows the changed stage and probability', () => {
  const review = dealStageActionReview(records(), { ...args, name: 'Invented', stage: 'Invented', probabilityPct: 100 })
  assert.match(review.description, /Reviewed deal to Negotiation in Freight/)
  assert.match(review.description, /Weighted value is recalculated/)
  assert.deepEqual(review.changes.map(change => [change.field, change.before, change.after]), [['Stage', 'New', 'Negotiation'], ['Probability', '10%', '60%']])
  assert.equal(requiresExplicitActionApproval('move_deal_stage', 'full'), true)
})

test('stage review rejects unqueried targets, stale versions, wrong pipelines, conversion and no-op moves', () => {
  for (const patch of [{ target_id: 'other' }, { stage_id: 'other' }, { expected_version: 3 }, { pipeline_id: 'other' }, { expected_stage_updated_at: 'stale' }, { expected_pipeline_updated_at: 'stale' }])
    assert.throws(() => dealStageActionReview(records(), { ...args, ...patch }), /Read the current/)
  const conversion = records(); conversion.get('second').isConversion = true
  assert.throws(() => dealStageActionReview(conversion, args), /deal-won/)
  const unchanged = records(); unchanged.get('deal').stageId = 'second'
  assert.throws(() => dealStageActionReview(unchanged, args), /already/)
})
