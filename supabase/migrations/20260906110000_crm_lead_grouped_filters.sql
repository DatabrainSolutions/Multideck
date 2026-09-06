-- Grouped lead filters use the same evaluator as Accounts and Quotes.
-- Preserve the original RPC for existing callers; filter before sorting/paging.
-- Read-only UI query: existing Dexter lead reads and deterministic watches remain unchanged.
begin;

create or replace function public.multideck_crm_lead_register_filtered_page(
  p_filter_query jsonb default null,
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

  if p_filter_query is not null and (
    jsonb_typeof(p_filter_query) <> 'object'
    or jsonb_typeof(p_filter_query -> 'groups') is distinct from 'array'
    or octet_length(p_filter_query::text) > 65536
  ) then
    raise exception 'Invalid lead filter query.' using errcode = '22023';
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
      and (p_filter_query is null or public.multideck_register_filter_matches(
        jsonb_build_object(
          'lead', lead_name,
          'contact', primary_contact_name,
          'email', primary_contact_email,
          'stage', status_code,
          'source', source_code,
          'owner', owner_id,
          'rating', rating_code,
          'follow-up', case
            when next_follow_up_at is null then jsonb_build_array('unscheduled')
            when is_open and next_follow_up_at < now() then jsonb_build_array('overdue', 'scheduled')
            else jsonb_build_array('scheduled') end,
          'value', case when value_amount is not null or open_opportunity_count > 0 then 'valued' else 'unvalued' end,
          'next-follow-up', next_follow_up_at,
          'created', created_at,
          'last-activity', last_activity_at,
          'trade-lane', trade_lane,
          'service', service_interest
        ), p_filter_query
      ))
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


revoke all on function public.multideck_crm_lead_register_filtered_page(jsonb,text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_crm_lead_register_filtered_page(jsonb,text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
