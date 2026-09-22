begin;
-- Supabase permits scheduler changes through cron.alter_job, not direct
-- writes to the extension-owned cron.job table. Preserve the existing audit,
-- identity, revision and recovery checks while using its supported API.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.multideck_cloud_lifecycle(uuid,text,bigint,uuid)'::regprocedure);
  if position('update cron.job set active=false where active;' in definition)=0
    or position('update cron.job set active=(saved_job->>''active'')::boolean where jobid=(saved_job->>''jobid'')::bigint;' in definition)=0 then
    raise exception 'Lifecycle source changed; review the scheduler repair before applying';
  end if;
  definition:=replace(definition,'update cron.job set active=false where active;',
    'perform cron.alter_job(job_id:=jobid,active:=false) from cron.job where active;');
  definition:=replace(definition,'update cron.job set active=(saved_job->>''active'')::boolean where jobid=(saved_job->>''jobid'')::bigint;',
    'perform cron.alter_job(job_id:=(saved_job->>''jobid'')::bigint,active:=(saved_job->>''active'')::boolean);');
  definition:=replace(definition,'delete from auth.sessions;', 'delete from auth.sessions where id is not null;');
  execute definition;
end $$;
commit;
