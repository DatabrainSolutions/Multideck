import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = name => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8')
const details = read('20260901100000_booking_detail_editing.sql')
const start = details.indexOf('create or replace function booking_api.save_booking_detail_fields(')
const end = details.indexOf('\n$$;', start) + 4
assert.ok(start >= 0 && end > start)
// Replace the surrounding detail-stage fixture with the actual production
// function before testing the new migration through ordinary public save.
export const shipmentWeightFixture = `
alter table public."Job_Header" add column if not exists "Job_EditableDetailsJSON" jsonb not null default '{}';
${details.slice(start, end)}
revoke all on function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) to service_role;
${read('20260907131127_booking_shipment_weight_override_validation.sql')}
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; job uuid; candidate jsonb;
  before_job jsonb; before_cargo jsonb; before_quotes jsonb; before_events bigint;
begin
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select jsonb_agg(to_jsonb(c)) into before_cargo from public."Job_Cargo" c where "JobCargo_JobID"=job;
  select jsonb_agg(to_jsonb(v)) into before_quotes from public."CusQuote_Versions" v;
  perform public.booking_workflow_save(actor,job,'{"editableDetails":{"chargeableWeightKg":"1,234.123456789","customerReference":"Synthetic override check"}}');
  if (select "Job_EditableDetailsJSON"->>'chargeableWeightKg' from public."Job_Header" where "Job_ID"=job) is distinct from '1234.123456789' then raise exception 'Override precision lost';end if;
  perform public.booking_workflow_save(actor,job,'{"editableDetails":{"supplierReference":"Unrelated edit"}}');
  if (select "Job_EditableDetailsJSON"->>'chargeableWeightKg' from public."Job_Header" where "Job_ID"=job) is distinct from '1234.123456789' then raise exception 'Omitted override cleared';end if;
  foreach candidate in array array['"-1"'::jsonb,'"1,23"','true','{}','"1000000000000"'] loop
    select to_jsonb(j) into before_job from public."Job_Header" j where "Job_ID"=job;
    select count(*) into before_events from booking_api.events;
    begin
      perform public.booking_workflow_save(actor,job,jsonb_build_object('internalNotes','Must roll back','editableDetails',jsonb_build_object('chargeableWeightKg',candidate)));
      raise exception 'Invalid override accepted';
    exception when invalid_parameter_value then null;end;
    if (select to_jsonb(j) from public."Job_Header" j where "Job_ID"=job) is distinct from before_job
      or (select count(*) from booking_api.events)<>before_events then raise exception 'Invalid override was not atomic';end if;
  end loop;
  perform public.booking_workflow_save(actor,job,'{"editableDetails":{"chargeableWeightKg":""}}');
  if (select "Job_EditableDetailsJSON"->'chargeableWeightKg' from public."Job_Header" where "Job_ID"=job) is distinct from 'null'::jsonb then raise exception 'Override clear failed';end if;
  if (select jsonb_agg(to_jsonb(c)) from public."Job_Cargo" c where "JobCargo_JobID"=job) is distinct from before_cargo
    or (select jsonb_agg(to_jsonb(v)) from public."CusQuote_Versions" v) is distinct from before_quotes then raise exception 'Shipment override changed cargo or Quote';end if;
  if has_function_privilege('anon','booking_api.save_booking_detail_fields(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','booking_api.save_booking_detail_fields(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Detail helper exposed';end if;
end $test$;
`
