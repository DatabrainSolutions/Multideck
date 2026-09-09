import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"

type TokenBundle = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
  tokenType?: string
}

async function secretBundle(admin: SupabaseClient, reference: string) {
  const { data, error } = await admin.rpc("calendar_get_secret", { p_secret_ref: reference })
  if (error || typeof data !== "string") throw new HttpError(503, "The calendar connection credential is unavailable.")
  try {
    return JSON.parse(data) as TokenBundle
  } catch {
    throw new HttpError(503, "The calendar connection credential is invalid.")
  }
}

async function saveSecretBundle(admin: SupabaseClient, reference: string, bundle: TokenBundle) {
  const { error } = await admin.rpc("calendar_update_secret", { p_secret_ref: reference, p_secret: JSON.stringify(bundle) })
  if (error) throw new HttpError(503, "The refreshed calendar credential could not be secured.")
}

async function refreshGoogle(admin: SupabaseClient, connection: Record<string, unknown>, bundle: TokenBundle) {
  if (!bundle.refreshToken) throw new HttpError(409, "Google Calendar needs to be reconnected.")
  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")
  if (!clientId || !clientSecret) throw new HttpError(503, "Google Calendar is not configured for this workspace.")
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: bundle.refreshToken, grant_type: "refresh_token" }),
  })
  if (!response.ok) throw new HttpError(409, "Google Calendar needs to be reconnected.")
  const payload = await response.json() as { access_token: string; expires_in?: number; scope?: string; token_type?: string }
  const next = { ...bundle, accessToken: payload.access_token, expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(), scope: payload.scope ?? bundle.scope, tokenType: payload.token_type ?? bundle.tokenType }
  await saveSecretBundle(admin, String(connection.CALConnection_SecretRef), next)
  return next
}

async function refreshMicrosoft(admin: SupabaseClient, connection: Record<string, unknown>, bundle: TokenBundle) {
  if (!bundle.refreshToken) throw new HttpError(409, "Microsoft Calendar needs to be reconnected.")
  const clientId = Deno.env.get("MICROSOFT_CALENDAR_CLIENT_ID")
  const clientSecret = Deno.env.get("MICROSOFT_CALENDAR_CLIENT_SECRET")
  const tenant = Deno.env.get("MICROSOFT_CALENDAR_TENANT_ID") || "common"
  if (!clientId || !clientSecret) throw new HttpError(503, "Microsoft Calendar is not configured for this workspace.")
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: bundle.refreshToken, grant_type: "refresh_token", scope: "offline_access User.Read Calendars.ReadWrite" }),
  })
  if (!response.ok) throw new HttpError(409, "Microsoft Calendar needs to be reconnected.")
  const payload = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }
  const next = { ...bundle, accessToken: payload.access_token, refreshToken: payload.refresh_token ?? bundle.refreshToken, expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(), scope: payload.scope ?? bundle.scope, tokenType: payload.token_type ?? bundle.tokenType }
  await saveSecretBundle(admin, String(connection.CALConnection_SecretRef), next)
  return next
}

async function refreshZoom(admin: SupabaseClient, connection: Record<string, unknown>, bundle: TokenBundle) {
  if (!bundle.refreshToken) throw new HttpError(409, "Zoom needs to be reconnected.")
  const clientId = Deno.env.get("ZOOM_CLIENT_ID")
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET")
  if (!clientId || !clientSecret) throw new HttpError(503, "Zoom is not configured for this workspace.")
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(bundle.refreshToken)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
  })
  if (!response.ok) throw new HttpError(409, "Zoom needs to be reconnected.")
  const payload = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }
  const next = { ...bundle, accessToken: payload.access_token, refreshToken: payload.refresh_token ?? bundle.refreshToken, expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(), scope: payload.scope ?? bundle.scope, tokenType: payload.token_type ?? bundle.tokenType }
  await saveSecretBundle(admin, String(connection.CALConnection_SecretRef), next)
  return next
}

export async function calendarProviderAccessToken(admin: SupabaseClient, connection: Record<string, unknown>) {
  let bundle = await secretBundle(admin, String(connection.CALConnection_SecretRef))
  if (!bundle.accessToken || !bundle.expiresAt || Date.parse(bundle.expiresAt) < Date.now() + 120_000) {
    bundle = connection.CALConnection_ProviderCode === "google" ? await refreshGoogle(admin, connection, bundle)
      : connection.CALConnection_ProviderCode === "microsoft" ? await refreshMicrosoft(admin, connection, bundle)
      : await refreshZoom(admin, connection, bundle)
  }
  return bundle.accessToken
}
