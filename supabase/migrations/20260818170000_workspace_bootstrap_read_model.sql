-- Collapse the authenticated workspace identity and preference reads into one
-- service-role-only database call. The Edge Function authenticates the bearer
-- token before supplying the auth user id; browser clients cannot call this
-- cross-user read model directly.

create or replace function public.get_workspace_bootstrap_for_auth_user(p_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_internal public."cmp_Users"%rowtype;
  v_portal public."Portal_Users"%rowtype;
  v_result jsonb;
begin
  select workspace_user.*
  into v_internal
  from public."cmp_Users" workspace_user
  where workspace_user."Auth_User_ID" = p_auth_user_id
  limit 1;

  if found then
    if coalesce(v_internal."User_AccessStatus", 'active') <> 'active' then
      return jsonb_build_object('accessStatus', v_internal."User_AccessStatus");
    end if;

    select jsonb_build_object(
      'accessStatus', 'active',
      'profile', jsonb_build_object(
        'id', v_internal."User_ID",
        'authUserId', v_internal."Auth_User_ID",
        'displayName', coalesce(
          nullif(btrim(concat_ws(' ', v_internal."User_Firstname", v_internal."User_Lastname")), ''),
          v_internal."User_Email"
        ),
        'firstName', v_internal."User_Firstname",
        'lastName', v_internal."User_Lastname",
        'email', v_internal."User_Email",
        'actorType', 'internal',
        'company', case
          when company."Company_ID" is null then null
          else jsonb_build_object('id', company."Company_ID", 'name', company."Company_Name")
        end,
        'offices', coalesce((
          select jsonb_agg(
            jsonb_build_object('id', office."Office_ID", 'name', office."Office_Name", 'address', office."Office_Address")
            order by office."Office_Name"
          )
          from public."cmp_Users_Offices" office_link
          join public."cmp_Offices" office on office."Office_ID" = office_link."Office_ID"
          where office_link."User_ID" = v_internal."User_ID"
        ), '[]'::jsonb),
        'roles', coalesce((
          select jsonb_agg(
            jsonb_build_object('id', role."sys_UserRole_ID", 'name', role."sys_UserRole_Name")
            order by role."sys_UserRole_Name"
          )
          from public."cmp_Users_Roles" role_link
          join public."sys_UserRoles" role on role."sys_UserRole_ID" = role_link."sys_UserRole_ID"
          where role_link."User_ID" = v_internal."User_ID"
        ), '[]'::jsonb),
        'departments', '[]'::jsonb,
        'organisations', '[]'::jsonb,
        'permissions', coalesce((
          select jsonb_agg(permission_value order by permission_value)
          from (
            select distinct permission."sys_Permission_Value"::text as permission_value
            from public."cmp_Users_Roles" role_link
            join public."sys_UserRole_Permissions" permission_link
              on permission_link."sys_UserRole_ID" = role_link."sys_UserRole_ID"
            join public."sys_Permissions" permission
              on permission."sys_Permission_ID" = permission_link."sys_Permission_ID"
            where role_link."User_ID" = v_internal."User_ID"
          ) resolved_permissions
        ), '[]'::jsonb),
        'landingPath', '/',
        'status', case when v_internal."Auth_User_ID" is null then 'Profile only' else 'Active' end,
        'jobTitle', v_internal."User_JobTitle",
        'profilePhoto', case
          when v_internal."User_ProfilePhotoBucket" is not null
            and v_internal."User_ProfilePhotoPath" is not null
            and v_internal."User_ProfilePhotoMimeType" is not null
            and v_internal."User_ProfilePhotoSizeBytes" is not null
            and v_internal."User_ProfilePhotoUpdatedAt" is not null
          then jsonb_build_object(
            'bucket', v_internal."User_ProfilePhotoBucket",
            'path', v_internal."User_ProfilePhotoPath",
            'mimeType', v_internal."User_ProfilePhotoMimeType",
            'sizeBytes', v_internal."User_ProfilePhotoSizeBytes",
            'updatedAt', v_internal."User_ProfilePhotoUpdatedAt"
          )
          else null
        end,
        'coverPhoto', case
          when v_internal."User_CoverPhotoBucket" is not null
            and v_internal."User_CoverPhotoPath" is not null
            and v_internal."User_CoverPhotoMimeType" is not null
            and v_internal."User_CoverPhotoSizeBytes" is not null
            and v_internal."User_CoverPhotoUpdatedAt" is not null
          then jsonb_build_object(
            'bucket', v_internal."User_CoverPhotoBucket",
            'path', v_internal."User_CoverPhotoPath",
            'mimeType', v_internal."User_CoverPhotoMimeType",
            'sizeBytes', v_internal."User_CoverPhotoSizeBytes",
            'updatedAt', v_internal."User_CoverPhotoUpdatedAt"
          )
          else null
        end
      ),
      'preferences', jsonb_build_object(
        'themeMode', v_internal."User_ThemeMode",
        'locale', v_internal."User_Locale",
        'accentPreset', v_internal."User_AccentPreset",
        'sidebar', jsonb_build_object(
          'collapsed', coalesce(v_internal."User_SidebarCollapsed", false),
          'layout', coalesce(v_internal."User_SidebarLayout", '{}'::jsonb)
        ),
        'keyboardShortcuts', coalesce(v_internal."User_KeyboardShortcuts", '{}'::jsonb),
        'tablePinnedColumns', coalesce(v_internal."User_TablePinnedColumns", '{}'::jsonb)
      )
    )
    into v_result
    from (values (true)) as seed(present)
    left join public."cmp_Company" company on company."Company_ID" = v_internal."Company_ID";

    return v_result;
  end if;

  select portal_user.*
  into v_portal
  from public."Portal_ExternalIdentities" identity_link
  join public."Portal_Users" portal_user
    on portal_user."PortalUser_ID" = identity_link."PortalIdentity_PortalUserID"
  where identity_link."PortalIdentity_ExternalSubject" = p_auth_user_id::text
    and identity_link."PortalIdentity_StatusCode" = 'active'
    and portal_user."PortalUser_StatusCode" = 'active'
    and portal_user."PortalUser_IsDeleted" = false
  limit 1;

  if not found then
    return jsonb_build_object('accessStatus', 'unlinked', 'profile', null, 'preferences', null);
  end if;

  return jsonb_build_object(
    'accessStatus', 'active',
    'profile', jsonb_build_object(
      'id', v_portal."PortalUser_ID",
      'authUserId', p_auth_user_id,
      'displayName', coalesce(nullif(v_portal."PortalUser_DisplayName", ''), v_portal."PortalUser_Email"),
      'firstName', null,
      'lastName', null,
      'email', v_portal."PortalUser_Email",
      'actorType', 'customer',
      'company', null,
      'offices', '[]'::jsonb,
      'roles', '[]'::jsonb,
      'departments', '[]'::jsonb,
      'organisations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', organisation."Org_id",
            'name', organisation."Org_Name",
            'canManageWarehouseUsers', organisation_link."PortalUserOrg_CanManageOrgUsers"
          )
          order by organisation."Org_Name"
        )
        from public."Portal_UserOrganisations" organisation_link
        join public."Org_Master" organisation on organisation."Org_id" = organisation_link."PortalUserOrg_OrgID"
        where organisation_link."PortalUserOrg_PortalUserID" = v_portal."PortalUser_ID"
          and organisation_link."PortalUserOrg_StatusCode" = 'active'
      ), '[]'::jsonb),
      'permissions', '[]'::jsonb,
      'landingPath', '/warehouse/inventory',
      'status', 'Active',
      'jobTitle', null,
      'profilePhoto', null,
      'coverPhoto', null
    ),
    'preferences', null
  );
end;
$$;

revoke all on function public.get_workspace_bootstrap_for_auth_user(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_bootstrap_for_auth_user(uuid) to service_role;

comment on function public.get_workspace_bootstrap_for_auth_user(uuid) is
  'Service-role-only authenticated workspace bootstrap. The account Edge Function validates the bearer token before calling it.';
