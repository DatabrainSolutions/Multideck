import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
const packageTypes = readFileSync(new URL("../src/lib/freight-package-types.ts", import.meta.url), "utf8")

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const page = read("multideck.client/src/pages/quotes-page.tsx")
const api = read("multideck.client/src/lib/quote-workflow-api.ts")
const fields = read("multideck.client/src/components/multideck/quote-details/quote-detail-fields.tsx")
const autoPopulatedField = read("multideck.client/src/components/multideck/auto-populated-field.tsx")
const styles = read("multideck.client/src/styles.css")
const bookingWizard = read("multideck.client/src/pages/booking-wizard-page.tsx")
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
  for (const role of ["shipper", "consignee", "agent"]) {
    assert.ok(details.includes(`roleCard("${role}")`), `${role} party must remain available.`)
  }
  assert.match(details, /supplier\.carriers\.map[\s\S]*label="Carrier ref"/u)
  assert.doesNotMatch(details, /label="Hold reason"/u)
  assert.doesNotMatch(details, /label="Docs"/u)
  assert.match(details, /label="Source"[\s\S]{0,500}\brequired\b/u)
  assert.match(page, /aria-label=\{`\$\{t\("Sales representative"\)\}[\s\S]{0,1000}<QuotePersonAvatar/u)
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
  assert.match(fields, /recommended\.length && displayedRemaining\.length[\s\S]*h-px bg-\[var\(--md-line\)\]/u)
  assert.match(fields, /allowCustom && value\.trim\(\) && !hasExactMatch/u)
  assert.match(fields, /Use manual value/u)
  assert.match(details, /relatedPartyRecommendations/u)
  assert.match(details, /(?:Recent shippers|Previously used with this customer|Suggested for this customer|Related parties)/u)
  assert.match(details, /roleCard\("shipper"\)/u)
  assert.match(details, /roleCard\("consignee"\)/u)
  assert.match(details, /if \(role === "supplier"\) return types\.includes\("supplier"\)/u)
  assert.match(details, /if \(role === "carrier"\) return types\.some/u)
  assert.match(details, /fallbackIds\[role as keyof typeof fallbackIds\]\.has\(organisation\.id\)/u)
  assert.match(details, /options=\{organisationDirectories\.customer\.options\}/u)
  assert.match(details, /const filteredOptions = organisationDirectories\[role\]\.options/u)
  assert.match(details, /!organisation \|\| !organisationDirectories\[role\]\.ids\.has\(organisation\.id\)/u)
  assert.match(details, /organisationDirectories\.agent\.options/u)
  assert.match(details, /option\.value\.trim\(\)\.toLocaleLowerCase\(\) === normalizedName/u)
  assert.match(details, /@min-\[40rem\]\/quote-details:grid-cols-2 @min-\[80rem\]\/quote-details:grid-cols-4/u)
  assert.match(details, /grid-cols-12 gap-x-2 gap-y-1\.5/u)
  assert.match(details, /label="Address"[\s\S]{0,220}className="col-span-12"/u)
  assert.match(details, /label="Email"[\s\S]{0,220}className="col-span-12"/u)
})

test("company quote defaults are stored on the organisation and copied into a selected quote", () => {
  assert.match(accountDetail, /account\?\.metadata\.quoteTerms/u)
  assert.match(accountDetail, /Quote defaults/u)
  assert.match(accountDetail, /Terms and conditions/u)
  assert.match(accountDetail, /Subject to rate \/ space/u)
  assert.match(details, /organisation\.quoteTerms/u)
  assert.match(details, /terms: organisation\.quoteTerms\?\.terms \?\? ""/u)
  assert.match(details, /subjectToTerms: organisation\.quoteTerms\?\.subjectTo \?\? ""/u)
  assert.match(details, /customerNotes: organisation\.quoteTerms\?\.notes \?\? ""/u)
  assert.match(details, /deadline: organisation\.quoteTerms\?\.deadline \?\? ""/u)
  assert.match(accountDetail, /Default response deadline/u)
  assert.match(accountDetail, /Quote follow-up delay/u)
  assert.match(accountDetail, /Leave blank to use the company policy/u)
})

test("route inputs derive UN/LOCODE while transit and repeat frequency use linked compact controls", () => {
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
  assert.match(fields, /grid size-8 shrink-0 place-items-center overflow-visible text-\[15px\] leading-5/u)
  assert.match(fields, /inline-grid size-5 shrink-0 place-items-center overflow-visible text-\[15px\] leading-5/u)
  assert.match(fields, /export function AutoFilledField/u)
  assert.match(fields, /AutoFilledField label="UN\/LOCODE"/u)
  assert.doesNotMatch(fields, /Fills automatically/u)
  assert.match(fields, /autoPopulated=\{unlocodeAutoPopulated\}/u)
  assert.match(fields, /onChange=\{\(input\) => onChange\(\{ \.\.\.value, unlocode:/u)
  assert.doesNotMatch(fields, /CompactCombobox label="UN\/LOCODE"/u)
  assert.match(fields, /sm:grid-cols-\[minmax\(8rem,0\.85fr\)_minmax\(12rem,1\.35fr\)_minmax\(7rem,0\.55fr\)\]/u)
  assert.match(model, /export function filterLocationOptions/u)
  assert.match(model, /export function filterLocationsForMode/u)
  assert.match(model, /startsWith\("air"\)[\s\S]*option\.kind === "airport"/u)
  assert.match(model, /startsWith\("sea"\)[\s\S]*option\.kind === "port"/u)
  assert.match(model, /startsWith\("road"\)[\s\S]*\["port", "city", "airport"\]/u)
  assert.match(fields, /const locationIndex = getLocationDirectoryIndex\(options, mode\)/u)
  assert.match(details, /<LocationFields mode=\{quote\.mode\}/u)
  assert.match(model, /export function resolveLinkedLocation/u)
  assert.match(fields, /UN\/LOCODE is derived from/u)
  assert.match(fields, /onOptionSelect=\{applySelectedOption\}/u)
  assert.match(fields, /const \[inputValue, setInputValue\] = useState\(value\)/u)
  assert.match(fields, /setSearch\(inputValue\)/u)
  assert.match(fields, /aria-label=\{t\(`Clear \$\{label\}`\)\}/u)

  assert.doesNotMatch(details, /<IncotermField\b/u)
  assert.match(details, /QuoteCompactInput label="Email" value=\{quote\.customerEmail[^\n]+onChange=\{\(value\) => onQuoteChange\("customerEmail", value\)\}/u)

  assert.match(details, /<NumberUnitField[\s\S]{0,300}(?:transitDays|Transit time)/u)
  assert.match(details, /<RecurrenceBuilder/u)
  assert.match(fields, /value\.mode === "interval"/u)
  assert.match(fields, /value\.mode === "times-per-month"/u)
  assert.match(fields, /PopoverTitle[\s\S]{0,160}Frequency notes/u)
})

test("transit time is calculated from the quote ETD and ETA", () => {
  assert.match(page, /function quoteTransitDays\(estimatedDeparture: string \| undefined, estimatedArrival: string \| undefined\)/u)
  assert.match(page, /Date\.UTC\(year, month - 1, day\)/u)
  assert.match(page, /elapsedDays >= 0 \? String\(elapsedDays\) : ""/u)
  assert.match(details, /label="ETD"[\s\S]{0,500}transitDays: quoteTransitDays\(value, quote\.estimatedArrival\)/u)
  assert.match(details, /label="ETA"[\s\S]{0,500}transitDays: quoteTransitDays\(quote\.estimatedDeparture, value\)/u)
  assert.match(details, /label="Transit time"[\s\S]{0,300}unit: "Days"[\s\S]{0,220}disabled onChange=\{\(\) => undefined\}/u)
  assert.match(details, /transitDays: quoteTransitDays\(first\.estimatedDeparture, last\.estimatedArrival\)/u)
  assert.match(page, /transitDays: quoteTransitDays\(estimatedDeparture, estimatedArrival\) \|\| fact\("transitDays"\)/u)
})

test("every send-blocking Incoterm and Sea FCL container field is visible in quote details", () => {
  assert.match(page, /const incotermNotSuppliedValue = "N\/A"/u)
  assert.match(page, /INCOTERMS_2020\.map\(\(term\) => \(\{ value: term\.code, label: `\$\{term\.code\} · \$\{term\.name\}` \}\)\)/u)
  assert.match(page, /N\/A · Not supplied \/ not applicable/u)
  assert.match(details, /const incotermDefinition = getIncotermDefinition\(quote\.incoterm\)/u)
  assert.match(details, /const incotermNamedPlaceMissing = Boolean\(/u)
  assert.match(details, /<QuoteCompactSelect label="Incoterms \/ scope"[\s\S]{0,500}onQuoteChange\("incoterm", value\)/u)
  assert.match(details, /<QuoteCompactInput label=\{incotermNamedPlaceLabel\}[\s\S]{0,500}required=\{Boolean\(incotermDefinition\)\}[\s\S]{0,350}onQuoteChange\("incotermPlace", value\)/u)
  assert.match(details, /incotermNotSupplied \? \([\s\S]{0,300}aria-label=\{t\("Quoted operational scope"\)\}/u)
  assert.match(details, /label="Collection"[\s\S]{0,450}onQuoteChange\("collectionRequired", value\)/u)
  assert.match(details, /label="Delivery"[\s\S]{0,450}onQuoteChange\("deliveryRequired", value\)/u)
  assert.match(details, /label="Customs clearance"[\s\S]{0,450}onQuoteChange\("customsIncluded", value\)/u)
  assert.match(details, /const isSeaContainerised = fieldPolicy\.containerRequests/u)
  assert.match(page, /import \{ freightFieldPolicy, freightModeKey, freightShipmentAllowed \} from "@\/lib\/freight-field-policy"/u)
  assert.match(details, /\{isSeaContainerised \? \([\s\S]{0,500}aria-label=\{t\("Container requests"\)\}/u)
  assert.match(details, /containerRequests\.map\(\(request, index\)/u)
  assert.match(details, /label=\{index === 0 \? "Qty"[\s\S]{0,900}label=\{index === 0 \? "Container type"/u)
  assert.match(details, /xl:grid-cols-\[minmax\(7rem,0\.5fr\)[\s\S]{0,220}minmax\(10rem,0\.8fr\)_2rem_auto\]/u)
  assert.match(details, /onClick=\{addContainerRequest\}[\s\S]{0,250}Add container/u)
  assert.match(details, /onClick=\{\(\) => removeContainerRequest\(index\)\}/u)
  assert.match(page, /function quoteContainerSummary\(requests: QuoteContainerRequest\[\]\)/u)
  assert.match(page, /containerRequestsJson: Array\.isArray\(facts\.containerRequests\)/u)
  assert.match(page, /containerRequests: quoteContainerRequests\(quote\.containerRequestsJson, quote\.container\)/u)
  assert.match(page, /container:\s*fact\("container"\)/u)
  assert.match(page, /container:\s*quote\.container\b/u)
  assert.match(page, /collectionRequired:\s*fact\("collectionRequired"\)/u)
  assert.match(page, /deliveryRequired:\s*fact\("deliveryRequired"\)/u)
  assert.match(page, /collectionRequired:\s*quote\.collectionRequired/u)
  assert.match(page, /deliveryRequired:\s*quote\.deliveryRequired/u)
})

test("auto-populated fields animate provenance, remain editable, and return to normal after override", () => {
  assert.match(autoPopulatedField, /AutoPopulatedInput/u)
  assert.match(autoPopulatedField, /AutoPopulatedTextarea/u)
  assert.match(autoPopulatedField, /MAX_REVEAL_SEGMENTS = 64/u)
  assert.match(autoPopulatedField, /getRevealSegments/u)
  assert.match(autoPopulatedField, /md-auto-populated-reveal__token/u)
  assert.match(autoPopulatedField, /REVEAL_STAGGER_MS/u)
  assert.match(autoPopulatedField, /MIN_REVEAL_SPREAD_MS/u)
  assert.match(autoPopulatedField, /document\.visibilityState !== "visible"/u)
  assert.match(autoPopulatedField, /!element\.getClientRects\(\)\.length/u)
  assert.match(autoPopulatedField, /prefers-reduced-motion: reduce/u)
  assert.match(styles, /md-auto-populated-token-pop/u)
  assert.doesNotMatch(styles, /md-auto-populated-surface-pop/u)
  assert.match(styles, /scale\(1\.12\)/u)
  assert.match(styles, /will-change: transform, opacity/u)
  assert.doesNotMatch(autoPopulatedField, /AutoPopulationIndicator|Sparkles|TooltipContent/u)
  assert.match(autoPopulatedField, /aria-description=/u)
  assert.match(fields, /aria-description=/u)
  assert.match(autoPopulatedField, /You can edit this value manually/u)
  assert.match(autoPopulatedField, /data-auto-populated=\{autoPopulated \|\| undefined\}/u)
  assert.match(page, /matchesAutoPopulation\(quote\.customerAddress, customerOrganisation\?\.addresses/u)
  assert.match(page, /matchesAutoPopulation\(address, selectedOrganisation\?\.addresses/u)
  assert.match(page, /matchesAutoPopulation\(supplier\.supplierOffice, selectedSupplier\?\.addresses/u)
  assert.match(bookingWizard, /companyAutoPopulated=\{data\.customerIsShipper/u)
  assert.match(bookingWizard, /autoPopulated=\{!data\.collectionAddressManual/u)
  assert.match(bookingWizard, /update\("collectionAddressManual", true\)/u)
  assert.match(bookingWizard, /autoPopulated=\{matchesAutoPopulation\(transportDraft\.fromCode, collectionLocation\.code\)\}/u)
  assert.doesNotMatch(bookingWizard, /label="Manually override address"/u)
})

test("compact dropdowns support a configurable recent limit while preserving the shared default", () => {
  assert.match(fields, /MAX_RECENT_COMBOBOX_OPTIONS = 3/u)
  assert.match(fields, /VISIBLE_DIRECTORY_COMBOBOX_OPTIONS = 4/u)
  assert.match(fields, /recommendedOptionLimit = MAX_RECENT_COMBOBOX_OPTIONS/u)
  assert.match(fields, /slice\(0, Math\.max\(0, recommendedOptionLimit\)\)/u)
  assert.match(fields, /recommended\.length && displayedRemaining\.length[\s\S]{0,120}h-px/u)
  assert.match(fields, /max-h-\[min\(24rem,var\(--radix-popover-content-available-height\)\)\][^\n]*overflow-y-auto/u)
  assert.match(fields, /max-h-\[10rem\] overflow-y-auto/u)
  assert.match(fields, /displayedRemaining\.length > VISIBLE_DIRECTORY_COMBOBOX_OPTIONS/u)
  assert.match(fields, /remaining\.length > displayedRemaining\.length/u)
  assert.match(fields, /Type to narrow results\./u)
  assert.match(fields, /bg-gradient-to-t[\s\S]{0,180}backdrop-blur-\[1px\]/u)
  assert.match(fields, /if \(!open \|\| !keyboardNavigationRef\.current\) return/u)
  assert.match(fields, /scrollIntoView\(\{ block: "nearest" \}\)/u)
  assert.match(fields, /onPointerDown=\{\(\) => \{ pointerFocusRef\.current = true \}\}/u)
  assert.match(fields, /onClick=\{\(\) => \{[\s\S]{0,160}setOpen\(true\)/u)
  assert.match(details, /const organisationRecentOptionLimit = 10/u)
  assert.ok((details.match(/recommendedOptionLimit=\{organisationRecentOptionLimit\}/gu) ?? []).length >= 5, "Quote organisation selectors must expose up to ten recent or related choices.")
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
  assert.match(saveChanges, /failedSaveFingerprintRef/u)
  assert.doesNotMatch(saveChanges, /Promise\.race\(\[/u)
  assert.match(saveChanges, /if \(saveInFlightRef\.current\) return/u)
  assert.match(saveChanges, /Saving is taking longer than usual/u)
  assert.match(saveChanges, /setIssueReadiness\(result\.readiness\)/u)
  assert.match(saveChanges, /getQuoteWorkflow\(result\.reference, \{ fresh: true \}\)/u)
  assert.match(saveChanges, /versions: fresh\.versions/u)
  assert.doesNotMatch(saveChanges, /applyLoadedWorkspace/u)
  assert.match(page, /saving \? "Saving…" : workflowError \? "Not saved" : "Unsaved changes"/u)
  assert.match(page, /const quoteUuidPattern = \/\^\[0-9a-f\]\{8\}/u)
  assert.match(page, /supplierId: uuidOrNull\(line\.supplierId\)/u)
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
  assert.match(page, /import \{ freightPackageTypeOptions \} from "@\/lib\/freight-package-types"/u)
  for (const packageType of ["Pallets", "Cartons", "Boxes", "Crates", "Cases", "Packages", "Pieces", "Drums", "IBCs", "ULDs", "Loose \/ unpackaged"]) {
    assert.match(packageTypes, new RegExp(`value: "${escaped(packageType)}"`, "u"), `${packageType} must be available as a freight package type.`)
  }
  assert.match(details, /<CompactCombobox[\s\S]{0,160}label="Package type"[\s\S]{0,240}options=\{freightPackageTypeOptions\}/u)
  assert.match(details, /recommendedLabel="Common package types"/u)
  assert.doesNotMatch(details, /<QuoteCompactInput label="Package type"/u)
  assert.match(details, /FMC TID/u)
  assert.match(details, /originIsUs[\s\S]*\["US", "USA", "UNITED STATES"/u)
  assert.match(details, /<CargoCharacteristicsField\b/u)
  // A typed cargo-line safety flag is also a pressed shipment characteristic.
  assert.match(fields, /aria-pressed=\{value\[key\] \|\| inherited\[key\] \|\| false\}/u)
  assert.match(fields, /key === "hazardous" && checked[\s\S]*setHazardousOpen\(true\)/u)
  assert.match(fields, /export function HazardousDetailsDialog/u)
  assert.match(fields, /Hazard class/u)
  assert.match(fields, /Packing group/u)
  assert.match(details, /originCustomsAgentId/u)
  assert.match(details, /destinationCustomsAgentId/u)
  assert.match(details, /Origin customs agent/u)
  assert.match(details, /Destination customs agent/u)
})

test("customer terms are presented as inherited payer account data", () => {
  assert.match(details, /`\$\{t\("Inherited from"\)\} \$\{quote\.customerTermsSource\}`/u)
  assert.match(details, /customerTermsSource/u)
  assert.match(details, /Stored on the payer account/u)
  assert.match(details, /Locked to payer account/u)
  assert.ok((details.match(/<LockedQuoteTextarea\b/gu) ?? []).length >= 3, "Inherited terms and notes must use the locked field treatment.")
  assert.match(page, /function LockedQuoteTextarea/u)
  assert.match(page, /disabled[\s\S]{0,300}md-field-locked-line/u)
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
  ]) expectRoundTrip(field)

  assert.match(page, /transitUnit: estimatedDeparture && estimatedArrival \? "Days" : fact\("transitUnit"\) \|\| "Days"/u)
  assert.match(page, /transitUnit:\s*quote\.transitUnit\b/u)

  assert.match(page, /payerOrgId:\s*payer\.orgId/u)
  assert.match(page, /payerName:\s*payer\.name/u)
  assert.match(page, /payerAddress:\s*payer\.address/u)
  assert.match(page, /payerContact:\s*payer\.contact/u)
  assert.match(page, /payerEmail:\s*payer\.email/u)
  assert.match(page, /payer:\s*\{[\s\S]*orgId:\s*quote\.payerOrgId/u)

  assert.match(page, /customerTermsSource:\s*hasPayerTerms\s*\?\s*payerOrganisation\?\.name/u)
  assert.match(page, /terms:\s*record\.terms\?\.trim\(\)\s*\|\|\s*payerTerms\?\.terms\?\.trim\(\)/u)
  assert.match(page, /customerNotes:\s*record\.customerNotes\?\.trim\(\)\s*\|\|\s*payerTerms\?\.notes\?\.trim\(\)/u)

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
