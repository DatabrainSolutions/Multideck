import type { MailProvider } from "@/lib/inbox-contract"
import { supabase } from "@/lib/supabase"

export const inboxProviderPreferenceChangedEvent = "multideck:inbox-provider-preference-changed"

function readProvider(value: unknown): MailProvider | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null
  const provider = (row as Record<string, unknown>).provider
  return provider === "gmail" || provider === "outlook" ? provider : null
}

export async function loadDefaultInboxProvider(): Promise<MailProvider | null> {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.rpc("get_current_user_default_inbox_provider")
  if (error) throw error
  return readProvider(data)
}

export async function saveDefaultInboxProvider(provider: MailProvider): Promise<MailProvider> {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.rpc("set_current_user_default_inbox_provider", {
    p_provider: provider,
  })
  if (error) throw error

  const saved = readProvider(data)
  if (!saved) throw new Error("Multideck did not return the saved inbox provider.")

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<MailProvider>(inboxProviderPreferenceChangedEvent, { detail: saved }))
  }
  return saved
}
