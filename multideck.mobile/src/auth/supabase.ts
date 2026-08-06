import AsyncStorage from "@react-native-async-storage/async-storage"
import { AppState, type AppStateStatus } from "react-native"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { WorkspaceConfiguration } from "./workspace"

let activeClient: SupabaseClient | null = null
let activeWorkspaceSlug: string | null = null

export function createWorkspaceClient(configuration: WorkspaceConfiguration): SupabaseClient {
  if (activeClient && activeWorkspaceSlug === configuration.workspace.slug) return activeClient

  activeWorkspaceSlug = configuration.workspace.slug
  activeClient = createClient(configuration.supabase.url, configuration.supabase.publishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  })

  return activeClient
}

export function getWorkspaceClient(): SupabaseClient | null {
  return activeClient
}

export async function releaseWorkspaceClient(): Promise<void> {
  if (activeClient) await activeClient.auth.signOut({ scope: "local" })
  activeClient = null
  activeWorkspaceSlug = null
}

export function registerAuthAutoRefresh(): () => void {
  function handleAppState(state: AppStateStatus) {
    if (!activeClient) return
    if (state === "active") activeClient.auth.startAutoRefresh()
    else activeClient.auth.stopAutoRefresh()
  }

  const subscription = AppState.addEventListener("change", handleAppState)
  handleAppState(AppState.currentState)
  return () => subscription.remove()
}
