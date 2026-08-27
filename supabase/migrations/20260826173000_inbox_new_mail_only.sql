-- Product decision: connected inboxes process new mail only. Keep the fast
-- live scheduler and remove the historical mailbox backfill schedule.

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'multideck-email-index-backfill'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
