import {
  getSupabaseSession,
  supabase,
  supabaseFunctionsUrl,
  supabasePublicApiKey,
} from "@/lib/supabase"
import {
  InboxApiError,
  buildSendPayload,
  normalizeConnection,
  normalizeAutomaticReplySettings,
  normalizeDexterEmailContextSource,
  normalizeDraft,
  normalizeMailbox,
  normalizeMailboxFolder,
  normalizeProviderAvailability,
  normalizeSummary,
  normalizeThreadDetail,
  normalizeThreadPage,
  readCount,
  readList,
  readOptionalText,
  readRecord,
  pickField,
  readFlag,
  readText,
  type ConnectionStatus,
  type DexterEmailContextSource,
  type InboxConnection,
  type AutomaticReplySettings,
  type AutomaticReplyUpdate,
  type InboxDraft,
  type InboxProviderAvailability,
  type InboxThreadDetail,
  type MailProvider,
  type Mailbox,
  type MailboxFolder,
  type OutboundAttachment,
  type SendReceipt,
  type SendRequest,
  type ThreadPage,
  type ThreadQuery,
  type ThreadSummaryState,
} from "@/lib/inbox-contract"

/**
 * The transport for the Inbox workspace.
 *
 * Inbox calls the tenant's Supabase Edge Function directly. Provider secrets,
 * service-role access and communications tables stay inside Supabase; the
 * browser contributes only its current tenant session and public project key.
 * Every response still passes through `inbox-contract.ts`, which keeps the UI
 * independent from the transport and tolerant of snake/camel-case JSON.
 */

export * from "@/lib/inbox-contract"

const inboxFunctionName = "inbox-api"
const inboxBasePath = `${supabaseFunctionsUrl}/${inboxFunctionName}`
const sessionRefreshLeewaySeconds = 30
const mailboxSyncPageLimit = 5
const inlineAttachmentCacheLimit = 96
const inlineAttachmentCacheTtlMs = 10 * 60_000

type InlineAttachmentCacheEntry = {
  url: string | null
  pending: Promise<string> | null
  lastUsedAt: number
  consumers: number
}

const inlineAttachmentCache = new Map<string, InlineAttachmentCacheEntry>()

export type MailboxSyncResult = {
  synced: number
  pages: number
  hasMore: boolean
  lastSyncedAt: string | null
  indexStatus: "pending" | "indexing" | "ready" | "error"
  indexedCount: number
  estimatedTotal: number | null
  indexPercent: number
}

function configurationError() {
  return new InboxApiError("Inbox is not configured for this workspace.", { code: "server" })
}

async function inboxAccessToken(forceRefresh = false): Promise<string> {
  if (!supabase || !supabaseFunctionsUrl || !supabasePublicApiKey) throw configurationError()

  try {
    const current = await getSupabaseSession()
    const shouldRefresh = forceRefresh || Boolean(
      current?.expires_at && current.expires_at <= Math.floor(Date.now() / 1000) + sessionRefreshLeewaySeconds,
    )
    if (shouldRefresh) {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) throw error
      if (data.session?.access_token) return data.session.access_token
    }
    if (current?.access_token) return current.access_token
  } catch {
    throw new InboxApiError("Sign in again to open the inbox.", { status: 401, code: "unauthenticated" })
  }

  throw new InboxApiError("Sign in again to open the inbox.", { status: 401, code: "unauthenticated" })
}

function edgeHeaders(accessToken: string, headers?: HeadersInit) {
  const result = new Headers(headers)
  if (!result.has("Accept")) result.set("Accept", "application/json")
  result.set("Authorization", `Bearer ${accessToken}`)
  result.set("apikey", supabasePublicApiKey)
  result.set("x-client-info", "multideck-inbox-web/1")
  return result
}

async function fetchInboxEdge(path: string, init: RequestInit, allowSessionRefresh = true): Promise<Response> {
  if (!inboxBasePath.startsWith("https://") && !inboxBasePath.startsWith("http://")) throw configurationError()
  const accessToken = await inboxAccessToken(false)

  let response: Response
  try {
    response = await fetch(`${inboxBasePath}${path}`, {
      ...init,
      credentials: "omit",
      headers: edgeHeaders(accessToken, init.headers),
    })
  } catch {
    throw new InboxApiError("Unable to reach the inbox. Check your connection and try again.", { code: "offline" })
  }

  // A session can be revoked or expire between getSession and the request. One
  // forced refresh is safe; never loop and never retry any other failure.
  if (response.status === 401 && allowSessionRefresh) {
    const refreshedToken = await inboxAccessToken(true)
    try {
      return await fetch(`${inboxBasePath}${path}`, {
        ...init,
        credentials: "omit",
        headers: edgeHeaders(refreshedToken, init.headers),
      })
    } catch {
      throw new InboxApiError("Unable to reach the inbox. Check your connection and try again.", { code: "offline" })
    }
  }

  return response
}

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after")
  if (!header) return null
  const seconds = Number.parseInt(header, 10)
  return Number.isFinite(seconds) ? seconds : null
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const problem = (await response.json()) as Record<string, unknown>
    return readOptionalText(pickField(problem, "detail", "title", "message")) ?? fallback
  } catch {
    return fallback
  }
}

function codeForStatus(status: number): InboxApiError["code"] {
  if (status === 401) return "unauthenticated"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 409 || status === 428) return "reauthorization_required"
  if (status === 429) return "rate_limited"
  return "server"
}

async function inboxRequest<T>(
  path: string,
  init: RequestInit & { normalize: (payload: unknown) => T },
): Promise<T> {
  const { normalize, headers, ...rest } = init

  let response: Response
  try {
    response = await fetchInboxEdge(path, {
      ...rest,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
    })
  } catch (error) {
    if (error instanceof InboxApiError) throw error
    throw new InboxApiError("Unable to reach the inbox. Check your connection and try again.", { code: "offline" })
  }

  if (!response.ok) {
    const status = response.status
    const code = codeForStatus(status)
    if (code === "unauthenticated") {
      throw new InboxApiError("Sign in again to open the inbox.", { status, code })
    }
    const fallback =
      code === "rate_limited" ? "The mail provider is rate limiting this account. Try again shortly." :
      code === "reauthorization_required" ? "This mail connection needs to be reconnected." :
      code === "forbidden" ? "This mailbox is read-only for your account." :
      `${status} ${response.statusText}`.trim()

    throw new InboxApiError(await readErrorMessage(response, fallback), {
      status,
      code,
      retryAfterSeconds: readRetryAfter(response),
    })
  }

  if (response.status === 204) return normalize(undefined)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new InboxApiError("The inbox returned an unexpected response.", { status: response.status })
  }
  return normalize(payload)
}

export async function listInboxConnections(): Promise<InboxConnection[]> {
  return inboxRequest("/connections", {
    method: "GET",
    normalize: (payload) => {
      const source = Array.isArray(payload) ? payload : readList(pickField(readRecord(payload), "connections", "items"))
      return source.map(normalizeConnection).filter((connection) => connection.id !== "")
    },
  })
}

export async function loadInboxWorkspace(): Promise<{ connections: InboxConnection[]; mailboxes: Mailbox[]; folders: MailboxFolder[] }> {
  return inboxRequest("/workspace", {
    method: "GET",
    normalize: (payload) => {
      const record = readRecord(payload)
      return {
        connections: readList(pickField(record, "connections", "items"))
          .map((connection) => normalizeConnection(connection))
          .filter((connection) => connection.id !== ""),
        mailboxes: readList(pickField(record, "mailboxes"))
          .map((mailbox) => normalizeMailbox(mailbox))
          .filter((mailbox) => mailbox.id !== ""),
        folders: readList(pickField(record, "folders"))
          .map((folder) => normalizeMailboxFolder(folder))
          .filter((folder) => folder.id !== "" && folder.mailboxId !== ""),
      }
    },
  })
}

export async function listInboxProviders(): Promise<InboxProviderAvailability[]> {
  return inboxRequest("/providers", {
    method: "GET",
    normalize: (payload) => {
      const source = Array.isArray(payload) ? payload : readList(pickField(readRecord(payload), "providers", "items"))
      return source.map(normalizeProviderAvailability)
    },
  })
}

export async function authorizeInboxProvider(
  provider: MailProvider,
  accessMode: "personal" | "shared" = "personal",
  returnPath = "/inbox",
): Promise<string> {
  return inboxRequest(`/connections/${provider}/authorize`, {
    method: "POST",
    body: JSON.stringify({
      provider,
      accessMode,
      returnOrigin: typeof window === "undefined" ? undefined : window.location.origin,
      returnPath,
    }),
    normalize: (payload) => {
      const uri = readOptionalText(pickField(readRecord(payload), "authorizationUri", "authorizationUrl", "url"))
      if (!uri) throw new InboxApiError("The provider did not return a sign-in link.")
      return uri
    },
  })
}

export async function addOutlookSharedMailbox(connectionId: string, address: string): Promise<Mailbox> {
  return inboxRequest(`/connections/${encodeURIComponent(connectionId)}/shared-mailboxes`, {
    method: "POST",
    body: JSON.stringify({ address: address.trim() }),
    normalize: (payload) => normalizeMailbox(payload),
  })
}

export async function addGmailGroupMailbox(connectionId: string, address: string): Promise<Mailbox> {
  return inboxRequest(`/connections/${encodeURIComponent(connectionId)}/group-mailboxes`, {
    method: "POST",
    body: JSON.stringify({ address: address.trim() }),
    normalize: (payload) => normalizeMailbox(payload),
  })
}

export async function disconnectInboxConnection(connectionId: string): Promise<void> {
  await inboxRequest(`/connections/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
    normalize: () => undefined,
  })
}

export async function listMailboxes(): Promise<Mailbox[]> {
  return inboxRequest("/mailboxes", {
    method: "GET",
    normalize: (payload) => {
      const source = Array.isArray(payload) ? payload : readList(pickField(readRecord(payload), "mailboxes", "items"))
      return source.map((mailbox) => normalizeMailbox(mailbox)).filter((mailbox) => mailbox.id !== "")
    },
  })
}

export async function listDexterEmailContextSources(): Promise<DexterEmailContextSource[]> {
  return inboxRequest("/ai-context-sources", {
    method: "GET",
    normalize: (payload) => {
      const source = Array.isArray(payload) ? payload : readList(pickField(readRecord(payload), "sources", "items"))
      return source.map(normalizeDexterEmailContextSource)
    },
  })
}

export async function syncMailbox(mailboxId: string): Promise<MailboxSyncResult> {
  let synced = 0
  let pages = 0
  let hasMore = false
  let lastSyncedAt: string | null = null
  let indexStatus: MailboxSyncResult["indexStatus"] = "pending"
  let indexedCount = 0
  let estimatedTotal: number | null = null
  let indexPercent = 0

  do {
    const page = await inboxRequest(`/mailboxes/${encodeURIComponent(mailboxId)}/sync`, {
      method: "POST",
      normalize: (payload) => {
        const row = readRecord(payload)
        return {
          synced: readCount(pickField(row, "synced")),
          hasMore: readFlag(pickField(row, "hasMore", "has_more")),
          lastSyncedAt: readOptionalText(pickField(row, "lastSyncedAt", "last_synced_at")),
          indexStatus: ((): MailboxSyncResult["indexStatus"] => {
            const value = readOptionalText(pickField(row, "indexStatus", "index_status"))
            return value === "indexing" || value === "ready" || value === "error" ? value : "pending"
          })(),
          indexedCount: readCount(pickField(row, "indexedCount", "indexed_count")),
          estimatedTotal: (() => {
            const value = pickField(row, "estimatedTotal", "estimated_total")
            return value === null || value === undefined ? null : readCount(value)
          })(),
          indexPercent: readCount(pickField(row, "indexPercent", "index_percent")),
        }
      },
    })
    synced += page.synced
    pages += 1
    hasMore = page.hasMore
    lastSyncedAt = page.lastSyncedAt ?? lastSyncedAt
    indexStatus = page.indexStatus
    indexedCount = page.indexedCount
    estimatedTotal = page.estimatedTotal
    indexPercent = page.indexPercent
  } while (hasMore && pages < mailboxSyncPageLimit)

  return {
    synced,
    pages,
    hasMore,
    lastSyncedAt,
    indexStatus,
    indexedCount,
    estimatedTotal,
    indexPercent,
  }
}

export async function getAutomaticReply(mailboxId: string): Promise<AutomaticReplySettings> {
  return inboxRequest(`/mailboxes/${encodeURIComponent(mailboxId)}/automatic-reply`, {
    method: "GET",
    normalize: normalizeAutomaticReplySettings,
  })
}

export async function updateAutomaticReply(
  mailboxId: string,
  update: AutomaticReplyUpdate,
): Promise<AutomaticReplySettings> {
  return inboxRequest(`/mailboxes/${encodeURIComponent(mailboxId)}/automatic-reply`, {
    method: "PATCH",
    body: JSON.stringify(update),
    normalize: normalizeAutomaticReplySettings,
  })
}

export function buildThreadQueryString({ mailboxId, folder = "inbox", folderId, query, cursor, limit = 25 }: ThreadQuery) {
  const params = new URLSearchParams()
  params.set("mailboxId", mailboxId)
  params.set("folder", folder)
  if (folderId) params.set("folderId", folderId)
  if (query?.trim()) params.set("query", query.trim())
  if (cursor) params.set("cursor", cursor)
  params.set("limit", String(limit))
  return params.toString()
}

export async function listThreads(request: ThreadQuery): Promise<ThreadPage> {
  const limit = request.limit ?? 25
  return inboxRequest(`/threads?${buildThreadQueryString({ ...request, limit })}`, {
    method: "GET",
    normalize: (payload) => normalizeThreadPage(payload, limit),
  })
}

export async function getThread(threadId: string): Promise<InboxThreadDetail> {
  return inboxRequest(`/threads/${encodeURIComponent(threadId)}`, {
    method: "GET",
    normalize: (payload) => normalizeThreadDetail(payload, threadId),
  })
}

export async function setThreadReadState(
  threadId: string,
  patch: { isRead?: boolean; isStarred?: boolean; isArchived?: boolean },
): Promise<void> {
  await inboxRequest(`/threads/${encodeURIComponent(threadId)}/read-state`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    normalize: () => undefined,
  })
}

export async function moveThreadToTrash(threadId: string): Promise<void> {
  await inboxRequest(`/threads/${encodeURIComponent(threadId)}/trash`, {
    method: "POST",
    normalize: () => undefined,
  })
}

export async function requestThreadSummary(threadId: string): Promise<ThreadSummaryState> {
  return inboxRequest(`/threads/${encodeURIComponent(threadId)}/summary`, {
    method: "POST",
    normalize: (payload) => {
      const record = readRecord(payload)
      const summary = normalizeSummary(pickField(record, "summary") ?? record)
      // A summary that came back with prose is ready even if the field is absent.
      return summary.status === "none" && summary.text ? { ...summary, status: "ready" } : summary
    },
  })
}
/**
 * A server draft holds the words and the recipients, never the files. Attaching
 * megabytes to every autosave would be paid for on each keystroke, so the
 * composer keeps them in memory and they travel once, with the send.
 */
function draftPayload(request: SendRequest) {
  return { ...buildSendPayload(request), attachments: [] }
}

export async function createDraft(request: SendRequest): Promise<InboxDraft> {
  return inboxRequest("/drafts", {
    method: "POST",
    body: JSON.stringify(draftPayload(request)),
    normalize: (payload) => normalizeDraft(payload, request),
  })
}

export async function updateDraft(draftId: string, request: SendRequest): Promise<InboxDraft> {
  return inboxRequest(`/drafts/${encodeURIComponent(draftId)}`, {
    method: "PATCH",
    body: JSON.stringify(draftPayload(request)),
    normalize: (payload) => normalizeDraft(payload, { ...request, draftId }),
  })
}

export async function deleteDraft(draftId: string): Promise<void> {
  await inboxRequest(`/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE",
    normalize: () => undefined,
  })
}

export function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `inbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function sendMail(request: SendRequest): Promise<SendReceipt> {
  return inboxRequest("/send", {
    method: "POST",
    headers: { "Idempotency-Key": request.idempotencyKey },
    body: JSON.stringify({ ...buildSendPayload(request), idempotencyKey: request.idempotencyKey }),
    normalize: (payload) => {
      const record = readRecord(payload)
      const rawStatus = readText(pickField(record, "status")).toLowerCase()
      return {
        id: readText(pickField(record, "id", "sendRequestId")),
        threadId: readOptionalText(pickField(record, "threadId")),
        messageId: readOptionalText(pickField(record, "messageId")),
        status: rawStatus === "sent" || rawStatus === "delivered" ? "sent" : rawStatus === "failed" ? "failed" : "queued",
        reused: readFlag(pickField(record, "reused")),
      }
    },
  })
}

/**
 * Turns a picked file into the shape the send payload carries.
 *
 * The bytes are base64'd here rather than uploaded separately: a message and its
 * files then leave the browser in one idempotent request, so a retry after a
 * timeout can never send the words without the attachment or twice over.
 */
export async function readFileAsAttachment(file: File): Promise<OutboundAttachment> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Chunked so a multi-megabyte file cannot overflow the argument list.
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return {
    id: createIdempotencyKey(),
    fileName: file.name || "attachment",
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    contentBase64: btoa(binary),
  }
}

/**
 * Attachments are fetched through the tenant Edge Function and handed to the
 * browser as a blob URL, so a provider download URL never reaches the page and
 * the file inherits the caller's authorization rather than a public link.
 */
export async function getAttachmentBlobUrl(attachmentId: string): Promise<{ url: string; revoke: () => void }> {
  return getSecureAttachmentBlobUrl(attachmentId, false)
}

/**
 * Inline email images use the same authenticated transport as downloads. The
 * resulting private blob URL exists only in this browser tab. A small bounded
 * cache lets conversation prefetch finish the download before the operator
 * selects the email; active renderers retain their entry until they unmount.
 */
export async function getInlineAttachmentBlobUrl(attachmentId: string): Promise<{ url: string; revoke: () => void }> {
  const url = await loadInlineAttachmentBlobUrl(attachmentId)
  return retainInlineAttachmentBlobUrl(attachmentId, url)
}

/** Returns a ready prefetched image synchronously, before the first paint. */
export function getCachedInlineAttachmentBlobUrl(attachmentId: string): { url: string; revoke: () => void } | null {
  const entry = inlineAttachmentCache.get(attachmentId)
  if (!entry?.url) return null
  entry.lastUsedAt = Date.now()
  return retainInlineAttachmentBlobUrl(attachmentId, entry.url)
}

/** Warms only the inline images that can appear in one rendered conversation. */
export async function prefetchThreadInlineAttachmentBlobUrls(detail: InboxThreadDetail): Promise<void> {
  const attachmentIds = Array.from(new Set(
    detail.messages.flatMap((message) => message.attachments)
      .filter((attachment) => attachment.isInline && attachment.contentId)
      .map((attachment) => attachment.id),
  )).slice(0, 24)

  await Promise.allSettled(attachmentIds.map((attachmentId) => loadInlineAttachmentBlobUrl(attachmentId)))
}

/** Clears private image material whenever the authenticated workspace changes. */
export function clearInlineAttachmentBlobCache() {
  for (const entry of inlineAttachmentCache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url)
  }
  inlineAttachmentCache.clear()
}

function retainInlineAttachmentBlobUrl(attachmentId: string, url: string) {
  const entry = inlineAttachmentCache.get(attachmentId)
  if (!entry || entry.url !== url) {
    throw new InboxApiError("This private image is no longer available. Reopen the message to try again.", {
      code: "unauthenticated",
    })
  }
  entry.consumers += 1
  let released = false
  return {
    url,
    revoke: () => {
      if (released) return
      released = true
      const current = inlineAttachmentCache.get(attachmentId)
      if (current?.url === url) current.consumers = Math.max(0, current.consumers - 1)
      pruneInlineAttachmentCache()
    },
  }
}

async function loadInlineAttachmentBlobUrl(attachmentId: string): Promise<string> {
  const now = Date.now()
  pruneInlineAttachmentCache(now)
  const cached = inlineAttachmentCache.get(attachmentId)
  if (cached?.url) {
    cached.lastUsedAt = now
    return cached.url
  }
  if (cached?.pending) return cached.pending

  const entry: InlineAttachmentCacheEntry = cached ?? { url: null, pending: null, lastUsedAt: now, consumers: 0 }
  const pending = getSecureAttachmentBlobUrl(attachmentId, true)
    .then((result) => {
      if (inlineAttachmentCache.get(attachmentId) !== entry) {
        result.revoke()
        throw new InboxApiError("This private image is no longer available. Reopen the message to try again.", {
          code: "unauthenticated",
        })
      }
      entry.url = result.url
      entry.pending = null
      entry.lastUsedAt = Date.now()
      pruneInlineAttachmentCache()
      return result.url
    })
    .catch((error) => {
      if (inlineAttachmentCache.get(attachmentId) === entry) inlineAttachmentCache.delete(attachmentId)
      throw error
    })
  entry.pending = pending
  inlineAttachmentCache.set(attachmentId, entry)
  return pending
}

function pruneInlineAttachmentCache(now = Date.now()) {
  for (const [attachmentId, entry] of inlineAttachmentCache) {
    if (entry.url && entry.consumers === 0 && now - entry.lastUsedAt > inlineAttachmentCacheTtlMs) {
      URL.revokeObjectURL(entry.url)
      inlineAttachmentCache.delete(attachmentId)
    }
  }

  if (inlineAttachmentCache.size <= inlineAttachmentCacheLimit) return
  const removable = [...inlineAttachmentCache.entries()]
    .filter(([, entry]) => entry.url && entry.consumers === 0)
    .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)
  while (inlineAttachmentCache.size > inlineAttachmentCacheLimit && removable.length) {
    const [attachmentId, entry] = removable.shift()!
    URL.revokeObjectURL(entry.url!)
    inlineAttachmentCache.delete(attachmentId)
  }
}

async function getSecureAttachmentBlobUrl(attachmentId: string, inline: boolean): Promise<{ url: string; revoke: () => void }> {
  let response: Response
  try {
    response = await fetchInboxEdge(`/attachments/${encodeURIComponent(attachmentId)}${inline ? "?disposition=inline" : ""}`, {
      method: "GET",
      headers: { Accept: "application/octet-stream" },
    })
  } catch (error) {
    if (error instanceof InboxApiError) throw error
    throw new InboxApiError("Unable to download this attachment. Check your connection and try again.", { code: "offline" })
  }

  if (!response.ok) {
    const status = response.status
    if (status === 401) {
      throw new InboxApiError("Sign in again to open this attachment.", { status, code: "unauthenticated" })
    }
    throw new InboxApiError(await readErrorMessage(response, "This attachment could not be downloaded."), {
      status,
      code: codeForStatus(status),
    })
  }

  const url = URL.createObjectURL(await response.blob())
  return { url, revoke: () => URL.revokeObjectURL(url) }
}
