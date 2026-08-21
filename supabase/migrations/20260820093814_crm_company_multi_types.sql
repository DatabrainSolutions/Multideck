-- Companies are the single operator register. Customer, supplier and other
-- operational roles are a real many-to-many relationship on each company,
-- avoiding duplicate records and competing navigation destinations.

begin;

alter table public."Org_Addresses"
  add column if not exists "OrgAdd_IsActive" boolean not null default true;

drop function if exists public.multideck_crm_organisation_register_page(text,text,text,text,uuid,boolean,text,text,integer,integer);

create or replace function public.multideck_crm_organisation_register_page(
  p_organisation_type text default 'company',
  p_search text default null,
  p_marketing_scope text default null,
  p_relationship text default null,
  p_owner_id uuid default null,
  p_unassigned boolean default false,
  p_filter_query jsonb default null,
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
  v_organisation_type text := lower(coalesce(nullif(btrim(p_organisation_type), ''), 'company'));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_direction text := case when lower(p_direction) = 'desc' then 'desc' else 'asc' end;
  v_result jsonb;
begin
  if v_organisation_type not in ('company', 'customer', 'supplier') then
    raise exception 'Choose companies, customers or suppliers.' using errcode = '22023';
  end if;

  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read') then
    raise exception 'You do not have permission to view CRM organisations.' using errcode = '42501';
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
      concat_ws(', ', address."OrgAdd_TownCity", address."OrgAdd_Country") as location,
      jsonb_build_object(
        'any', jsonb_build_array(
          org."Org_Name", org."Org_AccCode", profile."CRMAccount_Vertical", owner_name.value,
          coalesce(profile."CRMAccount_RelationshipStatusCode", org."Org_CRMRelationshipStatusCode"),
          address_search.values, contact_search.names, contact_search.emails, organisation_types.names
        ),
        'name', org."Org_Name",
        'accountCode', org."Org_AccCode",
        'organisationTypes', organisation_types.names,
        'address', address_search.values,
        'country', address_search.countries,
        'contact', contact_search.names,
        'contactEmail', contact_search.emails,
        'owner', owner_name.value,
        'relationship', coalesce(profile."CRMAccount_RelationshipStatusCode", org."Org_CRMRelationshipStatusCode"),
        'lastContactAt', profile."CRMAccount_LastContactAt"
      ) as filter_fields
    from public.multideck_crm_accessible_account_ids(v_context.company_id) accessible
    join public."Org_Master" org on org."Org_id" = accessible.account_id
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = org."Org_id"
     and not profile."CRMAccount_IsDeleted"
    left join public."cmp_Users" owner on owner."User_ID" = profile."CRMAccount_OwnerUserID"
    left join lateral (
      select nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '') as value
    ) owner_name on true
    left join lateral (
      select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb) as names
      from public."Org_Master_Type" link
      join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
      where link."Org_ID" = org."Org_id"
    ) organisation_types on true
    left join lateral (
      select count(*)::integer as value
      from public."Org_Contacts" contact
      where contact."Org_ID" = org."Org_id"
    ) contact_count on true
    left join lateral (
      select item."OrgAdd_TownCity", item."OrgAdd_Country"
      from public."Org_Addresses" item
      where item."Org_ID" = org."Org_id"
        and item."OrgAdd_IsActive"
      limit 1
    ) address on true
    left join lateral (
      select
        coalesce(jsonb_agg(concat_ws(', ', item."OrgAdd_Line1", item."OrgAdd_Line2", item."OrgAdd_TownCity", item."OrgAdd_CountyState", item."OrgAdd_PostZipCode", item."OrgAdd_Country")), '[]'::jsonb) as values,
        coalesce(jsonb_agg(distinct item."OrgAdd_Country") filter (where item."OrgAdd_Country" is not null), '[]'::jsonb) as countries
      from public."Org_Addresses" item
      where item."Org_ID" = org."Org_id"
        and item."OrgAdd_IsActive"
    ) address_search on true
    left join lateral (
      select
        coalesce(jsonb_agg(distinct nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')) filter (where nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '') is not null), '[]'::jsonb) as names,
        coalesce(jsonb_agg(distinct email."OrgContactEmail_Email") filter (where email."OrgContactEmail_Email" is not null), '[]'::jsonb) as emails
      from public."Org_Contacts" contact
      left join public."OrgContact_Emails" email on email."OrgContact_ID" = contact."OrgContact_ID"
      where contact."Org_ID" = org."Org_id"
    ) contact_search on true
    where v_organisation_type = 'company'
       or exists (
         select 1
         from public."Org_Master_Type" link
         join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
         where link."Org_ID" = org."Org_id"
           and lower(type."OrgType_Name") = v_organisation_type
       )
       or (
         v_organisation_type = 'customer'
         and coalesce(org."Org_CRMIsPotentialCustomer", false)
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
      and (p_filter_query is null or public.multideck_register_filter_matches(filter_fields, p_filter_query))
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
    select id, ordinal from ranked
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

create or replace function public.multideck_crm_create_account(p_actor_user_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_type_ids uuid[];
  v_legacy_input jsonb;
  v_is_customer boolean;
begin
  perform public._multideck_crm_actor_company(p_actor_user_id);
  if jsonb_typeof(p_input -> 'orgTypeIds') <> 'array' then
    raise exception 'Choose at least one company type.' using errcode = '22023';
  end if;
  select array_agg(distinct value::uuid) into v_type_ids
  from jsonb_array_elements_text(p_input -> 'orgTypeIds') item(value);
  if coalesce(cardinality(v_type_ids), 0) < 1 or cardinality(v_type_ids) > 12 then
    raise exception 'Choose between 1 and 12 company types.' using errcode = '22023';
  end if;
  if (select count(*) from public."Org_Types" where "OrgType_ID" = any(v_type_ids)) <> cardinality(v_type_ids) then
    raise exception 'Choose valid company types.' using errcode = '22023';
  end if;

  v_legacy_input := jsonb_set(p_input - 'orgTypeIds', '{orgTypeId}', to_jsonb(v_type_ids[1]::text), true);
  v_result := public._multideck_crm_create_account_unscoped_20260818(p_actor_user_id, v_legacy_input);

  insert into public."Org_Master_Type"("Org_ID", "OrgType_ID")
  select (v_result ->> 'id')::uuid, type_id
  from unnest(v_type_ids) type_id
  on conflict ("OrgType_ID", "Org_ID") do nothing;

  select exists (
    select 1 from public."Org_Types" type
    where type."OrgType_ID" = any(v_type_ids)
      and lower(type."OrgType_Name") in ('customer', 'potential customer', 'key customer account')
  ) into v_is_customer;
  update public."Org_Master"
  set "Org_CRMIsPotentialCustomer" = v_is_customer,
      "Org_CRMUpdatedAt" = now()
  where "Org_id" = (v_result ->> 'id')::uuid;

  return v_result;
end;
$$;

create or replace function public.multideck_crm_update_account(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_type_ids uuid[];
  v_old_types jsonb;
  v_new_types jsonb;
  v_company_id uuid;
  v_is_customer boolean;
begin
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);
  if jsonb_typeof(p_input -> 'orgTypeIds') <> 'array' then
    raise exception 'Choose at least one company type.' using errcode = '22023';
  end if;
  select array_agg(distinct value::uuid) into v_type_ids
  from jsonb_array_elements_text(p_input -> 'orgTypeIds') item(value);
  if coalesce(cardinality(v_type_ids), 0) < 1 or cardinality(v_type_ids) > 12 then
    raise exception 'Choose between 1 and 12 company types.' using errcode = '22023';
  end if;
  if (select count(*) from public."Org_Types" where "OrgType_ID" = any(v_type_ids)) <> cardinality(v_type_ids) then
    raise exception 'Choose valid company types.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb)
  into v_old_types
  from public."Org_Master_Type" link
  join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
  where link."Org_ID" = p_account_id;

  v_result := public._multideck_crm_update_account_unscoped_20260818(p_actor_user_id, p_account_id, p_expected_version, p_input - 'orgTypeIds');

  delete from public."Org_Master_Type"
  where "Org_ID" = p_account_id and not ("OrgType_ID" = any(v_type_ids));
  insert into public."Org_Master_Type"("Org_ID", "OrgType_ID")
  select p_account_id, type_id from unnest(v_type_ids) type_id
  on conflict ("OrgType_ID", "Org_ID") do nothing;

  select exists (
    select 1 from public."Org_Types" type
    where type."OrgType_ID" = any(v_type_ids)
      and lower(type."OrgType_Name") in ('customer', 'potential customer', 'key customer account')
  ) into v_is_customer;
  update public."Org_Master"
  set "Org_CRMIsPotentialCustomer" = v_is_customer,
      "Org_CRMUpdatedAt" = now()
  where "Org_id" = p_account_id;

  select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb)
  into v_new_types
  from public."Org_Master_Type" link
  join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
  where link."Org_ID" = p_account_id;

  select profile."CRMAccount_CompanyID" into v_company_id
  from public."CRM_AccountProfiles" profile
  where profile."CRMAccount_OrgID" = p_account_id and not profile."CRMAccount_IsDeleted"
  order by profile."CRMAccount_ID" limit 1;

  if v_company_id is not null and v_new_types is distinct from v_old_types
     and not exists (
       select 1 from public."CRM_AccountProfiles" fixture
       where fixture."CRMAccount_OrgID" = p_account_id
         and not fixture."CRMAccount_IsDeleted"
         and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
     ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    )
    select v_company_id, 'customers', 'Org_Master_Type', p_account_id,
      jsonb_build_object('recordType', 'company', 'organisationTypes', v_old_types),
      jsonb_build_object('recordType', 'company', 'organisationTypes', v_new_types)
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'customers'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_IsArmed"
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = p_account_id)
    limit 1;
  end if;

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_domain_customers(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, organisation_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', organisation."Org_id",
      'recordType', 'organisation',
      'name', organisation."Org_Name",
      'organisationTypes', types.names,
      'relationshipStatus', coalesce(profile."CRMAccount_RelationshipStatusCode", organisation."Org_CRMRelationshipStatusCode"),
      'tier', profile."CRMAccount_Tier",
      'segment', profile."CRMAccount_Segment",
      'vertical', profile."CRMAccount_Vertical",
      'healthScore', profile."CRMAccount_HealthScore",
      'lastContactAt', profile."CRMAccount_LastContactAt",
      'nextActionDueAt', profile."CRMAccount_NextActionDueAt",
      'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
      'contactCount', (select count(*) from public."Org_Contacts" contact where contact."Org_ID" = organisation."Org_id"),
      'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    organisation."Org_Name" organisation_name
    from public.multideck_crm_accessible_account_ids(p_company_id) accessible
    join public."Org_Master" organisation on organisation."Org_id" = accessible.account_id
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = organisation."Org_id" and not profile."CRMAccount_IsDeleted"
    left join public."cmp_Users" owner on owner."User_ID" = profile."CRMAccount_OwnerUserID"
    left join lateral (
      select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb) names
      from public."Org_Master_Type" link
      join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
      where link."Org_ID" = organisation."Org_id"
    ) types on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', organisation."Org_Name", 'types', types.names,
        'status', coalesce(profile."CRMAccount_RelationshipStatusCode", organisation."Org_CRMRelationshipStatusCode"),
        'tier', profile."CRMAccount_Tier", 'segment', profile."CRMAccount_Segment",
        'vertical', profile."CRMAccount_Vertical",
        'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), '')
      )
    ) evidence(value)
    where public._multideck_dexter_has_permission(
      (select app_user."User_ID" from public."cmp_Users" app_user where app_user."Auth_User_ID" = auth.uid() and app_user."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, organisation."Org_Name"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) organisations;
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Name" = 'Organisations',
    "AIDexterDomain_Description" = 'Customer and supplier organisations and all of their operational roles available to the signed-in operator.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customers';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Name" = 'Organisations and contacts',
    "AIDexterWatchCapability_Description" = 'Watch organisation profiles, organisation types and their contacts for meaningful changes.',
    "AIDexterWatchCapability_FieldsJSON" = (
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      from (select distinct value from jsonb_array_elements_text(coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb) || '["organisationTypes"]'::jsonb)) fields(value)
    )
where "AIDexterWatchCapability_Code" = 'customers';

revoke all on function public.multideck_crm_organisation_register_page(text,text,text,text,uuid,boolean,jsonb,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_crm_organisation_register_page(text,text,text,text,uuid,boolean,jsonb,text,text,integer,integer) to authenticated, service_role;

revoke all on function public.multideck_crm_create_account(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_crm_create_account(uuid, jsonb) to service_role;
revoke all on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) to service_role;
revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_customers(uuid, text, integer) to service_role;

commit;
