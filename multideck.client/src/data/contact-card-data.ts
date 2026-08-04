/** Shared QR contact-card types and defaults. Analytics are calculated by Supabase. */

import type { QrEyeStyle, QrModuleStyle } from "@/lib/qr-code"

export type ContactCardStatus = "draft" | "published" | "paused"

export type CardPerson = {
  fullName: string
  role: string
  company: string
  email: string
  phone: string
  website: string
  /** Optional portrait used on the public card. The company logo remains separate. */
  profileImageDataUrl: string | null
  socialLinks: CardSocialLink[]
}

export type CardSocialKind = "linkedin" | "facebook" | "instagram" | "whatsapp" | "email" | "website"

export type CardSocialLink = {
  id: string
  kind: CardSocialKind
  value: string
  enabled: boolean
}

export const CARD_SOCIAL_LABELS: Record<CardSocialKind, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  email: "Email",
  website: "Website",
}

export function defaultSocialLinks(email = "", website = ""): CardSocialLink[] {
  return [
    { id: crypto.randomUUID(), kind: "linkedin", value: "", enabled: false },
    { id: crypto.randomUUID(), kind: "facebook", value: "", enabled: false },
    { id: crypto.randomUUID(), kind: "instagram", value: "", enabled: false },
    { id: crypto.randomUUID(), kind: "whatsapp", value: "", enabled: false },
    { id: crypto.randomUUID(), kind: "email", value: email, enabled: Boolean(email) },
    { id: crypto.randomUUID(), kind: "website", value: website, enabled: Boolean(website) },
  ]
}

export type CardTheme = "light" | "dark" | "tinted"
export type CardHeaderStyle = "none" | "bar" | "band" | "cover"
export type CardLayout = "classic" | "editorial" | "compact" | "spotlight"

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
  | "add-to-crm"
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

export type AutomationRunStatus = "succeeded" | "failed" | "skipped" | "running"
export type AutomationRunStepStatus = "succeeded" | "failed" | "skipped"

export type AutomationRunStep = {
  id: string
  actionId: string | null
  kind: string
  label: string
  status: AutomationRunStepStatus
  detail: string
  startedAt: string
  durationMs: number
}

export type AutomationRun = {
  id: string
  exchangeId: string | null
  leadId: string | null
  status: AutomationRunStatus
  startedAt: string
  completedAt: string | null
  durationMs: number
  recordsAffected: number
  trigger: string
  errorSummary: string | null
  recovery: string | null
  input: Record<string, string | boolean>
  rerunOf: string | null
  isTest: boolean
  steps: AutomationRunStep[]
}

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
  runs: AutomationRun[]
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

export type CardTotals = {
  scans: number
  uniqueScans: number
  started: number
  exchanges: number
  leadsCreated: number
  leadsMatched: number
  conversion: number | null
}

export type TimelinePoint = { label: string; iso: string; scans: number; exchanges: number }
export type BreakdownRow = { name: string; value: number; share: number }

export type CardAnalytics = {
  totals: CardTotals
  timelineHour: Omit<TimelinePoint, "label">[]
  timelineDay: Omit<TimelinePoint, "label">[]
  devices: BreakdownRow[]
  browsers: BreakdownRow[]
  channels: BreakdownRow[]
  location: {
    rows: BreakdownRow[]
    suppressedRegions: number
    suppressedScans: number
  }
  automationOutcomes: BreakdownRow[]
  automationRunsToday: number
  automationFailures: number
}

/** Empty database-shaped state used only while a newly created row is being persisted. */
export function emptyCardAnalytics(): CardAnalytics {
  return {
    totals: { scans: 0, uniqueScans: 0, started: 0, exchanges: 0, leadsCreated: 0, leadsMatched: 0, conversion: null },
    timelineHour: [],
    timelineDay: [],
    devices: [],
    browsers: [],
    channels: [],
    location: { rows: [], suppressedRegions: 0, suppressedScans: 0 },
    automationOutcomes: [],
    automationRunsToday: 0,
    automationFailures: 0,
  }
}

export type ContactCard = {
  id: string
  ownerUserId: string
  /** Workspace company name, sourced from cmp_Company rather than the card owner's profile. */
  tenantName: string
  /** Public attribution is on by default, but can be hidden per card. */
  showTenantName: boolean
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
  /** Aggregates and chart buckets returned by the tenant-safe workspace RPC. */
  analytics: CardAnalytics
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
  "add-to-crm": {
    label: "Add to CRM",
    external: false,
    describe: (action) => {
      const recordType = action.config.recordType === "deal" ? "a deal" : "a lead"
      const destination = action.config.pipeline ? ` in ${action.config.pipeline}` : ""
      return `Add ${recordType} to the CRM${destination}`
    },
  },
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
      kind: "add-to-crm",
      enabled: true,
      config: {
        destination: "crm",
        recordType: "lead",
        duplicateHandling: "update",
        owner: ownerName,
        ownerId,
        pipeline: pipeline?.name ?? "",
        pipelineId: pipeline?.id ?? "",
        stage: stage?.name ?? "",
        stageId: stage?.id ?? "",
        fieldMappings: JSON.stringify([
          { source: "firstName", target: "firstName" },
          { source: "lastName", target: "lastName" },
          { source: "email", target: "email" },
          { source: "company", target: "company" },
          { source: "phone", target: "phone" },
        ]),
      },
      delayMinutes: 0,
    },
    {
      id: crypto.randomUUID(),
      kind: "assign-owner",
      enabled: true,
      config: { owner: ownerName, ownerId },
      delayMinutes: 0,
    },
  ]

  return {
    state: "active",
    conditions: [],
    actions,
    hasUnpublishedChanges: false,
    lastRunAt: null,
    runsToday: 0,
    failures: 0,
    autoPausedReason: null,
    runs: [],
  }
}
/* -------------------------------------------------------------------------- */
/* Database-owned analytics presentation helpers                              */
/* -------------------------------------------------------------------------- */

export function cardTotals(card: ContactCard): CardTotals {
  return card.analytics.totals
}

export function cardTimeline(card: ContactCard, granularity: "hour" | "day"): TimelinePoint[] {
  const points = granularity === "hour" ? card.analytics.timelineHour : card.analytics.timelineDay
  const labelFor = (date: Date) =>
    granularity === "hour"
      ? `${String(date.getHours()).padStart(2, "0")}:00`
      : date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return points.map((point) => ({ ...point, label: labelFor(new Date(point.iso)) }))
}

export function deviceBreakdown(card: ContactCard) {
  return card.analytics.devices
}

export function browserBreakdown(card: ContactCard) {
  return card.analytics.browsers
}

export function channelBreakdown(card: ContactCard) {
  return card.analytics.channels
}

/** Buckets below this size are folded into "Other" so small counts cannot identify a visitor. */
export const LOCATION_SUPPRESSION_THRESHOLD = 5

export function locationBreakdown(card: ContactCard) {
  return card.analytics.location
}

export function automationOutcomeBreakdown(card: ContactCard) {
  return card.analytics.automationOutcomes
}
