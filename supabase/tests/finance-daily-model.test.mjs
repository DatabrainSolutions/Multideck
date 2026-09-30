import assert from 'node:assert/strict'
import test from 'node:test'
import { ageOpenItems, summariseOpenBalances, validateMatchModelProposal } from '../functions/_shared/finance-daily-model.mts'

const source = {
  document: { table: 'FIN_Documents', id: 'invoice-1', fileId: 'file-1', sha256: 'a'.repeat(64), fields: { supplier: 'supplier-1', currency: 'GBP', netAmount: 70, job: null, number: 'INV-1' } },
  purchaseOrders: [{ table: 'FIN_SupplierPurchaseOrders', id: 'po-1', fields: { supplier: 'supplier-1', currency: 'GBP', availableNet: 100, job: null, number: 'PO-1' } }],
}

test('an AI match uses canonical source values and requires citations from both records', () => {
  const result = validateMatchModelProposal({ purchaseOrderId: 'po-1', rationale: 'Supplier and currency agree; review the remaining value.', citationFields: ['invoice.supplier', 'po.supplier', 'invoice.netAmount', 'po.availableNet'] }, source, ['po-1'])
  assert.equal(result.selectedId, 'po-1')
  assert.deepEqual(result.citations.map((citation) => citation.value), ['supplier-1', 'supplier-1', 70, 100])
  assert.equal(result.citations[0].fileSha256, source.document.sha256)
  assert.equal(result.citations[1].fileSha256, null)
})

test('an AI false positive or invented citation cannot become an approved proposal', () => {
  assert.throws(() => validateMatchModelProposal({ purchaseOrderId: 'foreign-po', rationale: 'Looks close', citationFields: ['invoice.supplier', 'po.supplier'] }, source, ['po-1']), /ineligible/)
  assert.throws(() => validateMatchModelProposal({ purchaseOrderId: 'po-1', rationale: 'Looks close', citationFields: ['invoice.supplier'] }, source, ['po-1']), /both records/)
  assert.throws(() => validateMatchModelProposal({ purchaseOrderId: 'po-1', rationale: 'Looks close', citationFields: ['invoice.supplier', 'po.bankAccount'] }, source, ['po-1']), /unknown source field/)
  assert.throws(() => validateMatchModelProposal({ purchaseOrderId: null, rationale: 'No supported match', citationFields: ['po.number'] }, source, ['po-1']), /both records/)
})

test('aged AR priority remains deterministic and tied to source document balance', () => {
  const items = ageOpenItems([{ id: 'invoice-1', number: 'INV-1', ledger: 'receivables', partyId: 'customer-1', partyName: 'Customer', dueDate: '2026-07-01', currency: 'GBP', outstanding: 70, status: 'approved', updatedAt: '2026-09-25T07:00:00Z' }], '2026-09-25')
  assert.equal(items[0].bucket, '61–90')
  assert.equal(items[0].priority, 'urgent')
  assert.deepEqual(items[0].evidence, { sourceTable: 'FIN_Documents', sourceId: 'invoice-1', observedAt: '2026-09-25T07:00:00Z' })
})

test('signed credits and unapplied cash reduce net AR without changing invoice ageing', () => {
  const totals = summariseOpenBalances([{ currency: 'GBP', outstanding: 70 }], [{ currency: 'GBP', amount: -10 }, { currency: 'GBP', amount: -5 }])
  assert.deepEqual(totals.GBP, { grossInvoices: 70, unappliedOffsets: -15, net: 55 })
  assert.throws(() => summariseOpenBalances([{ currency: 'GBP', outstanding: 70 }], [{ currency: 'GBP', amount: 10 }]), /non-positive/)
})
