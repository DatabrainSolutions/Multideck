import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const migration = await readFile(new URL("migrations/20260810163000_rates_contracts_workspace.sql", root), "utf8")
const edge = await readFile(new URL("functions/rates-api/index.ts", root), "utf8")
const dexter = await readFile(new URL("functions/agent-dexter/index.ts", root), "utf8")

test("rates records, source files and quote snapshots are company scoped", () => {
  assert.match(migration, /alter table public\."RATE_Contracts" add column if not exists "Company_ID"/)
  assert.match(migration, /create table if not exists public\."RATE_QuoteSelections"/)
  assert.match(migration, /references public\."CusQuote_Header"\("CusQuoteHeader_ID"\)/)
  assert.match(migration, /"SnapshotJSON" jsonb not null/)
  assert.match(edge, /eq\("Company_ID", actor\.Company_ID\)/)
  assert.match(edge, /from\("App_Live_Quotes"\)/)
  assert.doesNotMatch(edge, /from\("Sales_Quotes"\)/)
  assert.match(edge, /RATE_QuoteSelections/)
  assert.match(edge, /That rate is no longer eligible for this quote/)
})

test("commercial mutations require Rates.Manage and create audit evidence", () => {
  assert.match(migration, /'Rates\.Manage'/)
  assert.match(edge, /requirePermission\(admin, actor\.User_ID, "Rates\.Manage"\)/)
  assert.match(edge, /RATE_AuditEvents/)
  assert.match(edge, /version_created/)
  assert.match(edge, /rate_applied_to_quote/)
})

test("imports archive the source privately and remain review-first", () => {
  assert.match(migration, /'rate-source-files', 'rate-source-files', false/)
  assert.match(edge, /RATEImport_StatusCode: "review"/)
  assert.match(edge, /RATEImport_FileHashSHA256: hash/)
  assert.match(edge, /RATEImport_StatusCode: "saved"/)
})

test("Dexter rates support is read/watch only and event driven", () => {
  assert.match(migration, /multideck_dexter_domain_rates/)
  assert.match(migration, /'rates', 'Rates and contracts'/)
  assert.match(migration, /after insert or update of "RATEContract_StatusCode"/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.match(dexter, /Commercial changes are not an allowlisted Dexter action/)
  assert.doesNotMatch(dexter, /actionCode:\s*["']rates\./)
})

test("SeaRates stays explicit and non-speculative until its API is connected", () => {
  assert.match(edge, /seaRates: \{ connected: false/)
  assert.doesNotMatch(edge, /searates\.com|SeaRates.*fetch/)
})
