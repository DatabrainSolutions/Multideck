const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "")
const localApiBaseUrl = import.meta.env.DEV ? "http://localhost:5273" : ""

export const apiBaseUrl = configuredApiBaseUrl || localApiBaseUrl

export type ApiCompany = {
  id: string
  name: string
}

export type ApiOffice = {
  id: string
  name: string
  address: string | null
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
  status: string
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

export async function getApiAuthSession(accessToken: string): Promise<ApiAuthSession> {
  const response = await apiFetch("/api/auth/session", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<ApiAuthSession>
}

export async function getApiTeamUsers(accessToken: string): Promise<ApiTeamUsersResponse> {
  const response = await apiFetch("/api/users", {
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
  const response = await apiFetch("/api/users", {
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
  const response = await apiFetch(`/api/users/${userId}/office`, {
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
