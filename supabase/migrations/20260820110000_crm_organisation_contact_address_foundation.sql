-- Organisation master foundation: stable account scope and codes, multi-office
-- ownership, durable contact/email history, contextual addresses and deterministic
-- related-party defaults. All browser writes continue through allowlisted Edge
-- operations; these tables are not a new direct client data surface.

begin;

alter table public."CRM_AccountProfiles"
  add column if not exists "CRMAccount_ScopeCode" character varying(20) not null default 'standard';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'CRM_AccountProfiles_scope_check') then
    alter table public."CRM_AccountProfiles"
      add constraint "CRM_AccountProfiles_scope_check"
      check ("CRMAccount_ScopeCode" in ('standard', 'national', 'global'));
  end if;
end;
$$;

create unique index if not exists "UX_Org_Master_AccCode_normalized"
  on public."Org_Master" (lower(btrim("Org_AccCode")));

create table if not exists public."CRM_AccountOfficeAssignments" (
  "CRMAccountOffice_ID" uuid primary key default gen_random_uuid(),
  "CRMAccountOffice_AccountID" uuid not null references public."CRM_AccountProfiles"("CRMAccount_ID") on delete cascade,
  "CRMAccountOffice_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMAccountOffice_OrgOfficeID" uuid not null references public."cmp_Offices"("Office_ID") on delete restrict,
  "CRMAccountOffice_IsPrimary" boolean not null default false,
  "CRMAccountOffice_CreatedAt" timestamptz not null default now(),
  "CRMAccountOffice_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  unique ("CRMAccountOffice_AccountID", "CRMAccountOffice_OrgOfficeID")
);

create unique index if not exists "UX_CRM_AccountOfficeAssignments_primary"
  on public."CRM_AccountOfficeAssignments" ("CRMAccountOffice_AccountID")
  where "CRMAccountOffice_IsPrimary";
create index if not exists "IX_CRM_AccountOfficeAssignments_company_office"
  on public."CRM_AccountOfficeAssignments" ("CRMAccountOffice_CompanyID", "CRMAccountOffice_OrgOfficeID");

insert into public."CRM_AccountOfficeAssignments"(
  "CRMAccountOffice_AccountID", "CRMAccountOffice_CompanyID", "CRMAccountOffice_OrgOfficeID", "CRMAccountOffice_IsPrimary"
)
select profile."CRMAccount_ID", profile."CRMAccount_CompanyID", profile."CRMAccount_OrgOfficeID", true
from public."CRM_AccountProfiles" profile
join public."cmp_Offices" office
  on office."Office_ID" = profile."CRMAccount_OrgOfficeID"
 and office."Company_ID" = profile."CRMAccount_CompanyID"
where not profile."CRMAccount_IsDeleted"
  and profile."CRMAccount_OrgOfficeID" is not null
on conflict ("CRMAccountOffice_AccountID", "CRMAccountOffice_OrgOfficeID") do update
set "CRMAccountOffice_IsPrimary" = true;

create table if not exists public."CRM_ContactOrganisationAssignments" (
  "CRMContactOrg_ID" uuid primary key default gen_random_uuid(),
  "CRMContactOrg_ContactID" uuid not null references public."Org_Contacts"("OrgContact_ID") on delete cascade,
  "CRMContactOrg_OrgID" uuid not null references public."Org_Master"("Org_id") on delete restrict,
  "CRMContactOrg_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMContactOrg_JobTitle" character varying(160),
  "CRMContactOrg_Department" character varying(160),
  "CRMContactOrg_RoleCode" character varying(120),
  "CRMContactOrg_StartedAt" date not null default current_date,
  "CRMContactOrg_EndedAt" date,
  "CRMContactOrg_IsCurrent" boolean not null default true,
  "CRMContactOrg_CreatedAt" timestamptz not null default now(),
  "CRMContactOrg_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CRM_ContactOrganisationAssignments_dates_check" check ("CRMContactOrg_EndedAt" is null or "CRMContactOrg_EndedAt" >= "CRMContactOrg_StartedAt"),
  constraint "CRM_ContactOrganisationAssignments_current_check" check (
    ("CRMContactOrg_IsCurrent" and "CRMContactOrg_EndedAt" is null)
    or (not "CRMContactOrg_IsCurrent" and "CRMContactOrg_EndedAt" is not null)
  )
);

create unique index if not exists "UX_CRM_ContactOrganisationAssignments_current"
  on public."CRM_ContactOrganisationAssignments" ("CRMContactOrg_ContactID")
  where "CRMContactOrg_IsCurrent";
create index if not exists "IX_CRM_ContactOrganisationAssignments_org_history"
  on public."CRM_ContactOrganisationAssignments" ("CRMContactOrg_OrgID", "CRMContactOrg_StartedAt" desc);

insert into public."CRM_ContactOrganisationAssignments"(
  "CRMContactOrg_ContactID", "CRMContactOrg_OrgID", "CRMContactOrg_CompanyID",
  "CRMContactOrg_JobTitle", "CRMContactOrg_Department", "CRMContactOrg_RoleCode",
  "CRMContactOrg_StartedAt", "CRMContactOrg_IsCurrent"
)
select
  contact."OrgContact_ID", contact."Org_ID", account."CRMAccount_CompanyID",
  nullif(profile."CRMContact_MetadataJSON" ->> 'jobTitle', ''),
  nullif(profile."CRMContact_MetadataJSON" ->> 'department', ''),
  profile."CRMContact_RoleCode",
  coalesce(profile."CRMContact_CreatedAt"::date, current_date), true
from public."Org_Contacts" contact
join public."CRM_AccountProfiles" account
  on account."CRMAccount_OrgID" = contact."Org_ID" and not account."CRMAccount_IsDeleted"
left join lateral (
  select item.*
  from public."CRM_ContactProfiles" item
  where item."CRMContact_OrgContactID" = contact."OrgContact_ID"
  order by item."CRMContact_CreatedAt", item."CRMContact_ID"
  limit 1
) profile on true
where not exists (
  select 1 from public."CRM_ContactOrganisationAssignments" assignment
  where assignment."CRMContactOrg_ContactID" = contact."OrgContact_ID"
    and assignment."CRMContactOrg_IsCurrent"
);

alter table public."OrgContact_Emails"
  add column if not exists "OrgContactEmail_IsActive" boolean not null default true,
  add column if not exists "OrgContactEmail_IsPrimary" boolean not null default false,
  add column if not exists "OrgContactEmail_ValidFrom" timestamptz not null default now(),
  add column if not exists "OrgContactEmail_ValidTo" timestamptz,
  add column if not exists "OrgContactEmail_SupersededBy" uuid;

with ranked as (
  select "OrgContactEmail_ID",
    row_number() over (partition by "OrgContact_ID" order by "OrgContactEmail_Type", "OrgContactEmail_ID") as ordinal
  from public."OrgContact_Emails"
  where "OrgContactEmail_IsActive"
)
update public."OrgContact_Emails" email
set "OrgContactEmail_IsPrimary" = ranked.ordinal = 1
from ranked
where ranked."OrgContactEmail_ID" = email."OrgContactEmail_ID";

create unique index if not exists "UX_OrgContact_Emails_active_normalized"
  on public."OrgContact_Emails" (lower(btrim("OrgContactEmail_Email")))
  where "OrgContactEmail_IsActive";
create unique index if not exists "UX_OrgContact_Emails_primary"
  on public."OrgContact_Emails" ("OrgContact_ID")
  where "OrgContactEmail_IsActive" and "OrgContactEmail_IsPrimary";
create index if not exists "IX_OrgContact_Emails_history"
  on public."OrgContact_Emails" ("OrgContact_ID", "OrgContactEmail_ValidFrom" desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'OrgContact_Emails_validity_check') then
    alter table public."OrgContact_Emails"
      add constraint "OrgContact_Emails_validity_check"
      check (("OrgContactEmail_IsActive" and "OrgContactEmail_ValidTo" is null) or (not "OrgContactEmail_IsActive"));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'OrgContact_Emails_superseded_fkey') then
    alter table public."OrgContact_Emails"
      add constraint "OrgContact_Emails_superseded_fkey"
      foreign key ("OrgContactEmail_SupersededBy") references public."OrgContact_Emails"("OrgContactEmail_ID") on delete set null;
  end if;
end;
$$;

alter table public."Org_Addresses"
  add column if not exists "OrgAdd_TimeZone" character varying(80) not null default 'UTC',
  add column if not exists "OrgAdd_IsActive" boolean not null default true,
  add column if not exists "OrgAdd_UpdatedAt" timestamptz not null default now(),
  add column if not exists "OrgAdd_UpdatedBy" uuid;

alter table public."sys_AddressTypes"
  add column if not exists "sys_AddressType_Code" character varying(40),
  add column if not exists "sys_AddressType_IsActive" boolean not null default true,
  add column if not exists "sys_AddressType_SortOrder" integer not null default 100;

update public."sys_AddressTypes"
set "sys_AddressType_Code" = case
  when lower(coalesce("sys_AddressType_Description", '')) like '%pickup%' then 'pickup'
  when lower(coalesce("sys_AddressType_Description", '')) like '%delivery%' then 'delivery'
  when lower(coalesce("sys_AddressType_Description", '')) like '%postal%' then 'postal'
  when lower(coalesce("sys_AddressType_Description", '')) like '%billing%' then 'billing'
  when lower(coalesce("sys_AddressType_Description", '')) like '%office%' then 'office'
  when lower(coalesce("sys_AddressType_Description", '')) like '%main%' then 'main'
  else 'legacy-' || "sys_AddressType_ID"::text
end
where "sys_AddressType_Code" is null;

alter table public."sys_AddressTypes" alter column "sys_AddressType_Code" set not null;
create unique index if not exists "UX_sys_AddressTypes_code"
  on public."sys_AddressTypes" ("sys_AddressType_Code");

insert into public."sys_AddressTypes"(
  "sys_AddressType_Code", "sys_AddressType_Description", "sys_AddressType_SortOrder"
)
values
  ('main', 'Main address', 10),
  ('office', 'Office', 20),
  ('postal', 'Postal', 30),
  ('pickup', 'Pickup', 40),
  ('delivery', 'Delivery', 50),
  ('billing', 'Billing', 60)
on conflict ("sys_AddressType_Code") do update
set "sys_AddressType_Description" = excluded."sys_AddressType_Description",
    "sys_AddressType_IsActive" = true,
    "sys_AddressType_SortOrder" = excluded."sys_AddressType_SortOrder";

alter table public."Org_AddressTypes"
  add column if not exists "OrgAddType_OrgID" uuid;

update public."Org_AddressTypes" link
set "OrgAddType_OrgID" = address."Org_ID"
from public."Org_Addresses" address
where address."OrgAdd_ID" = link."OrgAdd_ID"
  and link."OrgAddType_OrgID" is null;

do $$
begin
  if exists (select 1 from public."Org_AddressTypes" where "OrgAddType_OrgID" is null) then
    raise exception 'Address capability rows must reference an existing organisation address.';
  end if;
end;
$$;

alter table public."Org_AddressTypes" alter column "OrgAddType_OrgID" set not null;
create unique index if not exists "UX_Org_Addresses_id_org"
  on public."Org_Addresses" ("OrgAdd_ID", "Org_ID");
create unique index if not exists "UX_Org_AddressTypes_default_capability"
  on public."Org_AddressTypes" ("OrgAddType_OrgID", "OrgAddType_Type")
  where "OrgAddType_IsDefault";
create index if not exists "IX_Org_AddressTypes_org_capability"
  on public."Org_AddressTypes" ("OrgAddType_OrgID", "OrgAddType_Type", "OrgAdd_ID");

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Org_AddressTypes_address_org_fkey') then
    alter table public."Org_AddressTypes"
      add constraint "Org_AddressTypes_address_org_fkey"
      foreign key ("OrgAdd_ID", "OrgAddType_OrgID") references public."Org_Addresses"("OrgAdd_ID", "Org_ID") on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'Org_AddressTypes_type_fkey') then
    alter table public."Org_AddressTypes"
      add constraint "Org_AddressTypes_type_fkey"
      foreign key ("OrgAddType_Type") references public."sys_AddressTypes"("sys_AddressType_ID") on delete restrict;
  end if;
end;
$$;

insert into public."Org_AddressTypes"("OrgAdd_ID", "OrgAddType_Type", "OrgAddType_IsDefault", "OrgAddType_OrgID")
select address."OrgAdd_ID", type."sys_AddressType_ID", true, address."Org_ID"
from (
  select distinct on (item."Org_ID") item.*
  from public."Org_Addresses" item
  where item."OrgAdd_IsActive"
  order by item."Org_ID", item."OrgAdd_ID"
) address
cross join lateral (
  select "sys_AddressType_ID" from public."sys_AddressTypes"
  where "sys_AddressType_Code" = 'main' limit 1
) type
where not exists (
  select 1 from public."Org_AddressTypes" existing
  where existing."OrgAddType_OrgID" = address."Org_ID"
    and existing."OrgAddType_Type" = type."sys_AddressType_ID"
)
on conflict ("OrgAdd_ID", "OrgAddType_Type") do nothing;

create table if not exists public."Org_AddressOpeningHours" (
  "OrgAddHours_ID" uuid primary key default gen_random_uuid(),
  "OrgAddHours_OrgAddID" uuid not null references public."Org_Addresses"("OrgAdd_ID") on delete cascade,
  "OrgAddHours_DayOfWeek" smallint not null,
  "OrgAddHours_OpensAt" time not null,
  "OrgAddHours_ClosesAt" time not null,
  "OrgAddHours_SortOrder" integer not null default 0,
  constraint "Org_AddressOpeningHours_day_check" check ("OrgAddHours_DayOfWeek" between 0 and 6),
  constraint "Org_AddressOpeningHours_interval_check" check ("OrgAddHours_OpensAt" < "OrgAddHours_ClosesAt"),
  unique ("OrgAddHours_OrgAddID", "OrgAddHours_DayOfWeek", "OrgAddHours_OpensAt", "OrgAddHours_ClosesAt")
);

create index if not exists "IX_Org_AddressOpeningHours_lookup"
  on public."Org_AddressOpeningHours" ("OrgAddHours_OrgAddID", "OrgAddHours_DayOfWeek", "OrgAddHours_OpensAt");

create table if not exists public."Org_AddressOpeningOverrides" (
  "OrgAddOverride_ID" uuid primary key default gen_random_uuid(),
  "OrgAddOverride_OrgAddID" uuid not null references public."Org_Addresses"("OrgAdd_ID") on delete cascade,
  "OrgAddOverride_Date" date not null,
  "OrgAddOverride_IsClosed" boolean not null default false,
  "OrgAddOverride_OpensAt" time,
  "OrgAddOverride_ClosesAt" time,
  "OrgAddOverride_Note" character varying(240),
  constraint "Org_AddressOpeningOverrides_interval_check" check (
    ("OrgAddOverride_IsClosed" and "OrgAddOverride_OpensAt" is null and "OrgAddOverride_ClosesAt" is null)
    or (not "OrgAddOverride_IsClosed" and "OrgAddOverride_OpensAt" is not null and "OrgAddOverride_ClosesAt" is not null and "OrgAddOverride_OpensAt" < "OrgAddOverride_ClosesAt")
  )
);

create unique index if not exists "UX_Org_AddressOpeningOverrides_closed_day"
  on public."Org_AddressOpeningOverrides" ("OrgAddOverride_OrgAddID", "OrgAddOverride_Date")
  where "OrgAddOverride_IsClosed";
create unique index if not exists "UX_Org_AddressOpeningOverrides_interval"
  on public."Org_AddressOpeningOverrides" ("OrgAddOverride_OrgAddID", "OrgAddOverride_Date", "OrgAddOverride_OpensAt", "OrgAddOverride_ClosesAt")
  where not "OrgAddOverride_IsClosed";

create table if not exists public."Org_RelatedPartyDefaults" (
  "OrgRelatedDefault_ID" uuid primary key default gen_random_uuid(),
  "OrgRelatedDefault_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "OrgRelatedDefault_SourceOrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "OrgRelatedDefault_PartyRoleCode" character varying(60) not null,
  "OrgRelatedDefault_DestinationCountryCode" character varying(2),
  "OrgRelatedDefault_DestinationUNLOCODE" character varying(5),
  "OrgRelatedDefault_DestinationPostcode" character varying(40),
  "OrgRelatedDefault_TargetOrgID" uuid not null references public."Org_Master"("Org_id") on delete restrict,
  "OrgRelatedDefault_TargetAddressID" uuid references public."Org_Addresses"("OrgAdd_ID") on delete set null,
  "OrgRelatedDefault_TargetContactID" uuid references public."Org_Contacts"("OrgContact_ID") on delete set null,
  "OrgRelatedDefault_Priority" integer not null default 100,
  "OrgRelatedDefault_EffectiveFrom" date not null default current_date,
  "OrgRelatedDefault_EffectiveTo" date,
  "OrgRelatedDefault_IsActive" boolean not null default true,
  "OrgRelatedDefault_CreatedAt" timestamptz not null default now(),
  "OrgRelatedDefault_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "OrgRelatedDefault_UpdatedAt" timestamptz not null default now(),
  "OrgRelatedDefault_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "Org_RelatedPartyDefaults_country_check" check ("OrgRelatedDefault_DestinationCountryCode" is null or "OrgRelatedDefault_DestinationCountryCode" ~ '^[A-Z]{2}$'),
  constraint "Org_RelatedPartyDefaults_dates_check" check ("OrgRelatedDefault_EffectiveTo" is null or "OrgRelatedDefault_EffectiveTo" >= "OrgRelatedDefault_EffectiveFrom")
);

create index if not exists "IX_Org_RelatedPartyDefaults_resolution"
  on public."Org_RelatedPartyDefaults" (
    "OrgRelatedDefault_CompanyID", "OrgRelatedDefault_SourceOrgID", "OrgRelatedDefault_PartyRoleCode",
    "OrgRelatedDefault_IsActive", "OrgRelatedDefault_Priority"
  );

alter table public."CRM_AccountOfficeAssignments" enable row level security;
alter table public."CRM_ContactOrganisationAssignments" enable row level security;
alter table public."Org_Addresses" enable row level security;
alter table public."Org_AddressTypes" enable row level security;
alter table public."Org_AddressOpeningHours" enable row level security;
alter table public."Org_AddressOpeningOverrides" enable row level security;
alter table public."Org_RelatedPartyDefaults" enable row level security;

revoke all on table public."CRM_AccountOfficeAssignments" from public, anon, authenticated;
revoke all on table public."CRM_ContactOrganisationAssignments" from public, anon, authenticated;
revoke all on table public."Org_Addresses" from public, anon, authenticated;
revoke all on table public."Org_AddressTypes" from public, anon, authenticated;
revoke all on table public."Org_AddressOpeningHours" from public, anon, authenticated;
revoke all on table public."Org_AddressOpeningOverrides" from public, anon, authenticated;
revoke all on table public."Org_RelatedPartyDefaults" from public, anon, authenticated;
grant select, insert, update, delete on table public."CRM_AccountOfficeAssignments" to service_role;
grant select, insert, update, delete on table public."CRM_ContactOrganisationAssignments" to service_role;
grant select, insert, update, delete on table public."Org_Addresses" to service_role;
grant select, insert, update, delete on table public."Org_AddressTypes" to service_role;
grant select, insert, update, delete on table public."Org_AddressOpeningHours" to service_role;
grant select, insert, update, delete on table public."Org_AddressOpeningOverrides" to service_role;
grant select, insert, update, delete on table public."Org_RelatedPartyDefaults" to service_role;

select public."Audit_EnableTableAudit"('public', 'CRM_AccountOfficeAssignments', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMAccountOffice_AccountID', 'CRMAccountOffice_OrgOfficeID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'CRM_ContactOrganisationAssignments', 'crm_contact', 'all_changes', 'standard_7y', 'confidential', false, array['CRMContactOrg_ContactID', 'CRMContactOrg_OrgID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'Org_Addresses', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['OrgAdd_ID', 'Org_ID'], null, null, array['OrgAdd_MainEmail', 'OrgAdd_MainPhone']);
select public."Audit_EnableTableAudit"('public', 'Org_AddressTypes', 'crm_account', 'all_changes', 'standard_7y', 'normal', false, array['OrgAdd_ID', 'OrgAddType_Type'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'Org_AddressOpeningHours', 'crm_account', 'all_changes', 'standard_7y', 'normal', false, array['OrgAddHours_ID', 'OrgAddHours_OrgAddID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'Org_AddressOpeningOverrides', 'crm_account', 'all_changes', 'standard_7y', 'normal', false, array['OrgAddOverride_ID', 'OrgAddOverride_OrgAddID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'Org_RelatedPartyDefaults', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['OrgRelatedDefault_ID', 'OrgRelatedDefault_SourceOrgID'], null, null, null);

create or replace function public._multideck_crm_account_code(p_value text, p_scope text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_base text;
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), 'standard'));
  v_suffix text := case when v_scope = 'national' then '-NAT' when v_scope = 'global' then '-GLB' else '' end;
begin
  if v_scope not in ('standard', 'national', 'global') then
    raise exception 'Choose a standard, national or global organisation scope.' using errcode = '22023';
  end if;
  v_base := regexp_replace(upper(coalesce(btrim(p_value), '')), '-(NAT|GLB)$', '');
  v_base := trim(both '-' from regexp_replace(v_base, '[^A-Z0-9]+', '-', 'g'));
  v_base := left(v_base, 20 - length(v_suffix));
  if length(v_base) < 2 then
    raise exception 'Enter an organisation code with at least two letters or numbers.' using errcode = '22023';
  end if;
  return v_base || v_suffix;
end;
$$;

create or replace function public.multideck_crm_update_organisation_foundation(
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
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_org public."Org_Master"%rowtype;
  v_scope text;
  v_code text;
  v_is_potential boolean;
  v_offices jsonb;
  v_office jsonb;
  v_office_ids uuid[] := '{}'::uuid[];
  v_primary_count integer := 0;
  v_primary_office uuid;
  v_next_version bigint;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);

  select * into v_profile
  from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_account_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Organisation not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_profile."CRMAccount_EditVersion" then
    raise exception 'CRM_CONFLICT:This organisation changed since it was loaded.' using errcode = 'P0001';
  end if;
  select * into v_org from public."Org_Master" where "Org_id" = p_account_id for update;

  v_scope := lower(coalesce(nullif(btrim(p_input ->> 'scopeCode'), ''), v_profile."CRMAccount_ScopeCode", 'standard'));
  v_code := public._multideck_crm_account_code(coalesce(nullif(btrim(p_input ->> 'accountCode'), ''), v_org."Org_AccCode"), v_scope);
  v_is_potential := case when p_input ? 'isPotential' then coalesce((p_input ->> 'isPotential')::boolean, false) else v_org."Org_CRMIsPotentialCustomer" end;

  if p_input ? 'officeAssignments' then
    if jsonb_typeof(p_input -> 'officeAssignments') <> 'array' or jsonb_array_length(p_input -> 'officeAssignments') > 20 then
      raise exception 'Choose no more than 20 responsible offices.' using errcode = '22023';
    end if;
    v_offices := p_input -> 'officeAssignments';
    for v_office in select value from jsonb_array_elements(v_offices) loop
      if nullif(btrim(v_office ->> 'officeId'), '') is null then
        raise exception 'Choose valid responsible offices.' using errcode = '22023';
      end if;
      if (v_office ->> 'officeId')::uuid = any(v_office_ids) then
        raise exception 'Each responsible office can only be assigned once.' using errcode = '22023';
      end if;
      v_office_ids := array_append(v_office_ids, (v_office ->> 'officeId')::uuid);
      if coalesce((v_office ->> 'isPrimary')::boolean, false) then
        v_primary_count := v_primary_count + 1;
        v_primary_office := (v_office ->> 'officeId')::uuid;
      end if;
    end loop;
    if not v_is_potential and (cardinality(v_office_ids) < 1 or v_primary_count <> 1) then
      raise exception 'Active organisations need at least one responsible office and exactly one primary office.' using errcode = '22023';
    end if;
    if v_primary_count > 1 then
      raise exception 'Choose one primary responsible office.' using errcode = '22023';
    end if;
    if cardinality(v_office_ids) > 0 and (
      select count(*) from public."cmp_Offices" office
      where office."Office_ID" = any(v_office_ids)
        and office."Company_ID" = v_profile."CRMAccount_CompanyID"
        and office."Office_IsActive"
    ) <> cardinality(v_office_ids) then
      raise exception 'Choose active offices from this company.' using errcode = '22023';
    end if;
  end if;

  if p_input ? 'isPotential' and not v_is_potential and v_org."Org_CRMIsPotentialCustomer" then
    if not exists (
      select 1 from public."Org_AddressTypes" link
      join public."sys_AddressTypes" type on type."sys_AddressType_ID" = link."OrgAddType_Type"
      join public."Org_Addresses" address on address."OrgAdd_ID" = link."OrgAdd_ID" and address."OrgAdd_IsActive"
      where link."OrgAddType_OrgID" = p_account_id and type."sys_AddressType_Code" = 'main' and link."OrgAddType_IsDefault"
    ) then
      raise exception 'Add a main address before making this an active organisation.' using errcode = '22023';
    end if;
    if not (
      (p_input ? 'officeAssignments' and v_primary_count = 1)
      or (not (p_input ? 'officeAssignments') and exists (
        select 1 from public."CRM_AccountOfficeAssignments" assignment
        where assignment."CRMAccountOffice_AccountID" = v_profile."CRMAccount_ID"
          and assignment."CRMAccountOffice_IsPrimary"
      ))
    ) then
      raise exception 'Choose a primary responsible office before making this an active organisation.' using errcode = '22023';
    end if;
  end if;

  v_next_version := v_profile."CRMAccount_EditVersion" + 1;
  update public."Org_Master"
  set "Org_AccCode" = v_code,
      "Org_CRMIsPotentialCustomer" = v_is_potential,
      "Org_CRMUpdatedAt" = now()
  where "Org_id" = p_account_id;
  update public."CRM_AccountProfiles"
  set "CRMAccount_ScopeCode" = v_scope,
      "CRMAccount_UpdatedAt" = now(),
      "CRMAccount_UpdatedBy" = p_actor_user_id,
      "CRMAccount_EditVersion" = v_next_version
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";

  if p_input ? 'officeAssignments' then
    delete from public."CRM_AccountOfficeAssignments"
    where "CRMAccountOffice_AccountID" = v_profile."CRMAccount_ID";
    for v_office in select value from jsonb_array_elements(v_offices) loop
      insert into public."CRM_AccountOfficeAssignments"(
        "CRMAccountOffice_AccountID", "CRMAccountOffice_CompanyID", "CRMAccountOffice_OrgOfficeID",
        "CRMAccountOffice_IsPrimary", "CRMAccountOffice_CreatedBy"
      ) values (
        v_profile."CRMAccount_ID", v_profile."CRMAccount_CompanyID", (v_office ->> 'officeId')::uuid,
        coalesce((v_office ->> 'isPrimary')::boolean, false), p_actor_user_id
      );
    end loop;
    update public."CRM_AccountProfiles"
    set "CRMAccount_OrgOfficeID" = v_primary_office
    where "CRMAccount_ID" = v_profile."CRMAccount_ID";
  end if;

  return jsonb_build_object(
    'id', p_account_id, 'editVersion', v_next_version, 'accountCode', v_code,
    'scopeCode', v_scope, 'isPotential', v_is_potential
  );
exception when unique_violation then
  raise exception 'That organisation code is already in use.' using errcode = '23505';
end;
$$;

create or replace function public.multideck_crm_update_contact(
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
  v_contact public."Org_Contacts"%rowtype;
  v_result jsonb;
  v_email text;
  v_current public."OrgContact_Emails"%rowtype;
  v_new_id uuid;
  v_now timestamptz := now();
begin
  select * into v_contact from public."Org_Contacts" where "OrgContact_ID" = p_contact_id;
  if not found then raise exception 'Contact not found.' using errcode = 'P0002'; end if;
  perform public._multideck_crm_require_account_access(p_actor_user_id, v_contact."Org_ID");

  v_result := public._multideck_crm_update_contact_unscoped_20260818(
    p_actor_user_id, p_contact_id, p_expected_version, p_input - 'email'
  );
  if not (p_input ? 'email') then return v_result; end if;

  v_email := lower(nullif(btrim(p_input ->> 'email'), ''));
  select * into v_current
  from public."OrgContact_Emails"
  where "OrgContact_ID" = p_contact_id
    and "OrgContactEmail_IsActive"
  order by "OrgContactEmail_IsPrimary" desc, "OrgContactEmail_ValidFrom" desc, "OrgContactEmail_ID"
  limit 1 for update;

  if found and lower(btrim(v_current."OrgContactEmail_Email")) is not distinct from v_email then
    update public."OrgContact_Emails"
    set "OrgContactEmail_IsPrimary" = true
    where "OrgContactEmail_ID" = v_current."OrgContactEmail_ID"
      and not "OrgContactEmail_IsPrimary";
    return v_result;
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
    if exists (
      select 1 from public."OrgContact_Emails" email
      where lower(btrim(email."OrgContactEmail_Email")) = v_email
        and email."OrgContactEmail_IsActive"
        and email."OrgContact_ID" <> p_contact_id
    ) then
      raise exception 'This email is already connected to a contact.' using errcode = '23505';
    end if;
  end if;

  if v_current."OrgContactEmail_ID" is not null then
    update public."OrgContact_Emails"
    set "OrgContactEmail_IsActive" = false,
        "OrgContactEmail_IsPrimary" = false,
        "OrgContactEmail_ValidTo" = v_now
    where "OrgContactEmail_ID" = v_current."OrgContactEmail_ID";
  end if;
  if v_email is not null then
    v_new_id := gen_random_uuid();
    insert into public."OrgContact_Emails"(
      "OrgContactEmail_ID", "OrgContact_ID", "OrgContactEmail_Email", "OrgContactEmail_Type",
      "OrgContactEmail_IsActive", "OrgContactEmail_IsPrimary", "OrgContactEmail_ValidFrom"
    ) values (v_new_id, p_contact_id, v_email, 1, true, true, v_now);
    if v_current."OrgContactEmail_ID" is not null then
      update public."OrgContact_Emails"
      set "OrgContactEmail_SupersededBy" = v_new_id
      where "OrgContactEmail_ID" = v_current."OrgContactEmail_ID";
    end if;
  end if;
  return v_result || jsonb_build_object('primaryEmailId', v_new_id);
end;
$$;

-- Extend the established, company-scoped creation paths without duplicating
-- their validation. New records enter the same durable office, address and
-- employment-history model as edited records.
alter function public.multideck_crm_create_account(uuid, jsonb)
  rename to _multideck_crm_create_account_prefoundation_20260820;
alter function public.multideck_crm_create_contact(uuid, uuid, jsonb)
  rename to _multideck_crm_create_contact_prefoundation_20260820;

create function public.multideck_crm_create_account(p_actor_user_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_org_id uuid;
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_address_id uuid;
  v_type_id integer;
  v_scope text := lower(coalesce(nullif(btrim(p_input ->> 'scopeCode'), ''), 'standard'));
begin
  v_result := public._multideck_crm_create_account_prefoundation_20260820(p_actor_user_id, p_input);
  v_org_id := (v_result ->> 'id')::uuid;
  select * into v_profile from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = v_org_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1;

  update public."CRM_AccountProfiles"
  set "CRMAccount_ScopeCode" = v_scope
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";
  if nullif(btrim(p_input ->> 'accountCode'), '') is not null then
    update public."Org_Master"
    set "Org_AccCode" = public._multideck_crm_account_code(p_input ->> 'accountCode', v_scope)
    where "Org_id" = v_org_id;
  end if;
  if v_profile."CRMAccount_OrgOfficeID" is not null then
    insert into public."CRM_AccountOfficeAssignments"(
      "CRMAccountOffice_AccountID", "CRMAccountOffice_CompanyID", "CRMAccountOffice_OrgOfficeID",
      "CRMAccountOffice_IsPrimary", "CRMAccountOffice_CreatedBy"
    ) values (
      v_profile."CRMAccount_ID", v_profile."CRMAccount_CompanyID", v_profile."CRMAccount_OrgOfficeID", true, p_actor_user_id
    ) on conflict ("CRMAccountOffice_AccountID", "CRMAccountOffice_OrgOfficeID") do update
      set "CRMAccountOffice_IsPrimary" = true;
  end if;
  select "OrgAdd_ID" into v_address_id from public."Org_Addresses"
  where "Org_ID" = v_org_id and "OrgAdd_IsActive" order by "OrgAdd_ID" limit 1;
  select "sys_AddressType_ID" into v_type_id from public."sys_AddressTypes"
  where "sys_AddressType_Code" = 'main' limit 1;
  if v_address_id is not null and v_type_id is not null then
    insert into public."Org_AddressTypes"(
      "OrgAdd_ID", "OrgAddType_Type", "OrgAddType_IsDefault", "OrgAddType_OrgID"
    ) values (v_address_id, v_type_id, true, v_org_id)
    on conflict ("OrgAdd_ID", "OrgAddType_Type") do update set "OrgAddType_IsDefault" = true;
  end if;
  return v_result || jsonb_build_object('scopeCode', v_scope);
end;
$$;

create function public.multideck_crm_create_contact(p_actor_user_id uuid, p_account_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_contact_id uuid;
  v_company_id uuid;
begin
  v_result := public._multideck_crm_create_contact_prefoundation_20260820(p_actor_user_id, p_account_id, p_input);
  v_contact_id := (v_result ->> 'id')::uuid;
  select "CRMAccount_CompanyID" into v_company_id from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_account_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1;
  update public."OrgContact_Emails"
  set "OrgContactEmail_IsPrimary" = true
  where "OrgContactEmail_ID" = (
    select email."OrgContactEmail_ID" from public."OrgContact_Emails" email
    where email."OrgContact_ID" = v_contact_id and email."OrgContactEmail_IsActive"
    order by email."OrgContactEmail_ValidFrom" desc, email."OrgContactEmail_ID" limit 1
  );
  insert into public."CRM_ContactOrganisationAssignments"(
    "CRMContactOrg_ContactID", "CRMContactOrg_OrgID", "CRMContactOrg_CompanyID",
    "CRMContactOrg_JobTitle", "CRMContactOrg_Department", "CRMContactOrg_RoleCode",
    "CRMContactOrg_StartedAt", "CRMContactOrg_IsCurrent", "CRMContactOrg_CreatedBy"
  ) values (
    v_contact_id, p_account_id, v_company_id, nullif(btrim(p_input ->> 'jobTitle'), ''),
    nullif(btrim(p_input ->> 'department'), ''), nullif(btrim(p_input ->> 'role'), ''),
    coalesce(nullif(p_input ->> 'startedAt', '')::date, current_date), true, p_actor_user_id
  ) on conflict do nothing;
  return v_result;
end;
$$;

create or replace function public.multideck_crm_transfer_contact(
  p_actor_user_id uuid,
  p_contact_id uuid,
  p_target_org_id uuid,
  p_expected_version bigint,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contact public."Org_Contacts"%rowtype;
  v_profile public."CRM_ContactProfiles"%rowtype;
  v_target public."CRM_AccountProfiles"%rowtype;
  v_started date := coalesce(nullif(p_input ->> 'startedAt', '')::date, current_date);
  v_next_version bigint;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  select * into v_contact from public."Org_Contacts" where "OrgContact_ID" = p_contact_id for update;
  if not found then raise exception 'Contact not found.' using errcode = 'P0002'; end if;
  perform public._multideck_crm_require_account_access(p_actor_user_id, v_contact."Org_ID");
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_target_org_id);
  if v_contact."Org_ID" = p_target_org_id then
    raise exception 'Choose a different organisation for this transfer.' using errcode = '22023';
  end if;

  select * into v_profile from public."CRM_ContactProfiles"
  where "CRMContact_OrgContactID" = p_contact_id
  order by "CRMContact_ID" limit 1 for update;
  if not found then raise exception 'Contact profile not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or v_profile."CRMContact_EditVersion" <> p_expected_version then
    raise exception 'CRM_CONFLICT:This contact changed since it was loaded.' using errcode = 'P0001';
  end if;
  select * into v_target from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_target_org_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1;
  if not found then raise exception 'Target organisation not found.' using errcode = 'P0002'; end if;

  update public."CRM_ContactOrganisationAssignments"
  set "CRMContactOrg_IsCurrent" = false,
      "CRMContactOrg_EndedAt" = greatest(v_started - 1, "CRMContactOrg_StartedAt")
  where "CRMContactOrg_ContactID" = p_contact_id and "CRMContactOrg_IsCurrent";
  insert into public."CRM_ContactOrganisationAssignments"(
    "CRMContactOrg_ContactID", "CRMContactOrg_OrgID", "CRMContactOrg_CompanyID",
    "CRMContactOrg_JobTitle", "CRMContactOrg_Department", "CRMContactOrg_RoleCode",
    "CRMContactOrg_StartedAt", "CRMContactOrg_IsCurrent", "CRMContactOrg_CreatedBy"
  ) values (
    p_contact_id, p_target_org_id, v_target."CRMAccount_CompanyID",
    coalesce(nullif(btrim(p_input ->> 'jobTitle'), ''), v_profile."CRMContact_MetadataJSON" ->> 'jobTitle'),
    coalesce(nullif(btrim(p_input ->> 'department'), ''), v_profile."CRMContact_MetadataJSON" ->> 'department'),
    coalesce(nullif(btrim(p_input ->> 'role'), ''), v_profile."CRMContact_RoleCode"),
    v_started, true, p_actor_user_id
  );

  v_next_version := v_profile."CRMContact_EditVersion" + 1;
  update public."Org_Contacts" set "Org_ID" = p_target_org_id where "OrgContact_ID" = p_contact_id;
  update public."CRM_ContactProfiles"
  set "CRMContact_AccountID" = v_target."CRMAccount_ID",
      "CRMContact_RoleCode" = coalesce(nullif(btrim(p_input ->> 'role'), ''), "CRMContact_RoleCode"),
      "CRMContact_MetadataJSON" = "CRMContact_MetadataJSON" || jsonb_strip_nulls(jsonb_build_object(
        'jobTitle', nullif(btrim(p_input ->> 'jobTitle'), ''),
        'department', nullif(btrim(p_input ->> 'department'), '')
      )),
      "CRMContact_EditVersion" = v_next_version,
      "CRMContact_UpdatedAt" = now(),
      "CRMContact_UpdatedBy" = p_actor_user_id
  where "CRMContact_ID" = v_profile."CRMContact_ID";
  update public."Comm_Identities"
  set "CommIdentity_OrgID" = p_target_org_id, "CommIdentity_UpdatedAt" = now()
  where "CommIdentity_ContactID" = p_contact_id and not "CommIdentity_IsDeleted";

  return jsonb_build_object('id', p_contact_id, 'accountId', p_target_org_id, 'editVersion', v_next_version);
end;
$$;

create or replace function public.multideck_crm_upsert_organisation_address(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_address_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_address_id uuid := coalesce(p_address_id, gen_random_uuid());
  v_country text := upper(nullif(btrim(p_input ->> 'countryCode'), ''));
  v_timezone text := coalesce(nullif(btrim(p_input ->> 'timeZone'), ''), 'UTC');
  v_capabilities jsonb := coalesce(p_input -> 'capabilities', '[]'::jsonb);
  v_hours jsonb := coalesce(p_input -> 'weeklyHours', '[]'::jsonb);
  v_overrides jsonb := coalesce(p_input -> 'openingOverrides', '[]'::jsonb);
  v_item jsonb;
  v_type_id integer;
  v_type_ids integer[] := '{}'::integer[];
  v_day integer;
  v_opens time;
  v_closes time;
  v_override_date date;
  v_is_closed boolean;
  v_next_version bigint;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);
  if jsonb_typeof(coalesce(p_input, '{}'::jsonb)) <> 'object' then
    raise exception 'Enter valid address details.' using errcode = '22023';
  end if;

  select * into v_profile
  from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_account_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Organisation not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_profile."CRMAccount_EditVersion" then
    raise exception 'CRM_CONFLICT:This organisation changed since it was loaded.' using errcode = 'P0001';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'Choose a two-letter country code.' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'Choose a recognised time zone.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_capabilities) <> 'array' or jsonb_array_length(v_capabilities) > 12 then
    raise exception 'Choose valid address capabilities.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) > 28 then
    raise exception 'Enter no more than four opening intervals per day.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_overrides) <> 'array' or jsonb_array_length(v_overrides) > 120 then
    raise exception 'Enter no more than 120 opening-hour overrides.' using errcode = '22023';
  end if;
  if coalesce(nullif(btrim(p_input ->> 'line1'), ''), nullif(btrim(p_input ->> 'townCity'), ''), v_country) is null then
    raise exception 'Enter at least an address line, town or country.' using errcode = '22023';
  end if;

  if p_address_id is null then
    insert into public."Org_Addresses"(
      "OrgAdd_ID", "Org_ID", "Org_NameOverride", "OrgAdd_Line1", "OrgAdd_Line2",
      "OrgAdd_TownCity", "OrgAdd_CountyState", "OrgAdd_PostZipCode", "OrgAdd_Country",
      "OrgAdd_UNLOCODE", "OrgAdd_MainEmail", "OrgAdd_MainPhone", "OrgAdd_TimeZone",
      "OrgAdd_IsActive", "OrgAdd_UpdatedAt", "OrgAdd_UpdatedBy"
    ) values (
      v_address_id, p_account_id, nullif(btrim(p_input ->> 'name'), ''),
      nullif(btrim(p_input ->> 'line1'), ''), nullif(btrim(p_input ->> 'line2'), ''),
      nullif(btrim(p_input ->> 'townCity'), ''), nullif(btrim(p_input ->> 'countyState'), ''),
      nullif(btrim(p_input ->> 'postZipCode'), ''), v_country,
      upper(nullif(btrim(p_input ->> 'unlocode'), '')), lower(nullif(btrim(p_input ->> 'email'), '')),
      nullif(btrim(p_input ->> 'phone'), ''), v_timezone, true, now(), p_actor_user_id
    );
  else
    update public."Org_Addresses"
    set "Org_NameOverride" = nullif(btrim(p_input ->> 'name'), ''),
        "OrgAdd_Line1" = nullif(btrim(p_input ->> 'line1'), ''),
        "OrgAdd_Line2" = nullif(btrim(p_input ->> 'line2'), ''),
        "OrgAdd_TownCity" = nullif(btrim(p_input ->> 'townCity'), ''),
        "OrgAdd_CountyState" = nullif(btrim(p_input ->> 'countyState'), ''),
        "OrgAdd_PostZipCode" = nullif(btrim(p_input ->> 'postZipCode'), ''),
        "OrgAdd_Country" = v_country,
        "OrgAdd_UNLOCODE" = upper(nullif(btrim(p_input ->> 'unlocode'), '')),
        "OrgAdd_MainEmail" = lower(nullif(btrim(p_input ->> 'email'), '')),
        "OrgAdd_MainPhone" = nullif(btrim(p_input ->> 'phone'), ''),
        "OrgAdd_TimeZone" = v_timezone,
        "OrgAdd_IsActive" = true,
        "OrgAdd_UpdatedAt" = now(),
        "OrgAdd_UpdatedBy" = p_actor_user_id
    where "OrgAdd_ID" = p_address_id and "Org_ID" = p_account_id;
    if not found then raise exception 'Address not found.' using errcode = 'P0002'; end if;
  end if;

  delete from public."Org_AddressTypes" where "OrgAdd_ID" = v_address_id;
  for v_item in select value from jsonb_array_elements(v_capabilities) loop
    select type."sys_AddressType_ID" into v_type_id
    from public."sys_AddressTypes" type
    where type."sys_AddressType_Code" = lower(btrim(v_item ->> 'code'))
      and type."sys_AddressType_IsActive";
    if v_type_id is null or v_type_id = any(v_type_ids) then
      raise exception 'Choose each valid address capability once.' using errcode = '22023';
    end if;
    v_type_ids := array_append(v_type_ids, v_type_id);
    if coalesce((v_item ->> 'isDefault')::boolean, false) then
      update public."Org_AddressTypes"
      set "OrgAddType_IsDefault" = false
      where "OrgAddType_OrgID" = p_account_id and "OrgAddType_Type" = v_type_id;
    end if;
    insert into public."Org_AddressTypes"(
      "OrgAdd_ID", "OrgAddType_Type", "OrgAddType_IsDefault", "OrgAddType_OrgID"
    ) values (
      v_address_id, v_type_id, coalesce((v_item ->> 'isDefault')::boolean, false), p_account_id
    );
  end loop;

  delete from public."Org_AddressOpeningHours" where "OrgAddHours_OrgAddID" = v_address_id;
  for v_item in select value from jsonb_array_elements(v_hours) loop
    v_day := (v_item ->> 'dayOfWeek')::integer;
    v_opens := (v_item ->> 'opensAt')::time;
    v_closes := (v_item ->> 'closesAt')::time;
    if v_day not between 0 and 6 or v_opens >= v_closes then
      raise exception 'Enter valid weekly opening intervals.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public."Org_AddressOpeningHours" hours
      where hours."OrgAddHours_OrgAddID" = v_address_id
        and hours."OrgAddHours_DayOfWeek" = v_day
        and hours."OrgAddHours_OpensAt" < v_closes
        and v_opens < hours."OrgAddHours_ClosesAt"
    ) then
      raise exception 'Opening intervals cannot overlap.' using errcode = '22023';
    end if;
    insert into public."Org_AddressOpeningHours"(
      "OrgAddHours_OrgAddID", "OrgAddHours_DayOfWeek", "OrgAddHours_OpensAt", "OrgAddHours_ClosesAt", "OrgAddHours_SortOrder"
    ) values (v_address_id, v_day, v_opens, v_closes, coalesce((v_item ->> 'sortOrder')::integer, 0));
  end loop;

  delete from public."Org_AddressOpeningOverrides" where "OrgAddOverride_OrgAddID" = v_address_id;
  for v_item in select value from jsonb_array_elements(v_overrides) loop
    v_override_date := (v_item ->> 'date')::date;
    v_is_closed := coalesce((v_item ->> 'isClosed')::boolean, false);
    v_opens := nullif(v_item ->> 'opensAt', '')::time;
    v_closes := nullif(v_item ->> 'closesAt', '')::time;
    if (v_is_closed and (v_opens is not null or v_closes is not null))
      or (not v_is_closed and (v_opens is null or v_closes is null or v_opens >= v_closes)) then
      raise exception 'Enter valid dated opening-hour overrides.' using errcode = '22023';
    end if;
    insert into public."Org_AddressOpeningOverrides"(
      "OrgAddOverride_OrgAddID", "OrgAddOverride_Date", "OrgAddOverride_IsClosed",
      "OrgAddOverride_OpensAt", "OrgAddOverride_ClosesAt", "OrgAddOverride_Note"
    ) values (
      v_address_id, v_override_date, v_is_closed, v_opens, v_closes,
      left(nullif(btrim(v_item ->> 'note'), ''), 240)
    );
  end loop;

  v_next_version := v_profile."CRMAccount_EditVersion" + 1;
  update public."CRM_AccountProfiles"
  set "CRMAccount_EditVersion" = v_next_version, "CRMAccount_UpdatedAt" = now(), "CRMAccount_UpdatedBy" = p_actor_user_id
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";
  return jsonb_build_object('id', v_address_id, 'accountId', p_account_id, 'editVersion', v_next_version);
end;
$$;

create or replace function public.multideck_crm_archive_organisation_address(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_address_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_next_version bigint;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);
  select * into v_profile from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_account_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Organisation not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_profile."CRMAccount_EditVersion" then
    raise exception 'CRM_CONFLICT:This organisation changed since it was loaded.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public."Org_AddressTypes"
    where "OrgAdd_ID" = p_address_id and "OrgAddType_IsDefault"
  ) then
    raise exception 'Choose replacement defaults before archiving this address.' using errcode = '22023';
  end if;
  update public."Org_Addresses"
  set "OrgAdd_IsActive" = false, "OrgAdd_UpdatedAt" = now(), "OrgAdd_UpdatedBy" = p_actor_user_id
  where "OrgAdd_ID" = p_address_id and "Org_ID" = p_account_id and "OrgAdd_IsActive";
  if not found then raise exception 'Active address not found.' using errcode = 'P0002'; end if;
  v_next_version := v_profile."CRMAccount_EditVersion" + 1;
  update public."CRM_AccountProfiles"
  set "CRMAccount_EditVersion" = v_next_version, "CRMAccount_UpdatedAt" = now(), "CRMAccount_UpdatedBy" = p_actor_user_id
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";
  return jsonb_build_object('id', p_address_id, 'accountId', p_account_id, 'editVersion', v_next_version, 'archived', true);
end;
$$;

create or replace function public.multideck_crm_organisation_address_options(
  p_org_id uuid,
  p_capability_code text default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_items jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read')
    or not public.multideck_crm_company_can_access_account(v_context.company_id, p_org_id) then
    raise exception 'You do not have permission to view this organisation.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(item.value order by item.sort_default desc, item.sort_label), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id', address."OrgAdd_ID",
      'name', coalesce(nullif(btrim(address."Org_NameOverride"), ''), nullif(btrim(address."OrgAdd_Line1"), ''), 'Address'),
      'line1', address."OrgAdd_Line1", 'line2', address."OrgAdd_Line2",
      'townCity', address."OrgAdd_TownCity", 'countyState', address."OrgAdd_CountyState",
      'postZipCode', address."OrgAdd_PostZipCode", 'countryCode', address."OrgAdd_Country",
      'unlocode', address."OrgAdd_UNLOCODE", 'timeZone', address."OrgAdd_TimeZone",
      'capabilities', capability.values,
      'isDefault', coalesce(capability.is_default, false),
      'isOpenAt', case
        when override_state.has_override then override_state.is_open
        else exists (
          select 1 from public."Org_AddressOpeningHours" hours
          where hours."OrgAddHours_OrgAddID" = address."OrgAdd_ID"
            and hours."OrgAddHours_DayOfWeek" = extract(dow from (p_at at time zone address."OrgAdd_TimeZone"))::integer
            and (p_at at time zone address."OrgAdd_TimeZone")::time >= hours."OrgAddHours_OpensAt"
            and (p_at at time zone address."OrgAdd_TimeZone")::time < hours."OrgAddHours_ClosesAt"
        )
      end
    ) value,
    coalesce(capability.is_default, false) sort_default,
    lower(coalesce(address."Org_NameOverride", address."OrgAdd_Line1", address."OrgAdd_TownCity", '')) sort_label
    from public."Org_Addresses" address
    join lateral (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'code', type."sys_AddressType_Code", 'name', type."sys_AddressType_Description",
          'isDefault', link."OrgAddType_IsDefault"
        ) order by type."sys_AddressType_SortOrder"), '[]'::jsonb) values,
        bool_or(link."OrgAddType_IsDefault" and (p_capability_code is null or type."sys_AddressType_Code" = lower(btrim(p_capability_code)))) is_default,
        bool_or(p_capability_code is null or type."sys_AddressType_Code" = lower(btrim(p_capability_code))) matches
      from public."Org_AddressTypes" link
      join public."sys_AddressTypes" type on type."sys_AddressType_ID" = link."OrgAddType_Type"
      where link."OrgAdd_ID" = address."OrgAdd_ID" and type."sys_AddressType_IsActive"
    ) capability on capability.matches
    left join lateral (
      select true has_override,
        bool_or(not override."OrgAddOverride_IsClosed"
          and (p_at at time zone address."OrgAdd_TimeZone")::time >= override."OrgAddOverride_OpensAt"
          and (p_at at time zone address."OrgAdd_TimeZone")::time < override."OrgAddOverride_ClosesAt") is_open
      from public."Org_AddressOpeningOverrides" override
      where override."OrgAddOverride_OrgAddID" = address."OrgAdd_ID"
        and override."OrgAddOverride_Date" = (p_at at time zone address."OrgAdd_TimeZone")::date
      having count(*) > 0
    ) override_state on true
    where address."Org_ID" = p_org_id and address."OrgAdd_IsActive"
  ) item;
  return jsonb_build_object('organisationId', p_org_id, 'capabilityCode', nullif(lower(btrim(p_capability_code)), ''), 'at', p_at, 'items', v_items);
end;
$$;

create or replace function public.multideck_crm_upsert_related_party_default(
  p_actor_user_id uuid,
  p_source_org_id uuid,
  p_rule_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_company_id uuid;
  v_target_org_id uuid := nullif(p_input ->> 'targetOrganisationId', '')::uuid;
  v_target_address_id uuid := nullif(p_input ->> 'targetAddressId', '')::uuid;
  v_target_contact_id uuid := nullif(p_input ->> 'targetContactId', '')::uuid;
  v_role text := lower(nullif(btrim(p_input ->> 'partyRoleCode'), ''));
  v_country text := upper(nullif(btrim(p_input ->> 'destinationCountryCode'), ''));
  v_unlocode text := upper(nullif(btrim(p_input ->> 'destinationUnlocode'), ''));
  v_postcode text := upper(nullif(btrim(p_input ->> 'destinationPostcode'), ''));
  v_rule_id uuid := coalesce(p_rule_id, gen_random_uuid());
  v_next_version bigint;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_source_org_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, v_target_org_id);
  select * into v_profile from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_source_org_id and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Organisation not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_profile."CRMAccount_EditVersion" then
    raise exception 'CRM_CONFLICT:This organisation changed since it was loaded.' using errcode = 'P0001';
  end if;
  v_company_id := v_profile."CRMAccount_CompanyID";
  if v_role is null or v_role !~ '^[a-z0-9_\-]{2,60}$' then
    raise exception 'Choose a valid related-party role.' using errcode = '22023';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'Choose a two-letter destination country code.' using errcode = '22023';
  end if;
  if v_target_address_id is not null and not exists (
    select 1 from public."Org_Addresses" where "OrgAdd_ID" = v_target_address_id and "Org_ID" = v_target_org_id and "OrgAdd_IsActive"
  ) then raise exception 'Choose an active address for the related organisation.' using errcode = '22023'; end if;
  if v_target_contact_id is not null and not exists (
    select 1 from public."Org_Contacts" where "OrgContact_ID" = v_target_contact_id and "Org_ID" = v_target_org_id
  ) then raise exception 'Choose a contact from the related organisation.' using errcode = '22023'; end if;

  insert into public."Org_RelatedPartyDefaults"(
    "OrgRelatedDefault_ID", "OrgRelatedDefault_CompanyID", "OrgRelatedDefault_SourceOrgID",
    "OrgRelatedDefault_PartyRoleCode", "OrgRelatedDefault_DestinationCountryCode",
    "OrgRelatedDefault_DestinationUNLOCODE", "OrgRelatedDefault_DestinationPostcode",
    "OrgRelatedDefault_TargetOrgID", "OrgRelatedDefault_TargetAddressID", "OrgRelatedDefault_TargetContactID",
    "OrgRelatedDefault_Priority", "OrgRelatedDefault_EffectiveFrom", "OrgRelatedDefault_EffectiveTo",
    "OrgRelatedDefault_IsActive", "OrgRelatedDefault_CreatedBy", "OrgRelatedDefault_UpdatedBy"
  ) values (
    v_rule_id, v_company_id, p_source_org_id, v_role, v_country, v_unlocode, v_postcode,
    v_target_org_id, v_target_address_id, v_target_contact_id,
    greatest(1, least(coalesce((p_input ->> 'priority')::integer, 100), 10000)),
    coalesce(nullif(p_input ->> 'effectiveFrom', '')::date, current_date),
    nullif(p_input ->> 'effectiveTo', '')::date,
    coalesce((p_input ->> 'isActive')::boolean, true), p_actor_user_id, p_actor_user_id
  )
  on conflict ("OrgRelatedDefault_ID") do update set
    "OrgRelatedDefault_PartyRoleCode" = excluded."OrgRelatedDefault_PartyRoleCode",
    "OrgRelatedDefault_DestinationCountryCode" = excluded."OrgRelatedDefault_DestinationCountryCode",
    "OrgRelatedDefault_DestinationUNLOCODE" = excluded."OrgRelatedDefault_DestinationUNLOCODE",
    "OrgRelatedDefault_DestinationPostcode" = excluded."OrgRelatedDefault_DestinationPostcode",
    "OrgRelatedDefault_TargetOrgID" = excluded."OrgRelatedDefault_TargetOrgID",
    "OrgRelatedDefault_TargetAddressID" = excluded."OrgRelatedDefault_TargetAddressID",
    "OrgRelatedDefault_TargetContactID" = excluded."OrgRelatedDefault_TargetContactID",
    "OrgRelatedDefault_Priority" = excluded."OrgRelatedDefault_Priority",
    "OrgRelatedDefault_EffectiveFrom" = excluded."OrgRelatedDefault_EffectiveFrom",
    "OrgRelatedDefault_EffectiveTo" = excluded."OrgRelatedDefault_EffectiveTo",
    "OrgRelatedDefault_IsActive" = excluded."OrgRelatedDefault_IsActive",
    "OrgRelatedDefault_UpdatedAt" = now(),
    "OrgRelatedDefault_UpdatedBy" = p_actor_user_id
  where public."Org_RelatedPartyDefaults"."OrgRelatedDefault_CompanyID" = v_company_id
    and public."Org_RelatedPartyDefaults"."OrgRelatedDefault_SourceOrgID" = p_source_org_id;
  if not found then raise exception 'Related-party default not found.' using errcode = 'P0002'; end if;
  v_next_version := v_profile."CRMAccount_EditVersion" + 1;
  update public."CRM_AccountProfiles"
  set "CRMAccount_EditVersion" = v_next_version, "CRMAccount_UpdatedAt" = now(), "CRMAccount_UpdatedBy" = p_actor_user_id
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";
  return jsonb_build_object('id', v_rule_id, 'accountId', p_source_org_id, 'editVersion', v_next_version);
end;
$$;

create or replace function public.multideck_crm_resolve_related_party_default(
  p_source_org_id uuid,
  p_party_role_code text,
  p_destination_country_code text default null,
  p_destination_unlocode text default null,
  p_destination_postcode text default null,
  p_on_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'Customers.Read')
    or not public.multideck_crm_company_can_access_account(v_context.company_id, p_source_org_id) then
    raise exception 'You do not have permission to view this organisation.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'ruleId', rule."OrgRelatedDefault_ID", 'sourceOrganisationId', p_source_org_id,
    'partyRoleCode', rule."OrgRelatedDefault_PartyRoleCode",
    'targetOrganisation', jsonb_build_object('id', target."Org_id", 'name', target."Org_Name", 'accountCode', target."Org_AccCode"),
    'targetAddressId', rule."OrgRelatedDefault_TargetAddressID", 'targetContactId', rule."OrgRelatedDefault_TargetContactID",
    'matchedBy', case
      when rule."OrgRelatedDefault_DestinationPostcode" is not null then 'postcode'
      when rule."OrgRelatedDefault_DestinationUNLOCODE" is not null then 'unlocode'
      when rule."OrgRelatedDefault_DestinationCountryCode" is not null then 'country'
      else 'fallback' end,
    'evidence', jsonb_build_object(
      'sourceTable', 'Org_RelatedPartyDefaults', 'sourceId', rule."OrgRelatedDefault_ID",
      'effectiveFrom', rule."OrgRelatedDefault_EffectiveFrom", 'effectiveTo', rule."OrgRelatedDefault_EffectiveTo"
    )
  ) into v_result
  from public."Org_RelatedPartyDefaults" rule
  join public."Org_Master" target on target."Org_id" = rule."OrgRelatedDefault_TargetOrgID"
  where rule."OrgRelatedDefault_CompanyID" = v_context.company_id
    and rule."OrgRelatedDefault_SourceOrgID" = p_source_org_id
    and rule."OrgRelatedDefault_PartyRoleCode" = lower(btrim(p_party_role_code))
    and rule."OrgRelatedDefault_IsActive"
    and rule."OrgRelatedDefault_EffectiveFrom" <= p_on_date
    and (rule."OrgRelatedDefault_EffectiveTo" is null or rule."OrgRelatedDefault_EffectiveTo" >= p_on_date)
    and (rule."OrgRelatedDefault_DestinationCountryCode" is null or rule."OrgRelatedDefault_DestinationCountryCode" = upper(btrim(p_destination_country_code)))
    and (rule."OrgRelatedDefault_DestinationUNLOCODE" is null or rule."OrgRelatedDefault_DestinationUNLOCODE" = upper(btrim(p_destination_unlocode)))
    and (rule."OrgRelatedDefault_DestinationPostcode" is null or rule."OrgRelatedDefault_DestinationPostcode" = upper(btrim(p_destination_postcode)))
  order by
    (rule."OrgRelatedDefault_DestinationPostcode" is not null)::integer desc,
    (rule."OrgRelatedDefault_DestinationUNLOCODE" is not null)::integer desc,
    (rule."OrgRelatedDefault_DestinationCountryCode" is not null)::integer desc,
    rule."OrgRelatedDefault_Priority", rule."OrgRelatedDefault_UpdatedAt" desc
  limit 1;
  return coalesce(v_result, jsonb_build_object(
    'sourceOrganisationId', p_source_org_id, 'partyRoleCode', lower(btrim(p_party_role_code)),
    'targetOrganisation', null, 'matchedBy', null, 'evidence', null
  ));
end;
$$;

-- Dexter reads the same company foundation through an explicit, bounded domain.
-- Source identifiers stay attached to the returned evidence; no generic table
-- or SQL access is introduced.
create or replace function public.multideck_dexter_domain_customers(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(item.row_data order by item.search_rank desc, item.organisation_name), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', organisation."Org_id", 'recordType', 'company',
        'name', organisation."Org_Name", 'accountCode', organisation."Org_AccCode",
        'scopeCode', profile."CRMAccount_ScopeCode", 'isPotential', organisation."Org_CRMIsPotentialCustomer",
        'organisationTypes', types.values,
        'relationshipStatus', coalesce(profile."CRMAccount_RelationshipStatusCode", organisation."Org_CRMRelationshipStatusCode"),
        'responsibleOffices', offices.values,
        'addresses', addresses.values,
        'contacts', contacts.values,
        'relatedPartyDefaults', related_defaults.values,
        'sourceEvidence', jsonb_build_object(
          'sourceTable', 'Org_Master', 'sourceId', organisation."Org_id",
          'profileTable', 'CRM_AccountProfiles', 'profileId', profile."CRMAccount_ID"
        ),
        'searchEvidence', evidence.value - 'matched'
      ) row_data,
      coalesce((evidence.value ->> 'confidence')::numeric, 0) search_rank,
      organisation."Org_Name" organisation_name
    from public.multideck_crm_accessible_account_ids(p_company_id) accessible
    join public."Org_Master" organisation on organisation."Org_id" = accessible.account_id
    join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = organisation."Org_id" and not profile."CRMAccount_IsDeleted"
    left join lateral (
      select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb) values
      from public."Org_Master_Type" link
      join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
      where link."Org_ID" = organisation."Org_id"
    ) types on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'officeId', office."Office_ID", 'name', office."Office_Name", 'code', office."Office_Code",
        'isPrimary', assignment."CRMAccountOffice_IsPrimary"
      ) order by assignment."CRMAccountOffice_IsPrimary" desc, office."Office_Name"), '[]'::jsonb) values,
      string_agg(concat_ws(' ', office."Office_Name", office."Office_Code"), ' ') search_text
      from public."CRM_AccountOfficeAssignments" assignment
      join public."cmp_Offices" office on office."Office_ID" = assignment."CRMAccountOffice_OrgOfficeID"
      where assignment."CRMAccountOffice_AccountID" = profile."CRMAccount_ID"
    ) offices on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'addressId', address."OrgAdd_ID", 'name', address."Org_NameOverride", 'line1', address."OrgAdd_Line1",
        'townCity', address."OrgAdd_TownCity", 'postcode', address."OrgAdd_PostZipCode",
        'countryCode', address."OrgAdd_Country", 'unlocode', address."OrgAdd_UNLOCODE",
        'timeZone', address."OrgAdd_TimeZone", 'capabilities', capabilities.values,
        'weeklyHours', hours.values, 'upcomingOverrideCount', overrides.value
      ) order by address."Org_NameOverride", address."OrgAdd_TownCity"), '[]'::jsonb) values,
      string_agg(concat_ws(' ', address."Org_NameOverride", address."OrgAdd_Line1", address."OrgAdd_TownCity", address."OrgAdd_PostZipCode", address."OrgAdd_Country", address."OrgAdd_UNLOCODE"), ' ') search_text
      from public."Org_Addresses" address
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'code', type."sys_AddressType_Code", 'isDefault', link."OrgAddType_IsDefault"
        ) order by type."sys_AddressType_SortOrder"), '[]'::jsonb) values
        from public."Org_AddressTypes" link
        join public."sys_AddressTypes" type on type."sys_AddressType_ID" = link."OrgAddType_Type"
        where link."OrgAdd_ID" = address."OrgAdd_ID"
      ) capabilities on true
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'dayOfWeek', hour."OrgAddHours_DayOfWeek", 'opensAt', hour."OrgAddHours_OpensAt", 'closesAt', hour."OrgAddHours_ClosesAt"
        ) order by hour."OrgAddHours_DayOfWeek", hour."OrgAddHours_OpensAt"), '[]'::jsonb) values
        from public."Org_AddressOpeningHours" hour where hour."OrgAddHours_OrgAddID" = address."OrgAdd_ID"
      ) hours on true
      left join lateral (
        select count(*)::integer value from public."Org_AddressOpeningOverrides" override
        where override."OrgAddOverride_OrgAddID" = address."OrgAdd_ID" and override."OrgAddOverride_Date" >= current_date
      ) overrides on true
      where address."Org_ID" = organisation."Org_id" and address."OrgAdd_IsActive"
    ) addresses on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'contactId', contact."OrgContact_ID",
        'name', nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
        'activeEmails', emails.values,
        'employmentHistory', employment.values
      ) order by contact."OrgContact_LastName", contact."OrgContact_FirstName"), '[]'::jsonb) values,
      string_agg(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName", emails.search_text), ' ') search_text
      from public."Org_Contacts" contact
      left join lateral (
        select coalesce(jsonb_agg(email."OrgContactEmail_Email" order by email."OrgContactEmail_IsPrimary" desc), '[]'::jsonb) values,
          string_agg(email."OrgContactEmail_Email", ' ') search_text
        from public."OrgContact_Emails" email
        where email."OrgContact_ID" = contact."OrgContact_ID" and email."OrgContactEmail_IsActive"
      ) emails on true
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'organisationId', assignment."CRMContactOrg_OrgID", 'organisationName', employer."Org_Name",
          'jobTitle', assignment."CRMContactOrg_JobTitle", 'department', assignment."CRMContactOrg_Department",
          'role', assignment."CRMContactOrg_RoleCode", 'startedAt', assignment."CRMContactOrg_StartedAt",
          'endedAt', assignment."CRMContactOrg_EndedAt", 'isCurrent', assignment."CRMContactOrg_IsCurrent"
        ) order by assignment."CRMContactOrg_StartedAt" desc), '[]'::jsonb) values
        from public."CRM_ContactOrganisationAssignments" assignment
        join public."Org_Master" employer on employer."Org_id" = assignment."CRMContactOrg_OrgID"
        where assignment."CRMContactOrg_ContactID" = contact."OrgContact_ID"
      ) employment on true
      where contact."Org_ID" = organisation."Org_id"
    ) contacts on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ruleId', rule."OrgRelatedDefault_ID", 'partyRoleCode', rule."OrgRelatedDefault_PartyRoleCode",
        'destinationCountryCode', rule."OrgRelatedDefault_DestinationCountryCode",
        'destinationUnlocode', rule."OrgRelatedDefault_DestinationUNLOCODE",
        'destinationPostcode', rule."OrgRelatedDefault_DestinationPostcode",
        'targetOrganisationId', target."Org_id", 'targetOrganisationName', target."Org_Name",
        'targetAddressId', rule."OrgRelatedDefault_TargetAddressID", 'targetContactId', rule."OrgRelatedDefault_TargetContactID",
        'priority', rule."OrgRelatedDefault_Priority"
      ) order by rule."OrgRelatedDefault_PartyRoleCode", rule."OrgRelatedDefault_Priority"), '[]'::jsonb) values
      from public."Org_RelatedPartyDefaults" rule
      join public."Org_Master" target on target."Org_id" = rule."OrgRelatedDefault_TargetOrgID"
      where rule."OrgRelatedDefault_SourceOrgID" = organisation."Org_id" and rule."OrgRelatedDefault_IsActive"
    ) related_defaults on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', organisation."Org_Name", 'accountCode', organisation."Org_AccCode",
        'types', types.values, 'offices', offices.search_text,
        'addresses', addresses.search_text, 'contacts', contacts.search_text
      )
    ) evidence(value)
    where public._multideck_dexter_has_permission(
      (select app_user."User_ID" from public."cmp_Users" app_user
       where app_user."Auth_User_ID" = auth.uid() and app_user."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (evidence.value ->> 'matched')::boolean
    order by search_rank desc, organisation."Org_Name"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) item;
$$;

create or replace function public.multideck_dexter_action_update_company_foundation(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public._multideck_crm_actor_company(p_user_id) <> p_company_id then
    raise exception 'The company scope does not match this operator.' using errcode = '42501';
  end if;
  return public.multideck_crm_update_organisation_foundation(
    p_user_id, (p_arguments ->> 'target_id')::uuid, (p_arguments ->> 'expected_version')::bigint,
    jsonb_build_object(
      'accountCode', p_arguments ->> 'account_code', 'scopeCode', p_arguments ->> 'scope_code',
      'isPotential', p_arguments -> 'is_potential', 'officeAssignments', p_arguments -> 'office_assignments'
    )
  );
end;
$$;

create or replace function public.multideck_dexter_action_upsert_company_address(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public._multideck_crm_actor_company(p_user_id) <> p_company_id then
    raise exception 'The company scope does not match this operator.' using errcode = '42501';
  end if;
  return public.multideck_crm_upsert_organisation_address(
    p_user_id, (p_arguments ->> 'target_id')::uuid, nullif(p_arguments ->> 'address_id', '')::uuid,
    (p_arguments ->> 'expected_version')::bigint, p_arguments -> 'address'
  );
end;
$$;

create or replace function public.multideck_dexter_action_transfer_company_contact(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public._multideck_crm_actor_company(p_user_id) <> p_company_id then
    raise exception 'The company scope does not match this operator.' using errcode = '42501';
  end if;
  return public.multideck_crm_transfer_contact(
    p_user_id, (p_arguments ->> 'contact_id')::uuid, (p_arguments ->> 'target_organisation_id')::uuid,
    (p_arguments ->> 'expected_version')::bigint, p_arguments - array['contact_id','target_organisation_id','expected_version']
  );
end;
$$;

create or replace function public.multideck_dexter_action_set_related_party_default(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public._multideck_crm_actor_company(p_user_id) <> p_company_id then
    raise exception 'The company scope does not match this operator.' using errcode = '42501';
  end if;
  return public.multideck_crm_upsert_related_party_default(
    p_user_id, (p_arguments ->> 'target_id')::uuid, nullif(p_arguments ->> 'rule_id', '')::uuid,
    (p_arguments ->> 'expected_version')::bigint, p_arguments -> 'default'
  );
end;
$$;

insert into public."sys_AIDexterActions"(
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values
  (
    'update_company_foundation', 'customers', 'Update company setup',
    'Update one exact company code, scope, lifecycle state and responsible offices after operator approval.',
    'multideck_dexter_action_update_company_foundation',
    '{"type":"object","properties":{"target_id":{"type":"string"},"expected_version":{"type":"integer","minimum":1},"account_code":{"type":"string"},"scope_code":{"type":"string","enum":["standard","national","global"]},"is_potential":{"type":"boolean"},"office_assignments":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"officeId":{"type":"string"},"isPrimary":{"type":"boolean"}},"required":["officeId","isPrimary"],"additionalProperties":false}}},"required":["target_id","expected_version","account_code","scope_code","is_potential","office_assignments"],"additionalProperties":false}'::jsonb,
    34, true, now(), '["Customers.Write"]'::jsonb, 'update_company_foundation', 'canonical', false
  ),
  (
    'upsert_company_address', 'customers', 'Add or update company address',
    'Add or update one exact company address, its capabilities, defaults and opening hours after operator approval.',
    'multideck_dexter_action_upsert_company_address',
    '{"type":"object","properties":{"target_id":{"type":"string"},"address_id":{"type":["string","null"]},"expected_version":{"type":"integer","minimum":1},"address":{"type":"object","properties":{"name":{"type":["string","null"]},"line1":{"type":["string","null"]},"line2":{"type":["string","null"]},"townCity":{"type":["string","null"]},"countyState":{"type":["string","null"]},"postZipCode":{"type":["string","null"]},"countryCode":{"type":["string","null"]},"unlocode":{"type":["string","null"]},"email":{"type":["string","null"]},"phone":{"type":["string","null"]},"timeZone":{"type":"string"},"capabilities":{"type":"array","maxItems":12,"items":{"type":"object","properties":{"code":{"type":"string"},"isDefault":{"type":"boolean"}},"required":["code","isDefault"],"additionalProperties":false}},"weeklyHours":{"type":"array","maxItems":28,"items":{"type":"object","properties":{"dayOfWeek":{"type":"integer","minimum":0,"maximum":6},"opensAt":{"type":"string"},"closesAt":{"type":"string"},"sortOrder":{"type":"integer","minimum":0}},"required":["dayOfWeek","opensAt","closesAt","sortOrder"],"additionalProperties":false}},"openingOverrides":{"type":"array","maxItems":100,"items":{"type":"object","properties":{"date":{"type":"string"},"isClosed":{"type":"boolean"},"opensAt":{"type":["string","null"]},"closesAt":{"type":["string","null"]},"note":{"type":["string","null"]}},"required":["date","isClosed","opensAt","closesAt","note"],"additionalProperties":false}}},"required":["name","line1","line2","townCity","countyState","postZipCode","countryCode","unlocode","email","phone","timeZone","capabilities","weeklyHours","openingOverrides"],"additionalProperties":false}},"required":["target_id","address_id","expected_version","address"],"additionalProperties":false}'::jsonb,
    35, true, now(), '["Customers.Write"]'::jsonb, 'upsert_company_address', 'canonical', false
  ),
  (
    'transfer_company_contact', 'customers', 'Transfer company contact',
    'Move one exact contact to another accessible company while preserving employment history after operator approval.',
    'multideck_dexter_action_transfer_company_contact',
    '{"type":"object","properties":{"contact_id":{"type":"string"},"target_organisation_id":{"type":"string"},"expected_version":{"type":"integer","minimum":1},"startedAt":{"type":"string"},"jobTitle":{"type":["string","null"]},"department":{"type":["string","null"]},"role":{"type":["string","null"]}},"required":["contact_id","target_organisation_id","expected_version","startedAt","jobTitle","department","role"],"additionalProperties":false}'::jsonb,
    36, true, now(), '["Customers.Write"]'::jsonb, 'transfer_company_contact', 'canonical', false
  ),
  (
    'set_related_party_default', 'customers', 'Set related-party default',
    'Set one deterministic, destination-aware related-party default after operator approval.',
    'multideck_dexter_action_set_related_party_default',
    '{"type":"object","properties":{"target_id":{"type":"string"},"rule_id":{"type":["string","null"]},"expected_version":{"type":"integer","minimum":1},"default":{"type":"object","properties":{"partyRoleCode":{"type":"string"},"destinationCountryCode":{"type":["string","null"]},"destinationUnlocode":{"type":["string","null"]},"destinationPostcode":{"type":["string","null"]},"targetOrganisationId":{"type":"string"},"targetAddressId":{"type":["string","null"]},"targetContactId":{"type":["string","null"]},"priority":{"type":"integer","minimum":1,"maximum":10000},"effectiveFrom":{"type":"string"},"effectiveTo":{"type":["string","null"]},"isActive":{"type":"boolean"}},"required":["partyRoleCode","destinationCountryCode","destinationUnlocode","destinationPostcode","targetOrganisationId","targetAddressId","targetContactId","priority","effectiveFrom","effectiveTo","isActive"],"additionalProperties":false}},"required":["target_id","rule_id","expected_version","default"],"additionalProperties":false}'::jsonb,
    37, true, now(), '["Customers.Write"]'::jsonb, 'set_related_party_default', 'canonical', false
  )
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Name" = 'Companies',
    "AIDexterDomain_Description" = 'Companies, operational types, responsible offices, contextual addresses, durable contact history and related-party defaults available to the signed-in operator.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customers';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Name" = 'Companies and contacts',
    "AIDexterWatchCapability_Description" = 'Watch company setup, offices, contextual addresses, contact employment and email history, and related-party defaults for meaningful changes.',
    "AIDexterWatchCapability_FieldsJSON" = (
      select jsonb_agg(value order by value)
      from (select distinct value from jsonb_array_elements_text(
        coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb)
        || '["accountCode","scopeCode","responsibleOffices","addresses","contactEmployment","contactEmails","relatedPartyDefaults"]'::jsonb
      )) fields(value)
    )
where "AIDexterWatchCapability_Code" = 'customers';

create or replace function public._multideck_crm_organisation_foundation_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_company_id uuid;
  v_source_id uuid;
  v_account_profile_id uuid;
  v_address_id uuid;
  v_contact_id uuid;
begin
  if tg_table_name = 'CRM_AccountOfficeAssignments' then
    v_company_id := (v_row ->> 'CRMAccountOffice_CompanyID')::uuid;
    v_account_profile_id := (v_row ->> 'CRMAccountOffice_AccountID')::uuid;
    select "CRMAccount_OrgID" into v_source_id from public."CRM_AccountProfiles" where "CRMAccount_ID" = v_account_profile_id;
  elsif tg_table_name = 'CRM_ContactOrganisationAssignments' then
    v_company_id := (v_row ->> 'CRMContactOrg_CompanyID')::uuid;
    v_source_id := (v_row ->> 'CRMContactOrg_ContactID')::uuid;
  elsif tg_table_name = 'OrgContact_Emails' then
    v_contact_id := (v_row ->> 'OrgContact_ID')::uuid; v_source_id := v_contact_id;
    select profile."CRMAccount_CompanyID" into v_company_id
    from public."Org_Contacts" contact
    join public."CRM_AccountProfiles" profile on profile."CRMAccount_OrgID" = contact."Org_ID" and not profile."CRMAccount_IsDeleted"
    where contact."OrgContact_ID" = v_contact_id limit 1;
    v_old := v_old - 'OrgContactEmail_Email'; v_new := v_new - 'OrgContactEmail_Email';
  elsif tg_table_name = 'Org_RelatedPartyDefaults' then
    v_company_id := (v_row ->> 'OrgRelatedDefault_CompanyID')::uuid;
    v_source_id := (v_row ->> 'OrgRelatedDefault_SourceOrgID')::uuid;
  else
    if tg_table_name = 'Org_Addresses' then v_address_id := (v_row ->> 'OrgAdd_ID')::uuid;
    elsif tg_table_name = 'Org_AddressTypes' then v_address_id := (v_row ->> 'OrgAdd_ID')::uuid;
    elsif tg_table_name = 'Org_AddressOpeningHours' then v_address_id := (v_row ->> 'OrgAddHours_OrgAddID')::uuid;
    elsif tg_table_name = 'Org_AddressOpeningOverrides' then v_address_id := (v_row ->> 'OrgAddOverride_OrgAddID')::uuid;
    end if;
    select address."Org_ID", profile."CRMAccount_CompanyID" into v_source_id, v_company_id
    from public."Org_Addresses" address
    join public."CRM_AccountProfiles" profile on profile."CRMAccount_OrgID" = address."Org_ID" and not profile."CRMAccount_IsDeleted"
    where address."OrgAdd_ID" = v_address_id limit 1;
    v_old := v_old - 'OrgAdd_MainEmail' - 'OrgAdd_MainPhone';
    v_new := v_new - 'OrgAdd_MainEmail' - 'OrgAdd_MainPhone';
  end if;
  if v_company_id is not null and v_source_id is not null and v_old is distinct from v_new and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'customers'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (v_company_id, 'customers', tg_table_name, v_source_id, v_old, v_new);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_AccountOfficeAssignments_customer_watch" on public."CRM_AccountOfficeAssignments";
create trigger "TR_CRM_AccountOfficeAssignments_customer_watch" after insert or update or delete on public."CRM_AccountOfficeAssignments"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_CRM_ContactOrganisationAssignments_customer_watch" on public."CRM_ContactOrganisationAssignments";
create trigger "TR_CRM_ContactOrganisationAssignments_customer_watch" after insert or update or delete on public."CRM_ContactOrganisationAssignments"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_OrgContact_Emails_customer_watch" on public."OrgContact_Emails";
create trigger "TR_OrgContact_Emails_customer_watch" after insert or update on public."OrgContact_Emails"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_Org_Addresses_customer_watch" on public."Org_Addresses";
create trigger "TR_Org_Addresses_customer_watch" after insert or update of "Org_NameOverride", "OrgAdd_Line1", "OrgAdd_TownCity", "OrgAdd_Country", "OrgAdd_UNLOCODE", "OrgAdd_TimeZone", "OrgAdd_IsActive" on public."Org_Addresses"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_Org_AddressTypes_customer_watch" on public."Org_AddressTypes";
create trigger "TR_Org_AddressTypes_customer_watch" after insert or update or delete on public."Org_AddressTypes"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_Org_AddressOpeningHours_customer_watch" on public."Org_AddressOpeningHours";
create trigger "TR_Org_AddressOpeningHours_customer_watch" after insert or update or delete on public."Org_AddressOpeningHours"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_Org_AddressOpeningOverrides_customer_watch" on public."Org_AddressOpeningOverrides";
create trigger "TR_Org_AddressOpeningOverrides_customer_watch" after insert or update or delete on public."Org_AddressOpeningOverrides"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();
drop trigger if exists "TR_Org_RelatedPartyDefaults_customer_watch" on public."Org_RelatedPartyDefaults";
create trigger "TR_Org_RelatedPartyDefaults_customer_watch" after insert or update on public."Org_RelatedPartyDefaults"
for each row execute function public._multideck_crm_organisation_foundation_watch_signal();

revoke all on function public._multideck_crm_account_code(text, text) from public, anon, authenticated;
revoke all on function public._multideck_crm_organisation_foundation_watch_signal() from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_company_foundation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_upsert_company_address(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_transfer_company_contact(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_set_related_party_default(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_update_organisation_foundation(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_crm_create_account_prefoundation_20260820(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_crm_create_contact_prefoundation_20260820(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_account(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_contact(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_transfer_contact(uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_upsert_organisation_address(uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_archive_organisation_address(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.multideck_crm_upsert_related_party_default(uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_organisation_address_options(uuid, text, timestamptz) from public, anon;
revoke all on function public.multideck_crm_resolve_related_party_default(uuid, text, text, text, text, date) from public, anon;
grant execute on function public.multideck_crm_update_organisation_foundation(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_customers(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_update_company_foundation(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_upsert_company_address(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_transfer_company_contact(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_set_related_party_default(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_crm_create_account(uuid, jsonb) to service_role;
grant execute on function public.multideck_crm_create_contact(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_transfer_contact(uuid, uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_upsert_organisation_address(uuid, uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_archive_organisation_address(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.multideck_crm_upsert_related_party_default(uuid, uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_organisation_address_options(uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.multideck_crm_resolve_related_party_default(uuid, text, text, text, text, date) to authenticated, service_role;

commit;
