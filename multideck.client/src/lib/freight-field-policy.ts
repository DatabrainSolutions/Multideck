/** Shared presentation vocabulary. Lookup records remain the source of selectable values. */
export type FreightStage = "draft" | "submitted" | "booking" | "departure" | "arrival" | "completed"
export const freightBookingModes = ["OCEAN", "AIR", "ROAD", "RAIL", "MULTIMODAL", "COURIER", "POSTAL", "INLAND_WATERWAY", "WAREHOUSE", "CUSTOMS_ONLY", "DOCS_ONLY", "OTHER", "FAS", "FSA"] as const
export type FreightBookingMode = (typeof freightBookingModes)[number]

export function freightBookingMode(value: unknown): FreightBookingMode {
  const key = String(value ?? "").trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_")
  if (["SEA", "SEA_FCL", "SEA_LCL"].includes(key)) return "OCEAN"
  return (freightBookingModes as readonly string[]).includes(key) ? key as FreightBookingMode : "OTHER"
}

export type FreightContext = {
  mode?: string | null
  shipmentType?: string | null
  direction?: string | null
  stage?: FreightStage
  legModes?: readonly (string | null | undefined)[]
  hasContainers?: boolean
  vehicleCargo?: boolean
}

export function freightModeKey(value?: string | null): string {
  const key = (value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")
  if (["ocean", "sea_fcl", "sea_lcl"].includes(key)) return "sea"
  if (["fas", "fsa"].includes(key)) return "air"
  return key
}

export function freightShipmentCode(value?: string | null): string {
  return (value ?? "").split(" - ", 1)[0].trim().toUpperCase().replaceAll(" ", "_")
}

const shipmentCodes: Record<string, readonly string[]> = {
  sea: ["FCL", "LCL", "CONSOL", "BREAKBULK", "RO_RO", "PROJECT", "OTHER"],
  air: ["AIR", "ULD", "CONSOL", "CHARTER", "PROJECT", "OTHER"],
  road: ["FTL", "LTL", "GROUPAGE", "RO_RO", "PROJECT", "OTHER"],
  rail: ["FCL", "LCL", "CONTAINER", "FULL_WAGON", "WAGON", "RAIL_GROUPAGE", "GROUPAGE", "PROJECT", "OTHER"],
  courier: ["COURIER", "AIR", "EXPRESS", "PARCEL", "OTHER"],
  postal: ["POSTAL", "PARCEL", "OTHER"],
  inland_waterway: ["FCL", "LCL", "BREAKBULK", "PROJECT", "OTHER"],
  warehouse: ["WAREHOUSE", "OTHER"],
  customs_only: ["CUSTOMS_ONLY"],
  docs_only: ["DOCS_ONLY"],
}

export function freightShipmentAllowed(mode: string, shipmentType: string): boolean {
  const allowed = shipmentCodes[freightModeKey(mode)]
  // Unclassified lookup modes and multimodal retain their real lookup options.
  return !allowed || allowed.includes(freightShipmentCode(shipmentType))
}

export function freightFieldPolicy(context: FreightContext) {
  const mode = freightModeKey(context.mode)
  const shipment = freightShipmentCode(context.shipmentType)
  const modes = new Set(mode === "multimodal" ? (context.legModes ?? []).map(freightModeKey) : [mode])
  const sea = modes.has("sea") || modes.has("inland_waterway")
  const air = modes.has("air") || mode === "courier"
  const rail = modes.has("rail")
  const road = modes.has("road")
  const containerService = ["FCL", "CONTAINER"].includes(shipment)
  const transport = !["", "warehouse", "customs_only", "docs_only"].includes(mode)
  const operational = ["booking", "departure", "arrival", "completed"].includes(context.stage ?? "draft")
  return {
    mode,
    transport,
    sea,
    air,
    road,
    rail,
    hblMode: sea,
    chargeableWeight: air,
    // VIN describes vehicle cargo, not the lorry carrying ordinary goods.
    vin: context.vehicleCargo === true || shipment === "RO_RO",
    containerRequests: (sea || rail) && containerService,
    containers: (sea || rail) && (containerService || context.hasContainers === true),
    uld: air && operational,
    vehicle: road && operational,
    wagon: rail && operational,
    customs: (context.direction ?? "").trim().toLowerCase() !== "domestic",
    transportReference: mode === "air" ? "Air waybill" : mode === "sea" ? "Bill of lading" : mode === "road" ? "CMR / consignment note" : mode === "rail" ? "CIM / consignment note" : "Transport reference",
  }
}

export function freightTransportField(mode?: string | null): { field: "flightNumber" | "vessel" | "vehicleRegistration" | "railService" | "transportMeansName"; label: string } {
  switch (freightModeKey(mode)) {
    case "air": return { field: "flightNumber", label: "Flight number" }
    case "sea":
    case "inland_waterway": return { field: "vessel", label: "Vessel" }
    case "road": return { field: "vehicleRegistration", label: "Vehicle registration" }
    case "rail": return { field: "railService", label: "Rail service" }
    default: return { field: "transportMeansName", label: "Transport service" }
  }
}

// These are existing typed Job_Routing columns. Visibility never clears data
// from another mode: an operator can review it again by restoring that mode.
export function freightRouteOperationalFields(mode?: string | null): ReadonlyArray<{
  field: "masterTransportReference" | "houseTransportReference" | "voyageNumber" | "trailerNumber" | "serviceLevel"
  label: string
  maxLength: number
}> {
  const key = freightModeKey(mode)
  if (["", "warehouse", "customs_only", "docs_only"].includes(key)) return []
  const references = key === "air" ? ["Master air waybill (MAWB)", "House air waybill (HAWB)"]
    : key === "sea" || key === "inland_waterway" ? ["Master bill of lading", "House bill of lading"]
      : key === "road" ? ["CMR / consignment note", "Forwarder reference"]
        : key === "rail" ? ["CIM / SMGS consignment note", "Forwarder reference"]
          : ["Master transport reference", "House transport reference"]
  return [
    { field: "masterTransportReference", label: references[0], maxLength: 160 },
    { field: "houseTransportReference", label: references[1], maxLength: 160 },
    ...(key === "sea" || key === "inland_waterway" ? [{ field: "voyageNumber" as const, label: "Voyage number", maxLength: 50 }] : []),
    ...(key === "road" ? [{ field: "trailerNumber" as const, label: "Trailer number", maxLength: 80 }] : []),
    { field: "serviceLevel", label: "Leg service level", maxLength: 80 },
  ]
}
