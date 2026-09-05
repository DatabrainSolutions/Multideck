import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, reconciliation, workflow, page, api] = await Promise.all([
  read("supabase/migrations/20260903120000_quote_draft_version_lifecycle.sql"),
  read("supabase/migrations/20260904110000_quote_version_foundation_reconciliation.sql"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
])

test("quote versions distinguish mutable drafts from submitted evidence", () => {
  assert.match(migration, /add column if not exists "CusQuoteVersion_IsSubmitted" boolean not null default false/)
  assert.match(migration, /Submitted quote versions are immutable\./)
  assert.match(migration, /new\."CusQuoteVersion_SnapshotJSON" is distinct from old\."CusQuoteVersion_SnapshotJSON"/)
  assert.match(migration, /or not new\."CusQuoteVersion_IsSubmitted"/)
  assert.match(migration, /new\."CusQuoteVersion_SubmittedAt" is distinct from old\."CusQuoteVersion_SubmittedAt"/)
  assert.match(migration, /new\."CusQuoteVersion_SubmittedBy" is distinct from old\."CusQuoteVersion_SubmittedBy"/)
  assert.match(migration, /revoke delete on table public\."CusQuote_Versions" from public, anon, authenticated, service_role/)
  assert.match(migration, /version\."CusQuoteVersion_StatusCode" in \('sent', 'accepted', 'declined'\)/)
  assert.match(migration, /alter function quote_api\.save_quote\(uuid, uuid, jsonb\)\s+rename to save_quote_legacy_20260903/)
  assert.match(migration, /'versionState', 'draft'/)
  assert.match(migration, /TR_CusQuote_ResponseLinks_mark_version_submitted/)
  assert.match(reconciliation, /quote_versions_to_remove/)
  assert.match(reconciliation, /not version\."CusQuoteVersion_IsSubmitted"\s+and not version\."CusQuoteVersion_IsCurrent"/)
  assert.match(reconciliation, /quote_version_resequence/)
  assert.match(reconciliation, /'readiness', booking_api\.quote_readiness\(saved_quote_id\)/)
  assert.match(reconciliation, /'CusQuoteVersion_IsSubmitted', version\."CusQuoteVersion_IsSubmitted"/)
})

test("customer change requests have a distinct operator-facing lifecycle", () => {
  assert.match(migration, /else 'changes_requested'/)
  assert.match(migration, /TR_CusQuote_CustomerResponses_sync_quote_state/)
  assert.match(migration, /"CusQuoteHeader_LifecycleCode" in \('accepted', 'changes_requested'\)/)
  assert.match(page, /lifecycle === "changes_requested"\) return \{ status: "Changes requested", tone: "amber" \}/)
  assert.match(page, /"Working draft"/)
  assert.match(page, /t\("Submitted versions are read-only\. One working draft can remain in progress\."\)/)
  assert.match(page, /t\("Choose quote version"\)/)
  assert.match(page, /createNewQuoteVersion\("copy"\)/)
  assert.match(page, /createNewQuoteVersion\("blank"\)/)
  assert.match(page, /editable=\{workspaceEditable\}/)
})

test("the client understands the persisted submission metadata", () => {
  assert.match(api, /CusQuoteVersion_IsSubmitted\?: boolean/)
  assert.match(api, /CusQuoteVersion_SubmittedAt\?: string \| null/)
  assert.match(api, /versionState\?: "draft" \| "submitted"/)
  assert.match(api, /CusQuoteVersion_SnapshotJSON\?:/)
  assert.match(workflow, /CusQuoteVersion_IsSubmitted,CusQuoteVersion_CreatedAt,CusQuoteVersion_SubmittedAt/)
  assert.match(workflow, /CusQuoteVersion_IsSubmitted\.eq\.true,CusQuoteVersion_IsCurrent\.eq\.true/)
})
