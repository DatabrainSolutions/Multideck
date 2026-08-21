-- Canonical Quote -> Booking workflow and secure customer quote responses.
--
-- Bookings remain Job_Header aggregates. A blank operator booking and a booking
-- created from an accepted quote therefore open the same workspace and share
-- the same routing, party, cargo, container and document records.

begin;

create schema if not exists booking_api;
revoke all on schema booking_api from public, anon, authenticated;
grant usage on schema booking_api to service_role;

insert into public."sys_JobStatuses" (
  "JS_Code", "JS_Name", "JS_Description", "JS_IsFinal", "JS_SortOrder", "JS_IsActive"
) values
  ('draft', 'Draft', 'A newly opened booking that can still be completed.', false, 5, true)
on conflict ("JS_Code") do update set
  "JS_Name" = excluded."JS_Name",
  "JS_Description" = excluded."JS_Description",
  "JS_IsFinal" = false,
  "JS_IsActive" = true;

insert into public."sys_JobDirections" (
  "JD_Code", "JD_Name", "JD_Description", "JD_SortOrder", "JD_IsActive"
) values
  ('unknown', 'Direction needed', 'The operator has not chosen the movement direction yet.', 5, true),
  ('import', 'Import', 'Goods entering the tenant jurisdiction.', 10, true),
  ('export', 'Export', 'Goods leaving the tenant jurisdiction.', 20, true),
  ('domestic', 'Domestic', 'A movement within one customs jurisdiction.', 30, true),
  ('cross_trade', 'Cross trade', 'A movement between external jurisdictions.', 40, true)
on conflict ("JD_Code") do update set
  "JD_Name" = excluded."JD_Name",
  "JD_Description" = excluded."JD_Description",
  "JD_SortOrder" = excluded."JD_SortOrder",
  "JD_IsActive" = true;

insert into public."sys_JobTransportModes" (
  "JTM_Code", "JTM_Name", "JTM_Description", "JTM_SortOrder", "JTM_IsActive"
) values
  ('air', 'Air', 'Air freight.', 10, true),
  ('sea', 'Sea', 'Sea freight.', 20, true),
  ('road', 'Road', 'Road freight.', 30, true),
  ('rail', 'Rail', 'Rail freight.', 40, true),
  ('courier', 'Courier', 'Courier or express freight.', 50, true)
on conflict ("JTM_Code") do update set
  "JTM_Name" = excluded."JTM_Name",
  "JTM_Description" = excluded."JTM_Description",
  "JTM_SortOrder" = excluded."JTM_SortOrder",
  "JTM_IsActive" = true;

alter table public."Job_Header"
  alter column "Job_Customer" drop not null,
  add column if not exists "Job_BookingReference" varchar(80),
  add column if not exists "Job_SourceQuoteID" uuid references public."CusQuote_Header"("CusQuoteHeader_ID") on delete set null,
  add column if not exists "Job_SourceQuoteVersionID" uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null,
  add column if not exists "Job_SourceQuoteResponseID" uuid,
  add column if not exists "Job_CreateIdempotencyKey" uuid,
  add column if not exists "Job_IncotermsCode" varchar(10),
  add column if not exists "Job_IncotermsLocation" varchar(180),
  add column if not exists "Job_FreightChargeAmount" numeric(18,4),
  add column if not exists "Job_FreightChargeCurrencyCode" varchar(3),
  add column if not exists "Job_CollectionAddress" text,
  add column if not exists "Job_DeliveryAddress" text,
  add column if not exists "Job_CustomerDeadline" date,
  add column if not exists "Job_SourceSnapshotJSON" jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'CK_Job_Header_customer_after_draft'
  ) then
    alter table public."Job_Header"
      add constraint "CK_Job_Header_customer_after_draft"
      check ("Job_Status" = 'draft' or "Job_Customer" is not null) not valid;
    alter table public."Job_Header" validate constraint "CK_Job_Header_customer_after_draft";
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'CK_Job_Header_freight_currency'
  ) then
    alter table public."Job_Header"
      add constraint "CK_Job_Header_freight_currency"
      check ("Job_FreightChargeCurrencyCode" is null or "Job_FreightChargeCurrencyCode" ~ '^[A-Z]{3}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'CK_Job_Header_source_snapshot'
  ) then
    alter table public."Job_Header"
      add constraint "CK_Job_Header_source_snapshot"
      check (jsonb_typeof("Job_SourceSnapshotJSON") = 'object');
  end if;
end;
$$;

update public."Job_Header"
set "Job_BookingReference" = 'MD-' || "Job_Number"
where nullif(btrim("Job_BookingReference"), '') is null;

create unique index if not exists "UX_Job_Header_booking_reference"
  on public."Job_Header" (upper("Job_BookingReference"))
  where not "Job_IsDeleted";
create unique index if not exists "UX_Job_Header_source_quote"
  on public."Job_Header" ("Job_SourceQuoteID")
  where "Job_SourceQuoteID" is not null and not "Job_IsDeleted";
create unique index if not exists "UX_Job_Header_create_idempotency"
  on public."Job_Header" ("Job_CreatedBy", "Job_CreateIdempotencyKey")
  where "Job_CreateIdempotencyKey" is not null and not "Job_IsDeleted";
create index if not exists "IX_Job_Header_source_quote_version"
  on public."Job_Header" ("Job_SourceQuoteVersionID")
  where "Job_SourceQuoteVersionID" is not null;

create table if not exists booking_api.events (
  event_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  job_id uuid not null references public."Job_Header"("Job_ID") on delete cascade,
  event_type varchar(60) not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public."cmp_Users"("User_ID") on delete set null,
  occurred_at timestamptz not null default now(),
  constraint booking_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create index if not exists booking_events_job_occurred_idx
  on booking_api.events (job_id, occurred_at desc);
revoke all on table booking_api.events from public, anon, authenticated;
grant select, insert, update, delete on table booking_api.events to service_role;

create table if not exists quote_api.customer_response_links (
  response_link_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  quote_id uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  quote_version_id uuid not null references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete cascade,
  recipient_name varchar(180),
  recipient_email varchar(320) not null,
  response_origin varchar(255) not null,
  token_hash varchar(64) not null,
  status_code varchar(30) not null default 'active',
  expires_at timestamptz,
  first_opened_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz,
  delivery_status_code varchar(30) not null default 'pending',
  delivery_provider_id varchar(180),
  delivery_error text,
  created_at timestamptz not null default now(),
  created_by uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint customer_response_links_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_response_links_status check (status_code in ('active','responded','expired','revoked')),
  constraint customer_response_links_delivery check (delivery_status_code in ('pending','sent','failed')),
  constraint customer_response_links_origin check (
    response_origin ~ '^https://([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.multideck\.app$'
    or response_origin ~ '^https?://(localhost|127\.0\.0\.1):3000$'
  ),
  constraint customer_response_links_expiry check (expires_at is null or expires_at > created_at)
);
create unique index if not exists customer_response_links_token_hash_idx
  on quote_api.customer_response_links (token_hash);
create index if not exists customer_response_links_quote_idx
  on quote_api.customer_response_links (quote_id, created_at desc);
create unique index if not exists customer_response_links_one_active_idx
  on quote_api.customer_response_links (quote_id)
  where status_code = 'active';

create table if not exists quote_api.customer_responses (
  response_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  response_link_id uuid not null unique references quote_api.customer_response_links(response_link_id) on delete restrict,
  quote_id uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  quote_version_id uuid not null references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete restrict,
  decision_code varchar(30) not null,
  customer_message text,
  competitor_document_id uuid references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  source_ip_hash varchar(64),
  user_agent_summary varchar(500),
  created_at timestamptz not null default now(),
  constraint customer_responses_decision check (decision_code in ('accepted','declined','challenged')),
  constraint customer_responses_message check (
    (decision_code = 'accepted')
    or nullif(btrim(customer_message), '') is not null
  ),
  constraint customer_responses_ip_hash check (source_ip_hash is null or source_ip_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists customer_responses_quote_created_idx
  on quote_api.customer_responses (quote_id, created_at desc);

create or replace function quote_api.revoke_customer_links_for_new_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update quote_api.customer_response_links
  set status_code = 'revoked', revoked_at = now()
  where quote_id = new."CusQuoteHeader_ID"
    and quote_version_id <> new."CusQuoteVersion_ID"
    and status_code = 'active';
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Versions_revoke_superseded_customer_links" on public."CusQuote_Versions";
create trigger "TR_CusQuote_Versions_revoke_superseded_customer_links"
after insert on public."CusQuote_Versions"
for each row execute function quote_api.revoke_customer_links_for_new_version();

alter table public."Job_Header"
  drop constraint if exists "Job_Header_Job_SourceQuoteResponseID_fkey";
alter table public."Job_Header"
  add constraint "Job_Header_Job_SourceQuoteResponseID_fkey"
  foreign key ("Job_SourceQuoteResponseID")
  references quote_api.customer_responses(response_id) on delete set null;

revoke all on table quote_api.customer_response_links, quote_api.customer_responses
  from public, anon, authenticated;
grant select, insert, update, delete
  on table quote_api.customer_response_links, quote_api.customer_responses
  to service_role;

create or replace function booking_api.has_permission(
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

create or replace function booking_api.allocate_reference(
  workspace_company_id uuid,
  requested_sequence_key text default 'default'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_key_value text := coalesce(nullif(lower(btrim(requested_sequence_key)), ''), 'default');
  sequence_row record;
begin
  insert into quote_api.booking_reference_sequences (
    company_id, sequence_key, label, pattern, next_number, enabled
  ) values (
    workspace_company_id, sequence_key_value,
    case when sequence_key_value = 'default' then 'Default booking' else initcap(replace(sequence_key_value, '_', ' ')) end,
    'B-{NUMBER}', 1, true
  ) on conflict (company_id, sequence_key) do nothing;

  select reference.* into strict sequence_row
  from quote_api.booking_reference_sequences reference
  where reference.company_id = workspace_company_id
    and reference.sequence_key = sequence_key_value
    and reference.enabled
  for update;

  update quote_api.booking_reference_sequences
  set next_number = sequence_row.next_number + 1,
      updated_at = now()
  where company_id = workspace_company_id
    and sequence_key = sequence_key_value;

  return quote_api.render_reference_pattern(
    quote_api.clean_reference_pattern(sequence_row.pattern, 'B-{NUMBER}'),
    sequence_row.next_number
  );
exception
  when no_data_found then
    raise exception 'Choose an active booking reference sequence.' using errcode = '22023';
end;
$$;

create or replace function booking_api.normalise_direction(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(replace(replace(btrim(coalesce(value, '')), '-', '_'), ' ', '_'))
    when 'import' then 'import'
    when 'export' then 'export'
    when 'domestic' then 'domestic'
    when 'cross_trade' then 'cross_trade'
    when 'crosstrade' then 'cross_trade'
    else 'unknown'
  end
$$;

create or replace function booking_api.normalise_mode(value text)
returns text
language sql
stable
set search_path = ''
as $$
  select mode."JTM_Code"
  from public."sys_JobTransportModes" mode
  where mode."JTM_IsActive"
    and (
      lower(mode."JTM_Code") = lower(btrim(coalesce(value, '')))
      or lower(mode."JTM_Name") = lower(btrim(coalesce(value, '')))
    )
  order by mode."JTM_SortOrder", mode."JTM_Code"
  limit 1
$$;

create or replace function booking_api.quote_readiness(requested_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  quote_row record;
  facts jsonb;
  missing text[] := '{}'::text[];
  warnings text[] := '{}'::text[];
  incoterm_value text;
  mode_value text;
  shipment_value text;
  service_value text;
  has_customs boolean;
  is_containerised boolean;
begin
  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and not quote."CusQuoteHeader_IsDeleted";
  if not found then
    raise exception 'That quote could not be found.' using errcode = 'P0002';
  end if;

  facts := coalesce(quote_row."CusQuoteHeader_ShipmentFactsJSON", '{}'::jsonb);
  incoterm_value := upper(coalesce(quote_row."CusQuoteHeader_Incoterm", ''));
  mode_value := lower(coalesce(quote_row."CusQuoteHeader_ModeCode", ''));
  shipment_value := lower(coalesce(quote_row."CusQuoteHeader_ShipmentTypeCode", ''));
  service_value := lower(coalesce(quote_row."CusQuoteHeader_ServiceLevel", ''));
  has_customs := lower(coalesce(facts->>'customsIncluded', 'no')) in ('true', 'yes', '1');
  is_containerised := shipment_value like '%fcl%' or shipment_value like '%container%';

  if quote_row."CusQuoteHeader_CustomerID" is null then missing := array_append(missing, 'Customer'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_ContactEmailSnapshot"), '') is null then missing := array_append(missing, 'Customer email'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_LoadingPoint"), '') is null then missing := array_append(missing, 'Origin / loading point'); end if;
  if nullif(btrim(quote_row."CusQuoteHeader_DischargePoint"), '') is null then missing := array_append(missing, 'Destination / discharge point'); end if;
  if quote_row."CusQuoteHeader_CreatedDate" is null then missing := array_append(missing, 'Quote date'); end if;
  if quote_row."CusQuoteHeader_ValidFrom" is null then missing := array_append(missing, 'Validity start'); end if;
  if quote_row."CusQuoteHeader_ValidTo" is null then missing := array_append(missing, 'Validity end'); end if;
  if quote_row."CusQuoteHeader_ValidFrom" is not null and quote_row."CusQuoteHeader_ValidTo" is not null
     and quote_row."CusQuoteHeader_ValidTo" < quote_row."CusQuoteHeader_ValidFrom" then
    missing := array_append(missing, 'A validity end on or after the start');
  end if;
  if mode_value = '' then missing := array_append(missing, 'Transport mode'); end if;
  if shipment_value = '' then missing := array_append(missing, 'Shipment / equipment type'); end if;
  if incoterm_value = '' then missing := array_append(missing, 'Incoterms'); end if;
  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is null then missing := array_append(missing, 'Goods description'); end if;
  if incoterm_value = 'EXW' or lower(coalesce(facts->>'collectionRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%' then
    if nullif(btrim(quote_row."CusQuoteHeader_CollectionAddress"), '') is null then missing := array_append(missing, 'Collection address'); end if;
  end if;
  if incoterm_value in ('DAP','DPU','DDP') or lower(coalesce(facts->>'deliveryRequired', 'false')) in ('true','yes','1')
     or service_value like '%door%' then
    if nullif(btrim(quote_row."CusQuoteHeader_DeliveryAddress"), '') is null then missing := array_append(missing, 'Delivery address'); end if;
  end if;
  if mode_value in ('sea','ocean') and is_containerised
     and nullif(btrim(facts->>'container'), '') is null then
    missing := array_append(missing, 'Container details');
  end if;
  if not is_containerised and nullif(btrim(facts->>'packageQuantity'), '') is null then
    missing := array_append(missing, 'Package / piece quantity');
  end if;
  if not is_containerised and nullif(btrim(facts->>'packageType'), '') is null then
    missing := array_append(missing, 'Package type');
  end if;
  if mode_value in ('air','courier')
     and nullif(btrim(coalesce(facts->>'chargeableWeightKg', facts->>'grossWeightKg')), '') is null then
    missing := array_append(missing, 'Chargeable or gross weight');
  end if;
  if mode_value in ('sea','road','rail')
     and not is_containerised
     and nullif(btrim(coalesce(facts->>'volumeCbm', facts->>'grossWeightKg')), '') is null then
    missing := array_append(missing, 'Volume or gross weight');
  end if;
  if has_customs and (
    case
      when coalesce(facts->>'entries', '') ~ '^\d+$' then (facts->>'entries')::integer
      else 0
    end
  ) < 1 then
    missing := array_append(missing, 'Customs entry-line count');
  end if;
  if nullif(btrim(quote_row."CusQuoteHeader_TermsText"), '') is null then missing := array_append(missing, 'Terms and conditions'); end if;
  if nullif(btrim(coalesce(facts->>'subjectToTerms', quote_row."CusQuoteHeader_CustomerNotes")), '') is null then
    missing := array_append(missing, 'Subject-to-rate / space terms');
  end if;
  if not exists (
    select 1 from public."CusQuote_Lines" line
    where line."CusQuoteHeader_ID" = requested_quote_id
      and line."CusQuoteLine_ShowToCustomer"
      and coalesce(line."CusQuoteLine_RevenueAmountLocal", 0) <> 0
  ) then missing := array_append(missing, 'At least one customer charge'); end if;

  return jsonb_build_object(
    'ready', cardinality(missing) = 0,
    'missing', to_jsonb(missing),
    'warnings', to_jsonb(warnings)
  );
end;
$$;

create or replace function booking_api.open_booking(
  caller_auth_user_id uuid,
  requested_idempotency_key uuid,
  requested_sequence_key text default 'default'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  office_id uuid;
  booking_reference text;
  job_id uuid;
  existing_job record;
begin
  if caller_auth_user_id is null
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Write') then
    raise exception 'Booking creation is not authorised.' using errcode = '42501';
  end if;
  if requested_idempotency_key is null then
    raise exception 'A booking request key is required.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';

  select job.* into existing_job
  from public."Job_Header" job
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
  where job."Job_CreatedBy" = app_user."User_ID"
    and job."Job_CreateIdempotencyKey" = requested_idempotency_key
    and office."Company_ID" = app_user."Company_ID"
    and not job."Job_IsDeleted"
  limit 1;
  if found then
    return jsonb_build_object(
      'jobId', existing_job."Job_ID",
      'bookingReference', existing_job."Job_BookingReference",
      'reused', true
    );
  end if;

  select office."Office_ID" into office_id
  from public."cmp_Offices" office
  where office."Company_ID" = app_user."Company_ID"
    and office."Office_IsActive"
  order by office."Office_ID"
  limit 1;
  if office_id is null then
    raise exception 'No active office is configured for this workspace.' using errcode = '22023';
  end if;

  booking_reference := booking_api.allocate_reference(app_user."Company_ID", requested_sequence_key);
  insert into public."Job_Header" (
    "Job_Period", "Job_CreatedBy", "Job_Customer",
    "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction",
    "Job_TrackingStatus", "Job_CurrentLocationNameSnapshot",
    "Job_BookingReference", "Job_CreateIdempotencyKey", "Job_UpdatedBy"
  ) values (
    to_char(current_date, 'YYYYMM'), app_user."User_ID", null,
    office_id, office_id, 'draft', 'unknown',
    'planning', 'Planning', booking_reference, requested_idempotency_key, app_user."User_ID"
  ) returning "Job_ID" into job_id;

  insert into booking_api.events (company_id, job_id, event_type, summary, actor_user_id)
  values (app_user."Company_ID", job_id, 'created', 'Draft booking created.', app_user."User_ID");

  return jsonb_build_object('jobId', job_id, 'bookingReference', booking_reference, 'reused', false);
exception
  when unique_violation then
    select job.* into existing_job
    from public."Job_Header" job
    where job."Job_CreatedBy" = app_user."User_ID"
      and job."Job_CreateIdempotencyKey" = requested_idempotency_key
      and not job."Job_IsDeleted"
    limit 1;
    if found then
      return jsonb_build_object('jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference", 'reused', true);
    end if;
    raise;
end;
$$;

create or replace function booking_api.convert_accepted_quote(
  requested_quote_id uuid,
  requested_actor_user_id uuid default null,
  requested_response_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_row record;
  version_row record;
  actor_user_id uuid;
  company_id uuid;
  office_id uuid;
  booking_reference text;
  job_id uuid;
  payload jsonb;
  facts jsonb;
  party jsonb;
  charge jsonb;
  charge_number integer := 0;
  mode_code text;
  direction_code text;
  existing_job record;
begin
  select job.* into existing_job
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = requested_quote_id
    and not job."Job_IsDeleted"
  limit 1;
  if found then
    if requested_response_id is not null and existing_job."Job_SourceQuoteResponseID" is null then
      update public."Job_Header"
      set "Job_SourceQuoteResponseID" = requested_response_id,
          "Job_UpdatedAt" = now()
      where "Job_ID" = existing_job."Job_ID";
    end if;
    return jsonb_build_object('jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference", 'reused', true);
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then
    raise exception 'Only an accepted quote can create a booking.' using errcode = '22023';
  end if;

  select version.* into version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = coalesce(
    quote_row."CusQuoteHeader_AcceptedVersionID",
    (select current_version."CusQuoteVersion_ID"
     from public."CusQuote_Versions" current_version
     where current_version."CusQuoteHeader_ID" = requested_quote_id
       and current_version."CusQuoteVersion_IsCurrent"
     limit 1)
  );
  if not found then
    raise exception 'The accepted quote version is unavailable.' using errcode = 'P0002';
  end if;

  payload := coalesce(version_row."CusQuoteVersion_SnapshotJSON"->'quote', '{}'::jsonb);
  facts := coalesce(payload->'shipmentFacts', '{}'::jsonb);
  office_id := coalesce(
    nullif(payload->>'officeId', '')::uuid,
    quote_row."CusQuoteHeader_OrgOfficeID",
    quote_row."OrgOffice_ID"
  );
  select office."Company_ID" into company_id
  from public."cmp_Offices" office
  where office."Office_ID" = office_id;
  if company_id is null then
    raise exception 'The accepted quote office is unavailable.' using errcode = 'P0002';
  end if;

  actor_user_id := coalesce(
    requested_actor_user_id,
    quote_row."CusQuoteHeader_SalesOwnerID",
    quote_row."CusQuoteHeader_LastEditedBy",
    quote_row."CusQuoteHeader_CreatedBy"
  );
  if not exists (
    select 1 from public."cmp_Users" app_user
    where app_user."User_ID" = actor_user_id
      and app_user."Company_ID" = company_id
  ) then
    select app_user."User_ID" into actor_user_id
    from public."cmp_Users" app_user
    where app_user."Company_ID" = company_id
      and app_user."User_AccessStatus" = 'active'
    order by app_user."User_ID"
    limit 1;
  end if;
  if actor_user_id is null then
    raise exception 'No active operator can own the accepted booking.' using errcode = 'P0002';
  end if;

  booking_reference := booking_api.allocate_reference(company_id, 'default');
  direction_code := booking_api.normalise_direction(coalesce(payload->>'direction', quote_row."CusQuoteHeader_Direction"));
  mode_code := booking_api.normalise_mode(coalesce(payload->>'mode', quote_row."CusQuoteHeader_ModeCode"));

  insert into public."Job_Header" (
    "Job_Period", "Job_CreatedBy", "Job_Customer", "Job_Carrier", "Job_Supplier",
    "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction", "Job_TransportModeSummary",
    "Job_OriginNameSnapshot", "Job_DestinationNameSnapshot", "Job_ReadyDate", "Job_RequiredDeliveryDate",
    "Job_TrackingStatus", "Job_CurrentLocationNameSnapshot", "Job_InternalNotes", "Job_UpdatedBy",
    "Job_BookingReference", "Job_SourceQuoteID", "Job_SourceQuoteVersionID", "Job_SourceQuoteResponseID",
    "Job_IncotermsCode", "Job_IncotermsLocation", "Job_CollectionAddress", "Job_DeliveryAddress",
    "Job_CustomerDeadline", "Job_SourceSnapshotJSON"
  ) values (
    to_char(current_date, 'YYYYMM'), actor_user_id,
    coalesce(nullif(payload->>'customerId', '')::uuid, quote_row."CusQuoteHeader_CustomerID"),
    coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    coalesce(nullif(payload->>'supplierId', '')::uuid, quote_row."CusQuoteHeader_SupplierID"),
    office_id, office_id, 'open', direction_code, mode_code,
    coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'validFrom', '')::date,
    nullif(payload->>'deadline', '')::date,
    'planning', 'Planning', nullif(payload->>'internalNotes', ''), actor_user_id,
    booking_reference, requested_quote_id, version_row."CusQuoteVersion_ID", requested_response_id,
    upper(nullif(payload->>'incoterm', '')), nullif(facts->>'namedPlace', ''),
    nullif(payload->>'collectionAddress', ''), nullif(payload->>'deliveryAddress', ''),
    nullif(payload->>'deadline', '')::date,
    jsonb_build_object(
      'source', 'accepted_quote',
      'quoteId', requested_quote_id,
      'quoteVersionId', version_row."CusQuoteVersion_ID",
      'quoteReference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'acceptedSnapshot', version_row."CusQuoteVersion_SnapshotJSON"
    )
  ) returning "Job_ID" into job_id;

  party := payload->'shipper';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
      "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
      "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (
      job_id, 'shipper', nullif(party->>'orgId', '')::uuid, 1,
      left(nullif(btrim(party->>'name'), ''), 240), nullif(btrim(party->>'address'), ''),
      left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id
    );
  end if;
  party := payload->'consignee';
  if quote_api.jsonb_has_content(party) then
    insert into public."Job_Parties" (
      "JobParty_JobID", "JobParty_Role", "JobParty_OrgID", "JobParty_Sequence",
      "JobParty_NameSnapshot", "JobParty_AddressSnapshot", "JobParty_ContactNameSnapshot",
      "JobParty_IsPrimary", "JobParty_RawSnapshot", "JobParty_CreatedBy"
    ) values (
      job_id, 'consignee', nullif(party->>'orgId', '')::uuid, 1,
      left(nullif(btrim(party->>'name'), ''), 240), nullif(btrim(party->>'address'), ''),
      left(nullif(btrim(party->>'contact'), ''), 180), true, party, actor_user_id
    );
  end if;

  insert into public."Job_Routing" (
    "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
    "JobRoute_OriginNameSnapshot", "JobRoute_OriginAddressSnapshot",
    "JobRoute_DestinationNameSnapshot", "JobRoute_DestinationAddressSnapshot",
    "JobRoute_Carrier", "JobRoute_ServiceLevel", "JobRoute_IsMainCarriage",
    "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
  ) values (
    job_id, 1, 'planned', mode_code,
    coalesce(nullif(payload->>'loadingPoint', ''), quote_row."CusQuoteHeader_LoadingPoint"),
    nullif(payload->>'collectionAddress', ''),
    coalesce(nullif(payload->>'dischargePoint', ''), quote_row."CusQuoteHeader_DischargePoint"),
    nullif(payload->>'deliveryAddress', ''),
    coalesce(nullif(payload->>'carrierId', '')::uuid, quote_row."CusQuoteHeader_CarrierID"),
    nullif(payload->>'serviceLevel', ''), true,
    jsonb_build_object('source', 'accepted_quote', 'shipmentFacts', facts), actor_user_id
  );

  if nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), '') is not null then
    insert into public."Job_Cargo" (
      "JobCargo_JobID", "JobCargo_LineNo", "JobCargo_Description", "JobCargo_Qty",
      "JobCargo_PackageTypeCodeSnapshot", "JobCargo_PackageQty", "JobCargo_GrossKilos",
      "JobCargo_NettKilos", "JobCargo_HSCode", "JobCargo_VolumeCBM",
      "JobCargo_DeclaredValueAmount", "JobCargo_DeclaredValueCurrencyCodeSnapshot",
      "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
    ) values (
      job_id, 1, coalesce(facts->>'knownCargo', facts->>'commodity'),
      nullif(coalesce(facts->>'pieces', facts->>'packageQuantity'), '')::numeric,
      left(nullif(facts->>'packageType', ''), 40),
      nullif(coalesce(facts->>'packageQuantity', facts->>'pieces'), '')::numeric,
      nullif(facts->>'grossWeightKg', '')::numeric,
      nullif(facts->>'netWeightKg', '')::numeric,
      left(nullif(facts->>'hsCode', ''), 30),
      nullif(facts->>'volumeCbm', '')::numeric,
      nullif(regexp_replace(coalesce(facts->>'goodsValue', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      coalesce(nullif(upper(facts->>'goodsValueCurrency'), ''), nullif(upper(payload->>'currency'), '')),
      facts, actor_user_id
    );
  end if;

  if nullif(btrim(facts->>'container'), '') is not null then
    insert into public."Job_Containers" (
      "Job_ID", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind",
      "JobContainer_Status", "JobContainer_JSON", "JobContainer_UpdatedBy"
    ) values (
      job_id, left(facts->>'container', 40),
      case when lower(coalesce(payload->>'mode', '')) in ('air','courier') then 'unit_load_device' else 'container' end,
      'planned', jsonb_build_object('description', facts->>'container', 'source', 'accepted_quote'), actor_user_id
    );
  end if;

  for charge in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop
    charge_number := charge_number + 1;
    insert into public."Job_Costing_Lines" (
      "Job_ID", "JobCostingLine_Number", "JobCostingLine_SupplierID",
      "JobCostingLine_Description", "JobCostingLine_InternalNotes", "JobCostingLine_CustomerNotes",
      "JobCostingLine_CostROE", "JobCostingLine_CostAmountCurrency", "JobCostingLine_CostAmountLocal",
      "JobCostingLine_RevenueROE", "JobCostingLine_RevenueAmountCurrency", "JobCostingLine_RevenueAmountLocal",
      "JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy"
    ) values (
      job_id, charge_number, nullif(charge->>'supplierId', '')::uuid,
      left(coalesce(nullif(btrim(charge->>'description'), ''), 'Charge'), 240),
      nullif(charge->>'internalNotes', ''), nullif(charge->>'customerNotes', ''),
      greatest(coalesce(nullif(charge->>'costRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'costAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'costLocal', '')::numeric, 0),
      greatest(coalesce(nullif(charge->>'sellRoe', '')::numeric, 1), 0.00001),
      coalesce(nullif(charge->>'sellAmount', '')::numeric, 0),
      coalesce(nullif(charge->>'sellLocal', '')::numeric, 0),
      coalesce((charge->>'showToCustomer')::boolean, true), actor_user_id, actor_user_id
    );
  end loop;

  update public."CusQuote_Header"
  set "CusQuoteHeader_JobID" = job_id,
      "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into booking_api.events (
    company_id, job_id, event_type, summary, metadata, actor_user_id
  ) values (
    company_id, job_id, 'created_from_quote',
    'Booking created from accepted quote.',
    jsonb_build_object('quoteId', requested_quote_id, 'quoteVersionId', version_row."CusQuoteVersion_ID"),
    actor_user_id
  );

  return jsonb_build_object('jobId', job_id, 'bookingReference', booking_reference, 'reused', false);
exception
  when unique_violation then
    select job.* into existing_job
    from public."Job_Header" job
    where job."Job_SourceQuoteID" = requested_quote_id
      and not job."Job_IsDeleted"
    limit 1;
    if found then
      return jsonb_build_object('jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference", 'reused', true);
    end if;
    raise;
end;
$$;

create or replace function booking_api.on_quote_accepted_create_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."CusQuoteHeader_LifecycleCode" = 'accepted'
     and old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then
    perform booking_api.convert_accepted_quote(
      new."CusQuoteHeader_ID",
      coalesce(new."CusQuoteHeader_LastEditedBy", new."CusQuoteHeader_CreatedBy"),
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Header_create_booking_on_accept" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_create_booking_on_accept"
after update of "CusQuoteHeader_LifecycleCode" on public."CusQuote_Header"
for each row execute function booking_api.on_quote_accepted_create_booking();

create or replace function quote_api.issue_customer_response(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_recipient_name text,
  requested_recipient_email text,
  requested_response_origin text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  version_id uuid;
  readiness jsonb;
  link_id uuid;
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote issue is not authorised.' using errcode = '42501';
  end if;
  if requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The quote response token is invalid.' using errcode = '22023';
  end if;
  if requested_recipient_email is null
     or requested_recipient_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid customer email address.' using errcode = '22023';
  end if;
  if requested_response_origin is null or not (
    requested_response_origin ~ '^https://([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.multideck\.app$'
    or requested_response_origin ~ '^https?://(localhost|127\.0\.0\.1):3000$'
  ) then
    raise exception 'The quote response workspace is invalid.' using errcode = '22023';
  end if;
  if requested_expires_at is not null
     and (requested_expires_at <= now() or requested_expires_at > now() + interval '90 days') then
    raise exception 'Choose a quote response expiry within 90 days, or never.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';
  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;
  if quote_row."CusQuoteHeader_LifecycleCode" in ('accepted','declined','ghosted') then
    raise exception 'This quote already has a final outcome.' using errcode = '22023';
  end if;

  readiness := booking_api.quote_readiness(requested_quote_id);
  if not coalesce((readiness->>'ready')::boolean, false) then
    raise exception 'Complete the required quote fields before sending it.' using errcode = '22023', detail = readiness::text;
  end if;
  select version."CusQuoteVersion_ID" into version_id
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = requested_quote_id
    and version."CusQuoteVersion_IsCurrent"
  limit 1;
  if version_id is null then raise exception 'Save the quote before sending it.' using errcode = '22023'; end if;

  update quote_api.customer_response_links
  set status_code = 'revoked', revoked_at = now()
  where quote_id = requested_quote_id and status_code = 'active';

  insert into quote_api.customer_response_links (
    company_id, quote_id, quote_version_id, recipient_name, recipient_email,
    response_origin, token_hash, expires_at, created_by
  ) values (
    app_user."Company_ID", requested_quote_id, version_id,
    left(nullif(btrim(requested_recipient_name), ''), 180), lower(btrim(requested_recipient_email)),
    requested_response_origin, requested_token_hash, requested_expires_at, app_user."User_ID"
  ) returning response_link_id into link_id;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = 'sent',
    "CusQuoteHeader_Status" = 4,
    "CusQuoteHeader_ContactEmailSnapshot" = lower(btrim(requested_recipient_email)),
    "CusQuoteHeader_ContactNameSnapshot" = coalesce(left(nullif(btrim(requested_recipient_name), ''), 180), "CusQuoteHeader_ContactNameSnapshot"),
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, version_id, 'customer_link_issued',
    'Secure customer response link issued.',
    jsonb_build_object('responseLinkId', link_id, 'recipientEmail', lower(btrim(requested_recipient_email)), 'responseOrigin', requested_response_origin, 'expiresAt', requested_expires_at),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'responseLinkId', link_id,
    'quoteId', requested_quote_id,
    'quoteVersionId', version_id,
    'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
    'expiresAt', requested_expires_at,
    'responseOrigin', requested_response_origin,
    'recipientEmail', lower(btrim(requested_recipient_email))
  );
end;
$$;

create or replace function quote_api.customer_response_view(
  requested_token_hash text,
  requested_response_origin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link_row record;
  version_row record;
  quote_row record;
  response_row record;
begin
  if requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This quote link is invalid.' using errcode = 'P0002';
  end if;
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;

  if link_row.status_code = 'active' and link_row.expires_at is not null and link_row.expires_at <= now() then
    return jsonb_build_object('state', 'expired');
  end if;
  if link_row.status_code = 'revoked' then return jsonb_build_object('state', 'revoked'); end if;
  select response.* into response_row
  from quote_api.customer_responses response
  where response.response_link_id = link_row.response_link_id;
  if found then
    return jsonb_build_object(
      'state', 'responded',
      'decision', response_row.decision_code,
      'respondedAt', response_row.created_at
    );
  end if;

  select version.* into strict version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID" = link_row.quote_version_id;
  select quote.* into strict quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = link_row.quote_id;

  return jsonb_build_object(
    'state', 'active',
    'expiresAt', link_row.expires_at,
    'recipientName', link_row.recipient_name,
    'recipientEmail', link_row.recipient_email,
    'quote', jsonb_build_object(
      'id', quote_row."CusQuoteHeader_ID",
      'reference', coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
      'versionNumber', version_row."CusQuoteVersion_Number",
      'snapshot', version_row."CusQuoteVersion_SnapshotJSON",
      'customerName', coalesce(
        version_row."CusQuoteVersion_SnapshotJSON"#>>'{quote,customerName}',
        quote_row."CusQuoteHeader_CustomerNameSnapshot"
      ),
      'contactName', coalesce(
        version_row."CusQuoteVersion_SnapshotJSON"#>>'{quote,contactName}',
        quote_row."CusQuoteHeader_ContactNameSnapshot"
      )
    )
  );
exception
  when no_data_found then
    raise exception 'This quote link is no longer available.' using errcode = 'P0002';
end;
$$;

create or replace function quote_api.submit_customer_response(
  requested_token_hash text,
  requested_response_origin text,
  requested_decision text,
  requested_message text default null,
  requested_competitor_document_id uuid default null,
  requested_source_ip_hash text default null,
  requested_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row record;
  quote_row record;
  response_id_value uuid;
  decision_value text := lower(btrim(coalesce(requested_decision, '')));
  lifecycle_value text;
  booking_result jsonb;
  owner_user_id uuid;
begin
  if decision_value not in ('accepted','declined','challenged') then
    raise exception 'Choose accept, decline or challenge.' using errcode = '22023';
  end if;
  if decision_value in ('declined','challenged') and nullif(btrim(requested_message), '') is null then
    raise exception '%', case
      when decision_value = 'declined' then 'Tell us why you are declining this quote.'
      else 'Tell us what you would like us to review.'
    end using errcode = '22023';
  end if;
  if requested_source_ip_hash is not null and requested_source_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The response audit fingerprint is invalid.' using errcode = '22023';
  end if;

  select link.* into link_row
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash
  for update;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;
  if link_row.status_code <> 'active' then raise exception 'This quote link has already been used or revoked.' using errcode = '22023'; end if;
  if link_row.expires_at is not null and link_row.expires_at <= now() then
    update quote_api.customer_response_links set status_code = 'expired' where response_link_id = link_row.response_link_id;
    raise exception 'This quote link has expired.' using errcode = '22023';
  end if;
  if requested_competitor_document_id is not null and not exists (
    select 1 from public."DOC_StoredObjects" stored
    where stored."DOCStoredObject_ID" = requested_competitor_document_id
      and stored."DOCStoredObject_ConcernCode" = 'quote_response'
      and stored."DOCStoredObject_AggregateType" = 'quote_customer_response_link'
      and stored."DOCStoredObject_AggregateID" = link_row.response_link_id
      and stored."DOCStoredObject_StatusCode" = 'active'
  ) then
    raise exception 'The competitor quote attachment is unavailable.' using errcode = '22023';
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = link_row.quote_id
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then raise exception 'This quote is no longer available.' using errcode = 'P0002'; end if;
  if quote_row."CusQuoteHeader_LifecycleCode" not in ('sent','calculated','revised') then
    raise exception 'This quote already has a final outcome.' using errcode = '22023';
  end if;

  insert into quote_api.customer_responses (
    company_id, response_link_id, quote_id, quote_version_id, decision_code,
    customer_message, competitor_document_id, source_ip_hash, user_agent_summary
  ) values (
    link_row.company_id, link_row.response_link_id, link_row.quote_id, link_row.quote_version_id,
    decision_value, nullif(btrim(requested_message), ''), requested_competitor_document_id,
    requested_source_ip_hash, left(nullif(btrim(requested_user_agent), ''), 500)
  ) returning response_id into response_id_value;

  update quote_api.customer_response_links
  set status_code = 'responded', responded_at = now()
  where response_link_id = link_row.response_link_id;

  lifecycle_value := case decision_value
    when 'accepted' then 'accepted'
    when 'declined' then 'declined'
    else 'revised'
  end;
  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = lifecycle_value,
    "CusQuoteHeader_Status" = case lifecycle_value when 'accepted' then 5 when 'declined' then 6 else 1 end,
    "CusQuoteHeader_AcceptedVersionID" = case when decision_value = 'accepted' then link_row.quote_version_id else null end,
    "CusQuoteHeader_OutcomeNotes" = nullif(btrim(requested_message), ''),
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = link_row.quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
  ) values (
    link_row.company_id, link_row.quote_id, link_row.quote_version_id,
    'customer_' || decision_value,
    case decision_value when 'accepted' then 'Customer accepted the quote.' when 'declined' then 'Customer declined the quote.' else 'Customer challenged the quote.' end,
    jsonb_strip_nulls(jsonb_build_object('responseId', response_id_value, 'message', nullif(btrim(requested_message), ''), 'competitorDocumentId', requested_competitor_document_id)),
    null
  );

  if decision_value = 'accepted' then
    booking_result := booking_api.convert_accepted_quote(link_row.quote_id, quote_row."CusQuoteHeader_SalesOwnerID", response_id_value);
  end if;

  owner_user_id := coalesce(quote_row."CusQuoteHeader_SalesOwnerID", quote_row."CusQuoteHeader_CreatedBy");
  if owner_user_id is not null then
    insert into public."Comm_Notifications" (
      "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
      "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
    ) values (
      owner_user_id,
      coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number") || ' customer response',
      case decision_value
        when 'accepted' then 'The customer accepted this quote. Its booking is ready.'
        when 'declined' then 'The customer declined this quote and supplied a reason.'
        else 'The customer asked for changes to this quote.'
      end,
      'CusQuote_Header', link_row.quote_id, 'quote_response',
      jsonb_build_object(
        'event_type', 'quote_response',
        'action_url', '/quotes/' || coalesce(quote_row."CusQuoteHeader_CustomerReference", 'Q-' || quote_row."CusQuoteHeader_Number"),
        'action_label', 'Open quote',
        'eyebrow', 'Customer quote response',
        'decision', decision_value,
        'response_id', response_id_value
      ),
      null
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'responded',
    'decision', decision_value,
    'responseId', response_id_value,
    'booking', booking_result
  ));
end;
$$;

create or replace function public.booking_workflow_open(
  caller_auth_user_id uuid,
  requested_idempotency_key uuid,
  requested_sequence_key text default 'default'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select booking_api.open_booking(caller_auth_user_id, requested_idempotency_key, requested_sequence_key)
$$;

create or replace function public.quote_workflow_readiness(
  caller_auth_user_id uuid,
  requested_quote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id uuid;
  result jsonb;
begin
  if caller_auth_user_id is null or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Read') then
    raise exception 'Quote access is not authorised.' using errcode = '42501';
  end if;
  select app_user."Company_ID" into company_id
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id and app_user."User_AccessStatus" = 'active';
  if not exists (
    select 1 from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where quote."CusQuoteHeader_ID" = requested_quote_id and office."Company_ID" = company_id and not quote."CusQuoteHeader_IsDeleted"
  ) then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;
  result := booking_api.quote_readiness(requested_quote_id);
  return result;
end;
$$;

create or replace function public.quote_workflow_issue_customer_response(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_recipient_name text,
  requested_recipient_email text,
  requested_response_origin text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.issue_customer_response(
    caller_auth_user_id, requested_quote_id, requested_recipient_name,
    requested_recipient_email, requested_response_origin, requested_token_hash, requested_expires_at
  )
$$;

create or replace function public.quote_customer_response_view(
  requested_token_hash text,
  requested_response_origin text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select quote_api.customer_response_view(requested_token_hash, requested_response_origin) $$;

create or replace function public.quote_customer_response_submit(
  requested_token_hash text,
  requested_response_origin text,
  requested_decision text,
  requested_message text default null,
  requested_competitor_document_id uuid default null,
  requested_source_ip_hash text default null,
  requested_user_agent text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.submit_customer_response(
    requested_token_hash, requested_response_origin, requested_decision, requested_message,
    requested_competitor_document_id, requested_source_ip_hash, requested_user_agent
  )
$$;

create or replace function public.quote_customer_response_upload_context(
  requested_token_hash text,
  requested_response_origin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link_row record;
begin
  if requested_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This quote link is invalid.' using errcode = 'P0002';
  end if;
  select link.* into link_row
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash;
  if not found then raise exception 'This quote link is invalid.' using errcode = 'P0002'; end if;
  if link_row.response_origin is distinct from requested_response_origin then
    raise exception 'This quote link is not available on this workspace.' using errcode = 'P0002';
  end if;
  if link_row.status_code <> 'active' or (link_row.expires_at is not null and link_row.expires_at <= now()) then
    raise exception 'This quote link is no longer active.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'responseLinkId', link_row.response_link_id,
    'companyId', link_row.company_id,
    'quoteId', link_row.quote_id,
    'quoteVersionId', link_row.quote_version_id
  );
end;
$$;

create or replace function public.quote_workflow_recent_company_email_samples(
  requested_user_id uuid,
  requested_quote_id uuid,
  requested_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  app_user record;
  quote_row record;
  take_count integer := least(5, greatest(1, coalesce(requested_limit, 5)));
  result_value jsonb;
begin
  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "User_ID" = requested_user_id
    and "User_AccessStatus" = 'active';

  if not public._multideck_dexter_has_permission(app_user."User_ID", 'Email.Read')
     or not public._multideck_dexter_has_permission(app_user."User_ID", 'Email.AIRead') then
    return jsonb_build_object('messages', '[]'::jsonb, 'sampleCount', 0);
  end if;

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted";
  if not found or quote_row."CusQuoteHeader_CustomerID" is null then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;

  with company_emails as materialized (
    select lower(btrim(email."OrgContactEmail_Email")) as address
    from public."Org_Contacts" contact
    join public."OrgContact_Emails" email
      on email."OrgContact_ID" = contact."OrgContact_ID"
     and email."OrgContactEmail_IsActive"
    where contact."Org_ID" = quote_row."CusQuoteHeader_CustomerID"
    union
    select lower(btrim(address."OrgAdd_MainEmail"))
    from public."Org_Addresses" address
    where address."Org_ID" = quote_row."CusQuoteHeader_CustomerID"
      and address."OrgAdd_IsActive"
      and nullif(btrim(address."OrgAdd_MainEmail"), '') is not null
    union
    select lower(btrim(quote_row."CusQuoteHeader_ContactEmailSnapshot"))
    where nullif(btrim(quote_row."CusQuoteHeader_ContactEmailSnapshot"), '') is not null
  ),
  permitted_mailboxes as materialized (
    select permitted.mailbox_id
    from public._multideck_dexter_email_mailboxes(app_user."User_ID", app_user."Company_ID") permitted
  ),
  selected as (
    select
      message."CommMessage_ID" as message_id,
      message."CommMessage_BodyText" as body_text,
      coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") as occurred_at
    from public."Comm_Messages" message
    join permitted_mailboxes permitted on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."Comm_ProviderConnections" connection on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
    where message."CommMessage_DirectionCode" = 'outbound'
      and not message."CommMessage_IsInbound"
      and message."CommMessage_StatusCode" in ('sent', 'delivered')
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsBodyRedacted"
      and nullif(btrim(message."CommMessage_BodyText"), '') is not null
      and char_length(btrim(message."CommMessage_BodyText")) between 40 and 12000
      and coalesce(message."CommMessage_MessageDate", message."CommMessage_SentAt", message."CommMessage_CreatedAt") >= now() - interval '12 months'
      and (
        (
          mailbox."CommMailbox_TypeCode" = 'personal'
          and mailbox."CommMailbox_UserID" = app_user."User_ID"
          and connection."CommConn_UserID" = app_user."User_ID"
        )
        or message."CommMessage_CreatedBy" = app_user."User_ID"
      )
      and (
        exists (
          select 1
          from public."Comm_MessageRecipients" recipient
          join company_emails company_email
            on company_email.address = lower(btrim(recipient."CommRecipient_NormalizedAddress"))
          where recipient."CommRecipient_MessageID" = message."CommMessage_ID"
            and recipient."CommRecipient_RecipientTypeCode" in ('to', 'cc')
            and recipient."CommRecipient_IsExternal"
            and not recipient."CommRecipient_IsSuppressed"
        )
        or exists (
          select 1 from public."Comm_Threads" thread
          where thread."CommThread_ID" = message."CommMessage_ThreadID"
            and thread."CommThread_CustomerOrgID" = quote_row."CusQuoteHeader_CustomerID"
            and not thread."CommThread_IsDeleted"
        )
      )
      and lower(coalesce(message."CommMessage_Subject", '') || ' ' || left(message."CommMessage_BodyText", 800)) !~
        '(automatic reply|auto.?reply|out of office|undeliverable|delivery status|mail delivery|do.?not.?reply|no.?reply|newsletter|unsubscribe|password reset|verification code|support ticket)'
    order by occurred_at desc nulls last, message."CommMessage_ID" desc
    limit take_count
  )
  select jsonb_build_object(
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'messageId', selected.message_id,
      'bodyText', selected.body_text,
      'occurredAt', selected.occurred_at
    ) order by selected.occurred_at desc, selected.message_id desc), '[]'::jsonb),
    'sampleCount', count(*)
  ) into result_value
  from selected;

  return coalesce(result_value, jsonb_build_object('messages', '[]'::jsonb, 'sampleCount', 0));
exception
  when no_data_found then
    raise exception 'The signed-in quote user could not be verified.' using errcode = '42501';
end;
$$;

create or replace function public.quote_workflow_mark_customer_response_delivery(
  requested_response_link_id uuid,
  requested_status text,
  requested_provider_id text default null,
  requested_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_status not in ('sent','failed') then
    raise exception 'Choose a valid quote delivery status.' using errcode = '22023';
  end if;
  update quote_api.customer_response_links set
    delivery_status_code = requested_status,
    delivery_provider_id = left(nullif(btrim(requested_provider_id), ''), 180),
    delivery_error = case when requested_status = 'failed' then left(nullif(btrim(requested_error), ''), 2000) else null end
  where response_link_id = requested_response_link_id;
  if not found then raise exception 'The quote response link was not found.' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function booking_api.has_permission(uuid,text) from public, anon, authenticated;
revoke all on function booking_api.allocate_reference(uuid,text) from public, anon, authenticated;
revoke all on function booking_api.normalise_direction(text) from public, anon, authenticated;
revoke all on function booking_api.normalise_mode(text) from public, anon, authenticated;
revoke all on function booking_api.quote_readiness(uuid) from public, anon, authenticated;
revoke all on function booking_api.open_booking(uuid,uuid,text) from public, anon, authenticated;
revoke all on function booking_api.convert_accepted_quote(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function quote_api.issue_customer_response(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function quote_api.revoke_customer_links_for_new_version() from public, anon, authenticated;
revoke all on function quote_api.customer_response_view(text,text) from public, anon, authenticated;
revoke all on function quote_api.submit_customer_response(text,text,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.booking_workflow_open(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.quote_workflow_readiness(uuid,uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_issue_customer_response(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.quote_customer_response_view(text,text) from public, anon, authenticated;
revoke all on function public.quote_customer_response_submit(text,text,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.quote_customer_response_upload_context(text,text) from public, anon, authenticated;
revoke all on function public.quote_workflow_recent_company_email_samples(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.quote_workflow_mark_customer_response_delivery(uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.booking_workflow_open(uuid,uuid,text) to service_role;
grant execute on function public.quote_workflow_readiness(uuid,uuid) to service_role;
grant execute on function public.quote_workflow_issue_customer_response(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.quote_customer_response_view(text,text) to service_role;
grant execute on function public.quote_customer_response_submit(text,text,text,text,uuid,text,text) to service_role;
grant execute on function public.quote_customer_response_upload_context(text,text) to service_role;
grant execute on function public.quote_workflow_recent_company_email_samples(uuid,uuid,integer) to service_role;
grant execute on function public.quote_workflow_mark_customer_response_delivery(uuid,text,text,text) to service_role;

insert into public."Comm_UserNotificationPreferences" (
  "CommNotifPref_UserID", "CommNotifPref_ChannelCode", "CommNotifPref_EventType",
  "CommNotifPref_IsEnabled", "CommNotifPref_DeliveryChannelsJSON", "CommNotifPref_QuietHoursJSON"
)
select app_user."User_ID", 'email', 'quote_response', true,
  jsonb_build_object('email', true, 'in_app', true), '{}'::jsonb
from public."cmp_Users" app_user
on conflict ("CommNotifPref_UserID", "CommNotifPref_ChannelCode", "CommNotifPref_EventType") do nothing;

create or replace view public."App_Live_Bookings" with (security_invoker = true) as
select
  j."Job_ID",
  coalesce(j."Job_BookingReference", 'MD-' || j."Job_Number")::text as "Booking_Reference",
  coalesce(c."Org_Name", 'Unassigned customer') as "Customer_Name",
  concat_ws(' → ', coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode"), coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode")) as "Route",
  coalesce(carrier."Org_Name", 'Carrier pending') as "Carrier",
  coalesce(cargo.description, 'Shipment details needed') as "Equipment",
  upper(coalesce(j."Job_TransportModeSummary", 'Mode needed')) as "Mode",
  case when coalesce(j."Job_Direction", 'unknown') = 'unknown' then 'Direction needed' else initcap(replace(j."Job_Direction", '_', ' ')) end as "Direction",
  coalesce(cargo.description, 'Shipment details needed') as "Shipment_Type",
  ''::text as "Value_Display",
  coalesce(to_char(j."Job_PredictedDeliveryAt", 'DD Mon · HH24:MI'), to_char(j."Job_RequiredDeliveryDate", 'DD Mon')) as "Eta_Display",
  coalesce(j."Job_CurrentLocationNameSnapshot", 'Planning') as "Time_Display",
  case
    when j."Job_Status" = 'draft' then 'Draft'
    when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'Exception'
    when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'Delayed'
    else 'On track'
  end as "Status",
  case when j."Job_ClosedDate" is not null then 100 when j."Job_TrackingStatus" = 'in_transit' then 62 when j."Job_TrackingStatus" = 'delayed' then 48 when j."Job_Status" = 'draft' then 8 else 24 end as "Progress",
  'OP'::text as "Owner_Code",
  case when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'red' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'amber' when j."Job_Status" = 'draft' then 'blue' else 'green' end as "Tone",
  ''::text as "Invoice_Reference",
  'JOB-' || j."Job_Number" as "Job_Reference",
  coalesce(c."Org_AccCode", '') as "Customer_Reference",
  ''::text as "Supplier_Reference",
  coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode", '') as "Origin",
  coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode", '') as "Destination",
  coalesce(r."JobRoute_TransportMeansName", r."JobRoute_Vessel", '') as "Vessel",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt")::date as "Departure_Date",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt")::date as "Arrival_Date",
  coalesce(r."JobRoute_VehicleRegistration", '') as "Vin",
  false as "Is_Favourite",
  jsonb_build_array(
    jsonb_build_object('label', 'Tracking', 'value', coalesce(j."Job_TrackingStatus", 'Planning')),
    jsonb_build_object('label', 'Source', 'value', case when j."Job_SourceQuoteID" is null then 'Direct booking' else 'Accepted quote' end)
  ) as "Custom_Fields",
  coalesce(j."Job_UpdatedAt", j."Job_CreatedDate"::timestamptz) as "Updated_At",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt") as "Departure_At",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt") as "Arrival_At"
from public."Job_Header" j
left join public."Org_Master" c on c."Org_id" = j."Job_Customer"
left join public."Org_Master" carrier on carrier."Org_id" = j."Job_Carrier"
left join lateral (
  select rr.* from public."Job_Routing" rr
  where rr."Job_ID" = j."Job_ID"
  order by rr."JobRoute_OrderNo" nulls last limit 1
) r on true
left join lateral (
  select max(cg."JobCargo_Description") as description
  from public."Job_Cargo" cg
  where cg."JobCargo_JobID" = j."Job_ID" and not coalesce(cg."JobCargo_IsDeleted", false)
) cargo on true
where not coalesce(j."Job_IsDeleted", false);

comment on column public."App_Live_Bookings"."Departure_At" is 'Full route departure timestamp for time-series analysis; operator date UI continues to use Departure_Date.';
comment on column public."App_Live_Bookings"."Arrival_At" is 'Full route arrival timestamp for time-series analysis; operator date UI continues to use Arrival_Date.';

commit;
