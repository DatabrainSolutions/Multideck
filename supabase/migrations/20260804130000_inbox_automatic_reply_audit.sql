create table if not exists public."Comm_MailboxAutomaticReplyAudit" (
  "CommAutoReplyAudit_ID" uuid primary key default gen_random_uuid(),
  "CommAutoReplyAudit_CompanyID" uuid not null,
  "CommAutoReplyAudit_UserID" uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  "CommAutoReplyAudit_MailboxID" uuid not null references public."Comm_Mailboxes"("CommMailbox_ID") on delete restrict,
  "CommAutoReplyAudit_ProviderCode" varchar(24) not null check ("CommAutoReplyAudit_ProviderCode" in ('gmail', 'outlook')),
  "CommAutoReplyAudit_StatusCode" varchar(24) not null check ("CommAutoReplyAudit_StatusCode" in ('disabled', 'scheduled', 'always_on')),
  "CommAutoReplyAudit_AudienceCode" varchar(24) not null check ("CommAutoReplyAudit_AudienceCode" in ('everyone', 'internal_only')),
  "CommAutoReplyAudit_StartAt" timestamptz,
  "CommAutoReplyAudit_EndAt" timestamptz,
  "CommAutoReplyAudit_CreatedAt" timestamptz not null default now()
);

create index if not exists "IX_Comm_MailboxAutomaticReplyAudit_mailbox_created"
  on public."Comm_MailboxAutomaticReplyAudit" ("CommAutoReplyAudit_MailboxID", "CommAutoReplyAudit_CreatedAt" desc);

alter table public."Comm_MailboxAutomaticReplyAudit" enable row level security;
revoke all on table public."Comm_MailboxAutomaticReplyAudit" from public, anon, authenticated;
grant all on table public."Comm_MailboxAutomaticReplyAudit" to service_role;
