import type { StatusTone } from "@/data/multideck-data"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"
import { supabase } from "@/lib/supabase"

type SalesQuoteRow = {
  Created_At: string
  Quote_Reference: string
  Quote_Status: string
  Quote_Status_Tone: string
  Customer_Name: string
  Origin: string
  Destination: string
  Estimated_Departure: string | null
  Estimated_Arrival: string | null
  Transport_Time: string
  Transport_Mode: string
  Equipment_Load: string
  Pickup: string
  Delivery: string
  Routing_Via: string
  Incoterms: string
  Incoterms_Place: string
  Service_Level: string
  Shipment_Type: string
  Carrier: string
  Supplier: string
  Sales_Owner: string
  Operations_Owner: string
  Quote_Type: string
  Direction: string
  Customer_Purchase_Order: string
  Shipper_Reference: string
  Validity: string
  Estimated_Quote: string
  Sell_Value: number
  Estimated_Profit: number
  Estimated_Cost: number
  Estimated_Margin: number | null
  Currency: "GBP" | "EUR" | "USD"
  Document_Status: string
  Workflow_Stage: string
  Priority: string
  Priority_Tone: string
  Quote_Source: string
}

const statusTones = new Set<StatusTone>(["neutral", "teal", "green", "amber", "red", "blue"])

function tone(value: string): StatusTone {
  return statusTones.has(value as StatusTone) ? value as StatusTone : "neutral"
}

function mapQuote(row: SalesQuoteRow): QuoteRegisterRecord {
  return {
    createdAt: row.Created_At,
    reference: row.Quote_Reference,
    status: row.Quote_Status,
    statusTone: tone(row.Quote_Status_Tone),
    customer: row.Customer_Name,
    origin: row.Origin,
    destination: row.Destination,
    estimatedDeparture: row.Estimated_Departure ?? "",
    estimatedArrival: row.Estimated_Arrival ?? "",
    transportTime: row.Transport_Time,
    transportMode: row.Transport_Mode,
    equipmentLoad: row.Equipment_Load,
    pickup: row.Pickup,
    delivery: row.Delivery,
    routingVia: row.Routing_Via,
    incoterms: row.Incoterms,
    incotermsPlace: row.Incoterms_Place,
    serviceLevel: row.Service_Level,
    shipmentType: row.Shipment_Type,
    carrier: row.Carrier,
    supplier: row.Supplier,
    salesOwner: row.Sales_Owner,
    operationsOwner: row.Operations_Owner,
    quoteType: row.Quote_Type,
    direction: row.Direction,
    customerPurchaseOrder: row.Customer_Purchase_Order,
    shipperReference: row.Shipper_Reference,
    validity: row.Validity,
    estimatedQuote: row.Estimated_Quote,
    sellValue: Number(row.Sell_Value),
    estimatedProfit: Number(row.Estimated_Profit),
    estimatedCost: Number(row.Estimated_Cost),
    estimatedMargin: row.Estimated_Margin === null ? null : Number(row.Estimated_Margin),
    currency: row.Currency,
    documentStatus: row.Document_Status,
    workflowStage: row.Workflow_Stage,
    priority: row.Priority,
    priorityTone: tone(row.Priority_Tone),
    quoteSource: row.Quote_Source,
  }
}

export async function listSalesQuotes(): Promise<QuoteRegisterRecord[]> {
  if (!supabase) throw new Error("Quotes are unavailable until this workspace is connected.")

  const { data, error } = await supabase
    .from("App_Live_Quotes")
    .select("*")
    .order("Updated_At", { ascending: false })

  if (error) throw error
  return (data as SalesQuoteRow[]).map(mapQuote)
}

export async function getSalesQuote(reference: string): Promise<QuoteRegisterRecord | null> {
  if (!supabase) throw new Error("Quotes are unavailable until this workspace is connected.")

  const { data, error } = await supabase
    .from("App_Live_Quotes")
    .select("*")
    .eq("Quote_Reference", reference)
    .maybeSingle()

  if (error) throw error
  return data ? mapQuote(data as SalesQuoteRow) : null
}
