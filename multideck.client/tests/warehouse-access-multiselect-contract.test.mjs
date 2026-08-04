import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const customerPage = await readFile(new URL("src/pages/customer-detail-page.tsx", root), "utf8")
const multiSelect = await readFile(new URL("src/components/multideck/multi-select-menu.tsx", root), "utf8")
const translations = await readFile(new URL("src/i18n/translate.ts", root), "utf8")
const componentData = await readFile(new URL("src/data/multideck-data.ts", root), "utf8")

test("warehouse access uses the shared checkbox dropdown with stable facility IDs", () => {
  assert.match(customerPage, /import \{ MultiSelectMenu \}/)
  assert.match(customerPage, /<MultiSelectMenu value=\{facilityIds\}/)
  assert.match(customerPage, /value: facility\.id, label: `\$\{facility\.code\} · \$\{facility\.name\}`/)
  assert.match(customerPage, /onValueChange=\{setFacilityIds\}/)
  assert.doesNotMatch(customerPage, /aria-pressed=\{selected\}/)
})

test("the shared multi-select supports labelled values and remains documented", () => {
  assert.match(multiSelect, /value: string\s+label: string/)
  assert.match(multiSelect, /DropdownMenuCheckboxItem/)
  assert.match(multiSelect, /option\.translate \? t\(option\.label\) : option\.label/)
  assert.match(translations, /"Select warehouses"/)
  assert.match(componentData, /Customer warehouse access", route: "\/customers"/)
})
