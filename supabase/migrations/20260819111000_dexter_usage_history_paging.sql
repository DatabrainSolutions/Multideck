begin;

create index if not exists "IX_AI_Messages_DexterUsagePage"
  on public."AI_Messages" ("AIMSG_CreatedAt" desc, "AIMSG_ID" desc)
  include ("AIMSG_ConversationID", "AIMSG_PromptTokens", "AIMSG_CompletionTokens")
  where "AIMSG_Role" = 'assistant';

create or replace function public.multideck_dexter_get_usage_history(
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_company_id uuid;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_sort text := case when lower(coalesce(p_sort, 'newest')) = 'heaviest' then 'heaviest' else 'newest' end;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  select context.company_id
  into v_company_id
  from public._multideck_dexter_context() context;

  select count(*)
  into v_total
  from public."AI_Messages" message
  join public."AI_Conversations" conversation
    on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_Role" = 'assistant'
    and message."AIMSG_CreatedAt" >= v_period_start
    and message."AIMSG_CreatedAt" < v_period_end
    and conversation."AICNV_CompanyID" = v_company_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  select coalesce(jsonb_agg(page.value order by page.position), '[]'::jsonb)
  into v_rows
  from (
    select
      row_number() over (order by
        case when v_sort = 'heaviest' then greatest(coalesce(message."AIMSG_PromptTokens", 0), 0) + greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0) end desc,
        message."AIMSG_CreatedAt" desc,
        message."AIMSG_ID" desc
      ) as position,
      jsonb_build_object(
        'id', message."AIMSG_ID",
        'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
        'inputTokens', greatest(coalesce(message."AIMSG_PromptTokens", 0), 0),
        'outputTokens', greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0),
        'totalTokens', greatest(coalesce(message."AIMSG_PromptTokens", 0), 0) + greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0),
        'createdAt', message."AIMSG_CreatedAt"
      ) as value
    from public."AI_Messages" message
    join public."AI_Conversations" conversation
      on conversation."AICNV_ID" = message."AIMSG_ConversationID"
    where message."AIMSG_Role" = 'assistant'
      and message."AIMSG_CreatedAt" >= v_period_start
      and message."AIMSG_CreatedAt" < v_period_end
      and conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
    order by
      case when v_sort = 'heaviest' then greatest(coalesce(message."AIMSG_PromptTokens", 0), 0) + greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0) end desc,
      message."AIMSG_CreatedAt" desc,
      message."AIMSG_ID" desc
    offset v_offset
    limit v_limit
  ) page;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'offset', v_offset,
    'limit', v_limit,
    'sort', v_sort
  );
end;
$$;

revoke all on function public.multideck_dexter_get_usage_history(text, integer, integer) from public, anon;
grant execute on function public.multideck_dexter_get_usage_history(text, integer, integer) to authenticated, service_role;

comment on function public.multideck_dexter_get_usage_history(text, integer, integer) is
  'Returns one exact, bounded page of the authenticated tenant workspace Dexter usage history. This changes Admin transport only and does not add a Dexter write or Watching capability.';

commit;
