// Fixed Booking projection -> transport layout. No client-supplied data, rates,
// signatures, security clearance or assumed container weights enter this mapper.
type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : []
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
const amount = (value: unknown): string => /^(?:0|[1-9]\d{0,29})(?:\.\d{1,12})?$/.test(text(value)) ? text(value) : ""
const location = (value: unknown) => {
  const source = row(value)
  return { name: text(source.name), unlocode: text(source.unlocode), iataCode: /^[A-Z]{3}$/.test(text(source.iataCode)) ? text(source.iataCode) : "" }
}
const date = (value: unknown): string => {
  const input = text(value)
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(input)) return ""
  const parsed = new Date(input)
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
}

// Decimal strings are retained through the provider boundary. A partial or
// invalid shipment total is blank, never a misleading subtotal or invented zero.
export function completeDecimalTotal(values: unknown[]): string {
  if (!values.length || values.some(value => !amount(value))) return ""
  const parts = values.map(value => amount(value).split("."))
  const scale = Math.max(...parts.map(part => (part[1] ?? "").length))
  const sum = parts.reduce((total, part) => total + BigInt(part[0] + (part[1] ?? "").padEnd(scale, "0")), 0n)
  const digits = sum.toString().padStart(scale + 1, "0")
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits
}

function party(value: unknown) {
  const source = row(value)
  // Keep saved free-text addresses intact rather than guessing city/country
  // from comma-separated text or current CRM data after the Booking was saved.
  const address = text(source.address)
  return { name: text(source.name), fullAddress: address, line1: address, line2: "", city: "", country: text(source.countryCode),
    address: { line1: address, line2: "", city: "", countyOrState: "", postalCode: "", countryCode: text(source.countryCode) } }
}
const partyBlock = (value: ReturnType<typeof party>) => [value.name, value.fullAddress].filter(Boolean).join("\n")

export function transportDocumentDataset(source: Row, family: "sea" | "air") {
  const job = row(source.job)
  const company = row(source.company)
  const routing = rows(source.routing).filter(route => [family === "sea" ? "sea" : "air", ...(family === "sea" ? ["ocean"] : [])].includes(text(route.mode).toLowerCase()))
  const marked = routing.filter(route => route.isMainCarriage === true)
  if (marked.length > 1 || (!marked.length && routing.length !== 1)) throw new Error("Choose one main carriage leg before creating this transport Draft.")
  const main = marked[0] ?? routing[0]
  const route = {
    id: text(main.id), mode: family, isMainCarriage: true, origin: location(main.origin), destination: location(main.destination),
    plannedDepartureAt: text(main.plannedDepartureAt), plannedArrivalAt: text(main.plannedArrivalAt),
    vessel: text(main.vessel), voyageNumber: text(main.voyageNumber), flightNumber: text(main.flightNumber),
    carrierName: text(main.carrierName), carrierAddressLine1: text(main.carrierAddressLine1), carrierAddressCity: text(main.carrierAddressCity),
    carrierBookingReference: text(main.carrierBookingReference), masterTransportReference: text(main.masterTransportReference),
    houseTransportReference: text(main.houseTransportReference),
  }
  const shipper = party(source.shipper)
  const consignee = party(source.consignee)
  const notify = party(source.notify) // No automatic consignee/shipper substitution.
  const agent = party(source.deliveryAgent)
  const cargo = rows(source.cargo).map(item => ({
    id: text(item.id), lineNumber: text(item.lineNumber), commodity: text(item.commodity), description: text(item.description),
    packageQuantity: amount(item.packageQuantity), packageType: text(item.packageType), grossWeight: amount(item.grossWeight),
    chargeableWeight: amount(item.chargeableWeight), volume: amount(item.volume), weightUnit: "KGM", volumeUnit: "MTQ",
    marksAndNumbers: text(item.marksAndNumbers), hsCode: text(item.hsCode),
    handling: [item.isHazardous === true ? "Dangerous goods flag - details require review" : "", text(item.handling)].filter(Boolean).join("; "),
  }))
  if (!cargo.length) throw new Error("Add cargo before creating this transport Draft.")
  const equipment = rows(source.equipment).filter(item => text(item.kind).toLowerCase() === (family === "sea" ? "container" : "uld"))
    .map(item => ({ id: text(item.id), number: text(item.number), seal: text(item.seal), type: text(item.type),
      grossWeight: amount(item.grossWeight), verifiedGrossMass: amount(item.verifiedGrossMass), volume: amount(item.volume), packages: amount(item.packages), packageType: text(item.packageType) }))
  const allocations = rows(source.allocations).filter(item => !text(item.routeId) || text(item.routeId) === text(main.id))
    .map(item => {
      const line = cargo.find(line => line.id === text(item.cargoId))
      const unit = equipment.find(unit => unit.id === text(item.containerId))
      if (!line || !unit) throw new Error("Review the cargo allocation links before creating this transport Draft.")
      return { cargoLine: line.lineNumber, equipmentNumber: unit.number, equipmentType: unit.type,
        packages: amount(item.packageQuantity), grossWeight: amount(item.grossWeight), volume: amount(item.volume), routeId: text(item.routeId) }
    })
  const totals = {
    packages: completeDecimalTotal(cargo.map(item => item.packageQuantity)),
    grossWeight: completeDecimalTotal(cargo.map(item => item.grossWeight)),
    // An explicit shipment override is independent of line weights. Never
    // fall back to gross kg or calculate chargeable kg from dimensions here.
    chargeableWeight: amount(job.chargeableWeightOverride) || completeDecimalTotal(cargo.map(item => item.chargeableWeight)),
    volume: completeDecimalTotal(cargo.map(item => item.volume)),
  }
  const gaps = [!shipper.name || !shipper.fullAddress ? "Shipper name/address" : "", !consignee.name || !consignee.fullAddress ? "Consignee name/address" : "",
    !text(main.carrierName) ? "Carrier" : "", !text(main.masterTransportReference) ? "Master transport reference" : "",
    !totals.packages ? "Complete package total" : "", !totals.grossWeight ? "Complete gross weight" : "",
    family === "air" && !totals.chargeableWeight ? "Chargeable weight" : "",
    family === "air" && (!route.origin.iataCode || !route.destination.iataCode) ? "Verified airport IATA codes" : "",
    family === "sea" && equipment.some(item => !item.number) ? "Container numbers" : "",
    family === "sea" && !notify.name ? "Notify party (if required)" : ""].filter(Boolean)
  const reference = text(job.bookingReference) || text(job.reference)
  const fiata = {
    reference: text(main.houseTransportReference), countryCode: "", consignor: partyBlock(shipper), consignee: partyBlock(consignee), notify: partyBlock(notify),
    placeOfReceipt: text(job.collectionAddress), oceanVessel: [text(main.vessel), text(main.voyageNumber)].filter(Boolean).join(" / "),
    portOfLoading: text(row(main.origin).name) || text(row(main.origin).unlocode), portOfDischarge: text(row(main.destination).name) || text(row(main.destination).unlocode),
    placeOfDelivery: text(job.deliveryAddress), carrierName: text(main.carrierName), billType: "DRAFT", billTypeDescription: "For review only - document type and issuing authority unconfirmed",
    goods: [{ marks: "See attached cargo schedule", packages: totals.packages, description: "Full goods particulars in attached schedule", grossWeight: totals.grossWeight ? `${totals.grossWeight} KG` : "", measurement: totals.volume ? `${totals.volume} M3` : "" }],
    equipment: [{ number: "See attached equipment schedule", seal: "", type: "", packages: "", mode: "" }],
    totalPackages: totals.packages, deliveryAgent: partyBlock(agent),
    // Do not invent clauses, freight terms, insurance or shipped-on-board facts.
    remarks: "DRAFT FOR REVIEW ONLY", consolidationReference: "", serviceMode: "", loadAndCount: "", shippedOnBoardStatement: "",
    deliveryInterest: "", declaredValue: "", freightAmount: "", freightPayableAt: "", placeAndDateOfIssue: "", insurance: "", originals: "", signingCapacity: "",
  }
  const waybill = {
    shipper, consignee, notify, deliveryAgent: agent, billNumber: text(main.houseTransportReference), forwarderReference: reference,
    customsReference: "", shipperReference: text(job.shipperReference), bookingReference: text(main.carrierBookingReference),
    departureDate: date(main.plannedDepartureAt), arrivalDate: date(main.plannedArrivalAt), carrierName: text(main.carrierName),
    placeOfReceipt: fiata.placeOfReceipt, portOfLoading: fiata.portOfLoading, portOfDischarge: fiata.portOfDischarge,
    destination: fiata.placeOfDelivery, vesselVoyage: fiata.oceanVessel, billType: "DRAFT",
    containerNumber: "See attached schedule", seal: "", equipmentType: "", grossWeight: totals.grossWeight, volume: totals.volume, packages: totals.packages,
    marks: "See attached cargo schedule", packageDescription: "Full particulars attached", goodsLine1: "See attached cargo schedule", goodsLine2: "", goodsLine3: "",
    totalPackages: totals.packages, serviceMode: "", onBoardDate: "", originals: "", freightTerms: "", issuePlaceDate: "", issuerName: text(company.name), signingNote: "DRAFT - NOT SIGNED",
  }
  return {
    meta: { schemaVersion: 3, transportMappingVersion: 1 }, company: { name: text(company.name), logoDataUri: text(company.logoDataUri) },
    job: { number: reference, period: "", reference, legalEntityName: text(company.name), origin: route.origin, destination: route.destination },
    shipper, consignee, routing: [route], cargo, fiata, waybill,
    transport: { family, reference, totals, cargo, equipment, allocations, gaps: gaps.map(label => ({ label })),
      parties: [{ role: "Shipper", ...shipper }, { role: "Consignee", ...consignee }, { role: "Notify party", ...notify }, { role: "Delivery agent", ...agent }],
      handling: cargo.map(item => item.handling).filter(Boolean).join("; "), securityStatus: "", issueDate: "", issuePlace: "", signingCapacity: "", draftOnly: true },
    documentIssue: { status: "draft", isLegalOriginal: false, policyVersion: 2 },
  }
}
