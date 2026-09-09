-- A booking operator who starts a Customs handoff receives declaration-scoped
-- read/write access. This does not grant a tenant-wide Customs role.

begin;

create table booking_api.customs_declaration_grants (
  declaration_id uuid not null references public."Customs_Declarations"("CUST_id") on delete cascade,
  user_id uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  can_write boolean not null default true,
  reason varchar(40) not null default 'booking_handoff_initiator',
  created_at timestamptz not null default now(),
  primary key (declaration_id, user_id),
  constraint customs_declaration_grants_reason_check check (reason in ('booking_handoff_initiator'))
);

create index customs_declaration_grants_user_idx
  on booking_api.customs_declaration_grants (user_id, declaration_id);

revoke all on table booking_api.customs_declaration_grants from public, anon, authenticated;
grant select, insert, update, delete on table booking_api.customs_declaration_grants to service_role;

create or replace function booking_api.customs_access(
  caller_auth_user_id uuid,
  requested_declaration_id uuid,
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."Customs_Declarations" declaration
    join public."cmp_Users" declaration_creator
      on declaration_creator."Auth_User_ID" = declaration."CUST_CreatedBy"
    join public."cmp_Users" caller
      on caller."Auth_User_ID" = caller_auth_user_id
    where declaration."CUST_id" = requested_declaration_id
      and not declaration."CUST_IsDeleted"
      and caller."Company_ID" is not null
      and caller."Company_ID" = declaration_creator."Company_ID"
      and coalesce(caller."User_AccessStatus", 'active') = 'active'
      and coalesce(declaration_creator."User_AccessStatus", 'active') <> 'deleted'
      and (
        declaration."CUST_CreatedBy" = caller_auth_user_id
        or declaration."CUST_AssignedUserID" = caller."User_ID"
        or exists (
          select 1
          from booking_api.customs_declaration_grants scoped_grant
          where scoped_grant.declaration_id = declaration."CUST_id"
            and scoped_grant.user_id = caller."User_ID"
            and (not require_write or scoped_grant.can_write)
        )
        or (
          declaration."CUST_OwnerDepartmentID" is not null
          and exists (
            select 1
            from public."cmp_Users_Departments" membership
            join public."cmp_Departments" department
              on department."Department_ID" = membership."Department_ID"
            where membership."User_ID" = caller."User_ID"
              and membership."Department_ID" = declaration."CUST_OwnerDepartmentID"
              and department."Company_ID" = caller."Company_ID"
              and department."Department_IsActive"
          )
        )
        or (
          booking_api.has_permission(
            caller_auth_user_id,
            case when require_write then 'Customs.Write' else 'Customs.Read' end
          )
          and exists (
            select 1
            from public."cmp_Users_Roles" user_role
            join public."sys_UserRoles" role
              on role."sys_UserRole_ID" = user_role."sys_UserRole_ID"
            where user_role."User_ID" = caller."User_ID"
              and lower(role."sys_UserRole_Name") in ('administrator', 'company manager', 'operations manager')
          )
        )
      )
  )
$$;

revoke all on function booking_api.customs_access(uuid, uuid, boolean) from public, anon, authenticated;

alter function booking_api.customs_readiness(uuid, uuid)
  rename to customs_readiness_before_handoff_initiator_access_20260821;

create or replace function booking_api.customs_readiness(
  caller_auth_user_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_value jsonb;
  actor_user_id uuid;
  filtered_missing jsonb;
begin
  result_value := booking_api.customs_readiness_before_handoff_initiator_access_20260821(
    caller_auth_user_id,
    requested_job_id
  );

  select app_user."User_ID" into strict actor_user_id
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and coalesce(app_user."User_AccessStatus", 'active') = 'active';

  select coalesce(jsonb_agg(issue.value order by issue.ordinality), '[]'::jsonb)
  into filtered_missing
  from jsonb_array_elements(coalesce(result_value -> 'missing', '[]'::jsonb))
    with ordinality as issue(value, ordinality)
  where issue.value ->> 'key' <> 'customs_operator';

  result_value := jsonb_set(result_value, '{missing}', filtered_missing, true);
  result_value := jsonb_set(result_value, '{evidence,assignedUserId}', to_jsonb(actor_user_id), true);
  result_value := jsonb_set(
    result_value,
    '{ready}',
    to_jsonb(jsonb_array_length(filtered_missing) = 0),
    true
  );
  return result_value;
exception
  when no_data_found or too_many_rows then
    raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

revoke all on function booking_api.customs_readiness(uuid, uuid) from public, anon, authenticated;

-- Keep the existing handoff payload mapping intact, while replacing the global
-- Customs-role gate with a guarded declaration-scoped grant. The assertions
-- deliberately fail the migration if the upstream function shape changes.
do $migration$
declare
  function_definition text;
  old_fragment text;
  new_fragment text;
begin
  function_definition := pg_get_functiondef(
    'booking_api.send_to_customs(uuid,uuid,uuid)'::regprocedure
  );

  old_fragment := $old$
  if found then
    return jsonb_build_object(
$old$;
  new_fragment := $new$
  if found then
    insert into booking_api.customs_declaration_grants (
      declaration_id, user_id, can_write, reason
    ) values (
      existing_declaration."CUST_id", app_user."User_ID", true, 'booking_handoff_initiator'
    )
    on conflict (declaration_id, user_id) do update
      set can_write = true,
          reason = excluded.reason;

    return jsonb_build_object(
$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'The existing Customs handoff reuse branch no longer matches the reviewed definition.';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  old_fragment := $old$
  assigned_user_id := nullif(readiness#>>'{evidence,assignedUserId}', '')::uuid;
  if assigned_user_id is null then
    raise exception 'Assign at least one active Customs operator with read and write access before sending this booking.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public."cmp_Users_Departments" membership
    join public."cmp_Users" customs_user on customs_user."User_ID" = membership."User_ID"
    where membership."Department_ID" = department_id_value
      and customs_user."User_ID" = assigned_user_id
      and customs_user."Company_ID" = app_user."Company_ID"
      and customs_user."User_AccessStatus" = 'active'
      and customs_user."Auth_User_ID" is not null
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Read')
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Write')
  ) then
    raise exception 'The assigned Customs operator is no longer available. Review the booking and try again.' using errcode = '22023';
  end if;
$old$;
  new_fragment := $new$
  -- The operator handing the booking off owns the initial review and can edit
  -- the declaration they create without receiving tenant-wide Customs access.
  assigned_user_id := app_user."User_ID";
$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'The existing Customs operator gate no longer matches the reviewed definition.';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  old_fragment := $old$
  ) returning "CUST_id" into declaration_id;

  insert into public."Customs_Items" (
$old$;
  new_fragment := $new$
  ) returning "CUST_id" into declaration_id;

  insert into booking_api.customs_declaration_grants (
    declaration_id, user_id, can_write, reason
  ) values (
    declaration_id, app_user."User_ID", true, 'booking_handoff_initiator'
  )
  on conflict (declaration_id, user_id) do update
    set can_write = true,
        reason = excluded.reason;

  insert into public."Customs_Items" (
$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'The existing Customs declaration insert no longer matches the reviewed definition.';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  old_fragment := $old$
    if found then return jsonb_build_object('declarationId',existing_declaration."CUST_id",'reference',existing_declaration."CUST_LocalReferenceNumber",'direction',existing_declaration."CUST_Direction",'route','/customs/job-related/'||existing_declaration."CUST_Direction"||'/'||existing_declaration."CUST_id",'canOpen',booking_api.customs_access(caller_auth_user_id,existing_declaration."CUST_id",false),'reused',true); end if;
$old$;
  new_fragment := $new$
    if found then
      insert into booking_api.customs_declaration_grants (
        declaration_id, user_id, can_write, reason
      ) values (
        existing_declaration."CUST_id", app_user."User_ID", true, 'booking_handoff_initiator'
      )
      on conflict (declaration_id, user_id) do update
        set can_write = true,
            reason = excluded.reason;

      return jsonb_build_object('declarationId',existing_declaration."CUST_id",'reference',existing_declaration."CUST_LocalReferenceNumber",'direction',existing_declaration."CUST_Direction",'route','/customs/job-related/'||existing_declaration."CUST_Direction"||'/'||existing_declaration."CUST_id",'canOpen',booking_api.customs_access(caller_auth_user_id,existing_declaration."CUST_id",false),'reused',true);
    end if;
$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'The existing Customs handoff retry branch no longer matches the reviewed definition.';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  execute function_definition;
end;
$migration$;

-- Existing booking-created declarations receive the same scoped access where
-- the recorded initiator still belongs to the booking's company.
insert into booking_api.customs_declaration_grants (
  declaration_id, user_id, can_write, reason
)
select
  declaration."CUST_id",
  initiator."User_ID",
  true,
  'booking_handoff_initiator'
from public."Customs_Declarations" declaration
join public."Job_Header" job
  on job."Job_ID" = declaration."CUST_JobID"
join public."cmp_Offices" office
  on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
join lateral (
  select app_user."User_ID"
  from public."cmp_Users" app_user
  where app_user."Company_ID" = office."Company_ID"
    and coalesce(app_user."User_AccessStatus", 'active') <> 'deleted'
    and (
      app_user."User_ID" = declaration."CUST_SubmittedByUserID"
      or (
        declaration."CUST_SubmittedByUserID" is null
        and app_user."Auth_User_ID" = declaration."CUST_CreatedBy"
      )
    )
  order by (app_user."User_ID" = declaration."CUST_SubmittedByUserID") desc
  limit 1
) initiator on true
where declaration."CUST_JobID" is not null
  and not declaration."CUST_IsDeleted"
on conflict (declaration_id, user_id) do update
  set can_write = true,
      reason = excluded.reason;

revoke all on function booking_api.send_to_customs(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function booking_api.customs_access(uuid, uuid, boolean) to service_role;
grant execute on function booking_api.customs_readiness(uuid, uuid) to service_role;
grant execute on function booking_api.send_to_customs(uuid, uuid, uuid) to service_role;

comment on table booking_api.customs_declaration_grants is
  'Declaration-scoped Customs access granted to booking handoff initiators.';
comment on function booking_api.customs_access(uuid, uuid, boolean) is
  'Checks tenant-safe declaration-scoped or authorised departmental Customs access.';

commit;
