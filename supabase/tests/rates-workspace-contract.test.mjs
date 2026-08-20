import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const migration = await readFile(new URL("migrations/20260810163000_rates_contracts_workspace.sql", root), "utf8")
const packs = await readFile(new URL("migrations/20260820133000_rates_customer_tariff_packs.sql", root), "utf8")
const edge = await readFile(new URL("functions/rates-api/index.ts", root), "utf8")
const dexter = await readFile(new URL("functions/agent-dexter/index.ts", root), "utf8")
const document = await readFile(new URL("functions/_shared/customer-tariff-document.ts", root), "utf8")

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
  assert.match(edge, /pack_approved/)
  assert.match(edge, /pack_sent/)
})

test("imports archive the source privately and remain review-first", () => {
  assert.match(migration, /'rate-source-files', 'rate-source-files', false/)
  assert.match(edge, /RATEImport_StatusCode: "review"/)
  assert.match(edge, /RATEImport_FileHashSHA256: hash/)
  assert.match(edge, /RATEImport_StatusCode: "saved"/)
})

test("Dexter rates support includes allowlisted writes and event-driven watches", () => {
  assert.match(migration, /multideck_dexter_domain_rates/)
  assert.match(packs, /create_cost_tariff/)
  assert.match(packs, /create_customer_tariff_pack/)
  assert.match(packs, /AI_DexterWatchSignals/)
  assert.match(packs, /TR_RATE_CustomerTariffPublications_dexter_watch/)
  assert.match(dexter, /Approving a pack and sending the customer tariff document stay in Rates/)
  assert.match(dexter, /RATES_EDGE_ACTIONS/)
  assert.match(dexter, /create_cost_tariff/)
  assert.match(dexter, /\/rates\/tariffs/)
  assert.match(dexter, /isPack \? "\/rates\/tariffs" : "\/rates"/)
  assert.match(dexter, /rate: "rates"/)
  assert.doesNotMatch(dexter, /Commercial changes are not an allowlisted Dexter action/)
})

test("customer tariff documents are sell-only and never include buy totals", () => {
  assert.match(document, /This document shows customer sell rates only/)
  assert.doesNotMatch(document, /buyTotal|buyAmount/)
  assert.match(edge, /buildCustomerTariffDocumentDataset/)
  assert.match(edge, /sellCharges/)
  assert.doesNotMatch(edge, /buyTotal: cost\.buyTotal/)
  assert.match(edge, /if \(sendAfter\) return await sendPublication/)
  assert.match(edge, /Pack needs approval/)
  assert.match(edge, /"pending_approval"/)
})

test("SeaRates stays explicit and non-speculative until its API is connected", () => {
  assert.match(edge, /seaRates: \{ connected: false/)
  assert.doesNotMatch(edge, /searates\.com|SeaRates.*fetch/)
})
