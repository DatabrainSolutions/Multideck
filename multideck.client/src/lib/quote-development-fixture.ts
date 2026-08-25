import {
  getQuoteSources,
  saveQuoteWorkflow,
  type QuoteOrganisationOption,
  type QuoteSavePayload,
  type QuoteWorkflowSources,
} from "@/lib/quote-workflow-api"

const demoCodes = {
  customer: "QDEMO-CUS",
  supplier: "QDEMO-SUP",
  carrier: "QDEMO-CAR",
  agent: "QDEMO-AGT",
  shipper: "QDEMO-SHP",
  consignee: "QDEMO-CON",
} as const

function demoOrganisation(sources: QuoteWorkflowSources, code: string, label: string) {
  const organisation = sources.organisations.find((candidate) => candidate.code === code)
  if (!organisation) {
    throw new Error(`The seeded ${label} (${code}) is missing. Apply the development quote-source seed before creating a test quote.`)
  }
  return organisation
}

function primaryAddress(organisation: QuoteOrganisationOption) {
  return organisation.addresses[0] ?? null
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function locationLabel(address: ReturnType<typeof primaryAddress>, fallback: string) {
  return [address?.unlocode, address?.townCity].filter(Boolean).join(" - ") || fallback
}

export function buildDevelopmentQuotePayload(sources: QuoteWorkflowSources, now = new Date()): QuoteSavePayload {
  const customer = demoOrganisation(sources, demoCodes.customer, "demo customer")
  const supplier = demoOrganisation(sources, demoCodes.supplier, "demo supplier")
  const carrier = demoOrganisation(sources, demoCodes.carrier, "demo carrier")
  const agent = demoOrganisation(sources, demoCodes.agent, "demo agent")
  const shipper = demoOrganisation(sources, demoCodes.shipper, "demo shipper")
  const consignee = demoOrganisation(sources, demoCodes.consignee, "demo consignee")
  const customerContact = customer.contacts[0]
  const shipperContact = shipper.contacts[0]
  const consigneeContact = consignee.contacts[0]
  const customerAddress = primaryAddress(customer)
  const supplierAddress = primaryAddress(supplier)
  const carrierAddress = primaryAddress(carrier)
  const agentAddress = primaryAddress(agent)
  const shipperAddress = primaryAddress(shipper)
  const consigneeAddress = primaryAddress(consignee)
  const office = sources.offices[0]
  const department = sources.departments.find((candidate) => /sea|ocean/i.test(candidate.name)) ?? sources.departments[0]
  const salesOwner = sources.users[0]
  const seaMode = sources.modes.find((candidate) => /sea/i.test(`${candidate.code} ${candidate.name}`)) ?? sources.modes[0]
  const fclType = sources.shipmentTypes.find((candidate) => /fcl|full container/i.test(`${candidate.code} ${candidate.name}`)) ?? sources.shipmentTypes[0]
  const commodity = sources.commodities.find((candidate) => /textile|garment|apparel/i.test(candidate.name)) ?? sources.commodities[0]
  const runId = now.toISOString().replace(/\D/g, "").slice(0, 14)
  const validFrom = addDays(now, 0)
  const validTo = addDays(now, 30)
  const deadline = addDays(now, 7)

  return {
    sourceType: "account",
    sourceId: customer.id,
    customerId: customer.id,
    customerName: customer.name,
    contactId: customerContact?.id ?? null,
    contactName: customerContact?.name ?? "Demo buying team",
    contactEmail: customerContact?.email ?? "quotes@northstar-apparel.example.test",
    customerReference: `DEV-${runId}`,
    officeId: office?.id ?? null,
    departmentId: department?.id ?? null,
    salesOwnerId: salesOwner?.id ?? null,
    direction: "export",
    mode: seaMode?.code ?? "SEA",
    shipmentType: fclType?.code ?? "FCL",
    serviceLevel: "Door-to-door priority",
    currency: "GBP",
    collectionAddress: shipperAddress?.address ?? "Port Qasim Trade Centre, Karachi, 75020, PK",
    loadingPoint: locationLabel(shipperAddress, "PKKHI - Karachi"),
    dischargePoint: "GBFXT - Felixstowe",
    deliveryAddress: consigneeAddress?.address ?? "Royal Portbury Dock, Bristol, BS20 7XH, GB",
    incoterm: "DAP",
    validFrom,
    validTo,
    deadline,
    supplierId: supplier.id,
    supplierName: supplier.name,
    carrierId: carrier.id,
    carrierName: carrier.name,
    shipmentFacts: {
      quoteType: "Spot quote",
      source: "Development test button",
      workflowStatus: "Ready to review",
      priority: "Normal",
      holdReason: "None",
      customerPO: `PO-${runId}`,
      shipperReference: `SHP-${runId}`,
      consigneeReference: `CON-${runId}`,
      agentReference: `AGT-${runId}`,
      carrierReference: `CAR-${runId}`,
      docsStatus: "Documents pending",
      workflow: "Development fixture",
      revisionReason: "Initial test fixture",
      clientCode: customer.code,
      customerAddress: customerAddress?.address ?? "1 Harbour Exchange Square, London, E14 9GE, GB",
      shipperCode: shipper.code,
      shipperAddressOverride: "No",
      consigneeCode: consignee.code,
      consigneeContact: consigneeContact?.name ?? "Demo receiving team",
      consigneeEmail: consigneeContact?.email ?? "receiving@bristol-depot.example.test",
      consigneeAddressOverride: "No",
      agentOrgId: agent.id,
      agentCode: agent.code,
      agentName: agent.name,
      agentAddress: agentAddress?.address ?? "Jebel Ali Free Zone, Dubai, AE",
      agentContact: agent.contacts[0]?.name ?? "Demo clearance team",
      agentEmail: agent.contacts[0]?.email ?? "clearance@gulf-customs.example.test",
      namedPlace: "Royal Portbury Dock, Bristol",
      originCountry: "Pakistan",
      originTown: shipperAddress?.townCity ?? "Karachi",
      originUnlocode: shipperAddress?.unlocode ?? "PKKHI",
      destinationCountry: "United Kingdom",
      destinationTown: "Felixstowe",
      destinationUnlocode: "GBFXT",
      routingVia: "NLRTM - Rotterdam",
      hblMode: "House bill of lading",
      transitDays: "31",
      transitUnit: "days",
      frequency: "Weekly",
      frequencyInterval: "1",
      frequencyUnit: "week",
      frequencyTimesPerMonth: "4",
      frequencyCount: "1",
      frequencyNotes: "Prefer the earliest direct sailing; one transshipment is acceptable.",
      container: "1 × 40HC",
      carrierOffice: carrierAddress?.address ?? "Hamburg, DE",
      supplierOffice: supplierAddress?.address ?? "Rotterdam, NL",
      branch: office?.name ?? "Development office",
      department: department?.name ?? "Sea freight",
      salesRep: salesOwner?.name ?? "Development operator",
      opsRep: salesOwner?.name ?? "Development operator",
      goodsValue: "84500",
      goodsValueCurrency: "GBP",
      insuranceValue: "90000",
      insuranceValueCurrency: "GBP",
      entries: "2",
      invoiceLines: "12",
      commodity: commodity ? `${commodity.code} - ${commodity.name}` : "620342 - Cotton garments",
      co2e: "1840 kg",
      knownCargo: "Yes",
      cargoCharacteristics: "Non-stackable cartons; keep dry and away from odorous cargo.",
      hazardousUnNumber: "UN1263",
      hazardousClass: "3",
      hazardousPackingGroup: "III",
      hazardousShippingName: "PAINT RELATED MATERIAL",
      hazardousEmergencyContact: "+44 20 7946 0999",
      hazardousNetWeightKg: "48",
      hazardousMarinePollutant: "No",
      hazardousLimitedQuantity: "Yes",
      hazardousNotes: "Four limited-quantity cartons included for workflow testing only.",
      packageQuantity: "120",
      packageType: "Cartons",
      grossWeightKg: "18640",
      volumeCbm: "61.2",
      chargeableWeightKg: "18640",
      customsIncluded: "Yes",
      originCustomsAgentId: agent.id,
      originCustomsAgentName: agent.name,
      destinationCustomsAgentId: agent.id,
      destinationCustomsAgentName: agent.name,
      subjectToTerms: "Subject to carrier space, equipment and final sailing confirmation.",
      customerTermsSource: "Saved demo customer terms",
      fmcTid: `FMC-${runId}`,
      jobRoes: [
        { currency: "USD", baseRate: 1.28, costRate: 1.27, revenueRate: 1.29 },
        { currency: "EUR", baseRate: 1.17, costRate: 1.16, revenueRate: 1.18 },
      ],
    },
    customerNotes: "Door-to-door priority service for the development test shipment. Please show freight, customs and delivery separately.",
    internalNotes: `Development-only populated quote fixture ${runId}. Safe demo contacts use the reserved .example.test domain.`,
    terms: customer.quoteTerms?.terms || "Rates are subject to equipment, space and the stated validity period.",
    rateSourceType: "manual_test_fixture",
    rateSourceLabel: "Development fixture rates",
    defaultMarkupPct: 18,
    markupOverrideReason: "Development fixture exercises an explicit markup decision.",
    followUpAt: `${deadline}T09:00:00.000Z`,
    shipper: {
      orgId: shipper.id,
      name: shipper.name,
      address: shipperAddress?.address ?? "Port Qasim Trade Centre, Karachi, 75020, PK",
      contact: shipperContact?.name ?? "Demo export team",
    },
    consignee: {
      orgId: consignee.id,
      name: consignee.name,
      address: consigneeAddress?.address ?? "Royal Portbury Dock, Bristol, BS20 7XH, GB",
      contact: consigneeContact?.name ?? "Demo receiving team",
    },
    charges: [
      {
        id: crypto.randomUUID(),
        description: "Ocean freight – 40HC",
        supplierId: supplier.id,
        costCurrency: "USD",
        costAmount: 2_850,
        costLocal: 2_244.09,
        costRoe: 1.27,
        sellCurrency: "USD",
        sellAmount: 3_250,
        sellLocal: 2_519.38,
        sellRoe: 1.29,
        calculationBasis: "per container",
        quantity: 1,
        minimumAmount: 2_850,
        defaultMarkupPct: 18,
        appliedMarkupPct: 14.04,
        markupOverrideReason: "Rounded to the agreed test sell rate.",
        sourceLabel: `${supplier.name} development rate`,
        internalNotes: "Includes origin terminal handling.",
        customerNotes: "Ocean freight and origin terminal handling.",
        showToCustomer: true,
      },
      {
        id: crypto.randomUUID(),
        description: "Export customs clearance",
        supplierId: agent.id,
        costCurrency: "GBP",
        costAmount: 95,
        costLocal: 95,
        costRoe: 1,
        sellCurrency: "GBP",
        sellAmount: 135,
        sellLocal: 135,
        sellRoe: 1,
        calculationBasis: "per declaration",
        quantity: 1,
        sourceLabel: agent.name,
        internalNotes: "Two commodity entries included.",
        customerNotes: "Export customs clearance, including two entries.",
        showToCustomer: true,
      },
      {
        id: crypto.randomUUID(),
        description: "Destination delivery",
        supplierId: carrier.id,
        costCurrency: "GBP",
        costAmount: 620,
        costLocal: 620,
        costRoe: 1,
        sellCurrency: "GBP",
        sellAmount: 745,
        sellLocal: 745,
        sellRoe: 1,
        calculationBasis: "per container",
        quantity: 1,
        sourceLabel: carrier.name,
        internalNotes: "Weekday delivery slot, waiting time excluded.",
        customerNotes: "Port-to-door delivery to Bristol.",
        showToCustomer: true,
      },
      {
        id: crypto.randomUUID(),
        description: "Internal test contingency",
        supplierId: supplier.id,
        costCurrency: "GBP",
        costAmount: 75,
        costLocal: 75,
        costRoe: 1,
        sellCurrency: "GBP",
        sellAmount: 0,
        sellLocal: 0,
        sellRoe: 1,
        calculationBasis: "fixed",
        quantity: 1,
        sourceLabel: "Development fixture",
        internalNotes: "Hidden cost line used to test internal-only charge handling.",
        customerNotes: "",
        showToCustomer: false,
      },
    ],
  }
}

export async function createDevelopmentQuoteFixture() {
  if (!import.meta.env.DEV) throw new Error("Test quotes can only be created from a development build.")
  const sources = await getQuoteSources()
  return saveQuoteWorkflow(null, buildDevelopmentQuotePayload(sources))
}
