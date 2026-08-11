import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const clientSource = readFileSync(new URL("../src/lib/icustoms-api.ts", import.meta.url), "utf8")
const edgeSource = readFileSync(new URL("../../supabase/functions/icustoms-api/index.ts", import.meta.url), "utf8")
const dexterSource = readFileSync(new URL("../../supabase/functions/agent-dexter/index.ts", import.meta.url), "utf8")
const phraseSource = readFileSync(new URL("../src/i18n/customs-declaration-phrases.ts", import.meta.url), "utf8")

test("the Customs item editor exposes an inline iCustoms commodity assistant", () => {
  assert.match(pageSource, /function CommodityAssistant/u)
  assert.match(pageSource, /Find commodity code/u)
  assert.match(pageSource, /Search by goods description or 10-digit code/u)
  assert.match(pageSource, /Apply to goods line/u)
  assert.match(pageSource, /aria-controls=\{`commodity-assistant-\$\{item\.id\}`\}/u)
})

test("commodity lookup runs through the authenticated Multideck Edge Function", () => {
  assert.match(clientSource, /edgeFetch\("icustoms-api", path/u)
  assert.match(clientSource, /"\/commodities\/search"/u)
  assert.match(clientSource, /"\/commodities\/details"/u)
  assert.match(edgeSource, /parts\[0\] === "commodities" && parts\[1\] === "search"/u)
  assert.match(edgeSource, /parts\[0\] === "commodities" && parts\[1\] === "details"/u)
  assert.match(edgeSource, /\.searchCommodities\(query, "UK"\)/u)
})

test("applying a commodity preserves operator descriptions and maps selected certificates", () => {
  assert.match(pageSource, /if \(!item\.description\.trim\(\)\)/u)
  assert.match(pageSource, /\/\^\\d\{10\}\$\/\.test\(enteredDescription\)/u)
  assert.match(pageSource, /detail\.description \|\| selectedSuggestion\.description/u)
  assert.match(pageSource, /existingCodes = new Set/u)
  assert.match(pageSource, /certificate\.category/u)
  assert.match(pageSource, /certificate\.type/u)
  assert.match(pageSource, /certificate\.statement/u)
  assert.match(pageSource, /certificate\.referenceRequired/u)
  assert.match(pageSource, /additionalDocuments\.push/u)
})

test("the commodity assistant copy participates in the app language system", () => {
  assert.match(phraseSource, /"Commodity assistant"/u)
  assert.match(phraseSource, /"Find commodity code"/u)
  assert.match(phraseSource, /"Apply to goods line"/u)
  assert.match(phraseSource, /ar:\s*\{/u)
})

test("Dexter and Watching state the human-review boundary for live classification", () => {
  assert.match(dexterSource, /Live iCustoms commodity suggestions/u)
  assert.match(dexterSource, /not callable from Dexter/u)
  assert.match(dexterSource, /Watching for you begins only after the operator applies and saves/u)
})
