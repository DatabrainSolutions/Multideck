import { useCallback, useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export type TablePinPreferences = Record<string, string[]>

const eventName = "multideck:table-preferences"
const emptyPreferences: TablePinPreferences = {}

let preferences: TablePinPreferences = emptyPreferences
let loadedUserId: string | null = null
let loadPromise: Promise<void> | null = null
let pendingSave: Promise<unknown> = Promise.resolve()
let watchingAuth = false
let preferenceRevision = 0
const pendingEdits = new Map<string, string[]>()

function toIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  return value.filter((entry): entry is string => {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) return false
    seen.add(entry)
    return true
  })
}

export function normalizeTablePinPreferences(value: unknown): TablePinPreferences {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object" || Array.isArray(row)) return emptyPreferences

  const candidate = "preferences" in row
    ? (row as { preferences?: unknown }).preferences
    : row
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return emptyPreferences

  const normalized: TablePinPreferences = {}
  for (const [tableId, columnIds] of Object.entries(candidate as Record<string, unknown>)) {
    const pinned = toIdList(columnIds)
    if (tableId.length > 0 && pinned.length > 0) normalized[tableId] = pinned
  }

  return normalized
}

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(eventName))
}

function applyPreferences(next: TablePinPreferences) {
  preferences = next
  notify()
}

async function currentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session?.user.id ?? null
}

function saveRemotePreferences(next: TablePinPreferences) {
  const client = supabase
  const userId = loadedUserId
  const revisionAtSave = preferenceRevision
  if (!client || !userId) return pendingSave

  pendingSave = pendingSave
    .then(async () => {
      if (loadedUserId !== userId) return false

      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw sessionError
      if (sessionData.session?.user.id !== userId) return false

      const { error } = await client.rpc("set_current_user_table_preferences", { p_preferences: next })
      if (error) throw error
      return true
    })
    .then((saved) => {
      if (saved && preferenceRevision === revisionAtSave) pendingEdits.clear()
    })
    .catch((error: unknown) => {
      console.warn("Your table pin preferences could not be saved to your profile.", error)
    })

  return pendingSave
}

async function loadPreferences(client: SupabaseClient) {
  const userId = await currentUserId(client)
  loadedUserId = userId
  if (!userId) return

  const { data, error } = await client.rpc("get_current_user_table_preferences")
  if (error) throw error

  const saved = normalizeTablePinPreferences(data)
  for (const [tableId, columnIds] of pendingEdits) {
    if (columnIds.length > 0) saved[tableId] = columnIds
    else delete saved[tableId]
  }
  applyPreferences(saved)

  if (pendingEdits.size > 0) await saveRemotePreferences(saved)
}

function watchAuth(client: SupabaseClient) {
  if (watchingAuth) return
  watchingAuth = true

  client.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null
    const settled = loadPromise ?? Promise.resolve()

    void settled.then(() => {
      if (userId === loadedUserId) return

      preferences = emptyPreferences
      loadedUserId = null
      loadPromise = null
      preferenceRevision = 0
      pendingEdits.clear()
      notify()
      void ensureLoaded()
    })
  })
}

function ensureLoaded() {
  const client = supabase
  if (!client) return Promise.resolve()

  loadPromise ??= loadPreferences(client).catch((error: unknown) => {
    console.warn("Your saved table pin preferences could not be loaded.", error)
  })
  watchAuth(client)
  return loadPromise
}

function writeTablePins(tableId: string, columnIds: string[]) {
  const pinned = toIdList(columnIds)
  const next = { ...preferences }
  if (pinned.length > 0) next[tableId] = pinned
  else delete next[tableId]

  pendingEdits.set(tableId, pinned)
  preferenceRevision += 1
  applyPreferences(next)
  void ensureLoaded().then(() => saveRemotePreferences(preferences))
}

export function useTablePinnedColumns(tableId: string | undefined, availableColumnIds: string[]) {
  const availableKey = availableColumnIds.join("\u0000")
  const [localPinned, setLocalPinned] = useState<string[]>([])

  useEffect(() => {
    if (!tableId) return
    void ensureLoaded()

    const sync = () => {
      const available = new Set(availableColumnIds)
      setLocalPinned((preferences[tableId] ?? []).filter((id) => available.has(id)))
    }

    sync()
    window.addEventListener(eventName, sync)
    return () => window.removeEventListener(eventName, sync)
    // availableKey tracks column identity without retriggering on a new array reference.
  }, [availableKey, tableId])

  const save = useCallback((next: Iterable<string>) => {
    const available = new Set(availableColumnIds)
    const normalized = toIdList([...next]).filter((id) => available.has(id))
    setLocalPinned(normalized)
    if (tableId) writeTablePins(tableId, normalized)
  }, [availableKey, tableId])

  return useMemo(() => [new Set(localPinned), save] as const, [localPinned, save])
}
