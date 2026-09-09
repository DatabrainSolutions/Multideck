import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migration = read("../migrations/20260830215402_charge_line_accrual_wip_profitability.sql")
const nominalResolution = read("../migrations/20260830223200_job_charge_nominal_resolution.sql")
const baseline = read("../baseline/public-schema.sql")
const accrualEdge = read("../functions/finance-accruals/index.ts")
const subledgerEdge = read("../functions/finance-subledger/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const page = read("../../multideck.client/src/pages/finance-accrual-wip-page.tsx")
const editor = read("../../multideck.client/src/components/multideck/finance-document-line-editor.tsx")

const includesEvery = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Expected source to include ${value}`))

test("charge lines own expected, WIP/accrual, actual and nominal-code evidence", () => {
  includesEvery(migration, [
    "FIN_JobChargePeriodAllocations",
    "FIN_JobChargeProfitability",
    "JobCostingLine_CostNominalAccountID",
    "JobCostingLine_RevenueNominalAccountID",
    "FINChargeProfit_ActualRevenue",
    "FINChargeProfit_ActualCost",
    "FINChargeProfit_OpenWIP",
    "FINChargeProfit_OpenAccrual",
    "FINChargeProfit_GrossProfit",
  ])
  assert.match(baseline, /BEGIN MIGRATION 20260830215402_charge_line_accrual_wip_profitability\.sql/)
})

test("posted invoices reclassify only the exact linked charge line", () => {
  includesEvery(migration, [
    "FINDocLineJob_JobCostingLineID",
    "FINWIP_JobCostingLineID",
    "FINAccrual_JobCostingLineID",
    "FINRelease_JobCostingLineID",
    "exact_job_charge_line",
    "unallocated_or_no_matching_charge_balance",
    "grossProfitChanged",
  ])
  assert.match(migration, /wip\."FINWIP_JobCostingLineID"=v_charge\.costing_line_id/)
  assert.match(migration, /accrual\."FINAccrual_JobCostingLineID"=v_charge\.costing_line_id/)
  assert.doesNotMatch(migration, /select v_document\."FINDoc_SourceJobID"[\s\S]{0,200}not exists\(select 1 from linked\)/)
})

test("every charge resolves nominal codes inside its legal entity", () => {
  includesEvery(nominalResolution, [
    "_multideck_finance_resolve_job_legal_entity",
    "_multideck_finance_resolve_nominal",
    "TR_FIN_default_job_charge_nominals",
    "TR_FIN_remap_job_charge_nominals",
    "multideck_finance_link_document_charge_lines",
  ])
  assert.match(nominalResolution, /p_default_code/)
  assert.match(nominalResolution, /v_document\."FINDoc_LegalEntityID"/)
  assert.match(baseline, /BEGIN MIGRATION 20260830223200_job_charge_nominal_resolution\.sql/)
  assert.doesNotMatch(baseline, /\\ir \.\.\/migrations\/20260830223200_job_charge_nominal_resolution\.sql/)
})

test("document editing and management reporting expose exact charge selection and GP movement", () => {
  includesEvery(subledgerEdge, ["jobCostingLineId", "multideck_finance_link_document_charge_lines", "jobCostingLines"])
  includesEvery(accrualEdge, ["chargeLines", "unmatchedActualRevenue", "unmatchedActualCost", "FIN_JobChargePeriodAllocations"])
  includesEvery(editor, ["jobChargeOptions", "Job charge", "Unmatched actual"])
  includesEvery(page, ["Charge line gross profit", "Revenue nominal", "Cost nominal", "Unmatched actual GP movement"])
  includesEvery(dexter, ["Charge-line finance rule", "exact linked job charge line", "genuine gross-profit movement"])
})

test("charge profitability remains server-only and watch evaluation stays event driven", () => {
  includesEvery(migration, [
    "enable row level security",
    "revoke all on public.\"FIN_JobChargePeriodAllocations\" from public,anon,authenticated",
    "grant select on public.\"FIN_JobChargeProfitability\" to service_role",
    "AI_DexterWatchSignals",
    "chargeReclassification",
  ])
  assert.doesNotMatch(migration, /grant select on public\."FIN_JobChargeProfitability" to authenticated/)
})
