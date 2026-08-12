import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("customs invoice extraction remains authenticated, private, versioned and Mistral-only", async () => {
  const [edge, shared, normalizer, migration, conversionMigration, config] = await Promise.all([
    read("supabase/functions/customs-invoice-ocr/index.ts"),
    read("supabase/functions/_shared/customs-invoice-ocr.ts"),
    read("supabase/functions/_shared/invoice-document-normalizer.ts"),
    read("supabase/migrations/20260804133000_customs_invoice_extraction_cache.sql"),
    read("supabase/migrations/20260812103000_multiformat_customs_invoice_import.sql"),
    read("supabase/config.toml"),
  ])

  assert.match(edge, /authenticate\(request\)/)
  assert.match(edge, /currentInternalUser\(admin, user\)/)
  assert.match(edge, /actorFromProfile\(profile, user\.id\)/)
  assert.match(edge, /CUST_CreatedBy", actor\.authUserId/)
  assert.match(edge, /Deno\.env\.get\("MISTRAL_OCR_API_KEY"\)/)
  assert.match(edge, /https:\/\/api\.mistral\.ai\/v1\/ocr/)
  assert.doesNotMatch(edge, /chat\/completions|embeddedText|mistral-small/i)
  assert.match(edge, /document_annotation_format/)
  assert.doesNotMatch(edge, /confidence_scores_granularity/)
  // Blocks carry the bounding boxes the review screen draws over the operator's own document.
  assert.match(edge, /include_blocks: true/)
  assert.match(edge, /normalizeInvoiceEvidencePages\(payload\)/)
  assert.match(edge, /pages: merged\.evidencePages/)
  assert.doesNotMatch(edge, /table_format/)
  assert.match(edge, /include_image_base64: false/)
  assert.match(edge, /image_limit: 0/)
  assert.match(edge, /Ignore logos, product photography, signatures, stamps and other decorative images/)
  assert.match(edge, /validateInvoiceDocumentSource/)
  assert.match(edge, /sha256Hex\(input\.bytes\)/)
  assert.match(edge, /createSignedUrl\(stored\.objectPath, signedUrlLifetimeSeconds\)/)
  assert.match(edge, /Customs_InvoiceExtractions/)
  assert.match(edge, /readyCanonical/)
  assert.match(edge, /cloneCachedExtraction/)
  assert.match(edge, /cleanupExpiredPreparedPdfs/)
  assert.match(edge, /cleanupPreparedObject/)
  assert.match(edge, /validateDeclaration/)
  assert.doesNotMatch(edge, /data:application\/pdf;base64|bytesToBase64/)
  assert.match(edge, /Server-Timing/)
  assert.match(shared, /MISTRAL_OCR_MODEL = "mistral-ocr-4-0"/)
  assert.match(shared, /COMMERCIAL_INVOICE_SCHEMA_VERSION = 3/)
  assert.match(shared, /MAX_COMMERCIAL_INVOICE_BYTES = 10 \* 1024 \* 1024/)
  assert.match(shared, /strict: true/)
  assert.match(shared, /MAX_INVOICE_EVIDENCE_BUDGET_CHARS = 120_000/)
  assert.match(shared, /export function normalizeInvoiceEvidencePages/)
  assert.doesNotMatch(shared, /confidence:/)
  assert.doesNotMatch(edge, /\btesseract\b|\btextract\b|\bfirecrawl\b/i)
  assert.match(migration, /create table if not exists public\."Customs_InvoiceExtractions"/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\."Customs_InvoiceExtractions" from public, anon, authenticated/)
  assert.match(migration, /UX_Customs_InvoiceExtractions_active_canonical/)
  assert.match(migration, /CUSTIE_SourceExtractionID/)
  assert.match(migration, /CUSTIE_SHA256/)
  assert.match(conversionMigration, /CUSTIE_NormalizerVersion/)
  assert.match(conversionMigration, /CUSTIE_ConvertedSHA256/)
  assert.match(conversionMigration, /CUSTIE_ConversionJSON/)
  assert.match(conversionMigration, /CUSTIE_PreviewExpiresAt/)
  assert.match(normalizer, /npm:xlsx@0\.18\.5/)
  assert.match(normalizer, /"\.xls"/)
  assert.match(normalizer, /"\.csv"/)
  assert.match(normalizer, /"\.tsv"/)
  assert.match(normalizer, /"\.docx"/)
  assert.match(normalizer, /"\.doc"/)
  assert.match(normalizer, /"\.ods"/)
  assert.match(normalizer, /"\.odt"/)
  assert.match(normalizer, /"\.webp"/)
  assert.match(normalizer, /spreadsheet_normalised/)
  assert.match(normalizer, /render\/template\?download=true/)
  assert.match(normalizer, /escapeHtml/)
  assert.match(normalizer, /hidden.*not included/i)
  assert.match(normalizer, /formula.*not recalculated/i)
  assert.match(edge, /pagesPerMistralRequest = 8/)
  assert.match(edge, /spreadsheetCoverage/)
  assert.match(config, /\[functions\.customs-invoice-ocr\]\s+verify_jwt = true/)
})

test("purchase order PDFs reuse the authenticated cached extraction boundary and require operator review", async () => {
  const [transport, workspace, warehouseClient, edge, shared] = await Promise.all([
    read("multideck.client/src/lib/purchase-order-import-api.ts"),
    read("multideck.client/src/components/multideck/warehouse-purchase-orders-workspace.tsx"),
    read("multideck.client/src/lib/warehouse.ts"),
    read("supabase/functions/customs-invoice-ocr/index.ts"),
    read("supabase/functions/_shared/customs-invoice-ocr.ts"),
  ])
  assert.match(transport, /customs-invoice-ocr/)
  assert.match(transport, /form\.set\("documentType", "purchase_order"\)/)
  assert.match(transport, /form\.set\("extractionId", extractionId\)/)
  assert.doesNotMatch(transport, /extractEmbeddedPdfText|fallbackToMistralOcr|embedded_text/)
  assert.doesNotMatch(transport, /numeric\(line\.quantity\) \|\| 1/)
  assert.match(transport, /Authorization: `Bearer \$\{token\}`/)
  assert.doesNotMatch(transport, /MISTRAL_OCR_API_KEY/)
  assert.match(edge, /documentType === "purchase_order"/)
  assert.match(edge, /purchaseOrderAnnotationFormat/)
  assert.match(edge, /normalizePurchaseOrderAnnotation/)
  assert.match(workspace, /extractPurchaseOrder\(file/)
  assert.match(workspace, /reviewedAt/)
  assert.match(workspace, /Match each extracted line to the correct warehouse item before issuing/)
  assert.match(workspace, /DocumentExtractionProgress/)
  assert.doesNotMatch(shared.slice(shared.indexOf("export function normalizePurchaseOrderAnnotation")), /positiveNumber\(line\.quantity\) \|\| 1/)
  assert.match(warehouseClient, /requestWarehouse<WarehousePurchaseOrder>/)
})

test("the client uploads immediately, restores server results and applies reviewed lines", async () => {
  const [transport, preview, recovery, workspace, declarations, phrases, folderAnimation, importLogic, dexter] = await Promise.all([
    read("multideck.client/src/lib/customs-invoice-import-api.ts"),
    read("multideck.client/src/lib/customs-invoice-pdf-preview.ts"),
    read("multideck.client/src/lib/customs-invoice-import-recovery.ts"),
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
  assert.match(transport, /form\.set\("file", file, file\.name\)/)
  assert.match(transport, /form\.set\("extractionId", extractionId\)/)
  assert.match(transport, /XMLHttpRequest/)
  assert.match(transport, /request\.upload\.addEventListener\("load", onUploaded/)
  assert.match(transport, /readCommercialInvoiceExtraction/)
  assert.match(transport, /cancelCommercialInvoiceExtraction/)
  assert.doesNotMatch(transport, /extractEmbeddedPdfText|fallbackToMistralOcr|embedded_text|mistral-small/i)
  assert.doesNotMatch(transport, /MISTRAL_OCR_API_KEY/)
  // PDF.js remains presentation-only so operators can inspect their own document.
  assert.match(preview, /import\("pdfjs-dist"\)/)
  assert.match(preview, /pdf\.worker\.min\.mjs\?url/)
  assert.doesNotMatch(preview, /getTextContent|tesseract|ocr/i)
  assert.match(recovery, /const recoveryVersion = 3/)
  assert.match(recovery, /extractionId/)
  assert.match(recovery, /lines: \[\], evidencePages: \[\]/)
  assert.match(transport, /evidencePages/)
  assert.match(transport, /onStage\?\.\("uploading"\)/)
  assert.match(transport, /onStage\?\.\("extracting"\)/)
  assert.match(transport, /onStage\?\.\("organising"\)/)
  assert.match(workspace, /extractCommercialInvoice\(file, \{/)
  assert.match(workspace, /readCommercialInvoiceExtraction\(recovered\.extractionId/)
  assert.match(workspace, /cancelCommercialInvoiceExtraction/)
  assert.match(workspace, /buildInvoiceLineEvidence\(lines, evidencePages\)/)
  assert.match(workspace, /<DocumentEvidenceViewer/)
  assert.match(workspace, /<DocumentExtractionProgress/)
  assert.match(workspace, /applyToDeclaration\("append"\)/)
  assert.match(workspace, /applyToDeclaration\("replace"\)/)
  assert.match(workspace, /setSelections\(createDefaultInvoiceSelections\(result\.lines\)\)/)
  assert.match(workspace, /accept=\{commercialInvoiceFileAccept\}/)
  assert.match(transport, /"uploading" \| "converting" \| "extracting" \| "organising"/)
  assert.match(workspace, /Preparing the document/)
  assert.match(workspace, /PDF, Excel, CSV, Word or image, up to 10 MB/)
  assert.match(workspace, /Included sheets/)
  assert.match(workspace, /renderPreparedPreview/)
  assert.match(workspace, /data-testid="commercial-invoice-dropzone"/)
  assert.match(workspace, /onDrop=\{handleInvoiceDrop\}/)
  assert.match(workspace, /DotLottieReact/)
  assert.match(workspace, /buildAccentRamp\(accentPresetId\)/)
  assert.match(workspace, /Invoice import/)
  assert.match(declarations, /Import invoice/)
  assert.doesNotMatch(workspace, /Mistral|\bOCR\b|API key|AI extraction/i)
  assert.doesNotMatch(phrases, /Mistral|\bOCR\b|AI extraction/i)
  assert.match(folderAnimation, /"nm":"Folder"/)
  assert.match(importLogic, /include: Boolean\(line\.description\.trim\(\)\)/)
  assert.match(dexter, /The dedicated commercial-invoice importer remains the safest route/)
  assert.match(dexter, /item lines must be overlaid on the exact prepared PDF and individually reviewed/)
  assert.match(dexter, /Dexter chat can also extract read-only evidence from those operator-uploaded formats/)
  assert.match(dexter, /Temporary upload, conversion and OCR states are explicitly not meaningful watch events/)
})
