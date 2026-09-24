-- Contracted seats are provisioned by Multideck, never inferred from active users.
-- Existing contracts remain unchanged until PaidSeats is explicitly configured.
begin;
alter table public."AI_DexterUsagePolicies"
 add column "AIUsagePolicy_PaidSeats" integer check ("AIUsagePolicy_PaidSeats" between 1 and 100000),
 add column "AIUsagePolicy_AiOverrideGbp" numeric check ("AIUsagePolicy_AiOverrideGbp" >= 0),
 add column "AIUsagePolicy_DocumentOverride" integer check ("AIUsagePolicy_DocumentOverride" >= 0);

create or replace function public._multideck_subscription(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare p public."AI_DexterUsagePolicies"; seats integer; occupied integer; code text; base integer; cap integer;
begin
 select * into p from public."AI_DexterUsagePolicies" where "AIUsagePolicy_CompanyID"=p_company_id;
 seats:=p."AIUsagePolicy_PaidSeats";
 code:=coalesce(p."AIUsagePolicy_PlanCode",'25');
 if seats is not null and code <> 'enterprise' then code:=case when seats<=10 then '10' when seats<=25 then '25' when seats<=50 then '50' else 'enterprise' end; end if;
 base:=case code when '10' then 1995 when '25' then 2995 when '50' then 3995 else null end;
 cap:=coalesce(seats,case code when '10' then 10 when '25' then 25 when '50' then 50 when '75' then 75 else null end);
 select count(*)::integer into occupied from public."cmp_Users" where "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active';
 return jsonb_build_object('planCode',code,'planName',case code when '10' then 'Basic' when '25' then 'Pro' when '50' then 'Ultra' when '75' then 'Legacy 75' else 'Enterprise' end,
 'paidSeats',seats,'seatLimit',cap,'occupiedSeats',occupied,'remainingSeats',greatest(coalesce(cap,0)-occupied,0),
 'canAddUser',cap is not null and occupied<cap,'pricingConfigured',seats is not null,
 'baseMonthlyGbp',case when seats is not null then base else null end,'seatMonthlyGbp',case when seats is not null and base is not null then 149 else null end,
 'monthlyGbp',case when seats is not null then base+149*seats else null end);
end $$;
revoke all on function public._multideck_subscription(uuid) from public,anon,authenticated;
grant execute on function public._multideck_subscription(uuid) to service_role;

-- The row lock serialises competing admissions, including direct imports and reactivation.
create or replace function public._multideck_enforce_paid_seats()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare capacity jsonb;
begin
 if new."Company_ID" is null or coalesce(new."User_AccessStatus",'active')<>'active' then return new; end if;
 -- BEFORE INSERT also runs for ON CONFLICT DO UPDATE during auth profile refresh.
 if TG_OP='INSERT' and new."Auth_User_ID" is not null and exists (
   select 1 from public."cmp_Users" u where u."Auth_User_ID"=new."Auth_User_ID"
     and u."Company_ID"=new."Company_ID" and coalesce(u."User_AccessStatus",'active')='active'
 ) then return new; end if;
 if TG_OP='UPDATE' then
   if old."Company_ID" is not distinct from new."Company_ID" and coalesce(old."User_AccessStatus",'active')='active' then return new; end if;
 end if;
 -- Lock the company, not a possibly absent contract row. This also covers legacy workspaces.
 perform 1 from public."cmp_Company" where "Company_ID"=new."Company_ID" for update;
 capacity:=public._multideck_subscription(new."Company_ID");
 if not (capacity->>'canAddUser')::boolean then
   raise exception 'Your workspace has no available seats. Contact Multideck to increase your paid seats.' using errcode='P0001',detail='paid_seat_limit_reached';
 end if;
 return new;
end $$;
revoke all on function public._multideck_enforce_paid_seats() from public,anon,authenticated;
create trigger "TR_cmp_Users_paid_seats" before insert or update of "Company_ID","User_AccessStatus" on public."cmp_Users" for each row execute function public._multideck_enforce_paid_seats();

-- Append-only provisioning evidence. No browser role can view or change it.
create table public."AI_SubscriptionChanges" (
 "SubscriptionChange_ID" uuid primary key default gen_random_uuid(),
 "SubscriptionChange_CompanyID" uuid not null,
 "SubscriptionChange_At" timestamptz not null default now(),
 "SubscriptionChange_Before" jsonb,
 "SubscriptionChange_After" jsonb not null
);
alter table public."AI_SubscriptionChanges" enable row level security;
revoke all on public."AI_SubscriptionChanges" from public,anon,authenticated,service_role;
grant select on public."AI_SubscriptionChanges" to service_role;
create or replace function public._multideck_audit_subscription()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public."AI_SubscriptionChanges"("SubscriptionChange_CompanyID","SubscriptionChange_Before","SubscriptionChange_After")
 values(new."AIUsagePolicy_CompanyID",case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public._multideck_audit_subscription() from public,anon,authenticated;
create trigger "TR_AI_DexterUsagePolicies_subscription_audit" after insert or update on public."AI_DexterUsagePolicies" for each row execute function public._multideck_audit_subscription();

-- Contract changes are service-only and cannot shrink below occupied seats.
create or replace function public._multideck_validate_paid_seats()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare occupied integer;
begin
 if new."AIUsagePolicy_PaidSeats" is null then return new; end if;
 perform 1 from public."cmp_Company" where "Company_ID"=new."AIUsagePolicy_CompanyID" for update;
 select count(*) into occupied from public."cmp_Users" where "Company_ID"=new."AIUsagePolicy_CompanyID" and coalesce("User_AccessStatus",'active')='active';
 if new."AIUsagePolicy_PaidSeats"<occupied then raise exception 'Paid seats cannot be lower than occupied seats.' using errcode='22023'; end if;
 new."AIUsagePolicy_PlanCode":=case when new."AIUsagePolicy_PlanCode"='enterprise' or new."AIUsagePolicy_PaidSeats">50 then 'enterprise' when new."AIUsagePolicy_PaidSeats"<=10 then '10' when new."AIUsagePolicy_PaidSeats"<=25 then '25' else '50' end;
 new."AIUsagePolicy_UpdatedAt":=now();
 return new;
end $$;
revoke all on function public._multideck_validate_paid_seats() from public,anon,authenticated;
create trigger "TR_AI_DexterUsagePolicies_paid_seats" before insert or update on public."AI_DexterUsagePolicies" for each row execute function public._multideck_validate_paid_seats();

create or replace function public.multideck_get_subscription()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare context record;
begin
 select * into context from public._multideck_dexter_context();
 if not private.is_tenant_administrator(context.user_id) then raise exception 'Only tenant administrators can view the subscription.' using errcode='42501'; end if;
 return public._multideck_subscription(context.company_id);
end $$;
revoke all on function public.multideck_get_subscription() from public,anon;
grant execute on function public.multideck_get_subscription() to authenticated;

create or replace function public._multideck_dexter_allowance_state(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_paid_seats integer;
  v_override numeric;
  v_plan text := '25';
  v_included numeric := 1442.3077;
  v_payg_configured boolean := false;
  v_billing_ready boolean := false;
  v_payg_enabled boolean := false;
  v_payg_limit numeric := null;
  v_payg_rate numeric := 1;
  v_openai_usage numeric := 0;
  v_transcription_usage numeric := 0;
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
  select "AIUsagePolicy_PaidSeats", "AIUsagePolicy_AiOverrideGbp" into v_paid_seats,v_override
    from public."AI_DexterUsagePolicies" where "AIUsagePolicy_CompanyID"=p_company_id;
  if v_paid_seats is not null then
    -- Same 0.8 GBP/USD conversion as the governed AI cost ledger, not commercial FX.
    v_included:=coalesce(v_override,v_paid_seats*50*0.8);
    v_plan:=public._multideck_subscription(p_company_id)->>'planCode';
  end if;
  v_payg_configured := coalesce(v_payg_configured, false);
  v_billing_ready := coalesce(v_billing_ready, false);
  v_payg_rate := coalesce(v_payg_rate, 1);
  v_payg_enabled := v_payg_configured and v_billing_ready;

  select coalesce(sum(coalesce(
    egress."AIDexterEgress_ActualCostGBP",
    egress."AIDexterEgress_EstimatedCostGBP"
  )), 0)
  into v_openai_usage
  from public."AI_DexterModelEgressAudit" egress
  where egress."AIDexterEgress_CompanyID" = p_company_id
    and egress."AIDexterEgress_Provider" = 'openai'
    and egress."AIDexterEgress_Outcome" = 'succeeded'
    and egress."AIDexterEgress_CreatedAt" >= date_trunc('month', now())
    and egress."AIDexterEgress_CreatedAt" < date_trunc('month', now()) + interval '1 month';

  select coalesce(sum(transcription."TranscriptionUsage_EstimatedCostGbp"), 0)
  into v_transcription_usage
  from public."AI_TranscriptionUsage" transcription
  where transcription."TranscriptionUsage_CompanyID" = p_company_id
    and transcription."TranscriptionUsage_Status" = 'succeeded'
    and transcription."TranscriptionUsage_CreatedAt" >= date_trunc('month', now())
    and transcription."TranscriptionUsage_CreatedAt" < date_trunc('month', now()) + interval '1 month';

  v_usage := round(coalesce(v_openai_usage, 0) + coalesce(v_transcription_usage, 0), 6);
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


create or replace function public._multideck_usage_categories(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subscription jsonb;
  v_paid_seats integer;
  v_document_override integer;
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
  v_subscription:=public._multideck_subscription(p_company_id);
  v_paid_seats:=(v_subscription->>'paidSeats')::integer;
  if v_paid_seats is not null then
    v_seat_count:=v_paid_seats;
    select "AIUsagePolicy_DocumentOverride" into v_document_override from public."AI_DexterUsagePolicies" where "AIUsagePolicy_CompanyID"=p_company_id;
    v_documents_included:=coalesce(v_document_override,v_paid_seats*1000);
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
    'subscription', v_subscription,
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


do $patch$
declare signature regprocedure:='public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)'::regprocedure; definition text; anchor text:='  v_ocr_included := v_seat_count * 1000;';
begin
 definition:=pg_get_functiondef(signature);
 if position(anchor in definition)=0 then raise exception 'OCR seat-count patch anchor missing'; end if;
 execute replace(definition,anchor,'  v_seat_count := coalesce((public._multideck_subscription(p_company_id)->>''paidSeats'')::integer,v_seat_count);' || chr(10) || anchor);
end $patch$;

-- Count completed renders and reserve capacity for in-flight jobs atomically.
create or replace function public._multideck_enforce_document_capacity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid; seats integer; allowance integer; used integer;
begin
 if lower(new."DOCBRJ_RenderEngineCode")<>'carbone' or new."DOCBRJ_StatusCode" not in ('queued','rendering','completed') then return new; end if;
 if TG_OP='UPDATE' then
   if old."DOCBRJ_StatusCode" in ('queued','rendering','completed') then return new; end if;
 end if;
 select "Company_ID" into company from public."cmp_Users" where "User_ID"=new."DOCBRJ_CreatedBy";
 if company is null then return new; end if;
 perform 1 from public."cmp_Company" where "Company_ID"=company for update;
 select "AIUsagePolicy_PaidSeats",coalesce("AIUsagePolicy_DocumentOverride","AIUsagePolicy_PaidSeats"*1000) into seats,allowance from public."AI_DexterUsagePolicies" where "AIUsagePolicy_CompanyID"=company;
 if seats is null then return new; end if;
 select count(*) into used from public."DOCB_RenderJobs" job join public."cmp_Users" u on u."User_ID"=job."DOCBRJ_CreatedBy"
 where u."Company_ID"=company and lower(job."DOCBRJ_RenderEngineCode")='carbone'
 and ((job."DOCBRJ_StatusCode"='completed' and job."DOCBRJ_CompletedAt">=date_trunc('month',now()))
 or (job."DOCBRJ_StatusCode" in ('queued','rendering')));
 if used>=allowance then raise exception 'Your monthly generated-document allowance has been reached. Contact Multideck for additional capacity.' using errcode='P0001'; end if;
 return new;
end $$;
revoke all on function public._multideck_enforce_document_capacity() from public,anon,authenticated;
create trigger "TR_DOCB_RenderJobs_paid_capacity" before insert or update of "DOCBRJ_StatusCode" on public."DOCB_RenderJobs" for each row execute function public._multideck_enforce_document_capacity();
commit;
