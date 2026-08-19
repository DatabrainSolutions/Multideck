export type DexterBranchMessage = {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  createdAt: string
  responseToUserMessageId?: string | null
  responseVersion?: number | null
  parentResponseMessageId?: string | null
}

export function responseGroupsFor<TMessage extends DexterBranchMessage>(messages: TMessage[]) {
  const responsesByUserId = new Map<string, TMessage[]>()
  const pairedAssistantIds = new Set<string>()

  messages.forEach((message, index) => {
    if (message.role !== "user") return

    const responses = messages.filter(
      (candidate) =>
        candidate.role === "assistant" &&
        candidate.responseToUserMessageId === message.id,
    )
    const immediateResponse = messages[index + 1]
    if (
      immediateResponse?.role === "assistant" &&
      !immediateResponse.responseToUserMessageId &&
      !responses.some((response) => response.id === immediateResponse.id)
    ) {
      responses.unshift({ ...immediateResponse, responseVersion: 1 })
    }

    responses.sort((left, right) => {
      const versionDifference = (left.responseVersion ?? 1) - (right.responseVersion ?? 1)
      if (versionDifference !== 0) return versionDifference
      return left.createdAt.localeCompare(right.createdAt)
    })

    if (responses.length === 0) return
    responsesByUserId.set(message.id, responses)
    responses.forEach((response) => pairedAssistantIds.add(response.id))
  })

  return { responsesByUserId, pairedAssistantIds }
}

export function conversationBranchFor<TMessage extends DexterBranchMessage>(
  messages: TMessage[],
  selectedResponseMessageIds: Record<string, string>,
): TMessage[] {
  const { responsesByUserId, pairedAssistantIds } = responseGroupsFor(messages)
  const messageIndexById = new Map(messages.map((message, index) => [message.id, index]))
  const userMessages = messages.filter((message) => message.role === "user")
  const parentResponseByUserId = new Map<string, string | null>()

  userMessages.forEach((message, userIndex) => {
    if (message.parentResponseMessageId && pairedAssistantIds.has(message.parentResponseMessageId)) {
      parentResponseByUserId.set(message.id, message.parentResponseMessageId)
      return
    }

    if (userIndex === 0) {
      parentResponseByUserId.set(message.id, null)
      return
    }

    const messageIndex = messageIndexById.get(message.id) ?? -1
    let inferredParent: string | null = null
    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate.role === "assistant" && pairedAssistantIds.has(candidate.id)) {
        inferredParent = candidate.id
        break
      }
    }
    parentResponseByUserId.set(message.id, inferredParent)
  })

  const rootMessage = userMessages.find(
    (message) => parentResponseByUserId.get(message.id) === null,
  )
  if (!rootMessage) return []

  const branch: TMessage[] = []
  const visitedUserIds = new Set<string>()
  let currentUser: TMessage | undefined = rootMessage

  while (currentUser && !visitedUserIds.has(currentUser.id)) {
    visitedUserIds.add(currentUser.id)
    branch.push(currentUser)

    const responses: TMessage[] = responsesByUserId.get(currentUser.id) ?? []
    const selectedResponseId: string | undefined =
      selectedResponseMessageIds[currentUser.id]
    const selectedResponse: TMessage | undefined = responses.find(
      (response: TMessage) => response.id === selectedResponseId,
    )
      ?? responses.at(-1)
    if (!selectedResponse) break

    branch.push(selectedResponse)
    const branchResponseId: string = selectedResponse.id
    currentUser = userMessages.find(
      (message: TMessage) =>
        !visitedUserIds.has(message.id) &&
        parentResponseByUserId.get(message.id) === branchResponseId,
    )
  }

  return branch
}
