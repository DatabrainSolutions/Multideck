// Real canonical save, typed columns, audit trigger and exact read wrapper.
// Only the older broad workspace assembly is reduced to IDs in this fixture.
import { mutateBookingContainer } from './booking-container-client-fixture.mjs'

export function bookingContainerOperationsFixture(read) {
  let workspace={containers:[{number:'A',type:'40RF',equipmentKind:'container'}]}
  for(const [field,value] of Object.entries({grossWeightKg:'123456789012.123456',tareWeightKg:'4,000.123456',verifiedGrossMassKg:'24000.123456',vgmMethod:'1',reeferSetPoint:'-18.125',reeferUnit:'C'})) {
    workspace=mutateBookingContainer(workspace,0,field,value)
  }
  return `
    alter table public."Job_Containers" add primary key ("JobContainers_ID");
    create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
      select $2 in ('Bookings.Read','Bookings.Write') and exists(select 1 from public."cmp_Users" where "Auth_User_ID"=$1 and "User_AccessStatus"='active')
    $$;
    create function booking_api.workspace_extended(uuid,text) returns jsonb language sql as $$
      select jsonb_build_object('booking',jsonb_build_object('jobId',job."Job_ID"),'containers',coalesce((
        select jsonb_agg(jsonb_build_object('id',c."JobContainers_ID",'number',c."JobContainer_Number",'data',c."JobContainer_JSON") order by c."JobContainer_Number")
          from public."Job_Containers" c where c."Job_ID"=job."Job_ID" and not c."JobContainer_IsDeleted"),'[]'::jsonb))
        from public."Job_Header" job where job."Job_ID"::text=$2 or job."Job_BookingReference"=$2
    $$;
    ${read('20260905201222_booking_container_operational_values.sql')}
    do $equipment$
    declare actor uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
      foreign_actor uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); id uuid; result jsonb; row_value jsonb; payload jsonb;
      before_values jsonb; before_events integer; invalid jsonb;
    begin
      insert into public."cmp_Users" values(actor,actor,company,'active'),(foreign_actor,foreign_actor,gen_random_uuid(),'active');
      insert into public."cmp_Offices" values(office,company);insert into public."Org_Master"("Org_id") values(customer);
      insert into public."Job_Header"("Job_ID","Job_Period","Job_CreatedBy","Job_OrgOfficeID","Job_OfficeID","Job_Customer","Job_Status","Job_TransportModeSummary","Job_BookingReference")
        values(job,to_char(current_date,'YYYYMM'),actor,office,office,customer,'open','sea','OPS-'||job);
      payload:='${JSON.stringify(workspace).replaceAll("'","''")}';
      perform booking_api.save_booking(actor,job,payload);
      select "JobContainers_ID" into id from public."Job_Containers" where "Job_ID"=job;
      result:=booking_api.workspace_extended(actor,job::text);row_value:=result#>'{containers,0}';
      if row_value->>'grossWeightKg'<>'123456789012.123456' or row_value->>'tareWeightKg'<>'4000.123456'
        or row_value->>'verifiedGrossMassKg'<>'24000.123456' or row_value->>'reeferSetPoint'<>'-18.125' or row_value->>'vgmMethod'<>'1'
        then raise exception 'Exact operational insert/read mismatch: %',row_value;end if;
      -- A normal older client save omitting the new fields preserves them.
      perform booking_api.save_booking(actor,job,jsonb_build_object('containers',jsonb_build_array(jsonb_build_object('id',id,'number','A','type','40RF'))));
      if (select "JobContainer_TareKilos" from public."Job_Containers" where "JobContainers_ID"=id)<>4000.123456 then raise exception 'Omitted tare was erased';end if;
      if (select "JobContainer_GrossKilos" from public."Job_Containers" where "JobContainers_ID"=id)<>123456789012.123456 then raise exception 'Omitted gross weight was erased';end if;
      if not exists(select 1 from booking_api.events where job_id=job and event_type='container_operations_changed'
        and metadata#>'{before,verifiedGrossMassKg}'='null'::jsonb and metadata#>>'{after,verifiedGrossMassKg}'='24000.123456' and actor_user_id=actor)
        then raise exception 'Initial operational audit missing';end if;
      payload:=jsonb_build_object('containers',jsonb_build_array(jsonb_build_object('id',id,'number','A','type','40RF','grossWeightKg','123456789012.123456',
        'tareWeightKg',null,'verifiedGrossMassKg','25000.000001','vgmMethod','2','reeferSetPoint','-20.500','reeferUnit','C')));
      select count(*) into before_events from booking_api.events where event_type='container_operations_changed' and job_id=job;
      perform booking_api.save_booking(actor,job,payload);
      row_value:=booking_api.workspace_extended(actor,job::text)#>'{containers,0}';
      if row_value->'tareWeightKg'<>'null'::jsonb or row_value->>'verifiedGrossMassKg'<>'25000.000001'
        or row_value->>'vgmMethod'<>'2' or row_value->>'reeferSetPoint'<>'-20.500' then raise exception 'Operational update/clear failed: %',row_value;end if;
      if not exists(select 1 from booking_api.events where job_id=job and event_type='container_operations_changed' and actor_user_id=actor
        and metadata#>>'{before,tareWeightKg}'='4000.123456' and metadata#>'{after,tareWeightKg}'='null'::jsonb)
        then raise exception 'Before/after operational audit missing';end if;
      perform booking_api.save_booking(actor,job,payload);
      if (select count(*) from booking_api.events where event_type='container_operations_changed' and job_id=job)<>before_events+1 then raise exception 'No-op emitted duplicate operational audit';end if;
      select to_jsonb(c) into before_values from public."Job_Containers" c where "JobContainers_ID"=id;
      select count(*) into before_events from booking_api.events;
      for invalid in select value from jsonb_array_elements('[{"verifiedGrossMassKg":"wrong"},{"grossWeightKg":"1,00"},{"tareWeightKg":-1},{"verifiedGrossMassKg":true},{"tareWeightKg":"0.0000001"},{"tareWeightKg":"1000000000000"},{"reeferSetPoint":"-18.1234"},{"reeferSetPoint":"10000000"},{"vgmMethod":"3"},{"reeferUnit":"Kelvin"}]') loop
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('containers',jsonb_build_array(jsonb_build_object('id',id,'number','MUST-ROLL-BACK')||invalid)));
          raise exception 'Invalid equipment accepted: %',invalid;
        exception when invalid_parameter_value then null;end;
      end loop;
      begin perform booking_api.save_booking(foreign_actor,job,payload);raise exception 'Foreign equipment save allowed';exception when insufficient_privilege then null;end;
      begin perform booking_api.workspace_extended(foreign_actor,job::text);raise exception 'Foreign equipment read allowed';exception when insufficient_privilege then null;end;
      update public."cmp_Users" set "User_AccessStatus"='revoked' where "Auth_User_ID"=actor;
      begin perform booking_api.workspace_extended(actor,job::text);raise exception 'Revoked equipment read allowed';exception when insufficient_privilege then null;end;
      begin perform booking_api.save_booking(actor,job,payload);raise exception 'Revoked equipment save allowed';exception when insufficient_privilege then null;end;
      update public."cmp_Users" set "User_AccessStatus"='active' where "Auth_User_ID"=actor;
      -- A bad later row must roll back earlier changes, including audit.
      begin
        perform booking_api.save_booking(actor,job,jsonb_build_object('containers',jsonb_build_array(
          jsonb_build_object('id',id,'verifiedGrossMassKg','123'),jsonb_build_object('number','SECOND','tareWeightKg','invalid'))));
        raise exception 'Invalid later row accepted';
      exception when invalid_parameter_value then null;end;
      if before_values<>(select to_jsonb(c) from public."Job_Containers" c where "JobContainers_ID"=id) or before_events<>(select count(*) from booking_api.events) then
        raise exception 'Rejected equipment writes changed data/audit';end if;
      -- Old JSON cannot override a typed null or another typed value on read.
      update public."Job_Containers" set "JobContainer_JSON"="JobContainer_JSON"||'{"tareWeightKg":"999","verifiedGrossMassKg":"888"}' where "JobContainers_ID"=id;
      row_value:=booking_api.workspace_extended(actor,job::text)#>'{containers,0}';
      if row_value->'tareWeightKg'<>'null'::jsonb or row_value->>'verifiedGrossMassKg'<>'25000.000001' then raise exception 'Stale JSON overrode typed values';end if;
      perform booking_api.save_booking(actor,job,'{"containers":[]}');
      if not (select "JobContainer_IsDeleted" from public."Job_Containers" where "JobContainers_ID"=id)
        or (select "JobContainer_VGMKilos" from public."Job_Containers" where "JobContainers_ID"=id)<>25000.000001
        or booking_api.workspace_extended(actor,job::text)->'containers'<>'[]'::jsonb then raise exception 'Removal lost history or returned retired container';end if;
      if has_function_privilege('authenticated','booking_api.workspace_extended(uuid,text)','EXECUTE')
        or has_function_privilege('service_role','booking_api.container_operational_values(public."Job_Containers")','EXECUTE') then raise exception 'Equipment private boundary exposed';end if;
    end $equipment$;
  `
}
