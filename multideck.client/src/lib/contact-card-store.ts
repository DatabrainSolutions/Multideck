import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  cardTotals,
  defaultAutomation,
  defaultBranding,
  defaultSocialLinks,
  emptyCardAnalytics,
  isExternalAction,
  type AutomationRun,
  type BreakdownRow,
  type CardAnalytics,
  type CardBranding,
  type CardExchange,
  type CardScan,
  type ContactCard,
  type ContactCardOwnerOption,
  type ContactCardPipelineOption,
} from "@/data/contact-card-data"
import { getSupabaseSession, supabase, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

export type StoreStatus = "loading" | "ready" | "error"
export type SaveStatus = "idle" | "saving" | "saved" | "error"

export type ContactCardRegisterInput = {
  limit?: number
  offset?: number
  search?: string
  status?: string
  automationState?: string
  sortField?: "card" | "status" | "source" | "automation" | "activity" | "updated"
  sortDirection?: "asc" | "desc"
}

export type ContactCardRegisterSummary = {
  total: number
  live: number
  scans: number
  exchanges: number
  leads: number
  needsAttention: number
}

export type ContactCardPageMeta = {
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

type StoreState = {
  status: StoreStatus
  error: string | null
  cards: ContactCard[]
  pipelines: ContactCardPipelineOption[]
  owners: ContactCardOwnerOption[]
  currentUserId: string | null
  tenantName: string
  summary: ContactCardRegisterSummary
  page: ContactCardPageMeta
  save: { status: SaveStatus; cardId: string | null }
}

type WorkspacePayload = {
  tenantName?: string
  cards?: Record<string, unknown>[]
  automations?: Record<string, unknown>[]
  conditions?: Record<string, unknown>[]
  actions?: Record<string, unknown>[]
  analytics?: Record<string, unknown>[]
  scans?: Record<string, unknown>[]
  exchanges?: Record<string, unknown>[]
  runs?: Record<string, unknown>[]
  runSteps?: Record<string, unknown>[]
  pipelines?: ContactCardPipelineOption[]
  owners?: ContactCardOwnerOption[]
  summary?: Partial<ContactCardRegisterSummary>
  page?: Partial<ContactCardPageMeta>
}

const emptyRegisterSummary: ContactCardRegisterSummary = { total: 0, live: 0, scans: 0, exchanges: 0, leads: 0, needsAttention: 0 }
const emptyPageMeta: ContactCardPageMeta = { offset: 0, limit: 25, total: 0, hasMore: false }

let state: StoreState = {
  status: "loading",
  error: null,
  cards: [],
  pipelines: [],
  owners: [],
  currentUserId: null,
  tenantName: "Multideck",
  summary: emptyRegisterSummary,
  page: emptyPageMeta,
  save: { status: "idle", cardId: null },
}
const listeners = new Set<() => void>()
const saveTimers = new Map<string, number>()
const saveQueues = new Map<string, Promise<void>>()
const unsavedCardIds = new Set<string>()
const publicCardCache = new Map<string, ContactCard>()
let loadPromise: Promise<void> | null = null
let lastRegisterInput: ContactCardRegisterInput = { limit: 25, offset: 0, sortField: "updated", sortDirection: "desc" }
let registerRequestSequence = 0
const detailCardIds = new Set<string>()
const detailPromises = new Map<string, Promise<void>>()
const detailErrors = new Map<string, string>()

function emit(next: Partial<StoreState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function text(row: Record<string, unknown>, key: string, fallback = "") {
  return typeof row[key] === "string" ? (row[key] as string) : fallback
}

function bool(row: Record<string, unknown>, key: string, fallback = false) {
  return typeof row[key] === "boolean" ? (row[key] as boolean) : fallback
}

function number(row: Record<string, unknown>, key: string, fallback = 0) {
  const value = Number(row[key])
  return Number.isFinite(value) ? value : fallback
}

function analyticsNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapBreakdownRows(value: unknown): BreakdownRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const name = typeof row.name === "string" ? row.name : ""
    return name ? [{ name, value: analyticsNumber(row.value), share: analyticsNumber(row.share) }] : []
  })
}

function mapTimeline(value: unknown): CardAnalytics["timelineDay"] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (typeof row.iso !== "string" || !row.iso) return []
    return [{ iso: row.iso, scans: analyticsNumber(row.scans), exchanges: analyticsNumber(row.exchanges) }]
  })
}

function mapAnalytics(value: unknown): CardAnalytics {
  if (!value || typeof value !== "object") return emptyCardAnalytics()
  const analytics = value as Record<string, unknown>
  const totals = analytics.totals && typeof analytics.totals === "object" ? analytics.totals as Record<string, unknown> : {}
  const location = analytics.location && typeof analytics.location === "object" ? analytics.location as Record<string, unknown> : {}

  return {
    totals: {
      scans: analyticsNumber(totals.scans),
      uniqueScans: analyticsNumber(totals.uniqueScans),
      started: analyticsNumber(totals.started),
      exchanges: analyticsNumber(totals.exchanges),
      leadsCreated: analyticsNumber(totals.leadsCreated),
      leadsMatched: analyticsNumber(totals.leadsMatched),
      conversion: totals.conversion === null || totals.conversion === undefined ? null : analyticsNumber(totals.conversion),
    },
    timelineHour: mapTimeline(analytics.timelineHour),
    timelineDay: mapTimeline(analytics.timelineDay),
    devices: mapBreakdownRows(analytics.devices),
    browsers: mapBreakdownRows(analytics.browsers),
    channels: mapBreakdownRows(analytics.channels),
    location: {
      rows: mapBreakdownRows(location.rows),
      suppressedRegions: analyticsNumber(location.suppressedRegions),
      suppressedScans: analyticsNumber(location.suppressedScans),
    },
    automationOutcomes: mapBreakdownRows(analytics.automationOutcomes),
    automationRunsToday: analyticsNumber(analytics.automationRunsToday),
    automationFailures: analyticsNumber(analytics.automationFailures),
  }
}

function mapWorkspace(payload: WorkspacePayload): ContactCard[] {
  const tenantName = typeof payload.tenantName === "string" && payload.tenantName.trim()
    ? payload.tenantName.trim()
    : "Multideck"
  const automations = new Map((payload.automations ?? []).map((row) => [text(row, "ContactCard_ID"), row]))
  const conditions = payload.conditions ?? []
  const actions = payload.actions ?? []
  const analytics = new Map((payload.analytics ?? []).map((row) => [text(row, "ContactCard_ID"), row.Analytics]))
  const scans = payload.scans ?? []
  const exchanges = payload.exchanges ?? []
  const runs = payload.runs ?? []
  const runSteps = payload.runSteps ?? []

  return (payload.cards ?? []).map((row) => {
    const id = text(row, "ContactCard_ID")
    const automationRow = automations.get(id) ?? {}
    const cardExchanges: CardExchange[] = exchanges
      .filter((item) => text(item, "ContactCard_ID") === id)
      .map((item) => ({
        id: text(item, "Exchange_ID"),
        firstName: text(item, "Exchange_FirstName"),
        lastName: text(item, "Exchange_LastName"),
        email: text(item, "Exchange_Email"),
        company: text(item, "Exchange_Company"),
        phone: text(item, "Exchange_Phone"),
        marketingConsent: bool(item, "Exchange_MarketingConsent"),
        at: text(item, "Exchange_At"),
        outcome: text(item, "Exchange_Outcome", "created") as CardExchange["outcome"],
        automationOutcome: text(item, "Exchange_AutomationOutcome", "none") as CardExchange["automationOutcome"],
        automationDetail: text(item, "Exchange_AutomationDetail"),
      }))
    const personRow = (row.ContactCard_Person ?? {}) as Partial<ContactCard["person"]>
    const person = {
      fullName: personRow.fullName ?? "",
      role: personRow.role ?? "",
      company: personRow.company ?? "",
      email: personRow.email ?? "",
      phone: personRow.phone ?? "",
      website: personRow.website ?? "",
      profileImageDataUrl: personRow.profileImageDataUrl ?? null,
      socialLinks: Array.isArray(personRow.socialLinks)
        ? personRow.socialLinks
        : defaultSocialLinks(personRow.email ?? "", personRow.website ?? ""),
    }
    const cardRuns: AutomationRun[] = runs
      .filter((item) => text(item, "ContactCard_ID") === id)
      .map((item) => {
        const runId = text(item, "AutomationRun_ID")
        return {
          id: runId,
          exchangeId: text(item, "Exchange_ID") || null,
          leadId: text(item, "CRMLead_ID") || null,
          status: text(item, "AutomationRun_Status", "skipped") as AutomationRun["status"],
          startedAt: text(item, "AutomationRun_StartedAt"),
          completedAt: text(item, "AutomationRun_CompletedAt") || null,
          durationMs: number(item, "AutomationRun_DurationMs"),
          recordsAffected: number(item, "AutomationRun_RecordsAffected"),
          trigger: text(item, "AutomationRun_Trigger", "Lead submitted"),
          errorSummary: text(item, "AutomationRun_ErrorSummary") || null,
          recovery: text(item, "AutomationRun_Recovery") || null,
          input: (item.AutomationRun_Input ?? {}) as Record<string, string | boolean>,
          rerunOf: text(item, "AutomationRun_RerunOf") || null,
          isTest: bool(item, "AutomationRun_IsTest"),
          steps: runSteps
            .filter((step) => text(step, "AutomationRun_ID") === runId)
            .map((step) => ({
              id: text(step, "AutomationRunStep_ID"),
              actionId: text(step, "Action_ID") || null,
              kind: text(step, "AutomationRunStep_Kind"),
              label: text(step, "AutomationRunStep_Label"),
              status: text(step, "AutomationRunStep_Status", "skipped") as AutomationRun["steps"][number]["status"],
              detail: text(step, "AutomationRunStep_Detail"),
              startedAt: text(step, "AutomationRunStep_StartedAt"),
              durationMs: number(step, "AutomationRunStep_DurationMs"),
            })),
        }
      })
    const cardAnalytics = mapAnalytics(analytics.get(id))

    return {
      id,
      ownerUserId: text(row, "Owner_User_ID"),
      tenantName: text(row, "ContactCard_TenantName", tenantName),
      showTenantName: bool(row, "ContactCard_ShowTenantName", true),
      slug: text(row, "ContactCard_Slug"),
      label: text(row, "ContactCard_Label"),
      context: text(row, "ContactCard_Context"),
      status: text(row, "ContactCard_Status", "draft") as ContactCard["status"],
      person,
      branding: (() => {
        const saved = (row.ContactCard_Branding ?? {}) as Partial<CardBranding>
        const savedLayout = (row.ContactCard_Branding as Record<string, unknown> | null)?.layout
        const hasSavedVisualBrand = Object.keys(saved).some((key) => key !== "brandSource")
        return {
          ...defaultBranding(),
          ...saved,
          brandSource: saved.brandSource === "tenant" || saved.brandSource === "custom"
            ? saved.brandSource
            : hasSavedVisualBrand ? "custom" : "tenant",
          layout: savedLayout === "centred" ? "spotlight" : saved.layout ?? "classic",
        } as CardBranding
      })(),
      leadSource: text(row, "ContactCard_LeadSource"),
      publicHeading: text(row, "ContactCard_PublicHeading"),
      publicSubheading: text(row, "ContactCard_PublicSubheading"),
      submitLabel: text(row, "ContactCard_SubmitLabel", "Continue"),
      thanksHeading: text(row, "ContactCard_ThanksHeading"),
      thanksBody: text(row, "ContactCard_ThanksBody"),
      phoneField: text(row, "ContactCard_PhoneField", "optional") as ContactCard["phoneField"],
      showPhone: bool(row, "ContactCard_ShowPhone", true),
      showWebsite: bool(row, "ContactCard_ShowWebsite", true),
      consentEnabled: bool(row, "ContactCard_ConsentEnabled"),
      consentCopy: text(row, "ContactCard_ConsentCopy"),
      privacyUrl: text(row, "ContactCard_PrivacyUrl"),
      automation: {
        state: text(automationRow, "Automation_State", "off") as ContactCard["automation"]["state"],
        hasUnpublishedChanges: bool(automationRow, "Automation_HasUnpublishedChanges"),
        lastRunAt: text(automationRow, "Automation_LastRunAt") || cardExchanges.filter((item) => item.automationOutcome === "ran").at(-1)?.at || null,
        autoPausedReason: text(automationRow, "Automation_AutoPausedReason") || null,
        runsToday: cardAnalytics.automationRunsToday,
        failures: cardAnalytics.automationFailures,
        conditions: conditions
          .filter((item) => text(item, "ContactCard_ID") === id)
          .map((item) => ({
            id: text(item, "Condition_ID"),
            kind: text(item, "Condition_Kind") as ContactCard["automation"]["conditions"][number]["kind"],
            negated: bool(item, "Condition_Negated"),
            value: text(item, "Condition_Value"),
            enabled: bool(item, "Condition_Enabled", true),
          })),
        actions: actions
          .filter((item) => text(item, "ContactCard_ID") === id)
          .map((item) => ({
            id: text(item, "Action_ID"),
            kind: text(item, "Action_Kind") as ContactCard["automation"]["actions"][number]["kind"],
            enabled: bool(item, "Action_Enabled", true),
            config: (item.Action_Config ?? {}) as Record<string, string>,
            delayMinutes: Number(item.Action_DelayMinutes ?? 0),
          })),
        runs: cardRuns,
      },
      analytics: cardAnalytics,
      createdAt: text(row, "ContactCard_CreatedAt"),
      scans: scans
        .filter((item) => text(item, "ContactCard_ID") === id)
        .map((item) => ({
          id: text(item, "Scan_ID"),
          at: text(item, "Scan_At"),
          device: text(item, "Scan_Device", "desktop") as CardScan["device"],
          browser: text(item, "Scan_Browser", "Other"),
          channel: text(item, "Scan_Channel", "unknown") as CardScan["channel"],
          country: text(item, "Scan_Country"),
          region: text(item, "Scan_Region"),
          started: Boolean(item.Scan_StartedAt),
          exchanged: Boolean(item.Scan_ExchangedAt),
        })),
      exchanges: cardExchanges,
    }
  })
}

async function callRpc<T>(name: string, args?: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const session = await getSupabaseSession()
  const isPublic = name.startsWith("multideck_public_") || name.includes("record_scan") || name.includes("mark_started") || name.includes("submit_exchange")
  if (!isPublic && !session) throw new Error("Sign in again to manage QR contact cards.")
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data as T
}

function missingContactCardReadRpc(error: unknown) {
  if (!error || typeof error !== "object") return false
  const candidate = error as { code?: string; message?: string }
  return ["42883", "PGRST202"].includes(candidate.code ?? "")
    || /schema cache.*function|function .* does not exist|could not find the function/i.test(candidate.message ?? "")
}

function registerSummary(payload: WorkspacePayload): ContactCardRegisterSummary {
  const value = payload.summary ?? {}
  return {
    total: Number(value.total ?? 0),
    live: Number(value.live ?? 0),
    scans: Number(value.scans ?? 0),
    exchanges: Number(value.exchanges ?? 0),
    leads: Number(value.leads ?? 0),
    needsAttention: Number(value.needsAttention ?? 0),
  }
}

function pageMeta(payload: WorkspacePayload, input: ContactCardRegisterInput): ContactCardPageMeta {
  const value = payload.page ?? {}
  return {
    offset: Number(value.offset ?? input.offset ?? 0),
    limit: Number(value.limit ?? input.limit ?? 25),
    total: Number(value.total ?? 0),
    hasMore: Boolean(value.hasMore),
  }
}

async function fetchRegisterPayload(input: ContactCardRegisterInput) {
  try {
    return await callRpc<WorkspacePayload>("multideck_contact_cards_page", {
      p_limit: input.limit ?? 25,
      p_offset: input.offset ?? 0,
      p_search: input.search?.trim() || null,
      p_status: input.status || null,
      p_automation_state: input.automationState || null,
      p_sort_field: input.sortField ?? "updated",
      p_sort_direction: input.sortDirection ?? "desc",
    })
  } catch (error) {
    if (!missingContactCardReadRpc(error)) throw error
    throw new Error("Contact card paging is still being prepared. Try again shortly.")
  }
}

async function loadWorkspace(input: ContactCardRegisterInput = lastRegisterInput) {
  const requestInput = { ...lastRegisterInput, ...input }
  lastRegisterInput = requestInput
  const requestId = ++registerRequestSequence
  emit({ status: "loading", error: null })
  try {
    const session = await getSupabaseSession()
    const payload = await fetchRegisterPayload(requestInput)
    if (requestId !== registerRequestSequence) return
    const owners = payload.owners ?? []
    const registerCards = mapWorkspace(payload).map((card) => {
      if (!detailCardIds.has(card.id)) return card
      return state.cards.find((existing) => existing.id === card.id) ?? card
    })
    emit({
      status: "ready",
      error: null,
      cards: registerCards,
      pipelines: payload.pipelines ?? [],
      owners,
      currentUserId: owners.find((owner) => owner.email.toLowerCase() === session?.user.email?.toLowerCase())?.id ?? owners[0]?.id ?? null,
      tenantName: typeof payload.tenantName === "string" && payload.tenantName.trim() ? payload.tenantName.trim() : "Multideck",
      summary: registerSummary(payload),
      page: pageMeta(payload, requestInput),
    })
  } catch (error) {
    if (requestId !== registerRequestSequence) return
    emit({ status: "error", error: error instanceof Error ? error.message : "Unable to load your contact cards. Check your connection and try again.", cards: [] })
  }
}

function ensureLoaded() {
  if (!loadPromise) loadPromise = loadWorkspace()
}

export function loadContactCardsPage(input: ContactCardRegisterInput) {
  loadPromise = loadWorkspace(input)
  return loadPromise
}

export function reloadContactCards() {
  loadPromise = loadWorkspace(lastRegisterInput)
  return loadPromise
}

export function useContactCardStore() {
  ensureLoaded()
  return useSyncExternalStore(subscribe, () => state, () => state)
}

async function loadContactCardDetail(cardId: string) {
  detailErrors.delete(cardId)
  try {
    let payload: WorkspacePayload
    try {
      payload = await callRpc<WorkspacePayload>("multideck_contact_card_detail", { p_card_id: cardId })
    } catch (error) {
      if (!missingContactCardReadRpc(error)) throw error
      payload = await callRpc<WorkspacePayload>("multideck_contact_cards_workspace")
      payload = {
        ...payload,
        cards: (payload.cards ?? []).filter((row) => text(row, "ContactCard_ID") === cardId || text(row, "ContactCard_Slug") === cardId),
        automations: (payload.automations ?? []).filter((row) => text(row, "ContactCard_ID") === cardId),
        conditions: (payload.conditions ?? []).filter((row) => text(row, "ContactCard_ID") === cardId),
        actions: (payload.actions ?? []).filter((row) => text(row, "ContactCard_ID") === cardId),
        analytics: (payload.analytics ?? []).filter((row) => text(row, "ContactCard_ID") === cardId),
        scans: [],
        exchanges: (payload.exchanges ?? []).filter((row) => text(row, "ContactCard_ID") === cardId).slice(-20),
        runs: (payload.runs ?? []).filter((row) => text(row, "ContactCard_ID") === cardId).slice(0, 25),
      }
      const runIds = new Set((payload.runs ?? []).map((row) => text(row, "AutomationRun_ID")))
      payload.runSteps = (payload.runSteps ?? []).filter((row) => runIds.has(text(row, "AutomationRun_ID")))
    }

    const [detail] = mapWorkspace(payload)
    if (!detail) throw new Error("This contact card is no longer available.")
    detailCardIds.add(cardId)
    detailCardIds.add(detail.id)
    detailCardIds.add(detail.slug)
    emit({
      cards: state.cards.some((card) => card.id === detail.id)
        ? state.cards.map((card) => card.id === detail.id ? detail : card)
        : [detail, ...state.cards],
      pipelines: payload.pipelines ?? state.pipelines,
      owners: payload.owners ?? state.owners,
      tenantName: typeof payload.tenantName === "string" && payload.tenantName.trim() ? payload.tenantName.trim() : state.tenantName,
    })
  } catch (error) {
    detailErrors.set(cardId, error instanceof Error ? error.message : "Unable to load this contact card. Check your connection and try again.")
    emit({ cards: [...state.cards] })
  } finally {
    detailPromises.delete(cardId)
  }
}

function ensureContactCardDetail(cardId: string) {
  if (detailCardIds.has(cardId)) return
  if (!detailPromises.has(cardId)) detailPromises.set(cardId, loadContactCardDetail(cardId))
}

export function reloadContactCard(cardId: string) {
  detailCardIds.delete(cardId)
  detailErrors.delete(cardId)
  const promise = loadContactCardDetail(cardId)
  detailPromises.set(cardId, promise)
  return promise
}

export function useContactCard(cardId: string | null) {
  const store = useContactCardStore()
  useEffect(() => {
    if (cardId) ensureContactCardDetail(cardId)
  }, [cardId])
  const card = cardId ? store.cards.find((item) => item.id === cardId || item.slug === cardId) ?? null : null
  const detailError = cardId ? detailErrors.get(cardId) ?? null : null
  const detailReady = !cardId || detailCardIds.has(cardId)
  return { ...store, card, status: detailError ? "error" as const : detailReady ? store.status : "loading" as const, error: detailError ?? store.error }
}

function commit(cards: ContactCard[]) {
  emit({ cards })
}

async function persistCardNow(card: ContactCard) {
  emit({ save: { status: "saving", cardId: card.id } })
  try {
    // Card data and tenant attribution are one user-visible save. The RPC owns
    // both writes in one transaction so a failed visibility update cannot leave
    // the card looking saved while the public attribution remains stale.
    await callRpc<string>("multideck_contact_card_save_atomic", { p_card: card })
    unsavedCardIds.delete(card.id)
    emit({ save: { status: "saved", cardId: card.id }, error: null })
    window.setTimeout(() => {
      if (state.save.cardId === card.id && state.save.status === "saved") emit({ save: { status: "idle", cardId: null } })
    }, 1800)
  } catch (error) {
    emit({ save: { status: "error", cardId: card.id }, error: error instanceof Error ? error.message : "Unable to save this card. Check your connection and try again." })
    throw error
  }
}

function persistCard(card: ContactCard): Promise<void> {
  // Autosave, publish/pause and explicit retries can be triggered close
  // together. Keep each card's writes ordered so an older network response can
  // never land after and overwrite a newer operator choice.
  const previous = saveQueues.get(card.id) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => persistCardNow(card))
  saveQueues.set(card.id, next)
  const clear = () => {
    if (saveQueues.get(card.id) === next) saveQueues.delete(card.id)
  }
  void next.then(clear, clear)
  return next
}

function queueSave(card: ContactCard) {
  const existing = saveTimers.get(card.id)
  if (existing) window.clearTimeout(existing)
  saveTimers.set(card.id, window.setTimeout(() => {
    saveTimers.delete(card.id)
    void persistCard(state.cards.find((item) => item.id === card.id) ?? card).catch(() => undefined)
  }, 450))
}

export function updateCard(cardId: string, update: (card: ContactCard) => ContactCard) {
  const cards = state.cards.map((card) => (card.id === cardId ? update(card) : card))
  commit(cards)
  const card = cards.find((item) => item.id === cardId)
  if (card) queueSave(card)
}

export async function createCard(input: {
  label: string
  context: string
  fullName: string
  role: string
  company: string
  email: string
  phone: string
  leadSource: string
}): Promise<ContactCard> {
  const owner = state.owners.find((item) => item.id === state.currentUserId) ?? state.owners[0]
  const pipeline = state.pipelines[0]
  const id = crypto.randomUUID()
  const slug = uniqueSlug(input.fullName || input.label)
  const card: ContactCard = {
    id,
    ownerUserId: owner?.id ?? "",
    tenantName: state.tenantName,
    showTenantName: true,
    slug,
    label: input.label || input.fullName,
    context: input.context,
    status: "draft",
    person: {
      fullName: input.fullName,
      role: input.role,
      company: input.company || "Multideck",
      email: input.email,
      phone: input.phone,
      website: "multideck.solutions",
      profileImageDataUrl: null,
      socialLinks: defaultSocialLinks(input.email, "multideck.solutions"),
    },
    branding: defaultBranding(),
    leadSource: input.leadSource,
    publicHeading: "Let's stay in touch",
    publicSubheading: `Share your details and ${input.fullName.split(" ")[0] || "we"} will follow up.`,
    submitLabel: "Continue",
    thanksHeading: "You're connected",
    thanksBody: `Thanks — ${input.fullName.split(" ")[0] || "we"} will be in touch soon.`,
    phoneField: "optional",
    showPhone: Boolean(input.phone),
    showWebsite: true,
    consentEnabled: true,
    consentCopy: `Send me occasional updates from ${state.tenantName}.`,
    privacyUrl: "https://multideck.solutions/privacy",
    automation: defaultAutomation(owner?.name ?? input.fullName, owner?.id ?? "", pipeline),
    analytics: emptyCardAnalytics(),
    createdAt: new Date().toISOString(),
    scans: [],
    exchanges: [],
  }
  unsavedCardIds.add(id)
  try {
    await persistCard(card)
  } catch (error) {
    unsavedCardIds.delete(id)
    throw error
  }
  detailCardIds.add(card.id)
  detailCardIds.add(card.slug)
  commit([card, ...state.cards])
  return card
}

function uniqueSlug(source: string) {
  const base = source.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card"
  let slug = base
  let suffix = 2
  while (state.cards.some((card) => card.slug === slug)) slug = `${base}-${suffix++}`
  return slug
}

export async function deleteCard(cardId: string): Promise<void> {
  const timer = saveTimers.get(cardId)
  if (timer) {
    window.clearTimeout(timer)
    saveTimers.delete(cardId)
  }
  await saveQueues.get(cardId)?.catch(() => undefined)
  await callRpc<void>("multideck_contact_card_delete", { p_card_id: cardId })
  const deleted = state.cards.find((card) => card.id === cardId)
  detailCardIds.delete(cardId)
  if (deleted?.slug) detailCardIds.delete(deleted.slug)
  commit(state.cards.filter((card) => card.id !== cardId))
}

export async function setCardStatus(cardId: string, status: ContactCard["status"]): Promise<void> {
  const previous = state.cards.find((card) => card.id === cardId)
  if (!previous) throw new Error("This contact card is no longer available.")
  const next = { ...previous, status }
  commit(state.cards.map((card) => card.id === cardId ? next : card))
  try {
    await persistCard(next)
  } catch (error) {
    commit(state.cards.map((card) => card.id === cardId ? { ...card, status: previous.status } : card))
    throw error
  }
}

export async function retryCardSave(cardId: string): Promise<void> {
  const card = state.cards.find((item) => item.id === cardId)
  if (!card) throw new Error("This contact card is no longer available.")
  await persistCard(card)
}

export function updateBranding(cardId: string, update: Partial<CardBranding>) {
  updateCard(cardId, (card) => ({ ...card, branding: { ...card.branding, ...update, brandSource: update.brandSource ?? "custom" } }))
}

export const MAX_LOGO_BYTES = 512 * 1024
export function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("unsupported"))
    if (file.size > MAX_LOGO_BYTES) return reject(new Error("too-large"))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("unreadable"))
    reader.readAsDataURL(file)
  })
}

export function updateAutomation(cardId: string, update: (automation: ContactCard["automation"]) => ContactCard["automation"]) {
  updateCard(cardId, (card) => ({ ...card, automation: { ...update(card.automation), hasUnpublishedChanges: true } }))
}

async function persistAutomationTransition(
  cardId: string,
  update: (automation: ContactCard["automation"]) => ContactCard["automation"],
): Promise<void> {
  const previous = state.cards.find((card) => card.id === cardId)
  if (!previous) throw new Error("This contact card is no longer available.")

  // Explicit lifecycle actions must own the next write. Cancel the debounced
  // draft save so it cannot run after a failed transition and silently apply
  // the state the UI just rolled back.
  const timer = saveTimers.get(cardId)
  if (timer) {
    window.clearTimeout(timer)
    saveTimers.delete(cardId)
  }

  const nextAutomation = update(previous.automation)
  const next = { ...previous, automation: nextAutomation }
  commit(state.cards.map((card) => card.id === cardId ? next : card))

  try {
    await persistCard(next)
  } catch (error) {
    // Do not overwrite edits made while the request was in flight. Roll back
    // only when this failed transition is still the state shown to the user.
    commit(state.cards.map((card) => card.id === cardId && card.automation === nextAutomation
      ? { ...card, automation: previous.automation }
      : card))
    throw error
  }
}

export function publishAutomation(cardId: string): Promise<void> {
  return persistAutomationTransition(cardId, (automation) => ({
    ...automation,
    state: "active",
    hasUnpublishedChanges: false,
    autoPausedReason: null,
    failures: 0,
  }))
}

export function pauseAutomation(cardId: string): Promise<void> {
  return persistAutomationTransition(cardId, (automation) => ({ ...automation, state: "paused" }))
}

export function resumeAutomation(cardId: string): Promise<void> {
  return persistAutomationTransition(cardId, (automation) => ({ ...automation, state: "active", autoPausedReason: null, failures: 0 }))
}

export function turnAutomationOff(cardId: string): Promise<void> {
  return persistAutomationTransition(cardId, (automation) => ({ ...automation, state: "off" }))
}
export async function sendAutomationTest() { throw new Error("Email test delivery is not configured for this workspace.") }

export async function testAutomation(cardId: string) {
  await callRpc("multideck_contact_card_test_automation", { p_card_id: cardId })
  await reloadContactCards()
}

export async function rerunAutomationRun(runId: string) {
  await callRpc("multideck_contact_card_rerun", { p_run_id: runId })
  await reloadContactCards()
}

export function findCardBySlug(slug: string) { return state.cards.find((card) => card.slug === slug) ?? publicCardCache.get(slug) ?? null }

function mapPublicCard(row: Record<string, unknown>): ContactCard {
  return mapWorkspace({ cards: [row], automations: [], conditions: [], actions: [], scans: [], exchanges: [] })[0]
}

type PublishedCardOwnerProfile = Pick<ContactCard["person"], "fullName" | "role" | "company" | "email" | "phone" | "website" | "profileImageDataUrl"> & {
  tenantBranding?: {
    displayName: string
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    surfaceColor: string
    textColor: string
    appearanceMode: "light" | "dark"
    cornerStyle: "rounded" | "sharp"
    logoUrl: string | null
  }
}

async function loadPublishedCardOwnerProfile(slug: string, preview = false): Promise<PublishedCardOwnerProfile | null> {
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) return null
  const session = preview ? await getSupabaseSession() : null
  const response = await fetch(`${supabaseFunctionsUrl}/contact-card-profile?slug=${encodeURIComponent(slug)}${preview ? "&preview=true" : ""}`, {
    headers: { apikey: supabasePublicApiKey, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error("The card owner's profile could not be loaded.")
  return response.json() as Promise<PublishedCardOwnerProfile>
}

function applyOwnerAndTenantBrand(card: ContactCard, profile: PublishedCardOwnerProfile | null) {
  if (!profile) return card
  const { tenantBranding, ...person } = profile
  if (!tenantBranding || card.branding.brandSource !== "tenant") return { ...card, person: { ...card.person, ...person } }
  return {
    ...card,
    person: { ...card.person, ...person, company: tenantBranding.displayName || person.company },
    tenantName: tenantBranding.displayName || card.tenantName,
    branding: {
      ...card.branding,
      brandSource: "tenant" as const,
      accent: tenantBranding.primaryColor,
      secondary: tenantBranding.secondaryColor,
      background: tenantBranding.backgroundColor,
      surface: tenantBranding.surfaceColor,
      textColor: tenantBranding.textColor,
      theme: tenantBranding.appearanceMode,
      cornerStyle: tenantBranding.cornerStyle === "sharp" ? "sharp" as const : "soft" as const,
      logoDataUrl: tenantBranding.logoUrl,
    },
  }
}

export async function loadPublicCard(slug: string, preview = false): Promise<ContactCard | null> {
  const local = findCardBySlug(slug)
  if (local) {
    const ownerProfile = local.status === "published" || preview ? await loadPublishedCardOwnerProfile(slug, preview).catch(() => null) : null
    return applyOwnerAndTenantBrand(local, ownerProfile)
  }
  const row = await callRpc<Record<string, unknown> | null>(
    preview ? "multideck_contact_card_preview" : "multideck_public_contact_card",
    { p_slug: slug },
  )
  if (!row) return null
  const card = mapPublicCard(row)
  const ownerProfile = card.status === "published" || preview ? await loadPublishedCardOwnerProfile(slug, preview).catch(() => null) : null
  const resolvedCard = applyOwnerAndTenantBrand(card, ownerProfile)
  if (!preview) publicCardCache.set(slug, resolvedCard)
  return resolvedCard
}

function scanShape(): Pick<CardScan, "device" | "browser" | "channel" | "country" | "region"> {
  const agent = navigator.userAgent
  const device: CardScan["device"] = /iPad|Tablet/i.test(agent) ? "tablet" : /Mobi|Android|iPhone/i.test(agent) ? "mobile" : "desktop"
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /Firefox\//.test(agent) ? "Firefox" : "Other"
  return { device, browser, channel: "direct-scan", country: "", region: "" }
}

export async function recordScan(cardId: string, preview: boolean) {
  if (preview) return null
  const card = state.cards.find((item) => item.id === cardId) ?? [...publicCardCache.values()].find((item) => item.id === cardId)
  if (!card) return null
  const shape = scanShape()
  return callRpc<string | null>("multideck_contact_card_record_scan", {
    p_slug: card.slug, p_device: shape.device, p_browser: shape.browser, p_channel: shape.channel, p_country: shape.country, p_region: shape.region,
  })
}

export function recordFormStarted(_cardId: string, scanId: string | null) {
  if (scanId) void callRpc<void>("multideck_contact_card_mark_started", { p_scan_id: scanId })
}

export type ExchangeInput = { firstName: string; lastName: string; email: string; company: string; phone: string; marketingConsent: boolean }
export type ExchangeResult = { outcome: CardExchange["outcome"]; exchange: CardExchange }

export async function submitExchange(cardId: string, scanId: string | null, input: ExchangeInput, preview: boolean): Promise<ExchangeResult> {
  const card = state.cards.find((item) => item.id === cardId) ?? [...publicCardCache.values()].find((item) => item.id === cardId)
  if (!card) throw new Error("This contact card is not active.")
  if (preview) {
    const exchange: CardExchange = { id: crypto.randomUUID(), ...input, at: new Date().toISOString(), outcome: "created", automationOutcome: "none", automationDetail: "Preview submission — nothing was saved." }
    return { outcome: exchange.outcome, exchange }
  }
  const result = await callRpc<{ outcome: CardExchange["outcome"]; automationOutcome: "succeeded" | "failed" | "skipped" | "running" }>("multideck_contact_card_submit_exchange", { p_slug: card.slug, p_scan_id: scanId, p_input: input })
  const automationOutcome: CardExchange["automationOutcome"] = result.automationOutcome === "succeeded" ? "ran" : result.automationOutcome === "running" ? "none" : result.automationOutcome
  const exchange: CardExchange = { id: crypto.randomUUID(), ...input, email: input.email.trim().toLowerCase(), at: new Date().toISOString(), outcome: result.outcome, automationOutcome, automationDetail: automationOutcome === "ran" ? "Connected CRM actions completed." : automationOutcome === "failed" ? "An automation step failed. The input was preserved for rerun." : "The automation was off or a condition did not match." }
  return { outcome: result.outcome, exchange }
}

export function cardPublicPath(card: ContactCard) { return `/card/${card.slug}` }
export function cardPublicUrl(card: ContactCard) { return `${typeof window === "undefined" ? "https://app.multideck.solutions" : window.location.origin}${cardPublicPath(card)}` }
function escapeVCard(value: string) { return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\\n/g, "\\n") }
export function buildVCard(card: ContactCard) {
  const [firstName, ...rest] = card.person.fullName.split(" ")
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escapeVCard(rest.join(" "))};${escapeVCard(firstName)};;;`, `FN:${escapeVCard(card.person.fullName)}`, `ORG:${escapeVCard(card.person.company)}`, `TITLE:${escapeVCard(card.person.role)}`, `EMAIL;TYPE=INTERNET,WORK:${escapeVCard(card.person.email)}`]
  if (card.showPhone && card.person.phone) lines.push(`TEL;TYPE=CELL,WORK:${escapeVCard(card.person.phone)}`)
  if (card.showWebsite && card.person.website) lines.push(`URL:https://${escapeVCard(card.person.website)}`)
  for (const link of card.person.socialLinks.filter((item) => item.enabled && item.value.trim() && !["email", "website"].includes(item.kind))) {
    const value = link.value.trim()
    const url = /^https?:\/\//i.test(value)
      ? value
      : link.kind === "linkedin"
        ? `https://linkedin.com/in/${value.replace(/^@/, "")}`
        : link.kind === "facebook"
          ? `https://facebook.com/${value.replace(/^@/, "")}`
          : link.kind === "instagram"
            ? `https://instagram.com/${value.replace(/^@/, "")}`
            : `https://wa.me/${value.replace(/[^0-9]/g, "")}`
    lines.push(`X-SOCIALPROFILE;TYPE=${link.kind.toUpperCase()}:${escapeVCard(url)}`)
  }
  lines.push("END:VCARD")
  return lines.join("\\r\\n")
}
export function downloadFile(filename: string, contents: string | Blob, mimeType = "text/plain") {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove()
}

export function useSortedCards() {
  const store = useContactCardStore()
  const sort = useCallback((cards: ContactCard[]) => [...cards].sort((a, b) => (b.exchanges.at(-1)?.at ?? b.createdAt).localeCompare(a.exchanges.at(-1)?.at ?? a.createdAt)), [])
  return { ...store, cards: sort(store.cards) }
}

export { cardTotals, isExternalAction }
