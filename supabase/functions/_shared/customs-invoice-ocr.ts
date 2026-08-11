export const MISTRAL_OCR_MODEL = "mistral-ocr-4-0"
export const COMMERCIAL_INVOICE_SCHEMA_VERSION = 2
export const MAX_COMMERCIAL_INVOICE_BYTES = 10 * 1024 * 1024

export const MAX_INVOICE_EVIDENCE_PAGES = 30
export const MAX_INVOICE_EVIDENCE_BLOCKS = 320
export const MAX_INVOICE_EVIDENCE_BUDGET_CHARS = 120_000
export const MAX_INVOICE_EVIDENCE_BLOCK_CHARS = 400
export const MAX_INVOICE_EVIDENCE_TABLE_CHARS = 4_000

export const commercialInvoiceAnnotationFormat = {
  type: "json_schema",
  json_schema: {
    name: "commercial_invoice",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["invoice_number", "currency", "lines"],
      properties: {
        invoice_number: nullableString(),
        currency: nullableString(),
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "line_number", "page_number", "sku", "commodity_code", "description",
              "quantity", "unit_price", "line_total", "currency", "net_mass_kg",
              "gross_mass_kg", "origin_country", "package_kind", "package_marks",
              "package_count",
            ],
            properties: {
              line_number: nullableNumber(),
              page_number: nullableNumber(),
              sku: nullableString(),
              commodity_code: nullableString(),
              description: { type: "string" },
              quantity: nullableNumber(),
              unit_price: nullableNumber(),
              line_total: nullableNumber(),
              currency: nullableString(),
              net_mass_kg: nullableNumber(),
              gross_mass_kg: nullableNumber(),
              origin_country: nullableString(),
              package_kind: nullableString(),
              package_marks: nullableString(),
              package_count: nullableNumber(),
            },
          },
        },
      },
    },
  },
} as const

export const purchaseOrderAnnotationFormat = {
  type: "json_schema",
  json_schema: {
    name: "purchase_order",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "purchase_order_number", "supplier_name", "supplier_reference", "buyer_reference",
        "issue_date", "expected_delivery_date", "currency", "delivery_terms",
        "payment_terms", "delivery_address", "notes", "lines",
      ],
      properties: {
        purchase_order_number: nullableString(),
        supplier_name: nullableString(),
        supplier_reference: nullableString(),
        buyer_reference: nullableString(),
        issue_date: nullableString(),
        expected_delivery_date: nullableString(),
        currency: nullableString(),
        delivery_terms: nullableString(),
        payment_terms: nullableString(),
        delivery_address: nullableString(),
        notes: nullableString(),
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "line_number", "page_number", "sku", "supplier_item_code", "description",
              "quantity", "uom_code", "unit_price", "line_total", "tax_rate",
              "currency", "requested_delivery_date",
            ],
            properties: {
              line_number: nullableNumber(),
              page_number: nullableNumber(),
              sku: nullableString(),
              supplier_item_code: nullableString(),
              description: { type: "string" },
              quantity: nullableNumber(),
              uom_code: nullableString(),
              unit_price: nullableNumber(),
              line_total: nullableNumber(),
              tax_rate: nullableNumber(),
              currency: nullableString(),
              requested_delivery_date: nullableString(),
            },
          },
        },
      },
    },
  },
} as const

export type ExtractedCommercialInvoiceLine = {
  id: string
  invoiceLine: number
  page: number
  sku: string
  commodityCode: string
  description: string
  quantity: number
  unitPrice: number
  currency: string
  netMass: number
  grossMass: number
  originCountry: string
  packageKind: string
  packageMarks: string
  packageCount: number
}

export type CommercialInvoiceExtraction = {
  invoiceNumber: string
  lines: ExtractedCommercialInvoiceLine[]
}

export type PurchaseOrderExtraction = {
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
  lines: Array<{
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
  }>
}

/** A bounding box expressed as page fractions so the browser can overlay it at any zoom. */
export type InvoiceEvidenceBox = {
  x: number
  y: number
  width: number
  height: number
}

export type InvoiceEvidenceBlock = {
  id: string
  type: string
  text: string
  box: InvoiceEvidenceBox
}

export type InvoiceEvidencePage = {
  page: number
  width: number
  height: number
  blocks: InvoiceEvidenceBlock[]
}

/**
 * Turns the provider's paragraph-level blocks into page-fraction boxes the review
 * screen can draw over the operator's own document. Text is kept only so the browser
 * can match a block back to an extracted item line, so it stays inside a budget.
 */
export function normalizeInvoiceEvidencePages(payload: unknown): InvoiceEvidencePage[] {
  const sourcePayload = asRecord(payload)
  const sourcePages = Array.isArray(sourcePayload.pages) ? sourcePayload.pages : []
  const pages: InvoiceEvidencePage[] = []
  let remainingChars = MAX_INVOICE_EVIDENCE_BUDGET_CHARS

  for (const [pageIndex, source] of sourcePages.slice(0, MAX_INVOICE_EVIDENCE_PAGES).entries()) {
    const sourcePage = asRecord(source)
    const dimensions = asRecord(sourcePage.dimensions)
    const width = positiveNumber(dimensions.width)
    const height = positiveNumber(dimensions.height)
    if (width === null || height === null) continue

    const sourceBlocks = Array.isArray(sourcePage.blocks) ? sourcePage.blocks : []
    const blocks: InvoiceEvidenceBlock[] = []

    for (const [blockIndex, sourceBlock] of sourceBlocks.slice(0, MAX_INVOICE_EVIDENCE_BLOCKS).entries()) {
      const block = asRecord(sourceBlock)
      const box = evidenceBox(block, width, height)
      if (!box) continue

      const type = cleanText(block.type, 40).toLowerCase() || "text"
      const limit = type === "table" ? MAX_INVOICE_EVIDENCE_TABLE_CHARS : MAX_INVOICE_EVIDENCE_BLOCK_CHARS
      const text = remainingChars > 0 ? blockText(block, Math.min(limit, remainingChars)) : ""
      remainingChars -= text.length

      blocks.push({ id: `block-${pageIndex + 1}-${blockIndex + 1}`, type, text, box })
    }

    if (!blocks.length) continue
    // The provider numbers pages from zero; every Multideck surface counts from one.
    const page = Math.round(nonNegativeNumber(sourcePage.index) ?? pageIndex) + 1
    pages.push({ page, width: Math.round(width), height: Math.round(height), blocks })
  }

  return pages
}

/**
 * Accepts either the provider's corner coordinates or a bounding-box object, and returns
 * fractions of the page. Boxes too small to point at anything are dropped.
 */
function evidenceBox(block: Record<string, unknown>, width: number, height: number): InvoiceEvidenceBox | null {
  const bbox = asRecord(block.bbox ?? block.bounding_box)
  const left = finiteNumber(block.top_left_x ?? bbox.top_left_x ?? bbox.x)
  const top = finiteNumber(block.top_left_y ?? bbox.top_left_y ?? bbox.y)
  if (left === null || top === null) return null

  const explicitWidth = finiteNumber(bbox.width)
  const explicitHeight = finiteNumber(bbox.height)
  const right = explicitWidth !== null ? left + explicitWidth : finiteNumber(block.bottom_right_x ?? bbox.bottom_right_x)
  const bottom = explicitHeight !== null ? top + explicitHeight : finiteNumber(block.bottom_right_y ?? bbox.bottom_right_y)
  if (right === null || bottom === null) return null

  const x = clampFraction(Math.min(left, right) / width)
  const y = clampFraction(Math.min(top, bottom) / height)
  const boxWidth = clampFraction(Math.abs(right - left) / width, 1 - x)
  const boxHeight = clampFraction(Math.abs(bottom - top) / height, 1 - y)
  if (boxWidth < 0.004 || boxHeight < 0.002) return null

  return { x: round(x, 5), y: round(y, 5), width: round(boxWidth, 5), height: round(boxHeight, 5) }
}

function blockText(block: Record<string, unknown>, maxLength: number) {
  const source = [block.content, block.text, block.markdown].find((value) => typeof value === "string" && value.trim())
  if (typeof source !== "string") return ""
  return source.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().slice(0, Math.max(0, maxLength))
}

function clampFraction(value: number, max = 1) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), max)
}

export function normalizeCommercialInvoiceAnnotation(
  annotation: unknown,
): CommercialInvoiceExtraction {
  const parsed = typeof annotation === "string" ? parseAnnotation(annotation) : annotation
  const record = asRecord(parsed)
  const documentCurrency = currencyCode(record.currency)
  const sourceLines = Array.isArray(record.lines) ? record.lines : []

  const lines = sourceLines.flatMap((source, index) => {
    const line = asRecord(source)
    const description = cleanText(line.description, 800)
    if (!description) return []

    const quantity = positiveNumber(line.quantity) || 1
    const explicitUnitPrice = nonNegativeNumber(line.unit_price)
    const lineTotal = nonNegativeNumber(line.line_total)
    const unitPrice = explicitUnitPrice ?? (lineTotal === null ? 0 : lineTotal / quantity)
    const page = Math.max(1, Math.round(positiveNumber(line.page_number) || 1))

    return [{
      id: `ocr-line-${index + 1}`,
      invoiceLine: Math.max(1, Math.round(positiveNumber(line.line_number) || index + 1)),
      page,
      sku: cleanText(line.sku, 120),
      commodityCode: cleanCommodityCode(line.commodity_code),
      description,
      quantity,
      unitPrice: round(unitPrice, 6),
      currency: currencyCode(line.currency) || documentCurrency,
      netMass: round(nonNegativeNumber(line.net_mass_kg) ?? 0, 3),
      grossMass: round(nonNegativeNumber(line.gross_mass_kg) ?? 0, 3),
      originCountry: countryCode(line.origin_country),
      packageKind: cleanText(line.package_kind, 35).toUpperCase(),
      packageMarks: cleanText(line.package_marks, 140),
      packageCount: round(nonNegativeNumber(line.package_count) ?? 0, 3),
    }]
  })

  return {
    invoiceNumber: cleanText(record.invoice_number, 80),
    lines,
  }
}

export function normalizePurchaseOrderAnnotation(annotation: unknown): PurchaseOrderExtraction {
  const parsed = typeof annotation === "string" ? parseAnnotation(annotation) : annotation
  const record = asRecord(parsed)
  const documentCurrency = currencyCode(record.currency)
  const sourceLines = Array.isArray(record.lines) ? record.lines : []
  const lines = sourceLines.flatMap((source, index) => {
    const line = asRecord(source)
    const description = cleanText(line.description, 800)
    if (!description) return []
    const quantity = positiveNumber(line.quantity) ?? 0
    const explicitUnitPrice = nonNegativeNumber(line.unit_price)
    const lineTotal = nonNegativeNumber(line.line_total)
    const unitPrice = explicitUnitPrice ?? (lineTotal === null || quantity === 0 ? 0 : lineTotal / quantity)
    return [{
      id: `po-ocr-line-${index + 1}`,
      lineNumber: Math.max(1, Math.round(positiveNumber(line.line_number) || index + 1)),
      page: Math.max(1, Math.round(positiveNumber(line.page_number) || 1)),
      sku: cleanText(line.sku, 120),
      supplierItemCode: cleanText(line.supplier_item_code, 120),
      description,
      quantity: round(quantity, 6),
      uomCode: cleanText(line.uom_code, 20).toUpperCase() || "EA",
      unitPrice: round(unitPrice, 6),
      taxRate: round(nonNegativeNumber(line.tax_rate) ?? 0, 4),
      currencyCode: currencyCode(line.currency) || documentCurrency,
      requestedDeliveryDate: isoDate(line.requested_delivery_date),
    }]
  })
  return {
    number: cleanText(record.purchase_order_number, 120),
    supplierName: cleanText(record.supplier_name, 240),
    supplierReference: cleanText(record.supplier_reference, 160),
    buyerReference: cleanText(record.buyer_reference, 160),
    issueDate: isoDate(record.issue_date),
    expectedDeliveryDate: isoDate(record.expected_delivery_date),
    currencyCode: documentCurrency,
    deliveryTerms: cleanText(record.delivery_terms, 180),
    paymentTerms: cleanText(record.payment_terms, 180),
    deliveryAddress: cleanText(record.delivery_address, 1_000),
    notes: cleanText(record.notes, 1_000),
    lines,
  }
}

function nullableString() {
  return { anyOf: [{ type: "string" }, { type: "null" }] } as const
}

function nullableNumber() {
  return { anyOf: [{ type: "number" }, { type: "null" }] } as const
}

function parseAnnotation(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : ""
}

function cleanCommodityCode(value: unknown) {
  return cleanText(value, 40).replace(/\D/g, "").slice(0, 10)
}

function currencyCode(value: unknown) {
  const currency = cleanText(value, 3).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : ""
}

function countryCode(value: unknown) {
  const country = cleanText(value, 2).toUpperCase()
  return /^[A-Z]{2}$/.test(country) ? country : ""
}

function isoDate(value: unknown) {
  const date = cleanText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""
}

function finiteNumber(value: unknown) {
  const result = typeof value === "number" ? value : Number.NaN
  return Number.isFinite(result) ? result : null
}

function positiveNumber(value: unknown) {
  const result = finiteNumber(value)
  return result !== null && result > 0 ? result : null
}

function nonNegativeNumber(value: unknown) {
  const result = finiteNumber(value)
  return result !== null && result >= 0 ? result : null
}

function round(value: number, precision: number) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
