begin;

create or replace function public.multideck_phone_call_configure_worker_schedules()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_worker_secret text;
  v_twilio_enabled boolean := false;
  v_elevenlabs_enabled boolean := false;
  v_3cx_xapi_enabled boolean := false;
  v_job_id bigint;
begin
  select secret.decrypted_secret
  into v_endpoint
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_worker_endpoint'
  limit 1;

  select secret.decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_worker_secret'
  limit 1;

  if nullif(btrim(v_endpoint), '') is null
    or btrim(v_endpoint) !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/phone-calls$' then
    raise exception 'Phone calls worker endpoint is missing or is not a tenant Supabase Phone calls Function URL.'
      using errcode = '55000';
  end if;

  if nullif(btrim(v_worker_secret), '') is null or length(v_worker_secret) < 32 then
    raise exception 'Phone calls worker secret is missing or invalid.'
      using errcode = '55000';
  end if;

  select coalesce(lower(btrim(secret.decrypted_secret)) = 'true', false)
  into v_twilio_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_twilio_sync_enabled'
  limit 1;

  select coalesce(lower(btrim(secret.decrypted_secret)) = 'true', false)
  into v_elevenlabs_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_elevenlabs_sync_enabled'
  limit 1;

  select coalesce(lower(btrim(secret.decrypted_secret)) = 'true', false)
  into v_3cx_xapi_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_3cx_xapi_sync_enabled'
  limit 1;

  for v_job_id in
    select job.jobid
    from cron.job job
    where job.jobname in (
      'multideck-phone-calls-twilio-sync',
      'multideck-phone-calls-elevenlabs-sync',
      'multideck-phone-calls-3cx-xapi-sync',
      'multideck-phone-calls-retry',
      'multideck-phone-calls-retention'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  if coalesce(v_twilio_enabled, false) then
    perform cron.schedule(
      'multideck-phone-calls-twilio-sync',
      '* * * * *',
      $schedule$
      select net.http_post(
        url := (
          select btrim(secret.decrypted_secret)
          from vault.decrypted_secrets secret
          where secret.name = 'multideck_phone_calls_worker_endpoint'
          limit 1
        ) || '/sync/twilio',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-worker-secret', (
            select secret.decrypted_secret
            from vault.decrypted_secrets secret
            where secret.name = 'multideck_phone_calls_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
      $schedule$
    );
  end if;

  if coalesce(v_elevenlabs_enabled, false) then
    perform cron.schedule(
      'multideck-phone-calls-elevenlabs-sync',
      '*/2 * * * *',
      $schedule$
      select net.http_post(
        url := (
          select btrim(secret.decrypted_secret)
          from vault.decrypted_secrets secret
          where secret.name = 'multideck_phone_calls_worker_endpoint'
          limit 1
        ) || '/sync/elevenlabs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-worker-secret', (
            select secret.decrypted_secret
            from vault.decrypted_secrets secret
            where secret.name = 'multideck_phone_calls_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
      $schedule$
    );
  end if;

  -- This readiness marker must remain absent/false until the XAPI credentials
  -- and the tenant-specific call-log filter semantics have been approved.
  if coalesce(v_3cx_xapi_enabled, false) then
    perform cron.schedule(
      'multideck-phone-calls-3cx-xapi-sync',
      '*/2 * * * *',
      $schedule$
      select net.http_post(
        url := (
          select btrim(secret.decrypted_secret)
          from vault.decrypted_secrets secret
          where secret.name = 'multideck_phone_calls_worker_endpoint'
          limit 1
        ) || '/sync/3cx-xapi',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-worker-secret', (
            select secret.decrypted_secret
            from vault.decrypted_secrets secret
            where secret.name = 'multideck_phone_calls_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
      $schedule$
    );
  end if;

  perform cron.schedule(
    'multideck-phone-calls-retry',
    '* * * * *',
    $schedule$
      select net.http_post(
        url := (
          select btrim(secret.decrypted_secret)
          from vault.decrypted_secrets secret
          where secret.name = 'multideck_phone_calls_worker_endpoint'
          limit 1
        ) || '/maintenance/retry',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-worker-secret', (
            select secret.decrypted_secret
            from vault.decrypted_secrets secret
            where secret.name = 'multideck_phone_calls_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
    $schedule$
  );

  perform cron.schedule(
    'multideck-phone-calls-retention',
    '17 2 * * *',
    $schedule$
      select net.http_post(
        url := (
          select btrim(secret.decrypted_secret)
          from vault.decrypted_secrets secret
          where secret.name = 'multideck_phone_calls_worker_endpoint'
          limit 1
        ) || '/maintenance/retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-worker-secret', (
            select secret.decrypted_secret
            from vault.decrypted_secrets secret
            where secret.name = 'multideck_phone_calls_worker_secret'
            limit 1
          )
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
    $schedule$
  );

  return true;
end;
$$;

revoke all on function public.multideck_phone_call_configure_worker_schedules()
  from public, anon, authenticated;
grant execute on function public.multideck_phone_call_configure_worker_schedules()
  to service_role;

comment on function public.multideck_phone_call_configure_worker_schedules() is
  'Idempotently configures tenant-local Phone calls workers after validating Vault configuration. 3CX XAPI polling is opt-in only after credentials and call-log scope are approved.';

select public.multideck_phone_call_configure_worker_schedules();

commit;
