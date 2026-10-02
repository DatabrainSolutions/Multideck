import { unzipSync } from "npm:fflate@0.8.3"
import { transportDocumentDataset } from "./transport-document-mapping.ts"
import { multideckDocumentLogo } from "./multideck-document-logo.ts"

const required = ["branding.logoDataUri", "issuer.name", "documentIssue.label", "job.reference", "transport.reference",
  "transport.shipper.name", "transport.shipper.address", "transport.consignee.name", "transport.consignee.address",
  "transport.origin", "transport.destination", "transport.cargo[i].description", "transport.cargo[i].packages", "transport.cargo[i].grossWeightKg"]

/** These are editable own-issuer review layouts. Licensed carrier/FIATA sources
 * remain protected and cannot use this upload/activation contract. */
export function validateTransportTemplate(bytes: Uint8Array, code: "HBL" | "HAWB") {
  let size = 0, count = 0
  const archive = unzipSync(bytes, { filter(file) {
    size += file.originalSize; count++
    if (count > 1000 || size > 25 * 1024 * 1024) throw new Error("The Word template expands beyond the supported size.")
    if (/(?:^|\/)(?:embeddings|activeX|vbaProject)|\.\.(?:\/|$)/i.test(file.name)) throw new Error("Remove embedded files and macros from the Word template.")
    return /^(?:word\/.*\.(?:xml|rels)|\[Content_Types\]\.xml)$/.test(file.name)
  } })
  if (!archive["word/document.xml"]) throw new Error("Choose a Word template containing a document body.")
  const texts = Object.entries(archive).map(([name, bytes]) => {
    const xml = new TextDecoder().decode(bytes)
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || name.endsWith(".rels") && /TargetMode\s*=\s*["']External["']/i.test(xml)) throw new Error("Remove external links and linked content from the Word template.")
    return xml.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") + " " + xml
  }).join("\n")
  const tags = [...texts.matchAll(/\{d\.([^{}]+)\}/g)].map(match => match[1])
  const fields = code === "HBL" ? [...required, "transport.notify.name", "transport.deliveryAgent.name", "transport.vessel", "transport.voyage", "transport.cargo[i].marksAndNumbers", "transport.cargo[i].volumeCbm"]
    : [...required, "transport.masterReference", "transport.cargo[i].chargeableWeightKg", "transport.currency", "transport.declaredCarriageValue", "transport.declaredCustomsValue", "transport.insuranceAmount"]
  const missing = fields.filter(field => !tags.some(tag => tag === field || tag.startsWith(field + ":")))
  if (missing.length) throw new Error(`Keep these required template fields: ${missing.join("; ")}.`)
  if ((texts.match(/\{d\./g) ?? []).length !== tags.length) throw new Error("A Carbone field is unfinished. Check each opening and closing brace.")
  if (!texts.includes("FOR REVIEW ONLY")) throw new Error("Keep the FOR REVIEW ONLY marking in this draft layout.")
  return { requiredFields: fields, documentCode: code, finalIssueEnabled: false }
}

export function transportTemplateSample(code: "HBL" | "HAWB", scenario = "standard") {
  const air = code === "HAWB"
  const source = {
    jobId: "00000000-0000-4000-8000-000000000001", companyId: "00000000-0000-4000-8000-000000000002",
    job: { bookingReference: "DEMO-SHIPMENT-001", shipperReference: "DEMO-ORDER-241", collectionAddress: "45 Factory Road\nColombo, Sri Lanka", deliveryAddress: "12 Distribution Way\nLondon, United Kingdom" },
    shipper: { name: "Demo exporter", address: "45 Factory Road\nColombo 00100, Sri Lanka" },
    consignee: { name: "Demo importer", address: "12 Distribution Way\nLondon, United Kingdom" },
    notify: { name: "Demo notify party", address: "22 Harbour Road\nLondon, United Kingdom" },
    deliveryAgent: { name: "Demo destination agent", address: "22 Harbour Road\nLondon, United Kingdom" },
    routing: [{ id: "00000000-0000-4000-8000-000000000003", mode: air ? "air" : "sea", isMainCarriage: true,
      origin: { name: "Colombo", unlocode: "LKCMB", iataCode: "CMB" }, destination: { name: air ? "London Heathrow" : "London Gateway", unlocode: air ? "GBLHR" : "GBLGP", iataCode: air ? "LHR" : "" },
      vessel: air ? "" : "Demo vessel", voyageNumber: air ? "" : "DEMO-26", flightNumber: air ? "DEMO-FLIGHT" : "", carrierName: "Demo operating carrier",
      houseTransportReference: air ? "DEMO-HAWB-001" : "DEMO-HBL-001", masterTransportReference: air ? "123-12345675" : "DEMO-MASTER-001",
      carrierBookingReference: "DEMO-CARRIER-001", plannedDepartureAt: "2026-10-11T08:00:00Z", plannedArrivalAt: air ? "2026-10-12T08:00:00Z" : "2026-11-02T08:00:00Z" }],
    cargo: [{ id: "demo-cargo", description: "Packed tea & food-grade packaging", marksAndNumbers: "DEMO 1–20", packageQuantity: "20", packageType: "Cartons", grossWeight: "450.25", chargeableWeight: "460", volume: "3.5", isHazardous: false, handling: "Keep dry" }],
    equipment: [{ kind: air ? "uld" : "container", number: "DEMO-EQUIPMENT-001", type: air ? "Demo ULD" : "20GP", seal: air ? "" : "DEMO-SEAL", grossWeight: "450.25", verifiedGrossMass: air ? null : "2700.25" }], allocations: [],
  }
  const identity = { issuer: { name: "Demo Forwarder Limited", address: "14 Harbour Road\nColombo, Sri Lanka", email: "operations@example.invalid" }, branding: { logoDataUri: multideckDocumentLogo } }
  if (scenario === "short" || scenario === "optional") {
    source.notify = { name: "", address: "" }; source.deliveryAgent = { name: "", address: "" }
    source.equipment = []; source.job.shipperReference = ""; source.cargo[0].handling = ""
    if (scenario === "optional") { identity.issuer.email = ""; source.cargo[0].marksAndNumbers = ""; source.cargo[0].volume = ""; source.cargo[0].chargeableWeight = "" }
  }
  if (scenario === "long") {
    source.shipper.address = "International Consolidation Centre\nBuildings 45–56, Export Processing Zone, eastern loading yard and appointment office\nColombo 00100, Sri Lanka"
    source.consignee.name = "Müller & Partners – Demo Distribution Limited"
    source.consignee.address = "Units 15–22, International Distribution Park\nReceiving warehouse, customer liaison and appointment office\nLondon, United Kingdom"
    source.cargo = Array.from({ length: 45 }, (_, index) => ({ ...source.cargo[0], id: `demo-cargo-${index}`, description: `Goods ${index + 1} — Packed tea and food-grade packaging with lengthy product specifications, batch details and operational handling notes. Source content must wrap without clipping.`, marksAndNumbers: `DEMO ${index + 1}`, packageQuantity: String(index + 1), grossWeight: String(125.25 + index), volume: "1.375" }))
    source.equipment = Array.from({ length: 8 }, (_, index) => ({ ...source.equipment[0], number: `DEMO-EQUIPMENT-${index + 1}`, seal: `DEMO-SEAL-${index + 1}` }))
  }
  if (scenario === "oversized") source.cargo[0].description = Array.from({ length: 36 }, (_, index) => `Specification ${index + 1}: Food-grade packaging and tea products with separately recorded batch particulars and operational handling information. This long source description must continue across pages without clipping, hiding a line or shrinking the document type.`).join("\n")
  if (scenario === "tenant") identity.branding.logoDataUri = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" fill="white" stroke="black"/><text x="60" y="46" text-anchor="middle" font-family="Arial" font-size="20">DEMO</text></svg>')
  return transportDocumentDataset(source, identity, code)
}

