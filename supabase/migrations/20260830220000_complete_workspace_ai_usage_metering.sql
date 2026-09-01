-- Complete the workspace AI ledger. Every successful governed OpenAI request
-- and every provider-accepted Gemini transcription contributes to the same
-- pooled Admin usage bar. Transcription keeps its per-operator safety cap as
-- an additional guardrail, but it can no longer run past the workspace pool.

begin;

create index if not exists "IX_AI_TranscriptionUsage_company_month"
  on public."AI_TranscriptionUsage" (
    "TranscriptionUsage_CompanyID", "TranscriptionUsage_Status", "TranscriptionUsage_CreatedAt"
  );

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

  with raw_usage as materialized (
    select
      egress."AIDexterEgress_UserID" as user_id,
      case
        when p_category = 'ocr' then egress."AIDexterEgress_InputUnits"::numeric
        else coalesce(egress."AIDexterEgress_ActualCostGBP", egress."AIDexterEgress_EstimatedCostGBP")
      end as usage
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

    union all

    select
      transcription."TranscriptionUsage_UserID" as user_id,
      transcription."TranscriptionUsage_EstimatedCostGbp" as usage
    from public."AI_TranscriptionUsage" transcription
    where p_category = 'ai'
      and transcription."TranscriptionUsage_CompanyID" = p_company_id
      and transcription."TranscriptionUsage_Status" = 'succeeded'
      and transcription."TranscriptionUsage_CreatedAt" >= p_period_start
      and transcription."TranscriptionUsage_CreatedAt" < p_period_end
  ), usage_by_user as materialized (
    select raw_usage.user_id, coalesce(sum(raw_usage.usage), 0) as raw_usage
    from raw_usage
    group by raw_usage.user_id
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

create or replace function public.multideck_transcription_reserve(
  p_user_id uuid,
  p_company_id uuid,
  p_duration_seconds numeric,
  p_model text default 'gemini-3.5-transcribe'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_allowance numeric(10, 6);
  v_rate numeric(10, 6);
  v_used numeric(10, 6);
  v_cost numeric(10, 6);
  v_reservation_id uuid;
  v_workspace_state jsonb;
  v_workspace_remaining numeric := 0;
  v_workspace_reserved numeric := 0;
begin
  if p_user_id is null or p_company_id is null then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_CONTEXT_INVALID';
  end if;
  if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 180 then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_DURATION_INVALID';
  end if;
  if not exists (
    select 1
    from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = p_user_id
      and workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_CONTEXT_INVALID';
  end if;

  -- Use the same workspace lock as governed OpenAI reservations, followed by
  -- the operator lock, so concurrent dictations cannot overrun either pool.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text, 719));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || pg_catalog.date_trunc('month', now())::text, 0)
  );

  insert into public."AI_TranscriptionUsagePolicies" (
    "TranscriptionPolicy_UserID"
  ) values (p_user_id)
  on conflict ("TranscriptionPolicy_UserID") do nothing;

  select
    policy."TranscriptionPolicy_MonthlyAllowanceGbp",
    policy."TranscriptionPolicy_EstimatedGbpPerMinute"
  into v_allowance, v_rate
  from public."AI_TranscriptionUsagePolicies" policy
  where policy."TranscriptionPolicy_UserID" = p_user_id
  for update;

  update public."AI_TranscriptionUsage"
  set
    "TranscriptionUsage_Status" = 'expired',
    "TranscriptionUsage_CompletedAt" = now(),
    "TranscriptionUsage_ErrorCode" = 'reservation_expired'
  where "TranscriptionUsage_CompanyID" = p_company_id
    and "TranscriptionUsage_Status" = 'reserved'
    and "TranscriptionUsage_CreatedAt" < now() - interval '10 minutes';

  select coalesce(sum(usage."TranscriptionUsage_EstimatedCostGbp"), 0)
  into v_used
  from public."AI_TranscriptionUsage" usage
  where usage."TranscriptionUsage_UserID" = p_user_id
    and usage."TranscriptionUsage_Status" in ('reserved', 'succeeded')
    and usage."TranscriptionUsage_CreatedAt" >= pg_catalog.date_trunc('month', now())
    and usage."TranscriptionUsage_CreatedAt" < pg_catalog.date_trunc('month', now()) + interval '1 month';

  v_cost := round((pg_catalog.ceil(p_duration_seconds)::numeric / 60) * v_rate, 6);
  if v_used + v_cost > v_allowance then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_ALLOWANCE_REACHED';
  end if;

  v_workspace_state := public._multideck_dexter_allowance_state(p_company_id);
  if not coalesce((v_workspace_state ->> 'usageAllowed')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_ALLOWANCE_REACHED';
  end if;
  v_workspace_remaining := greatest(coalesce((v_workspace_state ->> 'includedUsageRemainingGbp')::numeric, 0), 0)
    + case when coalesce((v_workspace_state ->> 'extraUsageEnabled')::boolean, false)
      then coalesce((v_workspace_state ->> 'extraUsageRemainingGbp')::numeric, 1000000000)
      else 0
    end;
  select coalesce(sum(usage."TranscriptionUsage_EstimatedCostGbp"), 0)
  into v_workspace_reserved
  from public."AI_TranscriptionUsage" usage
  where usage."TranscriptionUsage_CompanyID" = p_company_id
    and usage."TranscriptionUsage_Status" = 'reserved'
    and usage."TranscriptionUsage_CreatedAt" >= pg_catalog.date_trunc('month', now())
    and usage."TranscriptionUsage_CreatedAt" < pg_catalog.date_trunc('month', now()) + interval '1 month';
  if v_workspace_reserved + v_cost > v_workspace_remaining then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_ALLOWANCE_REACHED';
  end if;

  insert into public."AI_TranscriptionUsage" (
    "TranscriptionUsage_UserID",
    "TranscriptionUsage_CompanyID",
    "TranscriptionUsage_Model",
    "TranscriptionUsage_DurationSeconds",
    "TranscriptionUsage_EstimatedCostGbp"
  ) values (
    p_user_id,
    p_company_id,
    left(coalesce(nullif(btrim(p_model), ''), 'gemini-3.5-transcribe'), 120),
    round(p_duration_seconds, 3),
    v_cost
  )
  returning "TranscriptionUsage_ID" into v_reservation_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.multideck_transcription_reserve(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.multideck_transcription_reserve(uuid, uuid, numeric, text)
  to service_role;

create or replace function public._multideck_transcription_usage_watch()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if old."TranscriptionUsage_Status" = 'reserved'
     and new."TranscriptionUsage_Status" = 'succeeded' then
    perform public._multideck_emit_usage_watch_signal(
      new."TranscriptionUsage_CompanyID",
      tg_table_name,
      new."TranscriptionUsage_ID",
      'ai'
    );
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_transcription_usage_watch()
  from public, anon, authenticated;

drop trigger if exists "TR_AI_TranscriptionUsage_usage_watch" on public."AI_TranscriptionUsage";
create trigger "TR_AI_TranscriptionUsage_usage_watch"
  after update of "TranscriptionUsage_Status" on public."AI_TranscriptionUsage"
  for each row execute function public._multideck_transcription_usage_watch();

comment on table public."AI_TranscriptionUsage" is
  'Server-only Gemini transcription ledger. Successful provider usage contributes to the pooled workspace AI allowance; audio and transcript text are never stored.';

-- The existing Customs category intentionally remains one distinct declaration
-- at first submission. iCustoms publicly describes per-declaration-submitted
-- pricing, while acceptance and clearance are later operational states. A
-- tenant's signed iCustoms order form must be checked before treating retries
-- or amendments as additional customer-billable units.

commit;
