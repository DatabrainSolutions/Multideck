import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const { quoteDocumentCargo, quoteDocumentCargoTotals } = await load(read('../functions/_shared/quote-document-cargo.ts'))
const renderer = read('../functions/_shared/quote-pdf.ts')
const { renderQuotePdfHtml, quotePdfName } = await load(renderer.slice(renderer.indexOf('export type QuotePdfDataset')))
const workflow = read('../functions/quotes-workflow/index.ts')
const helpers = workflow.slice(workflow.indexOf('function isObject('), workflow.indexOf('function isOperationalContactRole('))
const datasetSource = workflow.slice(workflow.indexOf('function printable('), workflow.indexOf('\ntype QuoteIssueRecipient'))
assert.ok(datasetSource.includes('async function quotePdfDataset('))
// Run the production dataset builder and formatting functions. Only private
// company branding/storage reads are fixture boundaries; no email or DB write.
const buildDataset = new Function('workspaceBrand', 'quoteDocumentCargo', 'quoteDocumentCargoTotals', 'QuoteWorkflowError', 'templateSourcesBucket',
  stripTypeScriptTypes(helpers + datasetSource) + '\nreturn quotePdfDataset;')(
  async () => null, quoteDocumentCargo, quoteDocumentCargoTotals, Error, 'test-template-sources')
const admin = { from(table) {
  assert.equal(table, 'cmp_Company', 'Document must not fetch live payer/commercial records')
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { Company_Name: 'Test freight company' }, error: null }) }
  return query
} }
const context = {
  reference: 'JQ20020', operator: { companyId: crypto.randomUUID() }, customerName: 'NEW CUSTOMER NAME',
  recipient: { name: 'NEW CONTACT', email: 'delivery-override@example.test' },
  quote: { CusQuoteHeader_TermsText: 'NEW TERMS', CusQuoteHeader_CustomerNotes: 'NEW NOTES',
    CusQuoteHeader_ValidTo: '2030-01-01', CusQuoteHeader_ModeCode: 'air',
    CusQuoteHeader_LoadingPoint: 'NEW ORIGIN', CusQuoteHeader_DischargePoint: 'NEW DESTINATION',
    CusQuoteHeader_ServiceLevel: 'NEW SERVICE', CusQuoteHeader_CarrierNameSnapshot: 'NEW CARRIER',
    CusQuoteHeader_ContactEmailSnapshot: 'new-party@example.test', CusQuoteHeader_CustomerReference: 'NEW REFERENCE' },
}
const quote = {
  terms: 'Agreed terms on V1', customerNotes: 'Handle with care', validTo: '2026-09-18',
  customerName: 'Original customer', contactName: 'Original contact', contactEmail: 'original@example.test',
  payer: { name: 'Original payer', email: 'payer@example.test' }, customerReference: 'ORDER1',
  mode: 'sea', shipmentType: 'FCL', serviceLevel: 'Standard', loadingPoint: 'GBFXT', dischargePoint: 'CNSHA',
  shipmentFacts: {
    subjectToTerms: 'Subject to agreed space', packageQuantity: 9999, grossWeightKg: 9999,
    cargoLines: [
      { id: crypto.randomUUID(), description: 'Machinery & <parts>', commodity: 'Machinery', packageQuantity: 2, packageType: 'Crates', grossWeightKg: '1200.1', netWeightKg: 1100, volumeCbm: '2.1', length: 230, width: 100, height: 125, lengthUnit: 'cm', hsCode: '840999', countryOfOrigin: 'GB', internalNotes: 'PRIVATE CARGO NOTES', supplierCost: 'PRIVATE COST' },
      { id: crypto.randomUUID(), description: 'Spare parts {d.company.name}', packageQuantity: 3, packageType: 'Cartons', grossWeightKg: '75.2', chargeableWeightKg: 90, volumeCbm: '0.2', isHazardous: true, isTemperatureControlled: true },
    ],
  },
  charges: [
    { description: 'Freight', sellAmount: 500, sellCurrency: 'GBP', quantity: 1, showToCustomer: true, costAmount: 'PRIVATE CHARGE', internalNotes: 'PRIVATE MARGIN' },
    { description: 'HIDDEN CHARGE', sellAmount: 100, showToCustomer: false },
  ],
}
const version = { CusQuoteVersion_Number: 1, CusQuoteVersion_CreatedAt: '2026-09-04T12:00:00Z', CusQuoteVersion_SnapshotJSON: { quote } }

test('PDF dataset retains saved terms, parties, routes and all cargo despite later master changes', async () => {
  const before = structuredClone(version)
  const data = await buildDataset(admin, context, version)
  assert.equal(data.terms, quote.terms)
  assert.equal(data.customerNotes, quote.customerNotes)
  assert.equal(data.conditions, quote.shipmentFacts.subjectToTerms)
  assert.equal(data.quote.billedToName, 'Original payer')
  assert.equal(data.quote.customerEmail, 'original@example.test')
  assert.equal(data.quote.validUntil, '18 Sept 2026')
  assert.equal(data.routes[0].movement, 'GBFXT → CNSHA')
  assert.equal(data.routes[0].mode, 'SEA')
  assert.equal(data.cargo.length, 2)
  assert.equal(data.cargo[1].packages, '3 · Cartons')
  assert.match(data.cargo[1].details, /Hazardous · Temperature controlled/)
  assert.match(data.cargo[0].measurements, /230 × 100 × 125 cm/)
  assert.equal(data.shipment[2].value, '5 · 1275.3 kg')
  assert.match(data.shipment[3].value, /^2.3 CBM/)
  assert.equal(data.charges.length, 1)
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|HIDDEN CHARGE|NEW /)
  assert.deepEqual(version, before)
  const laterContext = { ...context, quote: new Proxy({}, { get() { throw new Error('Current header read during immutable rendering') } }) }
  assert.deepEqual(await buildDataset(admin, laterContext, version), data)
})

test('blank and missing historical fields stay blank or unknown rather than borrowing newer values', async () => {
  const legacy = { ...version, CusQuoteVersion_SnapshotJSON: { quote: { terms: '', customerNotes: '', shipmentFacts: {} } } }
  const data = await buildDataset(admin, context, legacy)
  assert.equal(data.terms, 'No additional terms recorded in this quote version.')
  assert.equal(data.customerNotes, 'No additional notes.')
  assert.equal(data.conditions, 'No additional conditions recorded in this quote version.')
  assert.equal(data.quote.validUntil, '—')
  assert.equal(data.journey[1].value, '—')
  assert.doesNotMatch(JSON.stringify(data), /NEW |delivery-override|new-party/)
  await assert.rejects(buildDataset(admin, context, { ...version, CusQuoteVersion_SnapshotJSON: null }))
})

test('an explicit single route and every line of a long cargo list are retained', async () => {
  const singleRoute = { mode: 'rail', origin: { unlocode: 'GBLON' }, destination: { unlocode: 'FRPAR' }, estimatedDeparture: '2026-09-05', estimatedArrival: '2026-09-06' }
  const facts = { cargoLines: Array.from({ length: 500 }, (_, i) => ({ description: `Line ${i + 1}`, packageQuantity: 1, grossWeightKg: 0, volumeCbm: '0.1' })), routingLegs: [singleRoute] }
  const data = await buildDataset(admin, context, { ...version, CusQuoteVersion_SnapshotJSON: { quote: { ...quote, shipmentFacts: facts } } })
  assert.equal(data.routes.length, 1)
  assert.equal(data.routes[0].mode, 'RAIL')
  assert.equal(data.routes[0].movement, 'GBLON → FRPAR')
  assert.equal(data.cargo.length, 500)
  assert.equal(data.cargo.at(-1).description, 'Line 500')
  assert.equal(data.shipment[2].value, '500 · 0 kg')
  assert.match(data.shipment[3].value, /^50 CBM/)
})

test('structured cargo is authoritative, unknown totals stay unknown and malformed data fails visibly', () => {
  const facts = { packageQuantity: 999, grossWeightKg: 999, cargoLines: [{ description: 'A', packageQuantity: 2, grossWeightKg: 10 }, { description: 'B', packageQuantity: 1 }] }
  assert.deepEqual(quoteDocumentCargoTotals(facts), { packageQuantity: '3', grossWeightKg: '', volumeCbm: '' })
  assert.deepEqual(quoteDocumentCargo({ ...facts, cargoLines: [] }), [])
  for (const value of [null, {}, ['wrong'], Array.from({ length: 501 }, () => ({})), [{ grossWeightKg: 'NaN' }], [{ grossWeightKg: -1 }], [{ isHazardous: 'true' }]]) {
    assert.throws(() => quoteDocumentCargo({ cargoLines: value }), /Invalid saved/)
  }
  assert.equal(quoteDocumentCargo({ knownCargo: 'Legacy goods', packageQuantity: 4, packageType: 'Pallets' })[0].packages, '4 · Pallets')
})

test('actual HTML renderer escapes source text, keeps all cargo rows and excludes private commercial fields', async () => {
  const data = await buildDataset(admin, context, version)
  const html = renderQuotePdfHtml(data)
  assert.match(html, /Machinery &amp; &lt;parts&gt;/)
  assert.match(html, /Spare parts &#123;d.company.name&#125;/)
  assert.match(html, /3 · Cartons/)
  assert.match(html, /Agreed terms on V1/)
  assert.doesNotMatch(html, /\{d\.|PRIVATE|HIDDEN CHARGE|NEW TERMS/)
  assert.equal((html.match(/<tr><td>[12]<\/td><td>/g) || []).length, 2)
  assert.equal(quotePdfName('JQ20020', 1), 'JQ20020')
  assert.equal(quotePdfName('JQ20020', 2), 'JQ20020 - V2')
})

// Optional local visual-QA output, generated from the production dataset and
// renderer. It contains synthetic data only and never contacts Carbone/tenants.
if (process.env.QUOTE_DOCUMENT_QA_DIR) {
  const data = await buildDataset(admin, context, version)
  writeFileSync(join(process.env.QUOTE_DOCUMENT_QA_DIR, 'quote-cargo-short.html'), renderQuotePdfHtml(data))
  const longQuote = structuredClone(quote)
  longQuote.shipmentFacts.cargoLines = Array.from({ length: 70 }, (_, index) => ({
    ...quote.shipmentFacts.cargoLines[index % 2], description: `Cargo ${index + 1}: ${'Carefully packed industrial components and accessories. '.repeat(index === 34 ? 12 : 2)}`,
  }))
  const longData = await buildDataset(admin, context, { ...version, CusQuoteVersion_SnapshotJSON: { quote: longQuote } })
  writeFileSync(join(process.env.QUOTE_DOCUMENT_QA_DIR, 'quote-cargo-long.html'), renderQuotePdfHtml(longData))
}
