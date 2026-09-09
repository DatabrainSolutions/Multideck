-- Job-related Customs handoff.
--
-- The booking action creates departmental Customs work and a reviewable source
-- snapshot. It deliberately does not create or submit an iCustoms provider
-- draft; the canonical declaration editor retains that explicit lifecycle.

begin;

insert into public."sys_CustomsDocumentRoles" (
  "CDR_Code", "CDR_Name", "CDR_Description", "CDR_SortOrder", "CDR_IsActive"
) values (
  'supporting', 'Supporting document',
  'Evidence supplied with a Customs declaration, including commercial invoices and packing lists.',
  20, true
)
on conflict ("CDR_Code") do update set
  "CDR_Name" = excluded."CDR_Name",
  "CDR_Description" = excluded."CDR_Description",
  "CDR_SortOrder" = excluded."CDR_SortOrder",
  "CDR_IsActive" = true;

alter table public."Job_Documents"
  add column if not exists "JobDoc_StoredObjectID" uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  add column if not exists "JobDoc_IsPrimary" boolean not null default false;
create index if not exists "IX_Job_Documents_stored_object"
  on public."Job_Documents" ("JobDoc_StoredObjectID") where "JobDoc_StoredObjectID" is not null;
create index if not exists "IX_Job_Documents_job_type_current"
  on public."Job_Documents" ("JobDoc_JobID", lower("JobDoc_DocTypeCodeSnapshot"), "JobDoc_IsCurrentVersion")
  where not "JobDoc_IsDeleted";

create table if not exists public."Org_Identifiers" (
  "OrgIdentifier_ID" uuid primary key default gen_random_uuid(),
  "OrgIdentifier_OrgID" uuid not null references public."Org_Master"("Org_id") on delete cascade,
  "OrgIdentifier_TypeCode" varchar(40) not null,
  "OrgIdentifier_Value" varchar(160) not null,
  "OrgIdentifier_CountryCode" varchar(2),
  "OrgIdentifier_IsPrimary" boolean not null default false,
  "OrgIdentifier_IsActive" boolean not null default true,
  "OrgIdentifier_ValidFrom" date,
  "OrgIdentifier_ValidTo" date,
  "OrgIdentifier_CreatedAt" timestamptz not null default now(),
  "OrgIdentifier_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "OrgIdentifier_UpdatedAt" timestamptz not null default now(),
  "OrgIdentifier_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_Org_Identifiers_type" check (lower("OrgIdentifier_TypeCode") in ('eori','vat','company_registration','tax')),
  constraint "CK_Org_Identifiers_value" check (char_length(btrim("OrgIdentifier_Value")) between 2 and 160),
  constraint "CK_Org_Identifiers_country" check ("OrgIdentifier_CountryCode" is null or "OrgIdentifier_CountryCode" ~ '^[A-Z]{2}$'),
  constraint "CK_Org_Identifiers_dates" check ("OrgIdentifier_ValidTo" is null or "OrgIdentifier_ValidFrom" is null or "OrgIdentifier_ValidTo" >= "OrgIdentifier_ValidFrom")
);
create unique index if not exists "UX_Org_Identifiers_org_type_value"
  on public."Org_Identifiers" ("OrgIdentifier_OrgID", lower("OrgIdentifier_TypeCode"), upper("OrgIdentifier_Value"));
create index if not exists "IX_Org_Identifiers_org_active"
  on public."Org_Identifiers" ("OrgIdentifier_OrgID", lower("OrgIdentifier_TypeCode"), "OrgIdentifier_IsPrimary" desc)
  where "OrgIdentifier_IsActive";
alter table public."Org_Identifiers" enable row level security;
revoke all on table public."Org_Identifiers" from public, anon, authenticated;
grant select, insert, update, delete on table public."Org_Identifiers" to service_role;

create table if not exists booking_api.office_customs_departments (
  office_id uuid primary key references public."cmp_Offices"("Office_ID") on delete cascade,
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  department_id uuid not null references public."cmp_Departments"("Department_ID") on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public."cmp_Users"("User_ID") on delete set null,
  unique (company_id, department_id, office_id)
);
create index if not exists office_customs_departments_department_idx
  on booking_api.office_customs_departments (department_id, office_id);
revoke all on table booking_api.office_customs_departments from public, anon, authenticated;
grant select, insert, update, delete on table booking_api.office_customs_departments to service_role;

alter table public."Customs_Declarations"
  add column if not exists "CUST_OwnerDepartmentID" uuid references public."cmp_Departments"("Department_ID") on delete set null,
  add column if not exists "CUST_SubmittedByUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "CUST_AssignedUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "CUST_HandoffIdempotencyKey" uuid,
  add column if not exists "CUST_SourceJobUpdatedAt" timestamptz,
  add column if not exists "CUST_HandoffAt" timestamptz;
create index if not exists "IX_Customs_Declarations_owner_department"
  on public."Customs_Declarations" ("CUST_OwnerDepartmentID", "CUST_UpdatedAt" desc)
  where "CUST_JobID" is not null and not "CUST_IsDeleted";
create index if not exists "IX_Customs_Declarations_job_created"
  on public."Customs_Declarations" ("CUST_JobID", "CUST_CreatedAt" desc)
  where "CUST_JobID" is not null and not "CUST_IsDeleted";
create unique index if not exists "UX_Customs_Declarations_job_handoff_key"
  on public."Customs_Declarations" ("CUST_JobID", "CUST_HandoffIdempotencyKey")
  where "CUST_JobID" is not null and "CUST_HandoffIdempotencyKey" is not null and not "CUST_IsDeleted";

create or replace function booking_api.customs_access(
  caller_auth_user_id uuid,
  requested_declaration_id uuid,
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."Customs_Declarations" declaration
    join public."cmp_Users" declaration_creator
      on declaration_creator."Auth_User_ID" = declaration."CUST_CreatedBy"
    join public."cmp_Users" caller
      on caller."Auth_User_ID" = caller_auth_user_id
    where declaration."CUST_id" = requested_declaration_id
      and not declaration."CUST_IsDeleted"
      and caller."Company_ID" is not null
      and caller."Company_ID" = declaration_creator."Company_ID"
      and coalesce(caller."User_AccessStatus", 'active') = 'active'
      and coalesce(declaration_creator."User_AccessStatus", 'active') <> 'deleted'
      and booking_api.has_permission(
        caller_auth_user_id,
        case when require_write then 'Customs.Write' else 'Customs.Read' end
      )
  )
$$;

create or replace function public.customs_declaration_authorised(
  caller_auth_user_id uuid,
  requested_declaration_id uuid,
  require_write boolean default false,
  require_draft boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.customs_access(caller_auth_user_id, requested_declaration_id, require_write)
    and (
      not require_draft
      or exists (
        select 1 from public."Customs_Declarations" declaration
        where declaration."CUST_id" = requested_declaration_id
          and declaration."CUST_Status" = 'draft'
          and not declaration."CUST_IsDeleted"
      )
    )
$$;

-- RLS policies must bind access to the current authenticated user without
-- exposing the service-only helper that accepts an arbitrary caller UUID.
create or replace function public.customs_declaration_current_user_authorised(
  requested_declaration_id uuid,
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.customs_access(
    (select auth.uid()),
    requested_declaration_id,
    require_write
  )
$$;

drop policy if exists "Users can read their Customs declarations" on public."Customs_Declarations";
create policy "Users can read authorised Customs declarations"
  on public."Customs_Declarations" for select to authenticated
  using (public.customs_declaration_current_user_authorised("CUST_id", false));

drop policy if exists "Users can update their Customs declarations" on public."Customs_Declarations";
create policy "Users can update authorised Customs declarations"
  on public."Customs_Declarations" for update to authenticated
  using (public.customs_declaration_current_user_authorised("CUST_id", true))
  with check (public.customs_declaration_current_user_authorised("CUST_id", true) and not "CUST_IsDeleted");

drop policy if exists "Users can create items on their Customs declarations" on public."Customs_Items";
create policy "Users can create items on authorised Customs declarations"
  on public."Customs_Items" for insert to authenticated
  with check (public.customs_declaration_current_user_authorised("CUSTI_CustomsID", true));
drop policy if exists "Users can read items on their Customs declarations" on public."Customs_Items";
create policy "Users can read items on authorised Customs declarations"
  on public."Customs_Items" for select to authenticated
  using (public.customs_declaration_current_user_authorised("CUSTI_CustomsID", false));
drop policy if exists "Users can update items on their Customs declarations" on public."Customs_Items";
create policy "Users can update items on authorised Customs declarations"
  on public."Customs_Items" for update to authenticated
  using (public.customs_declaration_current_user_authorised("CUSTI_CustomsID", true))
  with check (public.customs_declaration_current_user_authorised("CUSTI_CustomsID", true));
drop policy if exists "Users can delete items on their Customs declarations" on public."Customs_Items";
create policy "Users can delete items on authorised Customs declarations"
  on public."Customs_Items" for delete to authenticated
  using (public.customs_declaration_current_user_authorised("CUSTI_CustomsID", true));

drop policy if exists "Users read own Customs declaration documents" on public."Customs_DeclarationDocuments";
create policy "Users read authorised Customs declaration documents"
  on public."Customs_DeclarationDocuments" for select to authenticated
  using (public.customs_declaration_current_user_authorised("CUSTD_CustomsID", false));

create or replace function booking_api.find_customs_department(
  workspace_company_id uuid,
  requested_office_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  department_id_value uuid;
  candidates uuid[];
begin
  select mapping.department_id into department_id_value
  from booking_api.office_customs_departments mapping
  join public."cmp_Departments" department on department."Department_ID" = mapping.department_id
  where mapping.company_id = workspace_company_id and mapping.office_id = requested_office_id
    and department."Company_ID" = workspace_company_id and department."Department_IsActive";
  if department_id_value is not null then return department_id_value; end if;

  select array_agg(department."Department_ID" order by department."Department_ID") into candidates
  from public."cmp_Departments" department
  where department."Company_ID" = workspace_company_id and department."Department_IsActive"
    and lower(btrim(department."Department_Name")) in ('customs','customs & compliance','customs and compliance');
  if cardinality(candidates) = 1 then return candidates[1]; end if;
  return null;
end;
$$;

create or replace function booking_api.customs_readiness(
  caller_auth_user_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  exporter_row record;
  importer_row record;
  route_row record;
  container_row record;
  missing jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  eligible boolean;
  direction_value text;
  mode_value text;
  incoterm_value text;
  total_packages numeric;
  total_gross numeric;
  cargo_count integer;
  commercial_invoice_id uuid;
  packing_list_id uuid;
  exporter_identifier text;
  importer_identifier text;
  transport_reference text;
  department_id_value uuid;
  assigned_user_id uuid;
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode = '42501';
  end if;
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id and office."Company_ID" = app_user."Company_ID" and not job."Job_IsDeleted";
  if not found then raise exception 'That booking is outside this workspace.' using errcode = '42501'; end if;

  direction_value := booking_api.normalise_direction(job_row."Job_Direction");
  mode_value := lower(coalesce(job_row."Job_TransportModeSummary", ''));
  incoterm_value := upper(coalesce(job_row."Job_IncotermsCode", ''));
  eligible := direction_value in ('import','export');
  if not eligible then
    missing := missing || jsonb_build_array(jsonb_build_object(
      'key', 'direction', 'label', case direction_value when 'domestic' then 'Domestic bookings do not need a Customs declaration' when 'cross_trade' then 'Cross-trade Customs handoff is not available yet' else 'Choose Import or Export' end,
      'section', 'Booking'
    ));
  end if;

  department_id_value := booking_api.find_customs_department(
    app_user."Company_ID", coalesce(job_row."Job_OrgOfficeID", job_row."Job_OfficeID")
  );
  if department_id_value is null then
    missing := missing || jsonb_build_array(jsonb_build_object(
      'key','customs_department','label','Configured Customs department for this booking office','section','Team'
    ));
  else
    select customs_user."User_ID" into assigned_user_id
    from public."cmp_Users_Departments" membership
    join public."cmp_Users" customs_user on customs_user."User_ID" = membership."User_ID"
    where membership."Department_ID" = department_id_value
      and customs_user."Company_ID" = app_user."Company_ID"
      and customs_user."User_AccessStatus" = 'active'
      and customs_user."Auth_User_ID" is not null
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Read')
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Write')
    order by customs_user."User_ID"
    limit 1;
    if assigned_user_id is null then
      missing := missing || jsonb_build_array(jsonb_build_object(
        'key','customs_operator','label','Active Customs operator with read and write access','section','Team'
      ));
    end if;
  end if;

  select party.* into exporter_row
  from public."Job_Parties" party
  where party."JobParty_JobID" = requested_job_id
    and lower(party."JobParty_Role") in ('exporter','shipper','consignor')
  order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1;
  select party.* into importer_row
  from public."Job_Parties" party
  where party."JobParty_JobID" = requested_job_id
    and lower(party."JobParty_Role") in ('importer','consignee')
  order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1;

  exporter_identifier := coalesce(
    case when lower(coalesce(exporter_row."JobParty_IdentifierType", '')) = 'eori' then nullif(btrim(exporter_row."JobParty_IdentifierValueSnapshot"), '') end,
    (select identifier."OrgIdentifier_Value" from public."Org_Identifiers" identifier
     where identifier."OrgIdentifier_OrgID" = exporter_row."JobParty_OrgID"
       and lower(identifier."OrgIdentifier_TypeCode") = 'eori' and identifier."OrgIdentifier_IsActive"
       and (identifier."OrgIdentifier_ValidFrom" is null or identifier."OrgIdentifier_ValidFrom" <= current_date)
       and (identifier."OrgIdentifier_ValidTo" is null or identifier."OrgIdentifier_ValidTo" >= current_date)
     order by identifier."OrgIdentifier_IsPrimary" desc, identifier."OrgIdentifier_UpdatedAt" desc limit 1)
  );
  importer_identifier := coalesce(
    case when lower(coalesce(importer_row."JobParty_IdentifierType", '')) in ('eori','vat') then nullif(btrim(importer_row."JobParty_IdentifierValueSnapshot"), '') end,
    (select identifier."OrgIdentifier_Value" from public."Org_Identifiers" identifier
     where identifier."OrgIdentifier_OrgID" = importer_row."JobParty_OrgID"
       and lower(identifier."OrgIdentifier_TypeCode") in ('eori','vat') and identifier."OrgIdentifier_IsActive"
       and (identifier."OrgIdentifier_ValidFrom" is null or identifier."OrgIdentifier_ValidFrom" <= current_date)
       and (identifier."OrgIdentifier_ValidTo" is null or identifier."OrgIdentifier_ValidTo" >= current_date)
     order by (lower(identifier."OrgIdentifier_TypeCode") = 'eori') desc, identifier."OrgIdentifier_IsPrimary" desc, identifier."OrgIdentifier_UpdatedAt" desc limit 1)
  );

  if nullif(btrim(exporter_row."JobParty_NameSnapshot"), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','exporter_name','label','Consignor / shipper name','section','Parties'));
  end if;
  if nullif(btrim(exporter_row."JobParty_AddressSnapshot"), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','exporter_address','label','Consignor / shipper full address','section','Parties'));
  end if;
  if direction_value = 'export' and nullif(btrim(exporter_identifier), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','exporter_eori','label','Exporter EORI','section','Parties'));
  end if;
  if nullif(btrim(importer_row."JobParty_NameSnapshot"), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','importer_name','label','Importer name','section','Parties'));
  end if;
  if nullif(btrim(importer_row."JobParty_AddressSnapshot"), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','importer_address','label','Importer full address','section','Parties'));
  end if;
  if direction_value = 'import' and nullif(btrim(importer_identifier), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','importer_identifier','label','Importer EORI or VAT number','section','Parties'));
  end if;

  select coalesce(sum(coalesce(cargo."JobCargo_PackageQty", cargo."JobCargo_Qty")), 0),
         coalesce(sum(cargo."JobCargo_GrossKilos"), 0), count(*)::integer
  into total_packages, total_gross, cargo_count
  from public."Job_Cargo" cargo
  where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted";
  if cargo_count = 0 or not exists (
    select 1 from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id
      and not cargo."JobCargo_IsDeleted" and nullif(btrim(cargo."JobCargo_Description"), '') is not null
  ) then missing := missing || jsonb_build_array(jsonb_build_object('key','goods_description','label','Goods description','section','Cargo')); end if;
  if total_packages <= 0 then missing := missing || jsonb_build_array(jsonb_build_object('key','packages','label','Pieces / packages','section','Cargo')); end if;
  if total_gross <= 0 then missing := missing || jsonb_build_array(jsonb_build_object('key','gross_weight','label','Gross weight','section','Cargo')); end if;

  if incoterm_value = '' then missing := missing || jsonb_build_array(jsonb_build_object('key','incoterm','label','Incoterms','section','Commercial')); end if;
  if incoterm_value in ('FOB','FCA','EXW') and (job_row."Job_FreightChargeAmount" is null or job_row."Job_FreightChargeAmount" <= 0) then
    missing := missing || jsonb_build_array(jsonb_build_object('key','freight_amount','label','Freight amount','section','Commercial'));
  end if;
  if incoterm_value in ('FOB','FCA','EXW') and nullif(btrim(job_row."Job_FreightChargeCurrencyCode"), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','freight_currency','label','Freight currency','section','Commercial'));
  end if;

  select route.* into route_row from public."Job_Routing" route
  where route."Job_ID" = requested_job_id order by route."JobRoute_IsMainCarriage" desc, route."JobRoute_OrderNo" nulls last limit 1;
  select container.* into container_row from public."Job_Containers" container
  where container."Job_ID" = requested_job_id and not container."JobContainer_IsDeleted"
  order by container."JobContainer_CreatedAt" limit 1;
  if nullif(btrim(coalesce(route_row."JobRoute_OriginNameSnapshot", job_row."Job_OriginNameSnapshot", route_row."JobRoute_OriginUNLocode", job_row."Job_OriginUNLocode")), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','origin','label','Origin loading point / port','section','Route'));
  end if;
  if nullif(btrim(coalesce(route_row."JobRoute_DestinationNameSnapshot", job_row."Job_DestinationNameSnapshot", route_row."JobRoute_DestinationUNLocode", job_row."Job_DestinationUNLocode")), '') is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','destination','label','Destination port / delivery point','section','Route'));
  end if;
  transport_reference := case
    when mode_value = 'air' then coalesce(nullif(btrim(route_row."JobRoute_FlightNumber"), ''), nullif(btrim(route_row."JobRoute_MasterTransportReference"), ''))
    when mode_value = 'sea' then coalesce(nullif(btrim(route_row."JobRoute_VoyageNumber"), ''), nullif(btrim(route_row."JobRoute_MasterTransportReference"), ''), nullif(btrim(route_row."JobRoute_TransportMeansName"), ''), nullif(btrim(container_row."JobContainer_Number"), ''))
    when mode_value = 'road' then coalesce(nullif(btrim(route_row."JobRoute_TrailerNumber"), ''), nullif(btrim(route_row."JobRoute_VehicleRegistration"), ''), nullif(btrim(route_row."JobRoute_MasterTransportReference"), ''))
    when mode_value = 'rail' then coalesce(nullif(btrim(route_row."JobRoute_RailService"), ''), nullif(btrim(route_row."JobRoute_MasterTransportReference"), ''), nullif(btrim(route_row."JobRoute_TrailerNumber"), ''))
    else coalesce(nullif(btrim(route_row."JobRoute_MasterTransportReference"), ''), nullif(btrim(route_row."JobRoute_TransportMeansName"), ''))
  end;
  if mode_value = '' then
    missing := missing || jsonb_build_array(jsonb_build_object('key','mode','label','Transport mode','section','Route'));
  elsif transport_reference is null then
    missing := missing || jsonb_build_array(jsonb_build_object(
      'key','transport_reference',
      'label',case mode_value when 'air' then 'Flight number' when 'sea' then 'Vessel, voyage or container number' when 'road' then 'Trailer or vehicle number' when 'rail' then 'Rail service or trailer number' else 'Transport reference' end,
      'section','Route'
    ));
  end if;

  select document."JobDoc_ID" into commercial_invoice_id
  from public."Job_Documents" document
  where document."JobDoc_JobID" = requested_job_id and not document."JobDoc_IsDeleted" and document."JobDoc_IsCurrentVersion"
    and (lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) in ('commercial_invoice','commercial-invoice','invoice') or lower(document."JobDoc_Title") like '%commercial invoice%')
    and (document."JobDoc_StoredObjectID" is not null or nullif(document."JobDoc_FilePath", '') is not null or nullif(document."JobDoc_FileURL", '') is not null)
  order by document."JobDoc_IsPrimary" desc, document."JobDoc_CreatedAt" desc limit 1;
  if commercial_invoice_id is null then
    missing := missing || jsonb_build_array(jsonb_build_object('key','commercial_invoice','label','Attached commercial invoice','section','Documents'));
  end if;
  select document."JobDoc_ID" into packing_list_id
  from public."Job_Documents" document
  where document."JobDoc_JobID" = requested_job_id and not document."JobDoc_IsDeleted" and document."JobDoc_IsCurrentVersion"
    and (lower(coalesce(document."JobDoc_DocTypeCodeSnapshot", '')) in ('packing_list','packing-list') or lower(document."JobDoc_Title") like '%packing list%')
  order by document."JobDoc_IsPrimary" desc, document."JobDoc_CreatedAt" desc limit 1;
  if packing_list_id is null then warnings := warnings || jsonb_build_array(jsonb_build_object('key','packing_list','label','Packing list not attached (optional)','section','Documents')); end if;

  return jsonb_build_object(
    'eligible', eligible,
    'ready', eligible and jsonb_array_length(missing) = 0,
    'direction', direction_value,
    'missing', missing,
    'warnings', warnings,
    'evidence', jsonb_strip_nulls(jsonb_build_object(
      'exporterIdentifier', exporter_identifier, 'importerIdentifier', importer_identifier,
      'totalPackages', total_packages, 'totalGrossWeightKg', total_gross,
      'transportReference', transport_reference, 'commercialInvoiceDocumentId', commercial_invoice_id,
      'packingListDocumentId', packing_list_id, 'ownerDepartmentId', department_id_value,
      'assignedUserId', assigned_user_id
    ))
  );
exception
  when no_data_found or too_many_rows then raise exception 'Your workspace identity is incomplete.' using errcode = '42501';
end;
$$;

create or replace function booking_api.resolve_customs_department(
  workspace_company_id uuid,
  requested_office_id uuid,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  department_id_value uuid;
begin
  department_id_value := booking_api.find_customs_department(workspace_company_id, requested_office_id);
  if department_id_value is null then
    raise exception 'Configure one Customs department for this booking office before sending the job.' using errcode = '22023';
  end if;
  insert into booking_api.office_customs_departments (office_id, company_id, department_id, updated_by)
  values (requested_office_id, workspace_company_id, department_id_value, actor_user_id)
  on conflict (office_id) do update set department_id = excluded.department_id, company_id = excluded.company_id, updated_at = now(), updated_by = excluded.updated_by;
  return department_id_value;
end;
$$;

create or replace function booking_api.send_to_customs(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  readiness jsonb;
  direction_value text;
  mode_value text;
  customs_mode_code text;
  department_id_value uuid;
  declaration_id uuid;
  declaration_reference text;
  existing_declaration record;
  exporter_row record;
  importer_row record;
  route_row record;
  container_row record;
  commercial_invoice_id uuid;
  packing_list_id uuid;
  exporter_identifier text;
  importer_identifier text;
  total_packages numeric;
  total_gross numeric;
  total_net numeric;
  payload jsonb;
  items jsonb;
  source_snapshot jsonb;
  sender_name text;
  recipient record;
  assigned_user_id uuid;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Sending a booking to Customs is not authorised.' using errcode = '42501';
  end if;
  if requested_idempotency_key is null then raise exception 'A Customs handoff request key is required.' using errcode = '22023'; end if;
  select "User_ID", "Company_ID", "User_Firstname", "User_Lastname" into strict app_user
  from public."cmp_Users" where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';
  sender_name := nullif(concat_ws(' ', app_user."User_Firstname", app_user."User_Lastname"), '');
  sender_name := coalesce(sender_name, 'A Multideck user');
  select job.* into job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_ID" = requested_job_id and office."Company_ID" = app_user."Company_ID" and not job."Job_IsDeleted"
  for update;
  if not found then raise exception 'That booking is outside this workspace.' using errcode = '42501'; end if;

  select declaration.* into existing_declaration
  from public."Customs_Declarations" declaration
  left join public."sys_CustomsDeclarationStatuses" status on status."CDST_Code" = declaration."CUST_Status"
  where declaration."CUST_JobID" = requested_job_id and not declaration."CUST_IsDeleted"
    and (declaration."CUST_HandoffIdempotencyKey" = requested_idempotency_key or not coalesce(status."CDST_IsFinal", false))
  order by (declaration."CUST_HandoffIdempotencyKey" = requested_idempotency_key) desc, declaration."CUST_CreatedAt" desc limit 1;
  if found then
    return jsonb_build_object(
      'declarationId', existing_declaration."CUST_id",
      'reference', existing_declaration."CUST_LocalReferenceNumber",
      'direction', existing_declaration."CUST_Direction",
      'route', '/customs/job-related/' || existing_declaration."CUST_Direction" || '/' || existing_declaration."CUST_id",
      'canOpen', booking_api.customs_access(caller_auth_user_id, existing_declaration."CUST_id", false),
      'reused', true
    );
  end if;

  readiness := booking_api.customs_readiness(caller_auth_user_id, requested_job_id);
  if not coalesce((readiness->>'eligible')::boolean, false) then
    raise exception 'This booking is not eligible for a UK import or export Customs handoff.' using errcode = '22023';
  end if;
  if not coalesce((readiness->>'ready')::boolean, false) then
    raise exception 'Complete the required Customs fields before sending this booking.' using errcode = '22023', detail = readiness::text;
  end if;
  direction_value := readiness->>'direction';
  mode_value := lower(btrim(coalesce(job_row."Job_TransportModeSummary", '')));
  select nullif(btrim(mode."JTM_CustomsTransportModeCode"), '')
  into customs_mode_code
  from public."sys_JobTransportModes" mode
  where mode."JTM_IsActive"
    and (
      lower(mode."JTM_Code") = mode_value
      or lower(mode."JTM_Name") = mode_value
    )
  order by mode."JTM_SortOrder", mode."JTM_Code"
  limit 1;
  customs_mode_code := coalesce(
    customs_mode_code,
    case mode_value
      when 'sea' then '1'
      when 'rail' then '2'
      when 'road' then '3'
      when 'air' then '4'
      when 'courier' then '4'
      else null
    end
  );
  department_id_value := booking_api.resolve_customs_department(
    app_user."Company_ID", coalesce(job_row."Job_OrgOfficeID", job_row."Job_OfficeID"), app_user."User_ID"
  );
  assigned_user_id := nullif(readiness#>>'{evidence,assignedUserId}', '')::uuid;
  if assigned_user_id is null then
    raise exception 'Assign at least one active Customs operator with read and write access before sending this booking.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public."cmp_Users_Departments" membership
    join public."cmp_Users" customs_user on customs_user."User_ID" = membership."User_ID"
    where membership."Department_ID" = department_id_value
      and customs_user."User_ID" = assigned_user_id
      and customs_user."Company_ID" = app_user."Company_ID"
      and customs_user."User_AccessStatus" = 'active'
      and customs_user."Auth_User_ID" is not null
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Read')
      and booking_api.has_permission(customs_user."Auth_User_ID", 'Customs.Write')
  ) then
    raise exception 'The assigned Customs operator is no longer available. Review the booking and try again.' using errcode = '22023';
  end if;

  select party.* into exporter_row from public."Job_Parties" party
  where party."JobParty_JobID" = requested_job_id and lower(party."JobParty_Role") in ('exporter','shipper','consignor')
  order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1;
  select party.* into importer_row from public."Job_Parties" party
  where party."JobParty_JobID" = requested_job_id and lower(party."JobParty_Role") in ('importer','consignee')
  order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence" limit 1;
  exporter_identifier := readiness#>>'{evidence,exporterIdentifier}';
  importer_identifier := readiness#>>'{evidence,importerIdentifier}';
  commercial_invoice_id := nullif(readiness#>>'{evidence,commercialInvoiceDocumentId}', '')::uuid;
  packing_list_id := nullif(readiness#>>'{evidence,packingListDocumentId}', '')::uuid;
  select route.* into route_row from public."Job_Routing" route where route."Job_ID" = requested_job_id
  order by route."JobRoute_IsMainCarriage" desc, route."JobRoute_OrderNo" nulls last limit 1;
  select container.* into container_row from public."Job_Containers" container where container."Job_ID" = requested_job_id and not container."JobContainer_IsDeleted"
  order by container."JobContainer_CreatedAt" limit 1;
  select coalesce(sum(coalesce(cargo."JobCargo_PackageQty", cargo."JobCargo_Qty")),0),
    coalesce(sum(cargo."JobCargo_GrossKilos"),0), coalesce(sum(cargo."JobCargo_NettKilos"),0),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', 'item-' || coalesce(cargo."JobCargo_LineNo", 1),
      'commodityCode', cargo."JobCargo_HSCode", 'description', cargo."JobCargo_Description",
      'packageKind', cargo."JobCargo_PackageTypeCodeSnapshot",
      'packageCount', coalesce(cargo."JobCargo_PackageQty", cargo."JobCargo_Qty")::text,
      'grossMass', cargo."JobCargo_GrossKilos"::text, 'netMass', cargo."JobCargo_NettKilos"::text,
      'itemPrice', cargo."JobCargo_DeclaredValueAmount"::text,
      'currency', cargo."JobCargo_DeclaredValueCurrencyCodeSnapshot",
      'nonPreferentialOrigin', cargo."JobCargo_CountryOfOriginCodeSnapshot",
      'destinationCountry', null,
      'containerId', container_row."JobContainer_Number",
      'sourceJobCargoId', cargo."JobCargo_ID"
    )) order by cargo."JobCargo_LineNo" nulls last), '[]'::jsonb)
  into total_packages, total_gross, total_net, items
  from public."Job_Cargo" cargo where cargo."JobCargo_JobID" = requested_job_id and not cargo."JobCargo_IsDeleted";

  payload := jsonb_strip_nulls(jsonb_build_object(
    'direction', direction_value,
    'multideckReference', '',
    'iCustomsCorrelationId', null,
    'traderReference', coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
    'internalReference', 'JOB-' || job_row."Job_Number",
    'totalAmount', (select coalesce(sum(cargo."JobCargo_DeclaredValueAmount"),0)::text from public."Job_Cargo" cargo where cargo."JobCargo_JobID"=requested_job_id and not cargo."JobCargo_IsDeleted"),
    'currency', (select max(cargo."JobCargo_DeclaredValueCurrencyCodeSnapshot") from public."Job_Cargo" cargo where cargo."JobCargo_JobID"=requested_job_id and not cargo."JobCargo_IsDeleted"),
    'totalPackages', total_packages::text, 'totalGrossMass', total_gross::text, 'totalNetMass', total_net::text,
    'exporter', exporter_identifier, 'exporterName', exporter_row."JobParty_NameSnapshot",
    'exporterAddressLine', exporter_row."JobParty_AddressSnapshot", 'exporterCountry', exporter_row."JobParty_CountryCodeSnapshot",
    'importer', importer_identifier, 'importerName', importer_row."JobParty_NameSnapshot",
    'importerAddressLine', importer_row."JobParty_AddressSnapshot", 'importerCountry', importer_row."JobParty_CountryCodeSnapshot",
    'consignee', importer_identifier, 'consigneeName', importer_row."JobParty_NameSnapshot",
    'consigneeAddressLine', importer_row."JobParty_AddressSnapshot", 'consigneeCountry', importer_row."JobParty_CountryCodeSnapshot",
    'exportCountry', exporter_row."JobParty_CountryCodeSnapshot",
    'destinationCountry', importer_row."JobParty_CountryCodeSnapshot",
    'borderMode', customs_mode_code,
    'borderIdentificationNumber', readiness#>>'{evidence,transportReference}',
    'departureIdentificationNumber', case when direction_value = 'export' then readiness#>>'{evidence,transportReference}' end,
    'arrivalIdentificationNumber', case when direction_value = 'import' then readiness#>>'{evidence,transportReference}' end,
    'isContainerised', case when container_row."JobContainers_ID" is null then '0' else '1' end,
    'containerId', container_row."JobContainer_Number",
    'tradeTerms', job_row."Job_IncotermsCode",
    'transactionNature', '11',
    'freightChargeAmount', job_row."Job_FreightChargeAmount"::text,
    'freightChargeCurrency', job_row."Job_FreightChargeCurrencyCode",
    'items', items,
    'prefillReviewRequired', true,
    'prefillSource', 'booking_customs_handoff'
  ));

  source_snapshot := jsonb_build_object(
    'source', 'booking_customs_handoff', 'capturedAt', now(),
    'jobId', requested_job_id, 'bookingReference', coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
    'jobUpdatedAt', job_row."Job_UpdatedAt", 'submittedByUserId', app_user."User_ID",
    'ownerDepartmentId', department_id_value, 'readiness', readiness,
    'commercialInvoiceDocumentId', commercial_invoice_id, 'packingListDocumentId', packing_list_id,
    'payload', payload
  );
  declaration_reference := 'MD-CDS-' || case direction_value when 'import' then 'IM' else 'EX' end || '-'
    || to_char(now() at time zone 'UTC','YYYYMMDD') || '-' || lpad(nextval('public."Customs_DeclarationReferenceSeq"')::text,4,'0');

  insert into public."Customs_Declarations" (
    "CUST_JobID", "CUST_OrgOfficeID", "CUST_JurisdictionCode", "CUST_Direction", "CUST_DeclarationKind",
    "CUST_Status", "CUST_LocalReferenceNumber", "CUST_TraderReference",
    "CUST_ImporterOrgID", "CUST_ExporterOrgID", "CUST_CarrierOrgID",
    "CUST_ImporterIdentifierSnapshot", "CUST_ExporterIdentifierSnapshot",
    "CUST_TotalPackages", "CUST_GrossMass", "CUST_InvoiceAmount", "CUST_InvoiceCurrencyCodeSnapshot",
    "CUST_IncotermsCode", "CUST_IncotermsLocation", "CUST_GenericPayloadJSON", "CUST_SourceSnapshot",
    "CUST_CreatedBy", "CUST_UpdatedBy", "CUST_OwnerDepartmentID", "CUST_SubmittedByUserID",
    "CUST_AssignedUserID", "CUST_HandoffIdempotencyKey", "CUST_SourceJobUpdatedAt", "CUST_HandoffAt"
  ) values (
    requested_job_id, coalesce(job_row."Job_OrgOfficeID",job_row."Job_OfficeID"), 'GB', direction_value, 'cds_' || direction_value,
    'draft', declaration_reference, coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
    importer_row."JobParty_OrgID", exporter_row."JobParty_OrgID", job_row."Job_Carrier",
    importer_identifier, exporter_identifier, total_packages::integer, total_gross,
    nullif(payload->>'totalAmount','')::numeric, nullif(payload->>'currency',''),
    job_row."Job_IncotermsCode", job_row."Job_IncotermsLocation", payload, source_snapshot,
    caller_auth_user_id, caller_auth_user_id, department_id_value, app_user."User_ID",
    assigned_user_id, requested_idempotency_key, job_row."Job_UpdatedAt", now()
  ) returning "CUST_id" into declaration_id;

  insert into public."Customs_Items" (
    "CUSTI_CustomsID", "CUSTI_ItemNumber", "CUSTI_CommodityCode", "CUSTI_DescriptionOfGoods",
    "CUSTI_CountryOfOriginCodeSnapshot", "CUSTI_CountryOfDestinationCodeSnapshot",
    "CUSTI_NetMass", "CUSTI_GrossMass", "CUSTI_ItemValueAmount", "CUSTI_ItemValueCurrencyCodeSnapshot",
    "CUSTI_ItemPayloadJSON", "CUSTI_JobCargoID"
  ) select declaration_id, item.ordinality::integer, nullif(item.value->>'commodityCode',''), coalesce(item.value->>'description',''),
    nullif(item.value->>'nonPreferentialOrigin',''), nullif(payload->>'destinationCountry',''),
    nullif(item.value->>'netMass','')::numeric, nullif(item.value->>'grossMass','')::numeric,
    nullif(item.value->>'itemPrice','')::numeric, nullif(item.value->>'currency',''), item.value,
    nullif(item.value->>'sourceJobCargoId','')::uuid
  from jsonb_array_elements(items) with ordinality item(value, ordinality);

  insert into public."Customs_Parties" (
    "CUSTP_CustomsID", "CUSTP_Role", "CUSTP_OrgID", "CUSTP_NameSnapshot",
    "CUSTP_IdentifierType", "CUSTP_IdentifierValueSnapshot", "CUSTP_AddressJSON",
    "CUSTP_CountryCodeSnapshot", "CUSTP_SortOrder"
  ) values
    (declaration_id,'exporter',exporter_row."JobParty_OrgID",exporter_row."JobParty_NameSnapshot",'eori',exporter_identifier,
      jsonb_build_object('formatted',exporter_row."JobParty_AddressSnapshot"),exporter_row."JobParty_CountryCodeSnapshot",10),
    (declaration_id,'importer',importer_row."JobParty_OrgID",importer_row."JobParty_NameSnapshot",
      case when direction_value='import' then 'eori_or_vat' else importer_row."JobParty_IdentifierType" end,importer_identifier,
      jsonb_build_object('formatted',importer_row."JobParty_AddressSnapshot"),importer_row."JobParty_CountryCodeSnapshot",20);

  insert into public."Customs_Documents" (
    "CUSTD_CustomsID", "CUSTD_DocumentRole", "CUSTD_DocumentCode", "CUSTD_DocumentStatusCode",
    "CUSTD_DocumentPayloadJSON", "CUSTD_JobDocumentID"
  ) values (
    declaration_id, 'supporting', 'commercial_invoice', 'attached',
    jsonb_build_object('source','job_document','required',true), commercial_invoice_id
  );
  if packing_list_id is not null then
    insert into public."Customs_Documents" (
      "CUSTD_CustomsID", "CUSTD_DocumentRole", "CUSTD_DocumentCode", "CUSTD_DocumentStatusCode",
      "CUSTD_DocumentPayloadJSON", "CUSTD_JobDocumentID"
    ) values (declaration_id,'supporting','packing_list','attached',jsonb_build_object('source','job_document','required',false),packing_list_id);
  end if;

  insert into booking_api.events (company_id,job_id,event_type,summary,metadata,actor_user_id)
  values (app_user."Company_ID",requested_job_id,'sent_to_customs','Booking sent to Customs.',
    jsonb_build_object('declarationId',declaration_id,'direction',direction_value,'departmentId',department_id_value),app_user."User_ID");

  for recipient in
    select user_row."User_ID"
    from public."cmp_Users_Departments" membership
    join public."cmp_Users" user_row on user_row."User_ID"=membership."User_ID"
    where membership."Department_ID"=department_id_value and user_row."Company_ID"=app_user."Company_ID"
      and user_row."User_AccessStatus"='active'
      and user_row."Auth_User_ID" is not null
      and booking_api.has_permission(user_row."Auth_User_ID", 'Customs.Read')
  loop
    insert into public."Comm_Notifications" (
      "CommNotif_UserID","CommNotif_Title","CommNotif_Body","CommNotif_TargetTable","CommNotif_TargetID",
      "CommNotif_LinkTypeCode","CommNotif_MetadataJSON","CommNotif_CreatedBy"
    ) values (
      recipient."User_ID", 'Booking sent to Customs',
      sender_name || ' sent booking ' || coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
      'Customs_Declarations',declaration_id,'customs_handoff',jsonb_build_object(
        'event_type','customs_handoff',
        'action_url','/customs/job-related/'||direction_value||'/'||declaration_id,
        'action_label','Open declaration','eyebrow','Customs handoff',
        'booking_reference',coalesce(job_row."Job_BookingReference", 'MD-' || job_row."Job_Number"),
        'sender_name',sender_name,'declaration_id',declaration_id
      ),app_user."User_ID"
    );
  end loop;

  return jsonb_build_object(
    'declarationId',declaration_id,'reference',declaration_reference,'direction',direction_value,
    'route','/customs/job-related/'||direction_value||'/'||declaration_id,
    'canOpen',booking_api.customs_access(caller_auth_user_id,declaration_id,false),'reused',false
  );
exception
  when unique_violation then
    select declaration.* into existing_declaration from public."Customs_Declarations" declaration
    where declaration."CUST_JobID"=requested_job_id and declaration."CUST_HandoffIdempotencyKey"=requested_idempotency_key and not declaration."CUST_IsDeleted" limit 1;
    if found then return jsonb_build_object('declarationId',existing_declaration."CUST_id",'reference',existing_declaration."CUST_LocalReferenceNumber",'direction',existing_declaration."CUST_Direction",'route','/customs/job-related/'||existing_declaration."CUST_Direction"||'/'||existing_declaration."CUST_id",'canOpen',booking_api.customs_access(caller_auth_user_id,existing_declaration."CUST_id",false),'reused',true); end if;
    raise;
end;
$$;

create or replace function booking_api.save_job_customs_draft(
  caller_auth_user_id uuid,
  p_declaration_id uuid,
  p_draft jsonb
)
returns table(declaration_id uuid, local_reference_number text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_user_id uuid := caller_auth_user_id;
  declaration_row record;
  updated_at_value timestamptz := clock_timestamp();
begin
  if auth_user_id is null then raise exception 'Authentication is required to save a Customs draft.' using errcode='42501'; end if;
  if p_declaration_id is null or p_draft is null or jsonb_typeof(p_draft)<>'object' then raise exception 'A valid job-related Customs draft is required.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_draft->'items','[]'::jsonb))<>'array' then raise exception 'Customs draft items must be an array.' using errcode='22023'; end if;
  select declaration.* into declaration_row from public."Customs_Declarations" declaration
  where declaration."CUST_id"=p_declaration_id and declaration."CUST_JobID" is not null and declaration."CUST_Status"='draft'
    and declaration."CUST_Direction" in ('import','export') and declaration."CUST_DeclarationKind"='cds_'||declaration."CUST_Direction"
    and not declaration."CUST_IsDeleted" for update;
  if not found or not booking_api.customs_access(auth_user_id,p_declaration_id,true) then raise exception 'This Customs draft is unavailable or can no longer be edited.' using errcode='42501'; end if;
  if coalesce(p_draft->>'direction',declaration_row."CUST_Direction")<>declaration_row."CUST_Direction" then raise exception 'The declaration direction cannot be changed.' using errcode='22023'; end if;

  update public."Customs_Declarations" set
    "CUST_UCR"=nullif(btrim(p_draft->>'ucn'),''), "CUST_TraderReference"=nullif(btrim(p_draft->>'traderReference'),''),
    "CUST_DeclarantIdentifierSnapshot"=nullif(btrim(p_draft->>'declarant'),''),
    "CUST_ImporterIdentifierSnapshot"=nullif(btrim(p_draft->>'importer'),''),
    "CUST_ExporterIdentifierSnapshot"=nullif(btrim(p_draft->>'exporter'),''),
    "CUST_RepresentativeIdentifierSnapshot"=nullif(btrim(p_draft->>'representative'),''),
    "CUST_CustomsOfficeOfEntry"=case when declaration_row."CUST_Direction"='import' then nullif(btrim(p_draft->>'presentationOffice'),'') else "CUST_CustomsOfficeOfEntry" end,
    "CUST_CustomsOfficeOfExit"=case when declaration_row."CUST_Direction"='export' then nullif(btrim(p_draft->>'exitOffice'),'') else "CUST_CustomsOfficeOfExit" end,
    "CUST_GoodsLocationCode"=nullif(btrim(p_draft->>'goodsLocationIdentifier'),''),
    "CUST_CountryOfDispatchCodeSnapshot"=nullif(btrim(p_draft->>'exportCountry'),''),
    "CUST_CountryOfDestinationCodeSnapshot"=nullif(btrim(p_draft->>'destinationCountry'),''),
    "CUST_TotalPackages"=case when coalesce(p_draft->>'totalPackages','')~'^\d+$' then (p_draft->>'totalPackages')::integer end,
    "CUST_GrossMass"=case when coalesce(p_draft->>'totalGrossMass','')~'^\d+(\.\d+)?$' then (p_draft->>'totalGrossMass')::numeric end,
    "CUST_InvoiceAmount"=case when coalesce(p_draft->>'totalAmount','')~'^\d+(\.\d+)?$' then (p_draft->>'totalAmount')::numeric end,
    "CUST_InvoiceCurrencyCodeSnapshot"=nullif(btrim(p_draft->>'currency'),''),
    "CUST_IncotermsCode"=nullif(btrim(p_draft->>'tradeTerms'),''),
    "CUST_GenericPayloadJSON"=p_draft,"CUST_Status"='draft',"CUST_UpdatedAt"=updated_at_value,"CUST_UpdatedBy"=auth_user_id
  where "CUST_id"=p_declaration_id;
  delete from public."Customs_Items" where "CUSTI_CustomsID"=p_declaration_id;
  insert into public."Customs_Items" (
    "CUSTI_CustomsID","CUSTI_ItemNumber","CUSTI_CommodityCode","CUSTI_DescriptionOfGoods",
    "CUSTI_CountryOfOriginCodeSnapshot","CUSTI_CountryOfDestinationCodeSnapshot","CUSTI_NetMass","CUSTI_GrossMass",
    "CUSTI_SupplementaryUnits","CUSTI_ItemValueAmount","CUSTI_ItemValueCurrencyCodeSnapshot","CUSTI_ProcedureCode",
    "CUSTI_AdditionalProcedureCodesJSON","CUSTI_ItemPayloadJSON","CUSTI_JobCargoID"
  ) select p_declaration_id,item.ordinality::integer,nullif(btrim(item.value->>'commodityCode'),''),coalesce(item.value->>'description',''),
    nullif(btrim(item.value->>'nonPreferentialOrigin'),''),nullif(btrim(coalesce(item.value->>'destinationCountry',p_draft->>'destinationCountry')),''),
    case when coalesce(item.value->>'netMass','')~'^\d+(\.\d+)?$' then (item.value->>'netMass')::numeric end,
    case when coalesce(item.value->>'grossMass','')~'^\d+(\.\d+)?$' then (item.value->>'grossMass')::numeric end,
    case when coalesce(item.value->>'tariffQuantity','')~'^\d+(\.\d+)?$' then (item.value->>'tariffQuantity')::numeric end,
    case when coalesce(item.value->>'itemPrice','')~'^\d+(\.\d+)?$' then (item.value->>'itemPrice')::numeric end,
    nullif(btrim(item.value->>'currency'),''),nullif(btrim(item.value->>'procedureCode'),''),
    case when nullif(btrim(item.value->>'additionalProcedureCode'),'') is null then '[]'::jsonb else jsonb_build_array(item.value->>'additionalProcedureCode') end,
    item.value,nullif(item.value->>'sourceJobCargoId','')::uuid
  from jsonb_array_elements(coalesce(p_draft->'items','[]'::jsonb)) with ordinality item(value,ordinality);
  return query select p_declaration_id,declaration_row."CUST_LocalReferenceNumber"::text,updated_at_value;
end;
$$;

create or replace function public.save_job_customs_draft(
  p_declaration_id uuid,
  p_draft jsonb
)
returns table(declaration_id uuid, local_reference_number text, updated_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select *
  from booking_api.save_job_customs_draft(auth.uid(), p_declaration_id, p_draft)
$$;

create or replace function public.reopen_rejected_customs_declaration(
  p_declaration_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_user_id uuid := auth.uid();
  status_value text;
begin
  if auth_user_id is null then
    raise exception 'Authentication is required to correct a Customs declaration.' using errcode = '42501';
  end if;
  if not booking_api.customs_access(auth_user_id, p_declaration_id, true) then
    raise exception 'This rejected Customs declaration is unavailable or cannot be corrected.' using errcode = '42501';
  end if;
  select declaration."CUST_Status" into status_value
  from public."Customs_Declarations" declaration
  where declaration."CUST_id" = p_declaration_id
    and declaration."CUST_DeclarationKind" in ('cds_export','cds_import')
    and declaration."CUST_Status" in ('rejected','draft')
    and not declaration."CUST_IsDeleted"
  for update;
  if status_value is null then
    raise exception 'This rejected Customs declaration is unavailable or cannot be corrected.' using errcode = '42501';
  end if;
  if status_value = 'draft' then return status_value; end if;
  update public."Customs_Declarations" set
    "CUST_Status"='draft', "CUST_UpdatedAt"=clock_timestamp(), "CUST_UpdatedBy"=auth_user_id
  where "CUST_id"=p_declaration_id;
  insert into public."Customs_AuditLog" (
    "CUSTAU_CustomsID","CUSTAU_Action","CUSTAU_TableName","CUSTAU_RecordID",
    "CUSTAU_ChangedBy","CUSTAU_OldValues","CUSTAU_NewValues","CUSTAU_Source","CUSTAU_Notes"
  ) values (
    p_declaration_id,'customs_rejection_correction_started','Customs_Declarations',p_declaration_id,
    auth_user_id,jsonb_build_object('status','rejected'),jsonb_build_object('status','draft'),
    'multideck_app','The operator started a corrected declaration after a Customs rejection.'
  );
  return 'draft';
end;
$$;

create or replace function public.booking_workflow_customs_readiness(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select booking_api.customs_readiness(caller_auth_user_id,requested_job_id) $$;
create or replace function public.booking_workflow_send_to_customs(caller_auth_user_id uuid,requested_job_id uuid,requested_idempotency_key uuid)
returns jsonb language sql security definer set search_path=''
as $$ select booking_api.send_to_customs(caller_auth_user_id,requested_job_id,requested_idempotency_key) $$;

revoke all on function booking_api.customs_access(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.customs_declaration_authorised(uuid,uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.customs_declaration_current_user_authorised(uuid,boolean) from public,anon,authenticated;
revoke all on function booking_api.find_customs_department(uuid,uuid) from public,anon,authenticated;
revoke all on function booking_api.customs_readiness(uuid,uuid) from public,anon,authenticated;
revoke all on function booking_api.resolve_customs_department(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function booking_api.send_to_customs(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function booking_api.save_job_customs_draft(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.save_job_customs_draft(uuid,jsonb) from public,anon;
revoke all on function public.booking_workflow_customs_readiness(uuid,uuid) from public,anon,authenticated;
revoke all on function public.booking_workflow_send_to_customs(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.customs_declaration_authorised(uuid,uuid,boolean,boolean) to service_role;
grant execute on function public.customs_declaration_current_user_authorised(uuid,boolean) to authenticated,service_role;
grant execute on function public.save_job_customs_draft(uuid,jsonb) to authenticated,service_role;
grant execute on function public.reopen_rejected_customs_declaration(uuid) to authenticated,service_role;
grant execute on function public.booking_workflow_customs_readiness(uuid,uuid) to service_role;
grant execute on function public.booking_workflow_send_to_customs(uuid,uuid,uuid) to service_role;

insert into public."Comm_UserNotificationPreferences" (
  "CommNotifPref_UserID","CommNotifPref_ChannelCode","CommNotifPref_EventType","CommNotifPref_IsEnabled",
  "CommNotifPref_DeliveryChannelsJSON","CommNotifPref_QuietHoursJSON"
)
select user_row."User_ID",'email','customs_handoff',true,jsonb_build_object('email',true,'in_app',true),'{}'::jsonb
from public."cmp_Users" user_row
on conflict ("CommNotifPref_UserID","CommNotifPref_ChannelCode","CommNotifPref_EventType") do nothing;

commit;
