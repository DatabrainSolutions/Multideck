import { useEffect } from "react"
import { flushSync } from "react-dom"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"

type ThemeMode = "light" | "dark"

/** Also read by the pre-paint script in index.html, which must use the same key. */
export const themeStorageKey = "multideck.theme"

let activeUserId: string | null = null
let lastPersistedTheme: ThemeMode | null = null
/**
 * The most recent deliberate choice, stamped on the monotonic clock. Any profile
 * read that started before `at` is stale by definition, so it can never undo the
 * choice — that ordering rule replaces the guesswork this module used to do.
 */
let localChoice: { mode: ThemeMode; at: number } | null = null
let saveQueue: Promise<void> = Promise.resolve()

type ThemeViewTransition = {
  finished: Promise<void>
  skipTransition?: () => void
}

type ThemeTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ThemeViewTransition
}

let activeThemeTransition: ThemeViewTransition | null = null

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark"
}

function readThemeMode(value: unknown): ThemeMode | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null

  const candidate = row as Record<string, unknown>
  return isThemeMode(candidate.theme_mode) ? candidate.theme_mode : null
}

/** The mode actually on screen, which is the only thing a comparison should trust. */
function appliedMode(): ThemeMode {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function saveTheme(mode: ThemeMode) {
  const client = supabase
  const userId = activeUserId
  if (!client || !userId) return

  saveQueue = saveQueue
    .then(async () => {
      // A queued write from a just-signed-out account must never run for the
      // next person using this browser.
      if (activeUserId !== userId) return

      const { error } = await client.rpc("set_current_user_theme_preference", {
        p_theme_mode: mode,
      })
      if (error) throw error

      if (activeUserId === userId) lastPersistedTheme = mode
    })
    .catch((error: unknown) => {
      // Deliberately not reflected in the UI: the mode is already applied and
      // stored locally, and `localChoice` keeps a later profile read from
      // reverting it, so a failed write costs cross-device sync and nothing else.
      console.warn("Your appearance preference could not be saved to your profile.", error)
    })
}

/**
 * Records the choice and its timestamp before handing off to next-themes, so a
 * profile read already in flight cannot restore the previous mode and make the
 * interface flash back.
 */
export function setThemeWithProfileIntent(setTheme: (mode: string) => void, mode: ThemeMode) {
  // Module scope, so the choice outlives any superseded sync instance whose
  // asynchronous profile read finishes after its React effect was cleaned up.
  localChoice = { mode, at: performance.now() }

  const transitionDocument = document as ThemeTransitionDocument
  const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const startViewTransition = transitionDocument.startViewTransition

  if (!startViewTransition || shouldReduceMotion) {
    setTheme(mode)
  } else {
    activeThemeTransition?.skipTransition?.()

    const transition = startViewTransition.call(transitionDocument, () => {
      // Flush the theme state into the DOM before Chrome captures the new frame.
      // This keeps the previous frame visible until the dark tokens and every
      // theme-aware React surface agree on the new appearance.
      flushSync(() => setTheme(mode))
    })

    activeThemeTransition = transition
    void transition.finished.catch(() => undefined).finally(() => {
      if (activeThemeTransition === transition) activeThemeTransition = null
    })
  }

  if (lastPersistedTheme !== mode) saveTheme(mode)
}

/**
 * Keeps the theme fast on the current device while making the signed-in
 * operator's Supabase profile the source of truth across devices. The
 * next-themes storage key is intentionally only a first-paint cache.
 */
export function ThemeProfileSync() {
  const { setTheme } = useTheme()

  useEffect(() => {
    const configuredClient = supabase
    if (!configuredClient) return
    const client: NonNullable<typeof supabase> = configuredClient

    async function syncProfileTheme() {
      // Stamped before the first await, so a click that happens while the
      // session lookup or the profile read is in flight counts as newer.
      const startedAt = performance.now()

      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) {
        console.warn("Your appearance preference could not be loaded from your profile.", sessionError)
        return
      }

      const userId = sessionData.session?.user.id ?? null

      // Only a genuine account change discards what this browser knows. A first
      // resolve leaves it alone, because an early click may have been waiting for
      // this very request to discover the user ID.
      if (activeUserId !== null && activeUserId !== userId) {
        lastPersistedTheme = null
        localChoice = null
      }
      activeUserId = userId

      // Signed out: this browser's own mode stays in effect, unsynced.
      if (!userId) return

      const { data, error } = await client.rpc("get_current_user_theme_preference")
      if (error) {
        console.warn("Your appearance preference could not be loaded from your profile.", error)
        return
      }

      if (activeUserId !== userId) return

      const savedTheme = readThemeMode(data)

      // Two ways this browser's choice outranks what the profile just returned:
      // it was made after this read started, so the read is stale; or it has not
      // been written yet, so the read is returning the very value it replaces.
      // Either way, undoing it would flip the interface back under the operator.
      const isStaleRead = localChoice && localChoice.at > startedAt
      const isUnwritten = localChoice && lastPersistedTheme !== localChoice.mode

      if (localChoice && (isStaleRead || isUnwritten)) {
        if (savedTheme === localChoice.mode) lastPersistedTheme = localChoice.mode
        else saveTheme(localChoice.mode)
        return
      }

      if (savedTheme) {
        lastPersistedTheme = savedTheme
        if (appliedMode() !== savedTheme) setTheme(savedTheme)
        return
      }

      // First sign-in after this migration: adopt the local choice once, then
      // every later sign-in reads the profile value instead of this browser.
      saveTheme(appliedMode())
    }

    void syncProfileTheme()
    const { data: listener } = client.auth.onAuthStateChange(() => {
      void syncProfileTheme()
    })

    return () => listener.subscription.unsubscribe()
  }, [setTheme])

  return null
}
