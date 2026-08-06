import type { StatusTone } from "@/data/multideck-data"
import type { DomesticRoadJob, RoadJobStageId } from "@/components/multideck/domestic-road-components"
import { supabase } from "@/lib/supabase"

type BookingMode = "OCEAN" | "AIR" | "ROAD" | "FAS" | "FSA"
type BookingStatus = "On track" | "Delayed" | "Exception"
type BookingDirection = "Import" | "Export" | "Domestic" | "Cross trade"

export type LiveBooking = {
  id: string
  customer: string
  route: string
  carrier: string
  container: string
  mode: BookingMode
  value: string
  eta: string
  time: string
  status: BookingStatus
  progress: number
  owner: string
  tone: StatusTone
  invoice: string
  jobRef: string
  customerRef: string
  supplierRef: string
  origin: string
  destination: string
  vessel: string
  departureDate: string
  arrivalDate: string
  vin: string
  direction: BookingDirection
  shipmentType: string
  isFavourite: boolean
  customFields: { label: string; value: string }[]
  updatedAt: string
}

export type LiveReport = {
  id: string
  title: string
  customer: string | null
  type: string
  status: string
  tone: StatusTone
  period: string
  generatedAt: string | null
  scheduledFor: string | null
  summary: string
}

export type LiveCrmOpportunity = {
  id: string
  account: string
  contact: string | null
  stage: string
  value: number
  currency: string
  probability: number
  owner: string
  nextAction: string
  dueAt: string | null
  source: string
  tone: StatusTone
}

export type LiveCrmActivity = {
  id: string
  opportunityId: string | null
  account: string
  type: string
  subject: string
  summary: string
  owner: string
  occurredAt: string
  tone: StatusTone
}

export type LiveCrmCampaign = {
  id: string
  name: string
  status: string
  audience: number
  delivered: number
  opened: number
  clicked: number
  sentAt: string | null
  tone: StatusTone
}

export type LiveCrmContact = {
  id: string
  account: string
  name: string
  jobTitle: string
  email: string
  phone: string
  owner: string
  status: string
  tone: StatusTone
  lastContactAt: string | null
}

export type LivePaperTrayItem = {
  id: string
  fileName: string
  documentType: string
  customer: string | null
  bookingReference: string | null
  status: string
  tone: StatusTone
  receivedAt: string
  confidence: number | null
  pageCount: number
  reviewNote: string | null
  mimeType: string
  fileSizeBytes: number
  url: string | null
}

export type LiveDexterContext = {
  id: string
  type: string
  title: string
  summary: string
  relatedReference: string | null
  status: string
  tone: StatusTone
  updatedAt: string
}

export type LiveNotification = { id: string; title: string; description: string; tone: StatusTone; occurredAt: string; readAt: string | null }

export type LiveQuoteCharge = {
  code: string
  description: string
  creditor: string
  costCurrency: string
  costAmount: number
  sellCurrency: string
  sellAmount: number
  department: string
}

export type LiveQuoteParty = {
  role: string
  code: string
  name: string
  address: string[]
  contactName: string | null
  contactEmail: string | null
  tone: StatusTone
}

export type LiveQuoteEvent = {
  id: string
  type: string
  summary: string
  actor: string
  occurredAt: string
  tone: StatusTone
}

function requireClient() {
  if (!supabase) throw new Error("This workspace is not connected to Supabase.")
  return supabase
}

export async function getCurrentOperatorName() {
  const { data, error } = await requireClient().auth.getUser()
  if (error || !data.user) throw error ?? new Error("Authentication required.")
  const metadata = data.user.user_metadata as Record<string, unknown>
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null
  return fullName ?? data.user.email ?? "Signed-in operator"
}

async function requireCompanyId() {
  const client = requireClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error("Authentication required.")
  const { data, error } = await client.from("cmp_Users").select("Company_ID").eq("Auth_User_ID", userData.user.id).single()
  if (error) throw error
  return data.Company_ID as string
}

const tones = new Set<StatusTone>(["neutral", "teal", "green", "amber", "red", "blue"])
function tone(value: unknown): StatusTone {
  return typeof value === "string" && tones.has(value as StatusTone) ? value as StatusTone : "neutral"
}

export async function listLiveBookings(): Promise<LiveBooking[]> {
  const { data, error } = await requireClient().from("App_Live_Bookings").select("*").order("Updated_At", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.Booking_Reference,
    customer: row.Customer_Name,
    route: row.Route,
    carrier: row.Carrier,
    container: row.Equipment,
    mode: row.Mode as BookingMode,
    value: row.Value_Display,
    eta: row.Eta_Display,
    time: row.Time_Display,
    status: row.Status as BookingStatus,
    progress: Number(row.Progress),
    owner: row.Owner_Code,
    tone: tone(row.Tone),
    invoice: row.Invoice_Reference,
    jobRef: row.Job_Reference,
    customerRef: row.Customer_Reference,
    supplierRef: row.Supplier_Reference,
    origin: row.Origin,
    destination: row.Destination,
    vessel: row.Vessel,
    departureDate: row.Departure_Date ?? "",
    arrivalDate: row.Arrival_Date ?? "",
    vin: row.Vin,
    direction: row.Direction as BookingDirection,
    shipmentType: row.Shipment_Type,
    isFavourite: Boolean(row.Is_Favourite),
    customFields: Array.isArray(row.Custom_Fields) ? row.Custom_Fields as { label: string; value: string }[] : [],
    updatedAt: row.Updated_At,
  }))
}

export async function getLiveBooking(reference: string) {
  const { data, error } = await requireClient().from("App_Live_Bookings").select("*").eq("Booking_Reference", reference).maybeSingle()
  if (error) throw error
  if (!data) return null
  const records = await listLiveBookings()
  return records.find((record) => record.id === reference) ?? null
}

export type CreateLiveBookingInput = {
  reference: string
  customer: string
  origin: string
  destination: string
  mode: BookingMode
  direction: BookingDirection
  shipmentType: string
  equipment: string
  carrier: string
  departureDate: string | null
  arrivalDate: string | null
  customerReference: string
  ownerCode: string
  provisional?: boolean
}

export async function createLiveBooking(input: CreateLiveBookingInput) {
  const companyId = await requireCompanyId()
  const { error } = await requireClient().from("Operations_Bookings").insert({
    Company_ID: companyId,
    Booking_Reference: input.reference,
    Customer_Name: input.customer,
    Route: `${input.origin} → ${input.destination}`,
    Carrier: input.carrier,
    Equipment: input.equipment,
    Mode: input.mode,
    Direction: input.direction,
    Shipment_Type: input.shipmentType,
    Value_Display: "",
    Eta_Display: input.arrivalDate ?? "Awaiting date",
    Time_Display: "",
    Status: input.provisional ? "Exception" : "On track",
    Progress: input.provisional ? 5 : 10,
    Owner_Code: input.ownerCode,
    Tone: input.provisional ? "amber" : "teal",
    Customer_Reference: input.customerReference,
    Job_Reference: input.reference.replace(/^MD-/, "JOB-"),
    Origin: input.origin,
    Destination: input.destination,
    Departure_Date: input.departureDate,
    Arrival_Date: input.arrivalDate,
    Custom_Fields: input.provisional ? [{ label: "Workflow", value: "Provisional booking" }] : [],
  })
  if (error) throw error
}

export async function listLiveRoadJobs(): Promise<DomesticRoadJob[]> {
  const { data, error } = await requireClient().from("App_Live_Bookings").select("*").eq("Mode", "ROAD").order("Updated_At", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: `RD-${String(row.Booking_Reference).replace(/\D/g, "").slice(-5)}`,
    bookingId: row.Booking_Reference,
    owner: row.Owner_Code,
    office: "Development",
    stage: (Number(row.Progress) < 30 ? "intake" : Number(row.Progress) < 50 ? "ready" : Number(row.Progress) < 60 ? "carrier" : Number(row.Progress) < 90 ? "live" : "close") as RoadJobStageId,
    customer: row.Customer_Name,
    reference: row.Customer_Reference,
    collection: row.Origin,
    delivery: row.Destination,
    timing: row.Eta_Display,
    service: row.Shipment_Type,
    carrier: row.Carrier,
    status: row.Status,
    tone: tone(row.Tone),
    margin: "",
    blocker: row.Status === "Exception" ? "Operator review required" : undefined,
  }))
}

export type CreateLiveRoadJobInput = {
  reference: string
  bookingReference: string
  customer: string
  customerReference: string
  collection: string
  delivery: string
  service: string
  timing: string
  ownerCode: string
}

export async function createLiveRoadJob(input: CreateLiveRoadJobInput) {
  const companyId = await requireCompanyId()
  const { error } = await requireClient().from("Operations_Road_Jobs").insert({
    Company_ID: companyId,
    Road_Job_Reference: input.reference,
    Booking_Reference: input.bookingReference,
    Owner_Code: input.ownerCode,
    Office_Name: "UK Distribution",
    Stage: "intake",
    Customer_Name: input.customer,
    Customer_Reference: input.customerReference,
    Collection: input.collection,
    Delivery: input.delivery,
    Timing: input.timing,
    Service: input.service,
    Carrier: "Not assigned",
    Status: "Needs planning",
    Tone: "amber",
    Margin_Display: "—",
  })
  if (error) throw error
}

export async function updateLiveRoadJobStage(reference: string, stage: RoadJobStageId) {
  const stagePresentation: Record<RoadJobStageId, { status: string; tone: StatusTone }> = {
    intake: { status: "Needs planning", tone: "amber" },
    ready: { status: "Plan now", tone: "teal" },
    carrier: { status: "Confirmation due", tone: "blue" },
    live: { status: "On track", tone: "green" },
    close: { status: "Cost check due", tone: "neutral" },
  }
  const presentation = stagePresentation[stage]
  const { error } = await requireClient()
    .from("Operations_Road_Jobs")
    .update({ Stage: stage, Status: presentation.status, Tone: presentation.tone, Updated_At: new Date().toISOString() })
    .eq("Road_Job_Reference", reference)
  if (error) throw error
}

export async function listLiveReports(): Promise<LiveReport[]> {
  const { data, error } = await requireClient().from("RPT_ReportRuns").select("RPTReportRun_ID,RPTReportRun_StatusCode,RPTReportRun_ParametersJSON,RPTReportRun_StartedAt,RPTReportRun_FinishedAt,RPTReportRun_CreatedAt,RPT_ReportDefinitions(RPTReport_Name,RPTReport_ModuleCode,RPTReport_Description)").order("RPTReportRun_CreatedAt", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => { const definition = Array.isArray(row.RPT_ReportDefinitions) ? row.RPT_ReportDefinitions[0] : row.RPT_ReportDefinitions; const status = String(row.RPTReportRun_StatusCode).replaceAll("_", " "); return ({ id: row.RPTReportRun_ID, title: definition?.RPTReport_Name ?? "Report", customer: null, type: definition?.RPTReport_ModuleCode ?? "Workspace", status, tone: status === "completed" ? "green" : status === "queued" ? "blue" : "amber", period: row.RPTReportRun_ParametersJSON?.period ?? "Current period", generatedAt: row.RPTReportRun_FinishedAt, scheduledFor: status === "queued" ? row.RPTReportRun_CreatedAt : null, summary: definition?.RPTReport_Description ?? "" }) })
}

export async function listLiveReportTemplates() {
  const { data, error } = await requireClient().from("RPT_ReportDefinitions").select("*").eq("RPTReport_IsActive", true).order("RPTReport_CreatedAt")
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.RPTReport_Code).toLowerCase().replaceAll("_", "-"),
    title: row.RPTReport_Name,
    description: row.RPTReport_Description ?? "",
    cadence: "On demand",
    format: "PDF",
    chart: "kpi" as const,
  }))
}

export async function loadLiveCrm() {
  const client = requireClient()
  const [opportunities, activities, campaigns, contacts] = await Promise.all([
    client.from("CRM_Opportunities").select("*").order("Updated_At", { ascending: false }),
    client.from("CRM_Activities").select("*").order("Occurred_At", { ascending: false }),
    client.from("CRM_Campaigns").select("*").order("Sent_At", { ascending: false, nullsFirst: true }),
    client.from("CRM_Contacts").select("*").order("Last_Contact_At", { ascending: false, nullsFirst: true }),
  ])
  if (opportunities.error) throw opportunities.error
  if (activities.error) throw activities.error
  if (campaigns.error) throw campaigns.error
  if (contacts.error) throw contacts.error
  return {
    opportunities: (opportunities.data ?? []).map((row): LiveCrmOpportunity => ({ id: row.Opportunity_Reference, account: row.Account_Name, contact: row.Contact_Name, stage: row.Stage, value: Number(row.Value_Amount), currency: row.Currency, probability: Number(row.Probability), owner: row.Owner_Name, nextAction: row.Next_Action, dueAt: row.Due_At, source: row.Source, tone: tone(row.Status_Tone) })),
    activities: (activities.data ?? []).map((row): LiveCrmActivity => ({ id: row.Activity_Reference, opportunityId: row.Opportunity_Reference, account: row.Account_Name, type: row.Activity_Type, subject: row.Subject, summary: row.Summary, owner: row.Owner_Name, occurredAt: row.Occurred_At, tone: tone(row.Tone) })),
    campaigns: (campaigns.data ?? []).map((row): LiveCrmCampaign => ({ id: row.Campaign_Reference, name: row.Name, status: row.Status, audience: Number(row.Audience_Count), delivered: Number(row.Delivered_Count), opened: Number(row.Opened_Count), clicked: Number(row.Clicked_Count), sentAt: row.Sent_At, tone: tone(row.Tone) })),
    contacts: (contacts.data ?? []).map((row): LiveCrmContact => ({ id: row.Contact_Reference, account: row.Account_Name, name: row.Contact_Name, jobTitle: row.Job_Title, email: row.Email, phone: row.Phone, owner: row.Owner_Name, status: row.Status, tone: tone(row.Tone), lastContactAt: row.Last_Contact_At })),
  }
}

export async function listLivePaperTrayItems(): Promise<LivePaperTrayItem[]> {
  const client = requireClient()
  const { data, error } = await client.from("DOC_StoredObjects").select("*").is("DOCStoredObject_DeletedAt", null).order("DOCStoredObject_CreatedAt", { ascending: false })
  if (error) throw error
  return Promise.all((data ?? []).map(async (row): Promise<LivePaperTrayItem> => {
    const signedUrl = await client.storage.from(row.DOCStoredObject_Container).createSignedUrl(row.DOCStoredObject_BlobName, 60 * 60)
    return {
      id: row.DOCStoredObject_ID,
      fileName: row.DOCStoredObject_OriginalFileName,
      documentType: row.DOCStoredObject_AggregateType ?? "Document",
      customer: null,
      bookingReference: null,
      status: row.DOCStoredObject_StatusCode ?? "active",
      tone: row.DOCStoredObject_StatusCode === "quarantined" ? "amber" : "teal",
      receivedAt: row.DOCStoredObject_CreatedAt,
      confidence: null,
      pageCount: 1,
      reviewNote: null,
      mimeType: row.DOCStoredObject_MimeType,
      fileSizeBytes: Number(row.DOCStoredObject_FileSizeBytes),
      url: signedUrl.error ? null : signedUrl.data.signedUrl,
    }
  }))
}

export async function listLiveDexterContext(): Promise<LiveDexterContext[]> {
  const { data, error } = await requireClient().from("AI_Dexter_Context_Items").select("*").order("Updated_At", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({ id: row.Context_Reference, type: row.Context_Type, title: row.Title, summary: row.Summary, relatedReference: row.Related_Reference, status: row.Status, tone: tone(row.Tone), updatedAt: row.Updated_At }))
}

export async function listLiveNotifications(): Promise<LiveNotification[]> {
  const { data, error } = await requireClient().from("App_Notifications").select("*").order("Occurred_At", { ascending: false }).limit(5)
  if (error) throw error
  return (data ?? []).map((row) => ({ id: row.Notification_Reference, title: row.Title, description: row.Description, tone: tone(row.Tone), occurredAt: row.Occurred_At, readAt: row.Read_At }))
}

export async function loadLiveQuoteDetail(reference: string) {
  const client = requireClient()
  const quote = await client.from("App_Live_Quotes").select("*").eq("Quote_Reference", reference).maybeSingle()
  if (quote.error) throw quote.error
  if (!quote.data) return { charges: [], parties: [], events: [] }
  const charges = await client.from("CusQuote_Lines").select("*").eq("CusQuoteHeader_ID", quote.data.CusQuoteHeader_ID).order("CusQuoteLine_Number")
  if (charges.error) throw charges.error
  return {
    charges: (charges.data ?? []).map((row): LiveQuoteCharge => ({ code: `LINE-${row.CusQuoteLine_Number}`, description: row.CusQuoteLine_Description, creditor: "Supplier pending", costCurrency: quote.data.Currency, costAmount: Number(row.CusQuoteLine_CostAmountLocal ?? 0), sellCurrency: quote.data.Currency, sellAmount: Number(row.CusQuoteLine_RevenueAmountLocal ?? 0), department: row.CusQuoteLine_InternalNotes ?? "Operations" })),
    parties: [{ role: "Customer", code: "CUSTOMER", name: quote.data.Customer_Name, address: [quote.data.Origin], contactName: null, contactEmail: null, tone: "teal" }] satisfies LiveQuoteParty[],
    events: [
      { id: `${reference}-updated`, type: "Updated", summary: `${reference} was reviewed in the canonical quote register.`, actor: quote.data.Sales_Owner, occurredAt: quote.data.Updated_At, tone: "blue" },
      { id: `${reference}-created`, type: "Created", summary: `${reference} was created for ${quote.data.Customer_Name}.`, actor: quote.data.Sales_Owner, occurredAt: quote.data.Created_At, tone: "green" },
    ] satisfies LiveQuoteEvent[],
  }
}
