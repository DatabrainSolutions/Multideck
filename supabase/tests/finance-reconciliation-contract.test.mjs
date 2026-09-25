import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBankStatementCsv } from '../functions/_shared/bank-statement-csv.mts'
import { compareFinancePeriod, PERIOD_DOMAINS } from '../functions/_shared/finance-period-comparison.mts'
import { projectFinancePeriod } from '../functions/_shared/finance-period-projection.mts'
import { fetchErpNextPeriod } from '../functions/_shared/finance-erpnext-period.mts'

const hash = 'a'.repeat(64)
const record = (identity, value) => ({ identity, sourceId: identity, values: { amount: value } })
const evidence = (patch = {}) => ({ providerCode: 'erpnext', company: 'Example Freight', entityId: 'entity', periodId: 'period', currency: 'GBP', from: '2026-09-01', to: '2026-09-30', cutoff: '2026-10-01T09:00:00Z', checkpoint: hash, mappingRevision: hash,
  domains: Object.fromEntries(PERIOD_DOMAINS.map(domain => [domain, { complete: true, pages: 1, count: 0, hash, rows: [] }])), ...patch })

test('statement parser preserves quoted CSV and requires exact coverage and running balances', () => {
  const result = parseBankStatementCsv('date,reference,description,amount,balance\n2026-09-10,R1,"Receipt, customer",20.0000,120.0000\n2026-09-20,P1,Payment,-5.0000,115.0000\n', '100', '115', '2026-09-01', '2026-09-30')
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].description, 'Receipt, customer')
  assert.equal(result.openingBalance, '100.0000')
  assert.throws(() => parseBankStatementCsv('date,reference,description,amount,balance\n2026-09-10,R1,Receipt,20,119\n', '100', '119', '2026-09-01', '2026-09-30'), /running balance/)
  assert.throws(() => parseBankStatementCsv('date,reference,description,amount,balance\n2026-09-10,R1,Receipt,20,120\n', '100', '120', '2026-09-11', '2026-09-30'), /coverage/)
  assert.throws(() => parseBankStatementCsv('date,reference,description,amount,balance\n2026-09-10,R1,Receipt,20,120\n', '100', '120', '2026-09-01', '2026-09-30"'), /coverage/)
})

test('period comparison never verifies partial reads or compensating missing identities', () => {
  assert.equal(compareFinancePeriod(evidence(), evidence()).status, 'verified')
  const partial = evidence(); partial.domains.journal_lines.complete = false
  assert.equal(compareFinancePeriod(evidence(), partial).status, 'incomplete')
  const local = evidence(); local.domains.documents.rows = [record('A', '10'), record('B', '-10')]; local.domains.documents.count = 2
  const provider = evidence(); provider.domains.documents.rows = [record('C', '10'), record('D', '-10')]; provider.domains.documents.count = 2
  const comparison = compareFinancePeriod(local, provider)
  assert.equal(comparison.status, 'differences')
  assert.equal(comparison.differences.length, 4)
  assert.ok(comparison.differences.some(item => item.kind === 'external_only'))
  assert.ok(comparison.differences.some(item => item.kind === 'missing_provider'))
})

test('same identity with concurrent local and provider changes is a conflict', () => {
  const local = evidence(); local.domains.documents.rows = [record('A', '11')]; local.domains.documents.count = 1
  const provider = evidence(); provider.domains.documents.rows = [record('A', '12')]; provider.domains.documents.count = 1
  const result = compareFinancePeriod(local, provider, { 'documents:A': { amount: '10' } })
  assert.equal(result.status, 'differences')
  assert.equal(result.differences[0].kind, 'conflict')
})

test('projection requires pinned AR, AP and cash controls and distinguishes missing GL entries', async () => {
  const local = { entityId: 'entity', periodId: 'period', from: '2026-09-01', to: '2026-09-30', currency: 'GBP', company: 'Example Freight', providerCode: 'erpnext', connectionUpdatedAt: '2026-09-01T00:00:00Z',
    documents: [], documentLines: [], cash: [], allocations: [], taxes: [], postingLines: [], externalRefs: [], taxMappings: [], partyMappings: [], journals: [],
    nominals: [{ id: 'ar', type: 'Receivable' }, { id: 'ap', type: 'Payable' }, { id: 'cash', type: 'Bank' }],
    accountMappings: [{ localContext: 'nominal:ar', providerAccount: 'Debtors' }, { localContext: 'nominal:ap', providerAccount: 'Creditors' }, { localContext: 'nominal:cash', providerAccount: 'Bank' }],
    banks: [{ id: 'bank', nominalId: 'cash', currency: 'GBP', active: true }] }
  const provider = { providerCode: 'erpnext', company: 'Example Freight', checkpoint: hash, details: { 'Sales Invoice': [], 'Purchase Invoice': [], 'Payment Entry': [], 'Journal Entry': [], 'GL Entry': [] }, counts: { 'GL Entry': { count: 0, pages: 1, hash } } }
  const clean = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.equal(compareFinancePeriod(clean.local, clean.provider).status, 'verified')
  local.postingLines.push({ id: 'line', batchId: 'batch', sourceTable: 'FIN_Journals', sourceId: 'journal', nominalId: 'cash', periodId: 'period', periodEnd: '2026-09-30', debit: '10.0000', credit: '0.0000', postedAt: '2026-09-30T12:00:00Z' })
  const changed = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.equal(compareFinancePeriod(changed.local, changed.provider).status, 'differences')
})

test('a posted invoice matches its ERPNext document, journal, trial balance and AR control', async () => {
  const period = 'period', documentId = 'invoice'
  const local = { entityId: 'entity', periodId: period, from: '2026-09-01', to: '2026-09-30', currency: 'GBP', company: 'Example Freight', providerCode: 'erpnext', connectionUpdatedAt: '2026-09-01T00:00:00Z',
    documents: [{ id: documentId, type: 'sl_invoice', status: 'approved', partyId: 'customer', currency: 'GBP', date: '2026-09-10', net: '100', tax: '0', gross: '100', outstanding: '100', updatedAt: '2026-09-10T12:00:00Z' }],
    documentLines: [], cash: [], allocations: [], taxes: [], journals: [],
    postingLines: [
      { id: 'line-ar', sourceTable: 'FIN_Documents', sourceId: documentId, nominalId: 'ar', periodId: period, periodEnd: '2026-09-30', debit: '100', credit: '0', postedAt: '2026-09-10T12:00:00Z' },
      { id: 'line-sales', sourceTable: 'FIN_Documents', sourceId: documentId, nominalId: 'sales', periodId: period, periodEnd: '2026-09-30', debit: '0', credit: '100', postedAt: '2026-09-10T12:00:00Z' },
    ],
    externalRefs: [{ localTable: 'FIN_Documents', localId: documentId, externalType: 'Sales Invoice', externalId: 'SI-001', status: 'synced' }],
    partyMappings: [{ localId: 'customer', type: 'customer', providerId: 'Customer A' }], taxMappings: [],
    nominals: [{ id: 'ar', type: 'Receivable' }, { id: 'ap', type: 'Payable' }, { id: 'cash', type: 'Bank' }, { id: 'sales', type: 'Income Account' }],
    accountMappings: [{ localContext: 'nominal:ar', providerAccount: 'Debtors' }, { localContext: 'nominal:ap', providerAccount: 'Creditors' }, { localContext: 'nominal:cash', providerAccount: 'Bank' }, { localContext: 'nominal:sales', providerAccount: 'Sales' }],
    banks: [{ id: 'bank', nominalId: 'cash', currency: 'GBP', active: true }] }
  const provider = { providerCode: 'erpnext', company: 'Example Freight', checkpoint: hash, counts: { 'GL Entry': { count: 2, pages: 2, hash } },
    details: { 'Sales Invoice': [{ doctype: 'Sales Invoice', name: 'SI-001', modified: '2026-09-10T12:00:00Z', docstatus: 1, customer: 'Customer A', currency: 'GBP', posting_date: '2026-09-10', net_total: 100, total_taxes_and_charges: 0, grand_total: 100, outstanding_amount: 100, is_return: 0, taxes: [] }],
      'Purchase Invoice': [], 'Payment Entry': [], 'Journal Entry': [],
      'GL Entry': [{ name: 'gl-ar', posting_date: '2026-09-10', voucher_type: 'Sales Invoice', voucher_no: 'SI-001', account: 'Debtors', debit: 100, credit: 0, is_cancelled: 0 },
        { name: 'gl-sales', posting_date: '2026-09-10', voucher_type: 'Sales Invoice', voucher_no: 'SI-001', account: 'Sales', debit: 0, credit: 100, is_cancelled: 0 }] } }
  const projected = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.deepEqual(projected.warnings, [])
  assert.equal(compareFinancePeriod(projected.local, projected.provider).status, 'verified')
  local.documents[0].outstanding = '90'
  local.cash.push({ id: 'receipt', type: 'customer_receipt', status: 'approved', partyId: 'customer', currency: 'GBP', date: '2026-09-20', amount: '10', unallocated: '0', updatedAt: '2026-09-20T12:00:00Z' })
  local.allocations.push({ id: 'receipt-allocation', cashId: 'receipt', documentId, amount: '10', status: 'allocated' })
  local.externalRefs.push({ localTable: 'FIN_CashTransactions', localId: 'receipt', externalType: 'Payment Entry', externalId: 'PE-001', status: 'synced' })
  local.postingLines.push(
    { id: 'line-bank', sourceTable: 'FIN_CashTransactions', sourceId: 'receipt', nominalId: 'cash', periodId: period, periodEnd: '2026-09-30', debit: '10', credit: '0', postedAt: '2026-09-20T12:00:00Z' },
    { id: 'line-receivable', sourceTable: 'FIN_CashTransactions', sourceId: 'receipt', nominalId: 'ar', periodId: period, periodEnd: '2026-09-30', debit: '0', credit: '10', postedAt: '2026-09-20T12:00:00Z' },
  )
  provider.details['Sales Invoice'][0].outstanding_amount = 90
  provider.details['Payment Entry'].push({ doctype: 'Payment Entry', name: 'PE-001', modified: '2026-09-20T12:00:00Z', docstatus: 1, payment_type: 'Receive', party: 'Customer A', paid_to_account_currency: 'GBP', posting_date: '2026-09-20', paid_amount: 10, unallocated_amount: 0,
    references: [{ name: 'ref-1', reference_doctype: 'Sales Invoice', reference_name: 'SI-001', allocated_amount: 10 }], deductions: [], taxes: [] })
  provider.details['GL Entry'].push(
    { name: 'gl-bank', posting_date: '2026-09-20', voucher_type: 'Payment Entry', voucher_no: 'PE-001', account: 'Bank', debit: 10, credit: 0, is_cancelled: 0 },
    { name: 'gl-receivable', posting_date: '2026-09-20', voucher_type: 'Payment Entry', voucher_no: 'PE-001', account: 'Debtors', debit: 0, credit: 10, is_cancelled: 0 },
  )
  const paid = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.deepEqual(paid.warnings, [])
  assert.equal(compareFinancePeriod(paid.local, paid.provider).status, 'verified')
  provider.details['GL Entry'].pop()
  const missingLine = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.equal(compareFinancePeriod(missingLine.local, missingLine.provider).status, 'incomplete')
  local.documents[0].openingPackageId = 'cargo-opening'
  local.externalRefs = local.externalRefs.filter(reference => reference.localTable !== 'FIN_Documents')
  const openingWithoutSubledgerMirror = await projectFinancePeriod(local, provider, '2026-10-01T09:00:00Z')
  assert.ok(openingWithoutSubledgerMirror.warnings.some(warning => warning.includes('opening Journal Entry mirrors GL only')))
  assert.equal(compareFinancePeriod(openingWithoutSubledgerMirror.local, openingWithoutSubledgerMirror.provider).status, 'incomplete')
})

test('ERPNext period inventory rejects a missing page and a changing source', async () => {
  const invoice = { name: 'SI-001', modified: '2026-09-10T12:00:00Z', company: 'Example Freight', posting_date: '2026-09-10', docstatus: 1 }
  const request = async path => {
    const url = new URL(path, 'https://erpnext.example.test')
    if (url.pathname.endsWith('/frappe.client.get_count')) return { message: url.searchParams.get('doctype') === 'Sales Invoice' ? 1 : 0 }
    if (url.pathname.endsWith('/Sales%20Invoice/SI-001')) return { data: { ...invoice, items: [], taxes: [] } }
    if (url.pathname.endsWith('/Sales%20Invoice')) return { data: [invoice] }
    return { data: [] }
  }
  const complete = await fetchErpNextPeriod('Example Freight', '2026-09-30', request, 'https://erpnext.example.test')
  assert.equal(complete.details['Sales Invoice'].length, 1)
  await assert.rejects(() => fetchErpNextPeriod('Example Freight', '2026-09-30', async path => path.includes('/api/resource/Sales%20Invoice?') ? { data: [] } : request(path), 'https://erpnext.example.test'), /paged incompletely/)
  let invoicePages = 0
  await assert.rejects(() => fetchErpNextPeriod('Example Freight', '2026-09-30', async path => {
    if (path.includes('/api/resource/Sales%20Invoice?')) { invoicePages++; return { data: [{ ...invoice, modified: invoicePages > 1 ? '2026-09-10T12:00:01Z' : invoice.modified }] } }
    return request(path)
  }, 'https://erpnext.example.test'), /changed between inventory passes/)
})
