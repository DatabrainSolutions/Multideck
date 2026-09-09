type EmailAttachment = { id: string }

type ConversationMessage<Attachment extends EmailAttachment> = {
  role: string
  emailAttachments?: Attachment[]
}

type Conversation<Attachment extends EmailAttachment> = {
  messages: ConversationMessage<Attachment>[]
}

export function retainStreamedEmailAttachments<
  Attachment extends EmailAttachment,
  Value extends Conversation<Attachment>,
>(conversation: Value, streamedAttachments: Attachment[]): Value {
  if (streamedAttachments.length === 0) return conversation

  const assistantIndex = [...conversation.messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "assistant")?.index

  if (assistantIndex === undefined) return conversation

  return {
    ...conversation,
    messages: conversation.messages.map((message, index) => {
      if (index !== assistantIndex) return message

      const emailAttachments = new Map(
        (message.emailAttachments ?? []).map((attachment) => [attachment.id, attachment]),
      )
      for (const attachment of streamedAttachments) {
        emailAttachments.set(attachment.id, attachment)
      }

      return { ...message, emailAttachments: [...emailAttachments.values()] }
    }),
  }
}
