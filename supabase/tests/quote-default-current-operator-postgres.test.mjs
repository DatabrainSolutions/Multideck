import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260928160003_quote_default_current_operator.sql', import.meta.url), 'utf8')

test('PostgreSQL: new Quotes default to the active caller without changing explicit or existing owners', { skip: spawnSync(join(bin, 'initdb'), ['--version']).status !== 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'multideck-quote-owner-'))
  const data = join(dir, 'data')
  let started = false
  function run(command, args, input) {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema quote_api;
      create table public."cmp_Users" (
        "User_ID" uuid primary key, "Auth_User_ID" uuid, "User_AccessStatus" text);
      create function quote_api.normalise_cargo_facts(facts jsonb) returns jsonb
        language sql as $$ select facts $$;
      create function quote_api.save_quote_before_cargo_totals_20260905(
        caller_auth_user_id uuid, requested_quote_id uuid, payload jsonb)
        returns jsonb language sql as $$ select payload $$;
      create function quote_api.save_quote(
        caller_auth_user_id uuid, requested_quote_id uuid, payload jsonb)
        returns jsonb language plpgsql security definer set search_path = '' as $$
      begin
        if payload->'shipmentFacts' ? 'cargoLines' then
          payload := jsonb_set(payload, '{shipmentFacts}', quote_api.normalise_cargo_facts(payload->'shipmentFacts'));
        end if;
        return quote_api.save_quote_before_cargo_totals_20260905(caller_auth_user_id, requested_quote_id, payload);
      end $$;
      ${migration}
      do $test$
      declare
        active_auth uuid := gen_random_uuid(); active_user uuid := gen_random_uuid();
        other_user uuid := gen_random_uuid(); inactive_auth uuid := gen_random_uuid();
        result jsonb;
      begin
        insert into public."cmp_Users" values
          (active_user, active_auth, 'active'),
          (other_user, gen_random_uuid(), 'active'),
          (gen_random_uuid(), inactive_auth, 'inactive');

        result := quote_api.save_quote(active_auth, null, '{"shipmentFacts":{"cargoLines":[]}}');
        if result->>'salesOwnerId' <> active_user::text then raise exception 'New Quote owner did not default to caller'; end if;

        result := quote_api.save_quote(active_auth, null, jsonb_build_object('salesOwnerId', other_user));
        if result->>'salesOwnerId' <> other_user::text then raise exception 'Explicit owner was overwritten'; end if;

        result := quote_api.save_quote(active_auth, gen_random_uuid(), '{}'::jsonb);
        if result ? 'salesOwnerId' then raise exception 'Existing Quote owner was changed'; end if;

        begin
          perform quote_api.save_quote(inactive_auth, null, '{}'::jsonb);
          raise exception 'Inactive caller was allowed to create a Quote';
        exception when insufficient_privilege then null; end;

        if has_function_privilege('anon', 'quote_api.save_quote(uuid,uuid,jsonb)', 'execute')
          or has_function_privilege('authenticated', 'quote_api.save_quote(uuid,uuid,jsonb)', 'execute')
          or not has_function_privilege('service_role', 'quote_api.save_quote(uuid,uuid,jsonb)', 'execute')
          then raise exception 'Quote save grants changed'; end if;
      end $test$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
