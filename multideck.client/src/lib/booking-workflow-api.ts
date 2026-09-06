import { supabase } from "@/lib/supabase"

export type BookingWorkflowParty = {
  id?: string
  role: string
  organisationId?: string | null
  addressId?: string | null
  contactId?: string | null
  sequence?: number
  name?: string | null
  address?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  countryCode?: string | null
  identifierType?: string | null
  identifierValue?: string | null
  isPrimary?: boolean
  rawSnapshot?: Record<string, unknown>
}

export type BookingWorkflowCargo = {
  /** Vehicle carried as cargo, never the transporting truck's registration. */
  vin?: string | null
  id?: string
  lineNumber?: number
  description?: string | null
  knownCargo?: string | null
  commodity?: string | null
  pieces?: string | number | null
  packageType?: string | null
  packageQuantity?: string | number | null
  grossWeightKg?: string | number | null
  netWeightKg?: string | number | null
  volumeCbm?: string | number | null
  length?: string | number | null
  width?: string | number | null
  height?: string | number | null
  lengthUnit?: string | null
  hsCode?: string | null
  countryOfOrigin?: string | null
  declaredValue?: string | number | null
  declaredValueCurrency?: string | null
  isHazardous?: boolean
  isTemperatureControlled?: boolean
  cargoData?: Record<string, unknown>
}

export type BookingWorkflowContainer = {
  id?: string
  number?: string | null
  type?: string | null
  equipmentKind?: string | null
  status?: string | null
  packages?: string | number | null
  packageType?: string | null
  grossWeightKg?: string | number | null
  tareWeightKg?: string | number | null
  verifiedGrossMassKg?: string | number | null
  vgmMethod?: string | null
  reeferSetPoint?: string | number | null
  reeferUnit?: string | null
  volumeCbm?: string | number | null
  sealNumber?: string | null
  notes?: string | null
  data?: Record<string, unknown>
}

export type BookingCargoAllocation = {
  id: string
  cargoId: string
  containerId: string
  /** Null assigns equipment for the whole journey; otherwise one saved leg. */
  routeId: string | null
  packageQuantity: string | null
  grossWeightKg: string | null
  volumeCbm: string | null
  notes: string | null
  archived: boolean
}

export type BookingCargoAllocationState = {
  jobId: string
  updatedAt: string
  allocations: BookingCargoAllocation[]
  balances: {
    cargoId: string
    routeId: string | null
    remainingPackages: string | null
    remainingGrossWeightKg: string | null
    remainingVolumeCbm: string | null
  }[]
  /** Historical membership without known quantities or routing scope. */
  legacyUnquantifiedLinks: { cargoId: string; containerId: string }[]
}

export type BookingWorkflowRoute = {
  id?: string
  order?: number
  status?: string | null
  mode?: string | null
  origin?: string | null
  originUnlocode?: string | null
  originAddress?: string | null
  originTerminal?: string | null
  destination?: string | null
  destinationUnlocode?: string | null
  destinationAddress?: string | null
  destinationTerminal?: string | null
  plannedPickupAt?: string | null
  plannedDepartureAt?: string | null
  plannedArrivalAt?: string | null
  plannedDeliveryAt?: string | null
  cargoCutoffAt?: string | null
  documentationCutoffAt?: string | null
  vgmCutoffAt?: string | null
  carrierId?: string | null
  carrierBookingReference?: string | null
  masterTransportReference?: string | null
  houseTransportReference?: string | null
  serviceLevel?: string | null
  transportMeansName?: string | null
  vessel?: string | null
  voyageNumber?: string | null
  flightNumber?: string | null
  vehicleRegistration?: string | null
  trailerNumber?: string | null
  railService?: string | null
  isMainCarriage?: boolean
  routeData?: Record<string, unknown>
}

export type BookingWorkflowDocument = {
  id: string
  category?: "quote" | "job" | "customs" | null
  typeCode?: string | null
  title: string
  description?: string | null
  status?: string | null
  source?: string | null
  fileName?: string | null
  mimeType?: string | null
  fileSizeBytes?: number | null
  version?: string | number | null
  isCurrent?: boolean
  documentDate?: string | null
  receivedAt?: string | null
  createdAt?: string | null
  sourceRecordId?: string | null
  sourceReference?: string | null
  metadata?: Record<string, unknown> | null
}

export type BookingWorkflowDeclaration = {
  id: string
  direction: "import" | "export"
  status: string
  localReference?: string | null
  customsReference?: string | null
  mrn?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type BookingWorkflowCharge = {
  id?: string
  lineNumber?: number
  supplierId?: string | null
  description?: string | null
  internalNotes?: string | null
  customerNotes?: string | null
  costRoe?: number | null
  costAmount?: number | null
  costLocal?: number | null
  sellRoe?: number | null
  sellAmount?: number | null
  sellLocal?: number | null
  showToCustomer?: boolean
}

export type BookingWorkflowEvent = {
  id: string
  type: string
  summary: string
  metadata?: Record<string, unknown> | null
  occurredAt: string
  actor?: string | null
}

export type BookingWorkflowWorkspace = {
  routeCutoffsSupported?: boolean
  booking: {
    jobId: string
    bookingReference: string
    jobReference: string
    jobNumber: number
    status: string
    direction?: string | null
    mode?: string | null
    customerId?: string | null
    customerName?: string | null
    customerCode?: string | null
    carrierId?: string | null
    carrierName?: string | null
    supplierId?: string | null
    supplierName?: string | null
    officeId: string
    origin?: string | null
    originUnlocode?: string | null
    destination?: string | null
    destinationUnlocode?: string | null
    readyDate?: string | null
    requiredDeliveryDate?: string | null
    customerDeadline?: string | null
    predictedDeliveryAt?: string | null
    trackingStatus?: string | null
    currentLocation?: string | null
    internalNotes?: string | null
    incoterm?: string | null
    incotermLocation?: string | null
    freightChargeAmount?: number | null
    freightChargeCurrency?: string | null
    shipmentGoodsValue?: { amount: string | null; currency: string | null }
    collectionAddress?: string | null
    deliveryAddress?: string | null
    sourceQuoteId?: string | null
    sourceQuoteVersionId?: string | null
    sourceQuoteResponseId?: string | null
    sourceSnapshot?: Record<string, unknown>
    editableDetails?: Record<string, unknown>
    createdAt: string
    updatedAt: string
  }
  parties: BookingWorkflowParty[]
  cargo: BookingWorkflowCargo[]
  containers: BookingWorkflowContainer[]
  /** Missing on older deployments; never interpret absence as an empty plan. */
  cargoAllocationState?: BookingCargoAllocationState
  routes: BookingWorkflowRoute[]
  documents: BookingWorkflowDocument[]
  declarations: BookingWorkflowDeclaration[]
  charges: BookingWorkflowCharge[]
  events: BookingWorkflowEvent[]
  sourceQuote?: Record<string, unknown> | null
}

export type BookingCustomsReadinessItem = { key: string; label: string; section: string }
export type BookingCustomsReadiness = {
  eligible: boolean
  ready: boolean
  direction: string
  percent: number
  completeChecks: number
  totalChecks: number
  missing: BookingCustomsReadinessItem[]
  warnings: BookingCustomsReadinessItem[]
  evidence: Record<string, unknown>
}

export type BookingCustomsHandoff = {
  declarationId: string
  reference: string
  direction: "import" | "export"
  route: string
  canOpen: boolean
  reused: boolean
}

export type BookingQuoteSyncDifference = {
  key: string
  label: string
  section: string
  previousQuoteValue: unknown
  bookingValue: unknown
  newQuoteValue: unknown
  bookingChanged: boolean
  conflict: boolean
  requiresConfirmation: boolean
  warningCode?: "mode_change" | "booking_changed" | "booking_cargo_removed" | "cargo_removal" | null
  cargoDescription?: string
  blockedReason?: string
  reviewNote?: string
  recommendation: "apply" | "review"
}

export type BookingQuoteSyncReview = {
  reviewId: string
  reviewToken: string
  jobId: string
  quoteId: string
  quoteReference: string
  appliedVersionId?: string | null
  appliedVersionNumber?: number | null
  proposedVersionId: string
  proposedVersionNumber: number
  status: "pending" | "partially_applied"
  differences: BookingQuoteSyncDifference[]
  appliedFields: string[]
  createdAt: string
}

function requireClient() {
  if (!supabase) throw new Error("Bookings are unavailable until this workspace is connected.")
  return supabase
}

async function functionError(error: unknown, fallback: string) {
  const context = typeof error === "object" && error && "context" in error ? (error as { context?: unknown }).context : null
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown }
      if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error)
    } catch {
      // Preserve the product-safe fallback when the gateway has no JSON body.
    }
  }
  return error instanceof Error && error.message && !error.message.includes("non-2xx") ? error : new Error(fallback)
}

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await requireClient().functions.invoke<T>("bookings-workflow", { method: "POST", body })
  if (error) throw await functionError(error, fallback)
  if (data === undefined || data === null) throw new Error(fallback)
  return data
}

async function invokeNullable<T>(body: Record<string, unknown>, fallback: string): Promise<T | null> {
  const { data, error } = await requireClient().functions.invoke<T | null>("bookings-workflow", { method: "POST", body })
  if (error) throw await functionError(error, fallback)
  if (data === undefined) throw new Error(fallback)
  return data
}

export function openBookingWorkflow(idempotencyKey: string) {
  return invoke<{ jobId: string; bookingReference: string; route: string; reused: boolean }>({
    action: "open",
    idempotencyKey,
    sequenceKey: "default",
  }, "The new booking could not be opened.")
}

export function getBookingWorkflow(reference: string) {
  return invoke<BookingWorkflowWorkspace>({ action: "workspace", reference }, "The booking workspace could not be loaded.")
}

export function saveBookingWorkflow(jobId: string, booking: Record<string, unknown>) {
  return invoke<BookingWorkflowWorkspace>({ action: "save", jobId, booking }, "The booking could not be saved.")
}

export function getBookingQuoteSyncReview(jobId: string) {
  return invokeNullable<BookingQuoteSyncReview>({ action: "quote-sync-review", jobId }, "The accepted quote update could not be checked.")
}

export function applyBookingQuoteSync(jobId: string, reviewId: string, fields: string[], reviewToken: string, confirmModeChange = false) {
  return invoke<{ reviewId: string; status: "applied" | "partially_applied"; appliedFields: string[]; remainingFields: number; workspace: BookingWorkflowWorkspace }>({
    action: "apply-quote-sync",
    jobId,
    reviewId,
    fields,
    reviewToken,
    confirmModeChange,
  }, "The accepted quote update could not be applied.")
}

export function getBookingCustomsReadiness(jobId: string) {
  return invoke<BookingCustomsReadiness>({ action: "customs-readiness", jobId }, "Customs readiness could not be checked.")
}

export function sendBookingToCustoms(jobId: string, idempotencyKey: string) {
  return invoke<BookingCustomsHandoff>({ action: "send-to-customs", jobId, idempotencyKey }, "The booking could not be sent to Customs.")
}

export async function uploadBookingCustomsDocument(jobId: string, documentType: "commercial_invoice" | "packing_list", file: File) {
  const form = new FormData()
  form.set("action", "upload-document")
  form.set("jobId", jobId)
  form.set("documentType", documentType)
  form.set("idempotencyKey", crypto.randomUUID())
  form.set("file", file)
  const { data, error } = await requireClient().functions.invoke<{ documentId: string; fileName: string; documentType: string }>("bookings-workflow", {
    method: "POST",
    body: form,
  })
  if (error) throw await functionError(error, "The booking document could not be attached.")
  if (!data) throw new Error("The booking document could not be attached.")
  return data
}
