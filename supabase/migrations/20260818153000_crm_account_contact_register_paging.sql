-- Bounded, filter-aware register reads for Accounts and Contacts. The RPCs
-- return only identifiers plus totals/facets; the existing Edge mapper then
-- hydrates that one page, preserving the public response contract.

begin;

create or replace function public.multideck_crm_account_register_page(
  p_search text default null,
  p_marketing_scope text default null,
  p_relationship text default null,
  p_owner_id uuid default null,
  p_unassigned boolean default false,
  p_sort text default 'account',
  p_direction text default 'asc',
  p_limit integer default 50,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read') then
    raise exception 'You do not have permission to view CRM accounts.' using errcode = '42501';
  end if;

  with base as materialized (
    select
      org."Org_id" as id,
      coalesce(org."Org_Name", '') as name,
      coalesce(profile."CRMAccount_RelationshipStatusCode", org."Org_CRMRelationshipStatusCode", 'active_customer') as relationship_status,
      profile."CRMAccount_OwnerUserID" as owner_id,
      nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '') as owner_name,
      profile."CRMAccount_Vertical" as industry,
      profile."CRMAccount_HealthScore" as health_score,
      profile."CRMAccount_LastContactAt" as last_contact_at,
      profile."CRMAccount_NextActionDueAt" as next_action_due_at,
      coalesce(org."Org_MarketingOptIn", false) as marketing_opt_in,
      coalesce(contact_count.value, 0)::integer as contact_count,
      concat_ws(', ', address."OrgAdd_TownCity", address."OrgAdd_Country") as location
    from public.multideck_crm_accessible_account_ids(v_context.company_id) accessible
    join public."Org_Master" org on org."Org_id" = accessible.account_id
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = org."Org_id"
     and not profile."CRMAccount_IsDeleted"
    left join public."cmp_Users" owner on owner."User_ID" = profile."CRMAccount_OwnerUserID"
    left join lateral (
      select count(*)::integer as value
      from public."Org_Contacts" contact
      where contact."Org_ID" = org."Org_id"
    ) contact_count on true
    left join lateral (
      select item."OrgAdd_TownCity", item."OrgAdd_Country"
      from public."Org_Addresses" item
      where item."Org_ID" = org."Org_id"
      limit 1
    ) address on true
    where coalesce(org."Org_CRMIsPotentialCustomer", false)
       or exists (
         select 1
         from public."Org_Master_Type" link
         join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
         where link."Org_ID" = org."Org_id"
           and lower(type."OrgType_Name") = 'customer'
       )
  ), filtered as materialized (
    select *
    from base
    where (v_search is null or concat_ws(' ', name, location, industry, owner_name, relationship_status) ilike '%' || v_search || '%')
      and (p_marketing_scope is null or p_marketing_scope = 'all'
        or (p_marketing_scope = 'opted_in' and marketing_opt_in)
        or (p_marketing_scope = 'opted_out' and not marketing_opt_in))
      and (nullif(btrim(p_relationship), '') is null or relationship_status = p_relationship)
      and (not p_unassigned or owner_id is null)
      and (p_owner_id is null or owner_id = p_owner_id)
  ), ranked as (
    select id, row_number() over (
      order by
        case when p_sort = 'account' and v_direction = 'asc' then lower(name) end asc,
        case when p_sort = 'account' and v_direction = 'desc' then lower(name) end desc,
        case when p_sort = 'relationship' and v_direction = 'asc' then lower(relationship_status) end asc,
        case when p_sort = 'relationship' and v_direction = 'desc' then lower(relationship_status) end desc,
        case when p_sort = 'owner' and v_direction = 'asc' then lower(owner_name) end asc nulls last,
        case when p_sort = 'owner' and v_direction = 'desc' then lower(owner_name) end desc nulls last,
        case when p_sort = 'last-contact' and v_direction = 'asc' then last_contact_at end asc nulls last,
        case when p_sort = 'last-contact' and v_direction = 'desc' then last_contact_at end desc nulls last,
        case when p_sort = 'contacts' and v_direction = 'asc' then contact_count end asc,
        case when p_sort = 'contacts' and v_direction = 'desc' then contact_count end desc,
        case when p_sort = 'marketing' and v_direction = 'asc' then marketing_opt_in::integer end asc,
        case when p_sort = 'marketing' and v_direction = 'desc' then marketing_opt_in::integer end desc,
        lower(name), id
    ) as ordinal
    from filtered
  ), page as (
    select id, ordinal
    from ranked
    where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by ordinal) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', coalesce((select jsonb_build_object(
      'accounts', count(*),
      'contacts', coalesce(sum(contact_count), 0),
      'needsAttention', count(*) filter (where next_action_due_at is not null and next_action_due_at <= now()),
      'marketingOptedIn', count(*) filter (where marketing_opt_in),
      'unassigned', count(*) filter (where owner_id is null),
      'healthy', count(*) filter (where health_score >= 70)
    ) from base), '{}'::jsonb),
    'facets', jsonb_build_object(
      'relationships', coalesce((select jsonb_agg(value order by value) from (select distinct relationship_status as value from base where relationship_status is not null) valueset), '[]'::jsonb),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('id', owner_id, 'name', owner_name) order by owner_name) from (select distinct owner_id, owner_name from base where owner_id is not null and owner_name is not null) ownerset), '[]'::jsonb),
      'hasUnassigned', exists(select 1 from base where owner_id is null)
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_contact_register_page(
  p_search text default null,
  p_consent_scope text default null,
  p_account_id uuid default null,
  p_channel text default null,
  p_sort text default 'contact',
  p_direction text default 'asc',
  p_limit integer default 50,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read') then
    raise exception 'You do not have permission to view CRM contacts.' using errcode = '42501';
  end if;

  with base as materialized (
    select
      contact."OrgContact_ID" as id,
      contact."Org_ID" as account_id,
      coalesce(org."Org_Name", 'Unknown account') as account_name,
      nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '') as name,
      email.address as email,
      phone.address as phone,
      profile."CRMContact_RoleCode" as role,
      profile."CRMContact_PreferredChannelCode" as preferred_channel,
      profile."CRMContact_LastContactAt" as last_contact_at,
      coalesce(contact."OrgContact_MarketingOptIn", profile."CRMContact_ConsentMarketing", false) as consent_marketing,
      profile."CRMContact_MetadataJSON" ->> 'jobTitle' as job_title,
      profile."CRMContact_MetadataJSON" ->> 'department' as department
    from public.multideck_crm_accessible_account_ids(v_context.company_id) accessible
    join public."Org_Contacts" contact on contact."Org_ID" = accessible.account_id
    join public."Org_Master" org on org."Org_id" = contact."Org_ID"
    left join public."CRM_ContactProfiles" profile on profile."CRMContact_OrgContactID" = contact."OrgContact_ID"
    left join lateral (
      select item."OrgContactEmail_Email" as address
      from public."OrgContact_Emails" item
      where item."OrgContact_ID" = contact."OrgContact_ID"
      order by item."OrgContactEmail_Type"
      limit 1
    ) email on true
    left join lateral (
      select identity."CommIdentity_Address" as address
      from public."Comm_Identities" identity
      where identity."CommIdentity_ContactID" = contact."OrgContact_ID"
        and identity."CommIdentity_ChannelCode" in ('phone', 'sms', 'whatsapp')
        and not identity."CommIdentity_IsDeleted"
      order by case identity."CommIdentity_ChannelCode" when 'phone' then 0 when 'sms' then 1 else 2 end
      limit 1
    ) phone on true
  ), filtered as materialized (
    select *
    from base
    where (v_search is null or concat_ws(' ', name, email, phone, account_name, role, job_title, department) ilike '%' || v_search || '%')
      and (p_consent_scope is null or p_consent_scope = 'all'
        or (p_consent_scope = 'opted_in' and consent_marketing)
        or (p_consent_scope = 'opted_out' and not consent_marketing))
      and (p_account_id is null or account_id = p_account_id)
      and (nullif(btrim(p_channel), '') is null or preferred_channel = p_channel)
  ), ranked as (
    select id, row_number() over (
      order by
        case when p_sort = 'contact' and v_direction = 'asc' then lower(name) end asc nulls last,
        case when p_sort = 'contact' and v_direction = 'desc' then lower(name) end desc nulls last,
        case when p_sort = 'account' and v_direction = 'asc' then lower(account_name) end asc,
        case when p_sort = 'account' and v_direction = 'desc' then lower(account_name) end desc,
        case when p_sort = 'role' and v_direction = 'asc' then lower(coalesce(job_title, role)) end asc nulls last,
        case when p_sort = 'role' and v_direction = 'desc' then lower(coalesce(job_title, role)) end desc nulls last,
        case when p_sort = 'preference' and v_direction = 'asc' then lower(preferred_channel) end asc nulls last,
        case when p_sort = 'preference' and v_direction = 'desc' then lower(preferred_channel) end desc nulls last,
        case when p_sort = 'last-contact' and v_direction = 'asc' then last_contact_at end asc nulls last,
        case when p_sort = 'last-contact' and v_direction = 'desc' then last_contact_at end desc nulls last,
        case when p_sort = 'marketing' and v_direction = 'asc' then consent_marketing::integer end asc,
        case when p_sort = 'marketing' and v_direction = 'desc' then consent_marketing::integer end desc,
        lower(coalesce(name, '')), id
    ) as ordinal
    from filtered
  ), page as (
    select id, ordinal
    from ranked
    where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by ordinal) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', coalesce((select jsonb_build_object(
      'contacts', count(*),
      'recentlyContacted', count(*) filter (where last_contact_at >= now() - interval '30 days'),
      'marketingOptedIn', count(*) filter (where consent_marketing),
      'marketingOptedOut', count(*) filter (where not consent_marketing)
    ) from base), '{}'::jsonb),
    'facets', jsonb_build_object(
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', account_id, 'name', account_name) order by account_name) from (select distinct account_id, account_name from base) accountset), '[]'::jsonb),
      'channels', coalesce((select jsonb_agg(value order by value) from (select distinct preferred_channel as value from base where preferred_channel is not null) channelset), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer) from public, anon;
revoke all on function public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer) to authenticated, service_role;
grant execute on function public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer) to authenticated, service_role;

-- Dexter exception: these are bounded forms of existing Accounts and Contacts
-- reads. The existing tenant-safe Dexter domains and event adapters remain the
-- capability surfaces; no new write or watch semantics are introduced.

commit;
