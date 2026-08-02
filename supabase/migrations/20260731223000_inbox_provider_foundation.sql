-- Multideck Inbox provider foundation.
--
-- This migration deliberately keeps browser roles away from email data and
-- credentials. Tenant Supabase projects are the physical isolation boundary;
-- privileged .NET/Edge services mediate all mailbox access with service_role.

-- The existing communication domain already owns connections, mailboxes,
-- threads, messages, recipients, attachments, inbound events, and send queues.
-- Add only provider operations that are missing from that domain.

insert into public."sys_CommChannels" (
  "CommChannel_Code",
  "CommChannel_Name",
  "CommChannel_Description",
  "CommChannel_SortOrder",
  "CommChannel_IsActive"
)
values ('email', 'Email', 'Provider-backed email communication.', 10, true)
on conflict ("CommChannel_Code") do update
set "CommChannel_Name" = excluded."CommChannel_Name",
    "CommChannel_Description" = excluded."CommChannel_Description",
    "CommChannel_IsActive" = true;

insert into public."sys_CommMessageStatuses" (
  "CommMessageStatus_Code",
  "CommMessageStatus_Name",
  "CommMessageStatus_Description",
  "CommMessageStatus_IsFinal",
  "CommMessageStatus_SortOrder",
  "CommMessageStatus_IsActive"
)
values ('sending', 'Sending', 'Claimed by a worker; the provider outcome may require reconciliation.', false, 20, true)
on conflict ("CommMessageStatus_Code") do update
set "CommMessageStatus_Name" = excluded."CommMessageStatus_Name",
    "CommMessageStatus_Description" = excluded."CommMessageStatus_Description",
    "CommMessageStatus_IsFinal" = excluded."CommMessageStatus_IsFinal",
    "CommMessageStatus_SortOrder" = excluded."CommMessageStatus_SortOrder",
    "CommMessageStatus_IsActive" = true;

insert into public."sys_CommConnectionStatuses" (
  "CommConnectionStatus_Code",
  "CommConnectionStatus_Name",
  "CommConnectionStatus_Description",
  "CommConnectionStatus_IsActive"
)
values
  ('active', 'Active', 'The provider connection may sync and send.', true),
  ('revoked', 'Revoked', 'Provider access was revoked and must not be used.', true),
  ('error', 'Error', 'The provider connection requires attention.', true)
on conflict ("CommConnectionStatus_Code") do update
set "CommConnectionStatus_Name" = excluded."CommConnectionStatus_Name",
    "CommConnectionStatus_Description" = excluded."CommConnectionStatus_Description",
    "CommConnectionStatus_IsActive" = true;

insert into public."sys_CommProcessingStatuses" (
  "CommProcessingStatus_Code",
  "CommProcessingStatus_Name",
  "CommProcessingStatus_Description",
  "CommProcessingStatus_IsFinal",
  "CommProcessingStatus_SortOrder",
  "CommProcessingStatus_IsActive"
)
values
  ('new', 'New', 'Queued for provider event processing.', false, 10, true),
  ('processing', 'Processing', 'Currently being processed by the Inbox worker.', false, 20, true),
  ('processed', 'Processed', 'Successfully applied to the local communication store.', true, 30, true),
  ('failed', 'Failed', 'Processing failed and requires retry or operator attention.', true, 40, true)
on conflict ("CommProcessingStatus_Code") do update
set "CommProcessingStatus_Name" = excluded."CommProcessingStatus_Name",
    "CommProcessingStatus_Description" = excluded."CommProcessingStatus_Description",
    "CommProcessingStatus_IsFinal" = excluded."CommProcessingStatus_IsFinal",
    "CommProcessingStatus_SortOrder" = excluded."CommProcessingStatus_SortOrder",
    "CommProcessingStatus_IsActive" = true;

insert into public."sys_CommProviderTypes" (
  "CommProviderType_Code",
  "CommProviderType_Name",
  "CommProviderType_Description",
  "CommProviderType_SortOrder",
  "CommProviderType_IsActive"
)
values
  ('google_workspace', 'Google Workspace', 'Gmail and Google Workspace mailboxes.', 10, true),
  ('microsoft_365', 'Microsoft 365', 'Outlook and Exchange Online mailboxes.', 20, true)
on conflict ("CommProviderType_Code") do update
set "CommProviderType_Name" = excluded."CommProviderType_Name",
    "CommProviderType_Description" = excluded."CommProviderType_Description",
    "CommProviderType_IsActive" = true;

insert into public."sys_CommMailboxTypes" (
  "CommMailboxType_Code",
  "CommMailboxType_Name",
  "CommMailboxType_Description",
  "CommMailboxType_SortOrder",
  "CommMailboxType_IsActive"
)
values
  ('personal', 'Personal', 'A mailbox owned by one Multideck user.', 10, true),
  ('shared', 'Shared', 'A delegated or team mailbox.', 20, true),
  ('group', 'Group', 'A group address delivered to an accessible mailbox.', 30, true)
on conflict ("CommMailboxType_Code") do update
set "CommMailboxType_Name" = excluded."CommMailboxType_Name",
    "CommMailboxType_Description" = excluded."CommMailboxType_Description",
    "CommMailboxType_IsActive" = true;

insert into public."sys_CommSensitivityLevels" (
  "CommSensitivity_Code",
  "CommSensitivity_Name",
  "CommSensitivity_Description",
  "CommSensitivity_SortOrder",
  "CommSensitivity_IsActive"
)
values ('internal', 'Internal', 'Visible only through authorised workspace access.', 20, true)
on conflict ("CommSensitivity_Code") do update
set "CommSensitivity_Name" = excluded."CommSensitivity_Name",
    "CommSensitivity_Description" = excluded."CommSensitivity_Description",
    "CommSensitivity_IsActive" = true;

create unique index if not exists "UX_Comm_ProviderConnections_user_provider_active"
  on public."Comm_ProviderConnections" (
    "CommConn_UserID",
    "CommConn_ProviderTypeCode"
  )
  where "CommConn_UserID" is not null
    and not "CommConn_IsDeleted";

create unique index if not exists "UX_Comm_Mailboxes_connection_provider_active"
  on public."Comm_Mailboxes" (
    "CommMailbox_ConnectionID",
    "CommMailbox_ProviderMailboxID"
  )
  where "CommMailbox_ConnectionID" is not null
    and "CommMailbox_ProviderMailboxID" is not null
    and not "CommMailbox_IsDeleted";

create unique index if not exists "UX_Comm_Mailboxes_connection_address_active"
  on public."Comm_Mailboxes" (
    "CommMailbox_ConnectionID",
    "CommMailbox_NormalizedAddress"
  )
  where "CommMailbox_ConnectionID" is not null
    and not "CommMailbox_IsDeleted";

create table if not exists public."Comm_MailboxAccess" (
  "CommMailboxAccess_ID" uuid primary key default gen_random_uuid(),
  "CommMailboxAccess_MailboxID" uuid not null
    references public."Comm_Mailboxes" ("CommMailbox_ID") on delete cascade,
  "CommMailboxAccess_UserID" uuid not null
    references public."cmp_Users" ("User_ID") on delete cascade,
  "CommMailboxAccess_ScopeCode" varchar(24) not null,
  "CommMailboxAccess_CanRead" boolean not null default true,
  "CommMailboxAccess_CanSend" boolean not null default false,
  "CommMailboxAccess_CanSendAs" boolean not null default false,
  "CommMailboxAccess_CanManage" boolean not null default false,
  "CommMailboxAccess_GrantedAt" timestamptz not null default now(),
  "CommMailboxAccess_ExpiresAt" timestamptz,
  "CommMailboxAccess_RevokedAt" timestamptz,
  "CommMailboxAccess_CreatedAt" timestamptz not null default now(),
  "CommMailboxAccess_UpdatedAt" timestamptz not null default now(),
  constraint "CK_Comm_MailboxAccess_scope"
    check ("CommMailboxAccess_ScopeCode" in ('personal', 'shared', 'group')),
  constraint "CK_Comm_MailboxAccess_any_capability"
    check (
      "CommMailboxAccess_CanRead"
      or "CommMailboxAccess_CanSend"
      or "CommMailboxAccess_CanSendAs"
      or "CommMailboxAccess_CanManage"
    ),
  constraint "CK_Comm_MailboxAccess_send_as"
    check (not "CommMailboxAccess_CanSendAs" or "CommMailboxAccess_CanSend"),
  constraint "CK_Comm_MailboxAccess_expiry"
    check (
      "CommMailboxAccess_ExpiresAt" is null
      or "CommMailboxAccess_ExpiresAt" > "CommMailboxAccess_GrantedAt"
    ),
  constraint "CK_Comm_MailboxAccess_revocation"
    check (
      "CommMailboxAccess_RevokedAt" is null
      or "CommMailboxAccess_RevokedAt" >= "CommMailboxAccess_GrantedAt"
    )
);

create unique index if not exists "UX_Comm_MailboxAccess_active_user"
  on public."Comm_MailboxAccess" (
    "CommMailboxAccess_MailboxID",
    "CommMailboxAccess_UserID"
  )
  where "CommMailboxAccess_RevokedAt" is null;

create index if not exists "IX_Comm_MailboxAccess_user_active"
  on public."Comm_MailboxAccess" (
    "CommMailboxAccess_UserID",
    "CommMailboxAccess_MailboxID"
  )
  where "CommMailboxAccess_RevokedAt" is null;

create table if not exists public."Comm_MailFolders" (
  "CommMailFolder_ID" uuid primary key default gen_random_uuid(),
  "CommMailFolder_MailboxID" uuid not null
    references public."Comm_Mailboxes" ("CommMailbox_ID") on delete cascade,
  "CommMailFolder_ProviderFolderID" varchar(320) not null,
  "CommMailFolder_ParentProviderFolderID" varchar(320),
  "CommMailFolder_RoleCode" varchar(40) not null default 'custom',
  "CommMailFolder_DisplayName" varchar(240) not null,
  "CommMailFolder_IsHidden" boolean not null default false,
  "CommMailFolder_CanHoldMessages" boolean not null default true,
  "CommMailFolder_SyncCursor" text,
  "CommMailFolder_CreatedAt" timestamptz not null default now(),
  "CommMailFolder_UpdatedAt" timestamptz not null default now(),
  constraint "UX_Comm_MailFolders_provider"
    unique ("CommMailFolder_MailboxID", "CommMailFolder_ProviderFolderID"),
  constraint "CK_Comm_MailFolders_role"
    check (
      "CommMailFolder_RoleCode" in
        ('inbox', 'sent', 'drafts', 'archive', 'trash', 'spam', 'important', 'custom')
    )
);

create index if not exists "IX_Comm_MailFolders_mailbox_role"
  on public."Comm_MailFolders" (
    "CommMailFolder_MailboxID",
    "CommMailFolder_RoleCode"
  );

create table if not exists public."Comm_MessageFolders" (
  "CommMessageFolder_MessageID" uuid not null
    references public."Comm_Messages" ("CommMessage_ID") on delete cascade,
  "CommMessageFolder_FolderID" uuid not null
    references public."Comm_MailFolders" ("CommMailFolder_ID") on delete cascade,
  "CommMessageFolder_IsPrimary" boolean not null default false,
  "CommMessageFolder_AddedAt" timestamptz not null default now(),
  primary key ("CommMessageFolder_MessageID", "CommMessageFolder_FolderID")
);

create index if not exists "IX_Comm_MessageFolders_folder"
  on public."Comm_MessageFolders" (
    "CommMessageFolder_FolderID",
    "CommMessageFolder_MessageID"
  );

create table if not exists public."Comm_ProviderSubscriptions" (
  "CommProviderSubscription_ID" uuid primary key default gen_random_uuid(),
  "CommProviderSubscription_ConnectionID" uuid not null
    references public."Comm_ProviderConnections" ("CommConn_ID") on delete cascade,
  "CommProviderSubscription_MailboxID" uuid
    references public."Comm_Mailboxes" ("CommMailbox_ID") on delete cascade,
  "CommProviderSubscription_ProviderSubscriptionID" varchar(320),
  "CommProviderSubscription_ProviderResource" varchar(500) not null,
  "CommProviderSubscription_ChangeTypes" varchar(200),
  "CommProviderSubscription_ClientStateSecretRef" varchar(240),
  "CommProviderSubscription_StatusCode" varchar(40) not null default 'active',
  "CommProviderSubscription_ExpiresAt" timestamptz not null,
  "CommProviderSubscription_NextRenewalAt" timestamptz,
  "CommProviderSubscription_LastNotificationAt" timestamptz,
  "CommProviderSubscription_LastCursor" text,
  "CommProviderSubscription_LastError" text,
  "CommProviderSubscription_CreatedAt" timestamptz not null default now(),
  "CommProviderSubscription_UpdatedAt" timestamptz not null default now(),
  -- A provider resource identifies one mailbox watch inside a connection.
  constraint "UX_Comm_ProviderSubscriptions_resource"
    unique (
      "CommProviderSubscription_ConnectionID",
      "CommProviderSubscription_ProviderResource"
    ),
  constraint "CK_Comm_ProviderSubscriptions_status"
    check (
      "CommProviderSubscription_StatusCode" in
        ('active', 'renewing', 'expired', 'revoked', 'error')
    ),
  constraint "CK_Comm_ProviderSubscriptions_renewal"
    check (
      "CommProviderSubscription_NextRenewalAt" is null
      or "CommProviderSubscription_NextRenewalAt" <= "CommProviderSubscription_ExpiresAt"
    ),
  constraint "CK_Comm_ProviderSubscriptions_secret_ref"
    check (
      "CommProviderSubscription_ClientStateSecretRef" is null
      or "CommProviderSubscription_ClientStateSecretRef"
        ~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
);

-- Gmail intentionally reuses one Pub/Sub subscription name across mailbox
-- watches, so provider subscription IDs are unique only with their resource.
create unique index if not exists "UX_Comm_ProviderSubscriptions_provider_resource"
  on public."Comm_ProviderSubscriptions" (
    "CommProviderSubscription_ProviderSubscriptionID",
    "CommProviderSubscription_ProviderResource"
  )
  where "CommProviderSubscription_ProviderSubscriptionID" is not null;

create index if not exists "IX_Comm_ProviderSubscriptions_renewal"
  on public."Comm_ProviderSubscriptions" (
    "CommProviderSubscription_StatusCode",
    "CommProviderSubscription_NextRenewalAt",
    "CommProviderSubscription_ExpiresAt"
  );

create table if not exists public."Comm_OAuthStates" (
  "CommOAuthState_ID" uuid primary key default gen_random_uuid(),
  "CommOAuthState_StateHash" varchar(128) not null unique,
  "CommOAuthState_ProviderCode" varchar(40) not null,
  "CommOAuthState_UserID" uuid not null
    references public."cmp_Users" ("User_ID") on delete cascade,
  "CommOAuthState_ReturnPath" text not null default '/inbox',
  "CommOAuthState_PKCEVerifierSecretRef" varchar(240),
  "CommOAuthState_RequestedScopes" jsonb not null default '[]'::jsonb,
  "CommOAuthState_CreatedAt" timestamptz not null default now(),
  "CommOAuthState_ExpiresAt" timestamptz not null default (now() + interval '10 minutes'),
  "CommOAuthState_ConsumedAt" timestamptz,
  "CommOAuthState_FailedAt" timestamptz,
  "CommOAuthState_FailureCode" varchar(80),
  constraint "CK_Comm_OAuthStates_provider"
    check ("CommOAuthState_ProviderCode" in ('gmail', 'outlook')),
  constraint "CK_Comm_OAuthStates_state_hash"
    check (length(btrim("CommOAuthState_StateHash")) between 32 and 128),
  constraint "CK_Comm_OAuthStates_return_path"
    check (
      "CommOAuthState_ReturnPath" ~ '^/[^/].*'
      and "CommOAuthState_ReturnPath" !~ '[[:cntrl:]]'
    ),
  constraint "CK_Comm_OAuthStates_scopes"
    check (jsonb_typeof("CommOAuthState_RequestedScopes") = 'array'),
  constraint "CK_Comm_OAuthStates_pkce_ref"
    check (
      "CommOAuthState_PKCEVerifierSecretRef" is null
      or "CommOAuthState_PKCEVerifierSecretRef"
        ~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  constraint "CK_Comm_OAuthStates_expiry"
    check ("CommOAuthState_ExpiresAt" > "CommOAuthState_CreatedAt"),
  constraint "CK_Comm_OAuthStates_terminal_state"
    check (
      "CommOAuthState_ConsumedAt" is null
      or "CommOAuthState_FailedAt" is null
    )
);

create index if not exists "IX_Comm_OAuthStates_expiry"
  on public."Comm_OAuthStates" ("CommOAuthState_ExpiresAt")
  where "CommOAuthState_ConsumedAt" is null
    and "CommOAuthState_FailedAt" is null;

create index if not exists "IX_Comm_OAuthStates_user_created"
  on public."Comm_OAuthStates" (
    "CommOAuthState_UserID",
    "CommOAuthState_CreatedAt" desc
  );

create table if not exists public."Comm_ThreadSummaries" (
  "CommThreadSummary_ID" uuid primary key default gen_random_uuid(),
  "CommThreadSummary_ThreadID" uuid not null
    references public."Comm_Threads" ("CommThread_ID") on delete cascade,
  "CommThreadSummary_Version" integer not null,
  "CommThreadSummary_ModelCode" varchar(120) not null default 'gpt-5.6-luna',
  "CommThreadSummary_SummaryText" text not null,
  "CommThreadSummary_StructuredJSON" jsonb not null default '{}'::jsonb,
  "CommThreadSummary_SourceMessageCount" integer not null default 0,
  "CommThreadSummary_SourceLastMessageID" uuid
    references public."Comm_Messages" ("CommMessage_ID") on delete set null,
  "CommThreadSummary_SourceFingerprint" varchar(64) not null,
  "CommThreadSummary_GeneratedByUserID" uuid
    references public."cmp_Users" ("User_ID") on delete set null,
  "CommThreadSummary_GeneratedAt" timestamptz not null default now(),
  "CommThreadSummary_SupersededAt" timestamptz,
  constraint "UX_Comm_ThreadSummaries_version"
    unique ("CommThreadSummary_ThreadID", "CommThreadSummary_Version"),
  constraint "CK_Comm_ThreadSummaries_version"
    check ("CommThreadSummary_Version" > 0),
  constraint "CK_Comm_ThreadSummaries_text"
    check (length(btrim("CommThreadSummary_SummaryText")) > 0),
  constraint "CK_Comm_ThreadSummaries_message_count"
    check ("CommThreadSummary_SourceMessageCount" >= 0),
  constraint "CK_Comm_ThreadSummaries_fingerprint"
    check ("CommThreadSummary_SourceFingerprint" ~ '^[0-9a-f]{64}$'),
  constraint "CK_Comm_ThreadSummaries_superseded"
    check (
      "CommThreadSummary_SupersededAt" is null
      or "CommThreadSummary_SupersededAt" >= "CommThreadSummary_GeneratedAt"
    )
);

create unique index if not exists "UX_Comm_ThreadSummaries_current"
  on public."Comm_ThreadSummaries" ("CommThreadSummary_ThreadID")
  where "CommThreadSummary_SupersededAt" is null;

create index if not exists "IX_Comm_ThreadSummaries_thread_generated"
  on public."Comm_ThreadSummaries" (
    "CommThreadSummary_ThreadID",
    "CommThreadSummary_GeneratedAt" desc
  );

-- Email permissions are vocabulary only. Role assignment remains an explicit
-- tenant-administration decision and is not silently granted here.
insert into public."sys_SUBModuleCodes" (
  "SUBModule_Code",
  "SUBModule_Name",
  "SUBModule_Description",
  "SUBModule_IsMVP",
  "SUBModule_IsActive",
  "SUBModule_SortOrder"
)
values ('email', 'Email', 'Connected Gmail and Microsoft 365 inbox operations.', true, true, 35)
on conflict ("SUBModule_Code") do update
set "SUBModule_Name" = excluded."SUBModule_Name",
    "SUBModule_Description" = excluded."SUBModule_Description",
    "SUBModule_IsActive" = true;

insert into public."sys_SECPermissionActions" (
  "SECPermAction_Code",
  "SECPermAction_Name",
  "SECPermAction_Description",
  "SECPermAction_IsActive",
  "SECPermAction_SortOrder"
)
values
  ('connect', 'Connect', 'Connect or revoke an external provider.', true, 200),
  ('read', 'Read', 'Read provider-backed content.', true, 201),
  ('send', 'Send', 'Send provider-backed content.', true, 202),
  ('manage_shared', 'Manage shared', 'Manage shared or group mailbox access.', true, 203),
  ('ai_read', 'AI read', 'Allow approved AI processing of provider-backed content.', true, 204)
on conflict ("SECPermAction_Code") do nothing;

insert into public."SEC_Permissions" (
  "SECPerm_Code",
  "SECPerm_Name",
  "SECPerm_ModuleCode",
  "SECPerm_ResourceTypeCode",
  "SECPerm_ActionCode",
  "SECPerm_Description",
  "SECPerm_IsSystem",
  "SECPerm_IsActive"
)
values
  ('Email.Connect', 'Connect email accounts', 'email', 'EmailConnection', 'connect', 'Connect or revoke Gmail and Microsoft 365.', true, true),
  ('Email.Read', 'Read email', 'email', 'EmailMessage', 'read', 'Read authorised personal, shared, and group mailboxes.', true, true),
  ('Email.Send', 'Send email', 'email', 'EmailMessage', 'send', 'Compose, reply, reply all, and forward from authorised mailboxes.', true, true),
  ('Email.ManageShared', 'Manage shared mailboxes', 'email', 'SharedMailbox', 'manage_shared', 'Manage users and send-as access for shared or group mailboxes.', true, true),
  ('Email.AIRead', 'Summarise email with AI', 'email', 'EmailThread', 'ai_read', 'Allow Luna to read an authorised thread for summarisation.', true, true)
on conflict ("SECPerm_Code") do update
set "SECPerm_Name" = excluded."SECPerm_Name",
    "SECPerm_ModuleCode" = excluded."SECPerm_ModuleCode",
    "SECPerm_ResourceTypeCode" = excluded."SECPerm_ResourceTypeCode",
    "SECPerm_ActionCode" = excluded."SECPerm_ActionCode",
    "SECPerm_Description" = excluded."SECPerm_Description",
    "SECPerm_IsActive" = true;

-- The .NET authorization layer currently reads this application permission
-- catalogue. Keep it aligned with the richer SEC permission vocabulary above.
insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('Email.Connect', 'Email', 'Connect email accounts', 'Connect or revoke Gmail and Microsoft 365 accounts.', true),
  ('Email.Read', 'Email', 'Read email', 'Read authorised personal, shared, and group mailboxes.', false),
  ('Email.Send', 'Email', 'Send email', 'Compose, reply, reply all, and forward from authorised mailboxes.', true),
  ('Email.ManageShared', 'Email', 'Manage shared mailboxes', 'Manage users and send-as access for shared or group mailboxes.', true),
  ('Email.AIRead', 'Email', 'Summarise email with AI', 'Allow Luna to read an authorised thread for summarisation.', true)
on conflict ("sys_Permission_Value") do update
set "sys_Permission_Group" = excluded."sys_Permission_Group",
    "sys_Permission_Name" = excluded."sys_Permission_Name",
    "sys_Permission_Description" = excluded."sys_Permission_Description",
    "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

-- Server-only RPCs. They are SECURITY INVOKER deliberately: service_role gets
-- explicit table rights below; browser roles get neither table nor function
-- privileges. No provider token or raw OAuth state is accepted by these APIs.
create or replace function public.comm_put_email_secret(
  p_secret text,
  p_name text default null,
  p_description text default null
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret_id uuid;
begin
  if p_secret is null or length(p_secret) not between 1 and 131072 then
    raise exception 'Email secret must be between 1 byte and 128 KiB.' using errcode = '22023';
  end if;

  if p_name is not null and length(btrim(p_name)) not between 1 and 180 then
    raise exception 'Email secret name must be between 1 and 180 characters.' using errcode = '22023';
  end if;

  select vault.create_secret(
    p_secret,
    nullif(btrim(p_name), ''),
    coalesce(nullif(btrim(p_description), ''), 'Multideck Inbox credential')
  )
  into v_secret_id;

  if v_secret_id is null then
    raise exception 'Tenant Vault did not create an email secret.' using errcode = '55000';
  end if;

  return 'supabase-vault:' || v_secret_id::text;
end;
$$;

create or replace function public.comm_get_email_secret(
  p_secret_ref text
)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Email secret reference is invalid.' using errcode = '22023';
  end if;

  v_secret_id := substring(p_secret_ref from 16)::uuid;

  select secret.decrypted_secret
    into v_secret
  from vault.decrypted_secrets as secret
  where secret.id = v_secret_id;

  return v_secret;
end;
$$;

create or replace function public.comm_update_email_secret(
  p_secret_ref text,
  p_secret text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret_id uuid;
begin
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Email secret reference is invalid.' using errcode = '22023';
  end if;

  if p_secret is null or length(p_secret) not between 1 and 131072 then
    raise exception 'Email secret must be between 1 byte and 128 KiB.' using errcode = '22023';
  end if;

  v_secret_id := substring(p_secret_ref from 16)::uuid;
  if not exists (
    select 1
    from vault.decrypted_secrets as secret
    where secret.id = v_secret_id
  ) then
    return false;
  end if;

  perform vault.update_secret(v_secret_id, p_secret, null, null);
  return true;
end;
$$;

create or replace function public.comm_delete_email_secret(
  p_secret_ref text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret_id uuid;
  v_deleted bigint;
begin
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Email secret reference is invalid.' using errcode = '22023';
  end if;

  v_secret_id := substring(p_secret_ref from 16)::uuid;
  delete from vault.secrets as secret
  where secret.id = v_secret_id;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.comm_begin_email_oauth_state(
  p_state_hash varchar,
  p_provider_code varchar,
  p_auth_user_id uuid,
  p_return_path text default '/inbox',
  p_pkce_verifier_secret_ref varchar default null,
  p_requested_scopes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_state_id uuid;
begin
  if p_auth_user_id is null then
    raise exception 'An authenticated user is required.' using errcode = '22023';
  end if;

  if p_provider_code not in ('gmail', 'outlook') then
    raise exception 'Unsupported email provider.' using errcode = '22023';
  end if;

  if p_state_hash is null or length(btrim(p_state_hash)) not between 32 and 128 then
    raise exception 'OAuth state hash is invalid.' using errcode = '22023';
  end if;

  if p_return_path is null
     or p_return_path !~ '^/[^/].*'
     or p_return_path ~ '[[:cntrl:]]' then
    raise exception 'OAuth return path must be a local application path.' using errcode = '22023';
  end if;

  if p_requested_scopes is null or jsonb_typeof(p_requested_scopes) <> 'array' then
    raise exception 'Requested scopes must be a JSON array.' using errcode = '22023';
  end if;

  select workspace_user."User_ID"
    into v_user_id
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = p_auth_user_id
  order by workspace_user."User_ID"
  limit 1;

  if v_user_id is null then
    -- Keep a missing workspace profile distinct from Email.Connect denial so the
    -- OAuth boundary can return a fixed public error without matching text.
    raise exception 'No Multideck workspace user matches this identity.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public."cmp_Users_Roles" as user_role
    join public."sys_UserRole_Permissions" as role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" as permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = v_user_id
      and permission."sys_Permission_Value" = 'Email.Connect'
  ) then
    raise exception 'Email.Connect permission is required.' using errcode = '42501';
  end if;

  insert into public."Comm_OAuthStates" (
    "CommOAuthState_StateHash",
    "CommOAuthState_ProviderCode",
    "CommOAuthState_UserID",
    "CommOAuthState_ReturnPath",
    "CommOAuthState_PKCEVerifierSecretRef",
    "CommOAuthState_RequestedScopes"
  )
  values (
    btrim(p_state_hash),
    p_provider_code,
    v_user_id,
    p_return_path,
    nullif(btrim(p_pkce_verifier_secret_ref), ''),
    p_requested_scopes
  )
  returning "CommOAuthState_ID" into v_state_id;

  return v_state_id;
end;
$$;

create or replace function public.comm_consume_email_oauth_state(
  p_state_hash varchar
)
returns table (
  oauth_state_id uuid,
  provider_code varchar,
  user_id uuid,
  auth_user_id uuid,
  return_path text,
  pkce_verifier_secret_ref varchar,
  requested_scopes jsonb
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with consumed as (
    update public."Comm_OAuthStates" as oauth_state
    set "CommOAuthState_ConsumedAt" = now()
    where oauth_state."CommOAuthState_StateHash" = btrim(p_state_hash)
      and oauth_state."CommOAuthState_ConsumedAt" is null
      and oauth_state."CommOAuthState_FailedAt" is null
      and oauth_state."CommOAuthState_ExpiresAt" > now()
    returning oauth_state.*
  )
  select
    consumed."CommOAuthState_ID",
    consumed."CommOAuthState_ProviderCode",
    consumed."CommOAuthState_UserID",
    workspace_user."Auth_User_ID",
    consumed."CommOAuthState_ReturnPath",
    consumed."CommOAuthState_PKCEVerifierSecretRef",
    consumed."CommOAuthState_RequestedScopes"
  from consumed
  join public."cmp_Users" as workspace_user
    on workspace_user."User_ID" = consumed."CommOAuthState_UserID";
$$;

create or replace function public.comm_complete_email_oauth_connection(
  p_oauth_state_id uuid,
  p_provider_type_code varchar,
  p_connection_name varchar,
  p_secret_ref varchar,
  p_provider_tenant_id varchar,
  p_provider_account_id varchar,
  p_mailbox_display_name varchar,
  p_mailbox_address varchar,
  p_provider_mailbox_id varchar,
  p_mailbox_type_code varchar default 'personal',
  p_scopes jsonb default '[]'::jsonb
)
returns table (
  connection_id uuid,
  mailbox_id uuid,
  replaced_secret_ref varchar
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_state_provider varchar(40);
  v_user_id uuid;
  v_expected_provider_type varchar(60);
  v_connection_id uuid;
  v_mailbox_id uuid;
  v_previous_secret_ref varchar(240);
  v_previous_provider_tenant_id varchar(180);
  v_previous_provider_account_id varchar(180);
  v_normalized_address varchar(320);
  v_now timestamptz := now();
begin
  if p_provider_type_code not in ('google_workspace', 'microsoft_365') then
    raise exception 'Unsupported provider type.' using errcode = '22023';
  end if;

  if p_mailbox_type_code not in ('personal', 'shared', 'group') then
    raise exception 'Unsupported mailbox type.' using errcode = '22023';
  end if;

  if p_scopes is null or jsonb_typeof(p_scopes) <> 'array' then
    raise exception 'Granted scopes must be a JSON array.' using errcode = '22023';
  end if;

  if p_provider_account_id is null
     or length(btrim(p_provider_account_id)) not between 1 and 180 then
    raise exception 'A provider account identity is required.' using errcode = '22023';
  end if;

  if p_provider_tenant_id is not null
     and length(btrim(p_provider_tenant_id)) not between 1 and 180 then
    raise exception 'Provider tenant identity is invalid.' using errcode = '22023';
  end if;

  if p_secret_ref is null
     or btrim(p_secret_ref)
       !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'An opaque credential secret reference is required.' using errcode = '22023';
  end if;

  v_normalized_address := lower(btrim(p_mailbox_address));
  if v_normalized_address is null
     or length(v_normalized_address) > 320
     or v_normalized_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid mailbox address is required.' using errcode = '22023';
  end if;

  select
    oauth_state."CommOAuthState_ProviderCode",
    oauth_state."CommOAuthState_UserID"
  into v_state_provider, v_user_id
  from public."Comm_OAuthStates" as oauth_state
  where oauth_state."CommOAuthState_ID" = p_oauth_state_id
    and oauth_state."CommOAuthState_ConsumedAt" is not null
    and oauth_state."CommOAuthState_FailedAt" is null
    and oauth_state."CommOAuthState_CreatedAt" > v_now - interval '1 day'
  for update;

  if v_user_id is null then
    raise exception 'OAuth state is not valid for completion.' using errcode = '42501';
  end if;

  -- Re-check at completion so revocation during the provider round trip takes
  -- effect before any credential reference, connection, mailbox, or ACL write.
  if not exists (
    select 1
    from public."cmp_Users_Roles" as user_role
    join public."sys_UserRole_Permissions" as role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" as permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = v_user_id
      and permission."sys_Permission_Value" = 'Email.Connect'
  ) then
    raise exception 'Email.Connect permission is required.' using errcode = '42501';
  end if;

  v_expected_provider_type := case v_state_provider
    when 'gmail' then 'google_workspace'
    when 'outlook' then 'microsoft_365'
    else null
  end;

  if v_expected_provider_type is distinct from p_provider_type_code then
    raise exception 'OAuth provider does not match the connection provider.' using errcode = '42501';
  end if;

  select
    connection."CommConn_ID",
    connection."CommConn_SecretRef",
    connection."CommConn_ProviderTenantID",
    connection."CommConn_ProviderAccountID"
  into
    v_connection_id,
    v_previous_secret_ref,
    v_previous_provider_tenant_id,
    v_previous_provider_account_id
  from public."Comm_ProviderConnections" as connection
  where connection."CommConn_UserID" = v_user_id
    and connection."CommConn_ProviderTypeCode" = p_provider_type_code
    and not connection."CommConn_IsDeleted"
  order by connection."CommConn_UpdatedAt" desc
  limit 1
  for update;

  if v_connection_id is not null
     and (
       (
         nullif(btrim(v_previous_provider_account_id), '') is not null
         and nullif(btrim(v_previous_provider_account_id), '')
           is distinct from nullif(btrim(p_provider_account_id), '')
       )
       or (
         nullif(btrim(v_previous_provider_tenant_id), '') is not null
         and nullif(btrim(v_previous_provider_tenant_id), '')
           is distinct from nullif(btrim(p_provider_tenant_id), '')
       )
     ) then
    raise exception
      'A different provider account is already connected. Disconnect it before connecting another account.'
      using errcode = '42501';
  end if;

  if v_connection_id is null then
    insert into public."Comm_ProviderConnections" (
      "CommConn_Name",
      "CommConn_ProviderTypeCode",
      "CommConn_DefaultChannelCode",
      "CommConn_StatusCode",
      "CommConn_UserID",
      "CommConn_AuthType",
      "CommConn_SecretRef",
      "CommConn_ProviderTenantID",
      "CommConn_ProviderAccountID",
      "CommConn_InboundEnabled",
      "CommConn_OutboundEnabled",
      "CommConn_RateLimitJSON",
      "CommConn_SettingsJSON",
      "CommConn_CreatedAt",
      "CommConn_CreatedBy",
      "CommConn_UpdatedAt",
      "CommConn_UpdatedBy",
      "CommConn_IsDeleted"
    )
    values (
      left(coalesce(nullif(btrim(p_connection_name), ''), p_provider_type_code), 160),
      p_provider_type_code,
      'email',
      'active',
      v_user_id,
      'oauth2',
      btrim(p_secret_ref),
      nullif(left(btrim(p_provider_tenant_id), 180), ''),
      nullif(left(btrim(p_provider_account_id), 180), ''),
      true,
      true,
      '{}'::jsonb,
      jsonb_build_object('oauthScopes', p_scopes, 'oauthProvider', v_state_provider),
      v_now,
      v_user_id,
      v_now,
      v_user_id,
      false
    )
    returning "CommConn_ID" into v_connection_id;
  else
    update public."Comm_ProviderConnections" as connection
    set "CommConn_Name" = left(coalesce(nullif(btrim(p_connection_name), ''), connection."CommConn_Name"), 160),
        "CommConn_StatusCode" = 'active',
        "CommConn_AuthType" = 'oauth2',
        "CommConn_SecretRef" = btrim(p_secret_ref),
        "CommConn_ProviderTenantID" = nullif(left(btrim(p_provider_tenant_id), 180), ''),
        "CommConn_ProviderAccountID" = nullif(left(btrim(p_provider_account_id), 180), ''),
        "CommConn_InboundEnabled" = true,
        "CommConn_OutboundEnabled" = true,
        "CommConn_SettingsJSON" = coalesce(connection."CommConn_SettingsJSON", '{}'::jsonb)
          || jsonb_build_object('oauthScopes', p_scopes, 'oauthProvider', v_state_provider),
        "CommConn_ErrorMessage" = null,
        "CommConn_UpdatedAt" = v_now,
        "CommConn_UpdatedBy" = v_user_id,
        "CommConn_IsDeleted" = false
    where connection."CommConn_ID" = v_connection_id;
  end if;

  select mailbox."CommMailbox_ID"
    into v_mailbox_id
  from public."Comm_Mailboxes" as mailbox
  where mailbox."CommMailbox_ConnectionID" = v_connection_id
    and not mailbox."CommMailbox_IsDeleted"
    and (
      (
        nullif(btrim(p_provider_mailbox_id), '') is not null
        and mailbox."CommMailbox_ProviderMailboxID" = left(btrim(p_provider_mailbox_id), 180)
      )
      or mailbox."CommMailbox_NormalizedAddress" = v_normalized_address
    )
  order by mailbox."CommMailbox_UpdatedAt" desc
  limit 1
  for update;

  if v_mailbox_id is null then
    insert into public."Comm_Mailboxes" (
      "CommMailbox_ConnectionID",
      "CommMailbox_TypeCode",
      "CommMailbox_ChannelCode",
      "CommMailbox_UserID",
      "CommMailbox_DisplayName",
      "CommMailbox_Address",
      "CommMailbox_NormalizedAddress",
      "CommMailbox_ProviderMailboxID",
      "CommMailbox_IsDefaultOutbound",
      "CommMailbox_InboundEnabled",
      "CommMailbox_OutboundEnabled",
      "CommMailbox_DefaultSensitivityCode",
      "CommMailbox_SettingsJSON",
      "CommMailbox_CreatedAt",
      "CommMailbox_CreatedBy",
      "CommMailbox_UpdatedAt",
      "CommMailbox_UpdatedBy",
      "CommMailbox_IsDeleted"
    )
    values (
      v_connection_id,
      p_mailbox_type_code,
      'email',
      case when p_mailbox_type_code = 'personal' then v_user_id else null end,
      left(coalesce(nullif(btrim(p_mailbox_display_name), ''), v_normalized_address), 180),
      left(btrim(p_mailbox_address), 320),
      v_normalized_address,
      nullif(left(btrim(p_provider_mailbox_id), 180), ''),
      not exists (
        select 1
        from public."Comm_Mailboxes" as existing_default
        where existing_default."CommMailbox_ConnectionID" = v_connection_id
          and existing_default."CommMailbox_IsDefaultOutbound"
          and not existing_default."CommMailbox_IsDeleted"
      ),
      true,
      true,
      'internal',
      '{}'::jsonb,
      v_now,
      v_user_id,
      v_now,
      v_user_id,
      false
    )
    returning "CommMailbox_ID" into v_mailbox_id;
  else
    update public."Comm_Mailboxes" as mailbox
    set "CommMailbox_TypeCode" = p_mailbox_type_code,
        "CommMailbox_UserID" = case when p_mailbox_type_code = 'personal' then v_user_id else null end,
        "CommMailbox_DisplayName" = left(coalesce(nullif(btrim(p_mailbox_display_name), ''), mailbox."CommMailbox_DisplayName"), 180),
        "CommMailbox_Address" = left(btrim(p_mailbox_address), 320),
        "CommMailbox_NormalizedAddress" = v_normalized_address,
        "CommMailbox_ProviderMailboxID" = nullif(left(btrim(p_provider_mailbox_id), 180), ''),
        "CommMailbox_InboundEnabled" = true,
        "CommMailbox_OutboundEnabled" = true,
        "CommMailbox_UpdatedAt" = v_now,
        "CommMailbox_UpdatedBy" = v_user_id,
        "CommMailbox_IsDeleted" = false
    where mailbox."CommMailbox_ID" = v_mailbox_id;
  end if;

  insert into public."Comm_MailboxAccess" (
    "CommMailboxAccess_MailboxID",
    "CommMailboxAccess_UserID",
    "CommMailboxAccess_ScopeCode",
    "CommMailboxAccess_CanRead",
    "CommMailboxAccess_CanSend",
    "CommMailboxAccess_CanSendAs",
    "CommMailboxAccess_CanManage",
    "CommMailboxAccess_GrantedAt",
    "CommMailboxAccess_UpdatedAt"
  )
  values (
    v_mailbox_id,
    v_user_id,
    p_mailbox_type_code,
    true,
    true,
    p_mailbox_type_code = 'personal',
    p_mailbox_type_code = 'personal',
    v_now,
    v_now
  )
  on conflict (
    "CommMailboxAccess_MailboxID",
    "CommMailboxAccess_UserID"
  ) where "CommMailboxAccess_RevokedAt" is null
  do update set
    "CommMailboxAccess_ScopeCode" = excluded."CommMailboxAccess_ScopeCode",
    "CommMailboxAccess_CanRead" = excluded."CommMailboxAccess_CanRead",
    "CommMailboxAccess_CanSend" = excluded."CommMailboxAccess_CanSend",
    "CommMailboxAccess_CanSendAs" = excluded."CommMailboxAccess_CanSendAs",
    "CommMailboxAccess_CanManage" = excluded."CommMailboxAccess_CanManage",
    "CommMailboxAccess_ExpiresAt" = null,
    "CommMailboxAccess_UpdatedAt" = v_now;

  return query
  select
    v_connection_id,
    v_mailbox_id,
    case
      when v_previous_secret_ref is distinct from btrim(p_secret_ref)
        then v_previous_secret_ref
      else null
    end;
end;
$$;

create or replace function public.comm_enqueue_email_inbound_event(
  p_connection_id uuid,
  p_mailbox_id uuid,
  p_provider_event_id varchar,
  p_provider_message_id varchar,
  p_dedupe_key varchar,
  p_payload jsonb,
  p_received_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_inbound_id uuid;
begin
  if p_connection_id is null then
    raise exception 'Connection is required.' using errcode = '22023';
  end if;

  if p_dedupe_key is null or length(btrim(p_dedupe_key)) not between 1 and 240 then
    raise exception 'A provider dedupe key is required.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Inbound payload must be a JSON object.' using errcode = '22023';
  end if;

  if p_payload::text ~* '"(access_token|refresh_token|client_secret|authorization|clientstate)"[[:space:]]*:' then
    raise exception 'Inbound payload contains credential material.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public."Comm_ProviderConnections" as connection
    where connection."CommConn_ID" = p_connection_id
      and connection."CommConn_InboundEnabled"
      and connection."CommConn_StatusCode" = 'active'
      and not connection."CommConn_IsDeleted"
  ) then
    raise exception 'Connection is not active for inbound email.' using errcode = '42501';
  end if;

  if p_mailbox_id is not null and not exists (
    select 1
    from public."Comm_Mailboxes" as mailbox
    where mailbox."CommMailbox_ID" = p_mailbox_id
      and mailbox."CommMailbox_ConnectionID" = p_connection_id
      and mailbox."CommMailbox_InboundEnabled"
      and not mailbox."CommMailbox_IsDeleted"
  ) then
    raise exception 'Mailbox does not belong to the active connection.' using errcode = '42501';
  end if;

  insert into public."Comm_InboundEvents" (
    "CommInbound_ConnectionID",
    "CommInbound_MailboxID",
    "CommInbound_ChannelCode",
    "CommInbound_ProcessingStatusCode",
    "CommInbound_ProviderEventID",
    "CommInbound_ProviderMessageID",
    "CommInbound_DedupeKey",
    "CommInbound_ReceivedAt",
    "CommInbound_PayloadJSON"
  )
  values (
    p_connection_id,
    p_mailbox_id,
    'email',
    'new',
    nullif(left(btrim(p_provider_event_id), 240), ''),
    nullif(left(btrim(p_provider_message_id), 240), ''),
    btrim(p_dedupe_key),
    coalesce(p_received_at, now()),
    p_payload
  )
  on conflict ("CommInbound_DedupeKey")
    where "CommInbound_DedupeKey" is not null
  do nothing
  returning "CommInbound_ID" into v_inbound_id;

  if v_inbound_id is null then
    select inbound_event."CommInbound_ID"
      into v_inbound_id
    from public."Comm_InboundEvents" as inbound_event
    where inbound_event."CommInbound_DedupeKey" = btrim(p_dedupe_key);
  end if;

  return v_inbound_id;
end;
$$;

create or replace function public.comm_resolve_email_provider_subscription(
  p_provider_subscription_id varchar,
  p_provider_resource varchar
)
returns table (
  subscription_id uuid,
  connection_id uuid,
  mailbox_id uuid,
  provider_subscription_id varchar,
  provider_resource varchar,
  client_state_secret_ref varchar,
  expires_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select
    subscription."CommProviderSubscription_ID",
    subscription."CommProviderSubscription_ConnectionID",
    subscription."CommProviderSubscription_MailboxID",
    subscription."CommProviderSubscription_ProviderSubscriptionID",
    subscription."CommProviderSubscription_ProviderResource",
    subscription."CommProviderSubscription_ClientStateSecretRef",
    subscription."CommProviderSubscription_ExpiresAt"
  from public."Comm_ProviderSubscriptions" as subscription
  where subscription."CommProviderSubscription_StatusCode" = 'active'
    and subscription."CommProviderSubscription_ExpiresAt" > now()
    and (
      nullif(btrim(p_provider_subscription_id), '') is not null
      or nullif(btrim(p_provider_resource), '') is not null
    )
    and (
      nullif(btrim(p_provider_subscription_id), '') is null
      or subscription."CommProviderSubscription_ProviderSubscriptionID"
        = btrim(p_provider_subscription_id)
    )
    and (
      nullif(btrim(p_provider_resource), '') is null
      or subscription."CommProviderSubscription_ProviderResource"
        = btrim(p_provider_resource)
    )
  order by subscription."CommProviderSubscription_UpdatedAt" desc
  limit 1;
$$;

create or replace function public.comm_save_email_thread_summary(
  p_thread_id uuid,
  p_model_code varchar,
  p_summary_text text,
  p_structured_json jsonb,
  p_source_message_count integer,
  p_source_last_message_id uuid,
  p_source_fingerprint varchar,
  p_generated_by_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_summary_id uuid;
  v_version integer;
  v_now timestamptz := now();
begin
  if p_thread_id is null then
    raise exception 'Thread is required.' using errcode = '22023';
  end if;

  if p_model_code is null or length(btrim(p_model_code)) not between 1 and 120 then
    raise exception 'Summary model code is invalid.' using errcode = '22023';
  end if;

  if p_summary_text is null or length(btrim(p_summary_text)) = 0 then
    raise exception 'Summary text is required.' using errcode = '22023';
  end if;

  if p_structured_json is null or jsonb_typeof(p_structured_json) <> 'object' then
    raise exception 'Structured summary must be a JSON object.' using errcode = '22023';
  end if;

  if p_source_message_count is null or p_source_message_count < 0 then
    raise exception 'Source message count is invalid.' using errcode = '22023';
  end if;

  if p_source_fingerprint is null or p_source_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Source fingerprint must be a lowercase SHA-256 hash.' using errcode = '22023';
  end if;

  perform 1
  from public."Comm_Threads" as thread
  where thread."CommThread_ID" = p_thread_id
    and not thread."CommThread_IsDeleted"
  for update;

  if not found then
    raise exception 'Thread is not available for summarisation.' using errcode = '42501';
  end if;

  if p_source_last_message_id is not null and not exists (
    select 1
    from public."Comm_Messages" as message
    where message."CommMessage_ID" = p_source_last_message_id
      and message."CommMessage_ThreadID" = p_thread_id
      and not message."CommMessage_IsDeleted"
  ) then
    raise exception 'Summary source message does not belong to the thread.' using errcode = '22023';
  end if;

  update public."Comm_ThreadSummaries" as previous_summary
  set "CommThreadSummary_SupersededAt" = v_now
  where previous_summary."CommThreadSummary_ThreadID" = p_thread_id
    and previous_summary."CommThreadSummary_SupersededAt" is null;

  select coalesce(max(summary."CommThreadSummary_Version"), 0) + 1
    into v_version
  from public."Comm_ThreadSummaries" as summary
  where summary."CommThreadSummary_ThreadID" = p_thread_id;

  insert into public."Comm_ThreadSummaries" (
    "CommThreadSummary_ThreadID",
    "CommThreadSummary_Version",
    "CommThreadSummary_ModelCode",
    "CommThreadSummary_SummaryText",
    "CommThreadSummary_StructuredJSON",
    "CommThreadSummary_SourceMessageCount",
    "CommThreadSummary_SourceLastMessageID",
    "CommThreadSummary_SourceFingerprint",
    "CommThreadSummary_GeneratedByUserID",
    "CommThreadSummary_GeneratedAt"
  )
  values (
    p_thread_id,
    v_version,
    btrim(p_model_code),
    btrim(p_summary_text),
    p_structured_json,
    p_source_message_count,
    p_source_last_message_id,
    p_source_fingerprint,
    p_generated_by_user_id,
    v_now
  )
  returning "CommThreadSummary_ID" into v_summary_id;

  return v_summary_id;
end;
$$;

create or replace function public.comm_purge_expired_email_oauth_states(
  p_retention interval default interval '1 day'
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_deleted bigint;
  v_pkce_secret_ids uuid[];
begin
  if p_retention < interval '0 seconds' or p_retention > interval '30 days' then
    raise exception 'OAuth state retention must be between zero and 30 days.' using errcode = '22023';
  end if;

  select coalesce(
    array_agg(substring(oauth_state."CommOAuthState_PKCEVerifierSecretRef" from 16)::uuid),
    array[]::uuid[]
  )
  into v_pkce_secret_ids
  from public."Comm_OAuthStates" as oauth_state
  where (
      oauth_state."CommOAuthState_ExpiresAt" < now() - p_retention
      or oauth_state."CommOAuthState_ConsumedAt" < now() - p_retention
      or oauth_state."CommOAuthState_FailedAt" < now() - p_retention
    )
    and oauth_state."CommOAuthState_PKCEVerifierSecretRef" is not null;

  delete from vault.secrets as secret
  where secret.id = any(v_pkce_secret_ids);

  delete from public."Comm_OAuthStates" as oauth_state
  where oauth_state."CommOAuthState_ExpiresAt" < now() - p_retention
     or oauth_state."CommOAuthState_ConsumedAt" < now() - p_retention
     or oauth_state."CommOAuthState_FailedAt" < now() - p_retention;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Harden existing email-facing base tables. No browser policy is created here:
-- RLS plus revoked grants is intentionally deny-by-default.
do $security$
declare
  table_name text;
begin
  foreach table_name in array array[
    'Comm_ProviderConnections',
    'Comm_Mailboxes',
    'Comm_MailboxAccess',
    'Comm_MailFolders',
    'Comm_Threads',
    'Comm_Messages',
    'Comm_MessageRecipients',
    'Comm_MessageAttachments',
    'Comm_MessageFolders',
    'Comm_ReadStates',
    'Comm_InboundEvents',
    'Comm_SendRequests',
    'Comm_SendRequestRecipients',
    'Comm_DeliveryEvents',
    'Comm_ProviderSubscriptions',
    'Comm_OAuthStates',
    'Comm_ThreadSummaries'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
      execute format('grant all privileges on table public.%I to service_role', table_name);
    end if;
  end loop;
end;
$security$;

-- Existing communication projections were created as security-definer views in
-- some tenant projects. Convert normal views to invoker semantics and remove all
-- browser grants even when their underlying table RLS is misconfigured later.
do $views$
declare
  view_record record;
begin
  for view_record in
    select namespace.nspname as schema_name,
           relation.relname as relation_name,
           relation.relkind as relation_kind
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'Comm_InboxWorklist',
        'Comm_MessageSummary',
        'Comm_ThreadSummary',
        'Comm_OutboxQueue'
      )
      and relation.relkind in ('v', 'm')
  loop
    if view_record.relation_kind = 'v' then
      execute format(
        'alter view %I.%I set (security_invoker = true)',
        view_record.schema_name,
        view_record.relation_name
      );
    end if;

    execute format(
      'revoke all privileges on table %I.%I from public, anon, authenticated',
      view_record.schema_name,
      view_record.relation_name
    );
    execute format(
      'grant select on table %I.%I to service_role',
      view_record.schema_name,
      view_record.relation_name
    );
  end loop;
end;
$views$;

-- SECURITY INVOKER Vault RPCs require narrowly scoped Vault rights for the
-- service role. The vault schema is not an exposed PostgREST schema; browser
-- roles receive no Vault grants and cannot execute the public wrappers.
revoke all on schema vault from public, anon, authenticated;
revoke all on table vault.secrets, vault.decrypted_secrets
  from public, anon, authenticated;
grant usage on schema vault to service_role;
grant select on table vault.decrypted_secrets to service_role;
grant delete on table vault.secrets to service_role;

do $vault_functions$
declare
  vault_function record;
begin
  for vault_function in
    select routine.oid::regprocedure as function_signature
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'vault'
      and routine.proname in ('create_secret', 'update_secret')
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      vault_function.function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      vault_function.function_signature
    );
  end loop;
end;
$vault_functions$;

revoke all on function public.comm_put_email_secret(text, text, text)
  from public, anon, authenticated;
revoke all on function public.comm_get_email_secret(text)
  from public, anon, authenticated;
revoke all on function public.comm_update_email_secret(text, text)
  from public, anon, authenticated;
revoke all on function public.comm_delete_email_secret(text)
  from public, anon, authenticated;

revoke all on function public.comm_begin_email_oauth_state(varchar, varchar, uuid, text, varchar, jsonb)
  from public, anon, authenticated;
revoke all on function public.comm_consume_email_oauth_state(varchar)
  from public, anon, authenticated;
revoke all on function public.comm_complete_email_oauth_connection(uuid, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, jsonb)
  from public, anon, authenticated;
revoke all on function public.comm_enqueue_email_inbound_event(uuid, uuid, varchar, varchar, varchar, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.comm_resolve_email_provider_subscription(varchar, varchar)
  from public, anon, authenticated;
revoke all on function public.comm_save_email_thread_summary(uuid, varchar, text, jsonb, integer, uuid, varchar, uuid)
  from public, anon, authenticated;
revoke all on function public.comm_purge_expired_email_oauth_states(interval)
  from public, anon, authenticated;

grant execute on function public.comm_put_email_secret(text, text, text)
  to service_role;
grant execute on function public.comm_get_email_secret(text)
  to service_role;
grant execute on function public.comm_update_email_secret(text, text)
  to service_role;
grant execute on function public.comm_delete_email_secret(text)
  to service_role;

grant execute on function public.comm_begin_email_oauth_state(varchar, varchar, uuid, text, varchar, jsonb)
  to service_role;
grant execute on function public.comm_consume_email_oauth_state(varchar)
  to service_role;
grant execute on function public.comm_complete_email_oauth_connection(uuid, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, jsonb)
  to service_role;
grant execute on function public.comm_enqueue_email_inbound_event(uuid, uuid, varchar, varchar, varchar, jsonb, timestamptz)
  to service_role;
grant execute on function public.comm_resolve_email_provider_subscription(varchar, varchar)
  to service_role;
grant execute on function public.comm_save_email_thread_summary(uuid, varchar, text, jsonb, integer, uuid, varchar, uuid)
  to service_role;
grant execute on function public.comm_purge_expired_email_oauth_states(interval)
  to service_role;
