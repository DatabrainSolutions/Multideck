import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260819125000_inbox_thread_slice_paging.sql", import.meta.url), "utf8")
const runtime = await readFile(new URL("../functions/inbox-api/runtime.ts", import.meta.url), "utf8")
const core = await readFile(new URL("../functions/inbox-api/core.ts", import.meta.url), "utf8")

test("folder-aware thread slices are private, indexed and trigger-maintained", () => {
  assert.match(migration, /create table if not exists public\."Comm_InboxThreadSlices"/)
  assert.match(migration, /alter table public\."Comm_InboxThreadSlices" enable row level security/)
  assert.match(migration, /revoke all on table public\."Comm_InboxThreadSlices" from public, anon, authenticated/)
  assert.match(migration, /"CommInboxSlice_MailboxID"[\s\S]+"CommInboxSlice_Key"[\s\S]+"CommInboxSlice_LastMessageAt" desc[\s\S]+"CommInboxSlice_ThreadID"/)
  assert.match(migration, /TR_Comm_Messages_inbox_thread_slices/)
  assert.match(migration, /TR_Comm_MessageFolders_inbox_thread_slices/)
  assert.match(migration, /pg_advisory_xact_lock/)
})

test("the list RPC uses service-role keyset paging and visible-page hydration", () => {
  assert.match(migration, /create or replace function public\.comm_inbox_thread_slice_page/)
  assert.match(migration, /CommMailboxAccess_CanRead/)
  assert.match(migration, /permission\."sys_Permission_Value" = 'Email\.Read'/)
  assert.match(migration, /CommInboxSlice_LastMessageAt" < p_after_at/)
  assert.match(migration, /limit v_limit \+ 1/)
  assert.match(migration, /visible as materialized/)
  assert.match(migration, /revoke all on function public\.comm_inbox_thread_slice_page\([\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.comm_inbox_thread_slice_page\([\s\S]+to service_role/)
})

test("Edge uses the new path safely and retains compatibility fallbacks", () => {
  assert.match(core, /export function decodeThreadCursor/)
  assert.match(core, /lastMessageAt/)
  assert.match(core, /afterThreadId/)
  assert.match(runtime, /admin\.rpc\("comm_inbox_thread_slice_page"/)
  assert.match(runtime, /const canUseSlicePage = !query && folder !== "drafts" && !cursor\.legacyOffset/)
  assert.match(runtime, /missingInboxReadModel\(paged\.error\).*legacyPage\(\)/s)
  assert.match(runtime, /encodeCursor\(\{ lastMessageAt: nextLastMessageAt, threadId: nextThreadId \}\)/)
})

test("the internal read-model change documents Dexter and watch parity", () => {
  assert.match(migration, /identical Inbox and Dexter[\s\S]+no new write action or watch signal/)
})
