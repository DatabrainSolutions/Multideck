import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const themePreferences = readFileSync(new URL("../src/lib/theme-preferences.tsx", import.meta.url), "utf8")

/** The literal the pre-paint script and `ThemeProvider` both have to agree on. */
const storageKey = themePreferences.match(/export const themeStorageKey = "([^"]+)"/)?.[1]

test("the pre-paint script reads the same storage key next-themes writes", () => {
  assert.ok(storageKey, "themeStorageKey is no longer declared as a plain string literal")
  assert.match(indexHtml, new RegExp(`localStorage\\.getItem\\("${storageKey}"\\)`))
})

test("the pre-paint script runs before the body, so no light frame is painted", () => {
  const scriptIndex = indexHtml.indexOf("localStorage.getItem")
  const bodyIndex = indexHtml.indexOf("<body")

  assert.notEqual(scriptIndex, -1, "index.html no longer applies the stored theme before paint")
  assert.ok(scriptIndex < bodyIndex, "the theme script must be in <head>, ahead of the body")
  assert.doesNotMatch(
    indexHtml.slice(0, bodyIndex),
    /<script[^>]*\b(defer|async)\b/,
    "deferring the theme script puts the class back after first paint",
  )
})

test("a deliberate choice outranks a profile read that started earlier", () => {
  // The ordering rule is the whole fix: without it a slow profile read lands
  // after the click and flashes the interface back to the previous mode.
  assert.match(themePreferences, /localChoice = \{ mode, at: performance\.now\(\) \}/)
  assert.match(themePreferences, /const startedAt = performance\.now\(\)/)
  assert.match(themePreferences, /const isStaleRead = localChoice && localChoice\.at > startedAt/)
})

test("a choice that failed to save is retried rather than reverted", () => {
  // Otherwise a rejected write leaves the profile holding the old mode, and the
  // next token refresh reads it back and undoes the operator's choice.
  assert.match(themePreferences, /const isUnwritten = localChoice && lastPersistedTheme !== localChoice\.mode/)
  assert.match(themePreferences, /if \(localChoice && \(isStaleRead \|\| wasUnwrittenAtStart \|\| isUnwritten\)\)/)
})

test("a profile read that began before its queued save cannot restore the old mode", () => {
  // The write may finish while the read is in flight. Comparing only the final
  // persisted state would then make the old read look current and flash back.
  assert.match(themePreferences, /const choiceAtStart = localChoice/)
  assert.match(themePreferences, /const persistedThemeAtStart = lastPersistedTheme/)
  assert.match(themePreferences, /const wasUnwrittenAtStart = choiceAtStart && persistedThemeAtStart !== choiceAtStart\.mode/)
  assert.match(themePreferences, /isStaleRead \|\| wasUnwrittenAtStart \|\| isUnwritten/)
})

test("only a genuine account change discards this browser's choice", () => {
  // Clearing on the first resolve would drop a click made while the session
  // lookup was still in flight; not clearing at all would hand one operator's
  // choice to the next person signing in on this browser.
  assert.match(themePreferences, /if \(activeUserId !== null && activeUserId !== userId\)/)
})
