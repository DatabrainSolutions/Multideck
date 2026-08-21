import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { requiresExplicitActionApproval } from "../functions/agent-dexter/email-approval.mjs"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, bookingEdge, quoteEdge, quoteClient, bookingClient, dexterEdge, quoteWorkflowCore, quoteWorkflowEdge] = await Promise.all([
  read("supabase/migrations/20260820194356_quote_booking_customs_security_hardening.sql"),
  read("supabase/functions/bookings-workflow/index.ts"),
  read("supabase/functions/quote-response/index.ts"),
  read("multideck.client/src/lib/quote-response-api.ts"),
  read("multideck.client/src/lib/booking-workflow-api.ts"),
  read("supabase/functions/agent-dexter/index.ts"),
  read("supabase/functions/quotes-workflow/core.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
])

test("email sends always require the operator's final approval", () => {
  assert.match(dexterEdge, /requiresExplicitActionApproval\(actionCode, input\.accessMode\)/)
  assert.match(dexterEdge, /Sending email is the exception: always prepare the exact message/)
  assert.equal(requiresExplicitActionApproval("send_email", "full"), true)
  assert.equal(requiresExplicitActionApproval("create_email_draft", "full"), false)
})

test("Customs access is assignee, mapped department or privileged-role scoped", () => {
  assert.match(migration, /lower\(role\."sys_UserRole_Name"\) in \('company user', 'operator'\)/)
  assert.match(migration, /declaration\."CUST_AssignedUserID" = caller\."User_ID"/)
  assert.match(migration, /membership\."Department_ID" = declaration\."CUST_OwnerDepartmentID"/)
  assert.match(migration, /'administrator', 'company manager', 'operations manager'/)
  assert.match(migration, /caller\."Company_ID" = declaration_creator\."Company_ID"/)
})

test("booking uploads are idempotent, rate limited, quota checked and atomically finalised", () => {
  assert.match(migration, /UX_Job_Documents_job_type_one_current/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /Too many document uploads/)
  assert.match(migration, /5368709120/)
  assert.match(migration, /\/slot-a.*\/slot-b/s)
  assert.match(bookingClient, /idempotencyKey", crypto\.randomUUID\(\)/)
  assert.match(bookingEdge, /booking_workflow_reserve_document_upload/)
  assert.match(bookingEdge, /booking_workflow_complete_document_upload/)
  assert.match(bookingEdge, /storage\.from\(documentBucket\)\.remove\(\[blobName\]\)/)
})

test("public quote uploads are token scoped and bounded to two replacement slots", () => {
  assert.match(migration, /customer_response_upload_one_pending_idx/)
  assert.match(migration, /Too many attachment uploads/)
  assert.match(migration, /requested_token_hash text/)
  assert.match(migration, /response_origin is distinct from requested_response_origin/)
  assert.match(migration, /\/slot-a.*\/slot-b/s)
  assert.match(quoteClient, /idempotencyKey", crypto\.randomUUID\(\)/)
  assert.match(quoteEdge, /quote_customer_response_reserve_upload/)
  assert.match(quoteEdge, /quote_customer_response_complete_upload/)
  assert.match(quoteEdge, /upsert: true/)
})

test("quote issue options and preview actions are present in the release source", () => {
  assert.match(quoteWorkflowCore, /"issue-options"/)
  assert.match(quoteWorkflowCore, /"issue-draft"/)
  assert.match(quoteWorkflowEdge, /if \(action === "issue-options"\)/)
  assert.match(quoteWorkflowEdge, /if \(action === "issue-draft"\)/)
  assert.match(quoteWorkflowEdge, /previewHtml: preview\.html/)
  assert.match(quoteWorkflowEdge, /CusQuoteHeader_ContactEmailSnapshot/)
  assert.match(quoteWorkflowEdge, /key: `quote:\$\{quoteId\}`/)
})
