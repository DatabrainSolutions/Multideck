import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../migrations/20260831061903_universal_job_charge_accounting.sql")
const baseline = read("../baseline/public-schema.sql")
const accrualFunction = read("../functions/finance-accruals/index.ts")
const subledgerFunction = read("../functions/finance-subledger/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const page = read("../../multideck.client/src/pages/finance-accrual-wip-page.tsx")

const includesEvery = (source, values) => values.forEach((value) => assert.ok(source.includes(value), `Missing ${value}`))

test("new-tenant provisioning contains the exact universal job charge migration", () => {
  const name = "20260831061903_universal_job_charge_accounting.sql"
  const startMarker = `-- BEGIN MIGRATION ${name}\n`
  const endMarker = `\n-- END MIGRATION ${name}`
  const start = baseline.indexOf(startMarker)
  const end = baseline.indexOf(endMarker, start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.equal(baseline.slice(start + startMarker.length, end).trim(), migration.trim())
})

test("one canonical job charge boundary covers every operational domain", () => {
  includesEvery(migration, [
    "Job_DomainCode",
    "JobCostingLine_DomainCode",
    "JobCostingLine_SourceTable",
    "JobCostingLine_SourceID",
    "UX_Job_Costing_Lines_source",
    "_multideck_finance_upsert_job_charge",
    "multideck_finance_upsert_job_charge",
    "('freight','warehouse','customs','shared')",
  ])
  assert.match(migration, /revoke all on function public\.multideck_finance_upsert_job_charge[\s\S]*from public,anon,authenticated;/)
  assert.match(migration, /grant execute on function public\.multideck_finance_upsert_job_charge[\s\S]*to service_role;/)
})

test("warehouse billing and legacy freight charges feed the canonical ledger", () => {
  includesEvery(migration, [
    "TR_FIN_ensure_warehouse_job",
    "TR_FIN_adapt_warehouse_billing_event",
    "TR_FIN_adapt_legacy_charge_in",
    "TR_FIN_adapt_legacy_charge_out",
    "WMS_BillingEvents",
    "actualsIgnored",
    "A foreign-currency warehouse billing event needs exchangeRate or localNetAmount evidence.",
  ])
  assert.doesNotMatch(migration, /WMSOrderLine_GoodsValue[\s\S]{0,500}_multideck_finance_upsert_job_charge/)
  assert.doesNotMatch(migration, /CUST_InvoiceAmount[\s\S]{0,500}_multideck_finance_upsert_job_charge/)
})

test("management reporting, invoicing, Dexter and Watching retain domain provenance", () => {
  includesEvery(accrualFunction, ["Job_DomainCode", "JobCostingLine_DomainCode", "sourceTable", "domainCode"])
  includesEvery(subledgerFunction, ["JobCostingLine_DomainCode", "JobCostingLine_SourceTable", "JobCostingLine_SourceID"])
  includesEvery(page, ["Domain", "line.domainCode", "line.sourceTable"])
  includesEvery(migration, ["FINChargeProfit_DomainCode", "chargeSourceTable", "TR_FIN_job_charge_dexter_watch", "AI_DexterWatchSignals"])
  includesEvery(dexter, ["universal across operations", "warehouse and customs jobs", "operational valuation evidence"])
})

test("actuals remain invoice-derived and exact-line reversals are untouched", () => {
  assert.match(migration, /actuals continue to come only from posted finance/)
  assert.doesNotMatch(migration, /JCIn_Actual_NetCost_Local[^\n]*JobCostingLine_CostAmountLocal/)
  assert.doesNotMatch(migration, /JCOut_Actual_NetCost_Local[^\n]*JobCostingLine_RevenueAmountLocal/)
  assert.match(migration, /FINDocLineJob_JobCostingLineID/)
})
