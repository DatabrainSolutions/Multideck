import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("catalogue-backed Customs fields share a searchable structured combobox", () => {
  assert.match(source, /function CustomsReferenceCombobox\(/u)
  assert.match(source, /function SelectField[\s\S]*<CustomsReferenceCombobox/u)
  assert.match(source, /function ItemTableSelect[\s\S]*<CustomsReferenceCombobox/u)
  assert.match(source, /label=\{t\("Import country"\)\}[\s\S]*<CustomsReferenceCombobox/u)
  assert.match(source, /label=\{t\("Dispatched country"\)\}[\s\S]*<CustomsReferenceCombobox/u)
  assert.doesNotMatch(source, /<Select(?:Trigger|Content|Item)?\b/u)
  assert.match(source, /referenceOptions\.filter\(\(\[code, optionLabel\]\)[\s\S]*normalizedReferenceTerm/u)
  assert.match(source, /onClick=\{\(\) => choose\(option\)\}/u)
  assert.match(source, /function choose\(option: CustomsReferenceOptionTuple\)[\s\S]*onChange\(option\[0\]\)[\s\S]*closeAndReset\(\)/u)
})

test("manual entry only commits an exact catalogue option and reports invalid text", () => {
  assert.match(source, /function exactReferenceOption\(/u)
  assert.match(source, /normalizedReferenceTerm\(code\) === term/u)
  assert.match(source, /const exact = exactReferenceOption\(referenceOptions, query\)/u)
  assert.match(source, /else setManualEntryError\(true\)/u)
  assert.match(source, /aria-invalid=\{manualEntryError \|\| undefined\}/u)
  assert.match(source, /aria-describedby=\{manualEntryError \? helpId : undefined\}/u)
  assert.match(source, /Type an exact code or choose a listed option\./u)
})

test("combobox supports the expected keyboard and screen-reader model", () => {
  assert.match(source, /role="combobox"[\s\S]*aria-expanded=\{open\}[\s\S]*aria-controls=\{listId\}/u)
  assert.match(source, /aria-autocomplete="list"/u)
  assert.match(source, /aria-activedescendant=\{optionId\}/u)
  assert.match(source, /role="listbox"/u)
  assert.match(source, /role="option"[\s\S]*aria-selected=\{option\[0\] === value\}/u)
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]) assert.match(source, new RegExp(`event\\.key === "${key}"`, "u"))
  assert.match(source, /tabIndex=\{-1\}/u)
  assert.match(source, /role="status" aria-live="polite"/u)
})

test("search controls retain mobile targets and direction-safe layout", () => {
  assert.match(source, /dir=\{direction\}/u)
  assert.match(source, /h-11[\s\S]*sm:h-9/u)
  assert.match(source, /min-h-11/u)
  assert.match(source, /start-3/u)
})
