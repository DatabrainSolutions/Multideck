-- Customer portal user management must stay responsive for large customer
-- workforces. Return one deterministic page instead of aggregating every user.

begin;

create index if not exists "IX_Portal_UserOrganisations_OrgStatusUser"
  on public."Portal_UserOrganisations" (
    "PortalUserOrg_OrgID",
    "PortalUserOrg_StatusCode",
    "PortalUserOrg_PortalUserID"
  );

create or replace function public.warehouse_edge_portal_users_page(
  p_customer_org_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  with facilities as materialized (
    select coalesce(
      jsonb_agg(access."WMSCustomerFacilityAccess_FacilityID" order by access."WMSCustomerFacilityAccess_FacilityID"),
      '[]'::jsonb
    ) as ids
    from public."WMS_CustomerFacilityAccess" access
    where access."WMSCustomerFacilityAccess_CustomerOrgID" = p_customer_org_id
      and access."WMSCustomerFacilityAccess_IsActive"
  ), matching_users as materialized (
    select
      portal_user."PortalUser_ID" as id,
      portal_user."PortalUser_DisplayName" as display_name,
      portal_user."PortalUser_Email" as email,
      portal_user."PortalUser_StatusCode" as status_code,
      portal_user."PortalUser_LastLoginAt" as last_login_at
    from public."Portal_UserOrganisations" user_org
    join public."Portal_Users" portal_user
      on portal_user."PortalUser_ID" = user_org."PortalUserOrg_PortalUserID"
    where user_org."PortalUserOrg_OrgID" = p_customer_org_id
      and user_org."PortalUserOrg_StatusCode" <> 'revoked'
      and not portal_user."PortalUser_IsDeleted"
  ), selected_users as materialized (
    select
      matching.id,
      matching.display_name,
      matching.email,
      matching.status_code,
      matching.last_login_at,
      coalesce((
        select role."PortalRole_Code"
        from public."Portal_UserRoles" user_role
        join public."Portal_Roles" role
          on role."PortalRole_ID" = user_role."PortalUserRole_RoleID"
        where user_role."PortalUserRole_PortalUserID" = matching.id
          and user_role."PortalUserRole_OrgID" = p_customer_org_id
          and user_role."PortalUserRole_StatusCode" = 'active'
        limit 1
      ), 'warehouse_viewer') as role_code
    from matching_users matching
    order by lower(matching.display_name), matching.id
    limit v_limit
    offset v_offset
  ), counts as (
    select count(*)::integer as total from matching_users
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', selected.id,
      'displayName', selected.display_name,
      'email', selected.email,
      'status', selected.status_code,
      'roleCode', selected.role_code,
      'facilityIds', facilities.ids,
      'lastLoginAt', selected.last_login_at
    ) order by lower(selected.display_name), selected.id) filter (where selected.id is not null), '[]'::jsonb),
    'total', coalesce(max(counts.total), 0),
    'limit', v_limit,
    'offset', v_offset
  )
  into v_result
  from facilities
  cross join counts
  left join selected_users selected on true;

  return coalesce(v_result, jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset));
end;
$$;

revoke all on function public.warehouse_edge_portal_users_page(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.warehouse_edge_portal_users_page(uuid, integer, integer) to service_role;

comment on function public.warehouse_edge_portal_users_page(uuid, integer, integer) is
  'Returns one capped customer portal user page for an Edge-authorised organisation.';

commit;
