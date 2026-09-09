-- Read-only operational status for the deployed Phone calls integration.
-- Intentionally returns aggregate counts and provider cursor health, not call PII.

select jsonb_build_object(
  'providerCursors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider', provider."CommCallSyncCursor_ProviderCode",
      'sourceKey', provider."CommCallSyncCursor_SourceKey",
      'lastSucceededAt', provider."CommCallSyncCursor_LastSucceededAt",
      'consecutiveFailures', provider."CommCallSyncCursor_ConsecutiveFailures",
      'lastErrorCode', provider."CommCallSyncCursor_LastErrorCode",
      'leaseReleased', provider."CommCallSyncCursor_LeaseToken" is null
    ) order by provider."CommCallSyncCursor_ProviderCode")
    from public."Comm_CallProviderSyncCursors" provider
  ), '[]'::jsonb),
  'recordCounts', jsonb_build_object(
    'calls', (select count(*) from public."Comm_CallLogs"),
    'events', (select count(*) from public."Comm_CallIngestionEvents"),
    'legs', (select count(*) from public."Comm_CallProviderLegs"),
    'transcriptSegments', (
      select count(*) from public."Comm_CallTranscriptSegments"
    )
  ),
  'workerSchedules', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', job.jobname,
      'schedule', job.schedule,
      'active', job.active
    ) order by job.jobname)
    from cron.job job
    where job.jobname like 'multideck-phone-calls-%'
  ), '[]'::jsonb),
  'workerLastRuns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', job.jobname,
      'status', latest.status,
      'startedAt', latest.start_time,
      'endedAt', latest.end_time
    ) order by job.jobname)
    from cron.job job
    left join lateral (
      select run.status, run.start_time, run.end_time
      from cron.job_run_details run
      where run.jobid = job.jobid
      order by run.start_time desc
      limit 1
    ) latest on true
    where job.jobname like 'multideck-phone-calls-%'
  ), '[]'::jsonb),
  'migrationApplied', exists (
    select 1
    from supabase_migrations.schema_migrations history
    where history.version = '20260823083757'
  ),
  'migrationState', jsonb_build_object(
    'foundation', exists (
      select 1 from supabase_migrations.schema_migrations history
      where history.version = '20260822141406'
    ),
    'safetyAndDexterParity', exists (
      select 1 from supabase_migrations.schema_migrations history
      where history.version = '20260823083757'
    ),
    'confirmedCrmLinks', exists (
      select 1 from supabase_migrations.schema_migrations history
      where history.version = '20260823144119'
    ),
    'threeCxXapiSchedule', exists (
      select 1 from supabase_migrations.schema_migrations history
      where history.version = '20260823144126'
    )
  ),
  'providerReadiness', jsonb_build_object(
    'twilio', coalesce((
      select bool_or(lower(btrim(secret.decrypted_secret)) = 'true')
      from vault.decrypted_secrets secret
      where secret.name = 'multideck_phone_calls_twilio_sync_enabled'
    ), false),
    'elevenlabs', coalesce((
      select bool_or(lower(btrim(secret.decrypted_secret)) = 'true')
      from vault.decrypted_secrets secret
      where secret.name = 'multideck_phone_calls_elevenlabs_sync_enabled'
    ), false),
    'threeCxXapi', coalesce((
      select bool_or(lower(btrim(secret.decrypted_secret)) = 'true')
      from vault.decrypted_secrets secret
      where secret.name = 'multideck_phone_calls_3cx_xapi_sync_enabled'
    ), false)
  )
) as phone_calls_live_status;
