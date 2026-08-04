-- Development-facing usage detail. Costs are calculated in the client from the
-- explicit model route and current API price assumptions; this function only
-- returns the measured token totals for each route.
create or replace function public.multideck_dexter_get_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_company_id uuid;
  v_now timestamptz := now();
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_trend_start date := (date_trunc('week', now()) - interval '5 weeks')::date;
  v_result jsonb;
begin
  select context.company_id
  into v_company_id
  from public._multideck_dexter_context() context;

  with scoped_rows as (
    select
      message."AIMSG_ID" as id,
      coalesce(conversation."AICNV_Title", 'Dexter conversation') as title,
      case lower(coalesce(message."AIMSG_ContentJSON" ->> 'model', 'fast'))
        when 'smart' then 'smart'
        when 'worker' then 'worker'
        else 'fast'
      end as model,
      greatest(coalesce(message."AIMSG_PromptTokens", 0), 0) as input_tokens,
      greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0) as output_tokens,
      message."AIMSG_ConversationID" as conversation_id,
      message."AIMSG_CreatedAt" as created_at
    from public."AI_Messages" message
    join public."AI_Conversations" conversation
      on conversation."AICNV_ID" = message."AIMSG_ConversationID"
    where message."AIMSG_Role" = 'assistant'
      and message."AIMSG_CreatedAt" >= least(v_period_start, v_trend_start::timestamptz)
      and message."AIMSG_CreatedAt" < v_period_end
      and conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
  ),
  month_rows as (
    select * from scoped_rows where created_at >= v_period_start
  ),
  trend as (
    select jsonb_agg(
      jsonb_build_object(
        'weekStart', week.week_start,
        'actions', (select count(*) from scoped_rows row_data where row_data.created_at >= week.week_start::timestamptz and row_data.created_at < (week.week_start + 7)::timestamptz),
        'tokens', (select coalesce(sum(row_data.input_tokens + row_data.output_tokens), 0) from scoped_rows row_data where row_data.created_at >= week.week_start::timestamptz and row_data.created_at < (week.week_start + 7)::timestamptz)
      )
      order by week.week_start
    ) as value
    from (select v_trend_start + (series.index * 7) as week_start from generate_series(0, 5) series(index)) week
  ),
  model_totals as (
    select
      lane.model,
      lane.position,
      coalesce(sum(month.input_tokens), 0) as input_tokens,
      coalesce(sum(month.output_tokens), 0) as output_tokens
    from (values ('fast'::text, 1), ('smart', 2), ('worker', 3)) as lane(model, position)
    left join month_rows month on month.model = lane.model
    group by lane.model, lane.position
  ),
  model_breakdown as (
    select jsonb_agg(
      jsonb_build_object(
        'model', model,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'totalTokens', input_tokens + output_tokens
      )
      order by position
    ) as value
    from model_totals
  ),
  recent as (
    select coalesce(jsonb_agg(item.value order by item.created_at desc), '[]'::jsonb) as value
    from (
      select jsonb_build_object('id', month.id, 'title', month.title, 'inputTokens', month.input_tokens, 'outputTokens', month.output_tokens, 'totalTokens', month.input_tokens + month.output_tokens, 'createdAt', month.created_at) as value, month.created_at
      from month_rows month order by month.created_at desc limit 50
    ) item
  )
  select jsonb_build_object(
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'includedActionsLimit', 10000,
    'actionsUsed', (select count(*) from month_rows),
    'trackedActions', (select count(*) from month_rows where input_tokens + output_tokens > 0),
    'conversationCount', (select count(distinct conversation_id) from month_rows),
    'inputTokens', coalesce((select sum(input_tokens) from month_rows), 0),
    'outputTokens', coalesce((select sum(output_tokens) from month_rows), 0),
    'totalTokens', coalesce((select sum(input_tokens + output_tokens) from month_rows), 0),
    'modelBreakdown', coalesce((select value from model_breakdown), '[]'::jsonb),
    'trend', coalesce((select value from trend), '[]'::jsonb),
    'recentEntries', coalesce((select value from recent), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_get_usage() from public, anon;
grant execute on function public.multideck_dexter_get_usage() to authenticated, service_role;
