-- Read-only catalog proof for a deployed Phone calls schema.
-- Run in the target tenant project after applying the reviewed migrations.

do $$
declare
  object_name text;
  object_ref regclass;
begin
  foreach object_name in array array[
    'Comm_CallLogs',
    'Comm_CallTranscriptSegments',
    'Comm_CallAIOutputs',
    'Comm_CallActionItems',
    'CRM_CallReviews',
    'CRM_CallActionCandidates',
    'CRM_CallReviewDecisions',
    'CRM_CallEntityLinks',
    'CRM_CallSummaryNotes',
    'Comm_CallIngestionEvents',
    'Comm_CallProviderLegs',
    'Comm_CallParticipants',
    'Comm_CallConsentEvidence',
    'Comm_CallProviderSyncCursors',
    'CRM_CallMatchCandidates',
    'Comm_CallAccessEvents'
  ] loop
    object_ref := to_regclass(format('public.%I', object_name));
    if object_ref is null then
      raise exception 'Missing Phone calls table: %', object_name;
    end if;

    if not exists (
      select 1
      from pg_class relation
      where relation.oid = object_ref
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on Phone calls table: %', object_name;
    end if;

    if has_table_privilege('anon', object_ref, 'select')
      or has_table_privilege('authenticated', object_ref, 'select') then
      raise exception 'Browser roles can read service-only Phone calls table: %', object_name;
    end if;

    if not has_table_privilege('service_role', object_ref, 'select') then
      raise exception 'Service role cannot read Phone calls table: %', object_name;
    end if;
  end loop;
end
$$;

do $$
declare
  object_name text;
  object_ref regclass;
begin
  foreach object_name in array array[
    'Comm_CallLogSummary',
    'CRM_CallActionAcceptanceSummary',
    'CRM_CallReviewTodoQueue',
    'CRM_PostCallReviewQueue'
  ] loop
    object_ref := to_regclass(format('public.%I', object_name));
    if object_ref is null then
      raise exception 'Missing Phone calls view: %', object_name;
    end if;

    if not exists (
      select 1
      from pg_class relation
      where relation.oid = object_ref
        and coalesce('security_invoker=true' = any(relation.reloptions), false)
    ) then
      raise exception 'Phone calls view is not security_invoker: %', object_name;
    end if;

    if has_table_privilege('anon', object_ref, 'select')
      or has_table_privilege('authenticated', object_ref, 'select') then
      raise exception 'Browser roles can read service-only Phone calls view: %', object_name;
    end if;
  end loop;
end
$$;

do $$
declare
  function_signature text;
  function_ref regprocedure;
begin
  foreach function_signature in array array[
    'public._multideck_phone_call_watch_source_change()',
    'public._multideck_phone_call_action_watch_source_change()',
    'public._multideck_phone_call_review_watch_source_change()',
    'public._multideck_phone_call_watch_snapshot(uuid,uuid)',
    'public._multideck_phone_call_pause_unauthorised_watches(uuid)',
    'public.multideck_phone_call_review_match(uuid,uuid,uuid,text,uuid,uuid,uuid,integer)',
    'public.multideck_phone_call_purge_expired(uuid,integer)',
    'public.multideck_phone_call_purge_expired_events(uuid,integer)',
    'public.multideck_phone_call_mark_recording_purged(uuid,uuid)',
    'public.multideck_phone_call_record_consent_evidence(uuid,uuid,uuid,text,text,text,text,text,timestamp with time zone,jsonb)',
    'public.multideck_phone_call_claim_retries(uuid,integer,integer)',
    'public.multideck_phone_call_finish_retry(uuid,uuid,uuid,text,text,text)',
    'public.multideck_phone_call_dead_letter_unsupported_retries(uuid)',
    'public.multideck_phone_call_provider_sync_claim(uuid,text,text,integer)',
    'public.multideck_phone_call_provider_sync_commit(uuid,text,text,uuid,jsonb)',
    'public.multideck_phone_call_provider_sync_fail(uuid,text,text,uuid,text,text)',
    'public.multideck_phone_call_configure_worker_schedules()',
    'public.multideck_dexter_domain_phone_calls(uuid,text,integer)'
  ] loop
    function_ref := to_regprocedure(function_signature);
    if function_ref is null then
      raise exception 'Missing Phone calls function: %', function_signature;
    end if;

    if has_function_privilege('anon', function_ref, 'execute')
      or has_function_privilege('authenticated', function_ref, 'execute') then
      raise exception 'Browser roles can execute privileged Phone calls function: %', function_signature;
    end if;

    if not has_function_privilege('service_role', function_ref, 'execute') then
      raise exception 'Service role cannot execute Phone calls function: %', function_signature;
    end if;
  end loop;
end
$$;

do $$
declare
  function_ref regprocedure := to_regprocedure(
    'public._multideck_phone_call_sync_confirmed_entity_links()'
  );
  expected_table regclass := to_regclass('public."Comm_CallLogs"');
begin
  if function_ref is null then
    raise exception 'Missing confirmed Phone calls CRM-link trigger function.';
  end if;

  -- This SECURITY DEFINER function is trigger-only. Even service_role does not
  -- need a direct execute surface because the database invokes it through the
  -- reviewed Comm_CallLogs trigger.
  if has_function_privilege('anon', function_ref, 'execute')
    or has_function_privilege('authenticated', function_ref, 'execute')
    or has_function_privilege('service_role', function_ref, 'execute') then
    raise exception 'Confirmed Phone calls CRM-link trigger function is directly executable.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger
    where trigger.tgrelid = expected_table
      and trigger.tgname = 'TR_Comm_CallLogs_sync_confirmed_entity_links'
      and trigger.tgfoid = function_ref
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) then
    raise exception 'Confirmed Phone calls CRM-link trigger is missing or disabled.';
  end if;

  if not exists (
    select 1
    from pg_index index_info
    join pg_class index_relation on index_relation.oid = index_info.indexrelid
    where index_info.indrelid = to_regclass('public."CRM_CallEntityLinks"')
      and index_relation.relname = 'IX_CRM_CallEntityLinks_confirmed_target'
      and pg_get_expr(index_info.indpred, index_info.indrelid)
        = '("CRMCallEntity_IsConfirmed" = true)'
  ) then
    raise exception 'Confirmed Phone calls CRM-link lookup index is missing or has the wrong boundary.';
  end if;

  if exists (
    select 1
    from public."CRM_CallEntityLinks" link
    join public."CRM_CallReviews" review
      on review."CRMCallReview_ID" = link."CRMCallEntity_CallReviewID"
    join public."Comm_CallLogs" call
      on call."CommCall_ID" = review."CRMCallReview_CommCallID"
    where link."CRMCallEntity_IsConfirmed" = true
      and link."CRMCallEntity_TargetTable" in ('Org_Master', 'Org_Contacts', 'CRM_Leads')
      and (
        call."CommCall_MatchStatusCode" <> 'matched'
        or coalesce(call."CommCall_MatchMethodCode" not in (
          'user_review', 'approved_action', 'approved_action_edited'
        ), true)
        or case link."CRMCallEntity_TargetTable"
          when 'Org_Master' then link."CRMCallEntity_TargetID"
            is distinct from call."CommCall_MatchedOrgID"
          when 'Org_Contacts' then link."CRMCallEntity_TargetID"
            is distinct from call."CommCall_MatchedContactID"
          when 'CRM_Leads' then link."CRMCallEntity_TargetID"
            is distinct from call."CommCall_MatchedLeadID"
          else true
        end
      )
  ) then
    raise exception 'A confirmed Phone calls CRM link is outside the canonical approved match.';
  end if;
end
$$;

do $$
declare
  function_ref regprocedure := to_regprocedure(
    'public._multideck_phone_call_enforce_match_consistency()'
  );
  trigger_definition text;
begin
  if function_ref is null then
    raise exception 'Missing Phone calls canonical-match invariant function.';
  end if;

  if has_function_privilege('anon', function_ref, 'execute')
    or has_function_privilege('authenticated', function_ref, 'execute')
    or not has_function_privilege('service_role', function_ref, 'execute') then
    raise exception 'Phone calls canonical-match invariant function has unsafe ACLs.';
  end if;

  select pg_get_triggerdef(trigger.oid)
  into trigger_definition
  from pg_trigger trigger
  where trigger.tgrelid = to_regclass('public."Comm_CallLogs"')
    and trigger.tgname = 'TR_Comm_CallLogs_match_consistency'
    and trigger.tgfoid = function_ref
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D';

  if trigger_definition is null
    or position('CommCall_MatchStatusCode' in trigger_definition) = 0
    or position('CommCall_MatchMethodCode' in trigger_definition) = 0
    or position('CommCall_MatchedOrgID' in trigger_definition) = 0 then
    raise exception 'Phone calls canonical-match trigger does not cover status, method and target changes.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_info
    where constraint_info.conrelid = to_regclass('public."Comm_CallLogs"')
      and constraint_info.conname = 'CK_Comm_CallLogs_confirmed_match_links'
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
  ) then
    raise exception 'Phone calls canonical-match constraint is missing or unvalidated.';
  end if;

  if exists (
    select 1
    from public."Comm_CallLogs" call
    where (
      call."CommCall_MatchedOrgID" is not null
      or call."CommCall_MatchedContactID" is not null
      or call."CommCall_MatchedLeadID" is not null
    )
      and (
        call."CommCall_MatchStatusCode" is distinct from 'matched'
        or coalesce(call."CommCall_MatchMethodCode" not in (
          'user_review', 'approved_action', 'approved_action_edited'
        ), true)
      )
  ) then
    raise exception 'An unreviewed Phone call has a canonical CRM target.';
  end if;
end
$$;

do $$
declare
  provider_enabled boolean;
  provider_job_exists boolean;
  job_record record;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'multideck_phone_calls_worker_endpoint'
      and nullif(btrim(secret.decrypted_secret), '') is not null
  ) or not exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'multideck_phone_calls_worker_secret'
      and length(secret.decrypted_secret) >= 32
  ) then
    raise exception 'Phone calls worker Vault configuration is missing or invalid.';
  end if;

  if not exists (
    select 1 from cron.job job
    where job.jobname = 'multideck-phone-calls-retry'
      and job.schedule = '* * * * *'
      and job.active
  ) or not exists (
    select 1 from cron.job job
    where job.jobname = 'multideck-phone-calls-retention'
      and job.schedule = '17 2 * * *'
      and job.active
  ) then
    raise exception 'Required Phone calls retry or retention worker schedule is missing.';
  end if;

  for job_record in
    select job.jobname, job.command
    from cron.job job
    where job.jobname like 'multideck-phone-calls-%'
  loop
    if position('vault.decrypted_secrets' in job_record.command) = 0
      or position('x-multideck-worker-secret' in job_record.command) = 0
      or job_record.command ~ '''[0-9a-f]{64}''' then
      raise exception 'Phone calls worker schedule does not use the safe Vault runtime boundary: %',
        job_record.jobname;
    end if;
  end loop;

  select coalesce(bool_or(lower(btrim(secret.decrypted_secret)) = 'true'), false)
  into provider_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_twilio_sync_enabled';
  select exists (
    select 1 from cron.job job
    where job.jobname = 'multideck-phone-calls-twilio-sync'
      and job.schedule = '* * * * *'
      and job.active
  ) into provider_job_exists;
  if provider_enabled <> provider_job_exists then
    raise exception 'Twilio worker schedule does not match its provider-ready marker.';
  end if;

  select coalesce(bool_or(lower(btrim(secret.decrypted_secret)) = 'true'), false)
  into provider_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_elevenlabs_sync_enabled';
  select exists (
    select 1 from cron.job job
    where job.jobname = 'multideck-phone-calls-elevenlabs-sync'
      and job.schedule = '*/2 * * * *'
      and job.active
  ) into provider_job_exists;
  if provider_enabled <> provider_job_exists then
    raise exception 'ElevenLabs worker schedule does not match its provider-ready marker.';
  end if;

  select coalesce(bool_or(lower(btrim(secret.decrypted_secret)) = 'true'), false)
  into provider_enabled
  from vault.decrypted_secrets secret
  where secret.name = 'multideck_phone_calls_3cx_xapi_sync_enabled';
  select exists (
    select 1 from cron.job job
    where job.jobname = 'multideck-phone-calls-3cx-xapi-sync'
      and job.schedule = '*/2 * * * *'
      and job.active
  ) into provider_job_exists;
  if provider_enabled <> provider_job_exists then
    raise exception '3CX XAPI worker schedule does not match its explicit provider-ready marker.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'Comm_CallIngestionEvents'
      and column_info.column_name = 'CommCallEvent_RetentionUntil'
      and column_info.data_type = 'timestamp with time zone'
  ) then
    raise exception 'Phone calls raw-event retention boundary is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger trigger
    where trigger.tgname = 'TR_Comm_CallLogs_dexter_watch'
      and trigger.tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger trigger
    where trigger.tgname = 'TR_CRM_CallActionCandidates_dexter_watch'
      and trigger.tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger trigger
    where trigger.tgname = 'TR_CRM_CallReviews_dexter_watch'
      and trigger.tgenabled <> 'D'
  ) then
    raise exception 'One or more event-driven Phone calls watch triggers are missing or disabled.';
  end if;

  if not exists (
    select 1 from public."sys_AIDexterDataDomains" domain
    where domain."AIDexterDomain_Code" = 'phone_calls'
      and domain."AIDexterDomain_IsActive"
      and domain."AIDexterDomain_ScopeStrategy" = 'company'
  ) then
    raise exception 'Dexter Phone calls data domain is missing, inactive or not company-scoped.';
  end if;

  if not exists (
    select 1 from public."sys_AIDexterActions" action
    where action."AIDexterAction_Code" = 'review_phone_call_suggestion'
      and action."AIDexterAction_IsActive"
      and action."AIDexterAction_ScopeStrategy" = 'company'
      and action."AIDexterAction_RequiredPermissionsJSON"
        @> '["CRM.PhoneCalls.Review"]'::jsonb
      and action."AIDexterAction_HasExternalEffect"
  ) then
    raise exception 'Dexter Phone calls review action is missing or not permission/company scoped.';
  end if;

  if not exists (
    select 1 from public."sys_AIDexterWatchCapabilities" capability
    where capability."AIDexterWatchCapability_Code" = 'phone_calls'
      and capability."AIDexterWatchCapability_IsActive"
      and capability."AIDexterWatchCapability_FieldsJSON"
        @> '["companyId","contactId","leadId","callReason","pendingActionCount"]'::jsonb
  ) then
    raise exception 'Watching for you Phone calls capability is missing or inactive.';
  end if;
end
$$;
