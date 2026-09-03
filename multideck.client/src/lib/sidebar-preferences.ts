import { useCallback, useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getApiWorkspacePreferences } from "@/lib/api"
import { getClientAuth, supabase } from "@/lib/supabase"
import { updateWorkspaceBootstrapPreferences } from "@/lib/workspace-bootstrap"

export type SidebarScopeLayout = {
  order: string[]
  pinned: string[]
}

export type SidebarLayout = Record<string, SidebarScopeLayout>

export type SidebarPreferences = {
  collapsed: boolean
  layout: SidebarLayout
}

/** Device-wide keys written before Multideck saved preferences per user; adopted once on first sign-in. */
const sharedLayoutKey = "multideck.sidebarLayout"
const sharedCollapsedKey = "multideck.sidebarCollapsed"
const storageKeyPrefix = "multideck.sidebar"
const eventName = "multideck:sidebar-preferences"
const emptyScope: SidebarScopeLayout = { order: [], pinned: [] }
const emptyPreferences: SidebarPreferences = { collapsed: false, layout: {} }

let preferences: SidebarPreferences = emptyPreferences
let storageKey = storageKeyPrefix
let loadedUserId: string | null = null
let loadPromise: Promise<void> | null = null
let pendingSave: Promise<unknown> = Promise.resolve()
let hasLocalEdit = false
let watchingAuth = false
let canPersistProfileSidebar = true

function toIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    result.push(entry)
  }

  return result
}

function isEmptyScope(scope: SidebarScopeLayout) {
  return scope.order.length === 0 && scope.pinned.length === 0
}

function normalizeLayout(value: unknown): SidebarLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const normalized: SidebarLayout = {}
  for (const [scopeId, scopeValue] of Object.entries(value as Record<string, unknown>)) {
    if (!scopeValue || typeof scopeValue !== "object") continue
    const scope = {
      order: toIdList((scopeValue as SidebarScopeLayout).order),
      pinned: toIdList((scopeValue as SidebarScopeLayout).pinned),
    }
    if (!isEmptyScope(scope)) normalized[scopeId] = scope
  }

  return normalized
}

function normalizePreferences(value: unknown): SidebarPreferences {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return emptyPreferences

  const candidate = row as Record<string, unknown>
  return {
    collapsed: candidate.collapsed === true,
    layout: normalizeLayout(candidate.layout),
  }
}

function isDefaultPreferences(value: SidebarPreferences) {
  return !value.collapsed && Object.keys(value.layout).length === 0
}

function readStoredPreferences(key: string): SidebarPreferences {
  if (typeof window === "undefined") return emptyPreferences

  const stored = window.localStorage.getItem(key)
  if (!stored) return emptyPreferences

  try {
    return normalizePreferences(JSON.parse(stored))
  } catch {
    return emptyPreferences
  }
}

function writeStoredPreferences(key: string, value: SidebarPreferences) {
  if (typeof window === "undefined") return

  if (isDefaultPreferences(value)) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, JSON.stringify(value))
}

/** Reads whatever this browser saved before preferences moved onto the user's profile. */
function readSharedPreferences(): SidebarPreferences {
  if (typeof window === "undefined") return emptyPreferences

  let layout: SidebarLayout = {}
  try {
    layout = normalizeLayout(JSON.parse(window.localStorage.getItem(sharedLayoutKey) ?? "null"))
  } catch {
    layout = {}
  }

  return { collapsed: window.localStorage.getItem(sharedCollapsedKey) === "true", layout }
}

function clearSharedPreferences() {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(sharedLayoutKey)
  window.localStorage.removeItem(sharedCollapsedKey)
}

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(eventName))
}

function applyPreferences(next: SidebarPreferences) {
  preferences = next
  writeStoredPreferences(storageKey, next)
  notify()
}

/** The current preferences, already merged from the local cache and this user's saved profile. */
export function readSidebarPreferences(): SidebarPreferences {
  return preferences
}

/**
 * Saves a preference change. It lands locally first so the sidebar never waits on the network,
 * then the whole set is pushed to the signed-in user's profile.
 */
function updatePreferences(next: SidebarPreferences) {
  hasLocalEdit = true
  applyPreferences(next)
  void pushPreferences()
}

export function writeSidebarScope(scopeId: string, scope: SidebarScopeLayout | null) {
  const layout = { ...preferences.layout }
  if (!scope || isEmptyScope(scope)) delete layout[scopeId]
  else layout[scopeId] = { order: toIdList(scope.order), pinned: toIdList(scope.pinned) }

  updatePreferences({ ...preferences, layout })
}

export function writeSidebarCollapsed(collapsed: boolean) {
  if (preferences.collapsed === collapsed) return
  updatePreferences({ ...preferences, collapsed })
}

/** Waits for the signed-in identity before saving, so an edit made during startup is not dropped. */
async function pushPreferences() {
  await ensureLoaded()
  await saveRemotePreferences(preferences)
}

async function currentSession(client: SupabaseClient) {
  const { data, error } = await getClientAuth(client).getSession()
  if (error) throw error

  return data.session
}

// Saves are chained so a quick pin-then-reorder cannot land out of order and resurrect stale state.
function saveRemotePreferences(next: SidebarPreferences) {
  const client = supabase
  if (!client || !loadedUserId || !canPersistProfileSidebar) return pendingSave

  pendingSave = pendingSave
    .then(() =>
      client.rpc("set_current_user_sidebar_preferences", {
        p_collapsed: next.collapsed,
        p_layout: next.layout,
      }),
    )
    .then(({ error }) => {
      if (error) throw error
      updateWorkspaceBootstrapPreferences({ sidebar: next })
    })
    .catch((error: unknown) => {
      console.warn("Your sidebar preferences could not be saved to your profile.", error)
    })

  return pendingSave
}

async function loadPreferences(client: SupabaseClient) {
  const session = await currentSession(client)
  const userId = session?.user.id ?? null
  loadedUserId = userId
  // Signed out, so there is no profile to read from and preferences stay on this device only.
  if (!userId) return

  storageKey = `${storageKeyPrefix}.${userId}`
  const cached = readStoredPreferences(storageKey)
  if (!hasLocalEdit && !isDefaultPreferences(cached)) applyPreferences(cached)

  const workspacePreferences = session?.access_token
    ? await getApiWorkspacePreferences(session.access_token)
    : null
  if (workspacePreferences === null) {
    canPersistProfileSidebar = false
    return
  }
  canPersistProfileSidebar = true

  let remotePreferences: unknown = workspacePreferences?.sidebar ?? null
  if (workspacePreferences === undefined) {
    const { data, error } = await client.rpc("get_current_user_sidebar_preferences")
    if (error) throw error
    remotePreferences = data
  }
  if (hasLocalEdit) return

  const saved = normalizePreferences(remotePreferences)
  const inherited = readSharedPreferences()
  if (isDefaultPreferences(saved) && !isDefaultPreferences(inherited)) {
    applyPreferences(inherited)
    clearSharedPreferences()
    await saveRemotePreferences(inherited)
    return
  }

  applyPreferences(saved)
}

function watchAuth(client: SupabaseClient) {
  if (watchingAuth) return
  watchingAuth = true

  // Signing in as somebody else must not leave the previous operator's sidebar on screen.
  getClientAuth(client).onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null
    const settled = loadPromise ?? Promise.resolve()

    void settled.then(() => {
      if (userId === loadedUserId) return

      preferences = emptyPreferences
      storageKey = storageKeyPrefix
      loadedUserId = null
      loadPromise = null
      hasLocalEdit = false
      canPersistProfileSidebar = true
      notify()
      void ensureLoaded()
    })
  })
}

function ensureLoaded() {
  const client = supabase
  if (!client) {
    if (!loadPromise) {
      applyPreferences(readSharedPreferences())
      loadPromise = Promise.resolve()
    }

    return loadPromise
  }

  loadPromise ??= loadPreferences(client).catch((error: unknown) => {
    console.warn("Your saved sidebar preferences could not be loaded.", error)
  })
  watchAuth(client)

  return loadPromise
}

function useSidebarPreferences() {
  const [current, setCurrent] = useState<SidebarPreferences>(readSidebarPreferences)

  useEffect(() => {
    void ensureLoaded()

    function sync() {
      setCurrent(readSidebarPreferences())
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key !== storageKey) return

      preferences = readStoredPreferences(storageKey)
      sync()
    }

    sync()
    window.addEventListener(eventName, sync)
    window.addEventListener("storage", handleStorageEvent)

    return () => {
      window.removeEventListener(eventName, sync)
      window.removeEventListener("storage", handleStorageEvent)
    }
  }, [])

  return current
}

/**
 * Keeps a saved order usable after a release adds or removes destinations: saved ids win,
 * and any id the user has never arranged is re-inserted next to the sibling it shipped after.
 */
export function mergeSavedOrder(baseIds: string[], savedOrder: string[]): string[] {
  const baseSet = new Set(baseIds)
  const merged = savedOrder.filter((id) => baseSet.has(id))
  if (merged.length === 0) return [...baseIds]

  const mergedSet = new Set(merged)
  baseIds.forEach((id, index) => {
    if (mergedSet.has(id)) return

    let insertAt = 0
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const anchor = merged.indexOf(baseIds[previous])
      if (anchor !== -1) {
        insertAt = anchor + 1
        break
      }
    }

    merged.splice(insertAt, 0, id)
    mergedSet.add(id)
  })

  return merged
}

/** True when a scope carries no customisation worth persisting, so it can be stored as absent. */
export function isDefaultScope(baseIds: string[], scope: SidebarScopeLayout) {
  if (scope.pinned.length > 0) return false
  if (scope.order.length === 0) return true

  return scope.order.length === baseIds.length && scope.order.every((id, index) => id === baseIds[index])
}

export type ResolvedSidebarOrder = {
  pinnedIds: string[]
  restIds: string[]
  orderedIds: string[]
}

export function resolveSidebarOrder(baseIds: string[], scope: SidebarScopeLayout): ResolvedSidebarOrder {
  const ordered = mergeSavedOrder(baseIds, scope.order)
  const pinnedSet = new Set(scope.pinned.filter((id) => ordered.includes(id)))
  const pinnedIds = scope.pinned.filter((id) => pinnedSet.has(id))
  const restIds = ordered.filter((id) => !pinnedSet.has(id))

  return { pinnedIds, restIds, orderedIds: [...pinnedIds, ...restIds] }
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const { collapsed } = useSidebarPreferences()

  return [collapsed, writeSidebarCollapsed]
}

export function useSidebarLayoutScope(scopeId: string | null) {
  const { layout } = useSidebarPreferences()
  const scope = (scopeId ? layout[scopeId] : undefined) ?? emptyScope

  const save = useCallback(
    (next: SidebarScopeLayout | null) => {
      if (!scopeId) return
      writeSidebarScope(scopeId, next)
    },
    [scopeId],
  )

  const togglePin = useCallback(
    (itemId: string) => {
      if (!scopeId) return

      const currentScope = readSidebarPreferences().layout[scopeId] ?? emptyScope
      const pinned = currentScope.pinned.includes(itemId)
        ? currentScope.pinned.filter((id) => id !== itemId)
        : [...currentScope.pinned, itemId]

      writeSidebarScope(scopeId, { order: currentScope.order, pinned })
    },
    [scopeId],
  )

  const reset = useCallback(() => {
    if (!scopeId) return
    writeSidebarScope(scopeId, null)
  }, [scopeId])

  return useMemo(() => ({ scope, save, togglePin, reset }), [scope, save, togglePin, reset])
}
