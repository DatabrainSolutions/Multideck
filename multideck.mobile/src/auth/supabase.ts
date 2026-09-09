import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import { AppState, type AppStateStatus } from "react-native"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { WorkspaceConfiguration } from "./workspace"

let activeClient: SupabaseClient | null = null
let activeWorkspaceSlug: string | null = null

const secureSessionStorage = {
  async getItem(key: string) {
    const secured = await SecureStore.getItemAsync(key)
    if (secured !== null) return secured
    const legacy = await AsyncStorage.getItem(key)
    if (legacy !== null) {
      await SecureStore.setItemAsync(key, legacy, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
      await AsyncStorage.removeItem(key)
    }
    return legacy
  },
  setItem(key: string, value: string) {
    return SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
  },
  async removeItem(key: string) {
    await Promise.all([SecureStore.deleteItemAsync(key), AsyncStorage.removeItem(key)])
  },
}

export function createWorkspaceClient(configuration: WorkspaceConfiguration): SupabaseClient {
  if (activeClient && activeWorkspaceSlug === configuration.workspace.slug) return activeClient

  activeWorkspaceSlug = configuration.workspace.slug
  activeClient = createClient(configuration.supabase.url, configuration.supabase.publishableKey, {
    auth: {
      storage: secureSessionStorage,
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
