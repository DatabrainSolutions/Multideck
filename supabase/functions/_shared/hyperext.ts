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

export function parseHyperExtNominals(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) {
    throw new HttpError(502, "HyperExt did not return a nominal account list.")
  }
  const accounts = new Map<string, { name: string; account_number: string; account_name: string }>()
  for (const item of (payload as { results: unknown[] }).results) {
    if (!item || typeof item !== "object") throw new HttpError(502, "HyperExt returned an invalid nominal account.")
    const record = item as Record<string, unknown>
    const code = typeof record.accountRef === "string" ? record.accountRef.trim() : ""
    const name = typeof record.name === "string" ? record.name.trim() : ""
    if (!code || !name) throw new HttpError(502, "HyperExt returned a nominal account without a code or name.")
    if (record.inactiveFlag === true || record.inactiveFlag === 1 || record.inactiveFlag === "1") continue
    if (accounts.has(code)) throw new HttpError(502, "HyperExt returned duplicate nominal account codes.")
    accounts.set(code, { name: code, account_number: code, account_name: name })
  }
  return [...accounts.values()].sort((left, right) => left.account_number.localeCompare(right.account_number, "en-GB", { numeric: true }))
}
