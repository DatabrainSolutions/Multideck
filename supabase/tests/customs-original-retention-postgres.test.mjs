import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction } from './operational-access-source.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
const table = name => {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0, name)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}
const migration = readFileSync(new URL('../migrations/20260922150258_customs_original_invoice_retention.sql', import.meta.url), 'utf8')

test('original invoice retention is atomic, idempotent, audited and bounded by real declaration access', () => {
  const dir = mkdtempSync(join(tmpdir(), 'original-retention-')), data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const r = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`)
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema booking_api;
      create table public."Job_Header"("Job_ID" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_IsDeleted" boolean default false);
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table public."cmp_Users"("User_ID" uuid,"Auth_User_ID" uuid,"Company_ID" uuid,"User_Email" text,"User_AccessStatus" text);
      ${['Customs_Declarations','Customs_Documents','Customs_AuditLog','DOC_StoredObjects','Job_Documents','cmp_Users_Departments','cmp_Departments','cmp_Users_Roles','sys_UserRoles'].map(table).join('\n')}
      alter table public."Customs_Documents" add primary key("CUSTD_id");
      create table booking_api.customs_declaration_grants(declaration_id uuid,user_id uuid,can_write boolean);
      create table booking_api.events(company_id uuid,job_id uuid,event_type text,summary text,metadata jsonb,actor_user_id uuid);
      create function booking_api.has_permission(a uuid,p text) returns boolean language sql stable as $$
        select exists(select 1 from public."cmp_Users" where "Auth_User_ID"=a and "User_AccessStatus"='active'
          and (p='Customs.Read' or "User_Email"<>'reader@test.invalid')) $$;
      ${currentFunction('booking_api','customs_access').sql}
      ${currentFunction('public','customs_declaration_authorised').sql}
      ${migration}
      insert into public."cmp_Users"("User_ID","Auth_User_ID","Company_ID","User_Email","User_AccessStatus") values
        ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner@test.invalid','active'),
        ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','colleague@test.invalid','active'),
        ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','foreign@test.invalid','active'),
        ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','inactive@test.invalid','deactivated'),
        ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','reader@test.invalid','active');
      do $$declare d uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); a uuid:='00000000-0000-4000-8000-000000000001'; other uuid; r jsonb; begin
        insert into public."cmp_Offices" values(j,'10000000-0000-4000-8000-000000000001');
        insert into public."Job_Header"("Job_ID","Job_OfficeID") values(j,j);
        insert into public."Customs_Declarations"("CUST_id","CUST_JobID","CUST_JurisdictionCode","CUST_Direction","CUST_DeclarationKind","CUST_CreatedBy")
          values(d,j,'GB','export','job_related',a);
        r:=public.customs_retain_original_invoice(a,d,u,repeat('x',240)||'.pdf','application/pdf',12,repeat('a',64));
        if r->>'reused'<>'false' then raise exception 'first save missing'; end if;
        r:=public.customs_retain_original_invoice(a,d,u,'again.pdf','application/pdf',12,repeat('a',64));
        if r->>'reused'<>'true' or (select count(*) from public."Customs_AuditLog")<>1 then raise exception 'retry duplicated evidence'; end if;
        if (select count(*) from public."Job_Documents")<>1 or (select count(*) from public."DOC_StoredObjects")<>1 then raise exception 'original not linked'; end if;
        if (select "JobDoc_IsCurrentVersion" from public."Job_Documents") then raise exception 'original became handover invoice'; end if;
        if not booking_api.customs_access('00000000-0000-4000-8000-000000000002',d,false) then raise exception 'colleague cannot read'; end if;
        foreach other in array array[null::uuid,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005']::uuid[] loop
          begin perform public.customs_retain_original_invoice(other,d,gen_random_uuid(),'denied.pdf','application/pdf',1,repeat('a',64)); raise exception 'unauthorised write'; exception when insufficient_privilege then null; end;
        end loop;
        begin perform public.customs_retain_original_invoice(a,d,u,'changed.pdf','application/pdf',1,repeat('b',64)); raise exception 'original overwritten'; exception when invalid_parameter_value then null; end;
        update public."cmp_Offices" set "Company_ID"=gen_random_uuid();
        begin perform public.customs_retain_original_invoice(a,d,gen_random_uuid(),'foreign-job.pdf','application/pdf',1,repeat('a',64)); raise exception 'foreign Booking accepted'; exception when insufficient_privilege then null; end;
        update public."Customs_Declarations" set "CUST_JobID"=null where "CUST_id"=d;
        perform public.customs_retain_original_invoice(a,d,gen_random_uuid(),'standalone.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',12,repeat('c',64));
        if (select count(*) from public."Job_Documents")<>1 or (select count(*) from public."Customs_Documents")<>2 then raise exception 'standalone linkage incorrect'; end if;
        update public."Customs_Declarations" set "CUST_Status"='submitted' where "CUST_id"=d;
        begin perform public.customs_retain_original_invoice(a,d,gen_random_uuid(),'locked.pdf','application/pdf',1,repeat('a',64)); raise exception 'submitted write accepted'; exception when insufficient_privilege then null; end;
        if has_function_privilege('authenticated','public.customs_retain_original_invoice(uuid,uuid,uuid,text,text,bigint,text)','execute') then raise exception 'browser may impersonate actor'; end if;
      end $$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
