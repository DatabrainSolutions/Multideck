-- Quote workspace v1.
-- Extends the canonical CusQuote records without creating a parallel source of truth.
-- Booking conversion and document-builder changes are deliberately out of scope.

begin;

create schema if not exists quote_api;
revoke all on schema quote_api from public, anon, authenticated;
grant usage on schema quote_api to service_role;

-- The three current quote records are demo fixtures. Keep a private, exact
-- snapshot so the paired rollback can restore them if this migration is undone.
create table quote_api.rollback_quote_headers as
select "CusQuoteHeader_ID" as quote_id, to_jsonb(quote) as snapshot
from public."CusQuote_Header" quote;
create table quote_api.rollback_quote_lines as
select "CusQuoteLine_ID" as line_id, to_jsonb(line) as snapshot
from public."CusQuote_Lines" line;
revoke all on quote_api.rollback_quote_headers, quote_api.rollback_quote_lines
  from public, anon, authenticated;

alter table public."CusQuote_Header"
  add column if not exists "CusQuoteHeader_LifecycleCode" varchar(40) not null default 'draft',
  add column if not exists "CusQuoteHeader_SourceTypeCode" varchar(20),
  add column if not exists "CusQuoteHeader_SourceLeadID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  add column if not exists "CusQuoteHeader_CustomerNameSnapshot" varchar(240),
  add column if not exists "CusQuoteHeader_ContactNameSnapshot" varchar(180),
  add column if not exists "CusQuoteHeader_ContactEmailSnapshot" varchar(320),
  add column if not exists "CusQuoteHeader_SupplierID" uuid references public."Org_Master"("Org_id") on delete set null,
  add column if not exists "CusQuoteHeader_SupplierNameSnapshot" varchar(240),
  add column if not exists "CusQuoteHeader_CarrierID" uuid references public."Org_Master"("Org_id") on delete set null,
  add column if not exists "CusQuoteHeader_CarrierNameSnapshot" varchar(240),
  add column if not exists "CusQuoteHeader_CustomerReference" varchar(120),
  add column if not exists "CusQuoteHeader_DepartmentID" uuid references public."cmp_Departments"("Department_ID") on delete set null,
  add column if not exists "CusQuoteHeader_SalesOwnerID" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "CusQuoteHeader_CollectionAddress" text,
  add column if not exists "CusQuoteHeader_LoadingPoint" text,
  add column if not exists "CusQuoteHeader_DischargePoint" text,
  add column if not exists "CusQuoteHeader_DeliveryAddress" text,
  add column if not exists "CusQuoteHeader_ShipmentFactsJSON" jsonb not null default '{}'::jsonb,
  add column if not exists "CusQuoteHeader_CustomerNotes" text,
  add column if not exists "CusQuoteHeader_TermsText" text,
  add column if not exists "CusQuoteHeader_RateSourceTypeCode" varchar(40),
  add column if not exists "CusQuoteHeader_RateSourceLabel" varchar(240),
  add column if not exists "CusQuoteHeader_DefaultMarkupPct" numeric(9,4),
  add column if not exists "CusQuoteHeader_MarkupOverrideReason" text,
  add column if not exists "CusQuoteHeader_FollowUpAt" timestamptz,
  add column if not exists "CusQuoteHeader_OutcomeNotes" text,
  add column if not exists "CusQuoteHeader_AcceptedVersionID" uuid,
  add column if not exists "CusQuoteHeader_WorkflowVersionCode" varchar(40);

-- An operator may start a meaningful quote before the customer is known.
alter table public."CusQuote_Header"
  alter column "CusQuoteHeader_CustomerID" drop not null;

alter table public."CusQuote_Lines"
  add column if not exists "CusQuoteLine_CostCurrencyCode" varchar(3),
  add column if not exists "CusQuoteLine_RevenueCurrencyCode" varchar(3),
  add column if not exists "CusQuoteLine_CalculationBasisCode" varchar(40),
  add column if not exists "CusQuoteLine_Quantity" numeric(18,4),
  add column if not exists "CusQuoteLine_UnitRate" numeric(18,4),
  add column if not exists "CusQuoteLine_MinimumAmount" numeric(18,4),
  add column if not exists "CusQuoteLine_DefaultMarkupPct" numeric(9,4),
  add column if not exists "CusQuoteLine_AppliedMarkupPct" numeric(9,4),
  add column if not exists "CusQuoteLine_MarkupOverrideReason" text,
  add column if not exists "CusQuoteLine_SourceLabel" varchar(240);

create table public."CusQuote_Parties" (
  "CusQuoteParty_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteParty_RoleCode" varchar(30) not null
    check ("CusQuoteParty_RoleCode" in ('shipper', 'consignee')),
  "CusQuoteParty_OrgID" uuid references public."Org_Master"("Org_id") on delete set null,
  "CusQuoteParty_NameSnapshot" varchar(240),
  "CusQuoteParty_AddressSnapshot" text,
  "CusQuoteParty_ContactSnapshot" varchar(180),
  "CusQuoteParty_CreatedAt" timestamptz not null default now(),
  "CusQuoteParty_UpdatedAt" timestamptz not null default now(),
  unique ("CusQuoteHeader_ID", "CusQuoteParty_RoleCode")
);

create index "IX_CusQuote_Parties_Quote"
  on public."CusQuote_Parties" ("CusQuoteHeader_ID");

create table public."CusQuote_Versions" (
  "CusQuoteVersion_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteVersion_Number" integer not null,
  "CusQuoteVersion_StatusCode" varchar(40) not null default 'draft',
  "CusQuoteVersion_SnapshotJSON" jsonb not null,
  "CusQuoteVersion_IsCurrent" boolean not null default false,
  "CusQuoteVersion_CreatedAt" timestamptz not null default now(),
  "CusQuoteVersion_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  unique ("CusQuoteHeader_ID", "CusQuoteVersion_Number"),
  constraint "CK_CusQuote_Versions_Snapshot"
    check (jsonb_typeof("CusQuoteVersion_SnapshotJSON") = 'object')
);

create unique index "UX_CusQuote_Versions_Current"
  on public."CusQuote_Versions" ("CusQuoteHeader_ID")
  where "CusQuoteVersion_IsCurrent";
create index "IX_CusQuote_Versions_Quote_Created"
  on public."CusQuote_Versions" ("CusQuoteHeader_ID", "CusQuoteVersion_CreatedAt" desc);

alter table public."CusQuote_Header"
  add constraint "FK_CusQuote_Header_AcceptedVersion"
  foreign key ("CusQuoteHeader_AcceptedVersionID")
  references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null;

create table public."CusQuote_Events" (
  "CusQuoteEvent_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteVersion_ID" uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null,
  "CusQuoteEvent_TypeCode" varchar(50) not null,
  "CusQuoteEvent_Summary" text not null,
  "CusQuoteEvent_MetadataJSON" jsonb not null default '{}'::jsonb,
  "CusQuoteEvent_OccurredAt" timestamptz not null default now(),
  "CusQuoteEvent_ActorUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_CusQuote_Events_Metadata"
    check (jsonb_typeof("CusQuoteEvent_MetadataJSON") = 'object')
);

create index "IX_CusQuote_Events_Quote_Occurred"
  on public."CusQuote_Events" ("CusQuoteHeader_ID", "CusQuoteEvent_OccurredAt" desc);
alter table public."CusQuote_Parties" enable row level security;
alter table public."CusQuote_Versions" enable row level security;
alter table public."CusQuote_Events" enable row level security;
revoke all on public."CusQuote_Parties", public."CusQuote_Versions", public."CusQuote_Events"
  from anon, authenticated;
grant select, insert, update, delete
  on public."CusQuote_Parties", public."CusQuote_Versions", public."CusQuote_Events"
  to service_role;

create sequence quote_api.quote_number_seq;
select setval(
  'quote_api.quote_number_seq',
  coalesce((select max("CusQuoteHeader_Number") from public."CusQuote_Header"), 0) + 1,
  false
);

-- Remove only the pre-existing demo fixtures after preserving the rollback
-- snapshot. Future real quotes are created through quote_api.save_quote.
delete from public."CusQuote_Header"
where "CusQuoteHeader_ID" in (
  select quote_id from quote_api.rollback_quote_headers
);

create or replace function quote_api.has_permission(
  caller_auth_user_id uuid,
  permission_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" app_user
    join public."cmp_Users_Roles" user_role
      on user_role."User_ID" = app_user."User_ID"
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where app_user."Auth_User_ID" = caller_auth_user_id
      and app_user."User_AccessStatus" = 'active'
      and permission."sys_Permission_Value" = permission_value
  );
$$;

create or replace function quote_api.jsonb_has_content(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if value is null or value = 'null'::jsonb then return false; end if;
  case jsonb_typeof(value)
    when 'string' then return nullif(btrim(value #>> '{}'), '') is not null;
    when 'number' then return true;
    when 'boolean' then return true;
    when 'array' then
      for item in select child from jsonb_array_elements(value) child loop
        if quote_api.jsonb_has_content(item) then return true; end if;
      end loop;
      return false;
    when 'object' then
      for item in select child from jsonb_each(value) pair(key, child) loop
        if quote_api.jsonb_has_content(item) then return true; end if;
      end loop;
      return false;
    else return false;
  end case;
end;
$$;

create or replace function quote_api.payload_has_content(payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    quote_api.jsonb_has_content(
      coalesce(payload, '{}'::jsonb)
        - array[
            'sourceType', 'defaultMarkupPct', 'workflowVersion',
            'officeId', 'departmentId', 'salesOwnerId', 'charges'
          ]
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) line
      where quote_api.jsonb_has_content(
        line - array[
          'showToCustomer', 'quantity', 'costRoe', 'sellRoe',
          'costAmount', 'sellAmount', 'costLocal', 'sellLocal',
          'defaultMarkupPct'
        ]
      )
      or abs(coalesce(nullif(line->>'costAmount', '')::numeric, 0)) > 0
      or abs(coalesce(nullif(line->>'sellAmount', '')::numeric, 0)) > 0
    );
$$;

create or replace function quote_api.save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  existing_quote record;
  office_id uuid := nullif(payload->>'officeId', '')::uuid;
  department_id uuid := nullif(payload->>'departmentId', '')::uuid;
  sales_owner_id uuid := nullif(payload->>'salesOwnerId', '')::uuid;
  source_type text := nullif(lower(btrim(payload->>'sourceType')), '');
  source_id uuid := nullif(payload->>'sourceId', '')::uuid;
  customer_id uuid := nullif(payload->>'customerId', '')::uuid;
  customer_name text := nullif(btrim(payload->>'customerName'), '');
  contact_id uuid := nullif(payload->>'contactId', '')::uuid;
  contact_name text := nullif(btrim(payload->>'contactName'), '');
  contact_email text := nullif(btrim(payload->>'contactEmail'), '');
  supplier_id uuid := nullif(payload->>'supplierId', '')::uuid;
  supplier_name text := nullif(btrim(payload->>'supplierName'), '');
  carrier_id uuid := nullif(payload->>'carrierId', '')::uuid;
  carrier_name text := nullif(btrim(payload->>'carrierName'), '');
  quote_id uuid := requested_quote_id;
  quote_number integer;
  lifecycle text := 'draft';
  line jsonb;
  line_number integer := 0;
  version_number integer;
  version_id uuid;
  created_now boolean := requested_quote_id is null;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote management is not authorised.' using errcode = '42501';
  end if;
  if not quote_api.payload_has_content(payload) then
    raise exception 'Add at least one quote detail before saving.' using errcode = '22023';
  end if;
  if source_type is not null and source_type not in ('account', 'lead') then
    raise exception 'Choose a supported quote source.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID"
  into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';

  if office_id is not null and not exists (
    select 1 from public."cmp_Offices"
    where "Office_ID" = office_id
      and "Company_ID" = app_user."Company_ID"
      and "Office_IsActive"
  ) then
    raise exception 'Choose an active office in this workspace.' using errcode = '22023';
  end if;
  if office_id is null then
    select "Office_ID" into office_id
    from public."cmp_Offices"
    where "Company_ID" = app_user."Company_ID" and "Office_IsActive"
    order by "Office_Name", "Office_ID"
    limit 1;
  end if;
  if office_id is null then
    raise exception 'This workspace has no active office.' using errcode = '22023';
  end if;

  if department_id is not null and not exists (
    select 1 from public."cmp_Departments"
    where "Department_ID" = department_id
      and "Company_ID" = app_user."Company_ID"
      and "Department_IsActive"
  ) then
    raise exception 'Choose an active department in this workspace.' using errcode = '22023';
  end if;
  if sales_owner_id is not null and not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = sales_owner_id
      and "Company_ID" = app_user."Company_ID"
      and "User_AccessStatus" = 'active'
  ) then
    raise exception 'Choose an active sales representative in this workspace.' using errcode = '22023';
  end if;

  if source_type = 'lead' and source_id is not null then
    select lead."CRMLead_OrgID",
      coalesce(customer_name, nullif(btrim(lead."CRMLead_CompanyName"), ''), nullif(btrim(lead."CRMLead_PersonName"), '')),
      coalesce(nullif(btrim(payload->>'contactName'), ''), nullif(btrim(lead."CRMLead_PersonName"), '')),
      coalesce(nullif(btrim(payload->>'contactEmail'), ''), nullif(btrim(lead."CRMLead_Email"), ''))
    into customer_id, customer_name, contact_name, contact_email
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner on owner."User_ID" = coalesce(lead."CRMLead_OwnerUserID", lead."CRMLead_CreatedBy")
    left join public."cmp_Offices" lead_office on lead_office."Office_ID" = lead."CRMLead_OrgOfficeID"
    where lead."CRMLead_ID" = source_id
      and not lead."CRMLead_IsDeleted"
      and coalesce(owner."Company_ID", lead_office."Company_ID") = app_user."Company_ID";
    if not found then
      raise exception 'That lead is outside this workspace.' using errcode = '42501';
    end if;
  elsif source_type = 'account' and source_id is not null then
    customer_id := source_id;
  end if;

  if customer_id is not null then
    select "Org_Name" into customer_name
    from public."Org_Master" where "Org_id" = customer_id;
    if not found then
      raise exception 'Choose a valid customer.' using errcode = '22023';
    end if;
  end if;
  if contact_id is not null and not exists (
    select 1 from public."Org_Contacts"
    where "OrgContact_ID" = contact_id
      and (customer_id is null or "Org_ID" = customer_id)
  ) then
    raise exception 'Choose a valid customer contact.' using errcode = '22023';
  end if;
  if supplier_id is not null then
    select "Org_Name" into supplier_name
    from public."Org_Master" where "Org_id" = supplier_id;
    if not found then raise exception 'Choose a valid supplier.' using errcode = '22023'; end if;
  end if;
  if carrier_id is not null then
    select "Org_Name" into carrier_name
    from public."Org_Master" where "Org_id" = carrier_id;
    if not found then raise exception 'Choose a valid carrier.' using errcode = '22023'; end if;
  end if;

  if quote_id is not null then
    select quote.* into existing_quote
    from public."CusQuote_Header" quote
    join public."cmp_Offices" quote_office
      on quote_office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = quote_id
      and quote_office."Company_ID" = app_user."Company_ID"
      and not quote."CusQuoteHeader_IsDeleted"
    for update;
    if not found then
      raise exception 'That quote is outside this workspace.' using errcode = '42501';
    end if;
    if coalesce(existing_quote."CusQuoteHeader_LifecycleCode", 'draft') = 'accepted' then
      raise exception 'An accepted quote cannot be edited.' using errcode = '22023';
    end if;
    quote_number := existing_quote."CusQuoteHeader_Number";
    lifecycle := case
      when existing_quote."CusQuoteHeader_LifecycleCode" in ('sent', 'declined', 'ghosted')
        then 'revised'
      else coalesce(existing_quote."CusQuoteHeader_LifecycleCode", 'draft')
    end;
  else
    quote_id := gen_random_uuid();
    quote_number := nextval('quote_api.quote_number_seq');
    insert into public."CusQuote_Header" (
      "CusQuoteHeader_ID", "CusQuoteHeader_Number", "CusQuoteHeader_CustomerID",
      "CusQuoteHeader_CreatedDate", "CusQuoteHeader_CreatedBy",
      "CusQuoteHeader_LastEditedDate", "CusQuoteHeader_LastEditedBy",
      "CusQuoteHeader_OrgOfficeID", "OrgOffice_ID", "Org_ID",
      "CusQuoteHeader_Status", "CusQuoteHeader_LifecycleCode",
      "CusQuoteHeader_WorkflowVersionCode"
    ) values (
      quote_id, quote_number, customer_id,
      now(), app_user."User_ID", now(), app_user."User_ID",
      office_id, office_id, app_user."Company_ID",
      1, 'draft', 'quotes-v1'
    );
  end if;

  update public."CusQuote_Header" set
    "CusQuoteHeader_CustomerID" = customer_id,
    "CusQuoteHeader_CustomerContact" = contact_id,
    "CusQuoteHeader_SourceTypeCode" = source_type,
    "CusQuoteHeader_SourceLeadID" = case when source_type = 'lead' then source_id end,
    "CusQuoteHeader_CustomerNameSnapshot" = left(customer_name, 240),
    "CusQuoteHeader_ContactNameSnapshot" = left(contact_name, 180),
    "CusQuoteHeader_ContactEmailSnapshot" = left(contact_email, 320),
    "CusQuoteHeader_CustomerReference" = left(nullif(btrim(payload->>'customerReference'), ''), 120),
    "CusQuoteHeader_DepartmentID" = department_id,
    "CusQuoteHeader_SalesOwnerID" = sales_owner_id,
    "CusQuoteHeader_ModeCode" = nullif(lower(btrim(payload->>'mode')), ''),
    "CusQuoteHeader_ShipmentTypeCode" = nullif(btrim(payload->>'shipmentType'), ''),
    "CusQuoteHeader_Direction" = nullif(lower(btrim(payload->>'direction')), ''),
    "CusQuoteHeader_ServiceLevel" = nullif(btrim(payload->>'serviceLevel'), ''),
    "CusQuoteHeader_CurrencyCode" = nullif(upper(btrim(payload->>'currency')), ''),
    "CusQuoteHeader_OriginExtra" = nullif(btrim(payload->>'loadingPoint'), ''),
    "CusQuoteHeader_DestinationExtra" = nullif(btrim(payload->>'dischargePoint'), ''),
    "CusQuoteHeader_CollectionAddress" = nullif(btrim(payload->>'collectionAddress'), ''),
    "CusQuoteHeader_LoadingPoint" = nullif(btrim(payload->>'loadingPoint'), ''),
    "CusQuoteHeader_DischargePoint" = nullif(btrim(payload->>'dischargePoint'), ''),
    "CusQuoteHeader_DeliveryAddress" = nullif(btrim(payload->>'deliveryAddress'), ''),
    "CusQuoteHeader_Incoterm" = nullif(upper(btrim(payload->>'incoterm')), ''),
    "CusQuoteHeader_ValidFrom" = nullif(payload->>'validFrom', '')::date,
    "CusQuoteHeader_ValidTo" = nullif(payload->>'validTo', '')::date,
    "CusQuoteHeader_Deadline" = nullif(payload->>'deadline', '')::timestamp,
    "CusQuoteHeader_SupplierID" = supplier_id,
    "CusQuoteHeader_SupplierNameSnapshot" = left(supplier_name, 240),
    "CusQuoteHeader_CarrierID" = carrier_id,
    "CusQuoteHeader_CarrierNameSnapshot" = left(carrier_name, 240),
    "CusQuoteHeader_ShipmentFactsJSON" = coalesce(payload->'shipmentFacts', '{}'::jsonb),
    "CusQuoteHeader_CustomerNotes" = nullif(btrim(payload->>'customerNotes'), ''),
    "CusQuoteHeader_InternalNotes" = nullif(btrim(payload->>'internalNotes'), ''),
    "CusQuoteHeader_TermsText" = nullif(btrim(payload->>'terms'), ''),
    "CusQuoteHeader_RateSourceTypeCode" = nullif(lower(btrim(payload->>'rateSourceType')), ''),
    "CusQuoteHeader_RateSourceLabel" = left(nullif(btrim(payload->>'rateSourceLabel'), ''), 240),
    "CusQuoteHeader_DefaultMarkupPct" = nullif(payload->>'defaultMarkupPct', '')::numeric,
    "CusQuoteHeader_MarkupOverrideReason" = nullif(btrim(payload->>'markupOverrideReason'), ''),
    "CusQuoteHeader_FollowUpAt" = nullif(payload->>'followUpAt', '')::timestamptz,
    "CusQuoteHeader_LifecycleCode" = lifecycle,
    "CusQuoteHeader_Status" = case lifecycle
      when 'calculated' then 2 when 'sent' then 4 when 'accepted' then 5
      when 'declined' then 6 when 'ghosted' then 7 else 1 end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now(),
    "CusQuoteHeader_WorkflowVersionCode" = 'quotes-v1'
  where "CusQuoteHeader_ID" = quote_id;

  delete from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote_id;
  for line in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop
    if quote_api.jsonb_has_content(
      line - array['showToCustomer', 'quantity', 'costRoe', 'sellRoe']
    ) then
      line_number := line_number + 1;
      insert into public."CusQuote_Lines" (
        "CusQuoteHeader_ID", "CusQuoteLine_Number", "CusQuoteLine_SupplierID",
        "CusQuoteLine_Description", "CusQuoteLine_InternalNotes", "CusQuoteLine_CustomerNotes",
        "CusQuoteLine_CostROE", "CusQuoteLine_CostAmountCurrency", "CusQuoteLine_CostAmountLocal",
        "CusQuoteLine_RevenueROE", "CusQuoteLine_RevenueAmountCurrency", "CusQuoteLine_RevenueAmountLocal",
        "CusQuoteLine_ShowToCustomer", "CusQuoteLine_CostCurrencyCode",
        "CusQuoteLine_RevenueCurrencyCode", "CusQuoteLine_CalculationBasisCode",
        "CusQuoteLine_Quantity", "CusQuoteLine_UnitRate", "CusQuoteLine_MinimumAmount",
        "CusQuoteLine_DefaultMarkupPct", "CusQuoteLine_AppliedMarkupPct",
        "CusQuoteLine_MarkupOverrideReason", "CusQuoteLine_SourceLabel",
        "CusQuoteLine_CreatedBy", "CusQuoteLine_UpdatedBy"
      ) values (
        quote_id, line_number, nullif(line->>'supplierId', '')::uuid,
        left(coalesce(nullif(btrim(line->>'description'), ''), 'Charge'), 240),
        nullif(btrim(line->>'internalNotes'), ''), nullif(btrim(line->>'customerNotes'), ''),
        greatest(coalesce(nullif(line->>'costRoe', '')::numeric, 1), 0.00001),
        coalesce(nullif(line->>'costAmount', '')::numeric, 0),
        round(coalesce(nullif(line->>'costAmount', '')::numeric, 0)
          / greatest(coalesce(nullif(line->>'costRoe', '')::numeric, 1), 0.00001), 4),
        greatest(coalesce(nullif(line->>'sellRoe', '')::numeric, 1), 0.00001),
        coalesce(nullif(line->>'sellAmount', '')::numeric, 0),
        round(coalesce(nullif(line->>'sellAmount', '')::numeric, 0)
          / greatest(coalesce(nullif(line->>'sellRoe', '')::numeric, 1), 0.00001), 4),
        coalesce((line->>'showToCustomer')::boolean, true),
        nullif(upper(btrim(line->>'costCurrency')), ''),
        nullif(upper(btrim(line->>'sellCurrency')), ''),
        nullif(lower(btrim(line->>'calculationBasis')), ''),
        coalesce(nullif(line->>'quantity', '')::numeric, 1),
        nullif(line->>'unitRate', '')::numeric,
        nullif(line->>'minimumAmount', '')::numeric,
        nullif(line->>'defaultMarkupPct', '')::numeric,
        nullif(line->>'appliedMarkupPct', '')::numeric,
        nullif(btrim(line->>'markupOverrideReason'), ''),
        left(nullif(btrim(line->>'sourceLabel'), ''), 240),
        app_user."User_ID", app_user."User_ID"
      );
    end if;
  end loop;

  delete from public."CusQuote_Parties" where "CusQuoteHeader_ID" = quote_id;
  if quote_api.jsonb_has_content(payload->'shipper') then
    insert into public."CusQuote_Parties" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteParty_RoleCode",
      "CusQuoteParty_OrgID", "CusQuoteParty_NameSnapshot",
      "CusQuoteParty_AddressSnapshot", "CusQuoteParty_ContactSnapshot"
    ) values (
      app_user."Company_ID", quote_id, 'shipper',
      nullif(payload#>>'{shipper,orgId}', '')::uuid,
      left(nullif(btrim(payload#>>'{shipper,name}'), ''), 240),
      nullif(btrim(payload#>>'{shipper,address}'), ''),
      left(nullif(btrim(payload#>>'{shipper,contact}'), ''), 180)
    );
  end if;
  if quote_api.jsonb_has_content(payload->'consignee') then
    insert into public."CusQuote_Parties" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteParty_RoleCode",
      "CusQuoteParty_OrgID", "CusQuoteParty_NameSnapshot",
      "CusQuoteParty_AddressSnapshot", "CusQuoteParty_ContactSnapshot"
    ) values (
      app_user."Company_ID", quote_id, 'consignee',
      nullif(payload#>>'{consignee,orgId}', '')::uuid,
      left(nullif(btrim(payload#>>'{consignee,name}'), ''), 240),
      nullif(btrim(payload#>>'{consignee,address}'), ''),
      left(nullif(btrim(payload#>>'{consignee,contact}'), ''), 180)
    );
  end if;

  select coalesce(max("CusQuoteVersion_Number"), 0) + 1
  into version_number
  from public."CusQuote_Versions"
  where "CusQuoteHeader_ID" = quote_id;

  update public."CusQuote_Versions"
  set "CusQuoteVersion_IsCurrent" = false
  where "CusQuoteHeader_ID" = quote_id and "CusQuoteVersion_IsCurrent";

  insert into public."CusQuote_Versions" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_Number",
    "CusQuoteVersion_StatusCode", "CusQuoteVersion_SnapshotJSON",
    "CusQuoteVersion_IsCurrent", "CusQuoteVersion_CreatedBy"
  ) values (
    app_user."Company_ID", quote_id, version_number, lifecycle,
    jsonb_build_object(
      'reference', 'Q-' || quote_number,
      'lifecycle', lifecycle,
      'quote', payload,
      'savedAt', now()
    ),
    true, app_user."User_ID"
  )
  returning "CusQuoteVersion_ID" into version_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID",
    "CusQuoteEvent_TypeCode", "CusQuoteEvent_Summary",
    "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", quote_id, version_id,
    case when created_now then 'created' else 'saved' end,
    case when created_now then 'Quote created.' else 'Quote changes saved.' end,
    jsonb_build_object('versionNumber', version_number),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', quote_id,
    'reference', 'Q-' || quote_number,
    'lifecycle', lifecycle,
    'versionId', version_id
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

create or replace function quote_api.transition_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_transition text,
  requested_note text default null,
  requested_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  next_lifecycle text := lower(btrim(requested_transition));
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote management is not authorised.' using errcode = '42501';
  end if;
  if next_lifecycle not in ('calculated', 'sent', 'revised', 'accepted', 'declined', 'ghosted') then
    raise exception 'Choose a supported quote action.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;
  if coalesce(quote_row."CusQuoteHeader_LifecycleCode", 'draft') = 'accepted' then
    raise exception 'An accepted quote cannot be changed.' using errcode = '22023';
  end if;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = next_lifecycle,
    "CusQuoteHeader_Status" = case next_lifecycle
      when 'calculated' then 2 when 'sent' then 4 when 'accepted' then 5
      when 'declined' then 6 when 'ghosted' then 7 else 1 end,
    "CusQuoteHeader_OutcomeNotes" = case
      when next_lifecycle in ('accepted', 'declined', 'ghosted')
        then nullif(btrim(requested_note), '')
      else "CusQuoteHeader_OutcomeNotes" end,
    "CusQuoteHeader_FollowUpAt" = coalesce(
      requested_follow_up_at, "CusQuoteHeader_FollowUpAt"
    ),
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON",
    "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, next_lifecycle,
    initcap(next_lifecycle) ||
      case when nullif(btrim(requested_note), '') is null
        then '.' else ': ' || left(btrim(requested_note), 500) end,
    jsonb_strip_nulls(jsonb_build_object('followUpAt', requested_follow_up_at)),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', requested_quote_id,
    'lifecycle', next_lifecycle
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

revoke all on function quote_api.has_permission(uuid, text) from public, anon, authenticated;
revoke all on function quote_api.jsonb_has_content(jsonb) from public, anon, authenticated;
revoke all on function quote_api.payload_has_content(jsonb) from public, anon, authenticated;
revoke all on function quote_api.save_quote(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function quote_api.transition_quote(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function quote_api.has_permission(uuid, text) to service_role;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb) to service_role;
grant execute on function quote_api.transition_quote(uuid, uuid, text, text, timestamptz) to service_role;

create or replace view public."App_Live_Quotes" with (security_invoker = true) as
select
  quote."CusQuoteHeader_ID",
  'Q-' || quote."CusQuoteHeader_Number" as "Quote_Reference",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Quote_Status",
  case coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft')
    when 'accepted' then 'green' when 'sent' then 'teal'
    when 'calculated' then 'blue' when 'declined' then 'red'
    when 'ghosted' then 'neutral' else 'amber' end as "Quote_Status_Tone",
  coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot", '')::varchar(100) as "Customer_Name",
  coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra", '') as "Origin",
  coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra", '') as "Destination",
  quote."CusQuoteHeader_ValidFrom" as "Estimated_Departure",
  quote."CusQuoteHeader_ValidTo" as "Estimated_Arrival",
  coalesce((quote."CusQuoteHeader_ValidTo" - quote."CusQuoteHeader_ValidFrom")::text || ' days', '') as "Transport_Time",
  initcap(coalesce(quote."CusQuoteHeader_ModeCode", '')) as "Transport_Mode",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'equipment', quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Equipment_Load",
  coalesce(quote."CusQuoteHeader_CollectionAddress", '') as "Pickup",
  coalesce(quote."CusQuoteHeader_DeliveryAddress", '') as "Delivery",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'routingVia', '') as "Routing_Via",
  coalesce(quote."CusQuoteHeader_Incoterm", '')::varchar as "Incoterms",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'namedPlace', '') as "Incoterms_Place",
  coalesce(quote."CusQuoteHeader_ServiceLevel", '')::varchar as "Service_Level",
  coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Shipment_Type",
  coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name", '')::text as "Carrier",
  coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name", '')::text as "Supplier",
  coalesce(sales_owner."User_Firstname" || ' ' || sales_owner."User_Lastname", '') as "Sales_Owner",
  coalesce(created_by."User_Firstname" || ' ' || created_by."User_Lastname", '') as "Operations_Owner",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'quoteType', 'Spot') as "Quote_Type",
  initcap(coalesce(quote."CusQuoteHeader_Direction", '')) as "Direction",
  coalesce(quote."CusQuoteHeader_CustomerReference", '')::text as "Customer_Purchase_Order",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'shipperReference', '') as "Shipper_Reference",
  to_char(quote."CusQuoteHeader_ValidTo", 'DD Mon YYYY') as "Validity",
  to_char(quote."CusQuoteHeader_Deadline", 'DD Mon · HH24:MI') as "Estimated_Quote",
  coalesce(totals.sell, 0) as "Sell_Value",
  coalesce(totals.sell - totals.cost, 0) as "Estimated_Profit",
  coalesce(totals.cost, 0) as "Estimated_Cost",
  case when coalesce(totals.sell, 0) = 0 then null
    else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end as "Estimated_Margin",
  coalesce(quote."CusQuoteHeader_CurrencyCode", '')::varchar as "Currency",
  'Draft'::text as "Document_Status",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Workflow_Stage",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority', '') as "Priority",
  case when quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority' = 'Urgent'
    then 'red' else 'neutral' end as "Priority_Tone",
  coalesce(quote."CusQuoteHeader_RateSourceLabel", initcap(quote."CusQuoteHeader_RateSourceTypeCode"), '')::text as "Quote_Source",
  quote."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At",
  coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" quote
left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
left join public."cmp_Users" sales_owner on sales_owner."User_ID" = quote."CusQuoteHeader_SalesOwnerID"
left join public."cmp_Users" created_by on created_by."User_ID" = quote."CusQuoteHeader_CreatedBy"
left join lateral (
  select
    coalesce(sum(line."CusQuoteLine_CostAmountLocal"), 0) as cost,
    coalesce(sum(line."CusQuoteLine_RevenueAmountLocal"), 0) as sell
  from public."CusQuote_Lines" line
  where line."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
) totals on true
where not quote."CusQuoteHeader_IsDeleted";

grant select on public."App_Live_Quotes" to authenticated;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId', quote."CusQuoteHeader_ID",
      'quoteNumber', 'Q-' || quote."CusQuoteHeader_Number",
      'customerReference', quote."CusQuoteHeader_CustomerReference",
      'customer', coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot"),
      'lifecycle', quote."CusQuoteHeader_LifecycleCode",
      'mode', quote."CusQuoteHeader_ModeCode",
      'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode",
      'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
      'currency', quote."CusQuoteHeader_CurrencyCode",
      'origin', coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra"),
      'destination', coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra"),
      'direction', quote."CusQuoteHeader_Direction",
      'incoterm', quote."CusQuoteHeader_Incoterm",
      'validFrom', quote."CusQuoteHeader_ValidFrom",
      'validTo', quote."CusQuoteHeader_ValidTo",
      'supplier', coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name"),
      'carrier', coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name"),
      'followUpAt', quote."CusQuoteHeader_FollowUpAt",
      'costTotal', totals.cost,
      'sellTotal', totals.sell,
      'profit', totals.sell - totals.cost,
      'marginPct', case when totals.sell = 0 then null
        else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
      'updatedAt', quote."CusQuoteHeader_LastEditedDate",
      'evidence', jsonb_build_object(
        'sourceTable', 'CusQuote_Header',
        'sourceId', quote."CusQuoteHeader_ID",
        'currentVersionId', version."CusQuoteVersion_ID"
      )
    )) value,
    quote."CusQuoteHeader_LastEditedDate" updated_at
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
      and office."Company_ID" = p_company_id
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
    left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
    left join public."CusQuote_Versions" version
      on version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
      and version."CusQuoteVersion_IsCurrent"
    left join lateral (
      select coalesce(sum("CusQuoteLine_CostAmountLocal"), 0) cost,
        coalesce(sum("CusQuoteLine_RevenueAmountLocal"), 0) sell
      from public."CusQuote_Lines"
      where "CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
    ) totals on true
    where not quote."CusQuoteHeader_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', quote."CusQuoteHeader_Number",
          quote."CusQuoteHeader_CustomerReference",
          customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot",
          quote."CusQuoteHeader_LifecycleCode", quote."CusQuoteHeader_ModeCode",
          quote."CusQuoteHeader_ShipmentTypeCode",
          quote."CusQuoteHeader_OriginExtra", quote."CusQuoteHeader_DestinationExtra",
          quote."CusQuoteHeader_SupplierNameSnapshot",
          quote."CusQuoteHeader_CarrierNameSnapshot"
        ) ilike '%' || btrim(p_search) || '%'
      )
    order by quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" =
      'Customer quotes with lifecycle, route, parties, supplier, carrier, charges, margin, follow-up and saved-version evidence.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" =
      'Quote lifecycle, deadline, validity, customer reference, supplier, carrier, route, margin and follow-up changes.',
    "AIDexterWatchCapability_FieldsJSON" =
      '["quoteNumber","customerReference","lifecycle","deadline","validFrom","validTo","origin","destination","supplier","carrier","followUpAt"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

create or replace function public.multideck_dexter_action_manage_quote_lifecycle(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_user_id uuid;
begin
  select "Auth_User_ID" into actor_auth_user_id
  from public."cmp_Users"
  where "User_ID" = p_user_id
    and "Company_ID" = p_company_id
    and "User_AccessStatus" = 'active';
  if actor_auth_user_id is null then
    raise exception 'The Dexter operator is outside this workspace.' using errcode = '42501';
  end if;
  return quote_api.transition_quote(
    actor_auth_user_id,
    (p_arguments->>'target_id')::uuid,
    p_arguments->>'transition',
    p_arguments->>'reason',
    nullif(p_arguments->>'followUpAt', '')::timestamptz
  );
end;
$$;

revoke all on function public.multideck_dexter_action_manage_quote_lifecycle(uuid, uuid, jsonb)
  from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'manage_quote_lifecycle', 'quotes', 'Manage quote lifecycle',
  'Change an existing quote lifecycle after the operator approves the prepared action.',
  'multideck_dexter_action_manage_quote_lifecycle',
  '[
    {"name":"target_id","type":"uuid","required":true},
    {"name":"transition","type":"text","required":true},
    {"name":"reason","type":"text","required":false},
    {"name":"followUpAt","type":"timestamptz","required":false}
  ]'::jsonb,
  190, true, now(), '["Quotes.Write"]'::jsonb, 'quote_lifecycle',
  'canonical', true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = excluded."AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt" = excluded."AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

commit;
