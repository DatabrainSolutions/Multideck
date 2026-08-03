import { authenticate, corsHeaders, currentInternalUser, HttpError, json } from "../_shared/backend.ts"
import {
  commercialInvoiceAnnotationFormat,
  extractPageConfidences,
  MAX_COMMERCIAL_INVOICE_BYTES,
  MISTRAL_OCR_MODEL,
  normalizeCommercialInvoiceAnnotation,
} from "../_shared/customs-invoice-ocr.ts"

const functionName = "customs-invoice-ocr"
const mistralOcrUrl = "https://api.mistral.ai/v1/ocr"

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to extract a commercial invoice.")

    const { admin, user } = await authenticate(request)
    await currentInternalUser(admin, user)

    const apiKey = Deno.env.get("MISTRAL_OCR_API_KEY")?.trim()
    if (!apiKey) throw new HttpError(503, "Commercial invoice extraction is not configured for this workspace.")

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new HttpError(400, "Choose a PDF commercial invoice to continue.")
    validatePdf(file)

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!hasPdfSignature(bytes)) throw new HttpError(415, "The selected file is not a valid PDF.")

    const providerResponse = await fetch(mistralOcrUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Multideck customs invoice extraction/1",
      },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
        },
        table_format: "markdown",
        include_blocks: false,
        include_image_base64: false,
        image_limit: 0,
        confidence_scores_granularity: "page",
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

    if (!providerResponse.ok) {
      const requestId = providerResponse.headers.get("x-request-id") || providerResponse.headers.get("request-id") || "unknown"
      console.error(`${functionName}: Mistral OCR failed`, { status: providerResponse.status, requestId })
      throw providerError(providerResponse.status)
    }

    const providerPayload = await providerResponse.json() as Record<string, unknown>
    const extraction = normalizeCommercialInvoiceAnnotation(
      providerPayload.document_annotation,
      extractPageConfidences(providerPayload),
    )
    if (!extraction.lines.length) throw new HttpError(422, "No commercial invoice item lines were found in this PDF.")

    const usage = asRecord(providerPayload.usage_info)
    return json(request, {
      invoiceNumber: extraction.invoiceNumber,
      lines: extraction.lines,
      model: typeof providerPayload.model === "string" ? providerPayload.model : MISTRAL_OCR_MODEL,
      pageCount: Array.isArray(providerPayload.pages) ? providerPayload.pages.length : 0,
      usage: { pagesProcessed: finiteNumber(usage.pages_processed) ?? finiteNumber(usage.pages) ?? 0 },
    })
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(`${functionName}: unexpected extraction error`, error)
    const publicError = error instanceof HttpError ? error : new HttpError(500, "The invoice could not be extracted. Try again.")
    return json(request, { detail: publicError.message }, publicError.status)
  }
})

function validatePdf(file: File) {
  if (!file.size) throw new HttpError(400, "The selected PDF is empty.")
  if (file.size > MAX_COMMERCIAL_INVOICE_BYTES) throw new HttpError(413, "Choose a PDF commercial invoice smaller than 10 MB.")
  const nameLooksLikePdf = file.name.toLowerCase().endsWith(".pdf")
  if (file.type !== "application/pdf" && !nameLooksLikePdf) throw new HttpError(415, "Only PDF commercial invoices are supported.")
}

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function providerError(status: number) {
  if (status === 429) return new HttpError(429, "Invoice extraction is busy. Wait a moment and try again.")
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new HttpError(422, "Mistral could not read this invoice. Try a clearer PDF.")
  }
  return new HttpError(502, "Mistral invoice extraction is temporarily unavailable. Try again.")
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
