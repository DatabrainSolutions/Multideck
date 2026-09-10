import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
const source = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  function updateDraftParty(')
const end = source.indexOf('  function selectDraftLocation(', start)
const code = transformSync(source.slice(start, end), { loader: 'ts' }).code
function editor() {
  let workspace = { booking: {}, parties: [], routes: [] }, booking = { customer: '', customerRef: '' }
  const api = new Function('setDraftWorkspace', 'setDraftBooking', `${code}; return { updateDraftParty, selectDraftOrganisation }`)(fn => { workspace = fn(workspace) }, fn => { booking = fn(booking) })
  return { ...api, workspace: () => workspace, booking: () => booking }
}
const org = (id, name) => ({ id, name, code: id.toUpperCase(), addresses: [{ id: `${id}-address`, address: `${name} address` }], contacts: [] })
test('payer selection saves its own identity without changing the customer', () => {
  const edit = editor()
  edit.selectDraftOrganisation('customer', org('customer', 'Customer'))
  edit.updateDraftParty('payer', 'name', 'Payer')
  edit.selectDraftOrganisation('payer', org('payer', 'Payer'))
  const workspace = edit.workspace()
  assert.equal(workspace.booking.customerId, 'customer')
  assert.equal(edit.booking().customer, 'Customer')
  const payer = workspace.parties.find(party => party.role === 'payer')
  assert.equal(payer.name, 'Payer'); assert.equal(payer.organisationId, 'payer')
  assert.equal(payer.rawSnapshot.organisationId, 'payer')
  assert.equal(payer.identifierValue, 'PAYER')
})
test('manual names and clears cannot retain the previous account link', () => {
  const edit = editor()
  edit.selectDraftOrganisation('customer', org('customer', 'Customer'))
  edit.updateDraftParty('payer', 'name', 'Manual payer')
  const payer = edit.workspace().parties.find(party => party.role === 'payer')
  assert.equal(payer.name, 'Manual payer'); assert.equal(payer.organisationId, null)
  assert.equal(payer.identifierValue, ''); assert.equal(payer.rawSnapshot.organisationId, null)
  edit.updateDraftParty('customer', 'name', '')
  assert.equal(edit.workspace().booking.customerId, null)
  assert.equal(edit.booking().customer, '')
})
