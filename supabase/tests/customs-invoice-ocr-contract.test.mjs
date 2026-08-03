import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("customs invoice OCR remains authenticated, server-side and explicitly Mistral OCR 4", async () => {
  const [edge, shared, config] = await Promise.all([
    read("supabase/functions/customs-invoice-ocr/index.ts"),
    read("supabase/functions/_shared/customs-invoice-ocr.ts"),
    read("supabase/config.toml"),
  ])

  assert.match(edge, /authenticate\(request\)/)
  assert.match(edge, /currentInternalUser\(admin, user\)/)
  assert.match(edge, /Deno\.env\.get\("MISTRAL_OCR_API_KEY"\)/)
  assert.match(edge, /https:\/\/api\.mistral\.ai\/v1\/ocr/)
  assert.match(edge, /document_annotation_format/)
  assert.match(edge, /confidence_scores_granularity: "page"/)
  assert.match(edge, /include_blocks: false/)
  assert.match(edge, /include_image_base64: false/)
  assert.match(edge, /image_limit: 0/)
  assert.match(edge, /Ignore logos, product photography, signatures, stamps and other decorative images/)
  assert.match(edge, /hasPdfSignature/)
  assert.match(shared, /MISTRAL_OCR_MODEL = "mistral-ocr-4-0"/)
  assert.match(shared, /MAX_COMMERCIAL_INVOICE_BYTES = 10 \* 1024 \* 1024/)
  assert.match(shared, /strict: true/)
  assert.match(config, /\[functions\.customs-invoice-ocr\]\s+verify_jwt = true/)
})

test("the client uploads the PDF with the current tenant session and applies reviewed lines", async () => {
  const [transport, workspace, importLogic, dexter] = await Promise.all([
    read("multideck.client/src/lib/customs-invoice-import-api.ts"),
    read("multideck.client/src/pages/customs-invoice-import-workspace.tsx"),
    read("multideck.client/src/lib/customs-invoice-import.ts"),
    read("supabase/functions/agent-dexter/index.ts"),
  ])

  assert.match(transport, /supabaseFunctionsUrl/)
  assert.match(transport, /Authorization: `Bearer \$\{token\}`/)
  assert.match(transport, /apikey: supabasePublicApiKey/)
  assert.match(transport, /form\.set\("file", file, file\.name\)/)
  assert.doesNotMatch(transport, /MISTRAL_OCR_API_KEY/)
  assert.match(workspace, /extractCommercialInvoice\(file\)/)
  assert.match(workspace, /setSelections\(createDefaultInvoiceSelections\(result\.lines\)\)/)
  assert.match(workspace, /accept="application\/pdf,\.pdf"/)
  assert.match(workspace, /Try extraction again/)
  assert.match(importLogic, /include: Boolean\(line\.description\.trim\(\)\)/)
  assert.match(dexter, /You cannot upload or process the invoice from chat or claim that extraction ran/)
})
