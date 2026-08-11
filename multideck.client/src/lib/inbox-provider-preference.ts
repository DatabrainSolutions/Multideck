import type { MailProvider } from "@/lib/inbox-contract"
import { supabase } from "@/lib/supabase"

export const inboxProviderPreferenceChangedEvent = "multideck:inbox-provider-preference-changed"
const inboxProviderPreferenceStoragePrefix = "multideck.inbox.default-provider"

function readProvider(value: unknown): MailProvider | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null
  const provider = (row as Record<string, unknown>).provider
  return provider === "gmail" || provider === "outlook" ? provider : null
}

function isPreferenceSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false
  const candidate = error as { code?: unknown; message?: unknown }
  const code = typeof candidate.code === "string" ? candidate.code : ""
  const message = typeof candidate.message === "string" ? candidate.message : ""

  return ["PGRST202", "PGRST205", "42703", "42883"].includes(code)
    || /default_inbox_provider|User_DefaultInboxProviderCode/i.test(message)
}

async function localPreferenceKey() {
  if (typeof window === "undefined" || !supabase) return null
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return `${inboxProviderPreferenceStoragePrefix}:${window.location.host}:${data.user.id}`
}

async function loadLocalPreference() {
  const key = await localPreferenceKey()
  if (!key) return null
  const value = window.localStorage.getItem(key)
  return value === "gmail" || value === "outlook" ? value : null
}

async function saveLocalPreference(provider: MailProvider) {
  const key = await localPreferenceKey()
  if (key) window.localStorage.setItem(key, provider)
}

function announcePreferenceChange(provider: MailProvider) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<MailProvider>(inboxProviderPreferenceChangedEvent, { detail: provider }))
  }
}

export async function loadDefaultInboxProvider(): Promise<MailProvider | null> {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.rpc("get_current_user_default_inbox_provider")
  if (error) {
    if (!isPreferenceSchemaUnavailable(error)) throw error
    return loadLocalPreference()
  }

  const saved = readProvider(data) ?? await loadLocalPreference()
  if (saved) await saveLocalPreference(saved)
  return saved
}

export async function saveDefaultInboxProvider(provider: MailProvider): Promise<MailProvider> {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.rpc("set_current_user_default_inbox_provider", {
    p_provider: provider,
  })
  if (error) {
    if (!isPreferenceSchemaUnavailable(error)) throw error
    await saveLocalPreference(provider)
    announcePreferenceChange(provider)
    return provider
  }

  const saved = readProvider(data)
  if (!saved) throw new Error("Multideck did not return the saved inbox provider.")

  await saveLocalPreference(saved)
  announcePreferenceChange(saved)
  return saved
}
