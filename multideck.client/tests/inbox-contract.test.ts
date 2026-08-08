import assert from "node:assert/strict"
import test from "node:test"
import {
  InboxApiError,
  applyThreadPatch,
  buildReplyRequest,
  attachmentLimits,
  attachmentRejection,
  buildSendPayload,
  composerEdits,
  emptyComposerState,
  dedupeThreads,
  mergeThreadPage,
  isInboxNotFound,
  normalizeThreadDetail,
  normalizeThreadListItem,
  normalizeThreadPage,
  normalizeConnection,
  normalizeMailbox,
  normalizeMailboxFolder,
  normalizeProviderAvailability,
  readEmailConnectionResult,
  readInboxThreadDeepLink,
  parseAddressInput,
  resolveDefaultInboxProvider,
  resolveDefaultOutboundMailbox,
  resolveMailboxForProvider,
  resolveSelectionForMailbox,
  threadCacheKey,
  type ComposerEdits,
  type ComposerState,
  type InboxThreadListItem,
  type Mailbox,
  type OutboundAttachment,
  type SendMode,
} from "../src/lib/inbox-contract.ts"
import { isEmptyEdits } from "../src/lib/inbox-drafts.ts"
import { labelColourContrast, mailboxLabelTone } from "../src/lib/mailbox-label-colour.ts"

test("Outlook shared access is exposed as a boolean without leaking OAuth scopes", () => {
  const elevated = normalizeConnection({
    id: "outlook-1",
    provider: "outlook",
    sharedMailboxAccess: true,
    status: "active",
  })
  const personal = normalizeConnection({ id: "outlook-2", provider: "outlook", status: "active" })

  assert.equal(elevated.sharedMailboxAccess, true)
  assert.equal(personal.sharedMailboxAccess, false)
  assert.equal("oauthScopes" in elevated, false)
})

test("provider folders expose only bounded display metadata and a local hierarchy", () => {
  const folder = normalizeMailboxFolder({
    id: "4c8ab61f-5965-4ee5-bdd5-6ac789b86bd6",
    mailboxId: "mailbox-1",
    parentId: "f3848c35-eac4-4a73-89aa-0fd15cde7517",
    role: "custom",
    displayName: "Priority freight",
    unreadCount: 7,
    totalCount: 14,
    backgroundColor: "#AABBCC",
    textColor: "javascript:bad",
    kind: "user",
    providerFolderId: "must-not-cross-the-wire",
  })

  assert.equal(folder.displayName, "Priority freight")
  assert.equal(folder.unreadCount, 7)
  assert.equal(folder.backgroundColor, "#AABBCC")
  assert.equal(folder.textColor, null)
  assert.equal("providerFolderId" in folder, false)
})

test("Gmail labels keep an opaque accessible colour independent of the app theme", () => {
  const providerTone = mailboxLabelTone({
    displayName: "Priority freight",
    backgroundColor: "#FFF475",
    textColor: "#FFFFFF",
  })
  const fallbackTone = mailboxLabelTone({
    displayName: "Client approvals",
    backgroundColor: null,
    textColor: null,
  })

  assert.equal(providerTone.backgroundColor, "#FFF475")
  assert.equal(providerTone.foregroundColor, "#17211F")
  assert.deepEqual(
    mailboxLabelTone({ displayName: "Client approvals", backgroundColor: null, textColor: null }),
    fallbackTone,
  )
  assert.match(fallbackTone.backgroundColor, /^#[0-9A-F]{6}$/)
  assert.ok(labelColourContrast(providerTone.foregroundColor, providerTone.backgroundColor) >= 4.5)
  assert.ok(labelColourContrast(fallbackTone.foregroundColor, fallbackTone.backgroundColor) >= 4.5)
})

test("new composers track opens by default and keep an explicit opt-out", () => {
  const composer = emptyComposerState("new", "open")
  assert.equal(composer.trackOpens, true)
  assert.equal(composerEdits({ ...composer, trackOpens: false }).trackOpens, false)
})

test("outbound delivery evidence is normalised without adding it to inbound mail", () => {
  const detail = normalizeThreadDetail({
    id: "thread-1",
    messages: [
      {
        id: "outbound-1",
        direction: "outbound",
        sentAt: "2026-08-03T14:42:00.000Z",
        delivery: {
          status: "opened_estimated",
          sentAt: "2026-08-03T14:42:00.000Z",
          openedAt: "2026-08-03T14:48:00.000Z",
          openTrackingEnabled: true,
          confidence: "estimated",
        },
      },
      {
        id: "inbound-1",
        direction: "inbound",
        receivedAt: "2026-08-03T15:00:00.000Z",
        delivery: { status: "delivered" },
      },
    ],
  }, "thread-1")

  assert.deepEqual(detail.messages[0].delivery, {
    status: "opened_estimated",
    sentAt: "2026-08-03T14:42:00.000Z",
    deliveredAt: null,
    openedAt: "2026-08-03T14:48:00.000Z",
    repliedAt: null,
    failedAt: null,
    bouncedAt: null,
    openTrackingEnabled: true,
    confidence: "estimated",
  })
  assert.equal(detail.messages[1].delivery, undefined)
})

test("server-issued Inbox citations restore their provider, mailbox and thread", () => {
  assert.deepEqual(
    readInboxThreadDeepLink(
      "?provider=gmail&mailbox=931169d1-3a01-4c57-ac36-290a559d21bc&thread=45b92d1f-4d13-4d79-80c1-4cb338c5d2de",
    ),
    {
      provider: "gmail",
      mailboxId: "931169d1-3a01-4c57-ac36-290a559d21bc",
      threadId: "45b92d1f-4d13-4d79-80c1-4cb338c5d2de",
    },
  )
})

test("Inbox deep links reject malformed or incomplete identifiers", () => {
  assert.equal(readInboxThreadDeepLink("?provider=gmail&mailbox=mailbox-a&thread=thread-a"), null)
  assert.equal(readInboxThreadDeepLink("?provider=imap&mailbox=931169d1-3a01-4c57-ac36-290a559d21bc&thread=45b92d1f-4d13-4d79-80c1-4cb338c5d2de"), null)
  assert.equal(readInboxThreadDeepLink("?provider=gmail&mailbox=931169d1-3a01-4c57-ac36-290a559d21bc"), null)
})

function composerState(mode: SendMode): ComposerState {
  return {
    mode,
    threadId: mode === "new" ? null : "t1",
    sourceMessageId: mode === "new" ? null : "m9",
    subject: "Revised ETA",
    bodyText: "Confirmed.",
    to: [],
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    attachments: [],
    trackOpens: true,
    presentation: "open",
  }
}

function thread(id: string, overrides: Partial<InboxThreadListItem> = {}): InboxThreadListItem {
  return {
    id,
    mailboxId: "mbx-a",
    provider: "gmail",
    subject: `Subject ${id}`,
    preview: "",
    participants: [],
    lastMessageAt: null,
    unreadCount: 0,
    messageCount: 1,
    hasAttachments: false,
    starred: false,
    archived: false,
    summary: { status: "none", text: null, keyPoints: [], sourceMessageIds: [], model: null, updatedAt: null, error: null },
    ...overrides,
  }
}

function mailbox(id: string, overrides: Partial<Mailbox> = {}): Mailbox {
  return {
    id,
    connectionId: "conn-a",
    provider: "gmail",
    kind: "personal",
    displayName: id,
    address: `${id}@example.com`,
    unreadCount: 0,
    isDefault: false,
    inboundEnabled: true,
    outboundEnabled: true,
    status: "connected",
    lastSyncedAt: null,
    indexStatus: "pending",
    indexedCount: 0,
    estimatedTotal: null,
    indexPercent: 0,
    coreCoverageStart: "2025-01-01T00:00:00.000Z",
    wasteCoverageStart: "2025-12-02T00:00:00.000Z",
    coreRetentionMonths: 12,
    wasteRetentionDays: 30,
    error: null,
    ...overrides,
  }
}

test("mailbox indexing progress is bounded and ready mailboxes resolve to 100%", () => {
  const indexing = normalizeMailbox({
    id: "mbx-indexing",
    indexStatus: "indexing",
    indexedCount: 425,
    estimatedTotal: 2_000,
    indexPercent: 21,
  })
  const ready = normalizeMailbox({
    id: "mbx-ready",
    indexStatus: "ready",
    indexedCount: 2_005,
    estimatedTotal: 2_000,
    indexPercent: 99,
  })

  assert.equal(indexing.indexPercent, 21)
  assert.equal(indexing.indexedCount, 425)
  assert.equal(ready.indexPercent, 100)
})

const edits: ComposerEdits = {
  subject: "Revised ETA",
  bodyText: "Confirmed, the licence reference is attached.",
  addedTo: [{ address: "new.person@example.com", displayName: null }],
  addedCc: [],
  addedBcc: [],
  removedAddresses: [],
  attachments: [],
  trackOpens: true,
}

/* ----------------------------------------------------------------- pagination */

test("a cursor response reports the next cursor as sent", () => {
  const page = normalizeThreadPage({ items: [{ id: "t1" }, { id: "t2" }], nextCursor: "c2", hasMore: true }, 25)

  assert.equal(page.items.length, 2)
  assert.equal(page.nextCursor, "c2")
  assert.equal(page.hasMore, true)
})

test("a page-numbered response becomes the cursor the client sends back", () => {
  const page = normalizeThreadPage({ items: [{ id: "t1" }], page: 1, pageSize: 25, hasMore: true }, 25)

  assert.equal(page.nextCursor, "2")
  assert.equal(page.hasMore, true)
})

test("the last page reports no cursor and no more pages", () => {
  const explicit = normalizeThreadPage({ items: [{ id: "t1" }], page: 3, hasMore: false }, 25)
  assert.equal(explicit.nextCursor, null)
  assert.equal(explicit.hasMore, false)

  // Without a hasMore flag, a short page is the last one.
  const short = normalizeThreadPage({ items: [{ id: "t1" }, { id: "t2" }] }, 25)
  assert.equal(short.hasMore, false)
  assert.equal(short.nextCursor, null)
})

test("hasMore without a usable cursor does not offer another page", () => {
  // Claiming more pages while giving nothing to ask with would leave the Load
  // older button permanently refetching page one.
  const page = normalizeThreadPage({ items: [{ id: "t1" }], hasMore: true }, 25)

  assert.equal(page.nextCursor, null)
  assert.equal(page.hasMore, false)
})

test("appending a page keeps earlier rows and their order", () => {
  const first = mergeThreadPage(undefined, { items: [thread("t1"), thread("t2")], nextCursor: "c2", hasMore: true }, false)
  const second = mergeThreadPage(first, { items: [thread("t3")], nextCursor: null, hasMore: false }, true)

  assert.deepEqual(second.items.map((item) => item.id), ["t1", "t2", "t3"])
  assert.equal(second.hasMore, false)
  assert.equal(second.nextCursor, null)
})

test("a thread that shifted between pages appears once, with the fresher copy", () => {
  const first = mergeThreadPage(undefined, { items: [thread("t1"), thread("t2", { unreadCount: 0 })], nextCursor: "c2", hasMore: true }, false)
  const second = mergeThreadPage(first, { items: [thread("t2", { unreadCount: 3 }), thread("t3")], nextCursor: null, hasMore: false }, true)

  assert.deepEqual(second.items.map((item) => item.id), ["t1", "t2", "t3"])
  assert.equal(second.items.find((item) => item.id === "t2")?.unreadCount, 3)
})

test("reloading without appending replaces the list instead of growing it", () => {
  const first = mergeThreadPage(undefined, { items: [thread("t1"), thread("t2")], nextCursor: "c2", hasMore: true }, false)
  const refreshed = mergeThreadPage(first, { items: [thread("t9")], nextCursor: null, hasMore: false }, false)

  assert.deepEqual(refreshed.items.map((item) => item.id), ["t9"])
})

test("rows without an id are dropped rather than colliding", () => {
  assert.deepEqual(dedupeThreads([thread("t1"), thread(""), thread("t2")]).map((item) => item.id), ["t1", "t2"])
})

/* ---------------------------------------------------------------------- cache */

test("the cache key separates mailbox, folder and query", () => {
  assert.notEqual(threadCacheKey("mbx-a", "inbox", ""), threadCacheKey("mbx-b", "inbox", ""))
  assert.notEqual(threadCacheKey("mbx-a", "inbox", ""), threadCacheKey("mbx-a", "archive", ""))
  assert.notEqual(threadCacheKey("mbx-a", "inbox", ""), threadCacheKey("mbx-a", "inbox", "customs"))
  assert.notEqual(threadCacheKey("mbx-a", "inbox", "", "folder-a"), threadCacheKey("mbx-a", "inbox", "", "folder-b"))
})

test("the cache key ignores query casing and padding, so one search hits one entry", () => {
  assert.equal(threadCacheKey("mbx-a", "inbox", "  Customs  "), threadCacheKey("mbx-a", "inbox", "customs"))
})

test("patching a thread returns the same entry when the thread is not in it", () => {
  const entry = { items: [thread("t1")], nextCursor: null, hasMore: false }

  assert.equal(applyThreadPatch(entry, "t-missing", { starred: true }), entry)
  assert.notEqual(applyThreadPatch(entry, "t1", { starred: true }), entry)
  assert.equal(applyThreadPatch(entry, "t1", { starred: true })?.items[0].starred, true)
})

/* ---------------------------------------------------- provider and selection */

test("switching provider prefers the default personal mailbox", () => {
  const mailboxes = [
    mailbox("gmail-shared", { kind: "shared" }),
    mailbox("outlook-shared", { provider: "outlook", kind: "shared" }),
    mailbox("outlook-personal", { provider: "outlook", isDefault: true }),
  ]

  assert.equal(resolveMailboxForProvider(mailboxes, "outlook", null)?.id, "outlook-personal")
})

test("switching back to a provider returns to the mailbox that was open there", () => {
  const mailboxes = [
    mailbox("gmail-personal", { isDefault: true }),
    mailbox("gmail-ops", { kind: "shared" }),
  ]

  assert.equal(resolveMailboxForProvider(mailboxes, "gmail", "gmail-ops")?.id, "gmail-ops")
})

test("a provider with no mailbox resolves to nothing rather than another provider's", () => {
  assert.equal(resolveMailboxForProvider([mailbox("gmail-personal")], "outlook", null), null)
})

test("the saved provider opens first while an explicit Inbox link still wins", () => {
  const mailboxes = [
    mailbox("gmail-personal", { isDefault: true }),
    mailbox("outlook-personal", { provider: "outlook" }),
  ]

  assert.equal(resolveDefaultInboxProvider(mailboxes, "outlook"), "outlook")
  assert.equal(resolveDefaultInboxProvider(mailboxes, "outlook", "gmail"), "gmail")
})

test("a stale provider preference falls back to an accessible mailbox", () => {
  const mailboxes = [mailbox("gmail-personal", { isDefault: true })]
  assert.equal(resolveDefaultInboxProvider(mailboxes, "outlook"), "gmail")
})

test("new composers prefer a send-capable mailbox from the saved provider", () => {
  const mailboxes = [
    mailbox("gmail-personal", { isDefault: true }),
    mailbox("outlook-read-only", { provider: "outlook", outboundEnabled: false }),
    mailbox("outlook-personal", { provider: "outlook" }),
  ]

  assert.equal(resolveDefaultOutboundMailbox(mailboxes, "outlook")?.id, "outlook-personal")
  assert.equal(resolveDefaultOutboundMailbox(mailboxes, "outlook", "gmail-personal")?.id, "gmail-personal")
})

test("a selection survives a switch back to its own mailbox", () => {
  assert.equal(resolveSelectionForMailbox("t1", "mbx-a", "mbx-a"), "t1")
})

test("a selection is dropped when the new mailbox cannot contain it", () => {
  assert.equal(resolveSelectionForMailbox("t1", "mbx-a", "mbx-b"), null)
  assert.equal(resolveSelectionForMailbox("t1", null, "mbx-a"), null)
  assert.equal(resolveSelectionForMailbox(null, "mbx-a", "mbx-a"), null)
})

/* -------------------------------------------------------- reply-mode payloads */

test("reply and reply all differ only by mode, never by recipients", () => {
  const shared = { mailboxId: "mbx-a", threadId: "t1", sourceMessageId: "m9", edits, idempotencyKey: "key-1" }
  const reply = buildReplyRequest({ ...shared, mode: "reply" })
  const replyAll = buildReplyRequest({ ...shared, mode: "reply_all" })

  assert.equal(reply.mode, "reply")
  assert.equal(replyAll.mode, "reply_all")
  assert.deepEqual({ ...reply, mode: null }, { ...replyAll, mode: null })
})

test("a reply payload carries no computed recipient list", () => {
  const payload = buildSendPayload(
    buildReplyRequest({
      mode: "reply_all",
      mailboxId: "mbx-a",
      threadId: "t1",
      sourceMessageId: "m9",
      edits,
      idempotencyKey: "key-1",
    }),
  )

  // Only the operator's own additions travel. `to`, `cc` and `bcc` do not exist
  // on the wire, so the server is the only place the audience is decided.
  assert.deepEqual(Object.keys(payload).sort(), [
    "addedBcc",
    "addedCc",
    "addedTo",
    "attachments",
    "bodyText",
    "draftId",
    "mailboxId",
    "mode",
    "removedAddresses",
    "sourceMessageId",
    "subject",
    "threadId",
    "trackOpens",
  ])
  assert.equal("to" in payload, false)
  assert.equal("cc" in payload, false)
  assert.equal("recipients" in payload, false)
  assert.equal(payload.sourceMessageId, "m9")
  assert.equal(payload.trackOpens, true)
})

test("replies put hand-typed additions on cc; new messages and forwards put them on to", () => {
  const extra = { address: "extra@example.com", displayName: null }
  const typed = { ...composerState("reply_all"), cc: [extra] }

  assert.deepEqual(composerEdits(typed).addedTo, [])
  assert.deepEqual(composerEdits(typed).addedCc, [extra])

  const fresh = { ...composerState("new"), to: [extra] }
  assert.deepEqual(composerEdits(fresh).addedTo, [extra])
  assert.deepEqual(composerEdits(fresh).addedCc, [])

  const forwardTo = { address: "forward.to@example.com", displayName: null }
  const forwarded = { ...composerState("forward"), to: [forwardTo] }
  assert.deepEqual(composerEdits(forwarded).addedTo, [forwardTo])
  assert.deepEqual(composerEdits(forwarded).addedCc, [])
})

test("composer edits never carry a removal the operator did not make", () => {
  // Nothing in the UI can remove a thread participant, so this list stays empty
  // and the server's resolved audience is never narrowed from the browser.
  assert.deepEqual(composerEdits({
    ...composerState("reply_all"),
    cc: [{ address: "a@b.com", displayName: null }],
  }).removedAddresses, [])
})

test("recipient input accepts separators, display names and rejects non-addresses", () => {
  assert.deepEqual(
    parseAddressInput('Claire Osei <claire@marlow.example>, ops@northwind.example; not-an-address\n"A B" <a@b.example>'),
    [
      { address: "claire@marlow.example", displayName: "Claire Osei" },
      { address: "ops@northwind.example", displayName: null },
      { address: "a@b.example", displayName: "A B" },
    ],
  )
})

test("a repeated address is only sent once", () => {
  assert.deepEqual(
    parseAddressInput("ops@northwind.example, OPS@northwind.example").map((entry) => entry.address),
    ["ops@northwind.example"],
  )
})

test("reply and reply all leave the subject to the server; new and forward set it", () => {
  const base = { mailboxId: "mbx-a", threadId: "t1", sourceMessageId: "m9", edits, idempotencyKey: "key-1" }

  assert.equal(buildReplyRequest({ ...base, mode: "reply" }).subject, null)
  assert.equal(buildReplyRequest({ ...base, mode: "reply_all" }).subject, null)
  assert.equal(buildReplyRequest({ ...base, mode: "forward" }).subject, "Revised ETA")
  assert.equal(buildReplyRequest({ ...base, mode: "new" }).subject, "Revised ETA")
})

test("a new message has no source message and no thread", () => {
  const request = buildReplyRequest({
    mode: "new",
    mailboxId: "mbx-a",
    threadId: "t1",
    sourceMessageId: "m9",
    edits,
    idempotencyKey: "key-1",
  })

  assert.equal(request.sourceMessageId, null)
  assert.equal(request.threadId, null)
})

test("a response mode without a source message refuses to build", () => {
  for (const mode of ["reply", "reply_all", "forward"] as const) {
    assert.throws(
      () => buildReplyRequest({ mode, mailboxId: "mbx-a", threadId: "t1", sourceMessageId: null, edits, idempotencyKey: "k" }),
      /Select the message to respond to/,
    )
  }
})

test("only a not-found Inbox response means a discard is already complete", () => {
  assert.equal(isInboxNotFound(new InboxApiError("Gone", { status: 404, code: "not_found" })), true)
  assert.equal(isInboxNotFound(new InboxApiError("Offline", { code: "offline" })), false)
  assert.equal(isInboxNotFound(new Error("Other failure")), false)
})

test("the idempotency key travels with the request", () => {
  assert.equal(
    buildReplyRequest({
      mode: "reply",
      mailboxId: "mbx-a",
      threadId: "t1",
      sourceMessageId: "m9",
      edits,
      idempotencyKey: "key-abc",
    }).idempotencyKey,
    "key-abc",
  )
})

/* ------------------------------------------------------------- wire tolerance */

test("a boolean read flag and a numeric unread count both read as unread", () => {
  assert.equal(normalizeThreadListItem({ id: "t1", isRead: false }).unreadCount, 1)
  assert.equal(normalizeThreadListItem({ id: "t1", isRead: true }).unreadCount, 0)
  assert.equal(normalizeThreadListItem({ id: "t1", unreadCount: 4 }).unreadCount, 4)
})

test("provider availability is fail-closed when configured is absent", () => {
  assert.deepEqual(normalizeProviderAvailability({ provider: "google", configured: true }), {
    provider: "gmail",
    configured: true,
    adminConsentUrl: null,
  })
  assert.deepEqual(normalizeProviderAvailability({ provider: "outlook" }), {
    provider: "outlook",
    configured: false,
    adminConsentUrl: null,
  })
})

test("provider availability accepts only Microsoft's HTTPS admin-consent URL", () => {
  assert.equal(normalizeProviderAvailability({
    provider: "outlook",
    configured: true,
    adminConsentUrl: "https://login.microsoftonline.com/organizations/adminconsent?client_id=public-id",
  }).adminConsentUrl, "https://login.microsoftonline.com/organizations/adminconsent?client_id=public-id")
  assert.equal(normalizeProviderAvailability({
    provider: "outlook",
    configured: true,
    adminConsentUrl: "https://attacker.example/adminconsent",
  }).adminConsentUrl, null)
})

test("email connection callbacks expose only bounded provider status", () => {
  assert.deepEqual(readEmailConnectionResult(
    "?email_connection=outlook&status=error&code=provider_admin_consent_required",
  ), {
    provider: "outlook",
    status: "error",
    code: "provider_admin_consent_required",
  })
  assert.equal(readEmailConnectionResult("?email_connection=unknown&status=error"), null)
  assert.deepEqual(readEmailConnectionResult("?email_connection=gmail&status=error&code=%3Cscript%3E"), {
    provider: "gmail",
    status: "error",
    code: null,
  })
})

test("sanitised html is read from the server's field and never invented", () => {
  const detail = normalizeThreadDetail(
    {
      id: "t1",
      subject: "Customs hold",
      messages: [{ id: "m1", direction: "inbound", safeBodyHtml: "<p>Sanitised</p>", bodyText: "Sanitised" }],
    },
    "t1",
  )

  assert.equal(detail.messages[0].sanitizedHtml, "<p>Sanitised</p>")
  assert.equal(normalizeThreadDetail({ id: "t1", messages: [{ id: "m1" }] }, "t1").messages[0].sanitizedHtml, null)
})

test("a thread detail keeps the requested id when the response omits it", () => {
  const detail = normalizeThreadDetail({ subject: "No id", messages: [] }, "t-requested")

  assert.equal(detail.id, "t-requested")
})

test("a summary given as bare prose is treated as ready", () => {
  const item = normalizeThreadListItem({ id: "t1", lunaSummary: "One open question remains." })

  assert.equal(item.summary.status, "ready")
  assert.equal(item.summary.text, "One open question remains.")
})

test("an absent summary is none rather than a silently empty ready state", () => {
  assert.equal(normalizeThreadListItem({ id: "t1" }).summary.status, "none")
  assert.equal(normalizeThreadListItem({ id: "t1", summary: { status: "generating" } }).summary.status, "pending")
  assert.equal(normalizeThreadListItem({ id: "t1", summary: { status: "outdated", summary: "old" } }).summary.status, "stale")
})

test("a read-only shared mailbox is reported as read-only", () => {
  assert.equal(normalizeThreadDetail({ id: "t1", isReadOnly: true, messages: [] }, "t1").readOnly, true)
  assert.equal(normalizeThreadDetail({ id: "t1", messages: [] }, "t1").readOnly, false)
})

/* ---------------------------------------------------------------- attachments */

function outbound(fileName: string, sizeBytes: number): OutboundAttachment {
  return { id: fileName, fileName, mimeType: "application/pdf", sizeBytes, contentBase64: "AA==" }
}

test("attachments travel with a send and are refused past their limits", () => {
  const file = outbound("licence.pdf", 2048)
  const payload = buildSendPayload(
    buildReplyRequest({
      mode: "forward",
      mailboxId: "mbx-a",
      threadId: "t1",
      sourceMessageId: "m9",
      edits: { ...edits, attachments: [file] },
      idempotencyKey: "key-2",
    }),
  )

  assert.deepEqual(payload.attachments, [
    { fileName: "licence.pdf", mimeType: "application/pdf", sizeBytes: 2048, contentBase64: "AA==" },
  ])

  // The composer refuses the same file twice, an oversized file, and anything
  // past the count or the combined size, naming which limit was reached.
  assert.equal(attachmentRejection({ name: "licence.pdf", size: 2048 }, [file]), "duplicate")
  assert.equal(attachmentRejection({ name: "big.pdf", size: attachmentLimits.maxFileBytes + 1 }, []), "file_too_large")
  assert.equal(
    attachmentRejection(
      { name: "next.pdf", size: attachmentLimits.maxFileBytes },
      [outbound("first.pdf", attachmentLimits.maxTotalBytes - 1)],
    ),
    "total_too_large",
  )
  assert.equal(
    attachmentRejection(
      { name: "one-too-many.pdf", size: 1 },
      Array.from({ length: attachmentLimits.maxCount }, (_unused, index) => outbound(`f${index}.pdf`, 1)),
    ),
    "count",
  )
  assert.equal(attachmentRejection({ name: "fine.pdf", size: 4096 }, [file]), null)
})

test("a message that is only an attachment still counts as a draft worth keeping", () => {
  assert.equal(isEmptyEdits({ ...edits, subject: "", bodyText: "", addedTo: [], attachments: [] }), true)
  assert.equal(
    isEmptyEdits({ ...edits, subject: "", bodyText: "", addedTo: [], attachments: [outbound("licence.pdf", 2048)] }),
    false,
  )
})
