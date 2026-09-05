import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, dexterMigration, responseMigration, responsePage, quotePage, quoteApi, workflow] = await Promise.all([
  read("supabase/migrations/20260821101332_repair_customer_quote_response_completion.sql"),
  read("supabase/migrations/20260821102657_expose_customer_quote_response_to_dexter.sql"),
  read("supabase/migrations/20260903100000_customer_response_reason_audit.sql"),
  read("multideck.client/src/pages/quote-response-page.tsx"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
])

test("customer quote outcomes cannot be rolled back by an unknown notification link type", () => {
  assert.match(migration, /insert into public\."sys_CommLinkTypes"/)
  assert.match(migration, /'quote_response'/)
  assert.match(migration, /on conflict \("CommLinkType_Code"\) do update/)
})

test("customer decline stores a structured reason while operator loss reasons stay separate", () => {
  assert.match(responsePage, /quoteCustomerDeclineReasons\.map/)
  assert.match(responsePage, /Additional detail \(optional\)/)
  assert.match(responsePage, /disabled=\{!lossReason \|\| submitting\}/)
  assert.match(responsePage, /submitResponse\("declined"/)
  assert.match(quoteApi, /declineReasonCode/)
  assert.match(quotePage, /formatQuoteLossReason\(lossReason, lossDetails\)/)
})

test("switching response choice clears text and attachment state", () => {
  assert.match(responsePage, /if \(decision !== next\)/)
  assert.match(responsePage, /setMessage\(""\)/)
  assert.match(responsePage, /setCompetitorQuote\(null\)/)
  assert.match(responsePage, /setUploadedDocumentId\(null\)/)
})

test("change requests and attachments are returned to the quote workspace", () => {
  assert.match(workflow, /customer_accepted.*customer_declined.*customer_challenged/s)
  assert.match(workflow, /metadata\.competitorDocumentId/)
  assert.match(workflow, /DOCStoredObject_ConcernCode.*quote_response/s)
  assert.match(workflow, /createSignedUrl/)
  assert.match(workflow, /customerResponse/)
  assert.match(quoteApi, /customerResponse: QuoteWorkflowCustomerResponse \| null/)
  assert.match(quotePage, /QuoteCustomerResponseTooltip/)
  assert.match(quotePage, /quoteCustomerResponseDocuments/)
  assert.match(quotePage, /Customer attachment available in Documents/)
})

test("accepted quotes rely on the header status unless the customer added useful content", () => {
  assert.match(quotePage, /function shouldShowQuoteCustomerResponse/)
  assert.match(quotePage, /response\.decision !== "accepted"/)
  assert.match(quotePage, /response\.message\?\.trim\(\) \|\| response\.attachment/)
  assert.match(quotePage, /shouldShowQuoteCustomerResponse\(workspace\?\.customerResponse \?\? null\) && workspace\?\.customerResponse/)
})

test("Dexter can read the latest customer response with source evidence", () => {
  assert.match(dexterMigration, /quote_api\.customer_responses/)
  assert.match(dexterMigration, /'customerResponse'/)
  assert.match(dexterMigration, /'attachmentDocumentId'/)
  assert.match(responseMigration, /decline_reason_code/)
  assert.match(responseMigration, /'declineReasonCode'/)
  assert.match(dexterMigration, /'sourceId', customer_response\.response_id/)
})
