import { listThreads, loadInboxWorkspace } from "@/lib/inbox-api"
import type { InboxThreadListItem, MailAddress, Mailbox } from "@/lib/inbox-contract"

export type HomeFollowUp = {
  threadId: string
  mailboxId: string
  provider: InboxThreadListItem["provider"]
  /** The person waiting, by the name they sign with where there is one. */
  name: string
  address: string
  subject: string
  /** Milliseconds since their last message landed. */
  waitingFor: number
}

const threadSampleSize = 30

/** The name someone would recognise as theirs, falling back to the local part. */
function readableName(participant: MailAddress) {
  const display = participant.displayName?.trim()
  if (display) return display
  const local = participant.address.split("@")[0] ?? participant.address
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ") || participant.address
}

function firstOutsider(thread: InboxThreadListItem, ownAddresses: Set<string>) {
  return thread.participants.find((participant) => !ownAddresses.has(participant.address.toLocaleLowerCase()))
}

/**
 * People who have written and are still waiting.
 *
 * The thread list does not say who sent last, so an unread thread in the inbox
 * is the honest signal available: their message arrived and nobody in the
 * workspace has opened it. Longest wait first, one entry per person, so a
 * chaser who has sent three emails counts once.
 */
export async function loadHomeFollowUps(limit = 4, signal?: AbortSignal): Promise<HomeFollowUp[]> {
  const workspace = await loadInboxWorkspace()
  const mailbox = pickMailbox(workspace.mailboxes)
  if (!mailbox) return []
  if (signal?.aborted) return []

  const page = await listThreads({ mailboxId: mailbox.id, folder: "inbox", limit: threadSampleSize })
  const ownAddresses = new Set(workspace.mailboxes.map((entry) => entry.address.toLocaleLowerCase()))
  const now = Date.now()
  const byPerson = new Map<string, HomeFollowUp>()

  for (const thread of page.items) {
    if (thread.unreadCount === 0 || thread.archived) continue
    const participant = firstOutsider(thread, ownAddresses)
    if (!participant) continue

    const key = participant.address.toLocaleLowerCase()
    const waitingFor = thread.lastMessageAt ? now - new Date(thread.lastMessageAt).getTime() : 0
    const existing = byPerson.get(key)
    if (existing && existing.waitingFor >= waitingFor) continue

    byPerson.set(key, {
      threadId: thread.id,
      mailboxId: thread.mailboxId,
      provider: thread.provider,
      name: readableName(participant),
      address: participant.address,
      subject: thread.subject.trim(),
      waitingFor: Math.max(0, waitingFor),
    })
  }

  return [...byPerson.values()].sort((a, b) => b.waitingFor - a.waitingFor).slice(0, limit)
}

/** The mailbox the operator actually reads: their own before a shared one. */
function pickMailbox(mailboxes: Mailbox[]) {
  const usable = mailboxes.filter((mailbox) => mailbox.inboundEnabled && (mailbox.status === "connected" || mailbox.status === "syncing"))
  return usable.find((mailbox) => mailbox.isDefault)
    ?? usable.find((mailbox) => mailbox.kind === "personal")
    ?? usable[0]
    ?? null
}
