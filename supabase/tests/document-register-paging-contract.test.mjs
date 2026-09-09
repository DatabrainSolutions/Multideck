import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const migration = read("supabase/migrations/20260819104000_document_register_paging.sql")
const edge = read("supabase/functions/document-builder-workspace/index.ts")
const client = read("multideck.client/src/lib/document-builder-api.ts")
const page = read("multideck.client/src/pages/documents-page.tsx")
const benchmark = read("multideck.client/benchmarks/document-register-paging.mjs")

test("Documents separates lightweight workspace metadata from generated history", () => {
  assert.match(migration, /create or replace function document_api\.workspace_overview/)
  assert.match(migration, /create or replace function document_api\.generated_documents_page/)
  assert.doesNotMatch(migration.match(/create or replace function document_api\.workspace_overview[\s\S]*?\$\$;/)?.[0] ?? "", /DOCB_GeneratedDocuments/)
  assert.match(edge, /Promise\.all\(\[/)
  assert.match(edge, /rpc\("workspace_overview"/)
  assert.match(edge, /rpc\("generated_documents_page"/)
})

test("generated document history is exact-count, searchable, sortable and capped", () => {
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/)
  assert.match(migration, /greatest\(coalesce\(p_offset, 0\), 0\)/)
  assert.match(migration, /select count\(\*\)[\s\S]*into total_count/)
  assert.match(migration, /DOCBGD_FileName" ilike/)
  assert.match(migration, /limit page_limit[\s\S]*offset page_offset/)
  assert.match(migration, /IX_DOCB_GeneratedDocuments_created/)
  assert.match(migration, /grant execute on function document_api\.generated_documents_page[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
})

test("Documents table requests active server pages and never slices a full workspace response", () => {
  assert.match(client, /getGeneratedDocumentsPage/)
  assert.match(client, /action: "documents"/)
  assert.match(client, /Paged document history is still being prepared/)
  assert.match(edge, /Paged document workspace data is still being prepared/)
  assert.doesNotMatch(client, /legacyGeneratedDocumentPage\(data, options\)/)
  assert.doesNotMatch(edge, /compatibilityPage\(legacy\.data/)
  assert.match(page, /window\.setTimeout\(\(\) => setDebouncedDocumentQuery\(documentQuery\.trim\(\)\), 250\)/)
  assert.match(page, /serverSorting=\{\{ value: documentSort/)
  assert.match(page, /pagination=\{\{ offset: documentOffset, limit: documentPageSize, total: generatedDocumentTotal/)
  assert.match(page, /onLimitChange: setDocumentPageSize/)
  assert.match(page, /getGeneratedDocumentsPage\(\{/)
})

test("Documents proof uses 100,000 local-only records and no Supabase writes", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /const legacyLimit = 50/)
  assert.match(benchmark, /const pageSize = 20/)
  assert.match(benchmark, /const warmups = 2/)
  assert.match(benchmark, /const runs = 31/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|(?:supabase|client)\.from\(|(?:supabase|client)\.rpc\(|insert\(|upsert\(/i)
})
