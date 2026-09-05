import type { StatusTone } from "@/data/operational-data"
import type { DomesticRoadJob, RoadJobStageId } from "@/components/multideck/domestic-road-components"
import { createEmptyFilterQuery, filterQueryIsEmpty, type FilterQuery } from "@/lib/advanced-filters"
import { authSupabase, getClientAuth, authenticatedAccessChangedEvent, getSupabaseSession, supabase, supabaseFunctionsUrl } from "@/lib/supabase"

type BookingMode = "OCEAN" | "AIR" | "ROAD" | "RAIL" | "MULTIMODAL" | "FAS" | "FSA"
type BookingStatus = "On track" | "Delayed" | "Exception"
type BookingDirection = "Import" | "Export" | "Domestic" | "Cross trade" | "Direction needed"

export type LiveBooking = {
  sourceId: string
  id: string
  customer: string
  route: string
  carrier: string
  container: string
  mode: BookingMode
  value: string
  eta: string
  time: string
  currentLocation: string
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
  departureAt: string
  arrivalAt: string
  vin: string
  direction: BookingDirection
  shipmentType: string
  isFavourite: boolean
  customFields: { label: string; value: string }[]
  updatedAt: string
}

export type RegisterSort = { id: string; direction: "asc" | "desc" }

export type BookingRegisterSummary = {
  active: number
  inTransit: number
  atDestination: number
  exceptions: number
  complete: number
  total: number
}

export type BookingRegisterPage = {
  rows: LiveBooking[]
  total: number
  summary: BookingRegisterSummary
}

export type BookingRegisterInput = {
  search?: string
  scope: "All Jobs" | "My Jobs" | "Staged Jobs"
  operatorCode?: string
  direction?: string
  mode?: string
  shipmentType?: string
  filterQuery: FilterQuery
  sort?: RegisterSort | null
  limit: number
  offset: number
}

type RegisterCacheEntry<T> = {
  value?: T
  expiresAt: number
  inFlight?: Promise<T>
  controller?: AbortController
  consumers: Set<symbol>
  lastAccessedAt: number
}

const REGISTER_CACHE_TTL_MS = 15_000
const REGISTER_CACHE_MAX_ENTRIES = 64
const registerPageCache = new Map<string, RegisterCacheEntry<unknown>>()

function registerAbortError() {
  return typeof DOMException === "undefined"
    ? Object.assign(new Error("The register request was cancelled."), { name: "AbortError" })
    : new DOMException("The register request was cancelled.", "AbortError")
}

function pruneRegisterPageCache() {
  const completed = [...registerPageCache.entries()]
    .filter(([, entry]) => !entry.inFlight)
    .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)
  for (const [key] of completed.slice(0, Math.max(0, completed.length - REGISTER_CACHE_MAX_ENTRIES))) {
    registerPageCache.delete(key)
  }
}

/** Shares identical bounded reads while keeping abort ownership with active consumers. */
export function readCachedRegisterPage<T>(
  scope: string,
  resource: string,
  load: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(registerAbortError())

  const key = `${supabaseFunctionsUrl}:${scope}\u0000${resource}`
  const now = Date.now()
  let entry = registerPageCache.get(key) as RegisterCacheEntry<T> | undefined
  if (entry?.value !== undefined && entry.expiresAt > now) {
    entry.lastAccessedAt = now
    return Promise.resolve(entry.value)
  }

  if (!entry?.inFlight) {
    const controller = new AbortController()
    const next: RegisterCacheEntry<T> = { expiresAt: 0, controller, consumers: new Set(), lastAccessedAt: now }
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)
    const inFlight = load(controller.signal)
      .then((value) => {
        globalThis.clearTimeout(timeoutId)
        if (controller.signal.aborted || registerPageCache.get(key) !== next) throw registerAbortError()
        registerPageCache.set(key, {
          value,
          expiresAt: Date.now() + REGISTER_CACHE_TTL_MS,
          consumers: new Set(),
          lastAccessedAt: Date.now(),
        })
        pruneRegisterPageCache()
        return value
      })
      .catch((error) => {
        globalThis.clearTimeout(timeoutId)
        if (registerPageCache.get(key) === next) registerPageCache.delete(key)
        throw error
      })
    next.inFlight = inFlight
    registerPageCache.set(key, next)
    entry = next
  }

  const activeEntry = entry
  const consumer = Symbol(resource)
  activeEntry.consumers.add(consumer)

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const release = () => {
      activeEntry.consumers.delete(consumer)
      signal?.removeEventListener("abort", abort)
    }
    const abort = () => {
      if (settled) return
      settled = true
      release()
      queueMicrotask(() => {
        if (activeEntry.inFlight && activeEntry.consumers.size === 0) activeEntry.controller?.abort()
      })
      reject(registerAbortError())
    }
    signal?.addEventListener("abort", abort, { once: true })
    activeEntry.inFlight!.then(
      (value) => {
        if (settled) return
        settled = true
        release()
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        release()
        reject(error)
      },
    )
  })
}

export function invalidateRegisterPages(resourcePrefix: string) {
  for (const [key, entry] of registerPageCache) {
    if (!key.split("\u0000", 2)[1]?.startsWith(resourcePrefix)) continue
    entry.controller?.abort()
    registerPageCache.delete(key)
  }
}

if (typeof window !== "undefined") window.addEventListener(authenticatedAccessChangedEvent, () => invalidateRegisterPages(""))

export async function setLiveJobStarred(bookingReference: string, starred: boolean) {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to update starred jobs.")
  const { error } = await requireClient().rpc("multideck_set_job_starred", {
    p_booking_reference: bookingReference,
    p_starred: starred,
  })
  if (error) throw error
  invalidateRegisterPages("bookings:")
  invalidateRegisterPages("dashboard:")
  invalidateRegisterPages("road-control:")
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
  const { data, error } = await authSupabase!.auth.getUser()
  if (error || !data.user) throw error ?? new Error("Authentication required.")
  const metadata = data.user.user_metadata as Record<string, unknown>
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null
  return fullName ?? data.user.email ?? "Signed-in operator"
}

async function requireCompanyId() {
  const client = requireClient()
  const { data: userData, error: userError } = await getClientAuth(client).getUser()
  if (userError || !userData.user) throw userError ?? new Error("Authentication required.")
  const { data, error } = await client.from("cmp_Users").select("Company_ID").eq("Auth_User_ID", userData.user.id).single()
  if (error) throw error
  return data.Company_ID as string
}

const tones = new Set<StatusTone>(["neutral", "teal", "green", "amber", "red", "blue", "orange", "purple"])
function tone(value: unknown): StatusTone {
  return typeof value === "string" && tones.has(value as StatusTone) ? value as StatusTone : "neutral"
}

function bookingMode(value: unknown): BookingMode {
  const normalized = String(value ?? "ROAD").trim().toUpperCase()
  if (normalized === "SEA") return "OCEAN"
  if (["OCEAN", "AIR", "ROAD", "MULTIMODAL", "FAS", "FSA"].includes(normalized)) return normalized as BookingMode
  return "ROAD"
}

function toLiveBooking(row: Record<string, unknown>): LiveBooking {
  return {
    sourceId: String(row.Job_ID ?? ""),
    id: String(row.Booking_Reference),
    customer: String(row.Customer_Name ?? ""),
    route: String(row.Route ?? ""),
    carrier: String(row.Carrier ?? ""),
    container: String(row.Equipment ?? ""),
    mode: bookingMode(row.Mode),
    value: String(row.Value_Display ?? ""),
    eta: String(row.Eta_Display ?? ""),
    time: String(row.Time_Display ?? ""),
    currentLocation: String(row.Time_Display ?? ""),
    status: row.Status as BookingStatus,
    progress: Number(row.Progress ?? 0),
    owner: String(row.Owner_Code ?? ""),
    tone: tone(row.Tone),
    invoice: String(row.Invoice_Reference ?? ""),
    jobRef: String(row.Job_Reference ?? ""),
    customerRef: String(row.Customer_Reference ?? ""),
    supplierRef: String(row.Supplier_Reference ?? ""),
    origin: String(row.Origin ?? ""),
    destination: String(row.Destination ?? ""),
    vessel: String(row.Vessel ?? ""),
    departureDate: String(row.Departure_Date ?? ""),
    arrivalDate: String(row.Arrival_Date ?? ""),
    departureAt: String(row.Departure_At ?? row.Departure_Date ?? ""),
    arrivalAt: String(row.Arrival_At ?? row.Arrival_Date ?? ""),
    vin: String(row.Vin ?? ""),
    direction: row.Direction as BookingDirection,
    shipmentType: String(row.Shipment_Type ?? ""),
    isFavourite: Boolean(row.Is_Favourite),
    customFields: Array.isArray(row.Custom_Fields) ? row.Custom_Fields as { label: string; value: string }[] : [],
    updatedAt: String(row.Updated_At ?? ""),
  }
}

const dashboardBookingCompatibilityColumns = [
  "Job_ID", "Booking_Reference", "Customer_Name", "Route", "Carrier", "Equipment", "Mode",
  "Value_Display", "Eta_Display", "Time_Display", "Status", "Progress", "Owner_Code", "Tone",
  "Invoice_Reference", "Job_Reference", "Customer_Reference", "Supplier_Reference", "Origin",
  "Destination", "Vessel", "Departure_Date", "Arrival_Date", "Departure_At", "Arrival_At", "Vin",
  "Direction", "Shipment_Type", "Is_Favourite", "Custom_Fields", "Updated_At",
].join(",")

/**
 * Migration-drift bridge for the dashboard only. It deliberately asks for one
 * row beyond the 50-row dashboard ceiling so callers can refuse to calculate
 * misleading totals without ever downloading a complete booking register.
 */
export async function listLiveBookingsCompatibilitySample(signal?: AbortSignal): Promise<LiveBooking[]> {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to view bookings.")
  let query = requireClient()
    .from("App_Live_Bookings")
    .select(dashboardBookingCompatibilityColumns)
    .order("Updated_At", { ascending: false, nullsFirst: false })
    .limit(51)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => toLiveBooking(row as unknown as Record<string, unknown>))
}

export async function listLiveBookingsPage(input: BookingRegisterInput, signal?: AbortSignal): Promise<BookingRegisterPage> {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to view bookings.")

  const normalizedInput = {
    ...input,
    search: input.search?.trim() || undefined,
    direction: input.direction?.trim() || undefined,
    mode: input.mode?.trim() || undefined,
    shipmentType: input.shipmentType?.trim() || undefined,
    filterQuery: filterQueryIsEmpty(input.filterQuery) ? null : input.filterQuery,
    limit: Math.max(1, Math.min(input.limit, 50)),
    offset: Math.max(0, input.offset),
  }
  const resource = `bookings:page:${JSON.stringify(normalizedInput)}`
  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await requireClient().rpc("multideck_booking_register_page", {
      p_search: normalizedInput.search ?? null,
      p_scope: normalizedInput.scope,
      p_operator_code: normalizedInput.operatorCode?.trim() || null,
      p_direction: normalizedInput.direction ?? null,
      p_mode: normalizedInput.mode ?? null,
      p_shipment_type: normalizedInput.shipmentType ?? null,
      p_filter_query: normalizedInput.filterQuery,
      p_sort: normalizedInput.sort?.id ?? "customerCargo",
      p_sort_direction: normalizedInput.sort?.direction ?? "asc",
      p_limit: normalizedInput.limit,
      p_offset: normalizedInput.offset,
    }).abortSignal(requestSignal)
    if (error) throw error

    const response = (data ?? {}) as Record<string, unknown>
    const summary = (response.summary ?? {}) as Record<string, unknown>
    return {
      rows: Array.isArray(response.rows) ? response.rows.map((row) => toLiveBooking(row as Record<string, unknown>)) : [],
      total: Number(response.total ?? 0),
      summary: {
        active: Number(summary.active ?? 0),
        inTransit: Number(summary.inTransit ?? 0),
        atDestination: Number(summary.atDestination ?? 0),
        exceptions: Number(summary.exceptions ?? 0),
        complete: Number(summary.complete ?? 0),
        total: Number(summary.total ?? 0),
      },
    }
  }, signal)
}

export async function getLiveBooking(reference: string): Promise<LiveBooking | null> {
  const normalizedReference = reference.trim().toUpperCase()
  if (!normalizedReference) return null

  const { data, error } = await requireClient().from("App_Live_Bookings").select("*").eq("Booking_Reference", normalizedReference).maybeSingle()
  if (error) throw error
  return data ? toLiveBooking(data as Record<string, unknown>) : null
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
  invalidateRegisterPages("bookings:")
  invalidateRegisterPages("dashboard:")
}

export type RoadControlCounts = Record<RoadJobStageId, number>

export type RoadControlPage = {
  rows: DomesticRoadJob[]
  counts: RoadControlCounts
  total: number
  filteredTotal: number
  limit: number
  offset: number
  favouriteBookingIds: string[]
}

export type RoadControlInput = {
  scope: "All Jobs" | "My Jobs" | "Starred Jobs"
  operatorCode?: string
  stage?: RoadJobStageId
  limit?: number
  offset?: number
}

function roadStage(progress: unknown): RoadJobStageId {
  const value = Number(progress ?? 0)
  return value < 30 ? "intake" : value < 50 ? "ready" : value < 60 ? "carrier" : value < 90 ? "live" : "close"
}

function toDomesticRoadJob(row: Record<string, unknown>): DomesticRoadJob {
  return {
    id: `RD-${String(row.Booking_Reference).replace(/\D/g, "").slice(-5)}`,
    bookingId: String(row.Booking_Reference ?? ""),
    owner: String(row.Owner_Code ?? ""),
    office: "Development",
    stage: (row.road_stage as RoadJobStageId | undefined) ?? roadStage(row.Progress),
    customer: String(row.Customer_Name ?? ""),
    reference: String(row.Customer_Reference ?? ""),
    collection: String(row.Origin ?? ""),
    delivery: String(row.Destination ?? ""),
    timing: String(row.Eta_Display ?? ""),
    service: String(row.Shipment_Type ?? ""),
    carrier: String(row.Carrier ?? ""),
    status: String(row.Status ?? ""),
    tone: tone(row.Tone),
    margin: "",
    blocker: row.Status === "Exception" ? "Operator review required" : undefined,
  }
}

function missingRoadControlReadModel(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === "42883" || error.code === "PGRST202") return true
  const message = (error.message ?? "").toLowerCase()
  return message.includes("multideck_road_control_page") && (message.includes("does not exist") || message.includes("schema cache"))
}

function emptyRoadCounts(): RoadControlCounts {
  return { intake: 0, ready: 0, carrier: 0, live: 0, close: 0 }
}

const roadControlCompatibilityFilterQuery = createEmptyFilterQuery()
const roadControlCompatibilityLimit = 50

async function legacyRoadControlPage(input: Required<Pick<RoadControlInput, "scope" | "limit" | "offset">> & RoadControlInput, signal: AbortSignal): Promise<RoadControlPage> {
  const page = await listLiveBookingsPage({
    scope: input.scope === "My Jobs" ? "My Jobs" : "All Jobs",
    operatorCode: input.operatorCode,
    mode: "ROAD",
    filterQuery: roadControlCompatibilityFilterQuery,
    sort: { id: "ownerActivity", direction: "desc" },
    limit: roadControlCompatibilityLimit,
    offset: 0,
  }, signal)

  if (page.total > page.rows.length) {
    throw new Error("Road Control needs its bounded read-model update before this workspace can safely load more than 50 road bookings.")
  }

  const scoped = page.rows.filter((row) => {
    if (input.scope === "My Jobs") return row.owner === (input.operatorCode?.trim() ?? "")
    if (input.scope === "Starred Jobs") return row.isFavourite
    return true
  })
  const counts = emptyRoadCounts()
  for (const row of scoped) counts[roadStage(row.progress)] += 1
  const selected = input.stage
    ? scoped.filter((row) => roadStage(row.progress) === input.stage).slice(input.offset, input.offset + input.limit)
    : Object.keys(counts).flatMap((stage) => scoped.filter((row) => roadStage(row.progress) === stage).slice(0, input.limit))

  return {
    rows: selected.map((row) => toDomesticRoadJob({
      Booking_Reference: row.id,
      Owner_Code: row.owner,
      road_stage: roadStage(row.progress),
      Customer_Name: row.customer,
      Customer_Reference: row.customerRef,
      Origin: row.origin,
      Destination: row.destination,
      Eta_Display: row.eta,
      Shipment_Type: row.shipmentType,
      Carrier: row.carrier,
      Status: row.status,
      Tone: row.tone,
    })),
    counts,
    total: scoped.length,
    filteredTotal: input.stage ? counts[input.stage] : scoped.length,
    limit: input.limit,
    offset: input.stage ? input.offset : 0,
    favouriteBookingIds: selected.filter((row) => row.isFavourite).map((row) => row.id),
  }
}

export async function listRoadControlPage(input: RoadControlInput, signal?: AbortSignal): Promise<RoadControlPage> {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to view road jobs.")

  const normalizedInput = {
    ...input,
    scope: input.scope,
    operatorCode: input.operatorCode?.trim() || undefined,
    limit: Math.max(1, Math.min(input.limit ?? 20, 50)),
    offset: Math.max(0, input.offset ?? 0),
  }
  const resource = `road-control:page:${JSON.stringify(normalizedInput)}`
  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await requireClient().rpc("multideck_road_control_page", {
      p_scope: normalizedInput.scope,
      p_operator_code: normalizedInput.operatorCode ?? null,
      p_stage: normalizedInput.stage ?? null,
      p_limit: normalizedInput.limit,
      p_offset: normalizedInput.offset,
    }).abortSignal(requestSignal)

    if (error) {
      if (!missingRoadControlReadModel(error)) throw error
      // A narrowly gated compatibility path keeps a frontend-first rollout usable.
      // It disappears automatically as soon as the bounded RPC reaches the tenant.
      return legacyRoadControlPage(normalizedInput, requestSignal)
    }

    const response = (data ?? {}) as Record<string, unknown>
    const counts = (response.counts ?? {}) as Record<string, unknown>
    const sourceRows = Array.isArray(response.rows) ? response.rows as Record<string, unknown>[] : []
    return {
      rows: sourceRows.map(toDomesticRoadJob),
      counts: {
        intake: Number(counts.intake ?? 0),
        ready: Number(counts.ready ?? 0),
        carrier: Number(counts.carrier ?? 0),
        live: Number(counts.live ?? 0),
        close: Number(counts.close ?? 0),
      },
      total: Number(response.total ?? 0),
      filteredTotal: Number(response.filteredTotal ?? 0),
      limit: Number(response.limit ?? normalizedInput.limit),
      offset: Number(response.offset ?? normalizedInput.offset),
      favouriteBookingIds: sourceRows.filter((row) => Boolean(row.Is_Favourite)).map((row) => String(row.Booking_Reference ?? "")),
    }
  }, signal)
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
