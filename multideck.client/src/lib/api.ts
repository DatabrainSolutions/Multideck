const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "")
const localApiBaseUrl = import.meta.env.DEV ? "http://localhost:5273" : ""

export const apiBaseUrl = configuredApiBaseUrl || localApiBaseUrl

export type ApiAuthSession = {
  authenticated: boolean
  user: {
    id: string | null
    email: string | null
    role: string | null
    audience: string | null
  }
  expiresAt: string | null
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
