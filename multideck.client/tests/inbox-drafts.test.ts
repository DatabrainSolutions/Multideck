import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import {
  localDraftKey,
  readLocalDraft,
  recordRemoteDraftId,
  saveLocalDraft,
} from "../src/lib/inbox-drafts.ts"

const values = new Map<string, string>()
const sessionStorage = {
  get length() { return values.size },
  clear() { values.clear() },
  getItem(key: string) { return values.get(key) ?? null },
  key(index: number) { return [...values.keys()][index] ?? null },
  removeItem(key: string) { values.delete(key) },
  setItem(key: string, value: string) { values.set(key, value) },
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { sessionStorage },
})

beforeEach(() => sessionStorage.clear())

function draft(pendingSync: boolean, remoteDraftId: string | null = null) {
  const key = localDraftKey("mailbox-1", "thread-1", "reply")
  return {
    key,
    mailboxId: "mailbox-1",
    threadId: "thread-1",
    mode: "reply" as const,
    sourceMessageId: "message-1",
    remoteDraftId,
    subject: "Arrival notice",
    bodyText: "Confirmed.",
    addedTo: [],
    addedCc: [],
    addedBcc: [],
    removedAddresses: [],
    pendingSync,
  }
}

test("local recovery drafts are kept in session storage", () => {
  const saved = saveLocalDraft(draft(true), 10)

  assert.equal(readLocalDraft(saved.key)?.bodyText, "Confirmed.")
  assert.equal(values.has("multideck.inbox.drafts"), true)
})

test("a confirmed remote id survives the caller's stale post-save closure", () => {
  const saved = saveLocalDraft(draft(true), 10)
  recordRemoteDraftId(saved.key, "remote-new")

  saveLocalDraft(draft(false, null), 20)

  assert.equal(readLocalDraft(saved.key)?.remoteDraftId, "remote-new")
  assert.equal(readLocalDraft(saved.key)?.pendingSync, false)
})

test("a confirmed remote id is retained when save finished before the local autosave", () => {
  const unsaved = draft(false, null)
  recordRemoteDraftId(unsaved.key, "remote-first")

  saveLocalDraft(unsaved, 20)

  assert.equal(readLocalDraft(unsaved.key)?.remoteDraftId, "remote-first")
})

test("a replacement remote id survives a stale previous id", () => {
  const saved = saveLocalDraft(draft(true, "remote-old"), 10)
  recordRemoteDraftId(saved.key, "remote-new")

  saveLocalDraft(draft(false, "remote-old"), 20)

  assert.equal(readLocalDraft(saved.key)?.remoteDraftId, "remote-new")
})
