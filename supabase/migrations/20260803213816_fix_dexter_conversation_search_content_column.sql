-- The persisted message body is AIMSG_ContentText. Repair the search function
-- without rewriting the already-applied migration history entry.
create or replace function public.multideck_dexter_search_conversations(
  p_query text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_result jsonb;
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  if v_query = '' then
    return public.multideck_dexter_list_conversations();
  end if;

  select coalesce(jsonb_agg(item.value order by item.updated_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'id', conversation."AICNV_ID",
        'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
        'summary', coalesce(conversation."AICNV_SummaryText", ''),
        'updatedAt', conversation."AICNV_UpdatedAt",
        'matchSnippet', coalesce(
          (
            select left(regexp_replace(message."AIMSG_ContentText", '[[:space:]]+', ' ', 'g'), 240)
            from public."AI_Messages" message
            where message."AIMSG_ConversationID" = conversation."AICNV_ID"
              and position(v_query in lower(coalesce(message."AIMSG_ContentText", ''))) > 0
            order by message."AIMSG_CreatedAt" desc
            limit 1
          ),
          coalesce(conversation."AICNV_SummaryText", '')
        )
      ) as value,
      conversation."AICNV_UpdatedAt" as updated_at
    from public."AI_Conversations" conversation
    where conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_OwnerUserID" = v_user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
      and (
        position(v_query in lower(coalesce(conversation."AICNV_Title", ''))) > 0
        or exists (
          select 1
          from public."AI_Messages" message
          where message."AIMSG_ConversationID" = conversation."AICNV_ID"
            and position(v_query in lower(coalesce(message."AIMSG_ContentText", ''))) > 0
        )
      )
    order by conversation."AICNV_UpdatedAt" desc
    limit v_limit
  ) item;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_search_conversations(text, integer) from public, anon;
grant execute on function public.multideck_dexter_search_conversations(text, integer) to authenticated, service_role;
