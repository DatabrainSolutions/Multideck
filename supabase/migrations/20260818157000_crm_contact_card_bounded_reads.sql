-- Bound Contact Card registers and detail history so list cost grows with the
-- requested page, not with every scan, exchange and automation run ever stored.

begin;

drop index if exists public."IX_CRM_ContactCards_Company_Updated";
drop index if exists public."IX_CRM_ContactCardExchanges_Card_At";
drop index if exists public."IX_CRM_ContactCardScans_Card_At";
drop index if exists public."IX_CRM_ContactCardAutomationRuns_Card_Started";

create index "IX_CRM_ContactCards_Company_Updated"
  on public."CRM_ContactCards" ("Company_ID", "ContactCard_UpdatedAt" desc, "ContactCard_ID" desc)
  where "ContactCard_DeletedAt" is null;

create index "IX_CRM_ContactCardExchanges_Card_At"
  on public."CRM_ContactCardExchanges" ("ContactCard_ID", "Exchange_At" desc, "Exchange_ID" desc);

create index "IX_CRM_ContactCardScans_Card_At"
  on public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_At" desc, "Scan_ID" desc);

create index "IX_CRM_ContactCardAutomationRuns_Card_Started"
  on public."CRM_ContactCardAutomationRuns" ("ContactCard_ID", "AutomationRun_StartedAt" desc, "AutomationRun_ID" desc);

create or replace function public.multideck_contact_cards_page(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null,
  p_automation_state text default null,
  p_sort_field text default 'updated',
  p_sort_direction text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_automation_state text := nullif(lower(btrim(coalesce(p_automation_state, ''))), '');
  v_sort_field text := case when lower(coalesce(p_sort_field, '')) in ('card', 'status', 'source', 'automation', 'activity', 'updated') then lower(p_sort_field) else 'updated' end;
  v_sort_desc boolean := lower(coalesce(p_sort_direction, 'desc')) <> 'asc';
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  perform public._crm_contact_card_require_permission('CRM.Read');

  with workspace_cards as materialized (
    select card.*
    from public."CRM_ContactCards" card
    where card."Company_ID" = v_context.company_id
      and card."ContactCard_DeletedAt" is null
  ), card_rows as materialized (
    select
      card.*,
      coalesce(automation."Automation_State", 'off') as register_automation_state,
      automation."Automation_AutoPausedReason" as register_auto_paused_reason,
      exists (
        select 1
        from public."CRM_ContactCardAutomationRuns" failed
        where failed."ContactCard_ID" = card."ContactCard_ID"
          and failed."AutomationRun_Status" = 'failed'
      ) as register_has_failures,
      latest_exchange."Exchange_At" as register_last_activity_at
    from workspace_cards card
    left join public."CRM_ContactCardAutomations" automation using ("ContactCard_ID")
    left join lateral (
      select exchange."Exchange_At"
      from public."CRM_ContactCardExchanges" exchange
      where exchange."ContactCard_ID" = card."ContactCard_ID"
      order by exchange."Exchange_At" desc, exchange."Exchange_ID" desc
      limit 1
    ) latest_exchange on true
    where (v_status is null or lower(card."ContactCard_Status") = v_status)
      and (
        v_automation_state is null
        or (v_automation_state = 'attention' and (
          automation."Automation_AutoPausedReason" is not null
          or exists (
            select 1 from public."CRM_ContactCardAutomationRuns" failed
            where failed."ContactCard_ID" = card."ContactCard_ID"
              and failed."AutomationRun_Status" = 'failed'
          )
        ))
        or (v_automation_state <> 'attention' and lower(coalesce(automation."Automation_State", 'off')) = v_automation_state)
      )
      and (
        v_search is null
        or lower(coalesce(card."ContactCard_Label", '')) like '%' || v_search || '%'
        or lower(coalesce(card."ContactCard_Context", '')) like '%' || v_search || '%'
        or lower(coalesce(card."ContactCard_LeadSource", '')) like '%' || v_search || '%'
        or lower(coalesce(card."ContactCard_Person"->>'fullName', '')) like '%' || v_search || '%'
        or lower(coalesce(card."ContactCard_Person"->>'company', '')) like '%' || v_search || '%'
        or lower(coalesce(card."ContactCard_Person"->>'email', '')) like '%' || v_search || '%'
      )
  ), page_cards as materialized (
    select *
    from card_rows
    order by
      case when v_sort_field = 'card' and not v_sort_desc then lower("ContactCard_Label") end asc nulls last,
      case when v_sort_field = 'card' and v_sort_desc then lower("ContactCard_Label") end desc nulls last,
      case when v_sort_field = 'status' and not v_sort_desc then lower("ContactCard_Status") end asc nulls last,
      case when v_sort_field = 'status' and v_sort_desc then lower("ContactCard_Status") end desc nulls last,
      case when v_sort_field = 'source' and not v_sort_desc then lower("ContactCard_LeadSource") end asc nulls last,
      case when v_sort_field = 'source' and v_sort_desc then lower("ContactCard_LeadSource") end desc nulls last,
      case when v_sort_field = 'automation' and not v_sort_desc then register_automation_state end asc nulls last,
      case when v_sort_field = 'automation' and v_sort_desc then register_automation_state end desc nulls last,
      case when v_sort_field = 'activity' and not v_sort_desc then register_last_activity_at end asc nulls last,
      case when v_sort_field = 'activity' and v_sort_desc then register_last_activity_at end desc nulls last,
      case when not v_sort_desc then "ContactCard_UpdatedAt" end asc,
      case when v_sort_desc then "ContactCard_UpdatedAt" end desc,
      "ContactCard_ID" desc
    limit v_limit offset v_offset
  ), selected_ids as materialized (
    select "ContactCard_ID" from page_cards
  ), workspace_summary as materialized (
    select
      count(*)::integer as total,
      count(*) filter (where card."ContactCard_Status" = 'published')::integer as live
    from workspace_cards card
  )
  select jsonb_build_object(
    'tenantName', coalesce((select "Company_Name" from public."cmp_Company" where "Company_ID" = v_context.company_id), 'Multideck'),
    'cards', coalesce((
      select jsonb_agg(to_jsonb(card) - 'register_automation_state' - 'register_auto_paused_reason' - 'register_has_failures' - 'register_last_activity_at' order by card."ContactCard_UpdatedAt" desc, card."ContactCard_ID" desc)
      from page_cards card
    ), '[]'::jsonb),
    'analytics', coalesce((
      select jsonb_agg(jsonb_build_object('ContactCard_ID', id."ContactCard_ID", 'Analytics', public._multideck_contact_card_analytics(id."ContactCard_ID")))
      from selected_ids id
    ), '[]'::jsonb),
    'automations', coalesce((
      select jsonb_agg(to_jsonb(automation))
      from public."CRM_ContactCardAutomations" automation
      where automation."ContactCard_ID" in (select "ContactCard_ID" from selected_ids)
    ), '[]'::jsonb),
    'conditions', '[]'::jsonb,
    'actions', '[]'::jsonb,
    'scans', '[]'::jsonb,
    'exchanges', coalesce((
      select jsonb_agg(to_jsonb(latest))
      from selected_ids id
      join lateral (
        select exchange.*
        from public."CRM_ContactCardExchanges" exchange
        where exchange."ContactCard_ID" = id."ContactCard_ID"
        order by exchange."Exchange_At" desc, exchange."Exchange_ID" desc
        limit 1
      ) latest on true
    ), '[]'::jsonb),
    'runs', '[]'::jsonb,
    'runSteps', '[]'::jsonb,
    'pipelines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pipeline."CRMPipeline_ID",
        'name', pipeline."CRMPipeline_Name",
        'stages', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', stage."CRMPipelineStage_ID",
            'name', stage."CRMPipelineStage_Name",
            'isDefaultEntry', stage."CRMPipelineStage_IsDefaultEntry"
          ) order by stage."CRMPipelineStage_SortOrder"), '[]'::jsonb)
          from public."CRM_PipelineStages" stage
          where stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID" and not stage."Is_Deleted"
        )
      ) order by pipeline."CRMPipeline_SortOrder")
      from public."CRM_Pipelines" pipeline
      where pipeline."Company_ID" = v_context.company_id and not pipeline."Is_Deleted"
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workspace_user."User_ID",
        'name', btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")),
        'email', workspace_user."User_Email"
      ) order by workspace_user."User_Firstname", workspace_user."User_Lastname")
      from public."cmp_Users" workspace_user
      where workspace_user."Company_ID" = v_context.company_id and workspace_user."Auth_User_ID" is not null
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'total', (select total from workspace_summary),
      'live', (select live from workspace_summary),
      'scans', (
        select count(*) from public."CRM_ContactCardScans" scan
        join workspace_cards card using ("ContactCard_ID")
      ),
      'exchanges', (
        select count(*) from public."CRM_ContactCardExchanges" exchange
        join workspace_cards card using ("ContactCard_ID")
      ),
      'leads', (
        select count(*) from public."CRM_ContactCardExchanges" exchange
        join workspace_cards card using ("ContactCard_ID")
        where exchange."Exchange_Outcome" = 'created'
      ),
      'needsAttention', (
        select count(*) from workspace_cards card
        left join public."CRM_ContactCardAutomations" automation using ("ContactCard_ID")
        where automation."Automation_AutoPausedReason" is not null
          or exists (
            select 1 from public."CRM_ContactCardAutomationRuns" failed
            where failed."ContactCard_ID" = card."ContactCard_ID"
              and failed."AutomationRun_Status" = 'failed'
          )
      )
    ),
    'page', jsonb_build_object(
      'offset', v_offset,
      'limit', v_limit,
      'total', (select count(*) from card_rows),
      'hasMore', v_offset + (select count(*) from page_cards) < (select count(*) from card_rows)
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_contact_card_detail(p_card_id uuid)
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
  perform public._crm_contact_card_require_permission('CRM.Read');

  if not exists (
    select 1 from public."CRM_ContactCards" card
    where card."ContactCard_ID" = p_card_id
      and card."Company_ID" = v_context.company_id
      and card."ContactCard_DeletedAt" is null
  ) then
    raise exception 'Contact card not found.' using errcode = 'P0002';
  end if;

  with selected_card as materialized (
    select card.* from public."CRM_ContactCards" card where card."ContactCard_ID" = p_card_id
  ), selected_runs as materialized (
    select run.*
    from public."CRM_ContactCardAutomationRuns" run
    where run."ContactCard_ID" = p_card_id
    order by run."AutomationRun_StartedAt" desc, run."AutomationRun_ID" desc
    limit 25
  )
  select jsonb_build_object(
    'tenantName', coalesce((select "Company_Name" from public."cmp_Company" where "Company_ID" = v_context.company_id), 'Multideck'),
    'cards', coalesce((select jsonb_agg(to_jsonb(card)) from selected_card card), '[]'::jsonb),
    'analytics', jsonb_build_array(jsonb_build_object('ContactCard_ID', p_card_id, 'Analytics', public._multideck_contact_card_analytics(p_card_id))),
    'automations', coalesce((select jsonb_agg(to_jsonb(automation)) from public."CRM_ContactCardAutomations" automation where automation."ContactCard_ID" = p_card_id), '[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(condition) order by condition."Condition_SortOrder") from public."CRM_ContactCardAutomationConditions" condition where condition."ContactCard_ID" = p_card_id), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(action) order by action."Action_SortOrder") from public."CRM_ContactCardAutomationActions" action where action."ContactCard_ID" = p_card_id), '[]'::jsonb),
    'scans', '[]'::jsonb,
    'exchanges', coalesce((
      select jsonb_agg(to_jsonb(exchange) order by exchange."Exchange_At")
      from (
        select row.* from public."CRM_ContactCardExchanges" row
        where row."ContactCard_ID" = p_card_id
        order by row."Exchange_At" desc, row."Exchange_ID" desc
        limit 20
      ) exchange
    ), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(run) order by run."AutomationRun_StartedAt" desc) from selected_runs run), '[]'::jsonb),
    'runSteps', coalesce((
      select jsonb_agg(to_jsonb(step) order by step."AutomationRun_ID", step."AutomationRunStep_SortOrder")
      from public."CRM_ContactCardAutomationRunSteps" step
      where step."AutomationRun_ID" in (select "AutomationRun_ID" from selected_runs)
    ), '[]'::jsonb),
    'pipelines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pipeline."CRMPipeline_ID",
        'name', pipeline."CRMPipeline_Name",
        'stages', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', stage."CRMPipelineStage_ID",
            'name', stage."CRMPipelineStage_Name",
            'isDefaultEntry', stage."CRMPipelineStage_IsDefaultEntry"
          ) order by stage."CRMPipelineStage_SortOrder"), '[]'::jsonb)
          from public."CRM_PipelineStages" stage
          where stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID" and not stage."Is_Deleted"
        )
      ) order by pipeline."CRMPipeline_SortOrder")
      from public."CRM_Pipelines" pipeline
      where pipeline."Company_ID" = v_context.company_id and not pipeline."Is_Deleted"
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workspace_user."User_ID",
        'name', btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")),
        'email', workspace_user."User_Email"
      ) order by workspace_user."User_Firstname", workspace_user."User_Lastname")
      from public."cmp_Users" workspace_user
      where workspace_user."Company_ID" = v_context.company_id and workspace_user."Auth_User_ID" is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.multideck_contact_cards_page(integer, integer, text, text, text, text, text) is
  'Permissioned Contact Card register with server search, filters, sorting, global summary and bounded page payloads.';
comment on function public.multideck_contact_card_detail(uuid) is
  'Permissioned Contact Card detail with full aggregate analytics and bounded recent exchange/run history.';

revoke all on function public.multideck_contact_cards_page(integer, integer, text, text, text, text, text) from public, anon;
revoke all on function public.multideck_contact_card_detail(uuid) from public, anon;
grant execute on function public.multideck_contact_cards_page(integer, integer, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.multideck_contact_card_detail(uuid) to authenticated, service_role;

commit;
