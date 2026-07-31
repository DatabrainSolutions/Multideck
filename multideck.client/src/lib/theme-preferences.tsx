import { useCallback, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"

type ThemeMode = "light" | "dark"

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark"
}

function readThemeMode(value: unknown): ThemeMode | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null

  const candidate = row as Record<string, unknown>
  return isThemeMode(candidate.theme_mode) ? candidate.theme_mode : null
}

/**
 * Keeps the theme fast on the current device while making the signed-in
 * operator's Supabase profile the source of truth across devices. The
 * next-themes storage key is intentionally only a first-paint cache.
 */
export function ThemeProfileSync() {
  const { theme, setTheme } = useTheme()
  const activeUserId = useRef<string | null>(null)
  const loadVersion = useRef(0)
  const themeRevision = useRef(0)
  const currentTheme = useRef<ThemeMode>(isThemeMode(theme) ? theme : "light")
  const lastPersistedTheme = useRef<ThemeMode | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const saveTheme = useCallback((mode: ThemeMode, userId: string) => {
    const client = supabase
    if (!client) return Promise.resolve()

    saveQueue.current = saveQueue.current
      .then(async () => {
        // A queued write from a just-signed-out account must never run for the
        // next person using this browser.
        if (activeUserId.current !== userId) return

        const { error } = await client.rpc("set_current_user_theme_preference", {
          p_theme_mode: mode,
        })
        if (error) throw error

        if (activeUserId.current === userId) lastPersistedTheme.current = mode
      })
      .catch((error: unknown) => {
        console.warn("Your appearance preference could not be saved to your profile.", error)
      })

    return saveQueue.current
  }, [])

  useEffect(() => {
    const mode = isThemeMode(theme) ? theme : "light"
    currentTheme.current = mode
    themeRevision.current += 1

    const userId = activeUserId.current
    if (!userId || lastPersistedTheme.current === mode) return

    void saveTheme(mode, userId)
  }, [saveTheme, theme])

  useEffect(() => {
    const configuredClient = supabase
    if (!configuredClient) return
    const client: NonNullable<typeof supabase> = configuredClient

    async function syncProfileTheme() {
      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) {
        console.warn("Your appearance preference could not be loaded from your profile.", sessionError)
        return
      }

      const userId = sessionData.session?.user.id ?? null
      const requestVersion = ++loadVersion.current
      activeUserId.current = userId
      lastPersistedTheme.current = null

      if (!userId) return

      const revisionAtStart = themeRevision.current
      const { data, error } = await client.rpc("get_current_user_theme_preference")
      if (error) {
        console.warn("Your appearance preference could not be loaded from your profile.", error)
        return
      }

      if (requestVersion !== loadVersion.current || activeUserId.current !== userId) return

      // If the operator explicitly changed appearance while the profile was
      // loading, preserve that deliberate choice and let the queued save win.
      if (themeRevision.current !== revisionAtStart) return

      const savedTheme = readThemeMode(data)
      if (savedTheme) {
        lastPersistedTheme.current = savedTheme
        if (currentTheme.current !== savedTheme) setTheme(savedTheme)
        return
      }

      // First sign-in after this migration: adopt the local choice once, then
      // every later sign-in reads the profile value instead of this browser.
      void saveTheme(currentTheme.current, userId)
    }

    void syncProfileTheme()
    const { data: listener } = client.auth.onAuthStateChange(() => {
      void syncProfileTheme()
    })

    return () => listener.subscription.unsubscribe()
  }, [saveTheme, setTheme])

  return null
}
