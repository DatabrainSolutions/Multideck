import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')
export const bookingCargoSource = readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
const helper = transformSync(readFileSync(new URL('../../multideck.client/src/lib/booking-cargo-handling.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code
const module = { exports: {} }
new Function('module', helper)(module)
export const { bookingCargoHandlingSummary, bookingCargoOtherHandling, bookingCargoSafetyConflict } = module.exports
const start = bookingCargoSource.indexOf('  function updateDraftCargo(')
assert.ok(start > 0)
const mutation = transformSync(bookingCargoSource.slice(start, bookingCargoSource.indexOf('  function addDraftCargo(', start)), { loader: 'ts' }).code

// Executes the production React state updater; only the state container is a fixture.
export function mutateBookingCargo(workspace, index, field, value) {
  let result = workspace
  const update = new Function('setDraftWorkspace', 'bookingCargoHandlingSummary', `${mutation}; return updateDraftCargo`)(
    callback => { result = callback(result) }, bookingCargoHandlingSummary)
  update(index, field, value)
  return result
}
