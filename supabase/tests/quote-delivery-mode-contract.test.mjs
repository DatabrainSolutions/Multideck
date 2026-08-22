import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [core, workflow, migration, quotePage, responsePage, bookingPage, bookingComponents, api, dexter, phrases] = await Promise.all([
  read("supabase/functions/quotes-workflow/core.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/migrations/20260822090000_quote_delivery_modes_and_won_parity.sql"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/pages/quote-response-page.tsx"),
  read("multideck.client/src/pages/bookings-page.tsx"),
  read("multideck.client/src/components/multideck/booking-components.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("supabase/functions/agent-dexter/index.ts"),
  read("multideck.client/src/i18n/quote-response-phrases.ts"),
])

test("Standard and Simple delivery are explicit, persisted modes", () => {
  assert.match(core, /export type QuoteDeliveryMode = "standard" \| "simple"/)
  assert.match(core, /buildSimpleQuoteEmailDraft/)
  assert.match(migration, /delivery_mode_code text not null default 'standard'/)
  assert.match(migration, /delivery_mode_code in \('standard', 'simple'\)/)
  assert.match(api, /QuoteDeliveryMode/)
  assert.match(quotePage, /<SegmentedControl[\s\S]*quoteDeliveryModes/)
  assert.match(quotePage, /Simple emails stay short and unbranded/)
})

test("Standard keeps the response link while Simple stays one-line; both attach the immutable PDF", () => {
  const simpleRenderer = workflow.match(/function renderSimpleQuoteEmail[\s\S]*?\n}\n\nfunction renderQuoteDeliveryEmail/)?.[0] ?? ""
  assert.match(workflow, /buttonLabel: "View quote"/)
  assert.match(simpleRenderer, /const text = bodyText\.trim\(\)/)
  assert.doesNotMatch(simpleRenderer, /secure link|response link|url|expiresAt/)
  assert.match(workflow, /attachments:\s*\[\{[\s\S]*fileName: quoteDocument\.fileName[\s\S]*contentBase64: base64Encode\(quotePdfBytes\)/)
  assert.match(workflow, /deliveryMode === "standard" \? \{ bodyHtml: rendered\.html \} : \{\}/)
  assert.match(workflow, /quote_workflow_disable_customer_response/)
  assert.match(workflow, /responseControlsEnabled: deliveryMode === "standard"/)
  assert.ok(
    workflow.indexOf('admin.rpc("quote_workflow_bind_customer_response_document"')
      < workflow.indexOf('admin.rpc("quote_workflow_disable_customer_response"'),
    "Simple response controls must be disabled only after the immutable PDF is bound",
  )
  assert.ok(
    workflow.indexOf('admin.rpc("quote_workflow_disable_customer_response"')
      < workflow.indexOf("const delivery = await sendConnectedMailbox"),
    "Simple delivery must fail closed before the external email send",
  )
  assert.match(workflow, /OUTBOUND_ATTACHMENT_LIMITS\.maxFileBytes/)
  assert.match(quotePage, /Generated from this saved quote and attached automatically/)
  assert.match(quotePage, /Simple emails do not include customer response controls/)
  assert.match(quotePage, /issueDeliveryMode === "standard" \? <fieldset/)
})

test("a typed one-send recipient does not overwrite saved quote or CRM contact details", () => {
  assert.match(api, /source: "manual"; email: string/)
  assert.match(workflow, /recipientSource: "manual" as const/)
  assert.match(quotePage, /Select a saved contact or type any valid email address/)
  assert.match(quotePage, /This address is used for this send only\. Saved quote and CRM contact details will not change/)
  assert.match(migration, /CusQuoteHeader_ContactEmailSnapshot[\s\S]*for update;/)
  assert.match(migration, /if requested_recipient_source = 'manual' then[\s\S]*CusQuoteHeader_ContactNameSnapshot[\s\S]*CusQuoteHeader_ContactEmailSnapshot/)
  assert.match(migration, /recipient_source_code in \('saved', 'manual'\)/)
  assert.match(migration, /quote_workflow_disable_customer_response/)
  assert.match(migration, /delivery_mode_code = 'simple'[\s\S]*status_code = 'active'/)
  assert.match(migration, /status_code = 'revoked'[\s\S]*return true;[\s\S]*status_code = 'revoked'[\s\S]*return true;/)
  assert.match(migration, /revoke all on function public\.quote_workflow_disable_customer_response\(uuid\)[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.quote_workflow_disable_customer_response\(uuid\)[\s\S]*to service_role/)
  assert.match(migration, /responseControlsEnabled', requested_delivery_mode = 'standard'/)
})

test("latest delivery evidence stays behind a tenant-authorised public RPC", () => {
  assert.match(migration, /quote_workflow_latest_customer_response_issue/)
  assert.match(migration, /quote_api\.has_permission\(caller_auth_user_id, 'Quotes\.Read'\)/)
  assert.match(migration, /office\."Company_ID" = app_company_id/)
  assert.match(workflow, /admin\.rpc\("quote_workflow_latest_customer_response_issue"/)
  assert.doesNotMatch(workflow, /admin\.schema\("quote_api"\)/)
})

test("accepted quotes remain visible and expose their idempotent From quote booking", () => {
  assert.match(quotePage, /lifecycle === "accepted"[\s\S]*md-status-green-bg/)
  assert.match(quotePage, /Mark won and create booking/)
  assert.match(migration, /multideck_dexter_action_mark_quote_won/)
  assert.match(migration, /quote_api\.transition_quote\([\s\S]*'accepted'/)
  assert.match(bookingPage, /Accepted quote[\s\S]*From quote/)
  assert.match(bookingComponents, /sourceQuoteId[\s\S]*From quote/)
})

test("the public response decision is summary-first, accessible and visually prioritised", () => {
  assert.match(responsePage, /quoteResponseSummary/)
  assert.match(responsePage, /aria-pressed=\{selected\}/)
  assert.match(responsePage, /bg-\[var\(--md-status-green-bg\)\]/)
  assert.match(responsePage, /order-1[\s\S]*lg:order-2/)
  assert.match(responsePage, /role="alert"/)
})

test("Dexter can read delivery evidence, propose won or lost, and watches remain event driven", () => {
  assert.match(migration, /'quoteDocumentId', latest_issue\.quote_document_id/)
  assert.match(migration, /'linkedBooking'/)
  assert.match(migration, /AIDexterAction_Code[\s\S]*mark_quote_won/)
  assert.match(migration, /customer_response_links_dexter_watch/)
  assert.match(migration, /responseControlsEnabled/)
  assert.doesNotMatch(migration, /governedModelFetch|gpt-5|setInterval|cron/)
  assert.match(dexter, /Standard emails include the secure customer response link/)
  assert.match(dexter, /Simple emails are plain, PDF-only messages without customer response controls/)
  assert.match(dexter, /Mark quote won/)
})

test("new quote flow copy is registered with the app language layer", () => {
  for (const phrase of [
    "Simple",
    "Send a short plain email with the quote PDF attached.",
    "Simple emails do not include customer response controls. Record the outcome with Mark won or Mark lost in Multideck.",
    "Mark won and create booking",
    "From quote",
    "Choose a company contact or enter an email address.",
    "Enter a valid customer email address.",
    "Attached",
    "This address is used for this send only. Saved quote and CRM contact details will not change.",
  ]) assert.match(phrases, new RegExp(`"${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))
})
