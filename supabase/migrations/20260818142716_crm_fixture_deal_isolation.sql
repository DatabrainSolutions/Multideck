-- Quarantine development fixtures at the CRM data boundary. A fixture-linked
-- lead or deal must not appear in operator reads, dashboard totals, Dexter,
-- Watching for you, or any browser-authorised write path.
begin;

create or replace function public._multideck_crm_deal_is_fixture(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_Opportunities" deal
    left join public."CRM_Leads" source_lead
      on source_lead."CRMLead_ID" = deal."CRMOppty_SourceLeadID"
    where deal."CRMOppty_ID" = p_deal_id
      and (
        lower(coalesce(deal."CRMOppty_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
        or lower(coalesce(deal."CRMOppty_MetadataJSON" ->> 'isDemo', 'false')) = 'true'
        or deal."CRMOppty_MetadataJSON" ->> 'seed' = 'multideck-development-crm-deals-v1'
        or lower(coalesce(source_lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) = 'true'
        or exists (
          select 1
          from public."CRM_AccountProfiles" fixture
          where not fixture."CRMAccount_IsDeleted"
            and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
            and (
              fixture."CRMAccount_ID" = deal."CRMOppty_AccountID"
              or fixture."CRMAccount_OrgID" = deal."CRMOppty_OrgID"
            )
        )
      )
  )
$$;

create or replace function public._multideck_crm_deal_is_operator_visible(
  p_deal_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_Opportunities" deal
    join public."CRM_Pipelines" pipeline
      on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
     and pipeline."Company_ID" = p_company_id
     and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" stage
      on stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
     and stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
     and not stage."Is_Deleted"
    where deal."CRMOppty_ID" = p_deal_id
      and not deal."CRMOppty_IsDeleted"
      and not public._multideck_crm_deal_is_fixture(deal."CRMOppty_ID")
  )
$$;

-- RLS policies cannot safely call a private helper directly because callers
-- still need EXECUTE on functions referenced by a policy. Expose only a
-- current-user boolean that binds the check to auth.uid(), CRM.Read and the
-- caller's own company.
create or replace function public.multideck_crm_deal_is_visible(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce((
    select public._multideck_crm_deal_is_operator_visible(
      p_deal_id,
      workspace_user."Company_ID"
    )
    from public."cmp_Users" workspace_user
    where workspace_user."Auth_User_ID" = auth.uid()
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and public._multideck_crm_has_permission(workspace_user."User_ID", 'CRM.Read')
    limit 1
  ), false)
$$;

-- Demo leads without an organisation were previously reachable through their
-- owner. Keep the company boundary and add the missing explicit demo guard.
create or replace function public._multideck_crm_lead_is_reachable(
  p_lead_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner
      on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join public."cmp_Users" creator
      on creator."User_ID" = lead."CRMLead_CreatedBy"
    where lead."CRMLead_ID" = p_lead_id
      and not lead."CRMLead_IsDeleted"
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
      and (
        (
          lead."CRMLead_OrgID" is not null
          and public.multideck_crm_company_can_access_account(p_company_id, lead."CRMLead_OrgID")
        )
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is not null
          and owner."Company_ID" = p_company_id
          and coalesce(owner."User_AccessStatus", 'active') = 'active'
        )
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is null
          and creator."Company_ID" = p_company_id
          and coalesce(creator."User_AccessStatus", 'active') = 'active'
        )
      )
  )
$$;

-- Preserve the mature response builders, but put a final visibility check in
-- front of every public record projection.
alter function public._multideck_crm_deal_json(uuid, uuid)
  rename to _multideck_crm_deal_json_unfiltered_20260818;

create function public._multideck_crm_deal_json(p_deal_id uuid, p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public._multideck_crm_deal_is_operator_visible(p_deal_id, p_company_id)
      then public._multideck_crm_deal_json_unfiltered_20260818(p_deal_id, p_company_id)
    else null
  end
$$;

alter function public.multideck_crm_list_deals()
  rename to _multideck_crm_list_deals_unfiltered_20260818;

create function public.multideck_crm_list_deals()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_rows jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  v_rows := public._multideck_crm_list_deals_unfiltered_20260818();

  return coalesce((
    select jsonb_agg(entry.item order by entry.ordinal)
    from jsonb_array_elements(v_rows) with ordinality entry(item, ordinal)
    where jsonb_typeof(entry.item) = 'object'
      and nullif(entry.item ->> 'id', '') is not null
      and public._multideck_crm_deal_is_operator_visible(
        (entry.item ->> 'id')::uuid,
        v_context.company_id
      )
  ), '[]'::jsonb);
end;
$$;

alter function public.multideck_crm_list_deals_essential()
  rename to _multideck_crm_list_deals_essential_unfiltered_visible_20260818;

create function public.multideck_crm_list_deals_essential()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_rows jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  v_rows := public._multideck_crm_list_deals_essential_unfiltered_visible_20260818();

  return coalesce((
    select jsonb_agg(entry.item order by entry.ordinal)
    from jsonb_array_elements(v_rows) with ordinality entry(item, ordinal)
    where jsonb_typeof(entry.item) = 'object'
      and nullif(entry.item ->> 'id', '') is not null
      and public._multideck_crm_deal_is_operator_visible(
        (entry.item ->> 'id')::uuid,
        v_context.company_id
      )
  ), '[]'::jsonb);
end;
$$;

-- Replace every deal-derived dashboard value after the existing dashboard has
-- built its lead/location content. This keeps the established response contract
-- while preventing fixtures from affecting totals, stages or activity.
alter function public.multideck_crm_get_dashboard(integer, text)
  rename to _multideck_crm_get_dashboard_unfiltered_deals_20260818;

create function public.multideck_crm_get_dashboard(
  p_inactivity_days integer default 90,
  p_area text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
  v_summary jsonb;
  v_pipeline jsonb;
  v_activity jsonb;
  v_open_deals bigint;
  v_pipeline_value numeric;
  v_currency_code text;
begin
  select * into v_context from public._multideck_crm_context();
  v_result := public._multideck_crm_get_dashboard_unfiltered_deals_20260818(
    p_inactivity_days,
    p_area
  );

  with visible_deals as (
    select
      opportunity.*,
      stage."CRMPipelineStage_Name" as pipeline_stage_name,
      stage."CRMPipelineStage_SortOrder" as pipeline_stage_order,
      pipeline."CRMPipeline_Name" as pipeline_name
    from public."CRM_Opportunities" opportunity
    join public."CRM_Pipelines" pipeline
      on pipeline."CRMPipeline_ID" = opportunity."CRMOppty_PipelineID"
     and pipeline."Company_ID" = v_context.company_id
     and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" stage
      on stage."CRMPipelineStage_ID" = opportunity."CRMOppty_PipelineStageID"
     and stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
     and not stage."Is_Deleted"
    where public._multideck_crm_deal_is_operator_visible(
      opportunity."CRMOppty_ID",
      v_context.company_id
    )
  ), open_deals as (
    select * from visible_deals
    where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null
  )
  select
    count(*),
    coalesce(sum("CRMOppty_ExpectedValueAmount"), 0),
    coalesce((
      select nullif(btrim(recent."CRMOppty_CurrencyCode"), '')
      from open_deals recent
      where recent."CRMOppty_ExpectedValueAmount" is not null
      order by recent."CRMOppty_CreatedAt" desc
      limit 1
    ), 'GBP')
  into v_open_deals, v_pipeline_value, v_currency_code
  from open_deals;

  with visible_deals as (
    select
      opportunity.*,
      stage."CRMPipelineStage_Name" as pipeline_stage_name,
      stage."CRMPipelineStage_SortOrder" as pipeline_stage_order,
      pipeline."CRMPipeline_Name" as pipeline_name
    from public."CRM_Opportunities" opportunity
    join public."CRM_Pipelines" pipeline
      on pipeline."CRMPipeline_ID" = opportunity."CRMOppty_PipelineID"
     and pipeline."Company_ID" = v_context.company_id
     and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" stage
      on stage."CRMPipelineStage_ID" = opportunity."CRMOppty_PipelineStageID"
     and stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
     and not stage."Is_Deleted"
    where opportunity."CRMOppty_WonAt" is null
      and opportunity."CRMOppty_LostAt" is null
      and public._multideck_crm_deal_is_operator_visible(
        opportunity."CRMOppty_ID",
        v_context.company_id
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'stageId', grouped.pipeline_stage_id,
    'stage', grouped.pipeline_stage_name,
    'pipeline', grouped.pipeline_name,
    'count', grouped.deal_count,
    'value', grouped.deal_value,
    'currencyCode', grouped.currency_code
  ) order by grouped.stage_order), '[]'::jsonb)
  into v_pipeline
  from (
    select
      "CRMOppty_PipelineStageID" as pipeline_stage_id,
      pipeline_stage_name,
      pipeline_name,
      min("CRMOppty_CurrencyCode") as currency_code,
      count(*) as deal_count,
      coalesce(sum("CRMOppty_ExpectedValueAmount"), 0) as deal_value,
      min(pipeline_stage_order) as stage_order
    from visible_deals
    group by "CRMOppty_PipelineStageID", pipeline_stage_name, pipeline_name
  ) grouped;

  select coalesce(jsonb_agg(entry.item order by entry.ordinal), '[]'::jsonb)
  into v_activity
  from jsonb_array_elements(coalesce(v_result -> 'activity', '[]'::jsonb))
    with ordinality entry(item, ordinal)
  where (
      nullif(entry.item ->> 'dealId', '') is null
      or public._multideck_crm_deal_is_operator_visible(
        (entry.item ->> 'dealId')::uuid,
        v_context.company_id
      )
    )
    and (
      nullif(entry.item ->> 'leadId', '') is null
      or public._multideck_crm_lead_is_reachable(
        (entry.item ->> 'leadId')::uuid,
        v_context.company_id
      )
    );

  v_summary := coalesce(v_result -> 'summary', '{}'::jsonb)
    || jsonb_build_object(
      'openDeals', v_open_deals,
      'pipelineValue', v_pipeline_value,
      'currencyCode', v_currency_code
    );

  return v_result || jsonb_build_object(
    'summary', v_summary,
    'pipeline', v_pipeline,
    'activity', v_activity
  );
end;
$$;

-- Keep the existing mature write implementations, but make the visibility
-- check unavoidable before any operator or Dexter mutation can reach them.
alter function public.multideck_crm_move_deal_stage(uuid, uuid, uuid)
  rename to _multideck_crm_move_deal_stage_unfiltered_20260818;

create function public.multideck_crm_move_deal_stage(
  p_deal_id uuid,
  p_pipeline_id uuid,
  p_pipeline_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_deal_is_operator_visible(p_deal_id, v_context.company_id) then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;
  return public._multideck_crm_move_deal_stage_unfiltered_20260818(
    p_deal_id,
    p_pipeline_id,
    p_pipeline_stage_id
  );
end;
$$;

alter function public.multideck_crm_update_deal(uuid, bigint, jsonb)
  rename to _multideck_crm_update_deal_visible_guard_20260818;

create function public.multideck_crm_update_deal(
  p_deal_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_deal_is_operator_visible(p_deal_id, v_context.company_id) then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;
  return public._multideck_crm_update_deal_visible_guard_20260818(
    p_deal_id,
    p_expected_version,
    p_input
  );
end;
$$;

alter function public.multideck_crm_win_deal(uuid, uuid, text)
  rename to _multideck_crm_win_deal_unfiltered_20260818;

create function public.multideck_crm_win_deal(
  p_deal_id uuid,
  p_pipeline_stage_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_deal_is_operator_visible(p_deal_id, v_context.company_id) then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;
  return public._multideck_crm_win_deal_unfiltered_20260818(
    p_deal_id,
    p_pipeline_stage_id,
    p_reason
  );
end;
$$;

-- Hidden fixtures must not block the operator from retiring an apparently
-- empty pipeline or stage.
create or replace function public._multideck_crm_guard_stage_retirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not old."Is_Deleted" and new."Is_Deleted" then
    perform public._multideck_crm_lock_pipeline_stage(null, new."CRMPipelineStage_ID");
    if exists (
      select 1
      from public."CRM_Opportunities" deal
      where deal."CRMOppty_PipelineStageID" = new."CRMPipelineStage_ID"
        and not deal."CRMOppty_IsDeleted"
        and public._multideck_crm_deal_is_operator_visible(
          deal."CRMOppty_ID",
          new."Company_ID"
        )
    ) then
      raise exception 'Deals in this stage must be moved before removal.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public._multideck_crm_guard_pipeline_retirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not old."Is_Deleted" and new."Is_Deleted" then
    perform public._multideck_crm_lock_pipeline_stage(new."CRMPipeline_ID", null);
    if exists (
      select 1
      from public."CRM_Opportunities" deal
      where deal."CRMOppty_PipelineID" = new."CRMPipeline_ID"
        and not deal."CRMOppty_IsDeleted"
        and public._multideck_crm_deal_is_operator_visible(
          deal."CRMOppty_ID",
          new."Company_ID"
        )
    ) then
      raise exception 'Deals in this pipeline must be moved before removal.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- Dexter chat uses the same canonical visibility predicate as CRM.
alter function public.multideck_dexter_domain_deals(uuid, text, integer)
  rename to _multideck_dexter_domain_deals_unfiltered_20260818;

create function public.multideck_dexter_domain_deals(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(entry.item order by entry.ordinal), '[]'::jsonb)
  from jsonb_array_elements(
    public._multideck_dexter_domain_deals_unfiltered_20260818(
      p_company_id,
      p_search,
      p_take
    )
  ) with ordinality entry(item, ordinal)
  where jsonb_typeof(entry.item) = 'object'
    and nullif(entry.item ->> 'recordId', '') is not null
    and public._multideck_crm_deal_is_operator_visible(
      (entry.item ->> 'recordId')::uuid,
      p_company_id
    )
$$;

alter function public.multideck_dexter_action_update_deal(uuid, uuid, jsonb)
  rename to _multideck_dexter_action_update_deal_unfiltered_20260818;

create function public.multideck_dexter_action_update_deal(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
begin
  if not public._multideck_crm_deal_is_operator_visible(v_target_id, p_company_id) then
    raise exception 'That deal is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;
  return public._multideck_dexter_action_update_deal_unfiltered_20260818(
    p_company_id,
    p_user_id,
    p_arguments
  );
end;
$$;

-- Do not let a caller create a targeted watch for a record Dexter itself is
-- not allowed to read.
alter function public.multideck_dexter_create_watch(text, text, text, text, uuid, text, jsonb, jsonb)
  rename to _multideck_dexter_create_watch_unfiltered_deals_20260818;

create function public.multideck_dexter_create_watch(
  p_capability text,
  p_title text,
  p_summary text,
  p_request text,
  p_target_id uuid,
  p_target_label text,
  p_rule jsonb,
  p_action jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_capability text := lower(btrim(p_capability));
begin
  select * into v_context from public._multideck_dexter_context();
  if v_capability = 'deals'
     and p_target_id is not null
     and not public._multideck_crm_deal_is_operator_visible(p_target_id, v_context.company_id) then
    raise exception 'Choose a deal that is available in this workspace.' using errcode = '42501';
  end if;
  return public._multideck_dexter_create_watch_unfiltered_deals_20260818(
    p_capability,
    p_title,
    p_summary,
    p_request,
    p_target_id,
    p_target_label,
    p_rule,
    p_action
  );
end;
$$;

-- Preserve the current rich email event context while removing fixture-targeted
-- watches and fixture deal events from the returned JSON.
alter function public.multideck_dexter_list_watches()
  rename to _multideck_dexter_list_watches_unfiltered_deals_20260818;

create function public.multideck_dexter_list_watches()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_rows jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  v_rows := public._multideck_dexter_list_watches_unfiltered_deals_20260818();

  return coalesce((
    select jsonb_agg(
      case
        when watch."AIDexterWatch_CapabilityCode" = 'deals'
         and entry.item -> 'latestEvent' is not null
         and not public._multideck_crm_deal_is_operator_visible(
           nullif(entry.item #>> '{latestEvent,changed,sourceId}', '')::uuid,
           v_context.company_id
         )
          then jsonb_set(entry.item, '{latestEvent}', 'null'::jsonb, true)
        else entry.item
      end
      order by entry.ordinal
    )
    from jsonb_array_elements(v_rows) with ordinality entry(item, ordinal)
    join public."AI_DexterWatches" watch
      on watch."AIDexterWatch_ID" = (entry.item ->> 'id')::uuid
    where watch."AIDexterWatch_OwnerUserID" = v_context.user_id
      and watch."AIDexterWatch_CompanyID" = v_context.company_id
      and (
        watch."AIDexterWatch_CapabilityCode" <> 'deals'
        or watch."AIDexterWatch_TargetID" is null
        or public._multideck_crm_deal_is_operator_visible(
          watch."AIDexterWatch_TargetID",
          v_context.company_id
        )
      )
  ), '[]'::jsonb);
end;
$$;

-- Watching for you must stop before it creates a signal. The trigger function
-- is shared, so leave every non-deal capability byte-for-byte equivalent.
create or replace function public._multideck_dexter_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_company_id uuid; v_capability text:=tg_argv[0]; v_source_id uuid; v_old jsonb:='{}'; v_new jsonb:='{}';
begin
  if v_capability='leads' then
    v_source_id:=new."CRMLead_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('companyName',old."CRMLead_CompanyName",'contactName',old."CRMLead_PersonName",'status',old."CRMLead_StatusCode",'rating',old."CRMLead_RatingCode",'estimatedValue',old."CRMLead_EstimatedValueAmount",'urgency',old."CRMLead_UrgencyCode",'score',old."CRMLead_Score",'conversionProbability',old."CRMLead_AIProbabilityToConvert",'nextActionDueAt',old."CRMLead_NextActionDueAt") end; v_new:=jsonb_build_object('companyName',new."CRMLead_CompanyName",'contactName',new."CRMLead_PersonName",'status',new."CRMLead_StatusCode",'rating',new."CRMLead_RatingCode",'estimatedValue',new."CRMLead_EstimatedValueAmount",'urgency',new."CRMLead_UrgencyCode",'score',new."CRMLead_Score",'conversionProbability',new."CRMLead_AIProbabilityToConvert",'nextActionDueAt',new."CRMLead_NextActionDueAt"); select "Company_ID" into v_company_id from public."cmp_Users" where "User_ID"=coalesce(new."CRMLead_OwnerUserID",new."CRMLead_CreatedBy") limit 1;
  elsif v_capability='deals' then
    v_source_id:=new."CRMOppty_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('name',old."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=old."CRMOppty_PipelineStageID"),'status',old."CRMOppty_StatusCode",'expectedCloseDate',old."CRMOppty_ExpectedCloseDate",'probabilityPct',old."CRMOppty_ProbabilityPct",'expectedValue',old."CRMOppty_ExpectedValueAmount",'expectedMargin',old."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',old."CRMOppty_NextActionDueAt") end; v_new:=jsonb_build_object('name',new."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=new."CRMOppty_PipelineStageID"),'status',new."CRMOppty_StatusCode",'expectedCloseDate',new."CRMOppty_ExpectedCloseDate",'probabilityPct',new."CRMOppty_ProbabilityPct",'expectedValue',new."CRMOppty_ExpectedValueAmount",'expectedMargin',new."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',new."CRMOppty_NextActionDueAt"); select "Company_ID" into v_company_id from public."CRM_Pipelines" where "CRMPipeline_ID"=new."CRMOppty_PipelineID";
    if v_company_id is null or not public._multideck_crm_deal_is_operator_visible(v_source_id, v_company_id) then return new; end if;
  elsif v_capability='quotes' then
    v_source_id:=new."CusQuoteHeader_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('quoteNumber',old."CusQuoteHeader_Number",'status',old."CusQuoteHeader_Status",'deadline',old."CusQuoteHeader_Deadline",'validFrom',old."CusQuoteHeader_ValidFrom",'validTo',old."CusQuoteHeader_ValidTo",'origin',old."CusQuoteHeader_OriginExtra",'destination',old."CusQuoteHeader_DestinationExtra") end; v_new:=jsonb_build_object('quoteNumber',new."CusQuoteHeader_Number",'status',new."CusQuoteHeader_Status",'deadline',new."CusQuoteHeader_Deadline",'validFrom',new."CusQuoteHeader_ValidFrom",'validTo',new."CusQuoteHeader_ValidTo",'origin',new."CusQuoteHeader_OriginExtra",'destination',new."CusQuoteHeader_DestinationExtra"); v_company_id:=new."Org_ID"; if v_company_id is null then select "Company_ID" into v_company_id from public."cmp_Offices" where "Office_ID"=coalesce(new."CusQuoteHeader_OrgOfficeID",new."OrgOffice_ID"); end if;
  elsif v_capability='warehouse' then
    if tg_table_name='WMS_Exceptions' then
      v_source_id:=new."WMSException_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('exceptionStatus',old."WMSException_StatusCode",'severity',old."WMSException_SeverityCode",'title',old."WMSException_Title") end; v_new:=jsonb_build_object('exceptionStatus',new."WMSException_StatusCode",'severity',new."WMSException_SeverityCode",'title',new."WMSException_Title"); select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSException_FacilityID";
    else
      v_source_id:=new."WMSOrder_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('status',old."WMSOrder_StatusCode",'priority',old."WMSOrder_PriorityCode",'releaseGateStatus',old."WMSOrder_ReleaseGateStatusCode",'requestedDate',old."WMSOrder_RequestedDate",'customerReference',old."WMSOrder_CustomerReference",'containerNumber',old."WMSOrder_ContainerNumber") end; v_new:=jsonb_build_object('status',new."WMSOrder_StatusCode",'priority',new."WMSOrder_PriorityCode",'releaseGateStatus',new."WMSOrder_ReleaseGateStatusCode",'requestedDate',new."WMSOrder_RequestedDate",'customerReference',new."WMSOrder_CustomerReference",'containerNumber',new."WMSOrder_ContainerNumber"); select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSOrder_FacilityID";
    end if;
  elsif v_capability='email' then
    v_source_id:=new."CommMessage_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('subject',old."CommMessage_Subject",'body',coalesce(old."CommMessage_BodyText",old."CommMessage_BodyPreview"),'receivedAt',old."CommMessage_ReceivedAt",'mailboxId',old."CommMessage_MailboxID") end; v_new:=jsonb_build_object('subject',new."CommMessage_Subject",'body',coalesce(new."CommMessage_BodyText",new."CommMessage_BodyPreview"),'receivedAt',new."CommMessage_ReceivedAt",'mailboxId',new."CommMessage_MailboxID"); select owner."Company_ID" into v_company_id from public."Comm_Mailboxes" mailbox join public."Comm_ProviderConnections" connection on connection."CommConn_ID"=mailbox."CommMailbox_ConnectionID" join public."cmp_Users" owner on owner."User_ID"=connection."CommConn_UserID" where mailbox."CommMailbox_ID"=new."CommMessage_MailboxID";
  end if;
  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_company_id
      and watch."AIDexterWatch_CapabilityCode"=v_capability
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company_id,v_capability,tg_table_name,v_source_id,v_old,v_new);
  end if;
  return new;
end;
$$;

-- Direct table reads use the same rule as the RPC, so realtime and a manual
-- PostgREST query cannot surface a quarantined watch or event.
alter policy "Dexter owners can read their watches"
on public."AI_DexterWatches"
using (
  exists (
    select 1
    from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = "AI_DexterWatches"."AIDexterWatch_OwnerUserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
      and workspace_user."Company_ID" = "AI_DexterWatches"."AIDexterWatch_CompanyID"
      and (
        "AI_DexterWatches"."AIDexterWatch_CapabilityCode" <> 'deals'
        or "AI_DexterWatches"."AIDexterWatch_TargetID" is null
        or public.multideck_crm_deal_is_visible(
          "AI_DexterWatches"."AIDexterWatch_TargetID"
        )
      )
  )
);

alter policy "Dexter owners can read their watch events"
on public."AI_DexterWatchEvents"
using (
  exists (
    select 1
    from public."AI_DexterWatches" watch
    join public."cmp_Users" workspace_user
      on workspace_user."User_ID" = watch."AIDexterWatch_OwnerUserID"
     and workspace_user."Company_ID" = watch."AIDexterWatch_CompanyID"
    where watch."AIDexterWatch_ID" = "AI_DexterWatchEvents"."AIDexterWatchEvent_WatchID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
      and "AI_DexterWatchEvents"."AIDexterWatchEvent_OwnerUserID" = workspace_user."User_ID"
      and (
        watch."AIDexterWatch_CapabilityCode" <> 'deals'
        or public.multideck_crm_deal_is_visible(
          nullif("AI_DexterWatchEvents"."AIDexterWatchEvent_ChangedJSON" ->> 'sourceId', '')::uuid
        )
      )
  )
);

-- Canonically mark older fixture-linked records. The updated lead trigger has a
-- demo WHEN clause, and the updated deal trigger exits before signal creation.
update public."CRM_Leads" lead
set "CRMLead_MetadataJSON" = coalesce(lead."CRMLead_MetadataJSON", '{}'::jsonb)
  || jsonb_build_object(
    'isDemo', true,
    'demoReason', 'linked-development-fixture-account'
  )
where not lead."CRMLead_IsDeleted"
  and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
  and exists (
    select 1
    from public."CRM_AccountProfiles" fixture
    where fixture."CRMAccount_OrgID" = lead."CRMLead_OrgID"
      and not fixture."CRMAccount_IsDeleted"
      and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
  );

update public."CRM_Opportunities" deal
set "CRMOppty_MetadataJSON" = coalesce(deal."CRMOppty_MetadataJSON", '{}'::jsonb)
  || jsonb_build_object(
    'developmentFixture', true,
    'fixtureReason', 'linked-development-fixture-account'
  )
where not deal."CRMOppty_IsDeleted"
  and lower(coalesce(deal."CRMOppty_MetadataJSON" ->> 'developmentFixture', 'false')) <> 'true'
  and public._multideck_crm_deal_is_fixture(deal."CRMOppty_ID");

-- Retain historical watch evidence for diagnostics, but dismiss its operator
-- notifications. The watch/event RLS and list RPC above quarantine the source.
with fixture_events as (
  select distinct event."AIDexterWatchEvent_ID" as event_id
  from public."AI_DexterWatchEvents" event
  join public."AI_DexterWatchSignals" signal
    on signal."AIDexterWatchSignal_ID" = event."AIDexterWatchEvent_SignalID"
  where signal."AIDexterWatchSignal_CapabilityCode" = 'deals'
    and public._multideck_crm_deal_is_fixture(signal."AIDexterWatchSignal_SourceID")
)
update public."Comm_Notifications" notification
set
  "CommNotif_StatusCode" = 'read',
  "CommNotif_ReadAt" = coalesce(notification."CommNotif_ReadAt", now()),
  "CommNotif_DismissedAt" = coalesce(notification."CommNotif_DismissedAt", now()),
  "CommNotif_MetadataJSON" = coalesce(notification."CommNotif_MetadataJSON", '{}'::jsonb)
    || jsonb_build_object(
      'fixtureQuarantined', true,
      'quarantineReason', 'fixture-deal-watch-event'
    )
from fixture_events
where notification."CommNotif_LinkTypeCode" = 'dexter_watch'
  and nullif(notification."CommNotif_MetadataJSON" ->> 'watch_event_id', '')::uuid = fixture_events.event_id;

-- Public API surfaces are allowlisted explicitly. Private snapshots remain
-- callable only by the database owner/service role for diagnostics.
revoke all on function public._multideck_crm_deal_is_fixture(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_deal_is_operator_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.multideck_crm_deal_is_visible(uuid) from public, anon;
revoke all on function public._multideck_crm_lead_is_reachable(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_deal_json_unfiltered_20260818(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_deal_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_list_deals_unfiltered_20260818() from public, anon, authenticated;
revoke all on function public._multideck_crm_list_deals_essential_unfiltered_visible_20260818() from public, anon, authenticated;
revoke all on function public._multideck_crm_get_dashboard_unfiltered_deals_20260818(integer, text) from public, anon, authenticated;
revoke all on function public._multideck_crm_move_deal_stage_unfiltered_20260818(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_update_deal_visible_guard_20260818(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_crm_win_deal_unfiltered_20260818(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._multideck_dexter_domain_deals_unfiltered_20260818(uuid, text, integer) from public, anon, authenticated;
revoke all on function public._multideck_dexter_action_update_deal_unfiltered_20260818(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_dexter_create_watch_unfiltered_deals_20260818(text, text, text, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_dexter_list_watches_unfiltered_deals_20260818() from public, anon, authenticated;
revoke all on function public._multideck_dexter_watch_source_change() from public, anon, authenticated;
revoke all on function public._multideck_crm_guard_stage_retirement() from public, anon, authenticated;
revoke all on function public._multideck_crm_guard_pipeline_retirement() from public, anon, authenticated;

revoke all on function public.multideck_crm_list_deals() from public, anon;
revoke all on function public.multideck_crm_list_deals_essential() from public, anon;
revoke all on function public.multideck_crm_get_dashboard(integer, text) from public, anon;
revoke all on function public.multideck_crm_move_deal_stage(uuid, uuid, uuid) from public, anon;
revoke all on function public.multideck_crm_update_deal(uuid, bigint, jsonb) from public, anon;
revoke all on function public.multideck_crm_win_deal(uuid, uuid, text) from public, anon;
revoke all on function public.multideck_dexter_domain_deals(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_deal(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_create_watch(text, text, text, text, uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.multideck_dexter_list_watches() from public, anon;

grant execute on function public.multideck_crm_list_deals() to authenticated, service_role;
grant execute on function public.multideck_crm_list_deals_essential() to authenticated, service_role;
grant execute on function public.multideck_crm_deal_is_visible(uuid) to authenticated, service_role;
grant execute on function public.multideck_crm_get_dashboard(integer, text) to authenticated, service_role;
grant execute on function public.multideck_crm_move_deal_stage(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.multideck_crm_update_deal(uuid, bigint, jsonb) to authenticated, service_role;
grant execute on function public.multideck_crm_win_deal(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.multideck_dexter_domain_deals(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_update_deal(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_create_watch(text, text, text, text, uuid, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.multideck_dexter_list_watches() to authenticated, service_role;

grant execute on function public._multideck_crm_deal_is_fixture(uuid) to service_role;
grant execute on function public._multideck_crm_deal_is_operator_visible(uuid, uuid) to service_role;

commit;
