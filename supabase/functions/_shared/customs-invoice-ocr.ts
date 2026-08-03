export const MISTRAL_OCR_MODEL = "mistral-ocr-4-0"
export const MISTRAL_TEXT_MODEL = "mistral-small-latest"
export const MAX_COMMERCIAL_INVOICE_BYTES = 10 * 1024 * 1024
export const MAX_COMMERCIAL_INVOICE_TEXT_CHARS = 160_000

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
