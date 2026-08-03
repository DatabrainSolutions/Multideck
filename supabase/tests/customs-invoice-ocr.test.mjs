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
