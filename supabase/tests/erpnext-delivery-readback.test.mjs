import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const read = name => readFileSync(new URL(`../functions/_shared/${name}.ts`, import.meta.url), 'utf8')
const decimalsUrl = url(stripTypeScriptTypes(read('accounting-readback')))
const readbackUrl = url(stripTypeScriptTypes(read('erpnext-readback')).replace('./accounting-readback.ts', decimalsUrl))
const { compareErpNextReadback: compare } = await import(readbackUrl)
const { accountingDecimal } = await import(decimalsUrl)

const invoice = (typeCode = 'sl_invoice') => ({
  providerCode: 'erpnext', externalCompany: 'Example Freight', baseCurrencyCode: 'GBP',
  localTable: 'FIN_Documents', localId: 'local-1', localNumber: 'INV-1', typeCode,
  documentDate: '2026-09-15', dueDate: '2026-10-15', currencyCode: 'GBP', exchangeRate: 1,
  amount: 120, localAmount: 120, reference: 'INV-1', partyProviderId: 'PARTY-1',
  bankProviderAccount: 'Bank', receivableProviderAccount: 'Debtors', payableProviderAccount: 'Creditors',
  lines: [{ description: 'Freight', quantity: 2, unitAmount: 50, netAmount: 100, taxAmount: 20, taxRatePercent: 20,
    providerTaxCode: 'VAT20', providerItemCode: 'FREIGHT', providerAccountCode: 'Freight income' }],
  allocations: [], existingExternalId: null, existingExternalObjectType: null,
})
const invoiceDocument = (input = invoice(), docstatus = 0) => {
  const sales = ['sl_invoice', 'credit_note'].includes(input.typeCode)
  const credit = ['credit_note', 'debit_note'].includes(input.typeCode)
  const sign = credit ? -1 : 1
  return {
    name: 'ERP-1', doctype: sales ? 'Sales Invoice' : 'Purchase Invoice', company: input.externalCompany, docstatus,
    [sales ? 'customer' : 'supplier']: input.partyProviderId, posting_date: input.documentDate, due_date: input.dueDate,
    currency: input.currencyCode, conversion_rate: input.exchangeRate, is_return: credit ? 1 : 0,
    grand_total: sign * input.amount, base_grand_total: sign * input.localAmount, rounding_adjustment: 0, base_rounding_adjustment: 0,
    disable_rounded_total: 0, rounded_total: sign * input.amount, base_rounded_total: sign * input.localAmount,
    net_total: sign * 100, total_taxes_and_charges: sign * 20,
    items: [{ item_code: 'FREIGHT', [sales ? 'income_account' : 'expense_account']: 'Freight income',
      qty: sign * 2, rate: 50, net_amount: sign * 100, item_tax_template: 'VAT20' }],
  }
}
const payment = (typeCode = 'customer_receipt') => ({ ...invoice(typeCode), localTable: 'FIN_CashTransactions',
  lines: [], dueDate: null, amount: 120, localAmount: 96, currencyCode: 'EUR', exchangeRate: 0.8,
  allocations: [{ providerDocumentType: typeCode === 'customer_receipt' ? 'Sales Invoice' : 'Purchase Invoice', providerDocumentId: 'ERP-INV-1', amount: 100 }] })
const paymentDocument = (input = payment(), docstatus = 0) => ({
  name: 'ERP-1', doctype: 'Payment Entry', company: input.externalCompany, docstatus, posting_date: input.documentDate,
  payment_type: input.typeCode === 'customer_receipt' ? 'Receive' : 'Pay', party_type: input.typeCode === 'customer_receipt' ? 'Customer' : 'Supplier', party: input.partyProviderId,
  paid_from: input.typeCode === 'customer_receipt' ? 'Debtors' : 'Bank', paid_to: input.typeCode === 'customer_receipt' ? 'Bank' : 'Creditors',
  paid_from_account_currency: 'EUR', paid_to_account_currency: 'EUR', paid_amount: 120, received_amount: 120,
  source_exchange_rate: 0.8, target_exchange_rate: 0.8, base_paid_amount: 96, base_received_amount: 96,
  difference_amount: 0, deductions: [], taxes: [], total_allocated_amount: 100, unallocated_amount: 20,
  references: [{ reference_doctype: input.allocations[0].providerDocumentType, reference_name: 'ERP-INV-1', allocated_amount: 100 }],
})

test('decimal comparison preserves precision, accepts numeric strings and rejects missing or malformed evidence', () => {
  assert.equal(accountingDecimal('0.100000000'), accountingDecimal(0.1))
  assert.equal(accountingDecimal(1e-9), 1n)
  assert.equal(accountingDecimal('-0.000000001'), -1n)
  assert.notEqual(accountingDecimal('9007199.254740991'), accountingDecimal('9007199.254740992'))
  for (const bad of [null, undefined, '', ' ', true, [], {}, NaN, Infinity, '1e1000000', '0x10', '1,000', '0.0000000001']) assert.equal(accountingDecimal(bad), null)
})

test('sales, purchases and both credit polarities match exactly', () => {
  for (const type of ['sl_invoice', 'pl_invoice', 'credit_note', 'debit_note']) {
    const input = invoice(type)
    const doc = invoiceDocument(input, 1)
    doc.grand_total = String(doc.grand_total) + '.0000'
    assert.deepEqual(compare(input, doc, 'ERP-1', 1).differences, [])
    assert.equal(compare(input, { ...doc, grand_total: -Number(doc.grand_total) }, 'ERP-1', 1).status, 'mismatch')
  }
})

test('changed identity, company, state, currency, tax, rounding and missing evidence fail closed', () => {
  const input = invoice()
  for (const patch of [
    { name: 'OTHER' }, { company: 'Foreign Company' }, { doctype: 'Purchase Invoice' }, { customer: 'OTHER' },
    { docstatus: 2 }, { currency: 'USD' }, { conversion_rate: 1.01 }, { posting_date: '2026-09-16' },
    { due_date: '2026-10-16' }, { grand_total: 120.0001 }, { grand_total: null }, { base_grand_total: 121 },
    { total_taxes_and_charges: 19 }, { net_total: 101 }, { rounding_adjustment: 0.01 }, { rounded_total: 121 },
    { base_rounding_adjustment: 0.01 }, { base_rounded_total: 121 }, { items: [] }, { items: null },
  ]) assert.equal(compare(input, { ...invoiceDocument(input), ...patch }, 'ERP-1', 0).status, 'mismatch', JSON.stringify(patch))
  assert.equal(compare(input, null, 'ERP-1', 0).status, 'mismatch')
})

test('a matching header cannot conceal changed or extra accounting lines', () => {
  for (const patch of [{ qty: 1 }, { rate: 51 }, { net_amount: 99 }, { item_code: 'OTHER' }, { income_account: 'Wrong account' }, { item_tax_template: 'VAT5' }]) {
    const doc = invoiceDocument()
    Object.assign(doc.items[0], patch)
    assert.equal(compare(invoice(), doc, 'ERP-1', 0).status, 'mismatch')
  }
  const doc = invoiceDocument()
  doc.items.push({ ...doc.items[0], qty: 0, net_amount: 0 })
  assert.equal(compare(invoice(), doc, 'ERP-1', 0).status, 'mismatch')
})

test('receipts and supplier payments check currencies, accounts, allocations and unsolicited adjustments', () => {
  for (const type of ['customer_receipt', 'supplier_payment']) {
    const input = payment(type)
    assert.equal(compare(input, paymentDocument(input), 'ERP-1', 0).status, 'matched')
    for (const patch of [{ paid_to: 'Wrong bank' }, { paid_from_account_currency: 'GBP' }, { target_exchange_rate: 1 },
      { received_amount: 119 }, { base_received_amount: 95 }, { difference_amount: 1 }, { unallocated_amount: 21 },
      { deductions: [{ amount: 1 }, { amount: -1 }] }, { taxes: [{ tax_amount: 0 }] }, { references: null }]) {
      assert.equal(compare(input, { ...paymentDocument(input), ...patch }, 'ERP-1', 0).status, 'mismatch')
    }
    const doc = paymentDocument(input)
    doc.references = [doc.references[0], { ...doc.references[0] }]
    assert.equal(compare(input, doc, 'ERP-1', 0).status, 'mismatch')
    doc.references = [{ ...doc.references[0], reference_name: 'UNRELATED' }]
    assert.equal(compare(input, doc, 'ERP-1', 0).status, 'mismatch')
  }
})

// Exercise the production adapter orchestration, replacing only the network
// boundary. No live provider documents or tenant records are created by tests.
const backendUrl = url('export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }')
let providerState
globalThis.__erpnextReadbackTest = {
  async list(doctype, fields, filters) {
    const names = filters[0][1] === 'in' ? filters[0][2] : [filters[0][2]]
    return names.map(name => ({ name, company: 'Example Freight', default_currency: 'GBP', account_currency: 'GBP', disabled: 0 }))
  },
  async create() { providerState.calls.push('create'); return { name: 'ERP-1', key: providerState.identityKey } },
  async submit() { providerState.calls.push('submit'); if (providerState.submitError) throw new Error('Submission response lost'); return {} },
  async request(path) {
    providerState.calls.push('read')
    assert.equal(path, '/api/resource/Sales%20Invoice/ERP-1')
    const value = providerState.reads.shift()
    if (value instanceof Error) throw value
    return { data: value }
  },
}
const erpUrl = url(`
export const erpNextList = (...args) => globalThis.__erpnextReadbackTest.list(...args);
export const erpNextCreate = (...args) => globalThis.__erpnextReadbackTest.create(...args);
export const erpNextSubmit = (...args) => globalThis.__erpnextReadbackTest.submit(...args);
export const erpNextRequest = (...args) => globalThis.__erpnextReadbackTest.request(...args);
export const erpNextOrigin = () => 'https://accounting.example.test';`)
const identityUrl = url('export const ensureErpNextDocument = async () => { const created = await globalThis.__erpnextReadbackTest.create(); return { externalId: created.name, key: created.key ?? null }; };')
const providerUrl = url(stripTypeScriptTypes(read('accounting-providers'), { mode: 'transform' })
  .replace('./backend.ts', backendUrl).replace('./erpnext.ts', erpUrl).replace('./erpnext-readback.ts', readbackUrl).replace('./erpnext-document-identity.ts', identityUrl))
const { exportFinanceRecord, AccountingProviderPartialError } = await import(providerUrl)

test('delivery reads and checks the draft before submit and verifies the persisted submitted record', async () => {
  providerState = { calls: [], reads: [invoiceDocument(), invoiceDocument(invoice(), 1)] }
  const result = await exportFinanceRecord(invoice())
  assert.deepEqual(providerState.calls, ['create', 'read', 'submit', 'read'])
  assert.equal(result.responsePayload.docstatus, 1)
  assert.equal(result.responsePayload.multideckDeliveryVerification.scope, 'document_delivery')
  assert.equal(result.responsePayload.multideckDeliveryVerification.status, 'matched')
})

test('draft drift blocks submission and retains the exact external ID and differences', async () => {
  providerState = { calls: [], reads: [{ ...invoiceDocument(), grand_total: 130 }] }
  await assert.rejects(exportFinanceRecord(invoice()), error => {
    assert.ok(error instanceof AccountingProviderPartialError)
    assert.equal(error.externalId, 'ERP-1')
    assert.equal(error.readback.status, 'mismatch')
    assert.ok(error.readback.differences.some(item => item.field === 'grand_total'))
    return true
  })
  assert.deepEqual(providerState.calls, ['create', 'read'])
})

test('submission drift, missing evidence and network failures retain references without claiming success', async () => {
  for (const after of [{ ...invoiceDocument(invoice(), 1), grand_total: 130 }, invoiceDocument(), null, new Error('Readback unavailable')]) {
    providerState = { calls: [], reads: [invoiceDocument(), after] }
    await assert.rejects(exportFinanceRecord(invoice()), error => error instanceof AccountingProviderPartialError && error.externalId === 'ERP-1')
    assert.deepEqual(providerState.calls, ['create', 'read', 'submit', 'read'])
  }
})

test('retry recovers a submitted record after a lost response without creating or submitting again', async () => {
  providerState = { calls: [], reads: [invoiceDocument()], submitError: true }
  await assert.rejects(exportFinanceRecord(invoice()), error => error instanceof AccountingProviderPartialError && error.externalId === 'ERP-1')
  providerState = { calls: [], reads: [invoiceDocument(invoice(), 1)] }
  const result = await exportFinanceRecord({ ...invoice(), existingExternalId: 'ERP-1', existingExternalObjectType: 'Sales Invoice' })
  assert.equal(result.externalId, 'ERP-1')
  assert.deepEqual(providerState.calls, ['read'])
})

test('retrying a cancelled or changed retained reference never submits or creates a replacement', async () => {
  for (const patch of [{ docstatus: 2 }, { company: 'Foreign Company' }, { customer: 'OTHER' }]) {
    providerState = { calls: [], reads: [{ ...invoiceDocument(), ...patch }] }
    await assert.rejects(exportFinanceRecord({ ...invoice(), existingExternalId: 'ERP-1', existingExternalObjectType: 'Sales Invoice' }), AccountingProviderPartialError)
    assert.deepEqual(providerState.calls, ['read'])
  }
})

// Queue completion and issue isolation now run against real PostgreSQL in
// finance-export-atomic-postgres.test.mjs, replacing the old in-memory update mock.

test('a provider that drops the unique document key cannot submit and its reference is retained', async () => {
  providerState = { calls: [], identityKey: 'expected-key', reads: [invoiceDocument()] }
  await assert.rejects(exportFinanceRecord(invoice()), error => error instanceof AccountingProviderPartialError && error.externalId === 'ERP-1' && /unique Multideck/.test(error.message))
  assert.deepEqual(providerState.calls, ['create', 'read'])
})
