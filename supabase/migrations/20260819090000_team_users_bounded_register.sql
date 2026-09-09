-- Keep Admin > Users bounded even for unusually large isolated workspaces.
-- The browser never receives auth.users directly and the RPC is callable only
-- by the service-role Team Edge Function after its existing permission check.

create or replace function public.multideck_team_users_register_page(
  p_company_id uuid,
  p_search text default '',
  p_sort_by text default 'user',
  p_sort_direction text default 'asc',
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with parameters as (
    select
      left(lower(btrim(coalesce(p_search, ''))), 200) as search_text,
      case when p_sort_by in ('user', 'office', 'role', 'status') then p_sort_by else 'user' end as sort_by,
      case when lower(p_sort_direction) = 'desc' then 'desc' else 'asc' end as sort_direction,
      least(greatest(coalesce(p_limit, 20), 1), 50) as page_limit,
      greatest(coalesce(p_offset, 0), 0) as page_offset
  ),
  company_users as materialized (
    select workspace_user.*
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = p_company_id
      and coalesce(workspace_user."User_AccessStatus", 'active') <> 'deleted'
  ),
  office_rollup as materialized (
    select
      user_office."User_ID" as user_id,
      jsonb_agg(
        jsonb_build_object(
          'id', office."Office_ID",
          'name', office."Office_Name",
          'address', office."Office_Address"
        ) order by office."Office_Name", office."Office_ID"
      ) as offices,
      min(lower(office."Office_Name")) as first_office_name,
      lower(string_agg(office."Office_Name", ' ' order by office."Office_Name")) as office_search
    from company_users workspace_user
    join public."cmp_Users_Offices" user_office on user_office."User_ID" = workspace_user."User_ID"
    join public."cmp_Offices" office on office."Office_ID" = user_office."Office_ID"
    group by user_office."User_ID"
  ),
  role_rollup as materialized (
    select
      user_role."User_ID" as user_id,
      jsonb_agg(
        jsonb_build_object(
          'id', role."sys_UserRole_ID",
          'name', role."sys_UserRole_Name"
        ) order by role."sys_UserRole_Name", role."sys_UserRole_ID"
      ) as roles,
      min(lower(role."sys_UserRole_Name")) as first_role_name
    from company_users workspace_user
    join public."cmp_Users_Roles" user_role on user_role."User_ID" = workspace_user."User_ID"
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    group by user_role."User_ID"
  ),
  department_rollup as materialized (
    select
      user_department."User_ID" as user_id,
      jsonb_agg(
        jsonb_build_object(
          'id', department."Department_ID",
          'name', department."Department_Name",
          'isActive', department."Department_IsActive"
        ) order by department."Department_Name", department."Department_ID"
      ) as departments
    from company_users workspace_user
    join public."cmp_Users_Departments" user_department on user_department."User_ID" = workspace_user."User_ID"
    join public."cmp_Departments" department on department."Department_ID" = user_department."Department_ID"
    group by user_department."User_ID"
  ),
  prepared as materialized (
    select
      workspace_user.*,
      auth_user.invited_at,
      auth_user.last_sign_in_at,
      auth_user.raw_app_meta_data,
      auth_user.raw_user_meta_data,
      company."Company_Name",
      coalesce(office_rollup.offices, '[]'::jsonb) as offices,
      coalesce(role_rollup.roles, '[]'::jsonb) as roles,
      coalesce(department_rollup.departments, '[]'::jsonb) as departments,
      coalesce(office_rollup.first_office_name, '') as first_office_name,
      coalesce(office_rollup.office_search, '') as office_search,
      coalesce(role_rollup.first_role_name, '') as first_role_name,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email"
      ) as display_name,
      case
        when workspace_user."User_AccessStatus" = 'deactivated' then 'Deactivated'
        when auth_user.invited_at is not null and (
          case
            when auth_user.invited_at >= timestamptz '2026-08-12 00:00:00+00' then
              not (
                coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ? 'multideck_password_created_at'
                or coalesce(auth_user.raw_user_meta_data, '{}'::jsonb) ? 'multideck_password_created_at'
              )
            else auth_user.last_sign_in_at is null
          end
        ) then 'Invited'
        when workspace_user."Auth_User_ID" is not null then 'Active'
        else 'Profile only'
      end as display_status
    from company_users workspace_user
    left join auth.users auth_user on auth_user.id = workspace_user."Auth_User_ID"
    left join public."cmp_Company" company on company."Company_ID" = workspace_user."Company_ID"
    left join office_rollup on office_rollup.user_id = workspace_user."User_ID"
    left join role_rollup on role_rollup.user_id = workspace_user."User_ID"
    left join department_rollup on department_rollup.user_id = workspace_user."User_ID"
  ),
  filtered as materialized (
    select prepared.*
    from prepared
    cross join parameters
    where parameters.search_text = ''
      or lower(concat_ws(
        ' ',
        prepared.display_name,
        prepared."User_Email",
        prepared.office_search,
        prepared.first_role_name
      )) like '%' || parameters.search_text || '%'
  ),
  ordered as materialized (
    select
      filtered.*,
      row_number() over (
        order by
          case when parameters.sort_by = 'user' and parameters.sort_direction = 'asc' then lower(filtered.display_name) end asc nulls last,
          case when parameters.sort_by = 'user' and parameters.sort_direction = 'desc' then lower(filtered.display_name) end desc nulls last,
          case when parameters.sort_by = 'office' and parameters.sort_direction = 'asc' then filtered.first_office_name end asc nulls last,
          case when parameters.sort_by = 'office' and parameters.sort_direction = 'desc' then filtered.first_office_name end desc nulls last,
          case when parameters.sort_by = 'role' and parameters.sort_direction = 'asc' then filtered.first_role_name end asc nulls last,
          case when parameters.sort_by = 'role' and parameters.sort_direction = 'desc' then filtered.first_role_name end desc nulls last,
          case when parameters.sort_by = 'status' and parameters.sort_direction = 'asc' then filtered.display_status end asc nulls last,
          case when parameters.sort_by = 'status' and parameters.sort_direction = 'desc' then filtered.display_status end desc nulls last,
          lower(filtered."User_Email") asc,
          filtered."User_ID" asc
      ) as ordinal
    from filtered
    cross join parameters
  ),
  page as (
    select ordered.*
    from ordered
    cross join parameters
    where ordered.ordinal > parameters.page_offset
      and ordered.ordinal <= parameters.page_offset + parameters.page_limit
  ),
  page_payload as (
    select
      page.ordinal,
      jsonb_build_object(
        'id', page."User_ID",
        'authUserId', page."Auth_User_ID",
        'displayName', page.display_name,
        'firstName', page."User_Firstname",
        'lastName', page."User_Lastname",
        'email', page."User_Email",
        'company', jsonb_build_object('id', page."Company_ID", 'name', page."Company_Name"),
        'offices', page.offices,
        'roles', page.roles,
        'departments', page.departments,
        'status', page.display_status,
        'invitationSentAt', case when page.display_status = 'Invited' then page.invited_at else null end,
        'deactivatedAt', page."User_DeactivatedAt",
        'jobTitle', page."User_JobTitle",
        'profilePhoto', case when page."User_ProfilePhotoPath" is null then null else jsonb_build_object(
          'bucket', page."User_ProfilePhotoBucket",
          'path', page."User_ProfilePhotoPath",
          'mimeType', page."User_ProfilePhotoMimeType",
          'sizeBytes', page."User_ProfilePhotoSizeBytes",
          'updatedAt', page."User_ProfilePhotoUpdatedAt"
        ) end,
        'coverPhoto', case when page."User_CoverPhotoPath" is null then null else jsonb_build_object(
          'bucket', page."User_CoverPhotoBucket",
          'path', page."User_CoverPhotoPath",
          'mimeType', page."User_CoverPhotoMimeType",
          'sizeBytes', page."User_CoverPhotoSizeBytes",
          'updatedAt', page."User_CoverPhotoUpdatedAt"
        ) end
      ) as payload
    from page
  )
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(page_payload.payload order by page_payload.ordinal) from page_payload), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', parameters.page_limit,
    'offset', parameters.page_offset
  )
  from parameters;
$$;

revoke all on function public.multideck_team_users_register_page(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.multideck_team_users_register_page(uuid, text, text, text, integer, integer) to service_role;

comment on function public.multideck_team_users_register_page(uuid, text, text, text, integer, integer) is
  'Service-role-only bounded Admin Users register. The Team Edge Function supplies the authenticated company after enforcing Users.Read.';

create or replace function public.multideck_team_user_replacement_options(
  p_company_id uuid,
  p_target_user_id uuid,
  p_search text default '',
  p_limit integer default 50
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with parameters as (
    select
      left(lower(btrim(coalesce(p_search, ''))), 200) as search_text,
      least(greatest(coalesce(p_limit, 50), 1), 50) as page_limit
  ),
  eligible as materialized (
    select
      workspace_user.*,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email"
      ) as display_name
    from public."cmp_Users" workspace_user
    join auth.users auth_user on auth_user.id = workspace_user."Auth_User_ID"
    cross join parameters
    where workspace_user."Company_ID" = p_company_id
      and workspace_user."User_ID" <> p_target_user_id
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and not (
        auth_user.invited_at is not null and (
          case
            when auth_user.invited_at >= timestamptz '2026-08-12 00:00:00+00' then
              not (
                coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ? 'multideck_password_created_at'
                or coalesce(auth_user.raw_user_meta_data, '{}'::jsonb) ? 'multideck_password_created_at'
              )
            else auth_user.last_sign_in_at is null
          end
        )
      )
      and (
        parameters.search_text = ''
        or lower(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname", workspace_user."User_Email"))
          like '%' || parameters.search_text || '%'
      )
  ),
  page as (
    select eligible.*
    from eligible
    order by lower(eligible.display_name), lower(eligible."User_Email"), eligible."User_ID"
    limit (select page_limit from parameters)
  )
  select jsonb_build_object(
    'users', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', page."User_ID",
        'authUserId', page."Auth_User_ID",
        'displayName', page.display_name,
        'firstName', page."User_Firstname",
        'lastName', page."User_Lastname",
        'email', page."User_Email",
        'company', jsonb_build_object('id', page."Company_ID", 'name', company."Company_Name"),
        'offices', '[]'::jsonb,
        'roles', '[]'::jsonb,
        'departments', '[]'::jsonb,
        'status', 'Active',
        'jobTitle', page."User_JobTitle",
        'profilePhoto', case when page."User_ProfilePhotoPath" is null then null else jsonb_build_object(
          'bucket', page."User_ProfilePhotoBucket",
          'path', page."User_ProfilePhotoPath",
          'mimeType', page."User_ProfilePhotoMimeType",
          'sizeBytes', page."User_ProfilePhotoSizeBytes",
          'updatedAt', page."User_ProfilePhotoUpdatedAt"
        ) end,
        'coverPhoto', null
      ) order by lower(page.display_name), lower(page."User_Email"), page."User_ID"
    ) filter (where page."User_ID" is not null), '[]'::jsonb),
    'total', (select count(*) from eligible)
  )
  from public."cmp_Company" company
  left join page on true
  where company."Company_ID" = p_company_id
  group by company."Company_ID";
$$;

revoke all on function public.multideck_team_user_replacement_options(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_team_user_replacement_options(uuid, uuid, text, integer) to service_role;

comment on function public.multideck_team_user_replacement_options(uuid, uuid, text, integer) is
  'Service-role-only bounded search for active user-deletion reassignment targets.';

-- This is a bounded read optimization for the existing identity-management
-- surface. It creates no new Dexter domain, write action or watchable event;
-- high-impact user administration remains explicitly unsupported in Dexter.
