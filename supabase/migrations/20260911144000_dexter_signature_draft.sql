-- Preserve the signature reviewed in every Dexter composer; send validates its current eligibility.
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
     or coalesce(p_draft ->> 'requestedAction', '') not in ('create_draft','send')
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
  if coalesce(v_current_delivery ->> 'status', 'draft') in ('sent', 'draft_created') then
    raise exception 'A completed email action cannot be edited.' using errcode = '22023';
  end if;

  v_draft := jsonb_strip_nulls(jsonb_build_object(
    'id', left(coalesce(p_draft ->> 'id', gen_random_uuid()::text), 80),
    'requestedAction', p_draft ->> 'requestedAction',
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
    'signature', case when jsonb_typeof(p_draft -> 'signature') = 'object' then jsonb_build_object(
      'enabled', coalesce((p_draft #>> '{signature,enabled}')::boolean, true),
      'templateId', nullif(p_draft #>> '{signature,templateId}', '')::uuid,
      'revision', nullif(p_draft #>> '{signature,revision}', '')::integer,
      'fingerprint', left(p_draft #>> '{signature,fingerprint}', 64)
    ) end,
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
