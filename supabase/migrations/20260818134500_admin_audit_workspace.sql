begin;

-- Administrative audit data is intentionally separate from Dexter. It contains
-- authentication IP addresses, user presence and field-level before/after
-- values, so only a tenant Administrator or Company Admin may read it.
create or replace function private.is_tenant_administrator(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" as workspace_user
    join public."cmp_Users_Roles" as user_role
      on user_role."User_ID" = workspace_user."User_ID"
    join public."sys_UserRoles" as role
      on role."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    where workspace_user."User_ID" = p_user_id
      and workspace_user."Auth_User_ID" is not null
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  );
$$;

revoke all on function private.is_tenant_administrator(uuid) from public, anon, authenticated;
grant execute on function private.is_tenant_administrator(uuid) to service_role;

create table if not exists public."Admin_UserPresence" (
  "Presence_UserID" uuid primary key references public."cmp_Users"("User_ID") on delete cascade,
  "Presence_AuthUserID" uuid not null,
  "Presence_CompanyID" uuid references public."cmp_Company"("Company_ID") on delete cascade,
  "Presence_LastRoute" text,
  "Presence_IPAddress" inet,
  "Presence_UserAgent" text,
  "Presence_FirstSeenAt" timestamptz not null default now(),
  "Presence_LastSeenAt" timestamptz not null default now(),
  constraint "CK_Admin_UserPresence_Route" check (
    "Presence_LastRoute" is null
    or (length("Presence_LastRoute") between 1 and 180 and "Presence_LastRoute" like '/%')
  ),
  constraint "CK_Admin_UserPresence_UserAgent" check (
    "Presence_UserAgent" is null or length("Presence_UserAgent") <= 500
  )
);

comment on table public."Admin_UserPresence" is
  'Short-lived workspace presence evidence used only by tenant administrators. It is not a Dexter data domain or Watching for you source.';

create index if not exists "IX_Admin_UserPresence_LastSeenAt"
  on public."Admin_UserPresence" ("Presence_LastSeenAt" desc);

alter table public."Admin_UserPresence" enable row level security;
revoke all on table public."Admin_UserPresence" from public, anon, authenticated;
grant select, insert, update, delete on table public."Admin_UserPresence" to service_role;

create or replace function public."Admin_AuditLog"(
  p_actor_user_id uuid,
  p_detailed boolean default false,
  p_limit integer default 200
) returns table (
  id text,
  occurred_at timestamptz,
  category text,
  action text,
  title text,
  actor_name text,
  actor_email text,
  source text,
  record_type text,
  record_id text,
  record_key jsonb,
  ip_address text,
  outcome text,
  detail text,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  request_id text,
  correlation_id text,
  is_sensitive boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if not private.is_tenant_administrator(p_actor_user_id) then
    raise exception 'Only tenant administrators can view the audit log.' using errcode = '42501';
  end if;

  if p_detailed then
    return query
    with recent_app_events as (
      select event.*
      from public."Audit_Events" as event
      order by event."AuditEvent_OccurredAt" desc
      limit v_limit
    ),
    app_rows as (
      select
        'app:' || event."AuditEvent_ID"::text || coalesce(':' || field_change."AuditFieldChange_ID"::text, '') as id,
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
        nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), '')::text as actor_name,
        workspace_user."User_Email"::text as actor_email,
        coalesce(event."AuditEvent_SourceModule"::text, event."AuditEvent_SourceTableName"::text, event."AuditEvent_SourceApp"::text, 'Multideck') as source,
        event."AuditEvent_RecordTypeCode"::text as record_type,
        event."AuditEvent_RecordID"::text as record_id,
        event."AuditEvent_RecordKeyJSON" as record_key,
        request_context."AuditRequest_IPHash"::text as ip_address,
        event."AuditEvent_OutcomeStatusCode"::text as outcome,
        event."AuditEvent_Reason"::text as detail,
        field_change."AuditFieldChange_ColumnName"::text as field_name,
        field_change."AuditFieldChange_OldValueJSON" as old_value,
        field_change."AuditFieldChange_NewValueJSON" as new_value,
        event."AuditEvent_RequestID"::text as request_id,
        event."AuditEvent_CorrelationID"::text as correlation_id,
        (event."AuditEvent_IsSensitive" or coalesce(field_change."AuditFieldChange_IsSensitive", false)) as is_sensitive
      from recent_app_events as event
      left join public."Audit_FieldChanges" as field_change
        on field_change."AuditFieldChange_EventID" = event."AuditEvent_ID"
      left join public."Audit_RequestContexts" as request_context
        on request_context."AuditRequest_ID" = event."AuditEvent_RequestContextID"
      left join public."cmp_Users" as workspace_user
        on workspace_user."User_ID" = coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")
        or workspace_user."Auth_User_ID" = coalesce(event."AuditEvent_AuthUserID", request_context."AuditRequest_AuthUserID")
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
        coalesce(nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), ''), auth_event.payload->>'actor_name')::text as actor_name,
        coalesce(workspace_user."User_Email", auth_event.payload->>'actor_username')::text as actor_email,
        'Supabase Auth'::text as source,
        'user_session'::text as record_type,
        auth_event.payload->>'actor_id' as record_id,
        jsonb_build_object('auth_user_id', auth_event.payload->>'actor_id') as record_key,
        auth_event.ip_address::text as ip_address,
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
        on (
          coalesce(workspace_user."Auth_User_ID", workspace_user."User_RetainedAuthUserID") =
          case
            when coalesce(auth_event.payload->>'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth_event.payload->>'actor_id')::uuid
            else null
          end
        )
      order by auth_event.created_at desc
      limit v_limit
    )
    select combined.*
    from (
      select * from app_rows
      union all
      select * from auth_rows
    ) as combined
    order by combined.occurred_at desc
    limit v_limit;
  else
    return query
    with recent_app_events as (
      select event.*
      from public."Audit_Events" as event
      order by event."AuditEvent_OccurredAt" desc
      limit v_limit
    ),
    app_rows as (
      select
        'app:' || event."AuditEvent_ID"::text as id,
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
        nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), '')::text as actor_name,
        workspace_user."User_Email"::text as actor_email,
        coalesce(event."AuditEvent_SourceModule"::text, event."AuditEvent_SourceTableName"::text, event."AuditEvent_SourceApp"::text, 'Multideck') as source,
        event."AuditEvent_RecordTypeCode"::text as record_type,
        event."AuditEvent_RecordID"::text as record_id,
        event."AuditEvent_RecordKeyJSON" as record_key,
        request_context."AuditRequest_IPHash"::text as ip_address,
        event."AuditEvent_OutcomeStatusCode"::text as outcome,
        event."AuditEvent_Reason"::text as detail,
        null::text as field_name,
        null::jsonb as old_value,
        null::jsonb as new_value,
        event."AuditEvent_RequestID"::text as request_id,
        event."AuditEvent_CorrelationID"::text as correlation_id,
        event."AuditEvent_IsSensitive" as is_sensitive
      from recent_app_events as event
      left join public."Audit_RequestContexts" as request_context
        on request_context."AuditRequest_ID" = event."AuditEvent_RequestContextID"
      left join public."cmp_Users" as workspace_user
        on workspace_user."User_ID" = coalesce(event."AuditEvent_UserID", request_context."AuditRequest_UserID")
        or workspace_user."Auth_User_ID" = coalesce(event."AuditEvent_AuthUserID", request_context."AuditRequest_AuthUserID")
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
        coalesce(nullif(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname"), ''), auth_event.payload->>'actor_name')::text as actor_name,
        coalesce(workspace_user."User_Email", auth_event.payload->>'actor_username')::text as actor_email,
        'Supabase Auth'::text as source,
        'user_session'::text as record_type,
        auth_event.payload->>'actor_id' as record_id,
        jsonb_build_object('auth_user_id', auth_event.payload->>'actor_id') as record_key,
        auth_event.ip_address::text as ip_address,
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
        on (
          coalesce(workspace_user."Auth_User_ID", workspace_user."User_RetainedAuthUserID") =
          case
            when coalesce(auth_event.payload->>'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth_event.payload->>'actor_id')::uuid
            else null
          end
        )
      where coalesce(auth_event.payload->>'action', '') not in ('token_refreshed', 'token_revoked')
      order by auth_event.created_at desc
      limit v_limit
    )
    select combined.*
    from (
      select * from app_rows
      union all
      select * from auth_rows
    ) as combined
    order by combined.occurred_at desc
    limit v_limit;
  end if;
end;
$$;

revoke all on function public."Admin_AuditLog"(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public."Admin_AuditLog"(uuid, boolean, integer) to service_role;

create or replace function public."Admin_AuditCoverage"(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_tenant_administrator(p_actor_user_id) then
    raise exception 'Only tenant administrators can view audit coverage.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'auditedTableCount', count(*) filter (where policy."AuditPolicy_IsEnabled"),
    'auditedTables', coalesce(
      jsonb_agg(policy."AuditPolicy_TableName" order by policy."AuditPolicy_TableName")
        filter (where policy."AuditPolicy_IsEnabled"),
      '[]'::jsonb
    ),
    'applicationEventCount', (select count(*) from public."Audit_Events"),
    'fieldChangeCount', (select count(*) from public."Audit_FieldChanges"),
    'authenticationEventCount', (select count(*) from auth.audit_log_entries)
  )
  into v_result
  from public."Audit_TablePolicies" as policy;

  return v_result;
end;
$$;

revoke all on function public."Admin_AuditCoverage"(uuid) from public, anon, authenticated;
grant execute on function public."Admin_AuditCoverage"(uuid) to service_role;

commit;
