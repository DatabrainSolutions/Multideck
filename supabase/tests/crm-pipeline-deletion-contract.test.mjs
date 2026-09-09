import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260818121500_crm_pipeline_deal_retirement_guard.sql", import.meta.url), "utf8")

test("active deals prevent their pipeline or stage from being retired", () => {
  assert.match(migration, /TR_CRM_PipelineStages_guard_retirement/)
  assert.match(migration, /TR_CRM_Pipelines_guard_retirement/)
  assert.match(migration, /CRMOppty_PipelineStageID/)
  assert.match(migration, /CRMOppty_PipelineID/)
  assert.match(migration, /not deal\."CRMOppty_IsDeleted"/)
  assert.match(migration, /Deals in this stage must be moved before removal\./)
  assert.match(migration, /Deals in this pipeline must be moved before removal\./)
  assert.match(migration, /errcode = '22023'/)
})

test("deal writes share locks with retirement and reject inactive or mismatched stages", () => {
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /TR_CRM_Opportunities_validate_pipeline_stage/)
  assert.match(migration, /stage\."CRMPipeline_ID" = pipeline\."CRMPipeline_ID"/)
  assert.match(migration, /stage\."CRMPipelineStage_ID" = new\."CRMOppty_PipelineStageID"/)
  assert.match(migration, /not stage\."Is_Deleted"/)
  assert.match(migration, /not pipeline\."Is_Deleted"/)
  assert.match(migration, /Choose an active stage in this pipeline before saving the deal\./)
})
