import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"
import { isTrainingWorkspace, trainingConfigurationError, trainingSupabaseUrl, trainingSupabaseKey } from "@/lib/workspace-environment"
import { createTrainingAccessCache } from "@/lib/training-access"
import { setCrmReadCacheScope } from "@/lib/crm-read-cache"
import {
  capturePasswordRecoveryLink,
  rememberVerifiedPasswordRecovery,
  type PasswordRecoveryLink,
} from "@/lib/password-recovery"

const mainSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ""
const configuredTenantHost = import.meta.env.VITE_MULTIDECK_TENANT_HOST?.trim().toLowerCase() ?? ""
const rootHost = import.meta.env.VITE_MULTIDECK_ROOT_HOST?.trim().toLowerCase() || "multideck.app"
const runningHost = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase()
const hasSupabaseCredentials = Boolean(mainSupabaseUrl && supabasePublishableKey)
export const initialPasswordRecoveryLink = capturePasswordRecoveryLink()

export const isTenantHostTrusted = import.meta.env.DEV || Boolean(configuredTenantHost && runningHost === configuredTenantHost)
export const isWorkspaceRouterHost = runningHost === rootHost || runningHost === `www.${rootHost}`
export const multideckRootHost = rootHost
const dataSupabaseUrl = isTrainingWorkspace ? trainingSupabaseUrl : mainSupabaseUrl
const dataSupabaseKey = isTrainingWorkspace ? trainingSupabaseKey : supabasePublishableKey
export const supabaseFunctionsUrl = dataSupabaseUrl ? `${dataSupabaseUrl.replace(/\/$/, "")}/functions/v1` : ""
/** Storage REST root. Used where an upload needs real progress, which the client library does not report. */
export const supabaseStorageUrl = dataSupabaseUrl ? `${dataSupabaseUrl.replace(/\/$/, "")}/storage/v1` : ""
export const supabasePublicApiKey = dataSupabaseKey

export const supabaseConfigurationError = !hasSupabaseCredentials
  ? "Supabase credentials are needed before operators can sign in."
  : !isTenantHostTrusted
    ? "This deployment is not authorised for this workspace domain."
    : null

export const isSupabaseConfigured = hasSupabaseCredentials && isTenantHostTrusted

export const authSupabase = isSupabaseConfigured
  ? createClient(mainSupabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: initialPasswordRecoveryLink.kind === "missing",
        experimental: { passkey: true },
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null

const trainingAccess = createTrainingAccessCache()

async function getTrainingGrant() {
  const session = await getAuthSupabaseSession()
  if (!session) throw new Error("Sign in again to continue.")
  if (trainingConfigurationError) throw new Error(trainingConfigurationError)
  const grant = await trainingAccess.get(session.access_token, async () => {
    const response = await fetch(`${mainSupabaseUrl.replace(/\/$/, "")}/functions/v1/training-session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublishableKey },
      signal: AbortSignal.timeout(25_000),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: string }
      throw new Error(error.detail || "The training workspace could not be opened. Try again or return to Main.")
    }
    const result = await response.json() as { accessToken: string; expiresAt: number; authUserId: string; projectUrl: string }
    if (!result.accessToken || result.authUserId !== session.user.id || result.projectUrl !== trainingSupabaseUrl.replace(/\/$/, "")
      || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() / 1000 + 30 || result.expiresAt > Date.now() / 1000 + 330) {
      throw new Error("The training session did not match this workspace. Contact your administrator.")
    }
    return result
  })
  return grant
}

export async function resolveWorkspaceAccessToken(accessToken?: string): Promise<string> {
  if (isTrainingWorkspace) {
    const session = await getAuthSupabaseSession()
    if (!session || (accessToken && !trainingAccess.accepts(accessToken, session.access_token))) {
      throw new Error("Your workspace session changed. Try again.")
    }
    return (await getTrainingGrant()).accessToken
  }
  if (accessToken) return accessToken
  const session = await getAuthSupabaseSession()
  if (!session) throw new Error("Sign in again to continue.")
  return session.access_token
}

export const supabase = !authSupabase ? null : !isTrainingWorkspace ? authSupabase
  : trainingConfigurationError ? null
  : createClient(trainingSupabaseUrl, trainingSupabaseKey, {
      accessToken: async () => (await getAuthSupabaseSession()) ? resolveWorkspaceAccessToken() : null,
    })

export const authenticatedAccessChangedEvent = "multideck:access-changed"

export function getClientAuth(client: SupabaseClient) {
  return client === supabase && isTrainingWorkspace ? authSupabase!.auth : client.auth
}

export async function refreshWorkspaceSession() {
  if (!authSupabase) return { data: { session: null }, error: new Error("Sign in again to continue.") }
  const result = await authSupabase.auth.refreshSession()
  if (result.error) return result
  try { return { data: { session: await getSupabaseSession() }, error: null } }
  catch (error) { return { data: { session: null }, error: error as Error } }
}

setCrmReadCacheScope(dataSupabaseUrl, null)
let previousAuthUserId: string | null = null
authSupabase?.auth.onAuthStateChange((event, session) => {
  // Keep this callback synchronous: awaiting another Auth method here can
  // deadlock Supabase's session lock. Refreshes also invalidate changed claims.
  if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED"
    || (session?.user.id ?? null) !== previousAuthUserId) trainingAccess.clear()
  const userId = session?.user.id ?? null
  const identityChanged = previousAuthUserId !== userId
  previousAuthUserId = userId
  const changed = setCrmReadCacheScope(dataSupabaseUrl, userId, event === "TOKEN_REFRESHED" || event === "USER_UPDATED")
  if (changed && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(authenticatedAccessChangedEvent, { detail: { identityChanged } }))
})

export async function getAuthSupabaseSession(): Promise<Session | null> {
  if (!authSupabase) return null

  const { data, error } = await authSupabase.auth.getSession()
  if (error) throw error

  return data.session
}

export async function getSupabaseSession(): Promise<Session | null> {
  const session = await getAuthSupabaseSession()
  if (!session || !isTrainingWorkspace) return session
  const grant = await getTrainingGrant()
  return { ...session, access_token: grant.accessToken, expires_at: grant.expiresAt,
    expires_in: Math.max(0, grant.expiresAt - Math.floor(Date.now() / 1000)), refresh_token: "" }
}

export async function verifyPasswordRecoveryLink(context: PasswordRecoveryLink): Promise<Session> {
  if (!authSupabase) throw new Error(supabaseConfigurationError ?? "Supabase is not configured for this workspace.")
  let session: Session | null = null

  if (context.kind === "token-hash") {
    const { data, error } = await authSupabase.auth.verifyOtp({ token_hash: context.tokenHash, type: "recovery" })
    if (error) throw error
    session = data.session
  } else if (context.kind === "legacy-code") {
    const { data, error } = await authSupabase.auth.exchangeCodeForSession(context.code)
    if (error) throw error
    session = data.session
  } else if (context.kind === "legacy-session") {
    const { data, error } = await authSupabase.auth.setSession({
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
