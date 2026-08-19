import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const migration = readFileSync(resolve(repoRoot, "supabase/migrations/20260818201000_commercial_register_paging.sql"), "utf8")

test("Bookings and Quotes register reads are authenticated, RLS-preserving, and bounded to 50 rows", () => {
  assert.match(migration, /multideck_booking_register_page/)
  assert.match(migration, /multideck_quote_register_page/)
  assert.equal((migration.match(/security invoker/g) ?? []).length, 4)
  assert.equal((migration.match(/least\(coalesce\(p_limit, 10\), 50\)/g) ?? []).length, 2)
  assert.equal((migration.match(/if auth\.uid\(\) is null/g) ?? []).length, 2)
  assert.match(migration, /from public\."App_Live_Bookings" booking/)
  assert.match(migration, /from public\."App_Live_Quotes" quote/)
  assert.doesNotMatch(migration, /security definer/)
  assert.doesNotMatch(migration, /insert into|generate_series/i)
})

test("the server applies search, advanced filters, sorting, exact counts, and paging before returning rows", () => {
  assert.equal((migration.match(/ordinal > v_offset and ordinal <= v_offset \+ v_limit/g) ?? []).length, 2)
  assert.equal((migration.match(/'total', \(select count\(\*\) from filtered\)/g) ?? []).length, 2)
  assert.match(migration, /'availableTotal', \(select count\(\*\) from base\)/)
  assert.match(migration, /'summary'.*'active'.*'inTransit'.*'atDestination'.*'exceptions'.*'complete'/s)
  assert.equal((migration.match(/multideck_register_filter_matches\(filter_fields, p_filter_query\)/g) ?? []).length, 2)
  assert.equal((migration.match(/strpos\(lower\(search_text\), lower\(v_search\)\) > 0/g) ?? []).length, 2)
  assert.match(migration, /p_sort in \([\s\S]*'customerCargo'/)
  assert.match(migration, /p_sort in \([\s\S]*'estimatedMargin'/)
})

test("advanced filter semantics preserve empty, negative, exact, prefix, contains, date, group, and query modes", () => {
  for (const operator of ["is-empty", "is-not-empty", "is-not", "not-contains", "is", "starts-with", "before", "after", "between"]) {
    assert.match(migration, new RegExp(operator))
  }
  assert.match(migration, /v_group_match = 'all'/)
  assert.match(migration, /v_query_match = 'any'/)
  assert.match(migration, /cardinality\(v_days\) = 0/)
  assert.match(migration, /btrim\(value\) <> '—'/)
})

test("only authenticated roles can execute the bounded register functions", () => {
  assert.match(migration, /revoke all on function public\.multideck_booking_register_page[\s\S]*from public, anon/)
  assert.match(migration, /revoke all on function public\.multideck_quote_register_page[\s\S]*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_booking_register_page[\s\S]*to authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.multideck_quote_register_page[\s\S]*to authenticated, service_role/)
})
