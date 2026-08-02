/** Shared QR contact-card types, defaults, and analytics derived from Supabase rows. */

import type { QrEyeStyle, QrModuleStyle } from "@/lib/qr-code"

export type ContactCardStatus = "draft" | "published" | "paused"

export type CardPerson = {
  fullName: string
  role: string
  company: string
  email: string
  phone: string
  website: string
}

export type CardTheme = "light" | "dark" | "tinted"
export type CardHeaderStyle = "none" | "bar" | "band" | "cover"
export type CardLayout = "classic" | "centred" | "compact"

/**
 * Everything a card owner can restyle. The accent is theirs to choose freely;
 * whether it is allowed behind button text is decided at render time from its
 * contrast, not from trust.
 */
export type CardBranding = {
  accent: string
  theme: CardTheme
  headerStyle: CardHeaderStyle
  layout: CardLayout
  cornerStyle: "soft" | "sharp"
  /** Persisted with the card record so the logo survives across devices. */
  logoDataUrl: string | null
  logoInQr: boolean
  qrModuleStyle: QrModuleStyle
  qrEyeStyle: QrEyeStyle
  qrDark: string
  qrLight: string
}

export function defaultBranding(accent = "#1f6f68"): CardBranding {
  return {
    accent,
    theme: "light",
    headerStyle: "bar",
    layout: "classic",
    cornerStyle: "soft",
    logoDataUrl: null,
    logoInQr: false,
    qrModuleStyle: "rounded",
    qrEyeStyle: "rounded",
    qrDark: "#0b1413",
    qrLight: "#ffffff",
  }
}

export type AutomationConditionKind =
  | "free-email"
  | "known-company"
  | "new-lead"
  | "email-domain"
  | "within-dates"

export type AutomationCondition = {
  id: string
  kind: AutomationConditionKind
  /** Every condition reads as "is" or "is not" so the list stays scannable. */
  negated: boolean
  value: string
  enabled: boolean
}

export type AutomationActionKind =
  | "assign-owner"
  | "pipeline-stage"
  | "add-to-list"
  | "create-task"
  | "notify-user"
  | "send-email"

export type AutomationAction = {
  id: string
  kind: AutomationActionKind
  enabled: boolean
  /** Free-form per-kind settings; the drawer knows which keys each kind uses. */
  config: Record<string, string>
  delayMinutes: number
}

export type AutomationState = "off" | "active" | "paused"

export type CardAutomation = {
  state: AutomationState
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  /** Set when the builder has edits that have not been published yet. */
  hasUnpublishedChanges: boolean
  lastRunAt: string | null
  runsToday: number
  failures: number
  /** Populated when repeated failures forced the automation to stop. */
  autoPausedReason: string | null
}

export type CardScanChannel = "direct-scan" | "shared-link" | "in-app-browser" | "unknown"
export type CardScanDevice = "mobile" | "tablet" | "desktop"

/**
 * One row per scan. Started and exchanged are flags on the same record so the
 * funnel, timeline and breakdowns can never disagree with one another.
 */
export type CardScan = {
  id: string
  at: string
  device: CardScanDevice
  browser: string
  channel: CardScanChannel
  country: string
  region: string
  started: boolean
  exchanged: boolean
}

export type CardExchangeOutcome = "created" | "matched"
export type CardAutomationOutcome = "ran" | "skipped" | "failed" | "none"

export type CardExchange = {
  id: string
  firstName: string
  lastName: string
  email: string
  company: string
  phone: string
  marketingConsent: boolean
  at: string
  outcome: CardExchangeOutcome
  automationOutcome: CardAutomationOutcome
  automationDetail: string
}

export type ContactCard = {
  id: string
  ownerUserId: string
  slug: string
  /** The card's own label in the register, distinct from the person's name. */
  label: string
  context: string
  status: ContactCardStatus
  person: CardPerson
  branding: CardBranding
  /** Optional secondary setup: the source stamped on every lead this card makes. */
  leadSource: string
  publicHeading: string
  publicSubheading: string
  submitLabel: string
  thanksHeading: string
  thanksBody: string
  phoneField: "optional" | "required" | "hidden"
  showPhone: boolean
  showWebsite: boolean
  consentEnabled: boolean
  consentCopy: string
  privacyUrl: string
  automation: CardAutomation
  createdAt: string
  scans: CardScan[]
  exchanges: CardExchange[]
}

export const AUTOMATION_CONDITION_LABELS: Record<AutomationConditionKind, { label: string; describe: (condition: AutomationCondition) => string; needsValue: boolean }> = {
  "free-email": {
    label: "Free email address",
    describe: (condition) => `Email address ${condition.negated ? "is not" : "is"} a free provider`,
    needsValue: false,
  },
  "known-company": {
    label: "Matches an existing customer",
    describe: (condition) => `Company ${condition.negated ? "does not match" : "matches"} an existing customer`,
    needsValue: false,
  },
  "new-lead": {
    label: "New lead",
    describe: (condition) => (condition.negated ? "Lead already exists in the CRM" : "Lead is new to the CRM"),
    needsValue: false,
  },
  "email-domain": {
    label: "Email domain",
    describe: (condition) => `Email domain ${condition.negated ? "is not" : "is"} ${condition.value || "…"}`,
    needsValue: true,
  },
  "within-dates": {
    label: "Shared during event dates",
    describe: (condition) => `Shared ${condition.negated ? "outside" : "within"} ${condition.value || "the event dates"}`,
    needsValue: true,
  },
}

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionKind, { label: string; external: boolean; describe: (action: AutomationAction) => string }> = {
  "assign-owner": {
    label: "Assign owner",
    external: false,
    describe: (action) => `Assign the lead to ${action.config.owner || "the card owner"}`,
  },
  "pipeline-stage": {
    label: "Add to pipeline",
    external: false,
    describe: (action) => `Add to ${action.config.pipeline || "a pipeline"}, stage ${action.config.stage || "New"}`,
  },
  "add-to-list": {
    label: "Add to list",
    external: false,
    describe: (action) => `Add the lead to ${action.config.list || "a list"}`,
  },
  "create-task": {
    label: "Create a task",
    external: false,
    describe: (action) => {
      const days = Number(action.config.dueInDays ?? "1")
      const due = days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`
      return `Create a task for ${action.config.assignee || "the owner"}, ${due}`
    },
  },
  "notify-user": {
    label: "Notify a user",
    external: false,
    describe: (action) => `Notify ${action.config.user || "the card owner"} in Multideck`,
  },
  "send-email": {
    label: "Send an email",
    external: true,
    describe: (action) =>
      `Send "${action.config.template || "a template"}" from ${action.config.from || "the card owner"}${action.delayMinutes ? `, ${formatDelay(action.delayMinutes)} after the exchange` : " immediately"}`,
  },
}

export function formatDelay(minutes: number) {
  if (minutes <= 0) return "immediately"
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

/** True when an action reaches a person outside the workspace. */
export function isExternalAction(action: AutomationAction) {
  return AUTOMATION_ACTION_LABELS[action.kind].external
}

export function hasLiveExternalAction(automation: CardAutomation) {
  return automation.state === "active" && automation.actions.some((action) => action.enabled && isExternalAction(action))
}

/* -------------------------------------------------------------------------- */
/* New-card defaults                                                          */
/* -------------------------------------------------------------------------- */

export type ContactCardOwnerOption = { id: string; name: string; email: string }
export type ContactCardPipelineOption = {
  id: string
  name: string
  stages: { id: string; name: string; isDefaultEntry: boolean }[]
}

export function defaultAutomation(
  ownerName: string,
  ownerId = "",
  pipeline?: ContactCardPipelineOption,
): CardAutomation {
  const stage = pipeline?.stages.find((item) => item.isDefaultEntry) ?? pipeline?.stages[0]
  const actions: AutomationAction[] = [
    {
      id: crypto.randomUUID(),
      kind: "assign-owner",
      enabled: true,
      config: { owner: ownerName, ownerId },
      delayMinutes: 0,
    },
  ]

  if (pipeline && stage) {
    actions.push({
      id: crypto.randomUUID(),
      kind: "pipeline-stage",
      enabled: true,
      config: { pipeline: pipeline.name, pipelineId: pipeline.id, stage: stage.name, stageId: stage.id },
      delayMinutes: 0,
    })
  }

  return {
    state: "active",
    conditions: [],
    actions,
    hasUnpublishedChanges: false,
    lastRunAt: null,
    runsToday: 0,
    failures: 0,
    autoPausedReason: null,
  }
}
/* -------------------------------------------------------------------------- */
/* Derived analytics                                                           */
/* -------------------------------------------------------------------------- */

export type CardTotals = {
  scans: number
  uniqueScans: number
  started: number
  exchanges: number
  leadsCreated: number
  leadsMatched: number
  conversion: number | null
}

/** A scan and a repeat scan from the same visitor inside 30 minutes are one visit. */
const VISIT_WINDOW_MS = 30 * 60 * 1000

export function cardTotals(card: ContactCard): CardTotals {
  const scans = card.scans.length
  const sorted = [...card.scans].sort((a, b) => a.at.localeCompare(b.at))

  let uniqueScans = 0
  const lastSeen = new Map<string, number>()
  for (const scan of sorted) {
    const fingerprint = `${scan.device}-${scan.browser}-${scan.region}`
    const at = new Date(scan.at).getTime()
    const previous = lastSeen.get(fingerprint)
    if (previous === undefined || at - previous > VISIT_WINDOW_MS) uniqueScans += 1
    lastSeen.set(fingerprint, at)
  }

  const started = card.scans.filter((scan) => scan.started).length
  const exchanges = card.exchanges.length
  const leadsCreated = card.exchanges.filter((exchange) => exchange.outcome === "created").length

  return {
    scans,
    uniqueScans,
    started,
    exchanges,
    leadsCreated,
    leadsMatched: exchanges - leadsCreated,
    conversion: uniqueScans > 0 ? exchanges / uniqueScans : null,
  }
}

export type TimelinePoint = { label: string; iso: string; scans: number; exchanges: number }

export function cardTimeline(card: ContactCard, granularity: "hour" | "day"): TimelinePoint[] {
  if (card.scans.length === 0) return []

  const buckets = new Map<string, TimelinePoint>()
  const keyFor = (date: Date) =>
    granularity === "hour"
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

  const labelFor = (date: Date) =>
    granularity === "hour"
      ? `${String(date.getHours()).padStart(2, "0")}:00`
      : date.toLocaleDateString(undefined, { day: "numeric", month: "short" })

  const range = granularity === "hour" ? card.scans.slice(-400) : card.scans

  for (const scan of range) {
    const date = new Date(scan.at)
    const key = keyFor(date)
    const existing = buckets.get(key)
    if (existing) {
      existing.scans += 1
      if (scan.exchanged) existing.exchanges += 1
      continue
    }
    buckets.set(key, { label: labelFor(date), iso: date.toISOString(), scans: 1, exchanges: scan.exchanged ? 1 : 0 })
  }

  return [...buckets.values()].sort((a, b) => a.iso.localeCompare(b.iso))
}

export type BreakdownRow = { name: string; value: number; share: number }

function tally(values: string[]): BreakdownRow[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const total = values.length || 1

  return [...counts.entries()]
    .map(([name, value]) => ({ name, value, share: value / total }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export const CHANNEL_LABELS: Record<CardScanChannel, string> = {
  "direct-scan": "Direct scan",
  "shared-link": "Shared link",
  "in-app-browser": "In-app browser",
  unknown: "Unknown",
}

export const DEVICE_LABELS: Record<CardScanDevice, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
}

export function deviceBreakdown(card: ContactCard) {
  return tally(card.scans.map((scan) => DEVICE_LABELS[scan.device]))
}

export function browserBreakdown(card: ContactCard) {
  return tally(card.scans.map((scan) => scan.browser))
}

export function channelBreakdown(card: ContactCard) {
  return tally(card.scans.map((scan) => CHANNEL_LABELS[scan.channel]))
}

/** Buckets below this size are folded into "Other" so small counts cannot identify a visitor. */
export const LOCATION_SUPPRESSION_THRESHOLD = 5

export function locationBreakdown(card: ContactCard) {
  const rows = tally(card.scans.map((scan) => `${scan.region}, ${scan.country}`))
  const kept = rows.filter((row) => row.value >= LOCATION_SUPPRESSION_THRESHOLD)
  const suppressed = rows.filter((row) => row.value < LOCATION_SUPPRESSION_THRESHOLD)

  if (suppressed.length === 0) return { rows: kept, suppressedRegions: 0, suppressedScans: 0 }

  const suppressedScans = suppressed.reduce((sum, row) => sum + row.value, 0)
  const total = card.scans.length || 1

  return {
    rows: [...kept, { name: "Other regions", value: suppressedScans, share: suppressedScans / total }],
    suppressedRegions: suppressed.length,
    suppressedScans,
  }
}

export function automationOutcomeBreakdown(card: ContactCard) {
  const labels: Record<CardAutomationOutcome, string> = {
    ran: "Ran",
    skipped: "Skipped by a condition",
    failed: "Failed",
    none: "Automation off",
  }
  return tally(card.exchanges.map((exchange) => labels[exchange.automationOutcome]))
}
