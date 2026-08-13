import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const wizardDialog = await readFile(new URL("../src/components/multideck/wizard-dialog.tsx", import.meta.url), "utf8")

test("wizard step markers mask the connector rail beneath every state", () => {
  assert.match(wizardDialog, /before:-inset-\[3px\]/u)
  assert.match(wizardDialog, /before:bg-\[var\(--md-surface\)\]/u)
  assert.match(wizardDialog, /before:-z-10/u)
  assert.match(wizardDialog, /before:content-\[''\]/u)
})
