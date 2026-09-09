-- Actionable, permission-checked Watch updates and durable customer imports.
-- Event rows retain only source IDs. Current email and attachment metadata is
-- joined at read time through the caller's permitted mailboxes.

begin;

create table if not exists public."CRM_CustomerDocuments" (
  "CRMCustomerDocument_ID" uuid primary key default gen_random_uuid(),
  "CRMCustomerDocument_CustomerOrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "CRMCustomerDocument_StoredObjectID" uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  "CRMCustomerDocument_SourceMessageID" uuid not null references public."Comm_Messages"("CommMessage_ID") on delete restrict,
  "CRMCustomerDocument_SourceAttachmentID" uuid not null references public."Comm_MessageAttachments"("CommAttachment_ID") on delete restrict,
  "CRMCustomerDocument_ActionID" uuid not null,
  "CRMCustomerDocument_IdempotencyKey" varchar(160) not null,
  "CRMCustomerDocument_StatusCode" varchar(32) not null default 'processing',
  "CRMCustomerDocument_SafetyStatusCode" varchar(32) not null default 'unscanned',
  "CRMCustomerDocument_FileName" varchar(255) not null,
  "CRMCustomerDocument_MimeType" varchar(160) not null,
  "CRMCustomerDocument_FileSizeBytes" bigint,
  "CRMCustomerDocument_SHA256" varchar(64),
  "CRMCustomerDocument_FailureMessage" text,
  "CRMCustomerDocument_CreatedBy" uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  "CRMCustomerDocument_CreatedAt" timestamptz not null default now(),
  "CRMCustomerDocument_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CRM_CustomerDocuments_status" check ("CRMCustomerDocument_StatusCode" in ('processing','ready','pending_review','failed')),
  constraint "CK_CRM_CustomerDocuments_safety" check ("CRMCustomerDocument_SafetyStatusCode" in ('clean','unscanned','blocked')),
  constraint "CK_CRM_CustomerDocuments_hash" check ("CRMCustomerDocument_SHA256" is null or "CRMCustomerDocument_SHA256" ~ '^[0-9a-f]{64}$')
);

create unique index if not exists "UX_CRM_CustomerDocuments_customer_source_attachment"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_CustomerOrgID", "CRMCustomerDocument_SourceAttachmentID");
create unique index if not exists "UX_CRM_CustomerDocuments_idempotency"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_CreatedBy", "CRMCustomerDocument_IdempotencyKey");
create index if not exists "IX_CRM_CustomerDocuments_customer_created"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_CustomerOrgID", "CRMCustomerDocument_CreatedAt" desc);

alter table public."CRM_CustomerDocuments" enable row level security;
revoke all on table public."CRM_CustomerDocuments" from public, anon, authenticated;
grant all on table public."CRM_CustomerDocuments" to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('multideck-documents', 'multideck-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.multideck_dexter_domain_customers(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by customer_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', customer."Org_id",
      'name', customer."Org_Name",
      'status', customer."Org_CRMRelationshipStatusCode",
      'isPotentialCustomer', customer."Org_CRMIsPotentialCustomer"
    ) as row_data,
    customer."Org_Name" as customer_name
    from public."Org_Master" customer
    where public._multideck_dexter_has_permission(
      (select profile."User_ID" from public."cmp_Users" profile where profile."Auth_User_ID" = auth.uid() and profile."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (
        customer."Org_CRMIsPotentialCustomer"
        or exists (
          select 1 from public."Org_Master_Type" customer_type
          join public."Org_Types" type on type."OrgType_ID" = customer_type."OrgType_ID"
          where customer_type."Org_ID" = customer."Org_id" and type."OrgType_Name" = 'Customer'
        )
      )
      and (nullif(btrim(p_search), '') is null or customer."Org_Name" ilike '%' || btrim(p_search) || '%')
    order by customer."Org_Name"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) customers;
$$;

revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'customers', 'Customers', 'Customer records available to the signed-in operator.',
  'multideck_dexter_domain_customers', 25, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

-- The action remains fail-closed in Postgres. Agent Dexter always prepares an
-- approval and the approved operation runs only inside the authenticated
-- Supabase Edge runtime, which owns provider reads, storage and cleanup.
create or replace function public.multideck_dexter_action_attach_email_document_to_customer(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'This action must be completed through the approved Supabase document runtime.' using errcode = '42501';
end;
$$;

revoke all on function public.multideck_dexter_action_attach_email_document_to_customer(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt"
) values (
  'attach_email_document_to_customer', 'customers', 'Save email attachment to customer',
  'Save the exact authorised email attachment as a durable customer document. This always requires approval.',
  'multideck_dexter_action_attach_email_document_to_customer',
  '{"type":"object","properties":{"attachment_id":{"type":"string"},"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["attachment_id","target_id","reason"],"additionalProperties":false}'::jsonb,
  25, true, now()
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now();

create or replace function public.multideck_dexter_list_domains()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', domain."AIDexterDomain_Code", 'name', domain."AIDexterDomain_Name", 'description', domain."AIDexterDomain_Description"
  ) order by domain."AIDexterDomain_SortOrder", domain."AIDexterDomain_Name"), '[]'::jsonb)
  into v_result
  from public."sys_AIDexterDataDomains" domain
  where domain."AIDexterDomain_IsActive"
    and (domain."AIDexterDomain_Code" <> 'customers' or public._multideck_dexter_has_permission(v_context.user_id, 'Customers.Read'));
  return v_result;
end; $$;

create or replace function public.multideck_dexter_list_watches()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', watch."AIDexterWatch_ID", 'title', watch."AIDexterWatch_Title", 'summary', watch."AIDexterWatch_Summary",
    'capability', watch."AIDexterWatch_CapabilityCode", 'status', watch."AIDexterWatch_StatusCode",
    'targetLabel', watch."AIDexterWatch_TargetLabel", 'rule', watch."AIDexterWatch_RuleJSON",
    'action', watch."AIDexterWatch_ActionJSON", 'createdAt', watch."AIDexterWatch_CreatedAt",
    'updatedAt', watch."AIDexterWatch_UpdatedAt", 'lastEvaluatedAt', watch."AIDexterWatch_LastEvaluatedAt",
    'lastTriggeredAt', watch."AIDexterWatch_LastTriggeredAt", 'triggerCount', watch."AIDexterWatch_TriggerCount",
    'healthStatus', watch."AIDexterWatch_HealthStatusCode", 'lastSourceCheckAt', watch."AIDexterWatch_LastSourceCheckAt",
    'lastSuccessfulCheckAt', watch."AIDexterWatch_LastSuccessfulCheckAt",
    'healthMessage', case when watch."AIDexterWatch_LastHealthError" is not null then 'Connected email is delayed. Dexter will keep retrying.' end,
    'latestEvent', latest.event
  ) order by watch."AIDexterWatch_UpdatedAt" desc), '[]'::jsonb)
  into v_result
  from public."AI_DexterWatches" watch
  left join lateral (
    select jsonb_build_object(
      'id', event."AIDexterWatchEvent_ID", 'title', event."AIDexterWatchEvent_Title",
      'body', event."AIDexterWatchEvent_Body", 'changed', event."AIDexterWatchEvent_ChangedJSON",
      'action', event."AIDexterWatchEvent_ActionJSON", 'readAt', event."AIDexterWatchEvent_ReadAt",
      'createdAt', event."AIDexterWatchEvent_CreatedAt",
      'context', case when watch."AIDexterWatch_CapabilityCode" = 'email' then coalesce(email_context.value,
        jsonb_build_object('kind','email','availability','removed','messageId',coalesce(event."AIDexterWatchEvent_ChangedJSON"->>'sourceId',''),
          'threadId','','mailboxId',coalesce(event."AIDexterWatchEvent_ChangedJSON"->>'mailboxId',''),'provider','gmail',
          'senderName','','senderEmail','','subject',coalesce(event."AIDexterWatchEvent_ChangedJSON"->>'subject',''),
          'receivedAt',coalesce(event."AIDexterWatchEvent_ChangedJSON"->>'receivedAt',event."AIDexterWatchEvent_CreatedAt"::text),
          'preview','','sourceUrl','','attachments','[]'::jsonb,'unavailableReason','The source email was removed, moved to spam or trash, or is no longer in an authorised mailbox.')) end
    ) event
    from public."AI_DexterWatchEvents" event
    left join lateral (
      select jsonb_build_object(
        'kind','email','availability','available','messageId',message."CommMessage_ID",'threadId',message."CommMessage_ThreadID",
        'mailboxId',message."CommMessage_MailboxID",'provider',permitted.provider,
        'senderName',coalesce(sender.display_name,''),'senderEmail',coalesce(sender.address,''),
        'subject',coalesce(nullif(message."CommMessage_Subject",''),'(No subject)'),
        'receivedAt',coalesce(message."CommMessage_ReceivedAt",message."CommMessage_MessageDate",message."CommMessage_CreatedAt"),
        'preview',left(coalesce(message."CommMessage_BodyPreview",message."CommMessage_BodyText",''),1200),
        'sourceUrl','/inbox?provider=' || permitted.provider || '&mailbox=' || message."CommMessage_MailboxID" || '&thread=' || message."CommMessage_ThreadID",
        'attachments',coalesce(attachments.value,'[]'::jsonb)
      ) value
      from public."Comm_Messages" message
      join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
        on permitted.mailbox_id = message."CommMessage_MailboxID"
      left join lateral (
        select recipient."CommRecipient_DisplayNameSnapshot" display_name, recipient."CommRecipient_Address" address
        from public."Comm_MessageRecipients" recipient
        where recipient."CommRecipient_MessageID" = message."CommMessage_ID" and recipient."CommRecipient_RecipientTypeCode" = 'from'
        order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID" limit 1
      ) sender on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'id',attachment."CommAttachment_ID",'provider',permitted.provider,'mailboxId',message."CommMessage_MailboxID",
          'threadId',message."CommMessage_ThreadID",'messageId',message."CommMessage_ID",
          'subject',coalesce(nullif(message."CommMessage_Subject",''),'(No subject)'),
          'fileName',attachment."CommAttachment_FileName",'mimeType',coalesce(attachment."CommAttachment_MimeType",'application/octet-stream'),
          'sizeBytes',coalesce(attachment."CommAttachment_FileSizeBytes",0),
          'sourceUrl','/inbox?provider=' || permitted.provider || '&mailbox=' || message."CommMessage_MailboxID" || '&thread=' || message."CommMessage_ThreadID",
          'limitation',case
            when lower(coalesce(attachment."CommAttachment_ScanStatus",'')) in ('blocked','infected','quarantined','malicious') then 'This attachment is blocked by the workspace security policy.'
            when coalesce(attachment."CommAttachment_FileSizeBytes",0) > 26214400 then 'This attachment is too large for Dexter.'
            when lower(coalesce(attachment."CommAttachment_MimeType",'')) not in ('application/pdf','text/plain','text/csv','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg','image/webp') then 'This attachment type is not supported by Dexter.'
            else null end
        ) order by attachment."CommAttachment_CreatedAt", attachment."CommAttachment_ID") value
        from public."Comm_MessageAttachments" attachment
        where attachment."CommAttachment_MessageID" = message."CommMessage_ID" and not attachment."CommAttachment_IsInline"
      ) attachments on true
      where message."CommMessage_ID" = nullif(event."AIDexterWatchEvent_ChangedJSON"->>'sourceId','')::uuid
        and not message."CommMessage_IsDeleted" and not message."CommMessage_IsDraft" and not message."CommMessage_IsSpam"
        and not exists (
          select 1 from public."Comm_MessageFolders" membership join public."Comm_MailFolders" folder on folder."CommMailFolder_ID"=membership."CommMessageFolder_FolderID"
          where membership."CommMessageFolder_MessageID"=message."CommMessage_ID" and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash')
        )
    ) email_context on watch."AIDexterWatch_CapabilityCode" = 'email'
    where event."AIDexterWatchEvent_WatchID" = watch."AIDexterWatch_ID"
    order by event."AIDexterWatchEvent_CreatedAt" desc limit 1
  ) latest on true
  where watch."AIDexterWatch_OwnerUserID" = v_context.user_id and watch."AIDexterWatch_CompanyID" = v_context.company_id;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_list_domains() from public, anon;
grant execute on function public.multideck_dexter_list_domains() to authenticated;
revoke all on function public.multideck_dexter_list_watches() from public, anon;
grant execute on function public.multideck_dexter_list_watches() to authenticated;

create or replace function public.multideck_dexter_resolve_email_message(p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'messageId', message."CommMessage_ID", 'threadId', message."CommMessage_ThreadID",
    'mailboxId', message."CommMessage_MailboxID", 'provider', permitted.provider,
    'subject', coalesce(nullif(message."CommMessage_Subject", ''), '(No subject)'),
    'senderName', coalesce(sender.display_name, ''), 'senderEmail', coalesce(sender.address, ''),
    'receivedAt', coalesce(message."CommMessage_ReceivedAt", message."CommMessage_MessageDate", message."CommMessage_CreatedAt"),
    'preview', left(coalesce(message."CommMessage_BodyPreview", ''), 1200),
    'bodyText', left(coalesce(message."CommMessage_BodyText", message."CommMessage_BodyPreview", ''), 20000),
    '_citation', jsonb_build_object(
      'title', coalesce(nullif(message."CommMessage_Subject", ''), '(No subject)'),
      'url', '/inbox?provider=' || permitted.provider || '&mailbox=' || message."CommMessage_MailboxID" || '&thread=' || message."CommMessage_ThreadID",
      'description', case permitted.provider when 'gmail' then 'Gmail email update' else 'Outlook email update' end
    )
  ) into v_result
  from public."Comm_Messages" message
  join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
    on permitted.mailbox_id = message."CommMessage_MailboxID"
  left join lateral (
    select recipient."CommRecipient_DisplayNameSnapshot" display_name, recipient."CommRecipient_Address" address
    from public."Comm_MessageRecipients" recipient
    where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
      and recipient."CommRecipient_RecipientTypeCode" = 'from'
    order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID" limit 1
  ) sender on true
  where message."CommMessage_ID" = p_message_id
    and not message."CommMessage_IsDeleted" and not message."CommMessage_IsDraft" and not message."CommMessage_IsSpam"
    and not exists (
      select 1 from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash')
    );
  if v_result is null then raise exception 'This email update was not found.' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_resolve_email_message(uuid) from public, anon;
grant execute on function public.multideck_dexter_resolve_email_message(uuid) to authenticated;

commit;
