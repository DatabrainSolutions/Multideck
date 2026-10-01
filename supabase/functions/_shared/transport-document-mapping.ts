// Own-issuer review drafts only. Carrier originals, FIATA forms, acceptance,
// declarations and signatures are outside this projection.
type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const list = (value: unknown) => Array.isArray(value) ? value.map(row) : []
const number = (value: unknown, label: string, integer = false): number | null => {
  if (value === null || value === undefined || value === "") return null
  if (!/^(?:\d+)(?:\.\d+)?$/.test(String(value).trim())) throw new Error(`Correct ${label} on the booking before preparing this draft.`)
  const result = Number(value)
  if (!Number.isFinite(result) || result < 0 || result > Number.MAX_SAFE_INTEGER || integer && !Number.isSafeInteger(result)) throw new Error(`Correct ${label} on the booking before preparing this draft.`)
  return result
}
const label = (value: number | null, precision = 3) => value === null ? "" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: precision }).format(value)
const party = (value: unknown) => ({ name: text(row(value).name), address: text(row(value).address) })
const place = (value: unknown, air: boolean) => {
  const data = row(value)
  const code = text(air ? data.iataCode : data.unlocode)
  return [text(data.name), code].filter(Boolean).join(" · ")
}
const date = (value: unknown) => {
  if (!text(value)) return ""
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new Error("Correct the planned transport date on the booking.")
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed)
}

export function validMasterAirWaybill(value: string) {
  const digits = value.replace(/[\s-]/g, "")
  return /^\d{11}$/.test(digits) && Number(digits.slice(3, 10)) % 7 === Number(digits[10])
}

export function transportDocumentDataset(sourceValue: unknown, identityValue: unknown, code: "HBL" | "HAWB") {
  const source = row(sourceValue), identity = row(identityValue), issuer = row(identity.issuer), job = row(source.job)
  if (!text(issuer.name)) throw new Error("Select the issuing legal entity on this booking before preparing its document.")
  if (!text(job.bookingReference)) throw new Error("Complete the booking reference before preparing its document.")
  const air = code === "HAWB", mode = air ? "air" : "sea"
  const routes = list(source.routing)
  const applicable = routes.filter(route => text(route.mode).toLowerCase() === mode)
  const primary = applicable.filter(route => route.isMainCarriage === true)
  const candidates = primary.length ? primary : applicable
  if (candidates.length !== 1) throw new Error(candidates.length
    ? `Choose one main ${mode} transport leg on the booking. Split transport legs need a reviewed cargo allocation before creating this document.`
    : `Add the ${mode} transport leg to this booking before preparing this document.`)
  const route = candidates[0]
  // A job-level cargo total cannot safely represent two distinct main-carriage
  // consignments. Do not guess an allocation from ordering or template choice.
  if (routes.filter(route => route.isMainCarriage === true).length > 1) throw new Error("This booking has multiple main transport legs. Review the cargo allocation before preparing a transport document.")
  const missing: string[] = []
  const shipper = party(source.shipper), consignee = party(source.consignee)
  if (!shipper.name) missing.push("Shipper name")
  if (!shipper.address) missing.push("Shipper address")
  if (!consignee.name) missing.push("Consignee name")
  if (!consignee.address) missing.push("Consignee address")
  if (!place(route.origin, air)) missing.push(air ? "Departure airport" : "Port of loading")
  if (!place(route.destination, air)) missing.push(air ? "Destination airport" : "Port of discharge")
  if (air && !/^[A-Z]{3}$/.test(text(row(route.origin).iataCode))) missing.push("Verified departure IATA code")
  if (air && !/^[A-Z]{3}$/.test(text(row(route.destination).iataCode))) missing.push("Verified destination IATA code")
  const rawCargo = list(source.cargo)
  if (!rawCargo.length) missing.push("Goods")
  const cargo = rawCargo.map((item, index) => {
    const count = number(item.packageQuantity, `goods line ${index + 1} package count`, true)
    const weight = number(item.grossWeight, `goods line ${index + 1} gross weight`)
    const volume = number(item.volume, `goods line ${index + 1} volume`)
    const chargeable = number(item.chargeableWeight, `goods line ${index + 1} chargeable weight`)
    if (!text(item.description)) missing.push(`Goods line ${index + 1}: description`)
    if (count === null || count === 0) missing.push(`Goods line ${index + 1}: package count`)
    if (weight === null || weight === 0) missing.push(`Goods line ${index + 1}: gross weight`)
    return { line: index + 1, description: text(item.description), marksAndNumbers: text(item.marksAndNumbers),
      packages: label(count, 0), packageType: text(item.packageType), grossWeightKg: label(weight),
      volumeCbm: label(volume), chargeableWeightKg: label(chargeable), hsCode: text(item.hsCode),
      handling: [item.isHazardous === true ? "Dangerous goods: declaration required" : "", text(item.handling)].filter(Boolean).join("; ") }
  })
  const sum = (key: string, integer = false) => {
    const values = rawCargo.map((item, index) => number(item[key], `goods line ${index + 1} ${key}`, integer))
    if (!values.length || values.some(value => value === null)) return ""
    const total = values.reduce<number>((total, value) => total + value!, 0)
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new Error("The goods totals exceed the supported range.")
    return label(total, integer ? 0 : 3)
  }
  const reference = text(route.houseTransportReference)
  if (!reference) missing.push(air ? "House air waybill number" : "House bill of lading number")
  if (!air && !text(route.vessel)) missing.push("Vessel")
  if (!air && !text(route.voyageNumber)) missing.push("Voyage")
  const masterReference = text(route.masterTransportReference)
  if (air && masterReference && !validMasterAirWaybill(masterReference)) throw new Error("Correct the master air waybill number on the air transport leg: use the carrier prefix and eight-digit serial with a valid check digit.")
  const equipment = list(source.equipment).filter(item => text(item.kind).toLowerCase() === (air ? "uld" : "container")).map(item => ({
    number: text(item.number), type: text(item.type), seal: text(item.seal),
    grossWeightKg: label(number(item.grossWeight, "equipment gross weight")),
    // VGM is a separate fact, never substituted for cargo weight.
    verifiedGrossMassKg: label(number(item.verifiedGrossMass, "verified gross mass")),
  }))
  return {
    ...identity, documentIssue: { status: "draft", label: "DRAFT — FOR REVIEW ONLY", isLegalOriginal: false },
    meta: { transportMappingVersion: 1, transportDocumentCode: code, sourceJobId: source.jobId, sourceRouteId: route.id },
    job: { reference: text(job.bookingReference) },
    transport: { reference, masterReference, shipperReference: text(job.shipperReference),
      carrierBookingReference: text(route.carrierBookingReference), shipper, consignee,
      notify: party(source.notify), deliveryAgent: party(source.deliveryAgent),
      placeOfReceipt: text(job.collectionAddress), placeOfDelivery: text(job.deliveryAddress),
      origin: place(route.origin, air), destination: place(route.destination, air),
      originIata: air ? text(row(route.origin).iataCode) : "", destinationIata: air ? text(row(route.destination).iataCode) : "",
      carrierName: text(route.carrierName), vessel: text(route.vessel), voyage: text(route.voyageNumber), flight: text(route.flightNumber),
      plannedDeparture: date(route.plannedDepartureAt), plannedArrival: date(route.plannedArrivalAt),
      cargo, equipment, totals: { packages: sum("packageQuantity", true), grossWeightKg: sum("grossWeight"), volumeCbm: sum("volume") },
      // Until explicit rated/issuance facts exist, these remain empty. Planned
      // transport dates are never an on-board date or an issue date.
      freightPayment: "", freightPayableAt: "", onBoardDate: "", issuePlace: "", issueDate: "", originalCount: "",
      currency: "", rate: "", weightCharge: "", declaredCarriageValue: "", declaredCustomsValue: "", insuranceAmount: "", signature: "",
    }, review: { missing, finalIssueEnabled: false },
  }
}

