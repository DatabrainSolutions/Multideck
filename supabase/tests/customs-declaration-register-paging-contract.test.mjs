import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const migration = read("supabase/migrations/20260818224500_customs_declaration_register_paging.sql")
const api = read("multideck.client/src/lib/customs-drafts-api.ts")
const page = read("multideck.client/src/pages/customs-declarations-page.tsx")

test("Customs register paging is authenticated, RLS-preserving and capped at 50 rows", () => {
  assert.match(migration, /multideck_customs_declaration_register_page/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /if auth\.uid\(\) is null/)
  assert.match(migration, /least\(coalesce\(p_limit, 10\), 50\)/)
  assert.match(migration, /from public\."Customs_Declarations" declaration/)
  assert.match(migration, /left join public\."App_Live_Bookings" booking/)
  assert.doesNotMatch(migration, /security definer/)
  assert.doesNotMatch(migration, /create index|insert into|update public\.|delete from public\./i)
})

test("filters and joined job search run before the bounded page while totals and facets remain exact", () => {
  assert.match(migration, /scoped as materialized/)
  assert.match(migration, /filtered as materialized/)
  assert.match(migration, /strpos\(lower\(search_text\), lower\(v_search\)\) > 0/)
  assert.match(migration, /ordinal > v_offset and ordinal <= v_offset \+ v_limit/)
  assert.match(migration, /'total', \(select count\(\*\) from filtered\)/)
  assert.match(migration, /'availableTotal', \(select count\(\*\) from scoped\)/)
  assert.match(migration, /'statuses'/)
  assert.match(migration, /'destinations'/)
})

test("the Customs table uses server sorting, filtering and pagination", () => {
  assert.match(api, /export async function listCustomsDeclarationDraftsPage/)
  assert.match(api, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(api, /p_limit: normalized\.limit/)
  assert.match(page, /listCustomsDeclarationDraftsPage\(kind/)
  assert.doesNotMatch(page, /\blistStandaloneDeclarationDrafts\b|\blistJobRelatedDeclarationDrafts\b/)
  assert.doesNotMatch(page, /const filteredDrafts = useMemo/)
  assert.match(page, /serverSorting=\{\{ value: sort/)
  assert.match(page, /pagination=\{\{ offset, limit: customsRegisterPageSize, total/)
})

test("authenticated roles alone can execute the Customs register RPC", () => {
  assert.match(migration, /revoke all on function public\.multideck_customs_declaration_register_page[\s\S]*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_customs_declaration_register_page[\s\S]*to authenticated, service_role/)
})
