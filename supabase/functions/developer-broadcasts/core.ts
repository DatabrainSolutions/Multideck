export type AudienceMode = "all" | "departments" | "users"

export type AudienceUser = {
  id: string
  email: string
  name: string
  authUserId: string | null
  accessStatus: string | null
  departments: Array<{ id: string; name: string; isActive: boolean }>
}

export type AudienceSelection = {
  mode: AudienceMode
  departmentIds: string[]
  userIds: string[]
}

export type ResolvedRecipient = AudienceUser & {
  status: "ready" | "excluded"
  exclusionReason: string | null
}

export function uniqueIds(value: unknown, maximum = 500) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, maximum)
}

export function normaliseAudience(value: unknown): AudienceSelection {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const mode = input.mode === "departments" || input.mode === "users" ? input.mode : "all"
  const departmentIds = uniqueIds(input.departmentIds)
  const userIds = uniqueIds(input.userIds)
  if (mode === "departments" && !departmentIds.length) throw new Error("Choose at least one department.")
  if (mode === "users" && !userIds.length) throw new Error("Choose at least one user.")
  return { mode, departmentIds, userIds }
}

export function resolveAudience(users: AudienceUser[], selection: AudienceSelection): ResolvedRecipient[] {
  const departmentIds = new Set(selection.departmentIds)
  const userIds = new Set(selection.userIds)
  return users
    .filter((user) => selection.mode === "all"
      || (selection.mode === "users" && userIds.has(user.id))
      || (selection.mode === "departments" && user.departments.some((department) => departmentIds.has(department.id))))
    .map((user) => {
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
      const exclusionReason = user.accessStatus && user.accessStatus !== "active"
        ? "Access is not active"
        : !user.authUserId
          ? "Invitation has not been accepted"
          : !emailValid
            ? "Email address is unavailable"
            : null
      return { ...user, status: exclusionReason ? "excluded" as const : "ready" as const, exclusionReason }
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email))
}

export function audienceSummary(selection: AudienceSelection, departments: Array<{ id: string; name: string }>, recipients: ResolvedRecipient[]) {
  const selectedDepartments = departments.filter((department) => selection.departmentIds.includes(department.id))
  return {
    mode: selection.mode,
    departmentIds: selection.departmentIds,
    departmentNames: selectedDepartments.map((department) => department.name),
    userIds: selection.userIds,
    selectedCount: recipients.length,
    recipientCount: recipients.filter((recipient) => recipient.status === "ready").length,
    excludedCount: recipients.filter((recipient) => recipient.status === "excluded").length,
  }
}

export function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}
