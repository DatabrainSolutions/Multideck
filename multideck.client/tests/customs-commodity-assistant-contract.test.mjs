import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const clientSource = readFileSync(new URL("../src/lib/icustoms-api.ts", import.meta.url), "utf8")
const edgeSource = readFileSync(new URL("../../supabase/functions/icustoms-api/index.ts", import.meta.url), "utf8")
const sharedICustomsSource = readFileSync(new URL("../../supabase/functions/_shared/icustoms.ts", import.meta.url), "utf8")
const dexterSource = readFileSync(new URL("../../supabase/functions/agent-dexter/index.ts", import.meta.url), "utf8")
const phraseSource = readFileSync(new URL("../src/i18n/customs-declaration-phrases.ts", import.meta.url), "utf8")
const commodityAssistantSource = pageSource.slice(
  pageSource.indexOf("function CommoditySmartSearch"),
  pageSource.indexOf("\nfunction ItemDetailsEditor"),
)

test("the Customs item editor opens a field-native iCustoms search dialog", () => {
  assert.match(pageSource, /function CommoditySmartSearch/u)
  assert.match(pageSource, /Smart commodity search/u)
  assert.match(pageSource, /Search for a commodity/u)
  assert.match(pageSource, /Commodity code or description/u)
  assert.match(pageSource, /Save commodity/u)
  assert.match(pageSource, /const dialogId = `commodity-smart-search-\$\{item\.id\}-\$\{triggerVariant\}`/u)
  assert.match(pageSource, /triggerVariant === "certificates"/u)
  assert.match(pageSource, /aria-haspopup="dialog"/u)
  assert.match(pageSource, /<Dialog open=\{open\}/u)
  assert.doesNotMatch(pageSource, /PopoverTrigger asChild/u)
  assert.doesNotMatch(pageSource, /Find commodity code/u)
})

test("commodity matches update while typing with explicit country and mode controls", () => {
  assert.match(pageSource, /window\.setTimeout\(\(\) => \{/u)
  assert.match(pageSource, /\}, 320\)/u)
  assert.match(pageSource, /searchICustomsCommodities\(resolvedQuery, importCountry\)/u)
  assert.match(pageSource, /Import country/u)
  assert.match(pageSource, /Import \/ export/u)
  assert.match(pageSource, /Tax & duty/u)
  assert.match(pageSource, /taxAndDuty \? <motion\.div key="dispatched-country"/u)
  assert.match(pageSource, /aria-autocomplete="list"/u)
  assert.match(pageSource, /commodity-suggestions-/u)
  assert.match(pageSource, /suggestions\.map\(\(suggestion, index\) => <motion\.button/u)
  assert.match(pageSource, /border-t border-\[var\(--md-line\)\]/u)
  assert.match(pageSource, /bg-transparent/u)
})

test("certificates stay behind an explicit disclosure", () => {
  assert.match(pageSource, /Certificates list/u)
  assert.match(pageSource, /triggerVariant === "certificates" \? <Button/u)
  assert.match(pageSource, /triggerVariant === "search" \? <>/u)
  assert.match(pageSource, /Certificates for commodity/u)
  assert.match(pageSource, /Save certificates/u)
  assert.match(pageSource, /setCertificatesOpen\(\(current\) => !current\)/u)
  assert.match(pageSource, /certificatesOpen \? <motion\.div/u)
})

test("commodity dialogs keep responsive, unclipped, RTL-safe geometry and reduced motion", () => {
  assert.match(commodityAssistantSource, /flex max-h-\[min\(calc\(100dvh-32px\),780px\)\] flex-col/u)
  assert.match(commodityAssistantSource, /min-h-0 flex-1 overflow-y-auto overscroll-contain/u)
  assert.match(commodityAssistantSource, /shrink-0 border-t/u)
  assert.match(commodityAssistantSource, /\bend-/u)
  assert.match(commodityAssistantSource, /\bpe-/u)
  assert.match(commodityAssistantSource, /\btext-start/u)
  assert.doesNotMatch(commodityAssistantSource, /\b(?:left|right)-\d/u)
  assert.match(commodityAssistantSource, /useReducedMotion/u)
  assert.match(commodityAssistantSource, /reduceMotion\(/u)
})

test("commodity lookup runs through the authenticated Multideck Edge Function", () => {
  assert.match(clientSource, /edgeFetch\("icustoms-api", path/u)
  assert.match(clientSource, /"\/commodities\/search"/u)
  assert.match(clientSource, /"\/commodities\/details"/u)
  assert.match(edgeSource, /parts\[0\] === "commodities" && parts\[1\] === "search"/u)
  assert.match(edgeSource, /parts\[0\] === "commodities" && parts\[1\] === "details"/u)
  assert.match(clientSource, /JSON\.stringify\(\{ query, country \}\)/u)
  assert.match(edgeSource, /\.searchCommodities\(\s*query,\s*country,/u)
  assert.match(edgeSource, /connectedICustomsClient\(\)\.searchCommodities\(/u)
  assert.match(edgeSource, /commoditySearchCache/u)
  assert.match(clientSource, /pendingCommoditySearches/u)
  const detailValidation = edgeSource.indexOf('if (!/^\\d{10}$/.test(detail.code))')
  const detailCacheWrite = edgeSource.indexOf('cacheCommodityValue(commodityDetailCache, cacheKey, detail)')
  assert.ok(detailValidation >= 0 && detailCacheWrite > detailValidation, "Invalid tariff records must not be cached.")
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

test("repeatable Customs item groups remain addable, removable, and mapped to iCustoms", () => {
  const repeatableGroups = [
    "additionalTaricCodes",
    "additionalNationalCodes",
    "additionalPackageDetails",
    "additionalProcedureCodes",
    "additionalPreviousDocuments",
    "additionalDocuments",
    "additionalInformationStatements",
    "dutyCalculations",
    "valuationAdjustments",
    "itemExporters",
    "itemSellers",
    "itemBuyers",
    "domesticDutyTaxParties",
    "mutualRecognitionParties",
  ]
  for (const group of repeatableGroups) {
    assert.match(pageSource, new RegExp(group, "u"), `${group} needs a visible repeatable group.`)
    assert.match(pageSource, new RegExp(`update\\("${group}"`, "u"), `${group} needs editable UI state.`)
    assert.match(sharedICustomsSource, new RegExp(`item\\.${group}`, "u"), `${group} needs an iCustoms payload mapping.`)
  }
  assert.match(pageSource, /function RepeatableCustomsRow/u)
  assert.match(pageSource, /onRemove/u)
})

test("the smart commodity search copy participates in the app language system", () => {
  assert.match(phraseSource, /"Smart commodity search"/u)
  assert.match(phraseSource, /"Search for a commodity"/u)
  assert.match(phraseSource, /"Certificates list"/u)
  assert.match(phraseSource, /"Certificates for commodity"/u)
  assert.match(phraseSource, /"Save certificates"/u)
  assert.match(phraseSource, /"Select country"/u)
  assert.match(phraseSource, /"Save commodity"/u)
  assert.match(phraseSource, /ar:\s*\{/u)
})

test("Dexter and Watching state the human-review boundary for live classification", () => {
  assert.match(dexterSource, /Live iCustoms commodity suggestions/u)
  assert.match(dexterSource, /not callable from Dexter/u)
  assert.match(dexterSource, /Watching for you begins only after the operator applies and saves/u)
})
