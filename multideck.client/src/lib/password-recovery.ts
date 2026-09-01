import type { Session } from "@supabase/supabase-js"

const RECOVERY_MARKER_KEY = "multideck.password-recovery"
const RECOVERY_MARKER_LIFETIME_MS = 10 * 60 * 1000
const sensitiveQueryParameters = [
  "code",
  "token_hash",
  "type",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "provider_token",
  "provider_refresh_token",
]

export type PasswordRecoveryLink =
  | { kind: "token-hash"; tokenHash: string }
  | { kind: "legacy-code"; code: string }
  | { kind: "legacy-session"; accessToken: string; refreshToken: string }
  | { kind: "invalid"; reason: "denied" | "malformed" }
  | { kind: "missing" }

type RecoveryMarker = {
  userId: string
  expiresAt: number
}

export function createRecoveryMarker(userId: string, now = Date.now()): RecoveryMarker {
  return { userId, expiresAt: now + RECOVERY_MARKER_LIFETIME_MS }
}

export function recoveryMarkerMatches(marker: RecoveryMarker | null, userId: string | null, now = Date.now()) {
  return Boolean(marker && userId && marker.userId === userId && marker.expiresAt > now)
}

function callbackParameters(url: URL) {
  const query = url.searchParams
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash)
  return { query, fragment }
}

function firstParameter(query: URLSearchParams, fragment: URLSearchParams, name: string) {
  return fragment.get(name) ?? query.get(name)
}

function isPlausibleTokenHash(value: string) {
  return value.length >= 20 && value.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(value)
}

function isPlausibleAuthorizationCode(value: string) {
  return value.length >= 20 && value.length <= 4096 && !/\s/.test(value)
}

function isPlausibleSessionToken(value: string) {
  return value.length >= 20 && value.length <= 8192 && !/\s/.test(value)
}

export function parsePasswordRecoveryLink(value: string | URL): PasswordRecoveryLink {
  const url = value instanceof URL ? value : new URL(value, "https://multideck.app")
  const { query, fragment } = callbackParameters(url)
  const error = firstParameter(query, fragment, "error")
  const errorCode = firstParameter(query, fragment, "error_code")
  if (error || errorCode) return { kind: "invalid", reason: "denied" }

  const type = firstParameter(query, fragment, "type")
  const accessToken = firstParameter(query, fragment, "access_token") ?? ""
  const refreshToken = firstParameter(query, fragment, "refresh_token") ?? ""
  if (accessToken || refreshToken) {
    return type === "recovery" && isPlausibleSessionToken(accessToken) && isPlausibleSessionToken(refreshToken)
      ? { kind: "legacy-session", accessToken, refreshToken }
      : { kind: "invalid", reason: "malformed" }
  }

  const tokenHash = firstParameter(query, fragment, "token_hash") ?? ""
  if (tokenHash || type === "recovery") {
    return type === "recovery" && isPlausibleTokenHash(tokenHash)
      ? { kind: "token-hash", tokenHash }
      : { kind: "invalid", reason: "malformed" }
  }

  const code = query.get("code") ?? ""
  if (code) {
    return isPlausibleAuthorizationCode(code)
      ? { kind: "legacy-code", code }
      : { kind: "invalid", reason: "malformed" }
  }

  return { kind: "missing" }
}

export function scrubPasswordRecoveryUrl(value: string | URL) {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(value, "https://multideck.app")
  sensitiveQueryParameters.forEach((name) => url.searchParams.delete(name))
  url.hash = ""
  return `${url.pathname}${url.search}`
}

export function capturePasswordRecoveryLink(): PasswordRecoveryLink {
  if (typeof window === "undefined") return { kind: "missing" }
  const url = new URL(window.location.href)
  if (url.pathname !== "/auth" || url.searchParams.get("mode") !== "reset-password") return { kind: "missing" }

  const context = parsePasswordRecoveryLink(url)
  if (context.kind !== "missing" || url.hash) {
    window.history.replaceState({}, document.title, scrubPasswordRecoveryUrl(url))
  }
  return context
}

function readMarker(): RecoveryMarker | null {
  if (typeof window === "undefined") return null
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(RECOVERY_MARKER_KEY) ?? "null") as Partial<RecoveryMarker> | null
    if (!parsed || typeof parsed.userId !== "string" || typeof parsed.expiresAt !== "number") return null
    return { userId: parsed.userId, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function rememberVerifiedPasswordRecovery(session: Session, now = Date.now()) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, JSON.stringify(createRecoveryMarker(session.user.id, now)))
  } catch {
    // Recovery still works in this view when session storage is unavailable.
  }
}

export function hasVerifiedPasswordRecovery(session: Session | null, now = Date.now()) {
  const marker = readMarker()
  if (!recoveryMarkerMatches(marker, session?.user.id ?? null, now)) {
    clearVerifiedPasswordRecovery()
    return false
  }
  return true
}

export function clearVerifiedPasswordRecovery() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(RECOVERY_MARKER_KEY)
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
