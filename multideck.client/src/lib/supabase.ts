import { createClient, type Session } from "@supabase/supabase-js"
import {
  capturePasswordRecoveryLink,
  rememberVerifiedPasswordRecovery,
  type PasswordRecoveryLink,
} from "@/lib/password-recovery"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ""
const configuredTenantHost = import.meta.env.VITE_MULTIDECK_TENANT_HOST?.trim().toLowerCase() ?? ""
const rootHost = import.meta.env.VITE_MULTIDECK_ROOT_HOST?.trim().toLowerCase() || "multideck.app"
const runningHost = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
const hasSupabaseCredentials = Boolean(supabaseUrl && supabasePublishableKey)
export const initialPasswordRecoveryLink = capturePasswordRecoveryLink()

export const isTenantHostTrusted = import.meta.env.DEV || Boolean(configuredTenantHost && runningHost === configuredTenantHost)
export const isWorkspaceRouterHost = runningHost === rootHost || runningHost === `www.${rootHost}`
export const multideckRootHost = rootHost
export const supabaseFunctionsUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1` : ""
/** Storage REST root. Used where an upload needs real progress, which the client library does not report. */
export const supabaseStorageUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1` : ""
export const supabasePublicApiKey = supabasePublishableKey

export const supabaseConfigurationError = !hasSupabaseCredentials
  ? "Supabase credentials are needed before operators can sign in."
  : !isTenantHostTrusted
    ? "This deployment is not authorised for this workspace domain."
    : null

export const isSupabaseConfigured = hasSupabaseCredentials && isTenantHostTrusted

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: initialPasswordRecoveryLink.kind === "missing",
        experimental: { passkey: true },
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null

export async function getSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  return data.session
}

export async function verifyPasswordRecoveryLink(context: PasswordRecoveryLink): Promise<Session> {
  if (!supabase) throw new Error(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
  let session: Session | null = null

  if (context.kind === "token-hash") {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: context.tokenHash, type: "recovery" })
    if (error) throw error
    session = data.session
  } else if (context.kind === "legacy-code") {
    const { data, error } = await supabase.auth.exchangeCodeForSession(context.code)
    if (error) throw error
    session = data.session
  } else if (context.kind === "legacy-session") {
    const { data, error } = await supabase.auth.setSession({
      access_token: context.accessToken,
      refresh_token: context.refreshToken,
    })
    if (error) throw error
    session = data.session
  }

  if (!session) throw new Error("This recovery link is invalid or has expired.")
  rememberVerifiedPasswordRecovery(session)
  return session
}
