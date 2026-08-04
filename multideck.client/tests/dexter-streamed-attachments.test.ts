import assert from "node:assert/strict"
import test from "node:test"
import {
  retainStreamedEmailAttachments,
} from "../src/lib/dexter-streamed-attachments.ts"

type DexterEmailAttachment = {
  id: string
  provider: "gmail" | "outlook"
  mailboxId: string
  threadId: string
  messageId: string
  subject: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sourceUrl: string
}

type DexterConversation = {
  id: string
  title: string
  summary: string
  updatedAt: string
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    createdAt: string
    emailAttachments?: DexterEmailAttachment[]
  }>
}

const streamedAttachment: DexterEmailAttachment = {
  id: "8fd95aa7-23c0-4ce1-819c-bbd7ddc76d53",
  provider: "gmail",
  mailboxId: "mailbox-1",
  threadId: "thread-1",
  messageId: "message-1",
  subject: "Invoice attached",
  fileName: "invoice.pdf",
  mimeType: "application/pdf",
  sizeBytes: 42_000,
  sourceUrl: "/inbox?provider=gmail&thread=thread-1",
}

function conversation(emailAttachments: DexterEmailAttachment[] = []): DexterConversation {
  return {
    id: "conversation-1",
    title: "Find an attachment",
    summary: "",
    updatedAt: "2026-08-04T00:00:00.000Z",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: "Find the invoice attachment",
        createdAt: "2026-08-04T00:00:00.000Z",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "Found it.",
        createdAt: "2026-08-04T00:00:01.000Z",
        emailAttachments,
      },
    ],
  }
}

test("a streamed email attachment remains on the completed assistant message", () => {
  const completed = retainStreamedEmailAttachments(conversation(), [streamedAttachment])

  assert.deepEqual(completed.messages[1].emailAttachments, [streamedAttachment])
})

test("completed and streamed attachment metadata merge without duplicate widgets", () => {
  const completed = retainStreamedEmailAttachments(
    conversation([{ ...streamedAttachment, fileName: "stale-name.pdf" }]),
    [streamedAttachment],
  )

  assert.deepEqual(completed.messages[1].emailAttachments, [streamedAttachment])
})
