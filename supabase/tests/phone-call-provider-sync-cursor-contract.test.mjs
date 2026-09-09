import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = new URL(
  "../migrations/20260823075559_phone_call_provider_sync_cursors.sql",
  import.meta.url,
)
const migration = await readFile(migrationPath, "utf8")

function sourceSection(start, end) {
  const startIndex = migration.indexOf(start)
  const endIndex = migration.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `Missing source section start: ${start}`)
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`)
  return migration.slice(startIndex, endIndex)
}

const claim = sourceSection(
  "create or replace function public.multideck_phone_call_provider_sync_claim(",
  "create or replace function public.multideck_phone_call_provider_sync_commit(",
)
const commit = sourceSection(
  "create or replace function public.multideck_phone_call_provider_sync_commit(",
  "create or replace function public.multideck_phone_call_provider_sync_fail(",
)
const fail = sourceSection(
  "create or replace function public.multideck_phone_call_provider_sync_fail(",
  "revoke all on function public._multideck_phone_call_redact_sync_error(text)",
)

test("provider cursors are unique per company, provider and source", () => {
  assert.match(migration, /create table if not exists public\."Comm_CallProviderSyncCursors"/)
  assert.match(
    migration,
    /"UX_Comm_CallProviderSyncCursors_source" unique \([\s\S]*"CommCallSyncCursor_CompanyID"[\s\S]*"CommCallSyncCursor_ProviderCode"[\s\S]*"CommCallSyncCursor_SourceKey"/,
  )
  assert.match(migration, /jsonb_typeof\("CommCallSyncCursor_CheckpointJSON"\) = 'object'/)
  assert.match(migration, /octet_length\("CommCallSyncCursor_CheckpointJSON"::text\) <= 8192/)
  assert.match(migration, /"CommCallSyncCursor_ProviderCode" in \('elevenlabs', 'twilio', '3cx'\)/)
  assert.match(migration, /CommCallSyncCursor_LeaseAcquiredAt" \+ interval '10 minutes'/)
})

test("cursor storage and RPCs are service-role only", () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(
    migration,
    /create policy "Service role manages provider sync cursors"[\s\S]*to service_role[\s\S]*using \(true\)[\s\S]*with check \(true\)/,
  )
  assert.match(
    migration,
    /revoke all on table public\."Comm_CallProviderSyncCursors"[\s\S]*from public, anon, authenticated;/,
  )
  assert.match(
    migration,
    /grant select on table public\."Comm_CallProviderSyncCursors"[\s\S]*to service_role;/,
  )
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete|all)[\s\S]{0,120}Comm_CallProviderSyncCursors/,
  )
  for (const signature of [
    "claim\\(uuid, text, text, integer\\)",
    "commit\\(uuid, text, text, uuid, jsonb\\)",
    "fail\\(uuid, text, text, uuid, text, text\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.multideck_phone_call_provider_sync_${signature}[\\s\\S]*from public, anon, authenticated;`),
    )
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.multideck_phone_call_provider_sync_${signature}[\\s\\S]*to service_role;`),
    )
  }
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,180}to authenticated/)
})

test("claim is atomic, company-scoped and uses an opaque bounded lease", () => {
  assert.match(claim, /security definer/)
  assert.match(claim, /set search_path = pg_catalog, public/)
  assert.match(claim, /v_lease_token uuid := gen_random_uuid\(\)/)
  assert.match(claim, /p_lease_seconds not between 15 and 600/)
  assert.match(claim, /on conflict \([\s\S]*CommCallSyncCursor_CompanyID[\s\S]*CommCallSyncCursor_ProviderCode[\s\S]*CommCallSyncCursor_SourceKey/)
  assert.match(claim, /cursor\."CommCallSyncCursor_CompanyID" = p_company_id/)
  assert.match(claim, /cursor\."CommCallSyncCursor_ProviderCode" = v_provider/)
  assert.match(claim, /cursor\."CommCallSyncCursor_SourceKey" = v_source_key/)
  assert.match(claim, /CommCallSyncCursor_LeaseExpiresAt" <= v_now/)
  assert.match(claim, /'checkpoint', v_cursor\."CommCallSyncCursor_CheckpointJSON"/)
})

test("commit advances the checkpoint only for the current company lease", () => {
  assert.match(commit, /security definer/)
  assert.match(commit, /jsonb_typeof\(p_checkpoint\) <> 'object'/)
  assert.match(commit, /octet_length\(p_checkpoint::text\) > 8192/)
  assert.match(commit, /CommCallSyncCursor_CheckpointJSON" = p_checkpoint/)
  assert.match(commit, /cursor\."CommCallSyncCursor_CompanyID" = p_company_id/)
  assert.match(commit, /cursor\."CommCallSyncCursor_ProviderCode" = v_provider/)
  assert.match(commit, /cursor\."CommCallSyncCursor_SourceKey" = v_source_key/)
  assert.match(commit, /cursor\."CommCallSyncCursor_LeaseToken" = p_lease_token/)
  assert.match(commit, /cursor\."CommCallSyncCursor_LeaseExpiresAt" > v_now/)
  assert.match(commit, /missing, expired, or no longer owned/)
})

test("failure retains the checkpoint and stores only bounded redacted diagnostics", () => {
  const failureSet = fail.slice(
    fail.indexOf("update public.\"Comm_CallProviderSyncCursors\" cursor"),
    fail.indexOf("returning cursor.\"CommCallSyncCursor_CheckpointJSON\" into v_checkpoint;"),
  )
  assert.notEqual(failureSet, "")
  assert.doesNotMatch(failureSet, /CommCallSyncCursor_CheckpointJSON"\s*=/)
  assert.match(fail, /_multideck_phone_call_redact_sync_error\(p_error_message\)/)
  assert.match(fail, /_multideck_phone_call_redact_sync_error\([\s\S]{0,120}p_error_code/)
  assert.match(fail, /left\([\s\S]*80/)
  assert.match(fail, /cursor\."CommCallSyncCursor_CompanyID" = p_company_id/)
  assert.match(fail, /cursor\."CommCallSyncCursor_ProviderCode" = v_provider/)
  assert.match(fail, /cursor\."CommCallSyncCursor_SourceKey" = v_source_key/)
  assert.match(fail, /cursor\."CommCallSyncCursor_LeaseToken" = p_lease_token/)
  assert.match(fail, /cursor\."CommCallSyncCursor_LeaseExpiresAt" > v_now/)
  assert.match(migration, /v_value text := left\(coalesce\(p_value, ''\), 2000\)/)
  assert.match(migration, /return left\(btrim\(v_value\), 500\)/)
  assert.match(migration, /\[redacted-email\]/)
  assert.match(migration, /\[redacted-phone\]/)
  assert.match(migration, /\[redacted-value\]/)
})
