import type { User } from "@supabase/supabase-js"
import type { ApiTeamUser } from "@/lib/api"

export type AuthUserSummary = {
  id: string
  name: string | null
  email: string | null
  initials: string
  profilePhoto: ApiTeamUser["profilePhoto"]
  coverPhoto: ApiTeamUser["coverPhoto"]
  profilePhotoUrl: string | null
  actorType: "internal" | "customer" | "unknown"
  organisations: { id: string; name: string; canManageWarehouseUsers?: boolean }[]
  permissions: string[]
  landingPath: string
}

function readMetadataString(user: User, keys: string[]) {
  for (const key of keys) {
    const value = user.user_metadata?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return null
}

function makeInitials(value: string | null) {
  if (!value) return "MD"

  const source = value.includes("@") ? value.split("@")[0].replace(/[._-]+/g, " ") : value
  const parts = source.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : source.slice(0, 2)

  return initials.toUpperCase()
}

export function summarizeAuthUser(user: User, profile?: ApiTeamUser | null): AuthUserSummary {
  const email = user.email?.trim() || null
  const firstName = readMetadataString(user, ["first_name", "firstName"])
  const lastName = readMetadataString(user, ["last_name", "lastName"])
  const joinedName = `${firstName ?? ""} ${lastName ?? ""}`.trim() || null
  const name = profile?.displayName ?? readMetadataString(user, ["full_name", "name", "display_name", "preferred_name"]) ?? joinedName

  return {
    id: user.id,
    name,
    email,
    initials: makeInitials(name ?? email),
    profilePhoto: profile?.profilePhoto ?? null,
    coverPhoto: profile?.coverPhoto ?? null,
    profilePhotoUrl: null,
    actorType: profile?.actorType ?? "unknown",
    organisations: profile?.organisations ?? [],
    permissions: profile?.permissions ?? [],
    landingPath: profile?.landingPath ?? "/",
  }
}

export function hasPermission(user: AuthUserSummary | null | undefined, permission: string) {
  return user?.permissions.includes(permission) === true
}
