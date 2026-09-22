begin;

alter table private.tenant_lifecycle
  add column access_may_remain_until timestamptz,
  drop constraint tenant_lifecycle_last_action_check,
  add constraint tenant_lifecycle_last_action_check
    check(last_action in ('shutdown','verify_shutdown','recover'));

create or replace function public.multideck_cloud_lifecycle(
  p_tenant_id uuid,
  p_action text,
  p_revision bigint default null,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  saved private.tenant_lifecycle%rowtype;
  jobs jsonb;
  saved_job jsonb;
  remaining_sessions bigint;
  remaining_jobs bigint;
begin
  if not exists(
    select 1 from private.cloud_product_state
    where singleton and tenant_id=p_tenant_id
  ) then
    raise exception 'Customer identity does not match' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(934712,3);
  select * into saved from private.tenant_lifecycle where singleton for update;

  if p_action='status' then
    return jsonb_build_object(
      'tenantId',p_tenant_id,
      'state',coalesce(saved.state,'active'),
      'revision',coalesce(saved.revision,0),
      'shutdownVerified',coalesce(saved.state='offline' and saved.offline_verified_at is not null,false),
      'offlineVerifiedAt',saved.offline_verified_at,
      'accessMayRemainUntil',saved.access_may_remain_until,
      'providerEvidence',coalesce(saved.provider_evidence,'{}'::jsonb)
    );
  end if;

  if p_action not in ('shutdown','verify_shutdown','recover')
    or p_revision is null or p_revision<1 or p_request_id is null then
    raise exception 'Invalid lifecycle command' using errcode='22023';
  end if;

  if saved.revision is not null then
    if saved.revision=p_revision and saved.request_id=p_request_id and saved.last_action=p_action then
      return jsonb_build_object(
        'tenantId',p_tenant_id,'state',saved.state,'revision',saved.revision,
        'shutdownVerified',saved.state='offline' and saved.offline_verified_at is not null,
        'offlineVerifiedAt',saved.offline_verified_at,
        'accessMayRemainUntil',saved.access_may_remain_until,
        'providerEvidence',coalesce(saved.provider_evidence,'{}'::jsonb)
      );
    end if;
    if saved.revision>=p_revision then
      raise exception 'Lifecycle revision conflict' using errcode='40001';
    end if;
  end if;

  if p_action='recover' then
    if saved.state is null or saved.state='active' then
      raise exception 'No shutdown to recover' using errcode='22023';
    end if;
    for saved_job in select * from jsonb_array_elements(saved.previous_cron) loop
      if not exists(
        select 1 from cron.job j
        where j.jobid=(saved_job->>'jobid')::bigint
          and j.jobname is not distinct from saved_job->>'jobname'
          and j.schedule=saved_job->>'schedule'
          and md5(j.command)=saved_job->>'commandChecksum'
      ) then
        raise exception 'A scheduled job changed; review recovery before resuming work';
      end if;
      perform cron.alter_job(
        job_id := (saved_job->>'jobid')::bigint,
        active := (saved_job->>'active')::boolean
      );
    end loop;
    update private.tenant_lifecycle
      set state='active',revision=p_revision,request_id=p_request_id,
          last_action='recover',offline_verified_at=null,
          access_may_remain_until=null,
          provider_evidence=jsonb_build_object('recoveredAt',clock_timestamp())
      where singleton;
    insert into private.tenant_lifecycle_events(tenant_id,revision,request_id,action)
      values(p_tenant_id,p_revision,p_request_id,p_action);
    return jsonb_build_object(
      'tenantId',p_tenant_id,'state','active','revision',p_revision,
      'shutdownVerified',false
    );
  end if;

  if p_action='verify_shutdown' then
    if saved.state<>'shutting_down' then
      raise exception 'Customer shutdown is not awaiting verification' using errcode='22023';
    end if;
    if saved.access_may_remain_until is null or clock_timestamp()<saved.access_may_remain_until then
      raise exception 'Existing sessions or signed links may still be valid' using errcode='55000';
    end if;
    select count(*) into remaining_sessions from auth.sessions;
    select count(*) into remaining_jobs from cron.job where active;
    if remaining_sessions<>0 or remaining_jobs<>0 or private.tenant_access_enabled() then
      raise exception 'Customer access shutdown checks are incomplete' using errcode='55000';
    end if;
    update private.tenant_lifecycle
      set state='offline',revision=p_revision,request_id=p_request_id,
          last_action='verify_shutdown',offline_verified_at=clock_timestamp(),
          provider_evidence=coalesce(provider_evidence,'{}'::jsonb)||jsonb_build_object(
            'sessionsRemaining',remaining_sessions,
            'activeScheduledJobs',remaining_jobs,
            'dataApiGuarded',true,
            'edgeFunctionsGuarded',true,
            'authHooksConfigured',true,
            'existingAccessWindowElapsed',true,
            'verifiedAt',clock_timestamp()
          )
      where singleton
      returning * into saved;
    insert into private.tenant_lifecycle_events(tenant_id,revision,request_id,action)
      values(p_tenant_id,p_revision,p_request_id,p_action);
    return jsonb_build_object(
      'tenantId',p_tenant_id,'state','offline','revision',p_revision,
      'shutdownVerified',true,'offlineVerifiedAt',saved.offline_verified_at,
      'accessMayRemainUntil',saved.access_may_remain_until,
      'providerEvidence',saved.provider_evidence
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'jobid',jobid,'jobname',jobname,'active',active,'schedule',schedule,
    'commandChecksum',md5(command)
  )),'[]') into jobs from cron.job;

  insert into private.tenant_lifecycle(
    singleton,tenant_id,revision,request_id,last_action,state,previous_cron,
    requested_at,access_may_remain_until,provider_evidence
  ) values(
    true,p_tenant_id,p_revision,p_request_id,'shutdown','shutting_down',jobs,
    clock_timestamp(),clock_timestamp()+interval '1 hour',
    jsonb_build_object(
      'sessionsRevokedAt',clock_timestamp(),
      'scheduledJobsPausedAt',clock_timestamp(),
      'maximumAppSignedUrlSeconds',3600,
      'maximumAuthJwtSeconds',3600
    )
  ) on conflict(singleton) do update set
    revision=excluded.revision,request_id=excluded.request_id,
    last_action='shutdown',state='shutting_down',offline_verified_at=null,
    requested_at=clock_timestamp(),access_may_remain_until=excluded.access_may_remain_until,
    provider_evidence=excluded.provider_evidence,
    previous_cron=case when private.tenant_lifecycle.state='active'
      then excluded.previous_cron else private.tenant_lifecycle.previous_cron end;

  perform cron.alter_job(job_id:=jobid,active:=false) from cron.job where active;
  delete from auth.sessions where id is not null;
  insert into private.tenant_lifecycle_events(tenant_id,revision,request_id,action)
    values(p_tenant_id,p_revision,p_request_id,p_action);
  return jsonb_build_object(
    'tenantId',p_tenant_id,'state','shutting_down','revision',p_revision,
    'shutdownVerified',false,
    'accessMayRemainUntil',(select access_may_remain_until from private.tenant_lifecycle where singleton)
  );
end;
$$;

revoke all on function public.multideck_cloud_lifecycle(uuid,text,bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_cloud_lifecycle(uuid,text,bigint,uuid)
  to service_role;

commit;
