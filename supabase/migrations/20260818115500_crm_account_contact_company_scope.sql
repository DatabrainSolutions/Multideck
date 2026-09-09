-- Make the CRM account/contact boundary explicit inside a tenant project.
-- Physical project isolation remains the primary tenant boundary, but test and
-- migration projects can contain more than one operator company. Service-role
-- CRM reads and writes must therefore never infer that every organisation row
-- belongs to the signed-in operator's company.

begin;

alter table public."CRM_AccountProfiles"
  add column if not exists "CRMAccount_CompanyID" uuid references public."cmp_Company"("Company_ID") on delete restrict;

alter table public."CRM_ContactProfiles"
  add column if not exists "CRMContact_CompanyID" uuid references public."cmp_Company"("Company_ID") on delete restrict;

-- Company-scoped RLS across the application must fail closed as soon as an
-- operator is deactivated or deleted, not only after their Auth link changes.
create or replace function public.app_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select actor."Company_ID"
  from public."cmp_Users" actor
  where actor."Auth_User_ID" = (select auth.uid())
    and coalesce(actor."User_AccessStatus", 'active') = 'active'
  limit 1
$$;

create index if not exists "IX_CRM_AccountProfiles_company_org_active"
  on public."CRM_AccountProfiles"("CRMAccount_CompanyID", "CRMAccount_OrgID")
  where not "CRMAccount_IsDeleted";

create index if not exists "IX_CRM_ContactProfiles_company_contact"
  on public."CRM_ContactProfiles"("CRMContact_CompanyID", "CRMContact_OrgContactID");

-- Prefer explicit CRM ownership for existing profiles.
update public."CRM_AccountProfiles" profile
set "CRMAccount_CompanyID" = (
  select actor."Company_ID"
  from public."cmp_Users" actor
  where actor."User_ID" in (
    profile."CRMAccount_OwnerUserID",
    profile."CRMAccount_CreatedBy",
    profile."CRMAccount_UpdatedBy"
  )
    and actor."Company_ID" is not null
  order by case actor."User_ID"
    when profile."CRMAccount_OwnerUserID" then 0
    when profile."CRMAccount_CreatedBy" then 1
    else 2
  end
  limit 1
)
where profile."CRMAccount_CompanyID" is null;

-- Where CRM ownership is absent, a customer used by exactly one operator
-- company can be assigned from canonical jobs/quotes without guessing.
with operational_company as (
  select evidence.org_id, min(evidence.company_id::text)::uuid company_id
  from (
    select job."Job_Customer" org_id, office."Company_ID" company_id
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where job."Job_Customer" is not null
    union all
    select quote."CusQuoteHeader_CustomerID", office."Company_ID"
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_CustomerID" is not null
  ) evidence
  group by evidence.org_id
  having count(distinct evidence.company_id) = 1
)
update public."CRM_AccountProfiles" profile
set "CRMAccount_CompanyID" = operational_company.company_id
from operational_company
where profile."CRMAccount_CompanyID" is null
  and profile."CRMAccount_OrgID" = operational_company.org_id;

update public."CRM_ContactProfiles" contact_profile
set "CRMContact_CompanyID" = coalesce(
  (
    select account_profile."CRMAccount_CompanyID"
    from public."Org_Contacts" contact
    join public."CRM_AccountProfiles" account_profile
      on account_profile."CRMAccount_OrgID" = contact."Org_ID"
     and not account_profile."CRMAccount_IsDeleted"
    where contact."OrgContact_ID" = contact_profile."CRMContact_OrgContactID"
      and account_profile."CRMAccount_CompanyID" is not null
    order by account_profile."CRMAccount_ID"
    limit 1
  ),
  (
    select actor."Company_ID"
    from public."cmp_Users" actor
    where actor."User_ID" in (contact_profile."CRMContact_CreatedBy", contact_profile."CRMContact_UpdatedBy")
      and actor."Company_ID" is not null
    order by case actor."User_ID" when contact_profile."CRMContact_CreatedBy" then 0 else 1 end
    limit 1
  )
)
where contact_profile."CRMContact_CompanyID" is null;

-- The linked-project preflight must leave no ambiguous rows. Once assigned,
-- company ownership is stored on the record and cannot follow a user who later
-- moves company or loses access.
alter table public."CRM_AccountProfiles"
  alter column "CRMAccount_CompanyID" set not null;

alter table public."CRM_ContactProfiles"
  alter column "CRMContact_CompanyID" set not null;

-- Preserve fixtures for development evidence without presenting them as live
-- customer records. Older automated checks created two unmarked account rows;
-- classify those deterministically instead of relying on browser filtering.
update public."CRM_AccountProfiles" profile
set "CRMAccount_MetadataJSON" = coalesce(profile."CRMAccount_MetadataJSON", '{}'::jsonb)
  || jsonb_build_object('developmentFixture', true, 'source', 'automated_qa')
from public."Org_Master" organisation
where organisation."Org_id" = profile."CRMAccount_OrgID"
  and (
    organisation."Org_Name" ilike 'Codex Account Verification %'
    or lower(btrim(organisation."Org_Name")) ~ '^test([[:space:]]+test)+$'
  );

create or replace function public._multideck_crm_actor_company(p_actor_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
begin
  select actor."Company_ID" into v_company_id
  from public."cmp_Users" actor
  where actor."User_ID" = p_actor_user_id
    and actor."Auth_User_ID" is not null
    and coalesce(actor."User_AccessStatus", 'active') = 'active';
  if v_company_id is null then
    raise exception 'The CRM operator is not linked to an active company.' using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

create or replace function public.multideck_crm_company_can_access_account(p_company_id uuid, p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_company_id is not null and p_account_id is not null and (
    exists (
      select 1
      from public."CRM_AccountProfiles" profile
      where profile."CRMAccount_OrgID" = p_account_id
        and not profile."CRMAccount_IsDeleted"
        and profile."CRMAccount_CompanyID" = p_company_id
    )
    or exists (
      select 1
      from public."Job_Header" job
      join public."cmp_Offices" office
        on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
      where office."Company_ID" = p_company_id
        and job."Job_Customer" = p_account_id
    )
    or exists (
      select 1
      from public."CusQuote_Header" quote
      join public."cmp_Offices" office
        on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      where office."Company_ID" = p_company_id
        and quote."CusQuoteHeader_CustomerID" = p_account_id
    )
  )
  and not exists (
    select 1
    from public."CRM_AccountProfiles" fixture
    where fixture."CRMAccount_OrgID" = p_account_id
      and not fixture."CRMAccount_IsDeleted"
      and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
  )
$$;

create or replace function public.multideck_crm_accessible_account_ids(p_company_id uuid)
returns table(account_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select candidate.account_id
  from (
    select profile."CRMAccount_OrgID" account_id
    from public."CRM_AccountProfiles" profile
    where not profile."CRMAccount_IsDeleted"
      and profile."CRMAccount_CompanyID" = p_company_id
    union
    select job."Job_Customer"
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    where office."Company_ID" = p_company_id and job."Job_Customer" is not null
    union
    select quote."CusQuoteHeader_CustomerID"
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where office."Company_ID" = p_company_id and quote."CusQuoteHeader_CustomerID" is not null
  ) candidate
  where candidate.account_id is not null
    and not exists (
      select 1
      from public."CRM_AccountProfiles" fixture
      where fixture."CRMAccount_OrgID" = candidate.account_id
        and not fixture."CRMAccount_IsDeleted"
        and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
    )
$$;

create or replace function public._multideck_crm_account_profile_company()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old."CRMAccount_CompanyID" is not null then
    new."CRMAccount_CompanyID" := old."CRMAccount_CompanyID";
  elsif new."CRMAccount_CompanyID" is null then
    select actor."Company_ID" into new."CRMAccount_CompanyID"
    from public."cmp_Users" actor
    where actor."User_ID" in (new."CRMAccount_OwnerUserID", new."CRMAccount_CreatedBy", new."CRMAccount_UpdatedBy")
      and actor."Company_ID" is not null
    order by case actor."User_ID"
      when new."CRMAccount_OwnerUserID" then 0
      when new."CRMAccount_CreatedBy" then 1
      else 2
    end
    limit 1;
  end if;
  if new."CRMAccount_CompanyID" is null then
    raise exception 'CRM account company ownership is required.' using errcode = '23502';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_AccountProfiles_company_scope" on public."CRM_AccountProfiles";
create trigger "TR_CRM_AccountProfiles_company_scope"
before insert or update on public."CRM_AccountProfiles"
for each row execute function public._multideck_crm_account_profile_company();

create or replace function public._multideck_crm_contact_profile_company()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old."CRMContact_CompanyID" is not null then
    new."CRMContact_CompanyID" := old."CRMContact_CompanyID";
  elsif new."CRMContact_CompanyID" is null then
    select coalesce(
      (
        select account."CRMAccount_CompanyID"
        from public."Org_Contacts" contact
        join public."CRM_AccountProfiles" account
          on account."CRMAccount_OrgID" = contact."Org_ID"
         and not account."CRMAccount_IsDeleted"
        where contact."OrgContact_ID" = new."CRMContact_OrgContactID"
          and account."CRMAccount_CompanyID" is not null
        order by account."CRMAccount_ID"
        limit 1
      ),
      (
        select actor."Company_ID"
        from public."cmp_Users" actor
        where actor."User_ID" = new."CRMContact_CreatedBy"
          and actor."Company_ID" is not null
        limit 1
      ),
      (
        select actor."Company_ID"
        from public."cmp_Users" actor
        where actor."User_ID" = new."CRMContact_UpdatedBy"
          and actor."Company_ID" is not null
        limit 1
      )
    ) into new."CRMContact_CompanyID";
  end if;
  if new."CRMContact_CompanyID" is null then
    raise exception 'CRM contact company ownership is required.' using errcode = '23502';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_ContactProfiles_company_scope" on public."CRM_ContactProfiles";
create trigger "TR_CRM_ContactProfiles_company_scope"
before insert or update on public."CRM_ContactProfiles"
for each row execute function public._multideck_crm_contact_profile_company();

-- Keep direct authenticated organisation reads aligned with the same boundary.
create or replace function public.app_user_can_access_organisation(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.multideck_crm_company_can_access_account(public.app_current_company_id(), target_organisation_id)
$$;

-- Wrap the existing transactional functions with an explicit actor/company
-- precondition. The renamed implementations remain owner-callable only.
alter function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb)
  rename to _multideck_crm_update_account_unscoped_20260818;
alter function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb)
  rename to _multideck_crm_update_contact_unscoped_20260818;
alter function public.multideck_crm_create_account(uuid, jsonb)
  rename to _multideck_crm_create_account_unscoped_20260818;
alter function public.multideck_crm_create_contact(uuid, uuid, jsonb)
  rename to _multideck_crm_create_contact_unscoped_20260818;

create or replace function public._multideck_crm_require_account_access(p_actor_user_id uuid, p_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.multideck_crm_company_can_access_account(
    public._multideck_crm_actor_company(p_actor_user_id),
    p_account_id
  ) then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.multideck_crm_update_account(
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
begin
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);
  return public._multideck_crm_update_account_unscoped_20260818(p_actor_user_id, p_account_id, p_expected_version, p_input);
end;
$$;

create function public.multideck_crm_update_contact(
  p_actor_user_id uuid,
  p_contact_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
begin
  select contact."Org_ID" into v_account_id
  from public."Org_Contacts" contact
  where contact."OrgContact_ID" = p_contact_id;
  perform public._multideck_crm_require_account_access(p_actor_user_id, v_account_id);
  return public._multideck_crm_update_contact_unscoped_20260818(p_actor_user_id, p_contact_id, p_expected_version, p_input);
end;
$$;

create function public.multideck_crm_create_account(p_actor_user_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public._multideck_crm_actor_company(p_actor_user_id);
  return public._multideck_crm_create_account_unscoped_20260818(p_actor_user_id, p_input);
end;
$$;

create function public.multideck_crm_create_contact(p_actor_user_id uuid, p_account_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);
  return public._multideck_crm_create_contact_unscoped_20260818(p_actor_user_id, p_account_id, p_input);
end;
$$;

-- Filter Dexter reads through the same company boundary. The legacy query
-- remains private so its broad joins cannot be called directly.
alter function public.multideck_dexter_domain_customers(uuid, text, integer)
  rename to _multideck_dexter_domain_customers_unscoped_20260818;
alter function public.multideck_dexter_domain_contacts(uuid, text, integer)
  rename to _multideck_dexter_domain_contacts_unscoped_20260818;

create function public.multideck_dexter_domain_customers(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from (
    select item
    from jsonb_array_elements(public._multideck_dexter_domain_customers_unscoped_20260818(p_company_id, p_search, 25)) item
    where public.multideck_crm_company_can_access_account(p_company_id, (item->>'recordId')::uuid)
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) scoped
$$;

create function public.multideck_dexter_domain_contacts(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from (
    select item
    from jsonb_array_elements(public._multideck_dexter_domain_contacts_unscoped_20260818(p_company_id, p_search, 25)) item
    where public.multideck_crm_company_can_access_account(p_company_id, (item->>'accountId')::uuid)
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) scoped
$$;

-- Profile rows now carry the company, so watch routing can be deterministic.
create or replace function public._multideck_crm_customer_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid;
  v_source uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'Org_Master' then
    v_source := new."Org_id";
    select profile."CRMAccount_CompanyID" into v_company
    from public."CRM_AccountProfiles" profile
    where profile."CRMAccount_OrgID" = new."Org_id"
      and not profile."CRMAccount_IsDeleted"
    order by profile."CRMAccount_ID"
    limit 1;
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'name', old."Org_Name", 'relationshipStatus', old."Org_CRMRelationshipStatusCode");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'name', new."Org_Name", 'relationshipStatus', new."Org_CRMRelationshipStatusCode");
  elsif tg_table_name = 'CRM_AccountProfiles' then
    v_company := new."CRMAccount_CompanyID";
    v_source := new."CRMAccount_OrgID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'relationshipStatus', old."CRMAccount_RelationshipStatusCode", 'tier', old."CRMAccount_Tier", 'segment', old."CRMAccount_Segment", 'healthScore', old."CRMAccount_HealthScore", 'churnRiskScore', old."CRMAccount_ChurnRiskScore", 'lastContactAt', old."CRMAccount_LastContactAt", 'nextActionDueAt', old."CRMAccount_NextActionDueAt");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'relationshipStatus', new."CRMAccount_RelationshipStatusCode", 'tier', new."CRMAccount_Tier", 'segment', new."CRMAccount_Segment", 'healthScore', new."CRMAccount_HealthScore", 'churnRiskScore', new."CRMAccount_ChurnRiskScore", 'lastContactAt', new."CRMAccount_LastContactAt", 'nextActionDueAt', new."CRMAccount_NextActionDueAt");
  elsif tg_table_name = 'Org_Contacts' then
    v_source := new."OrgContact_ID";
    select profile."CRMContact_CompanyID" into v_company
    from public."CRM_ContactProfiles" profile
    where profile."CRMContact_OrgContactID" = new."OrgContact_ID"
    order by profile."CRMContact_ID"
    limit 1;
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', old."OrgContact_FirstName", old."OrgContact_LastName")), ''));
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', new."OrgContact_FirstName", new."OrgContact_LastName")), ''));
  elsif tg_table_name = 'CRM_ContactProfiles' then
    v_company := new."CRMContact_CompanyID";
    v_source := new."CRMContact_OrgContactID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'role', old."CRMContact_RoleCode", 'influenceLevel', old."CRMContact_InfluenceLevel", 'relationshipStrength', old."CRMContact_RelationshipStrength", 'preferredChannel', old."CRMContact_PreferredChannelCode", 'salesContactAllowed', old."CRMContact_ConsentSalesContact", 'lastContactAt', old."CRMContact_LastContactAt");
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'role', new."CRMContact_RoleCode", 'influenceLevel', new."CRMContact_InfluenceLevel", 'relationshipStrength', new."CRMContact_RelationshipStrength", 'preferredChannel', new."CRMContact_PreferredChannelCode", 'salesContactAllowed', new."CRMContact_ConsentSalesContact", 'lastContactAt', new."CRMContact_LastContactAt");
  else
    return new;
  end if;

  if (
    tg_table_name in ('Org_Master', 'CRM_AccountProfiles')
    and exists (
      select 1 from public."CRM_AccountProfiles" fixture
      where fixture."CRMAccount_OrgID" = v_source
        and not fixture."CRMAccount_IsDeleted"
        and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
    )
  ) or (
    tg_table_name in ('Org_Contacts', 'CRM_ContactProfiles')
    and exists (
      select 1 from public."CRM_ContactProfiles" fixture
      where fixture."CRMContact_OrgContactID" = v_source
        and lower(coalesce(fixture."CRMContact_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
    )
  ) then
    return new;
  end if;

  if v_company is not null and v_source is not null and v_new is distinct from v_old then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    )
    select distinct v_company, 'customers', tg_table_name, v_source, v_old, v_new
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company
      and watch."AIDexterWatch_CapabilityCode" = 'customers'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_IsArmed"
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_Org_Master_crm_customer_watch" on public."Org_Master";
create trigger "TR_Org_Master_crm_customer_watch"
after insert or update of "Org_Name", "Org_CRMRelationshipStatusCode" on public."Org_Master"
for each row execute function public._multideck_crm_customer_watch_signal();

drop trigger if exists "TR_Org_Contacts_crm_customer_watch" on public."Org_Contacts";
create trigger "TR_Org_Contacts_crm_customer_watch"
after insert or update of "OrgContact_FirstName", "OrgContact_LastName" on public."Org_Contacts"
for each row execute function public._multideck_crm_customer_watch_signal();

revoke all on function public._multideck_crm_actor_company(uuid) from public, anon, authenticated;
revoke all on function public.multideck_crm_company_can_access_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.multideck_crm_accessible_account_ids(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_account_profile_company() from public, anon, authenticated;
revoke all on function public._multideck_crm_contact_profile_company() from public, anon, authenticated;
revoke all on function public._multideck_crm_require_account_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_update_account_unscoped_20260818(uuid, uuid, bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._multideck_crm_update_contact_unscoped_20260818(uuid, uuid, bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._multideck_crm_create_account_unscoped_20260818(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._multideck_crm_create_contact_unscoped_20260818(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_account(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_contact(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_dexter_domain_customers_unscoped_20260818(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public._multideck_dexter_domain_contacts_unscoped_20260818(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_contacts(uuid, text, integer) from public, anon, authenticated;
revoke all on function public._multideck_crm_customer_watch_signal() from public, anon, authenticated;

grant execute on function public.multideck_crm_accessible_account_ids(uuid) to service_role;
grant execute on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_create_account(uuid, jsonb) to service_role;
grant execute on function public.multideck_crm_create_contact(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_customers(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_domain_contacts(uuid, text, integer) to service_role;

commit;
