-- Suggested updates begin at opt-in. Historical mailbox indexing remains
-- available to the Inbox, but cannot quietly enqueue old attachments for OCR
-- or model extraction after the operator enables automation.

alter table public."AI_InboxSuggestionSettings"
  add column if not exists "AIInboxSetting_EnabledAt" timestamptz;

update public."AI_InboxSuggestionSettings"
set "AIInboxSetting_EnabledAt" = case
      when "AIInboxSetting_IsEnabled" then coalesce(
        "AIInboxSetting_EnabledAt",
        "AIInboxSetting_UpdatedAt",
        "AIInboxSetting_CreatedAt",
        now()
      )
      else null
    end;

create or replace function public.multideck_inbox_enqueue_suggestions(
  p_message_id uuid,
  p_actor_user_id uuid,
  p_classifier_version text default 'inbox-triage-v1',
  p_extractor_version text default 'inbox-extract-v1'
) returns integer
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare v_inserted integer := 0;
begin
  insert into public."AI_InboxProcessingJobs" (
    "AIInboxJob_CompanyID", "AIInboxJob_OwnerUserID", "AIInboxJob_MailboxID",
    "AIInboxJob_MessageID", "AIInboxJob_AttachmentID",
    "AIInboxJob_ClassifierVersion", "AIInboxJob_ExtractorVersion"
  )
  select
    setting."AIInboxSetting_CompanyID", setting."AIInboxSetting_EnabledByUserID",
    mailbox."CommMailbox_ID", message."CommMessage_ID", attachment."CommAttachment_ID",
    left(btrim(p_classifier_version), 40), left(btrim(p_extractor_version), 40)
  from public."Comm_Messages" message
  join public."Comm_Mailboxes" mailbox
    on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
  join public."AI_InboxSuggestionSettings" setting
    on setting."AIInboxSetting_MailboxID" = mailbox."CommMailbox_ID"
  join public."Comm_MessageAttachments" attachment
    on attachment."CommAttachment_MessageID" = message."CommMessage_ID"
  where message."CommMessage_ID" = p_message_id
    and setting."AIInboxSetting_IsEnabled"
    and setting."AIInboxSetting_EnabledAt" is not null
    and coalesce(
      message."CommMessage_ReceivedAt",
      message."CommMessage_MessageDate",
      message."CommMessage_CreatedAt"
    ) >= setting."AIInboxSetting_EnabledAt"
    and exists (
      select 1
      from public."cmp_Users" actor
      where actor."User_ID" = p_actor_user_id
        and actor."Company_ID" = setting."AIInboxSetting_CompanyID"
        and coalesce(actor."User_AccessStatus", 'active') = 'active'
    )
    and mailbox."CommMailbox_InboundEnabled"
    and not mailbox."CommMailbox_IsDeleted"
    and not message."CommMessage_IsDeleted"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsSpam"
    and not attachment."CommAttachment_IsInline"
    and lower(attachment."CommAttachment_FileName")
      ~ '\.(pdf|xlsx|xls|csv|docx|doc|odt|ods|png|jpe?g|webp)$'
    and not exists (
      select 1
      from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder
        on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash')
    )
    and exists (
      select 1
      from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder
        on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" = 'inbox'
    )
    and exists (
      select 1
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" in ('to','cc','bcc')
        and lower(recipient."CommRecipient_NormalizedAddress")
          = lower(mailbox."CommMailbox_NormalizedAddress")
    )
  on conflict (
    "AIInboxJob_AttachmentID",
    "AIInboxJob_ClassifierVersion",
    "AIInboxJob_ExtractorVersion"
  ) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.multideck_inbox_enqueue_suggestions(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.multideck_inbox_enqueue_suggestions(uuid,uuid,text,text)
  to service_role;
