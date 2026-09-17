begin;

-- One read boundary for registers, items, documents, Dexter chat and watch
-- authorisation. Customs.Read shares company records without granting writes.
-- Preserve scoped creator/assignee/department/handoff access and INSERT RETURNING.
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
        (not require_write and booking_api.has_permission(caller_auth_user_id, 'Customs.Read'))
        or declaration."CUST_CreatedBy" = caller_auth_user_id
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


create or replace function public.customs_declaration_creator_current_user_authorised(
  creator_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" creator
    join public."cmp_Users" caller
      on caller."Auth_User_ID" = (select auth.uid())
    where creator."Auth_User_ID" = creator_auth_user_id
      and caller."Company_ID" is not null
      and caller."Company_ID" = creator."Company_ID"
      and coalesce(caller."User_AccessStatus", 'active') = 'active'
      and coalesce(creator."User_AccessStatus", 'active') <> 'deleted'
      and (creator_auth_user_id = (select auth.uid())
        or booking_api.has_permission((select auth.uid()), 'Customs.Read'))
  )
$$;

revoke all on function public.customs_declaration_creator_current_user_authorised(uuid) from public, anon;
grant execute on function public.customs_declaration_creator_current_user_authorised(uuid) to authenticated, service_role;


drop policy "Workspace users can read company Customs declarations" on public."Customs_Declarations";
create policy "Workspace users can read company Customs declarations"
  on public."Customs_Declarations" for select to authenticated
  using (
    not "CUST_IsDeleted"
    and (
      public.customs_declaration_creator_current_user_authorised("CUST_CreatedBy")
      or public.customs_declaration_current_user_authorised("CUST_id", false)
    )
  );

-- Assign this explicit read-only role through workspace user administration.
-- Do not add Customs permissions to every generic Company User or Operator.
insert into public."sys_UserRoles" ("sys_UserRole_Name")
select 'Customs Reader'
where not exists (select 1 from public."sys_UserRoles" where "sys_UserRole_Name" = 'Customs Reader');
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where role."sys_UserRole_Name" = 'Customs Reader'
  and permission."sys_Permission_Value" = 'Customs.Read'
on conflict do nothing;

commit;
