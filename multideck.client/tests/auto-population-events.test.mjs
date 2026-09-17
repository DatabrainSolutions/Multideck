import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/components/multideck/auto-populated-field.tsx', import.meta.url), 'utf8')
const code = transformSync(source.slice(source.indexOf('export function useAutoPopulationMorph'), source.indexOf('export function AutoPopulatedInput')).replace('export ', ''), { loader: 'tsx' }).code

// Model dependency comparison, effect disposal and callback refs as React does.
// A simple "call every effect" harness misses interrupted animations on updates.
function harness() {
  const slots = [], live = new Set()
  let cursor = 0, pending = [], reveals = 0, reduced = false, visible = true, mountedRef
  const element = { getClientRects: () => visible ? [1] : [] }
  const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const mocks = {
    useRef: initial => slots[cursor++] ?? (slots[cursor - 1] = { current: initial }),
    useCallback: (fn, deps) => {
      const index = cursor++, previous = slots[index]
      if (sameDeps(previous?.deps, deps)) return previous.fn
      slots[index] = { fn, deps }; return fn
    },
    useLayoutEffect: (fn, deps) => {
      const index = cursor++, previous = slots[index]
      if (!sameDeps(previous?.deps, deps)) pending.push({ index, fn, deps, previous })
    },
    assignRef: (ref, value) => ref?.(value),
    createAutoPopulationReveal: () => {
      const id = ++reveals; live.add(id)
      return () => live.delete(id)
    },
    window: { matchMedia: () => ({ matches: reduced }) },
    document: { visibilityState: 'visible' },
  }
  const hook = new Function(...Object.keys(mocks), `${code}; return useAutoPopulationMorph`)(...Object.values(mocks))
  return {
    update(active, value, event, forwardedRef) {
      cursor = 0; pending = []
      const nextRef = hook(active, value, forwardedRef, event)
      for (const effect of pending) effect.previous?.cleanup?.()
      if (mountedRef !== nextRef) { mountedRef?.(null); nextRef(element); mountedRef = nextRef }
      for (const { index, fn, deps } of pending) slots[index] = { deps, cleanup: fn() }
    },
    unmount() { mountedRef?.(null); for (const slot of slots) slot.cleanup?.() },
    count: () => reveals,
    live: () => [...live],
    reduce: value => { reduced = value },
    visible: value => { visible = value },
  }
}

test('mount, lookup matching and remounting saved values do not reveal', () => {
  for (let visit = 0; visit < 4; visit++) {
    const h = harness(); h.update(false, 'Saved value', null); h.update(true, 'Saved value', null); h.update(true, 'Saved value', 2)
    assert.equal(h.count(), 0); h.unmount()
  }
})
test('booking changes require a new deliberate event, with each changed value revealed once', () => {
  const h = harness(); h.update(true, 'A', null); h.update(true, 'Loaded B', null); assert.equal(h.count(), 0)
  h.update(true, 'C', 1); h.update(true, 'C', 1); assert.equal(h.count(), 1)
  h.update(true, 'D', 1); assert.equal(h.count(), 1); assert.deepEqual(h.live(), [])
  h.update(true, 'A', 2); assert.equal(h.count(), 2)
})
test('a selection arriving before its field value still reveals that value', () => {
  const h = harness(); h.update(true, 'A', null); h.update(true, 'A', 1)
  assert.equal(h.count(), 0)
  h.update(true, 'B', 1); assert.deepEqual(h.live(), [1])
})
test('unchanged events, provenance and parent renders do not truncate a running reveal', () => {
  const h = harness(); h.update(true, 'A', null); h.update(true, 'B', 1)
  h.update(false, 'B', 1); h.update(true, 'B', 1); h.update(true, 'B', 2); h.update(true, 'B', 2)
  assert.equal(h.count(), 1); assert.deepEqual(h.live(), [1])
  h.update(true, 'C', 2); assert.deepEqual(h.live(), [2])
})
test('rapid selections replace their predecessors; manual overrides, clears and unmount dispose them', () => {
  const h = harness(); h.update(false, '', null)
  for (let event = 1; event <= 20; event++) { h.update(true, `Value ${event}`, event); assert.deepEqual(h.live(), [event]) }
  h.update(false, 'Manual override', 20); assert.deepEqual(h.live(), [])
  h.update(true, 'C', 21); h.update(false, '', null); assert.deepEqual(h.live(), [])
  h.update(true, 'D', 22); h.unmount(); assert.deepEqual(h.live(), [])
})
test('quote value changes keep genuine feedback; provenance flips alone do not animate', () => {
  const h = harness(); h.update(false, 'A'); h.update(true, 'A'); assert.equal(h.count(), 0)
  h.update(true, 'B'); assert.equal(h.count(), 1)
  h.update(false, 'B'); h.update(true, 'B'); assert.equal(h.count(), 1); assert.deepEqual(h.live(), [1])
})
test('reduced motion consumes the event without deferring an animation', () => {
  const h = harness(); h.update(true, 'A', null); h.reduce(true); h.update(true, 'B', 1); h.reduce(false); h.update(true, 'B', 1); assert.equal(h.count(), 0)
  h.update(true, 'C', 2); assert.equal(h.count(), 1)
})
test('hidden fields never replay an old selection when they become visible', () => {
  const h = harness(); h.update(true, 'A', null); h.visible(false); h.update(true, 'B', 1)
  h.visible(true); h.update(true, 'B', 1); assert.equal(h.count(), 0)
  h.update(true, 'C', 2); assert.deepEqual(h.live(), [1])
})
test('callback refs remain attached across value changes and clear on unmount', () => {
  const seen = [], forwardedRef = element => seen.push(element)
  const h = harness(); h.update(true, 'A', null, forwardedRef); h.update(true, 'B', 1, forwardedRef)
  assert.equal(seen.length, 1); h.unmount(); assert.equal(seen.at(-1), null)
})
