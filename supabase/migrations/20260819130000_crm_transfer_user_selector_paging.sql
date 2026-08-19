-- Keep CRM ownership selectors responsive as a workspace grows. The current
-- operator comes from the authenticated CRM context; only the searched page of
-- eligible transfer targets is returned to the browser.

begin;

create index if not exists "IX_cmp_Users_CRMTransferPage"
  on public."cmp_Users" (
    "Company_ID",
    lower(coalesce("User_Firstname", '') || ' ' || coalesce("User_Lastname", '')),
    lower(coalesce("User_Email", '')),
    "User_ID"
  )
  where "Auth_User_ID" is not null
    and coalesce("User_AccessStatus", 'active') = 'active';

create or replace function public.multideck_crm_transfer_users_page(
  p_search text default null,
  p_exclude_user_id uuid default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_search text := left(lower(btrim(coalesce(p_search, ''))), 200);
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM users.' using errcode = '42501';
  end if;

  v_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with eligible as materialized (
    select
      workspace_user."User_ID" as id,
      coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email",
        'Unnamed user'
      ) as display_name,
      workspace_user."User_Email" as email
    from public."cmp_Users" workspace_user
    where workspace_user."Company_ID" = v_context.company_id
      and workspace_user."Auth_User_ID" is not null
      and coalesce(workspace_user."User_AccessStatus", 'active') = 'active'
      and (p_exclude_user_id is null or workspace_user."User_ID" <> p_exclude_user_id)
      and (
        v_search = ''
        or lower(coalesce(workspace_user."User_Firstname", '') || ' ' || coalesce(workspace_user."User_Lastname", '')) like v_pattern escape E'\\'
        or lower(coalesce(workspace_user."User_Email", '')) like v_pattern escape E'\\'
      )
  ), page as materialized (
    select eligible.*
    from eligible
    order by lower(eligible.display_name), lower(eligible.email), eligible.id
    offset v_offset
    limit v_limit
  ), current_operator as (
    select jsonb_build_object(
      'id', workspace_user."User_ID",
      'name', coalesce(
        nullif(btrim(concat_ws(' ', workspace_user."User_Firstname", workspace_user."User_Lastname")), ''),
        workspace_user."User_Email",
        'Current user'
      ),
      'email', coalesce(workspace_user."User_Email", ''),
      'isCurrentUser', true
    ) as payload
    from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = v_context.user_id
      and workspace_user."Company_ID" = v_context.company_id
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id,
      'name', page.display_name,
      'email', coalesce(page.email, ''),
      'isCurrentUser', page.id = v_context.user_id
    ) order by lower(page.display_name), lower(page.email), page.id) from page), '[]'::jsonb),
    'total', (select count(*) from eligible),
    'limit', v_limit,
    'offset', v_offset,
    'currentUser', (select payload from current_operator)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_transfer_users_page(text, uuid, integer, integer) from public, anon;
grant execute on function public.multideck_crm_transfer_users_page(text, uuid, integer, integer) to authenticated, service_role;

comment on function public.multideck_crm_transfer_users_page(text, uuid, integer, integer) is
  'Authenticated, company-scoped and maximum-50-row CRM ownership target selector. Search and exclusion happen before pagination.';

commit;
