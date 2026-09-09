export const INCOTERMS_EDITION = 2020 as const

export type IncotermCode =
  | "EXW"
  | "FCA"
  | "CPT"
  | "CIP"
  | "DAP"
  | "DPU"
  | "DDP"
  | "FAS"
  | "FOB"
  | "CFR"
  | "CIF"

export type IncotermModeFamily = "any-mode" | "sea-and-inland-waterway"

export interface IncotermDefinition {
  code: IncotermCode
  edition: typeof INCOTERMS_EDITION
  name: string
  modeFamily: IncotermModeFamily
  namedLocationLabel: "Named place" | "Named place of destination" | "Named port of shipment" | "Named port of destination"
  description: string
}

/**
 * The complete ICC Incoterms 2020 set. Keep the edition explicit on saved quotes:
 * an Incoterm code without its edition does not fully identify the chosen rule.
 */
export const INCOTERMS_2020 = [
  {
    code: "EXW",
    edition: INCOTERMS_EDITION,
    name: "Ex Works",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place",
    description: "Seller makes the goods available at the named place; the buyer arranges collection and carries almost all cost and risk.",
  },
  {
    code: "FCA",
    edition: INCOTERMS_EDITION,
    name: "Free Carrier",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place",
    description: "Seller delivers export-cleared goods to the carrier or person nominated by the buyer at the named place.",
  },
  {
    code: "CPT",
    edition: INCOTERMS_EDITION,
    name: "Carriage Paid To",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place of destination",
    description: "Seller pays carriage to the named destination, while risk transfers when the goods are handed to the first carrier.",
  },
  {
    code: "CIP",
    edition: INCOTERMS_EDITION,
    name: "Carriage and Insurance Paid To",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place of destination",
    description: "Seller pays carriage and insurance to the named destination; risk transfers when the goods reach the first carrier.",
  },
  {
    code: "DAP",
    edition: INCOTERMS_EDITION,
    name: "Delivered at Place",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place of destination",
    description: "Seller delivers ready for unloading at the named destination; the buyer unloads and completes import clearance.",
  },
  {
    code: "DPU",
    edition: INCOTERMS_EDITION,
    name: "Delivered at Place Unloaded",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place of destination",
    description: "Seller delivers and unloads at the named destination; the buyer completes import clearance.",
  },
  {
    code: "DDP",
    edition: INCOTERMS_EDITION,
    name: "Delivered Duty Paid",
    modeFamily: "any-mode",
    namedLocationLabel: "Named place of destination",
    description: "Seller delivers ready for unloading and handles export and import clearance, duties and taxes.",
  },
  {
    code: "FAS",
    edition: INCOTERMS_EDITION,
    name: "Free Alongside Ship",
    modeFamily: "sea-and-inland-waterway",
    namedLocationLabel: "Named port of shipment",
    description: "Seller places the goods alongside the vessel at the named shipment port; cost and risk then pass to the buyer.",
  },
  {
    code: "FOB",
    edition: INCOTERMS_EDITION,
    name: "Free On Board",
    modeFamily: "sea-and-inland-waterway",
    namedLocationLabel: "Named port of shipment",
    description: "Seller loads the goods aboard the vessel at the named shipment port; risk transfers once they are on board.",
  },
  {
    code: "CFR",
    edition: INCOTERMS_EDITION,
    name: "Cost and Freight",
    modeFamily: "sea-and-inland-waterway",
    namedLocationLabel: "Named port of destination",
    description: "Seller pays cost and freight to the named destination port; risk transfers when the goods are on board at origin.",
  },
  {
    code: "CIF",
    edition: INCOTERMS_EDITION,
    name: "Cost, Insurance and Freight",
    modeFamily: "sea-and-inland-waterway",
    namedLocationLabel: "Named port of destination",
    description: "Seller pays cost, freight and insurance to the named destination port; risk transfers when goods are on board at origin.",
  },
] as const satisfies readonly IncotermDefinition[]

const incotermByCode = new Map<IncotermCode, IncotermDefinition>(
  INCOTERMS_2020.map((term) => [term.code, term]),
)

export function isIncotermCode(value: string): value is IncotermCode {
  return incotermByCode.has(value as IncotermCode)
}

export function getIncotermDefinition(value: string | null | undefined) {
  return value && isIncotermCode(value) ? incotermByCode.get(value) ?? null : null
}

export function formatIncoterm(value: IncotermCode) {
  const term = incotermByCode.get(value)
  return term ? `${term.code} · ${term.name} · ${term.edition}` : value
}

export interface AmountCurrencyValue {
  amount: string
  currency: string
}

export interface NumberUnitValue<Unit extends string = string> {
  value: string
  unit: Unit
}

export type RecurrenceMode = "once" | "interval" | "times-per-month" | "custom"
export type RecurrenceUnit = "day" | "week" | "month"

export interface RecurrenceValue {
  mode: RecurrenceMode
  interval: string
  unit: RecurrenceUnit
  timesPerMonth: string
  totalOccurrences: string
  notes: string
}

export const EMPTY_RECURRENCE: RecurrenceValue = {
  mode: "once",
  interval: "1",
  unit: "week",
  timesPerMonth: "1",
  totalOccurrences: "",
  notes: "",
}

export type LocationKind = "city" | "port" | "airport" | "rail-terminal" | "inland-terminal"

export interface LocationValue {
  countryCode: string
  countryName: string
  place: string
  unlocode: string
}

export interface LocationOption extends LocationValue {
  id?: string
  kind?: LocationKind
  aliases?: readonly string[]
  recommended?: boolean
}

export interface CountryReferenceOption {
  code: string
  name: string
}

export const EMPTY_LOCATION: LocationValue = {
  countryCode: "",
  countryName: "",
  place: "",
  unlocode: "",
}

function searchKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s,./_-]+/g, " ")
}

function includesQuery(value: string, query: string) {
  const normalizedQuery = searchKey(query)
  return !normalizedQuery || searchKey(value).includes(normalizedQuery)
}

function locationMatchesField(option: LocationOption, field: keyof LocationValue, query: string) {
  if (!query.trim()) return true
  if (field === "countryCode" || field === "countryName") {
    return includesQuery(option.countryCode, query) || includesQuery(option.countryName, query)
  }
  if (field === "place") {
    return includesQuery(option.place, query) || (option.aliases ?? []).some((alias) => includesQuery(alias, query))
  }
  return includesQuery(option.unlocode, query)
}

/** Mutually narrows countries, places and UN/LOCODEs from whichever values are present. */
export function filterLocationOptions(options: readonly LocationOption[], value: Partial<LocationValue>) {
  return options.filter((option) => (
    locationMatchesField(option, "countryName", value.countryName || value.countryCode || "")
    && locationMatchesField(option, "place", value.place || "")
    && locationMatchesField(option, "unlocode", value.unlocode || "")
  ))
}

/** Keeps the place directory relevant to the selected transport mode. */
export function filterLocationsForMode(options: readonly LocationOption[], mode: string | null | undefined) {
  const normalizedMode = (mode ?? "").trim().toLocaleLowerCase()
  if (!normalizedMode || normalizedMode.includes("multimodal")) return options

  return options.filter((option) => {
    if (normalizedMode.startsWith("air")) return option.kind === "airport"
    if (normalizedMode.startsWith("sea")) return option.kind === "port"
    if (normalizedMode.startsWith("road")) return !option.kind || ["port", "city", "airport"].includes(option.kind)
    if (normalizedMode.startsWith("rail")) return !option.kind || ["rail-terminal", "inland-terminal", "city"].includes(option.kind)
    return true
  })
}

function exactCountry(option: LocationOption, value: string) {
  const query = searchKey(value)
  return searchKey(option.countryName) === query || searchKey(option.countryCode) === query
}

function exactPlace(option: LocationOption, value: string) {
  const query = searchKey(value)
  return searchKey(option.place) === query || (option.aliases ?? []).some((alias) => searchKey(alias) === query)
}

export function locationIdentity(option: LocationOption) {
  return option.id || option.unlocode || `${option.countryCode}:${option.place}`
}

export interface LocationDirectoryIndex {
  options: readonly LocationOption[]
  byId: ReadonlyMap<string, LocationOption>
  byCountryCode: ReadonlyMap<string, readonly LocationOption[]>
  byCountry: ReadonlyMap<string, readonly LocationOption[]>
  byPlace: ReadonlyMap<string, readonly LocationOption[]>
  byUnlocode: ReadonlyMap<string, readonly LocationOption[]>
  recommended: readonly LocationOption[]
}

const locationIndexes = new WeakMap<readonly LocationOption[], Map<string, LocationDirectoryIndex>>()
export const EMPTY_LOCATION_OPTIONS: readonly LocationOption[] = []

/** The directory is immutable. Share its indexes between both location controls. */
export function getLocationDirectoryIndex(options: readonly LocationOption[], mode?: string | null): LocationDirectoryIndex {
  const normalizedMode = (mode ?? "").trim().toLocaleLowerCase()
  const family = normalizedMode.includes("multimodal") ? "all"
    : ["air", "sea", "road", "rail"].find((candidate) => normalizedMode.startsWith(candidate)) ?? "all"
  let modes = locationIndexes.get(options)
  if (!modes) {
    modes = new Map()
    locationIndexes.set(options, modes)
  }
  const cached = modes.get(family)
  if (cached) return cached
  const filtered = family === "all" ? options : filterLocationsForMode(options, family)
  const byId = new Map<string, LocationOption>()
  const byCountryCode = new Map<string, LocationOption[]>()
  let byCountry: Map<string, LocationOption[]> | undefined
  let byPlace: Map<string, LocationOption[]> | undefined
  let byUnlocode: Map<string, LocationOption[]> | undefined
  const recommended: LocationOption[] = []
  const append = (map: Map<string, LocationOption[]>, key: string, option: LocationOption) => {
    const matches = map.get(key)
    if (matches) matches.push(option)
    else map.set(key, [option])
  }
  for (const option of filtered) {
    // Selection previously used find(): the first duplicate identifier wins.
    if (!byId.has(locationIdentity(option))) byId.set(locationIdentity(option), option)
    append(byCountryCode, searchKey(option.countryCode), option)
    if (option.recommended) recommended.push(option)
  }
  // Exact typed-input indexes are only needed when the operator types. Avoid
  // allocating the large place/alias map merely to display the two controls.
  const build = (keys: (option: LocationOption) => string[]) => {
    const result = new Map<string, LocationOption[]>()
    for (const option of filtered) for (const key of new Set(keys(option))) append(result, key, option)
    return result
  }
  const index = {
    options: filtered, byId, byCountryCode, recommended,
    get byCountry() { return byCountry ??= build((option) => [searchKey(option.countryCode), searchKey(option.countryName)]) },
    get byPlace() { return byPlace ??= build((option) => [searchKey(option.place), ...(option.aliases ?? []).map(searchKey)]) },
    get byUnlocode() { return byUnlocode ??= build((option) => [searchKey(option.unlocode)]) },
  }
  modes.set(family, index)
  return index
}

function onlyLocation(options: readonly LocationOption[]) {
  const unique = new Map(options.map((option) => [locationIdentity(option), option]))
  return unique.size === 1 ? unique.values().next().value as LocationOption : null
}

/**
 * Applies typed or selected location input. Exact, unambiguous place/UNLOCODE
 * matches fill the other two fields; partial manual input remains untouched.
 */
export function resolveLinkedLocation(
  options: readonly LocationOption[],
  current: LocationValue,
  field: "country" | "place" | "unlocode",
  input: string,
): LocationValue {
  if (field === "country") {
    const next = { ...current, countryName: input }
    if (!input.trim()) return { ...next, countryCode: "" }

    const countryMatches = getLocationDirectoryIndex(options).byCountry.get(searchKey(input)) ?? EMPTY_LOCATION_OPTIONS
    const country = countryMatches[0]
    if (!country) return { ...next, countryCode: "", place: "", unlocode: "" }

    const normalized = { ...next, countryCode: country.countryCode, countryName: country.countryName }
    const compatible = countryMatches.filter((option) => (
      (!current.place || exactPlace(option, current.place))
      && (!current.unlocode || searchKey(option.unlocode) === searchKey(current.unlocode))
    ))
    const selected = onlyLocation(compatible.length ? compatible : countryMatches)
    if (selected && (current.place || current.unlocode || countryMatches.length === 1)) return { ...selected }

    return {
      ...normalized,
      place: compatible.length ? current.place : "",
      unlocode: compatible.length ? current.unlocode : "",
    }
  }

  if (field === "place") {
    const next = { ...current, place: input }
    if (!input.trim()) return next
    const matches = getLocationDirectoryIndex(options).byPlace.get(searchKey(input)) ?? EMPTY_LOCATION_OPTIONS
    const selected = onlyLocation(matches.filter((option) => (
      (!current.countryName && !current.countryCode)
      || exactCountry(option, current.countryName || current.countryCode)
    )))
    return selected ? { ...selected } : next
  }

  const normalizedCode = input.toLocaleUpperCase().replace(/\s+/g, "")
  const next = { ...current, unlocode: normalizedCode }
  if (!normalizedCode) return next
  const selected = onlyLocation(getLocationDirectoryIndex(options).byUnlocode.get(searchKey(normalizedCode)) ?? EMPTY_LOCATION_OPTIONS)
  return selected ? { ...selected } : next
}

export type CargoCharacteristicKey = "hazardous" | "oversized" | "temperatureControlled" | "fragile" | "foodGrade"

export type CargoCharacteristics = Record<CargoCharacteristicKey, boolean>

export const EMPTY_CARGO_CHARACTERISTICS: CargoCharacteristics = {
  hazardous: false,
  oversized: false,
  temperatureControlled: false,
  fragile: false,
  foodGrade: false,
}

export interface HazardousDetails {
  unNumber: string
  properShippingName: string
  hazardClass: string
  packingGroup: "" | "I" | "II" | "III" | "N/A"
  packageCount: string
  packageType: string
  netWeightKg: string
  grossWeightKg: string
  marinePollutant: boolean
  limitedQuantity: boolean
  notes: string
}

export const EMPTY_HAZARDOUS_DETAILS: HazardousDetails = {
  unNumber: "",
  properShippingName: "",
  hazardClass: "",
  packingGroup: "",
  packageCount: "",
  packageType: "",
  netWeightKg: "",
  grossWeightKg: "",
  marinePollutant: false,
  limitedQuantity: false,
  notes: "",
}
