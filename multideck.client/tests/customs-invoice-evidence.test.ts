import assert from "node:assert/strict"
import test from "node:test"
import {
  buildInvoiceLineEvidence,
  matchInvoiceLineEvidence,
  type EvidenceLineInput,
  type EvidencePage,
} from "../src/lib/customs-invoice-evidence.ts"

const laptop: EvidenceLineInput = {
  id: "line-1",
  page: 1,
  sku: "SKU-44",
  description: "Rugged laptop computer",
  quantity: 4,
  unitPrice: 600,
}

const charger: EvidenceLineInput = {
  id: "line-2",
  page: 1,
  sku: "SKU-90",
  description: "Replacement charger",
  quantity: 10,
  unitPrice: 25,
}

const rowPage: EvidencePage = {
  page: 1,
  width: 1000,
  height: 1400,
  blocks: [
    { id: "row-1", type: "line", text: "Line SKU Description Quantity Unit price Total", box: { x: 0.06, y: 0.26, width: 0.88, height: 0.02 } },
    { id: "row-2", type: "line", text: "1 SKU-44 Rugged laptop computer 4 600.00 2,400.00", box: { x: 0.06, y: 0.3, width: 0.88, height: 0.02 } },
    { id: "row-3", type: "line", text: "2 SKU-90 Replacement charger 10 25.00 250.00", box: { x: 0.06, y: 0.34, width: 0.88, height: 0.02 } },
    { id: "row-4", type: "line", text: "Payment terms 30 days from invoice date", box: { x: 0.06, y: 0.7, width: 0.5, height: 0.02 } },
  ],
}

test("points a line at its own row on a text invoice", () => {
  const evidence = buildInvoiceLineEvidence([laptop, charger], [rowPage])

  assert.equal(evidence["line-1"].page, 1)
  assert.equal(evidence["line-1"].box.y, 0.3)
  assert.equal(evidence["line-1"].approximate, false)
  assert.ok(evidence["line-1"].strength > 0.8, `weak match: ${evidence["line-1"].strength}`)
  assert.equal(evidence["line-2"].box.y, 0.34)
})

test("keeps unrelated content and unmatched lines out of the evidence", () => {
  const evidence = buildInvoiceLineEvidence([{
    id: "line-3",
    page: 1,
    sku: "",
    description: "Handling surcharge",
    quantity: 1,
    unitPrice: 0,
  }], [rowPage])

  assert.deepEqual(evidence, {})
  assert.equal(matchInvoiceLineEvidence(laptop, []), null)
})

test("narrows a transcribed table down to the matching row", () => {
  const tablePage: EvidencePage = {
    page: 2,
    width: 1000,
    height: 1000,
    blocks: [{
      id: "block-2-1",
      type: "table",
      box: { x: 0.05, y: 0.2, width: 0.9, height: 0.3 },
      text: [
        "| Line | SKU | Description | Qty | Total |",
        "| --- | --- | --- | --- | --- |",
        "| 1 | SKU-44 | Rugged laptop computer | 4 | 2400.00 |",
        "| 2 | SKU-90 | Replacement charger | 10 | 250.00 |",
      ].join("\n"),
    }],
  }

  const located = matchInvoiceLineEvidence({ ...laptop, page: 2 }, [tablePage])

  assert.ok(located)
  assert.equal(located.approximate, true)
  assert.equal(located.page, 2)
  assert.equal(Math.round(located.box.y * 1000) / 1000, 0.3)
  assert.equal(Math.round(located.box.height * 1000) / 1000, 0.1)
})

test("two lines that read alike still point at different rows", () => {
  const repeatedPage: EvidencePage = {
    page: 1,
    width: 800,
    height: 1000,
    blocks: [
      { id: "row-1", type: "line", text: "1 BOLT-M6 Steel bolt M6 10 5.00 50.00", box: { x: 0.05, y: 0.4, width: 0.9, height: 0.02 } },
      { id: "row-2", type: "line", text: "2 BOLT-M6 Steel bolt M6 20 5.00 100.00", box: { x: 0.05, y: 0.44, width: 0.9, height: 0.02 } },
    ],
  }
  const first: EvidenceLineInput = { id: "a", page: 1, sku: "BOLT-M6", description: "Steel bolt M6", quantity: 10, unitPrice: 5 }
  const second: EvidenceLineInput = { id: "b", page: 1, sku: "BOLT-M6", description: "Steel bolt M6", quantity: 20, unitPrice: 5 }

  const evidence = buildInvoiceLineEvidence([first, second], [repeatedPage])

  assert.equal(evidence.a.box.y, 0.4)
  assert.equal(evidence.b.box.y, 0.44)
})

test("prefers the page the line was extracted from", () => {
  const decoyPage: EvidencePage = {
    ...rowPage,
    page: 5,
    blocks: [{ ...rowPage.blocks[1], id: "row-decoy" }],
  }

  const located = matchInvoiceLineEvidence(laptop, [decoyPage, rowPage])

  assert.ok(located)
  assert.equal(located.page, 1)
})
