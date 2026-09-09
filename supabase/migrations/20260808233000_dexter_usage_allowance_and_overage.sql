-- Workspace-level Dexter allowance and optional pay-as-you-go enforcement.
-- The commercial allowance is pooled across the physical tenant. Billing
-- readiness is provisioned server-side; it is intentionally not writable by
-- the browser or by a generic Dexter action.

begin;

create table if not exists public."AI_DexterUsagePolicies" (
  "AIUsagePolicy_CompanyID" uuid primary key,
  "AIUsagePolicy_PlanCode" varchar(20) not null default '25',
  "AIUsagePolicy_IncludedGbp" numeric(12, 4) not null default 350,
  "AIUsagePolicy_PayAsYouGoEnabled" boolean not null default false,
  "AIUsagePolicy_BillingReady" boolean not null default false,
  "AIUsagePolicy_ExtraUsageLimitGbp" numeric(12, 4),
  "AIUsagePolicy_ExtraUsageRateMultiplier" numeric(8, 4) not null default 1,
  "AIUsagePolicy_UpdatedAt" timestamptz not null default now(),
  "AIUsagePolicy_UpdatedBy" uuid,
  constraint "CK_AI_DexterUsagePolicies_plan"
    check ("AIUsagePolicy_PlanCode" in ('25', '50', '75', 'enterprise')),
  constraint "CK_AI_DexterUsagePolicies_included"
    check ("AIUsagePolicy_IncludedGbp" >= 0),
  constraint "CK_AI_DexterUsagePolicies_extra_limit"
    check ("AIUsagePolicy_ExtraUsageLimitGbp" is null or "AIUsagePolicy_ExtraUsageLimitGbp" >= 0),
  constraint "CK_AI_DexterUsagePolicies_extra_rate"
    check ("AIUsagePolicy_ExtraUsageRateMultiplier" between 1 and 10)
);

alter table public."AI_DexterUsagePolicies" enable row level security;
revoke all on table public."AI_DexterUsagePolicies" from public, anon, authenticated;
grant select, insert, update, delete on table public."AI_DexterUsagePolicies" to service_role;

comment on table public."AI_DexterUsagePolicies" is
  'Server-managed pooled Dexter allowance and pay-as-you-go state for one company in a physical tenant project.';

-- This rate snapshot is recorded with each completed assistant message. It
-- uses the same uncached Luna/Terra rates as the internal usage screen, with a
-- fixed GBP conversion for a stable monthly ledger. Future rate changes affect
-- new messages only; historical usage never silently reprices itself.
create or replace function public._multideck_dexter_estimated_usage_gbp(
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns numeric
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select round(
    (
      greatest(coalesce(p_input_tokens, 0), 0)::numeric
        * case when lower(coalesce(p_model, 'fast')) = 'worker' then 2.00 else 0.80 end
      + greatest(coalesce(p_output_tokens, 0), 0)::numeric
        * case when lower(coalesce(p_model, 'fast')) = 'worker' then 12.00 else 4.80 end
    ) / 1000000,
    6
  );
$$;

revoke all on function public._multideck_dexter_estimated_usage_gbp(text, integer, integer)
  from public, anon, authenticated;

create or replace function public._multideck_dexter_record_message_cost()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new."AIMSG_Role" = 'assistant'
     and (new."AIMSG_TotalCostAmount" is null or new."AIMSG_TotalCostCurrencyCode" is null) then
    new."AIMSG_TotalCostAmount" := public._multideck_dexter_estimated_usage_gbp(
      new."AIMSG_ContentJSON" ->> 'model',
      new."AIMSG_PromptTokens",
      new."AIMSG_CompletionTokens"
    );
    new."AIMSG_TotalCostCurrencyCode" := 'GBP';
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_dexter_record_message_cost()
  from public, anon, authenticated;

drop trigger if exists "TR_AI_Messages_record_dexter_cost" on public."AI_Messages";
create trigger "TR_AI_Messages_record_dexter_cost"
  before insert or update of "AIMSG_PromptTokens", "AIMSG_CompletionTokens", "AIMSG_ContentJSON"
  on public."AI_Messages"
  for each row execute function public._multideck_dexter_record_message_cost();

update public."AI_Messages"
set
  "AIMSG_TotalCostAmount" = public._multideck_dexter_estimated_usage_gbp(
    "AIMSG_ContentJSON" ->> 'model',
    "AIMSG_PromptTokens",
    "AIMSG_CompletionTokens"
  ),
  "AIMSG_TotalCostCurrencyCode" = 'GBP'
where "AIMSG_Role" = 'assistant'
  and ("AIMSG_TotalCostAmount" is null or "AIMSG_TotalCostCurrencyCode" is null);

create or replace function public._multideck_dexter_allowance_state(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text := '25';
  v_included numeric := 350;
  v_payg_configured boolean := false;
  v_billing_ready boolean := false;
  v_payg_enabled boolean := false;
  v_payg_limit numeric := null;
  v_payg_rate numeric := 1;
  v_usage numeric := 0;
  v_extra numeric := 0;
  v_percent numeric := 0;
  v_allowed boolean := true;
  v_status text := 'included';
begin
  select
    policy."AIUsagePolicy_PlanCode",
    policy."AIUsagePolicy_IncludedGbp",
    policy."AIUsagePolicy_PayAsYouGoEnabled",
    policy."AIUsagePolicy_BillingReady",
    policy."AIUsagePolicy_ExtraUsageLimitGbp",
    policy."AIUsagePolicy_ExtraUsageRateMultiplier"
  into
    v_plan, v_included, v_payg_configured, v_billing_ready,
    v_payg_limit, v_payg_rate
  from public."AI_DexterUsagePolicies" policy
  where policy."AIUsagePolicy_CompanyID" = p_company_id;

  v_plan := coalesce(v_plan, '25');
  v_included := coalesce(v_included, 350);
  v_payg_configured := coalesce(v_payg_configured, false);
  v_billing_ready := coalesce(v_billing_ready, false);
  v_payg_rate := coalesce(v_payg_rate, 1);
  v_payg_enabled := v_payg_configured and v_billing_ready;

  select coalesce(sum(coalesce(
    message."AIMSG_TotalCostAmount",
    public._multideck_dexter_estimated_usage_gbp(
      message."AIMSG_ContentJSON" ->> 'model',
      message."AIMSG_PromptTokens",
      message."AIMSG_CompletionTokens"
    )
  )), 0)
  into v_usage
  from public."AI_Messages" message
  join public."AI_Conversations" conversation
    on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_Role" = 'assistant'
    and message."AIMSG_CreatedAt" >= date_trunc('month', now())
    and message."AIMSG_CreatedAt" < date_trunc('month', now()) + interval '1 month'
    and conversation."AICNV_CompanyID" = p_company_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  v_usage := round(coalesce(v_usage, 0), 6);
  v_extra := round(greatest(v_usage - v_included, 0) * v_payg_rate, 6);
  v_percent := case when v_included > 0 then round((v_usage / v_included) * 100, 2) else 100 end;
  v_allowed := v_usage < v_included
    or (v_payg_enabled and (v_payg_limit is null or v_extra < v_payg_limit));

  v_status := case
    when v_usage <= 0 then 'unused'
    when v_usage < v_included * 0.8 then 'included'
    when v_usage < v_included then 'near_limit'
    when not v_payg_enabled then 'paused'
    when v_payg_limit is not null and v_extra >= v_payg_limit then 'extra_limit_reached'
    else 'extra_usage'
  end;

  return jsonb_build_object(
    'planCode', v_plan,
    'currency', 'GBP',
    'includedUsageGbp', v_included,
    'usageGbp', v_usage,
    'includedUsageRemainingGbp', greatest(v_included - v_usage, 0),
    'includedUsagePercent', v_percent,
    'extraUsageConfigured', v_payg_configured,
    'billingReady', v_billing_ready,
    'extraUsageEnabled', v_payg_enabled,
    'extraUsageGbp', v_extra,
    'extraUsageLimitGbp', v_payg_limit,
    'extraUsageRemainingGbp', case
      when v_payg_limit is null then null
      else greatest(v_payg_limit - v_extra, 0)
    end,
    'usageStatus', v_status,
    'usageAllowed', v_allowed
  );
end;
$$;

revoke all on function public._multideck_dexter_allowance_state(uuid)
  from public, anon, authenticated;

create or replace function public.multideck_dexter_check_usage_allowance()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  return public._multideck_dexter_allowance_state(v_context.company_id);
end;
$$;

revoke all on function public.multideck_dexter_check_usage_allowance()
  from public, anon;
grant execute on function public.multideck_dexter_check_usage_allowance()
  to authenticated, service_role;

-- Return recorded model use plus the workspace's commercial allowance state.
create or replace function public.multideck_dexter_get_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_company_id uuid;
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
      coalesce(
        nullif(message."AIMSG_ContentJSON" #>> '{metadata,providerModel}', ''),
        case lower(coalesce(message."AIMSG_ContentJSON" ->> 'model', 'fast'))
          when 'worker' then 'gpt-5.6-terra'
          else 'gpt-5.6-luna'
        end
      ) as provider_model,
      case lower(coalesce(
        nullif(message."AIMSG_ContentJSON" #>> '{metadata,reasoningEffort}', ''),
        case lower(coalesce(message."AIMSG_ContentJSON" ->> 'model', 'fast'))
          when 'smart' then 'high'
          else 'medium'
        end
      ))
        when 'low' then 'low'
        when 'high' then 'high'
        when 'xhigh' then 'xhigh'
        else 'medium'
      end as reasoning_effort,
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
      coalesce(max(month.provider_model), lane.default_provider_model) as provider_model,
      coalesce(max(month.reasoning_effort), lane.default_reasoning_effort) as reasoning_effort,
      coalesce(sum(month.input_tokens), 0) as input_tokens,
      coalesce(sum(month.output_tokens), 0) as output_tokens
    from (
      values
        ('fast'::text, 1, 'gpt-5.6-luna'::text, 'medium'::text),
        ('smart', 2, 'gpt-5.6-luna', 'high'),
        ('worker', 3, 'gpt-5.6-terra', 'medium')
    ) as lane(model, position, default_provider_model, default_reasoning_effort)
    left join month_rows month on month.model = lane.model
    group by lane.model, lane.position, lane.default_provider_model, lane.default_reasoning_effort
  ),
  model_breakdown as (
    select jsonb_agg(
      jsonb_build_object(
        'model', model,
        'providerModel', provider_model,
        'reasoningEffort', reasoning_effort,
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

  return v_result || public._multideck_dexter_allowance_state(v_company_id);
end;
$$;

revoke all on function public.multideck_dexter_get_usage() from public, anon;
grant execute on function public.multideck_dexter_get_usage() to authenticated, service_role;

-- Dexter chat can inspect the allowance through its normal tenant-safe domain
-- path. Billing changes remain deliberately unsupported in chat.
create or replace function public.multideck_dexter_domain_usage(
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
  select case
    when exists (
      select 1 from public."cmp_Users" workspace_user
      where workspace_user."Auth_User_ID" = auth.uid()
        and workspace_user."Company_ID" = p_company_id
    ) then jsonb_build_array(
      public._multideck_dexter_allowance_state(p_company_id)
        || jsonb_build_object('recordId', p_company_id, 'scope', 'workspace')
    )
    else '[]'::jsonb
  end;
$$;

revoke all on function public.multideck_dexter_domain_usage(uuid, text, integer)
  from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
)
values (
  'usage', 'AI usage',
  'Current pooled Dexter allowance, included usage, optional extra usage and limit state.',
  'multideck_dexter_domain_usage', 95, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

-- Watching for you remains event-driven. A completed assistant message emits a
-- lightweight database signal only when a matching active watch exists.
insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder"
)
values (
  'usage', 'AI usage',
  'Dexter allowance percentage, extra usage and availability changes.',
  '["status","includedUsagePercent","usageGbp","extraUsageGbp","allowed"]'::jsonb,
  95
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public._multideck_dexter_usage_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_state jsonb;
begin
  if new."AIMSG_Role" <> 'assistant' then return new; end if;

  select conversation."AICNV_CompanyID"
  into v_company_id
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = new."AIMSG_ConversationID"
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'usage'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_company_id)
  ) then
    v_state := public._multideck_dexter_allowance_state(v_company_id);
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      v_company_id, 'usage', tg_table_name, v_company_id, '{}'::jsonb,
      jsonb_build_object(
        'status', v_state ->> 'usageStatus',
        'includedUsagePercent', (v_state ->> 'includedUsagePercent')::numeric,
        'usageGbp', (v_state ->> 'usageGbp')::numeric,
        'extraUsageGbp', (v_state ->> 'extraUsageGbp')::numeric,
        'allowed', (v_state ->> 'usageAllowed')::boolean
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public._multideck_dexter_usage_watch_signal()
  from public, anon, authenticated;

drop trigger if exists "TR_AI_Messages_dexter_usage_watch" on public."AI_Messages";
create trigger "TR_AI_Messages_dexter_usage_watch"
  after insert on public."AI_Messages"
  for each row execute function public._multideck_dexter_usage_watch_signal();

commit;
