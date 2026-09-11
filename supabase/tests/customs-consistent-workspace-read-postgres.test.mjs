import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction, currentReadPolicies } from './operational-access-source.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const migration = readFileSync(new URL('../migrations/20260911103000_customs_consistent_workspace_read_access.sql', import.meta.url), 'utf8')

test('Customs shared readers, scoped owners and child records agree without granting writes or cross-company access', { skip: !available }, () => {
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
      create table public."cmp_Users"("User_ID" uuid default gen_random_uuid(), "Auth_User_ID" uuid, "Company_ID" uuid, "User_AccessStatus" text, allowed boolean);
      create function booking_api.has_permission(caller uuid, permission text) returns boolean language sql stable security definer as $$select allowed and permission='Customs.Read' from public."cmp_Users" where "Auth_User_ID"=caller$$;
      create table public."Customs_Declarations"("CUST_id" uuid default gen_random_uuid(), "CUST_CreatedBy" uuid, "CUST_IsDeleted" boolean default false, "CUST_AssignedUserID" uuid, "CUST_OwnerDepartmentID" uuid);
      create table public."cmp_Users_Departments"("User_ID" uuid,"Department_ID" uuid);
      create table public."cmp_Departments"("Department_ID" uuid,"Company_ID" uuid,"Department_IsActive" boolean);
      create table public."cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
      create table public."sys_UserRoles"("sys_UserRole_ID" uuid default gen_random_uuid(),"sys_UserRole_Name" text);
      create table public."sys_Permissions"("sys_Permission_ID" uuid,"sys_Permission_Value" text);
      create table public."sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid);
      create table booking_api.customs_declaration_grants(declaration_id uuid,user_id uuid,can_write boolean);
      create function public.customs_declaration_current_user_authorised(requested_declaration_id uuid,require_write boolean default false) returns boolean language plpgsql stable security definer as $$begin return booking_api.customs_access(auth.uid(),requested_declaration_id,require_write); end$$;
      alter table public."Customs_Declarations" enable row level security;
      grant usage on schema auth to authenticated;
      grant select,insert on public."Customs_Declarations" to authenticated;
      create policy creator_insert on public."Customs_Declarations" for insert to authenticated with check("CUST_CreatedBy"=auth.uid() and not "CUST_IsDeleted");
      create policy "Workspace users can read company Customs declarations" on public."Customs_Declarations" for select to authenticated using(false);
      insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",allowed) values
        ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active',true),
        ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','active',true),
        ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','active',true),
        ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','inactive',true),
        ('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','active',false);
      ${migration}
      -- Exercise the latest access definitions too, so later migrations cannot
      -- silently reintroduce a restriction while this historical fixture passes.
      ${currentFunction('booking_api', 'customs_access').sql}
      ${currentFunction('public', 'customs_declaration_creator_current_user_authorised').sql}
      ${currentFunction('public', 'customs_declaration_current_user_authorised').sql}
      drop policy "Workspace users can read company Customs declarations" on public."Customs_Declarations";
      ${currentReadPolicies('Customs_Declarations').map(policy => policy.sql).join('\n')}
      create table public."Customs_Items"(parent uuid);
      alter table public."Customs_Items" enable row level security;
      grant select on public."Customs_Items" to authenticated;
      create policy child_read on public."Customs_Items" for select to authenticated using(public.customs_declaration_current_user_authorised(parent,false));
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
      set role authenticated;
      do $$declare id uuid; begin
        insert into public."Customs_Declarations"("CUST_CreatedBy") values(auth.uid()) returning "CUST_id" into id;
        if id is null then raise exception 'insert returning failed'; end if;
      end$$;
      reset role;
      insert into public."Customs_Items" select "CUST_id" from public."Customs_Declarations";
      insert into public."Customs_Declarations"("CUST_CreatedBy","CUST_IsDeleted") values('00000000-0000-4000-8000-000000000001',true);
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_Items")<>1 then raise exception 'child read mismatch'; end if; if exists(select 1 from public."Customs_Declarations" where public.customs_declaration_current_user_authorised("CUST_id",true)) then raise exception 'read role granted write'; end if; if (select count(*) from public."Customs_Declarations")<>1 then raise exception 'same company visibility or soft-delete restriction failed'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$declare owned_id uuid; begin if exists(select 1 from public."Customs_Items") then raise exception 'child access leak'; end if; if exists(select 1 from public."Customs_Declarations") then raise exception 'cross-company visibility'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
      set role authenticated;
      do $$declare owned_id uuid; begin if exists(select 1 from public."Customs_Items") then raise exception 'child access leak'; end if; if exists(select 1 from public."Customs_Declarations") then raise exception 'inactive visibility'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
      set role authenticated;
      do $$declare owned_id uuid; begin if exists(select 1 from public."Customs_Items") then raise exception 'child access leak'; end if; if exists(select 1 from public."Customs_Declarations") then raise exception 'unprivileged visibility'; end if; insert into public."Customs_Declarations"("CUST_CreatedBy") values(auth.uid()) returning "CUST_id" into owned_id; if owned_id is null then raise exception 'scoped creator insert failed'; end if; end$$;
      reset role;
      -- An unprivileged colleague can still open an explicitly assigned,
      -- department-owned or handoff-granted declaration, including its items.
      update public."Customs_Declarations" set "CUST_AssignedUserID"=(select "User_ID" from public."cmp_Users" where "Auth_User_ID"='00000000-0000-4000-8000-000000000005') where "CUST_CreatedBy"='00000000-0000-4000-8000-000000000001';
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_Items")<>1 or (select count(*) from public."Customs_Declarations")<>2 then raise exception 'assignee access mismatch'; end if; end$$;
      reset role;
      update public."Customs_Declarations" set "CUST_AssignedUserID"=null;
      insert into booking_api.customs_declaration_grants select d."CUST_id",u."User_ID",false from public."Customs_Declarations" d cross join public."cmp_Users" u where d."CUST_CreatedBy"='00000000-0000-4000-8000-000000000001' and u."Auth_User_ID"='00000000-0000-4000-8000-000000000005';
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_Items")<>1 or (select count(*) from public."Customs_Declarations")<>2 then raise exception 'handoff grant access mismatch'; end if; if exists(select 1 from public."Customs_Declarations" where "CUST_CreatedBy"<>auth.uid() and public.customs_declaration_current_user_authorised("CUST_id",true)) then raise exception 'read-only scoped grant allowed write'; end if; end$$;
      reset role;
      delete from booking_api.customs_declaration_grants;
      insert into public."cmp_Departments" values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true);
      insert into public."cmp_Users_Departments" select "User_ID",'20000000-0000-4000-8000-000000000001' from public."cmp_Users" where "Auth_User_ID"='00000000-0000-4000-8000-000000000005';
      update public."Customs_Declarations" set "CUST_OwnerDepartmentID"='20000000-0000-4000-8000-000000000001' where "CUST_CreatedBy"='00000000-0000-4000-8000-000000000001';
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_Items")<>1 or (select count(*) from public."Customs_Declarations")<>2 then raise exception 'department access mismatch'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
      set role authenticated;
      do $$declare owned_id uuid; begin if exists(select 1 from public."Customs_Items") then raise exception 'child access leak'; end if; if exists(select 1 from public."Customs_Declarations") then raise exception 'unlinked caller visibility'; end if; end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
