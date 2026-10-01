import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
const planningSource = readFileSync(new URL('../src/lib/booking-planning-charges.ts', import.meta.url), 'utf8')
const planningUrl = moduleUrl(planningSource)
const operationalSource = readFileSync(new URL('../src/lib/booking-operational-charges.ts', import.meta.url), 'utf8')
  .replace('from "./booking-planning-charges"', `from "${planningUrl}"`)
const { readOperationalCharges, operationalEditorRows, operationalChargeSavePayload } = await import(moduleUrl(operationalSource))

test('an accepted historical selling price remains visible without making an invalid rate editable or removable', () => {
  const jobId = '50000000-0000-4000-8000-000000000001'
  const lineId = '60000000-0000-4000-8000-000000000001'
  const result = readOperationalCharges({
    supported: true, jobId, editable: true, blockedReason: null, baseCurrency: 'USD', bookingUpdatedAt: '2026-09-29T10:00:00Z',
    currencies: [{ code: 'USD', name: 'US dollar', symbol: '$', decimalPlaces: 2 }, { code: 'GBP', name: 'Pound sterling', symbol: '£', decimalPlaces: 2 }],
    parties: [], lines: [{ id: lineId, blockedReason: null,
      snapshot: { JobCostingLine_ID: lineId, Job_ID: jobId, JobCostingLine_Description: 'Dangerous Goods Fee' },
      values: { id: lineId, code: '', description: 'Dangerous Goods Fee', cost: 110, sell: 150,
        costCurrency: 'USD', sellCurrency: 'GBP', costRoe: 1, sellRoe: 0, quantity: 1, calculationBasis: 'fixed' },
    }],
  }, jobId)
  assert.equal(result.supported, true)
  assert.equal(result.lines[0].values, null)
  assert.deepEqual(result.lines[0].historicalSell, { amount: 150, currency: 'GBP' })
  assert.match(result.lines[0].blockedReason, /review before.*edited/)
  assert.deepEqual(operationalEditorRows(result), [])
  assert.deepEqual(operationalChargeSavePayload(result, [], 'Add a separate charge').operations, [])
})
