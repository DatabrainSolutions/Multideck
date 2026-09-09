const encoder = new TextEncoder()
const decoder = new TextDecoder()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type InvitationExpiry = "3d" | "7d" | "30d" | "never"

const invitationLifetimeSeconds: Record<Exclude<InvitationExpiry, "never">, number> = {
  "3d": 3 * 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
}

type InvitationTicketPayload = {
  version: 1
  purpose: "multideck-password-setup"
  userId: string
  expiry: InvitationExpiry
  issuedAt: number
  expiresAt: number | null
}

export function parseInvitationExpiry(value: unknown): InvitationExpiry {
  return value === "3d" || value === "7d" || value === "30d" || value === "never" ? value : "7d"
}

function encodeBase64Url(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`multideck-invitation:${value}`)))
}

function signaturesMatch(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export async function createInvitationTicket(userId: string, secret: string, expiry: InvitationExpiry = "7d", now = Date.now()) {
  if (!uuidPattern.test(userId) || !secret) throw new Error("Invitation ticket configuration is invalid.")
  const issuedAt = Math.floor(now / 1000)
  const payload: InvitationTicketPayload = {
    version: 1,
    purpose: "multideck-password-setup",
    userId,
    expiry,
    issuedAt,
    expiresAt: expiry === "never" ? null : issuedAt + invitationLifetimeSeconds[expiry],
  }
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)))
  return `${encodedPayload}.${encodeBase64Url(await signature(encodedPayload, secret))}`
}

export async function verifyInvitationTicket(ticket: string, secret: string, now = Date.now()) {
  const [encodedPayload, encodedSignature, extra] = ticket.split(".")
  if (!encodedPayload || !encodedSignature || extra || !secret) throw new Error("Invitation ticket is invalid.")

  const suppliedSignature = decodeBase64Url(encodedSignature)
  const expectedSignature = await signature(encodedPayload, secret)
  if (!signaturesMatch(suppliedSignature, expectedSignature)) throw new Error("Invitation ticket is invalid.")

  const payload = JSON.parse(decoder.decode(decodeBase64Url(encodedPayload))) as InvitationTicketPayload
  const nowSeconds = Math.floor(now / 1000)
  const expiry = parseInvitationExpiry(payload.expiry)
  const expiryIsValid = expiry === payload.expiry && (
    expiry === "never"
      ? payload.expiresAt === null
      : typeof payload.expiresAt === "number"
        && Number.isInteger(payload.expiresAt)
        && payload.expiresAt === payload.issuedAt + invitationLifetimeSeconds[expiry]
        && payload.expiresAt > nowSeconds
  )
  if (
    payload.version !== 1
    || payload.purpose !== "multideck-password-setup"
    || !uuidPattern.test(payload.userId)
    || !Number.isInteger(payload.issuedAt)
    || !expiryIsValid
    || payload.issuedAt > nowSeconds + 60
  ) throw new Error("Invitation ticket is invalid or expired.")

  return payload
}
