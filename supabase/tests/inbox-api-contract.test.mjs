import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../functions/inbox-api/", import.meta.url)
const index = await readFile(new URL("index.ts", root), "utf8")
const runtime = await readFile(new URL("runtime.ts", root), "utf8")
const core = await readFile(new URL("core.ts", root), "utf8")
const config = await readFile(new URL("../config.toml", import.meta.url), "utf8")
const instantThreadMigration = await readFile(new URL("../migrations/20260803165000_inbox_thread_snapshot.sql", import.meta.url), "utf8")
const threadPageMigration = await readFile(new URL("../migrations/20260803166000_inbox_thread_page.sql", import.meta.url), "utf8")

test("authenticated Edge boundary is registered", () => {
  assert.match(config, /\[functions\.inbox-api\]\s+verify_jwt\s*=\s*true/)
  assert.match(index, /user\.auth\.getUser|requireActor/)
  assert.match(runtime, /user\.auth\.getUser\(\)/)
})

test("complete browser route contract is present", () => {
  for (const route of ["providers", "connections", "workspace", "authorize", "shared-mailboxes", "group-mailboxes", "mailboxes", "ai-context-sources", "sync", "threads", "read-state", "trash", "summary", "drafts", "send", "attachments"]) {
    assert.match(index, new RegExp(`\\b${route.replace("-", "-")}\\b`), `missing ${route}`)
  }
  for (const method of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) assert.match(index, new RegExp(`"${method}"`))
})

test("Inbox startup and thread detail avoid database waterfalls", () => {
  const mailboxList = runtime.slice(runtime.indexOf("export async function listMailboxes"), runtime.indexOf("export async function aiContextSources"))
  const threadDetail = runtime.slice(runtime.indexOf("export async function getThread"), runtime.indexOf("export async function updateThreadState"))
  assert.match(index, /path\[0\] === "workspace"/)
  assert.match(runtime, /export async function inboxWorkspace/)
  assert.match(mailboxList, /comm_inbox_mailbox_unread_counts/)
  assert.doesNotMatch(mailboxList, /CommMessage_MessageDate,CommMessage_ReceivedAt,CommMessage_CreatedAt/)
  assert.match(threadDetail, /admin\.rpc\("comm_inbox_thread_snapshot"/)
  assert.match(runtime, /admin\.rpc\("comm_inbox_thread_page"/)
  assert.match(threadPageMigration, /permissionGranted/)
  assert.match(threadPageMigration, /CommMailboxAccess_CanRead/)
  assert.match(threadPageMigration, /row_number\(\) over/)
  for (const table of ["Comm_MessageRecipients", "Comm_MessageAttachments", "Comm_DeliveryEvents", "Comm_MessageTrackingTokens", "Comm_ReadStates"]) {
    assert.match(instantThreadMigration, new RegExp(table))
  }
  assert.match(instantThreadMigration, /permissionGranted/)
  assert.match(instantThreadMigration, /CommMailboxAccess_CanRead/)
  assert.match(instantThreadMigration, /CommMailboxAccess_CanSend/)
})

test("Dexter email source status is permission-aware and never exposes provider credentials", () => {
  assert.match(runtime, /export async function aiContextSources/)
  assert.match(runtime, /hasPermission\(admin, actor, "Email\.Read"\)/)
  assert.match(runtime, /hasPermission\(admin, actor, "Email\.AIRead"\)/)
  assert.match(runtime, /DEXTER_EMAIL_CONTEXT_ENABLED/)
  assert.match(runtime, /accessibleMailboxCount/)
  assert.match(runtime, /lastSyncedAt/)
  assert.doesNotMatch(index, /CommConn_SecretRef|accessToken|refreshToken/)
})

test("authorization and mailbox ACLs are enforced before service-role reads", () => {
  for (const permission of ["Email.Read", "Email.Send", "Email.Connect", "Email.ManageShared", "Email.AIRead"]) assert.match(runtime, new RegExp(permission.replace(".", "\\.")))
  assert.match(runtime, /Comm_MailboxAccess/)
  assert.match(runtime, /CommMailboxAccess_CanRead/)
  assert.match(runtime, /CommMailboxAccess_CanSendAs/)
  assert.match(runtime, /CommMailboxAccess_CanManage/)
})

test("shared Outlook consent stays explicit and shared discovery remains delegated", () => {
  assert.match(index, /body\.accessMode, body\.returnPath/)
  assert.match(runtime, /returnPath: unknown = "\/inbox"/)
  assert.match(runtime, /body: JSON\.stringify\(\{ action: "authorize", provider, accessMode, returnOrigin: origin, returnPath \}\)/)
  assert.match(runtime, /sharedMailboxAccess: oauthScopes\.has\("mail\.readwrite\.shared"\) && oauthScopes\.has\("mail\.send\.shared"\)/)
  assert.match(runtime, /users\/\$\{encodeURIComponent\(address\)\}\/mailFolders\/inbox/)
  assert.doesNotMatch(runtime, /Directory\.Read\.All/)
  assert.doesNotMatch(runtime, /organizations\/adminconsent/)
})

test("provider secrets stay in Vault and are never serialized to clients", () => {
  assert.match(runtime, /comm_get_email_secret/)
  assert.match(runtime, /comm_update_email_secret/)
  assert.doesNotMatch(index, /CommConn_SecretRef|accessToken|refreshToken/)
})

test("real Gmail and Microsoft folder sync is implemented", () => {
  assert.match(runtime, /includeSpamTrash["']?,\s*["']true/)
  assert.match(runtime, /gmail\.googleapis\.com/)
  for (const folder of ["inbox", "sentitems", "drafts", "junkemail", "deleteditems"]) assert.match(runtime, new RegExp(`"${folder}"`))
  assert.match(runtime, /messages\/delta/)
  const outlookSync = runtime.slice(runtime.indexOf("async function syncOutlook"), runtime.indexOf("async function persistFolders"))
  assert.doesNotMatch(outlookSync, /const select = [^\n]*internetMessageHeaders/)
  assert.match(runtime, /Comm_MessageFolders/)
  assert.match(runtime, /CommMailFolder_RoleCode/)
  assert.match(runtime, /CommThread_SourceTypeCode: "provider_sync"/)
  assert.match(runtime, /CommMessage_SourceTypeCode: "provider_sync"/)
})

test("moving a conversation to trash updates the provider and local folder mapping", () => {
  assert.match(index, /path\[2\] === "trash"/)
  assert.match(runtime, /users\/me\/threads\/\$\{encodeURIComponent\(providerThreadId\)\}\/trash/)
  assert.match(runtime, /messages\/\$\{encodeURIComponent\(providerMessageId\)\}\/move/)
  assert.match(runtime, /destinationId: "deleteditems"/)
  assert.match(runtime, /persistFolders\(admin, mailboxId, message\.CommMessage_ID, \["TRASH"\]\)/)
})

test("Gmail Google Group mailboxes are read-only, address-filtered, and history-safe", () => {
  assert.match(index, /addGroupMailbox/)
  assert.match(index, /path\[2\] === "group-mailboxes"/)
  assert.match(runtime, /CommMailbox_TypeCode: "group"/)
  assert.match(runtime, /CommMailbox_OutboundEnabled: false/)
  assert.match(runtime, /CommMailboxAccess_ScopeCode: "group"/)
  assert.match(runtime, /CommMailboxAccess_CanSend: false/)
  assert.match(runtime, /CommMailboxAccess_CanSendAs: false/)
  assert.match(runtime, /CommThread_IsReadOnly: mailbox\.CommMailbox_TypeCode === "group"/)
  assert.match(runtime, /url\.searchParams\.set\("q", gmailGroupQuery\(groupAddress\)\)/)
  assert.match(runtime, /url\.searchParams\.set\("includeSpamTrash", "true"\)/)
  assert.match(runtime, /gmailMessageMatchesGroup/)
  assert.match(core, /deliveredto:\$\{address\}/)
  assert.match(core, /list:\$\{address\}/)
  assert.match(core, /exact normalized addresses/)
})

test("provider sync retains continuation pages instead of skipping mailbox history", () => {
  assert.match(runtime, /kind: "gmail_history"/)
  assert.match(runtime, /readHistoryPage\(startHistoryId, historyPage\?\.pageToken\)/)
  assert.match(runtime, /if \(pageToken\) url\.searchParams\.set\("pageToken", pageToken\)/)
  assert.match(runtime, /hasMore = !!history\.nextPageToken/)
  assert.match(runtime, /const nextLink = cleanString\(page\["@odata\.nextLink"\]/)
  assert.match(runtime, /hasMore: sync\.hasMore/)
  assert.match(runtime, /error\.providerStatus === 404\) return null/)
  assert.match(runtime, /Prefer: `odata\.maxpagesize=\$\{OUTLOOK_BACKFILL_PAGE_SIZE\}`/)
  assert.doesNotMatch(runtime, /messages\/delta\?\$select=\$\{encodeURIComponent\(select\)\}&\$top=/)
  assert.match(runtime, /existingProcessed < existingEstimate/)
  assert.match(core, /public readonly providerStatus\?: number/)
})

test("mailbox sync reports durable historical indexing progress", () => {
  assert.match(runtime, /resultSizeEstimate/)
  assert.match(runtime, /profile\.messagesTotal/)
  assert.match(runtime, /totalItemCount/)
  assert.match(runtime, /CommMailbox_IndexStatus/)
  assert.match(runtime, /CommMailbox_IndexProcessedCount/)
  assert.match(runtime, /CommMailbox_IndexTotalEstimate/)
  assert.match(runtime, /indexPercent/)
  assert.match(runtime, /sync\.hasMore \|\| indexedCount < estimatedTotal/)
})

test("concurrent Inbox views cannot advance the same provider cursor together", () => {
  assert.match(runtime, /Comm_AcquireMailboxSyncLease/)
  assert.match(runtime, /Comm_ReleaseMailboxSyncLease/)
  assert.match(runtime, /p_lease_seconds: 180/)
  assert.match(runtime, /if \(!leaseAcquired\)/)
  assert.match(runtime, /requiresReconnect && mailbox\.CommMailbox_IndexStatus !== "ready"/)
})

test("provider detail reads are bounded and cannot hang the Edge request indefinitely", () => {
  assert.match(runtime, /mapWithConcurrency\(ids\.slice\(0, 100\), 8/)
  assert.match(runtime, /GMAIL_BACKFILL_PAGE_SIZE = 20/)
  assert.match(runtime, /OUTLOOK_BACKFILL_PAGE_SIZE = 20/)
  assert.match(runtime, /mapWithConcurrency\([\s\S]+?Array\.isArray\(page\.value\)/)
  assert.match(runtime, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/)
  assert.match(runtime, /provider_timeout/)
})

test("Microsoft Graph failures retain a safe provider code without logging credentials or request URLs", () => {
  const providerJson = runtime.slice(runtime.indexOf("async function providerJson"), runtime.indexOf("function gmailBodies"))
  assert.match(providerJson, /Microsoft Graph request failed/)
  assert.match(providerJson, /providerError\.code/)
  assert.match(providerJson, /providerDiagnostic/)
  assert.match(providerJson, /\[email\]/)
  assert.match(providerJson, /\[url\]/)
  assert.doesNotMatch(providerJson, /console\.error\([^\n]*url/)
  assert.doesNotMatch(providerJson, /console\.error\([^\n]*token/)
})

test("Outlook attachment lists request only base attachment properties", () => {
  const parseGraphMessage = runtime.slice(runtime.indexOf("async function parseGraphMessage"), runtime.indexOf("async function syncOutlook"))
  assert.match(parseGraphMessage, /attachments\?\$select=id,name,contentType,size,isInline/)
  assert.doesNotMatch(parseGraphMessage, /attachments\?\$select=[^`\n]*contentId/)
  assert.match(parseGraphMessage, /attachments\/\$\{encodeURIComponent\(item\.id\)\}\?\$select=id,contentId/)
  assert.match(parseGraphMessage, /mapWithConcurrency\(Array\.isArray\(list\.value\)/)
})

test("inline message images repair legacy content IDs and use the private attachment route", () => {
  assert.match(runtime, /hydrateOutlookInlineContentIds/)
  assert.match(runtime, /CommAttachment_ContentID: contentId/)
  assert.match(runtime, /allowInline && !item\.CommAttachment_IsInline/)
  assert.match(index, /searchParams\.get\("disposition"\) === "inline"/)
  assert.match(index, /inline \? "inline" : "attachment"/)
})

test("real mailbox lists avoid full-body reads and batch large database filters", () => {
  const listThreads = runtime.slice(runtime.indexOf("export async function listThreads"), runtime.indexOf("async function mailboxProviderMap"))
  assert.doesNotMatch(listThreads, /from\("Comm_Messages"\)\.select\("\*"\)/)
  assert.match(listThreads, /CommMessage_BodyPreview/)
  assert.match(listThreads, /readInBatches<Row>\(messages\.map/)
  assert.match(listThreads, /readInBatches<Row>\(threadIds/)
  assert.match(listThreads, /readInBatches<Row>\(pageMessageIds/)
})

test("send path has an atomic idempotency claim and all response modes", () => {
  assert.match(runtime, /sha256Hex\(`\$\{actor\.userId\}:\$\{suppliedKey\}`\)/)
  assert.match(runtime, /CommMessage_StatusCode: "sending"/)
  assert.match(runtime, /CommSend_StatusCode: "sending"/)
  for (const mode of ["new", "reply", "reply_all", "forward"]) assert.match(runtime, new RegExp(`"${mode}"`))
  assert.match(runtime, /createReplyAll/)
  assert.match(runtime, /createForward/)
})

test("CORS, HTML and attachment hardening remain fail closed", () => {
  assert.match(core, /assertAllowedRequestOrigin/)
  assert.doesNotMatch(core, /Access-Control-Allow-Origin"\]\s*=\s*"\*"/)
  assert.match(core, /sanitizeEmailHtml/)
  assert.match(index, /X-Content-Type-Options/)
  assert.match(index, /private, no-store/)
})

test("real mail previews decode entities and Gmail encodes international headers", () => {
  assert.match(core, /export function decodeHtmlEntities/)
  assert.match(runtime, /preview: decodeHtmlEntities\(latest\.CommMessage_BodyPreview/)
  assert.match(core, /export function encodeHeaderValue/)
  assert.match(core, /Subject: \$\{encodeHeaderValue\(input\.subject\)\}/)
})
