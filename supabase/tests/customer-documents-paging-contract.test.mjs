import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const shared = readFileSync(new URL("supabase/functions/_shared/customer-documents.ts", root), "utf8")
const edge = readFileSync(new URL("supabase/functions/customer-documents/index.ts", root), "utf8")
const client = readFileSync(new URL("multideck.client/src/lib/customer-api.ts", root), "utf8")
const page = readFileSync(new URL("multideck.client/src/pages/customer-detail-page.tsx", root), "utf8")

test("customer documents are counted and paged at Supabase", () => {
  assert.match(shared, /Math\.max\(1, Math\.min\(Math\.trunc\(Number\(input\.limit\) \|\| 20\), 50\)\)/)
  assert.match(shared, /select\("\*", \{ count: "exact" \}\)/)
  assert.match(shared, /\.range\(offset, offset \+ limit - 1\)/)
  assert.match(shared, /total: count \?\? 0/)
  assert.match(edge, /limit: Number\(params\.get\("limit"\) \|\| 20\)/)
})

test("the customer detail screen requests and navigates one document page", () => {
  assert.match(client, /listCustomerDocuments\(customerId: string, options:/)
  assert.match(client, /URLSearchParams\(\{ customerId, limit: String\(limit\), offset: String\(offset\) \}\)/)
  assert.match(page, /listCustomerDocuments\(customerId, \{ limit: documentPageSize, offset: \(documentPage - 1\) \* documentPageSize \}\)/)
  assert.match(page, /onLimitChange=\{setDocumentPageSize\}/)
  assert.match(page, /<Pagination[\s\S]*totalItems=\{total\}/)
})
