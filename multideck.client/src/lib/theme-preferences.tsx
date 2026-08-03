import { useCallback, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"

type ThemeMode = "light" | "dark"

const themeIntentEvent = "multideck:theme-intent"

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
 * Registers a deliberate operator choice before next-themes schedules its React
 * update. This closes the small window where an in-flight profile read could
 * otherwise restore the previous mode and make the interface flash back.
 */
export function setThemeWithProfileIntent(setTheme: (mode: string) => void, mode: ThemeMode) {
  window.dispatchEvent(new CustomEvent<ThemeMode>(themeIntentEvent, { detail: mode }))
  setTheme(mode)
}

/**
 * Keeps the theme fast on the current device while making the signed-in
 * operator's Supabase profile the source of truth across devices. The
 * next-themes storage key is intentionally only a first-paint cache.
 */
export function ThemeProfileSync() {
  const { theme, setTheme } = useTheme()
  const setThemeRef = useRef(setTheme)
  const activeUserId = useRef<string | null>(null)
  const loadVersion = useRef(0)
  const themeRevision = useRef(0)
  const currentTheme = useRef<ThemeMode>(isThemeMode(theme) ? theme : "light")
  const lastPersistedTheme = useRef<ThemeMode | null>(null)
  const pendingThemeIntent = useRef<ThemeMode | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    setThemeRef.current = setTheme
  }, [setTheme])

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

        if (activeUserId.current === userId) {
          lastPersistedTheme.current = mode
          if (pendingThemeIntent.current === mode) pendingThemeIntent.current = null
        }
      })
      .catch((error: unknown) => {
        console.warn("Your appearance preference could not be saved to your profile.", error)
      })

    return saveQueue.current
  }, [])

  useEffect(() => {
    const mode = isThemeMode(theme) ? theme : "light"
    currentTheme.current = mode

    if (pendingThemeIntent.current === mode) {
      return
    }

    themeRevision.current += 1

    const userId = activeUserId.current
    if (!userId || lastPersistedTheme.current === mode) return

    void saveTheme(mode, userId)
  }, [saveTheme, theme])

  useEffect(() => {
    const handleThemeIntent = (event: Event) => {
      const mode = (event as CustomEvent<unknown>).detail
      if (!isThemeMode(mode)) return

      pendingThemeIntent.current = mode
      currentTheme.current = mode
      themeRevision.current += 1

      const userId = activeUserId.current
      if (!userId || lastPersistedTheme.current === mode) return
      void saveTheme(mode, userId)
    }

    window.addEventListener(themeIntentEvent, handleThemeIntent)
    return () => window.removeEventListener(themeIntentEvent, handleThemeIntent)
  }, [saveTheme])

  useEffect(() => {
    const configuredClient = supabase
    if (!configuredClient) return
    const client: NonNullable<typeof supabase> = configuredClient

    async function syncProfileTheme() {
      // Capture before the first await so a click that happens during session
      // lookup also invalidates this entire profile read.
      const revisionAtStart = themeRevision.current
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
      const pendingMode = pendingThemeIntent.current
      if (pendingMode) {
        if (savedTheme === pendingMode) {
          lastPersistedTheme.current = pendingMode
          pendingThemeIntent.current = null
        } else {
          void saveTheme(pendingMode, userId)
        }
        return
      }

      if (savedTheme) {
        lastPersistedTheme.current = savedTheme
        if (currentTheme.current !== savedTheme) setThemeRef.current(savedTheme)
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
  }, [saveTheme])

  return null
}
