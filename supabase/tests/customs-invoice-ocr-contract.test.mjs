import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("customs invoice extraction remains authenticated, server-side and Mistral-only", async () => {
  const [edge, shared, config] = await Promise.all([
    read("supabase/functions/customs-invoice-ocr/index.ts"),
    read("supabase/functions/_shared/customs-invoice-ocr.ts"),
    read("supabase/config.toml"),
  ])

  assert.match(edge, /authenticate\(request\)/)
  assert.match(edge, /currentInternalUser\(admin, user\)/)
  assert.match(edge, /Deno\.env\.get\("MISTRAL_OCR_API_KEY"\)/)
  assert.match(edge, /https:\/\/api\.mistral\.ai\/v1\/ocr/)
  assert.match(edge, /https:\/\/api\.mistral\.ai\/v1\/chat\/completions/)
  assert.match(edge, /document_annotation_format/)
  assert.doesNotMatch(edge, /confidence_scores_granularity/)
  assert.match(edge, /include_blocks: false/)
  assert.doesNotMatch(edge, /table_format/)
  assert.match(edge, /include_image_base64: false/)
  assert.match(edge, /image_limit: 0/)
  assert.match(edge, /Ignore logos, product photography, signatures, stamps and other decorative images/)
  assert.match(edge, /hasPdfSignature/)
  assert.match(edge, /fallbackToMistralOcr/)
  assert.match(edge, /Server-Timing/)
  assert.match(shared, /MISTRAL_OCR_MODEL = "mistral-ocr-4-0"/)
  assert.match(shared, /MISTRAL_TEXT_MODEL = "mistral-small-latest"/)
  assert.match(shared, /MAX_COMMERCIAL_INVOICE_BYTES = 10 \* 1024 \* 1024/)
  assert.match(shared, /MAX_COMMERCIAL_INVOICE_TEXT_CHARS = 160_000/)
  assert.match(shared, /strict: true/)
  assert.doesNotMatch(shared, /confidence:/)
  assert.doesNotMatch(edge, /tesseract|textract|firecrawl/i)
  assert.match(config, /\[functions\.customs-invoice-ocr\]\s+verify_jwt = true/)
})

test("the client uses embedded PDF text first, falls back only to Mistral OCR and applies reviewed lines", async () => {
  const [transport, pdfText, workspace, declarations, phrases, folderAnimation, importLogic, dexter] = await Promise.all([
    read("multideck.client/src/lib/customs-invoice-import-api.ts"),
    read("multideck.client/src/lib/customs-invoice-pdf-text.ts"),
    read("multideck.client/src/pages/customs-invoice-import-workspace.tsx"),
    read("multideck.client/src/pages/customs-declarations-page.tsx"),
    read("multideck.client/src/i18n/customs-declaration-phrases.ts"),
    read("multideck.client/src/assets/animations/docs-folder.json"),
    read("multideck.client/src/lib/customs-invoice-import.ts"),
    read("supabase/functions/agent-dexter/index.ts"),
  ])

  assert.match(transport, /supabaseFunctionsUrl/)
  assert.match(transport, /Authorization: `Bearer \$\{token\}`/)
  assert.match(transport, /apikey: supabasePublicApiKey/)
  assert.match(transport, /extractEmbeddedPdfText\(file\)/)
  assert.match(transport, /fallbackToMistralOcr/)
  assert.match(transport, /form\.set\("file", file, file\.name\)/)
  assert.doesNotMatch(transport, /MISTRAL_OCR_API_KEY/)
  assert.match(pdfText, /import\("pdfjs-dist"\)/)
  assert.match(pdfText, /pdf\.worker\.min\.mjs\?url/)
  assert.doesNotMatch(pdfText, /tesseract|ocr/i)
  assert.match(workspace, /extractCommercialInvoice\(file\)/)
  assert.match(workspace, /setSelections\(createDefaultInvoiceSelections\(result\.lines\)\)/)
  assert.match(workspace, /accept="application\/pdf,\.pdf"/)
  assert.match(workspace, /data-testid="commercial-invoice-dropzone"/)
  assert.match(workspace, /onDrop=\{handleInvoiceDrop\}/)
  assert.match(workspace, /DotLottieReact/)
  assert.match(workspace, /buildAccentRamp\(accentPresetId\)/)
  assert.match(workspace, /Invoice import/)
  assert.match(declarations, /Import invoice/)
  assert.doesNotMatch(workspace, /Mistral|\bOCR\b|API key|AI extraction/i)
  assert.doesNotMatch(phrases, /Mistral|\bOCR\b|API key|AI extraction/i)
  assert.match(folderAnimation, /"nm":"Folder"/)
  assert.match(importLogic, /include: Boolean\(line\.description\.trim\(\)\)/)
  assert.match(dexter, /no conventional OCR fallback is used/)
  assert.match(dexter, /You cannot upload or process the invoice from chat or claim that extraction ran/)
  assert.match(dexter, /Watching for you has no event to monitor at this stage/)
})
