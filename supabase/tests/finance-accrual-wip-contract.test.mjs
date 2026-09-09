import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const migration = read("../migrations/20260830204914_accrual_wip_management.sql")
const baseline = read("../baseline/public-schema.sql")
const edge = read("../functions/finance-accruals/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const api = read("../../multideck.client/src/lib/finance-accruals-api.ts")
const page = read("../../multideck.client/src/pages/finance-accrual-wip-page.tsx")
const router = read("../../multideck.client/src/App.tsx")
const navigation = read("../../multideck.client/src/data/navigation-data.ts")
const topBar = read("../../multideck.client/src/components/multideck/top-bar.tsx")
const config = read("../config.toml")

const includesEvery = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Expected source to include ${value}`))

test("management accounting migration supplies guarded period, review, posting and reversal contracts", () => {
  includesEvery(migration, [
    "Finance.Management.View", "Finance.Management.Prepare", "Finance.Management.Approve", "Finance.Management.Post",
    "FIN_JobPeriodHistory", "multideck_finance_assign_job_period", "multideck_finance_transition_accrual_wip",
    "multideck_finance_post_accrual_wip", "multideck_finance_reverse_accrual_wip",
    "Approve this review before posting it", "Choose an open reversal period", "Accrued income and WIP",
  ])
  assert.match(migration, /FINPostLine_DebitAmount[^]*FINPostLine_CreditAmount/)
  assert.match(baseline, /BEGIN MIGRATION 20260830204914_accrual_wip_management\.sql/)
})

test("calculation endpoint keeps exact period and outside-period evidence", () => {
  includesEvery(edge, [
    "expectedRevenue", "expectedCost", "outsidePeriodRevenue", "outsidePeriodCost",
    "proposedWip", "proposedAccrual", "adjustedMargin", "sourceDocumentIds",
    "Only a draft review can be edited", "Explain every manual override",
    "Finance.Management.Prepare", "Finance.Management.Approve", "Finance.Management.Post",
  ])
  assert.match(edge, /toMonth\(document\.FINDoc_AccountingDate\) === targetPeriod/)
  assert.match(edge, /officeSet\.has\(job\.Job_OrgOfficeID \?\? job\.Job_OfficeID\)/)
  assert.match(config, /\[functions\.finance-accruals\]\s+verify_jwt = true/)
})

test("workspace exposes the complete controlled lifecycle without duplicating the top-bar action", () => {
  includesEvery(page, [
    "Job period control", "Period calculation", "Review history", "Assign job management period",
    "Request approval", "Post journal", "Reverse remaining", "Reviewer note for any override",
    "subscribeTopBarAction(topBarActionEvents.prepareAccrualWipReview",
  ])
  includesEvery(api, ["getFinanceAccrualWorkspace", "assignJobManagementPeriod", "createAccrualWipRun", "postAccrualWipRun", "reverseAccrualWipRun"])
  includesEvery(router, ["/finance/management/accruals-wip"])
  includesEvery(navigation, ["Accruals & WIP", "/finance/management/accruals-wip"])
  includesEvery(topBar, ["Prepare period review", "Finance.Management.Prepare"])
})

test("Dexter can read and watch management evidence and only assign periods through approval", () => {
  includesEvery(migration, [
    "accrual_wip_review", "managementPeriod", "accrualWipStatus", "AI_DexterWatchSignals",
    "assign_job_management_period", "Finance.Management.Prepare", "AIDexterAction_HasExternalEffect",
  ])
  includesEvery(dexter, [
    "ASSIGN_JOB_MANAGEMENT_PERIOD_ACTION", "/functions/v1/finance-accruals/jobs/",
    "Preparing a period review, overriding a calculated amount, approving, posting or manually reversing any remaining balance remain manual controls",
  ])
})
