import { getSupabaseSession, supabase, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

const endpoint = `${supabaseFunctionsUrl}/customs-invoice-ocr`
const maxBytes = 10 * 1024 * 1024

export type PurchaseOrderExtractionStage = "reading" | "extracting" | "organising"

export type ExtractedPurchaseOrderLine = {
  id: string
  lineNumber: number
  page: number
  sku: string
  supplierItemCode: string
  description: string
  quantity: number
  uomCode: string
  unitPrice: number
  taxRate: number
  currencyCode: string
  requestedDeliveryDate: string
}

export type PurchaseOrderExtractionResult = {
  number: string
  supplierName: string
  supplierReference: string
  buyerReference: string
  issueDate: string
  expectedDeliveryDate: string
  currencyCode: string
  deliveryTerms: string
  paymentTerms: string
  deliveryAddress: string
  notes: string
  lines: ExtractedPurchaseOrderLine[]
  model: string
  pageCount: number
  extractionMode: "mistral_ocr"
  timings: Record<string, number>
}

export class PurchaseOrderExtractionError extends Error {
  constructor(message: string, public status = 0) {
    super(message)
  }
}

export async function extractPurchaseOrder(
  file: File,
  options: { onStage?: (stage: PurchaseOrderExtractionStage) => void; signal?: AbortSignal } = {},
): Promise<PurchaseOrderExtractionResult> {
  validate(file)
  if (!supabase || !supabaseFunctionsUrl || !supabasePublicApiKey || !/^https?:\/\//.test(endpoint)) {
    throw new PurchaseOrderExtractionError("Purchase order extraction is unavailable for this workspace.", 503)
  }
  options.onStage?.("reading")
  options.onStage?.("extracting")
  const extractionId = crypto.randomUUID()
  let token = await accessToken(false)
  let response = await sendPdf(file, extractionId, token, options.signal)
  if (response.status === 401) {
    token = await accessToken(true)
    response = await sendPdf(file, extractionId, token, options.signal)
  }
  if (!response.ok) throw new PurchaseOrderExtractionError(await errorMessage(response), response.status)
  const payload = await response.json().catch(() => null)
  options.onStage?.("organising")
  return normalize(payload)
}

async function accessToken(refresh: boolean) {
  const current = await getSupabaseSession()
  if (refresh || (current?.expires_at && current.expires_at <= Math.floor(Date.now() / 1000) + 30)) {
    const { data, error } = await supabase!.auth.refreshSession()
    if (error) throw new PurchaseOrderExtractionError("Sign in again to import a purchase order.", 401)
    if (data.session?.access_token) return data.session.access_token
  }
  if (current?.access_token) return current.access_token
  throw new PurchaseOrderExtractionError("Sign in again to import a purchase order.", 401)
}

function sendPdf(file: File, extractionId: string, token: string, signal?: AbortSignal) {
  const form = new FormData()
  form.set("documentType", "purchase_order")
  form.set("extractionId", extractionId)
  form.set("file", file, file.name)
  return send(form, token, signal)
}

async function send(body: BodyInit, token: string, signal?: AbortSignal) {
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
        "x-client-info": "multideck-purchase-order-import/2",
      },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new PurchaseOrderExtractionError("Unable to import the purchase order. Check your connection and try again.")
  }
}

async function errorMessage(response: Response) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  return typeof payload.detail === "string" && payload.detail.trim()
    ? payload.detail
    : response.status === 429 ? "Purchase order extraction is busy. Wait a moment and try again." : "Unable to import this purchase order. Try again."
}

function validate(file: File) {
  if (!file.size) throw new PurchaseOrderExtractionError("The selected PDF is empty.", 400)
  if (file.size > maxBytes) throw new PurchaseOrderExtractionError("Choose a PDF purchase order smaller than 10 MB.", 413)
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new PurchaseOrderExtractionError("Only PDF purchase orders are supported.", 415)
}

function normalize(value: unknown): PurchaseOrderExtractionResult {
  const source = record(value)
  const lines = Array.isArray(source.lines) ? source.lines.flatMap((entry, index) => {
    const line = record(entry)
    const description = text(line.description)
    if (!description) return []
    return [{
      id: text(line.id) || crypto.randomUUID(),
      lineNumber: numeric(line.lineNumber) || index + 1,
      page: numeric(line.page) || 1,
      sku: text(line.sku),
      supplierItemCode: text(line.supplierItemCode),
      description,
      quantity: numeric(line.quantity),
      uomCode: text(line.uomCode) || "EA",
      unitPrice: numeric(line.unitPrice),
      taxRate: numeric(line.taxRate),
      currencyCode: text(line.currencyCode),
      requestedDeliveryDate: text(line.requestedDeliveryDate),
    }]
  }) : []
  if (!lines.length) throw new PurchaseOrderExtractionError("No purchase order lines were found. Check the PDF or choose another document.", 422)
  return {
    number: text(source.number),
    supplierName: text(source.supplierName),
    supplierReference: text(source.supplierReference),
    buyerReference: text(source.buyerReference),
    issueDate: text(source.issueDate),
    expectedDeliveryDate: text(source.expectedDeliveryDate),
    currencyCode: text(source.currencyCode),
    deliveryTerms: text(source.deliveryTerms),
    paymentTerms: text(source.paymentTerms),
    deliveryAddress: text(source.deliveryAddress),
    notes: text(source.notes),
    lines,
    model: text(source.model),
    pageCount: numeric(source.pageCount),
    extractionMode: "mistral_ocr",
    timings: Object.fromEntries(Object.entries(record(source.timings)).flatMap(([key, entry]) => typeof entry === "number" ? [[key, entry]] : [])),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
