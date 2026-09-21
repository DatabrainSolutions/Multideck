-- Align customer-facing allowances with the confirmed commercial plans and
-- schedule metadata-only usage delivery to Multideck Cloud.

begin;

create or replace function public.multideck_configure_cloud_usage_schedule()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, vault, cron
as $$
declare
  v_endpoint text;
  v_worker_secret text;
  v_job_id bigint;
begin
  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets where name = 'multideck_cloud_usage_worker_endpoint' limit 1;
  select decrypted_secret into v_worker_secret
  from vault.decrypted_secrets where name = 'multideck_cloud_usage_worker_secret' limit 1;

  if nullif(btrim(v_endpoint), '') is null
     or btrim(v_endpoint) !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/cloud-usage-export$'
     or nullif(btrim(v_worker_secret), '') is null then
    return false;
  end if;

  for v_job_id in select jobid from cron.job where jobname = 'multideck-cloud-usage-export'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'multideck-cloud-usage-export',
    '*/15 * * * *',
    format($command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-multideck-cloud-usage-worker', %L
        ),
        body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
        timeout_milliseconds := 55000
      );
    $command$, btrim(v_endpoint), btrim(v_worker_secret))
  );
  return true;
end;
$$;

revoke all on function public.multideck_configure_cloud_usage_schedule()
  from public, anon, authenticated, service_role;

-- Existing tenants can call this after the two Vault values are installed.
select public.multideck_configure_cloud_usage_schedule();

-- Replace only the stale fixed document allowance in the existing function.
-- The full function is deliberately copied forward because applied migrations
-- are immutable.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public._multideck_usage_categories(uuid)'::regprocedure)
  into v_definition;
  if v_definition is null then raise exception 'Usage categories function is unavailable'; end if;
  v_definition := replace(v_definition, 'v_documents_included integer := 2000;', 'v_documents_included integer := 25000;');
  v_definition := replace(
    v_definition,
    'v_ocr_included := v_seat_count * 1000;',
    'v_ocr_included := v_seat_count * 1000;' || E'\n  v_documents_included := v_seat_count * 1000;'
  );
  if position('v_documents_included := v_seat_count * 1000;' in v_definition) = 0 then
    raise exception 'Document allowance patch could not be applied safely';
  end if;
  execute v_definition;
end;
$$;

commit;
