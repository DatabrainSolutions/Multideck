import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type HmrcVatEnvironment = "sandbox" | "production"
export type HmrcVatConnection = {
  connection_id: string
  environment: HmrcVatEnvironment
  vrn: string
  granted_by_actor_id: string
  status: "connected" | "reauthorisation_required" | "disconnected"
  authorised_at: string
  authority_expires_at: string
  access_expires_at: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to continue.")
  const response = await edgeFetch("hmrc-vat-oauth", path, session.access_token, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.detail || "The HMRC VAT connection could not be completed.")
  return payload as T
}

export function getHmrcVatConnections(legalEntityId: string) {
  return call<{ legalEntityId: string; connections: HmrcVatConnection[]; sandboxConfigured: boolean }>(`/status/${encodeURIComponent(legalEntityId)}`)
}

export function refreshHmrcVatConnection(legalEntityId: string, connectionId: string) {
  return call<{ status: "connected" | "current" | "refresh_in_progress" | "reauthorisation_required"; accessExpiresAt?: string }>("/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legalEntityId, connectionId }),
  })
}

export async function beginHmrcVatConnection(legalEntityId: string, environment: HmrcVatEnvironment) {
  const result = await call<{ authorizationUrl: string }>("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legalEntityId, environment }),
  })
  const destination = new URL(result.authorizationUrl)
  const expectedHost = environment === "sandbox" ? "test-www.tax.service.gov.uk" : "www.tax.service.gov.uk"
  if (destination.protocol !== "https:" || destination.hostname !== expectedHost || destination.pathname !== "/oauth/authorize") {
    throw new Error("HMRC returned an unexpected sign-in address.")
  }
  window.location.assign(destination.toString())
}
