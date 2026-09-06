import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/lib/inbox-api.ts", import.meta.url), "utf8")
const inboxPageSource = await readFile(new URL("../src/pages/inbox-page.tsx", import.meta.url), "utf8")
const settingsPageSource = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const inboxWorkspaceSource = await readFile(new URL("../src/lib/inbox-workspace.tsx", import.meta.url), "utf8")
const appSidebarSource = await readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const threadSummarySource = await readFile(new URL("../src/components/multideck/thread-summary.tsx", import.meta.url), "utf8")
const emailRendererSource = await readFile(new URL("../src/components/multideck/email-message-renderer.tsx", import.meta.url), "utf8")
const globalStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
const appShellSource = await readFile(new URL("../src/components/multideck/app-shell.tsx", import.meta.url), "utf8")
const threadRowSource = await readFile(new URL("../src/components/multideck/inbox-thread-row.tsx", import.meta.url), "utf8")

test("Inbox uses the tenant Supabase Edge Function, never the .NET API", () => {
  assert.match(source, /supabaseFunctionsUrl/)
  assert.match(source, /inboxFunctionName = "inbox-api"/)
  assert.doesNotMatch(source, /from "@\/lib\/api"/)
  assert.doesNotMatch(source, /apiFetch/)
  assert.doesNotMatch(source, /localhost:5273/)
  assert.doesNotMatch(source, /\/api\/v1/)
})

test("every Inbox Edge request carries the current tenant identity", () => {
  assert.match(source, /Authorization", `Bearer \$\{accessToken\}`/)
  assert.match(source, /result\.set\("apikey", supabasePublicApiKey\)/)
  assert.match(source, /response\.status === 401 && allowSessionRefresh/)
  assert.match(source, /inboxAccessToken\(true\)/)
})

test("Inbox navigation warms only bounded rows and conversation intent prefetches detail", () => {
  assert.match(source, /inboxRequest\("\/workspace"/)
  assert.match(appShellSource, /InboxWorkspaceProvider cacheScope=\{currentUser\?\.id \?\? null\}/)
  assert.match(inboxWorkspaceSource, /threadPageRequestsRef/)
  assert.match(inboxWorkspaceSource, /threadDetailRequestsRef/)
  assert.match(inboxWorkspaceSource, /threadDetailCacheTtlMs = 60_000/)
  assert.doesNotMatch(inboxWorkspaceSource, /page\.items\.slice\(0, 3\)/)
  assert.match(inboxWorkspaceSource, /Warm only the first visible list page/)
  assert.match(inboxWorkspaceSource, /fetchOlderThreadMessages/)
  assert.match(inboxWorkspaceSource, /void prefetchThreadInlineAttachmentBlobUrls\(detail\)/)
  assert.match(threadRowSource, /onPointerEnter=\{onPrefetch\}/)
  assert.match(threadRowSource, /onFocus=\{onPrefetch\}/)
  assert.match(inboxPageSource, /onPrefetch=\{\(\) => prefetchThreadDetail\(item\.id\)\}/)
  assert.match(inboxPageSource, /selectedThreadPreview/)
  assert.match(inboxPageSource, /Loading the full conversation/)
})

test("the selected conversation refreshes per-message tracking evidence while visible", () => {
  assert.match(inboxPageSource, /trackingStatusRefreshIntervalMs = 15_000/)
  assert.match(inboxPageSource, /fetchThreadDetail\(targetThreadId, true\)/)
  assert.match(inboxPageSource, /document\.visibilityState === "hidden"/)
  assert.match(inboxPageSource, /current\?\.id === targetThreadId \? refreshed : current/)
})

test("provider folders stay mailbox-scoped from workspace bootstrap through thread paging", () => {
  assert.match(source, /folders: readList\(pickField\(record, "folders"\)\)/)
  assert.match(source, /if \(folderId\) params\.set\("folderId", folderId\)/)
  assert.match(inboxWorkspaceSource, /folders\.some\(\(folder\) => folder\.id === folderId && folder\.mailboxId === nextMailbox\?\.id\)/)
  assert.match(inboxWorkspaceSource, /writeSelection\(mailbox\.provider, mailbox\.id, nextView, nextFolder\.id\)/)
  assert.match(appSidebarSource, /folder\.role === "custom"/)
  assert.match(appSidebarSource, /paddingInlineStart/)
  assert.match(appSidebarSource, /layoutId=\{activeFolderLayoutId\}/)
  assert.match(appSidebarSource, /reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.panel\)/)
})

test("send keeps its idempotency key in both the Edge header and payload", () => {
  assert.match(source, /"Idempotency-Key": request\.idempotencyKey/)
  assert.match(source, /idempotencyKey: request\.idempotencyKey/)
})

test("provider drafts use the same authenticated idempotent Inbox transport", () => {
  assert.match(source, /export async function createProviderDraft/)
  assert.match(source, /inboxRequest\("\/provider-drafts"/)
  assert.match(source, /"Idempotency-Key": request\.idempotencyKey/)
})

test("attachments are fetched from the same authenticated Edge transport", () => {
  assert.match(source, /fetchInboxEdge\(`\/attachments\/\$\{encodeURIComponent\(attachmentId\)\}\$\{inline/)
  assert.match(source, /URL\.createObjectURL\(await response\.blob\(\)\)/)
  assert.match(source, /getInlineAttachmentBlobUrl/)
  assert.match(source, /getCachedInlineAttachmentBlobUrl/)
  assert.match(source, /inlineAttachmentCacheLimit = 96/)
  assert.match(source, /prefetchThreadInlineAttachmentBlobUrls/)
  assert.match(source, /detail\.messages\.at\(-1\)\?\.attachments/)
  assert.match(source, /\?disposition=inline/)
})

test("shared Outlook access is explicit and the mailbox is added through the Edge transport", () => {
  assert.match(source, /accessMode: "personal" \| "shared"/)
  assert.match(source, /connections\/\$\{encodeURIComponent\(connectionId\)\}\/shared-mailboxes/)
  assert.match(settingsPageSource, /authorizeInboxProvider\(\s*"outlook",\s*"shared"/)
  assert.match(settingsPageSource, /addOutlookSharedMailbox\(connection\.id, sharedMailboxAddress\)/)
  assert.match(appSidebarSource, /sharedMailboxes\.map\(\(mailbox\)/)
})

test("Google Group inboxes are configured through the Edge transport and open as shared views", () => {
  assert.match(source, /connections\/\$\{encodeURIComponent\(connectionId\)\}\/group-mailboxes/)
  assert.match(settingsPageSource, /addGmailGroupMailbox\(connection\.id, groupMailboxAddress\)/)
  assert.match(settingsPageSource, /void syncMailbox\(mailbox\.id\)\.catch/)
  assert.doesNotMatch(settingsPageSource, /await syncMailbox\(mailbox\.id\)/)
  assert.match(settingsPageSource, /provider=gmail&view=shared&mailbox=/)
  assert.match(settingsPageSource, /read-only as the group address/)
})

test("new shared and group mailboxes do not lock Settings during their first multi-page import", () => {
  assert.equal((settingsPageSource.match(/void syncMailbox\(mailbox\.id\)\.catch/g) ?? []).length, 2)
  assert.match(settingsPageSource, /The shared mailbox was added, but its first sync could not finish/)
  assert.match(settingsPageSource, /The Google Group inbox was added, but its first sync could not finish/)
})

test("Dexter summaries are explicitly requested and use the dimmed shader surface", () => {
  assert.match(inboxPageSource, /label=\{t\("Summarise"\)\}/)
  assert.match(inboxPageSource, /summaryVisibleThreadId === thread\.id/)
  assert.match(inboxPageSource, /\["none", "stale", "failed"\]\.includes\(target\.summary\.status\)/)
  assert.doesNotMatch(inboxPageSource, /setTimeout\(\(\) => void requestSummary/)
  assert.match(threadSummarySource, /t\("Dexter summary"\)/)
  assert.match(threadSummarySource, /SpectralBloomShader shape="composer"/)
  assert.doesNotMatch(threadSummarySource, /Luna summary/)
})

test("rendered email images load automatically without weakening the frame sandbox", () => {
  assert.match(emailRendererSource, /"img-src data: blob: https:"/)
  assert.match(emailRendererSource, /sandbox=\{sandboxPermissions\}/)
  assert.match(emailRendererSource, /<meta name="referrer" content="no-referrer"/)
  assert.match(emailRendererSource, /loading="eager"/)
  assert.match(emailRendererSource, /<img\\b\[\^>\]\*>/)
  assert.match(emailRendererSource, /fetchpriority="high"/)
  assert.match(emailRendererSource, /replace\(\/\\s\+loading/)
  assert.match(emailRendererSource, /image\.src = resolved/)
  assert.match(emailRendererSource, /getInlineAttachmentBlobUrl/)
  assert.match(emailRendererSource, /getCachedInlineAttachmentBlobUrl/)
  assert.match(emailRendererSource, /useLayoutEffect/)
  assert.match(emailRendererSource, /filter: invert\(1\) hue-rotate\(180deg\)/)
  assert.match(emailRendererSource, /img, picture, video \{ filter: invert\(1\) hue-rotate\(180deg\)/)
  assert.doesNotMatch(emailRendererSource, /Images are blocked/)
  assert.doesNotMatch(emailRendererSource, /Load images/)
  assert.doesNotMatch(emailRendererSource, /dangerouslySetInnerHTML\s*=/)
})

test("Inbox Summarise hover uses the slower motion rhythm and still respects reduced motion", () => {
  assert.match(globalStyles, /\.md-inbox-summarise \{[\s\S]*?transition-duration: 360ms;/)
  assert.match(globalStyles, /\.md-inbox-summarise \{[\s\S]*?transition-property: transform, box-shadow;/)
  assert.match(globalStyles, /\.md-inbox-summarise \.md-dexter-pill__shader,[\s\S]*?transition-duration: 360ms;/)
  assert.match(globalStyles, /\.md-inbox-summarise \.md-dexter-pill__slot-glyph \{[\s\S]*?transition-duration: 360ms;/)
  assert.match(globalStyles, /transition-delay: calc\(var\(--md-dexter-character-index\) \* 20ms\)/)
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.md-inbox-summarise[\s\S]*?transition-duration: 0\.01ms !important;/)
})

test("Gmail and Outlook expose live spam and deleted folders", () => {
  assert.match(inboxWorkspaceSource, /"spam", "trash"/)
  assert.match(inboxWorkspaceSource, /view === "spam" \|\| view === "trash"/)
  assert.match(appSidebarSource, /\{ view: "spam", label: "Spam"[^\n]+enabled: hasMailbox \}/)
  assert.match(appSidebarSource, /\{ view: "trash", label: provider === "gmail" \? "Trash" : "Deleted items"[^\n]+enabled: hasMailbox \}/)
  assert.doesNotMatch(appSidebarSource, /view: "spam"[^\n]+enabled: false/)
  assert.doesNotMatch(appSidebarSource, /view: "deleted"/)
})

test("the thread toolbar exposes a real provider-backed trash action", () => {
  assert.match(source, /\/threads\/\$\{encodeURIComponent\(threadId\)\}\/trash/)
  assert.match(inboxPageSource, /aria-label=\{t\("Move to trash"\)\}/)
  assert.match(inboxPageSource, /await trashThread\(target\.id\)/)
})

test("the Inbox header unread badge belongs to the mailbox named beside it", () => {
  assert.match(inboxPageSource, /const unreadTotal = activeMailbox\?\.unreadCount \?\? 0/)
  assert.doesNotMatch(inboxPageSource, /providerMailboxes\.reduce\(/)
})

test("mailbox refresh follows provider continuation pages without an unbounded loop", () => {
  assert.match(source, /const mailboxSyncPageLimit = 5/)
  assert.match(source, /hasMore = page\.hasMore/)
  assert.match(source, /while \(hasMore && pages < mailboxSyncPageLimit\)/)
  assert.match(inboxPageSource, /const liveMailboxSyncIntervalMs = 20_000/)
  assert.match(inboxPageSource, /sync\?\.hasMore \? indexContinuationDelayMs : liveMailboxSyncIntervalMs/)
  assert.match(inboxPageSource, /activeMailbox\.indexStatus === "ready" \|\| activeMailbox\.indexStatus === "error"/)
  assert.doesNotMatch(inboxPageSource, /activeMailbox\.status !== "connected"\s*\|\| activeMailbox\.indexStatus === "error"/)
  assert.match(inboxPageSource, /activeMailbox\.indexPercent/)
  assert.match(inboxPageSource, /Indexing the last 12 months/)
})

test("a successful OAuth return starts the first real mailbox import", () => {
  assert.match(inboxPageSource, /connectionResult\.status === "connected"/)
  assert.match(inboxPageSource, /const connectedMailboxes = await refreshAccounts\(\)/)
  assert.match(inboxPageSource, /await requestMailboxSync\(mailbox\.id\)/)
  assert.match(inboxPageSource, /const importedMailboxIds = new Set\(targets\.map/)
  assert.match(inboxPageSource, /setThreadCache\(\(current\) => Object\.fromEntries/)
  assert.match(inboxPageSource, /The account connected, but its first mail import could not finish/)
})

test("OAuth and provider throttling errors use truthful recovery states", () => {
  assert.match(inboxPageSource, /connectionResult\.code === "provider_token_exchange_failed"/)
  assert.match(inboxPageSource, /The provider approved access, but Multideck could not complete the secure connection\. Try again\./)
  assert.match(inboxPageSource, /error instanceof InboxApiError && error\.code === "rate_limited"/)
  assert.match(inboxPageSource, /Math\.max\(60_000, \(error\.retryAfterSeconds \?\? 0\) \* 1_000\)/)
})
