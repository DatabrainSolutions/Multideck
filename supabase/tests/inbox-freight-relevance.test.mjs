import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/inbox-freight-relevance.ts", import.meta.url), "utf8")
const policy = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`)
const { decideInboxFreightRelevance, groundedFreightEvidence, groundedBookingReferences } = policy

function fixture(document, patch = {}, freightEvidence = []) {
  return {
    extracted: { documentCategory: "freight_service", freightRelevance: "relevant", relevanceConfidence: 0.96, freightEvidence, ...patch },
    sources: { document, email: "" },
  }
}

const documentEvidence = (quote, kind = "freight_service") => ({ source: "document", kind, quote })

for (const [name, category, document] of [
  ["Amazon retail receipt with delivery and VAT", "retail_purchase", "Amazon invoice. Order 123-4567890-1234567. USB cable. Shipping £3.99. VAT £2.00. Deliver to London."],
  ["software sold to a freight company", "business_overhead", "Customs software subscription. Monthly freight management plan for Example Logistics. Invoice 1065."],
  ["office supplies from a known supplier", "business_overhead", "Freight charges £4.99. Printer toner for the office. Invoice 7882."],
  ["hotel booking confirmation", "personal_booking", "Booking confirmation. Reservation 9321. Arrival 12 September. Departure 14 September. Two nights."],
  ["passenger flight booking", "personal_booking", "Booking confirmation. Air ticket LHR to JFK. Baggage allowance 23kg. Traveller Harry."],
  ["personal courier parcel", "retail_purchase", "Courier invoice. Package weight 5kg. Shipment tracking 000321. Residential delivery including VAT."],
  ["utility invoice", "business_overhead", "Invoice 9932. Electricity supply at the warehouse. Amount due £400."],
  ["EC business membership invoice", "business_overhead", "Entrepreneurs Circle. Invoice EC-29082026-211669. Business membership subscription. Amount due £118.80 including VAT."],
  ["EC direct debit mandate", "business_overhead", "Entrepreneurs Circle membership. Direct debit instruction. Complete this mandate for your business membership."],
]) {
  test(`${name} does not become a suggestion, even if the model calls it relevant`, () => {
    const { extracted, sources } = fixture(document, { documentCategory: category }, [documentEvidence(document)])
    assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, false)
  })
}

for (const [name, category, kind, document] of [
  ["Amazon Freight haulage invoice", "freight_service", "freight_service", "Amazon Freight invoice AF123. Road freight charges for 22 pallets London to Rotterdam: £950."],
  ["customs broker invoice", "freight_service", "freight_service", "Invoice BROK12. Customs clearance £125. Import duty £350. MRN 26GB001234."],
  ["terminal handling and detention", "freight_service", "freight_service", "Invoice PORT12. Terminal handling £210. Detention £80. Container ABCD1234567."],
  ["warehouse cargo storage", "freight_service", "freight_service", "Invoice WH100. Cargo storage charges for 12 pallets of export goods: £450."],
  ["unmatched sea freight confirmation", "freight_transport", "transport_document", "Booking confirmation. Bill of lading ABC12345. Vessel Example. Voyage V056. Felixstowe to Singapore."],
  ["exporter commercial invoice", "cargo_trade", "cargo_trade", "Commercial invoice EXP123. Incoterms: FOB Shanghai. HS code 847130. 60 cartons of computers."],
]) {
  test(`${name} qualifies without requiring an existing booking match`, () => {
    const { extracted, sources } = fixture(document, { documentCategory: category }, [documentEvidence(document, kind)])
    const result = decideInboxFreightRelevance(extracted, sources)
    assert.equal(result.allow, true)
    assert.equal(result.reason, "freight_document")
    assert.equal(result.evidence[0].quote, document)
  })
}

test("generic shipping, invoice, VAT, origin/destination and tracking evidence cannot bypass the gate", () => {
  const doc = "Commercial invoice. Shipping £5. VAT 20%. Package 1. Tracking 123456789. Origin London. Destination Manchester."
  for (const kind of ["freight_service", "transport_document", "cargo_trade", "job_reference"]) {
    const { extracted, sources } = fixture(doc, { bookingReference: "123456789" }, [documentEvidence(doc, kind)])
    assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, false)
  }
})

test("model confidence or unsupported quotes alone cannot admit an invoice", () => {
  const { extracted, sources } = fixture("Invoice 001. Total £100. Thank you.", {}, [documentEvidence("Ocean freight charges £100.")])
  assert.equal(decideInboxFreightRelevance(extracted, sources).allow, false)
  assert.equal(decideInboxFreightRelevance({ ...extracted, freightEvidence: [] }, sources).allow, false)
})

test("email signatures and subjects do not provide attachment freight evidence", () => {
  const quote = "We provide ocean freight services and customs clearance."
  const { extracted, sources } = fixture("Amazon invoice. Desk lamp £35.", {}, [{ source: "email", kind: "freight_service", quote }])
  sources.email = `Please find my receipt attached.\nRegards, Forwarding Ltd\n${quote}`
  assert.equal(decideInboxFreightRelevance(extracted, sources).allow, false)
  extracted.freightEvidence[0].source = "subject"
  assert.equal(decideInboxFreightRelevance(extracted, sources).allow, false)
})

test("an uncertain attachment stays out until its explicit email job reference is verified", () => {
  const quote = "Please use this supplier invoice for job reference JQ20015."
  const { extracted, sources } = fixture("Supplier invoice 456. Machinery £20,000.", {
    documentCategory: "uncertain", freightRelevance: "uncertain", relevanceConfidence: 0.65, bookingReference: "JQ20015",
  }, [{ source: "email", kind: "job_reference", quote }])
  sources.email = quote
  assert.equal(decideInboxFreightRelevance(extracted, sources).allow, false)
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).reason, "verified_job_reference")
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, true)
  assert.equal(decideInboxFreightRelevance({ ...extracted, freightRelevance: "irrelevant" }, sources, true).allow, false)
})

test("a real freight quote cannot admit an unrelated reference hallucinated elsewhere", () => {
  const quote = "Bill of lading ABC12345 for the export shipment."
  const { extracted, sources } = fixture(quote, {
    bookingReference: "JQ20015", carrierBookingReference: "ABC123", masterTransportReference: "ABC12345",
  }, [documentEvidence(quote, "transport_document")])
  assert.deepEqual(groundedBookingReferences(extracted, groundedFreightEvidence(extracted, sources)), {
    bookingReference: null, carrierBookingReference: null, masterTransportReference: "ABC12345",
  })
})

test("OCR whitespace and reference punctuation are preserved without treating regex syntax as evidence", () => {
  const quote = "Booking reference: AIR-123/456. Ocean freight shipment."
  const { extracted, sources } = fixture(quote.replaceAll(" ", "\n"), { bookingReference: "AIR-123/456" }, [documentEvidence(quote, "job_reference")])
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, true)
  assert.equal(decideInboxFreightRelevance({ ...extracted, bookingReference: "AIR-.*" }, sources, true).allow, false)
})

test("an invoice or tracking number in the same quote is not a labelled booking reference", () => {
  const quote = "Booking reference JQ20015; invoice number INV-0099; parcel tracking 8458459."
  const { extracted, sources } = fixture(quote, {
    bookingReference: "INV-0099", carrierBookingReference: "8458459", masterTransportReference: "JQ20015",
  }, [documentEvidence(quote, "job_reference")])
  assert.deepEqual(groundedBookingReferences(extracted, groundedFreightEvidence(extracted, sources)), {
    bookingReference: null, carrierBookingReference: null, masterTransportReference: null,
  })
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, false)
})

test("uncertainty or low confidence requires a verified reference even with plausible freight language", () => {
  const quote = "Ocean freight charges for shipment 5566: £600."
  const { extracted, sources } = fixture(quote, {}, [documentEvidence(quote)])
  assert.equal(decideInboxFreightRelevance({ ...extracted, freightRelevance: "uncertain" }, sources).allow, false)
  assert.equal(decideInboxFreightRelevance({ ...extracted, relevanceConfidence: 0.84 }, sources).allow, false)
  assert.equal(decideInboxFreightRelevance({ ...extracted, relevanceConfidence: 0.85 }, sources).allow, true)
  for (const invalid of [undefined, null, "0.99", NaN, Infinity, -1, 1.1]) {
    assert.equal(decideInboxFreightRelevance({ ...extracted, relevanceConfidence: invalid }, sources).allow, false)
  }
})

test("legacy and malformed extractions fail closed without throwing", () => {
  for (const extracted of [{}, { freightRelevance: "relevant", relevanceConfidence: 0.99, relevanceSignals: ["invoice"] }, { freightEvidence: [null, [], { source: "document", quote: 1 }] }]) {
    assert.equal(decideInboxFreightRelevance(extracted, { document: "", email: "" }).allow, false)
  }
})

test("OCR Markdown emphasis does not hide a labelled booking reference", () => {
  const quote = "BOOKING REFERENCE\n**B-0001**"
  const { extracted, sources } = fixture(quote, { bookingReference: "B-0001", documentCategory: "uncertain", freightRelevance: "uncertain" }, [documentEvidence(quote, "job_reference")])
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, true)
})

test("OCR tables pair references with their own column, never an adjacent invoice number", () => {
  const quote = "| BOOKING REFERENCE | INVOICE NUMBER |\n| --- | --- |\n| B-0001 | INV-9911 |"
  const { extracted, sources } = fixture(quote, { bookingReference: "B-0001" }, [documentEvidence(quote, "job_reference")])
  assert.equal(groundedBookingReferences(extracted, groundedFreightEvidence(extracted, sources)).bookingReference, "B-0001")
  const wrong = { ...extracted, bookingReference: "INV-9911" }
  assert.equal(groundedBookingReferences(wrong, groundedFreightEvidence(wrong, sources)).bookingReference, null)
})

test("FCL sea import service qualifies without requiring one particular document layout", () => {
  const quote = "SERVICE\n**FCL · Sea import**"
  const { extracted, sources } = fixture(quote, { documentCategory: "freight_transport" }, [documentEvidence(quote, "transport_document")])
  assert.equal(decideInboxFreightRelevance(extracted, sources).allow, true)
})

test("a quoted OCR value row inherits only its actual adjacent table headers", () => {
  const quote = "| B-990001 | DEMO-CARRIER-990001 | DEMO-MASTER-990001 |"
  const document = `| MULTIDECK BOOKING | CARRIER BOOKING REFERENCE | MASTER REFERENCE |\n| --- | --- | --- |\n${quote}`
  const { extracted, sources } = fixture(document, { bookingReference: "B-990001", carrierBookingReference: "DEMO-CARRIER-990001", masterTransportReference: "DEMO-MASTER-990001" }, [documentEvidence(quote, "job_reference")])
  const evidence = groundedFreightEvidence(extracted, sources)
  assert.equal(evidence[0].quote, document)
  assert.equal(groundedBookingReferences(extracted, evidence).bookingReference, "B-990001")
  assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, true)
  assert.equal(decideInboxFreightRelevance(extracted, { ...sources, document: document.replace("MULTIDECK BOOKING", "INVOICE NUMBER") }, true).allow, true, "the independently labelled carrier reference remains valid")
  const unrelated = { ...extracted, carrierBookingReference: null, masterTransportReference: null }
  assert.equal(decideInboxFreightRelevance(unrelated, { ...sources, document: document.replace("MULTIDECK BOOKING", "INVOICE NUMBER") }, true).allow, false)
})

test("stress: 600 formatting, category and reference-boundary combinations retain the gate", () => {
  let checked = 0
  for (const separator of [" ", "\n", "\r\n", "\t", "  "]) {
    for (const confidence of [0, 0.5, 0.84, 0.85, 0.95, 1]) {
      for (const category of ["retail_purchase", "business_overhead", "personal_booking", "other"]) {
        const quote = "Ocean freight charges. Booking reference JQ20015.".replaceAll(" ", separator)
        const { extracted, sources } = fixture(quote, { documentCategory: category, relevanceConfidence: confidence, bookingReference: "JQ20015" }, [documentEvidence(quote)])
        assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, false)
        checked++
      }
      for (const suffix of ["-X", "/4", ".8", "_A", "9", "XYZ", "-2026", "/A"]) {
        const quote = `Booking reference JQ20015${suffix}; invoice number 7799.`.replaceAll(" ", separator)
        const { extracted, sources } = fixture(quote, { bookingReference: "JQ20015" }, [documentEvidence(quote, "job_reference")])
        assert.equal(decideInboxFreightRelevance(extracted, sources, true).allow, false)
        checked++
      }
      for (const category of ["freight_transport", "freight_service", "cargo_trade", "uncertain"]) {
        const { extracted, sources } = fixture("Membership invoice for £118.80.", { documentCategory: category, relevanceConfidence: confidence }, [documentEvidence("Ocean freight charges for shipment 4242.")])
        assert.equal(decideInboxFreightRelevance(extracted, sources).allow, false)
        checked++
      }
      for (const presentation of [(s) => s, (s) => s.toUpperCase(), (s) => `**${s}**`, (s) => s.replaceAll(" ", separator)]) {
        const quote = presentation("Ocean freight charges for shipment 4242.")
        const { extracted, sources } = fixture(quote, { relevanceConfidence: confidence }, [documentEvidence(quote)])
        assert.equal(decideInboxFreightRelevance(extracted, sources).allow, confidence >= 0.85)
        checked++
      }
    }
  }
  assert.equal(checked, 600)
})
