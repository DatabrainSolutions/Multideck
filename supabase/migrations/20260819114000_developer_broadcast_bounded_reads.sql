begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists "IX_DEV_Broadcasts_CompanyPage"
  on public."DEV_Broadcasts" ("Company_ID", "Broadcast_CreatedAt" desc, "Broadcast_ID" desc);

create index if not exists "IX_cmp_Users_BroadcastPage"
  on public."cmp_Users" (
    "Company_ID",
    lower(coalesce("User_Firstname", '') || ' ' || coalesce("User_Lastname", '')),
    lower(coalesce("User_Email", '')),
    "User_ID"
  );

create index if not exists "IX_cmp_Users_BroadcastNameSearch"
  on public."cmp_Users" using gin (
    (lower(coalesce("User_Firstname", '') || ' ' || coalesce("User_Lastname", ''))) extensions.gin_trgm_ops
  );

create index if not exists "IX_cmp_Users_BroadcastEmailSearch"
  on public."cmp_Users" using gin (
    (lower(coalesce("User_Email", ''))) extensions.gin_trgm_ops
  );

create or replace function public.multideck_developer_broadcast_users_page(
  p_company_id uuid,
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with parameters as (
    select
      left(lower(btrim(coalesce(p_query, ''))), 200) as search_text,
      '%' || replace(replace(replace(left(lower(btrim(coalesce(p_query, ''))), 200), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as search_pattern,
      least(greatest(coalesce(p_limit, 25), 1), 50) as page_limit,
      least(greatest(coalesce(p_offset, 0), 0), 1000000) as page_offset
  ),
  filtered as materialized (
    select
      workspace_user."User_ID" as id,
      workspace_user."User_Email" as email,
      workspace_user."User_Firstname" as first_name,
      workspace_user."User_Lastname" as last_name,
      workspace_user."Auth_User_ID" as auth_user_id,
      workspace_user."User_AccessStatus" as access_status,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email",
        'Unnamed user'
      ) as display_name
    from public."cmp_Users" workspace_user
    cross join parameters
    where workspace_user."Company_ID" = p_company_id
      and (
        parameters.search_text = ''
        or lower(coalesce(workspace_user."User_Firstname", '') || ' ' || coalesce(workspace_user."User_Lastname", ''))
          like parameters.search_pattern escape E'\\'
        or lower(coalesce(workspace_user."User_Email", '')) like parameters.search_pattern escape E'\\'
      )
  ),
  page as materialized (
    select filtered.*
    from filtered
    cross join parameters
    order by lower(filtered.display_name), lower(filtered.email), filtered.id
    offset (select page_offset from parameters)
    limit (select page_limit from parameters)
  ),
  department_rollup as (
    select
      user_department."User_ID" as user_id,
      jsonb_agg(
        jsonb_build_object(
          'id', department."Department_ID",
          'name', department."Department_Name",
          'isActive', department."Department_IsActive"
        ) order by department."Department_Name", department."Department_ID"
      ) as departments
    from public."cmp_Users_Departments" user_department
    join page on page.id = user_department."User_ID"
    join public."cmp_Departments" department on department."Department_ID" = user_department."Department_ID"
    group by user_department."User_ID"
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'name', page.display_name,
        'email', page.email,
        'authUserId', page.auth_user_id,
        'accessStatus', coalesce(page.access_status, 'active'),
        'departments', coalesce(department_rollup.departments, '[]'::jsonb)
      ) order by lower(page.display_name), lower(page.email), page.id
    ) filter (where page.id is not null), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'offset', parameters.page_offset,
    'limit', parameters.page_limit,
    'hasMore', parameters.page_offset + (select count(*) from page) < (select count(*) from filtered)
  )
  from parameters
  left join page on true
  left join department_rollup on department_rollup.user_id = page.id
  group by parameters.page_offset, parameters.page_limit;
$$;

revoke all on function public.multideck_developer_broadcast_users_page(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.multideck_developer_broadcast_users_page(uuid, text, integer, integer) to service_role;

comment on function public.multideck_developer_broadcast_users_page(uuid, text, integer, integer) is
  'Service-role-only bounded user picker for Developer Broadcast after its Edge Function enforces Broadcasts.Read. Existing Dexter broadcast reads and deterministic watch events are unchanged.';

commit;
