import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { authenticate, corsHeaders, currentInternalUser, HttpError, json, routeParts } from "../_shared/backend.ts"
import { governedModelFetch, type ModelGatewayContext } from "../_shared/model-gateway.ts"
import {
  COMMERCIAL_INVOICE_SCHEMA_VERSION,
  commercialInvoiceAnnotationFormat,
  MAX_COMMERCIAL_INVOICE_BYTES,
  MISTRAL_OCR_MODEL,
  normalizeCommercialInvoiceAnnotation,
  normalizeInvoiceEvidencePages,
  normalizePurchaseOrderAnnotation,
  purchaseOrderAnnotationFormat,
} from "../_shared/customs-invoice-ocr.ts"
import {
  INVOICE_DOCUMENT_NORMALIZER_VERSION,
  InvoiceDocumentPreparationError,
  type PreparedInvoiceDocument,
  prepareInvoiceDocument,
  spreadsheetCoverage,
  validateInvoiceDocumentSource,
} from "../_shared/invoice-document-normalizer.ts"

const functionName = "customs-invoice-ocr"
const documentBucket = "multideck-documents"
const mistralOcrUrl = "https://api.mistral.ai/v1/ocr"
const signedUrlLifetimeSeconds = 300
const preparedPdfLifetimeHours = 1
const readyCacheLifetimeDays = 30
const failedRecordLifetimeHours = 24
const pagesPerMistralRequest = 8
const purchaseOrderSchemaVersion = 1

type Actor = { userId: string; authUserId: string; companyId: string }
type DocumentType = "commercial_invoice" | "purchase_order"
type InvoiceInput = Awaited<ReturnType<typeof readInvoiceInput>>
type PreparedObject = { storedObjectId: string; objectPath: string; previewExpiresAt: string }
type PageRange = { start: number; end: number }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    const { admin, user } = await authenticate(request)
    const profile = await currentInternalUser(admin, user)
    const actor = actorFromProfile(profile, user.id)
    const path = routeParts(request, functionName)

    await cleanupExpiredPreparedPdfs(admin)
    if (request.method === "POST" && path.length === 0) return await extractInvoice(request, admin, actor)
    if (request.method === "GET" && path.length === 1) return await readExtraction(request, admin, actor, path[0])
    if (request.method === "DELETE" && path.length === 1) return await cancelExtraction(request, admin, actor, path[0])
    throw new HttpError(405, "This invoice import action is not supported.")
  } catch (error) {
    const publicError = publicHttpError(error)
    if (!(error instanceof HttpError) && !(error instanceof InvoiceDocumentPreparationError)) {
      console.error(`${functionName}: unexpected request error`, error)
    }
    return json(request, { detail: publicError.message }, publicError.status)
  }
})

async function extractInvoice(request: Request, admin: SupabaseClient, actor: Actor) {
  const timings = new RequestTimings()
  const apiKey = Deno.env.get("MISTRAL_OCR_API_KEY")?.trim()
  if (!apiKey) throw new HttpError(503, "Invoice import is unavailable for this workspace.")

  const input = await timings.measure("input", () => readInvoiceInput(request))
  await validateDeclaration(admin, actor, input.declarationId)
  await expireOldExtractions(admin)
  const sourceHash = await timings.measure("source_hash", () => sha256Hex(input.bytes))
  let prepared = await timings.measure("conversion", () => prepareInput(input))
  let preparedHash = await timings.measure("prepared_hash", () => sha256Hex(prepared.pdfBytes))
  const schemaVersion = documentSchemaVersion(input.documentType)

  const cached = await timings.measure("cache", () => readyCanonical(admin, actor.companyId, sourceHash, schemaVersion))
  if (cached) {
    await cloneCachedExtraction(admin, actor, input, sourceHash, prepared, preparedHash, cached)
    const stored = await timings.measure("storage", () => storePreparedPdf(admin, actor, input, sourceHash, prepared, preparedHash))
    const saved = await updateExtraction(admin, input.extractionId, {
      CUSTIE_StoredObjectID: stored.storedObjectId,
      CUSTIE_PreviewExpiresAt: stored.previewExpiresAt,
      CUSTIE_UpdatedAt: new Date().toISOString(),
    })
    return timedJson(request, await extractionResponse(admin, saved, true, timings.snapshot()), 200, timings)
  }

  const claimed = await claimCanonicalExtraction(admin, actor, input, sourceHash, prepared, preparedHash)
  if (!claimed) {
    const completed = await timings.measure("cache_wait", () => waitForCanonical(admin, actor.companyId, sourceHash, schemaVersion))
    if (!completed) throw new HttpError(409, "This invoice is already being processed. Wait a moment and try again.")
    await cloneCachedExtraction(admin, actor, input, sourceHash, prepared, preparedHash, completed)
    const stored = await timings.measure("storage", () => storePreparedPdf(admin, actor, input, sourceHash, prepared, preparedHash))
    const saved = await updateExtraction(admin, input.extractionId, {
      CUSTIE_StoredObjectID: stored.storedObjectId,
      CUSTIE_PreviewExpiresAt: stored.previewExpiresAt,
      CUSTIE_UpdatedAt: new Date().toISOString(),
    })
    return timedJson(request, await extractionResponse(admin, saved, true, timings.snapshot()), 200, timings)
  }

  let stored: PreparedObject | null = null
  try {
    stored = await timings.measure("storage", () => storePreparedPdf(admin, actor, input, sourceHash, prepared, preparedHash))
    await updateExtraction(admin, input.extractionId, {
      CUSTIE_StoredObjectID: stored.storedObjectId,
      CUSTIE_PreviewExpiresAt: stored.previewExpiresAt,
      CUSTIE_UpdatedAt: new Date().toISOString(),
    })

    let payloads = await timings.measure("mistral", () => extractWithMistralOcr(admin, actor, apiKey, stored!, prepared.pageCount, input.documentType))
    let coverage = spreadsheetCoverage(prepared.distinctiveSourceText, payloads)
    if (!coverage.passed && prepared.conversion.strategy === "office_pdf" && prepared.conversion.sheets.length) {
      await cleanupPreparedObject(admin, stored)
      stored = null
      prepared = await timings.measure("conversion_fallback", () => prepareInput(input, true))
      preparedHash = await sha256Hex(prepared.pdfBytes)
      stored = await storePreparedPdf(admin, actor, input, sourceHash, prepared, preparedHash)
      await updateExtraction(admin, input.extractionId, {
        CUSTIE_StoredObjectID: stored.storedObjectId,
        CUSTIE_ConvertedSHA256: preparedHash,
        CUSTIE_ConversionJSON: prepared.conversion,
        CUSTIE_PageCount: prepared.pageCount,
        CUSTIE_PreviewExpiresAt: stored.previewExpiresAt,
        CUSTIE_UpdatedAt: new Date().toISOString(),
      })
      payloads = await timings.measure("mistral_fallback", () => extractWithMistralOcr(admin, actor, apiKey, stored!, prepared.pageCount, input.documentType))
      coverage = spreadsheetCoverage(prepared.distinctiveSourceText, payloads)
    }
    if (!coverage.passed) {
      throw new HttpError(422, "The prepared invoice did not preserve enough spreadsheet content to import safely. Remove unrelated formatting or save it as a PDF and try again.")
    }

    const merged = timings.measureSync("normalize", () => mergeProviderPayloads(payloads, prepared.pageCount, input.documentType))
    if (!merged.extraction.lines.length) {
      throw new HttpError(422, "No item lines were found. Check the prepared document or choose another invoice.")
    }

    const result = {
      extractionId: input.extractionId,
      ...merged.extraction,
      documentType: input.documentType,
      model: merged.providerModel,
      requestedModel: MISTRAL_OCR_MODEL,
      pageCount: prepared.pageCount,
      extractionMode: "mistral_ocr" as const,
      pages: merged.evidencePages,
      usage: { pagesProcessed: merged.pagesProcessed },
      document: { ...prepared.conversion, pageCount: prepared.pageCount },
    }

    const current = await extractionRow(admin, input.extractionId, actor)
    if (current?.CUSTIE_StatusCode === "cancelled") throw new HttpError(409, "Invoice import was cancelled.")
    const completedAt = new Date()
    const saved = await updateExtraction(admin, input.extractionId, {
      CUSTIE_ProviderModel: merged.providerModel,
      CUSTIE_StatusCode: "ready",
      CUSTIE_ResultJSON: result,
      CUSTIE_UsageJSON: result.usage,
      CUSTIE_TimingsJSON: timings.snapshot(),
      CUSTIE_PageCount: prepared.pageCount,
      CUSTIE_ConvertedSHA256: preparedHash,
      CUSTIE_ConversionJSON: prepared.conversion,
      CUSTIE_FailureCode: null,
      CUSTIE_UpdatedAt: completedAt.toISOString(),
      CUSTIE_CompletedAt: completedAt.toISOString(),
      CUSTIE_ExpiresAt: addDays(completedAt, readyCacheLifetimeDays).toISOString(),
    })

    console.info(`${functionName}: extraction complete`, {
      extractionId: input.extractionId,
      sourceFormat: prepared.conversion.sourceFormat,
      conversionStrategy: prepared.conversion.strategy,
      sourceBytes: input.bytes.byteLength,
      preparedBytes: prepared.pdfBytes.byteLength,
      pageCount: prepared.pageCount,
      chunkCount: payloads.length,
      lineCount: merged.extraction.lines.length,
      coverageRatio: coverage.ratio,
      cacheHit: false,
      timings: timings.snapshot(),
    })
    return timedJson(request, await extractionResponse(admin, saved, false, timings.snapshot()), 200, timings)
  } catch (error) {
    if (stored) await cleanupPreparedObject(admin, stored)
    const current = await extractionRow(admin, input.extractionId, actor).catch(() => null)
    if (current?.CUSTIE_StatusCode !== "cancelled") {
      const failedAt = new Date()
      await updateExtraction(admin, input.extractionId, {
        CUSTIE_StoredObjectID: null,
        CUSTIE_PreviewExpiresAt: null,
        CUSTIE_StatusCode: "failed",
        CUSTIE_FailureCode: failureCode(error),
        CUSTIE_TimingsJSON: timings.snapshot(),
        CUSTIE_UpdatedAt: failedAt.toISOString(),
        CUSTIE_CompletedAt: failedAt.toISOString(),
        CUSTIE_ExpiresAt: addHours(failedAt, failedRecordLifetimeHours).toISOString(),
      }).catch(() => undefined)
    }
    throw error
  }
}

async function readExtraction(request: Request, admin: SupabaseClient, actor: Actor, extractionId: string) {
  validateUuid(extractionId, "extraction")
  const row = await extractionRow(admin, extractionId, actor)
  if (!row) throw new HttpError(404, "This invoice review is no longer available.")
  if (row.CUSTIE_StatusCode === "ready") {
    return json(request, await extractionResponse(admin, row, Boolean(row.CUSTIE_SourceExtractionID), asRecord(row.CUSTIE_TimingsJSON)))
  }
  if (row.CUSTIE_StatusCode === "processing") return json(request, { extractionId, status: "processing" }, 202)
  if (row.CUSTIE_StatusCode === "expired") throw new HttpError(410, "This invoice review has expired. Upload the invoice again.")
  if (row.CUSTIE_StatusCode === "cancelled") throw new HttpError(409, "Invoice import was cancelled.")
  throw new HttpError(422, "This invoice could not be imported. Upload it again to retry.")
}

async function cancelExtraction(request: Request, admin: SupabaseClient, actor: Actor, extractionId: string) {
  validateUuid(extractionId, "extraction")
  const row = await extractionRow(admin, extractionId, actor)
  if (!row) return json(request, {}, 204)
  await cleanupPreparedPdfForRow(admin, row)
  if (row.CUSTIE_StatusCode === "processing") {
    const cancelledAt = new Date()
    await updateExtraction(admin, extractionId, {
      CUSTIE_StatusCode: "cancelled",
      CUSTIE_FailureCode: "cancelled_by_user",
      CUSTIE_StoredObjectID: null,
      CUSTIE_PreviewExpiresAt: null,
      CUSTIE_UpdatedAt: cancelledAt.toISOString(),
      CUSTIE_CompletedAt: cancelledAt.toISOString(),
      CUSTIE_ExpiresAt: addHours(cancelledAt, failedRecordLifetimeHours).toISOString(),
    })
  } else {
    await updateExtraction(admin, extractionId, {
      CUSTIE_StoredObjectID: null,
      CUSTIE_PreviewExpiresAt: null,
      CUSTIE_UpdatedAt: new Date().toISOString(),
    })
  }
  return json(request, {}, 204)
}

async function readInvoiceInput(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) throw new HttpError(400, "Choose a commercial invoice to continue.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = cleanFileName(file.name)
  const type = documentType(form.get("documentType"))
  if (type === "purchase_order" && (!fileName.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf")) {
    throw new HttpError(415, "Purchase order import currently supports PDF files only.")
  }
  validateInvoiceDocumentSource(bytes, fileName, file.type, MAX_COMMERCIAL_INVOICE_BYTES)
  const extractionId = cleanText(form.get("extractionId"), 36)
  validateUuid(extractionId, "extraction")
  const declarationId = cleanText(form.get("declarationId"), 36) || null
  if (declarationId) validateUuid(declarationId, "declaration")
  return { extractionId, declarationId, documentType: type, bytes, fileName, mimeType: file.type || "application/octet-stream" }
}

function prepareInput(input: InvoiceInput, forceSpreadsheetNormalisation = false) {
  return prepareInvoiceDocument({
    bytes: input.bytes,
    fileName: input.fileName,
    providerMimeType: input.mimeType,
    maximumInputBytes: MAX_COMMERCIAL_INVOICE_BYTES,
    forceSpreadsheetNormalisation,
  })
}

async function validateDeclaration(admin: SupabaseClient, actor: Actor, declarationId: string | null) {
  if (!declarationId) return
  const { data, error } = await admin.from("Customs_Declarations").select("CUST_id")
    .eq("CUST_id", declarationId).eq("CUST_CreatedBy", actor.authUserId).eq("CUST_IsDeleted", false).maybeSingle()
  if (error) throw new HttpError(503, "The declaration could not be checked before import.")
  if (!data) throw new HttpError(403, "You cannot import an invoice into this declaration.")
}

async function readyCanonical(admin: SupabaseClient, companyId: string, hash: string, schemaVersion: number) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").select("*")
    .eq("CUSTIE_CompanyID", companyId)
    .eq("CUSTIE_SHA256", hash)
    .eq("CUSTIE_RequestedModel", MISTRAL_OCR_MODEL)
    .eq("CUSTIE_SchemaVersion", schemaVersion)
    .eq("CUSTIE_NormalizerVersion", INVOICE_DOCUMENT_NORMALIZER_VERSION)
    .is("CUSTIE_SourceExtractionID", null)
    .eq("CUSTIE_StatusCode", "ready")
    .gt("CUSTIE_ExpiresAt", new Date().toISOString())
    .order("CUSTIE_CompletedAt", { ascending: false }).limit(1).maybeSingle()
  if (error) throw new HttpError(503, "Invoice import could not check previous results.")
  return data as Record<string, unknown> | null
}

async function claimCanonicalExtraction(
  admin: SupabaseClient,
  actor: Actor,
  input: InvoiceInput,
  sourceHash: string,
  prepared: PreparedInvoiceDocument,
  preparedHash: string,
) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").insert({
    CUSTIE_ID: input.extractionId,
    CUSTIE_CompanyID: actor.companyId,
    CUSTIE_UserID: actor.userId,
    CUSTIE_DeclarationID: input.declarationId,
    CUSTIE_FileName: input.fileName,
    CUSTIE_MimeType: input.mimeType,
    CUSTIE_FileSizeBytes: input.bytes.byteLength,
    CUSTIE_SHA256: sourceHash,
    CUSTIE_ConvertedSHA256: preparedHash,
    CUSTIE_ConversionJSON: prepared.conversion,
    CUSTIE_RequestedModel: MISTRAL_OCR_MODEL,
    CUSTIE_SchemaVersion: documentSchemaVersion(input.documentType),
    CUSTIE_NormalizerVersion: INVOICE_DOCUMENT_NORMALIZER_VERSION,
    CUSTIE_PageCount: prepared.pageCount,
    CUSTIE_StatusCode: "processing",
  }).select("*").single()
  if (!error) return data as Record<string, unknown>
  if (error.code === "23505") return null
  throw new HttpError(503, "Invoice import could not be started.")
}

async function cloneCachedExtraction(
  admin: SupabaseClient,
  actor: Actor,
  input: InvoiceInput,
  sourceHash: string,
  prepared: PreparedInvoiceDocument,
  preparedHash: string,
  cached: Record<string, unknown>,
) {
  const now = new Date()
  const result = {
    ...asRecord(cached.CUSTIE_ResultJSON),
    extractionId: input.extractionId,
    pageCount: prepared.pageCount,
    document: { ...prepared.conversion, pageCount: prepared.pageCount },
  }
  const { data, error } = await admin.from("Customs_InvoiceExtractions").insert({
    CUSTIE_ID: input.extractionId,
    CUSTIE_CompanyID: actor.companyId,
    CUSTIE_UserID: actor.userId,
    CUSTIE_DeclarationID: input.declarationId,
    CUSTIE_SourceExtractionID: cached.CUSTIE_ID,
    CUSTIE_FileName: input.fileName,
    CUSTIE_MimeType: input.mimeType,
    CUSTIE_FileSizeBytes: input.bytes.byteLength,
    CUSTIE_SHA256: sourceHash,
    CUSTIE_ConvertedSHA256: preparedHash,
    CUSTIE_ConversionJSON: prepared.conversion,
    CUSTIE_RequestedModel: MISTRAL_OCR_MODEL,
    CUSTIE_ProviderModel: cached.CUSTIE_ProviderModel,
    CUSTIE_SchemaVersion: documentSchemaVersion(input.documentType),
    CUSTIE_NormalizerVersion: INVOICE_DOCUMENT_NORMALIZER_VERSION,
    CUSTIE_StatusCode: "ready",
    CUSTIE_ResultJSON: result,
    CUSTIE_UsageJSON: {},
    CUSTIE_TimingsJSON: { cache_hit: 1 },
    CUSTIE_PageCount: prepared.pageCount,
    CUSTIE_CompletedAt: now.toISOString(),
    CUSTIE_ExpiresAt: cached.CUSTIE_ExpiresAt,
  }).select("*").single()
  if (error || !data) throw new HttpError(503, "The previous invoice result could not be opened.")
  return data as Record<string, unknown>
}

async function waitForCanonical(admin: SupabaseClient, companyId: string, hash: string, schemaVersion: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await readyCanonical(admin, companyId, hash, schemaVersion)
    if (ready) return ready
    await delay(500)
  }
  return null
}

async function storePreparedPdf(
  admin: SupabaseClient,
  actor: Actor,
  input: InvoiceInput,
  sourceHash: string,
  prepared: PreparedInvoiceDocument,
  preparedHash: string,
): Promise<PreparedObject> {
  const storedObjectId = crypto.randomUUID()
  const createdAt = new Date()
  const previewExpiresAt = addHours(createdAt, preparedPdfLifetimeHours).toISOString()
  const objectPath = [
    "v2", "customs", "invoice-extractions", actor.companyId.replaceAll("-", ""), actor.userId.replaceAll("-", ""),
    String(createdAt.getUTCFullYear()), String(createdAt.getUTCMonth() + 1).padStart(2, "0"), `${input.extractionId}.pdf`,
  ].join("/")
  const { error: uploadError } = await admin.storage.from(documentBucket).upload(objectPath, prepared.pdfBytes, {
    contentType: "application/pdf", cacheControl: "0", upsert: false,
    metadata: {
      concern: "customs", aggregatetype: "customs_invoice_extraction", aggregateid: input.extractionId.replaceAll("-", ""),
      companyid: actor.companyId.replaceAll("-", ""), userid: actor.userId.replaceAll("-", ""),
      source_sha256: sourceHash, prepared_sha256: preparedHash, expires_at: previewExpiresAt,
    },
  })
  if (uploadError) throw new HttpError(503, "The prepared invoice could not be stored securely. Try again.")

  const preparedName = input.fileName.replace(/\.[^.]+$/, "") + ".prepared.pdf"
  const { error: catalogueError } = await admin.from("DOC_StoredObjects").insert({
    DOCStoredObject_ID: storedObjectId,
    DOCStoredObject_ConcernCode: "customs",
    DOCStoredObject_OrganisationID: null,
    DOCStoredObject_AggregateType: "customs_invoice_extraction",
    DOCStoredObject_AggregateID: input.extractionId,
    DOCStoredObject_ProviderCode: "supabase_storage",
    DOCStoredObject_Container: documentBucket,
    DOCStoredObject_BlobName: objectPath,
    DOCStoredObject_OriginalFileName: preparedName,
    DOCStoredObject_MimeType: "application/pdf",
    DOCStoredObject_FileSizeBytes: prepared.pdfBytes.byteLength,
    DOCStoredObject_SHA256: preparedHash,
    DOCStoredObject_StatusCode: "active",
    DOCStoredObject_CreatedAt: createdAt.toISOString(),
    DOCStoredObject_CreatedBy: actor.userId,
  })
  if (catalogueError) {
    await admin.storage.from(documentBucket).remove([objectPath])
    throw new HttpError(503, "The prepared invoice could not be catalogued securely. Try again.")
  }
  return { storedObjectId, objectPath, previewExpiresAt }
}

async function cleanupPreparedObject(admin: SupabaseClient, stored: PreparedObject) {
  const [storageResult, catalogueResult] = await Promise.all([
    admin.storage.from(documentBucket).remove([stored.objectPath]),
    admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", stored.storedObjectId),
  ])
  if (storageResult.error) console.error(`${functionName}: prepared PDF storage cleanup failed`, { storedObjectId: stored.storedObjectId })
  if (catalogueResult.error) console.error(`${functionName}: prepared PDF catalogue cleanup failed`, { storedObjectId: stored.storedObjectId })
}

async function cleanupPreparedPdfForRow(admin: SupabaseClient, row: Record<string, unknown>) {
  const storedObjectId = cleanText(row.CUSTIE_StoredObjectID, 36)
  if (!storedObjectId) return
  const { data } = await admin.from("DOC_StoredObjects").select("DOCStoredObject_BlobName")
    .eq("DOCStoredObject_ID", storedObjectId).maybeSingle()
  const objectPath = cleanText(data?.DOCStoredObject_BlobName, 1_000)
  if (objectPath) await cleanupPreparedObject(admin, { storedObjectId, objectPath, previewExpiresAt: "" })
  await admin.from("Customs_InvoiceExtractions").update({
    CUSTIE_StoredObjectID: null,
    CUSTIE_PreviewExpiresAt: null,
    CUSTIE_UpdatedAt: new Date().toISOString(),
  }).eq("CUSTIE_ID", row.CUSTIE_ID)
}

async function cleanupExpiredPreparedPdfs(admin: SupabaseClient) {
  const now = new Date().toISOString()
  const { data, error } = await admin.from("Customs_InvoiceExtractions").select("CUSTIE_ID,CUSTIE_StoredObjectID,CUSTIE_PreviewExpiresAt")
    .not("CUSTIE_StoredObjectID", "is", null).lt("CUSTIE_PreviewExpiresAt", now).limit(25)
  if (error) {
    console.warn(`${functionName}: prepared PDF expiry sweep could not run`)
    return
  }
  for (const row of data ?? []) await cleanupPreparedPdfForRow(admin, row).catch(() => undefined)
}

async function extractWithMistralOcr(
  admin: SupabaseClient,
  actor: Actor,
  apiKey: string,
  stored: PreparedObject,
  pageCount: number,
  documentType: DocumentType,
) {
  const { data, error } = await admin.storage.from(documentBucket).createSignedUrl(stored.objectPath, signedUrlLifetimeSeconds)
  if (error || !data?.signedUrl) throw new HttpError(503, "The prepared invoice could not be opened securely. Try again.")
  const ranges = pageRanges(pageCount)
  const payloads: Record<string, unknown>[] = []
  const gateway = { admin, companyId: actor.companyId, userId: actor.userId }
  for (const range of ranges) payloads.push(await requestMistralChunk(gateway, apiKey, data.signedUrl, documentType, range, ranges.length > 1))
  return payloads
}

async function requestMistralChunk(
  gateway: ModelGatewayContext,
  apiKey: string,
  signedUrl: string,
  documentType: DocumentType,
  range: PageRange,
  includeRange: boolean,
) {
  const purchaseOrder = documentType === "purchase_order"
  const requestBody = {
      model: MISTRAL_OCR_MODEL,
      document: { type: "document_url", document_url: signedUrl },
      ...(includeRange ? { pages: `${range.start}-${range.end}` } : {}),
      include_blocks: true,
      include_image_base64: false,
      image_limit: 0,
      document_annotation_format: purchaseOrder ? purchaseOrderAnnotationFormat : commercialInvoiceAnnotationFormat,
      document_annotation_prompt: [
        purchaseOrder ? "Extract the purchase order header and only item rows explicitly present in the document." : "Extract only commercial invoice item rows explicitly present in the document.",
        purchaseOrder ? "Do not invent purchase order numbers, suppliers, dates, references, quantities, prices, tax rates or terms." : "Do not invent commodity codes, origin, weights, quantities, prices or package details.",
        "Use a one-based page number and preserve the source item description.",
        purchaseOrder ? "Return dates as YYYY-MM-DD and three-letter ISO currency only when explicitly stated." : "Return three-letter ISO currency and two-letter ISO origin only when explicitly stated.",
        purchaseOrder ? "Keep header fields separate from item rows and exclude summary or subtotal rows." : "Keep item quantity separate from package count; return package count only when explicitly stated.",
        "Ignore logos, product photography, signatures, stamps and other decorative images.",
        purchaseOrder ? "Do not return totals, tax, freight or discounts as item rows." : "Do not return totals, tax, freight, discounts, addresses or payment terms as item rows.",
      ].join(" "),
    }
  const response = await governedModelFetch(gateway, {
    provider: "mistral", model: MISTRAL_OCR_MODEL, purpose: "invoice_ocr", dataCategories: ["document_content", "business_record"],
    recordCount: 1, estimatedInputUnits: range.end - range.start + 1,
    url: mistralOcrUrl, apiKey, body: requestBody, userAgent: "Multideck Customs invoice extraction/1",
    signal: AbortSignal.timeout(120_000),
  })
  return providerJson(response)
}

function mergeProviderPayloads(payloads: Record<string, unknown>[], pageCount: number, documentType: DocumentType) {
  const ranges = pageRanges(pageCount)
  const evidencePages = payloads.flatMap((payload, index) => {
    const range = ranges[index]
    return normalizeInvoiceEvidencePages(payload).map((page) => ({
      ...page,
      page: absolutePage(page.page, range),
      blocks: page.blocks.map((block) => ({ ...block, id: `block-${absolutePage(page.page, range)}-${block.id}` })),
    }))
  }).sort((left, right) => left.page - right.page)
  const providerModel = payloads.map((payload) => cleanText(payload.model, 80)).find(Boolean) || MISTRAL_OCR_MODEL
  const pagesProcessed = payloads.reduce((total, payload) => {
    const usage = asRecord(payload.usage_info ?? payload.usage)
    return total + (finiteNumber(usage.pages_processed) ?? finiteNumber(usage.pages) ?? (Array.isArray(payload.pages) ? payload.pages.length : 0))
  }, 0)

  if (documentType === "purchase_order") {
    const chunks = payloads.map((payload, index) => adjustExtractionPages(normalizePurchaseOrderAnnotation(payload.document_annotation), ranges[index]))
    const first = chunks[0] ?? normalizePurchaseOrderAnnotation({})
    return {
      extraction: {
        ...first,
        number: chunks.map((chunk) => chunk.number).find(Boolean) || "",
        supplierName: chunks.map((chunk) => chunk.supplierName).find(Boolean) || "",
        supplierReference: chunks.map((chunk) => chunk.supplierReference).find(Boolean) || "",
        buyerReference: chunks.map((chunk) => chunk.buyerReference).find(Boolean) || "",
        issueDate: chunks.map((chunk) => chunk.issueDate).find(Boolean) || "",
        expectedDeliveryDate: chunks.map((chunk) => chunk.expectedDeliveryDate).find(Boolean) || "",
        currencyCode: chunks.map((chunk) => chunk.currencyCode).find(Boolean) || "",
        deliveryTerms: chunks.map((chunk) => chunk.deliveryTerms).find(Boolean) || "",
        paymentTerms: chunks.map((chunk) => chunk.paymentTerms).find(Boolean) || "",
        deliveryAddress: chunks.map((chunk) => chunk.deliveryAddress).find(Boolean) || "",
        notes: chunks.map((chunk) => chunk.notes).find(Boolean) || "",
        lines: deduplicateLines(chunks.flatMap((chunk) => chunk.lines)),
      }, evidencePages, providerModel, pagesProcessed,
    }
  }
  const chunks = payloads.map((payload, index) => adjustExtractionPages(normalizeCommercialInvoiceAnnotation(payload.document_annotation), ranges[index]))
  return {
    extraction: {
      invoiceNumber: chunks.map((chunk) => chunk.invoiceNumber).find(Boolean) || "",
      lines: deduplicateLines(chunks.flatMap((chunk) => chunk.lines)).map((line, index) => ({ ...line, id: `ocr-line-${index + 1}` })),
    }, evidencePages, providerModel, pagesProcessed,
  }
}

function adjustExtractionPages<T extends { lines: Array<{ page: number }> }>(extraction: T, range: PageRange): T {
  return { ...extraction, lines: extraction.lines.map((line) => ({ ...line, page: absolutePage(line.page, range) })) }
}

function absolutePage(page: number, range: PageRange) {
  const chunkLength = range.end - range.start + 1
  return range.start > 0 && page <= chunkLength ? page + range.start : page
}

function deduplicateLines<T extends { page: number; description: string }>(lines: T[]) {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const value = line as T & Record<string, unknown>
    const key = [line.page, cleanText(value.sku, 120), cleanText(line.description, 800).toLowerCase(), finiteNumber(value.quantity), finiteNumber(value.unitPrice)].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pageRanges(pageCount: number) {
  const ranges: PageRange[] = []
  for (let start = 0; start < pageCount; start += pagesPerMistralRequest) {
    ranges.push({ start, end: Math.min(pageCount - 1, start + pagesPerMistralRequest - 1) })
  }
  return ranges
}

async function providerJson(response: Response) {
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id") || "unknown"
    console.error(`${functionName}: Mistral OCR failed`, { status: response.status, requestId })
    throw providerError(response.status)
  }
  return await response.json() as Record<string, unknown>
}

function mistralHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "Multideck document extraction/5" }
}

async function extractionRow(admin: SupabaseClient, extractionId: string, actor: Actor) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").select("*")
    .eq("CUSTIE_ID", extractionId).eq("CUSTIE_CompanyID", actor.companyId).eq("CUSTIE_UserID", actor.userId).maybeSingle()
  if (error) throw new HttpError(503, "The invoice review could not be opened.")
  return data as Record<string, unknown> | null
}

async function updateExtraction(admin: SupabaseClient, extractionId: string, values: Record<string, unknown>) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").update(values).eq("CUSTIE_ID", extractionId).select("*").single()
  if (error || !data) throw new HttpError(503, "Invoice import could not save its progress.")
  return data as Record<string, unknown>
}

async function expireOldExtractions(admin: SupabaseClient) {
  const now = new Date().toISOString()
  await admin.from("Customs_InvoiceExtractions").update({ CUSTIE_StatusCode: "expired", CUSTIE_UpdatedAt: now })
    .eq("CUSTIE_StatusCode", "ready").lt("CUSTIE_ExpiresAt", now).is("CUSTIE_SourceExtractionID", null)
  await admin.from("Customs_InvoiceExtractions").delete().in("CUSTIE_StatusCode", ["failed", "cancelled", "expired"]).lt("CUSTIE_ExpiresAt", now)
}

async function extractionResponse(admin: SupabaseClient, row: Record<string, unknown>, cacheHit: boolean, timings: Record<string, unknown>) {
  const result = { ...asRecord(row.CUSTIE_ResultJSON) }
  const preview = await preparedPdfPreview(admin, row)
  const document = { ...asRecord(result.document), ...asRecord(row.CUSTIE_ConversionJSON), pageCount: Number(row.CUSTIE_PageCount) || 0, ...preview }
  return { ...result, document, extractionId: row.CUSTIE_ID, cacheHit, timings }
}

async function preparedPdfPreview(admin: SupabaseClient, row: Record<string, unknown>) {
  const storedObjectId = cleanText(row.CUSTIE_StoredObjectID, 36)
  const expiresAt = cleanText(row.CUSTIE_PreviewExpiresAt, 40)
  if (!storedObjectId || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) return {}
  const { data: stored } = await admin.from("DOC_StoredObjects").select("DOCStoredObject_Container,DOCStoredObject_BlobName,DOCStoredObject_StatusCode")
    .eq("DOCStoredObject_ID", storedObjectId).maybeSingle()
  if (!stored || stored.DOCStoredObject_StatusCode !== "active") return {}
  const { data, error } = await admin.storage.from(stored.DOCStoredObject_Container).createSignedUrl(stored.DOCStoredObject_BlobName, signedUrlLifetimeSeconds)
  if (error || !data?.signedUrl) return {}
  const signedExpiresAt = new Date(Math.min(Date.now() + signedUrlLifetimeSeconds * 1_000, new Date(expiresAt).getTime())).toISOString()
  return { previewUrl: data.signedUrl, previewExpiresAt: signedExpiresAt }
}

function actorFromProfile(profile: Record<string, unknown>, authUserId: string): Actor {
  const userId = cleanText(profile.User_ID, 36)
  const companyId = cleanText(profile.Company_ID, 36)
  validateUuid(userId, "profile")
  validateUuid(authUserId, "account")
  validateUuid(companyId, "workspace")
  return { userId, authUserId, companyId }
}

function documentType(value: FormDataEntryValue | null): DocumentType {
  return value === "purchase_order" ? "purchase_order" : "commercial_invoice"
}

function documentSchemaVersion(value: DocumentType) {
  return value === "purchase_order" ? purchaseOrderSchemaVersion : COMMERCIAL_INVOICE_SCHEMA_VERSION
}

function validateUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, `Choose a valid ${label}.`)
}

function cleanFileName(value: unknown) {
  return cleanText(value, 255).replace(/[\r\n<>]/g, "") || "commercial-invoice.pdf"
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function providerError(status: number) {
  if (status === 429) return new HttpError(429, "Invoice import is busy. Wait a moment and try again.")
  if ([400, 413, 415, 422].includes(status)) return new HttpError(422, "This invoice could not be read. Choose a clearer source or try another invoice.")
  return new HttpError(502, "Invoice import is temporarily unavailable. Try again.")
}

function publicHttpError(error: unknown) {
  if (error instanceof HttpError) return error
  if (error instanceof InvoiceDocumentPreparationError) return new HttpError(error.status, error.message)
  if (error instanceof DOMException && error.name === "TimeoutError") return new HttpError(504, "Invoice import took too long. Try again.")
  return new HttpError(500, "Unable to import this invoice. Try again.")
}

function failureCode(error: unknown) {
  if (error instanceof InvoiceDocumentPreparationError) return error.code
  if (error instanceof HttpError) return `http_${error.status}`
  if (error instanceof DOMException && error.name === "TimeoutError") return "provider_timeout"
  return "unexpected_error"
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86_400_000) }
function addHours(date: Date, hours: number) { return new Date(date.getTime() + hours * 3_600_000) }
function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }

function timedJson(request: Request, body: unknown, status: number, timings: RequestTimings) {
  const response = json(request, body, status)
  response.headers.set("Server-Timing", timings.header())
  response.headers.set("Access-Control-Expose-Headers", "Server-Timing, X-Multideck-Extraction-Mode")
  response.headers.set("X-Multideck-Extraction-Mode", "mistral_ocr")
  return response
}

class RequestTimings {
  private readonly startedAt = performance.now()
  private readonly phases = new Map<string, number>()
  async measure<T>(name: string, action: () => Promise<T>) {
    const startedAt = performance.now()
    try { return await action() } finally { this.phases.set(name, performance.now() - startedAt) }
  }
  measureSync<T>(name: string, action: () => T) {
    const startedAt = performance.now()
    try { return action() } finally { this.phases.set(name, performance.now() - startedAt) }
  }
  snapshot() {
    return Object.fromEntries([...this.phases.entries().map(([name, duration]) => [name, Math.round(duration)] as const), ["total", Math.round(performance.now() - this.startedAt)] as const])
  }
  header() { return Object.entries(this.snapshot()).map(([name, duration]) => `${name};dur=${duration}`).join(", ") }
}
