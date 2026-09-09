import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/pages/quotes-page.tsx', import.meta.url), 'utf8')
const helpers = source.slice(source.indexOf('function quoteRoutingLegs('), source.indexOf('function quoteCountryFlag('))
const start = source.indexOf('  function updateLocation(prefix:')
const handlers = source.slice(start, source.indexOf('  function updateRecurrence(', start))
const code = transformSync(`${helpers}\n${handlers}`, { loader: 'tsx' }).code
const location = (unlocode, place = '') => ({ countryCode: unlocode.slice(0, 2), countryName: '', unlocode, place })
const first = { id: 'preserve-id', mode: 'Air', origin: location('GBLHR'), destination: location('USJFK'), estimatedDeparture: '2026-09-18', estimatedArrival: '', carrierId: 'carrier-1', carrierName: 'Air carrier', serviceLevel: 'Express' }
const second = { ...first, id: 'remove-id', mode: 'Road', origin: first.destination, destination: location('USCHI'), estimatedArrival: '2026-10-01' }
function editor(legs, editable = true) {
  const quote = { mode: 'Sea', carrier: 'Header carrier', serviceLevel: 'Economy', destination: 'USCHI', destinationUnlocode: 'USCHI', estimatedArrival: '2026-10-01', routingLegsJson: JSON.stringify(legs) }
  return new Function('quote', 'editable', 'originLocation', 'destinationLocation', `
    let routingLegs = JSON.parse(quote.routingLegsJson); const patches = [];
    const onQuotePatch = patch => { patches.push(patch); Object.assign(quote, patch); routingLegs = quoteRoutingLegs(quote.routingLegsJson); };
    const quoteTransitDays = (a,b) => a && b ? String((Date.parse(b)-Date.parse(a))/86400000) : '';
    ${code}
    return {quote, patches, addRoutingLeg, updateRoutingLeg, updateLocation, removeLastRoutingLeg, quoteRoutingLegs, quoteRoutingLegsValue, legs:()=>routingLegs};
  `)(quote, editable, first.origin, second.destination)
}
test('reducing to one explicit leg preserves identity, mode, carrier, service and deliberate empty dates', () => {
  const ui = editor([first, second]); ui.removeLastRoutingLeg()
  assert.deepEqual(ui.legs(), [first])
  assert.equal(ui.quote.destination, 'USJFK')
  assert.equal(ui.quote.estimatedArrival, '')
  assert.equal(ui.quote.transitDays, '')
  assert.equal(ui.quote.mode, 'Sea', 'Do not silently rewrite overall mode')
  assert.deepEqual(ui.quoteRoutingLegs(ui.quoteRoutingLegsValue(ui.legs())), [first], 'save/reopen retains the final leg')
  assert.equal(ui.quoteRoutingLegsValue([]), '', 'default A-B remains compact')
  ui.removeLastRoutingLeg(); assert.equal(ui.patches.length, 1)
  assert.deepEqual(first.destination, location('USJFK'), 'original evidence unchanged')
})
test('single-leg summary and route edits stay in step; re-expansion uses the preserved leg', () => {
  const ui = editor([first])
  ui.updateLocation('destination', location('', 'Customer delivery site'))
  assert.equal(ui.legs()[0].destination.place, 'Customer delivery site')
  assert.equal(ui.legs()[0].destination.unlocode, '')
  ui.updateRoutingLeg(0, { estimatedArrival: '2026-09-21', carrierName: 'Revised carrier' })
  assert.equal(ui.quote.estimatedArrival, '2026-09-21')
  assert.equal(ui.quote.transitDays, '3')
  const retained = structuredClone(ui.legs()[0])
  ui.addRoutingLeg()
  assert.deepEqual(ui.legs()[0], retained)
  assert.equal(ui.legs()[1].mode, 'Air')
  assert.deepEqual(ui.legs()[1].origin, retained.destination)
  assert.equal(ui.quote.destination, '', 'new unfinished final destination is not the old one')
  assert.equal(ui.quote.estimatedArrival, '')
  ui.removeLastRoutingLeg()
  assert.equal(ui.quote.destination, 'Customer delivery site')
  assert.equal(ui.quote.estimatedArrival, '2026-09-21')
})
test('read-only callbacks, invalid indices and route limits cannot mutate a submitted plan', () => {
  const ui = editor([first, second], false)
  ui.addRoutingLeg(); ui.removeLastRoutingLeg(); ui.updateRoutingLeg(0, { mode:'Rail' }); ui.updateLocation('origin', location('FRPAR'))
  assert.deepEqual(ui.patches, [])
  const editable = editor([first]); for (const index of [-1, 1, 0.5, NaN]) editable.updateRoutingLeg(index, { mode:'Rail' })
  assert.deepEqual(editable.patches, [])
  const full = editor(Array.from({ length:30 }, (_,i)=>({...first, id:String(i)}))); full.addRoutingLeg()
  assert.deepEqual(full.patches, [])
})
