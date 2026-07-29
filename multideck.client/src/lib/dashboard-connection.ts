import { getApiAuthSession } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type DashboardConnectionStatus = "checking" | "connected" | "signed-out" | "error"

export type DashboardConnectionState = {
  status: DashboardConnectionStatus
  email: string | null
}

export function createDashboardConnectionState(
  status: DashboardConnectionStatus,
  email: string | null = null,
): DashboardConnectionState {
  return { status, email }
}

/**
 * Confirms the operator's Supabase session is still accepted by the protected
 * API. The dashboard surfaces this because every panel on it reads live data —
 * an expired session should be obvious before someone acts on a stale number.
 */
export async function checkDashboardConnection(): Promise<DashboardConnectionState> {
  try {
    const session = await getSupabaseSession()

    if (!session?.access_token) {
      return createDashboardConnectionState("signed-out")
    }

    const apiSession = await getApiAuthSession(session.access_token)

    if (!apiSession.authenticated) {
      return createDashboardConnectionState("error")
    }

    return createDashboardConnectionState("connected", apiSession.user.email ?? session.user.email ?? null)
  } catch (error) {
    console.error("Dashboard API connection check failed", error)
    return createDashboardConnectionState("error")
  }
}
