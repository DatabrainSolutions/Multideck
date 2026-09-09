begin;

-- A compact, operator-owned style profile. Raw sent-email bodies are selected
-- only inside the bounded generation call and are never persisted here.
create table if not exists public."AI_DexterWritingProfiles" (
  "AIDexterWritingProfile_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWritingProfile_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterWritingProfile_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterWritingProfile_IsEnabled" boolean not null default false,
  "AIDexterWritingProfile_StatusCode" varchar(24) not null default 'not_started',
  "AIDexterWritingProfile_ProfileText" text not null default '',
  "AIDexterWritingProfile_ProfileJSON" jsonb not null default '{}'::jsonb,
  "AIDexterWritingProfile_EligibleMessageCount" integer not null default 0,
  "AIDexterWritingProfile_AnalysedMessageCount" integer not null default 0,
  "AIDexterWritingProfile_ConsentAt" timestamptz,
  "AIDexterWritingProfile_LastSourceMessageAt" timestamptz,
  "AIDexterWritingProfile_LastCheckedAt" timestamptz,
  "AIDexterWritingProfile_LastGeneratedAt" timestamptz,
  "AIDexterWritingProfile_NextRefreshAt" timestamptz,
  "AIDexterWritingProfile_LastError" varchar(500),
  "AIDexterWritingProfile_GeneratorModel" varchar(120),
  "AIDexterWritingProfile_GeneratorVersion" varchar(120),
  "AIDexterWritingProfile_CreatedAt" timestamptz not null default now(),
  "AIDexterWritingProfile_UpdatedAt" timestamptz not null default now(),
  constraint "UX_AI_DexterWritingProfiles_owner" unique (
    "AIDexterWritingProfile_CompanyID",
    "AIDexterWritingProfile_UserID"
  ),
  constraint "CK_AI_DexterWritingProfiles_status" check (
    "AIDexterWritingProfile_StatusCode" in ('not_started','processing','ready','insufficient','error')
  ),
  constraint "CK_AI_DexterWritingProfiles_text" check (
    char_length("AIDexterWritingProfile_ProfileText") <= 2400
  ),
  constraint "CK_AI_DexterWritingProfiles_profile_object" check (
    jsonb_typeof("AIDexterWritingProfile_ProfileJSON") = 'object'
  ),
  constraint "CK_AI_DexterWritingProfiles_counts" check (
    "AIDexterWritingProfile_EligibleMessageCount" >= 0
    and "AIDexterWritingProfile_AnalysedMessageCount" >= 0
  )
);

create index if not exists "IX_AI_DexterWritingProfiles_due"
  on public."AI_DexterWritingProfiles" (
    "AIDexterWritingProfile_StatusCode",
    "AIDexterWritingProfile_IsEnabled",
    "AIDexterWritingProfile_NextRefreshAt"
  )
  where "AIDexterWritingProfile_IsEnabled";

create table if not exists public."AI_DexterWritingProfileAudit" (
  "AIDexterWritingAudit_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWritingAudit_ProfileID" uuid references public."AI_DexterWritingProfiles"("AIDexterWritingProfile_ID") on delete set null,
  "AIDexterWritingAudit_CompanyID" uuid not null,
  "AIDexterWritingAudit_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterWritingAudit_EventCode" varchar(40) not null,
  "AIDexterWritingAudit_StatusCode" varchar(24),
  "AIDexterWritingAudit_MessageCount" integer not null default 0,
  "AIDexterWritingAudit_CreatedAt" timestamptz not null default now(),
  constraint "CK_AI_DexterWritingProfileAudit_event" check (
    "AIDexterWritingAudit_EventCode" in ('consented','generated','refreshed','edited','enabled','disabled','reset','generation_failed','draft_prepared','email_sent','email_queued','email_failed')
  ),
  constraint "CK_AI_DexterWritingProfileAudit_count" check (
    "AIDexterWritingAudit_MessageCount" >= 0
  )
);

create index if not exists "IX_AI_DexterWritingProfileAudit_owner_created"
  on public."AI_DexterWritingProfileAudit" (
    "AIDexterWritingAudit_CompanyID",
    "AIDexterWritingAudit_UserID",
    "AIDexterWritingAudit_CreatedAt" desc
  );

alter table public."AI_DexterWritingProfiles" enable row level security;
alter table public."AI_DexterWritingProfileAudit" enable row level security;
revoke all on table public."AI_DexterWritingProfiles", public."AI_DexterWritingProfileAudit"
  from public, anon, authenticated;
grant all on table public."AI_DexterWritingProfiles", public."AI_DexterWritingProfileAudit"
  to service_role;

create or replace function public._multideck_dexter_writing_profile_audit(
  p_profile_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_event text,
  p_status text default null,
  p_message_count integer default 0
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public."AI_DexterWritingProfileAudit" (
    "AIDexterWritingAudit_ProfileID",
    "AIDexterWritingAudit_CompanyID",
    "AIDexterWritingAudit_UserID",
    "AIDexterWritingAudit_EventCode",
    "AIDexterWritingAudit_StatusCode",
    "AIDexterWritingAudit_MessageCount"
  ) values (
    p_profile_id,
    p_company_id,
    p_user_id,
    left(btrim(coalesce(p_event, '')), 40),
    nullif(left(btrim(coalesce(p_status, '')), 24), ''),
    greatest(coalesce(p_message_count, 0), 0)
  );
$$;

revoke all on function public._multideck_dexter_writing_profile_audit(uuid, uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public._multideck_dexter_writing_profile_audit(uuid, uuid, uuid, text, text, integer)
  to service_role;

create or replace function public._multideck_dexter_writing_profile_source_for(
  p_company_id uuid,
  p_user_id uuid,
  p_take integer default 40,
  p_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_take integer := least(greatest(coalesce(p_take, 40), 1), 40);
  v_result jsonb;
begin
  if not public._multideck_dexter_has_permission(p_user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(p_user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public."cmp_Users" profile
    where profile."User_ID" = p_user_id
      and profile."Company_ID" = p_company_id
  ) then
    raise exception 'This operator is outside the tenant workspace.' using errcode = '42501';
  end if;

  with permitted_mailboxes as materialized (
    select permitted.mailbox_id
    from public._multideck_dexter_email_mailboxes(p_user_id, p_company_id) permitted
  ),
  eligible as materialized (
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_ThreadID" as thread_id,
      message."CommMessage_BodyText" as body_text,
      coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") as occurred_at,
      coalesce(recipients.recipient_key, message."CommMessage_ThreadID"::text) as recipient_key,
      row_number() over (
        partition by message."CommMessage_ThreadID"
        order by coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") desc,
          message."CommMessage_ID" desc
      ) as thread_rank
    from public."Comm_Messages" message
    join permitted_mailboxes permitted on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."Comm_ProviderConnections" connection on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
    left join lateral (
      select min(recipient."CommRecipient_NormalizedAddress") as recipient_key
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" = 'to'
        and recipient."CommRecipient_IsExternal"
        and not recipient."CommRecipient_IsSuppressed"
    ) recipients on true
    where message."CommMessage_DirectionCode" = 'outbound'
      and not message."CommMessage_IsInbound"
      and message."CommMessage_StatusCode" in ('sent','delivered')
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsBodyRedacted"
      and nullif(btrim(message."CommMessage_BodyText"), '') is not null
      and char_length(btrim(message."CommMessage_BodyText")) between 40 and 12000
      and coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '12 months'
      and (p_after is null or coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") > p_after)
      and (
        (
          mailbox."CommMailbox_TypeCode" = 'personal'
          and mailbox."CommMailbox_UserID" = p_user_id
          and connection."CommConn_UserID" = p_user_id
        )
        or message."CommMessage_CreatedBy" = p_user_id
      )
      and lower(coalesce(message."CommMessage_Subject", '') || ' ' || left(message."CommMessage_BodyText", 800)) !~
        '(automatic reply|auto.?reply|out of office|undeliverable|delivery status|mail delivery|do.?not.?reply|no.?reply|newsletter|unsubscribe|password reset|verification code|support ticket)'
  ),
  diversified as materialized (
    select eligible.*,
      row_number() over (
        partition by eligible.recipient_key
        order by eligible.occurred_at desc, eligible.message_id desc
      ) as recipient_rank
    from eligible
    where thread_rank = 1
  ),
  selected as (
    select * from diversified
    order by recipient_rank, occurred_at desc, message_id desc
    limit v_take
  )
  select jsonb_build_object(
    'eligibleCount', (select count(*) from diversified),
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'messageId', selected.message_id,
          'bodyText', selected.body_text,
          'occurredAt', selected.occurred_at
        ) order by selected.occurred_at desc, selected.message_id desc
      ) from selected
    ), '[]'::jsonb),
    'latestMessageAt', (select max(occurred_at) from diversified)
  ) into v_result;

  return coalesce(v_result, jsonb_build_object('eligibleCount', 0, 'messages', '[]'::jsonb, 'latestMessageAt', null));
end;
$$;

revoke all on function public._multideck_dexter_writing_profile_source_for(uuid, uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public._multideck_dexter_writing_profile_source_for(uuid, uuid, integer, timestamptz)
  to service_role;

-- Raw source samples are available only to the privileged profile generator.
-- Browser roles manage the derived profile through the owner-scoped RPCs below.

create or replace function public.multideck_dexter_get_writing_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_profile public."AI_DexterWritingProfiles";
  v_source jsonb;
  v_exists boolean := false;
begin
  select * into v_context from public._multideck_dexter_context();
  select * into v_profile
  from public."AI_DexterWritingProfiles" profile
  where profile."AIDexterWritingProfile_CompanyID" = v_context.company_id
    and profile."AIDexterWritingProfile_UserID" = v_context.user_id;
  v_exists := found;

  begin
    v_source := public._multideck_dexter_writing_profile_source_for(v_context.company_id, v_context.user_id, 1, null);
  exception when insufficient_privilege then
    v_source := jsonb_build_object('eligibleCount', 0, 'messages', '[]'::jsonb, 'latestMessageAt', null);
  end;

  return jsonb_build_object(
    'exists', v_exists,
    'enabled', coalesce(v_profile."AIDexterWritingProfile_IsEnabled", false),
    'status', coalesce(v_profile."AIDexterWritingProfile_StatusCode", 'not_started'),
    'profileText', coalesce(v_profile."AIDexterWritingProfile_ProfileText", ''),
    'eligibleMessageCount', greatest(coalesce((v_source ->> 'eligibleCount')::integer, v_profile."AIDexterWritingProfile_EligibleMessageCount", 0), 0),
    'analysedMessageCount', coalesce(v_profile."AIDexterWritingProfile_AnalysedMessageCount", 0),
    'consentedAt', v_profile."AIDexterWritingProfile_ConsentAt",
    'lastGeneratedAt', v_profile."AIDexterWritingProfile_LastGeneratedAt",
    'nextRefreshAt', v_profile."AIDexterWritingProfile_NextRefreshAt",
    'lastError', v_profile."AIDexterWritingProfile_LastError"
  );
end;
$$;

revoke all on function public.multideck_dexter_get_writing_profile() from public, anon;
grant execute on function public.multideck_dexter_get_writing_profile() to authenticated;

create or replace function public.multideck_dexter_begin_writing_profile()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_profile_id uuid;
  v_already_consented boolean := false;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select profile."AIDexterWritingProfile_ConsentAt" is not null
  into v_already_consented
  from public."AI_DexterWritingProfiles" profile
  where profile."AIDexterWritingProfile_CompanyID" = v_context.company_id
    and profile."AIDexterWritingProfile_UserID" = v_context.user_id;

  insert into public."AI_DexterWritingProfiles" (
    "AIDexterWritingProfile_CompanyID",
    "AIDexterWritingProfile_UserID",
    "AIDexterWritingProfile_IsEnabled",
    "AIDexterWritingProfile_StatusCode",
    "AIDexterWritingProfile_ConsentAt",
    "AIDexterWritingProfile_LastError",
    "AIDexterWritingProfile_UpdatedAt"
  ) values (
    v_context.company_id,
    v_context.user_id,
    true,
    'processing',
    now(),
    null,
    now()
  )
  on conflict ("AIDexterWritingProfile_CompanyID", "AIDexterWritingProfile_UserID") do update
  set "AIDexterWritingProfile_IsEnabled" = true,
      "AIDexterWritingProfile_StatusCode" = 'processing',
      "AIDexterWritingProfile_ConsentAt" = coalesce(public."AI_DexterWritingProfiles"."AIDexterWritingProfile_ConsentAt", now()),
      "AIDexterWritingProfile_LastError" = null,
      "AIDexterWritingProfile_UpdatedAt" = now()
  returning "AIDexterWritingProfile_ID" into v_profile_id;

  if not coalesce(v_already_consented, false) then
    perform public._multideck_dexter_writing_profile_audit(
      v_profile_id, v_context.company_id, v_context.user_id, 'consented', 'processing', 0
    );
  end if;
  return public.multideck_dexter_get_writing_profile();
end;
$$;

revoke all on function public.multideck_dexter_begin_writing_profile() from public, anon;
grant execute on function public.multideck_dexter_begin_writing_profile() to authenticated;

create or replace function public.multideck_dexter_update_writing_profile(
  p_enabled boolean,
  p_profile_text text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_profile_id uuid;
  v_profile_text text := btrim(coalesce(p_profile_text, ''));
  v_event text;
begin
  select * into v_context from public._multideck_dexter_context();
  if char_length(v_profile_text) > 2400 then
    raise exception 'Keep the writing profile within 2,400 characters.' using errcode = '22023';
  end if;

  update public."AI_DexterWritingProfiles" profile
  set "AIDexterWritingProfile_IsEnabled" = coalesce(p_enabled, false),
      "AIDexterWritingProfile_ProfileText" = v_profile_text,
      "AIDexterWritingProfile_StatusCode" = case
        when v_profile_text = '' then 'not_started'
        else 'ready'
      end,
      "AIDexterWritingProfile_LastError" = null,
      "AIDexterWritingProfile_UpdatedAt" = now()
  where profile."AIDexterWritingProfile_CompanyID" = v_context.company_id
    and profile."AIDexterWritingProfile_UserID" = v_context.user_id
  returning profile."AIDexterWritingProfile_ID" into v_profile_id;

  if not found then
    raise exception 'Create your writing profile before editing it.' using errcode = 'P0002';
  end if;

  v_event := case when not coalesce(p_enabled, false) then 'disabled' else 'edited' end;
  perform public._multideck_dexter_writing_profile_audit(
    v_profile_id, v_context.company_id, v_context.user_id, v_event,
    case when v_profile_text = '' then 'not_started' else 'ready' end, 0
  );
  return public.multideck_dexter_get_writing_profile();
end;
$$;

revoke all on function public.multideck_dexter_update_writing_profile(boolean, text) from public, anon;
grant execute on function public.multideck_dexter_update_writing_profile(boolean, text) to authenticated;

create or replace function public.multideck_dexter_reset_writing_profile()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_profile_id uuid;
begin
  select * into v_context from public._multideck_dexter_context();
  delete from public."AI_DexterWritingProfiles" profile
  where profile."AIDexterWritingProfile_CompanyID" = v_context.company_id
    and profile."AIDexterWritingProfile_UserID" = v_context.user_id
  returning profile."AIDexterWritingProfile_ID" into v_profile_id;
  if v_profile_id is not null then
    perform public._multideck_dexter_writing_profile_audit(
      null, v_context.company_id, v_context.user_id, 'reset', 'not_started', 0
    );
  end if;
  return public.multideck_dexter_get_writing_profile();
end;
$$;

revoke all on function public.multideck_dexter_reset_writing_profile() from public, anon;
grant execute on function public.multideck_dexter_reset_writing_profile() to authenticated;

-- Narrow compose context for server-confirmed reply and reply-all fields. This
-- deliberately excludes message bodies; Dexter's existing email tools provide
-- content only when the operator has selected or searched for it.
create or replace function public.multideck_dexter_resolve_email_draft_source(
  p_message_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'messageId', message."CommMessage_ID",
    'threadId', message."CommMessage_ThreadID",
    'mailboxId', message."CommMessage_MailboxID",
    'mailboxAddress', coalesce(mailbox."CommMailbox_NormalizedAddress", mailbox."CommMailbox_Address", ''),
    'direction', message."CommMessage_DirectionCode",
    'subject', coalesce(message."CommMessage_Subject", ''),
    'from', coalesce((
      select jsonb_agg(jsonb_build_object(
        'address', recipient."CommRecipient_Address",
        'displayName', recipient."CommRecipient_DisplayNameSnapshot"
      ) order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID")
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" = 'from'
        and not recipient."CommRecipient_IsSuppressed"
    ), '[]'::jsonb),
    'to', coalesce((
      select jsonb_agg(jsonb_build_object(
        'address', recipient."CommRecipient_Address",
        'displayName', recipient."CommRecipient_DisplayNameSnapshot"
      ) order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID")
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" = 'to'
        and not recipient."CommRecipient_IsSuppressed"
    ), '[]'::jsonb),
    'cc', coalesce((
      select jsonb_agg(jsonb_build_object(
        'address', recipient."CommRecipient_Address",
        'displayName', recipient."CommRecipient_DisplayNameSnapshot"
      ) order by recipient."CommRecipient_CreatedAt", recipient."CommRecipient_ID")
      from public."Comm_MessageRecipients" recipient
      where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
        and recipient."CommRecipient_RecipientTypeCode" = 'cc'
        and not recipient."CommRecipient_IsSuppressed"
    ), '[]'::jsonb)
  ) into v_result
  from public."Comm_Messages" message
  join public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id) permitted
    on permitted.mailbox_id = message."CommMessage_MailboxID"
  join public."Comm_Mailboxes" mailbox
    on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
  where message."CommMessage_ID" = p_message_id
    and not message."CommMessage_IsDeleted"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsSpam"
    and not exists (
      select 1
      from public."Comm_MessageFolders" membership
      join public."Comm_MailFolders" folder
        on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
      where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
        and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash')
    );

  if v_result is null then
    raise exception 'This email update was not found.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_resolve_email_draft_source(uuid)
  from public, anon;
grant execute on function public.multideck_dexter_resolve_email_draft_source(uuid)
  to authenticated;

create or replace function public.multideck_dexter_record_writing_profile_event(
  p_event text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_profile_id uuid;
begin
  if p_event <> 'draft_prepared' then
    raise exception 'This writing-profile event is not supported.' using errcode = '22023';
  end if;
  select * into v_context from public._multideck_dexter_context();
  select profile."AIDexterWritingProfile_ID" into v_profile_id
  from public."AI_DexterWritingProfiles" profile
  where profile."AIDexterWritingProfile_CompanyID" = v_context.company_id
    and profile."AIDexterWritingProfile_UserID" = v_context.user_id;
  perform public._multideck_dexter_writing_profile_audit(
    v_profile_id, v_context.company_id, v_context.user_id, p_event, null, 0
  );
end;
$$;

revoke all on function public.multideck_dexter_record_writing_profile_event(text)
  from public, anon;
grant execute on function public.multideck_dexter_record_writing_profile_event(text)
  to authenticated;

-- Extend the saved conversation payload with a structured email draft while
-- keeping all existing response-version, attachment and reasoning metadata.
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
          'attachments', case when jsonb_typeof(message."AIMSG_ContentJSON" -> 'attachments') = 'array'
            then message."AIMSG_ContentJSON" -> 'attachments' else '[]'::jsonb end,
          'parentResponseMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,parentResponseMessageId}', ''),
          'pendingAction', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
            then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}' else null end,
          'reasoningSummary', nullif(message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}', ''),
          'emailAttachments', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}') = 'array'
            then message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}' else '[]'::jsonb end,
          'emailDraft', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
            then message."AIMSG_ContentJSON" #> '{metadata,emailDraft}' else null end,
          'responseToUserMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}', ''),
          'responseVersion', case when coalesce(message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}', '') ~ '^[1-9][0-9]*$'
            then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer else null end
        ) order by message."AIMSG_CreatedAt", message."AIMSG_ID"
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

create or replace function public.multideck_dexter_record_email_draft_delivery(
  p_message_id uuid,
  p_send_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_message public."AI_Messages";
  v_send public."Comm_SendRequests";
  v_status text;
begin
  select * into v_context from public._multideck_dexter_context();
  select message.* into v_message
  from public."AI_Messages" message
  join public."AI_Conversations" conversation on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_ID" = p_message_id
    and message."AIMSG_Role" = 'assistant'
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
  for update;
  if not found then
    raise exception 'This Dexter email draft is unavailable.' using errcode = 'P0002';
  end if;

  select send.* into v_send
  from public."Comm_SendRequests" send
  where send."CommSend_ID" = p_send_request_id
    and send."CommSend_RequestedBy" = v_context.user_id;
  if not found then
    raise exception 'This email send receipt is unavailable.' using errcode = 'P0002';
  end if;

  v_status := case lower(v_send."CommSend_StatusCode")
    when 'sent' then 'sent'
    when 'delivered' then 'sent'
    when 'failed' then 'failed'
    else 'queued'
  end;

  update public."AI_Messages"
  set "AIMSG_ContentJSON" = jsonb_set(
    "AIMSG_ContentJSON",
    '{metadata,emailDraft,delivery}',
    jsonb_strip_nulls(jsonb_build_object(
      'status', v_status,
      'sendRequestId', v_send."CommSend_ID",
      'messageId', v_send."CommSend_MessageID",
      'threadId', v_send."CommSend_ThreadID",
      'updatedAt', v_send."CommSend_UpdatedAt"
    )),
    true
  )
  where "AIMSG_ID" = p_message_id;

  perform public._multideck_dexter_writing_profile_audit(
    null, v_context.company_id, v_context.user_id,
    case v_status when 'sent' then 'email_sent' when 'failed' then 'email_failed' else 'email_queued' end,
    v_status, 0
  );

  return jsonb_build_object(
    'status', v_status,
    'sendRequestId', v_send."CommSend_ID",
    'messageId', v_send."CommSend_MessageID",
    'threadId', v_send."CommSend_ThreadID",
    'updatedAt', v_send."CommSend_UpdatedAt"
  );
end;
$$;

revoke all on function public.multideck_dexter_record_email_draft_delivery(uuid, uuid)
  from public, anon;
grant execute on function public.multideck_dexter_record_email_draft_delivery(uuid, uuid)
  to authenticated;

create or replace function public.multideck_dexter_update_email_draft(
  p_message_id uuid,
  p_draft jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_message public."AI_Messages";
  v_current_delivery jsonb;
  v_draft jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if jsonb_typeof(p_draft) <> 'object'
     or coalesce(p_draft ->> 'mode', '') not in ('new','reply','reply_all','forward')
     or jsonb_typeof(coalesce(p_draft -> 'to', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_draft -> 'cc', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_draft -> 'bcc', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_draft -> 'to', '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_draft -> 'cc', '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_draft -> 'bcc', '[]'::jsonb)) > 50
     or char_length(coalesce(p_draft ->> 'subject', '')) > 500
     or char_length(coalesce(p_draft ->> 'bodyText', '')) > 50000
     or pg_column_size(p_draft) > 100000 then
    raise exception 'This email draft is not valid.' using errcode = '22023';
  end if;

  select message.* into v_message
  from public."AI_Messages" message
  join public."AI_Conversations" conversation on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_ID" = p_message_id
    and message."AIMSG_Role" = 'assistant'
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
  for update;
  if not found then
    raise exception 'This Dexter email draft is unavailable.' using errcode = 'P0002';
  end if;

  v_current_delivery := coalesce(
    v_message."AIMSG_ContentJSON" #> '{metadata,emailDraft,delivery}',
    jsonb_build_object('status', 'draft')
  );
  if coalesce(v_current_delivery ->> 'status', 'draft') = 'sent' then
    raise exception 'A sent email cannot be edited.' using errcode = '22023';
  end if;

  v_draft := jsonb_strip_nulls(jsonb_build_object(
    'id', left(coalesce(p_draft ->> 'id', gen_random_uuid()::text), 80),
    'mode', p_draft ->> 'mode',
    'mailboxId', nullif(left(coalesce(p_draft ->> 'mailboxId', ''), 80), ''),
    'sourceMessageId', nullif(left(coalesce(p_draft ->> 'sourceMessageId', ''), 80), ''),
    'threadId', nullif(left(coalesce(p_draft ->> 'threadId', ''), 80), ''),
    'to', coalesce(p_draft -> 'to', '[]'::jsonb),
    'cc', coalesce(p_draft -> 'cc', '[]'::jsonb),
    'bcc', coalesce(p_draft -> 'bcc', '[]'::jsonb),
    'subject', left(coalesce(p_draft ->> 'subject', ''), 500),
    'bodyText', left(coalesce(p_draft ->> 'bodyText', ''), 50000),
    'trackOpens', coalesce((p_draft ->> 'trackOpens')::boolean, false),
    'delivery', v_current_delivery
  ));

  update public."AI_Messages"
  set "AIMSG_ContentJSON" = jsonb_set(
    "AIMSG_ContentJSON", '{metadata,emailDraft}', v_draft, true
  )
  where "AIMSG_ID" = p_message_id;
  return v_draft;
end;
$$;

revoke all on function public.multideck_dexter_update_email_draft(uuid, jsonb)
  from public, anon;
grant execute on function public.multideck_dexter_update_email_draft(uuid, jsonb)
  to authenticated;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'multideck_dexter_writing_profile_worker_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'multideck_dexter_writing_profile_worker_secret',
      'Authenticates the tenant-local Dexter writing-profile refresh worker.'
    );
  end if;
end;
$$;

create or replace function public."AI_GetDexterWritingProfileWorkerSecret"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'multideck_dexter_writing_profile_worker_secret'
  limit 1;
$$;

revoke all on function public."AI_GetDexterWritingProfileWorkerSecret"()
  from public, anon, authenticated;
grant execute on function public."AI_GetDexterWritingProfileWorkerSecret"()
  to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public."AI_ConfigureDexterWritingProfileSchedule"()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_job_id bigint;
begin
  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets
  where name = 'multideck_dexter_writing_profile_worker_endpoint'
  limit 1;

  if nullif(btrim(v_endpoint), '') is null then
    return false;
  end if;

  for v_job_id in
    select jobid from cron.job
    where jobname = 'multideck-dexter-writing-profile-refresh'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'multideck-dexter-writing-profile-refresh',
    '15 3 * * *',
    format(
      $command$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-multideck-writing-profile-secret', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'multideck_dexter_writing_profile_worker_secret'
              limit 1
            )
          ),
          body := jsonb_build_object('operation', 'monthly', 'requestedAt', now()),
          timeout_milliseconds := 55000
        );
      $command$,
      btrim(v_endpoint)
    )
  );

  return true;
end;
$$;

revoke all on function public."AI_ConfigureDexterWritingProfileSchedule"()
  from public, anon, authenticated, service_role;

-- Each tenant installs its own endpoint secret. The daily check performs work
-- only for profiles whose monthly refresh is due and have ten new messages.
select public."AI_ConfigureDexterWritingProfileSchedule"();

comment on table public."AI_DexterWritingProfiles" is
  'Private, operator-owned email style guidance derived with explicit consent. Raw source emails are never stored here.';
comment on function public._multideck_dexter_writing_profile_source_for(uuid, uuid, integer, timestamptz) is
  'Selects bounded, provably authored sent email for one operator. Private preferences do not emit Watching for you signals.';

commit;
