import { supabase } from "@/lib/supabase"

export type DexterWritingProfileStatus = "not_started" | "processing" | "ready" | "insufficient" | "error"

export type DexterWritingProfile = {
  exists: boolean
  enabled: boolean
  status: DexterWritingProfileStatus
  profileText: string
  eligibleMessageCount: number
  analysedMessageCount: number
  consentedAt: string | null
  lastGeneratedAt: string | null
  nextRefreshAt: string | null
  lastError: string | null
}

export class DexterWritingProfileError extends Error {
  readonly code: string

  constructor(message: string, code = "writing_profile_failed") {
    super(message)
    this.name = "DexterWritingProfileError"
    this.code = code
  }
}

function profileFrom(value: unknown): DexterWritingProfile {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const status = row.status === "processing" || row.status === "ready" || row.status === "insufficient" || row.status === "error"
    ? row.status
    : "not_started"
  return {
    exists: row.exists === true,
    enabled: row.enabled === true,
    status,
    profileText: typeof row.profileText === "string" ? row.profileText : "",
    eligibleMessageCount: typeof row.eligibleMessageCount === "number" ? Math.max(0, row.eligibleMessageCount) : 0,
    analysedMessageCount: typeof row.analysedMessageCount === "number" ? Math.max(0, row.analysedMessageCount) : 0,
    consentedAt: typeof row.consentedAt === "string" ? row.consentedAt : null,
    lastGeneratedAt: typeof row.lastGeneratedAt === "string" ? row.lastGeneratedAt : null,
    nextRefreshAt: typeof row.nextRefreshAt === "string" ? row.nextRefreshAt : null,
    lastError: typeof row.lastError === "string" ? row.lastError : null,
  }
}

async function profileError(error: unknown, fallback: string) {
  let message = fallback
  let code = "writing_profile_failed"
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as { code?: unknown; message?: unknown }
      if (typeof body.message === "string" && body.message.trim()) message = body.message
      if (typeof body.code === "string" && body.code.trim()) code = body.code
    } catch {
      // Retain the safe product-facing fallback.
    }
  } else if (error instanceof Error && error.message.trim()) {
    message = error.message
  }
  return new DexterWritingProfileError(message, code)
}

async function invoke(operation: "get" | "consent" | "refresh" | "update" | "reset", body: Record<string, unknown> = {}) {
  if (!supabase) throw new DexterWritingProfileError("Dexter settings are not connected to this workspace.", "not_configured")
  const { data, error } = await supabase.functions.invoke<{ profile?: unknown }>("dexter-writing-profile", {
    body: { operation, ...body },
  })
  if (error) throw await profileError(error, "Unable to load your email writing profile.")
  if (!data || !("profile" in data)) throw new DexterWritingProfileError("Dexter returned an incomplete writing profile.")
  return profileFrom(data.profile)
}

export function getDexterWritingProfile() {
  return invoke("get")
}

export function consentToDexterWritingProfile() {
  return invoke("consent")
}

export function refreshDexterWritingProfile() {
  return invoke("refresh")
}

export function updateDexterWritingProfile(enabled: boolean, profileText: string) {
  return invoke("update", { enabled, profileText })
}

export function resetDexterWritingProfile() {
  return invoke("reset")
}
