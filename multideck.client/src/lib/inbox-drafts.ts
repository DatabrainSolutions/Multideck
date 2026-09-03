import { workspaceStorageKey } from "./workspace-environment.ts"
import type { ComposerEdits, MailAddress, SendMode } from "@/lib/inbox-api"

/**
 * A reply the operator typed must survive a lost connection, a closed composer,
 * and a reload within the current browser tab. The server owns the durable draft; this
 * session-only recovery copy prevents another sign-in on the same device from
 * inheriting private message content from a previous browser session.
 */

const storageKey = workspaceStorageKey("multideck.inbox.drafts")
const maxLocalDrafts = 40
const confirmedRemoteDraftIds = new Map<string, string>()

export type LocalDraft = {
  key: string
  mailboxId: string
  threadId: string | null
  mode: SendMode
  sourceMessageId: string | null
  remoteDraftId: string | null
  subject: string
  bodyText: string
  trackOpens: boolean
  addedTo: MailAddress[]
  addedCc: MailAddress[]
  addedBcc: MailAddress[]
  removedAddresses: string[]
  /**
   * Names only. A recovery copy that carried file bytes would blow the session
   * storage quota and take the typed words down with it, so the composer names
   * the files it could not bring back and asks for them again.
   */
  attachmentNames: string[]
  savedAt: number
  /** True when the last attempt to save it on the server did not succeed. */
  pendingSync: boolean
}

export function localDraftKey(mailboxId: string, threadId: string | null, mode: SendMode) {
  return `${mailboxId}::${threadId ?? "new"}::${mode}`
}

function readAll(): LocalDraft[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(parsed) ? (parsed as LocalDraft[]).filter((draft) => typeof draft?.key === "string") : []
  } catch {
    return []
  }
}

function writeAll(drafts: LocalDraft[]) {
  if (typeof window === "undefined") return
  try {
    // Newest first, so the cap drops the drafts nobody has touched in a while.
    const trimmed = [...drafts].sort((a, b) => b.savedAt - a.savedAt).slice(0, maxLocalDrafts)
    window.sessionStorage.setItem(storageKey, JSON.stringify(trimmed))
  } catch {
    // A full or blocked storage must never stop the operator from typing.
  }
}

export function readLocalDraft(key: string): LocalDraft | null {
  return readAll().find((draft) => draft.key === key) ?? null
}

export function saveLocalDraft(draft: Omit<LocalDraft, "savedAt">, now = Date.now()) {
  const current = readAll()
  const existing = current.find((candidate) => candidate.key === draft.key)
  // After a successful create/update, the API seam writes the authoritative
  // remote id before React commits its state update. Preserve that id when the
  // caller immediately persists its pre-save closure, otherwise a reload would
  // create a second server draft instead of updating the first.
  const confirmedRemoteDraftId = confirmedRemoteDraftIds.get(draft.key)
  const remoteDraftId = !draft.pendingSync && (confirmedRemoteDraftId || existing?.remoteDraftId)
    ? confirmedRemoteDraftId ?? existing?.remoteDraftId ?? null
    : draft.remoteDraftId
  const next = { ...draft, remoteDraftId, savedAt: now }
  writeAll([next, ...current.filter((candidate) => candidate.key !== draft.key)])
  return next
}

export function recordRemoteDraftId(key: string, remoteDraftId: string) {
  if (!remoteDraftId) return
  confirmedRemoteDraftIds.set(key, remoteDraftId)
  const current = readAll()
  const existing = current.find((draft) => draft.key === key)
  if (!existing) return
  writeAll([
    { ...existing, remoteDraftId, pendingSync: false },
    ...current.filter((draft) => draft.key !== key),
  ])
}

export function clearLocalDraft(key: string) {
  confirmedRemoteDraftIds.delete(key)
  writeAll(readAll().filter((draft) => draft.key !== key))
}

export function listPendingLocalDrafts(): LocalDraft[] {
  return readAll().filter((draft) => draft.pendingSync)
}

export function isEmptyEdits(edits: ComposerEdits) {
  return (
    edits.bodyText.trim() === "" &&
    edits.subject.trim() === "" &&
    edits.addedTo.length === 0 &&
    edits.addedCc.length === 0 &&
    edits.addedBcc.length === 0 &&
    edits.attachments.length === 0
  )
}
