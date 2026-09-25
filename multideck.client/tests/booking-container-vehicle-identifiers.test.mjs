import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const component = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const helper = component.slice(component.indexOf('function bookingContainerVehicleIdentifiers('), component.indexOf('function BookingContainerDetails('))
const readIdentifiers = new Function(`${stripTypeScriptTypes(helper)}; return bookingContainerVehicleIdentifiers`)()
const patchStart = component.indexOf('  function updateDraftContainer(')
const patch = component.slice(patchStart, component.indexOf('  function addDraftContainer(', patchStart))

test('container vehicle identifiers support two cars and clear cleanly on reload', () => {
  let workspace = { containers: [{ id: 'equipment-1', type: '40GP', data: { source: 'accepted_quote' } }] }
  const setDraftWorkspace = update => { workspace = update(workspace) }
  const change = new Function('setDraftWorkspace', `${stripTypeScriptTypes(patch)}; return updateDraftContainer`)(setDraftWorkspace)
  change(0, 'vehicleIdentifiers', 'WVWZZZ1JZXW000001\nWVWZZZ1JZXW000002')
  assert.equal(readIdentifiers(workspace.containers[0]), 'WVWZZZ1JZXW000001\nWVWZZZ1JZXW000002')
  assert.equal(workspace.containers[0].data.source, 'accepted_quote')
  const savedJson = structuredClone(workspace.containers[0])
  assert.equal(readIdentifiers({ data: savedJson }), 'WVWZZZ1JZXW000001\nWVWZZZ1JZXW000002')
  workspace = { containers: [{ id: 'equipment-1', type: '40GP', data: savedJson }] }
  change(0, 'vehicleIdentifiers', '')
  assert.equal(readIdentifiers(workspace.containers[0]), '')
  assert.equal(workspace.containers[0].data.vehicleIdentifiers, 'WVWZZZ1JZXW000001\nWVWZZZ1JZXW000002')
})

test('existing backend stores container JSON and returns it without a schema change', () => {
  const saveSql = readFileSync(new URL('../../supabase/migrations/20260905110317_booking_stable_cargo_equipment_identity.sql', import.meta.url), 'utf8')
  const readSql = readFileSync(new URL('../../supabase/migrations/20260820150500_booking_workspace_rpc.sql', import.meta.url), 'utf8')
  assert.match(saveSql, /"JobContainer_JSON"\s*=\s*public\."Job_Containers"\."JobContainer_JSON"\s*\|\|\s*excluded\."JobContainer_JSON"/u)
  assert.match(saveSql, /nullif\(btrim\(line->>'notes'\), ''\), line, app_user\."User_ID"/u)
  assert.match(readSql, /'data', container\."JobContainer_JSON"/u)
})
