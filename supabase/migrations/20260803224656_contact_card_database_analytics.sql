-- Contact-card registers and analytics must be database-owned. The client receives
-- presentation-ready counts and buckets through the existing tenant-safe RPC.

begin;

create or replace function public._multideck_contact_card_analytics(p_card_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scans bigint := 0;
  v_unique_scans bigint := 0;
  v_started bigint := 0;
  v_exchanges bigint := 0;
  v_leads_created bigint := 0;
  v_leads_matched bigint := 0;
  v_runs_today bigint := 0;
  v_failed_runs bigint := 0;
  v_timeline_hour jsonb := '[]'::jsonb;
  v_timeline_day jsonb := '[]'::jsonb;
  v_devices jsonb := '[]'::jsonb;
  v_browsers jsonb := '[]'::jsonb;
  v_channels jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_suppressed_regions integer := 0;
  v_suppressed_scans bigint := 0;
  v_automation_outcomes jsonb := '[]'::jsonb;
begin
  select
    count(*),
    count(*) filter (where scan."Scan_StartedAt" is not null)
  into v_scans, v_started
  from public."CRM_ContactCardScans" scan
  where scan."ContactCard_ID" = p_card_id;

  select count(*)
  into v_unique_scans
  from (
    select ordered."Scan_At", ordered.previous_at
    from (
      select
        scan."Scan_At",
        lag(scan."Scan_At") over (
          partition by scan."Scan_Device", scan."Scan_Browser", scan."Scan_Region", scan."Scan_Country"
          order by scan."Scan_At"
        ) as previous_at
      from public."CRM_ContactCardScans" scan
      where scan."ContactCard_ID" = p_card_id
    ) ordered
    where ordered.previous_at is null
       or ordered."Scan_At" - ordered.previous_at > interval '30 minutes'
  ) visits;

  select
    count(*),
    count(*) filter (where exchange."Exchange_Outcome" = 'created'),
    count(*) filter (where exchange."Exchange_Outcome" = 'matched')
  into v_exchanges, v_leads_created, v_leads_matched
  from public."CRM_ContactCardExchanges" exchange
  where exchange."ContactCard_ID" = p_card_id;

  select
    count(*) filter (
      where not run."AutomationRun_IsTest"
        and run."AutomationRun_StartedAt" >= date_trunc('day', now())
        and run."AutomationRun_StartedAt" < date_trunc('day', now()) + interval '1 day'
    ),
    count(*) filter (where run."AutomationRun_Status" = 'failed')
  into v_runs_today, v_failed_runs
  from public."CRM_ContactCardAutomationRuns" run
  where run."ContactCard_ID" = p_card_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'iso', bucket.bucket,
    'scans', bucket.scans,
    'exchanges', bucket.exchanges
  ) order by bucket.bucket), '[]'::jsonb)
  into v_timeline_hour
  from (
    select
      date_trunc('hour', scan."Scan_At") as bucket,
      count(*) as scans,
      count(*) filter (where scan."Scan_ExchangedAt" is not null) as exchanges
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by date_trunc('hour', scan."Scan_At")
    order by bucket desc
    limit 168
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
    'iso', bucket.bucket,
    'scans', bucket.scans,
    'exchanges', bucket.exchanges
  ) order by bucket.bucket), '[]'::jsonb)
  into v_timeline_day
  from (
    select
      date_trunc('day', scan."Scan_At") as bucket,
      count(*) as scans,
      count(*) filter (where scan."Scan_ExchangedAt" is not null) as exchanges
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by date_trunc('day', scan."Scan_At")
    order by bucket desc
    limit 90
  ) bucket;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_devices
  from (
    select case scan."Scan_Device"
      when 'mobile' then 'Mobile'
      when 'tablet' then 'Tablet'
      when 'desktop' then 'Desktop'
      else 'Unknown'
    end as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by scan."Scan_Device"
  ) breakdown;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_browsers
  from (
    select coalesce(nullif(btrim(scan."Scan_Browser"), ''), 'Unknown') as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by coalesce(nullif(btrim(scan."Scan_Browser"), ''), 'Unknown')
  ) breakdown;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_scans = 0 then 0 else breakdown.value::numeric / v_scans end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_channels
  from (
    select case scan."Scan_Channel"
      when 'direct-scan' then 'Direct scan'
      when 'shared-link' then 'Shared link'
      when 'in-app-browser' then 'In-app browser'
      else 'Unknown'
    end as name, count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by scan."Scan_Channel"
  ) breakdown;

  with location_counts as (
    select
      coalesce(
        nullif(btrim(concat_ws(', ', nullif(btrim(scan."Scan_Region"), ''), nullif(btrim(scan."Scan_Country"), ''))), ''),
        'Unknown'
      ) as name,
      count(*) as value
    from public."CRM_ContactCardScans" scan
    where scan."ContactCard_ID" = p_card_id
    group by 1
  ), location_rollup as (
    select name, value from location_counts where value >= 5
    union all
    select 'Other regions', sum(value) from location_counts where value < 5
    having count(*) > 0
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'name', location_rollup.name,
      'value', location_rollup.value,
      'share', case when v_scans = 0 then 0 else location_rollup.value::numeric / v_scans end
    ) order by location_rollup.value desc, location_rollup.name), '[]'::jsonb),
    (select count(*)::integer from location_counts where value < 5),
    coalesce((select sum(value) from location_counts where value < 5), 0)
  into v_locations, v_suppressed_regions, v_suppressed_scans
  from location_rollup;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', breakdown.name,
    'value', breakdown.value,
    'share', case when v_exchanges = 0 then 0 else breakdown.value::numeric / v_exchanges end
  ) order by breakdown.value desc, breakdown.name), '[]'::jsonb)
  into v_automation_outcomes
  from (
    select case exchange."Exchange_AutomationOutcome"
      when 'ran' then 'Ran'
      when 'skipped' then 'Skipped by a condition'
      when 'failed' then 'Failed'
      else 'Automation off'
    end as name, count(*) as value
    from public."CRM_ContactCardExchanges" exchange
    where exchange."ContactCard_ID" = p_card_id
    group by exchange."Exchange_AutomationOutcome"
  ) breakdown;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'scans', v_scans,
      'uniqueScans', v_unique_scans,
      'started', v_started,
      'exchanges', v_exchanges,
      'leadsCreated', v_leads_created,
      'leadsMatched', v_leads_matched,
      'conversion', case when v_unique_scans = 0 then null else v_exchanges::numeric / v_unique_scans end
    ),
    'timelineHour', v_timeline_hour,
    'timelineDay', v_timeline_day,
    'devices', v_devices,
    'browsers', v_browsers,
    'channels', v_channels,
    'location', jsonb_build_object(
      'rows', v_locations,
      'suppressedRegions', v_suppressed_regions,
      'suppressedScans', v_suppressed_scans
    ),
    'automationOutcomes', v_automation_outcomes,
    'automationRunsToday', v_runs_today,
    'automationFailures', v_failed_runs
  );
end;
$$;

revoke all on function public._multideck_contact_card_analytics(uuid) from public, anon, authenticated;

create or replace function public.multideck_contact_cards_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select jsonb_build_object(
    'tenantName', coalesce((select "Company_Name" from public."cmp_Company" where "Company_ID" = v_context.company_id), 'Multideck'),
    'cards', coalesce((select jsonb_agg(to_jsonb(c) order by c."ContactCard_UpdatedAt" desc) from public."CRM_ContactCards" c where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'analytics', coalesce((select jsonb_agg(jsonb_build_object('ContactCard_ID', c."ContactCard_ID", 'Analytics', public._multideck_contact_card_analytics(c."ContactCard_ID")) order by c."ContactCard_UpdatedAt" desc) from public."CRM_ContactCards" c where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'automations', coalesce((select jsonb_agg(to_jsonb(a)) from public."CRM_ContactCardAutomations" a join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Condition_SortOrder") from public."CRM_ContactCardAutomationConditions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Action_SortOrder") from public."CRM_ContactCardAutomationActions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'scans', coalesce((select jsonb_agg(to_jsonb(s) order by s."Scan_At") from public."CRM_ContactCardScans" s join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'exchanges', coalesce((select jsonb_agg(to_jsonb(e) order by e."Exchange_At") from public."CRM_ContactCardExchanges" e join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r."AutomationRun_StartedAt" desc) from (select run.* from public."CRM_ContactCardAutomationRuns" run join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null order by run."AutomationRun_StartedAt" desc limit 200) r),'[]'::jsonb),
    'runSteps', coalesce((select jsonb_agg(to_jsonb(step) order by step."AutomationRunStep_SortOrder") from public."CRM_ContactCardAutomationRunSteps" step join public."CRM_ContactCardAutomationRuns" run using ("AutomationRun_ID") join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null and run."AutomationRun_StartedAt">now()-interval '90 days'),'[]'::jsonb),
    'pipelines', coalesce((select jsonb_agg(jsonb_build_object('id',p."CRMPipeline_ID",'name',p."CRMPipeline_Name",'stages',(select coalesce(jsonb_agg(jsonb_build_object('id',s."CRMPipelineStage_ID",'name',s."CRMPipelineStage_Name",'isDefaultEntry',s."CRMPipelineStage_IsDefaultEntry") order by s."CRMPipelineStage_SortOrder"),'[]'::jsonb) from public."CRM_PipelineStages" s where s."CRMPipeline_ID"=p."CRMPipeline_ID" and not s."Is_Deleted")) order by p."CRMPipeline_SortOrder") from public."CRM_Pipelines" p where p."Company_ID"=v_context.company_id and not p."Is_Deleted"),'[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id',u."User_ID",'name',btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),'email',u."User_Email") order by u."User_Firstname",u."User_Lastname") from public."cmp_Users" u where u."Company_ID"=v_context.company_id and u."Auth_User_ID" is not null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

comment on function public._multideck_contact_card_analytics(uuid) is
  'Private database-owned contact-card analytics used by the authenticated workspace RPC.';

commit;
