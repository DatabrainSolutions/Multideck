type RecordValue = Record<string, unknown>

/** Resolve both sides from authorised reads, never model-authored names. */
export function dealStageActionReview(records: Map<string, RecordValue>, args: RecordValue) {
  const deal = records.get(String(args.target_id ?? ''))
  const stage = records.get(String(args.stage_id ?? ''))
  if (!deal || deal.sourceTable !== 'CRM_Opportunities' || !Number.isInteger(deal.editVersion)
    || deal.editVersion !== args.expected_version || typeof deal.name !== 'string'
    || !stage || stage.sourceTable !== 'CRM_PipelineStages' || stage.pipelineId !== args.pipeline_id
    || typeof stage.updatedAt !== 'string' || stage.updatedAt !== args.expected_stage_updated_at
    || typeof stage.pipelineUpdatedAt !== 'string' || stage.pipelineUpdatedAt !== args.expected_pipeline_updated_at
    || typeof stage.name !== 'string' || typeof stage.pipeline !== 'string'
    || typeof stage.probabilityPct !== 'number' || stage.probabilityPct < 0 || stage.probabilityPct > 100) {
    throw new Error('Read the current deal and exact destination stage before preparing this move.')
  }
  if (stage.isConversion === true) throw new Error('Use the deal-won workflow for a conversion stage so customer activation is reviewed.')
  if (deal.pipelineId === stage.pipelineId && deal.stageId === stage.recordId) throw new Error('This deal is already in that stage.')
  const pairs = [
    ['Pipeline', deal.pipeline, stage.pipeline], ['Stage', deal.stage, stage.name],
    ['Probability', typeof deal.probabilityPct === 'number' ? `${deal.probabilityPct}%` : null, `${stage.probabilityPct}%`],
  ]
  return {
    title: 'Move deal',
    description: `Move ${deal.name} to ${stage.name} in ${stage.pipeline}. Weighted value is recalculated using the new probability.${typeof stage.entryRule === 'string' && stage.entryRule.trim() ? ` Stage entry rule: ${stage.entryRule.trim()}` : ''}`,
    changes: pairs.filter(([, before, after]) => before !== after).map(([field, before, after]) => ({
      field, before: before ?? null, after, value: after, beforeKnown: true, kind: before == null ? 'added' : 'changed',
    })),
  }
}
