import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260922160000_warehouse_pricing_cards.sql', import.meta.url), 'utf8')
const parityMigration = readFileSync(new URL('../migrations/20260922160100_warehouse_pricing_dexter_boundary.sql', import.meta.url), 'utf8')
test('warehouse pricing persists audited cards, rejects stale/invalid writes and protects colleague, customer and company boundaries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-pricing-')), data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}\n${result.stdout}`)
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema booking_api;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public."cmp_Company"("Company_ID" uuid primary key);
      create table public."cmp_Users"("User_ID" uuid, "Auth_User_ID" uuid, "Company_ID" uuid, "User_AccessStatus" text, permissions text[]);
      create table public."Org_Master"("Org_id" uuid primary key, company_id uuid);
      create function booking_api.has_permission(caller uuid, permission text) returns boolean language sql stable security definer as $$select permission=any(permissions) from public."cmp_Users" where "Auth_User_ID"=caller$$;
      create function public.multideck_crm_company_can_access_account(company uuid, account uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public."Org_Master" where "Org_id"=account and company_id=company)$$;
      insert into public."cmp_Company" values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
      insert into public."cmp_Users" select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        case when n=3 then '10000000-0000-4000-8000-000000000002'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,
        case when n=4 then 'inactive' else 'active' end,
        case when n=1 then array['Warehouse.Read','Warehouse.Write'] when n in (2,3,4) then array['Warehouse.Read'] else array[]::text[] end from generate_series(1,5) n;
      insert into public."Org_Master" values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text, "AIDexterDomain_Description" text);
      create table public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text, "AIDexterWatchCapability_Description" text);
      insert into public."sys_AIDexterDataDomains" values('warehouse','Warehouse operations');
      insert into public."sys_AIDexterWatchCapabilities" values('warehouse','Warehouse changes');
      ${migration}
      ${parityMigration}
      do $$begin
        if not exists(select 1 from public."sys_AIDexterDataDomains" where "AIDexterDomain_Description" like '%not supported%') then raise exception 'pricing read boundary missing'; end if;
        if not exists(select 1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Description" like '%unsupported%') then raise exception 'pricing watch boundary missing'; end if;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
      set role authenticated;
      do $$declare r jsonb:='[{"id":"rate-one","code":"STORAGE","name":"Storage","stage":"storage","basis":"pallet","period":"night","amount":2.5,"minimum":0,"freePeriods":1,"currency":"GBP","from":"2026-01-01","to":""}]'; result jsonb; begin
        result:=public.warehouse_pricing_card(null,r,0);
        if result->>'version'<>'1' or result->'rates'<>r then raise exception 'save/read failed'; end if;
        result:=public.warehouse_pricing_card('20000000-0000-4000-8000-000000000001',r,0,1);
        if result->'defaults'<>r then raise exception 'defaults missing'; end if;
        begin perform public.warehouse_pricing_card(null,r,0); raise exception 'stale save allowed'; exception when serialization_failure then null; end;
        begin perform public.warehouse_pricing_card('20000000-0000-4000-8000-000000000001',r,1,0); raise exception 'stale defaults allowed'; exception when serialization_failure then null; end;
        begin perform public.warehouse_pricing_card('20000000-0000-4000-8000-000000000002'); raise exception 'foreign account read allowed'; exception when insufficient_privilege then null; end;
        begin perform public.warehouse_pricing_card('20000000-0000-4000-8000-000000000002',r,0,1); raise exception 'foreign account write allowed'; exception when insufficient_privilege then null; end;
        begin perform public.warehouse_pricing_card(null,jsonb_set(r,'{0,amount}','-1'),1); raise exception 'negative price allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.warehouse_pricing_card(null,jsonb_set(r,'{0,from}','"2026-02-30"'),1); raise exception 'invalid date allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.warehouse_pricing_card(null,jsonb_set(r,'{0,period}','"once"'),1); raise exception 'invalid period allowed'; exception when invalid_parameter_value then null; end;
        begin perform public.warehouse_pricing_card(null,r||jsonb_set(r,'{0,id}','"rate-two"'),1); raise exception 'overlapping dates allowed'; exception when invalid_parameter_value then null; end;
        result:=public.warehouse_pricing_card(null,jsonb_set(r,'{0,amount}','3'),1);
        if result->>'version'<>'2' or result#>>'{rates,0,amount}'<>'3' then raise exception 'saved update/version failed'; end if;
        begin perform public.warehouse_pricing_card('20000000-0000-4000-8000-000000000001',r,1,1); raise exception 'changed inherited defaults allowed'; exception when serialization_failure then null; end;
        begin perform 1 from booking_api.warehouse_pricing_cards; raise exception 'direct read allowed'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      do $$begin if (select count(*) from booking_api.warehouse_pricing_audit)<>3 then raise exception 'audit not atomic'; end if; end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$declare r jsonb; begin
        r:=public.warehouse_pricing_card('20000000-0000-4000-8000-000000000001');
        if r->>'canManage'<>'false' or jsonb_array_length(r->'rates')<>1 or jsonb_array_length(r->'defaults')<>1 then raise exception 'standard colleague read failed'; end if;
        begin perform public.warehouse_pricing_card(null,'[]',1); raise exception 'read-only write allowed'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='00000000-0000-4000-8000-000000000001';
      set role authenticated;
      do $$begin if public.warehouse_pricing_card()->>'version'<>'2' then raise exception 'inactive creator hides rates'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$begin
        if public.warehouse_pricing_card()->>'version'<>'0' then raise exception 'foreign company leaked'; end if;
        begin perform public.warehouse_pricing_card('20000000-0000-4000-8000-000000000001'); raise exception 'foreign customer leaked'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      do $$declare n integer; begin for n in 1..6 loop
        if n in (2,3) then continue; end if;
        perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-'||lpad(n::text,12,'0'),false);
        begin perform public.warehouse_pricing_card(); raise exception 'inactive/unprivileged/unlinked caller allowed: %',n; exception when insufficient_privilege then null; end;
      end loop; end$$;
      set role anon;
      do $$begin begin perform public.warehouse_pricing_card(); raise exception 'anonymous access allowed'; exception when insufficient_privilege then null; end; end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
