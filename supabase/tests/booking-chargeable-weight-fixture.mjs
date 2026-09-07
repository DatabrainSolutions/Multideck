import { readFileSync } from 'node:fs'
export const chargeableWeightFixture = readFileSync(new URL('../migrations/20260907124841_booking_chargeable_weight_validation.sql', import.meta.url), 'utf8') + `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001';job uuid;line_id uuid;
  source jsonb; observed jsonb; bad jsonb; before_rows jsonb; events bigint; candidate jsonb; quote_before jsonb;
begin
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into quote_before from public."CusQuote_Versions" v;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  foreach candidate in array array['"0"'::jsonb,'"0.1234567890123456789"','"999999999999"','"1,234.56789"'] loop
    source:=jsonb_build_object('description','Synthetic chargeable weight','chargeableWeightKg',candidate);
    perform public.booking_workflow_save(actor,job,jsonb_build_object('cargo',jsonb_build_array(source)));
    select "JobCargo_ID","JobCargo_CargoJSON" into line_id,observed from public."Job_Cargo"
      where "JobCargo_JobID"=job and not "JobCargo_IsDeleted";
    if observed->>'chargeableWeightKg' is distinct from replace(candidate#>>'{}',',','')
      or jsonb_typeof(observed->'chargeableWeightKg')<>'string' then raise exception 'Chargeable decimal lost: %',observed;end if;
    -- Omitting the field in an ordinary update must preserve its exact value.
    perform public.booking_workflow_save(actor,job,jsonb_build_object('cargo',jsonb_build_array(
      jsonb_build_object('id',line_id,'description','Unrelated edit'))));
    if (select "JobCargo_CargoJSON"->>'chargeableWeightKg' from public."Job_Cargo" where "JobCargo_ID"=line_id)
      is distinct from observed->>'chargeableWeightKg' then raise exception 'Omission cleared chargeable weight';end if;
  end loop;
  select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_rows from public."Job_Cargo" c;
  select count(*) into events from booking_api.events;
  for bad in select value from jsonb_array_elements('[true,{},[],"-1","NaN","Infinity","1e2","1,2","1000000000000"]') loop
    begin
      perform public.booking_workflow_save(actor,job,jsonb_build_object('cargo',jsonb_build_array(
        jsonb_build_object('id',line_id,'description','Should roll back'),
        jsonb_build_object('description','Invalid later line','chargeableWeightKg',bad))));
      raise exception 'Invalid chargeable value accepted: %',bad;
    exception when invalid_parameter_value then null;end;
    begin
      perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(
        jsonb_build_object('id',line_id,'description','Direct canonical attempt','chargeableWeightKg',bad))));
      raise exception 'Canonical save bypassed chargeable validation';
    exception when invalid_parameter_value then null;end;
  end loop;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c)
    or events<>(select count(*) from booking_api.events) then raise exception 'Invalid chargeable write partially saved';end if;
  foreach candidate in array array['null'::jsonb,'""','"  "'] loop
    perform public.booking_workflow_save(actor,job,jsonb_build_object('cargo',jsonb_build_array(
      jsonb_build_object('id',line_id,'description','Explicit clear','chargeableWeightKg',candidate))));
    if (select "JobCargo_CargoJSON"->'chargeableWeightKg' from public."Job_Cargo" where "JobCargo_ID"=line_id)
      is distinct from 'null'::jsonb then raise exception 'Explicit clear lost';end if;
  end loop;
  if has_function_privilege('anon','booking_api.normalise_cargo_numbers(jsonb)','execute')
    or has_function_privilege('authenticated','booking_api.normalise_cargo_numbers(jsonb)','execute')
    or has_function_privilege('service_role','booking_api.normalise_cargo_numbers(jsonb)','execute')
    then raise exception 'Private normalizer exposed';end if;
  if quote_before is distinct from (select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") from public."CusQuote_Versions" v)
    then raise exception 'Booking chargeable edits changed Quote history';end if;
end $test$;
`
