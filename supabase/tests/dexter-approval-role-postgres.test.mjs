import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const readMigration = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const oldMigration = readMigration('20260830230000_security_scan_high_risk_hardening')
const start = oldMigration.indexOf('create or replace function public.multideck_dexter_approve_prepared_action(')
const end = oldMigration.indexOf('create or replace function private.multideck_dexter_guard_mandatory_approval()', start)
assert.ok(start >= 0 && end > start)
const fix = readMigration('20260906171016_dexter_approval_request_role_compatibility')

// Disposable database only. Reproduces the API claims format and exercises the
// actual migration, including grants. Full executor/watch tests live separately.
test('approval accepts current/legacy server claims and denies browser, scope, state and expiry mismatches', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-approval-role-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    const sql = `
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      -- Same resolver definition inspected in the development database.
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
          nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
      create table public."AI_DexterPreparedActions" (
        "AIDexterPrepared_ID" uuid primary key,
        "AIDexterPrepared_CompanyID" uuid,
        "AIDexterPrepared_UserID" uuid,
        "AIDexterPrepared_ConversationID" uuid,
        "AIDexterPrepared_Status" text,
        "AIDexterPrepared_ExpiresAt" timestamptz,
        "AIDexterPrepared_ApprovedAt" timestamptz
      );
      ${oldMigration.slice(start, end)}
      select set_config('request.jwt.claims','{"role":"service_role"}',false);
      do $$begin
        begin
          perform public.multideck_dexter_approve_prepared_action(null,null,null,null);
          raise exception 'Old function unexpectedly supports JSON claims';
        exception when insufficient_privilege then
          if sqlerrm <> 'server_only' then raise; end if;
        end;
      end$$;
      ${fix}
      do $$
      declare
        id uuid := gen_random_uuid(); company uuid := gen_random_uuid();
        actor uuid := gen_random_uuid(); conversation uuid := gen_random_uuid();
        state text; claims text;
      begin
        if has_function_privilege('anon','public.multideck_dexter_approve_prepared_action(uuid,uuid,uuid,uuid)','execute')
          or has_function_privilege('authenticated','public.multideck_dexter_approve_prepared_action(uuid,uuid,uuid,uuid)','execute')
          or not has_function_privilege('service_role','public.multideck_dexter_approve_prepared_action(uuid,uuid,uuid,uuid)','execute') then
          raise exception 'Approval function grants changed'; end if;
        insert into public."AI_DexterPreparedActions" values(id,company,actor,conversation,'prepared',now()+interval '15 minutes',null);
        if not public.multideck_dexter_approve_prepared_action(id,company,actor,conversation)
          then raise exception 'Modern server approval failed'; end if;
        -- Check persistence in a separate statement: SQL expression operands
        -- have no evaluation order and must not mix a write with its readback.
        if (select "AIDexterPrepared_ApprovedAt" is null from public."AI_DexterPreparedActions" where "AIDexterPrepared_ID"=id)
          then raise exception 'Modern server approval was not stored'; end if;
        update public."AI_DexterPreparedActions" set "AIDexterPrepared_ApprovedAt"=null;
        if public.multideck_dexter_approve_prepared_action(id,gen_random_uuid(),actor,conversation)
          or public.multideck_dexter_approve_prepared_action(id,company,gen_random_uuid(),conversation)
          or public.multideck_dexter_approve_prepared_action(id,company,actor,gen_random_uuid())
          or public.multideck_dexter_approve_prepared_action(id,company,actor,null)
          or public.multideck_dexter_approve_prepared_action(gen_random_uuid(),company,actor,conversation)
          then raise exception 'Scope mismatch approved'; end if;
        foreach state in array array['executing','succeeded','failed','declined','expired'] loop
          update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"=state;
          if public.multideck_dexter_approve_prepared_action(id,company,actor,conversation) then
            raise exception 'Non-prepared state approved: %',state; end if;
        end loop;
        update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='prepared',"AIDexterPrepared_ExpiresAt"=now();
        if public.multideck_dexter_approve_prepared_action(id,company,actor,conversation) then raise exception 'Expired action approved'; end if;
        update public."AI_DexterPreparedActions" set "AIDexterPrepared_ExpiresAt"=now()+interval '15 minutes';
        foreach claims in array array['', '{}', '{"role":"anon"}', '{"role":"authenticated"}', '{"role":"authenticated","user_metadata":{"role":"service_role"}}'] loop
          perform set_config('request.jwt.claim.role','',false);
          perform set_config('request.jwt.claims',claims,false);
          begin
            perform public.multideck_dexter_approve_prepared_action(id,company,actor,conversation);
            raise exception 'Non-server request approved';
          exception when insufficient_privilege then
            if sqlerrm <> 'server_only' then raise; end if;
          end;
        end loop;
        if exists(select 1 from public."AI_DexterPreparedActions" where "AIDexterPrepared_ApprovedAt" is not null) then
          raise exception 'Denied request changed approval'; end if;
        perform set_config('request.jwt.claims','',false);
        perform set_config('request.jwt.claim.role','service_role',false);
        if not public.multideck_dexter_approve_prepared_action(id,company,actor,conversation) then raise exception 'Legacy server approval failed'; end if;
        update public."AI_DexterPreparedActions" set "AIDexterPrepared_ConversationID"=null,"AIDexterPrepared_ApprovedAt"=null;
        perform set_config('request.jwt.claim.role','',false);
        perform set_config('request.jwt.claims','{"role":"service_role"}',false);
        if not public.multideck_dexter_approve_prepared_action(id,company,actor,null) then raise exception 'Unbound matching conversation failed'; end if;
      end$$;
      -- A browser database role cannot invoke the privileged entry point, even
      -- if a test session spoofs a role setting. No client grant is introduced.
      set role authenticated;
      do $$begin
        begin
          perform public.multideck_dexter_approve_prepared_action(null,null,null,null);
          raise exception 'Browser executed approval';
        exception when insufficient_privilege then null; end;
      end$$;
      reset role;
    `
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
