import { useEffect, useRef } from "react"
import { useTheme } from "@/lib/theme-provider"
import { getApiWorkspacePreferences } from "@/lib/api"
import { supabase } from "@/lib/supabase"
import { updateWorkspaceBootstrapPreferences } from "@/lib/workspace-bootstrap"

type ThemeMode = "light" | "dark"

/** Also read by the pre-paint script in index.html, which must use the same key. */
export const themeStorageKey = "multideck.theme"
export const themeIntentStorageKey = "multideck.theme.intent"

let activeUserId: string | null = null
let hydratedUserId: string | null = null
let hydratingUserId: string | null = null
let lastPersistedTheme: ThemeMode | null = null
let canPersistProfileTheme = true

/**
 * Increments for every deliberate choice, including one received from another
 * tab. A profile response that began on an earlier revision is never allowed to
 * repaint the interface with an older preference.
 */
let preferenceRevision = 0
let latestChoice: ThemeMode | null = null

let pendingThemeSave: { mode: ThemeMode; userId: string } | null = null
let saveQueue: Promise<void> | null = null

type StoredThemeIntent = {
  mode: ThemeMode
  userId: string | null
  changedAt: number
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark"
}

function readThemeMode(value: unknown): ThemeMode | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null

  const candidate = row as Record<string, unknown>
  return isThemeMode(candidate.theme_mode) ? candidate.theme_mode : null
}

function readStoredThemeIntent(): StoredThemeIntent | null {
  try {
    const raw = window.localStorage.getItem(themeIntentStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredThemeIntent>
    if (!isThemeMode(value.mode) || typeof value.changedAt !== "number") return null
    return {
      mode: value.mode,
      userId: typeof value.userId === "string" ? value.userId : null,
      changedAt: value.changedAt,
    }
  } catch {
    return null
  }
}

function persistThemeIntent(mode: ThemeMode) {
  try {
    window.localStorage.setItem(themeIntentStorageKey, JSON.stringify({
      mode,
      userId: activeUserId,
      changedAt: Date.now(),
    } satisfies StoredThemeIntent))
  } catch {
    // The theme itself still changes when storage is unavailable.
  }
}

function claimStoredThemeIntent(userId: string): StoredThemeIntent | null {
  const storedIntent = readStoredThemeIntent()
  if (!storedIntent || (storedIntent.userId !== null && storedIntent.userId !== userId)) return null
  if (storedIntent.userId === userId) return storedIntent

  const claimedIntent = { ...storedIntent, userId }
  try {
    window.localStorage.setItem(themeIntentStorageKey, JSON.stringify(claimedIntent))
  } catch {
    // A storage failure cannot stop the current tab from applying the choice.
  }
  return claimedIntent
}

function clearStoredThemeIntent(mode: ThemeMode, userId: string) {
  try {
    const storedIntent = readStoredThemeIntent()
    if (!storedIntent || storedIntent.mode !== mode) return
    if (storedIntent.userId !== null && storedIntent.userId !== userId) return
    window.localStorage.removeItem(themeIntentStorageKey)
  } catch {
    // A stale marker is harmless; the saved profile and theme cache still agree.
  }
}

/** The mode actually on screen, which is the only thing a comparison should trust. */
function appliedMode(): ThemeMode {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function recordChoice(mode: ThemeMode) {
  latestChoice = mode
  preferenceRevision += 1
}

function setActiveUser(userId: string | null) {
  if (activeUserId !== null && activeUserId !== userId) {
    hydratedUserId = null
    hydratingUserId = null
    lastPersistedTheme = null
    latestChoice = null
    pendingThemeSave = null
    canPersistProfileTheme = true
    preferenceRevision += 1
  }
  activeUserId = userId
}

function saveTheme(mode: ThemeMode) {
  const client = supabase
  const userId = activeUserId
  if (!client || !userId || !canPersistProfileTheme) return

  // A rapid light-dark-light sequence must not create a backlog whose stale
  // middle write can finish last. Keep one in-flight write and only the latest
  // unsent choice.
  if (lastPersistedTheme === mode && saveQueue === null && pendingThemeSave === null) {
    clearStoredThemeIntent(mode, userId)
    return
  }
  pendingThemeSave = { mode, userId }
  if (saveQueue) return

  saveQueue = (async () => {
    while (pendingThemeSave) {
      const pending = pendingThemeSave
      pendingThemeSave = null

      if (activeUserId !== pending.userId) continue

      const { error } = await client.rpc("set_current_user_theme_preference", {
        p_theme_mode: pending.mode,
      })
      if (error) throw error

      if (activeUserId === pending.userId) {
        lastPersistedTheme = pending.mode
        updateWorkspaceBootstrapPreferences({ themeMode: pending.mode })
        clearStoredThemeIntent(pending.mode, pending.userId)
      }
    }
  })()
    .catch((error: unknown) => {
      // The device preference has already been applied and stored. A provider
      // failure only postpones cross-device sync; it must never undo the screen.
      console.warn("Your appearance preference could not be saved to your profile.", error)
    })
    .finally(() => {
      saveQueue = null
      if (pendingThemeSave) saveTheme(pendingThemeSave.mode)
    })
}

/**
 * The only production entry point for an operator-initiated theme change.
 * ThemeProvider owns the root class, local storage, transition lock, and its own
 * cross-tab visual sync; this module records intent and persists it separately.
 */
export function setThemeWithProfileIntent(setTheme: (mode: ThemeMode) => void, mode: ThemeMode) {
  recordChoice(mode)
  persistThemeIntent(mode)
  setTheme(mode)
  saveTheme(mode)
}

/**
 * Loads the signed-in profile once per account. Auth token refreshes and theme
 * renders do not re-run hydration, so a cached profile value cannot repeatedly
 * fight the operator's current-session choice.
 */
export function ThemeProfileSync() {
  const { setTheme } = useTheme()
  const setThemeRef = useRef(setTheme)
  setThemeRef.current = setTheme

  useEffect(() => {
    const configuredClient = supabase
    if (!configuredClient) return
    const client: NonNullable<typeof supabase> = configuredClient

    const noteThemeFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== themeStorageKey || !isThemeMode(event.newValue)) return

      // ThemeProvider already applies this value in the receiving tab. Recording
      // the revision is enough to stop an older profile request from undoing it;
      // setting or saving here would create a second cross-tab write loop.
      recordChoice(event.newValue)
    }

    async function hydrateProfileTheme() {
      const startedRevision = preferenceRevision
      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) {
        console.warn("Your appearance preference could not be loaded from your profile.", sessionError)
        return
      }

      const session = sessionData.session
      const userId = session?.user.id ?? null
      setActiveUser(userId)

      if (!userId || hydratedUserId === userId || hydratingUserId === userId) return
      hydratingUserId = userId

      try {
        // This marker is an outbox, not a permanent device override. It only
        // outranks the profile until the matching profile write succeeds.
        const pendingIntent = claimStoredThemeIntent(userId)
        if (!latestChoice && pendingIntent) {
          recordChoice(pendingIntent.mode)
        }

        const workspacePreferences = session?.access_token
          ? await getApiWorkspacePreferences(session.access_token)
          : null
        if (workspacePreferences === null) {
          canPersistProfileTheme = false
          hydratedUserId = userId
          return
        }
        canPersistProfileTheme = true

        let savedTheme = workspacePreferences?.themeMode ?? null
        if (workspacePreferences === undefined) {
          const { data, error } = await client.rpc("get_current_user_theme_preference")
          if (error) {
            console.warn("Your appearance preference could not be loaded from your profile.", error)
            return
          }
          savedTheme = readThemeMode(data)
        }

        if (activeUserId !== userId) return

        // Any current-session or cross-tab choice is newer than a conflicting
        // profile/cache response, regardless of which network request finished
        // first. Persist the choice; never repaint the page backwards.
        const profileReadIsStale = preferenceRevision !== startedRevision
        const profileConflictsWithChoice = latestChoice !== null && savedTheme !== latestChoice
        if (latestChoice && (profileReadIsStale || profileConflictsWithChoice)) {
          if (savedTheme === latestChoice) lastPersistedTheme = latestChoice
          else saveTheme(latestChoice)
          hydratedUserId = userId
          return
        }

        if (savedTheme) {
          lastPersistedTheme = savedTheme
          if (appliedMode() !== savedTheme) setThemeRef.current(savedTheme)
          hydratedUserId = userId
          return
        }

        // First sign-in after the preference migration adopts the current
        // device value once, then later sessions hydrate from the profile.
        saveTheme(appliedMode())
        hydratedUserId = userId
      } finally {
        if (hydratingUserId === userId) hydratingUserId = null
      }
    }

    window.addEventListener("storage", noteThemeFromAnotherTab)
    void hydrateProfileTheme()
    const { data: listener } = client.auth.onAuthStateChange(() => {
      void hydrateProfileTheme()
    })

    return () => {
      window.removeEventListener("storage", noteThemeFromAnotherTab)
      listener.subscription.unsubscribe()
    }
  }, [])

  return null
}
