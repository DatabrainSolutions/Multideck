import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/documents.ts", import.meta.url), "utf8")
const edge = readFileSync(new URL("../functions/warehouse/index.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-order-detail.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-order-documents-paging.mjs", import.meta.url), "utf8")

test("order files are fetched as capped server pages", () => {
  assert.match(edge, /handleDocuments\(request, path, url, admin, actor\)/)
  assert.match(route, /boundedPage\(url, 20, 50\)/)
  assert.match(route, /\.range\(offset, offset \+ limit\)/)
  assert.match(route, /const documents = candidates\.slice\(0, limit\)/)
  assert.match(route, /hasMore: candidates\.length > limit/)
  assert.match(route, /PortalUpload_TargetID,PortalUpload_FileName,PortalUpload_MimeType,PortalUpload_FileSizeBytes/)
})

test("one file action loads only that exact document and upload", () => {
  assert.match(route, /\.eq\("WMSDocument_ID", documentId\)[\s\S]*\.eq\("WMSDocument_OrderID", orderId\)[\s\S]*\.limit\(1\)/)
  assert.match(route, /\.eq\("PortalUpload_TargetID", documentId\)[\s\S]*\.limit\(1\)/)
  assert.doesNotMatch(route, /documents\.find\(/)
})

test("the detail screen appends bounded pages on demand", () => {
  assert.match(client, /listWarehouseOrderDocuments\(orderId:[\s\S]*limit = Math\.max\(1, Math\.min\(options\.limit \?\? 20, 50\)\)/)
  assert.match(client, /documents\$\{toQuery\(\{ limit, offset \}\)\}/)
  assert.match(ui, /listWarehouseOrderDocuments\(order\.id, \{ offset: documents\.length \}\)/)
  assert.match(ui, /setDocuments\(\(current\) => \[\.\.\.new Map/)
  assert.match(ui, /Load more files/)
})

test("the 100,000-file proof remains local-only", () => {
  assert.match(benchmark, /documentsCount = 100_000/)
  assert.match(benchmark, /pageSize = 20/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
