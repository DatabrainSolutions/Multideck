-- Make email watches fail-safe, observable, and independently refreshed.
--
-- Provider pushes remain the primary path when configured. A one-minute
-- incremental sync is the safety net for active email watches. It calls no
-- language model and uses mailbox leases to avoid duplicate provider work.

insert into public."sys_CommLinkTypes" (
  "CommLinkType_Code",
  "CommLinkType_Name",
  "CommLinkType_Description",
  "CommLinkType_SortOrder",
  "CommLinkType_IsActive"
)
values (
  'dexter_watch',
  'Dexter watch',
  'Linked to a Dexter watch and its matching source record.',
  140,
  true
)
on conflict ("CommLinkType_Code") do update
set "CommLinkType_Name" = excluded."CommLinkType_Name",
    "CommLinkType_Description" = excluded."CommLinkType_Description",
    "CommLinkType_IsActive" = true;

alter table public."AI_DexterWatches"
  add column if not exists "AIDexterWatch_HealthStatusCode" varchar(20) not null default 'starting',
  add column if not exists "AIDexterWatch_LastSourceCheckAt" timestamptz,
  add column if not exists "AIDexterWatch_LastSuccessfulCheckAt" timestamptz,
  add column if not exists "AIDexterWatch_LastHealthError" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_AI_DexterWatches_health_status'
      and conrelid = 'public."AI_DexterWatches"'::regclass
  ) then
    alter table public."AI_DexterWatches"
      add constraint "CK_AI_DexterWatches_health_status"
      check ("AIDexterWatch_HealthStatusCode" in ('starting', 'healthy', 'degraded', 'error'));
  end if;
end;
$$;

create index if not exists "IX_AI_DexterWatches_active_email_health"
  on public."AI_DexterWatches" (
    "AIDexterWatch_HealthStatusCode",
    "AIDexterWatch_LastSuccessfulCheckAt"
  )
  where "AIDexterWatch_CapabilityCode" = 'email'
    and "AIDexterWatch_StatusCode" = 'active';

create or replace function public.multideck_dexter_list_watches()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', watch."AIDexterWatch_ID",
    'title', watch."AIDexterWatch_Title",
    'summary', watch."AIDexterWatch_Summary",
    'capability', watch."AIDexterWatch_CapabilityCode",
    'status', watch."AIDexterWatch_StatusCode",
    'targetLabel', watch."AIDexterWatch_TargetLabel",
    'rule', watch."AIDexterWatch_RuleJSON",
    'action', watch."AIDexterWatch_ActionJSON",
    'createdAt', watch."AIDexterWatch_CreatedAt",
    'updatedAt', watch."AIDexterWatch_UpdatedAt",
    'lastEvaluatedAt', watch."AIDexterWatch_LastEvaluatedAt",
    'lastTriggeredAt', watch."AIDexterWatch_LastTriggeredAt",
    'triggerCount', watch."AIDexterWatch_TriggerCount",
    'healthStatus', watch."AIDexterWatch_HealthStatusCode",
    'lastSourceCheckAt', watch."AIDexterWatch_LastSourceCheckAt",
    'lastSuccessfulCheckAt', watch."AIDexterWatch_LastSuccessfulCheckAt",
    'healthMessage', case
      when watch."AIDexterWatch_LastHealthError" is not null
        then 'Connected email is delayed. Dexter will keep retrying.'
      else null
    end,
    'latestEvent', latest.event
  ) order by watch."AIDexterWatch_UpdatedAt" desc), '[]'::jsonb)
  into v_result
  from public."AI_DexterWatches" watch
  left join lateral (
    select jsonb_build_object(
      'id', event."AIDexterWatchEvent_ID",
      'title', event."AIDexterWatchEvent_Title",
      'body', event."AIDexterWatchEvent_Body",
      'changed', event."AIDexterWatchEvent_ChangedJSON",
      'action', event."AIDexterWatchEvent_ActionJSON",
      'readAt', event."AIDexterWatchEvent_ReadAt",
      'createdAt', event."AIDexterWatchEvent_CreatedAt"
    ) event
    from public."AI_DexterWatchEvents" event
    where event."AIDexterWatchEvent_WatchID" = watch."AIDexterWatch_ID"
    order by event."AIDexterWatchEvent_CreatedAt" desc
    limit 1
  ) latest on true
  where watch."AIDexterWatch_OwnerUserID" = v_context.user_id
    and watch."AIDexterWatch_CompanyID" = v_context.company_id;

  return v_result;
end;
$$;

-- A notification failure must never roll back the source email. Each watch is
-- evaluated inside its own subtransaction and records a visible health error.
create or replace function public._multideck_dexter_evaluate_watch_signal()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  watch record;
  v_matches boolean;
  v_previously_matched boolean;
  v_field text;
  v_old text;
  v_new text;
  v_event_id uuid;
  v_event_body text;
  v_changed jsonb;
begin
  for watch in
    select watch_row.*
    from public."AI_DexterWatches" watch_row
    where watch_row."AIDexterWatch_CompanyID" = new."AIDexterWatchSignal_CompanyID"
      and watch_row."AIDexterWatch_CapabilityCode" = new."AIDexterWatchSignal_CapabilityCode"
      and watch_row."AIDexterWatch_StatusCode" = 'active'
      and (
        watch_row."AIDexterWatch_TargetID" is null
        or watch_row."AIDexterWatch_TargetID" = new."AIDexterWatchSignal_SourceID"
      )
      and (
        watch_row."AIDexterWatch_CapabilityCode" <> 'email'
        or exists (
          select 1
          from public._multideck_dexter_email_mailboxes(
            watch_row."AIDexterWatch_OwnerUserID",
            watch_row."AIDexterWatch_CompanyID"
          ) permitted
          where permitted.mailbox_id = nullif(
            new."AIDexterWatchSignal_NewJSON"->>'mailboxId',
            ''
          )::uuid
        )
      )
  loop
    begin
      v_matches := public._multideck_dexter_watch_matches(
        watch."AIDexterWatch_RuleJSON",
        new."AIDexterWatchSignal_OldJSON",
        new."AIDexterWatchSignal_NewJSON"
      );

      select state."AIDexterWatchState_LastMatched"
      into v_previously_matched
      from public."AI_DexterWatchStates" state
      where state."AIDexterWatchState_WatchID" = watch."AIDexterWatch_ID"
        and state."AIDexterWatchState_SourceID" = new."AIDexterWatchSignal_SourceID";

      insert into public."AI_DexterWatchStates" (
        "AIDexterWatchState_WatchID",
        "AIDexterWatchState_SourceID",
        "AIDexterWatchState_LastMatched",
        "AIDexterWatchState_LastEvaluatedAt"
      )
      values (
        watch."AIDexterWatch_ID",
        new."AIDexterWatchSignal_SourceID",
        v_matches,
        now()
      )
      on conflict ("AIDexterWatchState_WatchID", "AIDexterWatchState_SourceID")
      do update set
        "AIDexterWatchState_LastMatched" = excluded."AIDexterWatchState_LastMatched",
        "AIDexterWatchState_LastEvaluatedAt" = excluded."AIDexterWatchState_LastEvaluatedAt";

      v_field := watch."AIDexterWatch_RuleJSON"->>'field';
      v_old := new."AIDexterWatchSignal_OldJSON"->>v_field;
      v_new := new."AIDexterWatchSignal_NewJSON"->>v_field;

      update public."AI_DexterWatches"
      set "AIDexterWatch_LastEvaluatedAt" = now(),
          "AIDexterWatch_IsArmed" = case
            when v_matches then "AIDexterWatch_IsArmed"
            else true
          end,
          "AIDexterWatch_UpdatedAt" = now()
      where "AIDexterWatch_ID" = watch."AIDexterWatch_ID";

      if v_matches and not coalesce(v_previously_matched, false) then
        if watch."AIDexterWatch_CapabilityCode" = 'email' then
          v_event_body := concat(
            'New matching email from ',
            coalesce(
              nullif(new."AIDexterWatchSignal_NewJSON"->>'senderName', ''),
              nullif(new."AIDexterWatchSignal_NewJSON"->>'senderEmail', ''),
              'an unknown sender'
            ),
            ': ',
            coalesce(nullif(new."AIDexterWatchSignal_NewJSON"->>'subject', ''), '(No subject)'),
            '.'
          );
          v_changed := jsonb_build_object(
            'field', v_field,
            'sourceId', new."AIDexterWatchSignal_SourceID",
            'mailboxId', new."AIDexterWatchSignal_NewJSON"->>'mailboxId',
            'senderEmail', new."AIDexterWatchSignal_NewJSON"->>'senderEmail',
            'senderName', new."AIDexterWatchSignal_NewJSON"->>'senderName',
            'subject', new."AIDexterWatchSignal_NewJSON"->>'subject',
            'receivedAt', new."AIDexterWatchSignal_NewJSON"->>'receivedAt',
            'attachmentNames', new."AIDexterWatchSignal_NewJSON"->>'attachmentNames'
          );
        else
          v_event_body := coalesce(watch."AIDexterWatch_TargetLabel", 'A watched record')
            || ': ' || v_field || ' changed from ' || coalesce(v_old, 'not set')
            || ' to ' || coalesce(v_new, 'not set') || '.';
          v_changed := jsonb_build_object(
            'field', v_field,
            'before', v_old,
            'after', v_new,
            'sourceId', new."AIDexterWatchSignal_SourceID"
          );
        end if;

        insert into public."AI_DexterWatchEvents" (
          "AIDexterWatchEvent_WatchID",
          "AIDexterWatchEvent_SignalID",
          "AIDexterWatchEvent_OwnerUserID",
          "AIDexterWatchEvent_Title",
          "AIDexterWatchEvent_Body",
          "AIDexterWatchEvent_ChangedJSON",
          "AIDexterWatchEvent_ActionJSON"
        )
        values (
          watch."AIDexterWatch_ID",
          new."AIDexterWatchSignal_ID",
          watch."AIDexterWatch_OwnerUserID",
          watch."AIDexterWatch_Title",
          v_event_body,
          v_changed,
          watch."AIDexterWatch_ActionJSON"
        )
        returning "AIDexterWatchEvent_ID" into v_event_id;

        insert into public."Comm_Notifications" (
          "CommNotif_UserID",
          "CommNotif_Title",
          "CommNotif_Body",
          "CommNotif_TargetTable",
          "CommNotif_TargetID",
          "CommNotif_LinkTypeCode",
          "CommNotif_MetadataJSON",
          "CommNotif_CreatedBy"
        )
        values (
          watch."AIDexterWatch_OwnerUserID",
          watch."AIDexterWatch_Title",
          v_event_body,
          'AI_DexterWatches',
          watch."AIDexterWatch_ID",
          'dexter_watch',
          jsonb_build_object(
            'event_type', 'dexter_watch',
            'watch_id', watch."AIDexterWatch_ID",
            'watch_event_id', v_event_id,
            'url', '/agent-dexter?watch=' || watch."AIDexterWatch_ID",
            'action_url', '/agent-dexter?watch=' || watch."AIDexterWatch_ID"
          ),
          watch."AIDexterWatch_OwnerUserID"
        );

        update public."AI_DexterWatches"
        set "AIDexterWatch_IsArmed" = false,
            "AIDexterWatch_LastTriggeredAt" = now(),
            "AIDexterWatch_TriggerCount" = "AIDexterWatch_TriggerCount" + 1,
            "AIDexterWatch_UpdatedAt" = now()
        where "AIDexterWatch_ID" = watch."AIDexterWatch_ID";
      end if;
    exception
      when others then
        update public."AI_DexterWatches"
        set "AIDexterWatch_HealthStatusCode" = 'error',
            "AIDexterWatch_LastSourceCheckAt" = now(),
            "AIDexterWatch_LastHealthError" = left(sqlerrm, 1000),
            "AIDexterWatch_UpdatedAt" = now()
        where "AIDexterWatch_ID" = watch."AIDexterWatch_ID";
    end;
  end loop;

  update public."AI_DexterWatchSignals"
  set "AIDexterWatchSignal_ProcessedAt" = now()
  where "AIDexterWatchSignal_ID" = new."AIDexterWatchSignal_ID";

  delete from public."AI_DexterWatchSignals" signal
  where signal."AIDexterWatchSignal_ID" = new."AIDexterWatchSignal_ID"
    and not exists (
      select 1
      from public."AI_DexterWatchEvents" event
      where event."AIDexterWatchEvent_SignalID" = signal."AIDexterWatchSignal_ID"
    );

  return new;
end;
$$;

-- Re-run deterministic evaluation for a short recent window. This closes the
-- gap if a provider event, database trigger, or notification side effect was
-- temporarily unavailable. Per-watch/source state prevents duplicate alerts.
create or replace function public.comm_reconcile_email_watch_messages(
  p_user_id uuid,
  p_company_id uuid,
  p_since timestamptz default (now() - interval '15 minutes')
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message record;
  v_count integer := 0;
begin
  if p_user_id is null or p_company_id is null then
    raise exception 'A watch owner and company are required.' using errcode = '22023';
  end if;

  for v_message in
    select message."CommMessage_ID"
    from public."Comm_Messages" message
    join public._multideck_dexter_email_mailboxes(p_user_id, p_company_id) permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    where message."CommMessage_IsInbound"
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and not message."CommMessage_IsDeleted"
      and message."CommMessage_ReceivedAt" >= greatest(
        coalesce(p_since, now() - interval '15 minutes'),
        coalesce((
          select min(watch."AIDexterWatch_CreatedAt")
          from public."AI_DexterWatches" watch
          where watch."AIDexterWatch_OwnerUserID" = p_user_id
            and watch."AIDexterWatch_CompanyID" = p_company_id
            and watch."AIDexterWatch_CapabilityCode" = 'email'
            and watch."AIDexterWatch_StatusCode" = 'active'
        ), now())
      )
    order by message."CommMessage_ReceivedAt"
    limit 500
  loop
    perform public._multideck_dexter_emit_email_watch_signal(v_message."CommMessage_ID");
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.comm_reconcile_email_watch_messages(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.comm_reconcile_email_watch_messages(uuid, uuid, timestamptz)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'multideck_email_watch_worker_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'multideck_email_watch_worker_secret',
      'Authenticates the tenant-local Dexter email watch worker.'
    );
  end if;
end;
$$;

create or replace function public."Comm_GetEmailWatchWorkerSecret"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'multideck_email_watch_worker_secret'
  limit 1;
$$;

revoke all on function public."Comm_GetEmailWatchWorkerSecret"()
  from public, anon, authenticated;
grant execute on function public."Comm_GetEmailWatchWorkerSecret"()
  to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public."Comm_ConfigureEmailWatchWorkerSchedule"()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
begin
  select decrypted_secret
  into v_endpoint
  from vault.decrypted_secrets
  where name = 'multideck_email_watch_worker_endpoint'
  limit 1;

  if nullif(btrim(v_endpoint), '') is null then
    return false;
  end if;

  perform cron.schedule(
    'multideck-email-watch-worker',
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
          body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
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

-- Configuration is tenant-specific and may be installed after this migration.
-- If the endpoint already exists, make the schedule live immediately.
select public."Comm_ConfigureEmailWatchWorkerSchedule"();
