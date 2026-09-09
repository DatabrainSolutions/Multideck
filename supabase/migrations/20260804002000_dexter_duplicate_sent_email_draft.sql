create or replace function public.multideck_dexter_duplicate_sent_email_draft(
  p_message_id uuid
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
  v_new_message_id uuid := gen_random_uuid();
  v_new_draft jsonb;
  v_content jsonb;
  v_response_version integer;
begin
  select * into v_context from public._multideck_dexter_context();

  select message.* into v_message
  from public."AI_Messages" message
  join public."AI_Conversations" conversation
    on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_ID" = p_message_id
    and message."AIMSG_Role" = 'assistant'
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
  for update;
  if not found then
    raise exception 'This Dexter email draft is unavailable.' using errcode = 'P0002';
  end if;

  if coalesce(
    v_message."AIMSG_ContentJSON" #>> '{metadata,emailDraft,delivery,status}',
    'draft'
  ) <> 'sent' then
    raise exception 'Only a sent email can be copied into a new draft.' using errcode = '22023';
  end if;

  v_new_draft := jsonb_set(
    jsonb_set(
      v_message."AIMSG_ContentJSON" #> '{metadata,emailDraft}',
      '{id}',
      to_jsonb(gen_random_uuid()::text),
      true
    ),
    '{delivery}',
    jsonb_build_object('status', 'draft'),
    true
  );

  v_response_version := greatest(
    coalesce((v_message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer, 1) + 1,
    2
  );
  v_content := jsonb_set(
    jsonb_set(
      v_message."AIMSG_ContentJSON",
      '{metadata,emailDraft}',
      v_new_draft,
      true
    ),
    '{metadata,responseVersion}',
    to_jsonb(v_response_version),
    true
  );

  insert into public."AI_Messages" (
    "AIMSG_ID",
    "AIMSG_ConversationID",
    "AIMSG_ParentMessageID",
    "AIMSG_Role",
    "AIMSG_ModelID",
    "AIMSG_ContentText",
    "AIMSG_ContentJSON",
    "AIMSG_SecurityClass",
    "AIMSG_IsTrainingCandidate",
    "AIMSG_IsTrainingAllowed",
    "AIMSG_CreatedAt",
    "AIMSG_CreatedBy"
  )
  values (
    v_new_message_id,
    v_message."AIMSG_ConversationID",
    v_message."AIMSG_ParentMessageID",
    'assistant',
    v_message."AIMSG_ModelID",
    v_message."AIMSG_ContentText",
    v_content,
    v_message."AIMSG_SecurityClass",
    false,
    false,
    now(),
    v_context.user_id
  );

  return jsonb_build_object(
    'messageId', v_new_message_id,
    'draft', v_new_draft
  );
end;
$$;

revoke all on function public.multideck_dexter_duplicate_sent_email_draft(uuid)
  from public, anon;
grant execute on function public.multideck_dexter_duplicate_sent_email_draft(uuid)
  to authenticated;
