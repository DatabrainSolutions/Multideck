import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const page = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const validation = await readFile(new URL("../src/lib/customs-declaration.ts", import.meta.url), "utf8")

test("declaration details marks the internal reference as required instead of the trader reference", () => {
  assert.match(page, /label=\{t\("Trader reference number"\)\}[\s\S]*?dataElement="2\/4" customsBox="44" showDataElements=/u)
  assert.doesNotMatch(page, /label=\{t\("Trader reference number"\)\}[\s\S]*?customsBox="44" required showDataElements=/u)
  assert.match(page, /label=\{t\("Internal reference"\)\} required showDataElements=/u)
  assert.match(page, /internalReference: \{ label: "Internal reference" \}/u)
})

test("validation requires the internal reference for exports while keeping the trader reference optional", () => {
  assert.match(validation, /draft\.direction === "export"\) requireGeneral\("internalReference", "Add an internal reference\."\)/u)
  assert.doesNotMatch(validation, /requireGeneral\("traderReference"/u)
  assert.match(validation, /draft\.traderReference\.trim\(\) && !\/\^\[A-Z0-9\]/u)
})

test("exports require a carrier and a consignor for every goods item", () => {
  assert.match(page, /label=\{t\("Carrier"\)\} required[\s\S]*?fieldKey="carrier"/u)
  assert.match(page, /label=\{t\("Consignor"\)\}[\s\S]*?required[\s\S]*?fieldKey="consignor"/u)
  assert.match(validation, /draft\.direction === "export"\) requireGeneral\("carrier", "Add the carrier name or identifier\."\)/u)
  assert.match(validation, /draft\.direction === "export" && !item\.consignor\.trim\(\)\) push\("consignor", "Add the consignor for this goods item\."\)/u)
})

test("document waivers may use a declaration statement instead of an invented ID", () => {
  assert.match(validation, /reference: item\.additionalDocumentId, name: item\.additionalDocumentName/u)
  assert.match(validation, /!entry\.reference\.trim\(\) && !entry\.name\.trim\(\)/u)
  assert.doesNotMatch(validation, /Complete every added document category, type and ID\./u)
})
