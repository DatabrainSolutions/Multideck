-- Correct quote-to-booking apply semantics after the initial live rollout.
-- Preserve non-quote booking parties and only emit validated UN/LOCODE values.

begin;

create or replace function public.booking_workflow_apply_quote_sync(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_review_id uuid,
  requested_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  job_row record;
  review_row record;
  version_snapshot jsonb;
  proposed jsonb;
  current_parties jsonb;
  save_payload jsonb := '{}'::jsonb;
  selected_fields jsonb;
  combined_fields jsonb;
  remaining_count integer;
  before_snapshot jsonb;
  after_snapshot jsonb;
  charge jsonb;
  charge_number integer := 0;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode='42501';
  end if;
  if requested_fields is null or jsonb_typeof(requested_fields)<>'array'
     or jsonb_array_length(requested_fields)=0 or jsonb_array_length(requested_fields)>30 then
    raise exception 'Choose at least one quote field to apply.' using errcode='22023';
  end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users"
  where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select job.* into strict job_row
  from public."Job_Header" job
  join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
  where job."Job_ID"=requested_job_id and office."Company_ID"=app_user."Company_ID"
    and not job."Job_IsDeleted" for update;
  select review.* into strict review_row
  from booking_api.quote_sync_reviews review
  where review.review_id=requested_review_id and review.job_id=requested_job_id
    and review.company_id=app_user."Company_ID" and review.status_code in ('pending','partially_applied')
  for update;

  select coalesce(jsonb_agg(distinct item.value),'[]'::jsonb) into selected_fields
  from jsonb_array_elements(requested_fields) item
  where jsonb_typeof(item.value)='string';
  if jsonb_array_length(selected_fields)<>jsonb_array_length(requested_fields)
     or exists (
       select 1 from jsonb_array_elements_text(selected_fields) field_name
       where not exists (
         select 1 from jsonb_array_elements(review_row.differences) difference
         where difference->>'key'=field_name
       )
     ) then
    raise exception 'One or more selected quote fields are not available for this review.' using errcode='22023';
  end if;
  if selected_fields ? 'charges'
     and not booking_api.has_permission(caller_auth_user_id,'Finance.Management.Prepare') then
    raise exception 'Financial quote changes require finance preparation access.' using errcode='42501';
  end if;

  proposed := review_row.proposed_snapshot;
  before_snapshot := booking_api.current_quote_sync_projection(requested_job_id);

  if selected_fields ? 'direction' then save_payload := save_payload || jsonb_build_object('direction',proposed->>'direction'); end if;
  if selected_fields ? 'mode' then save_payload := save_payload || jsonb_build_object('mode',proposed->>'mode'); end if;
  if selected_fields ? 'carrier' then save_payload := save_payload || jsonb_build_object('carrierId',proposed#>>'{carrier,id}'); end if;
  if selected_fields ? 'supplier' then save_payload := save_payload || jsonb_build_object('supplierId',proposed#>>'{supplier,id}'); end if;
  if selected_fields ? 'origin' then
    save_payload := save_payload || jsonb_build_object('origin',proposed->>'origin');
    if proposed->>'origin' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then
      save_payload := save_payload || jsonb_build_object('originUnlocode',upper(proposed->>'origin'));
    end if;
  end if;
  if selected_fields ? 'destination' then
    save_payload := save_payload || jsonb_build_object('destination',proposed->>'destination');
    if proposed->>'destination' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then
      save_payload := save_payload || jsonb_build_object('destinationUnlocode',upper(proposed->>'destination'));
    end if;
  end if;
  if selected_fields ? 'collectionAddress' then save_payload := save_payload || jsonb_build_object('collectionAddress',proposed->>'collectionAddress'); end if;
  if selected_fields ? 'deliveryAddress' then save_payload := save_payload || jsonb_build_object('deliveryAddress',proposed->>'deliveryAddress'); end if;
  if selected_fields ? 'incoterm' then save_payload := save_payload || jsonb_build_object('incoterm',proposed->>'incoterm'); end if;
  if selected_fields ? 'incotermLocation' then save_payload := save_payload || jsonb_build_object('incotermLocation',proposed->>'incotermLocation'); end if;
  if selected_fields ? 'estimatedDeparture' then save_payload := save_payload || jsonb_build_object('readyDate',proposed->>'estimatedDeparture'); end if;
  if selected_fields ? 'estimatedArrival' then save_payload := save_payload || jsonb_build_object('requiredDeliveryDate',proposed->>'estimatedArrival'); end if;

  if selected_fields ?| array['shipmentType','customerNotes','terms','subjectToTerms'] then
    save_payload := save_payload || jsonb_build_object('editableDetails',jsonb_strip_nulls(jsonb_build_object(
      'shipmentType',case when selected_fields ? 'shipmentType' then proposed->>'shipmentType' end,
      'customerNotes',case when selected_fields ? 'customerNotes' then proposed->>'customerNotes' end,
      'termsAndConditions',case when selected_fields ? 'terms' then proposed->>'terms' end,
      'subjectToTerms',case when selected_fields ? 'subjectToTerms' then proposed->>'subjectToTerms' end
    )));
  end if;
  if selected_fields ? 'customerNotes' then update public."Job_Header" set "Job_CustomerNotes"=proposed->>'customerNotes' where "Job_ID"=requested_job_id; end if;
  if selected_fields ? 'terms' then update public."Job_Header" set "Job_TermsConditions"=proposed->>'terms' where "Job_ID"=requested_job_id; end if;
  if selected_fields ? 'subjectToTerms' then update public."Job_Header" set "Job_SubjectToTerms"=proposed->>'subjectToTerms' where "Job_ID"=requested_job_id; end if;

  if selected_fields ?| array['origin','destination','collectionAddress','deliveryAddress','serviceLevel','estimatedDeparture','estimatedArrival','carrier','mode'] then
    save_payload := save_payload || jsonb_build_object('route',jsonb_strip_nulls(jsonb_build_object(
      'origin',case when selected_fields ? 'origin' then proposed->>'origin' end,
      'originUnlocode',case when selected_fields ? 'origin' and proposed->>'origin' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'origin') end,
      'originAddress',case when selected_fields ? 'collectionAddress' then proposed->>'collectionAddress' end,
      'destination',case when selected_fields ? 'destination' then proposed->>'destination' end,
      'destinationUnlocode',case when selected_fields ? 'destination' and proposed->>'destination' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'destination') end,
      'destinationAddress',case when selected_fields ? 'deliveryAddress' then proposed->>'deliveryAddress' end,
      'serviceLevel',case when selected_fields ? 'serviceLevel' then proposed->>'serviceLevel' end,
      'plannedDepartureAt',case when selected_fields ? 'estimatedDeparture' then proposed->>'estimatedDeparture' end,
      'plannedArrivalAt',case when selected_fields ? 'estimatedArrival' then proposed->>'estimatedArrival' end,
      'carrierId',case when selected_fields ? 'carrier' then proposed#>>'{carrier,id}' end,
      'mode',case when selected_fields ? 'mode' then proposed->>'mode' end
    )));
  end if;

  if selected_fields ?| array['shipper','consignee'] then
    -- save_booking replaces the complete party list. Preserve every operational
    -- party and replace only the primary quote-controlled shipper/consignee.
    select coalesce(jsonb_agg(party_payload order by role_code, sequence_no, party_id),'[]'::jsonb)
    into current_parties
    from (
      select
        party."JobParty_ID" as party_id,
        party."JobParty_Role" as role_code,
        party."JobParty_Sequence" as sequence_no,
        jsonb_strip_nulls(jsonb_build_object(
          'role',party."JobParty_Role",'organisationId',party."JobParty_OrgID",'addressId',party."JobParty_AddressID",
          'contactId',party."JobParty_ContactID",'sequence',party."JobParty_Sequence",'name',party."JobParty_NameSnapshot",
          'address',party."JobParty_AddressSnapshot",'contactName',party."JobParty_ContactNameSnapshot",
          'email',party."JobParty_EmailSnapshot",'phone',party."JobParty_PhoneSnapshot",
          'countryCode',party."JobParty_CountryCodeSnapshot",'identifierType',party."JobParty_IdentifierType",
          'identifierValue',party."JobParty_IdentifierValueSnapshot",'isPrimary',party."JobParty_IsPrimary"
        )) as party_payload,
        row_number() over (
          partition by party."JobParty_Role"
          order by party."JobParty_IsPrimary" desc, party."JobParty_Sequence", party."JobParty_ID"
        ) as role_rank
      from public."Job_Parties" party
      where party."JobParty_JobID"=requested_job_id
    ) existing_party
    where not (
      role_rank=1 and (
        (selected_fields ? 'shipper' and role_code='shipper')
        or (selected_fields ? 'consignee' and role_code='consignee')
      )
    );
    if selected_fields ? 'shipper' and proposed->'shipper' is not null then
      current_parties := current_parties || jsonb_build_array(jsonb_build_object(
        'role','shipper','organisationId',proposed#>>'{shipper,orgId}','name',proposed#>>'{shipper,name}',
        'address',proposed#>>'{shipper,address}','contactName',proposed#>>'{shipper,contact}','sequence',1,'isPrimary',true));
    end if;
    if selected_fields ? 'consignee' and proposed->'consignee' is not null then
      current_parties := current_parties || jsonb_build_array(jsonb_build_object(
        'role','consignee','organisationId',proposed#>>'{consignee,orgId}','name',proposed#>>'{consignee,name}',
        'address',proposed#>>'{consignee,address}','contactName',proposed#>>'{consignee,contact}','sequence',1,'isPrimary',true));
    end if;
    save_payload := save_payload || jsonb_build_object('parties',current_parties);
  end if;

  if selected_fields ? 'cargo' then
    save_payload := save_payload || jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object(
      'description',proposed#>>'{cargo,description}','packageQuantity',proposed#>>'{cargo,packageQuantity}',
      'packageType',proposed#>>'{cargo,packageType}','grossWeightKg',proposed#>>'{cargo,grossWeightKg}',
      'netWeightKg',proposed#>>'{cargo,netWeightKg}','volumeCbm',proposed#>>'{cargo,volumeCbm}',
      'declaredValue',proposed#>>'{cargo,goodsValue}','declaredValueCurrency',proposed#>>'{cargo,goodsValueCurrency}'
    )));
  end if;
  if selected_fields ? 'equipment' and proposed->>'mode' in ('sea','ocean') then
    save_payload := save_payload || jsonb_build_object('containers',jsonb_build_array(jsonb_build_object(
      'type',proposed->>'equipment','equipmentKind','container','status','planned',
      'data',jsonb_build_object('source','accepted_quote_update','quoteVersionId',review_row.proposed_version_id)
    )));
  end if;

  perform booking_api.save_booking(caller_auth_user_id,requested_job_id,save_payload);
  perform booking_api.save_booking_detail_fields(caller_auth_user_id,requested_job_id,save_payload);
  if selected_fields ? 'cargo' then perform booking_api.save_booking_cargo_measurements(caller_auth_user_id,requested_job_id,save_payload); end if;

  if selected_fields ? 'charges' then
    delete from public."Job_Costing_Lines" where "Job_ID"=requested_job_id;
    for charge in select value from jsonb_array_elements(coalesce(proposed->'charges','[]'::jsonb)) loop
      charge_number := charge_number+1;
      insert into public."Job_Costing_Lines" (
        "Job_ID","JobCostingLine_Number","JobCostingLine_SupplierID","JobCostingLine_Description",
        "JobCostingLine_InternalNotes","JobCostingLine_CustomerNotes","JobCostingLine_CostROE",
        "JobCostingLine_CostAmountCurrency","JobCostingLine_CostAmountLocal","JobCostingLine_RevenueROE",
        "JobCostingLine_RevenueAmountCurrency","JobCostingLine_RevenueAmountLocal","JobCostingLine_ShowToCustomer",
        "JobCostingLine_CreatedBy","JobCostingLine_UpdatedBy","JobCostingLine_SourceTable","JobCostingLine_SourceID","JobCostingLine_SourceMetadataJSON"
      ) values (
        requested_job_id,charge_number,nullif(charge->>'supplierId','')::uuid,left(coalesce(nullif(btrim(charge->>'description'),''),'Charge'),240),
        nullif(charge->>'internalNotes',''),nullif(charge->>'customerNotes',''),greatest(coalesce(nullif(charge->>'costRoe','')::numeric,1),0.00001),
        coalesce(nullif(charge->>'costAmount','')::numeric,0),coalesce(nullif(charge->>'costLocal','')::numeric,0),
        greatest(coalesce(nullif(charge->>'sellRoe','')::numeric,1),0.00001),coalesce(nullif(charge->>'sellAmount','')::numeric,0),
        coalesce(nullif(charge->>'sellLocal','')::numeric,0),coalesce((charge->>'showToCustomer')::boolean,true),
        app_user."User_ID",app_user."User_ID",'CusQuote_Versions',review_row.proposed_version_id,
        jsonb_build_object('source','accepted_quote_update','reviewId',requested_review_id)
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into combined_fields
  from jsonb_array_elements(review_row.applied_fields || selected_fields);
  select count(*) into remaining_count
  from jsonb_array_elements(review_row.differences) difference
  where not combined_fields ? (difference->>'key');
  after_snapshot := booking_api.current_quote_sync_projection(requested_job_id);

  update booking_api.quote_sync_reviews set
    applied_fields=combined_fields,status_code=case when remaining_count=0 then 'applied' else 'partially_applied' end,
    decided_at=case when remaining_count=0 then now() else decided_at end,
    decided_by=app_user."User_ID"
  where review_id=requested_review_id;

  if remaining_count=0 then
    select version."CusQuoteVersion_SnapshotJSON" into strict version_snapshot
    from public."CusQuote_Versions" version where version."CusQuoteVersion_ID"=review_row.proposed_version_id;
    update public."Job_Header" set
      "Job_SourceQuoteVersionID"=review_row.proposed_version_id,
      "Job_SourceQuoteResponseID"=review_row.proposed_response_id,
      "Job_PendingQuoteVersionID"=null,"Job_PendingQuoteResponseID"=null,
      "Job_QuoteSyncStatus"='in_sync',"Job_QuoteSyncDetectedAt"=null,
      "Job_SourceSnapshotJSON"="Job_SourceSnapshotJSON" || jsonb_build_object('acceptedSnapshot',version_snapshot),
      "Job_UpdatedAt"=now(),"Job_UpdatedBy"=app_user."User_ID"
    where "Job_ID"=requested_job_id;
  else
    update public."Job_Header" set "Job_QuoteSyncStatus"='partially_applied',"Job_UpdatedAt"=now(),"Job_UpdatedBy"=app_user."User_ID"
    where "Job_ID"=requested_job_id;
  end if;

  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
  values(app_user."Company_ID",requested_job_id,
    case when remaining_count=0 then 'quote_update_applied' else 'quote_update_partially_applied' end,
    case when remaining_count=0 then 'The newer accepted quote was applied to the booking.' else 'Selected fields from the newer accepted quote were applied.' end,
    jsonb_build_object('reviewId',requested_review_id,'quoteVersionId',review_row.proposed_version_id,
      'appliedFields',selected_fields,'before',before_snapshot,'after',after_snapshot,'remainingFields',remaining_count),
    app_user."User_ID");

  return jsonb_build_object('reviewId',requested_review_id,'status',case when remaining_count=0 then 'applied' else 'partially_applied' end,
    'appliedFields',combined_fields,'remainingFields',remaining_count,
    'workspace',booking_api.workspace_with_document_groups(caller_auth_user_id,job_row."Job_BookingReference"));
exception when no_data_found or too_many_rows then
  raise exception 'The quote update review is unavailable in this workspace.' using errcode='P0002';
end;
$$;

revoke all on function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb) to service_role;

commit;
