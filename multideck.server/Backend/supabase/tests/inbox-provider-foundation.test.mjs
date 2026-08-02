import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const migration = readFileSync(
  resolve(supabaseRoot, "migrations/20260731223000_inbox_provider_foundation.sql"),
  "utf8",
)
const indexProgressMigration = readFileSync(
  resolve(supabaseRoot, "migrations/20260801111500_inbox_index_progress.sql"),
  "utf8",
)
const syncLeaseMigration = readFileSync(
  resolve(supabaseRoot, "migrations/20260801120500_inbox_sync_lease.sql"),
  "utf8",
)
const appPermissions = readFileSync(
  resolve(supabaseRoot, "../../Authorization/AppPermissions.cs"),
  "utf8",
)
const sendProcessor = readFileSync(
  resolve(supabaseRoot, "../../Modules/Inbox/Processing/InboxSendProcessor.cs"),
  "utf8",
)
const inboxService = readFileSync(
  resolve(supabaseRoot, "../../Modules/Inbox/InboxService.cs"),
  "utf8",
)

test("Inbox extends the existing communication domain instead of duplicating it", () => {
  for (const table of [
    "Comm_MailboxAccess",
    "Comm_MailFolders",
    "Comm_MessageFolders",
    "Comm_ProviderSubscriptions",
    "Comm_OAuthStates",
    "Comm_ThreadSummaries",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\."${table}"`))
  }

  assert.doesNotMatch(migration, /create table if not exists public\."Comm_(?:Threads|Messages)"/)
  assert.match(migration, /references public\."Comm_Threads" \("CommThread_ID"\) on delete cascade/)
  assert.match(migration, /references public\."Comm_Messages" \("CommMessage_ID"\) on delete cascade/)
})

test("mailbox indexing progress is durable, bounded, and remains Edge mediated", () => {
  for (const column of [
    "CommMailbox_IndexStatus",
    "CommMailbox_IndexProcessedCount",
    "CommMailbox_IndexTotalEstimate",
    "CommMailbox_IndexStartedAt",
    "CommMailbox_IndexCompletedAt",
  ]) assert.match(indexProgressMigration, new RegExp(column))

  assert.match(indexProgressMigration, /'pending', 'indexing', 'ready', 'error'/)
  assert.match(indexProgressMigration, /"CommMailbox_IndexProcessedCount" >= 0/)
  assert.match(indexProgressMigration, /IX_Comm_Mailboxes_indexing/)
  assert.doesNotMatch(indexProgressMigration, /grant .*authenticated/i)
})

test("mailbox indexing is serialized by an expiring service-only lease", () => {
  assert.match(syncLeaseMigration, /"CommMailbox_SyncLeaseToken" uuid/)
  assert.match(syncLeaseMigration, /"CommMailbox_SyncLeaseUntil" timestamptz/)
  assert.match(syncLeaseMigration, /"Comm_AcquireMailboxSyncLease"/)
  assert.match(syncLeaseMigration, /"Comm_ReleaseMailboxSyncLease"/)
  assert.match(syncLeaseMigration, /"CommMailbox_SyncLeaseUntil" <= now\(\)/)
  assert.match(syncLeaseMigration, /greatest\(15, least\(p_lease_seconds, 300\)\)/)
  assert.match(syncLeaseMigration, /from public, anon, authenticated/)
  assert.match(syncLeaseMigration, /to service_role/)
})

test("provider credentials and OAuth state remain opaque and server mediated", () => {
  const oauthTable = migration.match(
    /create table if not exists public\."Comm_OAuthStates"[\s\S]*?create index if not exists "IX_Comm_OAuthStates_expiry"/,
  )?.[0]
  const subscriptionTable = migration.match(
    /create table if not exists public\."Comm_ProviderSubscriptions"[\s\S]*?where "CommProviderSubscription_ProviderSubscriptionID" is not null;/,
  )?.[0]

  assert.ok(oauthTable)
  assert.ok(subscriptionTable)
  assert.match(oauthTable, /"CommOAuthState_StateHash" varchar\(128\) not null unique/)
  assert.match(oauthTable, /"CommOAuthState_PKCEVerifierSecretRef" varchar\(240\)/)
  assert.match(subscriptionTable, /"CommProviderSubscription_ClientStateSecretRef" varchar\(240\)/)
  assert.match(oauthTable, /CK_Comm_OAuthStates_pkce_ref/)
  assert.match(subscriptionTable, /CK_Comm_ProviderSubscriptions_secret_ref/)
  assert.match(
    subscriptionTable,
    /constraint "UX_Comm_ProviderSubscriptions_resource"\s+unique \(\s+"CommProviderSubscription_ConnectionID",\s+"CommProviderSubscription_ProviderResource"\s+\)/,
  )
  assert.doesNotMatch(
    subscriptionTable,
    /"CommProviderSubscription_ConnectionID",\s+"CommProviderSubscription_ConnectionID"/,
  )
  assert.match(
    subscriptionTable,
    /"UX_Comm_ProviderSubscriptions_provider_resource"\s+on public\."Comm_ProviderSubscriptions" \(\s+"CommProviderSubscription_ProviderSubscriptionID",\s+"CommProviderSubscription_ProviderResource"\s+\)/,
  )
  assert.doesNotMatch(`${oauthTable}\n${subscriptionTable}`, /AccessToken|RefreshToken|ClientSecret/)

  for (const rpc of [
    "comm_put_email_secret",
    "comm_get_email_secret",
    "comm_update_email_secret",
    "comm_delete_email_secret",
    "comm_begin_email_oauth_state",
    "comm_consume_email_oauth_state",
    "comm_complete_email_oauth_connection",
    "comm_enqueue_email_inbound_event",
    "comm_resolve_email_provider_subscription",
    "comm_save_email_thread_summary",
    "comm_purge_expired_email_oauth_states",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`))
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`))
  }

  const invokerCount = migration.match(/security invoker/g)?.length ?? 0
  assert.equal(invokerCount, 11)
  assert.doesNotMatch(migration, /security definer/i)
})

test("Inbox secrets use the tenant Supabase Vault behind service-only wrappers", () => {
  assert.match(migration, /select vault\.create_secret\(/)
  assert.match(migration, /from vault\.decrypted_secrets as secret/)
  assert.match(migration, /perform vault\.update_secret\(v_secret_id, p_secret, null, null\)/)
  assert.match(migration, /delete from vault\.secrets as secret/)
  assert.doesNotMatch(migration, /vault\.delete_secret/)
  assert.match(migration, /return 'supabase-vault:' \|\| v_secret_id::text/)
  assert.match(migration, /\^supabase-vault:\[0-9a-f\]/)
  assert.match(migration, /grant usage on schema vault to service_role/)
  assert.match(migration, /grant select on table vault\.decrypted_secrets to service_role/)
  assert.match(migration, /grant delete on table vault\.secrets to service_role/)
  assert.match(migration, /revoke all on schema vault from public, anon, authenticated/)
  assert.match(migration, /revoke all on table vault\.secrets, vault\.decrypted_secrets\s+from public, anon, authenticated/)
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/)

  for (const rpc of [
    "comm_put_email_secret",
    "comm_get_email_secret",
    "comm_update_email_secret",
    "comm_delete_email_secret",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`))
  }

  const purgeFunction = migration.match(
    /create or replace function public\.comm_purge_expired_email_oauth_states[\s\S]*?\$\$;/,
  )?.[0]

  assert.ok(purgeFunction)
  assert.match(purgeFunction, /v_pkce_secret_ids uuid\[\]/)
  assert.match(purgeFunction, /delete from vault\.secrets as secret/)
  assert.match(purgeFunction, /delete from public\."Comm_OAuthStates" as oauth_state/)
  assert.ok(
    purgeFunction.indexOf("delete from vault.secrets as secret")
      < purgeFunction.indexOf('delete from public."Comm_OAuthStates" as oauth_state'),
  )
})

test("email tables and existing projections are deny-by-default for browser roles", () => {
  for (const table of [
    "Comm_ProviderConnections",
    "Comm_Mailboxes",
    "Comm_MailboxAccess",
    "Comm_Threads",
    "Comm_Messages",
    "Comm_MessageRecipients",
    "Comm_MessageAttachments",
    "Comm_InboundEvents",
    "Comm_SendRequests",
    "Comm_ProviderSubscriptions",
    "Comm_OAuthStates",
    "Comm_ThreadSummaries",
  ]) {
    assert.match(migration, new RegExp(`'${table}'`))
  }

  assert.match(migration, /alter table public\.%I enable row level security/)
  assert.match(migration, /revoke all privileges on table public\.%I from public, anon, authenticated/)
  assert.match(migration, /grant all privileges on table public\.%I to service_role/)

  for (const view of [
    "Comm_InboxWorklist",
    "Comm_MessageSummary",
    "Comm_ThreadSummary",
    "Comm_OutboxQueue",
  ]) {
    assert.match(migration, new RegExp(`'${view}'`))
  }
  assert.match(migration, /alter view %I\.%I set \(security_invoker = true\)/)
})

test("mailbox ACLs, provider events, and Dexter summaries carry explicit safety boundaries", () => {
  assert.match(migration, /'sending', 'Sending', 'Claimed by a worker; the provider outcome may require reconciliation\.'/)
  assert.match(migration, /"CommMessageStatus_IsFinal" = excluded\."CommMessageStatus_IsFinal"/)
  for (const status of [
    "'new', 'New'",
    "'processing', 'Processing'",
    "'processed', 'Processed'",
    "'failed', 'Failed'",
  ]) {
    assert.match(migration, new RegExp(status))
  }
  assert.match(migration, /"CommProcessingStatus_IsFinal" = excluded\."CommProcessingStatus_IsFinal"/)
  assert.match(migration, /"CommMailboxAccess_ScopeCode" in \('personal', 'shared', 'group'\)/)
  assert.match(migration, /"CommMailboxAccess_CanSendAs" or "CommMailboxAccess_CanSend"/)
  assert.match(migration, /"UX_Comm_MailboxAccess_active_user"/)
  const mailboxAccessInsert = migration.match(
    /insert into public\."Comm_MailboxAccess" \([\s\S]*?on conflict \(/,
  )?.[0]
  assert.ok(mailboxAccessInsert)
  assert.match(mailboxAccessInsert, /"CommMailboxAccess_UpdatedAt"\s+\)\s+values \(/)
  assert.doesNotMatch(mailboxAccessInsert, /"CommMailboxAccess_UpdatedAt"\s+\)\s+\)\s+values \(/)
  assert.match(migration, /on conflict \("CommInbound_DedupeKey"\)/)
  assert.match(migration, /p_payload::text ~\* '"\(access_token\|refresh_token\|client_secret\|authorization\|clientstate\)"/)
  assert.match(migration, /"CommThreadSummary_ModelCode" varchar\(120\) not null default 'gpt-5\.6-luna'/)
  assert.match(migration, /"CommThreadSummary_SourceFingerprint" ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(migration, /"UX_Comm_ThreadSummaries_current"/)
  assert.match(migration, /create or replace function public\.comm_save_email_thread_summary/)
  assert.match(migration, /set "CommThreadSummary_SupersededAt" = v_now/)
  assert.match(migration, /message\."CommMessage_ThreadID" = p_thread_id/)
  assert.match(migration, /'Email\.AIRead'/)
  assert.match(migration, /'Email\.ManageShared'/)
  assert.match(migration, /insert into public\."sys_Permissions"/)

  const beginOAuth = migration.match(
    /create or replace function public\.comm_begin_email_oauth_state[\s\S]*?\$\$;/,
  )?.[0]
  const completeOAuth = migration.match(
    /create or replace function public\.comm_complete_email_oauth_connection[\s\S]*?\$\$;/,
  )?.[0]
  for (const oauthFunction of [beginOAuth, completeOAuth]) {
    assert.ok(oauthFunction)
    assert.match(oauthFunction, /public\."cmp_Users_Roles"/)
    assert.match(oauthFunction, /public\."sys_UserRole_Permissions"/)
    assert.match(oauthFunction, /permission\."sys_Permission_Value" = 'Email\.Connect'/)
    assert.match(oauthFunction, /raise exception 'Email\.Connect permission is required\.' using errcode = '42501'/)
  }

  assert.match(
    beginOAuth,
    /No Multideck workspace user matches this identity\.' using errcode = 'P0002'/,
  )
  assert.match(
    beginOAuth,
    /Email\.Connect permission is required\.' using errcode = '42501'/,
  )

  assert.match(completeOAuth, /v_previous_provider_tenant_id varchar\(180\)/)
  assert.match(completeOAuth, /v_previous_provider_account_id varchar\(180\)/)
  assert.match(completeOAuth, /connection\."CommConn_ProviderTenantID"/)
  assert.match(completeOAuth, /connection\."CommConn_ProviderAccountID"/)
  assert.match(
    completeOAuth,
    /nullif\(btrim\(v_previous_provider_account_id\), ''\)[\s\S]*?is distinct from nullif\(btrim\(p_provider_account_id\), ''\)/,
  )
  assert.match(
    completeOAuth,
    /nullif\(btrim\(v_previous_provider_tenant_id\), ''\)[\s\S]*?is distinct from nullif\(btrim\(p_provider_tenant_id\), ''\)/,
  )
  assert.match(
    completeOAuth,
    /A different provider account is already connected\. Disconnect it before connecting another account\.[\s\S]*?errcode = '42501'/,
  )

  for (const permission of [
    "Email.Connect",
    "Email.Read",
    "Email.Send",
    "Email.ManageShared",
    "Email.AIRead",
  ]) {
    assert.match(appPermissions, new RegExp(`"${permission.replace(".", "\\.")}"`))
  }

  assert.match(appPermissions, /public static class Email/)
  assert.match(appPermissions, /Email\.Connect,[\s\S]*Email\.Read,[\s\S]*Email\.Send,[\s\S]*Email\.ManageShared,[\s\S]*Email\.AiRead,/)
})

test("outbound email is claimed atomically and ambiguous provider results are never auto-retried", () => {
  assert.match(migration, /'sending', 'Sending', 'Claimed by a worker; the provider outcome may require reconciliation\.', false/)
  assert.match(sendProcessor, /for update skip locked/)
  assert.match(sendProcessor, /set "CommSend_StatusCode" = 'sending'/)
  assert.match(sendProcessor, /returning send\."CommSend_ID" as "Value"/)
  assert.match(sendProcessor, /The provider send result is uncertain\. Check the provider Sent folder before sending again\./)
  assert.match(sendProcessor, /await FailAsync\([\s\S]*?"The provider send result is uncertain\.[\s\S]*?false,/)
  assert.match(inboxService, /SHA256\.HashData\(Encoding\.UTF8\.GetBytes\(value\)\)/)
  assert.match(inboxService, /return \$"inbox:\{userId:N\}:\{hash\}"/)
})
