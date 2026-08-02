import assert from "node:assert/strict"
import test from "node:test"
import {
  bindingAriaKeyshortcuts,
  bindingLabel,
  bindingSurvivesTyping,
  bindingTokens,
  bindingsEqual,
  chord,
  isReservedBinding,
  isSequenceBinding,
  matchesPointerBinding,
  matchesStep,
  parseBinding,
  pointerGesture,
  sequence,
  serializeBinding,
  stepFromEvent,
  type ShortcutKeyEvent,
} from "../src/lib/keyboard-shortcut-binding.ts"

function keyEvent(overrides: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent {
  return { code: undefined, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides }
}

test("a binding round-trips through its stored form", () => {
  const cases = [
    chord("K", { mod: true }),
    chord("/", {}),
    chord("B", { mod: true, shift: true }),
    chord("Enter", { alt: true }),
    sequence("G", "B"),
    pointerGesture({ mod: true }),
  ]

  for (const binding of cases) {
    assert.ok(bindingsEqual(binding, parseBinding(serializeBinding(binding))), serializeBinding(binding))
  }
})

test("the stored form names the intent, not the platform key", () => {
  // One saved preference has to mean ⌘K on a Mac and Ctrl+K on Windows, which is
  // only possible if the modifier is stored as "Mod".
  assert.equal(serializeBinding(chord("K", { mod: true })), "Mod+K")
  assert.equal(serializeBinding(sequence("G", "B")), "G B")
  assert.equal(serializeBinding(pointerGesture({ mod: true })), "Mod+DoubleClick")
})

test("modifier spellings from either platform parse to the same binding", () => {
  const expected = chord("K", { mod: true })
  for (const value of ["Mod+K", "Cmd+K", "Meta+k", "Ctrl+K", "control+K"]) {
    assert.ok(bindingsEqual(parseBinding(value), expected), value)
  }
})

test("mod resolves to the platform key, and the other modifier is rejected", () => {
  const binding = chord("K", { mod: true })
  const step = binding.kind === "chord" ? binding.steps[0] : null
  assert.ok(step)

  assert.ok(matchesStep(step, keyEvent({ key: "k", metaKey: true }), "apple"))
  assert.ok(!matchesStep(step, keyEvent({ key: "k", ctrlKey: true }), "apple"))
  assert.ok(matchesStep(step, keyEvent({ key: "k", ctrlKey: true }), "other"))
  assert.ok(!matchesStep(step, keyEvent({ key: "k", metaKey: true }), "other"))

  // Holding both is somebody else's chord, not ours.
  assert.ok(!matchesStep(step, keyEvent({ key: "k", metaKey: true, ctrlKey: true }), "apple"))
})

test("an extra modifier does not satisfy a plainer binding", () => {
  const binding = chord("B", { mod: true })
  const step = binding.kind === "chord" ? binding.steps[0] : null
  assert.ok(step)

  assert.ok(!matchesStep(step, keyEvent({ key: "b", metaKey: true, shiftKey: true }), "apple"))
  assert.ok(!matchesStep(step, keyEvent({ key: "b", metaKey: true, altKey: true }), "apple"))
})

test("the physical code wins over the character the layout produced", () => {
  const binding = chord("K", { mod: true, alt: true })
  const step = binding.kind === "chord" ? binding.steps[0] : null
  assert.ok(step)

  // ⌥K reports "˚" as its key on a Mac, so matching on key alone would fail.
  assert.ok(matchesStep(step, keyEvent({ key: "˚", code: "KeyK", metaKey: true, altKey: true }), "apple"))
})

test("modifier-only presses never produce a step", () => {
  for (const key of ["Shift", "Meta", "Control", "Alt", "CapsLock"]) {
    assert.equal(stepFromEvent(keyEvent({ key })), null, key)
  }
})

test("a captured step keeps the modifier the operator actually held", () => {
  assert.deepEqual(stepFromEvent(keyEvent({ key: "d", code: "KeyD", metaKey: true }), "apple"), {
    key: "D",
    mod: true,
    shift: false,
    alt: false,
  })

  assert.deepEqual(stepFromEvent(keyEvent({ key: " ", code: "Space" }), "other"), {
    key: "Space",
    mod: false,
    shift: false,
    alt: false,
  })
})

test("the pointer gesture matches only its own modifier set", () => {
  const binding = pointerGesture({ mod: true })

  assert.ok(matchesPointerBinding(binding, { metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, "apple"))
  assert.ok(matchesPointerBinding(binding, { metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, "other"))
  // A bare double-click has to stay a bare double-click.
  assert.ok(!matchesPointerBinding(binding, { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, "apple"))
  assert.ok(!matchesPointerBinding(binding, { metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, "apple"))
})

test("keycaps read in the platform's own glyphs", () => {
  assert.deepEqual(bindingTokens(chord("K", { mod: true, shift: true }), "apple"), [["⌘", "⇧", "K"]])
  assert.deepEqual(bindingTokens(chord("K", { mod: true, shift: true }), "other"), [["Ctrl", "Shift", "K"]])
  assert.deepEqual(bindingTokens(sequence("G", "B"), "apple"), [["G"], ["B"]])
  assert.deepEqual(bindingTokens(pointerGesture({ mod: true }), "other"), [["Ctrl", "Double-click"]])
  assert.deepEqual(bindingTokens(chord("Enter"), "apple"), [["↵"]])
  assert.deepEqual(bindingTokens(null), [])
})

test("a sequence reads as two steps in its flat label", () => {
  assert.equal(bindingLabel(sequence("G", "B"), "apple"), "G then B")
  assert.equal(bindingLabel(chord(",", { mod: true }), "apple"), "⌘ ,")
  assert.ok(isSequenceBinding(sequence("G", "B")))
  assert.ok(!isSequenceBinding(chord("K", { mod: true })))
})

test("only modifier chords are safe to fire while typing", () => {
  // A bare "/" or a "G B" run belongs to the field the operator is in.
  assert.ok(bindingSurvivesTyping(chord("K", { mod: true })))
  assert.ok(bindingSurvivesTyping(chord("Enter", { alt: true })))
  assert.ok(!bindingSurvivesTyping(chord("/")))
  assert.ok(!bindingSurvivesTyping(sequence("G", "B")))
  assert.ok(!bindingSurvivesTyping(null))
})

test("browser-owned chords are flagged, and ⌘D is not", () => {
  assert.ok(isReservedBinding(chord("W", { mod: true })))
  assert.ok(isReservedBinding(chord("T", { mod: true })))
  // Multideck claims ⌘D for the Dexter summon and cancels the browser default,
  // so warning about it would be warning about ourselves.
  assert.ok(!isReservedBinding(chord("D", { mod: true })))
  // A shifted variant is not the chord the browser owns.
  assert.ok(!isReservedBinding(chord("W", { mod: true, shift: true })))
  assert.ok(!isReservedBinding(sequence("G", "W")))
})

test("aria-keyshortcuts advertises both platform spellings", () => {
  assert.equal(bindingAriaKeyshortcuts(chord("K", { mod: true })), "Meta+K Control+K")
  assert.equal(bindingAriaKeyshortcuts(chord("/")), "/")
  // Sequences and pointer gestures have no ARIA spelling, so nothing is claimed.
  assert.equal(bindingAriaKeyshortcuts(sequence("G", "B")), undefined)
  assert.equal(bindingAriaKeyshortcuts(pointerGesture({ mod: true })), undefined)
})

test("empty and malformed stored values fall back to nothing", () => {
  for (const value of ["", "   ", null, undefined, "Mod+", "Shift"]) {
    assert.equal(parseBinding(value as string | null | undefined), null, JSON.stringify(value))
  }
})

test("a stored sequence longer than two steps is truncated, not rejected", () => {
  const parsed = parseBinding("G B C")
  assert.ok(parsed && parsed.kind === "chord")
  assert.equal(parsed.steps.length, 2)
})
