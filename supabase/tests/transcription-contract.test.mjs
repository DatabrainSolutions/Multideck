import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [migration, edgeFunction, contract, config, dexterPrompt, boundary, clientApi] = await Promise.all([
  read("../migrations/20260826214719_app_wide_gemini_dictation.sql"),
  read("../functions/transcription/index.ts"),
  read("../functions/transcription/contract.ts"),
  read("../config.toml"),
  read("../functions/agent-dexter/index.ts"),
  read("../functions/transcription/DEXTER_CAPABILITY_BOUNDARY.md"),
  read("../../multideck.client/src/lib/transcription-api.ts"),
])

test("Gemini smart transcription stays server-side and uses the current Interactions contract", () => {
  assert.match(edgeFunction, /Deno\.env\.get\("GEMINI_API_KEY"\)/)
  assert.match(contract, /gemini-3\.5-transcribe/)
  assert.match(edgeFunction, /generativelanguage\.googleapis\.com\/v1beta\/interactions/)
  assert.match(edgeFunction, /store: false/)
  assert.match(edgeFunction, /language_codes: \[\]/)
  assert.match(edgeFunction, /mode: \{ type: "smart" \}/)
  assert.match(edgeFunction, /custom_vocabulary: customVocabulary/)
  assert.doesNotMatch(clientApi, /GEMINI_API_KEY|generativelanguage\.googleapis\.com/)
  assert.match(config, /\[functions\.transcription\][\s\S]*verify_jwt = true/)
})

test("the transcript reader accepts both SDK and REST Interactions response shapes", () => {
  assert.match(contract, /typeof value\.output_text === "string"/)
  assert.match(contract, /Array\.isArray\(value\.steps\)/)
  assert.match(contract, /step\.type === "model_output"/)
  assert.match(contract, /content\.type === "text"/)
})

test("custom vocabulary and recording bounds stay deterministic", () => {
  assert.match(contract, /maximumRecordingSeconds = 180/)
  assert.match(contract, /maximumVocabularyTerms = 100/)
  assert.match(contract, /seen\.has\(key\)/)
  assert.match(contract, /durationMs < 250 \|\| durationMs > maximumRecordingSeconds \* 1000/)
})

test("custom vocabulary is private to the authenticated operator", () => {
  assert.match(migration, /TranscriptionPreference_UserID" uuid primary key[\s\S]*references public\."cmp_Users" \("User_ID"\) on delete cascade/)
  assert.match(migration, /revoke all on table public\."AI_TranscriptionPreferences" from public, anon, authenticated/)
  assert.match(edgeFunction, /\.eq\("Auth_User_ID", authData\.user\.id\)/)
  assert.match(edgeFunction, /\.eq\("TranscriptionPreference_UserID", workspaceUser\.User_ID\)/)
  assert.match(edgeFunction, /TranscriptionPreference_UserID: workspaceUser\.User_ID/)
  assert.match(edgeFunction, /onConflict: "TranscriptionPreference_UserID"/)
  assert.doesNotMatch(edgeFunction, /body\.(?:userId|user_id|User_ID)/)
})

test("the monthly allowance is hidden behind an atomic service-only reservation", () => {
  assert.match(migration, /TranscriptionPolicy_MonthlyAllowanceGbp" numeric\(10, 6\) not null default 2\.000000/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /TRANSCRIPTION_ALLOWANCE_REACHED/)
  assert.match(migration, /revoke all on table public\."AI_TranscriptionUsagePolicies" from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_transcription_reserve[\s\S]*to service_role/)
  assert.match(edgeFunction, /Contact your administrator to increase transcription model usage\./)
  assert.doesNotMatch(clientApi, /2\.00|£2|MonthlyAllowanceGbp/)
})

test("provider-accepted no-speech requests remain inside the allowance", () => {
  const providerSuccess = edgeFunction.indexOf('outcome = "succeeded"')
  const transcriptRead = edgeFunction.indexOf("const text = readTranscriptText(providerBody)")
  const noSpeechFailure = edgeFunction.indexOf('errorCode = "empty_transcript"')
  assert.ok(providerSuccess > 0)
  assert.ok(providerSuccess < transcriptRead)
  assert.ok(transcriptRead < noSpeechFailure)
})

test("audio and transcript content are transient and Dexter states the explicit exception", () => {
  assert.doesNotMatch(migration, /TranscriptionUsage_(?:Audio|Transcript)/)
  assert.match(migration, /Audio and transcript text are never stored/)
  assert.match(dexterPrompt, /App-wide dictation and transcription preferences are input assistance/)
  assert.match(dexterPrompt, /Settings > Dexter > Transcription/)
  assert.match(boundary, /no \*\*Watching for you\*\* adapter/i)
  assert.match(boundary, /no recurring LLM calls/)
})
