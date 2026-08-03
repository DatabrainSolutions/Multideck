import assert from "node:assert/strict"
import test from "node:test"
import { hasUsableEmbeddedPdfText } from "../../multideck.client/src/lib/customs-invoice-pdf-text.ts"

test("accepts substantial embedded invoice text", () => {
  const text = [
    "Commercial Invoice INV-1042",
    "Seller Northwind Components Buyer Marlow Apparel Currency GBP",
    "Line SKU Description Quantity Unit Price Total Origin Commodity Code",
    ...Array.from({ length: 12 }, (_, index) => `${index + 1} SKU-${index + 1} replacement component ${index + 1} 4 25.00 100.00 GB 84713000`),
  ].join("\n")

  assert.equal(hasUsableEmbeddedPdfText(text), true)
})

test("rejects sparse or corrupted embedded text so Mistral OCR 4 can handle the PDF", () => {
  assert.equal(hasUsableEmbeddedPdfText("Commercial Invoice INV-1"), false)
  assert.equal(hasUsableEmbeddedPdfText(`Commercial Invoice ${"word ".repeat(60)}${"�".repeat(20)}`), false)
})
