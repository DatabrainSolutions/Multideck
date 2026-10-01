import { unzipSync } from "npm:fflate@0.8.3"

const maximumExpandedBytes = 25 * 1024 * 1024
const required = [
  ["Booking reference", "bookingConfirmation.bookingReference"],
  ["Customer", "bookingConfirmation.customer.name"],
  ["Shipper", "bookingConfirmation.shipper.name"],
  ["Consignee", "bookingConfirmation.consignee.name"],
  ["Goods description", "bookingConfirmation.cargo[i].description"],
  ["Packages", "bookingConfirmation.cargo[i].packages"],
  ["Gross weight", "bookingConfirmation.cargo[i].grossWeightKg"],
  ["Issuing legal entity", "issuer.name"],
  ["Logo", "branding.logoDataUri"],
  ["Draft or final marking", "documentIssue.label"],
] as const

/** Bound expansion before opening OOXML. Ignore attachments and disallow
 * external relationships so an edited template cannot fetch arbitrary URLs. */
export function validateBookingTemplate(bytes: Uint8Array) {
  let expandedBytes = 0
  let fileCount = 0
  const archive = unzipSync(bytes, { filter: (file) => {
    expandedBytes += file.originalSize
    fileCount++
    if (fileCount > 1000 || expandedBytes > maximumExpandedBytes) throw new Error("The Word template expands beyond the supported size.")
    if (/(?:^|\/)(?:embeddings|activeX|vbaProject)|\.\.(?:\/|$)/i.test(file.name)) throw new Error("Remove embedded files and macros from the Word template.")
    return /^(?:word\/.*\.(?:xml|rels)|\[Content_Types\]\.xml)$/.test(file.name)
  } })
  const files = Object.entries(archive)
  if (files.length > 1000 || files.reduce((total, [, value]) => total + value.length, 0) > maximumExpandedBytes) {
    throw new Error("The Word template expands beyond the supported size.")
  }
  if (!archive["word/document.xml"]) throw new Error("Choose a Word document containing a document body.")
  const decoder = new TextDecoder()
  const texts = files.map(([name, value]) => {
    const xml = decoder.decode(value)
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || name.endsWith(".rels") && /TargetMode\s*=\s*["']External["']/i.test(xml)) {
      throw new Error("Remove external links, linked images and embedded content from the Word template.")
    }
    return xml.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      + " " + xml // Image tags live in alternative text attributes.
  }).join("\n")
  const tags = [...texts.matchAll(/\{d\.([^{}]+)\}/g)].map((match) => match[1])
  const missing = required.filter(([, field]) => !tags.some((tag) => tag === field || tag.startsWith(field + ":"))).map(([label]) => label)
  if (missing.length) throw new Error(`Keep these required template fields: ${missing.join("; ")}.`)
  if (files.some(([name]) => /(?:embeddings|activeX|vbaProject)/i.test(name))) throw new Error("Remove embedded files and macros from the Word template.")
  const textStarts = (texts.match(/\{d\./g) ?? []).length
  if (textStarts !== tags.length) throw new Error("A Carbone field is unfinished. Check each opening and closing brace.")
  // Carbone performs the full syntax check during the mandatory test render.
  return { requiredFields: required.map(([label]) => label), schemaVersion: 2 }
}

export function bookingTemplateSample(scenario = "standard") {
  const sample = {
    issuer: { name: "Demo Forwarder Limited", address: "14 Harbour Road\nColombo, Sri Lanka", email: "operations@example.invalid" },
    bookingConfirmation: {
      jobId: "00000000-0000-4000-8000-000000000001", bookingReference: "DEMO-BOOKING-001", customerReference: "ORDER-241",
      mode: "Sea", shipmentType: "FCL", incoterm: "FCA Colombo", customer: { name: "Demo customer" },
      shipper: { name: "Demo shipper", address: "45 Factory Road\nColombo, Sri Lanka" },
      consignee: { name: "Demo consignee", address: "12 Distribution Way\nLondon, United Kingdom" },
      scope: { collection: true, mainTransport: true, delivery: true },
      collection: { address: "45 Factory Road\nColombo, Sri Lanka", plannedAtLabel: "11 Oct 2026", remarks: "" },
      delivery: { address: "12 Distribution Way\nLondon, United Kingdom", plannedAtLabel: "03 Nov 2026", remarks: "" },
      mainTransport: [{ origin: "Colombo", destination: "London Gateway", plannedDepartureAt: "2026-10-12T08:00:00Z", plannedArrivalAt: "2026-11-02T08:00:00Z", mode: "Sea", details: "Scheduled service" }],
      cargo: [{ description: "Packed tea", marksAndNumbers: "DEMO 1–20", packages: 20, packageType: "Cartons", grossWeightKg: 450, volumeCbm: 3.5 }],
      equipment: [{ kind: "Container", number: "DEMO0000011", type: "20GP" }],
      specialInstructions: "Keep dry. Collection during warehouse opening hours.", preparedBy: "Demo operator", priceStatus: "confirmed",
      chargeLines: [{ description: "Freight", currency: "USD", sellAmount: 1200.50 }, { description: "Collection", currency: "LKR", sellAmount: 18000 }],
      chargeTotals: [{ currency: "LKR", amount: 18000 }, { currency: "USD", amount: 1200.50 }],
    },
    documentIssue: { status: "draft", label: "DRAFT", isLegalOriginal: false },
  }
  if (scenario === "short" || scenario === "optional") {
    const booking = sample.bookingConfirmation
    booking.scope = { collection: true, mainTransport: false, delivery: false }
    booking.equipment = []
    booking.mainTransport = []
    booking.specialInstructions = ""
    booking.customerReference = ""
    booking.incoterm = ""
    booking.chargeLines = []
    booking.chargeTotals = []
    booking.priceStatus = "Prices not included"
    if (scenario === "optional") {
      sample.issuer.address = ""
      sample.issuer.email = ""
      booking.collection.plannedAtLabel = ""
      booking.shipper.address = ""
      booking.consignee.address = ""
    }
  }
  if (scenario === "long") {
    const booking = sample.bookingConfirmation
    booking.shipper.address = "International Consolidation Centre\nBuilding 45, Export Processing Zone, warehouse entrance through the eastern loading yard\nColombo 00100, Sri Lanka"
    booking.consignee.address = "Müller & Partners Distribution Limited\nUnits 15–22, International Distribution Park, receiving warehouse and appointment office\nLondon, United Kingdom"
    booking.cargo = Array.from({ length: 45 }, (_, index) => ({ description: `Goods line ${index + 1} — Packed tea and food-grade packaging. Assorted cartons with lengthy product specifications and handling notes that must wrap without clipping.`, marksAndNumbers: `DEMO ${index + 1}`, packages: index + 1, packageType: "Cartons", grossWeightKg: 125.25 + index, volumeCbm: 1.375 }))
    booking.equipment = Array.from({ length: 8 }, (_, index) => ({ kind: "Container", number: `DEMO00000${index}1`, type: "40HC" }))
    booking.chargeLines = Array.from({ length: 24 }, (_, index) => ({ description: `Service ${index + 1} — Customer-visible freight and handling`, currency: index % 2 ? "USD" : "LKR", sellAmount: 125.50 + index }))
    booking.chargeTotals = ["LKR", "USD"].map((currency) => ({ currency, amount: booking.chargeLines.filter((line) => line.currency === currency).reduce((cents, line) => cents + Math.round(line.sellAmount * 100), 0) / 100 }))
  }
  if (scenario === "oversized") {
    sample.bookingConfirmation.cargo[0].description = Array.from({length: 36}, (_, index) => `Specification ${index + 1}: Food-grade packaging and tea products, with separately recorded batch particulars and operational handling information. This long description is supplied as source content and must continue onto subsequent pages without clipping, hiding a line, or shrinking the document type.`).join("\n")
  }
  return sample
}

