-- A confirmed provider-draft send must stop appearing in Drafts immediately.
-- Dexter deliberately excludes Drafts; waiting for provider sync hides valid
-- engagement evidence even though the sent message and token already exist.
create or replace function public.comm_reconcile_sent_draft_folders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public."Comm_MessageFolders" membership
  using public."Comm_MailFolders" folder
  where membership."CommMessageFolder_MessageID" = new."CommMessage_ID"
    and membership."CommMessageFolder_FolderID" = folder."CommMailFolder_ID"
    and folder."CommMailFolder_MailboxID" = new."CommMessage_MailboxID"
    and folder."CommMailFolder_RoleCode" = 'drafts';

  insert into public."Comm_MessageFolders" (
    "CommMessageFolder_MessageID", "CommMessageFolder_FolderID",
    "CommMessageFolder_IsPrimary", "CommMessageFolder_AddedAt"
  )
  select new."CommMessage_ID", folder."CommMailFolder_ID", false, now()
  from public."Comm_MailFolders" folder
  where folder."CommMailFolder_MailboxID" = new."CommMessage_MailboxID"
    and folder."CommMailFolder_RoleCode" = 'sent'
  order by folder."CommMailFolder_ID"
  limit 1
  on conflict ("CommMessageFolder_MessageID", "CommMessageFolder_FolderID") do nothing;
  return new;
end;
$$;

revoke all on function public.comm_reconcile_sent_draft_folders() from public, anon, authenticated;

create trigger comm_reconcile_sent_draft_folders
after update of "CommMessage_StatusCode", "CommMessage_IsDraft", "CommMessage_SentAt"
on public."Comm_Messages"
for each row
when (
  new."CommMessage_StatusCode" = 'sent'
  and not new."CommMessage_IsDraft"
  and not new."CommMessage_IsInbound"
  and not new."CommMessage_IsDeleted"
  and new."CommMessage_SentAt" is not null
)
execute function public.comm_reconcile_sent_draft_folders();

-- Repair only the contradictory, provider-confirmed sent state. Pending,
-- failed, inbound and deleted messages keep their existing folder membership.
update public."Comm_Messages" message
set "CommMessage_IsDraft" = false
where message."CommMessage_StatusCode" = 'sent'
  and not message."CommMessage_IsDraft"
  and not message."CommMessage_IsInbound"
  and not message."CommMessage_IsDeleted"
  and message."CommMessage_SentAt" is not null
  and exists (
    select 1 from public."Comm_MessageFolders" membership
    join public."Comm_MailFolders" folder
      on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
    where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
      and folder."CommMailFolder_MailboxID" = message."CommMessage_MailboxID"
      and folder."CommMailFolder_RoleCode" = 'drafts'
  );
