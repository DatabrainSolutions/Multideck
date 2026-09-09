import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const callbacks = transformSync(source.slice(source.indexOf('  function updateDraftBooking('), source.indexOf('  function updateDraftParty(')), { loader: 'tsx' }).code

function editor() {
  return new Function(`
    let draftBooking = { jobRef: 'JOB-49', origin: 'GBFXT', destination: 'NLRTM' };
    let draftWorkspace = {
      booking: { bookingReference: 'JE0991134', editableDetails: { customerReference: 'QA TEST' } },
      sourceQuote: { reference: 'JQ20022', appliedVersionNumber: 1 }
    };
    const setDraftBooking = update => draftBooking = update(draftBooking);
    const setDraftWorkspace = update => draftWorkspace = update(draftWorkspace);
    const statusTone = {};
    ${callbacks}
    return { updateDraftBooking, state: () => ({ draftBooking, draftWorkspace }) };
  `)()
}

test('actual Job ref edit reaches the editable-details payload without changing locked references or Quote metadata', () => {
  const ui = editor()
  ui.updateDraftBooking('jobRef', 'JOB-49 QA RESPONSE TEST')
  const { draftBooking, draftWorkspace } = ui.state()
  assert.equal(draftBooking.jobRef, 'JOB-49 QA RESPONSE TEST')
  assert.deepEqual(draftWorkspace.booking.editableDetails, {
    customerReference: 'QA TEST', jobReference: 'JOB-49 QA RESPONSE TEST',
  })
  assert.equal(draftWorkspace.booking.bookingReference, 'JE0991134')
  assert.deepEqual(draftWorkspace.sourceQuote, { reference: 'JQ20022', appliedVersionNumber: 1 })
  ui.updateDraftBooking('jobRef', 'JOB-49')
  assert.equal(ui.state().draftWorkspace.booking.editableDetails.jobReference, 'JOB-49')
})

test('unrelated edits do not invent a Job ref override; clearing is passed explicitly to the existing backend', () => {
  const ui = editor()
  ui.updateDraftBooking('origin', 'GBSOU')
  assert.equal(ui.state().draftBooking.route, 'GBSOU → NLRTM')
  assert.equal(Object.hasOwn(ui.state().draftWorkspace.booking.editableDetails, 'jobReference'), false)
  ui.updateDraftBooking('jobRef', '')
  assert.equal(ui.state().draftWorkspace.booking.editableDetails.jobReference, '')
})
