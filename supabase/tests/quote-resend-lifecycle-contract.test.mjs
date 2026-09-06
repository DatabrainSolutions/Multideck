import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")
const [registerApi, registerPage, quotePage, workflowApi, workflowEdge, migration, submissionBoundary] = await Promise.all([
  read("multideck.client/src/lib/quote-api.ts"),
  read("multideck.client/src/pages/quotes-register-page.tsx"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/migrations/20260823182000_quote_resend_lifecycle.sql"),
  read("supabase/migrations/20260904120100_quote_submission_document_boundary.sql"),
])

test("quote register presents every persisted lifecycle instead of collapsing outcomes to Open", () => {
  assert.match(registerApi, /lifecycle === "accepted"[\s\S]*status: "Accepted"/)
  assert.match(registerApi, /lifecycle === "sent"[\s\S]*status: "Sent"/)
  assert.match(registerApi, /lifecycle === "revised"[\s\S]*status: "Revised"/)
  assert.match(registerPage, /quote\.status === "Accepted"[\s\S]*bg-\[var\(--md-status-green-bg\)\]/)
  assert.match(registerPage, /quote\.status === "Accepted"[\s\S]*bg-\[var\(--md-surface\)\]/)
})

test("quote register refreshes from database changes and workflow writes invalidate cached pages", () => {
  assert.match(registerApi, /table: "CusQuote_Header"/)
  assert.match(registerApi, /invalidateRegisterPages\("quotes:"\)/)
  assert.match(registerPage, /subscribeSalesQuotes/)
  assert.match(workflowApi, /invalidateRegisterPages\("quotes:"\)/)
  assert.match(migration, /alter publication supabase_realtime add table public\."CusQuote_Header"/)
})

test("accepted response versions require a new draft before another customer decision cycle", () => {
  assert.match(quotePage, /quoteHasAcceptedHistory/)
  assert.match(quotePage, /currentVersionHasFinalResponse/)
  assert.match(quotePage, /"New version"/)
  assert.match(workflowEdge, /quote_workflow_prepare_customer_response_v4/)
  assert.match(workflowEdge, /quote_workflow_finalize_customer_response_v4/)
  assert.match(migration, /CusQuoteHeader_LifecycleCode" = 'accepted'[\s\S]*CusQuoteHeader_LifecycleCode" = 'revised'/)
  assert.match(submissionBoundary, /Create a new quote version before sending another customer decision cycle/)
  assert.match(submissionBoundary, /delivery_status_code = 'sent'/)
})
