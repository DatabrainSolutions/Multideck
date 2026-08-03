import {
  getSupabaseSession,
  supabase,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase"
import type { ExtractedInvoiceLine } from "@/lib/customs-invoice-import"
import { extractEmbeddedPdfText } from "@/lib/customs-invoice-pdf-text"

const functionName = "customs-invoice-ocr"
const endpoint = `${supabaseFunctionsUrl}/${functionName}`
const maxInvoiceBytes = 10 * 1024 * 1024
const sessionRefreshLeewaySeconds = 30

export type CommercialInvoiceExtractionResult = {
  invoiceNumber: string
  lines: ExtractedInvoiceLine[]
  model: string
  pageCount: number
  extractionMode: "embedded_text" | "mistral_ocr"
  timings: Record<string, number>
}

export class CommercialInvoiceExtractionError extends Error {
  constructor(message: string, public status = 0) {
    super(message)
  }
}

export async function extractCommercialInvoice(file: File): Promise<CommercialInvoiceExtractionResult> {
  validateInvoice(file)
  if (!supabase || !supabaseFunctionsUrl || !supabasePublicApiKey || !/^https?:\/\//.test(endpoint)) {
    throw new CommercialInvoiceExtractionError("Commercial invoice extraction is not configured for this workspace.", 503)
  }

  const embeddedPdfText = await extractEmbeddedPdfText(file)
  let token = await accessToken(false)
  let response = embeddedPdfText
    ? await sendEmbeddedText(file, embeddedPdfText, token)
    : await sendPdf(file, token)

  if (response.status === 401) {
    token = await accessToken(true)
    response = embeddedPdfText
      ? await sendEmbeddedText(file, embeddedPdfText, token)
      : await sendPdf(file, token)
  }

  if (embeddedPdfText && await requestsMistralOcrFallback(response)) {
    response = await sendPdf(file, token)
    if (response.status === 401) response = await sendPdf(file, await accessToken(true))
  }

  if (!response.ok) {
    const fallback = response.status === 429
      ? "Invoice extraction is busy. Wait a moment and try again."
      : "The invoice could not be extracted. Try again."
    throw new CommercialInvoiceExtractionError(await errorMessage(response, fallback), response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CommercialInvoiceExtractionError("Invoice extraction returned an unexpected response.", response.status)
  }
  return normalizeResult(payload)
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
) {
  return send(JSON.stringify({
    embeddedText: embeddedPdfText.text,
    fileName: file.name,
    pageCount: embeddedPdfText.pageCount,
  }), token, "application/json")
}

function sendPdf(file: File, token: string) {
  const form = new FormData()
  form.set("file", file, file.name)
  return send(form, token)
}

async function send(body: BodyInit, token: string, contentType?: string) {
  try {
    return await fetch(endpoint, {
      method: "POST",
      body,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        apikey: supabasePublicApiKey,
        "x-client-info": "multideck-customs-invoice-import/1",
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
    })
  } catch {
    throw new CommercialInvoiceExtractionError("Unable to reach invoice extraction. Check your connection and try again.")
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

function normalizeResult(payload: unknown): CommercialInvoiceExtractionResult {
  const result = asRecord(payload)
  const sourceLines = Array.isArray(result.lines) ? result.lines : []
  const lines = sourceLines.map(normalizeLine).filter((line): line is ExtractedInvoiceLine => line !== null)
  if (!lines.length) throw new CommercialInvoiceExtractionError("No commercial invoice item lines were found in this PDF.", 422)
  return {
    invoiceNumber: text(result.invoiceNumber),
    lines,
    model: text(result.model),
    pageCount: number(result.pageCount),
    extractionMode: result.extractionMode === "embedded_text" ? "embedded_text" : "mistral_ocr",
    timings: numberRecord(result.timings),
  }
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
