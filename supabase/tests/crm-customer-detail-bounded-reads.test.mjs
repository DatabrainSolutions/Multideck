import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const functionSource = fs.readFileSync(path.join(root, "supabase/functions/customers/index.ts"), "utf8")
const migrationSource = fs.readFileSync(path.join(root, "supabase/migrations/20260818156000_crm_customer_detail_bounded_reads.sql"), "utf8")

test("customer detail delegates recent email and contact activity candidate reads to bounded RPCs", () => {
  assert.match(functionSource, /admin\.rpc\("multideck_crm_customer_recent_emails"/)
  assert.match(functionSource, /admin\.rpc\("multideck_crm_contact_activity_page"/)
  assert.doesNotMatch(functionSource, /from\("Comm_MessageRecipients"\)\.select\("CommRecipient_MessageID"\)/)
  assert.doesNotMatch(functionSource, /from\("Comm_Messages"\)\.select\("CommMessage_ID"\)\.in\("CommMessage_ThreadID"/)
  assert.doesNotMatch(functionSource, /from\("CRM_ActivityParticipants"\)\.select\("CRMActPart_ActivityID"\)/)
})

test("customer detail RPCs preserve permission checks, deterministic ordering, and hard limits", () => {
  assert.match(migrationSource, /create or replace function public\.multideck_crm_customer_recent_emails\(/)
  assert.match(migrationSource, /create or replace function public\.multideck_crm_contact_activity_page\(/)
  assert.match(migrationSource, /_multideck_crm_has_permission\(p_user_id, 'Email\.Read'\)/)
  assert.match(migrationSource, /_multideck_crm_has_permission\(p_user_id, 'Customers\.Read'\)/)
  assert.match(migrationSource, /limit v_limit/)
  assert.match(migrationSource, /order by occurred_at desc nulls last, message\."CommMessage_ID" desc/)
  assert.match(migrationSource, /order by activity\."CRMActivity_ActivityAt" desc nulls last, activity\."CRMActivity_ID" desc/)
  assert.match(migrationSource, /revoke all on function public\.multideck_crm_customer_recent_emails\([^;]+ from public, anon, authenticated;/s)
  assert.match(migrationSource, /revoke all on function public\.multideck_crm_contact_activity_page\([^;]+ from public, anon, authenticated;/s)
  assert.match(migrationSource, /grant execute on function public\.multideck_crm_customer_recent_emails\([^;]+ to service_role;/s)
  assert.match(migrationSource, /grant execute on function public\.multideck_crm_contact_activity_page\([^;]+ to service_role;/s)
})

test("recent email RPC retains the existing customer detail item contract", () => {
  for (const field of ["id", "threadId", "direction", "subject", "preview", "occurredAt", "contactName", "contactEmail", "hasAttachments"]) {
    assert.match(migrationSource, new RegExp(`'${field}'`))
  }
  assert.match(migrationSource, /'available', true/)
  assert.match(migrationSource, /'items', coalesce\(jsonb_agg\(/)
})
