import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { authenticate, corsHeaders, currentInternalUser, HttpError, json, routeParts } from "../_shared/backend.ts"
import {
  COMMERCIAL_INVOICE_SCHEMA_VERSION,
  commercialInvoiceAnnotationFormat,
  MAX_COMMERCIAL_INVOICE_BYTES,
  MISTRAL_OCR_MODEL,
  normalizeCommercialInvoiceAnnotation,
  normalizeInvoiceEvidencePages,
} from "../_shared/customs-invoice-ocr.ts"

const functionName = "customs-invoice-ocr"
const documentBucket = "multideck-documents"
const mistralOcrUrl = "https://api.mistral.ai/v1/ocr"
const signedUrlLifetimeSeconds = 300
const readyCacheLifetimeDays = 30
const failedRecordLifetimeHours = 24

type Actor = { userId: string; companyId: string }
type TemporaryInvoice = { storedObjectId: string; objectPath: string; signedUrl: string }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    const { admin, user } = await authenticate(request)
    const profile = await currentInternalUser(admin, user)
    const actor = actorFromProfile(profile)
    const path = routeParts(request, functionName)

    if (request.method === "POST" && path.length === 0) return await extractInvoice(request, admin, actor)
    if (request.method === "GET" && path.length === 1) return await readExtraction(request, admin, actor, path[0])
    if (request.method === "DELETE" && path.length === 1) return await cancelExtraction(request, admin, actor, path[0])
    throw new HttpError(405, "This invoice import action is not supported.")
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(`${functionName}: unexpected request error`, error)
    const publicError = error instanceof HttpError ? error : new HttpError(500, "Unable to import this invoice. Try again.")
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

  const hash = await timings.measure("hash", () => sha256Hex(input.bytes))
  const cached = await timings.measure("cache", () => readyCanonical(admin, actor.companyId, hash))
  if (cached) {
    const clone = await cloneCachedExtraction(admin, actor, input, hash, cached)
    return timedJson(request, extractionResponse(clone, true, timings.snapshot()), 200, timings)
  }

  const claimed = await claimCanonicalExtraction(admin, actor, input, hash)
  if (!claimed) {
    const completed = await timings.measure("cache_wait", () => waitForCanonical(admin, actor.companyId, hash))
    if (!completed) throw new HttpError(409, "This invoice is already being processed. Wait a moment and try again.")
    const clone = await cloneCachedExtraction(admin, actor, input, hash, completed)
    return timedJson(request, extractionResponse(clone, true, timings.snapshot()), 200, timings)
  }

  let temporary: TemporaryInvoice | null = null
  try {
    temporary = await timings.measure("storage", () => storeTemporaryInvoice(admin, actor, input, hash))
    await updateExtraction(admin, input.extractionId, {
      CUSTIE_StoredObjectID: temporary.storedObjectId,
      CUSTIE_UpdatedAt: new Date().toISOString(),
    })

    const providerPayload = await timings.measure("mistral", () => extractWithMistralOcr(apiKey, temporary!.signedUrl))
    const extraction = timings.measureSync("normalize", () => normalizeCommercialInvoiceAnnotation(providerPayload.document_annotation))
    if (!extraction.lines.length) throw new HttpError(422, "No item lines were found. Check the PDF or choose another invoice.")

    const usage = asRecord(providerPayload.usage_info ?? providerPayload.usage)
    const pageCount = Array.isArray(providerPayload.pages) ? providerPayload.pages.length : 0
    const providerModel = cleanText(providerPayload.model, 80) || MISTRAL_OCR_MODEL
    const evidencePages = timings.measureSync("evidence", () => normalizeInvoiceEvidencePages(providerPayload))
    const result = {
      extractionId: input.extractionId,
      invoiceNumber: extraction.invoiceNumber,
      lines: extraction.lines,
      model: providerModel,
      requestedModel: MISTRAL_OCR_MODEL,
      pageCount,
      extractionMode: "mistral_ocr" as const,
      pages: evidencePages,
      usage: { pagesProcessed: finiteNumber(usage.pages_processed) ?? finiteNumber(usage.pages) ?? pageCount },
    }

    const current = await extractionRow(admin, input.extractionId, actor)
    if (current?.CUSTIE_StatusCode === "cancelled") throw new HttpError(409, "Invoice import was cancelled.")

    const completedAt = new Date()
    const saved = await updateExtraction(admin, input.extractionId, {
      CUSTIE_ProviderModel: providerModel,
      CUSTIE_StatusCode: "ready",
      CUSTIE_ResultJSON: result,
      CUSTIE_UsageJSON: result.usage,
      CUSTIE_TimingsJSON: timings.snapshot(),
      CUSTIE_PageCount: pageCount,
      CUSTIE_FailureCode: null,
      CUSTIE_UpdatedAt: completedAt.toISOString(),
      CUSTIE_CompletedAt: completedAt.toISOString(),
      CUSTIE_ExpiresAt: addDays(completedAt, readyCacheLifetimeDays).toISOString(),
    })

    console.info(`${functionName}: extraction complete`, {
      extractionId: input.extractionId,
      byteCount: input.bytes.byteLength,
      pageCount,
      lineCount: extraction.lines.length,
      evidencePageCount: evidencePages.length,
      cacheHit: false,
      timings: timings.snapshot(),
    })
    return timedJson(request, extractionResponse(saved, false, timings.snapshot()), 200, timings)
  } catch (error) {
    const current = await extractionRow(admin, input.extractionId, actor).catch(() => null)
    if (current?.CUSTIE_StatusCode !== "cancelled") {
      const failedAt = new Date()
      await updateExtraction(admin, input.extractionId, {
        CUSTIE_StatusCode: "failed",
        CUSTIE_FailureCode: failureCode(error),
        CUSTIE_TimingsJSON: timings.snapshot(),
        CUSTIE_UpdatedAt: failedAt.toISOString(),
        CUSTIE_CompletedAt: failedAt.toISOString(),
        CUSTIE_ExpiresAt: addHours(failedAt, failedRecordLifetimeHours).toISOString(),
      }).catch(() => undefined)
    }
    throw error
  } finally {
    if (temporary) await cleanupTemporaryInvoice(admin, temporary)
  }
}

async function readExtraction(request: Request, admin: SupabaseClient, actor: Actor, extractionId: string) {
  validateUuid(extractionId, "extraction")
  const row = await extractionRow(admin, extractionId, actor)
  if (!row) throw new HttpError(404, "This invoice review is no longer available.")
  if (row.CUSTIE_StatusCode === "ready") return json(request, extractionResponse(row, Boolean(row.CUSTIE_SourceExtractionID), asRecord(row.CUSTIE_TimingsJSON)))
  if (row.CUSTIE_StatusCode === "processing") return json(request, { extractionId, status: "processing" }, 202)
  if (row.CUSTIE_StatusCode === "expired") throw new HttpError(410, "This invoice review has expired. Upload the invoice again.")
  if (row.CUSTIE_StatusCode === "cancelled") throw new HttpError(409, "Invoice import was cancelled.")
  throw new HttpError(422, "This invoice could not be imported. Upload it again to retry.")
}

async function cancelExtraction(request: Request, admin: SupabaseClient, actor: Actor, extractionId: string) {
  validateUuid(extractionId, "extraction")
  const row = await extractionRow(admin, extractionId, actor)
  if (!row) return json(request, {}, 204)
  if (row.CUSTIE_StatusCode === "processing") {
    const cancelledAt = new Date()
    await updateExtraction(admin, extractionId, {
      CUSTIE_StatusCode: "cancelled",
      CUSTIE_FailureCode: "cancelled_by_user",
      CUSTIE_UpdatedAt: cancelledAt.toISOString(),
      CUSTIE_CompletedAt: cancelledAt.toISOString(),
      CUSTIE_ExpiresAt: addHours(cancelledAt, failedRecordLifetimeHours).toISOString(),
    })
  }
  return json(request, {}, 204)
}

async function readInvoiceInput(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) throw new HttpError(400, "Choose a PDF commercial invoice to continue.")
  validatePdf(file)

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasPdfSignature(bytes)) throw new HttpError(415, "The selected file is not a valid PDF.")
  const extractionId = cleanText(form.get("extractionId"), 36)
  validateUuid(extractionId, "extraction")
  const declarationId = cleanText(form.get("declarationId"), 36) || null
  if (declarationId) validateUuid(declarationId, "declaration")
  return {
    extractionId,
    declarationId,
    bytes,
    fileName: cleanFileName(file.name),
    mimeType: "application/pdf",
  }
}

async function validateDeclaration(admin: SupabaseClient, actor: Actor, declarationId: string | null) {
  if (!declarationId) return
  const { data, error } = await admin.from("Customs_Declarations").select("CUST_id")
    .eq("CUST_id", declarationId).eq("CUST_CreatedBy", actor.userId).eq("CUST_IsDeleted", false).maybeSingle()
  if (error) throw new HttpError(503, "The declaration could not be checked before import.")
  if (!data) throw new HttpError(403, "You cannot import an invoice into this declaration.")
}

async function readyCanonical(admin: SupabaseClient, companyId: string, hash: string) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").select("*")
    .eq("CUSTIE_CompanyID", companyId)
    .eq("CUSTIE_SHA256", hash)
    .eq("CUSTIE_RequestedModel", MISTRAL_OCR_MODEL)
    .eq("CUSTIE_SchemaVersion", COMMERCIAL_INVOICE_SCHEMA_VERSION)
    .is("CUSTIE_SourceExtractionID", null)
    .eq("CUSTIE_StatusCode", "ready")
    .gt("CUSTIE_ExpiresAt", new Date().toISOString())
    .order("CUSTIE_CompletedAt", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(503, "Invoice import could not check previous results.")
  return data as Record<string, unknown> | null
}

async function claimCanonicalExtraction(
  admin: SupabaseClient,
  actor: Actor,
  input: Awaited<ReturnType<typeof readInvoiceInput>>,
  hash: string,
) {
  const { data, error } = await admin.from("Customs_InvoiceExtractions").insert({
    CUSTIE_ID: input.extractionId,
    CUSTIE_CompanyID: actor.companyId,
    CUSTIE_UserID: actor.userId,
    CUSTIE_DeclarationID: input.declarationId,
    CUSTIE_FileName: input.fileName,
    CUSTIE_MimeType: input.mimeType,
    CUSTIE_FileSizeBytes: input.bytes.byteLength,
    CUSTIE_SHA256: hash,
    CUSTIE_RequestedModel: MISTRAL_OCR_MODEL,
    CUSTIE_SchemaVersion: COMMERCIAL_INVOICE_SCHEMA_VERSION,
    CUSTIE_StatusCode: "processing",
  }).select("*").single()
  if (!error) return data as Record<string, unknown>
  if (error.code === "23505") return null
  throw new HttpError(503, "Invoice import could not be started.")
}

async function cloneCachedExtraction(
  admin: SupabaseClient,
  actor: Actor,
  input: Awaited<ReturnType<typeof readInvoiceInput>>,
  hash: string,
  cached: Record<string, unknown>,
) {
  if (cached.CUSTIE_ID === input.extractionId && cached.CUSTIE_UserID === actor.userId) return cached
  const now = new Date()
  const result = { ...asRecord(cached.CUSTIE_ResultJSON), extractionId: input.extractionId }
  const { data, error } = await admin.from("Customs_InvoiceExtractions").insert({
    CUSTIE_ID: input.extractionId,
    CUSTIE_CompanyID: actor.companyId,
    CUSTIE_UserID: actor.userId,
    CUSTIE_DeclarationID: input.declarationId,
    CUSTIE_SourceExtractionID: cached.CUSTIE_ID,
    CUSTIE_FileName: input.fileName,
    CUSTIE_MimeType: input.mimeType,
    CUSTIE_FileSizeBytes: input.bytes.byteLength,
    CUSTIE_SHA256: hash,
    CUSTIE_RequestedModel: MISTRAL_OCR_MODEL,
    CUSTIE_ProviderModel: cached.CUSTIE_ProviderModel,
    CUSTIE_SchemaVersion: COMMERCIAL_INVOICE_SCHEMA_VERSION,
    CUSTIE_StatusCode: "ready",
    CUSTIE_ResultJSON: result,
    CUSTIE_UsageJSON: {},
    CUSTIE_TimingsJSON: { cache_hit: 1 },
    CUSTIE_PageCount: cached.CUSTIE_PageCount,
    CUSTIE_CompletedAt: now.toISOString(),
    CUSTIE_ExpiresAt: cached.CUSTIE_ExpiresAt,
  }).select("*").single()
  if (error || !data) throw new HttpError(503, "The previous invoice result could not be opened.")
  return data as Record<string, unknown>
}

async function waitForCanonical(admin: SupabaseClient, companyId: string, hash: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await readyCanonical(admin, companyId, hash)
    if (ready) return ready
    await delay(500)
  }
  return null
}

async function storeTemporaryInvoice(
  admin: SupabaseClient,
  actor: Actor,
  input: Awaited<ReturnType<typeof readInvoiceInput>>,
  hash: string,
): Promise<TemporaryInvoice> {
  const storedObjectId = crypto.randomUUID()
  const createdAt = new Date()
  const objectPath = [
    "v1", "customs", "invoice-extractions", actor.companyId.replaceAll("-", ""), actor.userId.replaceAll("-", ""),
    String(createdAt.getUTCFullYear()), String(createdAt.getUTCMonth() + 1).padStart(2, "0"), `${input.extractionId}.pdf`,
  ].join("/")
  const { error: uploadError } = await admin.storage.from(documentBucket).upload(objectPath, input.bytes, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
    metadata: {
      concern: "customs",
      aggregatetype: "customs_invoice_extraction",
      aggregateid: input.extractionId.replaceAll("-", ""),
      companyid: actor.companyId.replaceAll("-", ""),
      userid: actor.userId.replaceAll("-", ""),
      sha256: hash,
    },
  })
  if (uploadError) throw new HttpError(503, "The invoice could not be uploaded securely. Try again.")

  const { error: catalogueError } = await admin.from("DOC_StoredObjects").insert({
    DOCStoredObject_ID: storedObjectId,
    DOCStoredObject_ConcernCode: "customs",
    DOCStoredObject_OrganisationID: null,
    DOCStoredObject_AggregateType: "customs_invoice_extraction",
    DOCStoredObject_AggregateID: input.extractionId,
    DOCStoredObject_ProviderCode: "supabase_storage",
    DOCStoredObject_Container: documentBucket,
    DOCStoredObject_BlobName: objectPath,
    DOCStoredObject_OriginalFileName: input.fileName,
    DOCStoredObject_MimeType: "application/pdf",
    DOCStoredObject_FileSizeBytes: input.bytes.byteLength,
    DOCStoredObject_SHA256: hash,
    DOCStoredObject_StatusCode: "active",
    DOCStoredObject_CreatedAt: createdAt.toISOString(),
    DOCStoredObject_CreatedBy: actor.userId,
  })
  if (catalogueError) {
    await admin.storage.from(documentBucket).remove([objectPath])
    throw new HttpError(503, "The invoice could not be prepared securely. Try again.")
  }

  const { data, error } = await admin.storage.from(documentBucket).createSignedUrl(objectPath, signedUrlLifetimeSeconds)
  if (error || !data?.signedUrl) {
    await cleanupTemporaryInvoice(admin, { storedObjectId, objectPath, signedUrl: "" })
    throw new HttpError(503, "The invoice could not be prepared securely. Try again.")
  }
  return { storedObjectId, objectPath, signedUrl: data.signedUrl }
}

async function cleanupTemporaryInvoice(admin: SupabaseClient, temporary: TemporaryInvoice) {
  const [storageResult, catalogueResult] = await Promise.all([
    admin.storage.from(documentBucket).remove([temporary.objectPath]),
    admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", temporary.storedObjectId),
  ])
  if (storageResult.error) console.error(`${functionName}: temporary storage cleanup failed`, { storedObjectId: temporary.storedObjectId })
  if (catalogueResult.error) console.error(`${functionName}: temporary catalogue cleanup failed`, { storedObjectId: temporary.storedObjectId })
}

async function extractWithMistralOcr(apiKey: string, signedUrl: string) {
  const providerResponse = await fetch(mistralOcrUrl, {
    method: "POST",
    headers: mistralHeaders(apiKey),
    body: JSON.stringify({
      model: MISTRAL_OCR_MODEL,
      document: { type: "document_url", document_url: signedUrl },
      include_blocks: true,
      include_image_base64: false,
      image_limit: 0,
      document_annotation_format: commercialInvoiceAnnotationFormat,
      document_annotation_prompt: [
        "Extract only commercial invoice item rows explicitly present in the document.",
        "Do not invent commodity codes, origin, weights, quantities, prices or package details.",
        "Use a one-based page number and preserve the source goods description.",
        "Return three-letter ISO currency and two-letter ISO origin only when explicitly stated.",
        "Keep item quantity separate from package count; return package count only when explicitly stated.",
        "Ignore logos, product photography, signatures, stamps and other decorative images.",
        "Do not return totals, tax, freight, discounts, addresses or payment terms as item rows.",
      ].join(" "),
    }),
    signal: AbortSignal.timeout(120_000),
  })
  return providerJson(providerResponse)
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
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "Multideck customs invoice extraction/3",
  }
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
  await admin.from("Customs_InvoiceExtractions").delete().in("CUSTIE_StatusCode", ["failed", "cancelled", "expired"])
    .lt("CUSTIE_ExpiresAt", now)
}

function extractionResponse(row: Record<string, unknown>, cacheHit: boolean, timings: Record<string, unknown>) {
  return {
    ...asRecord(row.CUSTIE_ResultJSON),
    extractionId: row.CUSTIE_ID,
    cacheHit,
    timings,
  }
}

function validatePdf(file: File) {
  if (!file.size) throw new HttpError(400, "The selected PDF is empty.")
  if (file.size > MAX_COMMERCIAL_INVOICE_BYTES) throw new HttpError(413, "Choose a PDF commercial invoice smaller than 10 MB.")
  const nameLooksLikePdf = file.name.toLowerCase().endsWith(".pdf")
  if (file.type !== "application/pdf" && !nameLooksLikePdf) throw new HttpError(415, "Only PDF commercial invoices are supported.")
}

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function actorFromProfile(profile: Record<string, unknown>): Actor {
  const userId = cleanText(profile.User_ID, 36)
  const companyId = cleanText(profile.Company_ID, 36)
  validateUuid(userId, "profile")
  validateUuid(companyId, "workspace")
  return { userId, companyId }
}

function validateUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `Choose a valid ${label}.`)
  }
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
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new HttpError(422, "This invoice could not be read. Choose a clearer PDF or try another invoice.")
  }
  return new HttpError(502, "Invoice import is temporarily unavailable. Try again.")
}

function failureCode(error: unknown) {
  if (error instanceof HttpError) return `http_${error.status}`
  if (error instanceof DOMException && error.name === "TimeoutError") return "provider_timeout"
  return "unexpected_error"
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000)
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function timedJson(
  request: Request,
  body: unknown,
  status: number,
  timings: RequestTimings,
) {
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
    try {
      return await action()
    } finally {
      this.phases.set(name, performance.now() - startedAt)
    }
  }

  measureSync<T>(name: string, action: () => T) {
    const startedAt = performance.now()
    try {
      return action()
    } finally {
      this.phases.set(name, performance.now() - startedAt)
    }
  }

  snapshot() {
    return Object.fromEntries([
      ...this.phases.entries().map(([name, duration]) => [name, Math.round(duration)] as const),
      ["total", Math.round(performance.now() - this.startedAt)] as const,
    ])
  }

  header() {
    return Object.entries(this.snapshot()).map(([name, duration]) => `${name};dur=${duration}`).join(", ")
  }
}
