import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculationReadState } from '../functions/_shared/customs-calculation-read-state.mts'
import { CALCULATION_VERSION, PRECISION_POLICY } from '../functions/_shared/customs-calculation-version.mts'

const date = '2026-09-14'
const calculation = { recordId: 'calc-1', declarationId: 'import-1', kind: 'calculation', outOfDate: false, result: { version: CALCULATION_VERSION, precisionPolicy: PRECISION_POLICY, date } }
const override = { recordId: 'override-1', declarationId: 'import-1', parentCalculationId: 'calc-1', kind: 'override', outOfDate: false, replacement: { duty: '12.00', vat: '22.40' } }

test('current evidence is read without mutating the audit rows', () => {
  const rows = structuredClone([calculation, override])
  const before = JSON.stringify(rows)
  const result = calculationReadState(rows, date)
  assert.equal(JSON.stringify(rows), before)
  assert.ok(result.every(row => row.outOfDate === false && row.freshnessCheckedOn === date))
  assert.deepEqual(result[1].replacement, override.replacement)
})

test('date, rules, precision and revision changes also stale the linked override', () => {
  for (const patch of [
    { result: { ...calculation.result, date: '2026-09-13' } },
    { result: { ...calculation.result, version: 'old' } },
    { result: { ...calculation.result, precisionPolicy: 'old' } },
    { outOfDate: true },
  ]) {
    const result = calculationReadState([{ ...calculation, ...patch }, override], date)
    assert.ok(result.every(row => row.outOfDate === true && row.freshnessReasons.length > 0))
  }
})

test('a missing or wrong-declaration parent cannot make an override current', () => {
  for (const rows of [[override], [{ ...calculation, declarationId: 'other' }, override]]) {
    const result = calculationReadState(rows, date)
    assert.equal(result.at(-1).outOfDate, true)
    assert.match(result.at(-1).freshnessReasons.join(' '), /parent calculation evidence/)
  }
  assert.equal(calculationReadState([{ ...calculation, outOfDate: undefined }], date)[0].outOfDate, true)
})
