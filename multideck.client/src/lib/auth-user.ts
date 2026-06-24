import type { User } from "@supabase/supabase-js"

export type AuthUserSummary = {
  name: string | null
  email: string | null
  initials: string
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

export function summarizeAuthUser(user: User): AuthUserSummary {
  const email = user.email?.trim() || null
  const firstName = readMetadataString(user, ["first_name", "firstName"])
  const lastName = readMetadataString(user, ["last_name", "lastName"])
  const joinedName = `${firstName ?? ""} ${lastName ?? ""}`.trim() || null
  const name = readMetadataString(user, ["full_name", "name", "display_name", "preferred_name"]) ?? joinedName

  return {
    name,
    email,
    initials: makeInitials(name ?? email),
  }
}
