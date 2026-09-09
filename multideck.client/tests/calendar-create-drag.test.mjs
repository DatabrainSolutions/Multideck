import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/calendar-create-drag.ts", import.meta.url), "utf8")
// Exercise the real gesture handlers with a minimal hook/DOM harness.
const stripped = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^import .* from "react"\s*$/m, `
const effects = [];
const useRef = (current) => ({ current });
const useCallback = (callback) => callback;
const useEffect = (effect) => effects.push(effect);
export function mountEffects() { return effects.splice(0).map(effect => effect()).filter(Boolean); }
`)
const { calendarSelectionRange, useCalendarCreateDrag, mountEffects } = await import(`data:text/javascript;base64,${Buffer.from(stripped).toString("base64")}`)

test("selection snaps both directions, stays in the day, and lasts at least 15 minutes", () => {
  assert.deepEqual(calendarSelectionRange(725, 785, 0, 1440), { startMinutes: 720, endMinutes: 780 })
  assert.deepEqual(calendarSelectionRange(725, 665, 0, 1440), { startMinutes: 660, endMinutes: 735 })
  assert.deepEqual(calendarSelectionRange(725, 721, 0, 1440), { startMinutes: 720, endMinutes: 735 })
  assert.deepEqual(calendarSelectionRange(5, -100, 0, 1440), { startMinutes: 0, endMinutes: 15 })
  assert.deepEqual(calendarSelectionRange(1435, 1600, 0, 1440), { startMinutes: 1425, endMinutes: 1440 })
})

function harness() {
  const previous = { window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame }
  const listeners = new Map()
  const frames = new Map()
  let nextFrame = 0
  const created = []
  globalThis.window = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  globalThis.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  const capture = new Set()
  const target = {
    style: { userSelect: "text" },
    parentElement: { getBoundingClientRect: () => ({ left: 200, width: 150 }) },
    setPointerCapture: (id) => capture.add(id),
    hasPointerCapture: (id) => capture.has(id),
    releasePointerCapture: (id) => capture.delete(id),
  }
  const hook = useCalendarCreateDrag({
    gridRef: { current: { getBoundingClientRect: () => ({ top: 100, left: 50, height: 1440 }) } },
    gridStartMinutes: 0, gridEndMinutes: 1440, contextKey: "week:2026-09-03",
    onCreate: (...args) => created.push(args),
  })
  hook.previewRef.current = { style: {} }
  hook.labelRef.current = { textContent: "" }
  const cleanups = mountEffects()
  const event = (overrides = {}) => ({ pointerId: 1, clientY: 825, button: 0, isPrimary: true, pointerType: "mouse", currentTarget: target, preventDefault() {}, ...overrides })
  return {
    hook, created, target, frames, listeners, capture,
    begin: (overrides) => hook.begin(event(overrides), "2026-09-03"),
    emit: (type, overrides) => listeners.get(type)?.(event(overrides)),
    paint: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) },
    cleanup: () => { cleanups.forEach(fn => fn()); Object.assign(globalThis, previous) },
  }
}

test("draw previews immediately, coalesces frames, and opens once only on release", () => {
  const h = harness()
  try {
    h.begin()
    assert.equal(h.hook.previewRef.current.style.visibility, "visible")
    assert.equal(h.hook.labelRef.current.textContent, "12:00–12:15")
    h.emit("pointermove", { clientY: 850 })
    h.emit("pointermove", { clientY: 885 })
    assert.equal(h.frames.size, 1)
    h.paint()
    assert.equal(h.hook.labelRef.current.textContent, "12:00–13:00")
    assert.equal(h.created.length, 0)
    h.emit("pointerup", { clientY: 885 })
    h.emit("pointerup", { clientY: 885 })
    assert.deepEqual(h.created, [["2026-09-03", 720, 780]])
    assert.equal(h.hook.suppressClick(), true)
    assert.equal(h.hook.previewRef.current.style.visibility, "hidden")
    assert.equal(h.target.style.userSelect, "text")
    assert.equal(h.capture.size, 0)
  } finally { h.cleanup() }
})

test("click and touch retain the existing accessible creation and scrolling behaviour", () => {
  const h = harness()
  try {
    h.begin({ pointerType: "touch" })
    assert.equal(h.capture.size, 0)
    h.begin()
    h.emit("pointerup")
    assert.equal(h.created.length, 0)
    assert.equal(h.hook.suppressClick(), false)
  } finally { h.cleanup() }
})

for (const cancellation of ["pointercancel", "keydown", "scroll", "resize", "blur"]) {
  test(`${cancellation} cancels without opening a form and permits the next drag`, () => {
    const h = harness()
    try {
      h.begin()
      h.emit("pointermove", { clientY: 900 })
      h.emit(cancellation, { key: "Escape" })
      h.emit("pointerup", { clientY: 900 })
      assert.equal(h.created.length, 0)
      assert.equal(h.frames.size, 0)
      assert.equal(h.hook.previewRef.current.style.visibility, "hidden")
      h.begin()
      h.emit("pointermove", { clientY: 765 })
      h.emit("pointerup", { clientY: 765 })
      assert.deepEqual(h.created, [["2026-09-03", 660, 735]])
    } finally { h.cleanup() }
  })
}

test("other pointers cannot finish a selection; unmount releases resources", () => {
  const h = harness()
  h.begin()
  h.emit("pointermove", { clientY: 900 })
  h.emit("pointerup", { pointerId: 2, clientY: 900 })
  assert.equal(h.created.length, 0)
  assert.equal(h.capture.size, 1)
  h.cleanup()
  assert.equal(h.frames.size, 0)
  assert.equal(h.listeners.size, 0)
  assert.equal(h.capture.size, 0)
})
