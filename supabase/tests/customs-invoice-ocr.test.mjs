import assert from "node:assert/strict"
import test from "node:test"
import { normalizeCommercialInvoiceAnnotation } from "../functions/_shared/customs-invoice-ocr.ts"

test("normalizes Mistral document annotations without inventing customs data", () => {
  const annotation = JSON.stringify({
    invoice_number: " INV-1042 ",
    currency: "gbp",
    lines: [
      {
        line_number: 7,
        page_number: 2,
        sku: " SKU-44 ",
        commodity_code: "84.71.30.00",
        description: "  Rugged laptop computer  ",
        quantity: 4,
        unit_price: null,
        line_total: 2400,
        currency: null,
        net_mass_kg: 12.3456,
        gross_mass_kg: null,
        origin_country: "gb",
        package_kind: null,
        package_marks: " CRATE A ",
        package_count: 2,
      },
      {
        line_number: null,
        page_number: null,
        sku: null,
        commodity_code: null,
        description: "Replacement charger",
        quantity: null,
        unit_price: 25,
        line_total: null,
        currency: "EUR",
        net_mass_kg: null,
        gross_mass_kg: null,
        origin_country: null,
        package_kind: null,
        package_marks: null,
        package_count: null,
      },
    ],
  })

  const result = normalizeCommercialInvoiceAnnotation(annotation)

  assert.equal(result.invoiceNumber, "INV-1042")
  assert.equal(result.lines.length, 2)
  assert.deepEqual(result.lines[0], {
    id: "ocr-line-1",
    invoiceLine: 7,
    page: 2,
    sku: "SKU-44",
    commodityCode: "84713000",
    description: "Rugged laptop computer",
    quantity: 4,
    unitPrice: 600,
    currency: "GBP",
    netMass: 12.346,
    grossMass: 0,
    originCountry: "GB",
    packageKind: "",
    packageMarks: "CRATE A",
    packageCount: 2,
  })
  assert.equal(result.lines[1].commodityCode, "")
  assert.equal(result.lines[1].quantity, 1)
  assert.equal(result.lines[1].page, 1)
})

test("filters non-item annotations", () => {
  const result = normalizeCommercialInvoiceAnnotation({
    invoice_number: null,
    currency: null,
    lines: [{ description: "  " }, { description: null }],
  })
  assert.deepEqual(result, { invoiceNumber: "", lines: [] })
})

test("turns provider blocks into page-fraction boxes for the review screen", () => {
  const pages = normalizeInvoiceEvidencePages({
    pages: [
      {
        index: 0,
        dimensions: { dpi: 200, width: 1000, height: 1400 },
        blocks: [
          { type: "Table", top_left_x: 50, top_left_y: 280, bottom_right_x: 950, bottom_right_y: 700, content: "| 1 | SKU-44 | Rugged laptop |" },
          { type: "text", bbox: { x: 100, y: 100, width: 300, height: 40 }, text: "Commercial invoice INV-1042" },
          { type: "text", top_left_x: 10, top_left_y: 10, bottom_right_x: 11, bottom_right_y: 11, content: "speck" },
          { type: "text", content: "no box at all" },
        ],
      },
      { index: 1, dimensions: { width: 0, height: 0 }, blocks: [{ top_left_x: 1, top_left_y: 1, bottom_right_x: 9, bottom_right_y: 9, content: "unusable page" }] },
    ],
  })

  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0], {
    page: 1,
    width: 1000,
    height: 1400,
    blocks: [
      { id: "block-1-1", type: "table", text: "| 1 | SKU-44 | Rugged laptop |", box: { x: 0.05, y: 0.2, width: 0.9, height: 0.3 } },
      { id: "block-1-2", type: "text", text: "Commercial invoice INV-1042", box: { x: 0.1, y: 0.07143, width: 0.3, height: 0.02857 } },
    ],
  })
})

test("keeps block text inside a budget without losing the boxes", () => {
  const long = "wheel bearing assembly ".repeat(400)
  const pages = normalizeInvoiceEvidencePages({
    pages: [{
      index: 0,
      dimensions: { width: 100, height: 100 },
      blocks: Array.from({ length: 400 }, (_, index) => ({
        type: "table",
        top_left_x: 5,
        top_left_y: index % 90,
        bottom_right_x: 95,
        bottom_right_y: (index % 90) + 5,
        content: long,
      })),
    }],
  })

  const characters = pages[0].blocks.reduce((total, block) => total + block.text.length, 0)
  assert.equal(pages[0].blocks.length, MAX_INVOICE_EVIDENCE_BLOCKS)
  assert.ok(characters <= MAX_INVOICE_EVIDENCE_BUDGET_CHARS, `budget exceeded: ${characters}`)
  assert.ok(pages[0].blocks.at(-1).box.width > 0)
})

test("returns no evidence when the provider sends no pages", () => {
  assert.deepEqual(normalizeInvoiceEvidencePages({}), [])
  assert.deepEqual(normalizeInvoiceEvidencePages(null), [])
})
