import { supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"
import {
  getOrCreateWorkspaceBootstrap,
  invalidateWorkspaceBootstrap,
  type WorkspaceBootstrapPayload,
} from "@/lib/workspace-bootstrap"
import { invalidateRegisterPages, readCachedRegisterPage, type RegisterSort } from "@/lib/application-data-api"

export type ApiCompany = {
  id: string
  name: string
}

export type ApiOrganisation = ApiCompany & {
  canManageWarehouseUsers?: boolean
}

export type ApiOffice = {
  id: string
  name: string
  address: string | null
}

export type ApiTeamRole = {
  id: string
  name: string
}

export type ApiDepartment = {
  id: string
  name: string
  isActive: boolean
}

export type ApiUserProfilePhoto = {
  bucket: "profile-photos"
  path: string
  mimeType: "image/jpeg" | "image/png" | "image/webp"
  sizeBytes: number
  updatedAt: string
}

export type ApiTeamUser = {
  id: string
  authUserId: string | null
  displayName: string
  firstName: string | null
  lastName: string | null
  email: string
  company: ApiCompany | null
  offices: ApiOffice[]
  roles: ApiTeamRole[]
  departments: ApiDepartment[]
  status: string
  deactivatedAt?: string | null
  invitationSentAt?: string | null
  actorType?: "internal" | "customer"
  organisations?: ApiOrganisation[]
  permissions?: string[]
  landingPath?: string
  jobTitle: string | null
  profilePhoto: ApiUserProfilePhoto | null
  coverPhoto: ApiUserProfilePhoto | null
}

export type ApiDeletionImpactGroup = {
  key: string
  table: string
  field?: string
  count: number
}

export type ApiTeamUserDeletionImpact = {
  alreadyDeleted: boolean
  requiresReassignment: boolean
  totalTransferable: number
  groups: ApiDeletionImpactGroup[]
  cleanup: ApiDeletionImpactGroup[]
  retainedAttribution: ApiDeletionImpactGroup[]
  impactToken: string
  eligibleUsers: ApiTeamUser[]
}

export type ApiTeamUserDeletionResult = {
  notificationEmail: {
    status: "sent" | "failed" | "already_processed"
    providerId: string | null
  }
}

export type ApiTeamUserReplacementPage = {
  users: ApiTeamUser[]
  total: number
}

export type ApiAuthSession = {
  authenticated: boolean
  user: {
    id: string | null
    email: string | null
    role: string | null
    audience: string | null
  }
  profile: ApiTeamUser | null
  workspace?: WorkspaceBootstrapPayload | null
  expiresAt: string | null
}

export type ApiTeamUsersResponse = {
  company: ApiCompany | null
  offices: ApiOffice[]
  departments: ApiDepartment[]
  users: ApiTeamUser[]
}

export type ApiTeamUsersPageResponse = ApiTeamUsersResponse & {
  total: number
  limit: number
  offset: number
}

export type ApiTeamUsersPageInput = {
  search?: string
  sort?: RegisterSort | null
  limit: number
  offset: number
}

export type ApiInvitationExpiry = "3d" | "7d" | "30d" | "never"

export type CreateTeamUserRequest = {
  email: string
  appOrigin: string
  firstName?: string | null
  lastName?: string | null
  companyId?: string | null
  officeId?: string | null
  roleTitle?: string | null
  roleId?: string | null
  departmentIds?: string[]
  invitationExpiry: ApiInvitationExpiry
}

export type CreateTeamUserResponse = {
  user: ApiTeamUser
  company: ApiCompany
  office: ApiOffice
  invited: boolean
}

export type ChangeTeamUserOfficeRequest = {
  officeId: string
}

export type UpdateTeamUserRequest = {
  firstName: string
  lastName: string
  jobTitle: string | null
  officeId: string
  roleIds: string[]
  departmentIds?: string[]
}

export type UpdateCurrentUserProfileRequest = {
  jobTitle: string | null
}

export type SaveCurrentUserCoverPhotoRequest = {
  bucket: "profile-photos"
  path: string
  mimeType: "image/jpeg" | "image/png" | "image/webp"
  sizeBytes: number
}

export type ApiPermission = {
  id: string
  value: string
  group: string
  name: string
  description: string
  isDangerous: boolean
}

export type ApiAuthorizationRole = {
  id: string
  name: string
  description: string
  isSystem: boolean
  isLegacyCustom: boolean
  canEditPermissions: boolean
  permissionValues: string[]
}

export type ApiUserRoleAssignment = {
  userId: string
  roleIds: string[]
}

export type ApiAuthorizationState = {
  permissions: ApiPermission[]
  roles: ApiAuthorizationRole[]
  userRoles: ApiUserRoleAssignment[]
}

export type CreateAuthorizationRoleRequest = {
  name: string
  permissionValues: string[]
}

export type UpdateRolePermissionsRequest = {
  permissionValues: string[]
}

export type UpdateUserRolesRequest = {
  roleIds: string[]
}

async function parseApiError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim()

  try {
    const body = await response.json()
    return body.detail || body.title || body.message || fallback
  } catch {
    return fallback
  }
}

export async function edgeFetch(functionName: string, path: string, accessToken: string, init: RequestInit = {}) {
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("Supabase is not configured for this workspace.")
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("apikey", supabasePublicApiKey)

  return fetch(`${supabaseFunctionsUrl}/${functionName}${path ? (path.startsWith("/") ? path : `/${path}`) : ""}`, {
    ...init,
    headers,
  })
}

export async function getApiAuthSession(accessToken: string): Promise<ApiAuthSession> {
  return getOrCreateWorkspaceBootstrap(accessToken, async () => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 8000)
    let response: Response

    try {
      response = await edgeFetch("account", "", accessToken, {
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The API session check timed out.")
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }

    if (!response.ok) throw new Error(await parseApiError(response))
    return response.json() as Promise<ApiAuthSession>
  })
}

export async function getApiWorkspacePreferences(accessToken: string) {
  const session = await getApiAuthSession(accessToken)
  return session.workspace === undefined ? undefined : session.workspace?.preferences ?? null
}

export function getApiTeamUsersByIds(accessToken: string, userIds: string[], signal?: AbortSignal): Promise<ApiTeamUser[]> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 50)
  if (!ids.length) return Promise.resolve([])
  const resource = `team-users:lookup:${ids.slice().sort().join(",")}`
  return readCachedRegisterPage(accessToken, resource, async (sharedSignal) => {
    const query = new URLSearchParams({ ids: ids.join(",") })
    const response = await edgeFetch("team", `/lookup?${query}`, accessToken, { signal: sharedSignal })
    if (!response.ok) throw new Error(await parseApiError(response))
    const payload = await response.json() as { users?: ApiTeamUser[] }
    return payload.users ?? []
  }, signal)
}

export function invalidateApiTeamUsers() {
  invalidateRegisterPages("team-users:")
  invalidateRegisterPages("team-authorization:")
}

export function getApiTeamUsersPage(accessToken: string, input: ApiTeamUsersPageInput, signal?: AbortSignal): Promise<ApiTeamUsersPageResponse> {
  const request = {
    search: input.search?.trim().slice(0, 200) ?? "",
    sort: input.sort?.id ?? "user",
    direction: input.sort?.direction ?? "asc",
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    offset: Math.max(Math.trunc(input.offset), 0),
  }
  const resource = `team-users:${JSON.stringify(request)}`
  return readCachedRegisterPage(accessToken, resource, async (sharedSignal) => {
    const query = new URLSearchParams(Object.entries(request).map(([key, value]) => [key, String(value)]))
    const response = await edgeFetch("team", `/page?${query}`, accessToken, { signal: sharedSignal })
    if (!response.ok) {
      const detail = await parseApiError(response)
      const missingBoundedRead = response.status === 404
        || /pgrst202|multideck_team_users_register_page.*(?:not find|does not exist)/i.test(detail)
      if (missingBoundedRead) throw new Error("Workspace user paging is still being prepared. Try again shortly.")
      throw new Error(detail)
    }
    return response.json() as Promise<ApiTeamUsersPageResponse>
  }, signal)
}

export function getApiAuthorizationCatalogue(accessToken: string, signal?: AbortSignal): Promise<ApiAuthorizationState> {
  return readCachedRegisterPage(accessToken, "team-authorization:catalogue", async (sharedSignal) => {
    const response = await edgeFetch("team", "/authorization/catalogue", accessToken, { signal: sharedSignal })
    if (!response.ok) {
      const detail = await parseApiError(response)
      if (response.status === 404) throw new Error("The workspace role catalogue is still being prepared. Try again shortly.")
      throw new Error(detail)
    }
    return response.json() as Promise<ApiAuthorizationState>
  }, signal)
}

export async function createApiDepartment(accessToken: string, name: string): Promise<ApiDepartment> {
  const response = await edgeFetch("team", "/departments", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(await parseApiError(response))
  const department = await response.json() as ApiDepartment
  invalidateApiTeamUsers()
  return department
}

export async function getApiCurrentUser(accessToken: string): Promise<ApiTeamUser> {
  const session = await getApiAuthSession(accessToken)
  if (!session.profile) throw new Error("Your account is not linked to a Multideck profile.")
  return session.profile
}

export async function updateApiCurrentUserProfile(
  accessToken: string,
  request: UpdateCurrentUserProfileRequest,
): Promise<ApiTeamUser> {
  const response = await edgeFetch("account", "", accessToken, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const profile = await response.json() as ApiTeamUser
  invalidateWorkspaceBootstrap()
  return profile
}

export async function createApiTeamUser(accessToken: string, user: CreateTeamUserRequest): Promise<CreateTeamUserResponse> {
  const response = await edgeFetch("team", "", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const result = await response.json() as CreateTeamUserResponse
  invalidateApiTeamUsers()
  return result
}

export async function resendApiTeamUserInvitation(accessToken: string, userId: string, appOrigin: string): Promise<ApiTeamUser> {
  const response = await edgeFetch("team", `/${userId}/invitation`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ appOrigin }),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const body = await response.json() as { user: ApiTeamUser }
  invalidateApiTeamUsers()
  return body.user
}

export async function deleteApiTeamUserInvitation(accessToken: string, userId: string): Promise<void> {
  const response = await edgeFetch("team", `/${userId}/invitation`, accessToken, { method: "DELETE" })
  if (!response.ok) throw new Error(await parseApiError(response))
  invalidateApiTeamUsers()
}

export async function changeApiTeamUserOffice(accessToken: string, userId: string, request: ChangeTeamUserOfficeRequest): Promise<ApiTeamUser> {
  const response = await edgeFetch("team", `/${userId}/office`, accessToken, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const user = await response.json() as ApiTeamUser
  invalidateApiTeamUsers()
  return user
}

export async function updateApiTeamUser(accessToken: string, userId: string, request: UpdateTeamUserRequest): Promise<ApiTeamUser> {
  const response = await edgeFetch("team", `/${userId}`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(await parseApiError(response))
  const user = await response.json() as ApiTeamUser
  invalidateApiTeamUsers()
  return user
}

export async function updateApiTeamUserStatus(accessToken: string, userId: string, status: "active" | "deactivated"): Promise<ApiTeamUser> {
  const response = await edgeFetch("team", `/${userId}/status`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new Error(await parseApiError(response))
  const user = await response.json() as ApiTeamUser
  invalidateApiTeamUsers()
  return user
}

export async function resetApiTeamUserPassword(accessToken: string, userId: string, password: string): Promise<void> {
  const response = await edgeFetch("team", `/${userId}/password`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error(await parseApiError(response))
  invalidateApiTeamUsers()
}

export async function getApiTeamUserDeletionImpact(accessToken: string, userId: string): Promise<ApiTeamUserDeletionImpact> {
  const response = await edgeFetch("team", `/${userId}/deletion-impact`, accessToken)
  if (!response.ok) {
    const detail = await parseApiError(response)
    // Older tenant deployments do not expose this route. Keep deletion fail-closed,
    // but give the UI a stable signal so it can explain the required backend update
    // instead of surfacing an internal "Team endpoint not found" response.
    if (response.status === 404 || detail === "Team endpoint not found.") {
      throw new Error("USER_DELETION_IMPACT_UNAVAILABLE")
    }
    throw new Error(detail)
  }
  return response.json() as Promise<ApiTeamUserDeletionImpact>
}

export function getApiTeamUserReplacementOptions(accessToken: string, userId: string, search = "", signal?: AbortSignal): Promise<ApiTeamUserReplacementPage> {
  const normalizedSearch = search.trim().slice(0, 200)
  const resource = `team-users:replacement:${userId}:${normalizedSearch.toLowerCase()}`
  return readCachedRegisterPage(accessToken, resource, async (sharedSignal) => {
    const query = new URLSearchParams({ search: normalizedSearch, limit: "50" })
    const response = await edgeFetch("team", `/${userId}/replacement-options?${query}`, accessToken, { signal: sharedSignal })
    if (!response.ok) {
      const detail = await parseApiError(response)
      const missingBoundedRead = response.status === 404
        || /pgrst202|multideck_team_user_replacement_options.*(?:not find|does not exist)/i.test(detail)
      if (missingBoundedRead) throw new Error("Replacement user search is still being prepared. Try again shortly.")
      throw new Error(detail)
    }
    return response.json() as Promise<ApiTeamUserReplacementPage>
  }, signal)
}

export async function deleteApiTeamUser(accessToken: string, userId: string, request: { impactToken: string; replacementUserId: string | null; confirmation: string }): Promise<ApiTeamUserDeletionResult> {
  const response = await edgeFetch("team", `/${userId}`, accessToken, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  const result = await response.json() as ApiTeamUserDeletionResult
  invalidateApiTeamUsers()
  return result
}

export async function getApiAuthorizationState(accessToken: string): Promise<ApiAuthorizationState> {
  const response = await edgeFetch("team", "/authorization", accessToken)

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthorizationState>
}

export async function createApiAuthorizationRole(accessToken: string, request: CreateAuthorizationRoleRequest): Promise<ApiAuthorizationRole> {
  const response = await edgeFetch("team", "/authorization/roles", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const role = await response.json() as ApiAuthorizationRole
  invalidateApiTeamUsers()
  return role
}

export async function deleteApiAuthorizationRole(accessToken: string, roleId: string): Promise<void> {
  const response = await edgeFetch("team", `/authorization/roles/${roleId}`, accessToken, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  invalidateApiTeamUsers()
}

export async function updateApiRolePermissions(accessToken: string, roleId: string, request: UpdateRolePermissionsRequest): Promise<ApiAuthorizationRole> {
  const response = await edgeFetch("team", `/authorization/roles/${roleId}/permissions`, accessToken, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const role = await response.json() as ApiAuthorizationRole
  invalidateApiTeamUsers()
  return role
}

export async function updateApiUserRoles(accessToken: string, userId: string, request: UpdateUserRolesRequest): Promise<ApiUserRoleAssignment> {
  const response = await edgeFetch("team", `/authorization/users/${userId}/roles`, accessToken, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const assignment = await response.json() as ApiUserRoleAssignment
  invalidateApiTeamUsers()
  return assignment
}
