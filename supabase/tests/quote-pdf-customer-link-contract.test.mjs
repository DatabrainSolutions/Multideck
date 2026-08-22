import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [renderer, workflow, response, migration, brandingStorageMigration, responsePage, api, adminPage] = await Promise.all([
  read("supabase/functions/_shared/quote-pdf.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/functions/quote-response/index.ts"),
  read("supabase/migrations/20260820221145_quote_pdf_document_and_branding.sql"),
  read("supabase/migrations/20260820235125_allow_quote_brand_images_in_template_sources.sql"),
  read("multideck.client/src/pages/quote-response-page.tsx"),
  read("multideck.client/src/lib/quote-response-api.ts"),
  read("multideck.client/src/pages/admin-page.tsx"),
])

test("quote issue renders an immutable Carbone PDF before delivery and binds it to the secure link", () => {
  assert.match(renderer, /<carbone-pdf-options paper-size="A4"/)
  assert.match(renderer, /margin-top="0"/)
  assert.match(renderer, /print-background="true"/)
  assert.doesNotMatch(renderer, /marginTop=/)
  assert.match(renderer, /\{d\.charges\[i\]\.description\}/)
  assert.match(renderer, /\{d\.charges\[i\]\.rate\}/)
  assert.match(renderer, /\{d\.charges\[i\+1\]\}/)
  assert.match(renderer, /class="identity"/)
  assert.match(renderer, /class="journey"/)
  assert.match(renderer, /class="pricing"/)
  assert.match(renderer, /\{d\.company\.logoDataUri\}/)
  assert.match(renderer, /\{d\.quote\.customerEmail\}/)
  assert.doesNotMatch(renderer, /border-radius:\s*(?:6|7|8)px/)
  assert.match(renderer, /convertTo: "pdf"/)
  assert.match(renderer, /converter: "C"/)
  assert.match(renderer, /providerRequestId/)
  assert.match(renderer, /generatedDocumentsBucket/)
  assert.match(renderer, /DOCStoredObject_ConcernCode: "quote"/)
  assert.ok(workflow.indexOf("generateQuotePdf({") < workflow.indexOf('admin.rpc("quote_workflow_issue_customer_response_v2"'))
  assert.ok(workflow.indexOf('admin.rpc("quote_workflow_bind_customer_response_document"') < workflow.indexOf("await sendConnectedMailbox("))
  assert.match(workflow, /attachments:\s*\[\{[\s\S]*contentBase64:\s*base64Encode\(quotePdfBytes\)/)
})

test("the public endpoint only signs the version-bound private PDF", () => {
  assert.match(migration, /quote_document_id uuid/)
  assert.match(migration, /DOCStoredObject_AggregateID" = link_row\.quote_id/)
  assert.match(migration, /creator\."Company_ID" = link_row\.company_id/)
  assert.match(response, /DOCStoredObject_ConcernCode !== "quote"/)
  assert.match(response, /DOCStoredObject_AggregateType !== "CusQuote_Header"/)
  assert.match(response, /createSignedUrl/)
  assert.match(response, /signedUrlLifetimeSeconds/)
  assert.match(api, /mimeType: "application\/pdf"/)
})

test("branding is administrator-only and its source logo remains private", () => {
  assert.match(workflow, /await requireAdministrator\(admin, userId\)/)
  assert.match(workflow, /templateSourcesBucket\)\.upload/)
  assert.match(workflow, /Brand_LogoFilePath: path/)
  assert.match(adminPage, /Upload company logo/)
  assert.match(adminPage, /image\/png,image\/jpeg,image\/webp/)
  assert.match(brandingStorageMigration, /where id = 'multideck-template-sources'/)
  assert.match(brandingStorageMigration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
})

test("the customer response page is light-first, locally themeable and uses semantic response tones", () => {
  assert.match(responsePage, /return localStorage\.getItem\("multideck\.quote-response\.theme"\) === "dark" \? "dark" : "light"/)
  assert.match(responsePage, /data-customer-theme=\{theme\}/)
  assert.match(responsePage, /tone: "green"/)
  assert.match(responsePage, /tone: "amber"/)
  assert.match(responsePage, /tone: "red"/)
  assert.match(responsePage, /function QuotePdfPreview/)
  assert.match(responsePage, /useReducedMotion/)
})
