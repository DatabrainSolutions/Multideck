import { workspaceStorageKey } from "./workspace-environment.ts"
export const DEXTER_NEW_CONVERSATION_EVENT = "multideck:dexter-new-conversation"
export const DEXTER_SELECT_CONVERSATION_EVENT = "multideck:dexter-select-conversation"
export const DEXTER_CONVERSATIONS_CHANGED_EVENT = "multideck:dexter-conversations-changed"

export type DexterConversationsChangedDetail = {
  action?: "rename" | "delete"
  id?: string
  title?: string
}

export function announceDexterConversationsChanged(detail: DexterConversationsChangedDetail = {}) {
  window.dispatchEvent(new CustomEvent(DEXTER_CONVERSATIONS_CHANGED_EVENT, { detail }))
}

const conversationHandoffKey = workspaceStorageKey("multideck.dexterConversationHandoff")
const taskHandoffKey = workspaceStorageKey("multideck.dexterTaskHandoff")
const conversationQueryKey = "conversation"
const conversationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function dexterConversationIdFromUrl(value: string | URL) {
  const url = value instanceof URL ? value : new URL(value, "https://multideck.app")
  const conversationId = url.searchParams.get(conversationQueryKey)?.trim() ?? ""
  return conversationIdPattern.test(conversationId) ? conversationId : null
}

export function readDexterConversationIdFromLocation() {
  if (typeof window === "undefined") return null
  return dexterConversationIdFromUrl(window.location.href)
}

/**
 * React state can still contain the previous thread for one render after the
 * operator starts a new chat. Only reuse it when it also matches the current
 * navigation intent; otherwise the first new message can land in the old chat.
 */
export function shouldReuseDexterConversation(
  activeConversationId: string | null | undefined,
  intendedConversationId: string | null,
) {
  return Boolean(intendedConversationId && activeConversationId === intendedConversationId)
}

/**
 * Keep the open Dexter thread in the address bar so a hard refresh restores
 * the same conversation. Replace rather than push: browsing chat history must
 * not fill the browser Back stack with every thread selection.
 */
export function rememberOpenDexterConversation(conversationId: string | null) {
  if (typeof window === "undefined") return

  const url = new URL(window.location.href)
  if (conversationId && conversationIdPattern.test(conversationId)) {
    url.searchParams.set(conversationQueryKey, conversationId)
  } else {
    url.searchParams.delete(conversationQueryKey)
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
}

/**
 * Hands a conversation started elsewhere — the summon overlay — to the Dexter
 * workspace. Written to session storage rather than dispatched as an event
 * because the page that has to receive it is still being loaded and mounted.
 */
export function rememberDexterConversationHandoff(conversationId: string) {
  if (typeof window === "undefined" || !conversationId) return

  try {
    window.sessionStorage.setItem(conversationHandoffKey, conversationId)
  } catch {
    // The workspace still opens; it simply starts on the landing state.
  }
}

export function takeDexterConversationHandoff() {
  if (typeof window === "undefined") return null

  try {
    const id = window.sessionStorage.getItem(conversationHandoffKey)
    if (id) window.sessionStorage.removeItem(conversationHandoffKey)
    return id
  } catch {
    return null
  }
}

/**
 * Pass a reviewed piece of work into Dexter without sending it automatically.
 * The destination consumes this once and places it in the composer so the
 * operator can amend or approve the request before Dexter acts.
 */
export function rememberDexterTaskHandoff(prompt: string) {
  if (typeof window === "undefined") return
  const value = prompt.trim()
  if (!value) return

  try {
    window.sessionStorage.setItem(taskHandoffKey, value)
  } catch {
    // Dexter still opens; it simply starts with an empty composer.
  }
}

export function takeDexterTaskHandoff() {
  if (typeof window === "undefined") return null

  try {
    const prompt = window.sessionStorage.getItem(taskHandoffKey)?.trim() ?? ""
    if (prompt) window.sessionStorage.removeItem(taskHandoffKey)
    return prompt || null
  } catch {
    return null
  }
}
