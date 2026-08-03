-- Private, operator-owned files uploaded directly into a Dexter conversation.
-- Binary content stays in the existing private Multideck document bucket; this
-- table is API-only and records the exact company/user scope used at read time.

begin;

create table if not exists public."AI_DexterUploads" (
  "AIDexterUpload_ID" uuid primary key default gen_random_uuid(),
  "AIDexterUpload_CompanyID" uuid not null,
  "AIDexterUpload_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterUpload_StoredObjectID" uuid not null references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete restrict,
  "AIDexterUpload_FileName" varchar(255) not null,
  "AIDexterUpload_MimeType" varchar(160) not null,
  "AIDexterUpload_FileSizeBytes" bigint not null check ("AIDexterUpload_FileSizeBytes" > 0 and "AIDexterUpload_FileSizeBytes" <= 26214400),
  "AIDexterUpload_SHA256" varchar(64) not null check ("AIDexterUpload_SHA256" ~ '^[0-9a-f]{64}$'),
  "AIDexterUpload_StatusCode" varchar(24) not null default 'active' check ("AIDexterUpload_StatusCode" in ('active','deleted')),
  "AIDexterUpload_CreatedAt" timestamptz not null default now()
);

create index if not exists "IX_AI_DexterUploads_owner_created"
  on public."AI_DexterUploads" ("AIDexterUpload_CompanyID", "AIDexterUpload_UserID", "AIDexterUpload_CreatedAt" desc);

alter table public."AI_DexterUploads" enable row level security;
revoke all on table public."AI_DexterUploads" from public, anon, authenticated;
grant all on table public."AI_DexterUploads" to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('multideck-documents', 'multideck-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.multideck_dexter_conversation_upload_context(
  p_conversation_id uuid,
  p_history_message_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_uploads jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not exists (
    select 1 from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = p_conversation_id
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_EndedAt" is null
  ) then
    raise exception 'This conversation does not exist or is outside your workspace.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(upload order by created_at desc), '[]'::jsonb)
  into v_uploads
  from (
    select distinct on (attachment.value ->> 'id')
      jsonb_build_object(
        'id', attachment.value ->> 'id',
        'type', 'uploaded_document',
        'title', attachment.value ->> 'title'
      ) as upload,
      message."AIMSG_CreatedAt" as created_at
    from public."AI_Messages" message
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(message."AIMSG_ContentJSON" -> 'attachments') = 'array'
        then message."AIMSG_ContentJSON" -> 'attachments' else '[]'::jsonb end
    ) attachment(value)
    join public."AI_DexterUploads" stored_upload
      on stored_upload."AIDexterUpload_ID"::text = attachment.value ->> 'id'
     and stored_upload."AIDexterUpload_CompanyID" = v_context.company_id
     and stored_upload."AIDexterUpload_UserID" = v_context.user_id
     and stored_upload."AIDexterUpload_StatusCode" = 'active'
    where message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_Role" = 'user'
      and attachment.value ->> 'type' = 'uploaded_document'
      and (p_history_message_ids is null or message."AIMSG_ID" = any(p_history_message_ids))
    order by attachment.value ->> 'id', message."AIMSG_CreatedAt" desc
  ) branch_uploads;
  return coalesce(v_uploads, '[]'::jsonb);
end;
$$;

revoke all on function public.multideck_dexter_conversation_upload_context(uuid, uuid[]) from public, anon;
grant execute on function public.multideck_dexter_conversation_upload_context(uuid, uuid[]) to authenticated;

create or replace function public._multideck_dexter_conversation_json(
  p_conversation_id uuid,
  p_user_id uuid,
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', conversation."AICNV_ID",
    'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
    'summary', coalesce(conversation."AICNV_SummaryText", ''),
    'updatedAt', conversation."AICNV_UpdatedAt",
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', message."AIMSG_ID",
          'role', message."AIMSG_Role",
          'content', message."AIMSG_ContentText",
          'createdAt', message."AIMSG_CreatedAt",
          'specialist', nullif(message."AIMSG_ContentJSON" ->> 'specialist', ''),
          'attachments', case
            when jsonb_typeof(message."AIMSG_ContentJSON" -> 'attachments') = 'array'
              then message."AIMSG_ContentJSON" -> 'attachments'
            else '[]'::jsonb
          end,
          'parentResponseMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,parentResponseMessageId}', ''),
          'pendingAction', case
            when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
              then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}'
            else null
          end,
          'reasoningSummary', nullif(message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}', ''),
          'responseToUserMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}', ''),
          'responseVersion', case
            when coalesce(message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}', '') ~ '^[1-9][0-9]*$'
              then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
            else null
          end
        )
        order by message."AIMSG_CreatedAt", message."AIMSG_ID"
      )
      from public."AI_Messages" message
      where message."AIMSG_ConversationID" = conversation."AICNV_ID"
        and message."AIMSG_ContentText" is not null
    ), '[]'::jsonb)
  )
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = p_company_id
    and conversation."AICNV_OwnerUserID" = p_user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');
$$;

comment on table public."AI_DexterUploads" is 'Private local files uploaded by an operator for evidence-grounded Dexter conversations.';

commit;
