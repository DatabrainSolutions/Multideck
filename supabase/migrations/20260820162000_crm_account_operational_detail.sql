-- Dense Companies account workspace: durable role, finance, customs, privacy,
-- document and booking-instruction records. This is deliberately additive: it
-- does not rewrite existing organisation codes or replace the finance ledger.

begin;

create table if not exists public."CRM_AccountOperationalProfiles" (
  "CRMAccountOps_ID" uuid primary key default gen_random_uuid(),
  "CRMAccountOps_AccountID" uuid not null unique references public."CRM_AccountProfiles"("CRMAccount_ID") on delete cascade,
  "CRMAccountOps_OrgID" uuid not null unique references public."Org_Master"("Org_id") on delete cascade,
  "CRMAccountOps_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMAccountOps_RoleProfilesJSON" jsonb not null default '{}'::jsonb,
  "CRMAccountOps_InvoicePreferencesJSON" jsonb not null default '{}'::jsonb,
  "CRMAccountOps_CustomsJSON" jsonb not null default '{}'::jsonb,
  "CRMAccountOps_PrivacyJSON" jsonb not null default '{}'::jsonb,
  "CRMAccountOps_EditVersion" bigint not null default 1,
  "CRMAccountOps_UpdatedAt" timestamptz not null default now(),
  "CRMAccountOps_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CRM_AccountOperationalProfiles_role_object" check (jsonb_typeof("CRMAccountOps_RoleProfilesJSON") = 'object'),
  constraint "CRM_AccountOperationalProfiles_invoice_object" check (jsonb_typeof("CRMAccountOps_InvoicePreferencesJSON") = 'object'),
  constraint "CRM_AccountOperationalProfiles_customs_object" check (jsonb_typeof("CRMAccountOps_CustomsJSON") = 'object'),
  constraint "CRM_AccountOperationalProfiles_privacy_object" check (jsonb_typeof("CRMAccountOps_PrivacyJSON") = 'object')
);

create table if not exists public."CRM_AccountOperationalInstructions" (
  "CRMAccountInstruction_ID" uuid primary key default gen_random_uuid(),
  "CRMAccountInstruction_AccountID" uuid not null references public."CRM_AccountProfiles"("CRMAccount_ID") on delete cascade,
  "CRMAccountInstruction_OrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "CRMAccountInstruction_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMAccountInstruction_KindCode" varchar(40) not null default 'booking',
  "CRMAccountInstruction_Title" varchar(160) not null,
  "CRMAccountInstruction_Body" text not null,
  "CRMAccountInstruction_DestinationCountryCode" varchar(2),
  "CRMAccountInstruction_DestinationUNLOCODE" varchar(5),
  "CRMAccountInstruction_AddressID" uuid references public."Org_Addresses"("OrgAdd_ID") on delete set null,
  "CRMAccountInstruction_ContactID" uuid references public."Org_Contacts"("OrgContact_ID") on delete set null,
  "CRMAccountInstruction_Priority" integer not null default 100,
  "CRMAccountInstruction_EffectiveFrom" date not null default current_date,
  "CRMAccountInstruction_EffectiveTo" date,
  "CRMAccountInstruction_IsActive" boolean not null default true,
  "CRMAccountInstruction_CreatedAt" timestamptz not null default now(),
  "CRMAccountInstruction_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CRMAccountInstruction_UpdatedAt" timestamptz not null default now(),
  "CRMAccountInstruction_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CRM_AccountOperationalInstructions_kind" check ("CRMAccountInstruction_KindCode" in ('booking','collection','delivery','customs','shipping_line','invoicing','general')),
  constraint "CRM_AccountOperationalInstructions_country" check ("CRMAccountInstruction_DestinationCountryCode" is null or "CRMAccountInstruction_DestinationCountryCode" ~ '^[A-Z]{2}$'),
  constraint "CRM_AccountOperationalInstructions_unlocode" check ("CRMAccountInstruction_DestinationUNLOCODE" is null or "CRMAccountInstruction_DestinationUNLOCODE" ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
  constraint "CRM_AccountOperationalInstructions_priority" check ("CRMAccountInstruction_Priority" between 0 and 10000),
  constraint "CRM_AccountOperationalInstructions_dates" check ("CRMAccountInstruction_EffectiveTo" is null or "CRMAccountInstruction_EffectiveTo" >= "CRMAccountInstruction_EffectiveFrom")
);

create table if not exists public."CRM_AccountDocumentRecords" (
  "CRMAccountDocument_ID" uuid primary key default gen_random_uuid(),
  "CRMAccountDocument_AccountID" uuid not null references public."CRM_AccountProfiles"("CRMAccount_ID") on delete cascade,
  "CRMAccountDocument_OrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "CRMAccountDocument_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMAccountDocument_TypeCode" varchar(60) not null default 'supporting_document',
  "CRMAccountDocument_Title" varchar(200) not null,
  "CRMAccountDocument_Notes" text,
  "CRMAccountDocument_RepresentationType" varchar(20),
  "CRMAccountDocument_SourceDocumentID" uuid references public."CRM_CustomerDocuments"("CRMCustomerDocument_ID") on delete set null,
  "CRMAccountDocument_ExternalReference" varchar(240),
  "CRMAccountDocument_ValidFrom" date,
  "CRMAccountDocument_ValidTo" date,
  "CRMAccountDocument_StatusCode" varchar(40) not null default 'active',
  "CRMAccountDocument_CreatedAt" timestamptz not null default now(),
  "CRMAccountDocument_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CRMAccountDocument_UpdatedAt" timestamptz not null default now(),
  "CRMAccountDocument_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CRM_AccountDocumentRecords_representation" check ("CRMAccountDocument_RepresentationType" is null or "CRMAccountDocument_RepresentationType" in ('direct','indirect')),
  constraint "CRM_AccountDocumentRecords_dates" check ("CRMAccountDocument_ValidTo" is null or "CRMAccountDocument_ValidFrom" is null or "CRMAccountDocument_ValidTo" >= "CRMAccountDocument_ValidFrom")
);

create table if not exists public."Org_AddressOperationalDetails" (
  "OrgAddOperational_OrgAddID" uuid primary key references public."Org_Addresses"("OrgAdd_ID") on delete cascade,
  "OrgAddOperational_OrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "OrgAddOperational_AppointmentRequired" boolean not null default false,
  "OrgAddOperational_AdvanceBookingHours" integer not null default 0,
  "OrgAddOperational_BookingInstructions" text,
  "OrgAddOperational_CollectionInstructions" text,
  "OrgAddOperational_DeliveryInstructions" text,
  "OrgAddOperational_UpdatedAt" timestamptz not null default now(),
  "OrgAddOperational_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "Org_AddressOperationalDetails_advance" check ("OrgAddOperational_AdvanceBookingHours" between 0 and 8760)
);

create index if not exists "IX_CRM_AccountOperationalInstructions_resolve"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_OrgID", "CRMAccountInstruction_IsActive", "CRMAccountInstruction_KindCode", "CRMAccountInstruction_Priority", "CRMAccountInstruction_EffectiveFrom");
create index if not exists "IX_CRM_AccountDocumentRecords_account"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_AccountID", "CRMAccountDocument_StatusCode", "CRMAccountDocument_UpdatedAt" desc);
create index if not exists "IX_CRM_AccountOperationalProfiles_company"
  on public."CRM_AccountOperationalProfiles" ("CRMAccountOps_CompanyID");
create index if not exists "IX_CRM_AccountOperationalProfiles_updated_by"
  on public."CRM_AccountOperationalProfiles" ("CRMAccountOps_UpdatedBy");
create index if not exists "IX_CRM_AccountOperationalInstructions_account"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_AccountID");
create index if not exists "IX_CRM_AccountOperationalInstructions_company"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_CompanyID");
create index if not exists "IX_CRM_AccountOperationalInstructions_address"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_AddressID");
create index if not exists "IX_CRM_AccountOperationalInstructions_contact"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_ContactID");
create index if not exists "IX_CRM_AccountOperationalInstructions_created_by"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_CreatedBy");
create index if not exists "IX_CRM_AccountOperationalInstructions_updated_by"
  on public."CRM_AccountOperationalInstructions" ("CRMAccountInstruction_UpdatedBy");
create index if not exists "IX_CRM_AccountDocumentRecords_org"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_OrgID");
create index if not exists "IX_CRM_AccountDocumentRecords_company"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_CompanyID");
create index if not exists "IX_CRM_AccountDocumentRecords_source_document"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_SourceDocumentID");
create index if not exists "IX_CRM_AccountDocumentRecords_created_by"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_CreatedBy");
create index if not exists "IX_CRM_AccountDocumentRecords_updated_by"
  on public."CRM_AccountDocumentRecords" ("CRMAccountDocument_UpdatedBy");
create index if not exists "IX_Org_AddressOperationalDetails_org"
  on public."Org_AddressOperationalDetails" ("OrgAddOperational_OrgID");
create index if not exists "IX_Org_AddressOperationalDetails_updated_by"
  on public."Org_AddressOperationalDetails" ("OrgAddOperational_UpdatedBy");

alter table public."CRM_AccountOperationalProfiles" enable row level security;
alter table public."CRM_AccountOperationalInstructions" enable row level security;
alter table public."CRM_AccountDocumentRecords" enable row level security;
alter table public."Org_AddressOperationalDetails" enable row level security;
revoke all on table public."CRM_AccountOperationalProfiles", public."CRM_AccountOperationalInstructions", public."CRM_AccountDocumentRecords", public."Org_AddressOperationalDetails" from public, anon, authenticated;
grant select, insert, update, delete on table public."CRM_AccountOperationalProfiles", public."CRM_AccountOperationalInstructions", public."CRM_AccountDocumentRecords", public."Org_AddressOperationalDetails" to service_role;

-- Sage 50 compatibility applies to new/explicitly edited codes. Existing
-- imported codes are intentionally untouched. The supplied mnemonic is kept,
-- normalized and capped at eight characters; uniqueness remains enforced by
-- the existing case-insensitive organisation-code index.
create or replace function public._multideck_crm_account_code(p_value text, p_scope text)
returns text language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare v_code text; v_supplied text:=btrim(coalesce(p_value,''));
begin
  if lower(coalesce(nullif(btrim(p_scope), ''), 'standard')) not in ('standard','national','global') then
    raise exception 'Choose a standard, national or global organisation scope.' using errcode = '22023';
  end if;
  -- A pre-existing imported code is compatibility data, even when it predates
  -- the Sage 50 rule. Preserve that exact value until the operator edits it.
  if length(regexp_replace(upper(v_supplied),'[^A-Z0-9]','','g'))>8 and exists(
    select 1 from public."Org_Master" where lower(btrim("Org_AccCode"))=lower(v_supplied)
  ) then return v_supplied; end if;
  v_code := left(regexp_replace(upper(v_supplied), '[^A-Z0-9]', '', 'g'), 8);
  if length(v_code) < 2 then raise exception 'Enter an organisation code with at least two letters or numbers.' using errcode = '22023'; end if;
  return v_code;
end;
$$;

-- New accounts use NAME5 + LOCATION3. On collision the final two characters
-- become 01..99. Existing imported codes are never rewritten by this migration.
alter function public.multideck_crm_create_account(uuid,jsonb)
  rename to _multideck_crm_create_account_pre_sage8_20260820;
create function public.multideck_crm_create_account(p_actor_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb; v_org uuid; v_name text; v_location text; v_base text; v_candidate text; v_n integer:=0;
begin
  v_result:=public._multideck_crm_create_account_pre_sage8_20260820(p_actor_user_id,p_input);
  v_org:=(v_result->>'id')::uuid;
  -- Explicit codes are import/conversion data. The wrapped create path has
  -- already validated them with the eight-character helper, so preserve them.
  if nullif(btrim(p_input->>'accountCode'),'') is not null then
    select "Org_AccCode" into v_candidate from public."Org_Master" where "Org_id"=v_org;
    return v_result||jsonb_build_object('accountCode',v_candidate);
  end if;
  v_name:=regexp_replace(upper(coalesce(p_input->>'name','')),'[^A-Z0-9]','','g');
  v_location:=regexp_replace(upper(coalesce(nullif(p_input->>'townCity',''),p_input->>'countryCode','')),'[^A-Z0-9]','','g');
  v_base:=left(v_name,5)||left(v_location,3);
  if length(v_base)<2 then v_base:='ACCOUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sage50-account-code:'||left(v_base,6),0));
  loop
    v_candidate:=case when v_n=0 then left(v_base,8) else left(v_base,6)||lpad(v_n::text,2,'0') end;
    exit when not exists(select 1 from public."Org_Master" where lower("Org_AccCode")=lower(v_candidate) and "Org_id"<>v_org);
    v_n:=v_n+1; if v_n>99 then raise exception 'No Sage 50-compatible account code is available for this mnemonic.' using errcode='23505'; end if;
  end loop;
  update public."Org_Master" set "Org_AccCode"=v_candidate where "Org_id"=v_org;
  return v_result||jsonb_build_object('accountCode',v_candidate);
end; $$;
revoke all on function public._multideck_crm_create_account_pre_sage8_20260820(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.multideck_crm_create_account(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_crm_create_account(uuid,jsonb) to service_role;

create or replace function public.multideck_crm_resolve_account_instructions(
  p_org_id uuid, p_kind_code text default null, p_destination_country_code text default null,
  p_destination_unlocode text default null, p_on_date date default current_date,
  p_address_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public stable as $$
declare v_instructions jsonb; v_address_instructions jsonb:='[]'::jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.app_user_can_access_organisation(p_org_id) then raise exception 'Account not found.' using errcode = '42501'; end if;
  if coalesce(auth.role(),'') <> 'service_role' and not exists(
    select 1 from public."cmp_Users" app_user
    where app_user."Auth_User_ID"=auth.uid() and app_user."Company_ID"=public.app_current_company_id()
      and (
        public._multideck_crm_has_permission(app_user."User_ID",'Customers.Read')
        or public._multideck_crm_has_permission(app_user."User_ID",'Bookings.Read')
      )
  ) then raise exception 'You do not have permission to read these account instructions.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i."CRMAccountInstruction_ID", 'kind', i."CRMAccountInstruction_KindCode", 'title', i."CRMAccountInstruction_Title",
      'body', i."CRMAccountInstruction_Body", 'addressId', i."CRMAccountInstruction_AddressID", 'contactId', i."CRMAccountInstruction_ContactID",
      'priority', i."CRMAccountInstruction_Priority", 'destinationCountryCode', i."CRMAccountInstruction_DestinationCountryCode",
      'destinationUnlocode', i."CRMAccountInstruction_DestinationUNLOCODE"
    ) order by i."CRMAccountInstruction_Priority", i."CRMAccountInstruction_Title"), '[]'::jsonb)
  into v_instructions
  from public."CRM_AccountOperationalInstructions" i
  where i."CRMAccountInstruction_OrgID" = p_org_id and i."CRMAccountInstruction_IsActive"
    and (p_kind_code is null or i."CRMAccountInstruction_KindCode" = lower(p_kind_code))
    and (i."CRMAccountInstruction_AddressID" is null or i."CRMAccountInstruction_AddressID"=p_address_id)
    and i."CRMAccountInstruction_EffectiveFrom" <= p_on_date
    and (i."CRMAccountInstruction_EffectiveTo" is null or i."CRMAccountInstruction_EffectiveTo" >= p_on_date)
    and (i."CRMAccountInstruction_DestinationCountryCode" is null or i."CRMAccountInstruction_DestinationCountryCode" = upper(p_destination_country_code))
    and (i."CRMAccountInstruction_DestinationUNLOCODE" is null or i."CRMAccountInstruction_DestinationUNLOCODE" = upper(p_destination_unlocode));
  if p_address_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id','address:'||p_address_id::text||':'||rule.kind,'kind',rule.kind,'title',rule.title,'body',rule.body,
      'addressId',p_address_id,'contactId',null,'priority',50,'source','address',
      'appointmentRequired',details."OrgAddOperational_AppointmentRequired",
      'advanceBookingHours',details."OrgAddOperational_AdvanceBookingHours"
    ) order by rule.priority),'[]'::jsonb) into v_address_instructions
    from public."Org_AddressOperationalDetails" details
    cross join lateral (values
      ('booking','Address booking instructions',details."OrgAddOperational_BookingInstructions",1),
      ('collection','Address collection instructions',details."OrgAddOperational_CollectionInstructions",2),
      ('delivery','Address delivery instructions',details."OrgAddOperational_DeliveryInstructions",3)
    ) rule(kind,title,body,priority)
    where details."OrgAddOperational_OrgID"=p_org_id and details."OrgAddOperational_OrgAddID"=p_address_id
      and nullif(btrim(rule.body),'') is not null and (p_kind_code is null or rule.kind=lower(p_kind_code));
  end if;
  return v_instructions||v_address_instructions;
end;
$$;

revoke all on function public.multideck_crm_resolve_account_instructions(uuid,text,text,text,date,uuid) from public, anon;
grant execute on function public.multideck_crm_resolve_account_instructions(uuid,text,text,text,date,uuid) to authenticated, service_role;

create or replace function public.multideck_crm_replace_account_operations(
  p_actor_user_id uuid, p_org_id uuid, p_expected_version bigint, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_item jsonb;
  v_address uuid;
  v_instruction_address uuid;
  v_instruction_contact uuid;
  v_source_document uuid;
  v_old_signal jsonb;
  v_new_signal jsonb;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_org_id);
  select * into v_profile from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_org_id and not "CRMAccount_IsDeleted" order by "CRMAccount_ID" limit 1 for update;
  if not found then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_profile."CRMAccount_EditVersion" then
    raise exception 'CRM_CONFLICT:This account changed since it was loaded.' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'roleProfiles',coalesce((select md5("CRMAccountOps_RoleProfilesJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'invoicePreferences',coalesce((select md5("CRMAccountOps_InvoicePreferencesJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'customs',coalesce((select md5("CRMAccountOps_CustomsJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'privacy',coalesce((select md5("CRMAccountOps_PrivacyJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'instructions',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("CRMAccountInstruction_ID","CRMAccountInstruction_KindCode","CRMAccountInstruction_Title",md5("CRMAccountInstruction_Body"),"CRMAccountInstruction_DestinationCountryCode","CRMAccountInstruction_DestinationUNLOCODE","CRMAccountInstruction_AddressID","CRMAccountInstruction_ContactID","CRMAccountInstruction_IsActive") order by "CRMAccountInstruction_ID"),'[]'::jsonb)::text) from public."CRM_AccountOperationalInstructions" where "CRMAccountInstruction_AccountID"=v_profile."CRMAccount_ID"),md5('[]')),
    'documents',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("CRMAccountDocument_ID","CRMAccountDocument_TypeCode","CRMAccountDocument_Title",md5(coalesce("CRMAccountDocument_Notes",'')),"CRMAccountDocument_SourceDocumentID","CRMAccountDocument_StatusCode") order by "CRMAccountDocument_ID"),'[]'::jsonb)::text) from public."CRM_AccountDocumentRecords" where "CRMAccountDocument_AccountID"=v_profile."CRMAccount_ID"),md5('[]')),
    'addressBookingRules',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("OrgAddOperational_OrgAddID","OrgAddOperational_AppointmentRequired","OrgAddOperational_AdvanceBookingHours",md5(coalesce("OrgAddOperational_BookingInstructions",'')),md5(coalesce("OrgAddOperational_CollectionInstructions",'')),md5(coalesce("OrgAddOperational_DeliveryInstructions",''))) order by "OrgAddOperational_OrgAddID"),'[]'::jsonb)::text) from public."Org_AddressOperationalDetails" where "OrgAddOperational_OrgID"=p_org_id),md5('[]'))
  ) into v_old_signal;
  if jsonb_typeof(coalesce(p_input->'roleProfiles','{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_input->'invoicePreferences','{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_input->'customs','{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_input->'privacy','{}'::jsonb)) <> 'object' then
    raise exception 'Account operational profiles must be objects.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_input->'instructions','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_input->'documents','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_input->'addressOperations','[]'::jsonb)) <> 'array' then
    raise exception 'Instructions, documents and address operations must be lists.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_input->'instructions','[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(p_input->'documents','[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(p_input->'addressOperations','[]'::jsonb)) > 100 then
    raise exception 'Enter no more than 100 operational records in one update.' using errcode = '22023';
  end if;

  insert into public."CRM_AccountOperationalProfiles"(
    "CRMAccountOps_AccountID","CRMAccountOps_OrgID","CRMAccountOps_CompanyID",
    "CRMAccountOps_RoleProfilesJSON","CRMAccountOps_InvoicePreferencesJSON","CRMAccountOps_CustomsJSON","CRMAccountOps_PrivacyJSON",
    "CRMAccountOps_UpdatedBy"
  ) values (
    v_profile."CRMAccount_ID",p_org_id,v_profile."CRMAccount_CompanyID",
    coalesce(p_input->'roleProfiles','{}'::jsonb),coalesce(p_input->'invoicePreferences','{}'::jsonb),
    coalesce(p_input->'customs','{}'::jsonb),coalesce(p_input->'privacy','{}'::jsonb),p_actor_user_id
  ) on conflict ("CRMAccountOps_AccountID") do update set
    "CRMAccountOps_RoleProfilesJSON"=excluded."CRMAccountOps_RoleProfilesJSON",
    "CRMAccountOps_InvoicePreferencesJSON"=excluded."CRMAccountOps_InvoicePreferencesJSON",
    "CRMAccountOps_CustomsJSON"=excluded."CRMAccountOps_CustomsJSON",
    "CRMAccountOps_PrivacyJSON"=excluded."CRMAccountOps_PrivacyJSON",
    "CRMAccountOps_EditVersion"=public."CRM_AccountOperationalProfiles"."CRMAccountOps_EditVersion"+1,
    "CRMAccountOps_UpdatedAt"=now(),"CRMAccountOps_UpdatedBy"=p_actor_user_id;

  delete from public."CRM_AccountOperationalInstructions" where "CRMAccountInstruction_AccountID"=v_profile."CRMAccount_ID";
  for v_item in select value from jsonb_array_elements(coalesce(p_input->'instructions','[]'::jsonb)) loop
    if nullif(btrim(v_item->>'title'),'') is null or nullif(btrim(v_item->>'body'),'') is null then
      raise exception 'Every instruction needs a title and instruction text.' using errcode = '22023'; end if;
    v_instruction_address := nullif(v_item->>'addressId','')::uuid;
    v_instruction_contact := nullif(v_item->>'contactId','')::uuid;
    if v_instruction_address is not null and not exists(
      select 1 from public."Org_Addresses" where "OrgAdd_ID"=v_instruction_address and "Org_ID"=p_org_id and "OrgAdd_IsActive"
    ) then raise exception 'Choose an active address belonging to this account.' using errcode = '22023'; end if;
    if v_instruction_contact is not null and not exists(
      select 1 from public."Org_Contacts" where "OrgContact_ID"=v_instruction_contact and "Org_ID"=p_org_id
    ) then raise exception 'Choose a contact belonging to this account.' using errcode = '22023'; end if;
    insert into public."CRM_AccountOperationalInstructions"(
      "CRMAccountInstruction_ID","CRMAccountInstruction_AccountID","CRMAccountInstruction_OrgID","CRMAccountInstruction_CompanyID",
      "CRMAccountInstruction_KindCode","CRMAccountInstruction_Title","CRMAccountInstruction_Body",
      "CRMAccountInstruction_DestinationCountryCode","CRMAccountInstruction_DestinationUNLOCODE","CRMAccountInstruction_AddressID","CRMAccountInstruction_ContactID",
      "CRMAccountInstruction_Priority","CRMAccountInstruction_EffectiveFrom","CRMAccountInstruction_EffectiveTo","CRMAccountInstruction_IsActive",
      "CRMAccountInstruction_CreatedBy","CRMAccountInstruction_UpdatedBy"
    ) values (
      coalesce(nullif(v_item->>'id','')::uuid,gen_random_uuid()),v_profile."CRMAccount_ID",p_org_id,v_profile."CRMAccount_CompanyID",
      lower(coalesce(nullif(v_item->>'kind',''),'booking')),left(btrim(v_item->>'title'),160),btrim(v_item->>'body'),
      upper(nullif(btrim(v_item->>'destinationCountryCode'),'')),upper(nullif(btrim(v_item->>'destinationUnlocode'),'')),
      v_instruction_address,v_instruction_contact,coalesce((v_item->>'priority')::integer,100),
      coalesce(nullif(v_item->>'effectiveFrom','')::date,current_date),nullif(v_item->>'effectiveTo','')::date,
      coalesce((v_item->>'isActive')::boolean,true),p_actor_user_id,p_actor_user_id
    );
  end loop;

  delete from public."CRM_AccountDocumentRecords" where "CRMAccountDocument_AccountID"=v_profile."CRMAccount_ID";
  for v_item in select value from jsonb_array_elements(coalesce(p_input->'documents','[]'::jsonb)) loop
    if nullif(btrim(v_item->>'title'),'') is null then raise exception 'Every document record needs a title.' using errcode = '22023'; end if;
    v_source_document := nullif(v_item->>'sourceDocumentId','')::uuid;
    if v_source_document is not null and not exists(
      select 1 from public."CRM_CustomerDocuments"
      where "CRMCustomerDocument_ID"=v_source_document and "CRMCustomerDocument_CustomerOrgID"=p_org_id
    ) then
      raise exception 'Choose a document linked to this account.' using errcode = '22023';
    end if;
    insert into public."CRM_AccountDocumentRecords"(
      "CRMAccountDocument_ID","CRMAccountDocument_AccountID","CRMAccountDocument_OrgID","CRMAccountDocument_CompanyID",
      "CRMAccountDocument_TypeCode","CRMAccountDocument_Title","CRMAccountDocument_Notes","CRMAccountDocument_RepresentationType",
      "CRMAccountDocument_SourceDocumentID","CRMAccountDocument_ExternalReference","CRMAccountDocument_ValidFrom","CRMAccountDocument_ValidTo",
      "CRMAccountDocument_StatusCode","CRMAccountDocument_CreatedBy","CRMAccountDocument_UpdatedBy"
    ) values (
      coalesce(nullif(v_item->>'id','')::uuid,gen_random_uuid()),v_profile."CRMAccount_ID",p_org_id,v_profile."CRMAccount_CompanyID",
      lower(coalesce(nullif(v_item->>'type',''),'supporting_document')),left(btrim(v_item->>'title'),200),nullif(btrim(v_item->>'notes'),''),
      lower(nullif(btrim(v_item->>'representationType'),'')),v_source_document,nullif(btrim(v_item->>'externalReference'),''),
      nullif(v_item->>'validFrom','')::date,nullif(v_item->>'validTo','')::date,lower(coalesce(nullif(v_item->>'status',''),'active')),p_actor_user_id,p_actor_user_id
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_input->'addressOperations','[]'::jsonb)) loop
    v_address := nullif(v_item->>'addressId','')::uuid;
    if not exists(select 1 from public."Org_Addresses" where "OrgAdd_ID"=v_address and "Org_ID"=p_org_id and "OrgAdd_IsActive") then
      raise exception 'Choose an active address belonging to this account.' using errcode = '22023'; end if;
    insert into public."Org_AddressOperationalDetails"(
      "OrgAddOperational_OrgAddID","OrgAddOperational_OrgID","OrgAddOperational_AppointmentRequired","OrgAddOperational_AdvanceBookingHours",
      "OrgAddOperational_BookingInstructions","OrgAddOperational_CollectionInstructions","OrgAddOperational_DeliveryInstructions","OrgAddOperational_UpdatedBy"
    ) values (
      v_address,p_org_id,coalesce((v_item->>'appointmentRequired')::boolean,false),coalesce((v_item->>'advanceBookingHours')::integer,0),
      nullif(btrim(v_item->>'bookingInstructions'),''),nullif(btrim(v_item->>'collectionInstructions'),''),nullif(btrim(v_item->>'deliveryInstructions'),''),p_actor_user_id
    ) on conflict ("OrgAddOperational_OrgAddID") do update set
      "OrgAddOperational_AppointmentRequired"=excluded."OrgAddOperational_AppointmentRequired",
      "OrgAddOperational_AdvanceBookingHours"=excluded."OrgAddOperational_AdvanceBookingHours",
      "OrgAddOperational_BookingInstructions"=excluded."OrgAddOperational_BookingInstructions",
      "OrgAddOperational_CollectionInstructions"=excluded."OrgAddOperational_CollectionInstructions",
      "OrgAddOperational_DeliveryInstructions"=excluded."OrgAddOperational_DeliveryInstructions",
      "OrgAddOperational_UpdatedAt"=now(),"OrgAddOperational_UpdatedBy"=p_actor_user_id;
  end loop;

  update public."CRM_AccountProfiles" set "CRMAccount_EditVersion"="CRMAccount_EditVersion"+1,
    "CRMAccount_UpdatedAt"=now(),"CRMAccount_UpdatedBy"=p_actor_user_id where "CRMAccount_ID"=v_profile."CRMAccount_ID";
  select jsonb_build_object(
    'roleProfiles',coalesce((select md5("CRMAccountOps_RoleProfilesJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'invoicePreferences',coalesce((select md5("CRMAccountOps_InvoicePreferencesJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'customs',coalesce((select md5("CRMAccountOps_CustomsJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'privacy',coalesce((select md5("CRMAccountOps_PrivacyJSON"::text) from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_AccountID"=v_profile."CRMAccount_ID"),''),
    'instructions',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("CRMAccountInstruction_ID","CRMAccountInstruction_KindCode","CRMAccountInstruction_Title",md5("CRMAccountInstruction_Body"),"CRMAccountInstruction_DestinationCountryCode","CRMAccountInstruction_DestinationUNLOCODE","CRMAccountInstruction_AddressID","CRMAccountInstruction_ContactID","CRMAccountInstruction_IsActive") order by "CRMAccountInstruction_ID"),'[]'::jsonb)::text) from public."CRM_AccountOperationalInstructions" where "CRMAccountInstruction_AccountID"=v_profile."CRMAccount_ID"),md5('[]')),
    'documents',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("CRMAccountDocument_ID","CRMAccountDocument_TypeCode","CRMAccountDocument_Title",md5(coalesce("CRMAccountDocument_Notes",'')),"CRMAccountDocument_SourceDocumentID","CRMAccountDocument_StatusCode") order by "CRMAccountDocument_ID"),'[]'::jsonb)::text) from public."CRM_AccountDocumentRecords" where "CRMAccountDocument_AccountID"=v_profile."CRMAccount_ID"),md5('[]')),
    'addressBookingRules',coalesce((select md5(coalesce(jsonb_agg(jsonb_build_array("OrgAddOperational_OrgAddID","OrgAddOperational_AppointmentRequired","OrgAddOperational_AdvanceBookingHours",md5(coalesce("OrgAddOperational_BookingInstructions",'')),md5(coalesce("OrgAddOperational_CollectionInstructions",'')),md5(coalesce("OrgAddOperational_DeliveryInstructions",''))) order by "OrgAddOperational_OrgAddID"),'[]'::jsonb)::text) from public."Org_AddressOperationalDetails" where "OrgAddOperational_OrgID"=p_org_id),md5('[]'))
  ) into v_new_signal;
  if v_old_signal is distinct from v_new_signal and exists(
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_profile."CRMAccount_CompanyID"
      and watch."AIDexterWatch_CapabilityCode"='customers'
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=p_org_id)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
    ) values(v_profile."CRMAccount_CompanyID",'customers','CRM_AccountOperations',p_org_id,v_old_signal,v_new_signal);
  end if;
  return jsonb_build_object('id',p_org_id,'editVersion',v_profile."CRMAccount_EditVersion"+1);
end;
$$;

revoke all on function public.multideck_crm_replace_account_operations(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.multideck_crm_replace_account_operations(uuid,uuid,bigint,jsonb) to service_role;

select public."Audit_EnableTableAudit"('public', 'CRM_AccountOperationalProfiles', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMAccountOps_ID','CRMAccountOps_OrgID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'CRM_AccountOperationalInstructions', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMAccountInstruction_ID','CRMAccountInstruction_OrgID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'CRM_AccountDocumentRecords', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMAccountDocument_ID','CRMAccountDocument_OrgID'], null, null, array['CRMAccountDocument_Notes']);
select public."Audit_EnableTableAudit"('public', 'Org_AddressOperationalDetails', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['OrgAddOperational_OrgAddID','OrgAddOperational_OrgID'], null, null, array['OrgAddOperational_BookingInstructions','OrgAddOperational_CollectionInstructions','OrgAddOperational_DeliveryInstructions']);

-- Dexter read parity is explicit and bounded. This adapter is intentionally
-- read-only: operational-profile writes remain approval-gated in the Companies
-- workspace until individual Dexter write actions can present a safe diff.
create or replace function public.multideck_dexter_account_operations(p_org_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select case when public.app_user_can_access_organisation(p_org_id) and public._multideck_dexter_has_permission(
    (select app_user."User_ID" from public."cmp_Users" app_user
     where app_user."Auth_User_ID"=auth.uid() and app_user."Company_ID"=public.app_current_company_id() limit 1),
    'Customers.Read'
  ) then jsonb_build_object(
    'recordId',p_org_id,'recordType','company_operations','roleProfiles',coalesce(profile."CRMAccountOps_RoleProfilesJSON",'{}'::jsonb),
    'invoicePreferences',coalesce(profile."CRMAccountOps_InvoicePreferencesJSON",'{}'::jsonb),
    'customs',coalesce(profile."CRMAccountOps_CustomsJSON",'{}'::jsonb),
    'privacy',coalesce(profile."CRMAccountOps_PrivacyJSON",'{}'::jsonb),
    'instructions',coalesce((select jsonb_agg(jsonb_build_object('id',i."CRMAccountInstruction_ID",'kind',i."CRMAccountInstruction_KindCode",'title',i."CRMAccountInstruction_Title",'body',i."CRMAccountInstruction_Body",'priority',i."CRMAccountInstruction_Priority") order by i."CRMAccountInstruction_Priority") from public."CRM_AccountOperationalInstructions" i where i."CRMAccountInstruction_OrgID"=p_org_id and i."CRMAccountInstruction_IsActive"),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d."CRMAccountDocument_ID",'type',d."CRMAccountDocument_TypeCode",'title',d."CRMAccountDocument_Title",'status',d."CRMAccountDocument_StatusCode") order by d."CRMAccountDocument_UpdatedAt" desc) from public."CRM_AccountDocumentRecords" d where d."CRMAccountDocument_OrgID"=p_org_id),'[]'::jsonb),
    'sourceEvidence',jsonb_build_object('sourceTable','CRM_AccountOperationalProfiles','sourceId',profile."CRMAccountOps_ID")
  ) else null end from public."CRM_AccountOperationalProfiles" profile where profile."CRMAccountOps_OrgID"=p_org_id;
$$;
revoke all on function public.multideck_dexter_account_operations(uuid) from public,anon;
grant execute on function public.multideck_dexter_account_operations(uuid) to authenticated,service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Companies, roles, operational addresses, finance and customs profiles, recurring instructions, documents and contact relationships available to the signed-in operator.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='customers';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Watch company roles, finance/customs readiness, operational instructions, document records and address booking rules for meaningful changes.',
  "AIDexterWatchCapability_FieldsJSON"=(select jsonb_agg(value order by value) from (select distinct value from jsonb_array_elements_text(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["roleProfiles","invoicePreferences","customs","privacy","instructions","documents","addressBookingRules"]'::jsonb)) fields(value)),
  "AIDexterWatchCapability_UpdatedAt"=now() where "AIDexterWatchCapability_Code"='customers';

-- Watch parity is emitted once per successful transactional replacement above.
-- Fingerprints expose change evidence without copying confidential instructions,
-- finance values or document notes into notification payloads. No LLM is called.

commit;
