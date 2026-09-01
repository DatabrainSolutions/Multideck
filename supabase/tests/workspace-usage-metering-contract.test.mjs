import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const testsDirectory = path.dirname(fileURLToPath(import.meta.url))
const supabaseDirectory = path.resolve(testsDirectory, "..")
const functionsDirectory = path.join(supabaseDirectory, "functions")
const read = (relativePath) => readFile(path.join(supabaseDirectory, relativePath), "utf8")

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : []
  }))
  return files.flat()
}

const [migration, adminUsageMigration, developerBroadcast, gateway, transcription] = await Promise.all([
  read("migrations/20260830220000_complete_workspace_ai_usage_metering.sql"),
  read("migrations/20260826190000_admin_usage_categories.sql"),
  read("functions/developer-broadcasts/index.ts"),
  read("functions/_shared/model-gateway.ts"),
  read("functions/transcription/index.ts"),
])

test("every OpenAI Responses call is routed through the governed workspace ledger", async () => {
  const files = await sourceFiles(functionsDirectory)
  const directCallers = []
  for (const file of files) {
    const source = await readFile(file, "utf8")
    if (!source.includes("https://api.openai.com/v1/responses")) continue
    if (file.endsWith(path.join("_shared", "model-gateway.ts"))) continue
    if (!/governedModelFetch|beginGovernedModelFetch/.test(source)) {
      directCallers.push(path.relative(functionsDirectory, file))
    }
  }
  assert.deepEqual(directCallers, [])
  assert.match(developerBroadcast, /purpose: "developer_broadcast"/)
  assert.match(developerBroadcast, /companyId: current\.Company_ID, userId: current\.User_ID/)
  assert.match(gateway, /"developer_broadcast"/)
})

test("successful Gemini transcription contributes to the same workspace AI bar", () => {
  assert.match(migration, /v_usage := round\(coalesce\(v_openai_usage, 0\) \+ coalesce\(v_transcription_usage, 0\), 6\)/)
  assert.match(migration, /"TranscriptionUsage_Status" = 'succeeded'/)
  assert.match(migration, /where p_category = 'ai'/)
  assert.match(migration, /"TranscriptionUsage_EstimatedCostGbp" as usage/)
  assert.match(migration, /TR_AI_TranscriptionUsage_usage_watch/)
  assert.match(migration, /_multideck_emit_usage_watch_signal[\s\S]*'ai'/)
  assert.match(transcription, /outcome = "succeeded"[\s\S]*const text = readTranscriptText/)
})

test("transcription reserves against both the operator guardrail and pooled workspace allowance", () => {
  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(p_company_id::text, 719\)\)/)
  assert.match(migration, /v_workspace_state := public\._multideck_dexter_allowance_state\(p_company_id\)/)
  assert.match(migration, /v_workspace_reserved \+ v_cost > v_workspace_remaining/)
  assert.match(migration, /TRANSCRIPTION_ALLOWANCE_REACHED/)
})

test("other product units keep provider-truthful completion boundaries", () => {
  assert.match(adminUsageMigration, /render_job\."DOCBRJ_StatusCode" = 'completed'/)
  assert.match(adminUsageMigration, /lower\(render_job\."DOCBRJ_RenderEngineCode"\) = 'carbone'/)
  assert.match(adminUsageMigration, /egress\."AIDexterEgress_Outcome" = 'succeeded'/)
  assert.match(adminUsageMigration, /count\(distinct submission\."ICUSS_CustomsID"\)/)
  assert.match(adminUsageMigration, /submission\."ICUSS_SubmittedAt" >= v_period_start/)
  assert.match(adminUsageMigration, /'dataState', 'not_connected'/)
})
