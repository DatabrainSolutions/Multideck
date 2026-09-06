import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, dexterParityMigration, workflow, pdf, page, api] = await Promise.all([
  read("supabase/migrations/20260904120100_quote_submission_document_boundary.sql"),
  read("supabase/migrations/20260904121000_quote_delivery_dexter_parity.sql"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/functions/_shared/quote-pdf.ts"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
])

test("quote submission is finalised only after confirmed delivery", () => {
  assert.match(migration, /quote_workflow_prepare_customer_response_v4/)
  assert.match(migration, /'revoked', requested_expires_at, null,[\s\S]*'pending'/)
  assert.doesNotMatch(
    migration.match(/create or replace function public\.quote_workflow_prepare_customer_response_v4[\s\S]*?\nend;\n\$\$;/)?.[0] ?? "",
    /CusQuoteVersion_IsSubmitted|CusQuoteHeader_LifecycleCode|status_code = 'revoked'.*where quote_id/s,
  )
  assert.match(migration, /quote_workflow_finalize_customer_response_v4/)
  assert.match(migration, /delivery_status_code = 'sent'/)
  assert.match(migration, /status_code = 'revoked', revoked_at = now\(\)[\s\S]*response_link_id <> link_row\.response_link_id/)
  assert.match(migration, /"CusQuoteHeader_LifecycleCode" = 'sent'/)
  assert.match(migration, /TR_CusQuote_ResponseLinks_mark_version_submitted[\s\S]*update of delivery_status_code, status_code/)
  assert.match(migration, /when \(new\.delivery_status_code = 'sent'/)
})

test("a failed send leaves the draft and previous customer link intact", () => {
  assert.match(migration, /quote_workflow_fail_customer_response_v4/)
  assert.match(migration, /delivery_status_code = 'failed'/)
  const failureFunction = migration.match(/create or replace function public\.quote_workflow_fail_customer_response_v4[\s\S]*?\nend;\n\$\$;/)?.[0] ?? ""
  assert.doesNotMatch(failureFunction, /CusQuoteVersion_IsSubmitted|CusQuoteHeader_LifecycleCode/)
  assert.match(workflow, /quote_workflow_prepare_customer_response_v4/)
  assert.match(workflow, /quote_workflow_bind_pending_customer_response_document_v4/)
  assert.match(workflow, /quote_workflow_finalize_customer_response_v4/)
  assert.match(workflow, /quote_workflow_fail_customer_response_v4/)
  assert.doesNotMatch(workflow, /quote_workflow_issue_customer_response_v3/)
  assert.doesNotMatch(workflow, /quote_workflow_disable_customer_response/)
  assert.match(workflow, /this quote version remains editable/)
})

test("successfully delivered version PDFs are retained and visible in Quote Documents", () => {
  assert.match(migration, /quote_workflow_quote_documents/)
  assert.match(migration, /link\.delivery_status_code = 'sent'/)
  assert.match(migration, /stored\."DOCStoredObject_ConcernCode" = 'quote'/)
  assert.match(migration, /office\."Company_ID" = app_company_id/)
  assert.match(workflow, /admin\.rpc\("quote_workflow_quote_documents"/)
  assert.match(workflow, /createSignedUrl\(String\(document\.blobName\), signedUrlLifetimeSeconds\)/)
  assert.match(api, /documents: Array<\{/)
  assert.match(page, /\(workspace\.documents \?\? \[\]\)\.map/)
  assert.match(page, /documentType: "Customer quotation"/)
  assert.match(page, /sent to \$\{document\.recipientEmail\}/)
})

test("quote PDF filenames keep the original clean and suffix later versions", () => {
  assert.match(pdf, /export function quotePdfName/)
  assert.match(pdf, /version > 1 \? ` - V\$\{version\}` : ""/)
  assert.match(pdf, /reportName: quotePdfName\(input\.reference, input\.dataset\.quote\.version\)/)
  assert.match(pdf, /`\$\{quotePdfName\(input\.reference, input\.dataset\.quote\.version\)\}\.pdf`/)
})

test("final-response versions cannot be reissued without a new draft", () => {
  assert.match(migration, /CusQuoteVersion_StatusCode" in \('accepted', 'declined', 'changes_requested'\)/)
  assert.match(migration, /Create a new quote version before sending another customer decision cycle/)
  assert.match(page, /currentVersionHasFinalResponse/)
  assert.match(page, /!currentVersionHasFinalResponse/)
})

test("Dexter and Watching for you expose confirmed deliveries without gaining send authority", () => {
  assert.match(dexterParityMigration, /multideck_dexter_domain_quotes_before_route_schedule_20260902/)
  assert.match(dexterParityMigration, /link\.delivery_status_code = 'sent'/)
  assert.match(dexterParityMigration, /sys_AIDexterDataDomains/)
  assert.match(dexterParityMigration, /sys_AIDexterWatchCapabilities/)
  assert.match(dexterParityMigration, /confirmed delivery and quote-document evidence/)
  assert.match(dexterParityMigration, /Direct quote sending remains an operator-reviewed action outside Dexter/)
  assert.doesNotMatch(dexterParityMigration, /multideck_dexter_action_send_quote/)
})
