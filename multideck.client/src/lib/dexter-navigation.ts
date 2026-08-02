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

const conversationHandoffKey = "multideck.dexterConversationHandoff"

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
