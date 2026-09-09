import {
  authorizeInboxProvider,
  createDraft,
  deleteDraft,
  disconnectInboxConnection,
  getThread,
  getAutomaticReply,
  listInboxConnections,
  listMailboxes,
  listThreads,
  moveThreadToTrash,
  requestThreadSummary,
  sendMail,
  setThreadReadState,
  syncMailbox,
  updateDraft,
  updateAutomaticReply,
  InboxApiError,
  type InboxConnection,
  type AutomaticReplySettings,
  type AutomaticReplyUpdate,
  type InboxDraft,
  type InboxThreadDetail,
  type MailProvider,
  type Mailbox,
  type MailboxSyncResult,
  type SendReceipt,
  type SendRequest,
  type ThreadPage,
  type ThreadQuery,
  type ThreadSummaryState,
} from "@/lib/inbox-api"
import { localDraftKey, recordRemoteDraftId } from "@/lib/inbox-drafts"

/**
 * The Inbox data source is always the authenticated tenant Supabase project.
 * Keeping this small seam makes page tests straightforward without allowing a
 * URL flag to replace a real connected mailbox in the product.
 */

export async function fetchConnections(): Promise<InboxConnection[]> {
  return listInboxConnections()
}

export async function fetchMailboxes(): Promise<Mailbox[]> {
  return listMailboxes()
}

export async function fetchThreads(request: ThreadQuery): Promise<ThreadPage> {
  return listThreads(request)
}

export async function fetchThread(threadId: string): Promise<InboxThreadDetail> {
  return getThread(threadId)
}

export async function patchThreadState(
  threadId: string,
  patch: { isRead?: boolean; isStarred?: boolean; isArchived?: boolean },
): Promise<void> {
  return setThreadReadState(threadId, patch)
}

export async function trashThread(threadId: string): Promise<void> {
  return moveThreadToTrash(threadId)
}

export async function generateThreadSummary(threadId: string): Promise<ThreadSummaryState> {
  return requestThreadSummary(threadId)
}

export async function saveDraft(request: SendRequest, draftId: string | null): Promise<InboxDraft> {
  let draft: InboxDraft
  if (draftId) {
    try {
      draft = await updateDraft(draftId, request)
    } catch (error) {
      // A draft can disappear at the provider or in another tab. Only replace a
      // positively missing draft; every other error stays visible and cannot
      // turn a timeout into a duplicate create.
      if (!(error instanceof InboxApiError && error.code === "not_found")) throw error
      draft = await createDraft({ ...request, draftId: null })
    }
  } else {
    draft = await createDraft(request)
  }

  recordRemoteDraftId(localDraftKey(request.mailboxId, request.threadId, request.mode), draft.id)
  return draft
}

export async function discardDraft(draftId: string): Promise<void> {
  return deleteDraft(draftId)
}

export async function submitSend(request: SendRequest): Promise<SendReceipt> {
  return sendMail(request)
}

export async function startProviderAuthorization(provider: MailProvider): Promise<string> {
  return authorizeInboxProvider(provider)
}

export async function removeConnection(connectionId: string): Promise<void> {
  return disconnectInboxConnection(connectionId)
}

export async function requestMailboxSync(mailboxId: string): Promise<MailboxSyncResult> {
  return syncMailbox(mailboxId)
}

export async function fetchAutomaticReply(mailboxId: string): Promise<AutomaticReplySettings> {
  return getAutomaticReply(mailboxId)
}

export async function saveAutomaticReply(
  mailboxId: string,
  update: AutomaticReplyUpdate,
): Promise<AutomaticReplySettings> {
  return updateAutomaticReply(mailboxId, update)
}
