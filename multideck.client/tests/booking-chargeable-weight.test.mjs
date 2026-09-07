import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/lib/booking-chargeable-weight.ts', import.meta.url), 'utf8')
const module = { exports: {} }
new Function('module', 'exports', transformSync(source, { loader: 'ts', format: 'cjs' }).code)(module, module.exports)
const summary = values => module.exports.bookingChargeableWeightSummary(values.map(chargeableWeightKg => ({ chargeableWeightKg })))

test('exact line totals keep zero, grouping and high precision without floating point rounding', () => {
  assert.equal(summary(['0.1', '0.2']).subtotal, '0.3')
  assert.equal(summary(['1,234.123456789', '0.000000001']).subtotal, '1234.12345679')
  assert.equal(summary(['999999999999', '999999999999']).subtotal, '1999999999998')
  assert.deepEqual(summary(['0', 0]), { subtotal: '0', missing: 0, invalid: 0, recorded: 2, complete: true })
})
test('missing and invalid values never masquerade as complete totals or zero', () => {
  assert.equal(summary([]).subtotal, null)
  assert.equal(summary([]).complete, false)
  assert.deepEqual(summary(['2.5', '', null, undefined]), { subtotal: '2.5', missing: 3, invalid: 0, recorded: 1, complete: false })
  for (const value of ['-1', '1,23', '1e3', 'NaN', 'Infinity', '1000000000000', '999999999999.00001', '1.', 'x', '1'.repeat(65)]) {
    assert.deepEqual(summary([value]), { subtotal: null, missing: 0, invalid: 1, recorded: 0, complete: false }, value)
  }
})
test('real cargo edit callback retains raw decimals and clears without changing Quote or shipment override', () => {
  const component = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
  const callback = transformSync(component.slice(component.indexOf('  function updateDraftCargo('), component.indexOf('  function addDraftCargo(')), { loader: 'tsx' }).code
  const editor = new Function(`let state = {cargo:[{id:'line',cargoData:{source:'accepted_quote'}}],booking:{editableDetails:{chargeableWeightKg:'99'}},sourceQuote:{reference:'JQ TEST'}};
    const setDraftWorkspace = update => state = update(state);
    ${callback}
    return { updateDraftCargo, state:()=>state };`)()
  for (const value of ['1234.123456789', 'invalid', '']) {
    editor.updateDraftCargo(0, 'chargeableWeightKg', value)
    assert.equal(editor.state().cargo[0].chargeableWeightKg, value)
    assert.equal(editor.state().cargo[0].cargoData.chargeableWeightKg, value)
    assert.equal(editor.state().cargo[0].cargoData.source, 'accepted_quote')
    assert.equal(editor.state().booking.editableDetails.chargeableWeightKg, '99')
    assert.equal(editor.state().sourceQuote.reference, 'JQ TEST')
  }
})

test('actual Save guard stops invalid line and override inputs and selects the failing field', async () => {
  const component = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
  const start = component.indexOf('  async function saveDetails()')
  const end = component.indexOf('    const allocationIssue', start)
  assert.ok(start >= 0 && end > start)
  const guard = transformSync(component.slice(start, end) + '\nreturn "validated";\n}', { loader: 'tsx' }).code
  const create = new Function('bookingChargeableWeightError', 'draftWorkspace', `
    const draftBooking = {}, detailsDirty = true, savingDetails = false, loadedRecord = {workspace:{}};
    const asRecord = value => value || {};
    const recordText = (record,key) => record[key] == null ? '' : String(record[key]);
    let validation; const setWeightValidation = update => validation = update(validation);
    ${guard}
    return {saveDetails, validation:()=>validation};`)
  for (const [weight, override, index] of [['bad', '', 0], ['1', '-2', null]]) {
    const editor = create(module.exports.bookingChargeableWeightError, { cargo: [{ description: 'Test', chargeableWeightKg: weight }], booking: { editableDetails: { chargeableWeightKg: override } } })
    assert.equal(await editor.saveDetails(), undefined)
    assert.deepEqual(editor.validation(), { attempt: 1, index })
    await editor.saveDetails()
    assert.equal(editor.validation().attempt, 2)
  }
  const valid = create(module.exports.bookingChargeableWeightError, { cargo: [{ description: 'Test', chargeableWeightKg: '0' }], booking: { editableDetails: { chargeableWeightKg: '' } } })
  assert.equal(await valid.saveDetails(), 'validated')
})
