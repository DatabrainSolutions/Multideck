import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const migration = await readFile(new URL("migrations/20260818233000_rates_workspace_bounded_reads.sql", root), "utf8")
const edge = await readFile(new URL("functions/rates-api/index.ts", root), "utf8")
const client = await readFile(new URL("../multideck.client/src/lib/rates-api.ts", root), "utf8")
const page = await readFile(new URL("../multideck.client/src/pages/rates-page.tsx", root), "utf8")

test("Rates registers execute filtering, sorting and paging before returning at most 50 rows", () => {
  assert.match(migration, /create or replace function public\.multideck_rates_register_page/)
  assert.match(migration, /v_limit integer := greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/)
  assert.match(migration, /from filtered[\s\S]*limit v_limit offset v_offset/)
  assert.match(migration, /'total', \(select count\(\*\) from filtered\)/)
  assert.match(edge, /admin\.rpc\("multideck_rates_register_page"/)
  assert.match(edge, /if \(method === "GET" && parts\[0\] === "records" && parts\.length === 1\)/)
  assert.doesNotMatch(edge, /from\("RATE_Contracts"\)\.select\("\*"\)\.eq\("Company_ID", actor\.Company_ID\).*order\("RATEContract_UpdatedAt"/)
})

test("Rates startup returns exact counts and bounded attention, recent, import and quote lists", () => {
  assert.match(migration, /attention_ids[\s\S]*limit 6/)
  assert.match(migration, /recent_ids[\s\S]*limit 5/)
  assert.match(migration, /multideck_rates_quote_picker[\s\S]*least\(coalesce\(p_limit, 100\), 100\)/)
  assert.match(edge, /multideck_rates_workspace_snapshot/)
  assert.match(edge, /RATE_ImportBatches[\s\S]*\.limit\(100\)/)
  assert.match(edge, /summary: snapshot\.summary/)
  assert.doesNotMatch(edge, /versions: \(versions \?\? \[\]\)/)
  assert.doesNotMatch(edge, /RATE_AuditEvents[\s\S]*\.limit\(300\)/)
})

test("record history and quote matching are loaded on demand through bounded company-scoped reads", () => {
  assert.match(edge, /RATEContractVer_ContractID", rateId\)[\s\S]*\.limit\(100\)/)
  assert.match(edge, /RATEAudit_ContractID", rateId\)[\s\S]*\.limit\(100\)/)
  assert.match(migration, /multideck_rates_quote_candidates[\s\S]*match_score >= 60[\s\S]*least\(coalesce\(p_limit, 100\), 100\)/)
  assert.match(edge, /admin\.rpc\("multideck_rates_quote_candidates"/)
  assert.doesNotMatch(edge, /state\.rates\.filter/)
})

test("the client uses cancellable cached server pages and on-demand detail history", () => {
  assert.match(client, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(client, /limit: Math\.max\(1, Math\.min\(input\.limit, 50\)\)/)
  assert.match(client, /getRateDetails/)
  assert.match(page, /serverSorting=\{\{ value: serverSort, onChange: setServerSort \}\}/)
  assert.match(page, /pagination=\{\{ offset, limit: pageSize, total: tableTotal/)
  assert.match(page, /onLimitChange: setPageSize/)
  assert.match(page, /window\.setTimeout\(\(\) => setDebouncedQuery\(query\), 250\)/)
  assert.match(page, /getRateDetails\(selected\.id, controller\.signal\)/)
  assert.doesNotMatch(page, /workspace\.rates/)
})

test("bounded RPCs remain service-role-only and document Dexter parity", () => {
  for (const name of [
    "multideck_rates_register_page",
    "multideck_rates_workspace_snapshot",
    "multideck_rates_quote_candidates",
    "multideck_rates_quote_picker",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`))
  }
  assert.match(migration, /Dexter already has explicit company-scoped Rates read, allowlisted writes and[\s\S]*event-driven watches/)
})
