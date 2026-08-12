import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const selectSource = await readFile(new URL("../src/components/ui/select.tsx", import.meta.url), "utf8")
const inputSource = await readFile(new URL("../src/components/ui/input.tsx", import.meta.url), "utf8")
const textareaSource = await readFile(new URL("../src/components/ui/textarea.tsx", import.meta.url), "utf8")
const navigationSource = await readFile(new URL("../src/components/ui/field-tab-navigation.ts", import.meta.url), "utf8")
const appShellSource = await readFile(new URL("../src/components/multideck/app-shell.tsx", import.meta.url), "utf8")

test("shared fields use one forward and reverse field-only Tab sequence", () => {
  assert.match(selectSource, /moveTabToAdjacentField\(event\)/)
  assert.match(inputSource, /moveTabToAdjacentField\(event\)/)
  assert.match(textareaSource, /moveTabToAdjacentField\(event\)/)
  assert.match(appShellSource, /onKeyDownCapture=\{moveTabToAdjacentField\}/)
  assert.match(navigationSource, /event\.key !== "Tab"/)
  assert.match(navigationSource, /event\.shiftKey \? -1 : 1/)
  assert.match(navigationSource, /event\.target instanceof HTMLElement/)
})

test("field completion skips ordinary buttons and preserves native Tab at form edges", () => {
  assert.match(navigationSource, /input:not\(\[disabled\]\):not\(\[type="hidden"\]\)/)
  assert.match(navigationSource, /\[role="combobox"\]/)
  assert.match(navigationSource, /if \(!nextField\) return/)
  assert.doesNotMatch(navigationSource, /button:not\(\[disabled\]\)/)
  assert.doesNotMatch(navigationSource, /tabIndex\s*=\s*\{?[1-9]/)
})
