/**
 * The Inbox wire contract: the types the tenant Edge Function speaks, the
 * readers that turn a response into them, and the pure client-side rules for
 * pagination, caching, selection and outbound payloads.
 *
 * This module deliberately imports nothing. It holds no fetch, no storage and no
 * browser globals, so every rule below — which cursor is next, which thread
 * survives a mailbox switch, what a Reply all is allowed to say — can be tested
 * directly and reasoned about without a running app. `inbox-api.ts` adds the
 * transport on top and re-exports all of it.
 */

export type MailProvider = "gmail" | "outlook"
export type MailboxKind = "personal" | "shared" | "group"
export type ConnectionStatus = "connected" | "syncing" | "reauthorization_required" | "error" | "disconnected"
export type MailboxIndexStatus = "pending" | "indexing" | "ready" | "error"
export type MailFolder = "inbox" | "sent" | "drafts" | "archive" | "spam" | "trash"
export type MailboxFolderRole = MailFolder | "important" | "custom"
export type MailboxFolder = {
  id: string
  mailboxId: string
  parentId: string | null
  role: MailboxFolderRole
  displayName: string
  totalCount: number | null
  unreadCount: number | null
  backgroundColor: string | null
  textColor: string | null
  kind: "system" | "user" | "provider"
}
export type ThreadSummaryStatus = "none" | "pending" | "ready" | "stale" | "failed"
export type MessageDirection = "inbound" | "outbound"
export type SendMode = "new" | "reply" | "reply_all" | "forward"
export type SendStatus = "queued" | "sent" | "failed"
export type AutomaticReplyStatus = "disabled" | "scheduled" | "always_on"
export type AutomaticReplyAudience = "everyone" | "internal_only"

export type AutomaticReplySettings = {
  provider: MailProvider
  supported: boolean
  canUpdate: boolean
  requiresReconnect: boolean
  reason: string | null
  status: AutomaticReplyStatus
  startAt: string | null
  endAt: string | null
  subject: string
  message: string
  audience: AutomaticReplyAudience
}

export type AutomaticReplyUpdate = Pick<
  AutomaticReplySettings,
  "status" | "startAt" | "endAt" | "subject" | "message" | "audience"
>

export type MailAddress = {
  address: string
  displayName: string | null
}

export type InboxConnection = {
  id: string
  provider: MailProvider
  displayName: string
  address: string | null
  /** True only when Microsoft returned both delegated shared-mail scopes. */
  sharedMailboxAccess: boolean
  status: ConnectionStatus
  inboundEnabled: boolean
  outboundEnabled: boolean
  lastSyncedAt: string | null
  error: string | null
}

export type InboxProviderAvailability = {
  provider: MailProvider
  configured: boolean
  adminConsentUrl: string | null
}

export type DexterEmailContextStatus =
  | "available"
  | "indexing"
  | "disabled"
  | "provider_not_configured"
  | "permission_required"
  | "reauthorization_required"
  | "not_connected"
  | "error"

export type DexterEmailContextSource = {
  provider: MailProvider
  enabled: boolean
  configured: boolean
  canRead: boolean
  canAIRead: boolean
  available: boolean
  status: DexterEmailContextStatus
  accessibleMailboxCount: number
  indexStatus: MailboxIndexStatus
  lastSyncedAt: string | null
}

export type EmailConnectionResult = {
  provider: MailProvider
  status: "connected" | "error"
  code: string | null
}

export type InboxThreadDeepLink = {
  provider: MailProvider
  mailboxId: string
  threadId: string
}

export type Mailbox = {
  id: string
  connectionId: string | null
  provider: MailProvider
  kind: MailboxKind
  displayName: string
  address: string
  unreadCount: number
  isDefault: boolean
  inboundEnabled: boolean
  outboundEnabled: boolean
  status: ConnectionStatus
  lastSyncedAt: string | null
  indexStatus: MailboxIndexStatus
  indexedCount: number
  estimatedTotal: number | null
  indexPercent: number
  coreCoverageStart: string
  wasteCoverageStart: string
  coreRetentionMonths: number
  wasteRetentionDays: number
  error: string | null
}

export type ThreadSummaryState = {
  status: ThreadSummaryStatus
  text: string | null
  keyPoints: string[]
  /** Message ids the summary drew on, when the API reports them. */
  sourceMessageIds: string[]
  model: string | null
  updatedAt: string | null
  error: string | null
}

export type InboxThreadListItem = {
  id: string
  mailboxId: string
  provider: MailProvider
  subject: string
  preview: string
  participants: MailAddress[]
  lastMessageAt: string | null
  unreadCount: number
  messageCount: number
  hasAttachments: boolean
  starred: boolean
  archived: boolean
  summary: ThreadSummaryState
}

export type MailAttachment = {
  id: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  isInline: boolean
  /** Matches a `cid:` URL in the sanitised HTML for an embedded email image. */
  contentId: string | null
  scanStatus: "clean" | "pending" | "blocked" | "unknown"
}

export type InboxDeliveryStatus =
  | "sent"
  | "delivered"
  | "opened_estimated"
  | "replied"
  | "failed"
  | "bounced"
  | "no_open_signal"

export type InboxDelivery = {
  status: InboxDeliveryStatus
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  repliedAt: string | null
  failedAt: string | null
  bouncedAt: string | null
  openTrackingEnabled: boolean
  confidence: "confirmed" | "estimated" | "none"
}

/** A file the operator picked in the composer, held in memory until it sends. */
export type OutboundAttachment = {
  /** Client-side identity. The provider assigns the real one when it sends. */
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** Standard base64, no data-URL prefix. */
  contentBase64: string
}

/**
 * What one message may carry. Both providers are held to the same numbers so a
 * file that attaches in Gmail attaches in Outlook too, and the composer can say
 * no before a send fails at the far end.
 */
export const attachmentLimits = {
  maxCount: 10,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 15 * 1024 * 1024,
} as const

export function attachmentTotalBytes(attachments: OutboundAttachment[]) {
  return attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0)
}

/**
 * Why this file cannot be attached, or null when it can. Returns a reason rather
 * than a boolean so the composer names the actual limit that was hit.
 */
export function attachmentRejection(
  file: { name: string; size: number },
  existing: OutboundAttachment[],
): "count" | "file_too_large" | "total_too_large" | "duplicate" | null {
  if (existing.length >= attachmentLimits.maxCount) return "count"
  if (file.size > attachmentLimits.maxFileBytes) return "file_too_large"
  if (attachmentTotalBytes(existing) + file.size > attachmentLimits.maxTotalBytes) return "total_too_large"
  if (existing.some((item) => item.fileName === file.name && item.sizeBytes === file.size)) return "duplicate"
  return null
}

export type InboxMessage = {
  id: string
  threadId: string
  mailboxId: string | null
  direction: MessageDirection
  from: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  subject: string
  sentAt: string | null
  receivedAt: string | null
  bodyText: string | null
  /**
   * Sanitised on the server. The renderer treats it as untrusted markup and
   * never hands it to `dangerouslySetInnerHTML`.
   */
  sanitizedHtml: string | null
  /** False for delivery reports and other automated receipts that must not hijack Reply. */
  replyEligible: boolean
  attachments: MailAttachment[]
  delivery?: InboxDelivery
}

export type InboxThreadDetail = {
  id: string
  mailboxId: string
  subject: string
  starred: boolean
  archived: boolean
  unreadCount: number
  /** A shared mailbox the operator may read but not send from. */
  readOnly: boolean
  /** Exact message count for the complete conversation. */
  messageTotal: number
  /** Number of newer messages skipped by this response page. */
  messageOffset: number
  /** Maximum messages requested for this response page. */
  messageLimit: number
  hasOlderMessages: boolean
  messages: InboxMessage[]
  summary: ThreadSummaryState
}

export type ThreadDetailQuery = {
  offset?: number
  limit?: number
}

export type ThreadPage = {
  items: InboxThreadListItem[]
  nextCursor: string | null
  hasMore: boolean
}

export type InboxDraft = {
  id: string
  threadId: string | null
  mailboxId: string
  mode: SendMode
  sourceMessageId: string | null
  subject: string
  bodyText: string
  trackOpens: boolean
  updatedAt: string | null
}

export type SendReceipt = {
  id: string
  threadId: string | null
  messageId: string | null
  status: SendStatus
  /** True when the idempotency key matched an earlier send. */
  reused: boolean
}

export type ProviderDraftReceipt = {
  id: string
  threadId: string | null
  messageId: string | null
  status: "created" | "creating" | "failed"
  /** True when the idempotency key matched an earlier provider-draft request. */
  reused: boolean
}

/**
 * What the browser is allowed to say about a reply. The server resolves the
 * final recipient list from `mode` plus `sourceMessageId`; the client only ever
 * reports the edits the operator made by hand, so a stale thread in one tab can
 * never quietly drop somebody off a Reply all.
 */
export type SendRequest = {
  mailboxId: string
  mode: SendMode
  sourceMessageId: string | null
  threadId: string | null
  draftId: string | null
  subject: string | null
  bodyText: string
  addedTo: MailAddress[]
  addedCc: MailAddress[]
  addedBcc: MailAddress[]
  removedAddresses: string[]
  attachments: OutboundAttachment[]
  idempotencyKey: string
  trackOpens: boolean
}

export type ThreadQuery = {
  mailboxId: string
  folder?: MailFolder
  folderId?: string | null
  query?: string
  cursor?: string | null
  limit?: number
}

export class InboxApiError extends Error {
  readonly status: number
  readonly code: "unauthenticated" | "reauthorization_required" | "rate_limited" | "offline" | "not_found" | "forbidden" | "server"
  readonly retryAfterSeconds: number | null

  constructor(
    message: string,
    options: { status?: number; code?: InboxApiError["code"]; retryAfterSeconds?: number | null } = {},
  ) {
    super(message)
    this.name = "InboxApiError"
    this.status = options.status ?? 0
    this.code = options.code ?? "server"
    this.retryAfterSeconds = options.retryAfterSeconds ?? null
  }
}

export function isInboxNotFound(error: unknown): error is InboxApiError {
  return error instanceof InboxApiError && error.code === "not_found"
}

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

export function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

export function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function readCount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function readFlag(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

export function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** The first present key wins, so one reader survives a field rename on either side. */
export function pickField(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

export function normalizeProvider(value: unknown): MailProvider {
  const text = readText(value).toLowerCase()
  if (text === "gmail" || text === "google") return "gmail"
  return "outlook"
}

function normalizeMailboxKind(value: unknown, isShared: boolean): MailboxKind {
  const text = readText(value).toLowerCase()
  if (text === "shared") return "shared"
  if (text === "group" || text === "distribution") return "group"
  if (text === "personal" || text === "user") return "personal"
  return isShared ? "shared" : "personal"
}

export function normalizeConnectionStatus(value: unknown): ConnectionStatus {
  const text = readText(value).toLowerCase().replace(/[\s-]+/g, "_")
  if (text === "connected" || text === "active" || text === "healthy") return "connected"
  if (text === "syncing" || text === "initial_sync" || text === "pending") return "syncing"
  if (text === "reauthorization_required" || text === "reauth_required" || text === "reauthorisation_required") {
    return "reauthorization_required"
  }
  if (text === "error" || text === "failed") return "error"
  return "disconnected"
}

function normalizeMailboxIndexStatus(value: unknown, lastSyncedAt: string | null): MailboxIndexStatus {
  const text = readText(value).toLowerCase()
  if (text === "pending" || text === "indexing" || text === "ready" || text === "error") return text
  return lastSyncedAt ? "ready" : "pending"
}

function normalizeAddress(value: unknown): MailAddress | null {
  if (typeof value === "string") {
    return value.trim() ? { address: value.trim(), displayName: null } : null
  }

  const record = readRecord(value)
  const address = readText(pickField(record, "address", "email", "emailAddress")).trim()
  if (!address) return null

  return { address, displayName: readOptionalText(pickField(record, "displayName", "name")) }
}

function normalizeAddresses(value: unknown): MailAddress[] {
  return readList(value).map(normalizeAddress).filter((address): address is MailAddress => address !== null)
}

export function normalizeSummary(value: unknown): ThreadSummaryState {
  if (typeof value === "string") {
    return {
      status: value.trim() ? "ready" : "none",
      text: readOptionalText(value.trim()),
      keyPoints: [],
      sourceMessageIds: [],
      model: null,
      updatedAt: null,
      error: null,
    }
  }

  const record = readRecord(value)
  const text = readOptionalText(pickField(record, "summary", "text"))
  const rawStatus = readText(pickField(record, "status", "state")).toLowerCase()
  const status: ThreadSummaryStatus =
    rawStatus === "pending" || rawStatus === "generating" || rawStatus === "queued" ? "pending" :
    rawStatus === "stale" || rawStatus === "outdated" ? "stale" :
    rawStatus === "failed" || rawStatus === "error" ? "failed" :
    rawStatus === "ready" || rawStatus === "complete" ? "ready" :
    text ? "ready" : "none"

  return {
    status,
    text,
    keyPoints: readList(pickField(record, "keyPoints", "points")).map((point) => readText(point)).filter(Boolean),
    sourceMessageIds: readList(pickField(record, "sourceMessageIds", "messageIds", "citations"))
      .map((entry) => (typeof entry === "string" ? entry : readText(pickField(readRecord(entry), "messageId", "id"))))
      .filter(Boolean),
    model: readOptionalText(pickField(record, "model")),
    updatedAt: readOptionalText(pickField(record, "updatedAt", "generatedAt")),
    error: readOptionalText(pickField(record, "error", "errorMessage")),
  }
}

export function normalizeConnection(value: unknown): InboxConnection {
  const record = readRecord(value)
  return {
    id: readText(pickField(record, "id", "connectionId")),
    provider: normalizeProvider(pickField(record, "provider")),
    displayName: readText(pickField(record, "displayName", "name"), "Mail connection"),
    address: readOptionalText(pickField(record, "address", "email")),
    sharedMailboxAccess: readFlag(pickField(record, "sharedMailboxAccess")),
    status: normalizeConnectionStatus(pickField(record, "status")),
    inboundEnabled: readFlag(pickField(record, "inboundEnabled"), true),
    outboundEnabled: readFlag(pickField(record, "outboundEnabled"), true),
    lastSyncedAt: readOptionalText(pickField(record, "lastSyncedAt")),
    error: readOptionalText(pickField(record, "error", "errorMessage")),
  }
}

export function normalizeProviderAvailability(value: unknown): InboxProviderAvailability {
  const record = readRecord(value)
  const candidateAdminConsentUrl = readOptionalText(pickField(record, "adminConsentUrl", "admin_consent_url"))
  let adminConsentUrl: string | null = null
  if (candidateAdminConsentUrl) {
    try {
      const parsed = new URL(candidateAdminConsentUrl)
      if (parsed.protocol === "https:" && parsed.hostname === "login.microsoftonline.com") {
        adminConsentUrl = parsed.toString()
      }
    } catch {
      adminConsentUrl = null
    }
  }
  return {
    provider: normalizeProvider(pickField(record, "provider")),
    configured: readFlag(pickField(record, "configured")),
    adminConsentUrl,
  }
}

export function normalizeDexterEmailContextSource(value: unknown): DexterEmailContextSource {
  const record = readRecord(value)
  const rawStatus = readText(pickField(record, "status")).toLowerCase()
  const status: DexterEmailContextStatus = [
    "available",
    "indexing",
    "disabled",
    "provider_not_configured",
    "permission_required",
    "reauthorization_required",
    "not_connected",
    "error",
  ].includes(rawStatus)
    ? rawStatus as DexterEmailContextStatus
    : "error"
  const lastSyncedAt = readOptionalText(pickField(record, "lastSyncedAt", "last_synced_at"))

  return {
    provider: normalizeProvider(pickField(record, "provider")),
    enabled: readFlag(pickField(record, "enabled")),
    configured: readFlag(pickField(record, "configured")),
    canRead: readFlag(pickField(record, "canRead", "can_read")),
    canAIRead: readFlag(pickField(record, "canAIRead", "can_ai_read")),
    available: readFlag(pickField(record, "available")),
    status,
    accessibleMailboxCount: readCount(pickField(record, "accessibleMailboxCount", "accessible_mailbox_count")),
    indexStatus: normalizeMailboxIndexStatus(pickField(record, "indexStatus", "index_status"), lastSyncedAt),
    lastSyncedAt,
  }
}

export function readEmailConnectionResult(search: string): EmailConnectionResult | null {
  const params = new URLSearchParams(search)
  const provider = params.get("email_connection")
  const status = params.get("status")
  if ((provider !== "gmail" && provider !== "outlook") || (status !== "connected" && status !== "error")) {
    return null
  }
  const rawCode = params.get("code")?.trim() ?? ""
  return {
    provider,
    status,
    code: rawCode && /^[a-z0-9_]{1,80}$/.test(rawCode) ? rawCode : null,
  }
}

/**
 * Reads only server-issued Inbox citation coordinates. Requiring UUIDs keeps a
 * malformed or hand-built URL from becoming an arbitrary identifier request;
 * the Edge Function remains the final mailbox-access boundary.
 */
export function readInboxThreadDeepLink(search: string): InboxThreadDeepLink | null {
  const params = new URLSearchParams(search)
  const provider = params.get("provider")
  const mailboxId = params.get("mailbox")?.trim() ?? ""
  const threadId = params.get("thread")?.trim() ?? ""
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if ((provider !== "gmail" && provider !== "outlook") || !uuidPattern.test(mailboxId) || !uuidPattern.test(threadId)) {
    return null
  }

  return { provider, mailboxId, threadId }
}

export function normalizeMailbox(value: unknown, fallbackStatus?: ConnectionStatus): Mailbox {
  const record = readRecord(value)
  const isShared = readFlag(pickField(record, "isShared"))
  const rawStatus = pickField(record, "status")
  const lastSyncedAt = readOptionalText(pickField(record, "lastSyncedAt"))
  const indexStatus = normalizeMailboxIndexStatus(pickField(record, "indexStatus", "index_status"), lastSyncedAt)
  const indexedCount = readCount(pickField(record, "indexedCount", "indexed_count"))
  const rawEstimatedTotal = pickField(record, "estimatedTotal", "estimated_total")
  const estimatedTotal = rawEstimatedTotal === null || rawEstimatedTotal === undefined
    ? null
    : readCount(rawEstimatedTotal)
  const reportedPercent = readCount(pickField(record, "indexPercent", "index_percent"), -1)
  const indexPercent = indexStatus === "ready"
    ? 100
    : reportedPercent >= 0
      ? Math.min(99, reportedPercent)
      : estimatedTotal && estimatedTotal > 0
        ? Math.min(99, Math.floor(indexedCount / estimatedTotal * 100))
        : 0

  return {
    id: readText(pickField(record, "id", "mailboxId")),
    connectionId: readOptionalText(pickField(record, "connectionId")),
    provider: normalizeProvider(pickField(record, "provider")),
    kind: normalizeMailboxKind(pickField(record, "kind", "mailboxKind"), isShared),
    displayName: readText(pickField(record, "displayName", "name"), readText(pickField(record, "address"))),
    address: readText(pickField(record, "address", "email")),
    unreadCount: readCount(pickField(record, "unreadCount", "unread")),
    isDefault: readFlag(pickField(record, "isDefault", "isDefaultOutbound")),
    inboundEnabled: readFlag(pickField(record, "inboundEnabled"), true),
    outboundEnabled: readFlag(pickField(record, "outboundEnabled"), true),
    status: rawStatus === undefined ? fallbackStatus ?? "connected" : normalizeConnectionStatus(rawStatus),
    lastSyncedAt,
    indexStatus,
    indexedCount,
    estimatedTotal,
    indexPercent,
    coreCoverageStart: readText(pickField(record, "coreCoverageStart", "core_coverage_start")),
    wasteCoverageStart: readText(pickField(record, "wasteCoverageStart", "waste_coverage_start")),
    coreRetentionMonths: readCount(pickField(record, "coreRetentionMonths", "core_retention_months"), 12),
    wasteRetentionDays: readCount(pickField(record, "wasteRetentionDays", "waste_retention_days"), 30),
    error: readOptionalText(pickField(record, "error", "errorMessage")),
  }
}

export function normalizeMailboxFolder(value: unknown): MailboxFolder {
  const record = readRecord(value)
  const rawRole = readText(pickField(record, "role")).toLowerCase()
  const role: MailboxFolderRole = ["inbox", "sent", "drafts", "archive", "spam", "trash", "important", "custom"].includes(rawRole)
    ? rawRole as MailboxFolderRole
    : "custom"
  const nullableCount = (field: unknown) => field === null || field === undefined ? null : Math.max(0, readCount(field))
  const safeColour = (field: unknown) => {
    const colour = readOptionalText(field)
    return colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null
  }
  const kind = readText(pickField(record, "kind")).toLowerCase()
  return {
    id: readText(pickField(record, "id", "folderId")),
    mailboxId: readText(pickField(record, "mailboxId", "mailbox_id")),
    parentId: readOptionalText(pickField(record, "parentId", "parent_id")),
    role,
    displayName: readText(pickField(record, "displayName", "name"), "Folder"),
    totalCount: nullableCount(pickField(record, "totalCount", "total_count")),
    unreadCount: nullableCount(pickField(record, "unreadCount", "unread_count")),
    backgroundColor: safeColour(pickField(record, "backgroundColor", "background_color")),
    textColor: safeColour(pickField(record, "textColor", "text_color")),
    kind: kind === "system" || kind === "user" ? kind : "provider",
  }
}

export function normalizeAutomaticReplySettings(value: unknown): AutomaticReplySettings {
  const record = readRecord(value)
  const rawStatus = readText(pickField(record, "status")).toLowerCase()
  const rawAudience = readText(pickField(record, "audience")).toLowerCase()
  return {
    provider: normalizeProvider(pickField(record, "provider")),
    supported: readFlag(pickField(record, "supported")),
    canUpdate: readFlag(pickField(record, "canUpdate", "can_update")),
    requiresReconnect: readFlag(pickField(record, "requiresReconnect", "requires_reconnect")),
    reason: readOptionalText(pickField(record, "reason")),
    status: rawStatus === "scheduled" ? "scheduled" : rawStatus === "always_on" ? "always_on" : "disabled",
    startAt: readOptionalText(pickField(record, "startAt", "start_at")),
    endAt: readOptionalText(pickField(record, "endAt", "end_at")),
    subject: readText(pickField(record, "subject")),
    message: readText(pickField(record, "message")),
    audience: rawAudience === "internal_only" ? "internal_only" : "everyone",
  }
}

export function normalizeThreadListItem(value: unknown): InboxThreadListItem {
  const record = readRecord(value)
  const explicitUnread = pickField(record, "unreadCount")
  const isRead = pickField(record, "isRead")

  return {
    id: readText(pickField(record, "id", "threadId")),
    mailboxId: readText(pickField(record, "mailboxId")),
    provider: normalizeProvider(pickField(record, "provider")),
    subject: readText(pickField(record, "subject")),
    preview: readText(pickField(record, "preview", "snippet")),
    participants: normalizeAddresses(pickField(record, "participants", "from")),
    lastMessageAt: readOptionalText(pickField(record, "lastMessageAt", "occurredAt", "receivedAt")),
    // A boolean read flag and a numeric unread count both appear in the wild.
    unreadCount: explicitUnread !== undefined ? readCount(explicitUnread) : isRead === false ? 1 : 0,
    messageCount: readCount(pickField(record, "messageCount"), 1),
    hasAttachments: readFlag(pickField(record, "hasAttachments")),
    starred: readFlag(pickField(record, "starred", "isStarred")),
    archived: readFlag(pickField(record, "archived", "isArchived")),
    summary: normalizeSummary(pickField(record, "summary", "lunaSummary")),
  }
}

function normalizeAttachment(value: unknown): MailAttachment {
  const record = readRecord(value)
  const rawScan = readText(pickField(record, "scanStatus")).toLowerCase()
  const isScanned = pickField(record, "isScanned")

  return {
    id: readText(pickField(record, "id", "attachmentId")),
    fileName: readText(pickField(record, "fileName", "name"), "Attachment"),
    mimeType: readOptionalText(pickField(record, "mimeType", "contentType")),
    sizeBytes: typeof pickField(record, "sizeBytes", "size") === "number" ? readCount(pickField(record, "sizeBytes", "size")) : null,
    isInline: readFlag(pickField(record, "isInline")),
    contentId: readOptionalText(pickField(record, "contentId", "cid")),
    scanStatus:
      rawScan === "clean" || rawScan === "passed" ? "clean" :
      rawScan === "blocked" || rawScan === "infected" ? "blocked" :
      rawScan === "pending" || rawScan === "scanning" ? "pending" :
      isScanned === true ? "clean" : isScanned === false ? "pending" : "unknown",
  }
}

function normalizeMessage(value: unknown, threadId: string): InboxMessage {
  const record = readRecord(value)
  const occurredAt = readOptionalText(pickField(record, "sentAt", "receivedAt", "occurredAt"))
  const direction = readText(pickField(record, "direction")).toLowerCase() === "outbound" ? "outbound" : "inbound"
  const rawDelivery = readRecord(pickField(record, "delivery"))
  const rawDeliveryStatus = readText(pickField(rawDelivery, "status"))
  const deliveryStatus = ["sent", "delivered", "opened_estimated", "replied", "failed", "bounced", "no_open_signal"].includes(rawDeliveryStatus)
    ? rawDeliveryStatus as NonNullable<InboxMessage["delivery"]>["status"]
    : "sent"

  return {
    id: readText(pickField(record, "id", "messageId")),
    threadId: readText(pickField(record, "threadId"), threadId),
    mailboxId: readOptionalText(pickField(record, "mailboxId")),
    direction,
    from: normalizeAddresses(pickField(record, "from")),
    to: normalizeAddresses(pickField(record, "to")),
    cc: normalizeAddresses(pickField(record, "cc")),
    bcc: normalizeAddresses(pickField(record, "bcc")),
    subject: readText(pickField(record, "subject")),
    sentAt: direction === "outbound" ? occurredAt : readOptionalText(pickField(record, "sentAt", "occurredAt")),
    receivedAt: direction === "inbound" ? occurredAt : readOptionalText(pickField(record, "receivedAt")),
    bodyText: readOptionalText(pickField(record, "bodyText", "text")),
    sanitizedHtml: readOptionalText(pickField(record, "sanitizedHtml", "safeBodyHtml", "bodyHtml")),
    replyEligible: readFlag(pickField(record, "replyEligible"), true),
    attachments: readList(pickField(record, "attachments")).map(normalizeAttachment),
    delivery: direction === "outbound" ? {
      status: deliveryStatus,
      sentAt: readOptionalText(pickField(rawDelivery, "sentAt")),
      deliveredAt: readOptionalText(pickField(rawDelivery, "deliveredAt")),
      openedAt: readOptionalText(pickField(rawDelivery, "openedAt")),
      repliedAt: readOptionalText(pickField(rawDelivery, "repliedAt")),
      failedAt: readOptionalText(pickField(rawDelivery, "failedAt")),
      bouncedAt: readOptionalText(pickField(rawDelivery, "bouncedAt")),
      openTrackingEnabled: readFlag(pickField(rawDelivery, "openTrackingEnabled")),
      confidence: readText(pickField(rawDelivery, "confidence")) === "estimated" ? "estimated" : readText(pickField(rawDelivery, "confidence")) === "confirmed" ? "confirmed" : "none",
    } : undefined,
  }
}

export function latestReplySource(messages: InboxMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].replyEligible) return messages[index]
  }
  return null
}

export function normalizeThreadDetail(value: unknown, requestedId: string, request: ThreadDetailQuery = {}): InboxThreadDetail {
  const record = readRecord(value)
  const id = readText(pickField(record, "id", "threadId"), requestedId)
  const state = readRecord(pickField(record, "state"))
  const explicitUnread = pickField(record, "unreadCount")
  const isRead = pickField(state, "isRead") ?? pickField(record, "isRead")
  const requestedLimit = Math.min(50, Math.max(1, Math.floor(request.limit ?? 25)))
  const requestedOffset = Math.max(0, Math.floor(request.offset ?? 0))
  const normalizedMessages = readList(pickField(record, "messages")).map((message) => normalizeMessage(message, id))
  const explicitTotal = pickField(record, "messageTotal", "message_total")
  if (explicitTotal === undefined) {
    throw new Error("Inbox message paging is still being prepared. Try again shortly.")
  }
  const messageTotal = Math.max(0, readCount(explicitTotal))
  const messageOffset = Math.max(0, readCount(pickField(record, "messageOffset", "message_offset"), requestedOffset))
  const messageLimit = Math.min(50, Math.max(1, readCount(pickField(record, "messageLimit", "message_limit"), requestedLimit)))

  return {
    id,
    mailboxId: readText(pickField(record, "mailboxId")),
    subject: readText(pickField(record, "subject")),
    starred: readFlag(pickField(state, "isStarred") ?? pickField(record, "starred", "isStarred")),
    archived: readFlag(pickField(state, "isArchived") ?? pickField(record, "archived", "isArchived")),
    unreadCount: explicitUnread !== undefined ? readCount(explicitUnread) : isRead === false ? 1 : 0,
    readOnly: readFlag(pickField(record, "readOnly", "isReadOnly")),
    messageTotal,
    messageOffset,
    messageLimit,
    hasOlderMessages: readFlag(pickField(record, "hasOlderMessages", "has_older_messages")),
    messages: normalizedMessages,
    summary: normalizeSummary(pickField(record, "summary", "lunaSummary")),
  }
}

export function normalizeThreadPage(value: unknown, limit: number): ThreadPage {
  const record = readRecord(value)
  const items = readList(pickField(record, "items", "threads")).map(normalizeThreadListItem)
  const explicitCursor = readOptionalText(pickField(record, "nextCursor", "cursor"))
  const hasMoreValue = pickField(record, "hasMore")
  const page = pickField(record, "page")

  // A cursor API reports the next cursor; a page API reports page + hasMore, so
  // the page number becomes the cursor the client sends back.
  const hasMore = hasMoreValue !== undefined ? readFlag(hasMoreValue) : items.length >= limit
  const nextCursor = explicitCursor ?? (hasMore && typeof page === "number" ? String(page + 1) : null)

  return { items, nextCursor: hasMore ? nextCursor : null, hasMore: hasMore && nextCursor !== null }
}


export function normalizeDraft(value: unknown, request: Partial<SendRequest>): InboxDraft {
  const record = readRecord(value)
  return {
    id: readText(pickField(record, "id", "draftId")),
    threadId: readOptionalText(pickField(record, "threadId")) ?? request.threadId ?? null,
    mailboxId: readText(pickField(record, "mailboxId"), request.mailboxId ?? ""),
    mode: (readText(pickField(record, "mode"), request.mode ?? "new") as SendMode),
    sourceMessageId: readOptionalText(pickField(record, "sourceMessageId")) ?? request.sourceMessageId ?? null,
    subject: readText(pickField(record, "subject"), request.subject ?? ""),
    bodyText: readText(pickField(record, "bodyText"), request.bodyText ?? ""),
    trackOpens: readFlag(pickField(record, "trackOpens"), request.trackOpens ?? true),
    updatedAt: readOptionalText(pickField(record, "updatedAt")),
  }
}

/** The wire shape for a draft or a send. Recipient resolution stays server-side. */
export function buildSendPayload(request: SendRequest) {
  return {
    mailboxId: request.mailboxId,
    mode: request.mode,
    sourceMessageId: request.sourceMessageId,
    threadId: request.threadId,
    draftId: request.draftId,
    subject: request.subject,
    bodyText: request.bodyText,
    addedTo: request.addedTo,
    addedCc: request.addedCc,
    addedBcc: request.addedBcc,
    removedAddresses: request.removedAddresses,
    attachments: request.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      contentBase64: attachment.contentBase64,
    })),
    trackOpens: request.trackOpens,
  }
}

export type ComposerEdits = {
  subject: string
  bodyText: string
  addedTo: MailAddress[]
  addedCc: MailAddress[]
  addedBcc: MailAddress[]
  removedAddresses: string[]
  attachments: OutboundAttachment[]
  trackOpens: boolean
}

/**
 * Builds the request for a reply, reply all or forward without ever deriving the
 * recipient list. `reply` and `reply_all` differ only by `mode`: the server reads
 * the source message and decides who receives it, so the two cannot drift apart
 * in the browser and a Reply all can never silently narrow to a Reply.
 */
export function buildReplyRequest({
  mode,
  mailboxId,
  threadId,
  sourceMessageId,
  draftId = null,
  edits,
  idempotencyKey,
}: {
  mode: SendMode
  mailboxId: string
  threadId: string | null
  sourceMessageId: string | null
  draftId?: string | null
  edits: ComposerEdits
  idempotencyKey: string
}): SendRequest {
  const needsSource = mode === "reply" || mode === "reply_all" || mode === "forward"
  if (needsSource && !sourceMessageId) {
    throw new InboxApiError("Select the message to respond to before sending.")
  }

  return {
    mailboxId,
    mode,
    // A new message has no source; every response mode carries exactly one.
    sourceMessageId: needsSource ? sourceMessageId : null,
    threadId: mode === "new" ? null : threadId,
    draftId,
    // Reply and reply all keep the thread's subject on the server side.
    subject: mode === "new" || mode === "forward" ? edits.subject : null,
    bodyText: edits.bodyText,
    addedTo: edits.addedTo,
    addedCc: edits.addedCc,
    addedBcc: edits.addedBcc,
    removedAddresses: edits.removedAddresses,
    attachments: edits.attachments,
    idempotencyKey,
    trackOpens: edits.trackOpens,
  }
}

export type ComposerState = {
  mode: SendMode
  threadId: string | null
  sourceMessageId: string | null
  /** The subject shown for a new message or a forward. Replies keep the thread's. */
  subject: string
  bodyText: string
  /**
   * Only the people the operator named themselves. For a reply the server still
   * resolves the audience from the source message; these are added to it.
   */
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  /** Cc and Bcc stay out of the way until they are asked for, or already hold someone. */
  showCc: boolean
  showBcc: boolean
  attachments: OutboundAttachment[]
  trackOpens: boolean
  presentation: "docked" | "open" | "expanded"
}

export function emptyComposerState(mode: SendMode = "reply", presentation: ComposerState["presentation"] = "docked"): ComposerState {
  return {
    mode,
    threadId: null,
    sourceMessageId: null,
    subject: "",
    bodyText: "",
    to: [],
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    attachments: [],
    trackOpens: true,
    presentation,
  }
}

export type ComposerStatus = "idle" | "saving" | "sending" | "discarding" | "queued" | "failed"

export const composerModeLabels: Record<SendMode, string> = {
  new: "Compose",
  reply: "Reply",
  reply_all: "Reply all",
  forward: "Forward",
}

/**
 * Splits a hand-typed recipient field into addresses. Only the operator's own
 * additions ever go through here; nothing is inferred from the thread.
 */
export function parseAddressInput(value: string): MailAddress[] {
  const seen = new Set<string>()
  return value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*<([^>]+)>$/)
      const address = (match ? match[2] : entry).trim()
      const displayName = match?.[1]?.trim().replace(/^["']|["']$/g, "") || null
      return { address, displayName }
    })
    .filter((recipient) => {
      const key = recipient.address.toLowerCase()
      if (!recipient.address.includes("@") || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function composerEdits(state: ComposerState): ComposerEdits {
  return {
    subject: state.subject,
    bodyText: state.bodyText,
    // Every field says exactly what the operator typed into it. A new message
    // and a forward carry their whole audience this way; a reply carries only
    // the people added on top of the ones the server resolves from the source.
    addedTo: dedupeAddresses(state.to),
    addedCc: dedupeAddresses(state.cc),
    addedBcc: dedupeAddresses(state.bcc),
    removedAddresses: [],
    attachments: state.attachments,
    trackOpens: state.trackOpens,
  }
}

/** True when the mode needs the operator to name somebody before it can send. */
export function composerNeedsRecipient(mode: SendMode) {
  return mode === "new" || mode === "forward"
}

export function dedupeAddresses(addresses: MailAddress[]): MailAddress[] {
  const seen = new Set<string>()
  return addresses.filter((recipient) => {
    const key = recipient.address.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** RFC-shaped enough to catch a typo without rejecting an address a provider accepts. */
export function isLikelyEmailAddress(value: string) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(value.trim())
}

export function formatAddress(address: MailAddress) {
  return address.displayName ? `${address.displayName} <${address.address}>` : address.address
}

/* --------------------------------------------------------------------------
 * Thread page cache, selection and pagination
 * ------------------------------------------------------------------------ */

export type ThreadCacheEntry = {
  items: InboxThreadListItem[]
  nextCursor: string | null
  hasMore: boolean
}

export function threadCacheKey(mailboxId: string, folder: MailFolder, query: string, folderId?: string | null) {
  return `${mailboxId}::${folderId ? `provider:${folderId}` : folder}::${query.trim().toLowerCase()}`
}

/**
 * Switching mailbox or provider must not throw away a list the operator has
 * already scrolled, and appending a page must not duplicate a thread that moved
 * between pages while they were reading. Both live here so the page component
 * stays about layout and the behaviour stays testable.
 */
export function mergeThreadPage(previous: ThreadCacheEntry | undefined, page: ThreadPage, append: boolean): ThreadCacheEntry {
  if (!append || !previous) {
    return { items: dedupeThreads(page.items), nextCursor: page.nextCursor, hasMore: page.hasMore }
  }

  return {
    items: dedupeThreads([...previous.items, ...page.items]),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  }
}

export function dedupeThreads(items: InboxThreadListItem[]): InboxThreadListItem[] {
  const seen = new Map<string, InboxThreadListItem>()
  for (const item of items) {
    if (!item.id) continue
    // A later page carries the fresher row, so it replaces the earlier copy in place.
    seen.set(item.id, item)
  }
  return [...seen.values()]
}

export function applyThreadPatch(
  entry: ThreadCacheEntry | undefined,
  threadId: string,
  patch: Partial<InboxThreadListItem>,
): ThreadCacheEntry | undefined {
  if (!entry) return entry
  let changed = false
  const items = entry.items.map((item) => {
    if (item.id !== threadId) return item
    changed = true
    return { ...item, ...patch }
  })
  return changed ? { ...entry, items } : entry
}

/**
 * Keeps the operator's place when they change provider or mailbox: the thread
 * they were reading stays selected if it belongs to the new mailbox, and is
 * dropped only when it genuinely cannot be there.
 */
export function resolveSelectionForMailbox(
  selectedThreadId: string | null,
  selectedThreadMailboxId: string | null,
  nextMailboxId: string,
): string | null {
  if (!selectedThreadId) return null
  if (!selectedThreadMailboxId) return null
  return selectedThreadMailboxId === nextMailboxId ? selectedThreadId : null
}

/** The mailbox to land on for a provider, preferring the operator's current one. */
export function resolveMailboxForProvider(
  mailboxes: Mailbox[],
  provider: MailProvider,
  currentMailboxId: string | null,
): Mailbox | null {
  const candidates = mailboxes.filter((mailbox) => mailbox.provider === provider)
  if (candidates.length === 0) return null

  const current = candidates.find((mailbox) => mailbox.id === currentMailboxId)
  if (current) return current

  return candidates.find((mailbox) => mailbox.isDefault && mailbox.kind === "personal")
    ?? candidates.find((mailbox) => mailbox.kind === "personal")
    ?? candidates[0]
}

/**
 * Resolves the provider used when a mail surface opens without an explicit
 * provider. A saved operator preference wins, but never over a provider named
 * by a deep link and never when that provider has no accessible mailbox.
 */
export function resolveDefaultInboxProvider(
  mailboxes: Mailbox[],
  preferredProvider: MailProvider | null,
  requestedProvider: MailProvider | null = null,
): MailProvider | null {
  const availableProviders = (["gmail", "outlook"] as MailProvider[])
    .filter((provider) => mailboxes.some((mailbox) => mailbox.provider === provider))

  if (requestedProvider && availableProviders.includes(requestedProvider)) return requestedProvider
  if (preferredProvider && availableProviders.includes(preferredProvider)) return preferredProvider

  return mailboxes.find((mailbox) => mailbox.isDefault)?.provider
    ?? availableProviders[0]
    ?? null
}

/** The first send-capable mailbox for a new composer, scoped to its preferred provider. */
export function resolveDefaultOutboundMailbox(
  mailboxes: Mailbox[],
  preferredProvider: MailProvider | null,
  currentMailboxId: string | null = null,
): Mailbox | null {
  const capable = mailboxes.filter((mailbox) =>
    mailbox.outboundEnabled
    && (mailbox.status === "connected" || mailbox.status === "syncing"))
  const current = capable.find((mailbox) => mailbox.id === currentMailboxId)
  if (current) return current

  const provider = resolveDefaultInboxProvider(capable, preferredProvider)
  if (!provider) return null
  return resolveMailboxForProvider(capable, provider, null)
}
