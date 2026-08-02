/**
 * The single place the app listens for shortcuts, and the store that remembers
 * an operator's customisations.
 *
 * One window listener serves every shortcut. Registering a handler per component
 * would mean dozens of listeners racing to claim the same keystroke, and every
 * one of them re-reading preferences; here the resolved binding table is built
 * once per change and the listener is a map lookup.
 *
 * Sequences ("G" then "B") are held in a small pending buffer that expires, so a
 * stray G never leaves the app waiting for a second key it will not get.
 *
 * Persistence follows the same shape as the sidebar's: the change lands locally
 * first so a keystroke never waits on the network, then the whole override set is
 * written to the signed-in operator's Supabase profile. Only overrides are stored,
 * so a shortcut nobody has changed keeps following the shipped default.
 */

import { useEffect, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  bindingsEqual,
  bindingSurvivesTyping,
  isEditableTarget,
  isModifierOnlyEvent,
  matchesPointerBinding,
  matchesStep,
  parseBinding,
  serializeBinding,
  shortcutPlatform,
  stepFromEvent,
  type ShortcutBinding,
  type ShortcutPlatform,
} from "@/lib/keyboard-shortcut-binding"
import { shortcutDefinitionMap, shortcutDefinitions } from "@/data/keyboard-shortcuts-data"

/** The device-wide key written before shortcuts moved onto the profile. */
const sharedStorageKey = "multideck.keyboardShortcuts"
const storageKeyPrefix = "multideck.keyboardShortcuts"
const eventName = "multideck:keyboard-shortcuts"
/**
 * How long a sequence waits for its second key. Long enough to be typed with one
 * hand, short enough that a forgotten leader clears itself before it surprises
 * anybody.
 */
const sequenceTimeout = 1400

/** An explicit empty string means "the operator turned this shortcut off". */
type ShortcutOverrides = Record<string, string>

export type ShortcutBindingMap = Record<string, ShortcutBinding | null>

let overrides: ShortcutOverrides = {}
let resolved: ShortcutBindingMap = {}
let hydrated = false
let storageKey = storageKeyPrefix
let loadedUserId: string | null = null
let loadPromise: Promise<void> | null = null
let pendingSave: Promise<unknown> = Promise.resolve()
let hasLocalEdit = false
let watchingAuth = false

/** Drops ids this release no longer ships, and anything that is not a string. */
function normalizeOverrides(value: unknown): ShortcutOverrides {
  const row = Array.isArray(value) ? value[0] : value
  const source = row && typeof row === "object" && "shortcuts" in row
    ? (row as { shortcuts: unknown }).shortcuts
    : row

  if (!source || typeof source !== "object" || Array.isArray(source)) return {}

  const next: ShortcutOverrides = {}
  for (const [id, entry] of Object.entries(source as Record<string, unknown>)) {
    if (!shortcutDefinitionMap.has(id)) continue
    if (typeof entry !== "string" || entry.length > 120) continue
    next[id] = entry
  }

  return next
}

function readStoredOverrides(key: string): ShortcutOverrides {
  if (typeof window === "undefined") return {}

  try {
    const stored = window.localStorage.getItem(key)
    return stored ? normalizeOverrides(JSON.parse(stored)) : {}
  } catch {
    return {}
  }
}

function resolveBindings(source: ShortcutOverrides): ShortcutBindingMap {
  const next: ShortcutBindingMap = {}

  for (const definition of shortcutDefinitions) {
    if (!(definition.id in source)) {
      next[definition.id] = definition.defaultBinding
      continue
    }

    const override = source[definition.id]
    next[definition.id] = override ? parseBinding(override) : null
  }

  return next
}

function hydrate() {
  if (hydrated) return
  hydrated = true
  // The device cache is read synchronously so the very first keystroke already
  // respects a customisation; the profile catches up a moment later.
  overrides = readStoredOverrides(storageKey)
  resolved = resolveBindings(overrides)
}

function persist(key: string) {
  if (typeof window === "undefined") return

  try {
    if (Object.keys(overrides).length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(overrides))
  } catch {
    // Shortcuts still work for this session when storage is unavailable.
  }
}

function announce() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(eventName))
}

/** Applies a set locally: cache, resolved table, listeners. No network. */
function applyOverrides(next: ShortcutOverrides) {
  overrides = next
  resolved = resolveBindings(overrides)
  invalidateEntries()
  persist(storageKey)
  announce()
}

/** Applies an operator's edit, then pushes the whole set to their profile. */
function commit(next: ShortcutOverrides) {
  hasLocalEdit = true
  applyOverrides(next)
  void pushOverrides()
}

async function currentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession()
  if (error) throw error

  return data.session?.user.id ?? null
}

// Saves are chained so a quick rebind-then-reset cannot land out of order and
// resurrect the binding the operator just replaced.
function saveRemoteOverrides(next: ShortcutOverrides) {
  const client = supabase
  if (!client || !loadedUserId) return pendingSave

  pendingSave = pendingSave
    .then(() => client.rpc("set_current_user_keyboard_shortcuts", { p_shortcuts: next }))
    .then(({ error }) => {
      if (error) throw error
    })
    .catch((error: unknown) => {
      console.warn("Your keyboard shortcuts could not be saved to your profile.", error)
    })

  return pendingSave
}

/** Waits for the identity before saving, so an edit made during startup survives. */
async function pushOverrides() {
  await ensureLoaded()
  await saveRemoteOverrides(overrides)
}

async function loadOverrides(client: SupabaseClient) {
  const userId = await currentUserId(client)
  loadedUserId = userId
  // Signed out, so there is no profile to read and the set stays on this device.
  if (!userId) return

  storageKey = `${storageKeyPrefix}.${userId}`
  const cached = readStoredOverrides(storageKey)
  if (!hasLocalEdit && Object.keys(cached).length > 0) applyOverrides(cached)

  const { data, error } = await client.rpc("get_current_user_keyboard_shortcuts")
  if (error) throw error
  if (hasLocalEdit) return

  const saved = normalizeOverrides(data)
  const inherited = readStoredOverrides(sharedStorageKey)

  // First sign-in after this feature moved onto the profile: adopt whatever this
  // browser had, then clear the device-wide copy so it cannot resurface later.
  if (Object.keys(saved).length === 0 && Object.keys(inherited).length > 0) {
    applyOverrides(inherited)
    try {
      window.localStorage.removeItem(sharedStorageKey)
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    await saveRemoteOverrides(inherited)
    return
  }

  applyOverrides(saved)
}

function watchAuth(client: SupabaseClient) {
  if (watchingAuth) return
  watchingAuth = true

  // Signing in as somebody else must not leave the previous operator's bindings
  // live on this browser.
  client.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null
    const settled = loadPromise ?? Promise.resolve()

    void settled.then(() => {
      if (userId === loadedUserId) return

      overrides = {}
      resolved = resolveBindings(overrides)
      invalidateEntries()
      storageKey = storageKeyPrefix
      loadedUserId = null
      loadPromise = null
      hasLocalEdit = false
      announce()
      void ensureLoaded()
    })
  })
}

function ensureLoaded() {
  hydrate()

  const client = supabase
  if (!client) {
    loadPromise ??= Promise.resolve()
    return loadPromise
  }

  loadPromise ??= loadOverrides(client).catch((error: unknown) => {
    console.warn("Your saved keyboard shortcuts could not be loaded.", error)
  })
  watchAuth(client)

  return loadPromise
}

export function readShortcutBindings(): ShortcutBindingMap {
  hydrate()
  return resolved
}

export function readShortcutBinding(id: string): ShortcutBinding | null {
  return readShortcutBindings()[id] ?? null
}

/** `null` disables the shortcut; passing the default clears the override. */
export function writeShortcutBinding(id: string, binding: ShortcutBinding | null) {
  hydrate()

  const definition = shortcutDefinitionMap.get(id)
  if (!definition) return

  const next = { ...overrides }
  if (binding && bindingsEqual(binding, definition.defaultBinding)) delete next[id]
  else next[id] = binding ? serializeBinding(binding) : ""

  commit(next)
}

export function resetShortcutBinding(id: string) {
  hydrate()
  if (!(id in overrides)) return

  const next = { ...overrides }
  delete next[id]
  commit(next)
}

export function resetAllShortcutBindings() {
  hydrate()
  if (Object.keys(overrides).length === 0) return
  commit({})
}

export function isShortcutCustomised(id: string) {
  hydrate()
  return id in overrides
}

export function customisedShortcutCount() {
  hydrate()
  return Object.keys(overrides).length
}

/**
 * Shortcut ids that share a binding with the given one. A duplicate is not
 * blocked — an operator may be mid-swap between two shortcuts — but it is shown,
 * because a silently shadowed shortcut looks like a bug in the app.
 */
export function findShortcutConflicts(id: string, binding: ShortcutBinding | null): string[] {
  if (!binding) return []

  const bindings = readShortcutBindings()
  const serialized = serializeBinding(binding)
  const leader = binding.kind === "chord" ? binding.steps[0] : null

  return shortcutDefinitions
    .filter((definition) => definition.id !== id)
    .filter((definition) => {
      const other = bindings[definition.id]
      if (!other) return false
      if (serializeBinding(other) === serialized) return true

      // A single key that is also a sequence leader would swallow the sequence.
      if (!leader || other.kind !== "chord") return false
      const otherLeader = other.steps[0]
      const oneIsSequence = binding.kind === "chord" && binding.steps.length !== other.steps.length
      return oneIsSequence && serializeStepPair(leader) === serializeStepPair(otherLeader)
    })
    .map((definition) => definition.id)
}

function serializeStepPair(step: { key: string; mod: boolean; shift: boolean; alt: boolean }) {
  return `${step.mod ? "1" : "0"}${step.shift ? "1" : "0"}${step.alt ? "1" : "0"}${step.key}`
}

export function useShortcutBindings(): ShortcutBindingMap {
  const [bindings, setBindings] = useState(readShortcutBindings)

  useEffect(() => {
    void ensureLoaded()

    function sync() {
      setBindings(readShortcutBindings())
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) return
      // Another tab edited the bindings; adopt them without echoing a write back.
      overrides = readStoredOverrides(storageKey)
      resolved = resolveBindings(overrides)
      invalidateEntries()
      sync()
    }

    sync()
    window.addEventListener(eventName, sync)
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener(eventName, sync)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  return bindings
}

export function useShortcutBinding(id: string) {
  return useShortcutBindings()[id] ?? null
}

export function usePlatformShortcutLabels(): ShortcutPlatform {
  // Resolved after mount so the first server-agnostic paint never guesses ⌘ for a
  // Windows operator and then swaps the glyph under them.
  const [platform, setPlatform] = useState<ShortcutPlatform>("other")
  useEffect(() => setPlatform(shortcutPlatform()), [])
  return platform
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export type ShortcutTrigger = {
  id: string
  /** The event that fired it, so a pointer summon can read its own target. */
  event: KeyboardEvent | MouseEvent
}

type ShortcutHandler = (trigger: ShortcutTrigger) => void

const handlers = new Map<string, Set<ShortcutHandler>>()
const pendingListeners = new Set<(pending: PendingSequence | null) => void>()

export type PendingSequence = {
  id: string
  tokens: string[]
  /** Ids still reachable from the keys pressed so far, for the on-screen hint. */
  candidates: string[]
}

let pending: PendingSequence | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let pendingStepKey: string | null = null
let listenerCount = 0
let suspendCount = 0
/** Shortcut ids that stay live through a suspension, reference counted. */
const exemptions = new Map<string, number>()
let attached = false

function setPending(next: PendingSequence | null, stepKey: string | null) {
  pending = next
  pendingStepKey = stepKey
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = next ? setTimeout(() => setPending(null, null), sequenceTimeout) : null
  pendingListeners.forEach((listener) => listener(pending))
}

export function subscribeToPendingSequence(listener: (pending: PendingSequence | null) => void) {
  pendingListeners.add(listener)
  listener(pending)
  return () => {
    pendingListeners.delete(listener)
  }
}

/**
 * Stops the dispatcher without unregistering anything. Used while the summon
 * prompt or the binding recorder owns the keyboard, so their keystrokes cannot
 * also trigger the app underneath.
 *
 * `except` keeps named shortcuts live through the suspension. The summon uses it
 * so an operator can re-aim it at something else without dismissing it first —
 * the gesture that opened the prompt should still work while it is open.
 */
export function suspendShortcuts(except: string[] = []) {
  suspendCount += 1
  for (const id of except) exemptions.set(id, (exemptions.get(id) ?? 0) + 1)
  if (suspendCount === 1) setPending(null, null)

  let released = false
  return () => {
    if (released) return
    released = true
    suspendCount = Math.max(0, suspendCount - 1)
    for (const id of except) {
      const remaining = (exemptions.get(id) ?? 1) - 1
      if (remaining > 0) exemptions.set(id, remaining)
      else exemptions.delete(id)
    }
  }
}

export function areShortcutsSuspended() {
  return suspendCount > 0
}

/** True when this shortcut is currently blocked from firing. */
function isBlocked(id: string) {
  return suspendCount > 0 && !exemptions.has(id)
}

function runHandlers(id: string, event: KeyboardEvent | MouseEvent) {
  const set = handlers.get(id)
  if (!set || set.size === 0) return false

  for (const handler of set) handler({ id, event })
  return true
}

type ActiveEntry = { id: string; binding: ShortcutBinding }

let entriesCache: ActiveEntry[] | null = null

function invalidateEntries() {
  entriesCache = null
}

/**
 * Bindings that both exist and have somebody listening, cached between changes.
 * A keystroke should not rebuild this list — the table only moves when a handler
 * mounts or an operator edits a binding.
 */
function activeBindingEntries(): ActiveEntry[] {
  if (entriesCache) return entriesCache

  const bindings = readShortcutBindings()
  entriesCache = [...handlers.keys()]
    .map((id) => ({ id, binding: bindings[id] ?? null }))
    .filter((entry): entry is ActiveEntry => Boolean(entry.binding))

  return entriesCache
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (isModifierOnlyEvent(event)) return

  const platform = shortcutPlatform()
  const step = stepFromEvent(event, platform)
  if (!step) return

  const typing = isEditableTarget(event.target)
  // Blocked shortcuts are filtered out rather than short-circuiting the whole
  // listener, so an exempt shortcut still resolves during a suspension.
  const entries = activeBindingEntries().filter(({ id }) => !isBlocked(id))
  if (entries.length === 0) return

  // 1. Continue a sequence that is already underway.
  if (pending && pendingStepKey) {
    for (const { id, binding } of entries) {
      if (binding.kind !== "chord" || binding.steps.length < 2) continue
      if (serializeStepPair(binding.steps[0]) !== pendingStepKey) continue
      if (!matchesStep(binding.steps[1], event, platform)) continue

      event.preventDefault()
      setPending(null, null)
      runHandlers(id, event)
      return
    }

    // Anything else ends the run rather than lingering as a trap.
    setPending(null, null)
  }

  // 2. A complete single-step chord.
  for (const { id, binding } of entries) {
    if (binding.kind !== "chord" || binding.steps.length !== 1) continue
    if (typing && !bindingSurvivesTyping(binding)) continue
    if (!matchesStep(binding.steps[0], event, platform)) continue

    event.preventDefault()
    if (runHandlers(id, event)) return
  }

  // 3. The first key of a sequence. Never while typing: a bare letter belongs to
  //    the field the operator is in.
  if (typing) return

  const candidates = entries.filter(({ binding }) =>
    binding.kind === "chord" && binding.steps.length > 1 && matchesStep(binding.steps[0], event, platform),
  )
  if (candidates.length === 0) return

  event.preventDefault()
  setPending(
    { id: candidates[0].id, tokens: [step.key], candidates: candidates.map(({ id }) => id) },
    serializeStepPair(step),
  )
}

/**
 * Modified double-clicks are claimed before the page sees them. Suppressing the
 * second `mousedown` is what stops the browser selecting a word under the ring,
 * and it leaves an unmodified double-click completely untouched.
 */
function pointerEntries() {
  return activeBindingEntries().filter((entry) => entry.binding.kind === "pointer" && !isBlocked(entry.id))
}

function handleMouseDown(event: MouseEvent) {
  if (event.button !== 0 || event.detail < 2) return
  if (!pointerEntries().some(({ binding }) => matchesPointerBinding(binding, event))) return
  event.preventDefault()
}

function handleDoubleClick(event: MouseEvent) {
  if (event.button !== 0) return

  const match = pointerEntries().find(({ binding }) => matchesPointerBinding(binding, event))
  if (!match) return

  event.preventDefault()
  event.stopPropagation()
  runHandlers(match.id, event)
}

function attachListeners() {
  if (attached || typeof window === "undefined") return
  attached = true
  window.addEventListener("keydown", handleKeyDown, { capture: true })
  window.addEventListener("mousedown", handleMouseDown, { capture: true })
  window.addEventListener("dblclick", handleDoubleClick, { capture: true })
}

function detachListeners() {
  if (!attached || typeof window === "undefined") return
  attached = false
  window.removeEventListener("keydown", handleKeyDown, { capture: true })
  window.removeEventListener("mousedown", handleMouseDown, { capture: true })
  window.removeEventListener("dblclick", handleDoubleClick, { capture: true })
  setPending(null, null)
}

function registerShortcutHandler(id: string, handler: ShortcutHandler) {
  const set = handlers.get(id) ?? new Set<ShortcutHandler>()
  set.add(handler)
  handlers.set(id, set)
  listenerCount += 1
  invalidateEntries()
  attachListeners()

  return () => {
    set.delete(handler)
    if (set.size === 0) handlers.delete(id)
    listenerCount -= 1
    invalidateEntries()
    if (listenerCount <= 0) detachListeners()
  }
}

/**
 * Binds one shortcut to one action. The handler is read through a ref so a
 * closure that changes every render does not churn the registration.
 */
export function useShortcutAction(id: string, handler: ShortcutHandler | null | undefined) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const enabled = Boolean(handler)

  useEffect(() => {
    if (!enabled) return
    return registerShortcutHandler(id, (trigger) => handlerRef.current?.(trigger))
  }, [enabled, id])
}

/** Binds a whole map at once, which is how the app shell wires its set. */
export function useShortcutActions(actions: Record<string, ShortcutHandler | undefined>) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const ids = Object.keys(actions).filter((id) => Boolean(actions[id])).sort().join("|")

  useEffect(() => {
    if (!ids) return

    const unsubscribes = ids.split("|").map((id) =>
      registerShortcutHandler(id, (trigger) => actionsRef.current[trigger.id]?.(trigger)),
    )

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [ids])
}

export function usePendingSequence() {
  const [current, setCurrent] = useState<PendingSequence | null>(pending)
  useEffect(() => subscribeToPendingSequence(setCurrent), [])
  return current
}

/**
 * Suspends the dispatcher for as long as `active` stays true. Ids in `except`
 * keep working through the suspension.
 */
export function useShortcutSuspension(active: boolean, except: string[] = []) {
  const key = except.join("|")

  useEffect(() => {
    if (!active) return
    return suspendShortcuts(key ? key.split("|") : [])
  }, [active, key])
}

export const shortcutStorageKey = storageKey
