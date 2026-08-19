import { performance } from "node:perf_hooks"

const documentsCount = 100_000
const pageSize = 20
const warmups = 2
const runs = 9

const documents = Array.from({ length: documentsCount }, (_, index) => ({
  id: `document-${String(documentsCount - index).padStart(6, "0")}`,
  orderId: "order-proof",
  title: `Warehouse file ${documentsCount - index}`,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, documentsCount - index)).toISOString(),
}))
const uploads = new Map(documents.map((document, index) => [document.id, {
  fileName: `proof-${index}.pdf`,
  mimeType: "application/pdf",
  fileSizeBytes: 10_000 + index,
}]))

function fullOrderFileLoad() {
  return [...documents]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((document) => ({ ...document, ...uploads.get(document.id) }))
}

function boundedOrderFilePage(offset = 0) {
  return documents
    .slice(offset, offset + pageSize)
    .map((document) => ({ ...document, ...uploads.get(document.id) }))
}

function measure(task) {
  const started = performance.now()
  const rows = task()
  return { durationMs: performance.now() - started, rows: rows.length }
}

for (let index = 0; index < warmups; index += 1) {
  fullOrderFileLoad()
  boundedOrderFilePage()
}

const full = Array.from({ length: runs }, () => measure(fullOrderFileLoad))
const bounded = Array.from({ length: runs }, () => measure(boundedOrderFilePage))
const median = (samples) => [...samples].sort((left, right) => left.durationMs - right.durationMs)[Math.floor(samples.length / 2)]
const fullMedian = median(full)
const boundedMedian = median(bounded)

console.log(JSON.stringify({
  scenario: "warehouse order files at 100,000 rows",
  fixture: { documents: documentsCount, pageSize },
  before: fullMedian,
  after: boundedMedian,
  speedup: Number((fullMedian.durationMs / Math.max(boundedMedian.durationMs, 0.0001)).toFixed(1)),
  transferred_row_reduction: Number((fullMedian.rows / boundedMedian.rows).toFixed(1)),
  supabase_writes: 0,
}, null, 2))
