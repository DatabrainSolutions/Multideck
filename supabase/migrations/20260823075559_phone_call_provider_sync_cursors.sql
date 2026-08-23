-- Durable, service-only provider polling cursor and lease boundary.
-- A checkpoint can move only while the caller holds the current unexpired lease.

create table if not exists public."Comm_CallProviderSyncCursors" (
  "CommCallSyncCursor_ID" uuid primary key default gen_random_uuid(),
  "CommCallSyncCursor_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CommCallSyncCursor_ProviderCode" varchar(32) not null,
  "CommCallSyncCursor_SourceKey" varchar(300) not null,
  "CommCallSyncCursor_CheckpointJSON" jsonb not null default '{}'::jsonb,
  "CommCallSyncCursor_CheckpointCommittedAt" timestamptz,
  "CommCallSyncCursor_LeaseToken" uuid,
  "CommCallSyncCursor_LeaseAcquiredAt" timestamptz,
  "CommCallSyncCursor_LeaseExpiresAt" timestamptz,
  "CommCallSyncCursor_LastAttemptAt" timestamptz,
  "CommCallSyncCursor_LastSucceededAt" timestamptz,
  "CommCallSyncCursor_LastFailedAt" timestamptz,
  "CommCallSyncCursor_ConsecutiveFailures" integer not null default 0,
  "CommCallSyncCursor_LastErrorCode" varchar(80),
  "CommCallSyncCursor_LastErrorMessage" varchar(500),
  "CommCallSyncCursor_CreatedAt" timestamptz not null default clock_timestamp(),
  "CommCallSyncCursor_UpdatedAt" timestamptz not null default clock_timestamp(),
  constraint "UX_Comm_CallProviderSyncCursors_source" unique (
    "CommCallSyncCursor_CompanyID",
    "CommCallSyncCursor_ProviderCode",
    "CommCallSyncCursor_SourceKey"
  ),
  constraint "CK_Comm_CallProviderSyncCursors_provider" check (
    "CommCallSyncCursor_ProviderCode" in ('elevenlabs', 'twilio', '3cx')
  ),
  constraint "CK_Comm_CallProviderSyncCursors_source_key" check (
    "CommCallSyncCursor_SourceKey" = btrim("CommCallSyncCursor_SourceKey")
    and char_length("CommCallSyncCursor_SourceKey") between 1 and 300
  ),
  constraint "CK_Comm_CallProviderSyncCursors_checkpoint" check (
    jsonb_typeof("CommCallSyncCursor_CheckpointJSON") = 'object'
    and octet_length("CommCallSyncCursor_CheckpointJSON"::text) <= 8192
  ),
  constraint "CK_Comm_CallProviderSyncCursors_lease" check (
    (
      "CommCallSyncCursor_LeaseToken" is null
      and "CommCallSyncCursor_LeaseAcquiredAt" is null
      and "CommCallSyncCursor_LeaseExpiresAt" is null
    )
    or (
      "CommCallSyncCursor_LeaseToken" is not null
      and "CommCallSyncCursor_LeaseAcquiredAt" is not null
      and "CommCallSyncCursor_LeaseExpiresAt" is not null
      and "CommCallSyncCursor_LeaseExpiresAt" > "CommCallSyncCursor_LeaseAcquiredAt"
      and "CommCallSyncCursor_LeaseExpiresAt" <= "CommCallSyncCursor_LeaseAcquiredAt" + interval '10 minutes'
    )
  ),
  constraint "CK_Comm_CallProviderSyncCursors_failures" check (
    "CommCallSyncCursor_ConsecutiveFailures" >= 0
  )
);

create index if not exists "IX_Comm_CallProviderSyncCursors_available"
  on public."Comm_CallProviderSyncCursors" (
    "CommCallSyncCursor_CompanyID",
    "CommCallSyncCursor_ProviderCode",
    "CommCallSyncCursor_LeaseExpiresAt"
  );

alter table public."Comm_CallProviderSyncCursors" enable row level security;
alter table public."Comm_CallProviderSyncCursors" force row level security;

drop policy if exists "Service role manages provider sync cursors"
  on public."Comm_CallProviderSyncCursors";
create policy "Service role manages provider sync cursors"
  on public."Comm_CallProviderSyncCursors"
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public."Comm_CallProviderSyncCursors"
  from public, anon, authenticated;
grant select on table public."Comm_CallProviderSyncCursors"
  to service_role;

create or replace function public._multideck_phone_call_redact_sync_error(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value text := left(coalesce(p_value, ''), 2000);
begin
  v_value := coalesce(nullif(btrim(v_value), ''), 'Provider sync failed.');
  v_value := replace(replace(replace(v_value, chr(10), ' '), chr(13), ' '), chr(9), ' ');
  v_value := regexp_replace(
    v_value,
    '((authorization|api[_ -]?key|secret|token|password|auth[_ -]?token)[[:space:]]*[:=][[:space:]]*)((basic|bearer)[[:space:]]+)?[^[:space:],;]+',
    '\1[redacted]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(basic|bearer)[[:space:]]+[A-Za-z0-9+/_=.-]+',
    '\1 [redacted]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}',
    '[redacted-email]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '[+]?[0-9][0-9() .-]{7,}[0-9]',
    '[redacted-phone]',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '[A-Za-z0-9+/_=-]{32,}',
    '[redacted-value]',
    'g'
  );
  v_value := regexp_replace(v_value, '[[:space:]]+', ' ', 'g');
  return left(btrim(v_value), 500);
end;
$$;

create or replace function public.multideck_phone_call_provider_sync_claim(
  p_company_id uuid,
  p_provider_code text,
  p_source_key text,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider_code, '')));
  v_source_key text := btrim(coalesce(p_source_key, ''));
  v_lease_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_cursor public."Comm_CallProviderSyncCursors"%rowtype;
  v_active_until timestamptz;
begin
  if p_company_id is null then
    raise exception 'A company is required.' using errcode = '22023';
  end if;
  if v_provider not in ('elevenlabs', 'twilio', '3cx') then
    raise exception 'The provider is not supported.' using errcode = '22023';
  end if;
  if char_length(v_source_key) not between 1 and 300 then
    raise exception 'The provider source key is invalid.' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 15 and 600 then
    raise exception 'The provider lease must be between 15 and 600 seconds.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public."cmp_Company" company
    where company."Company_ID" = p_company_id
  ) then
    raise exception 'The company does not exist.' using errcode = '22023';
  end if;

  insert into public."Comm_CallProviderSyncCursors" as cursor (
    "CommCallSyncCursor_CompanyID",
    "CommCallSyncCursor_ProviderCode",
    "CommCallSyncCursor_SourceKey",
    "CommCallSyncCursor_LeaseToken",
    "CommCallSyncCursor_LeaseAcquiredAt",
    "CommCallSyncCursor_LeaseExpiresAt",
    "CommCallSyncCursor_LastAttemptAt",
    "CommCallSyncCursor_CreatedAt",
    "CommCallSyncCursor_UpdatedAt"
  ) values (
    p_company_id,
    v_provider,
    v_source_key,
    v_lease_token,
    v_now,
    v_now + make_interval(secs => p_lease_seconds),
    v_now,
    v_now,
    v_now
  )
  on conflict (
    "CommCallSyncCursor_CompanyID",
    "CommCallSyncCursor_ProviderCode",
    "CommCallSyncCursor_SourceKey"
  ) do update set
    "CommCallSyncCursor_LeaseToken" = excluded."CommCallSyncCursor_LeaseToken",
    "CommCallSyncCursor_LeaseAcquiredAt" = excluded."CommCallSyncCursor_LeaseAcquiredAt",
    "CommCallSyncCursor_LeaseExpiresAt" = excluded."CommCallSyncCursor_LeaseExpiresAt",
    "CommCallSyncCursor_LastAttemptAt" = excluded."CommCallSyncCursor_LastAttemptAt",
    "CommCallSyncCursor_UpdatedAt" = excluded."CommCallSyncCursor_UpdatedAt"
  where cursor."CommCallSyncCursor_CompanyID" = p_company_id
    and cursor."CommCallSyncCursor_ProviderCode" = v_provider
    and cursor."CommCallSyncCursor_SourceKey" = v_source_key
    and (
      cursor."CommCallSyncCursor_LeaseToken" is null
      or cursor."CommCallSyncCursor_LeaseExpiresAt" <= v_now
    )
  returning cursor.* into v_cursor;

  if v_cursor."CommCallSyncCursor_ID" is null then
    select cursor."CommCallSyncCursor_LeaseExpiresAt"
    into v_active_until
    from public."Comm_CallProviderSyncCursors" cursor
    where cursor."CommCallSyncCursor_CompanyID" = p_company_id
      and cursor."CommCallSyncCursor_ProviderCode" = v_provider
      and cursor."CommCallSyncCursor_SourceKey" = v_source_key;

    return jsonb_build_object(
      'claimed', false,
      'retryAt', v_active_until
    );
  end if;

  return jsonb_build_object(
    'claimed', true,
    'companyId', v_cursor."CommCallSyncCursor_CompanyID",
    'provider', v_cursor."CommCallSyncCursor_ProviderCode",
    'sourceKey', v_cursor."CommCallSyncCursor_SourceKey",
    'leaseToken', v_cursor."CommCallSyncCursor_LeaseToken",
    'leaseExpiresAt', v_cursor."CommCallSyncCursor_LeaseExpiresAt",
    'checkpoint', v_cursor."CommCallSyncCursor_CheckpointJSON"
  );
end;
$$;

create or replace function public.multideck_phone_call_provider_sync_commit(
  p_company_id uuid,
  p_provider_code text,
  p_source_key text,
  p_lease_token uuid,
  p_checkpoint jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider_code, '')));
  v_source_key text := btrim(coalesce(p_source_key, ''));
  v_now timestamptz := clock_timestamp();
  v_checkpoint jsonb;
begin
  if p_company_id is null or p_lease_token is null then
    raise exception 'A company and lease token are required.' using errcode = '22023';
  end if;
  if v_provider not in ('elevenlabs', 'twilio', '3cx') then
    raise exception 'The provider is not supported.' using errcode = '22023';
  end if;
  if char_length(v_source_key) not between 1 and 300 then
    raise exception 'The provider source key is invalid.' using errcode = '22023';
  end if;
  if p_checkpoint is null
    or jsonb_typeof(p_checkpoint) <> 'object'
    or octet_length(p_checkpoint::text) > 8192
  then
    raise exception 'The provider checkpoint must be a bounded JSON object.' using errcode = '22023';
  end if;

  update public."Comm_CallProviderSyncCursors" cursor
  set
    "CommCallSyncCursor_CheckpointJSON" = p_checkpoint,
    "CommCallSyncCursor_CheckpointCommittedAt" = v_now,
    "CommCallSyncCursor_LeaseToken" = null,
    "CommCallSyncCursor_LeaseAcquiredAt" = null,
    "CommCallSyncCursor_LeaseExpiresAt" = null,
    "CommCallSyncCursor_LastSucceededAt" = v_now,
    "CommCallSyncCursor_ConsecutiveFailures" = 0,
    "CommCallSyncCursor_LastErrorCode" = null,
    "CommCallSyncCursor_LastErrorMessage" = null,
    "CommCallSyncCursor_UpdatedAt" = v_now
  where cursor."CommCallSyncCursor_CompanyID" = p_company_id
    and cursor."CommCallSyncCursor_ProviderCode" = v_provider
    and cursor."CommCallSyncCursor_SourceKey" = v_source_key
    and cursor."CommCallSyncCursor_LeaseToken" = p_lease_token
    and cursor."CommCallSyncCursor_LeaseExpiresAt" > v_now
  returning cursor."CommCallSyncCursor_CheckpointJSON" into v_checkpoint;

  if v_checkpoint is null then
    raise exception 'The provider lease is missing, expired, or no longer owned.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'committed', true,
    'companyId', p_company_id,
    'provider', v_provider,
    'sourceKey', v_source_key,
    'checkpoint', v_checkpoint,
    'committedAt', v_now
  );
end;
$$;

create or replace function public.multideck_phone_call_provider_sync_fail(
  p_company_id uuid,
  p_provider_code text,
  p_source_key text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider_code, '')));
  v_source_key text := btrim(coalesce(p_source_key, ''));
  v_error_code text := left(
    nullif(
      btrim(
        regexp_replace(
          lower(public._multideck_phone_call_redact_sync_error(
            coalesce(nullif(btrim(p_error_code), ''), 'provider_sync_failed')
          )),
          '[^a-z0-9._:-]+',
          '_',
          'g'
        ),
        '_'
      ),
      ''
    ),
    80
  );
  v_error_message text := public._multideck_phone_call_redact_sync_error(p_error_message);
  v_now timestamptz := clock_timestamp();
  v_checkpoint jsonb;
begin
  if p_company_id is null or p_lease_token is null then
    raise exception 'A company and lease token are required.' using errcode = '22023';
  end if;
  if v_provider not in ('elevenlabs', 'twilio', '3cx') then
    raise exception 'The provider is not supported.' using errcode = '22023';
  end if;
  if char_length(v_source_key) not between 1 and 300 then
    raise exception 'The provider source key is invalid.' using errcode = '22023';
  end if;
  v_error_code := coalesce(v_error_code, 'provider_sync_failed');

  update public."Comm_CallProviderSyncCursors" cursor
  set
    "CommCallSyncCursor_LeaseToken" = null,
    "CommCallSyncCursor_LeaseAcquiredAt" = null,
    "CommCallSyncCursor_LeaseExpiresAt" = null,
    "CommCallSyncCursor_LastFailedAt" = v_now,
    "CommCallSyncCursor_ConsecutiveFailures" = least(
      cursor."CommCallSyncCursor_ConsecutiveFailures" + 1,
      2147483647
    ),
    "CommCallSyncCursor_LastErrorCode" = v_error_code,
    "CommCallSyncCursor_LastErrorMessage" = v_error_message,
    "CommCallSyncCursor_UpdatedAt" = v_now
  where cursor."CommCallSyncCursor_CompanyID" = p_company_id
    and cursor."CommCallSyncCursor_ProviderCode" = v_provider
    and cursor."CommCallSyncCursor_SourceKey" = v_source_key
    and cursor."CommCallSyncCursor_LeaseToken" = p_lease_token
    and cursor."CommCallSyncCursor_LeaseExpiresAt" > v_now
  returning cursor."CommCallSyncCursor_CheckpointJSON" into v_checkpoint;

  if v_checkpoint is null then
    raise exception 'The provider lease is missing, expired, or no longer owned.' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'failed', true,
    'companyId', p_company_id,
    'provider', v_provider,
    'sourceKey', v_source_key,
    'checkpoint', v_checkpoint,
    'errorCode', v_error_code,
    'errorMessage', v_error_message,
    'failedAt', v_now
  );
end;
$$;

revoke all on function public._multideck_phone_call_redact_sync_error(text)
  from public, anon, authenticated, service_role;
revoke all on function public.multideck_phone_call_provider_sync_claim(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.multideck_phone_call_provider_sync_commit(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.multideck_phone_call_provider_sync_fail(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.multideck_phone_call_provider_sync_claim(uuid, text, text, integer)
  to service_role;
grant execute on function public.multideck_phone_call_provider_sync_commit(uuid, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.multideck_phone_call_provider_sync_fail(uuid, text, text, uuid, text, text)
  to service_role;

comment on table public."Comm_CallProviderSyncCursors" is
  'Service-only durable checkpoints and exclusive bounded leases for phone-call provider collection.';
comment on function public.multideck_phone_call_provider_sync_claim(uuid, text, text, integer) is
  'Atomically claims one company/provider/source cursor and returns its last committed checkpoint.';
comment on function public.multideck_phone_call_provider_sync_commit(uuid, text, text, uuid, jsonb) is
  'Commits a provider checkpoint only for the current unexpired lease holder.';
comment on function public.multideck_phone_call_provider_sync_fail(uuid, text, text, uuid, text, text) is
  'Releases the current lease after a failure, retaining the checkpoint and storing bounded redacted diagnostics.';
