-- A newer accepted quote never silently overwrites an operational booking.
-- Build a field-by-field review, preserve operator changes as conflicts, and
-- apply only the fields the operator explicitly approves.

begin;

alter table public."Job_Header"
  add column if not exists "Job_PendingQuoteVersionID" uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null,
  add column if not exists "Job_PendingQuoteResponseID" uuid references quote_api.customer_responses(response_id) on delete set null,
  add column if not exists "Job_QuoteSyncStatus" varchar(30) not null default 'in_sync',
  add column if not exists "Job_QuoteSyncDetectedAt" timestamptz;

alter table public."Job_Header"
  drop constraint if exists "CK_Job_Header_QuoteSyncStatus",
  add constraint "CK_Job_Header_QuoteSyncStatus"
    check ("Job_QuoteSyncStatus" in ('in_sync', 'out_of_sync', 'partially_applied'));

create index if not exists "IX_Job_Header_pending_quote_version"
  on public."Job_Header" ("Job_PendingQuoteVersionID")
  where "Job_PendingQuoteVersionID" is not null;

create index if not exists "IX_CusQuote_Versions_submitted_by"
  on public."CusQuote_Versions" ("CusQuoteVersion_SubmittedBy")
  where "CusQuoteVersion_SubmittedBy" is not null;

create table if not exists booking_api.quote_sync_reviews (
  review_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  job_id uuid not null references public."Job_Header"("Job_ID") on delete cascade,
  quote_id uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  applied_version_id uuid references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete set null,
  proposed_version_id uuid not null references public."CusQuote_Versions"("CusQuoteVersion_ID") on delete restrict,
  proposed_response_id uuid references quote_api.customer_responses(response_id) on delete set null,
  status_code varchar(30) not null default 'pending'
    check (status_code in ('pending', 'partially_applied', 'applied', 'superseded')),
  baseline_snapshot jsonb not null default '{}'::jsonb,
  proposed_snapshot jsonb not null default '{}'::jsonb,
  booking_snapshot jsonb not null default '{}'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  applied_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public."cmp_Users"("User_ID") on delete set null,
  decided_at timestamptz,
  decided_by uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint quote_sync_reviews_json check (
    jsonb_typeof(baseline_snapshot) = 'object'
    and jsonb_typeof(proposed_snapshot) = 'object'
    and jsonb_typeof(booking_snapshot) = 'object'
    and jsonb_typeof(differences) = 'array'
    and jsonb_typeof(applied_fields) = 'array'
  )
);

create unique index if not exists "UX_booking_quote_sync_review_active"
  on booking_api.quote_sync_reviews (job_id)
  where status_code in ('pending', 'partially_applied');

create index if not exists "IX_booking_quote_sync_review_quote_version"
  on booking_api.quote_sync_reviews (quote_id, proposed_version_id, created_at desc);

revoke all on table booking_api.quote_sync_reviews from public, anon, authenticated;
grant select, insert, update on table booking_api.quote_sync_reviews to service_role;

create or replace function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source as (
    select
      coalesce(snapshot->'quote', '{}'::jsonb) as quote,
      coalesce(snapshot#>'{quote,shipmentFacts}', '{}'::jsonb) as facts
  )
  select jsonb_build_object(
    'direction', nullif(lower(btrim(quote->>'direction')), ''),
    'mode', booking_api.normalise_mode(quote->>'mode'),
    'shipmentType', nullif(btrim(quote->>'shipmentType'), ''),
    'serviceLevel', nullif(btrim(quote->>'serviceLevel'), ''),
    'carrier', jsonb_build_object('id', nullif(quote->>'carrierId', ''), 'name', nullif(btrim(quote->>'carrierName'), '')),
    'supplier', jsonb_build_object('id', nullif(quote->>'supplierId', ''), 'name', nullif(btrim(quote->>'supplierName'), '')),
    'origin', nullif(btrim(quote->>'loadingPoint'), ''),
    'destination', nullif(btrim(quote->>'dischargePoint'), ''),
    'collectionAddress', nullif(btrim(quote->>'collectionAddress'), ''),
    'deliveryAddress', nullif(btrim(quote->>'deliveryAddress'), ''),
    'incoterm', nullif(upper(btrim(quote->>'incoterm')), ''),
    'incotermLocation', nullif(btrim(facts->>'namedPlace'), ''),
    'estimatedDeparture', nullif(btrim(facts->>'estimatedDeparture'), ''),
    'estimatedArrival', nullif(btrim(facts->>'estimatedArrival'), ''),
    'customerNotes', nullif(btrim(quote->>'customerNotes'), ''),
    'terms', nullif(btrim(quote->>'terms'), ''),
    'subjectToTerms', nullif(btrim(facts->>'subjectToTerms'), ''),
    'shipper', quote->'shipper',
    'consignee', quote->'consignee',
    'cargo', jsonb_build_object(
      'description', nullif(btrim(coalesce(facts->>'knownCargo', facts->>'commodity')), ''),
      'packageQuantity', nullif(coalesce(facts->>'packageQuantity', facts->>'pieces'), ''),
      'packageType', nullif(btrim(facts->>'packageType'), ''),
      'grossWeightKg', nullif(facts->>'grossWeightKg', ''),
      'netWeightKg', nullif(facts->>'netWeightKg', ''),
      'volumeCbm', nullif(facts->>'volumeCbm', ''),
      'goodsValue', nullif(regexp_replace(coalesce(facts->>'goodsValue', ''), '[^0-9.-]', '', 'g'), ''),
      'goodsValueCurrency', nullif(upper(btrim(coalesce(facts->>'goodsValueCurrency', quote->>'currency'))), '')
    ),
    'equipment', nullif(btrim(coalesce(facts->>'container', facts->>'equipment')), ''),
    'charges', coalesce(quote->'charges', '[]'::jsonb)
  )
  from source
$$;

create or replace function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'direction', nullif(lower(btrim(job."Job_Direction")), ''),
    'mode', booking_api.normalise_mode(job."Job_TransportModeSummary"),
    'shipmentType', nullif(btrim(job."Job_EditableDetailsJSON"->>'shipmentType'), ''),
    'serviceLevel', nullif(btrim(route."JobRoute_ServiceLevel"), ''),
    'carrier', jsonb_build_object('id', job."Job_Carrier", 'name', carrier."Org_Name"),
    'supplier', jsonb_build_object('id', job."Job_Supplier", 'name', supplier."Org_Name"),
    'origin', nullif(btrim(coalesce(job."Job_OriginUNLocode", job."Job_OriginNameSnapshot")), ''),
    'destination', nullif(btrim(coalesce(job."Job_DestinationUNLocode", job."Job_DestinationNameSnapshot")), ''),
    'collectionAddress', nullif(btrim(job."Job_CollectionAddress"), ''),
    'deliveryAddress', nullif(btrim(job."Job_DeliveryAddress"), ''),
    'incoterm', nullif(upper(btrim(job."Job_IncotermsCode")), ''),
    'incotermLocation', nullif(btrim(job."Job_IncotermsLocation"), ''),
    'estimatedDeparture', to_char(coalesce(route."JobRoute_PlannedDepartureAt"::date, job."Job_ReadyDate"), 'YYYY-MM-DD'),
    'estimatedArrival', to_char(coalesce(route."JobRoute_PlannedArrivalAt"::date, job."Job_RequiredDeliveryDate"), 'YYYY-MM-DD'),
    'customerNotes', nullif(btrim(coalesce(job."Job_CustomerNotes", job."Job_EditableDetailsJSON"->>'customerNotes')), ''),
    'terms', nullif(btrim(coalesce(job."Job_TermsConditions", job."Job_EditableDetailsJSON"->>'termsAndConditions')), ''),
    'subjectToTerms', nullif(btrim(coalesce(job."Job_SubjectToTerms", job."Job_EditableDetailsJSON"->>'subjectToTerms')), ''),
    'shipper', shipper.party,
    'consignee', consignee.party,
    'cargo', cargo.cargo,
    'equipment', container.equipment,
    'charges', coalesce(charges.lines, '[]'::jsonb)
  )
  from public."Job_Header" job
  left join public."Org_Master" carrier on carrier."Org_id" = job."Job_Carrier"
  left join public."Org_Master" supplier on supplier."Org_id" = job."Job_Supplier"
  left join lateral (
    select route.* from public."Job_Routing" route
    where route."Job_ID" = job."Job_ID"
    order by route."JobRoute_IsMainCarriage" desc, route."JobRoute_OrderNo" nulls last
    limit 1
  ) route on true
  left join lateral (
    select jsonb_build_object(
      'orgId', party."JobParty_OrgID", 'name', party."JobParty_NameSnapshot",
      'address', party."JobParty_AddressSnapshot", 'contact', party."JobParty_ContactNameSnapshot"
    ) as party
    from public."Job_Parties" party
    where party."JobParty_JobID"=job."Job_ID" and party."JobParty_Role"='shipper'
    order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence"
    limit 1
  ) shipper on true
  left join lateral (
    select jsonb_build_object(
      'orgId', party."JobParty_OrgID", 'name', party."JobParty_NameSnapshot",
      'address', party."JobParty_AddressSnapshot", 'contact', party."JobParty_ContactNameSnapshot"
    ) as party
    from public."Job_Parties" party
    where party."JobParty_JobID"=job."Job_ID" and party."JobParty_Role"='consignee'
    order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence"
    limit 1
  ) consignee on true
  left join lateral (
    select jsonb_build_object(
      'description', item."JobCargo_Description",
      'packageQuantity', item."JobCargo_PackageQty",
      'packageType', item."JobCargo_PackageTypeCodeSnapshot",
      'grossWeightKg', item."JobCargo_GrossKilos",
      'netWeightKg', item."JobCargo_NettKilos",
      'volumeCbm', item."JobCargo_VolumeCBM",
      'goodsValue', item."JobCargo_DeclaredValueAmount",
      'goodsValueCurrency', item."JobCargo_DeclaredValueCurrencyCodeSnapshot"
    ) as cargo
    from public."Job_Cargo" item
    where item."JobCargo_JobID"=job."Job_ID" and not item."JobCargo_IsDeleted"
    order by item."JobCargo_LineNo" nulls last
    limit 1
  ) cargo on true
  left join lateral (
    select item."JobContainer_TypeCodeSnapshot" as equipment
    from public."Job_Containers" item
    where item."Job_ID"=job."Job_ID" and not item."JobContainer_IsDeleted"
    order by item."JobContainer_CreatedAt"
    limit 1
  ) container on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'supplierId', line."JobCostingLine_SupplierID",
      'description', line."JobCostingLine_Description",
      'internalNotes', line."JobCostingLine_InternalNotes",
      'customerNotes', line."JobCostingLine_CustomerNotes",
      'costRoe', line."JobCostingLine_CostROE",
      'costAmount', line."JobCostingLine_CostAmountCurrency",
      'costLocal', line."JobCostingLine_CostAmountLocal",
      'sellRoe', line."JobCostingLine_RevenueROE",
      'sellAmount', line."JobCostingLine_RevenueAmountCurrency",
      'sellLocal', line."JobCostingLine_RevenueAmountLocal",
      'showToCustomer', line."JobCostingLine_ShowToCustomer"
    ) order by line."JobCostingLine_Number") as lines
    from public."Job_Costing_Lines" line
    where line."Job_ID"=job."Job_ID"
  ) charges on true
  where job."Job_ID"=requested_job_id and not job."Job_IsDeleted"
$$;

create or replace function booking_api.quote_sync_differences(
  baseline jsonb,
  booking jsonb,
  proposed jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with fields(order_no, field_key, label, section_name) as (values
    (1,'direction','Direction','Job data'), (2,'mode','Mode','Job data'),
    (3,'shipmentType','Shipment type','Service'), (4,'serviceLevel','Service level','Service'),
    (5,'carrier','Carrier','Carrier & supplier'), (6,'supplier','Supplier','Carrier & supplier'),
    (7,'origin','Origin','Route & service'), (8,'destination','Destination','Route & service'),
    (9,'collectionAddress','Collection address','Route & service'), (10,'deliveryAddress','Delivery address','Route & service'),
    (11,'incoterm','Incoterm','Route & service'), (12,'incotermLocation','Named place','Route & service'),
    (13,'estimatedDeparture','ETD','Route & service'), (14,'estimatedArrival','ETA','Route & service'),
    (15,'shipper','Shipper','Parties'), (16,'consignee','Consignee','Parties'),
    (17,'cargo','Goods','Goods'), (18,'equipment','Equipment / container','Goods'),
    (19,'customerNotes','Customer notes','Customer terms'), (20,'terms','Terms and conditions','Customer terms'),
    (21,'subjectToTerms','Subject to terms','Customer terms'), (22,'charges','Quote charges','Financials')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', field_key,
    'label', label,
    'section', section_name,
    'previousQuoteValue', baseline->field_key,
    'bookingValue', booking->field_key,
    'newQuoteValue', proposed->field_key,
    'bookingChanged', (booking->field_key) is distinct from (baseline->field_key),
    'conflict', (booking->field_key) is distinct from (baseline->field_key)
      and (booking->field_key) is distinct from (proposed->field_key),
    'recommendation', case
      when (booking->field_key) is distinct from (baseline->field_key)
       and (booking->field_key) is distinct from (proposed->field_key) then 'review'
      else 'apply'
    end
  ) order by order_no), '[]'::jsonb)
  from fields
  where (proposed->field_key) is distinct from (baseline->field_key)
$$;

alter function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  rename to convert_accepted_quote_before_sync_review_20260904;

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
  existing_job record;
  quote_row record;
  version_row record;
  company_id uuid;
  actor_user_id uuid;
  baseline jsonb;
  proposed jsonb;
  booking_snapshot jsonb;
  differences jsonb;
  review_id_value uuid;
  owner_user_id uuid;
begin
  select job.* into existing_job
  from public."Job_Header" job
  where job."Job_SourceQuoteID"=requested_quote_id and not job."Job_IsDeleted"
  order by job."Job_CreatedDate"
  limit 1
  for update;

  if not found then
    return booking_api.convert_accepted_quote_before_sync_review_20260904(
      requested_quote_id, requested_actor_user_id, requested_response_id
    );
  end if;

  select quote.* into strict quote_row
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID"=requested_quote_id
    and quote."CusQuoteHeader_LifecycleCode"='accepted'
    and not quote."CusQuoteHeader_IsDeleted";

  select version.* into strict version_row
  from public."CusQuote_Versions" version
  where version."CusQuoteVersion_ID"=quote_row."CusQuoteHeader_AcceptedVersionID"
    and version."CusQuoteHeader_ID"=requested_quote_id;

  if existing_job."Job_SourceQuoteVersionID" = version_row."CusQuoteVersion_ID" then
    if requested_response_id is not null and existing_job."Job_SourceQuoteResponseID" is null then
      update public."Job_Header" set "Job_SourceQuoteResponseID"=requested_response_id, "Job_UpdatedAt"=now()
      where "Job_ID"=existing_job."Job_ID";
    end if;
    return jsonb_build_object(
      'jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference",
      'status', existing_job."Job_Status", 'requiresCustomerLink', existing_job."Job_Customer" is null,
      'reused', true, 'outOfSync', false
    );
  end if;

  select office."Company_ID" into strict company_id
  from public."cmp_Offices" office
  where office."Office_ID"=coalesce(existing_job."Job_OrgOfficeID", existing_job."Job_OfficeID");
  actor_user_id := coalesce(requested_actor_user_id, quote_row."CusQuoteHeader_SalesOwnerID", quote_row."CusQuoteHeader_LastEditedBy", quote_row."CusQuoteHeader_CreatedBy");
  baseline := booking_api.quote_sync_projection(coalesce(existing_job."Job_SourceSnapshotJSON"->'acceptedSnapshot', '{}'::jsonb));
  proposed := booking_api.quote_sync_projection(version_row."CusQuoteVersion_SnapshotJSON");
  booking_snapshot := booking_api.current_quote_sync_projection(existing_job."Job_ID");
  differences := booking_api.quote_sync_differences(baseline, booking_snapshot, proposed);

  update booking_api.quote_sync_reviews
  set status_code='superseded', decided_at=now(), decided_by=actor_user_id
  where job_id=existing_job."Job_ID" and status_code in ('pending','partially_applied');

  if jsonb_array_length(differences)=0 then
    update public."Job_Header" set
      "Job_SourceQuoteVersionID"=version_row."CusQuoteVersion_ID",
      "Job_SourceQuoteResponseID"=requested_response_id,
      "Job_PendingQuoteVersionID"=null,
      "Job_PendingQuoteResponseID"=null,
      "Job_QuoteSyncStatus"='in_sync',
      "Job_QuoteSyncDetectedAt"=null,
      "Job_SourceSnapshotJSON"="Job_SourceSnapshotJSON" || jsonb_build_object('acceptedSnapshot', version_row."CusQuoteVersion_SnapshotJSON"),
      "Job_UpdatedAt"=now()
    where "Job_ID"=existing_job."Job_ID";
  else
    insert into booking_api.quote_sync_reviews (
      company_id, job_id, quote_id, applied_version_id, proposed_version_id,
      proposed_response_id, baseline_snapshot, proposed_snapshot, booking_snapshot,
      differences, created_by
    ) values (
      company_id, existing_job."Job_ID", requested_quote_id, existing_job."Job_SourceQuoteVersionID",
      version_row."CusQuoteVersion_ID", requested_response_id, baseline, proposed,
      booking_snapshot, differences, actor_user_id
    ) returning review_id into review_id_value;

    update public."Job_Header" set
      "Job_PendingQuoteVersionID"=version_row."CusQuoteVersion_ID",
      "Job_PendingQuoteResponseID"=requested_response_id,
      "Job_QuoteSyncStatus"='out_of_sync',
      "Job_QuoteSyncDetectedAt"=now(),
      "Job_UpdatedAt"=now()
    where "Job_ID"=existing_job."Job_ID";

    owner_user_id := coalesce(existing_job."Job_OperationsOwnerID", existing_job."Job_CreatedBy", actor_user_id);
    if owner_user_id is not null then
      insert into public."Comm_Notifications" (
        "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
        "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
      ) values (
        owner_user_id,
        existing_job."Job_BookingReference" || ' has an accepted quote update',
        'Review the newer accepted quote before applying any changes to this booking.',
        'Job_Header', existing_job."Job_ID", 'booking_quote_sync',
        jsonb_build_object(
          'event_type','booking_quote_sync','action_url','/bookings/' || lower(existing_job."Job_BookingReference"),
          'action_label','Review booking','review_id',review_id_value,
          'quote_id',requested_quote_id,'quote_version_id',version_row."CusQuoteVersion_ID"
        ), actor_user_id
      );
    end if;
  end if;

  insert into booking_api.events (company_id, job_id, event_type, summary, metadata, actor_user_id)
  values (
    company_id, existing_job."Job_ID",
    case when jsonb_array_length(differences)=0 then 'quote_version_reconciled' else 'quote_update_available' end,
    case when jsonb_array_length(differences)=0
      then 'A newer accepted quote contained no booking changes and was recorded as the applied version.'
      else 'A newer accepted quote is ready for field-by-field review.' end,
    jsonb_build_object(
      'quoteId',requested_quote_id,'previousVersionId',existing_job."Job_SourceQuoteVersionID",
      'proposedVersionId',version_row."CusQuoteVersion_ID",'responseId',requested_response_id,
      'reviewId',review_id_value,'differences',differences
    ), actor_user_id
  );

  return jsonb_build_object(
    'jobId', existing_job."Job_ID", 'bookingReference', existing_job."Job_BookingReference",
    'status', existing_job."Job_Status", 'requiresCustomerLink', existing_job."Job_Customer" is null,
    'reused', true, 'outOfSync', jsonb_array_length(differences)>0,
    'quoteSyncReviewId', review_id_value
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'The accepted quote or booking workspace is incomplete.' using errcode='P0002';
end;
$$;

create or replace function public.booking_workflow_quote_sync_review(
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
  review_row record;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode='42501';
  end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users"
  where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select review.* into review_row
  from booking_api.quote_sync_reviews review
  where review.job_id=requested_job_id and review.company_id=app_user."Company_ID"
    and review.status_code in ('pending','partially_applied')
  order by review.created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'reviewId',review_row.review_id,'jobId',review_row.job_id,'quoteId',review_row.quote_id,
    'appliedVersionId',review_row.applied_version_id,'proposedVersionId',review_row.proposed_version_id,
    'status',review_row.status_code,'differences',review_row.differences,
    'appliedFields',review_row.applied_fields,'createdAt',review_row.created_at
  );
exception when no_data_found or too_many_rows then
  raise exception 'Your workspace identity is incomplete.' using errcode='42501';
end;
$$;

revoke all on function booking_api.quote_sync_projection(jsonb) from public, anon, authenticated;
revoke all on function booking_api.current_quote_sync_projection(uuid) from public, anon, authenticated;
revoke all on function booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function booking_api.convert_accepted_quote(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.booking_workflow_quote_sync_review(uuid,uuid) from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid,uuid,uuid) to service_role;
grant execute on function public.booking_workflow_quote_sync_review(uuid,uuid) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Canonical freight bookings, including accepted-quote provenance, applied quote version and any operator-reviewable newer accepted quote. Applying a quote update is approval-only and must use the Booking Details review.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='bookings';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Freight booking summary status, route, delivery, ownership, risk, job-related Customs handoff and newer accepted quote review availability. Quote updates require operator approval.',
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='bookings';

commit;
