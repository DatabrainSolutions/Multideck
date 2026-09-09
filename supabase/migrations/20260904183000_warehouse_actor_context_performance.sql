-- Resolve the internal warehouse actor's permissions and facility scope in one
-- service-role-only database round trip. The Edge Function authenticates the
-- bearer token before passing the verified auth user id to this function.

create or replace function public.warehouse_edge_internal_actor_context(p_auth_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', workspace_user."User_ID",
    'companyId', workspace_user."Company_ID",
    'accessStatus', coalesce(workspace_user."User_AccessStatus", 'active'),
    'permissions', coalesce((
      select jsonb_agg(permission_value order by permission_value)
      from (
        select distinct permission."sys_Permission_Value"::text as permission_value
        from public."cmp_Users_Roles" role_link
        join public."sys_UserRole_Permissions" permission_link
          on permission_link."sys_UserRole_ID" = role_link."sys_UserRole_ID"
        join public."sys_Permissions" permission
          on permission."sys_Permission_ID" = permission_link."sys_Permission_ID"
        where role_link."User_ID" = workspace_user."User_ID"
      ) resolved_permissions
    ), '[]'::jsonb),
    'facilityIds', coalesce((
      select jsonb_agg(facility_id order by facility_id)
      from (
        select distinct facility."WMSFacility_ID" as facility_id
        from public."cmp_Users_Offices" office_link
        join public."cmp_Offices" office
          on office."Office_ID" = office_link."Office_ID"
         and office."Company_ID" = workspace_user."Company_ID"
        join public."WMS_Facilities" facility
          on facility."WMSFacility_OrgOfficeID" = office."Office_ID"
         and facility."WMSFacility_IsDeleted" = false
        where office_link."User_ID" = workspace_user."User_ID"
      ) resolved_facilities
    ), '[]'::jsonb)
  )
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = p_auth_user_id
  limit 1;
$$;

revoke all on function public.warehouse_edge_internal_actor_context(uuid) from public, anon, authenticated;
grant execute on function public.warehouse_edge_internal_actor_context(uuid) to service_role;

comment on function public.warehouse_edge_internal_actor_context(uuid) is
  'Service-role-only warehouse actor read model. Dexter exception: this changes request authentication performance only and does not add an operational data capability or watchable event.';
