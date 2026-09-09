import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = '/opt/homebrew/opt/postgresql@17/bin'
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
test('real PostgreSQL handling validation, Quote TBC allowance and both Booking status gates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'multideck-handling-'))
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    return result.stdout
  }
  let started = false
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -h '' -p 55489`, '-w', 'start'])
    started = true
    const sql = text => run('psql', ['-h', dir, '-p', '55489', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], text)
    sql(`create role anon; create role authenticated; create role service_role;
      create schema quote_api; create schema booking_api;
      create table public."Job_Header" ("Job_ID" uuid primary key,"Job_Status" text,"Job_IsDeleted" boolean default false);
      create table public."Job_Cargo" ("JobCargo_JobID" uuid,"JobCargo_LineNo" int,"JobCargo_IsDeleted" boolean default false,
        "JobCargo_Description" text,"JobCargo_Length" numeric,"JobCargo_Width" numeric,"JobCargo_Height" numeric,
        "JobCargo_IsHazardous" boolean default false,"JobCargo_IsTemperatureControlled" boolean default false,"JobCargo_CargoJSON" jsonb);
      create function booking_api.completion_readiness_for_job(requested_job_id uuid) returns jsonb language plpgsql as $f$
      declare total_checks int:=0; missing_count int; missing_value jsonb:='[]'; begin
  missing_count := jsonb_array_length(missing_value);
      return jsonb_build_object('ready',missing_count=0,'missing',missing_value); end $f$;`)
    const normalise = read('20260905115938_quote_version_structured_cargo.sql')
    sql(normalise.slice(normalise.indexOf('create function quote_api.normalise_cargo_lines'), normalise.indexOf('create table quote_api.version_cargo_lines')))
    const readiness = read('20260905123223_quote_cargo_issue_readiness.sql')
    sql(readiness.slice(readiness.indexOf('create function'), readiness.indexOf('-- Keep the current')))
    sql(read('20260908145528_cargo_line_handling_tbc.sql'))
    sql(`create table "sys_AIDexterDataDomains" ("AIDexterDomain_Code" text,"AIDexterDomain_Description" text);
      create table "sys_AIDexterActions" ("AIDexterAction_Code" text,"AIDexterAction_Description" text);
      create table "sys_AIDexterWatchCapabilities" ("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text);`)
    sql(read('20260908145931_cargo_handling_dexter_boundary.sql'))
    sql(read('20260908151239_quote_handling_incomplete_allowed.sql'))
    sql(`do $$declare line jsonb; result jsonb; begin
      line:=jsonb_build_object('id','11111111-1111-4111-8111-111111111111','description','Test cargo','isHazardous',true,
        'handlingDetailsJson','{"hazardous":{"tbc":true,"details":{}}}');
      result:=quote_api.normalise_cargo_lines(jsonb_build_array(line),true);
      if result#>>'{0,handlingDetailsJson}' is distinct from line->>'handlingDetailsJson' then raise exception 'Lost handling on normalisation'; end if;
      if cardinality(quote_api.cargo_issue_missing(result,'sea','FCL'))<>0 then raise exception 'TBC blocked Quote issue'; end if;
      if cardinality(quote_api.cargo_handling_missing(line,false))<>1 then raise exception 'TBC accepted as resolved'; end if;
      line:=jsonb_set(line,'{handlingDetailsJson}','"{\\"hazardous\\":{\\"tbc\\":false,\\"details\\":{}}}"');
      if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(line),'sea','FCL'))<>0 then raise exception 'Incomplete handling blocked Quote issue'; end if;
      perform quote_api.normalise_cargo_lines(jsonb_build_array(line),true);
      if cardinality(quote_api.cargo_handling_missing(line,false))<>1 then raise exception 'Incomplete handling accepted for Booking'; end if;
      begin perform quote_api.cargo_handling('{"unknown":{"tbc":true,"details":{}}}'); raise exception 'Unknown selection accepted'; exception when invalid_parameter_value then null; end;
      begin perform quote_api.normalise_cargo_lines('[{"id":"11111111-1111-4111-8111-111111111111","handlingDetailsJson":"{\\"hazardous\\":{\\"tbc\\":true,\\"details\\":{}}}"}]'); raise exception 'Mismatched flags accepted'; exception when invalid_parameter_value then null; end;
    end $$;
    insert into "Job_Header" values ('22222222-2222-4222-8222-222222222222','draft',false);
    insert into "Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_IsHazardous","JobCargo_CargoJSON")
      values ('22222222-2222-4222-8222-222222222222',1,'Test cargo',true,'{"handlingDetailsJson":"{\\"hazardous\\":{\\"tbc\\":true,\\"details\\":{}}}"}');
    do $$declare target text; begin
      if (booking_api.completion_readiness_for_job('22222222-2222-4222-8222-222222222222')->>'ready')::boolean then raise exception 'Readiness ignored TBC'; end if;
      foreach target in array array['booked','in_transit','arrived','delivered','completed','ready_for_invoice','complete'] loop
        begin
          update "Job_Header" set "Job_Status"=target;
          set constraints all immediate;
          raise exception 'TBC bypassed status %',target;
        exception when invalid_parameter_value then null; end;
      end loop;
    end $$;
    update "Job_Cargo" set "JobCargo_CargoJSON"='{"handlingDetailsJson":"{\\"hazardous\\":{\\"tbc\\":false,\\"details\\":{\\"unNumber\\":\\"1234\\",\\"properShippingName\\":\\"Supplied test name\\",\\"class\\":\\"3\\",\\"packingGroup\\":\\"II\\"}}}"}';
    update "Job_Header" set "Job_Status"='booked';
    update "Job_Header" set "Job_Status"='complete';
    do $$begin
      if not (booking_api.completion_readiness_for_job('22222222-2222-4222-8222-222222222222')->>'ready')::boolean then raise exception 'Resolved details still blocked'; end if;
      if has_function_privilege('anon','booking_api.cargo_handling_missing(uuid)','execute') then raise exception 'Anonymous access broadened'; end if;
    end $$;`)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
