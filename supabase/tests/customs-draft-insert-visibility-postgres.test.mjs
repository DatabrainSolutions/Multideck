import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const migration = readFileSync(new URL('../migrations/20260910091000_customs_draft_insert_visibility.sql', import.meta.url), 'utf8')

test('Customs INSERT RETURNING is readable without allowing foreign, inactive or unprivileged callers', { skip: !available }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'customs-visibility-'))
  const data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema booking_api;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public."cmp_Users"("Auth_User_ID" uuid, "Company_ID" uuid, "User_AccessStatus" text, allowed boolean);
      create function booking_api.has_permission(caller uuid, permission text) returns boolean language sql stable security definer as $$select allowed from public."cmp_Users" where "Auth_User_ID"=caller$$;
      create table public."Customs_Declarations"("CUST_id" uuid default gen_random_uuid(), "CUST_CreatedBy" uuid, "CUST_IsDeleted" boolean default false);
      alter table public."Customs_Declarations" enable row level security;
      grant usage on schema auth to authenticated;
      grant select,insert on public."Customs_Declarations" to authenticated;
      create policy creator_insert on public."Customs_Declarations" for insert to authenticated with check("CUST_CreatedBy"=auth.uid() and not "CUST_IsDeleted");
      create policy "Workspace users can read company Customs declarations" on public."Customs_Declarations" for select to authenticated using(false);
      insert into public."cmp_Users" values
        ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active',true),
        ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','active',true),
        ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','active',true),
        ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','inactive',true),
        ('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','active',false);
      ${migration}
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
      set role authenticated;
      do $$declare id uuid; begin
        insert into public."Customs_Declarations"("CUST_CreatedBy") values(auth.uid()) returning "CUST_id" into id;
        if id is null then raise exception 'insert returning failed'; end if;
      end$$;
      reset role;
      insert into public."Customs_Declarations"("CUST_CreatedBy","CUST_IsDeleted") values('00000000-0000-4000-8000-000000000001',true);
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_Declarations")<>1 then raise exception 'same company visibility or soft-delete restriction failed'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_Declarations") then raise exception 'cross-company visibility'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_Declarations") then raise exception 'inactive visibility'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_Declarations") then raise exception 'unprivileged visibility'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_Declarations") then raise exception 'unlinked caller visibility'; end if; end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
