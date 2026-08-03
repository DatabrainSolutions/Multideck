import {
  getSupabaseSession,
  supabase,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase"
import type { ExtractedInvoiceLine } from "@/lib/customs-invoice-import"
import type { EvidenceBlock, EvidenceBox, EvidencePage } from "@/lib/customs-invoice-evidence"
import { extractEmbeddedPdfText } from "@/lib/customs-invoice-pdf-text"

const functionName = "customs-invoice-ocr"
const endpoint = `${supabaseFunctionsUrl}/${functionName}`
const maxInvoiceBytes = 10 * 1024 * 1024
const sessionRefreshLeewaySeconds = 30

/** The observable phases of an import, in order. */
export type InvoiceImportStage = "reading" | "extracting" | "organising"

export type CommercialInvoiceExtractionResult = {
  invoiceNumber: string
  lines: ExtractedInvoiceLine[]
  model: string
  pageCount: number
  extractionMode: "embedded_text" | "mistral_ocr"
  /** Where each block of the document sat, so reviewed lines can be shown in place. */
  evidencePages: EvidencePage[]
  timings: Record<string, number>
}

export type ExtractCommercialInvoiceOptions = {
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
  { onStage, signal }: ExtractCommercialInvoiceOptions = {},
): Promise<CommercialInvoiceExtractionResult> {
  validateInvoice(file)
  if (!supabase || !supabaseFunctionsUrl || !supabasePublicApiKey || !/^https?:\/\//.test(endpoint)) {
    throw new CommercialInvoiceExtractionError("Invoice import is unavailable for this workspace.", 503)
  }

  onStage?.("reading")
  const embeddedPdfText = await extractEmbeddedPdfText(file)

  onStage?.("extracting")
  let token = await accessToken(false)
  let response = embeddedPdfText
    ? await sendEmbeddedText(file, embeddedPdfText, token, signal)
    : await sendPdf(file, token, signal)

  if (response.status === 401) {
    token = await accessToken(true)
    response = embeddedPdfText
      ? await sendEmbeddedText(file, embeddedPdfText, token, signal)
      : await sendPdf(file, token, signal)
  }

  if (embeddedPdfText && await requestsMistralOcrFallback(response)) {
    response = await sendPdf(file, token, signal)
    if (response.status === 401) response = await sendPdf(file, await accessToken(true), signal)
  }

  if (!response.ok) {
    const fallback = response.status === 429
      ? "Invoice import is busy. Wait a moment and try again."
      : "Unable to import this invoice. Try again."
    throw new CommercialInvoiceExtractionError(await errorMessage(response, fallback), response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CommercialInvoiceExtractionError("Unable to import this invoice. Try again.", response.status)
  }

  onStage?.("organising")
  // Text PDFs keep their row geometry in the browser; scanned PDFs get block boxes back.
  return normalizeResult(payload, embeddedPdfText?.pages ?? [])
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

async function sendEmbeddedText(
  file: File,
  embeddedPdfText: { text: string; pageCount: number },
  token: string,
  signal?: AbortSignal,
) {
  return send(JSON.stringify({
    embeddedText: embeddedPdfText.text,
    fileName: file.name,
    pageCount: embeddedPdfText.pageCount,
  }), token, signal, "application/json")
}

function sendPdf(file: File, token: string, signal?: AbortSignal) {
  const form = new FormData()
  form.set("file", file, file.name)
  return send(form, token, signal)
}

async function send(body: BodyInit, token: string, signal?: AbortSignal, contentType?: string) {
  try {
    return await fetch(endpoint, {
      method: "POST",
      body,
      credentials: "omit",
      signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        apikey: supabasePublicApiKey,
        "x-client-info": "multideck-customs-invoice-import/1",
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
    })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error
    throw new CommercialInvoiceExtractionError("Unable to import the invoice. Check your connection and try again.")
  }
}

async function requestsMistralOcrFallback(response: Response) {
  if (response.status !== 422) return false
  try {
    const payload = await response.clone().json() as Record<string, unknown>
    return payload.fallbackToMistralOcr === true
  } catch {
    return false
  }
}

function validateInvoice(file: File) {
  if (!file.size) throw new CommercialInvoiceExtractionError("The selected PDF is empty.", 400)
  if (file.size > maxInvoiceBytes) throw new CommercialInvoiceExtractionError("Choose a PDF commercial invoice smaller than 10 MB.", 413)
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new CommercialInvoiceExtractionError("Only PDF commercial invoices are supported.", 415)
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

function normalizeResult(payload: unknown, embeddedPages: EvidencePage[]): CommercialInvoiceExtractionResult {
  const result = asRecord(payload)
  const sourceLines = Array.isArray(result.lines) ? result.lines : []
  const lines = sourceLines.map(normalizeLine).filter((line): line is ExtractedInvoiceLine => line !== null)
  if (!lines.length) throw new CommercialInvoiceExtractionError("No item lines were found. Check the PDF or choose another invoice.", 422)
  const extractionMode = result.extractionMode === "embedded_text" ? "embedded_text" : "mistral_ocr"
  const servicePages = normalizeEvidencePages(result.pages)
  return {
    invoiceNumber: text(result.invoiceNumber),
    lines,
    model: text(result.model),
    pageCount: number(result.pageCount),
    extractionMode,
    evidencePages: servicePages.length ? servicePages : extractionMode === "embedded_text" ? embeddedPages : [],
    timings: numberRecord(result.timings),
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
