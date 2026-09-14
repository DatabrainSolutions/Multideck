import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260914113000_customs_reference_preferences.sql', import.meta.url), 'utf8')
test('customs preferences protect company boundaries, admin writes, office ownership and concurrent saves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'customs-preferences-'))
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
      create table public."cmp_Company"("Company_ID" uuid primary key);
      create table public."cmp_Users"("User_ID" uuid, "Auth_User_ID" uuid, "Company_ID" uuid, "User_AccessStatus" text, allowed boolean);
      create table public."cmp_Offices"("Office_ID" uuid, "Company_ID" uuid, "Office_Name" text, "Office_IsActive" boolean);
      create table public."cmp_Users_Roles"("User_ID" uuid, "sys_UserRole_ID" uuid);
      create table public."sys_UserRoles"("sys_UserRole_ID" uuid, "sys_UserRole_Name" text);
      create function booking_api.has_permission(caller uuid, permission text) returns boolean language sql stable security definer as $$select coalesce(allowed,false) from public."cmp_Users" where "Auth_User_ID"=caller$$;
      insert into public."cmp_Company" values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
      insert into public."cmp_Users" select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        case when n=3 then '10000000-0000-4000-8000-000000000002'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,
        case when n=4 then 'inactive' else 'active' end, n<>5 from generate_series(1,5) n;
      insert into public."sys_UserRoles" values('20000000-0000-4000-8000-000000000001','Company Admin');
      insert into public."cmp_Users_Roles" values('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
      insert into public."cmp_Offices" values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Office one',true),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Private office',true);
      ${migration}
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
      set role authenticated;
      do $$declare result jsonb; begin
        result:=public.customs_reference_preferences('{"eori":"GB123456789000","defaultOfficeId":"30000000-0000-4000-8000-000000000001","officeEoris":{"30000000-0000-4000-8000-000000000001":"GB123456789001"},"badges":[{"id":"badge-one","code":"GRK","provider":"CNS1","portName":"Test port","portCode":"GBLGP","active":true}]}',0);
        if result->>'version'<>'1' or result#>>'{settings,eori}'<>'GB123456789000' then raise exception 'save/read failed'; end if;
        begin perform public.customs_reference_preferences(result->'settings',0); raise exception 'stale save allowed'; exception when serialization_failure then null; end;
        begin perform public.customs_reference_preferences(jsonb_set(result->'settings','{defaultOfficeId}','"30000000-0000-4000-8000-000000000002"'),1); raise exception 'foreign office allowed'; exception when insufficient_privilege then null; end;
        begin perform public.customs_reference_preferences(jsonb_set(result->'settings','{eori}','"GB123"'),1); raise exception 'invalid EORI allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.customs_reference_preferences(jsonb_set(result->'settings','{badges,0,portCode}','"bad"'),1); raise exception 'invalid port allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.customs_reference_preferences(jsonb_set(result->'settings','{badges,0,provider}','123'),1); raise exception 'non-string provider allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.customs_reference_preferences(jsonb_set(result->'settings','{officeEoris,30000000-0000-4000-8000-000000000001}','null'),1); raise exception 'null office EORI allowed'; exception when invalid_parameter_value then null; end;
      end$$;
      reset role;
      do $$begin if (select count(*) from booking_api.customs_reference_settings_audit)<>1 then raise exception 'audit must be atomic'; end if; end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$declare result jsonb; begin
        result:=public.customs_reference_preferences();
        if result#>>'{settings,eori}'<>'GB123456789000' or result->>'canManage'<>'false' or jsonb_array_length(result->'offices')<>1 then raise exception 'colleague read failed'; end if;
        begin perform public.customs_reference_preferences(result->'settings',1); raise exception 'colleague write allowed'; exception when insufficient_privilege then null; end;
        begin perform 1 from booking_api.customs_reference_settings; raise exception 'direct table access allowed'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$declare result jsonb; begin result:=public.customs_reference_preferences(); if result#>>'{settings,eori}'<>'' or result#>>'{offices,0,name}'<>'Private office' then raise exception 'foreign company leaked'; end if; end$$;
      reset role;
      do $$begin update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='00000000-0000-4000-8000-000000000001'; end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin if public.customs_reference_preferences()#>>'{settings,eori}'<>'GB123456789000' then raise exception 'inactive creator hides settings'; end if; end$$;
      reset role;
      do $$declare n integer; begin for n in 1..6 loop
        if n in (2,3) then continue; end if;
        perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-'||lpad(n::text,12,'0'),false);
        begin perform public.customs_reference_preferences(); raise exception 'inactive or unprivileged caller allowed: %',n; exception when insufficient_privilege then null; end;
      end loop; end$$;
      set role anon;
      do $$begin begin perform public.customs_reference_preferences(); raise exception 'anonymous access allowed'; exception when insufficient_privilege then null; end; end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
