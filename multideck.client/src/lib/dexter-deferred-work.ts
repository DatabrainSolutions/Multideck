import type { DexterMessage } from "./dexter-api"

/** Only offer saved remaining work on the selected branch, after every dependency succeeds. */
export function deferredWorkState(message: DexterMessage, branch: DexterMessage[]): "waiting" | "ready" | "blocked" | "dismissed" | null {
 const work = message.deferredWork
 if (!work || !work.afterActionIds.length) return null
 const index = branch.findIndex(item => item.id === message.id)
 if (index < 0) return null
 if (message.deferredWorkDismissed) return "dismissed"
 const later = branch.slice(index + 1)
 // The display label is not an identity: separate plans can share the same label.
 // Saved assistant replies and optimistic submissions carry the source message ID.
 const legacyPrompt = `Continue only the remaining part of my earlier request. Read current data again, preserve all unrequested values and prepare any changes for approval. Do not repeat completed or denied actions.\n\nRemaining work: ${work.request}`
 const sourceIds = new Set([message.id, message.serverId].filter(Boolean))
 if (later.some(item => item.continuationMessageId && sourceIds.has(item.continuationMessageId))) return null
 if (later.some(item => item.role === "user" && item.content === legacyPrompt)) return null
 // Older concise submissions lacked IDs. Only infer their target when the label
 // uniquely identified one earlier plan and no saved reply identifies another.
 if (later.some(item => {
  if (item.role !== "user" || item.continuationMessageId || item.content !== deferredWorkPrompt(message)) return false
  if (later.some(reply => reply.responseToUserMessageId === item.id && reply.continuationMessageId)) return false
  const submittedAt = branch.indexOf(item)
  return branch.slice(0, submittedAt).filter(candidate => candidate.deferredWork?.label === work.label).length === 1
 })) return null
 const actions = new Map(branch.flatMap(item => item.pendingActions ?? (item.pendingAction ? [item.pendingAction] : [])).map(action => [action.id, action]))
 const statuses = work.afterActionIds.map(id => actions.get(id)?.status)
 if (statuses.some(status => !status || ["failed", "declined", "expired", "superseded", "unavailable"].includes(status))) return "blocked"
 return statuses.every(status => status === "succeeded") ? "ready" : "waiting"
}
export function deferredWorkPrompt(message: DexterMessage) {
 return `Continue request: ${message.deferredWork?.label ?? "Remaining work"}`
}
