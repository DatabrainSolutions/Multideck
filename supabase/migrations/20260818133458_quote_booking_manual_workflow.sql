-- Manual, auditable quote-to-booking workflow.
-- Extends the canonical CusQuote/Job records; no parallel operational source is introduced.

begin;

create schema if not exists quote_api;
revoke all on schema quote_api from public, anon, authenticated;
grant usage on schema quote_api to service_role;

alter table public."CusQuote_Header"
  add column if not exists "CusQuoteHeader_LifecycleCode" varchar(40) not null default 'draft',
  add column if not exists "CusQuoteHeader_SourceTypeCode" varchar(20) not null default 'account',
  add column if not exists "CusQuoteHeader_SourceLeadID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  add column if not exists "CusQuoteHeader_ContactNameSnapshot" varchar(180),
  add column if not exists "CusQuoteHeader_ContactEmailSnapshot" varchar(320),
  add column if not exists "CusQuoteHeader_SupplierID" uuid references public."Org_Master"("Org_id") on delete set null,
  add column if not exists "CusQuoteHeader_SupplierNameSnapshot" varchar(240),
  add column if not exists "CusQuoteHeader_CollectionAddress" text,
  add column if not exists "CusQuoteHeader_LoadingPoint" text,
  add column if not exists "CusQuoteHeader_DischargePoint" text,
  add column if not exists "CusQuoteHeader_DeliveryAddress" text,
  add column if not exists "CusQuoteHeader_ShipmentFactsJSON" jsonb not null default '{}'::jsonb,
  add column if not exists "CusQuoteHeader_CustomerNotes" text,
  add column if not exists "CusQuoteHeader_TermsText" text,
  add column if not exists "CusQuoteHeader_RateSourceTypeCode" varchar(40) not null default 'manual',
  add column if not exists "CusQuoteHeader_RateSourceLabel" varchar(240),
  add column if not exists "CusQuoteHeader_DefaultMarkupPct" numeric(9,4) not null default 15,
  add column if not exists "CusQuoteHeader_MarkupOverrideReason" text,
  add column if not exists "CusQuoteHeader_FollowUpAt" timestamptz,
  add column if not exists "CusQuoteHeader_OutcomeNotes" text,
  add column if not exists "CusQuoteHeader_DocumentTemplateCode" varchar(100) not null default 'CUSTOMER_QUOTE',
  add column if not exists "CusQuoteHeader_AcceptedVersionID" uuid,
  add column if not exists "CusQuoteHeader_ConversionKey" uuid,
  add column if not exists "CusQuoteHeader_ConvertedAt" timestamptz;

alter table public."CusQuote_Lines"
  add column if not exists "CusQuoteLine_CostCurrencyCode" varchar(3) not null default 'GBP',
  add column if not exists "CusQuoteLine_RevenueCurrencyCode" varchar(3) not null default 'GBP',
  add column if not exists "CusQuoteLine_CalculationBasisCode" varchar(40) not null default 'fixed',
  add column if not exists "CusQuoteLine_Quantity" numeric(18,4) not null default 1,
  add column if not exists "CusQuoteLine_UnitRate" numeric(18,4),
  add column if not exists "CusQuoteLine_MinimumAmount" numeric(18,4),
  add column if not exists "CusQuoteLine_DefaultMarkupPct" numeric(9,4),
  add column if not exists "CusQuoteLine_AppliedMarkupPct" numeric(9,4),
  add column if not exists "CusQuoteLine_MarkupOverrideReason" text,
  add column if not exists "CusQuoteLine_SourceLabel" varchar(240);

create table if not exists public."CusQuote_Parties" (
  "CusQuoteParty_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteParty_RoleCode" varchar(30) not null check ("CusQuoteParty_RoleCode" in ('shipper','consignee')),
  "CusQuoteParty_OrgID" uuid references public."Org_Master"("Org_id") on delete set null,
  "CusQuoteParty_NameSnapshot" varchar(240) not null,
  "CusQuoteParty_AddressSnapshot" text,
  "CusQuoteParty_ContactSnapshot" varchar(180),
  "CusQuoteParty_CreatedAt" timestamptz not null default now(),
  "CusQuoteParty_UpdatedAt" timestamptz not null default now(),
  unique ("CusQuoteHeader_ID", "CusQuoteParty_RoleCode")
);

create table if not exists public."CusQuote_Versions" (
  "CusQuoteVersion_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteVersion_Number" integer not null,
  "CusQuoteVersion_StatusCode" varchar(40) not null default 'rendering',
  "CusQuoteVersion_SnapshotJSON" jsonb not null,
  "CusQuoteVersion_GeneratedDocumentID" uuid references public."DOCB_GeneratedDocuments"("DOCBGD_ID") on delete set null,
  "CusQuoteVersion_IsCurrent" boolean not null default false,
  "CusQuoteVersion_IssuedAt" timestamptz,
  "CusQuoteVersion_IssuedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CusQuoteVersion_CreatedAt" timestamptz not null default now(),
  "CusQuoteVersion_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  unique ("CusQuoteHeader_ID", "CusQuoteVersion_Number"),
  constraint "CK_CusQuote_Versions_Snapshot" check (jsonb_typeof("CusQuoteVersion_SnapshotJSON") = 'object')
);

create unique index if not exists "UX_CusQuote_Versions_Current"
  on public."CusQuote_Versions" ("CusQuoteHeader_ID") where "CusQuoteVersion_IsCurrent";
create index if not exists "IX_CusQuote_Versions_Quote_Created"
  on public."CusQuote_Versions" ("CusQuoteHeader_ID", "CusQuoteVersion_CreatedAt" desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'FK_CusQuote_Header_AcceptedVersion'
  ) then
    alter table public."CusQuote_Header"
      add constraint "FK_CusQuote_Header_AcceptedVersion"
      foreign key ("CusQuoteHeader_AcceptedVersionID")
      references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null;
  end if;
end $$;

create unique index if not exists "UX_CusQuote_Header_ConversionKey"
  on public."CusQuote_Header" ("CusQuoteHeader_ConversionKey")
  where "CusQuoteHeader_ConversionKey" is not null;

create table if not exists public."CusQuote_Events" (
  "CusQuoteEvent_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "CusQuoteVersion_ID" uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null,
  "CusQuoteEvent_TypeCode" varchar(50) not null,
  "CusQuoteEvent_Summary" text not null,
  "CusQuoteEvent_MetadataJSON" jsonb not null default '{}'::jsonb,
  "CusQuoteEvent_OccurredAt" timestamptz not null default now(),
  "CusQuoteEvent_ActorUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_CusQuote_Events_Metadata" check (jsonb_typeof("CusQuoteEvent_MetadataJSON") = 'object')
);

create index if not exists "IX_CusQuote_Events_Quote_Occurred"
  on public."CusQuote_Events" ("CusQuoteHeader_ID", "CusQuoteEvent_OccurredAt" desc);

alter table public."CusQuote_Parties" enable row level security;
alter table public."CusQuote_Versions" enable row level security;
alter table public."CusQuote_Events" enable row level security;
revoke all on public."CusQuote_Parties", public."CusQuote_Versions", public."CusQuote_Events" from anon, authenticated;
grant select, insert, update, delete on public."CusQuote_Parties", public."CusQuote_Versions", public."CusQuote_Events" to service_role;

insert into public."sys_Permissions" (
  "sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name",
  "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('Quotes.Read', 'Quotes', 'Read quotes', 'View company-scoped quote records, commercial versions and follow-up history.', false),
  ('Quotes.Write', 'Quotes', 'Change quotes', 'Create, calculate, generate, issue and revise customer quotes.', true),
  ('Quotes.Convert', 'Quotes', 'Convert accepted quotes', 'Create one operational booking from an accepted quote version.', true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Quotes.Read'), ('Administrator', 'Quotes.Write'), ('Administrator', 'Quotes.Convert'),
    ('Operations manager', 'Quotes.Read'), ('Operations manager', 'Quotes.Write'), ('Operations manager', 'Quotes.Convert'),
    ('Operator', 'Quotes.Read'), ('Operator', 'Quotes.Write'), ('Operator', 'Quotes.Convert'),
    ('Viewer', 'Quotes.Read')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on role."sys_UserRole_Name" = mapping.role_name
join public."sys_Permissions" permission on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

create or replace function quote_api.has_permission(caller_auth_user_id uuid, permission_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" app_user
    join public."cmp_Users_Roles" user_role on user_role."User_ID" = app_user."User_ID"
    join public."sys_UserRole_Permissions" role_permission on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where app_user."Auth_User_ID" = caller_auth_user_id
      and coalesce(app_user."User_AccessStatus", 'active') = 'active'
      and permission."sys_Permission_Value" = permission_value
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
  source_type text := lower(coalesce(nullif(btrim(payload->>'sourceType'), ''), 'account'));
  source_id uuid := nullif(payload->>'sourceId', '')::uuid;
  customer_id uuid;
  lead_row record;
  office_id uuid;
  quote_id uuid := requested_quote_id;
  quote_number integer;
  existing_quote record;
  existing_lifecycle text := 'draft';
  line jsonb;
  line_number integer := 0;
  cost_amount numeric;
  sell_amount numeric;
  cost_roe numeric;
  sell_roe numeric;
  default_markup numeric := coalesce(nullif(payload->>'defaultMarkupPct', '')::numeric, 15);
  source_contact_name text;
  source_contact_email text;
  supplier_id uuid := nullif(payload->>'supplierId', '')::uuid;
  supplier_name text := nullif(btrim(payload->>'supplierName'), '');
begin
  if caller_auth_user_id is null or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'quote management is not authorised' using errcode = '42501';
  end if;
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users" where "Auth_User_ID" = caller_auth_user_id;

  if source_type not in ('account', 'lead') or source_id is null then
    raise exception 'Choose a lead or account.' using errcode = '22023';
  end if;
  if source_type = 'lead' then
    select lead.* into lead_row
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner on owner."User_ID" = coalesce(lead."CRMLead_OwnerUserID", lead."CRMLead_CreatedBy")
    left join public."cmp_Offices" office on office."Office_ID" = lead."CRMLead_OrgOfficeID"
    where lead."CRMLead_ID" = source_id and not lead."CRMLead_IsDeleted"
      and coalesce(owner."Company_ID", office."Company_ID") = app_user."Company_ID";
    if not found then raise exception 'That lead is outside this workspace.' using errcode = '42501'; end if;
    customer_id := lead_row."CRMLead_OrgID";
    office_id := lead_row."CRMLead_OrgOfficeID";
    source_contact_name := lead_row."CRMLead_PersonName";
    source_contact_email := lead_row."CRMLead_Email";
    if customer_id is null then
      insert into public."Org_Master" ("Org_Name", "Org_CRMRelationshipStatusCode", "Org_CRMIsLead", "Org_CRMIsPotentialCustomer")
      values (
        coalesce(nullif(btrim(lead_row."CRMLead_CompanyName"), ''), nullif(btrim(lead_row."CRMLead_PersonName"), ''), 'Quote prospect'),
        'lead', true, true
      ) returning "Org_id" into customer_id;
      update public."CRM_Leads" set "CRMLead_OrgID" = customer_id, "CRMLead_UpdatedAt" = now(), "CRMLead_UpdatedBy" = app_user."User_ID"
      where "CRMLead_ID" = source_id;
    end if;
  else
    select account."CRMAccount_OrgID", account."CRMAccount_OrgOfficeID"
    into customer_id, office_id
    from public."CRM_AccountProfiles" account
    left join public."cmp_Users" owner on owner."User_ID" = account."CRMAccount_OwnerUserID"
    left join public."cmp_Offices" office on office."Office_ID" = account."CRMAccount_OrgOfficeID"
    where account."CRMAccount_OrgID" = source_id
      and coalesce(owner."Company_ID", office."Company_ID") = app_user."Company_ID"
    limit 1;
    if customer_id is null then raise exception 'That account is outside this workspace.' using errcode = '42501'; end if;
  end if;

  if office_id is null then
    select office."Office_ID" into office_id from public."cmp_Offices" office
    where office."Company_ID" = app_user."Company_ID" and office."Office_IsActive"
    order by office."Office_ID" limit 1;
  end if;
  if office_id is null then raise exception 'This workspace has no active office.' using errcode = '22023'; end if;

  if supplier_id is not null then
    select supplier."Org_Name" into supplier_name
    from public."Org_Master" supplier where supplier."Org_id" = supplier_id;
    if not found then raise exception 'Choose a valid supplier.' using errcode = '22023'; end if;
  end if;

  if quote_id is not null then
    select quote.* into existing_quote
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = quote_id and office."Company_ID" = app_user."Company_ID"
      and not quote."CusQuoteHeader_IsDeleted" for update;
    if not found then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;
    if existing_quote."CusQuoteHeader_LifecycleCode" in ('accepted', 'converted') then
      raise exception 'Accepted or converted quotes cannot be edited. Revise the quote first.' using errcode = '22023';
    end if;
    if source_type <> existing_quote."CusQuoteHeader_SourceTypeCode"
       or source_id <> coalesce(existing_quote."CusQuoteHeader_SourceLeadID", existing_quote."CusQuoteHeader_CustomerID") then
      raise exception 'The quote source cannot be changed after creation.' using errcode = '22023';
    end if;
    existing_lifecycle := existing_quote."CusQuoteHeader_LifecycleCode";
  end if;

  if quote_id is null then
    quote_id := gen_random_uuid();
    insert into public."CusQuote_Header" (
      "CusQuoteHeader_ID", "CusQuoteHeader_CustomerID", "CusQuoteHeader_CustomerContact",
      "CusQuoteHeader_CreatedDate", "CusQuoteHeader_CreatedBy", "CusQuoteHeader_LastEditedBy",
      "CusQuoteHeader_LastEditedDate", "CusQuoteHeader_OrgOfficeID", "OrgOffice_ID", "Org_ID",
      "CusQuoteHeader_SourceTypeCode", "CusQuoteHeader_SourceLeadID"
    ) values (
      quote_id, customer_id, nullif(payload->>'contactId', '')::uuid,
      now(), app_user."User_ID", app_user."User_ID", now(), office_id, office_id, app_user."Company_ID",
      source_type, case when source_type = 'lead' then source_id else null end
    ) returning "CusQuoteHeader_Number" into quote_number;
  else
    quote_number := existing_quote."CusQuoteHeader_Number";
  end if;

  update public."CusQuote_Header" set
    "CusQuoteHeader_CustomerID" = customer_id,
    "CusQuoteHeader_CustomerContact" = nullif(payload->>'contactId', '')::uuid,
    "CusQuoteHeader_SourceTypeCode" = source_type,
    "CusQuoteHeader_SourceLeadID" = case when source_type = 'lead' then source_id else null end,
    "CusQuoteHeader_ContactNameSnapshot" = left(coalesce(nullif(btrim(payload->>'contactName'), ''), source_contact_name), 180),
    "CusQuoteHeader_ContactEmailSnapshot" = left(coalesce(nullif(btrim(payload->>'contactEmail'), ''), source_contact_email), 320),
    "CusQuoteHeader_ModeCode" = lower(nullif(btrim(payload->>'mode'), '')),
    "CusQuoteHeader_ShipmentTypeCode" = nullif(btrim(payload->>'shipmentType'), ''),
    "CusQuoteHeader_Direction" = lower(nullif(btrim(payload->>'direction'), '')),
    "CusQuoteHeader_ServiceLevel" = nullif(btrim(payload->>'serviceLevel'), ''),
    "CusQuoteHeader_CurrencyCode" = upper(coalesce(nullif(btrim(payload->>'currency'), ''), 'GBP')),
    "CusQuoteHeader_OriginExtra" = nullif(btrim(payload->>'loadingPoint'), ''),
    "CusQuoteHeader_DestinationExtra" = nullif(btrim(payload->>'dischargePoint'), ''),
    "CusQuoteHeader_CollectionAddress" = nullif(btrim(payload->>'collectionAddress'), ''),
    "CusQuoteHeader_LoadingPoint" = nullif(btrim(payload->>'loadingPoint'), ''),
    "CusQuoteHeader_DischargePoint" = nullif(btrim(payload->>'dischargePoint'), ''),
    "CusQuoteHeader_DeliveryAddress" = nullif(btrim(payload->>'deliveryAddress'), ''),
    "CusQuoteHeader_Incoterm" = upper(nullif(btrim(payload->>'incoterm'), '')),
    "CusQuoteHeader_ValidFrom" = nullif(payload->>'validFrom', '')::date,
    "CusQuoteHeader_ValidTo" = nullif(payload->>'validTo', '')::date,
    "CusQuoteHeader_Deadline" = nullif(payload->>'deadline', '')::timestamp,
    "CusQuoteHeader_SupplierID" = supplier_id,
    "CusQuoteHeader_SupplierNameSnapshot" = left(supplier_name, 240),
    "CusQuoteHeader_ShipmentFactsJSON" = coalesce(payload->'shipmentFacts', '{}'::jsonb),
    "CusQuoteHeader_CustomerNotes" = nullif(btrim(payload->>'customerNotes'), ''),
    "CusQuoteHeader_InternalNotes" = nullif(btrim(payload->>'internalNotes'), ''),
    "CusQuoteHeader_TermsText" = nullif(btrim(payload->>'terms'), ''),
    "CusQuoteHeader_RateSourceTypeCode" = lower(coalesce(nullif(btrim(payload->>'rateSourceType'), ''), 'manual')),
    "CusQuoteHeader_RateSourceLabel" = left(nullif(btrim(payload->>'rateSourceLabel'), ''), 240),
    "CusQuoteHeader_DefaultMarkupPct" = default_markup,
    "CusQuoteHeader_MarkupOverrideReason" = nullif(btrim(payload->>'markupOverrideReason'), ''),
    "CusQuoteHeader_FollowUpAt" = nullif(payload->>'followUpAt', '')::timestamptz,
    "CusQuoteHeader_LifecycleCode" = case
      when existing_lifecycle in ('generated','sent','declined','ghosted') then 'revised'
      else existing_lifecycle
    end,
    "CusQuoteHeader_Status" = case
      when existing_lifecycle in ('generated','sent','declined','ghosted') then 1
      else "CusQuoteHeader_Status"
    end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = quote_id;

  delete from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote_id;
  for line in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop
    line_number := line_number + 1;
    cost_amount := greatest(coalesce(nullif(line->>'costAmount', '')::numeric, 0), 0);
    sell_amount := greatest(coalesce(nullif(line->>'sellAmount', '')::numeric, 0), 0);
    cost_roe := greatest(coalesce(nullif(line->>'costRoe', '')::numeric, 1), 0.00001);
    sell_roe := greatest(coalesce(nullif(line->>'sellRoe', '')::numeric, 1), 0.00001);
    insert into public."CusQuote_Lines" (
      "CusQuoteHeader_ID", "CusQuoteLine_Number", "CusQuoteLine_SupplierID", "CusQuoteLine_Description",
      "CusQuoteLine_InternalNotes", "CusQuoteLine_CustomerNotes", "CusQuoteLine_CostROE",
      "CusQuoteLine_CostAmountCurrency", "CusQuoteLine_CostAmountLocal", "CusQuoteLine_RevenueROE",
      "CusQuoteLine_RevenueAmountCurrency", "CusQuoteLine_RevenueAmountLocal", "CusQuoteLine_ShowToCustomer",
      "CusQuoteLine_CostCurrencyCode", "CusQuoteLine_RevenueCurrencyCode", "CusQuoteLine_CalculationBasisCode",
      "CusQuoteLine_Quantity", "CusQuoteLine_UnitRate", "CusQuoteLine_MinimumAmount",
      "CusQuoteLine_DefaultMarkupPct", "CusQuoteLine_AppliedMarkupPct", "CusQuoteLine_MarkupOverrideReason",
      "CusQuoteLine_SourceLabel", "CusQuoteLine_CreatedBy", "CusQuoteLine_UpdatedBy"
    ) values (
      quote_id, line_number, nullif(line->>'supplierId', '')::uuid,
      left(coalesce(nullif(btrim(line->>'description'), ''), 'Charge'), 240),
      nullif(btrim(line->>'internalNotes'), ''), nullif(btrim(line->>'customerNotes'), ''), cost_roe,
      cost_amount, round(cost_amount / cost_roe, 4), sell_roe, sell_amount, round(sell_amount / sell_roe, 4),
      coalesce((line->>'showToCustomer')::boolean, true), upper(coalesce(nullif(line->>'costCurrency', ''), 'GBP')),
      upper(coalesce(nullif(line->>'sellCurrency', ''), 'GBP')), lower(coalesce(nullif(line->>'calculationBasis', ''), 'fixed')),
      greatest(coalesce(nullif(line->>'quantity', '')::numeric, 1), 0), nullif(line->>'unitRate', '')::numeric,
      nullif(line->>'minimumAmount', '')::numeric, coalesce(nullif(line->>'defaultMarkupPct', '')::numeric, default_markup),
      nullif(line->>'appliedMarkupPct', '')::numeric, nullif(btrim(line->>'markupOverrideReason'), ''),
      left(coalesce(nullif(btrim(line->>'sourceLabel'), ''), nullif(btrim(payload->>'rateSourceLabel'), '')), 240),
      app_user."User_ID", app_user."User_ID"
    );
  end loop;

  delete from public."CusQuote_Parties" where "CusQuoteHeader_ID" = quote_id;
  if nullif(btrim(payload#>>'{shipper,name}'), '') is not null then
    insert into public."CusQuote_Parties" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteParty_RoleCode", "CusQuoteParty_OrgID",
      "CusQuoteParty_NameSnapshot", "CusQuoteParty_AddressSnapshot", "CusQuoteParty_ContactSnapshot"
    ) values (
      app_user."Company_ID", quote_id, 'shipper', nullif(payload#>>'{shipper,orgId}', '')::uuid,
      left(btrim(payload#>>'{shipper,name}'), 240), nullif(btrim(payload#>>'{shipper,address}'), ''),
      left(nullif(btrim(payload#>>'{shipper,contact}'), ''), 180)
    );
  end if;
  if nullif(btrim(payload#>>'{consignee,name}'), '') is not null then
    insert into public."CusQuote_Parties" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteParty_RoleCode", "CusQuoteParty_OrgID",
      "CusQuoteParty_NameSnapshot", "CusQuoteParty_AddressSnapshot", "CusQuoteParty_ContactSnapshot"
    ) values (
      app_user."Company_ID", quote_id, 'consignee', nullif(payload#>>'{consignee,orgId}', '')::uuid,
      left(btrim(payload#>>'{consignee,name}'), 240), nullif(btrim(payload#>>'{consignee,address}'), ''),
      left(nullif(btrim(payload#>>'{consignee,contact}'), ''), 180)
    );
  end if;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteEvent_TypeCode", "CusQuoteEvent_Summary", "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", quote_id,
    case when requested_quote_id is null then 'created' else 'saved' end,
    case when requested_quote_id is null then 'Quote created from ' || source_type || '.' else 'Working quote saved.' end,
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', quote_id,
    'reference', 'Q-' || quote_number,
    'lifecycle', (select "CusQuoteHeader_LifecycleCode" from public."CusQuote_Header" where "CusQuoteHeader_ID" = quote_id)
  );
exception when no_data_found or too_many_rows then
  raise exception 'User or quote identity is ambiguous.' using errcode = '42501';
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
  current_version_id uuid;
  charge_count integer;
begin
  if caller_auth_user_id is null or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'quote management is not authorised' using errcode = '42501';
  end if;
  if next_lifecycle not in ('calculated','sent','revised','accepted','declined','ghosted') then
    raise exception 'Choose a supported quote action.' using errcode = '22023';
  end if;
  select app."User_ID", app."Company_ID" into strict app_user
  from public."cmp_Users" app where app."Auth_User_ID" = caller_auth_user_id;
  select quote.* into quote_row from public."CusQuote_Header" quote
  join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted" for update;
  if not found then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;

  if quote_row."CusQuoteHeader_LifecycleCode" in ('accepted', 'converted') then
    raise exception 'Accepted or converted quotes cannot be changed.' using errcode = '22023';
  end if;
  if next_lifecycle = 'revised' and quote_row."CusQuoteHeader_LifecycleCode" not in ('generated', 'sent', 'declined', 'ghosted') then
    raise exception 'Only an issued quote can be revised.' using errcode = '22023';
  end if;

  select count(*) into charge_count from public."CusQuote_Lines" where "CusQuoteHeader_ID" = requested_quote_id;
  select "CusQuoteVersion_ID" into current_version_id from public."CusQuote_Versions"
  where "CusQuoteHeader_ID" = requested_quote_id and "CusQuoteVersion_IsCurrent" limit 1;

  if next_lifecycle = 'calculated' and (
    nullif(btrim(quote_row."CusQuoteHeader_SupplierNameSnapshot"), '') is null or charge_count = 0
  ) then raise exception 'Add a supplier and at least one charge before calculation.' using errcode = '22023'; end if;
  if next_lifecycle in ('sent','accepted') and current_version_id is null then
    raise exception 'Generate the customer quote document before this action.' using errcode = '22023';
  end if;
  if next_lifecycle = 'accepted' and quote_row."CusQuoteHeader_LifecycleCode" not in ('generated','sent') then
    raise exception 'Only an issued quote can be accepted.' using errcode = '22023';
  end if;
  if next_lifecycle = 'sent' and quote_row."CusQuoteHeader_LifecycleCode" <> 'generated' then
    raise exception 'Generate the current quote version before sending.' using errcode = '22023';
  end if;
  if next_lifecycle = 'sent' and requested_follow_up_at is null then
    raise exception 'Choose a follow-up date before marking the quote sent.' using errcode = '22023';
  end if;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = next_lifecycle,
    "CusQuoteHeader_Status" = case next_lifecycle when 'calculated' then 2 when 'sent' then 4 when 'accepted' then 5 when 'declined' then 6 when 'ghosted' then 7 when 'revised' then 1 else "CusQuoteHeader_Status" end,
    "CusQuoteHeader_AcceptedVersionID" = case when next_lifecycle = 'accepted' then current_version_id else "CusQuoteHeader_AcceptedVersionID" end,
    "CusQuoteHeader_OutcomeNotes" = case when next_lifecycle in ('accepted','declined','ghosted') then nullif(btrim(requested_note), '') else "CusQuoteHeader_OutcomeNotes" end,
    "CusQuoteHeader_FollowUpAt" = case when next_lifecycle = 'sent' then requested_follow_up_at else "CusQuoteHeader_FollowUpAt" end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID", "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  if next_lifecycle = 'sent' then
    update public."CRM_QuoteFollowups" set "CRMQF_StatusCode" = 'pending',
      "CRMQF_NextActionDueAt" = requested_follow_up_at,
      "CRMQF_InternalNotes" = coalesce(nullif(btrim(requested_note), ''), "CRMQF_InternalNotes"),
      "CRMQF_UpdatedAt" = now(), "CRMQF_UpdatedBy" = app_user."User_ID"
    where "CRMQF_CusQuoteHeaderID" = requested_quote_id and not "CRMQF_IsDeleted";
    if not found then
      insert into public."CRM_QuoteFollowups" (
        "CRMQF_CusQuoteHeaderID", "CRMQF_CustomerOrgID", "CRMQF_CustomerContactID", "CRMQF_OwnerUserID",
        "CRMQF_StatusCode", "CRMQF_NextActionDueAt", "CRMQF_QuoteExpiresAt", "CRMQF_InternalNotes",
        "CRMQF_CreatedBy", "CRMQF_UpdatedBy"
      ) values (
        requested_quote_id, quote_row."CusQuoteHeader_CustomerID", quote_row."CusQuoteHeader_CustomerContact",
        app_user."User_ID", 'pending', requested_follow_up_at, quote_row."CusQuoteHeader_ValidTo"::timestamptz,
        nullif(btrim(requested_note), ''), app_user."User_ID", app_user."User_ID"
      );
    end if;
  elsif next_lifecycle in ('accepted','declined','ghosted') then
    update public."CRM_QuoteFollowups" set "CRMQF_StatusCode" = next_lifecycle,
      "CRMQF_LastResponseAt" = case when next_lifecycle <> 'ghosted' then now() else "CRMQF_LastResponseAt" end,
      "CRMQF_InternalNotes" = coalesce(nullif(btrim(requested_note), ''), "CRMQF_InternalNotes"),
      "CRMQF_UpdatedAt" = now(), "CRMQF_UpdatedBy" = app_user."User_ID"
    where "CRMQF_CusQuoteHeaderID" = requested_quote_id and not "CRMQF_IsDeleted";
  end if;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, current_version_id, next_lifecycle,
    initcap(next_lifecycle) || case when nullif(btrim(requested_note), '') is null then '.' else ': ' || left(btrim(requested_note), 500) end,
    jsonb_strip_nulls(jsonb_build_object('followUpAt', requested_follow_up_at)), app_user."User_ID"
  );
  return jsonb_build_object('quoteId', requested_quote_id, 'lifecycle', next_lifecycle, 'versionId', current_version_id);
exception when no_data_found or too_many_rows then
  raise exception 'User identity is ambiguous.' using errcode = '42501';
end;
$$;

create or replace function quote_api.convert_to_booking(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  idempotency_key uuid,
  readiness jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  existing_job record;
  shipper_id uuid := nullif(readiness->>'shipperId', '')::uuid;
  consignee_id uuid := nullif(readiness->>'consigneeId', '')::uuid;
  shipper_name text := nullif(btrim(readiness->>'shipperName'), '');
  consignee_name text := nullif(btrim(readiness->>'consigneeName'), '');
  job_id uuid := gen_random_uuid();
  job_number integer;
  accepted_snapshot jsonb;
  source_lead record;
  account_id uuid;
begin
  if caller_auth_user_id is null or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Convert') then
    raise exception 'quote conversion is not authorised' using errcode = '42501';
  end if;
  if idempotency_key is null then raise exception 'A conversion key is required.' using errcode = '22023'; end if;
  select app."User_ID", app."Company_ID" into strict app_user
  from public."cmp_Users" app where app."Auth_User_ID" = caller_auth_user_id;
  select quote.* into quote_row from public."CusQuote_Header" quote
  join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted" for update;
  if not found then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;

  if quote_row."CusQuoteHeader_JobID" is not null then
    select job.* into existing_job from public."Job_Header" job where job."Job_ID" = quote_row."CusQuoteHeader_JobID";
    return jsonb_build_object('quoteId', requested_quote_id, 'bookingId', existing_job."Job_ID", 'bookingReference', 'MD-' || existing_job."Job_Number", 'reused', true);
  end if;
  if quote_row."CusQuoteHeader_LifecycleCode" <> 'accepted' or quote_row."CusQuoteHeader_AcceptedVersionID" is null then
    raise exception 'Accept a generated quote version before conversion.' using errcode = '22023';
  end if;
  if shipper_id is null and shipper_name is null then raise exception 'Shipper is required.' using errcode = '22023'; end if;
  if consignee_id is null and consignee_name is null then raise exception 'Consignee is required.' using errcode = '22023'; end if;
  if nullif(btrim(quote_row."CusQuoteHeader_ModeCode"), '') is null
     or nullif(btrim(quote_row."CusQuoteHeader_ShipmentTypeCode"), '') is null
     or nullif(btrim(coalesce(quote_row."CusQuoteHeader_CollectionAddress", quote_row."CusQuoteHeader_OriginExtra")), '') is null
     or nullif(btrim(coalesce(quote_row."CusQuoteHeader_DeliveryAddress", quote_row."CusQuoteHeader_DestinationExtra")), '') is null then
    raise exception 'Complete the mode, shipment type, collection and delivery details.' using errcode = '22023';
  end if;
  if quote_row."CusQuoteHeader_ModeCode" in ('sea','ocean','air') and (
    nullif(btrim(quote_row."CusQuoteHeader_LoadingPoint"), '') is null or nullif(btrim(quote_row."CusQuoteHeader_DischargePoint"), '') is null
  ) then raise exception 'Departure and arrival points are required for sea and air bookings.' using errcode = '22023'; end if;

  if shipper_id is null then
    insert into public."Org_Master" ("Org_Name", "Org_CRMRelationshipStatusCode") values (shipper_name, 'operational_party') returning "Org_id" into shipper_id;
  elsif not exists (select 1 from public."Org_Master" where "Org_id" = shipper_id) then
    raise exception 'Choose a valid shipper.' using errcode = '22023';
  end if;
  if consignee_id is null then
    insert into public."Org_Master" ("Org_Name", "Org_CRMRelationshipStatusCode") values (consignee_name, 'operational_party') returning "Org_id" into consignee_id;
  elsif not exists (select 1 from public."Org_Master" where "Org_id" = consignee_id) then
    raise exception 'Choose a valid consignee.' using errcode = '22023';
  end if;

  if quote_row."CusQuoteHeader_SourceTypeCode" = 'lead' and quote_row."CusQuoteHeader_SourceLeadID" is not null then
    select * into source_lead from public."CRM_Leads" where "CRMLead_ID" = quote_row."CusQuoteHeader_SourceLeadID" for update;
    insert into public."CRM_AccountProfiles" (
      "CRMAccount_OrgID", "CRMAccount_RelationshipStatusCode", "CRMAccount_OwnerUserID", "CRMAccount_OrgOfficeID",
      "CRMAccount_PrimaryModeCode", "CRMAccount_PrimaryTradeLane", "CRMAccount_CustomerCentricSummary", "CRMAccount_CreatedBy"
    ) values (
      quote_row."CusQuoteHeader_CustomerID", 'customer', coalesce(source_lead."CRMLead_OwnerUserID", app_user."User_ID"),
      coalesce(source_lead."CRMLead_OrgOfficeID", quote_row."CusQuoteHeader_OrgOfficeID"), source_lead."CRMLead_ModeCode",
      source_lead."CRMLead_TradeLane", source_lead."CRMLead_CustomerCentricNeed", app_user."User_ID"
    ) on conflict ("CRMAccount_OrgID") do update set "CRMAccount_RelationshipStatusCode" = 'customer',
      "CRMAccount_UpdatedAt" = now(), "CRMAccount_UpdatedBy" = app_user."User_ID"
    returning "CRMAccount_ID" into account_id;
    update public."CRM_Leads" set "CRMLead_StatusCode" = 'converted', "CRMLead_UpdatedAt" = now(), "CRMLead_UpdatedBy" = app_user."User_ID"
    where "CRMLead_ID" = quote_row."CusQuoteHeader_SourceLeadID";
    insert into public."CRM_LeadConversions" (
      "CRMLeadConv_LeadID", "CRMLeadConv_OrgID", "CRMLeadConv_AccountID", "CRMLeadConv_QuoteHeaderID",
      "CRMLeadConv_ConvertedBy", "CRMLeadConv_ConversionNotes"
    ) values (
      quote_row."CusQuoteHeader_SourceLeadID", quote_row."CusQuoteHeader_CustomerID", account_id, requested_quote_id,
      app_user."User_ID", 'Converted when the accepted quote became a booking.'
    );
  end if;

  select "CusQuoteVersion_SnapshotJSON" into strict accepted_snapshot from public."CusQuote_Versions"
  where "CusQuoteVersion_ID" = quote_row."CusQuoteHeader_AcceptedVersionID" and "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."Job_Header" (
    "Job_ID", "Job_Period", "Job_CreatedBy", "Job_Customer", "Job_Shipper", "Job_Consignee", "Job_Carrier", "Job_Supplier",
    "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction", "Job_TransportModeSummary",
    "Job_OriginNameSnapshot", "Job_DestinationNameSnapshot", "Job_ReadyDate", "Job_RequiredDeliveryDate",
    "Job_TrackingStatus", "Job_CurrentLocationNameSnapshot", "Job_InternalNotes", "Job_UpdatedBy"
  ) values (
    job_id, to_char(current_date, 'YYYYMM'), app_user."User_ID", quote_row."CusQuoteHeader_CustomerID", shipper_id, consignee_id,
    null, quote_row."CusQuoteHeader_SupplierID", coalesce(quote_row."CusQuoteHeader_OrgOfficeID", quote_row."OrgOffice_ID"),
    coalesce(quote_row."CusQuoteHeader_OrgOfficeID", quote_row."OrgOffice_ID"), 'open', quote_row."CusQuoteHeader_Direction",
    quote_row."CusQuoteHeader_ModeCode", coalesce(quote_row."CusQuoteHeader_CollectionAddress", quote_row."CusQuoteHeader_OriginExtra"),
    coalesce(quote_row."CusQuoteHeader_DeliveryAddress", quote_row."CusQuoteHeader_DestinationExtra"), quote_row."CusQuoteHeader_ValidFrom",
    quote_row."CusQuoteHeader_ValidTo", 'planning', coalesce(quote_row."CusQuoteHeader_CollectionAddress", 'Planning'),
    concat_ws(E'\n', nullif(btrim(readiness->>'operationalNotes'), ''), 'Accepted quote snapshot: ' || quote_row."CusQuoteHeader_AcceptedVersionID"),
    app_user."User_ID"
  ) returning "Job_Number" into job_number;

  insert into public."Job_Routing" (
    "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode", "JobRoute_OriginNameSnapshot",
    "JobRoute_DestinationNameSnapshot", "JobRoute_PlannedDepartureAt", "JobRoute_PlannedArrivalAt", "JobRoute_IsMainCarriage", "JobRoute_UpdatedBy"
  ) values (
    job_id, 1, 'planned', quote_row."CusQuoteHeader_ModeCode", coalesce(quote_row."CusQuoteHeader_LoadingPoint", quote_row."CusQuoteHeader_CollectionAddress"),
    coalesce(quote_row."CusQuoteHeader_DischargePoint", quote_row."CusQuoteHeader_DeliveryAddress"), quote_row."CusQuoteHeader_ValidFrom"::timestamptz,
    quote_row."CusQuoteHeader_ValidTo"::timestamptz, true, app_user."User_ID"
  );

  if nullif(btrim(quote_row."CusQuoteHeader_ShipmentFactsJSON"->>'description'), '') is not null then
    insert into public."Job_Cargo" (
      "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_PackageQty", "JobCargo_GrossKilos", "JobCargo_VolumeCBM", "JobCargo_UpdatedBy"
    ) values (
      job_id, 1, quote_row."CusQuoteHeader_ShipmentFactsJSON"->>'description',
      nullif(quote_row."CusQuoteHeader_ShipmentFactsJSON"->>'pieces', '')::numeric,
      nullif(quote_row."CusQuoteHeader_ShipmentFactsJSON"->>'weightKg', '')::numeric,
      nullif(quote_row."CusQuoteHeader_ShipmentFactsJSON"->>'volumeCbm', '')::numeric, app_user."User_ID"
    );
  end if;

  update public."CusQuote_Header" set "CusQuoteHeader_JobID" = job_id, "CusQuoteHeader_LifecycleCode" = 'converted',
    "CusQuoteHeader_Status" = 8, "CusQuoteHeader_ConversionKey" = idempotency_key, "CusQuoteHeader_ConvertedAt" = now(),
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID", "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode", "CusQuoteEvent_Summary",
    "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, quote_row."CusQuoteHeader_AcceptedVersionID", 'converted',
    'Accepted quote converted to booking MD-' || job_number || '.',
    jsonb_build_object('bookingId', job_id, 'bookingReference', 'MD-' || job_number, 'idempotencyKey', idempotency_key), app_user."User_ID"
  );
  return jsonb_build_object('quoteId', requested_quote_id, 'bookingId', job_id, 'bookingReference', 'MD-' || job_number, 'reused', false);
exception when unique_violation then
  select job.* into existing_job from public."CusQuote_Header" quote join public."Job_Header" job on job."Job_ID" = quote."CusQuoteHeader_JobID"
  where quote."CusQuoteHeader_ID" = requested_quote_id;
  if found then return jsonb_build_object('quoteId', requested_quote_id, 'bookingId', existing_job."Job_ID", 'bookingReference', 'MD-' || existing_job."Job_Number", 'reused', true); end if;
  raise;
when no_data_found or too_many_rows then
  raise exception 'Quote conversion identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

revoke all on all functions in schema quote_api from public, anon, authenticated;
grant execute on function quote_api.has_permission(uuid, text) to service_role;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb) to service_role;
grant execute on function quote_api.transition_quote(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function quote_api.convert_to_booking(uuid, uuid, uuid, jsonb) to service_role;

-- Register quote data as a document scope. The template remains a draft until the
-- document-builder owner publishes a Carbone version with code CUSTOMER_QUOTE.
insert into public."sys_DocBuilderDataScopes" (
  "DOCBSC_Code", "DOCBSC_Name", "DOCBSC_Description", "DOCBSC_SortOrder", "DOCBSC_IsActive"
) values ('quote', 'Customer quote', 'Structured customer quote, charge, movement and commercial version data.', 25, true)
on conflict ("DOCBSC_Code") do update set
  "DOCBSC_Name" = excluded."DOCBSC_Name", "DOCBSC_Description" = excluded."DOCBSC_Description", "DOCBSC_IsActive" = true;

insert into public."DOCB_DocumentTemplates" (
  "DOCBT_Code", "DOCBT_Name", "DOCBT_DataScopeCode", "DOCBT_StatusCode", "DOCBT_CurrentVersionNo",
  "DOCBT_DefaultRenderEngineCode", "DOCBT_DefaultOutputFormatCode", "DOCBT_LanguageCode", "DOCBT_Description",
  "DOCBT_SettingsJSON", "DOCBT_IsSystem", "DOCBT_IsUserEditable", "DOCBT_IsActive"
) values (
  'CUSTOMER_QUOTE', 'Customer quote', 'quote', 'draft', 1, 'carbone', 'pdf', 'en',
  'Standard customer quote generated from an immutable quote version.',
  '{"outputFormats":["pdf","docx"],"managedBy":"document-builder","requiredSections":["quote","customer","movement","charges","terms"]}'::jsonb,
  true, true, true
) on conflict ("DOCBT_Code") do update set
  "DOCBT_Name" = excluded."DOCBT_Name", "DOCBT_DataScopeCode" = excluded."DOCBT_DataScopeCode",
  "DOCBT_Description" = excluded."DOCBT_Description", "DOCBT_IsActive" = true, "DOCBT_UpdatedAt" = now();

create or replace function document_api.prepare_quote_render(
  caller_auth_user_id uuid,
  requested_template_code text,
  requested_quote_reference text,
  requested_output_format text,
  requested_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  selected_template record;
  selected_version record;
  quote_number integer;
  input_snapshot jsonb;
  render_job_id uuid := gen_random_uuid();
  quote_version_id uuid := gen_random_uuid();
  next_version integer;
  correlation_id uuid := gen_random_uuid();
  carbone_reference text;
  totals record;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write')
     or not document_api.has_permission(caller_auth_user_id, 'Documents.Generate') then
    raise exception 'quote document generation is not authorised' using errcode = '42501';
  end if;
  if requested_output_format not in ('pdf','docx') then raise exception 'unsupported output format' using errcode = '22023'; end if;
  if upper(btrim(requested_template_code)) <> 'CUSTOMER_QUOTE' then raise exception 'unsupported quote template' using errcode = '22023'; end if;
  quote_number := regexp_replace(upper(btrim(requested_quote_reference)), '^Q-', '')::integer;
  select app."User_ID", app."Company_ID" into strict app_user from public."cmp_Users" app where app."Auth_User_ID" = caller_auth_user_id;
  select quote.* into strict quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    and office."Company_ID" = app_user."Company_ID"
  where quote."CusQuoteHeader_Number" = quote_number and not quote."CusQuoteHeader_IsDeleted" for update;

  if nullif(btrim(quote_row."CusQuoteHeader_SupplierNameSnapshot"), '') is null
     or nullif(btrim(quote_row."CusQuoteHeader_ModeCode"), '') is null
     or nullif(btrim(quote_row."CusQuoteHeader_ShipmentTypeCode"), '') is null
     or nullif(btrim(quote_row."CusQuoteHeader_CurrencyCode"), '') is null then
    raise exception 'quote is not ready for document generation' using errcode = '22023';
  end if;
  if not exists (select 1 from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote_row."CusQuoteHeader_ID") then
    raise exception 'quote has no charge lines' using errcode = '22023';
  end if;
  if quote_row."CusQuoteHeader_LifecycleCode" not in ('calculated', 'revised') then
    raise exception 'Calculate or revise the quote before generating a document.' using errcode = '22023';
  end if;

  select template.* into strict selected_template from public."DOCB_DocumentTemplates" template
  where template."DOCBT_Code" = 'CUSTOMER_QUOTE' and template."DOCBT_StatusCode" = 'published'
    and template."DOCBT_IsActive" and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
    and (template."DOCBT_OrgOfficeID" is null or template."DOCBT_OrgOfficeID" = quote_row."CusQuoteHeader_OrgOfficeID")
    and (template."DOCBT_CustomerOrgID" is null or template."DOCBT_CustomerOrgID" = quote_row."CusQuoteHeader_CustomerID")
  order by (template."DOCBT_OrgOfficeID" is not null)::integer + (template."DOCBT_CustomerOrgID" is not null)::integer desc
  limit 1;
  select version.* into strict selected_version from public."DOCB_TemplateVersions" version
  where version."DOCBTV_TemplateID" = selected_template."DOCBT_ID"
    and version."DOCBTV_VersionNo" = selected_template."DOCBT_CurrentVersionNo"
    and version."DOCBTV_StatusCode" = 'published';
  carbone_reference := coalesce(
    selected_version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}',
    selected_version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,templateId}',
    selected_template."DOCBT_SettingsJSON" #>> '{carbone,versionId}',
    selected_template."DOCBT_SettingsJSON" #>> '{carbone,templateId}'
  );
  if carbone_reference is null or carbone_reference !~ '^[A-Za-z0-9._-]{8,128}$' then
    raise exception 'published quote template has no valid Carbone reference' using errcode = '22023';
  end if;

  select coalesce(sum("CusQuoteLine_CostAmountLocal"),0) cost, coalesce(sum("CusQuoteLine_RevenueAmountLocal"),0) sell
  into totals from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote_row."CusQuoteHeader_ID";
  input_snapshot := jsonb_build_object(
    'meta', jsonb_build_object('schemaVersion', 1, 'generatedAt', now(), 'correlationId', correlation_id,
      'templateCode', selected_template."DOCBT_Code", 'templateVersion', selected_version."DOCBTV_VersionNo",
      'languageCode', selected_template."DOCBT_LanguageCode"),
    'quote', jsonb_strip_nulls(jsonb_build_object(
      'id', quote_row."CusQuoteHeader_ID", 'reference', 'Q-' || quote_row."CusQuoteHeader_Number",
      'lifecycle', quote_row."CusQuoteHeader_LifecycleCode", 'createdAt', quote_row."CusQuoteHeader_CreatedDate",
      'validFrom', quote_row."CusQuoteHeader_ValidFrom", 'validTo', quote_row."CusQuoteHeader_ValidTo",
      'currency', quote_row."CusQuoteHeader_CurrencyCode", 'direction', quote_row."CusQuoteHeader_Direction",
      'mode', quote_row."CusQuoteHeader_ModeCode", 'shipmentType', quote_row."CusQuoteHeader_ShipmentTypeCode",
      'serviceLevel', quote_row."CusQuoteHeader_ServiceLevel", 'incoterm', quote_row."CusQuoteHeader_Incoterm",
      'customerNotes', quote_row."CusQuoteHeader_CustomerNotes", 'terms', quote_row."CusQuoteHeader_TermsText")),
    'customer', (select jsonb_strip_nulls(jsonb_build_object('id', customer."Org_id", 'name', customer."Org_Name",
      'contactName', quote_row."CusQuoteHeader_ContactNameSnapshot", 'contactEmail', quote_row."CusQuoteHeader_ContactEmailSnapshot"))
      from public."Org_Master" customer where customer."Org_id" = quote_row."CusQuoteHeader_CustomerID"),
    'supplier', jsonb_strip_nulls(jsonb_build_object('id', quote_row."CusQuoteHeader_SupplierID", 'name', quote_row."CusQuoteHeader_SupplierNameSnapshot",
      'sourceType', quote_row."CusQuoteHeader_RateSourceTypeCode", 'sourceLabel', quote_row."CusQuoteHeader_RateSourceLabel")),
    'movement', jsonb_strip_nulls(jsonb_build_object('collection', quote_row."CusQuoteHeader_CollectionAddress",
      'loading', quote_row."CusQuoteHeader_LoadingPoint", 'discharge', quote_row."CusQuoteHeader_DischargePoint",
      'delivery', quote_row."CusQuoteHeader_DeliveryAddress", 'facts', quote_row."CusQuoteHeader_ShipmentFactsJSON")),
    'parties', coalesce((select jsonb_object_agg(party."CusQuoteParty_RoleCode", jsonb_strip_nulls(jsonb_build_object(
      'id', party."CusQuoteParty_OrgID", 'name', party."CusQuoteParty_NameSnapshot", 'address', party."CusQuoteParty_AddressSnapshot",
      'contact', party."CusQuoteParty_ContactSnapshot"))) from public."CusQuote_Parties" party
      where party."CusQuoteHeader_ID" = quote_row."CusQuoteHeader_ID"), '{}'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'lineNumber', line."CusQuoteLine_Number", 'description', line."CusQuoteLine_Description",
      'costCurrency', line."CusQuoteLine_CostCurrencyCode", 'costAmount', line."CusQuoteLine_CostAmountCurrency",
      'sellCurrency', line."CusQuoteLine_RevenueCurrencyCode", 'sellAmount', line."CusQuoteLine_RevenueAmountCurrency",
      'costLocal', line."CusQuoteLine_CostAmountLocal", 'sellLocal', line."CusQuoteLine_RevenueAmountLocal",
      'calculationBasis', line."CusQuoteLine_CalculationBasisCode", 'quantity', line."CusQuoteLine_Quantity",
      'minimum', line."CusQuoteLine_MinimumAmount", 'showToCustomer', line."CusQuoteLine_ShowToCustomer",
      'customerNotes', line."CusQuoteLine_CustomerNotes")) order by line."CusQuoteLine_Number")
      from public."CusQuote_Lines" line where line."CusQuoteHeader_ID" = quote_row."CusQuoteHeader_ID"), '[]'::jsonb),
    'totals', jsonb_build_object('cost', totals.cost, 'sell', totals.sell, 'profit', totals.sell - totals.cost,
      'marginPct', case when totals.sell = 0 then null else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
      'currency', quote_row."CusQuoteHeader_CurrencyCode")
  );
  select coalesce(max("CusQuoteVersion_Number"),0) + 1 into next_version from public."CusQuote_Versions"
  where "CusQuoteHeader_ID" = quote_row."CusQuoteHeader_ID";
  insert into public."CusQuote_Versions" (
    "CusQuoteVersion_ID", "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_Number", "CusQuoteVersion_StatusCode",
    "CusQuoteVersion_SnapshotJSON", "CusQuoteVersion_CreatedBy"
  ) values (quote_version_id, app_user."Company_ID", quote_row."CusQuoteHeader_ID", next_version, 'rendering', input_snapshot, app_user."User_ID");
  insert into public."DOCB_RenderJobs" (
    "DOCBRJ_ID", "DOCBRJ_TemplateID", "DOCBRJ_TemplateVersionID", "DOCBRJ_StatusCode", "DOCBRJ_RenderEngineCode",
    "DOCBRJ_OutputFormatCode", "DOCBRJ_TargetTable", "DOCBRJ_TargetID", "DOCBRJ_InputSnapshotJSON",
    "DOCBRJ_RenderSettingsJSON", "DOCBRJ_StartedAt", "DOCBRJ_CreatedBy"
  ) values (
    render_job_id, selected_template."DOCBT_ID", selected_version."DOCBTV_ID", 'rendering', selected_version."DOCBTV_RenderEngineCode",
    requested_output_format, 'CusQuote_Header', quote_row."CusQuoteHeader_ID", input_snapshot,
    jsonb_strip_nulls(jsonb_build_object('provider','carbone','correlationId',correlation_id,'reason',nullif(btrim(requested_reason),''),'quoteVersionId',quote_version_id)),
    now(), app_user."User_ID"
  );
  return jsonb_build_object(
    'renderJobId', render_job_id, 'quoteVersionId', quote_version_id, 'templateCode', selected_template."DOCBT_Code",
    'carboneTemplateReference', carbone_reference, 'outputFormat', requested_output_format,
    'languageCode', selected_template."DOCBT_LanguageCode", 'jobId', quote_row."CusQuoteHeader_ID",
    'jobReference', 'Q-' || quote_row."CusQuoteHeader_Number" || '-V' || next_version,
    'companyId', app_user."Company_ID", 'dataset', input_snapshot
  );
exception when no_data_found then
  raise exception 'Publish the CUSTOMER_QUOTE template before generating a quote document.' using errcode = 'MDQ01';
when too_many_rows then
  raise exception 'Quote document identity is ambiguous.' using errcode = '42501';
end;
$$;

create or replace function document_api.complete_quote_render(
  caller_auth_user_id uuid, requested_render_job_id uuid, generated_document_id uuid,
  storage_bucket text, storage_path text, original_file_name text, mime_type text, file_size_bytes bigint, sha256 text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare render_job record; actor_user_id uuid; quote_version_id uuid; customer_id uuid; stored_object_id uuid := gen_random_uuid(); company_id uuid;
begin
  select app."User_ID", app."Company_ID" into strict actor_user_id, company_id from public."cmp_Users" app where app."Auth_User_ID" = caller_auth_user_id;
  select render.* into strict render_job from public."DOCB_RenderJobs" render
  where render."DOCBRJ_ID" = requested_render_job_id and render."DOCBRJ_CreatedBy" = actor_user_id
    and render."DOCBRJ_StatusCode" = 'rendering' and render."DOCBRJ_TargetTable" = 'CusQuote_Header' for update;
  quote_version_id := (render_job."DOCBRJ_RenderSettingsJSON"->>'quoteVersionId')::uuid;
  select quote."CusQuoteHeader_CustomerID" into strict customer_id from public."CusQuote_Header" quote
  join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID") and office."Company_ID" = company_id
  where quote."CusQuoteHeader_ID" = render_job."DOCBRJ_TargetID";
  insert into public."DOCB_GeneratedDocuments" (
    "DOCBGD_ID", "DOCBGD_RenderJobID", "DOCBGD_TemplateID", "DOCBGD_TemplateVersionID", "DOCBGD_OutputFormatCode",
    "DOCBGD_FileName", "DOCBGD_StorageBucket", "DOCBGD_StoragePath", "DOCBGD_MimeType", "DOCBGD_FileSizeBytes",
    "DOCBGD_SHA256", "DOCBGD_VersionNo", "DOCBGD_IsCurrentVersion", "DOCBGD_MetadataJSON", "DOCBGD_CreatedBy"
  ) values (
    generated_document_id, render_job."DOCBRJ_ID", render_job."DOCBRJ_TemplateID", render_job."DOCBRJ_TemplateVersionID",
    render_job."DOCBRJ_OutputFormatCode", original_file_name, storage_bucket, storage_path, mime_type, file_size_bytes, sha256,
    (select "CusQuoteVersion_Number" from public."CusQuote_Versions" where "CusQuoteVersion_ID" = quote_version_id), true,
    jsonb_build_object('storedObjectId', stored_object_id, 'targetType', 'CusQuote_Header', 'targetId', render_job."DOCBRJ_TargetID", 'quoteVersionId', quote_version_id), actor_user_id
  );
  insert into public."DOC_StoredObjects" (
    "DOCStoredObject_ID", "DOCStoredObject_ConcernCode", "DOCStoredObject_OrganisationID", "DOCStoredObject_AggregateType",
    "DOCStoredObject_AggregateID", "DOCStoredObject_ProviderCode", "DOCStoredObject_Container", "DOCStoredObject_BlobName",
    "DOCStoredObject_OriginalFileName", "DOCStoredObject_MimeType", "DOCStoredObject_FileSizeBytes", "DOCStoredObject_SHA256",
    "DOCStoredObject_StatusCode", "DOCStoredObject_CreatedBy"
  ) values (
    stored_object_id, 'generated', customer_id, 'DOCB_GeneratedDocument', generated_document_id, 'supabase_storage', storage_bucket,
    storage_path, original_file_name, mime_type, file_size_bytes, sha256, 'active', actor_user_id
  );
  update public."CusQuote_Versions" set "CusQuoteVersion_IsCurrent" = false
  where "CusQuoteHeader_ID" = render_job."DOCBRJ_TargetID" and "CusQuoteVersion_IsCurrent";
  update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode" = 'generated', "CusQuoteVersion_GeneratedDocumentID" = generated_document_id,
    "CusQuoteVersion_IsCurrent" = true, "CusQuoteVersion_IssuedAt" = now(), "CusQuoteVersion_IssuedBy" = actor_user_id
  where "CusQuoteVersion_ID" = quote_version_id and "CusQuoteHeader_ID" = render_job."DOCBRJ_TargetID";
  update public."CusQuote_Header" set "CusQuoteHeader_LifecycleCode" = 'generated', "CusQuoteHeader_Status" = 2,
    "CusQuoteHeader_LastEditedDate" = now(), "CusQuoteHeader_LastEditedBy" = actor_user_id
  where "CusQuoteHeader_ID" = render_job."DOCBRJ_TargetID" and "CusQuoteHeader_LifecycleCode" not in ('accepted','converted');
  update public."DOCB_RenderJobs" set "DOCBRJ_StatusCode" = 'completed', "DOCBRJ_CompletedAt" = now(), "DOCBRJ_ErrorMessage" = null
  where "DOCBRJ_ID" = requested_render_job_id;
  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode", "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    company_id, render_job."DOCBRJ_TargetID", quote_version_id, 'generated', 'Customer quote document generated and stored.',
    jsonb_build_object('generatedDocumentId', generated_document_id, 'fileName', original_file_name), actor_user_id
  );
  return jsonb_build_object('generatedDocumentId', generated_document_id, 'storedObjectId', stored_object_id, 'quoteVersionId', quote_version_id);
end; $$;

create or replace function document_api.fail_quote_render(caller_auth_user_id uuid, requested_render_job_id uuid, safe_error_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_user_id uuid; quote_version_id uuid;
begin
  select "User_ID" into strict actor_user_id from public."cmp_Users" where "Auth_User_ID" = caller_auth_user_id;
  select ("DOCBRJ_RenderSettingsJSON"->>'quoteVersionId')::uuid into quote_version_id from public."DOCB_RenderJobs"
  where "DOCBRJ_ID" = requested_render_job_id and "DOCBRJ_CreatedBy" = actor_user_id and "DOCBRJ_TargetTable" = 'CusQuote_Header';
  update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode" = 'failed' where "CusQuoteVersion_ID" = quote_version_id;
  update public."DOCB_RenderJobs" set "DOCBRJ_StatusCode" = 'failed', "DOCBRJ_CompletedAt" = now(),
    "DOCBRJ_ErrorMessage" = left(coalesce(safe_error_message, 'Quote document render failed'), 1000)
  where "DOCBRJ_ID" = requested_render_job_id and "DOCBRJ_CreatedBy" = actor_user_id and "DOCBRJ_StatusCode" in ('queued','rendering');
end; $$;

revoke all on function document_api.prepare_quote_render(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function document_api.complete_quote_render(uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function document_api.fail_quote_render(uuid, uuid, text) from public, anon, authenticated;
grant execute on function document_api.prepare_quote_render(uuid, text, text, text, text) to service_role;
grant execute on function document_api.complete_quote_render(uuid, uuid, uuid, text, text, text, text, bigint, text) to service_role;
grant execute on function document_api.fail_quote_render(uuid, uuid, text) to service_role;

-- Keep the canonical register aligned with the real lifecycle and extended quote fields.
create or replace view public."App_Live_Quotes" with (security_invoker = true) as
select
  q."CusQuoteHeader_ID", 'Q-' || q."CusQuoteHeader_Number" as "Quote_Reference",
  initcap(replace(q."CusQuoteHeader_LifecycleCode", '_', ' ')) as "Quote_Status",
  case q."CusQuoteHeader_LifecycleCode"
    when 'accepted' then 'green' when 'converted' then 'green' when 'sent' then 'teal'
    when 'generated' then 'blue' when 'declined' then 'red' when 'ghosted' then 'neutral'
    when 'calculated' then 'amber' else 'amber' end as "Quote_Status_Tone",
  customer."Org_Name" as "Customer_Name", coalesce(q."CusQuoteHeader_LoadingPoint", q."CusQuoteHeader_OriginExtra", '') as "Origin",
  coalesce(q."CusQuoteHeader_DischargePoint", q."CusQuoteHeader_DestinationExtra", '') as "Destination",
  q."CusQuoteHeader_ValidFrom" as "Estimated_Departure", q."CusQuoteHeader_ValidTo" as "Estimated_Arrival",
  coalesce((q."CusQuoteHeader_ValidTo" - q."CusQuoteHeader_ValidFrom")::text || ' days', '') as "Transport_Time",
  initcap(coalesce(q."CusQuoteHeader_ModeCode", '')) as "Transport_Mode",
  coalesce(q."CusQuoteHeader_ShipmentFactsJSON"->>'equipment', q."CusQuoteHeader_ShipmentTypeCode", '') as "Equipment_Load",
  coalesce(q."CusQuoteHeader_CollectionAddress", '') as "Pickup", coalesce(q."CusQuoteHeader_DeliveryAddress", '') as "Delivery",
  coalesce(q."CusQuoteHeader_ShipmentFactsJSON"->>'routingVia', 'Direct') as "Routing_Via",
  coalesce(q."CusQuoteHeader_Incoterm", '') as "Incoterms", coalesce(q."CusQuoteHeader_DeliveryAddress", '') as "Incoterms_Place",
  coalesce(q."CusQuoteHeader_ServiceLevel", '') as "Service_Level", coalesce(q."CusQuoteHeader_ShipmentTypeCode", '') as "Shipment_Type",
  ''::text as "Carrier", coalesce(q."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name", '') as "Supplier",
  coalesce(owner."User_Firstname" || ' ' || owner."User_Lastname", 'Multideck operator') as "Sales_Owner",
  coalesce(owner."User_Firstname" || ' ' || owner."User_Lastname", 'Multideck operator') as "Operations_Owner",
  'Spot'::text as "Quote_Type", initcap(coalesce(q."CusQuoteHeader_Direction", 'Export')) as "Direction",
  ''::text as "Customer_Purchase_Order", ''::text as "Shipper_Reference", to_char(q."CusQuoteHeader_ValidTo", 'DD Mon YYYY') as "Validity",
  to_char(q."CusQuoteHeader_Deadline", 'DD Mon · HH24:MI') as "Estimated_Quote", coalesce(totals.sell, 0) as "Sell_Value",
  coalesce(totals.sell - totals.cost, 0) as "Estimated_Profit", coalesce(totals.cost, 0) as "Estimated_Cost",
  case when coalesce(totals.sell, 0) = 0 then null else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end as "Estimated_Margin",
  coalesce(q."CusQuoteHeader_CurrencyCode", 'GBP') as "Currency",
  case when q."CusQuoteHeader_LifecycleCode" in ('generated','sent','revised','accepted','converted') then 'Stored version' else 'Draft' end as "Document_Status",
  initcap(replace(q."CusQuoteHeader_LifecycleCode", '_', ' ')) as "Workflow_Stage",
  case when q."CusQuoteHeader_Deadline" < now() and q."CusQuoteHeader_LifecycleCode" not in ('accepted','declined','converted') then 'Urgent' else 'Standard' end as "Priority",
  case when q."CusQuoteHeader_Deadline" < now() and q."CusQuoteHeader_LifecycleCode" not in ('accepted','declined','converted') then 'red' else 'neutral' end as "Priority_Tone",
  coalesce(q."CusQuoteHeader_RateSourceLabel", initcap(q."CusQuoteHeader_RateSourceTypeCode")) as "Quote_Source",
  q."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At", coalesce(q."CusQuoteHeader_LastEditedDate", q."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" q
join public."Org_Master" customer on customer."Org_id" = q."CusQuoteHeader_CustomerID"
left join public."Org_Master" supplier on supplier."Org_id" = q."CusQuoteHeader_SupplierID"
left join public."cmp_Users" owner on owner."User_ID" = q."CusQuoteHeader_CreatedBy"
left join lateral (
  select coalesce(sum(line."CusQuoteLine_CostAmountLocal"), 0) cost,
    coalesce(sum(line."CusQuoteLine_RevenueAmountLocal"), 0) sell
  from public."CusQuote_Lines" line where line."CusQuoteHeader_ID" = q."CusQuoteHeader_ID"
) totals on true
where not q."CusQuoteHeader_IsDeleted";
grant select on public."App_Live_Quotes" to authenticated;

-- Dexter reads the expanded lifecycle and immutable version evidence.
create or replace function public.multideck_dexter_domain_quotes(p_company_id uuid, p_search text, p_take integer)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId', quote."CusQuoteHeader_ID", 'quoteNumber', 'Q-' || quote."CusQuoteHeader_Number",
      'lifecycle', quote."CusQuoteHeader_LifecycleCode", 'mode', quote."CusQuoteHeader_ModeCode",
      'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode", 'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
      'currency', quote."CusQuoteHeader_CurrencyCode", 'origin', coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra"),
      'destination', coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra"),
      'direction', quote."CusQuoteHeader_Direction", 'incoterm', quote."CusQuoteHeader_Incoterm",
      'validFrom', quote."CusQuoteHeader_ValidFrom", 'validTo', quote."CusQuoteHeader_ValidTo",
      'supplier', coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name"),
      'followUpAt', quote."CusQuoteHeader_FollowUpAt", 'convertedBookingId', quote."CusQuoteHeader_JobID",
      'currentVersionId', version."CusQuoteVersion_ID", 'currentVersionNo', version."CusQuoteVersion_Number",
      'generatedDocumentId', version."CusQuoteVersion_GeneratedDocumentID",
      'costTotal', totals.cost, 'sellTotal', totals.sell, 'profit', totals.sell - totals.cost,
      'marginPct', case when totals.sell = 0 then null else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end,
      'updatedAt', quote."CusQuoteHeader_LastEditedDate",
      'evidence', jsonb_build_object('sourceTable', 'CusQuote_Header', 'sourceId', quote."CusQuoteHeader_ID", 'versionId', version."CusQuoteVersion_ID")
    )) value, quote."CusQuoteHeader_LastEditedDate" updated_at
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID") and office."Company_ID" = p_company_id
    left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
    left join public."CusQuote_Versions" version on version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID" and version."CusQuoteVersion_IsCurrent"
    left join lateral (select coalesce(sum("CusQuoteLine_CostAmountLocal"),0) cost, coalesce(sum("CusQuoteLine_RevenueAmountLocal"),0) sell from public."CusQuote_Lines" where "CusQuoteHeader_ID" = quote."CusQuoteHeader_ID") totals on true
    where not quote."CusQuoteHeader_IsDeleted" and (
      nullif(btrim(p_search), '') is null or concat_ws(' ', quote."CusQuoteHeader_Number", quote."CusQuoteHeader_LifecycleCode",
      quote."CusQuoteHeader_ModeCode", quote."CusQuoteHeader_ShipmentTypeCode", quote."CusQuoteHeader_OriginExtra", quote."CusQuoteHeader_DestinationExtra",
      quote."CusQuoteHeader_SupplierNameSnapshot") ilike '%' || btrim(p_search) || '%'
    ) order by quote."CusQuoteHeader_LastEditedDate" desc limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quotes including lifecycle, route, supplier, charges, margin, follow-up, immutable generated versions and booking conversion evidence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Quote lifecycle, deadline, validity, supplier, route, margin, follow-up and conversion changes.',
  "AIDexterWatchCapability_FieldsJSON" = '["lifecycle","deadline","validFrom","validTo","origin","destination","supplier","followUpAt","convertedBookingId"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

-- Dexter uses the same lifecycle boundary as the operator workspace. The
-- prepared-action executor supplies the exact company/user pair and retains
-- approval, intent binding and audit evidence around this allowlisted write.
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
  select app."Auth_User_ID" into actor_auth_user_id
  from public."cmp_Users" app
  where app."User_ID" = p_user_id
    and app."Company_ID" = p_company_id
    and app."Auth_User_ID" is not null;

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

revoke all on function public.multideck_dexter_action_manage_quote_lifecycle(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'manage_quote_lifecycle', 'quotes', 'Progress customer quote',
  'Progress one exact quote through calculation, revision, sending or a recorded customer outcome using the real quote validation boundary.',
  'multideck_dexter_action_manage_quote_lifecycle',
  '{"type":"object","properties":{"target_id":{"type":"string"},"transition":{"type":"string","enum":["calculated","revised","sent","accepted","declined","ghosted"]},"followUpAt":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","transition","followUpAt","reason"],"additionalProperties":false}'::jsonb,
  42, true, now(), '["Quotes.Write"]'::jsonb, 'quote_lifecycle', 'canonical', false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now();

create or replace function quote_api.emit_watch_signal()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare company_id uuid; old_value jsonb := '{}'::jsonb; new_value jsonb;
begin
  select office."Company_ID" into company_id from public."cmp_Offices" office
  where office."Office_ID" = coalesce(new."CusQuoteHeader_OrgOfficeID", new."OrgOffice_ID");
  if tg_op <> 'INSERT' then old_value := jsonb_build_object(
    'lifecycle', old."CusQuoteHeader_LifecycleCode", 'deadline', old."CusQuoteHeader_Deadline",
    'validFrom', old."CusQuoteHeader_ValidFrom", 'validTo', old."CusQuoteHeader_ValidTo",
    'origin', coalesce(old."CusQuoteHeader_LoadingPoint", old."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(old."CusQuoteHeader_DischargePoint", old."CusQuoteHeader_DestinationExtra"),
    'supplier', old."CusQuoteHeader_SupplierNameSnapshot", 'followUpAt', old."CusQuoteHeader_FollowUpAt",
    'convertedBookingId', old."CusQuoteHeader_JobID"); end if;
  new_value := jsonb_build_object(
    'quoteNumber', 'Q-' || new."CusQuoteHeader_Number", 'lifecycle', new."CusQuoteHeader_LifecycleCode",
    'deadline', new."CusQuoteHeader_Deadline", 'validFrom', new."CusQuoteHeader_ValidFrom", 'validTo', new."CusQuoteHeader_ValidTo",
    'origin', coalesce(new."CusQuoteHeader_LoadingPoint", new."CusQuoteHeader_OriginExtra"),
    'destination', coalesce(new."CusQuoteHeader_DischargePoint", new."CusQuoteHeader_DestinationExtra"),
    'supplier', new."CusQuoteHeader_SupplierNameSnapshot", 'followUpAt', new."CusQuoteHeader_FollowUpAt",
    'convertedBookingId', new."CusQuoteHeader_JobID");
  if company_id is not null and (tg_op = 'INSERT' or old_value is distinct from (new_value - 'quoteNumber')) and exists (
    select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID" = company_id
      and watch."AIDexterWatch_CapabilityCode" = 'quotes' and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."CusQuoteHeader_ID")
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (company_id, 'quotes', 'CusQuote_Header', new."CusQuoteHeader_ID", old_value, new_value);
  end if;
  return new;
end; $$;
revoke all on function quote_api.emit_watch_signal() from public, anon, authenticated;
drop trigger if exists "TR_CusQuote_Header_dexter_watch" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_dexter_watch" after insert or update of
  "CusQuoteHeader_LifecycleCode", "CusQuoteHeader_Deadline", "CusQuoteHeader_ValidFrom", "CusQuoteHeader_ValidTo",
  "CusQuoteHeader_LoadingPoint", "CusQuoteHeader_DischargePoint", "CusQuoteHeader_SupplierNameSnapshot",
  "CusQuoteHeader_FollowUpAt", "CusQuoteHeader_JobID"
on public."CusQuote_Header" for each row execute function quote_api.emit_watch_signal();

commit;
