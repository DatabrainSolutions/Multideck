begin;

-- The existing composite indexes support record- and actor-specific history,
-- but not the global chronological Admin register. This index lets the
-- ordinary newest/oldest page stop after the requested window.
create index if not exists "IX_Audit_Events_AdminPage"
  on public."Audit_Events" ("AuditEvent_OccurredAt" desc, "AuditEvent_ID" desc);

create or replace function public."Admin_AuditLogPage"(
  p_actor_user_id uuid,
  p_detailed boolean default false,
  p_query text default null,
  p_category text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_sort_direction text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(lower(left(trim(coalesce(p_query, '')), 120)), '');
  v_category text := case when p_category in ('authentication', 'application') then p_category else 'all' end;
  v_start_at timestamptz := p_start_date::timestamptz;
  v_end_at timestamptz := (p_end_date + 1)::timestamptz;
  v_direction text := case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_candidate_limit integer;
  v_application_total bigint := 0;
  v_authentication_total bigint := 0;
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if not private.is_tenant_administrator(p_actor_user_id) then
    raise exception 'Only tenant administrators can view the audit log.' using errcode = '42501';
  end if;

  v_candidate_limit := least(v_offset + v_limit, 1000050);

  -- The ordinary, unsearched register gets exact totals from narrow count
  -- queries and only enriches enough chronological candidates for this page.
  if v_query is null then
    if v_category in ('all', 'application') then
      if p_detailed then
        select count(*)
        into v_application_total
        from public."Audit_Events" as event
        left join public."Audit_FieldChanges" as field_change
          on field_change."AuditFieldChange_EventID" = event."AuditEvent_ID"
        where (v_start_at is null or event."AuditEvent_OccurredAt" >= v_start_at)
          and (v_end_at is null or event."AuditEvent_OccurredAt" < v_end_at);
      else
        select count(*) into v_application_total
        from public."Audit_Events" as event
        where (v_start_at is null or event."AuditEvent_OccurredAt" >= v_start_at)
          and (v_end_at is null or event."AuditEvent_OccurredAt" < v_end_at);
      end if;
    end if;

    if v_category in ('all', 'authentication') then
      select count(*)
      into v_authentication_total
      from auth.audit_log_entries as auth_event
      where coalesce(auth_event.payload->>'action', '') <> 'token_refreshed'
        and (p_detailed or coalesce(auth_event.payload->>'action', '') <> 'token_revoked')
        and (v_start_at is null or auth_event.created_at >= v_start_at)
        and (v_end_at is null or auth_event.created_at < v_end_at);
    end if;

    v_total := v_application_total + v_authentication_total;

    with app_candidates as (
      select event.*
      from public."Audit_Events" as event
      where v_category in ('all', 'application')
        and (v_start_at is null or event."AuditEvent_OccurredAt" >= v_start_at)
        and (v_end_at is null or event."AuditEvent_OccurredAt" < v_end_at)
      order by
        case when v_direction = 'asc' then event."AuditEvent_OccurredAt" end asc,
        case when v_direction = 'asc' then event."AuditEvent_ID" end asc,
        case when v_direction = 'desc' then event."AuditEvent_OccurredAt" end desc,
        case when v_direction = 'desc' then event."AuditEvent_ID" end desc
      limit v_candidate_limit
    ),
    app_rows as (
      select
        'app:' || event."AuditEvent_ID"::text || case when p_detailed and field_change."AuditFieldChange_ID" is not null then ':' || field_change."AuditFieldChange_ID"::text else '' end as id,
        event."AuditEvent_OccurredAt" as occurred_at,
        'application'::text as category,
        coalesce(event."AuditEvent_Action"::text, event."AuditEvent_EventTypeCode"::text) as action,
        coalesce(
          event."AuditEvent_Title"::text,
          case event."AuditEvent_EventTypeCode"
            when 'row_insert' then 'Record created'
            when 'row_update' then 'Record updated'
            when 'row_delete' then 'Record deleted'
            when 'row_soft_delete' then 'Record archived'
            when 'row_restore' then 'Record restored'
            else initcap(replace(event."AuditEvent_EventTypeCode"::text, '_', ' '))
          end
        ) as title,
        coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")::text as actor_id,
        nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), '')::text as actor_name,
        workspace_user."User_Email"::text as actor_email,
        coalesce(event."AuditEvent_SourceModule"::text, event."AuditEvent_SourceTableName"::text, event."AuditEvent_SourceApp"::text, 'Multideck') as source,
        event."AuditEvent_RecordTypeCode"::text as record_type,
        event."AuditEvent_RecordID"::text as record_id,
        event."AuditEvent_RecordKeyJSON" as record_key,
        request_context."AuditRequest_IPHash"::text as ip_address,
        null::text as user_agent,
        event."AuditEvent_OutcomeStatusCode"::text as outcome,
        event."AuditEvent_Reason"::text as detail,
        case when p_detailed then field_change."AuditFieldChange_ColumnName"::text else null end as field_name,
        case when p_detailed then field_change."AuditFieldChange_OldValueJSON" else null end as old_value,
        case when p_detailed then field_change."AuditFieldChange_NewValueJSON" else null end as new_value,
        event."AuditEvent_RequestID"::text as request_id,
        event."AuditEvent_CorrelationID"::text as correlation_id,
        (event."AuditEvent_IsSensitive" or (p_detailed and coalesce(field_change."AuditFieldChange_IsSensitive", false))) as is_sensitive
      from app_candidates as event
      left join public."Audit_FieldChanges" as field_change
        on p_detailed and field_change."AuditFieldChange_EventID" = event."AuditEvent_ID"
      left join public."Audit_RequestContexts" as request_context
        on request_context."AuditRequest_ID" = event."AuditEvent_RequestContextID"
      left join public."cmp_Users" as workspace_user
        on workspace_user."User_ID" = coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")
        or workspace_user."Auth_User_ID" = coalesce(event."AuditEvent_AuthUserID", request_context."AuditRequest_AuthUserID")
    ),
    auth_candidates as (
      select auth_event.*
      from auth.audit_log_entries as auth_event
      where v_category in ('all', 'authentication')
        and coalesce(auth_event.payload->>'action', '') <> 'token_refreshed'
        and (p_detailed or coalesce(auth_event.payload->>'action', '') <> 'token_revoked')
        and (v_start_at is null or auth_event.created_at >= v_start_at)
        and (v_end_at is null or auth_event.created_at < v_end_at)
      order by
        case when v_direction = 'asc' then auth_event.created_at end asc,
        case when v_direction = 'asc' then auth_event.id end asc,
        case when v_direction = 'desc' then auth_event.created_at end desc,
        case when v_direction = 'desc' then auth_event.id end desc
      limit v_candidate_limit
    ),
    auth_rows as (
      select
        'auth:' || auth_event.id::text as id,
        auth_event.created_at as occurred_at,
        'authentication'::text as category,
        coalesce(auth_event.payload->>'action', 'authentication_event')::text as action,
        case auth_event.payload->>'action'
          when 'login' then 'Signed in'
          when 'logout' then 'Signed out'
          when 'token_revoked' then 'Session revoked'
          when 'token_refreshed' then 'Session refreshed'
          when 'user_invited' then 'User invited'
          when 'invited' then 'User invited'
          when 'invite_accepted' then 'Invitation accepted'
          when 'user_recovery_requested' then 'Password recovery requested'
          when 'recovery' then 'Password recovery requested'
          when 'user_updated_password' then 'Password updated'
          when 'user_modified' then 'User account updated'
          when 'modified' then 'User account updated'
          when 'user_deleted' then 'User account deleted'
          when 'deleted' then 'User account deleted'
          when 'signedup' then 'User account created'
          else initcap(replace(coalesce(auth_event.payload->>'action', 'authentication event'), '_', ' '))
        end::text as title,
        auth_event.payload->>'actor_id' as actor_id,
        coalesce(nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), ''), auth_event.payload->>'actor_name')::text as actor_name,
        coalesce(workspace_user."User_Email", auth_event.payload->>'actor_username')::text as actor_email,
        'Supabase Auth'::text as source,
        'user_session'::text as record_type,
        auth_event.payload->>'actor_id' as record_id,
        jsonb_build_object('auth_user_id', auth_event.payload->>'actor_id') as record_key,
        auth_event.ip_address::text as ip_address,
        null::text as user_agent,
        'success'::text as outcome,
        nullif(auth_event.payload->'traits'->>'provider', '')::text as detail,
        null::text as field_name,
        null::jsonb as old_value,
        null::jsonb as new_value,
        null::text as request_id,
        null::text as correlation_id,
        false as is_sensitive
      from auth_candidates as auth_event
      left join public."cmp_Users" as workspace_user
        on coalesce(workspace_user."Auth_User_ID", workspace_user."User_RetainedAuthUserID") =
          case
            when coalesce(auth_event.payload->>'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth_event.payload->>'actor_id')::uuid
            else null
          end
    ),
    page_rows as (
      select combined.*
      from (
        select * from app_rows
        union all
        select * from auth_rows
      ) as combined
      order by
        case when v_direction = 'asc' then combined.occurred_at end asc,
        case when v_direction = 'asc' then combined.id end asc,
        case when v_direction = 'desc' then combined.occurred_at end desc,
        case when v_direction = 'desc' then combined.id end desc
      offset v_offset
      limit v_limit
    )
    select coalesce(jsonb_agg(to_jsonb(page_rows) order by
      case when v_direction = 'asc' then page_rows.occurred_at end asc,
      case when v_direction = 'asc' then page_rows.id end asc,
      case when v_direction = 'desc' then page_rows.occurred_at end desc,
      case when v_direction = 'desc' then page_rows.id end desc
    ), '[]'::jsonb)
    into v_rows
    from page_rows;
  else
    -- Search is intentionally exact across both evidence sources. It may scan
    -- more rows than the ordinary register, but still sends only one page to
    -- the browser and never silently truncates matching history.
    with app_rows as (
      select
        'app:' || event."AuditEvent_ID"::text || case when p_detailed and field_change."AuditFieldChange_ID" is not null then ':' || field_change."AuditFieldChange_ID"::text else '' end as id,
        event."AuditEvent_OccurredAt" as occurred_at,
        'application'::text as category,
        coalesce(event."AuditEvent_Action"::text, event."AuditEvent_EventTypeCode"::text) as action,
        coalesce(
          event."AuditEvent_Title"::text,
          case event."AuditEvent_EventTypeCode"
            when 'row_insert' then 'Record created'
            when 'row_update' then 'Record updated'
            when 'row_delete' then 'Record deleted'
            when 'row_soft_delete' then 'Record archived'
            when 'row_restore' then 'Record restored'
            else initcap(replace(event."AuditEvent_EventTypeCode"::text, '_', ' '))
          end
        ) as title,
        coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")::text as actor_id,
        nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), '')::text as actor_name,
        workspace_user."User_Email"::text as actor_email,
        coalesce(event."AuditEvent_SourceModule"::text, event."AuditEvent_SourceTableName"::text, event."AuditEvent_SourceApp"::text, 'Multideck') as source,
        event."AuditEvent_RecordTypeCode"::text as record_type,
        event."AuditEvent_RecordID"::text as record_id,
        event."AuditEvent_RecordKeyJSON" as record_key,
        request_context."AuditRequest_IPHash"::text as ip_address,
        null::text as user_agent,
        event."AuditEvent_OutcomeStatusCode"::text as outcome,
        event."AuditEvent_Reason"::text as detail,
        case when p_detailed then field_change."AuditFieldChange_ColumnName"::text else null end as field_name,
        case when p_detailed then field_change."AuditFieldChange_OldValueJSON" else null end as old_value,
        case when p_detailed then field_change."AuditFieldChange_NewValueJSON" else null end as new_value,
        event."AuditEvent_RequestID"::text as request_id,
        event."AuditEvent_CorrelationID"::text as correlation_id,
        (event."AuditEvent_IsSensitive" or (p_detailed and coalesce(field_change."AuditFieldChange_IsSensitive", false))) as is_sensitive
      from public."Audit_Events" as event
      left join public."Audit_FieldChanges" as field_change
        on p_detailed and field_change."AuditFieldChange_EventID" = event."AuditEvent_ID"
      left join public."Audit_RequestContexts" as request_context
        on request_context."AuditRequest_ID" = event."AuditEvent_RequestContextID"
      left join public."cmp_Users" as workspace_user
        on workspace_user."User_ID" = coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")
        or workspace_user."Auth_User_ID" = coalesce(event."AuditEvent_AuthUserID", request_context."AuditRequest_AuthUserID")
      where v_category in ('all', 'application')
        and (v_start_at is null or event."AuditEvent_OccurredAt" >= v_start_at)
        and (v_end_at is null or event."AuditEvent_OccurredAt" < v_end_at)
    ),
    auth_rows as (
      select
        'auth:' || auth_event.id::text as id,
        auth_event.created_at as occurred_at,
        'authentication'::text as category,
        coalesce(auth_event.payload->>'action', 'authentication_event')::text as action,
        case auth_event.payload->>'action'
          when 'login' then 'Signed in'
          when 'logout' then 'Signed out'
          when 'token_revoked' then 'Session revoked'
          when 'token_refreshed' then 'Session refreshed'
          when 'user_invited' then 'User invited'
          when 'invited' then 'User invited'
          when 'invite_accepted' then 'Invitation accepted'
          when 'user_recovery_requested' then 'Password recovery requested'
          when 'recovery' then 'Password recovery requested'
          when 'user_updated_password' then 'Password updated'
          when 'user_modified' then 'User account updated'
          when 'modified' then 'User account updated'
          when 'user_deleted' then 'User account deleted'
          when 'deleted' then 'User account deleted'
          when 'signedup' then 'User account created'
          else initcap(replace(coalesce(auth_event.payload->>'action', 'authentication event'), '_', ' '))
        end::text as title,
        auth_event.payload->>'actor_id' as actor_id,
        coalesce(nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), ''), auth_event.payload->>'actor_name')::text as actor_name,
        coalesce(workspace_user."User_Email", auth_event.payload->>'actor_username')::text as actor_email,
        'Supabase Auth'::text as source,
        'user_session'::text as record_type,
        auth_event.payload->>'actor_id' as record_id,
        jsonb_build_object('auth_user_id', auth_event.payload->>'actor_id') as record_key,
        auth_event.ip_address::text as ip_address,
        null::text as user_agent,
        'success'::text as outcome,
        nullif(auth_event.payload->'traits'->>'provider', '')::text as detail,
        null::text as field_name,
        null::jsonb as old_value,
        null::jsonb as new_value,
        null::text as request_id,
        null::text as correlation_id,
        false as is_sensitive
      from auth.audit_log_entries as auth_event
      left join public."cmp_Users" as workspace_user
        on coalesce(workspace_user."Auth_User_ID", workspace_user."User_RetainedAuthUserID") =
          case
            when coalesce(auth_event.payload->>'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth_event.payload->>'actor_id')::uuid
            else null
          end
      where v_category in ('all', 'authentication')
        and coalesce(auth_event.payload->>'action', '') <> 'token_refreshed'
        and (p_detailed or coalesce(auth_event.payload->>'action', '') <> 'token_revoked')
        and (v_start_at is null or auth_event.created_at >= v_start_at)
        and (v_end_at is null or auth_event.created_at < v_end_at)
    ),
    filtered_rows as materialized (
      select combined.*
      from (
        select * from app_rows
        union all
        select * from auth_rows
      ) as combined
      where lower(concat_ws(' ',
        combined.title,
        combined.action,
        combined.actor_name,
        combined.actor_email,
        combined.source,
        combined.record_type,
        combined.record_id,
        combined.field_name,
        combined.ip_address,
        combined.detail,
        combined.old_value::text,
        combined.new_value::text
      )) like '%' || v_query || '%'
    ),
    page_rows as (
      select filtered_rows.*
      from filtered_rows
      order by
        case when v_direction = 'asc' then filtered_rows.occurred_at end asc,
        case when v_direction = 'asc' then filtered_rows.id end asc,
        case when v_direction = 'desc' then filtered_rows.occurred_at end desc,
        case when v_direction = 'desc' then filtered_rows.id end desc
      offset v_offset
      limit v_limit
    )
    select
      (select count(*) from filtered_rows),
      coalesce((select jsonb_agg(to_jsonb(page_rows) order by
        case when v_direction = 'asc' then page_rows.occurred_at end asc,
        case when v_direction = 'asc' then page_rows.id end asc,
        case when v_direction = 'desc' then page_rows.occurred_at end desc,
        case when v_direction = 'desc' then page_rows.id end desc
      ) from page_rows), '[]'::jsonb)
    into v_total, v_rows;
  end if;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'offset', v_offset,
    'limit', v_limit
  );
end;
$$;

comment on function public."Admin_AuditLogPage"(uuid, boolean, text, text, date, date, text, integer, integer) is
  'Service-role-only, tenant-administrator-gated, bounded Admin audit register page. Sensitive audit evidence remains unavailable to Dexter and Watching for you.';

revoke all on function public."Admin_AuditLogPage"(uuid, boolean, text, text, date, date, text, integer, integer) from public, anon, authenticated;
grant execute on function public."Admin_AuditLogPage"(uuid, boolean, text, text, date, date, text, integer, integer) to service_role;

commit;
