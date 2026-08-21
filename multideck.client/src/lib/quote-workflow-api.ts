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
  offices: QuoteLookupOption[]
  departments: QuoteLookupOption[]
  users: Array<QuoteLookupOption & { email: string }>
  modes: QuoteCodeOption[]
  shipmentTypes: QuoteCodeOption[]
  currencies: Array<QuoteCodeOption & { id: string }>
  commodities: Array<QuoteCodeOption & { id: string }>
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

export type QuoteIssueExpiryPreset = "7" | "14" | "28" | "90" | "never"

export type QuoteIssueEmailDraft = {
  subject: string
  bodyText: string
  previewHtml: string
  personalised: boolean
  sampleCount: number
  model: string | null
}

let quoteSourcesPromise: Promise<QuoteWorkflowSources> | null = null
const quoteWorkspaceCache = new Map<string, { expiresAt: number; promise: Promise<QuoteWorkflowWorkspace> }>()

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
  if (!quoteSourcesPromise) {
    quoteSourcesPromise = invoke<QuoteWorkflowSources>({ action: "sources" }, "Quote sources could not be loaded.")
      .catch((error) => {
        quoteSourcesPromise = null
        throw error
      })
  }
  return quoteSourcesPromise
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

export function getQuoteWorkflow(reference: string, options: { fresh?: boolean } = {}) {
  const cacheKey = reference.trim().toUpperCase()
  const cached = quoteWorkspaceCache.get(cacheKey)
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = invoke<QuoteWorkflowWorkspace>({ action: "workspace", reference: cacheKey }, "The quote workspace could not be loaded.")
    .catch((error) => {
      quoteWorkspaceCache.delete(cacheKey)
      throw error
    })
  quoteWorkspaceCache.set(cacheKey, { expiresAt: Date.now() + 15_000, promise })
  return promise
}

export function getQuoteIssueReadiness(quoteId: string) {
  return invoke<QuoteIssueReadiness>({ action: "readiness", quoteId }, "Quote readiness could not be checked.")
}

export function getQuoteIssueRecipients(quoteId: string) {
  return invoke<{ recipients: QuoteIssueRecipient[] }>({ action: "issue-options", quoteId }, "Quote contacts could not be loaded.")
}

export function prepareQuoteIssueEmail(quoteId: string, recipientKey: string, expiryPreset: QuoteIssueExpiryPreset) {
  return invoke<QuoteIssueEmailDraft>({ action: "issue-draft", quoteId, recipientKey, expiryPreset }, "Dexter could not prepare the quote email.")
}

export function refineQuoteIssueEmail(input: {
  quoteId: string
  recipientKey: string
  subject: string
  bodyText: string
  instruction: string
  selection?: { start: number; end: number } | null
}) {
  return invoke<{ subject: string; bodyText: string; model: string }>({ action: "issue-refine", ...input }, "Dexter could not refine this draft. Your wording is unchanged.")
}

export function previewQuoteIssueEmail(quoteId: string, recipientKey: string, subject: string, bodyText: string, expiryPreset: QuoteIssueExpiryPreset) {
  return invoke<{ previewHtml: string }>({ action: "issue-preview", quoteId, recipientKey, subject, bodyText, expiryPreset }, "The email preview could not be updated.")
}

export function issueQuoteWorkflow(quoteId: string, recipientKey: string, mailboxId: string, subject: string, bodyText: string, expiryPreset: QuoteIssueExpiryPreset) {
  quoteWorkspaceCache.clear()
  return invoke<QuoteIssueResult>({ action: "issue", quoteId, recipientKey, mailboxId, subject, bodyText, expiryPreset }, "The quote could not be sent.")
}

export function refreshQuoteIntelligence(reference: string) {
  return invoke<QuoteIntelligenceSnapshot>({ action: "intelligence", reference: reference.trim().toUpperCase() }, "Quote intelligence could not be refreshed.")
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value))
}

function temperatureLabel(score: number): "Cold" | "Warm" | "Hot" {
  return score < 40 ? "Cold" : score < 70 ? "Warm" : "Hot"
}

function intelligenceFromRealtimeRow(row: Record<string, unknown>): QuoteIntelligenceSnapshot | null {
  const deterministic = row.CusQuoteIntelligence_DeterministicJSON
  if (!deterministic || typeof deterministic !== "object" || Array.isArray(deterministic)) return null
  const snapshot = deterministic as Omit<QuoteIntelligenceSnapshot, "calculatedAt" | "aiGeneratedAt" | "aiNextEligibleAt" | "ai">
  const rawAi = row.CusQuoteIntelligence_AIJSON && typeof row.CusQuoteIntelligence_AIJSON === "object" && !Array.isArray(row.CusQuoteIntelligence_AIJSON)
    ? row.CusQuoteIntelligence_AIJSON as Record<string, unknown>
    : null
  const aiMatches = rawAi?.inputFingerprint === snapshot.inputFingerprint
  const adjustment = aiMatches ? clamp(Number(rawAi?.adjustmentPoints) || 0, -8, 8) : 0
  const likelihood = snapshot.metrics.aiWinLikelihood
  const temperature = snapshot.metrics.aiTemperature
  const baseLikelihood = likelihood.value?.basePct ?? null
  const baseTemperature = temperature.value?.baseScore ?? null
  const ai = rawAi ? {
    status: (aiMatches ? "applied" : snapshot.aiEligible ? "pending" : "rules_only") as "applied" | "pending" | "rules_only",
    adjustmentPoints: adjustment,
    inputFingerprint: typeof rawAi.inputFingerprint === "string" ? rawAi.inputFingerprint : "",
    reasonCodes: Array.isArray(rawAi.reasonCodes) ? rawAi.reasonCodes.filter((item): item is string => typeof item === "string") : [],
    cardExplanations: rawAi.cardExplanations && typeof rawAi.cardExplanations === "object" && !Array.isArray(rawAi.cardExplanations) ? rawAi.cardExplanations as Record<string, string> : {},
    model: typeof rawAi.model === "string" ? rawAi.model : "",
    promptVersion: typeof rawAi.promptVersion === "string" ? rawAi.promptVersion : "",
    generatedAt: typeof rawAi.generatedAt === "string" ? rawAi.generatedAt : "",
  } : null
  return {
    ...snapshot,
    state: row.CusQuoteIntelligence_StateCode === "updating" ? "updating" : snapshot.state === "building_baseline" ? "building_baseline" : aiMatches ? "ready" : snapshot.aiEligible ? "rules_only" : snapshot.state,
    calculatedAt: typeof row.CusQuoteIntelligence_CalculatedAt === "string" ? row.CusQuoteIntelligence_CalculatedAt : null,
    aiGeneratedAt: typeof row.CusQuoteIntelligence_AIGeneratedAt === "string" ? row.CusQuoteIntelligence_AIGeneratedAt : null,
    aiNextEligibleAt: typeof row.CusQuoteIntelligence_AINextEligibleAt === "string" ? row.CusQuoteIntelligence_AINextEligibleAt : null,
    ai,
    metrics: {
      ...snapshot.metrics,
      aiWinLikelihood: {
        ...likelihood,
        value: baseLikelihood === null ? null : {
          basePct: baseLikelihood,
          finalPct: Math.round(clamp(baseLikelihood + adjustment)),
          adjustmentPoints: adjustment,
        },
      },
      aiTemperature: {
        ...temperature,
        value: baseTemperature === null ? null : {
          baseScore: baseTemperature,
          score: Math.round(clamp(baseTemperature + adjustment * 0.45)),
          label: temperatureLabel(baseTemperature + adjustment * 0.45),
        },
      },
    },
  }
}

export async function getQuoteIntelligenceSnapshot(quoteId: string) {
  const client = requireClient()
  const { data, error } = await client.from("CusQuote_Intelligence").select("*").eq("CusQuoteIntelligence_QuoteID", quoteId).maybeSingle()
  if (error) throw error
  return data ? intelligenceFromRealtimeRow(data as Record<string, unknown>) : null
}

export function subscribeQuoteIntelligence(quoteId: string, onChange: (snapshot: QuoteIntelligenceSnapshot | null) => void) {
  const client = requireClient()
  const channel = client
    .channel(`quote-intelligence-${quoteId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "CusQuote_Intelligence",
      filter: `CusQuoteIntelligence_QuoteID=eq.${quoteId}`,
    }, () => {
      void getQuoteIntelligenceSnapshot(quoteId).then(onChange).catch(() => undefined)
    })
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

export async function saveQuoteWorkflow(quoteId: string | null, quote: QuoteSavePayload) {
  const result = await invoke<{ quoteId: string; reference: string; lifecycle: string }>({ action: "save", quoteId, quote }, "The quote could not be saved.")
  quoteWorkspaceCache.delete(result.reference.trim().toUpperCase())
  return result
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
