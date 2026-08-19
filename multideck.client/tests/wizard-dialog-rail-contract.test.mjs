import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const wizardDialog = await readFile(new URL("../src/components/multideck/wizard-dialog.tsx", import.meta.url), "utf8")

test("wizard step markers mask the connector rail beneath every state", () => {
  assert.match(wizardDialog, /ring-\[3px\] ring-\[var\(--md-surface\)\]/u)
  assert.match(wizardDialog, /relative z-\[1\] grid size-6/u)
  assert.doesNotMatch(wizardDialog, /before:bg-\[var\(--md-surface\)\]/u)
  assert.match(wizardDialog, /group-focus-visible:outline-\[var\(--md-accent\)\]/u)
})

test("wizard step states remain distinct in light and dark themes", () => {
  assert.match(wizardDialog, /bg-\[var\(--md-line-strong\)\]/u)
  assert.match(wizardDialog, /bg-\[var\(--md-field-bg\)\] text-\[var\(--md-text\)\]/u)
  assert.match(wizardDialog, /bg-\[var\(--md-accent-a18\)\] text-\[var\(--md-accent\)\]/u)
  assert.match(wizardDialog, /bg-\[var\(--md-accent\)\] text-\[var\(--md-accent-ink\)\]/u)
})

test("event-opened wizards restore focus to the action that opened them", () => {
  assert.match(wizardDialog, /returnFocusTarget\.current = activeElement instanceof HTMLElement/u)
  assert.match(wizardDialog, /onCloseAutoFocus=\{\(event\) =>/u)
  assert.match(wizardDialog, /if \(!target\?\.isConnected\) return/u)
  assert.match(wizardDialog, /event\.preventDefault\(\)[\s\S]*target\.focus\(\)/u)
})
