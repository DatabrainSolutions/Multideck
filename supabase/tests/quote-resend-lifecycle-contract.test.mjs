import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")
const [registerApi, registerPage, quotePage, workflowApi, workflowEdge, migration] = await Promise.all([
  read("multideck.client/src/lib/quote-api.ts"),
  read("multideck.client/src/pages/quotes-register-page.tsx"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/migrations/20260823182000_quote_resend_lifecycle.sql"),
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

test("accepted quotes expose a resend action backed by a new response cycle", () => {
  assert.match(quotePage, /quoteHasAcceptedHistory/)
  assert.match(quotePage, /"Resend quote"/)
  assert.match(quotePage, /"Resend secure quote"/)
  assert.match(workflowEdge, /quote_workflow_issue_customer_response_v3/)
  assert.match(migration, /CusQuoteHeader_LifecycleCode" = 'accepted'[\s\S]*CusQuoteHeader_LifecycleCode" = 'revised'/)
  assert.match(migration, /issued := quote_api\.issue_customer_response/)
  assert.match(migration, /Reissuing starts a new customer response cycle/)
})
