-- Per-operator smart dictation preferences and a server-only Gemini allowance.
-- Audio and transcript text are deliberately not stored: the client sends one
-- transient recording to the Edge Function and receives text for the focused
-- field. Only duration, model and cost metadata remain for quota enforcement.

begin;

create table if not exists public."AI_TranscriptionPreferences" (
  "TranscriptionPreference_UserID" uuid primary key
    references public."cmp_Users" ("User_ID") on delete cascade,
  "TranscriptionPreference_CustomVocabulary" jsonb not null default '[]'::jsonb,
  "TranscriptionPreference_UpdatedAt" timestamptz not null default now(),
  constraint "CK_AI_TranscriptionPreferences_vocabulary"
    check (
      jsonb_typeof("TranscriptionPreference_CustomVocabulary") = 'array'
      and jsonb_array_length("TranscriptionPreference_CustomVocabulary") <= 100
    )
);

create table if not exists public."AI_TranscriptionUsagePolicies" (
  "TranscriptionPolicy_UserID" uuid primary key
    references public."cmp_Users" ("User_ID") on delete cascade,
  "TranscriptionPolicy_MonthlyAllowanceGbp" numeric(10, 6) not null default 2.000000,
  "TranscriptionPolicy_EstimatedGbpPerMinute" numeric(10, 6) not null default 0.005000,
  "TranscriptionPolicy_UpdatedAt" timestamptz not null default now(),
  "TranscriptionPolicy_UpdatedBy" uuid,
  constraint "CK_AI_TranscriptionUsagePolicies_allowance"
    check ("TranscriptionPolicy_MonthlyAllowanceGbp" >= 0),
  constraint "CK_AI_TranscriptionUsagePolicies_rate"
    check ("TranscriptionPolicy_EstimatedGbpPerMinute" > 0)
);

create table if not exists public."AI_TranscriptionUsage" (
  "TranscriptionUsage_ID" uuid primary key default gen_random_uuid(),
  "TranscriptionUsage_UserID" uuid not null
    references public."cmp_Users" ("User_ID") on delete cascade,
  "TranscriptionUsage_CompanyID" uuid not null,
  "TranscriptionUsage_Model" varchar(120) not null default 'gemini-3.5-transcribe',
  "TranscriptionUsage_DurationSeconds" numeric(10, 3) not null,
  "TranscriptionUsage_EstimatedCostGbp" numeric(10, 6) not null,
  "TranscriptionUsage_Status" varchar(20) not null default 'reserved',
  "TranscriptionUsage_ProviderRequestID" varchar(240),
  "TranscriptionUsage_ErrorCode" varchar(120),
  "TranscriptionUsage_CreatedAt" timestamptz not null default now(),
  "TranscriptionUsage_CompletedAt" timestamptz,
  constraint "CK_AI_TranscriptionUsage_duration"
    check ("TranscriptionUsage_DurationSeconds" > 0 and "TranscriptionUsage_DurationSeconds" <= 180),
  constraint "CK_AI_TranscriptionUsage_cost"
    check ("TranscriptionUsage_EstimatedCostGbp" >= 0),
  constraint "CK_AI_TranscriptionUsage_status"
    check ("TranscriptionUsage_Status" in ('reserved', 'succeeded', 'failed', 'expired'))
);

create index if not exists "IX_AI_TranscriptionUsage_user_month"
  on public."AI_TranscriptionUsage" (
    "TranscriptionUsage_UserID",
    "TranscriptionUsage_CreatedAt" desc
  );

alter table public."AI_TranscriptionPreferences" enable row level security;
alter table public."AI_TranscriptionUsagePolicies" enable row level security;
alter table public."AI_TranscriptionUsage" enable row level security;

revoke all on table public."AI_TranscriptionPreferences" from public, anon, authenticated;
revoke all on table public."AI_TranscriptionUsagePolicies" from public, anon, authenticated;
revoke all on table public."AI_TranscriptionUsage" from public, anon, authenticated;
grant select, insert, update, delete on table public."AI_TranscriptionPreferences" to service_role;
grant select, insert, update, delete on table public."AI_TranscriptionUsagePolicies" to service_role;
grant select, insert, update, delete on table public."AI_TranscriptionUsage" to service_role;

comment on table public."AI_TranscriptionPreferences" is
  'Private per-operator Gemini dictation vocabulary. Microphone selection remains device-local.';
comment on table public."AI_TranscriptionUsagePolicies" is
  'Server-managed per-operator monthly dictation allowance. Internal cost values are not returned to the client.';
comment on table public."AI_TranscriptionUsage" is
  'Server-only Gemini transcription quota ledger. Audio and transcript text are never stored.';

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

  -- Serialise one operator's monthly reservations so concurrent recordings
  -- cannot both see the same remaining allowance.
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
  where "TranscriptionUsage_UserID" = p_user_id
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

create or replace function public.multideck_transcription_settle(
  p_reservation_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_outcome text,
  p_provider_request_id text default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_outcome not in ('succeeded', 'failed') then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_OUTCOME_INVALID';
  end if;

  update public."AI_TranscriptionUsage"
  set
    "TranscriptionUsage_Status" = p_outcome,
    "TranscriptionUsage_ProviderRequestID" = left(nullif(btrim(p_provider_request_id), ''), 240),
    "TranscriptionUsage_ErrorCode" = left(nullif(btrim(p_error_code), ''), 120),
    "TranscriptionUsage_CompletedAt" = now()
  where "TranscriptionUsage_ID" = p_reservation_id
    and "TranscriptionUsage_UserID" = p_user_id
    and "TranscriptionUsage_CompanyID" = p_company_id
    and "TranscriptionUsage_Status" = 'reserved';

  if not found then
    raise exception using errcode = 'P0001', message = 'TRANSCRIPTION_RESERVATION_INVALID';
  end if;
end;
$$;

revoke all on function public.multideck_transcription_reserve(uuid, uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.multideck_transcription_settle(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.multideck_transcription_reserve(uuid, uuid, numeric, text)
  to service_role;
grant execute on function public.multideck_transcription_settle(uuid, uuid, uuid, text, text, text)
  to service_role;

commit;
