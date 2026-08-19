import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const crmPage = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const wizardDialog = await readFile(new URL("../src/components/multideck/wizard-dialog.tsx", import.meta.url), "utf8")

test("CRM event-opened dialogs restore focus to their opening action", () => {
  assert.match(crmPage, /function useDialogReturnFocus\(open: boolean\)/u)
  assert.match(crmPage, /<DialogContent onCloseAutoFocus=\{restoreDialogFocus\}/u)
  assert.match(crmPage, /<DialogContent onCloseAutoFocus=\{restoreNewDealFocus\}/u)
  assert.match(crmPage, /event\.preventDefault\(\)[\s\S]*target\.focus\(\)/u)
  assert.match(wizardDialog, /onCloseAutoFocus=\{\(event\) =>/u)
})
