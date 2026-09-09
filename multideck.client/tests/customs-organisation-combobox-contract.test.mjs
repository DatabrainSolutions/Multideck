import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("Customs party fields use a typeable CRM organisation combobox", () => {
  assert.match(source, /function CustomsOrganisationCombobox\(/u)
  assert.match(source, /role="combobox"[\s\S]*aria-autocomplete="list"[\s\S]*onChange=\{\(event\) => \{[\s\S]*onChange\(event\.target\.value\)/u)
  assert.match(source, /role="listbox"/u)
  assert.match(source, /listAccountsPage\(\{[\s\S]*organisationType: "company"[\s\S]*filterQuery: customsOrganisationTypeFilter\(party\)/u)
  for (const party of ["importer", "exporter", "consignee", "declarant", "carrier", "representative"]) {
    assert.match(source, new RegExp(`<CustomsOrganisationField party="${party}"`, "u"))
  }
})

test("each Customs field restricts suggestions to relevant company types", () => {
  const expectedMappings = [
    /importer: \["Importer", "Consignee", "Customer", "Key Customer Account"\]/u,
    /exporter: \["Exporter", "Consignor\/Shipper", "Supplier"\]/u,
    /consignee: \["Consignee", "Customer", "Potential Customer", "Key Customer Account"\]/u,
    /declarant: \["Declarant", "Customs Broker", "Freight Forwarder"\]/u,
    /carrier: \["Carrier", "Shipping Line", "Airline", "Domestic Haulier", "International Haulier", "Supplier"\]/u,
    /representative: \["Representative", "Customs Broker", "Freight Forwarder", "Overseas Agent"\]/u,
  ]
  for (const mapping of expectedMappings) assert.match(source, mapping)
  assert.match(source, /field: "organisationTypes"[\s\S]*operator: "is"[\s\S]*value: type/u)
})

test("selecting an organisation fills the legal name and main address while failed suggestions preserve manual entry", () => {
  assert.match(source, /function customsPartyPatch\([\s\S]*\[party\]: organisation\.name[\s\S]*\[`\$\{party\}Name`\]: organisation\.name/u)
  assert.match(source, /\[`\$\{party\}AddressLine`\]: \[address\?\.line1, address\?\.line2\]\.filter\(Boolean\)\.join\(", "\)/u)
  assert.match(source, /\[`\$\{party\}City`\]: address\?\.townCity \?\? ""[\s\S]*\[`\$\{party\}Postcode`\]: address\?\.postZipCode \?\? ""[\s\S]*\[`\$\{party\}Country`\]: address\?\.countryCode\?\.toUpperCase\(\) \?\? ""/u)
  assert.match(source, /const detail = await getCustomer\(organisation\.id\)[\s\S]*onSelect\(detail\)/u)
  assert.match(source, /Company suggestions unavailable\.[\s\S]*You can keep typing the party name or EORI manually\./u)
})

test("company suggestions are prefetched once and filter locally without a blocking loading state", () => {
  assert.match(source, /function useCustomsOrganisationDirectory\(\)[\s\S]*organisationType: "company"[\s\S]*limit: 100/u)
  assert.match(source, /const directory = useContext\(CustomsOrganisationDirectoryContext\)/u)
  assert.match(source, /const localCompanies = useMemo\(\(\) => directory\.companies\.filter/u)
  assert.match(source, /searchable\.includes\(normalizedSearch\)/u)
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*filterQuery: customsOrganisationTypeFilter\(party\)[\s\S]*\}, 140\)/u)
  assert.doesNotMatch(source, /t\("Loading companies"\)/u)
  assert.doesNotMatch(source, /aria-busy=\{loading/u)
})

test("the company menu matches its field width without explanatory header copy", () => {
  assert.match(source, /className="w-\[var\(--radix-popover-trigger-width\)\]! max-w-\[calc\(100vw-1rem\)\]/u)
  assert.doesNotMatch(source, /min-w-\[min\(320px/u)
  assert.doesNotMatch(source, /\{t\("Showing companies typed as"\)\}/u)
})

test("organisation suggestions retain keyboard and mobile support", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]) assert.match(source, new RegExp(`event\\.key === "${key}"`, "u"))
  assert.match(source, /dir=\{direction\}/u)
  assert.match(source, /min-h-11/u)
})
