// Real review/apply/routing functions in the parent's disposable PostgreSQL.
// The parent explicitly fixtures identity, numbering and broad workspace reads.
export function quoteRoutingModeReviewFixture(read, sqlFunction) {
  return `
    create table public."sys_JobTransportModes" ("JTM_Code" text,"JTM_Name" text,"JTM_IsActive" boolean,"JTM_SortOrder" integer);
    insert into public."sys_JobTransportModes" values ('sea','Ocean',true,1),('air','Air',true,2),('road','Road',true,3),('rail','Rail',true,4);
    ${sqlFunction(read('20260820150000_booking_quote_customer_response.sql'),'booking_api.normalise_mode')}
    ${read('20260905183528_booking_route_mode_reference_history.sql')}
    ${read('20260905185420_quote_routing_mode_review_guard.sql')}
    do $routing_test$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); foreign_actor uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); next_version uuid; last_version uuid; stale_review uuid;
      job uuid; review_id uuid; first_route uuid; second_route uuid; operational_route uuid:=gen_random_uuid();
      snapshot jsonb; proposed jsonb; baseline jsonb; original_booking jsonb; review jsonb; result jsonb; token text;
      before_routes jsonb; before_events integer; before_operational jsonb; original_snapshot jsonb; version_number integer;
    begin
      if booking_api.routing_mode_review_required('[{"mode":"Sea"}]','[{"mode":"OCEAN"}]')
        or booking_api.routing_mode_review_required('[{"mode":"Sea"}]','[{"mode":"Sea"},{"mode":"Sea"}]')
        or booking_api.routing_mode_review_required('[{"mode":"Sea"},{"mode":"Sea"}]','[{"mode":"Sea"}]')
        or booking_api.routing_mode_review_required('[{"mode":"Sea","plannedArrivalAt":"2026-09-10"}]','[{"mode":"Sea","plannedArrivalAt":"2026-09-12"}]')
        then raise exception 'Unchanged modes incorrectly require confirmation';end if;
      if not booking_api.routing_mode_review_required('[{"mode":"Sea"},{"mode":"Air"}]','[{"mode":"Air"},{"mode":"Sea"}]')
        or not booking_api.routing_mode_review_required('[{"mode":"Sea"},{"mode":"Air"}]','[{"mode":"Sea"}]')
        or not booking_api.routing_mode_review_required('[{"mode":"Sea"}]','[{"mode":"unknown"}]')
        or not booking_api.routing_mode_review_required(null,'[]') then raise exception 'Changed or unavailable mode review missed';end if;
      insert into public."cmp_Users" values(actor,actor,company,'active'),(foreign_actor,foreign_actor,gen_random_uuid(),'active');
      insert into public."cmp_Offices" values(office,company);
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(q,office,'accepted',v1,actor);
      snapshot:='{"quote":{"mode":"Sea","direction":"Export","loadingPoint":"GBFXT","dischargePoint":"USNYC","shipmentFacts":{"cargoLines":[{"id":"00000000-0000-4000-8000-000000000001","description":"Machinery","grossWeightKg":100}],"routingLegs":[
        {"mode":"Sea","origin":{"unlocode":"GBFXT"},"destination":{"unlocode":"USNYC"},"estimatedDeparture":"2026-09-18","estimatedArrival":"2026-10-01"},
        {"mode":"Road","origin":{"unlocode":"USNYC"},"destination":{"unlocode":"USCHI"},"estimatedDeparture":"2026-10-02","estimatedArrival":"2026-10-03"}]}}}';
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v1,q,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
      original_snapshot:=snapshot;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      perform booking_api.apply_quote_routing_plan(job,v1,actor);
      select "JobRoute_ID" into first_route from public."Job_Routing" where "Job_ID"=job and "JobRoute_OrderNo"=1;
      select "JobRoute_ID" into second_route from public."Job_Routing" where "Job_ID"=job and "JobRoute_OrderNo"=2;
      update public."Job_Routing" set "JobRoute_MasterTransportReference"='SEA-MBL-001',"JobRoute_HouseTransportReference"='SEA-HBL-001',
        "JobRoute_Vessel"='Original vessel',"JobRoute_UpdatedBy"=actor where "JobRoute_ID"=first_route;
      insert into public."Job_Routing" ("JobRoute_ID","Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_Status","JobRoute_OriginUNLocode","JobRoute_DestinationUNLocode","JobRoute_HouseTransportReference","JobRoute_RouteJSON")
        values(operational_route,job,3,'road','planned','USCHI','USDET','OPERATIONS-REF','{"source":"booking_manual","notes":"Do not replace"}');
      select to_jsonb(r)-'JobRoute_OrderNo'-'JobRoute_UpdatedAt'-'JobRoute_UpdatedBy' into before_operational from public."Job_Routing" r where "JobRoute_ID"=operational_route;
      proposed:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,0,mode}','"Air"');
      last_version:=v1;
      -- 2: nested Sea->Air; 3: reduce to A-B Sea; 4: add same-mode leg;
      -- 5: schedule-only update; 6/7: invalid later leg and unsupported mode.
      -- The overall Quote mode stays Sea throughout.
      for version_number in 2..7 loop
        next_version:=case when version_number=2 then v2 else gen_random_uuid() end;
        if version_number=3 then proposed:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs}','[]');end if;
        if version_number=4 then proposed:=jsonb_set(original_snapshot,'{quote,shipmentFacts,routingLegs,1,mode}','"Sea"');end if;
        if version_number=5 then proposed:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,1,estimatedArrival}','"2026-10-06"');end if;
        if version_number=6 then proposed:=jsonb_set(jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,0,mode}','"Air"'),'{quote,shipmentFacts,routingLegs,1,destination}','{}');end if;
        if version_number=7 then proposed:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,1,mode}','"Unknown"');end if;
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
          values(next_version,q,version_number,proposed,true,'accepted');
        select "CusQuoteVersion_SnapshotJSON" into proposed from public."CusQuote_Versions" where "CusQuoteVersion_ID"=next_version;
        if version_number=7 then
          begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,stale_review,'["routing"]',token,true);raise exception 'Older accepted version applied';exception when serialization_failure then null;end;
        end if;
        review_id:=gen_random_uuid();baseline:=booking_api.quote_sync_projection(snapshot);original_booking:=booking_api.current_quote_sync_projection(job);
        insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
          values(review_id,company,job,q,last_version,next_version,baseline,booking_api.quote_sync_projection(proposed),original_booking,
            booking_api.quote_sync_differences(baseline,original_booking,booking_api.quote_sync_projection(proposed)));
        update public."Job_Header" set "Job_PendingQuoteVersionID"=next_version,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
        review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
        if version_number=5 then
          update public."Job_Routing" set "JobRoute_PlannedArrivalAt"='2026-10-09',"JobRoute_UpdatedBy"=actor where "JobRoute_ID"=first_route;
          begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,false);raise exception 'Actual route edit did not invalidate approval';exception when serialization_failure then null;end;
          review:=public.booking_workflow_quote_sync_review_v2(actor,job);
          if review->>'reviewToken'=token or not (review#>>'{differences,0,conflict}')::boolean then raise exception 'Refreshed route conflict absent';end if;
          token:=review->>'reviewToken';
        end if;
        if jsonb_array_length(review->'differences')<>1 or review#>>'{differences,0,key}'<>'routing' then raise exception 'Expected routing-only review: %',review;end if;
        if (review#>>'{differences,0,warningCode}' is not distinct from 'mode_change')<>(version_number in (2,3,6,7)) then raise exception 'Routing mode warning incorrect: %',review;end if;
        select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r where "Job_ID"=job;
        select count(*) into before_events from booking_api.events;
        if version_number>=6 then
          begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,true);raise exception 'Invalid routing plan applied';exception when invalid_parameter_value then null;end;
          if before_routes<>(select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r where "Job_ID"=job)
            or before_events<>(select count(*) from booking_api.events)
            or (select applied_fields from booking_api.quote_sync_reviews r where r.review_id=(review->>'reviewId')::uuid)<>'[]'::jsonb
            or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>last_version then raise exception 'Invalid later leg failed to roll back route, audit and receipt';end if;
          stale_review:=review_id;
          continue;
        end if;
        begin perform public.booking_workflow_apply_quote_sync_v2(foreign_actor,job,review_id,'["routing"]',token,true);raise exception 'Foreign routing apply allowed';exception when insufficient_privilege then null;end;
        begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]','stale-token',true);raise exception 'Stale routing review allowed';exception when serialization_failure then null;end;
        if version_number in (2,3) then
          begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,false);raise exception 'Nested mode bypassed confirmation';exception when invalid_parameter_value then null;end;
          begin perform public.booking_workflow_apply_quote_sync_confirmed(actor,job,review_id,'["routing"]',false);raise exception 'Internal route stage bypassed confirmation';exception when invalid_parameter_value then null;end;
        end if;
        if before_routes<>(select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r where "Job_ID"=job)
          or before_events<>(select count(*) from booking_api.events)
          or (select applied_fields from booking_api.quote_sync_reviews r where r.review_id=(review->>'reviewId')::uuid)<>'[]'::jsonb then raise exception 'Rejected routing apply mutated state';end if;
        result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,version_number in (2,3));
        if result->>'status'<>'applied' or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>next_version
          or booking_api.current_quote_sync_projection(job)->'routing'<>booking_api.quote_sync_projection(proposed)->'routing' then raise exception 'Applied routing receipt does not match saved plan: %',result;end if;
        if (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'sea' then raise exception 'Nested route change overwrote overall mode';end if;
        if (select to_jsonb(r)-'JobRoute_OrderNo'-'JobRoute_UpdatedAt'-'JobRoute_UpdatedBy' from public."Job_Routing" r where "JobRoute_ID"=operational_route)<>before_operational then raise exception 'Booking-only route content overwritten: before %, after %',before_operational,(select to_jsonb(r) from public."Job_Routing" r where "JobRoute_ID"=operational_route);end if;
        if (select booking_snapshot from booking_api.quote_sync_reviews r where r.review_id=(review->>'reviewId')::uuid)<>original_booking
          or (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>original_snapshot then raise exception 'Submitted or original Booking evidence overwritten';end if;
        if version_number=2 and ((select "JobRoute_HouseTransportReference" from public."Job_Routing" where "JobRoute_ID"=first_route) is not null
          or not exists(select 1 from booking_api.events where job_id=job and event_type='route_mode_changed' and metadata#>>'{beforeReferences,houseTransportReference}'='SEA-HBL-001'
            and metadata#>>'{previousTransport,vessel}'='Original vessel' and actor_user_id=actor)) then raise exception 'Mode switch lost reference history or relabelled old HBL';end if;
        if version_number=3 and not exists(select 1 from public."Job_Routing" where "JobRoute_ID"=second_route and "JobRoute_Status"='superseded') then raise exception 'Reduced plan failed to archive removed quoted leg';end if;
        if (select count(*) from booking_api.events where job_id=job and event_type='quote_mode_change_confirmed'
          and metadata->>'reviewId'=review->>'reviewId' and metadata->>'reviewToken'=token and actor_user_id=actor)<>(case when version_number in (2,3) then 1 else 0 end)
          then raise exception 'Explicit mode confirmation receipt missing or emitted for dates only';end if;
        select count(*) into before_events from booking_api.events;
        result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,false);
        if not (result->>'reused')::boolean or before_events<>(select count(*) from booking_api.events) then raise exception 'Routing retry repeated writes or required fresh mode approval';end if;
        snapshot:=proposed;last_version:=next_version;
      end loop;
      if has_function_privilege('service_role','public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean)','EXECUTE')
        or has_function_privilege('service_role','public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb)','EXECUTE')
        or has_function_privilege('service_role','booking_api.routing_mode_review_required(jsonb,jsonb)','EXECUTE')
        or has_function_privilege('authenticated','public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)','EXECUTE')
        or not has_function_privilege('service_role','public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)','EXECUTE') then raise exception 'Routing approval boundary grants incorrect';end if;
    end $routing_test$;
  `
}
