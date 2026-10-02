import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const allocation = read('20260904161000_quote_booking_container_allocation')
const start = allocation.indexOf('create or replace function booking_api.quote_container_rows')
const end = allocation.indexOf('\n$$;', start) + 4
assert.ok(start >= 0 && end > start)

test('container projection keeps cargo weight unknown without losing quantities or mode guards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'quote-container-weight-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const sql = input => run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input)
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema booking_api;
      ${allocation.slice(start, end)}
      ${read('20260922171000_quote_container_mode_projection')}
      create table retained_equipment (gross_weight numeric, vgm numeric);
      insert into retained_equipment values (4321, 4567);
      ${read('20260925095733_stop_quote_cargo_weight_copy_to_container')}
      do $check$
      declare snapshot jsonb := '{"quote":{"mode":"Sea","shipmentType":"FCL","shipmentFacts":{"containerRequests":[{"type":"40GP","quantity":1}],"pieces":"24","packageType":"Cartons","grossWeightKg":"3000","volumeCbm":"5"}}}';
        rows jsonb; item jsonb; bad jsonb;
      begin
        rows := booking_api.quote_container_rows(snapshot);
        if jsonb_array_length(rows) <> 1 or rows#>>'{0,type}' is distinct from '40GP'
          or rows#>>'{0,packages}' is distinct from '24' or rows#>>'{0,packageType}' is distinct from 'Cartons'
          or rows#>>'{0,volumeCbm}' is distinct from '5' then
          raise exception 'Single-container quantities or equipment lost';
        end if;
        if rows->0 ? 'grossWeightKg' or rows->0 ? 'verifiedGrossMassKg' then
          raise exception 'Cargo weight was claimed as a loaded weight/VGM';
        end if;
        if snapshot#>>'{quote,shipmentFacts,grossWeightKg}' is distinct from '3000'
          or not exists(select 1 from retained_equipment where gross_weight=4321 and vgm=4567) then
          raise exception 'Existing cargo/equipment evidence changed';
        end if;
        rows := booking_api.quote_container_rows(jsonb_set(snapshot,'{quote,shipmentFacts,containerRequests,0,quantity}','2'));
        if jsonb_array_length(rows) <> 2 then raise exception 'Physical equipment count changed'; end if;
        for item in select value from jsonb_array_elements(rows) loop
          if item ?| array['grossWeightKg','verifiedGrossMassKg','packages','volumeCbm'] then
            raise exception 'Multi-container quantities were invented';
          end if;
        end loop;
        for bad in select value from jsonb_array_elements('[{"mode":"Air","shipmentType":"AIR"},{"mode":"Road","shipmentType":"FTL"},{"mode":"Sea","shipmentType":"LCL"}]') loop
          if booking_api.quote_container_rows(jsonb_set(jsonb_set(snapshot,'{quote,mode}',bad->'mode'),'{quote,shipmentType}',bad->'shipmentType')) <> '[]'::jsonb then
            raise exception 'Incompatible hidden container requests restored';
          end if;
        end loop;
        begin
          perform booking_api.quote_container_rows(jsonb_set(snapshot,'{quote,shipmentFacts,containerRequests,0,quantity}','101'));
          raise exception 'Equipment limit bypassed';
        exception when invalid_parameter_value then null; end;
      end $check$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
