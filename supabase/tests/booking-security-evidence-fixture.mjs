import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/20260907140238_booking_cargo_security_evidence.sql', import.meta.url), 'utf8')

// Actual production migration/writer in disposable PostgreSQL. Auth and the
// surrounding workspace fixture are not hosted access-boundary evidence.
export const securityEvidenceFixture = `
${migration}
create function booking_api.fixture_security_payload(job uuid,cargo uuid,record_id uuid,changes jsonb)
returns jsonb language sql as $$
 select jsonb_build_object('id',record_id,'cargoId',cargo,'expectedUpdatedAt',j."Job_UpdatedAt",
   'expectedCargoUpdatedAt',c."JobCargo_UpdatedAt",'expectedRecordUpdatedAt',e.updated_at,
   'changes',changes,'reason','Internal screening evidence test')
 from public."Job_Header" j join public."Job_Cargo" c on c."JobCargo_JobID"=j."Job_ID" and c."JobCargo_ID"=cargo
 left join booking_api.cargo_security_evidence e on e.id=record_id where j."Job_ID"=job
$$;
do $screening$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; job uuid; cargo uuid; foreign_cargo uuid;
 record_id uuid:=gen_random_uuid(); payload jsonb; result jsonb; readback jsonb; before_quotes jsonb; before_cargo jsonb;
 before_job jsonb; before_rows jsonb; before_audit bigint; bad jsonb;
begin
 select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
 insert into public."Job_Cargo"("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description")
   values(job,95,'Internal screening evidence cargo') returning "JobCargo_ID" into cargo;
 select "JobCargo_ID" into foreign_cargo from public."Job_Cargo" where "JobCargo_JobID"<>job and not "JobCargo_IsDeleted" limit 1;
 if foreign_cargo is null then raise exception 'Missing negative target fixture'; end if;
 select jsonb_agg(to_jsonb(q) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" q;
 select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_cargo from public."Job_Cargo" c;
 select to_jsonb(j)-array['Job_UpdatedAt','Job_UpdatedBy'] into before_job from public."Job_Header" j where "Job_ID"=job;
 if has_table_privilege('authenticated','booking_api.cargo_security_evidence','SELECT')
   or has_table_privilege('service_role','booking_api.cargo_security_evidence','UPDATE')
   or has_function_privilege('anon','public.booking_workflow_save_security_evidence(uuid,uuid,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','public.booking_workflow_save_security_evidence(uuid,uuid,jsonb)','EXECUTE')
   or has_function_privilege('service_role','booking_api.save_cargo_security_evidence(uuid,uuid,jsonb)','EXECUTE')
   or not has_function_privilege('service_role','public.booking_workflow_save_security_evidence(uuid,uuid,jsonb)','EXECUTE')
   or not(select relrowsecurity from pg_class where oid='booking_api.cargo_security_evidence'::regclass) then
   raise exception 'Screening evidence is exposed outside service boundary'; end if;
 payload:=booking_api.fixture_security_payload(job,cargo,record_id,
   '{"securityStatus":"  Supplied text - not clearance  ","screeningMethod":" Test method ","sourceReference":" Source A ","screenedAt":"2026-09-07T10:30:00+01:00"}');
 result:=booking_api.save_cargo_security_evidence(actor,job,payload);
 if result->>'securityStatus'<>'  Supplied text - not clearance  ' or result->>'sourceReference'<>' Source A '
   or result->>'screeningMethod'<>' Test method ' or (result->>'screenedAt')::timestamptz<>'2026-09-07T09:30:00Z'::timestamptz
   or result->>'screenedByName' is not null or result->>'agentReference' is not null then
   raise exception 'Source text/time was rewritten or unknown evidence invented'; end if;
 begin perform booking_api.save_cargo_security_evidence(actor,job,payload);
   raise exception 'Stale request accepted'; exception when sqlstate 'PT409' then null; end;
 payload:=booking_api.fixture_security_payload(job,cargo,record_id,'{"notes":"Internal correction"}');
 result:=public.booking_workflow_save_security_evidence(actor,job,payload);
 if result is distinct from public.booking_workflow_workspace(actor,'TEST1') then
   raise exception 'Screening Save differs from fresh workspace Open'; end if;
 select e into readback from jsonb_array_elements(result->'cargo') c,
   jsonb_array_elements(c->'securityEvidence') e where e->>'id'=record_id::text;
 if readback is null or readback->>'source'<>'operator' or readback->>'cargoId'<>cargo::text
   or result->>'securityEvidenceSupported'<>'true' or result#>>'{documents,0,category}'<>'quote' then
   raise exception 'Screening read lost identity, support or existing document projection'; end if;
 if (select notes from booking_api.cargo_security_evidence where id=record_id)<>'Internal correction' then
   raise exception 'Public writer did not persist correction'; end if;
 select count(*) into before_audit from booking_api.events;
 perform booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"notes":"Internal correction"}'));
 if (select count(*) from booking_api.events)<>before_audit then raise exception 'No-op generated duplicate audit'; end if;
 select jsonb_agg(to_jsonb(e) order by id) into before_rows from booking_api.cargo_security_evidence e;
 for bad in select value from jsonb_array_elements('[{"securityStatus":true},{"screenedAt":"2026-09-07"},{"screenedAt":"2026-02-30T10:00:00Z"},{"sourceReference":null},{"screeningMethod":{}},{"recordStatus":"cleared"},{"clearance":true}]') loop
   begin
     perform booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,bad));
     raise exception 'Malformed screening evidence accepted: %',bad;
   exception when sqlstate '22023' then null; end;
 end loop;
 begin
   perform booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,
     jsonb_build_object('screeningMethod',repeat('x',81))));
   raise exception 'Oversized supplied method accepted'; exception when sqlstate '22023' then null; end;
 payload:=booking_api.fixture_security_payload(job,cargo,record_id,'{"notes":"Denied"}');
 begin perform booking_api.save_cargo_security_evidence(gen_random_uuid(),job,payload);
   raise exception 'Unknown actor accepted'; exception when insufficient_privilege then null; end;
 begin perform booking_api.save_cargo_security_evidence(actor,job,payload||jsonb_build_object('cargoId',foreign_cargo));
   raise exception 'Foreign cargo accepted'; exception when insufficient_privilege then null; end;
 if before_rows is distinct from (select jsonb_agg(to_jsonb(e) order by id) from booking_api.cargo_security_evidence e)
   or (select count(*) from booking_api.events)<>before_audit then raise exception 'Rejected writes changed evidence or audit'; end if;
 result:=booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,
   '{"notes":null,"screenedAt":null,"screeningMethod":null}'));
 if result->>'notes' is not null or result->>'screenedAt' is not null or result->>'screeningMethod' is not null
   or result->>'securityStatus'<>'  Supplied text - not clearance  ' then raise exception 'Clear or omission semantics failed'; end if;
 begin perform booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,
   '{"recordStatus":"voided","notes":"overwrite"}'));
   raise exception 'Void rewrote source'; exception when sqlstate '22023' then null; end;
 result:=booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"recordStatus":"voided"}'));
 if result->>'recordStatus'<>'voided' or (result->>'operatorEditable')::boolean then raise exception 'Void did not retire entry'; end if;
 begin perform booking_api.save_cargo_security_evidence(actor,job,booking_api.fixture_security_payload(job,cargo,record_id,'{"notes":"rewrite retired"}'));
   raise exception 'Retired evidence changed'; exception when sqlstate '22023' then null; end;
 if before_quotes is distinct from (select jsonb_agg(to_jsonb(q) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" q)
   or before_cargo is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c)
   or before_job is distinct from (select to_jsonb(j)-array['Job_UpdatedAt','Job_UpdatedBy'] from public."Job_Header" j where "Job_ID"=job) then
   raise exception 'Screening evidence rewrote Quote/cargo/Booking data'; end if;
 if (select count(*) from booking_api.events where event_type='cargo_security_evidence_recorded'
   and metadata->>'evidenceId'=record_id::text and actor_user_id is not null)<>4 then
   raise exception 'Expected attributed creation/correction/clear/void audit'; end if;
end $screening$;
`;
