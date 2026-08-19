-- The customer directory previously walked every Accounts page in the browser
-- before rendering one 10-50 row page. Keep the existing CRM register RPCs
-- untouched and expose a purpose-built, authenticated directory read instead.

begin;

create or replace function public.multideck_customer_directory_page(
  p_scope text default 'all',
  p_status text default 'All',
  p_limit integer default 20,
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
  v_scope text := case when lower(coalesce(p_scope, 'all')) = 'mine' then 'mine' else 'all' end;
  v_status text := case lower(coalesce(nullif(btrim(p_status), ''), 'all'))
    when 'premium' then 'Premium'
    when 'standard' then 'Standard'
    when 'trial' then 'Trial'
    when 'new' then 'New'
    else 'All'
  end;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read') then
    raise exception 'You do not have permission to view customers.' using errcode = '42501';
  end if;

  with base as materialized (
    select
      org."Org_id" as id,
      coalesce(org."Org_Name", '') as name,
      profile."CRMAccount_OwnerUserID" as owner_id,
      case profile."CRMAccount_Tier"
        when 'A' then 'Premium'
        when 'Premium' then 'Premium'
        when 'Trial' then 'Trial'
        when 'New' then 'New'
        else 'Standard'
      end as status
    from public.multideck_crm_accessible_account_ids(v_context.company_id) accessible
    join public."Org_Master" org on org."Org_id" = accessible.account_id
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = org."Org_id"
     and not profile."CRMAccount_IsDeleted"
    where coalesce(org."Org_CRMIsPotentialCustomer", false)
       or exists (
         select 1
         from public."Org_Master_Type" link
         join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
         where link."Org_ID" = org."Org_id"
           and lower(type."OrgType_Name") = 'customer'
       )
  ), scoped as materialized (
    select *
    from base
    where v_scope = 'all' or owner_id = v_context.user_id
  ), filtered as materialized (
    select *
    from scoped
    where v_status = 'All' or status = v_status
  ), ranked as (
    select id, row_number() over (order by lower(name), id) as ordinal
    from filtered
  ), page as (
    select id, ordinal
    from ranked
    where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by ordinal) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'scopeTotal', (select count(*) from scoped),
    'statusCounts', jsonb_build_object(
      'All', (select count(*) from scoped),
      'Premium', (select count(*) from scoped where status = 'Premium'),
      'Standard', (select count(*) from scoped where status = 'Standard'),
      'Trial', (select count(*) from scoped where status = 'Trial'),
      'New', (select count(*) from scoped where status = 'New')
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_customer_directory_page(text,text,integer,integer) from public, anon;
grant execute on function public.multideck_customer_directory_page(text,text,integer,integer) to authenticated, service_role;

-- Dexter exception: this is a bounded form of the existing tenant-safe
-- Customers read. It adds no new write action, data domain or watch event.

commit;
