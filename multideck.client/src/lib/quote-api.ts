import type { StatusTone } from "@/data/operational-data"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"
import { filterQueryIsEmpty, type FilterQuery } from "@/lib/advanced-filters"
import { invalidateRegisterPages, readCachedRegisterPage, type RegisterSort } from "@/lib/application-data-api"
import { getSupabaseSession, supabase } from "@/lib/supabase"

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
  Updated_At?: string
}

export type QuoteRegisterPage = {
  rows: QuoteRegisterRecord[]
  total: number
  availableTotal: number
}

export type QuoteRegisterInput = {
  search?: string
  filterQuery: FilterQuery
  sort?: RegisterSort | null
  limit: number
  offset: number
}

const statusTones = new Set<StatusTone>(["neutral", "teal", "green", "amber", "red", "blue", "orange", "purple"])

function tone(value: string): StatusTone {
  return statusTones.has(value as StatusTone) ? value as StatusTone : "neutral"
}

function mapQuote(row: SalesQuoteRow): QuoteRegisterRecord {
  const lifecycle = row.Quote_Status.trim().toLowerCase()
  const presentation = lifecycle === "accepted"
    ? { status: "Accepted", statusTone: "green" as StatusTone }
    : ["declined", "ghosted", "lost"].includes(lifecycle)
      ? { status: "Lost", statusTone: "red" as StatusTone }
      : lifecycle === "sent"
        ? { status: "Sent", statusTone: "teal" as StatusTone }
        : lifecycle === "calculated"
          ? { status: "Ready", statusTone: "blue" as StatusTone }
          : lifecycle === "revised"
            ? { status: "Revised", statusTone: "amber" as StatusTone }
            : lifecycle === "draft"
              ? { status: "Open", statusTone: "amber" as StatusTone }
              : { status: row.Quote_Status || "Open", statusTone: tone(row.Quote_Status_Tone) }
  return {
    createdAt: row.Created_At,
    reference: row.Quote_Reference,
    status: presentation.status,
    statusTone: presentation.statusTone,
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

export function subscribeSalesQuotes(onChange: () => void) {
  const client = supabase
  if (!client) return () => undefined
  const channel = client
    .channel(`quote-register-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "CusQuote_Header" }, () => {
      invalidateRegisterPages("quotes:")
      onChange()
    })
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

const dashboardQuoteCompatibilityColumns = [
  "Created_At", "Quote_Reference", "Quote_Status", "Quote_Status_Tone", "Customer_Name", "Origin",
  "Destination", "Estimated_Departure", "Estimated_Arrival", "Transport_Time", "Transport_Mode",
  "Equipment_Load", "Pickup", "Delivery", "Routing_Via", "Incoterms", "Incoterms_Place",
  "Service_Level", "Shipment_Type", "Carrier", "Supplier", "Sales_Owner", "Operations_Owner",
  "Quote_Type", "Direction", "Customer_Purchase_Order", "Shipper_Reference", "Validity",
  "Estimated_Quote", "Sell_Value", "Estimated_Profit", "Estimated_Cost", "Estimated_Margin", "Currency",
  "Document_Status", "Workflow_Stage", "Priority", "Priority_Tone", "Quote_Source", "Updated_At",
].join(",")

/** Bounded compatibility sample used only while the dashboard RPC is absent. */
export async function listSalesQuotesCompatibilitySample(signal?: AbortSignal): Promise<QuoteRegisterRecord[]> {
  const client = supabase
  if (!client) throw new Error("Quotes are unavailable until this workspace is connected.")
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to view quotes.")
  let query = client
    .from("App_Live_Quotes")
    .select(dashboardQuoteCompatibilityColumns)
    .order("Updated_At", { ascending: false, nullsFirst: false })
    .limit(51)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapQuote(row as unknown as SalesQuoteRow))
}

export async function listSalesQuotesPage(input: QuoteRegisterInput, signal?: AbortSignal): Promise<QuoteRegisterPage> {
  const client = supabase
  if (!client) throw new Error("Quotes are unavailable until this workspace is connected.")
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to view quotes.")

  const normalizedInput = {
    ...input,
    search: input.search?.trim() || undefined,
    filterQuery: filterQueryIsEmpty(input.filterQuery) ? null : input.filterQuery,
    limit: Math.max(1, Math.min(input.limit, 50)),
    offset: Math.max(0, input.offset),
  }
  const resource = `quotes:page:${JSON.stringify(normalizedInput)}`
  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await client.rpc("multideck_quote_register_page", {
      p_search: normalizedInput.search ?? null,
      p_filter_query: normalizedInput.filterQuery,
      p_sort: normalizedInput.sort?.id ?? "updatedAt",
      p_sort_direction: normalizedInput.sort?.direction ?? "desc",
      p_limit: normalizedInput.limit,
      p_offset: normalizedInput.offset,
    }).abortSignal(requestSignal)
    if (error) throw error

    const response = (data ?? {}) as Record<string, unknown>
    return {
      rows: Array.isArray(response.rows) ? response.rows.map((row) => mapQuote(row as SalesQuoteRow)) : [],
      total: Number(response.total ?? 0),
      availableTotal: Number(response.availableTotal ?? response.total ?? 0),
    }
  }, signal)
}

export async function getSalesQuote(reference: string): Promise<QuoteRegisterRecord | null> {
  if (!supabase) throw new Error("Quotes are unavailable until this workspace is connected.")

  const { data, error } = await supabase
    .from("App_Live_Quotes")
    .select(dashboardQuoteCompatibilityColumns)
    .eq("Quote_Reference", reference)
    .maybeSingle()

  if (error) throw error
  return data ? mapQuote(data as unknown as SalesQuoteRow) : null
}
