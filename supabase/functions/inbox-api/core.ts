export type MailProvider = "gmail" | "outlook"
export type MailAddress = { address: string; displayName: string | null }

export class InboxHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "inbox_error",
    public readonly providerStatus?: number,
  ) {
    super(message)
  }
}

export function cleanString(value: unknown, maximum = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * Runs provider reads with a small, explicit concurrency ceiling. Mailbox
 * snapshots need one detail request per message, but doing those reads
 * serially can keep the Edge request open for minutes while an unbounded
 * Promise.all burst is likely to trigger provider throttling.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  read: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (values.length === 0) return []
  const limit = Math.max(1, Math.min(values.length, Math.floor(concurrency) || 1, 12))
  const output = new Array<R>(values.length)
  let nextIndex = 0

  await Promise.all(Array.from({ length: limit }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++
      output[index] = await read(values[index], index)
    }
  }))

  return output
}

export function normalizeEmail(value: unknown) {
  const text = cleanString(value, 320).toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)) return null
  return text
}

/**
 * Gmail's list endpoint supports the same search grammar as the Gmail UI.
 * Braces are an OR group, so a derived Google Group mailbox can include mail
 * addressed directly, copied, delivered through an alias, or identified by a
 * mailing-list header without reading unrelated messages from the account.
 */
export function gmailGroupQuery(value: unknown) {
  const address = normalizeEmail(value)
  if (!address) throw new InboxHttpError(400, "Enter a valid Google Group address.", "group_mailbox_address_invalid")
  return `{to:${address} cc:${address} deliveredto:${address} list:${address}}`
}

const GMAIL_GROUP_ADDRESS_HEADERS = new Set([
  "to",
  "cc",
  "bcc",
  "delivered-to",
  "x-original-to",
  "x-forwarded-to",
  "list-id",
  "list-post",
  "mailing-list",
])

function exactHeaderEmails(value: unknown) {
  const matches = cleanString(value, 20_000).match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/gi) ?? []
  return matches.map(normalizeEmail).filter((address): address is string => !!address)
}

/**
 * Gmail history cannot be filtered with `q`. Filter fetched history messages
 * locally instead, using exact normalized addresses so one group's address
 * cannot match another group by substring (for example ops@ vs devops@).
 */
export function gmailMessageMatchesGroup(input: {
  groupAddress: unknown
  recipients?: unknown
  headers?: unknown
}) {
  const groupAddress = normalizeEmail(input.groupAddress)
  if (!groupAddress) return false

  if (normalizeAddresses(input.recipients).some((recipient) => recipient.address === groupAddress)) return true

  const headerValues: unknown[] = []
  if (Array.isArray(input.headers)) {
    for (const row of input.headers) {
      if (!isObject(row) || !GMAIL_GROUP_ADDRESS_HEADERS.has(cleanString(row.name, 200).toLowerCase())) continue
      headerValues.push(row.value)
    }
  } else if (isObject(input.headers)) {
    for (const [name, value] of Object.entries(input.headers)) {
      if (GMAIL_GROUP_ADDRESS_HEADERS.has(name.toLowerCase())) headerValues.push(value)
    }
  }
  return headerValues.some((value) => exactHeaderEmails(value).includes(groupAddress))
}

export function normalizeAddresses(value: unknown, maximum = 100): MailAddress[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: MailAddress[] = []
  for (const candidate of value.slice(0, maximum)) {
    const row = typeof candidate === "string" ? { address: candidate } : isObject(candidate) ? candidate : {}
    const address = normalizeEmail(row.address ?? row.email)
    if (!address || seen.has(address)) continue
    seen.add(address)
    result.push({ address, displayName: cleanString(row.displayName ?? row.name, 240) || null })
  }
  return result
}

export function resolveResponseRecipients(input: {
  mode: "reply" | "reply_all"
  direction: "inbound" | "outbound"
  mailboxAddress: string
  from: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  addedTo: MailAddress[]
  addedCc: MailAddress[]
  addedBcc: MailAddress[]
  removedAddresses: unknown[]
}) {
  const ownAddress = normalizeEmail(input.mailboxAddress)
  const removed = new Set(input.removedAddresses.map(normalizeEmail).filter(Boolean))
  const withoutOwnOrRemoved = (values: MailAddress[]) => normalizeAddresses(values)
    .filter((item) => item.address !== ownAddress && !removed.has(item.address))

  // Replying from Sent items targets the original audience. For inbound mail,
  // it targets the original sender. This also prevents every reply started
  // from a Sent folder from collapsing to an empty recipient list.
  const baseTo = input.direction === "outbound" ? input.to : input.from
  const baseCc = input.mode === "reply_all"
    ? input.direction === "outbound" ? input.cc : [...input.to, ...input.cc]
    : []
  const to = withoutOwnOrRemoved([...baseTo, ...input.addedTo])
  const toAddresses = new Set(to.map((item) => item.address))
  const cc = withoutOwnOrRemoved([...baseCc, ...input.addedCc])
    .filter((item) => !toAddresses.has(item.address))
  const known = new Set([...toAddresses, ...cc.map((item) => item.address)])
  const bcc = withoutOwnOrRemoved(input.addedBcc)
    .filter((item) => !known.has(item.address))

  // A self-addressed message is a useful, safe provider smoke test and a valid
  // email thread. Preserve that sole audience only when no other recipient
  // survives and the source was outbound to this exact mailbox.
  if (!to.length && !cc.length && !bcc.length && input.direction === "outbound" && ownAddress && !removed.has(ownAddress)) {
    const self = normalizeAddresses(input.to).find((item) => item.address === ownAddress)
    if (self) return { to: [self], cc, bcc }
  }

  return { to, cc, bcc }
}

export function safeFileName(value: unknown) {
  const leaf = (cleanString(value, 500) || "attachment").replace(/\\/g, "/").split("/").pop() ?? "attachment"
  const safe = leaf.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").trim()
  return !safe || safe === "." || safe === ".." ? "attachment" : safe.slice(0, 260)
}

const SAFE_MIME_TYPES = new Set([
  "application/gzip", "application/msword", "application/octet-stream", "application/pdf", "application/rtf",
  "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-7z-compressed", "application/x-rar-compressed", "application/zip",
  "image/gif", "image/jpeg", "image/png", "image/webp", "text/csv", "text/plain",
])

export function safeMimeType(value: unknown) {
  const mime = cleanString(value, 200).split(";", 1)[0].toLowerCase()
  return SAFE_MIME_TYPES.has(mime) ? mime : "application/octet-stream"
}

/**
 * Email markup is untrusted. This deliberately removes active/embed content,
 * event handlers, forms and non-http/mail/cid URLs. The client renderer also
 * parses this into inert React nodes and never injects it as raw HTML.
 */
export function sanitizeEmailHtml(value: unknown) {
  let html = typeof value === "string" ? value.slice(0, 2_000_000) : ""
  html = html.replace(/<!--([\s\S]*?)-->/g, "")
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base|svg|math)\b[^>]*\/?>/gi, "")
  html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  html = html.replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  html = html.replace(/\s+(href|src)\s*=\s*(["'])(.*?)\2/gi, (_all, name, quote, raw) => {
    const url = String(raw).trim().replace(/[\u0000-\u001f\u007f]/g, "")
    return /^(https?:|mailto:|cid:|#)/i.test(url) ? ` ${name}=${quote}${escapeAttribute(url)}${quote}` : ""
  })
  html = html.replace(/\s+style\s*=\s*(["'])(.*?)\1/gi, (_all, quote, raw) => {
    const safe = String(raw)
      .replace(/(?:expression|url|@import|-moz-binding|behavior)\s*\([^)]*\)/gi, "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 8_000)
    return safe ? ` style=${quote}${escapeAttribute(safe)}${quote}` : ""
  })
  return html
}

/**
 * Microsoft Graph's `hasAttachments` flag deliberately ignores inline-only
 * images. A signature can therefore contain several `cid:` sources while the
 * message claims to have no attachments. Treat the HTML reference as the
 * second, provider-documented signal that the attachment collection must be
 * read.
 */
export function emailHtmlContentIds(value: unknown) {
  const html = typeof value === "string" ? value.slice(0, 2_000_000) : ""
  const ids = new Set<string>()
  for (const match of html.matchAll(/\bsrc\s*=\s*["']cid:([^"']+)["']/gi)) {
    let contentId = String(match[1] ?? "").trim()
    try { contentId = decodeURIComponent(contentId) } catch { /* Keep the provider value. */ }
    contentId = contentId.replace(/^<|>$/g, "").toLowerCase()
    if (contentId) ids.add(contentId)
  }
  return [...ids]
}

export function graphMessageNeedsAttachmentFetch(hasAttachments: unknown, bodyHtml: unknown) {
  return hasAttachments === true || emailHtmlContentIds(bodyHtml).length > 0
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

export function stripHtml(value: unknown) {
  return cleanString(decodeHtmlEntities(String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " "), 100_000)
}

export function decodeHtmlEntities(value: unknown) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match
    const hexadecimal = entity[1]?.toLowerCase() === "x"
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return match
    return String.fromCodePoint(codePoint)
  })
}

const WINDOWS_1252_BYTES: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
}

/** Repairs the common UTF-8-as-Windows-1252 corruption produced by raw MIME
 * headers. A candidate is accepted only when it reduces known mojibake
 * markers, so legitimate international text is left unchanged. */
export function repairMojibake(value: unknown) {
  let text = String(value ?? "")
  const score = (candidate: string) => (candidate.match(/[ÃÂâ]/g) ?? []).length
  for (let pass = 0; pass < 2 && score(text) > 0; pass += 1) {
    const bytes: number[] = []
    let valid = true
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0
      const byte = codePoint <= 0xff ? codePoint : WINDOWS_1252_BYTES[character]
      if (byte === undefined) { valid = false; break }
      bytes.push(byte)
    }
    if (!valid) break
    try {
      const candidate = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))
      if (score(candidate) >= score(text)) break
      text = candidate
    } catch { break }
  }
  return text
}

export function publicProvider(code: unknown): MailProvider {
  return cleanString(code, 60) === "google_workspace" ? "gmail" : "outlook"
}

export function providerCode(provider: unknown) {
  if (provider === "gmail") return "google_workspace"
  if (provider === "outlook") return "microsoft_365"
  throw new InboxHttpError(400, "Choose Gmail or Outlook.", "provider_invalid")
}

export function connectionStatus(row: Record<string, unknown>) {
  if (row.CommConn_IsDeleted === true || row.CommConn_StatusCode === "revoked") return "disconnected"
  if (row.CommConn_StatusCode === "error") return "reauthorization_required"
  if (row.CommConn_StatusCode !== "active") return "syncing"
  return "connected"
}

export function readAllowedOrigins(environment: Record<string, string | undefined>) {
  const values = [
    ...(environment.EMAIL_ALLOWED_REDIRECT_ORIGINS ?? "").split(","),
    environment.EMAIL_CANONICAL_APP_ORIGIN ?? "",
    environment.APP_URL ?? "",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]
  const result = new Set<string>()
  for (const raw of values) {
    try {
      const url = new URL(raw.trim())
      if (url.origin === raw.trim() && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
        result.add(url.origin)
      }
    } catch { /* ignore malformed configuration */ }
  }
  return result
}

export function corsHeaders(request: Request, allowedOrigins: Set<string>) {
  const origin = request.headers.get("Origin")?.trim() ?? ""
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "content-disposition, content-length, content-type, retry-after, x-content-safety",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  }
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

export function assertAllowedRequestOrigin(request: Request, allowedOrigins: Set<string>) {
  const origin = request.headers.get("Origin")?.trim()
  if (origin && !allowedOrigins.has(origin)) {
    throw new InboxHttpError(403, "This workspace address is not approved for Inbox access.", "origin_not_allowed")
  }
}

export function jsonResponse(request: Request, allowedOrigins: Set<string>, body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, allowedOrigins), "Content-Type": "application/json; charset=utf-8" },
  })
}

export function problemResponse(request: Request, allowedOrigins: Set<string>, error: unknown) {
  const known = error instanceof InboxHttpError ? error : new InboxHttpError(500, "The inbox is temporarily unavailable.", "server_error")
  return jsonResponse(request, allowedOrigins, {
    type: `https://multideck.app/problems/${known.code}`,
    title: known.status === 401 ? "Authentication required" : known.status === 403 ? "Access denied" : "Inbox request failed",
    detail: known.message,
    status: known.status,
    code: known.code,
  }, known.status)
}

export async function readJson(request: Request, maximumBytes = 128 * 1024) {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > maximumBytes) throw new InboxHttpError(413, "This request is too large.", "request_too_large")
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) throw new InboxHttpError(413, "This request is too large.", "request_too_large")
  let value: unknown
  try { value = JSON.parse(raw || "{}") } catch { throw new InboxHttpError(400, "Check the request and try again.", "request_invalid") }
  if (!isObject(value)) throw new InboxHttpError(400, "Check the request and try again.", "request_invalid")
  return value
}

export function parseFunctionPath(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname
  const marker = "/inbox-api"
  const index = pathname.indexOf(marker)
  const suffix = index >= 0 ? pathname.slice(index + marker.length) : pathname
  return suffix.split("/").filter(Boolean).map((part) => decodeURIComponent(part))
}

export function encodeCursor(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeCursor(value: string | null) {
  if (!value) return 0
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
    const parsed = JSON.parse(atob(padded))
    return Number.isSafeInteger(parsed?.offset) && parsed.offset >= 0 ? parsed.offset : 0
  } catch {
    throw new InboxHttpError(400, "The inbox page cursor is invalid.", "cursor_invalid")
  }
}

export function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function base64UrlEncode(value: Uint8Array) {
  return base64Encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64Encode(value: Uint8Array) {
  let binary = ""
  // Chunked, so a multi-megabyte attachment cannot overflow the argument list.
  const chunk = 0x8000
  for (let offset = 0; offset < value.length; offset += chunk) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/**
 * What one outbound message may carry. Both providers are held to the same
 * numbers, so a file that attaches in Gmail attaches in Outlook too, and the
 * composer can enforce the identical limits before anything leaves the browser.
 */
export const OUTBOUND_ATTACHMENT_LIMITS = {
  maxCount: 10,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 15 * 1024 * 1024,
}

export type OutboundAttachment = { fileName: string; mimeType: string; bytes: Uint8Array }

/**
 * Reads the files a send request carries.
 *
 * The name and the media type are both narrowed to what the rest of the system
 * already trusts: a path can never escape its leaf, and a type the mailbox is
 * not prepared to carry becomes `application/octet-stream` rather than being
 * relayed as the sender described it.
 */
export function readOutboundAttachments(value: unknown): OutboundAttachment[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new InboxHttpError(400, "Check the attachments and try again.", "attachments_invalid")
  if (value.length > OUTBOUND_ATTACHMENT_LIMITS.maxCount) {
    throw new InboxHttpError(400, `A message can carry ${OUTBOUND_ATTACHMENT_LIMITS.maxCount} files.`, "too_many_attachments")
  }

  const attachments: OutboundAttachment[] = []
  let total = 0

  for (const entry of value) {
    if (!isObject(entry)) throw new InboxHttpError(400, "Check the attachments and try again.", "attachments_invalid")
    const encoded = cleanString(entry.contentBase64, 30_000_000)
    if (!encoded) throw new InboxHttpError(400, "One of the attachments arrived empty.", "attachment_empty")

    let bytes: Uint8Array
    try {
      const binary = atob(encoded)
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    } catch {
      throw new InboxHttpError(400, "One of the attachments could not be read.", "attachment_invalid")
    }

    if (bytes.byteLength > OUTBOUND_ATTACHMENT_LIMITS.maxFileBytes) {
      throw new InboxHttpError(413, "One of the attachments is too large to send.", "attachment_too_large")
    }
    total += bytes.byteLength
    if (total > OUTBOUND_ATTACHMENT_LIMITS.maxTotalBytes) {
      throw new InboxHttpError(413, "These attachments are too large to send together.", "attachments_too_large")
    }

    attachments.push({ fileName: safeFileName(entry.fileName), mimeType: safeMimeType(entry.mimeType), bytes })
  }

  return attachments
}

export function parseAddressHeader(value: unknown): MailAddress[] {
  const input = cleanString(value, 20_000)
  if (!input) return []
  const parts = input.match(/(?:[^,"]|"[^"]*")+/g) ?? []
  return normalizeAddresses(parts.map((part) => {
    const match = part.trim().match(/^(.*?)\s*<([^>]+)>$/)
    return { address: (match?.[2] ?? part).trim(), displayName: cleanString(match?.[1]?.replace(/^"|"$/g, ""), 240) || null }
  }))
}

export function headerMap(headers: unknown) {
  const result: Record<string, string> = {}
  if (!Array.isArray(headers)) return result
  for (const row of headers) {
    if (!isObject(row)) continue
    const name = cleanString(row.name, 200).toLowerCase()
    const value = cleanString(row.value, 20_000)
    if (name && value) result[name] = value
  }
  return result
}

export function normalizeSubject(value: unknown) {
  let subject = cleanString(value, 500) || "(No subject)"
  while (/^(?:re|fw|fwd):\s*/i.test(subject)) subject = subject.replace(/^(?:re|fw|fwd):\s*/i, "")
  return subject.toLowerCase()
}

export async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function escapeHeader(value: unknown, maximum = 500) {
  return cleanString(value, maximum).replace(/[\r\n\u0000]/g, " ")
}

export function encodeHeaderValue(value: unknown, maximum = 500) {
  const safe = escapeHeader(value, maximum)
  if (/^[\x20-\x7e]*$/.test(safe)) return safe
  const bytes = new TextEncoder().encode(safe)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

export type MimeMessage = {
  from: MailAddress; to: MailAddress[]; cc: MailAddress[]; bcc: MailAddress[]; subject: string; bodyText: string;
  bodyHtml?: string | null; inReplyTo?: string | null; references?: string | null; attachments?: OutboundAttachment[]
}

/**
 * The RFC 2822 text of one outbound message.
 *
 * With no files it stays a single text/plain part, exactly as it always was. As
 * soon as anything is attached it becomes multipart/mixed: the words are the
 * first part, each file follows base64-encoded and wrapped at 76 columns, and
 * the boundary is random per message so nothing in a body can close a part early.
 */
export function buildMimeMessage(input: MimeMessage) {
  const format = (address: MailAddress) => address.displayName
    ? `${encodeHeaderValue(address.displayName, 240)} <${address.address}>`
    : address.address
  const attachments = input.attachments ?? []
  const boundary = `--=_multideck_${crypto.randomUUID().replace(/-/g, "")}`
  const alternativeBoundary = `--=_multideck_alt_${crypto.randomUUID().replace(/-/g, "")}`
  const body = input.bodyText.replace(/\r?\n/g, "\r\n")
  const html = input.bodyHtml?.replace(/\r?\n/g, "\r\n") ?? null

  const headers = [
    `From: ${format(input.from)}`,
    `To: ${input.to.map(format).join(", ")}`,
    ...(input.cc.length ? [`Cc: ${input.cc.map(format).join(", ")}`] : []),
    ...(input.bcc.length ? [`Bcc: ${input.bcc.map(format).join(", ")}`] : []),
    `Subject: ${encodeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    ...(input.inReplyTo ? [`In-Reply-To: ${escapeHeader(input.inReplyTo)}`] : []),
    ...(input.references ? [`References: ${escapeHeader(input.references, 2_000)}`] : []),
  ]

  if (attachments.length === 0 && !html) {
    return [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body].join("\r\n")
  }

  if (attachments.length === 0 && html) {
    return [...headers, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "",
      `--${alternativeBoundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body,
      `--${alternativeBoundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html,
      `--${alternativeBoundary}--`, ""].join("\r\n")
  }

  const parts = [
    `--${boundary}`,
    ...(html ? [
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "",
      `--${alternativeBoundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body,
      `--${alternativeBoundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html,
      `--${alternativeBoundary}--`, "",
    ] : ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body]),
  ]

  for (const attachment of attachments) {
    const name = encodeHeaderValue(attachment.fileName, 260)
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      base64Encode(attachment.bytes).replace(/(.{76})/g, "$1\r\n").trimEnd(),
    )
  }

  parts.push(`--${boundary}--`, "")

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n")
}

export function buildRfc2822(input: MimeMessage) {
  return base64UrlEncode(new TextEncoder().encode(buildMimeMessage(input)))
}

export function providerErrorStatus(response: Response) {
  if (response.status === 401 || response.status === 403) return new InboxHttpError(409, "Reconnect this mailbox before continuing.", "reauthorization_required")
  if (response.status === 429) return new InboxHttpError(429, "The mail provider is rate limiting this account. Try again shortly.", "rate_limited")
  return new InboxHttpError(502, `The mail provider returned status ${response.status}.`, "provider_unavailable", response.status)
}
