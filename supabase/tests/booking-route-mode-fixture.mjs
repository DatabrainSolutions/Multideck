import assert from 'node:assert/strict'
import {changeBookingRouteMode} from './booking-route-client-fixture.mjs'

const saved={id:'10000000-0000-4000-8000-000000000044',mode:'sea',masterTransportReference:'MBL-1',houseTransportReference:'HBL-1',carrierBookingReference:'LINE-1',transportMeansName:null,vessel:'Vessel A',voyageNumber:'V1',origin:'Port A',destination:'Port B',routeData:{source:'accepted_quote'}}
const changed=changeBookingRouteMode(saved,'air',saved)
assert.equal(changed.masterTransportReference,'')
assert.equal(changed.houseTransportReference,'')
assert.equal(changed.vessel,'Vessel A')
assert.equal(saved.masterTransportReference,'MBL-1')
assert.equal(changed.routeData.source,'accepted_quote')
assert.equal(changed.routeData.modeChangeReview.fromMode,'sea')
const payload=JSON.stringify(changed).replaceAll("'","''")

export const routeModeAssertions=`
do $test$
declare actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
  route_id uuid:='${saved.id}'; source jsonb:='${payload}'; rows_before jsonb; refs jsonb; events_before integer;
begin
  insert into public."cmp_Users" values(actor,actor,company,'active');
  insert into public."cmp_Offices" values(office,company);
  insert into public."Job_Header"("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_BookingReference","Job_TransportModeSummary")
    values(job,30,'202609',actor,gen_random_uuid(),office,'MODE-TEST','sea');
  insert into public."Job_Routing"("JobRoute_ID","Job_ID","JobRoute_OrderNo","JobRoute_ModeCode","JobRoute_MasterTransportReference","JobRoute_HouseTransportReference","JobRoute_CarrierBookingReference","JobRoute_Vessel","JobRoute_VoyageNumber","JobRoute_UpdatedBy")
    values(route_id,job,1,'sea','MBL-1','HBL-1','LINE-1','Vessel A','V1',actor);
  -- Actual post-confirmation UI output, then deliberately re-enter the same
  -- master reference. This is not inherited content and may be retained.
  source:=jsonb_set(source,'{masterTransportReference}','"MBL-1"');
  perform booking_api.save_booking_route_legs(actor,job,jsonb_build_object('routes',jsonb_build_array(source)));
  if (select "JobRoute_MasterTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id) is distinct from 'MBL-1'
    or (select "JobRoute_HouseTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id) is not null
    then raise exception 'Reviewed new references were not persisted';end if;
  if not exists(select 1 from booking_api.events where job_id=job and event_type='route_mode_changed'
    and metadata#>>'{beforeReferences,houseTransportReference}'='HBL-1' and metadata#>>'{previousTransport,vessel}'='Vessel A'
    and actor_user_id=actor and metadata->>'reviewed'='true') then raise exception 'Original mode evidence or actor lost';end if;
  if (select "JobRoute_RouteJSON" ? 'modeChangeReview' from public."Job_Routing" where "JobRoute_ID"=route_id) then raise exception 'Reusable approval remained on row';end if;
  -- A direct older/accepted-Quote update has no manual review metadata. It
  -- cannot carry an unchanged Air reference into Sea; evidence stays in audit.
  update public."Job_Routing" set "JobRoute_ModeCode"='sea' where "JobRoute_ID"=route_id;
  if (select "JobRoute_MasterTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id) is not null then raise exception 'Unreviewed reference reinterpreted';end if;
  if (select "JobRoute_RouteJSON"->>'masterTransportReference' from public."Job_Routing" where "JobRoute_ID"=route_id) is not null then raise exception 'Cleared reference remained in compatibility JSON';end if;
  if not exists(select 1 from booking_api.events where job_id=job and metadata->>'fromMode'='air' and metadata#>>'{beforeReferences,masterTransportReference}'='MBL-1') then raise exception 'Older path lost reference history';end if;
  -- Another operator changes the observed reference without changing mode.
  update public."Job_Routing" set "JobRoute_MasterTransportReference"='NEW-MBL' where "JobRoute_ID"=route_id;
  rows_before:=booking_api.test_read_routes(job);select count(*) into events_before from booking_api.events;
  begin perform booking_api.save_booking_route_legs(actor,job,jsonb_build_object('routes',jsonb_build_array(source)));
    raise exception 'Stale mode review accepted';exception when serialization_failure then null;end;
  if booking_api.test_read_routes(job) is distinct from rows_before or (select count(*) from booking_api.events)<>events_before then raise exception 'Rejected review partly persisted';end if;
  -- A genuinely new reference arriving with a Quote mode update is retained.
  update public."Job_Routing" set "JobRoute_ModeCode"='air',"JobRoute_MasterTransportReference"='125-NEW'
    where "JobRoute_ID"=route_id;
  if (select "JobRoute_MasterTransportReference" from public."Job_Routing" where "JobRoute_ID"=route_id)<>'125-NEW' then raise exception 'New reference discarded';end if;
  select count(*) into events_before from booking_api.events;
  update public."Job_Routing" set "JobRoute_Status"='planned' where "JobRoute_ID"=route_id;
  if (select count(*) from booking_api.events)<>events_before then raise exception 'No-op reference audit noise';end if;
  if has_function_privilege('anon','booking_api.preserve_route_mode_references()','EXECUTE')
    or has_function_privilege('authenticated','booking_api.preserve_route_mode_references()','EXECUTE')
    or has_function_privilege('service_role','booking_api.preserve_route_mode_references()','EXECUTE') then raise exception 'Trigger function exposed';end if;
end;$test$;
`
