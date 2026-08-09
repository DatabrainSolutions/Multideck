import {
  countActiveFilterConditions,
  createEmptyFilterQuery,
  matchesFilterQuery,
  type FilterFieldOption,
  type FilterQuery,
} from "@/lib/advanced-filters"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"

export const quoteSearchFieldOptions: readonly FilterFieldOption[] = [
  { value: "any", label: "Any field", placeholder: "Reference, customer, route..." },
  { value: "reference", label: "Quote reference", placeholder: "QT-2451" },
  { value: "status", label: "Status", placeholder: "Awaiting approval" },
  { value: "customer", label: "Customer", placeholder: "Maersk Retail" },
  { value: "origin", label: "Origin port / airport", placeholder: "Ningbo" },
  { value: "destination", label: "Destination port / airport", placeholder: "Felixstowe" },
  { value: "estimatedDeparture", label: "Estimated departure (ETD)", kind: "date" },
  { value: "estimatedArrival", label: "Estimated arrival (ETA)", kind: "date" },
  { value: "transportTime", label: "Transport time" },
  { value: "transportMode", label: "Transport mode", placeholder: "Ocean" },
  { value: "equipmentLoad", label: "Equipment / load", placeholder: "40HC" },
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
  { value: "routingVia", label: "Routing via" },
  { value: "incoterms", label: "Incoterms", placeholder: "DAP" },
  { value: "incotermsPlace", label: "Incoterms place" },
  { value: "serviceLevel", label: "Service level" },
  { value: "shipmentType", label: "Shipment type" },
  { value: "carrier", label: "Carrier" },
  { value: "supplier", label: "Supplier" },
  { value: "salesOwner", label: "Sales owner" },
  { value: "operationsOwner", label: "Operations owner" },
  { value: "quoteType", label: "Quote type" },
  { value: "direction", label: "Direction", placeholder: "Import" },
  { value: "customerPurchaseOrder", label: "Customer purchase order" },
  { value: "shipperReference", label: "Shipper reference" },
  { value: "validity", label: "Validity" },
  { value: "estimatedQuote", label: "Estimated quote" },
  { value: "sellValue", label: "Sell value" },
  { value: "estimatedProfit", label: "Estimated profit" },
  { value: "estimatedCost", label: "Estimated cost" },
  { value: "estimatedMargin", label: "Estimated margin" },
  { value: "documentStatus", label: "Document status" },
  { value: "workflowStage", label: "Workflow stage" },
  { value: "priority", label: "Priority", placeholder: "High" },
  { value: "quoteSource", label: "Quote source" },
]

export type QuoteSearchQuery = FilterQuery

export function createEmptyQuoteSearch(): QuoteSearchQuery {
  return createEmptyFilterQuery("any")
}

export function countActiveQuoteConditions(query: QuoteSearchQuery) {
  return countActiveFilterConditions(query)
}

function quoteFieldValue(quote: QuoteRegisterRecord, field: string) {
  if (field !== "any") return quote[field as keyof QuoteRegisterRecord] as string | number | null

  return Object.entries(quote)
    .filter(([key]) => key !== "statusTone" && key !== "priorityTone")
    .map(([, value]) => String(value ?? ""))
}

export function quoteMatchesSearch(quote: QuoteRegisterRecord, search: QuoteSearchQuery) {
  return matchesFilterQuery(quote, search, quoteFieldValue)
}
