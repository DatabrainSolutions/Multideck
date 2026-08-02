-- Keep recent provider mail independent from historical indexing. The live
-- worker is deterministic and performs no LLM work.

alter table public."Comm_Mailboxes"
  add column if not exists "CommMailbox_LiveSyncedAt" timestamptz;

comment on column public."Comm_Mailboxes"."CommMailbox_LiveSyncedAt" is
  'Last completed low-latency provider check, independent of historical index progress.';

create or replace function public."Comm_ConfigureEmailWatchWorkerSchedule"()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_job_id bigint;
begin
  select decrypted_secret
  into v_endpoint
  from vault.decrypted_secrets
  where name = 'multideck_email_watch_worker_endpoint'
  limit 1;

  if nullif(btrim(v_endpoint), '') is null then
    return false;
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'multideck-email-watch-worker',
      'multideck-email-live-sync',
      'multideck-email-index-backfill'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'multideck-email-live-sync',
    '10 seconds',
    format(
      $command$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-multideck-email-watch-secret', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'multideck_email_watch_worker_secret'
              limit 1
            )
          ),
          body := jsonb_build_object('source', 'cron', 'mode', 'live', 'requestedAt', now()),
          timeout_milliseconds := 55000
        );
      $command$,
      btrim(v_endpoint)
    )
  );

  perform cron.schedule(
    'multideck-email-index-backfill',
    '* * * * *',
    format(
      $command$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-multideck-email-watch-secret', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'multideck_email_watch_worker_secret'
              limit 1
            )
          ),
          body := jsonb_build_object('source', 'cron', 'mode', 'backfill', 'requestedAt', now()),
          timeout_milliseconds := 55000
        );
      $command$,
      btrim(v_endpoint)
    )
  );

  return true;
end;
$$;

revoke all on function public."Comm_ConfigureEmailWatchWorkerSchedule"()
  from public, anon, authenticated, service_role;

select public."Comm_ConfigureEmailWatchWorkerSchedule"();
