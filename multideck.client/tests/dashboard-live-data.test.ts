import assert from "node:assert/strict"
import test from "node:test"
import type { QuoteRegisterRecord } from "../src/data/quote-register-data.ts"
import type { LiveBooking } from "../src/lib/application-data-api.ts"
import { buildDashboardLiveData } from "../src/lib/dashboard-live-data.ts"

function booking(overrides: Partial<LiveBooking>): LiveBooking {
  return {
    sourceId: "source",
    id: "MD-1",
    customer: "Customer",
    route: "London → Paris",
    carrier: "Carrier",
    container: "Shipment",
    mode: "ROAD",
    value: "",
    eta: "",
    time: "",
    currentLocation: "London",
    status: "On track",
    progress: 62,
    owner: "OP",
    tone: "green",
    invoice: "",
    jobRef: "JOB-1",
    customerRef: "",
    supplierRef: "",
    origin: "London",
    destination: "Paris",
    vessel: "",
    departureDate: "",
    arrivalDate: "",
    vin: "",
    direction: "Export",
    shipmentType: "General cargo",
    isFavourite: false,
    customFields: [],
    updatedAt: "2026-08-06T12:00:00Z",
    ...overrides,
  }
}

function quote(overrides: Partial<QuoteRegisterRecord>): QuoteRegisterRecord {
  return {
    reference: "Q-1",
    status: "Working",
    statusTone: "amber",
    customer: "Customer",
    origin: "London",
    destination: "Paris",
    estimatedDeparture: "2026-08-05",
    estimatedArrival: "2026-08-12",
    transportTime: "7 days",
    transportMode: "Road",
    equipmentLoad: "Shipment",
    pickup: "",
    delivery: "",
    routingVia: "Direct",
    incoterms: "DAP",
    incotermsPlace: "Paris",
    serviceLevel: "Standard",
    shipmentType: "Road freight",
    carrier: "Carrier",
    supplier: "Supplier",
    salesOwner: "Owner",
    operationsOwner: "Owner",
    quoteType: "Spot",
    direction: "Export",
    customerPurchaseOrder: "",
    shipperReference: "",
    validity: "",
    estimatedQuote: "",
    createdAt: "2026-08-01T12:00:00Z",
    sellValue: 100,
    estimatedProfit: 20,
    estimatedCost: 80,
    estimatedMargin: 20,
    currency: "GBP",
    documentStatus: "Draft",
    workflowStage: "Commercial review",
    priority: "Standard",
    priorityTone: "neutral",
    quoteSource: "Customer email",
    ...overrides,
  }
}

test("Today uses operational dates instead of hiding records that were not updated today", () => {
  const now = new Date(2026, 7, 8, 18, 0, 0)
  const snapshot = buildDashboardLiveData("today", [
    booking({ id: "MD-1", departureDate: "2026-08-06", arrivalDate: "2026-09-12" }),
    booking({ id: "MD-2", departureDate: "2026-08-07", arrivalDate: "2026-08-13", status: "Delayed", tone: "amber" }),
    booking({ id: "MD-3", departureDate: "2026-08-10", arrivalDate: "2026-08-17", status: "Exception", tone: "red" }),
  ], [
    quote({ reference: "Q-1" }),
    quote({ reference: "Q-2", status: "Ready to send", statusTone: "green" }),
  ], undefined, now)

  assert.deepEqual(snapshot.kpis.map(({ label, value }) => ({ label, value })), [
    { label: "Active jobs", value: "2" },
    { label: "Booking exceptions", value: "1" },
    { label: "Open quotes", value: "2" },
    { label: "Ready quotes", value: "1" },
  ])
  assert.deepEqual(snapshot.actions.map((action) => action.label), ["Review MD-2", "Send Q-2", "Progress Q-1"])
  assert.equal(snapshot.trends["Active jobs"].at(-1)?.value, 2)
  assert.equal(snapshot.trends["Open quotes"].at(-1)?.value, 2)
})

test("Custom ranges use the selected dates and incomplete records fall back to activity time", () => {
  const now = new Date(2026, 7, 8, 18, 0, 0)
  const bookings = [
    booking({ id: "MD-1", departureDate: "2026-08-06", arrivalDate: "2026-09-12" }),
    booking({ id: "MD-2", departureDate: "2026-08-10", arrivalDate: "2026-08-17" }),
    booking({ id: "MD-3", updatedAt: "2026-08-10T09:00:00Z" }),
  ]
  const snapshot = buildDashboardLiveData(
    "custom",
    bookings,
    [],
    { start: "2026-08-10", end: "2026-08-10" },
    now,
  )

  assert.equal(snapshot.kpis[0].value, "3")
})
