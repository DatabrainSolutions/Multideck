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
