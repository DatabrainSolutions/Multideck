import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("standalone declarations use one eye control for field visibility", () => {
  assert.match(pageSource, /<DeclarationFieldVisibilityPopover value=\{fieldVisibility\} onChange=\{setFieldVisibility\}/u)
  assert.match(pageSource, /aria-label=\{t\("Field visibility"\)\}[\s\S]*?<Eye/u)
  assert.match(pageSource, /rounded-full[\s\S]*?hover:bg-\[var\(--md-hover\)\]/u)
  assert.doesNotMatch(pageSource, /<Toggle checked=\{show(?:DataElements|CustomsBoxNumbers|Optional)\}/u)
})

test("the visibility popover applies and persists every checkbox immediately", () => {
  assert.match(pageSource, /key: "dataElements", label: "Data elements"/u)
  assert.match(pageSource, /key: "customsBoxNumbers", label: "Customs box numbers"/u)
  assert.match(pageSource, /key: "optionalFields", label: "Option fields"/u)
  assert.match(pageSource, /onCheckedChange=\{\(checked\) => onChange\(\{ \.\.\.value, \[option\.key\]: checked === true \}\)\}/u)
  assert.match(pageSource, /localStorage\.setItem\(declarationFieldVisibilityStorageKey, JSON\.stringify\(value\)\)/u)
  assert.doesNotMatch(pageSource, /DeclarationFieldVisibilityPopover[\s\S]*?<Button[^>]*>\{?t\("Save"\)/u)
})

test("the visibility interaction is keyboard-labelled and motion-safe", () => {
  assert.match(pageSource, /aria-labelledby=\{titleId\}/u)
  assert.match(pageSource, /<label htmlFor=\{option\.id\}/u)
  assert.match(pageSource, /active:scale-\[0\.96\]/u)
  assert.match(pageSource, /motion-reduce:active:scale-100/u)
  assert.match(pageSource, /data-open:animate-none!/u)
})
