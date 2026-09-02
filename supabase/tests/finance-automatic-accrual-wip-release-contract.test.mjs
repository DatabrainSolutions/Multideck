import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migration = read("../migrations/20260830213234_automatic_accrual_wip_document_release.sql")
const periodFix = read("../migrations/20260830214204_fix_finance_period_end_interval.sql")
const postingDimensionFix = read("../migrations/20260830214351_finance_posting_line_job_dimension_fix.sql")
const dimensionKeyFix = read("../migrations/20260830214525_fix_posting_dimension_value_key.sql")
const baseline = read("../baseline/public-schema.sql")
const edge = read("../functions/finance-accruals/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const api = read("../../multideck.client/src/lib/finance-accruals-api.ts")
const page = read("../../multideck.client/src/pages/finance-accrual-wip-page.tsx")

const includesEvery = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Expected source to include ${value}`))

test("posted job invoices progressively and idempotently release the correct management adjustment", () => {
  includesEvery(migration, [
    "FIN_AccrualWIPReleases",
    "_multideck_finance_release_document_accrual_wip",
    "TR_FIN_Documents_automatic_accrual_wip_release",
    "FINDoc_PostingStatusCode\"='posted'",
    "FINDoc_TypeCode\" in ('sl_invoice','pl_invoice')",
    "FINDoc_LocalNetAmount",
    "least(v_available",
    "FINWIP_RelievedAmount",
    "FINAccrual_RelievedAmount",
    "Automatic WIP reversal",
    "Automatic accrual reversal",
    "basis','local_net_excluding_tax",
  ])
  assert.match(migration, /unique \("FINRelease_DocumentID","FINRelease_AccrualID"\)/)
  assert.match(migration, /unique \("FINRelease_DocumentID","FINRelease_WIPID"\)/)
  assert.doesNotMatch(migration, /FINDoc_TypeCode" in \('credit_note','debit_note'\)/)
  assert.match(periodFix, /interval '1 month'-interval '1 day'/)
  assert.doesNotMatch(periodFix, /interval '1 month-1 day'/)
  assert.match(baseline, /BEGIN MIGRATION 20260830214204_fix_finance_period_end_interval\.sql/)
  assert.match(postingDimensionFix, /FINPostLine_JobID/)
  assert.match(postingDimensionFix, /FINPostLine_Dimension1ID.*FINPostLine_JobID/s)
  assert.match(postingDimensionFix, /TR_FIN_PostingLines_job_dimension_guard/)
  assert.match(baseline, /BEGIN MIGRATION 20260830214351_finance_posting_line_job_dimension_fix\.sql/)
  assert.match(dimensionKeyFix, /dimension\."FINDim_ID"/)
  assert.doesNotMatch(dimensionKeyFix, /FINDimValue_ID/)
  assert.match(baseline, /BEGIN MIGRATION 20260830214525_fix_posting_dimension_value_key\.sql/)
})

test("invoice release reverses original posting lines and manual reversal only consumes the remainder", () => {
  includesEvery(migration, [
    "FINCloseRun_PostingBatchID",
    "FINPostLine_CreditAmount\"*v_release",
    "FINPostLine_DebitAmount\"*v_release",
    "This review has no remaining accrual or WIP balance to reverse.",
    "v_remaining:=v_record.original_amount-v_record.relieved_amount",
    "Reversal of remaining balance",
  ])
  assert.match(migration, /FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total/)
  assert.match(baseline, /BEGIN MIGRATION 20260830213234_automatic_accrual_wip_document_release\.sql/)
})

test("operators and Dexter receive exact automatic release evidence without a new write action", () => {
  includesEvery(edge, ["FIN_AccrualWIPReleases", "automaticWipReleased", "automaticAccrualReleased", "documentNumber"])
  includesEvery(api, ["automaticReleases", "FINRelease_PostingBatchID", "FINRelease_ReleaseKindCode"])
  includesEvery(page, ["WIP reversed", "Accrual reversed", "Released by", "Reverse remaining"])
  includesEvery(migration, [
    "automatic_accrual_wip_release",
    "automaticWIPRelease",
    "automaticAccrualRelease",
    "releasePostingBatch",
  ])
  includesEvery(dexter, [
    "automatically reverses that job's oldest outstanding revenue WIP",
    "automatically reverses that job's oldest outstanding cost accrual",
    "never claim a credit note causes an automatic release",
  ])
  assert.doesNotMatch(migration, /AIDexterAction_Code[^\n]*automatic_accrual_wip_release/)
})
