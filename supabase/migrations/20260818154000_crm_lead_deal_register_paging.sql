-- Server-owned CRM registers.  These bounded reads filter and sort the
-- operator-visible rows before applying pagination, then hydrate only the
-- requested page so the existing lead/deal response contracts remain intact.

begin;

create or replace function public.multideck_crm_lead_register_page(
  p_search text default null,
  p_status_code text default null,
  p_owner_id uuid default null,
  p_unassigned boolean default false,
  p_source_code text default null,
  p_rating_code text default null,
  p_follow_up_scope text default null,
  p_value_scope text default null,
  p_open_only boolean default false,
  p_sort text default 'lead',
  p_direction text default 'asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_sort text := case
    when p_sort in ('lead', 'status', 'owner', 'source', 'rating', 'last-activity', 'next-follow-up', 'created', 'value') then p_sort
    else 'lead'
  end;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM leads.' using errcode = '42501';
  end if;

  with base as materialized (
    select
      lead."CRMLead_ID" as id,
      lead."CRMLead_EditVersion" as edit_version,
      coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead') as lead_name,
      lead."CRMLead_PersonName" as primary_contact_name,
      lead."CRMLead_Email" as primary_contact_email,
      lead."CRMLead_TradeLane" as trade_lane,
      lead."CRMLead_ServiceInterest" as service_interest,
      nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '') as owner_name,
      owner."User_Email" as owner_email,
      lead."CRMLead_OwnerUserID" as owner_id,
      lead."CRMLead_StatusCode" as status_code,
      status."CRMLeadStatus_Name" as status_name,
      lead."CRMLead_SourceCode" as source_code,
      source."CRMLeadSource_Name" as source_name,
      lead."CRMLead_RatingCode" as rating_code,
      rating."CRMLeadRating_Name" as rating_name,
      lead."CRMLead_LastInteractionAt" as last_activity_at,
      lead."CRMLead_NextActionDueAt" as next_follow_up_at,
      lead."CRMLead_CreatedAt" as created_at,
      lead."CRMLead_EstimatedValueAmount" as value_amount,
      lead."CRMLead_Score" as qualification_score,
      coalesce(open_opportunities.open_count, 0) as open_opportunity_count,
      status."CRMLeadStatus_IsOpen" as is_open,
      status."CRMLeadStatus_IsConverted" as is_converted,
      status."CRMLeadStatus_IsDisqualified" as is_disqualified
    from public."CRM_Leads" lead
    join public."sys_CRMLeadStatuses" status on status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode"
    join public."sys_CRMLeadSources" source on source."CRMLeadSource_Code" = lead."CRMLead_SourceCode"
    join public."sys_CRMLeadRatings" rating on rating."CRMLeadRating_Code" = lead."CRMLead_RatingCode"
    left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join lateral (
      select count(*)::integer as open_count
      from public."CRM_Opportunities" opportunity
      where opportunity."CRMOppty_SourceLeadID" = lead."CRMLead_ID"
        and not opportunity."CRMOppty_IsDeleted"
        and opportunity."CRMOppty_WonAt" is null
        and opportunity."CRMOppty_LostAt" is null
    ) open_opportunities on true
    where public._multideck_crm_lead_is_reachable(lead."CRMLead_ID", v_context.company_id)
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
  ), filtered as materialized (
    select *
    from base
    where (v_search is null or concat_ws(' ', lead_name, primary_contact_name, primary_contact_email, trade_lane, service_interest, owner_name, owner_email, status_name, source_name, rating_name) ilike '%' || v_search || '%')
      and (nullif(btrim(p_status_code), '') is null or status_code = p_status_code)
      and (p_owner_id is null or owner_id = p_owner_id)
      and (not p_unassigned or owner_id is null)
      and (nullif(btrim(p_source_code), '') is null or source_code = p_source_code)
      and (nullif(btrim(p_rating_code), '') is null or rating_code = p_rating_code)
      and (nullif(btrim(p_follow_up_scope), '') is null
        or (p_follow_up_scope = 'overdue' and is_open and next_follow_up_at is not null and next_follow_up_at < now())
        or (p_follow_up_scope = 'scheduled' and next_follow_up_at is not null)
        or (p_follow_up_scope = 'unscheduled' and next_follow_up_at is null))
      and (nullif(btrim(p_value_scope), '') is null
        or (p_value_scope = 'valued' and (value_amount is not null or open_opportunity_count > 0))
        or (p_value_scope = 'unvalued' and value_amount is null and open_opportunity_count = 0))
      and (not p_open_only or (is_open and not is_converted and not is_disqualified))
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_sort = 'lead' and v_direction = 'asc' then lower(lead_name) end asc,
        case when v_sort = 'lead' and v_direction = 'desc' then lower(lead_name) end desc,
        case when v_sort = 'status' and v_direction = 'asc' then lower(status_name) end asc nulls last,
        case when v_sort = 'status' and v_direction = 'desc' then lower(status_name) end desc nulls last,
        case when v_sort = 'owner' and v_direction = 'asc' then lower(owner_name) end asc nulls last,
        case when v_sort = 'owner' and v_direction = 'desc' then lower(owner_name) end desc nulls last,
        case when v_sort = 'source' and v_direction = 'asc' then lower(source_name) end asc nulls last,
        case when v_sort = 'source' and v_direction = 'desc' then lower(source_name) end desc nulls last,
        case when v_sort = 'rating' and v_direction = 'asc' then lower(rating_name) end asc nulls last,
        case when v_sort = 'rating' and v_direction = 'desc' then lower(rating_name) end desc nulls last,
        case when v_sort = 'last-activity' and v_direction = 'asc' then last_activity_at end asc nulls last,
        case when v_sort = 'last-activity' and v_direction = 'desc' then last_activity_at end desc nulls last,
        case when v_sort = 'next-follow-up' and v_direction = 'asc' then next_follow_up_at end asc nulls last,
        case when v_sort = 'next-follow-up' and v_direction = 'desc' then next_follow_up_at end desc nulls last,
        case when v_sort = 'created' and v_direction = 'asc' then created_at end asc nulls last,
        case when v_sort = 'created' and v_direction = 'desc' then created_at end desc nulls last,
        case when v_sort = 'value' and v_direction = 'asc' then value_amount end asc nulls last,
        case when v_sort = 'value' and v_direction = 'desc' then value_amount end desc nulls last,
        lower(lead_name), id
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked
    where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(
      public._multideck_crm_lead_json(item.id)
        || jsonb_build_object('editVersion', item.edit_version)
        || coalesce(public._multideck_crm_lead_transfer_state(item.id), '{}'::jsonb)
      order by item.ordinal
    ) from page item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', coalesce((select jsonb_build_object(
      'leads', count(*),
      'open', count(*) filter (where is_open),
      'converted', count(*) filter (where is_converted),
      'disqualified', count(*) filter (where is_disqualified),
      'unassigned', count(*) filter (where owner_id is null),
      'dueFollowUps', count(*) filter (where is_open and next_follow_up_at is not null and next_follow_up_at <= now()),
      'valued', count(*) filter (where value_amount is not null or open_opportunity_count > 0),
      'recent', count(*) filter (where created_at >= now() - interval '30 days'),
      'qualified', count(*) filter (where qualification_score >= 70),
      'estimatedValue', coalesce(sum(value_amount), 0)
    ) from base), '{}'::jsonb),
    'facets', jsonb_build_object(
      'statuses', coalesce((select jsonb_agg(jsonb_build_object('code', status_code, 'name', status_name) order by status_name) from (select distinct status_code, status_name from base) valueset), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('code', source_code, 'name', source_name) order by source_name) from (select distinct source_code, source_name from base) valueset), '[]'::jsonb),
      'ratings', coalesce((select jsonb_agg(jsonb_build_object('code', rating_code, 'name', rating_name) order by rating_name) from (select distinct rating_code, rating_name from base) valueset), '[]'::jsonb),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('id', owner_id, 'name', owner_name) order by owner_name) from (select distinct owner_id, owner_name from base where owner_id is not null and owner_name is not null) valueset), '[]'::jsonb),
      'hasUnassigned', exists(select 1 from base where owner_id is null)
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_deal_register_page(
  p_search text default null,
  p_status_code text default null,
  p_pipeline_id uuid default null,
  p_pipeline_stage_id uuid default null,
  p_owner_id uuid default null,
  p_unassigned boolean default false,
  p_open_only boolean default false,
  p_sort text default 'deal',
  p_direction text default 'asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_sort text := case
    when p_sort in ('deal', 'company', 'pipeline', 'stage', 'status', 'owner', 'close-date', 'value', 'created') then p_sort
    else 'deal'
  end;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM deals.' using errcode = '42501';
  end if;

  with base as materialized (
    select
      deal."CRMOppty_ID" as id,
      deal."CRMOppty_EditVersion" as edit_version,
      deal."CRMOppty_Name" as deal_name,
      coalesce(nullif(btrim(source_lead."CRMLead_CompanyName"), ''), nullif(btrim(organisation."Org_Name"), ''), 'Organisation') as company_name,
      pipeline."CRMPipeline_ID" as pipeline_id,
      pipeline."CRMPipeline_Name" as pipeline_name,
      pipeline_stage."CRMPipelineStage_ID" as pipeline_stage_id,
      pipeline_stage."CRMPipelineStage_Name" as pipeline_stage_name,
      pipeline_stage."CRMPipelineStage_SortOrder" as pipeline_stage_order,
      deal."CRMOppty_StatusCode" as status_code,
      opportunity_status."CRMOpptyStatus_Name" as status_name,
      deal."CRMOppty_OwnerUserID" as owner_id,
      nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '') as owner_name,
      deal."CRMOppty_ExpectedCloseDate" as expected_close_date,
      deal."CRMOppty_ExpectedValueAmount" as expected_value_amount,
      deal."CRMOppty_ProbabilityPct" as probability_pct,
      deal."CRMOppty_CreatedAt" as created_at,
      deal."CRMOppty_WonAt" as won_at,
      deal."CRMOppty_LostAt" as lost_at
    from public."CRM_Opportunities" deal
    join public."CRM_Pipelines" pipeline on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
      and pipeline."Company_ID" = v_context.company_id and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" pipeline_stage on pipeline_stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
      and pipeline_stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID" and not pipeline_stage."Is_Deleted"
    join public."sys_CRMOpportunityStatuses" opportunity_status on opportunity_status."CRMOpptyStatus_Code" = deal."CRMOppty_StatusCode"
    left join public."CRM_Leads" source_lead on source_lead."CRMLead_ID" = deal."CRMOppty_SourceLeadID"
    left join public."Org_Master" organisation on organisation."Org_id" = deal."CRMOppty_OrgID"
    left join public."cmp_Users" owner on owner."User_ID" = deal."CRMOppty_OwnerUserID"
    where public._multideck_crm_deal_is_operator_visible(deal."CRMOppty_ID", v_context.company_id)
  ), filtered as materialized (
    select *
    from base
    where (v_search is null or concat_ws(' ', deal_name, company_name, pipeline_name, pipeline_stage_name, status_name, owner_name) ilike '%' || v_search || '%')
      and (nullif(btrim(p_status_code), '') is null or status_code = p_status_code)
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id)
      and (p_pipeline_stage_id is null or pipeline_stage_id = p_pipeline_stage_id)
      and (p_owner_id is null or owner_id = p_owner_id)
      and (not p_unassigned or owner_id is null)
      and (not p_open_only or (won_at is null and lost_at is null))
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_sort = 'deal' and v_direction = 'asc' then lower(deal_name) end asc nulls last,
        case when v_sort = 'deal' and v_direction = 'desc' then lower(deal_name) end desc nulls last,
        case when v_sort = 'company' and v_direction = 'asc' then lower(company_name) end asc nulls last,
        case when v_sort = 'company' and v_direction = 'desc' then lower(company_name) end desc nulls last,
        case when v_sort = 'pipeline' and v_direction = 'asc' then lower(pipeline_name) end asc nulls last,
        case when v_sort = 'pipeline' and v_direction = 'desc' then lower(pipeline_name) end desc nulls last,
        case when v_sort = 'stage' and v_direction = 'asc' then pipeline_stage_order end asc nulls last,
        case when v_sort = 'stage' and v_direction = 'desc' then pipeline_stage_order end desc nulls last,
        case when v_sort = 'status' and v_direction = 'asc' then lower(status_name) end asc nulls last,
        case when v_sort = 'status' and v_direction = 'desc' then lower(status_name) end desc nulls last,
        case when v_sort = 'owner' and v_direction = 'asc' then lower(owner_name) end asc nulls last,
        case when v_sort = 'owner' and v_direction = 'desc' then lower(owner_name) end desc nulls last,
        case when v_sort = 'close-date' and v_direction = 'asc' then expected_close_date end asc nulls last,
        case when v_sort = 'close-date' and v_direction = 'desc' then expected_close_date end desc nulls last,
        case when v_sort = 'value' and v_direction = 'asc' then expected_value_amount end asc nulls last,
        case when v_sort = 'value' and v_direction = 'desc' then expected_value_amount end desc nulls last,
        case when v_sort = 'created' and v_direction = 'asc' then created_at end asc nulls last,
        case when v_sort = 'created' and v_direction = 'desc' then created_at end desc nulls last,
        lower(deal_name), id
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked
    where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(
      public._multideck_crm_deal_json(item.id, v_context.company_id)
        || jsonb_build_object('editVersion', item.edit_version)
        || coalesce(public._multideck_crm_deal_conversion_state(item.id), '{}'::jsonb)
      order by item.ordinal
    ) from page item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', coalesce((select jsonb_build_object(
      'deals', count(*),
      'open', count(*) filter (where won_at is null and lost_at is null),
      'won', count(*) filter (where won_at is not null),
      'lost', count(*) filter (where lost_at is not null),
      'unassigned', count(*) filter (where owner_id is null),
      'pipelineValue', coalesce(sum(expected_value_amount) filter (where won_at is null and lost_at is null), 0),
      'weightedPipelineValue', coalesce(sum(expected_value_amount * coalesce(probability_pct, 0) / 100) filter (where won_at is null and lost_at is null), 0),
      'byStage', coalesce((select jsonb_agg(jsonb_build_object(
        'id', stage_group.pipeline_stage_id,
        'name', stage_group.pipeline_stage_name,
        'count', stage_group.stage_count,
        'value', stage_group.stage_value
      ) order by stage_group.pipeline_stage_order, stage_group.pipeline_stage_name)
      from (
        select pipeline_stage_id, pipeline_stage_name, min(pipeline_stage_order) as pipeline_stage_order,
          count(*) as stage_count,
          coalesce(sum(expected_value_amount), 0) as stage_value
        from filtered
        group by pipeline_stage_id, pipeline_stage_name
      ) stage_group), '[]'::jsonb)
    ) from filtered), '{}'::jsonb),
    'facets', jsonb_build_object(
      'pipelines', coalesce((select jsonb_agg(jsonb_build_object('id', pipeline_id, 'name', pipeline_name) order by pipeline_name) from (select distinct pipeline_id, pipeline_name from base) valueset), '[]'::jsonb),
      'stages', coalesce((select jsonb_agg(jsonb_build_object('id', pipeline_stage_id, 'name', pipeline_stage_name, 'pipelineId', pipeline_id) order by pipeline_stage_order, pipeline_stage_name) from (select distinct pipeline_stage_id, pipeline_stage_name, pipeline_id, pipeline_stage_order from base) valueset), '[]'::jsonb),
      'statuses', coalesce((select jsonb_agg(jsonb_build_object('code', status_code, 'name', status_name) order by status_name) from (select distinct status_code, status_name from base) valueset), '[]'::jsonb),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('id', owner_id, 'name', owner_name) order by owner_name) from (select distinct owner_id, owner_name from base where owner_id is not null and owner_name is not null) valueset), '[]'::jsonb),
      'hasUnassigned', exists(select 1 from base where owner_id is null)
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_get_deal_essential(p_deal_id uuid)
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
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM deals.' using errcode = '42501';
  end if;
  if not public._multideck_crm_deal_is_operator_visible(p_deal_id, v_context.company_id) then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;
  select public._multideck_crm_deal_json(p_deal_id, v_context.company_id)
    || jsonb_build_object('editVersion', deal."CRMOppty_EditVersion")
    || coalesce(public._multideck_crm_deal_conversion_state(p_deal_id), '{}'::jsonb)
    into v_result
  from public."CRM_Opportunities" deal
  where deal."CRMOppty_ID" = p_deal_id;
  return v_result;
end;
$$;

revoke all on function public.multideck_crm_lead_register_page(text, text, uuid, boolean, text, text, text, text, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.multideck_crm_deal_register_page(text, text, uuid, uuid, uuid, boolean, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.multideck_crm_get_deal_essential(uuid) from public, anon;
grant execute on function public.multideck_crm_lead_register_page(text, text, uuid, boolean, text, text, text, text, boolean, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.multideck_crm_deal_register_page(text, text, uuid, uuid, uuid, boolean, boolean, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.multideck_crm_get_deal_essential(uuid) to authenticated, service_role;

commit;
