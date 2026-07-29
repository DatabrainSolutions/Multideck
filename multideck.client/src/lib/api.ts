const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "")
const localApiBaseUrl = import.meta.env.DEV ? "http://localhost:5273" : ""

export const apiBaseUrl = configuredApiBaseUrl || localApiBaseUrl

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
  status: string
  actorType?: "internal" | "customer"
  organisations?: ApiOrganisation[]
  permissions?: string[]
  landingPath?: string
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
  expiresAt: string | null
}

export type ApiTeamUsersResponse = {
  company: ApiCompany | null
  offices: ApiOffice[]
  users: ApiTeamUser[]
}

export type CreateTeamUserRequest = {
  email: string
  firstName?: string | null
  lastName?: string | null
  companyId?: string | null
  officeId?: string | null
  roleTitle?: string | null
  roleId?: string | null
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

export type CreateSupportTicketRequest = {
  idempotencyKey: string
  topic: string
  priority: string
  title: string
  description: string
  applicationUrl: string
}

export type CreateSupportTicketResponse = {
  ticket: {
    ticketNumber: string
    status: string
    createdAt: string
    statusUrl: string | null
  }
  duplicate: boolean
}

export class ApiSupportTicketError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "ApiSupportTicketError"
  }
}

function getApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`
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

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)

  return fetch(getApiUrl(path), {
    ...init,
    headers,
  })
}

export async function createApiSupportTicket(
  accessToken: string,
  request: CreateSupportTicketRequest,
): Promise<CreateSupportTicketResponse> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 13_000)
  let response: Response

  try {
    response = await apiFetch("/api/v1/support/tickets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiSupportTicketError(
        "support_service_timeout",
        "Support took too long to respond. Your ticket details are still here; try again.",
        504,
      )
    }

    throw new ApiSupportTicketError(
      "support_service_unavailable",
      "Support is temporarily unavailable. Your ticket details are still here; try again.",
      503,
    )
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    let code = "support_service_unavailable"
    let message = `${response.status} ${response.statusText}`.trim()

    try {
      const body = await response.json()
      if (typeof body.code === "string") code = body.code
      if (typeof body.message === "string") message = body.message
      else if (typeof body.detail === "string") message = body.detail
    } catch {
      // Keep the safe API fallback. Never surface an unparsed upstream response.
    }

    throw new ApiSupportTicketError(code, message, response.status)
  }

  const result = await response.json() as CreateSupportTicketResponse
  if (!result.ticket?.ticketNumber) {
    throw new ApiSupportTicketError(
      "support_service_invalid_response",
      "Support did not confirm a ticket number. Your ticket details are still here; try again.",
      502,
    )
  }

  return result
}

export async function getApiAuthSession(accessToken: string): Promise<ApiAuthSession> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 8000)
  let response: Response

  try {
    response = await apiFetch("/api/auth/session", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthSession>
}

export async function getApiTeamUsers(accessToken: string): Promise<ApiTeamUsersResponse> {
  const response = await apiFetch("/api/v1/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiTeamUsersResponse>
}

export async function createApiTeamUser(accessToken: string, user: CreateTeamUserRequest): Promise<CreateTeamUserResponse> {
  const response = await apiFetch("/api/v1/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<CreateTeamUserResponse>
}

export async function changeApiTeamUserOffice(accessToken: string, userId: string, request: ChangeTeamUserOfficeRequest): Promise<ApiTeamUser> {
  const response = await apiFetch(`/api/v1/users/${userId}/office`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiTeamUser>
}

export async function getApiAuthorizationState(accessToken: string): Promise<ApiAuthorizationState> {
  const response = await apiFetch("/api/authorization", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthorizationState>
}

export async function createApiAuthorizationRole(accessToken: string, request: CreateAuthorizationRoleRequest): Promise<ApiAuthorizationRole> {
  const response = await apiFetch("/api/authorization/roles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthorizationRole>
}

export async function deleteApiAuthorizationRole(accessToken: string, roleId: string): Promise<void> {
  const response = await apiFetch(`/api/authorization/roles/${roleId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
}

export async function updateApiRolePermissions(accessToken: string, roleId: string, request: UpdateRolePermissionsRequest): Promise<ApiAuthorizationRole> {
  const response = await apiFetch(`/api/authorization/roles/${roleId}/permissions`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthorizationRole>
}

export async function updateApiUserRoles(accessToken: string, userId: string, request: UpdateUserRolesRequest): Promise<ApiUserRoleAssignment> {
  const response = await apiFetch(`/api/authorization/users/${userId}/roles`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiUserRoleAssignment>
}
