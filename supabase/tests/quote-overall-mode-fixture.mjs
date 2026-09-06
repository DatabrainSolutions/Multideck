// Exercises the real accepted-version review/apply chain and legacy saver.
// The parent fixtures identity, numbering, and broad workspace reads only.
export function quoteOverallModeFixture() {
  return `
    do $overall_mode$
    declare
      actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      q uuid; v1 uuid; v2 uuid; job uuid; review_id uuid; route_id uuid;
      snapshot jsonb; proposed jsonb; baseline jsonb; current_booking jsonb; review jsonb; result jsonb;
      before_routes jsonb; original_snapshot jsonb; token text; scenario integer; before_events integer; selected jsonb;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active');
      insert into public."cmp_Offices" values(office,company);
      -- 0: legacy A-B, 1: explicit single leg, 2: explicit two legs,
      -- 3: Booking-added leg, 4: manually changed sole leg,
      -- 5: explicit-to-legacy, applied separately, 6: mode + routing together,
      -- 7: mode plus a collection address (compatibility route payload).
      for scenario in 0..7 loop
        q:=gen_random_uuid();v1:=gen_random_uuid();v2:=gen_random_uuid();review_id:=gen_random_uuid();
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
          values(q,office,'accepted',v1,actor);
        snapshot:='{"quote":{"mode":"Sea","direction":"Export","loadingPoint":"GBFXT","dischargePoint":"USNYC","shipmentFacts":{"cargoLines":[{"id":"00000000-0000-4000-8000-000000000001","description":"Machinery","grossWeightKg":100}]}}}';
        if scenario in (1,2,5,6,7) then
          snapshot:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs}','[{"mode":"Sea","origin":{"unlocode":"GBFXT"},"destination":{"unlocode":"USNYC"},"estimatedArrival":"2026-10-01"}]');
        end if;
        if scenario=2 then
          snapshot:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs}',snapshot#>'{quote,shipmentFacts,routingLegs}'||'[{"mode":"Road","origin":{"unlocode":"USNYC"},"destination":{"unlocode":"USCHI"}}]');
        end if;
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
          values(v1,q,1,snapshot,true,'accepted');
        select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
        original_snapshot:=snapshot;
        result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
        insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
        if scenario in (1,2,5,6,7) then perform booking_api.apply_quote_routing_plan(job,v1,actor);end if;
        select "JobRoute_ID" into route_id from public."Job_Routing" where "Job_ID"=job order by "JobRoute_OrderNo" limit 1;
        if scenario=3 then
          insert into public."Job_Routing" ("JobRoute_ID","Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_Status","JobRoute_RouteJSON")
            values(gen_random_uuid(),job,2,'road','planned','{"source":"booking_manual"}');
        elsif scenario=4 then
          update public."Job_Routing" set "JobRoute_ModeCode"='rail' where "JobRoute_ID"=route_id;
        end if;
        update public."Job_Routing" set "JobRoute_HouseTransportReference"='KEEP-REF',"JobRoute_UpdatedBy"=actor where "JobRoute_ID"=route_id;
        proposed:=jsonb_set(snapshot,'{quote,mode}','"Air"');
        if scenario=5 then proposed:=jsonb_set(proposed,'{quote,shipmentFacts,routingLegs}','[]');end if;
        if scenario=6 then proposed:=jsonb_set(proposed,'{quote,shipmentFacts,routingLegs,0,mode}','"Road"');end if;
        if scenario=7 then proposed:=jsonb_set(proposed,'{quote,collectionAddress}','"Revised collection site"');end if;
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
          values(v2,q,2,proposed,true,'accepted');
        baseline:=booking_api.quote_sync_projection(snapshot);current_booking:=booking_api.current_quote_sync_projection(job);
        -- An older pending review lacks the new explicit-plan marker. The
        -- public boundary must refresh from immutable versions before Apply.
        if scenario=5 then baseline:=baseline-'routingIsExplicit';end if;
        insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
          values(review_id,company,job,q,v1,v2,baseline,booking_api.quote_sync_projection(proposed),current_booking,
            booking_api.quote_sync_differences(baseline,current_booking,booking_api.quote_sync_projection(proposed)));
        update public."Job_Header" set "Job_PendingQuoteVersionID"=v2,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
        review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
        if not exists(select 1 from jsonb_array_elements(review->'differences') d where d->>'key'='mode' and d->>'warningCode'='mode_change')
          then raise exception 'Missing overall mode review in scenario %: %',scenario,review;end if;
        select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r where "Job_ID"=job;
        select count(*) into before_events from booking_api.events;
        begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["mode"]',token,false);
          raise exception 'Unconfirmed overall mode accepted';exception when invalid_parameter_value then null;end;
        if before_events<>(select count(*) from booking_api.events) then raise exception 'Rejected mode review emitted audit';end if;
        selected:=case when scenario=6 then '["mode","routing"]'::jsonb when scenario=7 then '["mode","collectionAddress"]'::jsonb else '["mode"]'::jsonb end;
        result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,selected,token,true);
        if result->>'status'<>(case when scenario=5 then 'partially_applied' else 'applied' end) or (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'air'
          then raise exception 'Overall mode did not apply: %',result;end if;
        if scenario=0 then
          if (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'air'
            then raise exception 'Legacy A-B lost its derived mode update';end if;
          if not exists(select 1 from booking_api.events where job_id=job and event_type='route_mode_changed' and metadata#>>'{beforeReferences,houseTransportReference}'='KEEP-REF')
            then raise exception 'Legacy mode change lost reference history';end if;
        elsif scenario=6 then
          if (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'road'
            or (select count(*) from booking_api.events where job_id=job and event_type='route_mode_changed')<>1
            then raise exception 'Combined selection wrote an intermediate mode or wrong final leg';end if;
        elsif scenario=7 then
          if (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'sea'
            or (select "JobRoute_HouseTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'KEEP-REF'
            or (select "JobRoute_OriginAddressSnapshot" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'Revised collection site'
            then raise exception 'Address plus overall Mode relabelled the planned leg';end if;
        elsif before_routes is distinct from (select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r where "Job_ID"=job) then
          raise exception 'Overall mode rewrote independently planned legs in scenario %',scenario;
        end if;
        if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>original_snapshot
          or (select r.booking_snapshot from booking_api.quote_sync_reviews r where r.review_id=(review->>'reviewId')::uuid)<>current_booking
          then raise exception 'Historical evidence changed';end if;
        select count(*) into before_events from booking_api.events;
        result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,selected,token,false);
        if not (result->>'reused')::boolean or before_events<>(select count(*) from booking_api.events) then raise exception 'Overall mode retry repeated writes';end if;
        if scenario=5 then
          review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
          result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,true);
          if result->>'status'<>'applied' or (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'air'
            then raise exception 'Remaining routing change could not apply separately';end if;
        end if;
        if scenario=4 then
          perform booking_api.save_booking(actor,job,'{"route":{"plannedArrivalAt":"2026-11-01"}}');
          if (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'rail'
            or (select "JobRoute_HouseTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'KEEP-REF'
            then raise exception 'Date-only compatibility save relabelled the independent leg';end if;
          perform booking_api.save_booking(actor,job,'{"route":{"mode":"Road"}}');
          if (select "JobRoute_ModeCode" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'road'
            or (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'air'
            or (select "JobRoute_HouseTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id) is not null
            then raise exception 'Explicit route mode did not stay separate from overall mode and historical references';end if;
        end if;
      end loop;
      if has_function_privilege('service_role','public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)','EXECUTE')
        or has_function_privilege('service_role','booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb)','EXECUTE')
        or has_function_privilege('authenticated','public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)','EXECUTE')
        then raise exception 'Internal apply stage exposed';end if;
    end $overall_mode$;
  `
}
