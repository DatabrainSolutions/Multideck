import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const mailboxRecords = 100_000
const conversationMessages = 5_000
const pageSize = 50
const warmups = 2
const runs = 9
const operationsPerSample = 3
const variant = process.env.DEXTER_CONVERSATION_BENCHMARK_VARIANT

if (!new Set(["legacy", "bounded"]).has(variant)) {
  throw new Error("Set DEXTER_CONVERSATION_BENCHMARK_VARIANT to legacy or bounded.")
}

const pad = (value, width = 6) => String(value).padStart(width, "0")
const baseTime = Date.UTC(2026, 7, 19, 11, 0, 0)
const messages = Array.from({ length: conversationMessages }, (_, index) => ({
  id: `00000000-0000-4000-8000-${pad(index, 12)}`,
  role: index % 2 ? "assistant" : "user",
  content: `${index % 2 ? "Dexter answer" : "Operator request"} ${pad(index)} ${"freight context ".repeat(90)}`,
  createdAt: new Date(baseTime - (conversationMessages - index) * 1_000).toISOString(),
  specialist: index % 2 ? "booking" : null,
  attachments: [],
  parentResponseMessageId: null,
  pendingAction: null,
  reasoningSummary: index % 2 ? "Checked the permitted workspace evidence." : null,
  emailAttachments: [],
  emailDraft: null,
  responseToUserMessageId: null,
  responseVersion: index % 2 ? 1 : null,
}))

const visible = messages.slice(-pageSize)
const conversation = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Large freight investigation",
  summary: "A deliberately long Dexter conversation.",
  updatedAt: new Date(baseTime).toISOString(),
}
const legacyPayload = JSON.stringify({ conversation: { ...conversation, messages } })
const boundedPayload = JSON.stringify({
  conversation: {
    ...conversation,
    messages: visible,
    messageTotal: conversationMessages,
    messageOffset: 0,
    messageLimit: pageSize,
    hasOlderMessages: true,
  },
})
const oracleSignature = JSON.stringify(visible)

function consumeLegacy() {
  const payload = JSON.parse(legacyPayload)
  const selected = payload.conversation.messages.slice(-pageSize)
  return {
    messages: selected,
    total: payload.conversation.messages.length,
    payloadBytes: Buffer.byteLength(legacyPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const payload = JSON.parse(boundedPayload)
  return {
    messages: payload.conversation.messages,
    total: payload.conversation.messageTotal,
    payloadBytes: Buffer.byteLength(boundedPayload),
    heap: process.memoryUsage().heapUsed,
  }
}

function assertCorrect(value) {
  if (JSON.stringify(value.messages) !== oracleSignature) throw new Error("The newest visible Dexter messages changed.")
  if (value.total !== conversationMessages) throw new Error("The conversation message total changed.")
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    mean_ms: mean,
    min_ms: sorted[0],
    max_ms: sorted.at(-1),
    cv: Math.sqrt(variance) / mean,
    samples_ms: values,
  }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertCorrect(consume())

const samples = []
const memory = []
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

const timing = stats(samples)
const memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Dexter conversation history browser data pipeline",
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, RLS, rendering or public-network latency. It models one 5,000-message conversation within a 100,000-message workspace source.",
  mailbox_records: mailboxRecords,
  conversation_messages: conversationMessages,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  correctness: "PASS: the same newest 50 messages and exact 5,000-message total are retained.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.DEXTER_CONVERSATION_BENCHMARK_OUTPUT) {
  writeFileSync(process.env.DEXTER_CONVERSATION_BENCHMARK_OUTPUT, output, "utf8")
}
console.log(output.trimEnd())
