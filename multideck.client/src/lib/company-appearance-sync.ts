import type { SupabaseClient } from "@supabase/supabase-js"

/** Observe only this operator's profile; the database owns company-wide resets. */
export function watchCompanyAppearanceReset(client: SupabaseClient, userId: string, options: {
  isCompanySelected: () => boolean
  afterPendingSaves: () => Promise<void>
  onReset: () => void
  refreshBrand: () => Promise<unknown>
}) {
  let stopped = false
  let refreshing: Promise<void> | null = null

  function refresh() {
    if (stopped) return
    refreshing ??= (async () => {
      // A delayed event must not override a more recent deliberate selection.
      await options.afterPendingSaves()
      if (stopped) return
      if (options.isCompanySelected()) {
        const { data, error } = await client.rpc("get_current_user_accent_preference")
        if (stopped || error) return
        const saved = Array.isArray(data) ? data[0]?.accent_preset : data?.accent_preset
        if (saved === "teal" && options.isCompanySelected()) options.onReset()
      }
      // Standard-theme users still need removed company options to disappear.
      await options.refreshBrand()
    })().catch(() => {
      // A connection failure is not evidence of brand removal. Retry on the
      // next focus, reconnect or database event without discarding preferences.
    }).finally(() => { refreshing = null })
  }

  const channel = client.channel(`company-appearance-profile-${userId}`)
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "cmp_Users", filter: `Auth_User_ID=eq.${userId}`,
    }, (payload) => { if (payload.new.User_AccentPreset === "teal") refresh() })
    .subscribe((status) => { if (status === "SUBSCRIBED") refresh() })

  const onVisible = () => { if (document.visibilityState === "visible") refresh() }
  window.addEventListener("focus", refresh)
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    stopped = true
    window.removeEventListener("focus", refresh)
    document.removeEventListener("visibilitychange", onVisible)
    void client.removeChannel(channel)
  }
}
