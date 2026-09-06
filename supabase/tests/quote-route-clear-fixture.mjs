// Legacy A-B quotes still use individual review fields, not a bundled route plan.
// Execute the real review/apply/read chain; the parent supplies identity fixtures.
export const quoteRouteClearAssertions = `
do $route_clear$
declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
  carrier uuid:=gen_random_uuid(); q uuid; v1 uuid; v2 uuid; job uuid; review_id uuid;
  snapshot jsonb; proposed jsonb; baseline jsonb; review jsonb; result jsonb;
  before_route jsonb; after_route jsonb; expected jsonb; item record; blank jsonb;
  before_apply jsonb; applied_projection jsonb; proposed_saved jsonb; key text; event_count integer;
begin
  insert into public."cmp_Users" values(actor,actor,company,'active');
  insert into public."cmp_Offices" values(office,company);
  insert into public."Org_Master"("Org_id","Org_Name") values(carrier,'Test carrier');
  for item in select * from (values
    ('estimatedDeparture','{quote,shipmentFacts,estimatedDeparture}'::text[],'JobRoute_PlannedDepartureAt'),
    ('estimatedArrival','{quote,shipmentFacts,estimatedArrival}'::text[],'JobRoute_PlannedArrivalAt'),
    ('serviceLevel','{quote,serviceLevel}'::text[],'JobRoute_ServiceLevel'),
    ('collectionAddress','{quote,collectionAddress}'::text[],'JobRoute_OriginAddressSnapshot'),
    ('deliveryAddress','{quote,deliveryAddress}'::text[],'JobRoute_DestinationAddressSnapshot'),
    ('carrier','{quote,carrierId}'::text[],'JobRoute_Carrier'),
    ('origin','{quote,loadingPoint}'::text[],'JobRoute_OriginNameSnapshot'),
    ('destination','{quote,dischargePoint}'::text[],'JobRoute_DestinationNameSnapshot')
  ) fields(field_name,snapshot_path,column_name) loop
    for blank in select value from jsonb_array_elements(case
      when item.field_name in ('origin','destination') then '[null,"","   ","Customer warehouse"]'::jsonb
      when item.field_name='carrier' then '[null,""]'::jsonb
      else '[null,"","   "]'::jsonb end) loop
      q:=gen_random_uuid();v1:=gen_random_uuid();v2:=gen_random_uuid();review_id:=gen_random_uuid();
      snapshot:=jsonb_build_object('quote',jsonb_build_object('mode','Sea','direction','Export',
        'loadingPoint','GBFXT','dischargePoint','NLRTM','collectionAddress','Collection site','deliveryAddress','Delivery site',
        'serviceLevel','Standard','carrierId',carrier,'carrierName','Test carrier',
        'shipmentFacts',jsonb_build_object('estimatedDeparture','2026-09-18','estimatedArrival','2026-09-21',
          'cargoLines',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Test goods')))));
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(q,office,'accepted',v1,actor);
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v1,q,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      perform booking_api.save_booking(actor,job,jsonb_build_object('origin','GBFXT','originUnlocode','GBFXT',
        'destination','NLRTM','destinationUnlocode','NLRTM','carrierId',carrier,
        'collectionAddress','Collection site','deliveryAddress','Delivery site','readyDate','2026-09-18','requiredDeliveryDate','2026-09-21',
        'route',jsonb_build_object('origin','GBFXT','originUnlocode','GBFXT','destination','NLRTM','destinationUnlocode','NLRTM',
          'originAddress','Collection site','destinationAddress','Delivery site','carrierId',carrier,'serviceLevel','Standard',
          'plannedDepartureAt','2026-09-18','plannedArrivalAt','2026-09-21','vessel','Keep operational vessel',
          'carrierBookingReference','Keep carrier reference')));
      update public."Job_Routing" set "JobRoute_ActualDepartureAt"='2026-09-18T13:00:00Z',
        "JobRoute_ActualArrivalAt"='2026-09-21T15:00:00Z',
        "JobRoute_RouteJSON"="JobRoute_RouteJSON"||'{"operationalEvidence":"Keep recorded evidence"}'::jsonb
        where "Job_ID"=job;
      select to_jsonb(r) into before_route from public."Job_Routing" r where "Job_ID"=job;
      baseline:=booking_api.current_quote_sync_projection(job);
      proposed:=jsonb_set(snapshot,item.snapshot_path,blank);
      if item.field_name='carrier' then proposed:=jsonb_set(proposed,'{quote,carrierName}','null');end if;
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v2,q,2,proposed,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into proposed_saved from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v2;
      insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
        values(review_id,company,job,q,v1,v2,booking_api.quote_sync_projection(snapshot),booking_api.quote_sync_projection(proposed),baseline,
          booking_api.quote_sync_differences(booking_api.quote_sync_projection(snapshot),baseline,booking_api.quote_sync_projection(proposed)));
      update public."Job_Header" set "Job_PendingQuoteVersionID"=v2,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
      review:=public.booking_workflow_quote_sync_review_v2(actor,job);
      if booking_api.current_quote_sync_projection(job) is distinct from baseline then
        raise exception 'Pending revision changed Booking before operator approval';end if;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(item.field_name),review->>'reviewToken');
      expected:=booking_api.quote_sync_projection(proposed)->item.field_name;
      applied_projection:=booking_api.current_quote_sync_projection(job);
      if applied_projection->item.field_name is distinct from expected then
        raise exception 'Selected route clear retained old projection: % / %',item.field_name,blank;end if;
      select to_jsonb(r) into after_route from public."Job_Routing" r where "Job_ID"=job;
      if after_route#>>'{JobRoute_RouteJSON,operationalEvidence}'<>'Keep recorded evidence' then
        raise exception 'Quote update removed unrelated route evidence';end if;
      if after_route->>item.column_name is distinct from
        (case when blank='"Customer warehouse"'::jsonb then 'Customer warehouse' else null end) then
        raise exception 'Selected route clear retained old column: % / %',item.field_name,blank;end if;
      foreach key in array array['origin','destination','estimatedDeparture','estimatedArrival','collectionAddress','deliveryAddress','serviceLevel','carrier'] loop
        if key<>item.field_name and applied_projection->key is distinct from baseline->key then
          raise exception 'Selected % changed unselected %',item.field_name,key;end if;
      end loop;
      before_apply:=after_route;
      select count(*) into event_count from booking_api.events;
      result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,jsonb_build_array(item.field_name),review->>'reviewToken');
      if not (result->>'reused')::boolean or event_count<>(select count(*) from booking_api.events)
        or before_apply is distinct from (select to_jsonb(r) from public."Job_Routing" r where "Job_ID"=job) then
        raise exception 'Retry repeated route mutation or audit';end if;
      -- Ignore only the selected columns, compatibility payload and save metadata.
      before_route:=before_route-array[item.column_name,'JobRoute_RouteJSON','JobRoute_UpdatedAt','JobRoute_UpdatedBy'];
      after_route:=after_route-array[item.column_name,'JobRoute_RouteJSON','JobRoute_UpdatedAt','JobRoute_UpdatedBy'];
      if item.field_name='origin' then
        if after_route->>'JobRoute_OriginUNLocode' is not null then raise exception 'Old origin code retained';end if;
        before_route:=before_route-'JobRoute_OriginUNLocode';after_route:=after_route-'JobRoute_OriginUNLocode';
      elsif item.field_name='destination' then
        if after_route->>'JobRoute_DestinationUNLocode' is not null then raise exception 'Old destination code retained';end if;
        before_route:=before_route-'JobRoute_DestinationUNLocode';after_route:=after_route-'JobRoute_DestinationUNLocode';
      end if;
      if after_route is distinct from before_route then raise exception 'Clearing % changed unselected route fields',item.field_name;end if;
      if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>snapshot
        or (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v2)<>proposed_saved then
        raise exception 'Clearing route rewrote submitted history';end if;
      if not exists(select 1 from booking_api.events where job_id=job and event_type in ('quote_update_applied','quote_update_partially_applied')
        and metadata->'before'->item.field_name=baseline->item.field_name
        and metadata->'after'->item.field_name=expected) then raise exception 'Route clear audit missing';end if;
    end loop;
  end loop;
end;
$route_clear$;
`
