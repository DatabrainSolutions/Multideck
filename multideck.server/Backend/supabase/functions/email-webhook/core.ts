export type WebhookProvider = "gmail" | "outlook"

export type ResolvedSubscription = {
  subscriptionId: string
  connectionId: string
  mailboxId: string | null
  providerSubscriptionId: string | null
  providerResource: string
  clientStateSecretRef: string | null
  expiresAt: string
}

const encoder = new TextEncoder()

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function cleanString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export function isWebhookProvider(value: unknown): value is WebhookProvider {
  return value === "gmail" || value === "outlook"
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export async function sha256(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
}

export async function constantTimeEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  const a = new Uint8Array(leftHash)
  const b = new Uint8Array(rightHash)
  let difference = a.length ^ b.length
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return difference === 0
}

export function decodePubSubData(value: unknown) {
  const encoded = cleanString(value, 16_000)
  if (!encoded) throw new Error("notification_invalid")
  try {
    const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!isPlainObject(parsed)) throw new Error("notification_invalid")
    return parsed
  } catch {
    throw new Error("notification_invalid")
  }
}

export function parseResolvedSubscription(value: unknown): ResolvedSubscription | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!isPlainObject(row)) return null
  const subscription: ResolvedSubscription = {
    subscriptionId: cleanString(row.subscription_id, 80),
    connectionId: cleanString(row.connection_id, 80),
    mailboxId: cleanString(row.mailbox_id, 80) || null,
    providerSubscriptionId: cleanString(row.provider_subscription_id, 320) || null,
    providerResource: cleanString(row.provider_resource, 500),
    clientStateSecretRef: cleanString(row.client_state_secret_ref, 240) || null,
    expiresAt: cleanString(row.expires_at, 80),
  }
  return subscription.subscriptionId && subscription.connectionId && subscription.providerResource &&
      Date.parse(subscription.expiresAt) > Date.now()
    ? subscription
    : null
}

export function resourceMatches(subscriptionResource: string, notificationResource: string) {
  const expected = subscriptionResource.trim().replace(/^\/+|\/+$/g, "").toLowerCase()
  const actual = notificationResource.trim().replace(/^\/+|\/+$/g, "").toLowerCase()
  return Boolean(expected) && (actual === expected || actual.startsWith(`${expected}/`))
}

export function canonicalNotification(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalNotification).join(",")}]`
  if (!isPlainObject(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => {
    if (key === "clientState" || key === "encryptedContent") return ""
    return `${JSON.stringify(key)}:${canonicalNotification(value[key])}`
  }).filter(Boolean).join(",")}}`
}

export function microsoftProviderEventId(notification: Record<string, unknown>) {
  return cleanString(notification.id, 240) || cleanString(notification.sequenceNumber, 240) || null
}

export async function microsoftDedupeKey(notification: Record<string, unknown>) {
  const subscriptionId = cleanString(notification.subscriptionId, 320)
  const providerEventId = microsoftProviderEventId(notification)
  const material = providerEventId
    ? `${subscriptionId}:${providerEventId}`
    : canonicalNotification(notification)
  return `outlook:${await sha256(material)}`
}

export type SecretRpc = (
  functionName: string,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

export async function getSecret(rpc: SecretRpc, secretRef: string) {
  const { data, error } = await rpc("comm_get_email_secret", { p_secret_ref: secretRef })
  const secret = cleanString(Array.isArray(data) ? data[0] : data, 32_000)
  if (error || !secret) throw new Error("webhook_configuration_missing")
  return secret
}

async function fetchWithTimeout(url: string, init: RequestInit, milliseconds = 8_000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), milliseconds)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function verifyGooglePushJwt(
  authorization: string,
  expectedAudience: string,
  expectedServiceAccount: string,
) {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  if (!match || !expectedAudience || !expectedServiceAccount) throw new Error("webhook_unauthorized")
  const response = await fetchWithTimeout(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(match[1])}`,
    { headers: { Accept: "application/json" } },
  )
  const claims = await response.json().catch(() => null)
  if (!response.ok || !isPlainObject(claims)) throw new Error("webhook_unauthorized")

  const issuer = cleanString(claims.iss, 200)
  const audience = cleanString(claims.aud, 1000)
  const email = cleanString(claims.email, 320).toLowerCase()
  const verified = claims.email_verified === true || claims.email_verified === "true"
  const expiry = Number(claims.exp)
  if (
    (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") ||
    audience !== expectedAudience ||
    email !== expectedServiceAccount.toLowerCase() ||
    !verified ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("webhook_unauthorized")
  }
}
