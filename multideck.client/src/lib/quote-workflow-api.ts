import { supabase } from "@/lib/supabase"

export type QuoteSourceOption = {
  id: string
  type: "lead" | "account"
  label: string
  detail: string
  contactName?: string | null
  contactEmail?: string | null
}

export type QuoteSupplierOption = { id: string; name: string }
export type QuoteOrganisationOption = QuoteSupplierOption & {
  code: string
  types: string[]
  addresses: Array<{ id: string; label: string; address: string; email?: string | null; phone?: string | null }>
  contacts: Array<{ id: string; name: string; email?: string | null }>
}
export type QuoteLookupOption = { id: string; name: string; code?: string }
export type QuoteCodeOption = { code: string; name: string }
export type QuotePartyDraft = { orgId?: string | null; name: string; address?: string | null; contact?: string | null }

export type QuoteWorkflowCharge = {
  id: string
  description: string
  supplierId?: string | null
  costCurrency: string
  costAmount: number
  costLocal: number
  costRoe: number
  sellCurrency: string
  sellAmount: number
  sellLocal: number
  sellRoe: number
  calculationBasis: string
  quantity: number
  minimumAmount?: number | null
  defaultMarkupPct?: number | null
  appliedMarkupPct?: number | null
  markupOverrideReason?: string | null
  sourceLabel?: string | null
  internalNotes?: string | null
  customerNotes?: string | null
  showToCustomer: boolean
}

export type QuoteWorkflowRecord = {
  id: string
  reference: string
  lifecycle: string
  sourceType: "lead" | "account"
  sourceId: string
  customerId: string
  customerName: string
  contactId?: string | null
  contactName?: string | null
  contactEmail?: string | null
  customerReference?: string | null
  officeId?: string | null
  departmentId?: string | null
  salesOwnerId?: string | null
  direction?: string | null
  mode?: string | null
  shipmentType?: string | null
  serviceLevel?: string | null
  currency?: string | null
  collectionAddress?: string | null
  loadingPoint?: string | null
  dischargePoint?: string | null
  deliveryAddress?: string | null
  incoterm?: string | null
  validFrom?: string | null
  validTo?: string | null
  deadline?: string | null
  supplierId?: string | null
  supplierName?: string | null
  carrierId?: string | null
  carrierName?: string | null
  shipmentFacts: Record<string, unknown>
  customerNotes?: string | null
  internalNotes?: string | null
  terms?: string | null
  rateSourceType?: string | null
  rateSourceLabel?: string | null
  defaultMarkupPct: number
  markupOverrideReason?: string | null
  followUpAt?: string | null
  outcomeNotes?: string | null
  acceptedVersionId?: string | null
  shipper?: QuotePartyDraft | null
  consignee?: QuotePartyDraft | null
}

export type QuoteWorkflowVersion = {
  CusQuoteVersion_ID: string
  CusQuoteVersion_Number: number
  CusQuoteVersion_StatusCode: string
  CusQuoteVersion_IsCurrent: boolean
  CusQuoteVersion_CreatedAt: string
  CusQuoteVersion_IssuedAt?: string | null
  CusQuoteVersion_GeneratedDocumentID?: string | null
  DOCB_GeneratedDocuments?: {
    DOCBGD_ID: string
    DOCBGD_FileName: string
    DOCBGD_MimeType: string
    DOCBGD_FileSizeBytes: number
    DOCBGD_OutputFormatCode: string
    DOCBGD_CreatedAt: string
  } | null
}

export type QuoteWorkflowEvent = {
  CusQuoteEvent_ID: string
  CusQuoteEvent_TypeCode: string
  CusQuoteEvent_Summary: string
  CusQuoteEvent_OccurredAt: string
  cmp_Users?: { User_Firstname?: string; User_Lastname?: string } | null
}

export type QuoteWorkflowWorkspace = {
  quote: QuoteWorkflowRecord
  charges: QuoteWorkflowCharge[]
  totals: { cost: number; sell: number; profit: number; marginPct: number | null }
  versions: QuoteWorkflowVersion[]
  events: QuoteWorkflowEvent[]
}

export type QuoteSavePayload = Omit<QuoteWorkflowRecord, "id" | "reference" | "lifecycle" | "customerId" | "acceptedVersionId" | "outcomeNotes"> & {
  customerId?: string
  charges: QuoteWorkflowCharge[]
}

export type QuoteWorkflowSources = {
  sources: QuoteSourceOption[]
  organisations: QuoteOrganisationOption[]
  suppliers: QuoteSupplierOption[]
  carriers: QuoteSupplierOption[]
  offices: QuoteLookupOption[]
  departments: QuoteLookupOption[]
  users: Array<QuoteLookupOption & { email: string }>
  modes: QuoteCodeOption[]
  shipmentTypes: QuoteCodeOption[]
  currencies: Array<QuoteCodeOption & { id: string }>
  commodities: Array<QuoteCodeOption & { id: string }>
}

export type QuoteReferenceSettings = {
  quotePrefix: string
  bookingPrefix: string
}

function requireClient() {
  if (!supabase) throw new Error("Quotes are unavailable until this workspace is connected.")
  return supabase
}

async function functionError(error: unknown, fallback: string) {
  const context = typeof error === "object" && error && "context" in error ? (error as { context?: unknown }).context : null
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown }
      if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error)
    } catch {
      // Keep the safe fallback when the gateway returned no JSON.
    }
  }
  return error instanceof Error && error.message && !error.message.includes("non-2xx") ? error : new Error(fallback)
}

async function invoke<T>(body: Record<string, unknown>, fallback: string) {
  const { data, error } = await requireClient().functions.invoke<T>("quotes-workflow", { method: "POST", body })
  if (error) throw await functionError(error, fallback)
  if (!data) throw new Error(fallback)
  return data
}

export function getQuoteSources() {
  return invoke<QuoteWorkflowSources>({ action: "sources" }, "Quote sources could not be loaded.")
}

export function openQuoteWorkflow() {
  return invoke<{ quoteId: string; reference: string; lifecycle: string }>({ action: "open" }, "The new quote could not be opened.")
}

export function getQuoteReferenceSettings() {
  return invoke<QuoteReferenceSettings>({ action: "reference-settings" }, "Quote reference settings could not be loaded.")
}

export function saveQuoteReferenceSettings(settings: QuoteReferenceSettings) {
  return invoke<QuoteReferenceSettings>({ action: "save-reference-settings", ...settings }, "Quote reference settings could not be saved.")
}

export function getQuoteWorkflow(reference: string) {
  return invoke<QuoteWorkflowWorkspace>({ action: "workspace", reference }, "The quote workspace could not be loaded.")
}

export function saveQuoteWorkflow(quoteId: string | null, quote: QuoteSavePayload) {
  return invoke<{ quoteId: string; reference: string; lifecycle: string }>({ action: "save", quoteId, quote }, "The quote could not be saved.")
}

export function transitionQuoteWorkflow(quoteId: string, transition: "calculated" | "sent" | "revised" | "accepted" | "declined" | "ghosted", note?: string, followUpAt?: string) {
  return invoke<{ quoteId: string; lifecycle: string; versionId?: string | null }>({ action: "transition", quoteId, transition, note, followUpAt }, "The quote action could not be completed.")
}

/** @deprecated Quote-to-booking is the next delivery phase and is not active. */
export function convertQuoteWorkflow(_quoteId: string, _readiness: { shipperId?: string; shipperName: string; consigneeId?: string; consigneeName: string; operationalNotes?: string }, _idempotencyKey = crypto.randomUUID()): Promise<{ quoteId: string; bookingId: string; bookingReference: string; reused: boolean }> {
  return Promise.reject(new Error("Quote-to-booking is not active yet."))
}

/** @deprecated Quote document generation remains owned by the document-builder workflow. */
export function downloadQuoteDocument(_generatedDocumentId: string): Promise<{ signedUrl: string; fileName: string; expiresAt: string }> {
  return Promise.reject(new Error("Quote document generation is not active in this workspace yet."))
}
