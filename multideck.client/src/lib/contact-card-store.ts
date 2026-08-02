import { useCallback, useSyncExternalStore } from "react"
import {
  cardTotals,
  defaultAutomation,
  defaultBranding,
  isExternalAction,
  type CardBranding,
  type CardExchange,
  type CardScan,
  type ContactCard,
  type ContactCardOwnerOption,
  type ContactCardPipelineOption,
} from "@/data/contact-card-data"
import { getSupabaseSession, supabase } from "@/lib/supabase"

export type StoreStatus = "loading" | "ready" | "error"
export type SaveStatus = "idle" | "saving" | "saved" | "error"

type StoreState = {
  status: StoreStatus
  error: string | null
  cards: ContactCard[]
  pipelines: ContactCardPipelineOption[]
  owners: ContactCardOwnerOption[]
  currentUserId: string | null
  save: { status: SaveStatus; cardId: string | null }
}

type WorkspacePayload = {
  cards?: Record<string, unknown>[]
  automations?: Record<string, unknown>[]
  conditions?: Record<string, unknown>[]
  actions?: Record<string, unknown>[]
  scans?: Record<string, unknown>[]
  exchanges?: Record<string, unknown>[]
  pipelines?: ContactCardPipelineOption[]
  owners?: ContactCardOwnerOption[]
}

let state: StoreState = {
  status: "loading",
  error: null,
  cards: [],
  pipelines: [],
  owners: [],
  currentUserId: null,
  save: { status: "idle", cardId: null },
}
const listeners = new Set<() => void>()
const saveTimers = new Map<string, number>()
const publicCardCache = new Map<string, ContactCard>()
let loadPromise: Promise<void> | null = null

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

function mapWorkspace(payload: WorkspacePayload): ContactCard[] {
  const automations = new Map((payload.automations ?? []).map((row) => [text(row, "ContactCard_ID"), row]))
  const conditions = payload.conditions ?? []
  const actions = payload.actions ?? []
  const scans = payload.scans ?? []
  const exchanges = payload.exchanges ?? []

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
    const today = new Date().toDateString()

    return {
      id,
      ownerUserId: text(row, "Owner_User_ID"),
      slug: text(row, "ContactCard_Slug"),
      label: text(row, "ContactCard_Label"),
      context: text(row, "ContactCard_Context"),
      status: text(row, "ContactCard_Status", "draft") as ContactCard["status"],
      person: (row.ContactCard_Person ?? {}) as ContactCard["person"],
      branding: { ...defaultBranding(), ...((row.ContactCard_Branding ?? {}) as CardBranding) },
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
        runsToday: cardExchanges.filter((item) => item.automationOutcome === "ran" && new Date(item.at).toDateString() === today).length,
        failures: cardExchanges.filter((item) => item.automationOutcome === "failed").length,
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
      },
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

async function loadWorkspace() {
  emit({ status: "loading", error: null })
  try {
    const session = await getSupabaseSession()
    const payload = await callRpc<WorkspacePayload>("multideck_contact_cards_workspace")
    const owners = payload.owners ?? []
    emit({
      status: "ready",
      error: null,
      cards: mapWorkspace(payload),
      pipelines: payload.pipelines ?? [],
      owners,
      currentUserId: owners.find((owner) => owner.email.toLowerCase() === session?.user.email?.toLowerCase())?.id ?? owners[0]?.id ?? null,
    })
  } catch (error) {
    emit({ status: "error", error: error instanceof Error ? error.message : "Unable to load your contact cards. Check your connection and try again.", cards: [] })
  }
}

function ensureLoaded() {
  if (!loadPromise) loadPromise = loadWorkspace()
}

export function reloadContactCards() {
  loadPromise = loadWorkspace()
  return loadPromise
}

export function useContactCardStore() {
  ensureLoaded()
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export function useContactCard(cardId: string | null) {
  const store = useContactCardStore()
  const card = cardId ? store.cards.find((item) => item.id === cardId || item.slug === cardId) ?? null : null
  return { ...store, card }
}

function commit(cards: ContactCard[]) {
  emit({ cards })
}

async function persistCard(card: ContactCard) {
  emit({ save: { status: "saving", cardId: card.id } })
  try {
    await callRpc<string>("multideck_contact_card_save", { p_card: card })
    emit({ save: { status: "saved", cardId: card.id } })
    window.setTimeout(() => {
      if (state.save.cardId === card.id && state.save.status === "saved") emit({ save: { status: "idle", cardId: null } })
    }, 1800)
  } catch (error) {
    emit({ save: { status: "error", cardId: card.id }, error: error instanceof Error ? error.message : "Unable to save this card. Check your connection and try again." })
  }
}

function queueSave(card: ContactCard) {
  const existing = saveTimers.get(card.id)
  if (existing) window.clearTimeout(existing)
  saveTimers.set(card.id, window.setTimeout(() => {
    saveTimers.delete(card.id)
    void persistCard(state.cards.find((item) => item.id === card.id) ?? card)
  }, 450))
}

export function updateCard(cardId: string, update: (card: ContactCard) => ContactCard) {
  const cards = state.cards.map((card) => (card.id === cardId ? update(card) : card))
  commit(cards)
  const card = cards.find((item) => item.id === cardId)
  if (card) queueSave(card)
}

export function createCard(input: {
  label: string
  context: string
  fullName: string
  role: string
  company: string
  email: string
  phone: string
  leadSource: string
}): ContactCard {
  const owner = state.owners.find((item) => item.id === state.currentUserId) ?? state.owners[0]
  const pipeline = state.pipelines[0]
  const id = crypto.randomUUID()
  const slug = uniqueSlug(input.fullName || input.label)
  const card: ContactCard = {
    id,
    ownerUserId: owner?.id ?? "",
    slug,
    label: input.label || input.fullName,
    context: input.context,
    status: "draft",
    person: { fullName: input.fullName, role: input.role, company: input.company || "Multideck", email: input.email, phone: input.phone, website: "multideck.solutions" },
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
    consentEnabled: false,
    consentCopy: "",
    privacyUrl: "https://multideck.solutions/privacy",
    automation: defaultAutomation(owner?.name ?? input.fullName, owner?.id ?? "", pipeline),
    createdAt: new Date().toISOString(),
    scans: [],
    exchanges: [],
  }
  commit([card, ...state.cards])
  void persistCard(card)
  return card
}

function uniqueSlug(source: string) {
  const base = source.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card"
  let slug = base
  let suffix = 2
  while (state.cards.some((card) => card.slug === slug)) slug = `${base}-${suffix++}`
  return slug
}

export function deleteCard(cardId: string) {
  const previous = state.cards
  commit(previous.filter((card) => card.id !== cardId))
  void callRpc<void>("multideck_contact_card_delete", { p_card_id: cardId }).catch((error) => {
    commit(previous)
    emit({ error: error instanceof Error ? error.message : "Unable to delete this card. Try again." })
  })
}

export function setCardStatus(cardId: string, status: ContactCard["status"]) {
  updateCard(cardId, (card) => ({ ...card, status }))
}

export function updateBranding(cardId: string, update: Partial<CardBranding>) {
  updateCard(cardId, (card) => ({ ...card, branding: { ...card.branding, ...update } }))
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
export function publishAutomation(cardId: string) {
  updateCard(cardId, (card) => ({ ...card, automation: { ...card.automation, state: "active", hasUnpublishedChanges: false, autoPausedReason: null, failures: 0 } }))
}
export function pauseAutomation(cardId: string) { updateCard(cardId, (card) => ({ ...card, automation: { ...card.automation, state: "paused" } })) }
export function resumeAutomation(cardId: string) { updateCard(cardId, (card) => ({ ...card, automation: { ...card.automation, state: "active", autoPausedReason: null, failures: 0 } })) }
export function turnAutomationOff(cardId: string) { updateCard(cardId, (card) => ({ ...card, automation: { ...card.automation, state: "off" } })) }
export async function sendAutomationTest() { throw new Error("Email test delivery is not configured for this workspace.") }

export function findCardBySlug(slug: string) { return state.cards.find((card) => card.slug === slug) ?? publicCardCache.get(slug) ?? null }

function mapPublicCard(row: Record<string, unknown>): ContactCard {
  return mapWorkspace({ cards: [row], automations: [], conditions: [], actions: [], scans: [], exchanges: [] })[0]
}

export async function loadPublicCard(slug: string): Promise<ContactCard | null> {
  const local = findCardBySlug(slug)
  if (local) return local
  const row = await callRpc<Record<string, unknown> | null>("multideck_public_contact_card", { p_slug: slug })
  if (!row) return null
  const card = mapPublicCard(row)
  publicCardCache.set(slug, card)
  return card
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
  const result = await callRpc<{ outcome: CardExchange["outcome"]; exchangeId: string }>("multideck_contact_card_submit_exchange", { p_slug: card.slug, p_scan_id: scanId, p_input: input })
  const exchange: CardExchange = { id: result.exchangeId, ...input, email: input.email.trim().toLowerCase(), at: new Date().toISOString(), outcome: result.outcome, automationOutcome: "ran", automationDetail: "Saved to Supabase CRM." }
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
