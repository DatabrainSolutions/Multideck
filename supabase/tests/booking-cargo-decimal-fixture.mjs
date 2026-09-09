import { mutateBookingCargo } from './booking-cargo-client-fixture.mjs'

// Actual browser state updater -> JSON transport -> actual canonical PostgreSQL
// save/dimensions/read helpers. The surrounding Auth/workspace fixture is explicit.
let exact = { cargo: [{ description: 'Exact decimal cargo' }] }
const values = {
  pieces: '9999999999999999.99', packageQuantity: '999999999999.999999',
  grossWeightKg: '9999999999999999.99', netWeightKg: '1234567890123456.78',
  volumeCbm: '999999999999.999999', length: '1234567890123456.78', width: '1,234.50',
  height: '0', declaredValue: '99999999999999.9999',
}
for (const [field, value] of Object.entries(values)) exact = mutateBookingCargo(exact, 0, field, value)

export const cargoDecimalAssertions = `
do $test$
declare actor uuid:='10000000-0000-4000-8000-000000000001'; job uuid; company uuid; cargo_id uuid;
  source jsonb; result jsonb; before_rows jsonb; before_events integer; bad jsonb; field text;
  other_job uuid; proposal jsonb; observed text; function_name text; role_name text; empty_job uuid:=gen_random_uuid();
begin
  perform set_config('test.actor',actor::text,false);
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Company_ID" into company from public."cmp_Users" where "Auth_User_ID"=actor;
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  source:='${JSON.stringify(exact)}'::jsonb;
  result:=public.booking_workflow_save(actor,job,source);
  cargo_id:=(result#>>'{cargo,0,id}')::uuid;
  if result#>>'{cargo,0,grossWeightKg}' is distinct from '9999999999999999.99'
    or result#>>'{cargo,0,pieces}' is distinct from '9999999999999999.99'
    or result#>>'{cargo,0,packageQuantity}' is distinct from '999999999999.999999'
    or result#>>'{cargo,0,netWeightKg}' is distinct from '1234567890123456.78'
    or result#>>'{cargo,0,volumeCbm}' is distinct from '999999999999.999999'
    or result#>>'{cargo,0,length}' is distinct from '1234567890123456.78'
    or result#>>'{cargo,0,width}' is distinct from '1234.50'
    or result#>>'{cargo,0,height}' is distinct from '0.00'
    or result#>>'{cargo,0,declaredValue}' is distinct from '99999999999999.9999' then
    raise exception 'Decimal value lost in save/read: %',result; end if;
  foreach field in array array['pieces','packageQuantity','grossWeightKg','netWeightKg','volumeCbm','length','width','height','declaredValue'] loop
    if jsonb_typeof(result#>array['cargo','0',field]) is distinct from 'string' then raise exception 'Unsafe JSON numeric transport: %',field; end if;
  end loop;
  source:=jsonb_build_object('cargo',result->'cargo');
  -- A save/reload round-trip must not change typed decimals or source identity.
  result:=public.booking_workflow_save(actor,job,source);
  if result->'cargo' is distinct from source->'cargo' then raise exception 'Round-trip changed cargo'; end if;
  result:=public.multideck_dexter_query_domain('booking_cargo',cargo_id::text,25)->'data'->0;
  if result->>'grossWeightKg' is distinct from '9999999999999999.99' or jsonb_typeof(result->'grossWeightKg') is distinct from 'string'
    or result ? 'declaredValue' or result ? 'cargoData' then raise exception 'Dexter precision/financial boundary failed'; end if;

  select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_rows from public."Job_Cargo" c;
  select count(*) into before_events from booking_api.events;
  for bad in select value from jsonb_array_elements('[
    {"grossWeightKg":"1.001"},{"pieces":"10000000000000000"},{"volumeCbm":"0.0000001"},
    {"packageQuantity":"1000000000000"},{"declaredValue":"0.00001"},{"length":"1.005"},
    {"width":"1,2"},{"height":"-1"},{"grossWeightKg":"NaN"},{"grossWeightKg":"Infinity"},
    {"pieces":true},{"pieces":{}},{"pieces":[]},{"pieces":"1e2"},{"pieces":"1."}
  ]'::jsonb) loop
    begin
      perform public.booking_workflow_save(actor,job,jsonb_build_object('cargo',jsonb_build_array(source->'cargo'->0,
        jsonb_build_object('description','Invalid later line')||bad)));
      raise exception 'Invalid later line accepted: %',bad;
    exception when invalid_parameter_value then null; end;
    begin
      perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array((source->'cargo'->0)||bad)));
      raise exception 'Canonical save accepted invalid value: %',bad;
    exception when invalid_parameter_value then null; end;
    begin
      perform booking_api.save_booking_cargo_measurements(actor,job,jsonb_build_object('cargo',jsonb_build_array((source->'cargo'->0)||bad)));
      raise exception 'Measurement stage accepted invalid value: %',bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") from public."Job_Cargo" c)
    or before_events<>(select count(*) from booking_api.events) then raise exception 'Rejected numeric edit partially saved'; end if;
  begin perform booking_api.workspace_extended(actor,'TEST2'); raise exception 'Foreign office read accepted';
  exception when insufficient_privilege then null; end;
  begin perform booking_api.workspace_extended(null,'TEST1'); raise exception 'Missing actor read accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.booking_workflow_save(actor,other_job,source); raise exception 'Foreign office save accepted';
  exception when insufficient_privilege then null; end;
  insert into public."Job_Header" ("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_BookingReference")
    select empty_job,3,'202609',actor,"Job_Customer","Job_OfficeID",'EMPTY-CARGO' from public."Job_Header" where "Job_ID"=job;
  if booking_api.workspace_extended(actor,'EMPTY-CARGO')->'cargo' is distinct from '[]'::jsonb then
    raise exception 'Empty cargo workspace did not load'; end if;

  -- Existing approved Dexter path must use the same precision gate, not round.
  observed:=booking_api.workspace_extended(actor,'TEST1')#>>'{booking,updatedAt}';
  proposal:=jsonb_build_object('target_id',job,'cargo_id',cargo_id,'expected_updated_at',observed,
    'field','grossWeightKg','value','1234567890123456.79','reason','Verified packing list');
  result:=public.multideck_dexter_action_update_booking_cargo(company,actor,proposal);
  if result->>'after' is distinct from '1234567890123456.79' or jsonb_typeof(result->'after') is distinct from 'string' then raise exception 'Dexter rounded approved decimal'; end if;
  begin
    perform public.multideck_dexter_action_update_booking_cargo(company,actor,proposal||jsonb_build_object('expected_updated_at',result->>'updatedAt','value','1.005'));
    raise exception 'Dexter rounded unsupported precision';
  exception when invalid_parameter_value then null; end;
  source:=jsonb_build_object('cargo',booking_api.workspace_extended(actor,'TEST1')->'cargo');
  source:=jsonb_set(source,'{cargo,0,grossWeightKg}','""');
  result:=public.booking_workflow_save(actor,job,source);
  if result#>'{cargo,0,grossWeightKg}' is distinct from 'null'::jsonb then raise exception 'Explicit clear ignored'; end if;

  foreach function_name in array array['booking_api.save_booking(uuid,uuid,jsonb)','public.booking_workflow_save(uuid,uuid,jsonb)',
    'booking_api.save_booking_cargo_measurements(uuid,uuid,jsonb)','booking_api.workspace_extended(uuid,text)'] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,function_name,'EXECUTE') then raise exception 'Browser access granted: %',function_name; end if;
    end loop;
    if not has_function_privilege('service_role',function_name,'EXECUTE') then raise exception 'Service endpoint unavailable: %',function_name; end if;
  end loop;
  foreach function_name in array array['booking_api.normalise_cargo_numbers(jsonb)','booking_api.cargo_decimal_values(public."Job_Cargo")',
    'booking_api.save_before_cargo_decimals_20260905(uuid,uuid,jsonb)','public.booking_workflow_save_before_cargo_decimals_20260905(uuid,uuid,jsonb)',
    'booking_api.save_cargo_measurements_before_decimals_20260905(uuid,uuid,jsonb)',
    'booking_api.workspace_before_cargo_decimals_20260905(uuid,text)'] loop
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,function_name,'EXECUTE') then raise exception 'Internal decimal helper exposed: %',function_name; end if;
    end loop;
  end loop;
end $test$;
`
