import { createClient, type Session } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ""
const configuredTenantHost = import.meta.env.VITE_MULTIDECK_TENANT_HOST?.trim().toLowerCase() ?? ""
const rootHost = import.meta.env.VITE_MULTIDECK_ROOT_HOST?.trim().toLowerCase() || "multideck.app"
const runningHost = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
const hasSupabaseCredentials = Boolean(supabaseUrl && supabasePublishableKey)

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
        detectSessionInUrl: true,
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
