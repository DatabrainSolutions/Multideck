import { authenticatedAccessChangedEvent, getSupabaseSession, supabase, supabaseFunctionsUrl } from "@/lib/supabase"
import { invalidateRegisterPages } from "@/lib/application-data-api"
import { captureAuthenticatedScope, invalidateCachedCrmResources, readCachedCrmResource } from "@/lib/crm-read-cache"
import { intelligenceFromRealtimeRow } from "@/lib/quote-intelligence-snapshot"
import { createQuoteSaveQueue } from "@/lib/quote-save-queue"

export type QuoteSourceOption = {
  id: string
  type: "lead" | "account"
  label: string
  detail: string
  contactName?: string | null
  contactEmail?: string | null
}

export type QuoteSupplierOption = { id: string; name: string }
export type QuoteOrganisationAddress = {
  id: string
  label: string
  address: string
  line1?: string | null
  line2?: string | null
  townCity?: string | null
  countyState?: string | null
  postcode?: string | null
  country?: string | null
  countryCode?: string | null
  unlocode?: string | null
  email?: string | null
  phone?: string | null
}
export type QuoteOrganisationContact = {
  id: string
  name: string
  email?: string | null
  emails: string[]
  role?: string | null
  isOperational: boolean
}
export type QuoteRelatedPartyRecommendation = {
  id: string
  role: string
  organisationId: string
  addressId?: string | null
  contactId?: string | null
  priority: number
  source: "saved_default" | "quote_history"
  usageCount: number
  lastUsedAt?: string | null
  destinationCountryCode?: string | null
  destinationUnlocode?: string | null
  destinationPostcode?: string | null
  evidence: {
    sourceTable: "Org_RelatedPartyDefaults" | "CusQuote_Parties"
    sourceId: string
  }
}
export type QuoteOrganisationOption = QuoteSupplierOption & {
  code: string
  types: string[]
  addresses: QuoteOrganisationAddress[]
  contacts: QuoteOrganisationContact[]
  relatedPartyRecommendations: QuoteRelatedPartyRecommendation[]
  quoteTerms?: {
    terms: string
    subjectTo: string
    notes: string
    deadline: string
  } | null
}
export type QuoteLookupOption = { id: string; name: string; code?: string }
export type QuoteCodeOption = { code: string; name: string }
export type QuoteCountryOption = { code: string; name: string; alpha3?: string | null }
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
  CusQuoteEvent_MetadataJSON?: { message?: string | null; competitorDocumentId?: string | null } | null
  cmp_Users?: { User_Firstname?: string; User_Lastname?: string } | null
}

export type QuoteWorkflowCustomerResponse = {
  decision: "accepted" | "declined" | "challenged"
  message: string | null
  respondedAt: string
  attachment: null | {
    id: string
    fileName: string
    mimeType: string
    fileSizeBytes: number
    createdAt: string
    url: string | null
    expiresAt: string | null
  }
}

export type QuoteIntelligenceState = "ready" | "building_baseline" | "updating" | "rules_only" | "unavailable"
export type QuoteIntelligenceMetricState = "ready" | "insufficient_evidence" | "missing_input"
export type QuoteIntelligenceCohort = "customer_lane_mode_shipment" | "customer_mode" | "tenant_lane_mode" | "tenant_mode" | "tenant_history"

export type QuoteIntelligenceMetric<T> = {
  status: QuoteIntelligenceMetricState
  value: T | null
  evidenceCount: number
  cohort: QuoteIntelligenceCohort
  confidence: number
  reasonCode: string
}

export type QuoteIntelligenceRecentQuote = {
  id: string
  reference: string
  date: string
  lane: string
  mode: string
  revenue: number | null
  cost: number | null
  profit: number | null
  marginPct: number | null
  status: "Won" | "Lost" | "Pending"
}

export type QuoteIntelligenceSnapshot = {
  state: QuoteIntelligenceState
  currency: string
  algorithmVersion: string
  inputFingerprint: string
  evidenceFingerprint: string
  aiEligible: boolean
  calculatedAt: string | null
  aiGeneratedAt: string | null
  aiNextEligibleAt: string | null
  ai: null | {
    status: "applied" | "pending" | "rules_only"
    adjustmentPoints: number
    inputFingerprint: string
    reasonCodes: string[]
    cardExplanations: Record<string, string>
    model: string
    promptVersion: string
    generatedAt: string
  }
  metrics: {
    historicalWinRate: QuoteIntelligenceMetric<{ ratePct: number | null; wins: number; losses: number; pending: number; lowEvidence: boolean }>
    wonPriceBand: QuoteIntelligenceMetric<{ low: number; high: number; median: number; averageMarginPct: number | null }>
    suggestedPitch: QuoteIntelligenceMetric<{ amount: number; cost: number; profit: number }>
    marginHeadroom: QuoteIntelligenceMetric<{ amount: number }>
    priceConfidence: QuoteIntelligenceMetric<{ score: number }>
    aiWinLikelihood: QuoteIntelligenceMetric<{ basePct: number; finalPct: number; adjustmentPoints: number }>
    aiTemperature: QuoteIntelligenceMetric<{ baseScore: number; score: number; label: "Cold" | "Warm" | "Hot" }>
  }
  recentQuotes: QuoteIntelligenceRecentQuote[]
}

export type QuoteWorkflowWorkspace = {
  quote: QuoteWorkflowRecord
  charges: QuoteWorkflowCharge[]
  totals: { cost: number; sell: number; profit: number; marginPct: number | null }
  versions: QuoteWorkflowVersion[]
  events: QuoteWorkflowEvent[]
  customerResponse: QuoteWorkflowCustomerResponse | null
  latestIssue: null | {
    responseLinkId: string
    quoteDocumentId: string | null
    deliveryMode: QuoteDeliveryMode
    responseControlsEnabled: boolean
    recipientSource: "saved" | "manual"
    recipientName: string | null
    recipientEmail: string
    deliveryStatus: "pending" | "sent" | "failed"
    responseStatus: "active" | "responded" | "expired" | "revoked"
    createdAt: string
  }
  linkedBooking: null | {
    jobId: string
    bookingReference: string
    status: string
    requiresCustomerLink: boolean
  }
  intelligence: QuoteIntelligenceSnapshot | null
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
  agents: QuoteSupplierOption[]
  offices: QuoteLookupOption[]
  departments: QuoteLookupOption[]
  users: Array<QuoteLookupOption & { email: string }>
  modes: QuoteCodeOption[]
  shipmentTypes: QuoteCodeOption[]
  currencies: Array<QuoteCodeOption & { id: string }>
  commodities: Array<QuoteCodeOption & { id: string }>
  countries: QuoteCountryOption[]
}

export type QuoteReferenceSettings = {
  companyName: string
  quotePattern: string
  quoteNextNumber: number | null
  bookingPatterns: Array<{
    key: string
    label: string
    pattern: string
    nextNumber: number
    enabled: boolean
  }>
  customerPattern: string
  customerNextNumber: number | null
}

export type ReferenceRuleTarget = "quote" | "booking" | "customer"

export type ReferenceRuleDraft = {
  status: "accepted" | "refused"
  pattern: string | null
  summary: string
  message: string
  preview: string | null
}

export type QuoteIssueReadiness = {
  ready: boolean
  missing: string[]
  warnings: string[]
}

export type QuoteIssueResult = {
  responseLinkId: string
  quoteId: string
  quoteVersionId: string
  reference: string
  expiresAt: string | null
  recipientEmail: string
  delivered: boolean
  deliveryMode: QuoteDeliveryMode
  responseControlsEnabled: boolean
  quoteDocumentId?: string
}

export type QuoteBranding = {
  brandId: string | null
  displayName: string
  primaryColor: string
  hasLogo: boolean
  logoUrl: string | null
}

export type QuoteIssueRecipient = {
  key: string
  kind: "contact" | "general"
  id: string
  name: string
  email: string
}

export type QuoteDeliveryMode = "standard" | "simple"
export type QuoteIssueRecipientInput =
  | { source: "saved"; key: string }
  | { source: "manual"; email: string }

export type QuoteIssueExpiryPreset = "7" | "14" | "28" | "90" | "never"

export type QuoteIssueEmailDraft = {
  subject: string
  bodyText: string
  previewHtml: string
  personalised: boolean
  sampleCount: number
  model: string | null
  deliveryMode: QuoteDeliveryMode
}

function invalidateQuoteWorkspaces() {
  invalidateCachedCrmResources(null, ["quote-workspace:"])
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

export async function getQuoteSources() {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to load quote sources.")
  return readCachedCrmResource(session.user.id, "quote-sources", async () => {
    const data = await invoke<Omit<QuoteWorkflowSources, "suppliers" | "carriers" | "agents"> & Partial<Pick<QuoteWorkflowSources, "suppliers" | "carriers" | "agents">>>({ action: "sources", compact: true }, "Quote sources could not be loaded.")
    return {
      ...data,
      suppliers: data.suppliers ?? data.organisations.filter((row) => row.types.some((type) => /supplier|freight forwarder/i.test(type))),
      carriers: data.carriers ?? data.organisations.filter((row) => row.types.some((type) => /carrier|shipping line|haulier|freight forwarder/i.test(type))),
      agents: data.agents ?? data.organisations.filter((row) => row.types.some((type) => /\bagents?\b/i.test(type))),
    }
  })
}

export function openQuoteWorkflow() {
  return invoke<{ quoteId: string; reference: string; lifecycle: string }>({ action: "open" }, "The new quote could not be opened.")
}

export function getQuoteReferenceSettings() {
  return invoke<QuoteReferenceSettings>({ action: "reference-settings" }, "Quote reference settings could not be loaded.")
}

export function getQuoteBranding() {
  return invoke<QuoteBranding>({ action: "branding" }, "Quote branding could not be loaded.")
}

export async function uploadQuoteBrandingLogo(file: File) {
  const form = new FormData()
  form.set("action", "upload-branding-logo")
  form.set("file", file)
  const { data, error } = await requireClient().functions.invoke<QuoteBranding>("quotes-workflow", { method: "POST", body: form })
  if (error) throw await functionError(error, "The company logo could not be uploaded.")
  if (!data) throw new Error("The company logo could not be uploaded.")
  return data
}

export function saveQuoteReferenceSettings(settings: QuoteReferenceSettings) {
  return invoke<QuoteReferenceSettings>({ action: "save-reference-settings", ...settings }, "Quote reference settings could not be saved.")
}

export function draftQuoteReferenceRule(input: {
  target: ReferenceRuleTarget
  prompt: string
  currentPattern: string
  companyName: string
  locale: string
}) {
  return invoke<ReferenceRuleDraft>({ action: "draft-reference-rule", ...input }, "Dexter could not draft that reference rule.")
}

export async function getQuoteWorkflow(reference: string, options: { fresh?: boolean } = {}) {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to load this quote.")
  const assertCurrent = captureAuthenticatedScope(session.user.id)
  const scope = `${supabaseFunctionsUrl}:${session.user.id}`
  const canonicalReference = reference.trim().toUpperCase()
  const knownId = quoteIdsByReference.get(`${scope}:${canonicalReference}`)
  if (knownId) await queueQuoteSave.waitForIdle(`${scope}:${knownId}`)
  assertCurrent()
  const workspace = await readCachedCrmResource(session.user.id, `quote-workspace:${canonicalReference}`, () =>
    invoke<QuoteWorkflowWorkspace>({ action: "workspace", reference: canonicalReference }, "The quote workspace could not be loaded."),
    { forceRefresh: options.fresh }, 15_000,
  )
  for (const alias of [canonicalReference, workspace.quote.reference.toUpperCase(), workspace.quote.id.toUpperCase()]) {
    quoteIdsByReference.set(`${scope}:${alias}`, workspace.quote.id)
  }
  while (quoteIdsByReference.size > 384) quoteIdsByReference.delete(quoteIdsByReference.keys().next().value!)
  return workspace
}

export function getQuoteIssueReadiness(quoteId: string) {
  return invoke<QuoteIssueReadiness>({ action: "readiness", quoteId }, "Quote readiness could not be checked.")
}

export function getQuoteIssueRecipients(quoteId: string) {
  return invoke<{ recipients: QuoteIssueRecipient[] }>({ action: "issue-options", quoteId }, "Quote contacts could not be loaded.")
}

export function prepareQuoteIssueEmail(quoteId: string, recipient: QuoteIssueRecipientInput, deliveryMode: QuoteDeliveryMode, expiryPreset: QuoteIssueExpiryPreset) {
  return invoke<QuoteIssueEmailDraft>({ action: "issue-draft", quoteId, recipient, deliveryMode, expiryPreset }, "The quote email could not be prepared.")
}

export function refineQuoteIssueEmail(input: {
  quoteId: string
  recipient: QuoteIssueRecipientInput
  deliveryMode: QuoteDeliveryMode
  subject: string
  bodyText: string
  instruction: string
  selection?: { start: number; end: number } | null
}) {
  return invoke<{ subject: string; bodyText: string; model: string }>({ action: "issue-refine", ...input }, "Dexter could not refine this draft. Your wording is unchanged.")
}

export function previewQuoteIssueEmail(quoteId: string, recipient: QuoteIssueRecipientInput, deliveryMode: QuoteDeliveryMode, subject: string, bodyText: string, expiryPreset: QuoteIssueExpiryPreset) {
  return invoke<{ previewHtml: string; deliveryMode: QuoteDeliveryMode }>({ action: "issue-preview", quoteId, recipient, deliveryMode, subject, bodyText, expiryPreset }, "The email preview could not be updated.")
}

export function issueQuoteWorkflow(quoteId: string, recipient: QuoteIssueRecipientInput, deliveryMode: QuoteDeliveryMode, mailboxId: string, subject: string, bodyText: string, expiryPreset: QuoteIssueExpiryPreset) {
  invalidateQuoteWorkspaces()
  return invoke<QuoteIssueResult>({ action: "issue", quoteId, recipient, deliveryMode, mailboxId, subject, bodyText, expiryPreset }, "The quote could not be sent.")
    .then((result) => {
      invalidateRegisterPages("quotes:")
      invalidateRegisterPages("dashboard:")
      return result
    })
}

export async function refreshQuoteIntelligence(reference: string, revision?: string) {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to refresh quote intelligence.")
  const canonicalReference = reference.trim().toUpperCase()
  return readCachedCrmResource(session.user.id, `quote-intelligence:${canonicalReference}:${revision ?? "current"}`, () =>
    invoke<QuoteIntelligenceSnapshot>({ action: "intelligence", reference: canonicalReference }, "Quote intelligence could not be refreshed."),
    {}, revision ? 60_000 : 0,
  )
}

export async function getQuoteIntelligenceSnapshot(quoteId: string) {
  const client = requireClient()
  const { data, error } = await client.from("CusQuote_Intelligence").select("*").eq("CusQuoteIntelligence_QuoteID", quoteId).maybeSingle()
  if (error) throw error
  return data ? intelligenceFromRealtimeRow(data as Record<string, unknown>) : null
}

let intelligenceConnectionSequence = 0

export function subscribeQuoteIntelligence(quoteId: string, onChange: (snapshot: QuoteIntelligenceSnapshot | null) => void) {
  const client = requireClient()
  let active = true
  let channel: ReturnType<typeof client.channel> | null = null
  let revision = 0
  let latestTimestamp = 0
  let fallback: Promise<void> | null = null
  let connection = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  const connect = () => {
    const currentConnection = ++connection
    revision += 1
    if (channel) void client.removeChannel(channel)
    channel = null
    fallback = null
    void getSupabaseSession().then((session) => {
      if (!active || currentConnection !== connection || !session?.user) return
      const assertCurrent = captureAuthenticatedScope(session.user.id)
      const publish = (snapshot: QuoteIntelligenceSnapshot | null) => {
        if (!active || currentConnection !== connection) return
        try { assertCurrent() } catch { return }
        onChange(snapshot)
      }
      channel = client.channel(`quote-intelligence-${quoteId}-${++intelligenceConnectionSequence}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "CusQuote_Intelligence",
          filter: `CusQuoteIntelligence_QuoteID=eq.${quoteId}`,
        }, (payload) => {
          if (!active || currentConnection !== connection) return
          if (payload.eventType === "DELETE") { revision += 1; publish(null); return }
          const row = payload.new as Record<string, unknown>
          const snapshot = row.CusQuoteIntelligence_QuoteID === quoteId ? intelligenceFromRealtimeRow(row) : null
          if (snapshot) {
            const timestamp = Math.max(0, Date.parse(String(row.CusQuoteIntelligence_UpdatedAt ?? "")) || 0, Date.parse(snapshot.calculatedAt ?? "") || 0, Date.parse(snapshot.aiGeneratedAt ?? "") || 0)
            if (timestamp < latestTimestamp) return
            latestTimestamp = timestamp
            revision += 1
            publish(snapshot)
            return
          }
          // Realtime normally includes the full RLS-authorised row. A partial
          // payload gets one shared recovery read, never one read per event.
          if (!fallback) {
            const requestedRevision = revision
            fallback = getQuoteIntelligenceSnapshot(quoteId)
              .then((next) => { if (requestedRevision === revision) publish(next) })
              .catch(() => undefined)
              .finally(() => { if (currentConnection === connection) fallback = null })
          }
        }).subscribe()
    }).catch(() => undefined)
  }
  const reconnect = () => {
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 0)
  }
  connect()
  window.addEventListener(authenticatedAccessChangedEvent, reconnect)
  return () => {
    active = false
    clearTimeout(reconnectTimer)
    window.removeEventListener(authenticatedAccessChangedEvent, reconnect)
    if (channel) void client.removeChannel(channel)
  }
}

export type QuoteSaveResult = {
  quoteId: string
  reference: string
  lifecycle: string
  versionId: string
  readiness: QuoteIssueReadiness
  version: QuoteWorkflowVersion
  events: QuoteWorkflowEvent[]
}

const queueQuoteSave = createQuoteSaveQueue()
const quoteIdsByReference = new Map<string, string>()
if (typeof window !== "undefined") window.addEventListener(authenticatedAccessChangedEvent, () => quoteIdsByReference.clear())

export async function saveQuoteWorkflow(quoteId: string | null, quote: QuoteSavePayload) {
  const session = await getSupabaseSession()
  if (!session?.user) throw new Error("Sign in again to save this quote.")
  const assertCurrent = captureAuthenticatedScope(session.user.id)
  const result = await queueQuoteSave(`${supabaseFunctionsUrl}:${session.user.id}:${quoteId ?? "new"}`, async () => {
    assertCurrent()
    invalidateQuoteWorkspaces()
    const saved = await invoke<QuoteSaveResult>({ action: "save", quoteId, quote }, "The quote could not be saved.")
    assertCurrent()
    invalidateQuoteWorkspaces()
    invalidateRegisterPages("quotes:")
    invalidateRegisterPages("dashboard:")
    return saved
  })
  return result
}

export function transitionQuoteWorkflow(quoteId: string, transition: "calculated" | "sent" | "revised" | "accepted" | "declined" | "ghosted", note?: string, followUpAt?: string) {
  invalidateQuoteWorkspaces()
  return invoke<{ quoteId: string; lifecycle: string; versionId?: string | null }>({ action: "transition", quoteId, transition, note, followUpAt }, "The quote action could not be completed.")
    .then((result) => {
      invalidateRegisterPages("quotes:")
      invalidateRegisterPages("dashboard:")
      return result
    })
}

/** @deprecated Quote-to-booking is the next delivery phase and is not active. */
export function convertQuoteWorkflow(_quoteId: string, _readiness: { shipperId?: string; shipperName: string; consigneeId?: string; consigneeName: string; operationalNotes?: string }, _idempotencyKey = crypto.randomUUID()): Promise<{ quoteId: string; bookingId: string; bookingReference: string; reused: boolean }> {
  return Promise.reject(new Error("Quote-to-booking is not active yet."))
}

/** @deprecated Quote document generation remains owned by the document-builder workflow. */
export function downloadQuoteDocument(_generatedDocumentId: string): Promise<{ signedUrl: string; fileName: string; expiresAt: string }> {
  return Promise.reject(new Error("Quote document generation is not active in this workspace yet."))
}
