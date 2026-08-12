import {
  getSupabaseSession,
  supabase,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase"
import type { ExtractedInvoiceLine } from "@/lib/customs-invoice-import"
import type { EvidenceBlock, EvidenceBox, EvidencePage } from "@/lib/customs-invoice-evidence"

const functionName = "customs-invoice-ocr"
const endpoint = `${supabaseFunctionsUrl}/${functionName}`
const maxInvoiceBytes = 10 * 1024 * 1024
const sessionRefreshLeewaySeconds = 30
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const acceptedExtensions = new Set(["pdf", "xlsx", "xls", "csv", "tsv", "docx", "doc", "ods", "odt", "png", "jpg", "jpeg", "webp"])

export const commercialInvoiceFileAccept = ".pdf,.xlsx,.xls,.csv,.tsv,.docx,.doc,.ods,.odt,.png,.jpg,.jpeg,.webp"

/** The observable phases of a server-owned import, in order. */
export type InvoiceImportStage = "uploading" | "converting" | "extracting" | "organising"

export type InvoiceDocumentMetadata = {
  sourceFormat: string
  sourceMimeType: string
  converted: boolean
  strategy: "passthrough" | "office_pdf" | "spreadsheet_normalised"
  sheets: Array<{ name: string; status: "included" | "hidden" | "empty" }>
  warnings: string[]
  normalizerVersion: number
  pageCount: number
  previewUrl: string
  previewExpiresAt: string
}

export type CommercialInvoiceExtractionResult = {
  extractionId: string
  invoiceNumber: string
  lines: ExtractedInvoiceLine[]
  model: string
  requestedModel: string
  pageCount: number
  extractionMode: "mistral_ocr"
  cacheHit: boolean
  /** Where each provider block sat, so reviewed lines can be shown in place. */
  evidencePages: EvidencePage[]
  timings: Record<string, number>
  document: InvoiceDocumentMetadata
}

export type ExtractCommercialInvoiceOptions = {
  extractionId?: string
  declarationId?: string
  onStage?: (stage: InvoiceImportStage) => void
  signal?: AbortSignal
}

export class CommercialInvoiceExtractionError extends Error {
  constructor(message: string, public status = 0) {
    super(message)
  }
}

export async function extractCommercialInvoice(
  file: File,
  {
    extractionId = crypto.randomUUID(),
    declarationId,
    onStage,
    signal,
  }: ExtractCommercialInvoiceOptions = {},
): Promise<CommercialInvoiceExtractionResult> {
  validateInvoice(file)
  validateConfiguration()
  if (!uuidPattern.test(extractionId)) throw new CommercialInvoiceExtractionError("Unable to start this invoice import.", 400)

  onStage?.("uploading")
  let conversionTimer: ReturnType<typeof globalThis.setTimeout> | undefined
  const onUploaded = () => {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      onStage?.("extracting")
      return
    }
    onStage?.("converting")
    conversionTimer = globalThis.setTimeout(() => onStage?.("extracting"), 1_200)
  }
  try {
    let token = await accessToken(false)
    let response = await uploadInvoice(file, extractionId, declarationId, token, signal, onUploaded)
    if (response.status === 401) {
      if (conversionTimer) globalThis.clearTimeout(conversionTimer)
      token = await accessToken(true)
      response = await uploadInvoice(file, extractionId, declarationId, token, signal, onUploaded)
    }
    const payload = await successfulPayload(response)
    onStage?.("organising")
    return normalizeResult(payload)
  } finally {
    if (conversionTimer) globalThis.clearTimeout(conversionTimer)
  }
}

export async function readCommercialInvoiceExtraction(
  extractionId: string,
  signal?: AbortSignal,
): Promise<CommercialInvoiceExtractionResult> {
  validateConfiguration()
  if (!uuidPattern.test(extractionId)) throw new CommercialInvoiceExtractionError("This invoice review is no longer available.", 404)

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await authenticatedRequest(`${endpoint}/${extractionId}`, { method: "GET", signal })
    if (response.status !== 202) return normalizeResult(await successfulPayload(response))
    await abortableDelay(1_000, signal)
  }
  throw new CommercialInvoiceExtractionError("Invoice import is taking longer than expected. Try opening the review again.", 408)
}

export async function cancelCommercialInvoiceExtraction(extractionId: string) {
  if (!uuidPattern.test(extractionId) || !supabaseFunctionsUrl || !supabasePublicApiKey) return
  try {
    await authenticatedRequest(`${endpoint}/${extractionId}`, { method: "DELETE" })
  } catch {
    // Cancellation is best effort. The server still removes temporary PDFs in its
    // request finalizer and will not return a cancelled result to the operator.
  }
}

async function accessToken(forceRefresh: boolean) {
  try {
    const current = await getSupabaseSession()
    const shouldRefresh = forceRefresh || Boolean(
      current?.expires_at && current.expires_at <= Math.floor(Date.now() / 1000) + sessionRefreshLeewaySeconds,
    )
    if (shouldRefresh) {
      const { data, error } = await supabase!.auth.refreshSession()
      if (error) throw error
      if (data.session?.access_token) return data.session.access_token
    }
    if (current?.access_token) return current.access_token
  } catch {
    throw new CommercialInvoiceExtractionError("Sign in again to import an invoice.", 401)
  }
  throw new CommercialInvoiceExtractionError("Sign in again to import an invoice.", 401)
}

function uploadInvoice(
  file: File,
  extractionId: string,
  declarationId: string | undefined,
  token: string,
  signal: AbortSignal | undefined,
  onUploaded: () => void,
) {
  const form = new FormData()
  form.set("file", file, file.name)
  form.set("extractionId", extractionId)
  if (declarationId && uuidPattern.test(declarationId)) form.set("declarationId", declarationId)

  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    const cleanup = () => signal?.removeEventListener("abort", abort)
    request.open("POST", endpoint)
    request.responseType = "text"
    request.setRequestHeader("Accept", "application/json")
    request.setRequestHeader("Authorization", `Bearer ${token}`)
    request.setRequestHeader("apikey", supabasePublicApiKey)
    request.setRequestHeader("x-client-info", "multideck-customs-invoice-import/3")
    request.upload.addEventListener("load", onUploaded, { once: true })
    request.addEventListener("load", () => {
      cleanup()
      resolve(new Response(request.responseText, {
        status: request.status,
        headers: responseHeaders(request.getAllResponseHeaders()),
      }))
    }, { once: true })
    request.addEventListener("error", () => {
      cleanup()
      reject(new CommercialInvoiceExtractionError("Unable to import the invoice. Check your connection and try again."))
    }, { once: true })
    request.addEventListener("abort", () => {
      cleanup()
      reject(new DOMException("Invoice import was cancelled.", "AbortError"))
    }, { once: true })
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    else request.send(form)
  })
}

async function authenticatedRequest(url: string, init: RequestInit) {
  let token = await accessToken(false)
  let response = await fetchWithToken(url, init, token)
  if (response.status === 401) {
    token = await accessToken(true)
    response = await fetchWithToken(url, init, token)
  }
  return response
}

function fetchWithToken(url: string, init: RequestInit, token: string) {
  return fetch(url, {
    ...init,
    credentials: "omit",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabasePublicApiKey,
      "x-client-info": "multideck-customs-invoice-import/3",
      ...init.headers,
    },
  })
}

function responseHeaders(raw: string) {
  const headers = new Headers()
  raw.trim().split(/[\r\n]+/).forEach((line) => {
    const separator = line.indexOf(":")
    if (separator > 0) headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  })
  return headers
}

function validateConfiguration() {
  if (!supabase || !supabaseFunctionsUrl || !supabasePublicApiKey || !/^https?:\/\//.test(endpoint)) {
    throw new CommercialInvoiceExtractionError("Invoice import is unavailable for this workspace.", 503)
  }
}

function validateInvoice(file: File) {
  if (!file.size) throw new CommercialInvoiceExtractionError("The selected invoice file is empty.", 400)
  if (file.size > maxInvoiceBytes) throw new CommercialInvoiceExtractionError("Choose an invoice file smaller than 10 MB.", 413)
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1] ?? ""
  if (!acceptedExtensions.has(extension)) {
    throw new CommercialInvoiceExtractionError("Choose a PDF, Excel, CSV, Word or image invoice.", 415)
  }
}

async function successfulPayload(response: Response) {
  if (!response.ok) {
    const fallback = response.status === 429
      ? "Invoice import is busy. Wait a moment and try again."
      : "Unable to import this invoice. Try again."
    throw new CommercialInvoiceExtractionError(await errorMessage(response, fallback), response.status)
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new CommercialInvoiceExtractionError("Unable to import this invoice. Try again.", response.status)
  }
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as Record<string, unknown>
    return typeof payload.detail === "string" && payload.detail.trim() ? payload.detail : fallback
  } catch {
    return fallback
  }
}

function normalizeResult(payload: unknown): CommercialInvoiceExtractionResult {
  const result = asRecord(payload)
  const extractionId = text(result.extractionId)
  const sourceLines = Array.isArray(result.lines) ? result.lines : []
  const lines = sourceLines.map(normalizeLine).filter((line): line is ExtractedInvoiceLine => line !== null)
  if (!uuidPattern.test(extractionId) || !lines.length) {
    throw new CommercialInvoiceExtractionError("No item lines were found. Check the PDF or choose another invoice.", 422)
  }
  return {
    extractionId,
    invoiceNumber: text(result.invoiceNumber),
    lines,
    model: text(result.model),
    requestedModel: text(result.requestedModel),
    pageCount: number(result.pageCount),
    extractionMode: "mistral_ocr",
    cacheHit: result.cacheHit === true,
    evidencePages: normalizeEvidencePages(result.pages),
    timings: numberRecord(result.timings),
    document: normalizeDocumentMetadata(result.document),
  }
}

function normalizeDocumentMetadata(value: unknown): InvoiceDocumentMetadata {
  const source = asRecord(value)
  const strategy = source.strategy === "office_pdf" || source.strategy === "spreadsheet_normalised" ? source.strategy : "passthrough"
  const sheets = Array.isArray(source.sheets) ? source.sheets.flatMap((entry) => {
    const sheet = asRecord(entry)
    const name = text(sheet.name)
    const status: InvoiceDocumentMetadata["sheets"][number]["status"] = sheet.status === "hidden" || sheet.status === "empty" ? sheet.status : "included"
    return name ? [{ name, status }] : []
  }) : []
  return {
    sourceFormat: text(source.sourceFormat),
    sourceMimeType: text(source.sourceMimeType),
    converted: source.converted === true,
    strategy,
    sheets,
    warnings: Array.isArray(source.warnings) ? source.warnings.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [],
    normalizerVersion: number(source.normalizerVersion),
    pageCount: number(source.pageCount),
    previewUrl: text(source.previewUrl),
    previewExpiresAt: text(source.previewExpiresAt),
  }
}

function normalizeEvidencePages(value: unknown): EvidencePage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const source = asRecord(entry)
    const page = number(source.page)
    const width = number(source.width)
    const height = number(source.height)
    const blocks = Array.isArray(source.blocks) ? source.blocks.flatMap(normalizeEvidenceBlock) : []
    if (page < 1 || width <= 0 || height <= 0 || !blocks.length) return []
    return [{ page, width, height, blocks }]
  })
}

function normalizeEvidenceBlock(value: unknown): EvidenceBlock[] {
  const source = asRecord(value)
  const box = normalizeEvidenceBox(source.box)
  const id = text(source.id)
  if (!box || !id) return []
  return [{ id, type: text(source.type) || "text", text: text(source.text), box }]
}

function normalizeEvidenceBox(value: unknown): EvidenceBox | null {
  const source = asRecord(value)
  const x = number(source.x)
  const y = number(source.y)
  const width = number(source.width)
  const height = number(source.height)
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > 1 || y > 1) return null
  return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) }
}

function normalizeLine(value: unknown): ExtractedInvoiceLine | null {
  const line = asRecord(value)
  const description = text(line.description)
  if (!description) return null
  return {
    id: text(line.id) || crypto.randomUUID(),
    invoiceLine: number(line.invoiceLine) || 1,
    page: number(line.page) || 1,
    sku: text(line.sku),
    commodityCode: text(line.commodityCode),
    description,
    quantity: number(line.quantity) || 1,
    unitPrice: number(line.unitPrice),
    currency: text(line.currency),
    netMass: number(line.netMass),
    grossMass: number(line.grossMass),
    originCountry: text(line.originCountry),
    packageKind: text(line.packageKind),
    packageMarks: text(line.packageMarks),
    packageCount: number(line.packageCount),
  }
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer)
      reject(new DOMException("Invoice import was cancelled.", "AbortError"))
    }, { once: true })
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function numberRecord(value: unknown) {
  return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([key, item]) => {
    return typeof item === "number" && Number.isFinite(item) && item >= 0 ? [[key, item]] : []
  }))
}
