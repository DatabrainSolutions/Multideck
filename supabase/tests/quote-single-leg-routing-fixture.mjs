// Real projections and accepted-version routing application in disposable PG.
// Identity, numbering, review creation and broad reads use the parent's fixtures.
export function quoteSingleLegRoutingFixture(read) {
  return `
    do $before$
    declare snapshot jsonb := '{"quote":{"mode":"Sea","shipmentFacts":{"routingLegs":[{"mode":"Air","origin":{"unlocode":"GBLHR"},"destination":{"unlocode":"USJFK"}}]}}}';
    begin
      if booking_api.quote_sync_projection(snapshot)#>>'{routing,0,mode}'<>'sea' then
        raise exception 'Expected pre-fix single-leg mode loss was not reproduced';
      end if;
    end $before$;
    ${read('20260905192002_quote_single_leg_routing_authority.sql')}
    do $single_leg$
    declare
      actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid();
      q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); next_version uuid; job uuid; carrier uuid:=gen_random_uuid();
      snapshot jsonb; original_snapshot jsonb; proposed jsonb; baseline jsonb; current_booking jsonb;
      projection jsonb; result jsonb; review jsonb; review_id uuid; token text; version_number integer;
      before_routes jsonb; before_events integer; first_route uuid;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active');
      insert into public."cmp_Offices" values(office,company);
      insert into public."Org_Master"("Org_id","Org_Name") values(carrier,'Explicit Air carrier');
      insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy")
        values(q,office,'accepted',v,actor);
      snapshot:='{"quote":{"mode":"Sea","direction":"Export","loadingPoint":"GBFXT","dischargePoint":"USNYC","shipmentFacts":{"cargoLines":[{"id":"00000000-0000-4000-8000-000000000001","description":"Machinery","grossWeightKg":100}],"routingLegs":[
        {"id":"keep-me","mode":"Air","origin":{"unlocode":"GBLHR","place":"London Heathrow"},"destination":{"unlocode":"","place":"Customer delivery site"},"estimatedDeparture":"2026-09-18","estimatedArrival":"","carrierName":"Explicit Air carrier","serviceLevel":"Express"}]}}}';
      snapshot:=jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,0,carrierId}',to_jsonb(carrier::text));
      projection:=booking_api.quote_sync_projection(snapshot);
      if projection#>>'{routing,0,mode}'<>'air' or projection#>>'{routing,0,destination}'<>'Customer delivery site'
        or projection#>>'{routing,0,carrierId}'<>carrier::text or projection#>>'{routing,0,serviceLevel}'<>'Express'
        or projection#>'{routing,0,plannedArrivalAt}' is not null or projection->'routingIsExplicit'<>'true'::jsonb
        then raise exception 'Explicit single-leg projection lost its fields: %',projection; end if;
      -- Legacy A-B must retain individual fields rather than a new bundled plan.
      baseline:=booking_api.quote_sync_projection('{"quote":{"mode":"Sea","loadingPoint":"GBFXT","dischargePoint":"USNYC"}}');
      proposed:=booking_api.quote_sync_projection('{"quote":{"mode":"Sea","loadingPoint":"GBFXT","dischargePoint":"USCHI"}}');
      if baseline->'routingIsExplicit'<>'false'::jsonb or not exists(
        select 1 from jsonb_array_elements(booking_api.quote_sync_differences(baseline-'routingIsExplicit',baseline,proposed)) d where d->>'key'='destination')
        or exists(select 1 from jsonb_array_elements(booking_api.quote_sync_differences(baseline,baseline,proposed)) d where d->>'key'='routing')
        then raise exception 'Legacy A-B individual comparison changed';end if;
      insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
        values(v,q,1,snapshot,true,'accepted');
      select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v;
      original_snapshot:=snapshot;
      result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);job:=(result->>'jobId')::uuid;
      insert into public."Org_Master"("Org_id") select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
      perform booking_api.apply_quote_routing_plan(job,v,actor);
      if booking_api.current_quote_sync_projection(job)->'routing'<>booking_api.quote_sync_projection(snapshot)->'routing'
        then raise exception 'First conversion did not save the explicit single leg';end if;
      select "JobRoute_ID" into first_route from public."Job_Routing" where "Job_ID"=job and "JobRoute_Status"<>'superseded';
      for version_number in 2..4 loop
        next_version:=gen_random_uuid();review_id:=gen_random_uuid();
        proposed:=case version_number
          when 2 then jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,0,estimatedArrival}','"2026-09-21"')
          when 3 then jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs,0,mode}','"Road"')
          else jsonb_set(snapshot,'{quote,shipmentFacts,routingLegs}','[]') end;
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode")
          values(next_version,q,version_number,proposed,true,'accepted');
        select "CusQuoteVersion_SnapshotJSON" into proposed from public."CusQuote_Versions" where "CusQuoteVersion_ID"=next_version;
        baseline:=booking_api.quote_sync_projection(snapshot);current_booking:=booking_api.current_quote_sync_projection(job);
        insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,baseline_snapshot,proposed_snapshot,booking_snapshot,differences)
          values(review_id,company,job,q,v,next_version,baseline,booking_api.quote_sync_projection(proposed),current_booking,
            booking_api.quote_sync_differences(baseline,current_booking,booking_api.quote_sync_projection(proposed)));
        update public."Job_Header" set "Job_PendingQuoteVersionID"=next_version,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
        review:=public.booking_workflow_quote_sync_review_v2(actor,job);token:=review->>'reviewToken';
        if jsonb_array_length(review->'differences')<>1 or review#>>'{differences,0,key}'<>'routing'
          then raise exception 'Explicit single-leg revision missing or duplicated: %',review;end if;
        if (review#>>'{differences,0,warningCode}' is not distinct from 'mode_change')<>(version_number>2)
          then raise exception 'Single-leg date/mode warnings incorrect: %',review;end if;
        select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") into before_routes from public."Job_Routing" r where "Job_ID"=job;
        select count(*) into before_events from booking_api.events;
        if version_number>2 then
          begin perform public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,false);
            raise exception 'Single-leg mode applied without approval';exception when invalid_parameter_value then null;end;
          if before_routes<>(select jsonb_agg(to_jsonb(r) order by "JobRoute_ID") from public."Job_Routing" r where "Job_ID"=job)
            or before_events<>(select count(*) from booking_api.events) then raise exception 'Rejected approval changed Booking';end if;
        end if;
        result:=public.booking_workflow_apply_quote_sync_v2(actor,job,review_id,'["routing"]',token,version_number>2);
        if result->>'status'<>'applied' or booking_api.current_quote_sync_projection(job)->'routing'<>booking_api.quote_sync_projection(proposed)->'routing'
          or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>next_version
          or (select "Job_TransportModeSummary" from public."Job_Header" where "Job_ID"=job)<>'sea'
          then raise exception 'Single-leg approved result not persisted: %',result;end if;
        if not exists(select 1 from public."Job_Routing" where "JobRoute_ID"=first_route and "JobRoute_Status"<>'superseded')
          or (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=(select "CusQuoteHeader_AcceptedVersionID" from public."CusQuote_Header" where "CusQuoteHeader_ID"=q)) is null
          then raise exception 'Route identity or accepted version lost';end if;
        snapshot:=proposed;v:=next_version;
      end loop;
      if not exists(select 1 from public."CusQuote_Versions" where "CusQuoteHeader_ID"=q and "CusQuoteVersion_Number"=1 and "CusQuoteVersion_SnapshotJSON"=original_snapshot)
        then raise exception 'Original submitted evidence rewritten';end if;
      if has_function_privilege('service_role','booking_api.quote_sync_projection_before_payer_20260904(jsonb)','EXECUTE')
        or has_function_privilege('authenticated','booking_api.quote_sync_differences_before_payer_20260904(jsonb,jsonb,jsonb)','EXECUTE')
        then raise exception 'Private single-leg implementation exposed';end if;
    end $single_leg$;
  `
}
