export type RateDirection = "Import" | "Export" | "Cross trade" | "Domestic"
export type RateMode = "Sea" | "Air" | "Rail" | "Road"
export type RateSourceKind = "contract" | "tariff" | "spot"
export type RateSheetStatus = "Live" | "Draft" | "Expired"
export type RateZoneScheme = "postcode" | "area"
export type RateCoverageStatus = "covered" | "partial" | "uncovered"
export type MarketSourceKind = "carrier-api" | "third-party"
export type RateOfferConfidence = "firm" | "indicative"
export type RateChargeBasis = "per-pallet" | "per-100kg" | "per-container" | "per-trailer"

export const rateDirections: RateDirection[] = ["Import", "Export", "Cross trade", "Domestic"]
export const internationalModes: RateMode[] = ["Sea", "Air", "Rail", "Road"]
export const sourceFilters = ["All", "Contract", "Spot"] as const
export type RateSourceFilter = (typeof sourceFilters)[number]

export const shipmentTypesByMode: Record<RateMode, readonly string[]> = {
  Sea: ["FCL", "LCL"],
  Air: ["General cargo", "ULD", "Air consolidation"],
  Rail: ["Full wagon", "Groupage"],
  Road: ["FTL", "LTL"],
}

export const domesticShipmentTypes = ["Pallet network", "Next-day", "FTL", "LTL", "Dedicated"] as const

export type RateCarrier = {
  id: string
  name: string
  shortName: string
}

export type RateCustomer = {
  id: string
  name: string
  nominatedCarrierId?: string
}

export type RateZoneMember = {
  id: string
  code: string
  name: string
  areaCodes: string[]
}

export type RateZoneGroup = {
  id: string
  name: string
  scheme: RateZoneScheme
  carrierId: string
  members: RateZoneMember[]
}

export type RateBreak = {
  fromQuantity: number
  toQuantity: number | null
  unitRate: number
}

export type RateLine = {
  id: string
  chargeCode: string
  description: string
  basis: RateChargeBasis
  unitRate: number
  minimumAmount?: number
  originZone?: string
  destinationZone?: string
  equipmentType?: string
  breaks?: RateBreak[]
}

export type RateSheet = {
  id: string
  code: string
  name: string
  status: RateSheetStatus
  direction: RateDirection
  mode: RateMode
  shipmentType: string
  source: RateSourceKind
  carrierId: string
  currency: string
  validFrom: string
  validTo: string
  serviceLevel: string
  transitDays: number
  zoneGroupId?: string
  originUnlocode?: string
  originName?: string
  destinationUnlocode?: string
  destinationName?: string
  notes?: string
  lines: RateLine[]
}

export type RateCompareRequest = {
  customerId: string
  direction: RateDirection
  mode: RateMode
  shipmentType: string
  origin: string
  destination: string
  pallets: number
  weightKg: number
  serviceLevel: string
  includeMarket: boolean
}

export type RateCompareOffer = {
  id: string
  sheetId?: string
  sourceId?: string
  sourceKind: RateSourceKind | MarketSourceKind
  sourceLabel: string
  carrierId: string
  carrierName: string
  tariffName: string
  serviceLevel: string
  buyTotal: number
  currency: string
  transitDays: number
  validUntil: string
  confidence: RateOfferConfidence
  originZone?: string
  destinationZone?: string
  routingSummary?: string
  breakdown: { label: string; amount: number }[]
  expired?: boolean
}

export type MarketRateSource = {
  id: string
  name: string
  kind: MarketSourceKind
  modes: RateMode[]
}

export const rateCarriers: RateCarrier[] = [
  { id: "xpo", name: "XPO Logistics", shortName: "XPO" },
  { id: "gxo", name: "GXO Logistics", shortName: "GXO" },
  { id: "palletline", name: "Palletline", shortName: "Palletline" },
  { id: "pallex", name: "Pall-Ex", shortName: "Pall-Ex" },
  { id: "redline", name: "Redline Transport", shortName: "Redline" },
  { id: "maersk", name: "Maersk", shortName: "Maersk" },
  { id: "msc", name: "MSC", shortName: "MSC" },
  { id: "one", name: "Ocean Network Express", shortName: "ONE" },
  { id: "lufthansa", name: "Lufthansa Cargo", shortName: "Lufthansa" },
  { id: "dfds", name: "DFDS", shortName: "DFDS" },
  { id: "hapag", name: "Hapag-Lloyd", shortName: "Hapag-Lloyd" },
]

export const rateCustomers: RateCustomer[] = [
  { id: "jenkar", name: "Jenkar", nominatedCarrierId: "xpo" },
  { id: "marlow", name: "Marlow Apparel Ltd" },
  { id: "bauhaus", name: "Bauhaus Importe GmbH", nominatedCarrierId: "maersk" },
]

export const marketRateSources: MarketRateSource[] = [
  { id: "maersk-api", name: "Maersk spot API", kind: "carrier-api", modes: ["Sea"] },
  { id: "ocean-index", name: "Ocean market index", kind: "third-party", modes: ["Sea", "Air"] },
  { id: "road-index", name: "UK road market index", kind: "third-party", modes: ["Road"] },
  { id: "haulage-exchange", name: "Haulage exchange", kind: "third-party", modes: ["Sea", "Road"] },
]

const xpoZones: RateZoneMember[] = [
  { id: "xpo-z1", code: "Zone 1", name: "London", areaCodes: ["E", "EC", "N", "NW", "SE", "SW", "W", "WC", "IG", "RM", "CR", "BR", "DA", "KT", "TW", "UB", "HA"] },
  { id: "xpo-z2", code: "Zone 2", name: "Yorkshire", areaCodes: ["LS", "BD", "HX", "HG", "WF", "HD", "YO", "DN", "S"] },
  { id: "xpo-z3", code: "Zone 3", name: "North West", areaCodes: ["M", "OL", "SK", "BL", "WN", "PR", "L", "WA", "CH", "FY"] },
  { id: "xpo-z4", code: "Zone 4", name: "South West", areaCodes: ["BS", "BA", "GL", "SN", "TA", "EX", "PL", "TQ", "TR"] },
  { id: "xpo-z5", code: "Zone 5", name: "Midlands", areaCodes: ["B", "CV", "LE", "NG", "DE", "ST", "WS", "DY", "WV", "NN"] },
  { id: "xpo-z6", code: "Zone 6", name: "Scotland", areaCodes: ["G", "EH", "ML", "KA", "PA", "FK", "KY", "DD", "AB"] },
  { id: "xpo-z7", code: "Zone 7", name: "Rest of UK", areaCodes: [] },
]

const gxoAreas: RateZoneMember[] = [
  { id: "gxo-london", code: "London", name: "London", areaCodes: ["E", "EC", "N", "NW", "SE", "SW", "W", "WC", "IG", "RM", "CR", "BR", "DA", "KT", "TW"] },
  { id: "gxo-yorks", code: "Yorkshire", name: "Yorkshire", areaCodes: ["LS", "BD", "HX", "HG", "WF", "HD", "YO", "DN", "S"] },
  { id: "gxo-nw", code: "North", name: "North", areaCodes: ["M", "OL", "SK", "BL", "WN", "PR", "L", "WA", "NE", "SR"] },
  { id: "gxo-sw", code: "South West", name: "South West", areaCodes: ["BS", "BA", "GL", "SN", "TA", "EX", "PL"] },
  { id: "gxo-mid", code: "Midlands", name: "Midlands", areaCodes: ["B", "CV", "LE", "NG", "DE", "ST", "NN"] },
  { id: "gxo-scot", code: "Scotland", name: "Scotland", areaCodes: ["G", "EH", "ML", "KA", "PA"] },
  { id: "gxo-rest", code: "National", name: "National", areaCodes: [] },
]

const palletlineAreas: RateZoneMember[] = [
  { id: "pl-north", code: "North", name: "North depot", areaCodes: ["LS", "BD", "M", "NE", "SR", "DH", "CA"] },
  { id: "pl-mid", code: "Midlands", name: "Midlands depot", areaCodes: ["B", "LE", "NG", "CV", "DE", "NN"] },
  { id: "pl-west", code: "West", name: "West depot", areaCodes: ["BS", "BA", "GL", "CF", "NP", "SA"] },
  { id: "pl-south", code: "South", name: "South depot", areaCodes: ["SO", "PO", "BN", "RH", "GU", "RG"] },
  { id: "pl-nat", code: "Network", name: "Network fallback", areaCodes: [] },
]

export const rateZoneGroups: RateZoneGroup[] = [
  { id: "xpo-uk", name: "XPO UK next-day zones", scheme: "postcode", carrierId: "xpo", members: xpoZones },
  { id: "gxo-uk", name: "GXO UK area map", scheme: "area", carrierId: "gxo", members: gxoAreas },
  { id: "pl-uk", name: "Palletline depot areas", scheme: "area", carrierId: "palletline", members: palletlineAreas },
  { id: "px-uk", name: "Pall-Ex depot areas", scheme: "area", carrierId: "pallex", members: palletlineAreas.map((member) => ({ ...member, id: member.id.replace("pl-", "px-") })) },
]

function palletMatrix(prefix: string, pairs: Array<[string, string, number, number]>): RateLine[] {
  return pairs.map(([originZone, destinationZone, unitRate, minimumAmount], index) => ({
    id: `${prefix}-${index + 1}`,
    chargeCode: "FRT",
    description: `${originZone} to ${destinationZone}`,
    basis: "per-pallet",
    unitRate,
    minimumAmount,
    originZone,
    destinationZone,
    breaks: [
      { fromQuantity: 1, toQuantity: 2, unitRate },
      { fromQuantity: 3, toQuantity: 6, unitRate: Math.round(unitRate * 0.92) },
      { fromQuantity: 7, toQuantity: null, unitRate: Math.round(unitRate * 0.84) },
    ],
  }))
}

export const rateSheets: RateSheet[] = [
  {
    id: "xpo-nd",
    code: "XPO-ND-2026",
    name: "XPO next-day UK",
    status: "Live",
    direction: "Domestic",
    mode: "Road",
    shipmentType: "Next-day",
    source: "tariff",
    carrierId: "xpo",
    currency: "GBP",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    serviceLevel: "Next-day",
    transitDays: 1,
    zoneGroupId: "xpo-uk",
    notes: "Filed UK next-day tariff. Zones are outward-code bands.",
    lines: palletMatrix("xpo-nd", [
      ["Zone 2", "Zone 4", 46, 46],
      ["Zone 2", "Zone 5", 38, 38],
      ["Zone 2", "Zone 3", 34, 34],
      ["Zone 5", "Zone 4", 41, 41],
      ["Zone 1", "Zone 2", 49, 49],
      ["Zone 4", "Zone 2", 46, 46],
    ]),
  },
  {
    id: "gxo-nd",
    code: "GXO-ND-2026",
    name: "GXO next-day UK",
    status: "Live",
    direction: "Domestic",
    mode: "Road",
    shipmentType: "Next-day",
    source: "tariff",
    carrierId: "gxo",
    currency: "GBP",
    validFrom: "2026-02-01",
    validTo: "2026-12-31",
    serviceLevel: "Next-day",
    transitDays: 1,
    zoneGroupId: "gxo-uk",
    notes: "Similar coverage to XPO, zoned by named area rather than postcode band.",
    lines: palletMatrix("gxo-nd", [
      ["Yorkshire", "South West", 44, 44],
      ["Yorkshire", "Midlands", 36, 36],
      ["Yorkshire", "North", 32, 32],
      ["Midlands", "South West", 39, 39],
      ["London", "Yorkshire", 51, 51],
      ["South West", "Yorkshire", 44, 44],
    ]),
  },
  {
    id: "pl-net",
    code: "PL-NET-2026",
    name: "Palletline economy 48",
    status: "Live",
    direction: "Domestic",
    mode: "Road",
    shipmentType: "Pallet network",
    source: "tariff",
    carrierId: "palletline",
    currency: "GBP",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    serviceLevel: "Economy 48",
    transitDays: 2,
    zoneGroupId: "pl-uk",
    notes: "Network transfer via regional depots.",
    lines: palletMatrix("pl-net", [
      ["North", "West", 31, 31],
      ["North", "Midlands", 28, 28],
      ["Midlands", "West", 27, 27],
      ["North", "South", 36, 36],
    ]),
  },
  {
    id: "px-net",
    code: "PX-NET-2026",
    name: "Pall-Ex network 48",
    status: "Live",
    direction: "Domestic",
    mode: "Road",
    shipmentType: "Pallet network",
    source: "tariff",
    carrierId: "pallex",
    currency: "GBP",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    serviceLevel: "Economy 48",
    transitDays: 2,
    zoneGroupId: "px-uk",
    notes: "Alternate pallet network with depot-area zoning.",
    lines: palletMatrix("px-net", [
      ["North", "West", 33, 33],
      ["North", "Midlands", 29, 29],
      ["Midlands", "West", 28, 28],
    ]),
  },
  {
    id: "redline-ftl",
    code: "RL-FTL-2026",
    name: "Redline dedicated FTL",
    status: "Live",
    direction: "Domestic",
    mode: "Road",
    shipmentType: "FTL",
    source: "spot",
    carrierId: "redline",
    currency: "GBP",
    validFrom: "2026-04-01",
    validTo: "2026-09-30",
    serviceLevel: "Dedicated vehicle",
    transitDays: 1,
    originName: "Midlands",
    destinationName: "UK national",
    notes: "Spot trailer rate, not a filed network tariff.",
    lines: [
      {
        id: "rl-1",
        chargeCode: "FTL",
        description: "Dedicated 13.6m curtainsider",
        basis: "per-trailer",
        unitRate: 780,
        minimumAmount: 780,
      },
    ],
  },
  {
    id: "maersk-fcl-nbo",
    code: "MAE-FCL-NGB-FXT",
    name: "Maersk Ningbo–Felixstowe FCL",
    status: "Live",
    direction: "Import",
    mode: "Sea",
    shipmentType: "FCL",
    source: "contract",
    carrierId: "maersk",
    currency: "USD",
    validFrom: "2026-01-01",
    validTo: "2026-06-30",
    serviceLevel: "Contract sailings",
    transitDays: 32,
    originUnlocode: "CNNGB",
    originName: "Ningbo",
    destinationUnlocode: "GBFXT",
    destinationName: "Felixstowe",
    notes: "Filed ocean contract. Use for covered import FCL.",
    lines: [
      { id: "mae-40", chargeCode: "OCF", description: "Ocean freight 40HC", basis: "per-container", unitRate: 2180, equipmentType: "40HC" },
      { id: "mae-20", chargeCode: "OCF", description: "Ocean freight 20GP", basis: "per-container", unitRate: 1640, equipmentType: "20GP" },
    ],
  },
  {
    id: "hapag-fcl-ytn",
    code: "HPL-SPOT-YTN-FXT",
    name: "Hapag Yantian–Felixstowe spot",
    status: "Live",
    direction: "Import",
    mode: "Sea",
    shipmentType: "FCL",
    source: "spot",
    carrierId: "hapag",
    currency: "USD",
    validFrom: "2026-08-10",
    validTo: "2026-08-24",
    serviceLevel: "Spot sailing",
    transitDays: 29,
    originUnlocode: "CNYTN",
    originName: "Yantian",
    destinationUnlocode: "GBFXT",
    destinationName: "Felixstowe",
    notes: "Indicative spot held in the book until a firm allocation is confirmed.",
    lines: [
      { id: "hpl-ytn", chargeCode: "OCF", description: "Ocean freight 40HC", basis: "per-container", unitRate: 2410, equipmentType: "40HC" },
    ],
  },
  {
    id: "msc-lcl-sha",
    code: "MSC-LCL-SHA-RTM",
    name: "MSC Shanghai–Rotterdam LCL",
    status: "Live",
    direction: "Import",
    mode: "Sea",
    shipmentType: "LCL",
    source: "contract",
    carrierId: "msc",
    currency: "USD",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    serviceLevel: "Weekly consolidation",
    transitDays: 34,
    originUnlocode: "CNSHA",
    originName: "Shanghai",
    destinationUnlocode: "NLRTM",
    destinationName: "Rotterdam",
    lines: [
      { id: "msc-lcl", chargeCode: "OCF", description: "LCL ocean", basis: "per-100kg", unitRate: 48, minimumAmount: 180 },
    ],
  },
  {
    id: "lh-air-fra",
    code: "LH-AIR-FRA-JFK",
    name: "Lufthansa Frankfurt–JFK",
    status: "Live",
    direction: "Export",
    mode: "Air",
    shipmentType: "General cargo",
    source: "contract",
    carrierId: "lufthansa",
    currency: "EUR",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    serviceLevel: "General cargo",
    transitDays: 1,
    originUnlocode: "DEFRA",
    originName: "Frankfurt",
    destinationUnlocode: "USJFK",
    destinationName: "JFK",
    lines: [
      { id: "lh-1", chargeCode: "AIR", description: "Airport to airport", basis: "per-100kg", unitRate: 186, minimumAmount: 240 },
    ],
  },
  {
    id: "one-fcl-exp",
    code: "ONE-FCL-SOU-NGB",
    name: "ONE Southampton–Ningbo FCL",
    status: "Live",
    direction: "Export",
    mode: "Sea",
    shipmentType: "FCL",
    source: "contract",
    carrierId: "one",
    currency: "USD",
    validFrom: "2026-03-01",
    validTo: "2026-08-31",
    serviceLevel: "Contract sailings",
    transitDays: 30,
    originUnlocode: "GBSOU",
    originName: "Southampton",
    destinationUnlocode: "CNNGB",
    destinationName: "Ningbo",
    lines: [
      { id: "one-40", chargeCode: "OCF", description: "Ocean freight 40HC", basis: "per-container", unitRate: 1960, equipmentType: "40HC" },
    ],
  },
  {
    id: "dfds-ftl-x",
    code: "DFDS-FTL-HAM-MIL",
    name: "DFDS Hamburg–Milano FTL",
    status: "Live",
    direction: "Cross trade",
    mode: "Road",
    shipmentType: "FTL",
    source: "spot",
    carrierId: "dfds",
    currency: "EUR",
    validFrom: "2026-05-01",
    validTo: "2026-07-31",
    serviceLevel: "Groupage / FTL",
    transitDays: 2,
    originUnlocode: "DEHAM",
    originName: "Hamburg",
    destinationUnlocode: "ITMIL",
    destinationName: "Milano",
    lines: [
      { id: "dfds-1", chargeCode: "FTL", description: "Full trailer", basis: "per-trailer", unitRate: 1680, minimumAmount: 1680 },
    ],
  },
  {
    id: "msc-xt-fcl",
    code: "MSC-XT-NGB-NYC",
    name: "MSC Ningbo–New York FCL",
    status: "Live",
    direction: "Cross trade",
    mode: "Sea",
    shipmentType: "FCL",
    source: "spot",
    carrierId: "msc",
    currency: "USD",
    validFrom: "2026-08-01",
    validTo: "2026-08-28",
    serviceLevel: "Spot sailing",
    transitDays: 33,
    originUnlocode: "CNNGB",
    originName: "Ningbo",
    destinationUnlocode: "USNYC",
    destinationName: "New York",
    notes: "Cross-trade spot. No filed contract on this lane.",
    lines: [
      { id: "msc-xt", chargeCode: "OCF", description: "Ocean freight 40HC", basis: "per-container", unitRate: 3120, equipmentType: "40HC" },
    ],
  },
  {
    id: "hapag-spot-expired",
    code: "HPL-SPOT-SAO-HOU",
    name: "Hapag Santos–Houston spot",
    status: "Expired",
    direction: "Export",
    mode: "Sea",
    shipmentType: "FCL",
    source: "spot",
    carrierId: "hapag",
    currency: "USD",
    validFrom: "2026-03-01",
    validTo: "2026-03-14",
    serviceLevel: "Spot sailing",
    transitDays: 27,
    originUnlocode: "BRSSZ",
    originName: "Santos",
    destinationUnlocode: "USHOU",
    destinationName: "Houston",
    notes: "Expired indicative spot. Refresh from market for a live number.",
    lines: [
      { id: "hpl-40", chargeCode: "OCF", description: "Ocean freight 40HC", basis: "per-container", unitRate: 2640, equipmentType: "40HC" },
    ],
  },
]

export const comparePresets = [
  {
    id: "uncovered-ocean",
    label: "Uncovered ocean",
    request: {
      customerId: "marlow",
      direction: "Export" as RateDirection,
      mode: "Sea" as RateMode,
      shipmentType: "FCL",
      origin: "Santos",
      destination: "Houston",
      pallets: 1,
      weightKg: 12000,
      serviceLevel: "Any",
      includeMarket: true,
    },
  },
  {
    id: "domestic-nextday",
    label: "Domestic next-day",
    request: {
      customerId: "jenkar",
      direction: "Domestic" as RateDirection,
      mode: "Road" as RateMode,
      shipmentType: "Next-day",
      origin: "LS12 4AA",
      destination: "BS1 4DJ",
      pallets: 2,
      weightKg: 420,
      serviceLevel: "Next-day",
      includeMarket: false,
    },
  },
  {
    id: "covered-import",
    label: "Covered import FCL",
    request: {
      customerId: "bauhaus",
      direction: "Import" as RateDirection,
      mode: "Sea" as RateMode,
      shipmentType: "FCL",
      origin: "Ningbo",
      destination: "Felixstowe",
      pallets: 1,
      weightKg: 18000,
      serviceLevel: "Any",
      includeMarket: true,
    },
  },
] as const

export const defaultCompareRequest: RateCompareRequest = { ...comparePresets[0].request }

export function carrierById(id: string) {
  return rateCarriers.find((carrier) => carrier.id === id)
}

export function customerById(id: string) {
  return rateCustomers.find((customer) => customer.id === id)
}

export function zoneGroupById(id: string | undefined) {
  return rateZoneGroups.find((group) => group.id === id)
}

export function modesForDirection(direction: RateDirection): RateMode[] {
  return direction === "Domestic" ? ["Road"] : internationalModes
}

export function typesForDirection(direction: RateDirection, mode: RateMode) {
  return direction === "Domestic" ? [...domesticShipmentTypes] : [...shipmentTypesByMode[mode]]
}

export function routeForDirection(direction: RateDirection) {
  if (direction === "Import") return "/rates/import"
  if (direction === "Export") return "/rates/export"
  if (direction === "Cross trade") return "/rates/cross-trade"
  return "/rates/domestic"
}

export function defaultShapeFor(direction: RateDirection, mode?: RateMode) {
  const nextMode = mode && modesForDirection(direction).includes(mode) ? mode : modesForDirection(direction)[0]
  return {
    mode: nextMode,
    shipmentType: typesForDirection(direction, nextMode)[0],
  }
}

export function compareRequestForShape(direction: RateDirection, mode: RateMode, shipmentType: string): RateCompareRequest {
  const matchingPreset = comparePresets.find((preset) => (
    preset.request.direction === direction
    && preset.request.mode === mode
    && preset.request.shipmentType === shipmentType
  ))
  if (matchingPreset) return { ...matchingPreset.request }

  const sheet = rateSheets.find((item) => (
    item.direction === direction
    && item.mode === mode
    && item.shipmentType === shipmentType
    && item.status === "Live"
  ))

  return {
    customerId: direction === "Import" ? "bauhaus" : "jenkar",
    direction,
    mode,
    shipmentType,
    origin: sheet?.originName ?? (direction === "Domestic" ? "WF2 8TH" : "Ningbo"),
    destination: sheet?.destinationName ?? (direction === "Domestic" ? "BS1 4DJ" : "Felixstowe"),
    pallets: direction === "Domestic" ? 2 : 1,
    weightKg: mode === "Air" ? 420 : direction === "Domestic" ? 420 : 18000,
    serviceLevel: sheet?.serviceLevel ?? (direction === "Domestic" ? shipmentType : "Any"),
    includeMarket: direction !== "Domestic",
  }
}

export function normalizeLocation(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ")
}

export function ukPostcodeArea(value: string) {
  const compact = normalizeLocation(value).replace(/ /g, "")
  const match = compact.match(/^([A-Z]{1,2})\d/)
  if (match) return match[1]
  const areaMatch = compact.match(/^([A-Z]{1,2})$/)
  return areaMatch?.[1] ?? compact
}

export function resolveZone(group: RateZoneGroup, location: string) {
  const area = ukPostcodeArea(location)
  const named = group.members.find((member) => member.name.toUpperCase() === normalizeLocation(location) || member.code.toUpperCase() === normalizeLocation(location))
  if (named) return named
  const byArea = group.members.find((member) => member.areaCodes.includes(area))
  if (byArea) return byArea
  return group.members.find((member) => member.areaCodes.length === 0) ?? null
}

function rateForQuantity(line: RateLine, quantity: number) {
  const matchedBreak = line.breaks?.find((item) => quantity >= item.fromQuantity && (item.toQuantity === null || quantity <= item.toQuantity))
  const unitRate = matchedBreak?.unitRate ?? line.unitRate
  const amount = unitRate * quantity
  return Math.max(amount, line.minimumAmount ?? 0)
}

function locationMatchesLane(sheet: RateSheet, origin: string, destination: string) {
  const originNeedle = normalizeLocation(origin)
  const destinationNeedle = normalizeLocation(destination)
  const originOk = [sheet.originUnlocode, sheet.originName].some((value) => value && originNeedle.includes(normalizeLocation(value)))
  const destinationOk = [sheet.destinationUnlocode, sheet.destinationName].some((value) => value && destinationNeedle.includes(normalizeLocation(value)))
  return { originOk: Boolean(originOk || !sheet.originName), destinationOk: Boolean(destinationOk || !sheet.destinationName), both: Boolean(originOk && destinationOk) }
}

function serviceMatches(sheet: RateSheet, serviceLevel: string) {
  if (!serviceLevel || serviceLevel === "Any") return true
  return sheet.serviceLevel.toLowerCase() === serviceLevel.toLowerCase()
}

function quantityForSheet(sheet: RateSheet, request: RateCompareRequest) {
  if (sheet.lines.some((line) => line.basis === "per-pallet")) return Math.max(request.pallets, 1)
  if (sheet.lines.some((line) => line.basis === "per-100kg")) return Math.max(request.weightKg / 100, 1)
  return 1
}

export function matchTariffOffers(sheets: RateSheet[], request: RateCompareRequest): RateCompareOffer[] {
  const today = "2026-08-20"
  return sheets.flatMap((sheet) => {
    if (sheet.direction !== request.direction || sheet.mode !== request.mode) return []
    if (request.shipmentType !== "All types" && sheet.shipmentType !== request.shipmentType) return []
    if (!serviceMatches(sheet, request.serviceLevel) && request.serviceLevel !== "Any") return []
    if (sheet.status !== "Live" && sheet.status !== "Expired") return []

    const carrier = carrierById(sheet.carrierId)
    const quantity = quantityForSheet(sheet, request)
    const group = zoneGroupById(sheet.zoneGroupId)

    let originZone: string | undefined
    let destinationZone: string | undefined
    let lines = sheet.lines

    if (group) {
      const originMember = resolveZone(group, request.origin)
      const destinationMember = resolveZone(group, request.destination)
      if (!originMember || !destinationMember) return []
      originZone = group.scheme === "postcode" ? originMember.code : originMember.name
      destinationZone = group.scheme === "postcode" ? destinationMember.code : destinationMember.name
      lines = sheet.lines.filter((line) => line.originZone === originZone && line.destinationZone === destinationZone)
      if (!lines.length) return []
    } else {
      const lane = locationMatchesLane(sheet, request.origin, request.destination)
      if (!lane.both) return []
    }

    const breakdown = lines.map((line) => ({ label: line.description, amount: rateForQuantity(line, quantity) }))
    const buyTotal = breakdown.reduce((sum, item) => sum + item.amount, 0)
    if (!buyTotal) return []

    return [{
      id: `${sheet.id}:${request.origin}:${request.destination}`,
      sheetId: sheet.id,
      sourceKind: sheet.source,
      sourceLabel: sheet.source === "contract" ? "Contract" : sheet.source === "tariff" ? "Tariff" : "Spot",
      carrierId: sheet.carrierId,
      carrierName: carrier?.name ?? sheet.carrierId,
      tariffName: sheet.name,
      serviceLevel: sheet.serviceLevel,
      buyTotal,
      currency: sheet.currency,
      transitDays: sheet.transitDays,
      validUntil: sheet.validTo,
      confidence: sheet.source === "spot" || sheet.status === "Expired" ? "indicative" : "firm",
      originZone,
      destinationZone,
      routingSummary: [sheet.originName, sheet.destinationName].filter(Boolean).join(" → ") || undefined,
      breakdown,
      expired: sheet.status === "Expired" || sheet.validTo < today,
    }]
  })
}

export function coverageFromOffers(offers: RateCompareOffer[]): RateCoverageStatus {
  const firmLive = offers.filter((offer) => offer.confidence === "firm" && !offer.expired)
  if (firmLive.length >= 2) return "covered"
  if (firmLive.length === 1) return "partial"
  return "uncovered"
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isoHoursFromNow(hours: number) {
  const date = new Date("2026-08-20T11:00:00Z")
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

export async function requestMarketRates(request: RateCompareRequest): Promise<{ offers: RateCompareOffer[]; errors: { sourceId: string; sourceName: string; message: string }[] }> {
  await wait(720)
  const errors: { sourceId: string; sourceName: string; message: string }[] = []
  const offers: RateCompareOffer[] = []
  const origin = normalizeLocation(request.origin)
  const destination = normalizeLocation(request.destination)

  if (request.mode === "Sea") {
    const uncoveredLane = origin.includes("SANTOS") && destination.includes("HOUSTON")
    const coveredLane = origin.includes("NINGBO") && destination.includes("FELIXSTOWE")
    if (uncoveredLane || coveredLane) {
      offers.push({
        id: "mkt-maersk-ssz",
        sourceId: "maersk-api",
        sourceKind: "carrier-api",
        sourceLabel: "Maersk spot API",
        carrierId: "maersk",
        carrierName: "Maersk",
        tariffName: "Live ocean spot",
        serviceLevel: "Spot sailing",
        buyTotal: uncoveredLane ? 2850 : 2310,
        currency: "USD",
        transitDays: uncoveredLane ? 28 : 31,
        validUntil: isoHoursFromNow(6),
        confidence: "indicative",
        routingSummary: `${request.origin} → ${request.destination}`,
        breakdown: [
          { label: "Ocean freight 40HC", amount: uncoveredLane ? 2620 : 2100 },
          { label: "BAF / CAF", amount: uncoveredLane ? 230 : 210 },
        ],
      })
      offers.push({
        id: "mkt-index-ssz",
        sourceId: "ocean-index",
        sourceKind: "third-party",
        sourceLabel: "Ocean market index",
        carrierId: "msc",
        carrierName: "MSC",
        tariffName: "Market index composite",
        serviceLevel: "Index average",
        buyTotal: uncoveredLane ? 2795 : 2240,
        currency: "USD",
        transitDays: uncoveredLane ? 29 : 33,
        validUntil: isoHoursFromNow(4),
        confidence: "indicative",
        routingSummary: `${request.origin} → ${request.destination}`,
        breakdown: [{ label: "Indicative all-in 40HC", amount: uncoveredLane ? 2795 : 2240 }],
      })
      if (uncoveredLane) {
        offers.push({
          id: "mkt-one-ssz",
          sourceId: "ocean-index",
          sourceKind: "third-party",
          sourceLabel: "Ocean market index",
          carrierId: "one",
          carrierName: "Ocean Network Express",
          tariffName: "Market index carrier",
          serviceLevel: "Spot sailing",
          buyTotal: 2680,
          currency: "USD",
          transitDays: 31,
          validUntil: isoHoursFromNow(4),
          confidence: "indicative",
          routingSummary: `${request.origin} → ${request.destination}`,
          breakdown: [{ label: "Indicative all-in 40HC", amount: 2680 }],
        })
      }
    } else {
      offers.push({
        id: "mkt-ocean-generic",
        sourceId: "ocean-index",
        sourceKind: "third-party",
        sourceLabel: "Ocean market index",
        carrierId: "msc",
        carrierName: "MSC",
        tariffName: "Market index composite",
        serviceLevel: "Index average",
        buyTotal: 2480,
        currency: "USD",
        transitDays: 30,
        validUntil: isoHoursFromNow(4),
        confidence: "indicative",
        routingSummary: `${request.origin} → ${request.destination}`,
        breakdown: [{ label: "Indicative all-in", amount: 2480 }],
      })
    }
    errors.push({ sourceId: "haulage-exchange", sourceName: "Haulage exchange", message: "Timed out" })
  }

  if (request.mode === "Road") {
    const pallets = Math.max(request.pallets, 1)
    offers.push({
      id: "mkt-road-index",
      sourceId: "road-index",
      sourceKind: "third-party",
      sourceLabel: "UK road market index",
      carrierId: "redline",
      carrierName: "Redline Transport",
      tariffName: "Road market index",
      serviceLevel: request.serviceLevel === "Any" ? "Next-day" : request.serviceLevel,
      buyTotal: 52 * pallets,
      currency: "GBP",
      transitDays: request.shipmentType === "Pallet network" ? 2 : 1,
      validUntil: isoHoursFromNow(3),
      confidence: "indicative",
      routingSummary: `${request.origin} → ${request.destination}`,
      breakdown: [{ label: `Indicative per pallet × ${pallets}`, amount: 52 * pallets }],
    })
  }

  if (request.mode === "Air") {
    offers.push({
      id: "mkt-air-index",
      sourceId: "ocean-index",
      sourceKind: "third-party",
      sourceLabel: "Ocean market index",
      carrierId: "lufthansa",
      carrierName: "Lufthansa Cargo",
      tariffName: "Air market index",
      serviceLevel: "General cargo",
      buyTotal: Math.max(210, Math.round(request.weightKg * 1.9)),
      currency: "EUR",
      transitDays: 1,
      validUntil: isoHoursFromNow(5),
      confidence: "indicative",
      routingSummary: `${request.origin} → ${request.destination}`,
      breakdown: [{ label: "Indicative airport to airport", amount: Math.max(210, Math.round(request.weightKg * 1.9)) }],
    })
  }

  return { offers, errors }
}

export function compareCarriersFrom(offers: RateCompareOffer[], sheets: RateSheet[] = rateSheets) {
  const fromOffers = offers.map((offer) => offer.carrierName)
  const fromSheets = sheets.map((sheet) => carrierById(sheet.carrierId)?.name ?? sheet.carrierId)
  return [...new Set([...fromSheets, ...fromOffers])].sort((left, right) => left.localeCompare(right))
}

export function libraryCarriersFor(sheets: RateSheet[]) {
  return [...new Set(sheets.map((sheet) => carrierById(sheet.carrierId)?.name ?? sheet.carrierId))].sort((left, right) => left.localeCompare(right))
}

export function formatMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}

export function formatTransit(days: number) {
  return days === 1 ? "1 day" : `${days} days`
}

export function sourceFilterMatches(sheet: RateSheet, filter: RateSourceFilter) {
  if (filter === "All") return true
  if (filter === "Contract") return sheet.source === "contract"
  return sheet.source !== "contract"
}

export type DraftRateSheetInput = {
  name: string
  carrierId: string
  direction: RateDirection
  mode: RateMode
  shipmentType: string
  source: RateSourceKind
  serviceLevel: string
  currency: string
  validFrom: string
  validTo: string
  transitDays: number
}

export function createDraftSheet(input: DraftRateSheetInput, existingCount: number): RateSheet {
  const carrier = carrierById(input.carrierId)
  const code = `${(carrier?.shortName ?? "NEW").slice(0, 4).toUpperCase()}-NEW-${existingCount + 1}`
  return {
    id: `draft-${Date.now()}`,
    code,
    name: input.name.trim() || `${carrier?.shortName ?? "Carrier"} tariff`,
    status: "Draft",
    direction: input.direction,
    mode: input.mode,
    shipmentType: input.shipmentType,
    source: input.source,
    carrierId: input.carrierId,
    currency: input.currency,
    validFrom: input.validFrom,
    validTo: input.validTo,
    serviceLevel: input.serviceLevel,
    transitDays: input.transitDays,
    notes: "Added in the rate book. Lines can be completed from the supplier tariff.",
    lines: [],
  }
}
