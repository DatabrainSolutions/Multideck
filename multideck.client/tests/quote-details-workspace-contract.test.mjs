import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const page = read("multideck.client/src/pages/quotes-page.tsx")
const api = read("multideck.client/src/lib/quote-workflow-api.ts")
const fields = read("multideck.client/src/components/multideck/quote-details/quote-detail-fields.tsx")
const model = read("multideck.client/src/components/multideck/quote-details/quote-detail-model.ts")
const accountDetail = read("multideck.client/src/pages/crm-account-detail-page.tsx")
const detailsStart = page.indexOf("function QuoteDetailsPanelV2")
const detailsEnd = page.indexOf("function QuoteCargoWiseChargesPanel", detailsStart)
const details = page.slice(detailsStart, detailsEnd)

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function expectRoundTrip(field, loaded = field, saved = field) {
  assert.match(page, new RegExp(`${escaped(field)}:\\s*fact\\("${escaped(loaded)}"\\)`, "u"), `${field} must load from saved quote facts.`)
  assert.match(page, new RegExp(`${escaped(saved)}:\\s*quote\\.${escaped(field)}\\b`, "u"), `${field} must be included in the save payload.`)
}

test("quote details reorganise references around their owning parties and remove obsolete controls", () => {
  assert.ok(detailsStart > -1 && detailsEnd > detailsStart, "The editable quote details workspace must remain present.")
  assert.match(details, /title="Customer(?: data)?"[\s\S]*label="Customer ref"/u)
  assert.match(details, /const reference = role === "shipper" \? quote\.shipperReference[\s\S]*quote\.consigneeReference[\s\S]*quote\.agentReference/u)
  assert.match(details, /label=\{`\$\{title\} ref`\}/u)
  assert.match(details, /roleCard\("agent"\)[\s\S]*roleCard\("shipper"\)[\s\S]*roleCard\("consignee"\)/u)
  assert.match(details, /supplier\.carriers\.map[\s\S]*label="Carrier ref"/u)
  assert.doesNotMatch(details, /label="Hold reason"/u)
  assert.doesNotMatch(details, /label="Docs"/u)
  assert.match(details, /label="Source"[\s\S]{0,500}\brequired\b/u)
  assert.match(page, /aria-label=\{`\$\{t\("Sales representative"\)\}[\s\S]{0,1000}<CustomerAvatar/u)
  assert.doesNotMatch(details, /<CargoWiseSelectField label="Sales rep"/u)

  const jobData = details.slice(details.indexOf('title="Job data"'), details.indexOf('title="Customer data"'))
  assert.match(jobData, /label="Mode"/u)
  assert.match(jobData, /label="Shipment type"/u)
  assert.match(jobData, /label="HBL mode"/u)
})

test("party selection keeps related and recent organisations above a hairline with manual entry available", () => {
  assert.match(api, /relatedPartyRecommendations:\s*QuoteRelatedPartyRecommendation\[\]/u)
  assert.match(api, /source:\s*"saved_default"\s*\|\s*"quote_history"/u)
  assert.match(api, /agents:\s*QuoteSupplierOption\[\]/u)
  assert.match(fields, /export function CompactCombobox/u)
  assert.match(fields, /recommendedOptions/u)
  assert.match(fields, /recommended\.length && remaining\.length[\s\S]*h-px bg-\[var\(--md-line\)\]/u)
  assert.match(fields, /allowCustom && value\.trim\(\) && !hasExactMatch/u)
  assert.match(fields, /Use manual value/u)
  assert.match(details, /relatedPartyRecommendations/u)
  assert.match(details, /(?:Recent shippers|Previously used with this customer|Suggested for this customer|Related parties)/u)
  assert.match(details, /roleCard\("shipper"\)/u)
  assert.match(details, /roleCard\("consignee"\)/u)
  assert.match(details, /if \(role === "supplier"\) return types\.includes\("supplier"\)/u)
  assert.match(details, /if \(role === "carrier"\) return types\.some/u)
  assert.match(details, /return roleDirectory\?\.some\(\(item\) => item\.id === organisationId\) \?\? false/u)
  assert.match(details, /options=\{organisationOptions\.filter\(\(option\) => organisationHasRole\(option\.id, "customer"\)\)\}/u)
  assert.match(details, /const filteredOptions = organisationOptions\.filter\(\(option\) => organisationHasRole\(option\.id, role\)\)/u)
  assert.match(details, /!organisation \|\| !organisationHasRole\(organisation\.id, role\)/u)
  assert.match(details, /organisationHasRole\(option\.id, "agent"\)/u)
  assert.match(details, /option\.value\.trim\(\)\.toLocaleLowerCase\(\) === normalizedName/u)
  assert.match(details, /md:grid-cols-2 xl:grid-cols-4/u)
  assert.match(details, /grid-cols-12 gap-x-2 gap-y-1\.5/u)
  assert.match(details, /label="Address"[\s\S]{0,220}className="col-span-6"/u)
  assert.match(details, /label="Email"[\s\S]{0,220}className="col-span-6"/u)
})

test("company quote defaults are stored on the organisation and copied into a selected quote", () => {
  assert.match(accountDetail, /account\?\.metadata\.quoteTerms/u)
  assert.match(accountDetail, /Quote defaults/u)
  assert.match(accountDetail, /Terms and conditions/u)
  assert.match(accountDetail, /Subject to rate \/ space/u)
  assert.match(details, /organisation\.quoteTerms/u)
  assert.match(details, /onQuoteChange\("terms", organisation\.quoteTerms\.terms\)/u)
  assert.match(details, /onQuoteChange\("subjectToTerms", organisation\.quoteTerms\.subjectTo\)/u)
  assert.match(details, /onQuoteChange\("customerNotes", organisation\.quoteTerms\.notes\)/u)
  assert.match(details, /onQuoteChange\("deadline", organisation\.quoteTerms\.deadline\)/u)
  assert.match(accountDetail, /Default response deadline/u)
})

test("route, Incoterms, transit and repeat frequency use linked compact controls", () => {
  for (const field of [
    "originCountry",
    "originTown",
    "originUnlocode",
    "destinationCountry",
    "destinationTown",
    "destinationUnlocode",
  ]) {
    assert.match(details, new RegExp(`quote\\.${field}`, "u"), `${field} needs an editable route control.`)
  }
  assert.ok((details.match(/<LocationFields\b/gu) ?? []).length >= 2, "From and To must both use linked location fields.")
  assert.match(fields, /CompactCombobox label="Country"/u)
  assert.match(fields, /CompactCombobox label="Town, city or port"/u)
  assert.match(fields, /CompactCombobox label="UN\/LOCODE"/u)
  assert.match(fields, /sm:grid-cols-\[minmax\(8rem,0\.85fr\)_minmax\(12rem,1\.35fr\)_minmax\(7rem,0\.55fr\)\]/u)
  assert.match(details, /md:grid-cols-\[minmax\(12rem,1fr\)_minmax\(12rem,0\.72fr\)_minmax\(18rem,1\.35fr\)\]/u)
  assert.match(model, /export function filterLocationOptions/u)
  assert.match(model, /export function resolveLinkedLocation/u)
  assert.match(fields, /filteredCodePool\.length \? filteredCodePool : options/u)

  assert.match(details, /<IncotermField\b/u)
  assert.match(model, /export const INCOTERMS_2020/u)
  const terms = {
    EXW: "Ex Works",
    FCA: "Free Carrier",
    CPT: "Carriage Paid To",
    CIP: "Carriage and Insurance Paid To",
    DAP: "Delivered at Place",
    DPU: "Delivered at Place Unloaded",
    DDP: "Delivered Duty Paid",
    FAS: "Free Alongside Ship",
    FOB: "Free On Board",
    CFR: "Cost and Freight",
    CIF: "Cost, Insurance and Freight",
  }
  for (const [term, name] of Object.entries(terms)) {
    assert.match(model, new RegExp(`code:\\s*"${term}"[\\s\\S]{0,100}name:\\s*"${escaped(name)}"`, "u"), `${term} needs its Incoterms 2020 description.`)
  }
  assert.match(fields, /const term = getIncotermDefinition\(value\)/u)
  assert.match(fields, /term && namedLocation !== undefined && onNamedLocationChange/u)

  assert.match(details, /<NumberUnitField[\s\S]{0,300}(?:transitDays|Transit time)/u)
  assert.match(details, /<RecurrenceBuilder/u)
  assert.match(fields, /value\.mode === "interval"/u)
  assert.match(fields, /value\.mode === "times-per-month"/u)
  assert.match(fields, /label="Frequency notes"/u)
})

test("compact dropdowns prioritise three recents above a scrollable four-row directory", () => {
  assert.match(fields, /MAX_RECENT_COMBOBOX_OPTIONS = 3/u)
  assert.match(fields, /VISIBLE_DIRECTORY_COMBOBOX_OPTIONS = 4/u)
  assert.match(fields, /slice\(0, MAX_RECENT_COMBOBOX_OPTIONS\)/u)
  assert.match(fields, /recommended\.length && remaining\.length[\s\S]{0,120}h-px/u)
  assert.match(fields, /max-h-\[10rem\] overflow-y-auto/u)
  assert.match(fields, /remaining\.length > VISIBLE_DIRECTORY_COMBOBOX_OPTIONS/u)
  assert.match(fields, /bg-gradient-to-t[\s\S]{0,180}backdrop-blur-\[1px\]/u)
  assert.match(fields, /if \(!open \|\| !keyboardNavigationRef\.current\) return/u)
  assert.match(fields, /scrollIntoView\(\{ block: "nearest" \}\)/u)
  assert.match(fields, /onPointerDown=\{\(\) => \{ pointerFocusRef\.current = true \}\}/u)
  assert.match(fields, /onClick=\{\(\) => \{[\s\S]{0,160}setOpen\(true\)/u)
})

test("the selected quote workspace tab survives late data responses and remounts", () => {
  assert.match(page, /quoteWorkspaceTabStorageKey/u)
  assert.match(page, /window\.sessionStorage\.setItem\(quoteWorkspaceTabStorageKey\(quoteId\), nextTab\)/u)
  const loadEffect = page.slice(page.indexOf("useEffect(() => {\n    let cancelled = false"), page.indexOf("useEffect(() => {\n    const reference = workspace", page.indexOf("useEffect(() => {\n    let cancelled = false")))
  assert.doesNotMatch(loadEffect, /setActiveTab\("overview"\)/u)
  assert.doesNotMatch(loadEffect, /setDraftCharges\(\[\]\)[\s\S]{0,100}setLoading\(false\)/u)
})

test("autosave updates an existing quote in place without remounting its route", () => {
  const saveStart = page.indexOf("async function saveChanges()")
  const saveEnd = page.indexOf("useEffect(() => {", saveStart)
  const saveChanges = page.slice(saveStart, saveEnd)

  assert.ok(saveStart > -1 && saveEnd > saveStart, "The quote save handler must remain present.")
  assert.match(saveChanges, /saveQuoteWorkflow\(currentQuoteId, payload\)/u)
  assert.doesNotMatch(saveChanges, /navigate\?\.\(/u, "Autosave must not replace the route and reset focus or scroll.")
})

test("quote dates use the shared branded calendar picker", () => {
  assert.match(page, /import \{ MultideckDatePicker \} from "@\/components\/multideck\/date-picker"/u)
  assert.match(page, /function QuoteCompactDatePicker/u)
  assert.ok((details.match(/<QuoteCompactDatePicker\b/gu) ?? []).length >= 3, "Valid from, valid to and response deadline must use the branded picker.")
  assert.match(details, /label="Valid to"[\s\S]{0,200}minDate=\{quote\.startDate \|\| undefined\}/u)
  assert.doesNotMatch(details, /QuoteCompactInput label="Valid (?:from|to)"[\s\S]{0,120}type="date"/u)
})

test("each supplier can retain multiple carrier service options including a TBC carrier", () => {
  assert.match(page, /supplierOptionsJson/u)
  assert.match(details, /(?:supplierOptionsState|supplierOptions|parsedSupplierOptions)/u)
  assert.match(details, /supplier\.carriers\.map/u)
  assert.match(details, /(?:Carrier TBC|TBC)/u)
  assert.match(details, /Add supplier/u)
  assert.match(details, /Add carrier/u)
  assert.match(details, /Prepare rate requests/u)
  assert.match(details, /(?:Supplier contact|contactEmail|contacts)/u)
  assert.match(page, /return \[blankSupplierOption\(\)\]/u)
  assert.match(page, /carriers: Array\.isArray\(supplier\.carriers\) && supplier\.carriers\.length \? supplier\.carriers : \[blankCarrierOption\(\)\]/u)
  assert.match(details, /supplierOptions\.length === 1/u)
  assert.match(details, /supplier\.carriers\.length === 1/u)
  assert.match(details, /<DataTable ariaLabel="Carrier options"/u)
  assert.match(details, /const carrierSequence = supplier\.carriers\.indexOf\(carrier\) \+ 1/u)
  assert.match(details, /aria-label=\{`\$\{t\("Carrier ID"\)\} \$\{carrierSequence\}`\}/u)
  assert.match(details, /flex min-w-0 items-center gap-1\.5/u)
  assert.match(details, /<CarrierServiceLevelPill/u)
  assert.match(page, /carrierServiceLevels\.map/u)
  assert.doesNotMatch(details, /!supplierOptions\.length \? <div/u)
})

test("goods, cargo characteristics, hazardous details and customs agents remain operational data", () => {
  assert.ok((details.match(/<AmountCurrencyField\b/gu) ?? []).length >= 2, "Goods and insurance values must each split amount and currency.")
  assert.match(details, /FMC TID/u)
  assert.match(details, /originIsUs[\s\S]*\["US", "USA", "UNITED STATES"/u)
  assert.match(details, /<CargoCharacteristicsField\b/u)
  assert.match(fields, /aria-pressed=\{value\[key\]\}/u)
  assert.match(fields, /key === "hazardous" && checked[\s\S]*setHazardousOpen\(true\)/u)
  assert.match(fields, /export function HazardousDetailsDialog/u)
  assert.match(fields, /Hazard class/u)
  assert.match(fields, /Packing group/u)
  assert.match(details, /originCustomsAgentId/u)
  assert.match(details, /destinationCustomsAgentId/u)
  assert.match(details, /Origin customs agent/u)
  assert.match(details, /Destination customs agent/u)
})

test("customer terms are presented as inherited company data", () => {
  assert.match(details, /`\$\{t\("Inherited from"\)\} \$\{quote\.customerTermsSource\}`/u)
  assert.match(details, /customerTermsSource/u)
  assert.match(details, /Stored on the customer record/u)
  assert.match(details, /Locked to customer record/u)
  assert.ok((details.match(/<LockedQuoteTextarea\b/gu) ?? []).length >= 3, "Inherited terms and notes must use the locked field treatment.")
  assert.match(page, /function LockedQuoteTextarea/u)
  assert.match(page, /disabled[\s\S]{0,300}border-dashed/u)
  assert.match(details, /label="Response deadline"[\s\S]{0,180}locked/u)
  assert.match(details, /quote\.terms/u)
  assert.match(details, /quote\.customerNotes/u)
})

test("new quote detail fields load and save through the real workspace payload", () => {
  for (const field of [
    "consigneeReference",
    "consigneeContact",
    "consigneeEmail",
    "agentOrgId",
    "agentCode",
    "agentName",
    "agentAddress",
    "agentContact",
    "agentEmail",
    "originCountry",
    "originTown",
    "originUnlocode",
    "destinationCountry",
    "destinationTown",
    "destinationUnlocode",
    "transitUnit",
    "frequencyInterval",
    "frequencyUnit",
    "frequencyTimesPerMonth",
    "frequencyCount",
    "frequencyNotes",
    "supplierOptionsJson",
    "goodsValueCurrency",
    "insuranceValueCurrency",
    "cargoCharacteristics",
    "hazardousUnNumber",
    "hazardousClass",
    "hazardousPackingGroup",
    "hazardousShippingName",
    "hazardousEmergencyContact",
    "hazardousNetWeightKg",
    "hazardousMarinePollutant",
    "hazardousLimitedQuantity",
    "hazardousNotes",
    "originCustomsAgentId",
    "originCustomsAgentName",
    "destinationCustomsAgentId",
    "destinationCustomsAgentName",
    "customerTermsSource",
  ]) expectRoundTrip(field)

  assert.match(page, /incotermPlace:\s*fact\("namedPlace"\)/u)
  assert.match(page, /namedPlace:\s*quote\.incotermPlace/u)
  assert.match(page, /customerReference:\s*quote\.localRef/u)
  assert.match(page, /localRef:\s*record\.customerReference\?\.trim\(\) \|\| record\.reference\.trim\(\)/u)
  assert.match(page, /function quoteRecordFromRegister[\s\S]*localRef:\s*quote\.reference/u)
  assert.match(page, /loadingPoint:\s*quote\.origin/u)
  assert.match(page, /dischargePoint:\s*quote\.destination/u)
  assert.match(page, /shipper:\s*\{[\s\S]*orgId:\s*quote\.shipperOrgId/u)
  assert.match(page, /consignee:\s*\{[\s\S]*orgId:\s*quote\.consigneeOrgId/u)
})
