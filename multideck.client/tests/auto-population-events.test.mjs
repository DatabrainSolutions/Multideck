import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/components/multideck/auto-populated-field.tsx', import.meta.url), 'utf8')
const code = transformSync(source.slice(source.indexOf('export function useAutoPopulationMorph'), source.indexOf('export function AutoPopulatedInput')).replace('export ', ''), { loader: 'tsx' }).code
function harness() {
  const refs = []; let cursor = 0, effect, reveals = 0, reduced = false
  const mocks = { useRef: initial => refs[cursor++] ?? (refs[cursor - 1] = { current: initial }), useLayoutEffect: fn => { effect = fn }, assignRef() {},
    createAutoPopulationReveal: () => { reveals++; return () => {} }, window: { matchMedia: () => ({ matches: reduced }) }, document: { visibilityState: 'visible' } }
  const hook = new Function(...Object.keys(mocks), `${code}; return useAutoPopulationMorph`)(...Object.values(mocks))
  return { update(active, value, event) { cursor = 0; const ref = hook(active, value, undefined, event); ref({ getClientRects: () => [1] }); effect() }, count: () => reveals, reduce: value => { reduced = value } }
}
test('mount, lookup matching and remounting saved values do not reveal', () => {
  for (let visit = 0; visit < 4; visit++) { const h = harness(); h.update(false, 'Saved value', null); h.update(true, 'Saved value', null); h.update(true, 'Saved value', 2); assert.equal(h.count(), 0) }
})
test('booking changes require a new deliberate event, with each changed value revealed once', () => {
  const h = harness(); h.update(true, 'A', null); h.update(true, 'Loaded B', null); assert.equal(h.count(), 0)
  h.update(true, 'C', 1); h.update(true, 'C', 1); assert.equal(h.count(), 1)
  h.update(true, 'D', 1); assert.equal(h.count(), 1)
  h.update(true, 'A', 2); assert.equal(h.count(), 2)
})
test('quote value changes keep genuine feedback; provenance flips alone do not animate', () => {
  const h = harness(); h.update(false, 'A'); h.update(true, 'A'); assert.equal(h.count(), 0)
  h.update(true, 'B'); assert.equal(h.count(), 1)
  h.update(false, 'B'); h.update(true, 'B'); assert.equal(h.count(), 1)
})
test('reduced motion consumes the event without deferring an animation', () => {
  const h = harness(); h.update(true, 'A', null); h.reduce(true); h.update(true, 'B', 1); h.reduce(false); h.update(true, 'B', 1); assert.equal(h.count(), 0)
  h.update(true, 'C', 2); assert.equal(h.count(), 1)
})
