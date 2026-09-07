import { HttpError } from "./backend.ts"

type ErpNextRequest = {
  method?: "GET" | "POST" | "PUT"
  body?: unknown
  timeoutMs?: number
}

type ErpNextErrorPayload = {
  message?: unknown
  exc_type?: unknown
  _server_messages?: unknown
}

function plainMessage(value: unknown) {
  if (typeof value !== "string") return null
  const message = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
  return message || null
}

function serverMessages(value: unknown) {
  if (typeof value !== "string") return []
  try {
    const decoded = JSON.parse(value)
    if (!Array.isArray(decoded)) return []
    return decoded.flatMap((item) => {
      let candidate: unknown = item
      if (typeof item === "string") {
        try { candidate = JSON.parse(item) } catch { candidate = item }
      }
      if (candidate && typeof candidate === "object" && "message" in candidate) {
        const message = plainMessage((candidate as { message?: unknown }).message)
        return message ? [message] : []
      }
      const message = plainMessage(candidate)
      return message ? [message] : []
    })
  } catch {
    return []
  }
}

export function erpNextErrorMessage(payload: unknown) {
  const error = payload && typeof payload === "object" ? payload as ErpNextErrorPayload : {}
  const exceptionType = plainMessage(error.exc_type)
  const detailed = serverMessages(error._server_messages)[0]
  const direct = plainMessage(error.message)
  const usefulDirect = direct && direct !== exceptionType && direct !== "PermissionError" ? direct : null
  if (detailed) return detailed
  if (usefulDirect) return usefulDirect
  if (exceptionType === "PermissionError" || direct === "PermissionError") {
    return "ERPNext denied this operation. The connected API user does not have the required document permission."
  }
  return exceptionType ?? direct ?? "ERPNext rejected this request."
}

function origin() {
  const value = Deno.env.get("ERPNEXT_BASE_URL")?.trim()
  if (!value) throw new HttpError(503, "ERPNext is not configured for this workspace.")
  let url: URL
  try { url = new URL(value) } catch { throw new HttpError(503, "The ERPNext site URL is invalid.") }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new HttpError(503, "The ERPNext site URL must be a public HTTPS origin.")
  }
  return url.origin
}

function credentials() {
  const key = Deno.env.get("ERPNEXT_API_KEY")?.trim()
  const secret = Deno.env.get("ERPNEXT_API_SECRET")?.trim()
  if (!key || !secret) throw new HttpError(503, "ERPNext API credentials are not configured for this workspace.")
  return `token ${key}:${secret}`
}

export async function erpNextRequest<T>(path: string, input: ErpNextRequest = {}) {
  const response = await fetch(`${origin()}${path}`, {
    method: input.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: credentials(),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = erpNextErrorMessage(payload)
    console.error("[erpnext] request rejected", {
      method: input.method ?? "GET",
      path: path.split("?")[0],
      status: response.status,
      exceptionType: typeof payload?.exc_type === "string" ? payload.exc_type : null,
      message,
    })
    throw new HttpError(response.status === 401 || response.status === 403 ? 502 : 422, message.slice(0, 500))
  }
  return payload as T
}

export function erpNextOrigin() { return origin() }

export async function erpNextList(doctype: string, fields: string[], filters?: unknown[]) {
  const query = new URLSearchParams({ fields: JSON.stringify(fields), limit_page_length: "200" })
  if (filters?.length) query.set("filters", JSON.stringify(filters))
  const payload = await erpNextRequest<{ data?: Record<string, unknown>[] }>(`/api/resource/${encodeURIComponent(doctype)}?${query}`)
  return payload.data ?? []
}

export async function erpNextCreate(doctype: string, document: Record<string, unknown>) {
  const payload = await erpNextRequest<{ data?: Record<string, unknown> }>(`/api/resource/${encodeURIComponent(doctype)}`, { method: "POST", body: document })
  if (!payload.data?.name || typeof payload.data.name !== "string") throw new HttpError(502, "ERPNext did not return a document reference.")
  return payload.data
}

export async function erpNextSubmit(doctype: string, name: string) {
  const payload = await erpNextRequest<{ data?: Record<string, unknown> }>(`/api/v2/document/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/method/submit`, { method: "POST", body: {} })
  return payload.data ?? { name }
}
