type PresentedMessage = {
  id: string
  role: string
  renderKey?: string
  responseToUserMessageId?: string | null
}

/** Keep the live DOM mounted when the server acknowledges its saved IDs. */
export function retainDexterRenderKeys<T extends { messages: PresentedMessage[] }>(
  completed: T,
  previous: T | null,
  streamingId: string,
  pendingUserId?: string,
): T {
  const previousKeys = new Map(previous?.messages.map(message => [message.id, message.renderKey ?? message.id]))
  const response = [...completed.messages].reverse().find(message => message.role === "assistant")
  const user = pendingUserId && response
    ? completed.messages.find(message => message.id === response.responseToUserMessageId)
      ?? [...completed.messages].reverse().find(message => message.role === "user")
    : undefined
  return {
    ...completed,
    messages: completed.messages.map(message => ({
      ...message,
      renderKey: message === response ? streamingId
        : message === user ? pendingUserId
        : previousKeys.get(message.id) ?? message.id,
    })),
  }
}

export function dexterArtifactReferences(content: string, hasRecordTable: boolean) {
  if (!hasRecordTable) return content
  // Native record tables follow the response, including in saved conversations.
  return content.replace(/\b(tables?)\s+above\b/gi, "$1 below")
}
