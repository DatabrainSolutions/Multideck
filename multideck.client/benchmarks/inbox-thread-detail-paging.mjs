import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const mailboxRecordCount = 100_000
const hotThreadMessageCount = 5_000
const detailPageSize = 25
const warmups = 2
const runs = 9
const operationsPerSample = 3
const variant = process.env.INBOX_THREAD_BENCHMARK_VARIANT
const workload = process.env.INBOX_THREAD_BENCHMARK_WORKLOAD ?? "thread-open"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set INBOX_THREAD_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["global-prefetch", "thread-open"]).has(workload)) throw new Error(`Unknown Inbox workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 9, 0, 0)
const threadMessages = Array.from({ length: hotThreadMessageCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  threadId: "30000000-0000-4000-8000-000000000001",
  mailboxId: "40000000-0000-4000-8000-000000000001",
  direction: index % 2 ? "inbound" : "outbound",
  from: [{ address: index % 2 ? "customer@example.com" : "operator@example.com", displayName: index % 2 ? "Customer" : "Operator" }],
  to: [{ address: index % 2 ? "operator@example.com" : "customer@example.com", displayName: index % 2 ? "Operator" : "Customer" }],
  cc: [],
  bcc: [],
  subject: "Shipment exception and revised delivery plan",
  sentAt: new Date(baseTime - (hotThreadMessageCount - index) * 60_000).toISOString(),
  receivedAt: new Date(baseTime - (hotThreadMessageCount - index) * 60_000).toISOString(),
  bodyText: `Message ${pad(index)} ${"Operational update and supporting customer context. ".repeat(18)}`,
  sanitizedHtml: `<p>Message ${pad(index)} ${"Operational update and supporting customer context. ".repeat(18)}</p>`,
  replyEligible: true,
  attachments: index % 20 === 0 ? [{ id: `attachment-${index}`, fileName: `evidence-${index}.pdf`, mimeType: "application/pdf", sizeBytes: 182000, isInline: false, contentId: null, scanStatus: "clean" }] : [],
}))

const threadBase = {
  id: threadMessages[0].threadId,
  mailboxId: threadMessages[0].mailboxId,
  subject: threadMessages.at(-1).subject,
  starred: false,
  archived: false,
  unreadCount: 3,
  readOnly: false,
  summary: { status: "none", text: null, keyPoints: [], sourceMessageIds: [], model: null, updatedAt: null, error: null },
}
const legacyDetailWire = JSON.stringify({ ...threadBase, messages: threadMessages })
const boundedDetailWire = JSON.stringify({
  ...threadBase,
  messages: threadMessages.slice(-detailPageSize),
  messageTotal: hotThreadMessageCount,
  messageOffset: 0,
  messageLimit: detailPageSize,
  hasOlderMessages: true,
})
const listWire = JSON.stringify({
  items: Array.from({ length: 25 }, (_, index) => ({ id: `thread-${index}`, subject: `Conversation ${index}`, preview: "Latest message preview", messageCount: 8 })),
  hasMore: true,
  nextCursor: "25",
})
const oracleMessages = JSON.stringify(threadMessages.slice(-detailPageSize))
const oracleList = JSON.stringify(JSON.parse(listWire))

function consumeLegacy() {
  if (workload === "global-prefetch") {
    const list = JSON.parse(listWire)
    for (let index = 0; index < 3; index += 1) JSON.parse(legacyDetailWire)
    return { result: list, payloadBytes: Buffer.byteLength(listWire) + Buffer.byteLength(legacyDetailWire) * 3, requestCount: 4, heap: process.memoryUsage().heapUsed }
  }
  const detail = JSON.parse(legacyDetailWire)
  return { result: detail.messages.slice(-detailPageSize), payloadBytes: Buffer.byteLength(legacyDetailWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function consumeBounded() {
  if (workload === "global-prefetch") {
    const list = JSON.parse(listWire)
    return { result: list, payloadBytes: Buffer.byteLength(listWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
  }
  const detail = JSON.parse(boundedDetailWire)
  return { result: detail.messages, payloadBytes: Buffer.byteLength(boundedDetailWire), requestCount: 1, heap: process.memoryUsage().heapUsed }
}

function assertCorrect(value) {
  const signature = JSON.stringify(value.result)
  if (workload === "global-prefetch" ? signature !== oracleList : signature !== oracleMessages) throw new Error(`${workload}: visible Inbox output changed.`)
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return { median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1], mean_ms: mean, min_ms: sorted[0], max_ms: sorted.at(-1), cv: Math.sqrt(variance) / mean, samples_ms: values }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertCorrect(consume())
const samples = [], memory = []
let representative
for (let run = 0; run < runs; run += 1) {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  for (let operation = 0; operation < operationsPerSample; operation += 1) {
    representative = consume()
    assertCorrect(representative)
  }
  samples.push((performance.now() - startedAt) / operationsPerSample)
  memory.push(Math.max(representative.heap - heapBefore, 0))
}

const timing = stats(samples), memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Inbox global prefetch and conversation detail browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, provider APIs, RLS, rendering or public-network latency. The mailbox scale is 100,000 messages; the deliberately hot thread contains 5,000.",
  mailbox_record_count: mailboxRecordCount,
  hot_thread_message_count: hotThreadMessageCount,
  detail_page_size: detailPageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the visible thread list or newest 25 conversation messages match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.INBOX_THREAD_BENCHMARK_OUTPUT) writeFileSync(process.env.INBOX_THREAD_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
