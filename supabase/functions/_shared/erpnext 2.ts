import { HttpError } from "./backend.ts"

type ErpNextRequest = {
  method?: "GET" | "POST" | "PUT"
  body?: unknown
  timeoutMs?: number
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
    const message = typeof payload?.exc_type === "string"
      ? payload.exc_type
      : typeof payload?.message === "string" ? payload.message : "ERPNext rejected this request."
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
