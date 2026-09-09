-- Customer-facing usage allowances in product units. Internal provider costs
-- remain server-only; OCR pages are governed separately from AI token spend.

begin;

alter table public."AI_DexterUsagePolicies"
  drop constraint if exists "CK_AI_DexterUsagePolicies_plan";

update public."AI_DexterUsagePolicies"
set "AIUsagePolicy_PlanCode" = '50'
where "AIUsagePolicy_PlanCode" = '75';

alter table public."AI_DexterUsagePolicies"
  add constraint "CK_AI_DexterUsagePolicies_plan"
  check ("AIUsagePolicy_PlanCode" in ('10', '25', '50', 'enterprise'));

alter table public."AI_DexterUsagePolicies"
  alter column "AIUsagePolicy_IncludedGbp" set default 1442.3077;

update public."AI_DexterUsagePolicies"
set
  "AIUsagePolicy_IncludedGbp" = case "AIUsagePolicy_PlanCode"
    when '10' then 576.9231
    when '25' then 1442.3077
    when '50' then 2884.6154
    else "AIUsagePolicy_IncludedGbp"
  end,
  "AIUsagePolicy_UpdatedAt" = now()
where "AIUsagePolicy_PlanCode" in ('10', '25', '50');

create index if not exists "IX_AI_DexterModelEgressAudit_usage_month"
  on public."AI_DexterModelEgressAudit" (
    "AIDexterEgress_CompanyID", "AIDexterEgress_Provider", "AIDexterEgress_Purpose", "AIDexterEgress_CreatedAt"
  )
  where "AIDexterEgress_Outcome" in ('attempted', 'succeeded');

create index if not exists "IX_DOCB_RenderJobs_usage_month"
  on public."DOCB_RenderJobs" ("DOCBRJ_CreatedBy", "DOCBRJ_CompletedAt")
  where "DOCBRJ_StatusCode" = 'completed';

create index if not exists "IX_ICUS_Submissions_usage_month"
  on public."ICUS_Submissions" ("ICUSS_SubmittedAt", "ICUSS_CustomsID")
  where "ICUSS_SubmittedAt" is not null;

-- AI allowance enforcement continues to use an internal GBP ledger, but only
-- OpenAI egress contributes to it. OCR has its own page allowance below.
create or replace function public._multideck_dexter_allowance_state(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text := '25';
  v_included numeric := 1442.3077;
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
  into v_plan, v_included, v_payg_configured, v_billing_ready, v_payg_limit, v_payg_rate
  from public."AI_DexterUsagePolicies" policy
  where policy."AIUsagePolicy_CompanyID" = p_company_id;

  v_plan := coalesce(v_plan, '25');
  v_included := coalesce(v_included, case v_plan
    when '10' then 576.9231
    when '50' then 2884.6154
    else 1442.3077
  end);
  v_payg_configured := coalesce(v_payg_configured, false);
  v_billing_ready := coalesce(v_billing_ready, false);
  v_payg_rate := coalesce(v_payg_rate, 1);
  v_payg_enabled := v_payg_configured and v_billing_ready;

  select coalesce(sum(coalesce(
    egress."AIDexterEgress_ActualCostGBP",
    egress."AIDexterEgress_EstimatedCostGBP"
  )), 0)
  into v_usage
  from public."AI_DexterModelEgressAudit" egress
  where egress."AIDexterEgress_CompanyID" = p_company_id
    and egress."AIDexterEgress_Provider" = 'openai'
    and egress."AIDexterEgress_Outcome" = 'succeeded'
    and egress."AIDexterEgress_CreatedAt" >= date_trunc('month', now())
    and egress."AIDexterEgress_CreatedAt" < date_trunc('month', now()) + interval '1 month';

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
    'extraUsageRemainingGbp', case when v_payg_limit is null then null else greatest(v_payg_limit - v_extra, 0) end,
    'usageStatus', v_status,
    'usageAllowed', v_allowed
  );
end;
$$;

revoke all on function public._multideck_dexter_allowance_state(uuid)
  from public, anon, authenticated;

create or replace function public._multideck_usage_team(
  p_company_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_category text,
  p_seat_count integer,
  p_ai_included_gbp numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if p_category not in ('ai', 'ocr') then
    return v_result;
  end if;

  with usage_by_user as materialized (
    select
      egress."AIDexterEgress_UserID" as user_id,
      coalesce(sum(case
        when p_category = 'ocr' then egress."AIDexterEgress_InputUnits"::numeric
        else coalesce(egress."AIDexterEgress_ActualCostGBP", egress."AIDexterEgress_EstimatedCostGBP")
      end), 0) as raw_usage
    from public."AI_DexterModelEgressAudit" egress
    where egress."AIDexterEgress_CompanyID" = p_company_id
      and egress."AIDexterEgress_Outcome" = 'succeeded'
      and egress."AIDexterEgress_CreatedAt" >= p_period_start
      and egress."AIDexterEgress_CreatedAt" < p_period_end
      and (
        (p_category = 'ai' and egress."AIDexterEgress_Provider" = 'openai')
        or (
          p_category = 'ocr'
          and egress."AIDexterEgress_Provider" = 'mistral'
          and egress."AIDexterEgress_Purpose" in ('document_ocr', 'invoice_ocr')
        )
      )
    group by egress."AIDexterEgress_UserID"
  ), team as materialized (
    select
      workspace_user."User_ID" as user_id,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email",
        'Unnamed user'
      )::text as display_name,
      workspace_user."User_Email"::text as email,
      upper(concat(
        left(coalesce(nullif(btrim(workspace_user."User_Firstname"), ''), nullif(btrim(workspace_user."User_Email"), ''), '?'), 1),
        case when nullif(btrim(workspace_user."User_Lastname"), '') is null
          then ''
          else left(btrim(workspace_user."User_Lastname"), 1)
        end
      )) as initials,
      case when p_category = 'ocr'
        then round(coalesce(usage.raw_usage, 0), 0)
        else round(
          coalesce(usage.raw_usage, 0)
          / nullif(coalesce(p_ai_included_gbp, 0) / greatest(coalesce(p_seat_count, 1), 1), 0)
          * 100,
          1
        )
      end as usage,
      workspace_user."User_ProfilePhotoBucket"::text as photo_bucket,
      workspace_user."User_ProfilePhotoPath"::text as photo_path,
      workspace_user."User_ProfilePhotoMimeType"::text as photo_mime_type,
      workspace_user."User_ProfilePhotoSizeBytes" as photo_size_bytes,
      workspace_user."User_ProfilePhotoUpdatedAt" as photo_updated_at
    from public."cmp_Users" workspace_user
    left join usage_by_user usage on usage.user_id = workspace_user."User_ID"
    where workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'userId', team.user_id,
    'name', team.display_name,
    'email', team.email,
    'initials', team.initials,
    'usage', coalesce(team.usage, 0),
    'profilePhoto', case when team.photo_path is null then null else jsonb_build_object(
      'bucket', team.photo_bucket,
      'path', team.photo_path,
      'mimeType', team.photo_mime_type,
      'sizeBytes', team.photo_size_bytes,
      'updatedAt', team.photo_updated_at
    ) end
  )) order by coalesce(team.usage, 0) desc, lower(team.display_name), team.user_id), '[]'::jsonb)
  into v_result
  from team;

  return v_result;
end;
$$;

revoke all on function public._multideck_usage_team(uuid, timestamptz, timestamptz, text, integer, numeric)
  from public, anon, authenticated;

create or replace function public._multideck_usage_categories(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan text := '25';
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_ai_state jsonb;
  v_ai_percent numeric := 0;
  v_seat_count integer := 25;
  v_ocr_included integer := 25000;
  v_ocr_used integer := 0;
  v_ai_team jsonb := '[]'::jsonb;
  v_ocr_team jsonb := '[]'::jsonb;
  v_tracking_included integer := 250;
  v_documents_included integer := 2000;
  v_documents_used integer := 0;
  v_customs_included integer := 625;
  v_customs_used integer := 0;
  v_customs_enabled boolean := false;
begin
  v_ai_state := public._multideck_dexter_allowance_state(p_company_id);
  v_plan := coalesce(v_ai_state ->> 'planCode', '25');
  v_ai_percent := greatest(coalesce((v_ai_state ->> 'includedUsagePercent')::numeric, 0), 0);

  if v_plan = 'enterprise' then
    select greatest(count(*)::integer, 1)
    into v_seat_count
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';
  else
    v_seat_count := case v_plan when '10' then 10 when '50' then 50 else 25 end;
  end if;
  v_ocr_included := v_seat_count * 1000;

  v_tracking_included := case v_plan when '10' then 100 when '50' then 500 else 250 end;
  v_customs_included := case v_plan when '10' then 250 when '50' then 1250 else 625 end;

  v_ai_team := public._multideck_usage_team(
    p_company_id,
    v_period_start,
    v_period_end,
    'ai',
    v_seat_count,
    coalesce((v_ai_state ->> 'includedUsageGbp')::numeric, 0)
  );
  v_ocr_team := public._multideck_usage_team(
    p_company_id,
    v_period_start,
    v_period_end,
    'ocr',
    v_seat_count,
    coalesce((v_ai_state ->> 'includedUsageGbp')::numeric, 0)
  );

  select coalesce(sum(egress."AIDexterEgress_InputUnits"), 0)::integer
  into v_ocr_used
  from public."AI_DexterModelEgressAudit" egress
  where egress."AIDexterEgress_CompanyID" = p_company_id
    and egress."AIDexterEgress_Provider" = 'mistral'
    and egress."AIDexterEgress_Purpose" in ('document_ocr', 'invoice_ocr')
    and egress."AIDexterEgress_Outcome" = 'succeeded'
    and egress."AIDexterEgress_CreatedAt" >= v_period_start
    and egress."AIDexterEgress_CreatedAt" < v_period_end;

  select count(*)::integer
  into v_documents_used
  from public."DOCB_RenderJobs" render_job
  join public."cmp_Users" workspace_user
    on workspace_user."User_ID" = render_job."DOCBRJ_CreatedBy"
  where workspace_user."Company_ID" = p_company_id
    and render_job."DOCBRJ_StatusCode" = 'completed'
    and lower(render_job."DOCBRJ_RenderEngineCode") = 'carbone'
    and render_job."DOCBRJ_CompletedAt" >= v_period_start
    and render_job."DOCBRJ_CompletedAt" < v_period_end;

  select case
    when exists (
      select 1 from public."cmp_Company_Modules" module
      where module."Company_ID" = p_company_id
        and lower(module."Module_Code") = 'customs'
    ) then exists (
      select 1 from public."cmp_Company_Modules" module
      where module."Company_ID" = p_company_id
        and lower(module."Module_Code") = 'customs'
        and module."Is_Enabled"
    )
    else exists (
      select 1
      from public."ICUS_ApiConnections" connection
      left join public."cmp_Offices" office
        on office."Office_ID" = connection."ICUSC_OrgOfficeID"
      where connection."ICUSC_IsActive"
        and (connection."ICUSC_OrgOfficeID" is null or office."Company_ID" = p_company_id)
    )
  end
  into v_customs_enabled;

  if v_customs_enabled then
    select count(distinct submission."ICUSS_CustomsID")::integer
    into v_customs_used
    from public."ICUS_Submissions" submission
    join public."Customs_Declarations" declaration
      on declaration."CUST_id" = submission."ICUSS_CustomsID"
    join public."cmp_Offices" office
      on office."Office_ID" = declaration."CUST_OrgOfficeID"
    where office."Company_ID" = p_company_id
      and submission."ICUSS_SubmittedAt" >= v_period_start
      and submission."ICUSS_SubmittedAt" < v_period_end;
  end if;

  return jsonb_build_object(
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'planCode', v_plan,
    'seatCount', v_seat_count,
    'includedUsagePercent', v_ai_percent,
    'categories', jsonb_build_array(
      jsonb_build_object(
        'id', 'ai', 'label', 'AI usage',
        'description', 'Dexter requests and AI-assisted work across this workspace.',
        'unit', 'percent', 'included', 100, 'used', v_ai_percent,
        'extra', greatest(v_ai_percent - 100, 0), 'usedPercent', v_ai_percent,
        'enabled', true, 'dataState', 'live', 'teamUsage', v_ai_team
      ),
      jsonb_build_object(
        'id', 'ocr', 'label', 'OCR usage',
        'description', 'Pages read from PDFs and images. Includes 1,000 pages per plan user.',
        'unit', 'pages', 'included', v_ocr_included, 'used', v_ocr_used,
        'extra', greatest(v_ocr_used - v_ocr_included, 0),
        'usedPercent', case when v_ocr_included > 0 then round(v_ocr_used::numeric / v_ocr_included * 100, 2) else 100 end,
        'enabled', true, 'dataState', 'live', 'teamUsage', v_ocr_team
      ),
      jsonb_build_object(
        'id', 'tracking', 'label', 'Shipment tracking',
        'description', 'Shipments monitored through the workspace tracking service.',
        'unit', 'shipments', 'included', v_tracking_included, 'used', 0, 'extra', 0,
        'usedPercent', 0, 'enabled', true, 'dataState', 'not_connected'
      ),
      jsonb_build_object(
        'id', 'documents', 'label', 'Generated documents',
        'description', 'Operational documents created from approved Multideck templates.',
        'unit', 'documents', 'included', v_documents_included, 'used', v_documents_used,
        'extra', greatest(v_documents_used - v_documents_included, 0),
        'usedPercent', case when v_documents_included > 0 then round(v_documents_used::numeric / v_documents_included * 100, 2) else 100 end,
        'enabled', true, 'dataState', 'live'
      ),
      jsonb_build_object(
        'id', 'customs', 'label', 'Customs',
        'description', 'Declarations submitted through the connected customs service.',
        'unit', 'declarations', 'included', v_customs_included, 'used', v_customs_used,
        'extra', greatest(v_customs_used - v_customs_included, 0),
        'usedPercent', case when v_customs_included > 0 then round(v_customs_used::numeric / v_customs_included * 100, 2) else 100 end,
        'enabled', v_customs_enabled, 'dataState', 'live'
      )
    )
  );
end;
$$;

revoke all on function public._multideck_usage_categories(uuid)
  from public, anon, authenticated;

create or replace function public.multideck_get_usage_categories()
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
  if not private.is_tenant_administrator(v_context.user_id) then
    raise exception 'Only tenant administrators can view workspace usage.' using errcode = '42501';
  end if;
  return public._multideck_usage_categories(v_context.company_id);
end;
$$;

revoke all on function public.multideck_get_usage_categories() from public, anon;
grant execute on function public.multideck_get_usage_categories() to authenticated, service_role;

-- Reserve Mistral OCR against pages rather than the internal AI allowance.
create or replace function public.multideck_dexter_reserve_model_egress(
  p_company_id uuid, p_user_id uuid, p_conversation_id uuid, p_provider text, p_model text,
  p_purpose text, p_data_categories jsonb, p_record_count integer, p_byte_count bigint,
  p_estimated_input_units integer, p_estimated_output_units integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_state jsonb;
  v_estimated numeric;
  v_remaining numeric;
  v_ocr_pages integer := 0;
  v_plan text := '25';
  v_seat_count integer := 25;
  v_ocr_included integer := 25000;
  v_requested_pages integer := greatest(coalesce(p_estimated_input_units, 0), 1);
  v_is_ocr boolean := lower(coalesce(p_provider, '')) = 'mistral'
    and p_purpose in ('document_ocr', 'invoice_ocr');
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 719));

  if not exists (
    select 1 from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = p_user_id
      and workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
  ) then
    raise exception 'operator_unavailable' using errcode = '42501';
  end if;

  if v_is_ocr and (
    select count(*) from public."AI_DexterModelEgressAudit" egress
    where egress."AIDexterEgress_UserID" = p_user_id
      and egress."AIDexterEgress_Purpose" in ('document_ocr', 'invoice_ocr')
      and egress."AIDexterEgress_Outcome" = 'attempted'
      and egress."AIDexterEgress_CreatedAt" > now() - interval '3 minutes'
  ) >= 2 then
    raise exception 'ocr_concurrency_limit' using errcode = 'P0001';
  end if;

  v_state := public._multideck_dexter_allowance_state(p_company_id);
  v_plan := coalesce(v_state ->> 'planCode', '25');
  if v_plan = 'enterprise' then
    select greatest(count(*)::integer, 1)
    into v_seat_count
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';
  else
    v_seat_count := case v_plan when '10' then 10 when '50' then 50 else 25 end;
  end if;
  v_ocr_included := v_seat_count * 1000;

  if v_is_ocr then
    select coalesce(sum(egress."AIDexterEgress_InputUnits"), 0)::integer
    into v_ocr_pages
    from public."AI_DexterModelEgressAudit" egress
    where egress."AIDexterEgress_CompanyID" = p_company_id
      and egress."AIDexterEgress_Provider" = 'mistral'
      and egress."AIDexterEgress_Purpose" in ('document_ocr', 'invoice_ocr')
      and egress."AIDexterEgress_Outcome" in ('attempted', 'succeeded')
      and egress."AIDexterEgress_CreatedAt" >= date_trunc('month', now())
      and egress."AIDexterEgress_CreatedAt" < date_trunc('month', now()) + interval '1 month';

    if v_ocr_pages + v_requested_pages > v_ocr_included
       and not coalesce((v_state ->> 'extraUsageEnabled')::boolean, false) then
      raise exception 'usage_allowance_reached' using errcode = 'P0001';
    end if;
    v_estimated := round(v_requested_pages * 0.003076923::numeric, 6);
  else
    v_estimated := public._multideck_dexter_estimated_usage_gbp(
      case when lower(p_model) like '%terra%' then 'worker' else 'fast' end,
      p_estimated_input_units,
      p_estimated_output_units
    );
    if not coalesce((v_state ->> 'usageAllowed')::boolean, false) then
      raise exception 'usage_allowance_reached' using errcode = 'P0001';
    end if;
    v_remaining := greatest(coalesce((v_state ->> 'includedUsageRemainingGbp')::numeric, 0), 0)
      + case when coalesce((v_state ->> 'extraUsageEnabled')::boolean, false)
        then coalesce((v_state ->> 'extraUsageRemainingGbp')::numeric, 1000000000)
        else 0
      end;
    if v_estimated > v_remaining then
      raise exception 'usage_allowance_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public."AI_DexterModelEgressAudit" (
    "AIDexterEgress_ID", "AIDexterEgress_CompanyID", "AIDexterEgress_UserID", "AIDexterEgress_ConversationID",
    "AIDexterEgress_Provider", "AIDexterEgress_Model", "AIDexterEgress_Purpose", "AIDexterEgress_DataCategoriesJSON",
    "AIDexterEgress_RecordCount", "AIDexterEgress_ByteCount", "AIDexterEgress_InputUnits", "AIDexterEgress_OutputUnits",
    "AIDexterEgress_EstimatedCostGBP", "AIDexterEgress_Outcome"
  ) values (
    v_id, p_company_id, p_user_id, p_conversation_id, lower(p_provider), left(p_model, 120), left(p_purpose, 80), coalesce(p_data_categories, '[]'),
    greatest(coalesce(p_record_count, 0), 0), greatest(coalesce(p_byte_count, 0), 0),
    case when v_is_ocr then v_requested_pages else greatest(coalesce(p_estimated_input_units, 0), 0) end,
    greatest(coalesce(p_estimated_output_units, 0), 0), v_estimated, 'attempted'
  );
  return v_id;
end;
$$;

create or replace function public.multideck_dexter_settle_model_egress(
  p_reservation_id uuid, p_company_id uuid, p_user_id uuid, p_outcome text, p_provider_request_id text,
  p_input_units integer, p_output_units integer, p_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public."AI_DexterModelEgressAudit";
  v_cost numeric;
  v_input_units integer;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode = '42501'; end if;
  select * into v_row
  from public."AI_DexterModelEgressAudit"
  where "AIDexterEgress_ID" = p_reservation_id
    and "AIDexterEgress_CompanyID" = p_company_id
    and "AIDexterEgress_UserID" = p_user_id
  for update;
  if not found or v_row."AIDexterEgress_Outcome" <> 'attempted' then return; end if;

  v_input_units := greatest(coalesce(
    nullif(p_input_units, 0),
    case when v_row."AIDexterEgress_Provider" = 'mistral' then v_row."AIDexterEgress_InputUnits" else 0 end
  ), 0);
  if v_row."AIDexterEgress_Provider" = 'mistral' then
    v_cost := round(v_input_units * 0.003076923::numeric, 6);
  else
    v_cost := public._multideck_dexter_estimated_usage_gbp(
      case when lower(v_row."AIDexterEgress_Model") like '%terra%' then 'worker' else 'fast' end,
      v_input_units,
      p_output_units
    );
  end if;

  update public."AI_DexterModelEgressAudit"
  set
    "AIDexterEgress_InputUnits" = v_input_units,
    "AIDexterEgress_OutputUnits" = greatest(coalesce(p_output_units, 0), 0),
    "AIDexterEgress_ActualCostGBP" = v_cost,
    "AIDexterEgress_ProviderRequestID" = nullif(left(p_provider_request_id, 240), ''),
    "AIDexterEgress_Outcome" = case when p_outcome in ('succeeded', 'failed', 'denied') then p_outcome else 'failed' end,
    "AIDexterEgress_ErrorCode" = nullif(left(p_error_code, 120), ''),
    "AIDexterEgress_CompletedAt" = now()
  where "AIDexterEgress_ID" = p_reservation_id;
end;
$$;

revoke all on function public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)
  from public, anon, authenticated;
revoke all on function public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)
  to service_role;
grant execute on function public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text)
  to service_role;

-- Dexter can read the public units through the same tenant-safe domain. It has
-- no write action for allowances, billing, or top-ups.
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
  with usage_state as (
    select public._multideck_usage_categories(p_company_id) as value
  ), sanitized as (
    select jsonb_set(
      usage_state.value,
      '{categories}',
      coalesce((
        select jsonb_agg(category.value - 'teamUsage')
        from jsonb_array_elements(usage_state.value -> 'categories') category(value)
      ), '[]'::jsonb),
      false
    ) as value
    from usage_state
  )
  select case
    when exists (
      select 1 from public."cmp_Users" workspace_user
      where workspace_user."Auth_User_ID" = auth.uid()
        and workspace_user."Company_ID" = p_company_id
        and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
    ) then jsonb_build_array(
      sanitized.value || jsonb_build_object('recordId', p_company_id, 'scope', 'workspace')
    )
    else '[]'::jsonb
  end
  from sanitized;
$$;

revoke all on function public.multideck_dexter_domain_usage(uuid, text, integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Name" = 'Usage',
  "AIDexterDomain_Description" = 'Current included and extra usage in customer-facing units for AI, OCR, shipment tracking, generated documents and enabled customs services.',
  "AIDexterDomain_QueryFunction" = 'multideck_dexter_domain_usage',
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'usage';

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_Name" = 'Usage',
  "AIDexterWatchCapability_Description" = 'Included and extra usage changes for AI, OCR, generated documents and enabled customs services.',
  "AIDexterWatchCapability_FieldsJSON" = '["category","used","included","extra","usedPercent"]'::jsonb,
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'usage';

create or replace function public._multideck_emit_usage_watch_signal(
  p_company_id uuid,
  p_source_table text,
  p_source_id uuid,
  p_category text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_category jsonb;
begin
  if not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = p_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'usage'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = p_company_id)
  ) then
    return;
  end if;

  select category.value into v_category
  from jsonb_array_elements(public._multideck_usage_categories(p_company_id) -> 'categories') category(value)
  where category.value ->> 'id' = p_category
    and coalesce((category.value ->> 'enabled')::boolean, false)
  limit 1;

  if v_category is null then return; end if;

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    p_company_id, 'usage', left(p_source_table, 120), p_source_id, '{}'::jsonb,
    jsonb_build_object(
      'category', v_category ->> 'id',
      'used', (v_category ->> 'used')::numeric,
      'included', (v_category ->> 'included')::numeric,
      'extra', (v_category ->> 'extra')::numeric,
      'usedPercent', (v_category ->> 'usedPercent')::numeric
    )
  );
end;
$$;

revoke all on function public._multideck_emit_usage_watch_signal(uuid, text, uuid, text)
  from public, anon, authenticated;

create or replace function public._multideck_model_egress_usage_watch()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if old."AIDexterEgress_Outcome" = 'attempted' and new."AIDexterEgress_Outcome" = 'succeeded' then
    perform public._multideck_emit_usage_watch_signal(
      new."AIDexterEgress_CompanyID",
      tg_table_name,
      new."AIDexterEgress_ID",
      case
        when new."AIDexterEgress_Provider" = 'mistral'
          and new."AIDexterEgress_Purpose" in ('document_ocr', 'invoice_ocr') then 'ocr'
        else 'ai'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_AI_Messages_dexter_usage_watch" on public."AI_Messages";
drop trigger if exists "TR_AI_DexterModelEgressAudit_usage_watch" on public."AI_DexterModelEgressAudit";
create trigger "TR_AI_DexterModelEgressAudit_usage_watch"
  after update of "AIDexterEgress_Outcome" on public."AI_DexterModelEgressAudit"
  for each row execute function public._multideck_model_egress_usage_watch();

create or replace function public._multideck_document_usage_watch()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
begin
  if new."DOCBRJ_StatusCode" = 'completed' and old."DOCBRJ_StatusCode" is distinct from 'completed' then
    select workspace_user."Company_ID" into v_company_id
    from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = new."DOCBRJ_CreatedBy";
    if v_company_id is not null then
      perform public._multideck_emit_usage_watch_signal(v_company_id, tg_table_name, new."DOCBRJ_ID", 'documents');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_DOCB_RenderJobs_usage_watch" on public."DOCB_RenderJobs";
create trigger "TR_DOCB_RenderJobs_usage_watch"
  after update of "DOCBRJ_StatusCode" on public."DOCB_RenderJobs"
  for each row execute function public._multideck_document_usage_watch();

create or replace function public._multideck_customs_usage_watch()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
begin
  if new."ICUSS_SubmittedAt" is null then return new; end if;
  if tg_op = 'UPDATE' and old."ICUSS_SubmittedAt" is not null then return new; end if;

  select office."Company_ID" into v_company_id
  from public."Customs_Declarations" declaration
  join public."cmp_Offices" office on office."Office_ID" = declaration."CUST_OrgOfficeID"
  where declaration."CUST_id" = new."ICUSS_CustomsID";

  if v_company_id is not null then
    perform public._multideck_emit_usage_watch_signal(v_company_id, tg_table_name, new."ICUSS_id", 'customs');
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_ICUS_Submissions_usage_watch" on public."ICUS_Submissions";
create trigger "TR_ICUS_Submissions_usage_watch"
  after insert or update of "ICUSS_SubmittedAt" on public."ICUS_Submissions"
  for each row execute function public._multideck_customs_usage_watch();

commit;
