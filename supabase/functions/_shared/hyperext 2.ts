import { HttpError } from "./backend.ts"

function configuredValue(name: string) {
  return Deno.env.get(name)?.trim() ?? ""
}

export function hyperExtConfigured() {
  return Boolean(configuredValue("HYPEREXT_SAGE50_BASE_URL") && configuredValue("HYPEREXT_SAGE50_AUTH_TOKEN"))
}

export function hyperExtOrigin() {
  const raw = configuredValue("HYPEREXT_SAGE50_BASE_URL")
  if (!raw) throw new HttpError(409, "Configure the tenant HyperExt Sage 50 URL before using this wizard.")
  let url: URL
  try { url = new URL(raw) } catch { throw new HttpError(500, "The tenant HyperExt Sage 50 URL is invalid.") }
  if (url.protocol !== "https:") throw new HttpError(500, "The HyperExt Sage 50 URL must use HTTPS.")
  url.username = ""
  url.password = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export async function hyperExtRequest(path: string, init: RequestInit = {}) {
  const token = configuredValue("HYPEREXT_SAGE50_AUTH_TOKEN")
  if (!token) throw new HttpError(409, "Configure the tenant HyperExt Sage 50 authentication token before using this wizard.")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  let response: Response
  try {
    response = await fetch(`${hyperExtOrigin()}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        AuthToken: token,
        "new-response": "true",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new HttpError(504, "The HyperExt Sage 50 connector did not respond in time.")
    throw new HttpError(502, "The HyperExt Sage 50 connector could not be reached.")
  } finally {
    clearTimeout(timeout)
  }
  const payload = await response.json().catch(() => null)
  const wrappedFailure = payload && typeof payload === "object" && payload.success === false
  if (!response.ok || wrappedFailure) {
    const detail = typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : typeof payload?.response === "string" && payload.response.trim()
        ? payload.response.trim()
        : `HyperExt Sage 50 returned ${response.status}.`
    throw new HttpError(response.status >= 400 ? response.status : 409, detail.slice(0, 500))
  }
  return payload
}

export async function hyperExtStatus() {
  const payload = await hyperExtRequest("/api/status")
  const status = payload?.response && typeof payload.response === "object" ? payload.response : payload
  return {
    apiVersion: typeof status?.apiVersion === "string" ? status.apiVersion : null,
    sageVersion: typeof status?.sageVersion === "string" ? status.sageVersion : null,
    companyName: typeof status?.companyName === "string" ? status.companyName : null,
    sdoStatusOk: status?.sdoStatusOk === true,
    odbcStatusOk: status?.odbcStatusOk === true,
  }
}
