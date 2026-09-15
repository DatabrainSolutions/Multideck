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
const calculationMigration = readFileSync(new URL('../migrations/20260914163000_customs_calculation_audit.sql', import.meta.url), 'utf8')
const readMigration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const watchFoundation = readMigration('20260802140000_dexter_watching_for_you')
const watchTables = watchFoundation.slice(watchFoundation.indexOf('create table if not exists'), watchFoundation.indexOf('create index if not exists'))
const cargoMigration = readMigration('20260905112211_dexter_booking_cargo_parity')
const cargoPatchStart = cargoMigration.indexOf('do $$\ndeclare definition text; previous text')
const cargoWatchPatch = cargoMigration.slice(cargoPatchStart, cargoMigration.indexOf('end $$;', cargoPatchStart) + 7)

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
      alter table public."Customs_Declarations" add column "CUST_Status" text default 'draft';
      alter table public."Customs_Declarations" add primary key ("CUST_id");
      alter table public."Customs_Declarations" add column "CUST_GenericPayloadJSON" jsonb default '{}'::jsonb;
      alter table public."Customs_Declarations" add column "CUST_JobID" uuid;
      ${currentFunction('public', 'customs_declaration_authorised').sql}
      ${calculationMigration}
      ${currentFunction('public', 'customs_append_calculation').sql}
      ${currentFunction('public', 'multideck_dexter_domain_customs_calculations').sql}
      revoke all on function public.multideck_dexter_domain_customs_calculations(uuid,text,integer) from public, anon, authenticated;
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
      -- Authorised service operation records the actor, but authenticated
      -- callers cannot bypass it to fabricate/replace historical calculations.
      do $$declare d uuid; run uuid; newer uuid; begin
        select "CUST_id" into d from public."Customs_Declarations" limit 1;
        run := public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{"test":true}');
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','override','{"reason":"Test override"}',run);
        newer := public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{"test":"refreshed reference"}');
        begin
          perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','override','{"reason":"Stale reference override"}',run);
          raise exception 'Superseded calculation accepted an override';
        exception when serialization_failure then null; end;
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','override','{"reason":"Reviewed latest reference"}',newer);
        if (select count(*) from public."Customs_CalculationAudit" where declaration_id=d) <> 4 then raise exception 'Rejected override changed the audit'; end if;
        if (select created_at from public."Customs_CalculationAudit" where id=newer) <= (select created_at from public."Customs_CalculationAudit" where id=run) then raise exception 'Calculation chronology used transaction start'; end if;
        begin
          perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{"changed":true}','calculation','{}');
          raise exception 'stale calculation accepted';
        exception when serialization_failure then null; end;
        begin
          perform public.customs_append_calculation('00000000-0000-4000-8000-000000000003',d,'{}','calculation','{}');
          raise exception 'foreign company calculation accepted';
        exception when insufficient_privilege then null; end;
        begin
          update public."Customs_CalculationAudit" set evidence='{}' where id=run;
          raise exception 'audit rewrite accepted';
        exception when object_not_in_prerequisite_state then null; end;
        begin
          delete from public."Customs_CalculationAudit" where id=run;
          raise exception 'audit delete accepted';
        exception when object_not_in_prerequisite_state then null; end;
      end$$;
      set role authenticated;
      do $$begin
        if (select count(*) from public."Customs_CalculationAudit")<>4 then raise exception 'owner history missing'; end if;
        begin
          insert into public."Customs_CalculationAudit"(declaration_id,actor_auth_id,kind,draft_snapshot,evidence) select "CUST_id",auth.uid(),'calculation','{}','{}' from public."Customs_Declarations";
          raise exception 'browser fabricated audit';
        exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      do $$declare d text; evidence jsonb; begin
        select "CUST_id"::text into d from public."Customs_Declarations" limit 1;
        evidence := public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000001', d, 25);
        if jsonb_array_length(evidence) <> 4 then raise exception 'Dexter owner calculation history missing'; end if;
        if evidence->0->>'declarationId' <> d or evidence->0->>'outOfDate' <> 'false' then raise exception 'Dexter evidence identity or freshness incorrect'; end if;
        if public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000002', d, 25) <> '[]'::jsonb then raise exception 'Dexter supplied company boundary bypass'; end if;
        if public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000001', 'all', 25) <> '[]'::jsonb then raise exception 'Dexter unbounded history query'; end if;
        if jsonb_array_length(public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000001', d, 1)) <> 1 then raise exception 'Dexter history take not bounded'; end if;
        update public."Customs_Declarations" set "CUST_GenericPayloadJSON"='{"changed":true}' where "CUST_id"::text=d;
        evidence := public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000001', d, 1);
        if evidence->0->>'outOfDate' <> 'true' then raise exception 'Dexter stale result presented as current'; end if;
        update public."Customs_Declarations" set "CUST_GenericPayloadJSON"='{}' where "CUST_id"::text=d;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_CalculationAudit")<>4 then raise exception 'colleague history missing'; end if; end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      do $$declare d text; begin
        select "CUST_id"::text into d from public."Customs_Declarations" limit 1;
        if public.multideck_dexter_domain_customs_calculations('10000000-0000-4000-8000-000000000002', d, 25) <> '[]'::jsonb then raise exception 'Dexter foreign declaration history leak'; end if;
      end$$;
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_CalculationAudit") then raise exception 'foreign history leak'; end if; end$$;
      reset role;
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
      reset role;
      create table public."cmp_Company" ("Company_ID" uuid primary key);
      insert into public."cmp_Company" select distinct "Company_ID" from public."cmp_Users";
      alter table public."cmp_Users" add primary key ("User_ID");
      ${watchTables}
      alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text, add column "AIDexterWatch_LastSourceCheckAt" timestamptz, add column "AIDexterWatch_LastHealthError" text;
      create table public."Comm_Notifications" ("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
      create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
      ${currentFunction('public', '_multideck_dexter_watch_matches').sql}
      ${currentFunction('public', '_multideck_dexter_evaluate_watch_signal').sql}
      ${cargoWatchPatch}
      insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description") values('customs_declarations','Customs','Customs');
      ${currentFunction('public', '_multideck_dexter_pause_unauthorised_customs_watches').sql}
      ${readMigration('20260914183000_customs_calculation_watch_events')}
      create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
      do $$declare d uuid; owner_id uuid; run uuid; begin
        select "CUST_id" into d from public."Customs_Declarations" where "CUST_CreatedBy"='00000000-0000-4000-8000-000000000001' and not "CUST_IsDeleted" limit 1;
        select "User_ID" into owner_id from public."cmp_Users" where "Auth_User_ID"='00000000-0000-4000-8000-000000000002';
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_CapabilityCode","AIDexterWatch_TargetID","AIDexterWatch_OwnerUserID","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_RuleJSON") values('10000000-0000-4000-8000-000000000001','customs_declarations',d,owner_id,'Calculation changes','Calculation changes','Calculation changes','{"field":"calculationEvent","operator":"changed"}');
        run := public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{}');
        if (select count(*) from public."AI_DexterWatchSignals")<>1 then raise exception 'calculation signal missing'; end if;
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','override','{"reason":"Reviewed override"}',run);
        if (select count(*) from public."AI_DexterWatchSignals")<>2 then raise exception 'override signal missing'; end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{}');
        if (select count(*) from public."AI_DexterWatchSignals")<>2 then raise exception 'paused watch signalled'; end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{}');
        if (select count(*) from public."AI_DexterWatchSignals")<>3 then raise exception 'resumed watch did not signal'; end if;
        update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=owner_id;
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{}');
        if (select count(*) from public."AI_DexterWatchSignals")<>3 or exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_StatusCode"='active') then raise exception 'revoked watch was not stopped'; end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active', "AIDexterWatch_OwnerUserID"=(select "User_ID" from public."cmp_Users" where "Auth_User_ID"='00000000-0000-4000-8000-000000000003');
        perform public.customs_append_calculation('00000000-0000-4000-8000-000000000001',d,'{}','calculation','{}');
        if (select count(*) from public."AI_DexterWatchSignals")<>3 then raise exception 'foreign owner received calculation signal'; end if;
        -- Even a directly inserted internal signal must recheck the recipient.
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
        insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values('10000000-0000-4000-8000-000000000001','customs_declarations','Customs_CalculationAudit',d,'{}',jsonb_build_object('calculationEvent',gen_random_uuid()));
        -- A non-targeted watch must not inherit access from another watcher.
        update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=owner_id;
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=owner_id,"AIDexterWatch_TargetID"=null;
        insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values('10000000-0000-4000-8000-000000000001','customs_declarations','Customs_CalculationAudit',d,'{}',jsonb_build_object('calculationEvent',gen_random_uuid()));
        if exists(select 1 from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"<>d or "AIDexterWatchSignal_NewJSON" ? 'reason') then raise exception 'signal identity or minimal payload invalid'; end if;
        if (select count(*) from public."AI_DexterWatchEvents")<>3 or (select count(*) from public."Comm_Notifications")<>3 then raise exception 'repeated calculation event notifications missing'; end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'evaluator swallowed failure'; end if;
        if not exists(select 1 from public."Comm_Notifications" where "CommNotif_Body" like '%override was recorded%') or exists(select 1 from public."Comm_Notifications" where "CommNotif_Body" like '%calculationEvent%') then raise exception 'notification wording invalid'; end if;
      end$$;
      create table public."ICUS_Submissions" (
        "ICUSS_id" uuid primary key default gen_random_uuid(),"ICUSS_CustomsID" uuid,
        "ICUSS_UpdatedAt" timestamptz default now(),"ICUSS_ResponseStatusCode" integer,
        "ICUSS_Status" text default 'queued',"ICUSS_ResponsePayloadJSON" jsonb default '{}',
        "ICUSS_RequestPayloadJSON" jsonb default '{}',"ICUSS_DeclarationSnapshotJSON" jsonb);
      ${readMigration('20260914190000_customs_provider_response_history')}
      do $$declare d uuid;s uuid;begin
        select "CUST_id" into d from public."Customs_Declarations" where "CUST_CreatedBy"='00000000-0000-4000-8000-000000000001' and not "CUST_IsDeleted" limit 1;
        insert into public."ICUS_Submissions"("ICUSS_CustomsID") values(d) returning "ICUSS_id" into s;
        if exists(select 1 from public."Customs_ProviderResponseHistory") then raise exception 'queued request treated as response'; end if;
        update public."ICUS_Submissions" set "ICUSS_ResponseStatusCode"=200,"ICUSS_ResponsePayloadJSON"='{"acknowledged":true}' where "ICUSS_id"=s;
        update public."ICUS_Submissions" set "ICUSS_UpdatedAt"=clock_timestamp() where "ICUSS_id"=s;
        if (select count(*) from public."Customs_ProviderResponseHistory")<>1 then raise exception 'audit-only update duplicated response'; end if;
        update public."ICUS_Submissions" set "ICUSS_ResponsePayloadJSON"='{"taxes":[]}' where "ICUSS_id"=s;
        if (select count(*) from public."Customs_ProviderResponseHistory")<>2 or not exists(select 1 from public."Customs_ProviderResponseHistory" where response_payload='{"acknowledged":true}') then raise exception 'original response lost'; end if;
        begin update public."Customs_ProviderResponseHistory" set response_payload='{}'; raise exception 'response rewrite allowed'; exception when sqlstate '55000' then null; end;
        begin delete from public."Customs_ProviderResponseHistory"; raise exception 'response deletion allowed'; exception when sqlstate '55000' then null; end;
        begin update public."ICUS_Submissions" set "ICUSS_CustomsID"=null where "ICUSS_id"=s; raise exception 'response reassignment allowed'; exception when sqlstate '22023' then null; end;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin if (select count(*) from public."Customs_ProviderResponseHistory")<>2 then raise exception 'shared response history unavailable'; end if;
        begin delete from public."Customs_ProviderResponseHistory"; raise exception 'browser response delete allowed'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_ProviderResponseHistory") then raise exception 'foreign response history leak'; end if; end$$;
      reset role;
      alter table public."Customs_Declarations" add column "CUST_Direction" text default 'import';
      ${readMigration('20260914234844_customs_assessment_comparison_audit')}
      do $$declare d uuid; c uuid; s uuid; source uuid; a uuid; again uuid;begin
        select "CUST_id" into d from public."Customs_Declarations" where "CUST_CreatedBy"='00000000-0000-4000-8000-000000000001' and not "CUST_IsDeleted" limit 1;
        select id into c from public."Customs_CalculationAudit" where declaration_id=d and kind='calculation' limit 1;
        insert into public."ICUS_Submissions"("ICUSS_CustomsID","ICUSS_ResponseStatusCode","ICUSS_ResponsePayloadJSON","ICUSS_DeclarationSnapshotJSON")
          values(d,200,'{"final":true}',jsonb_build_object('declaration',jsonb_build_object('id',d,'genericPayload','{}'::jsonb),'calculationLink',jsonb_build_object('calculationId',c))) returning "ICUSS_id" into s;
        select id into source from public."Customs_ProviderResponseHistory" where submission_id=s;
        update public."Customs_Declarations" set "CUST_Status"='accepted' where "CUST_id"=d;
        a:=public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,source,c,'test-v1','{"notices":[{"status":"compared"}]}');
        again:=public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,source,c,'test-v1','{"notices":[{"status":"different"}]}');
        if a is distinct from again or (select count(*) from public."Customs_AssessmentComparisons")<>1 then raise exception 'comparison retry duplicated history'; end if;
        if (select evidence from public."Customs_AssessmentComparisons" where id=a)<>'{"notices":[{"status":"compared"}]}'::jsonb then raise exception 'retry rewrote comparison'; end if;
        begin perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000003',d,source,c,'test-v2','{"notices":[{}]}'); raise exception 'foreign comparison write'; exception when insufficient_privilege then null; end;
        begin perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000002',d,source,c,'test-v2','{"notices":[{}]}'); raise exception 'read-only colleague comparison write'; exception when insufficient_privilege then null; end;
        begin perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,source,gen_random_uuid(),'test-v2','{"notices":[{}]}'); raise exception 'unlinked comparison'; exception when sqlstate '22023' then null; end;
        begin update public."Customs_AssessmentComparisons" set evidence='{}'; raise exception 'comparison rewritten'; exception when sqlstate '55000' then null; end;
        begin delete from public."Customs_AssessmentComparisons"; raise exception 'comparison deleted'; exception when sqlstate '55000' then null; end;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
      do $$begin
        if (select count(*) from public."Customs_AssessmentComparisons")<>1 then raise exception 'colleague assessment unavailable'; end if;
        begin perform public.customs_record_assessment_comparison(null,null,null,null,'test','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
        begin delete from public."Customs_AssessmentComparisons"; raise exception 'browser assessment deletion allowed'; exception when insufficient_privilege then null; end;
      end$$;
      reset role;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      set role authenticated;
      do $$begin if exists(select 1 from public."Customs_AssessmentComparisons") then raise exception 'foreign assessment leak'; end if; end$$;
      reset role;
      set role anon;
      do $$begin begin perform 1 from public."Customs_AssessmentComparisons"; raise exception 'anonymous assessment read'; exception when insufficient_privilege then null; end; end$$;
      reset role;
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text primary key,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_SortOrder" integer,"AIDexterDomain_IsActive" boolean,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_UpdatedAt" timestamptz);
      ${readMigration('20260914235332_customs_assessment_dexter_parity')}
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
      do $$declare d text;begin
        select declaration_id::text into d from public."Customs_AssessmentComparisons" limit 1;
        if jsonb_array_length(public.multideck_dexter_domain_customs_assessments('10000000-0000-4000-8000-000000000001',d,25))<>1 then raise exception 'Dexter colleague assessment unavailable'; end if;
        if public.multideck_dexter_domain_customs_assessments('10000000-0000-4000-8000-000000000002',d,25)<>'[]'::jsonb then raise exception 'Dexter company spoof'; end if;
        if public.multideck_dexter_domain_customs_assessments('10000000-0000-4000-8000-000000000001','all',25)<>'[]'::jsonb then raise exception 'Dexter unbounded assessments'; end if;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
      do $$declare d text;begin
        select declaration_id::text into d from public."Customs_AssessmentComparisons" limit 1;
        if public.multideck_dexter_domain_customs_assessments('10000000-0000-4000-8000-000000000002',d,25)<>'[]'::jsonb then raise exception 'Dexter foreign assessment leak'; end if;
      end$$;
      do $$declare d uuid; c uuid; s uuid; owner_id uuid; w uuid; n integer;begin
        select declaration_id,calculation_id,source_id into d,c,s from public."Customs_AssessmentComparisons" limit 1;
        select "User_ID" into owner_id from public."cmp_Users" where "Auth_User_ID"='00000000-0000-4000-8000-000000000002';
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_CapabilityCode","AIDexterWatch_TargetID","AIDexterWatch_OwnerUserID","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_RuleJSON")
          values('10000000-0000-4000-8000-000000000001','customs_declarations',d,owner_id,'Assessment changes','Assessment changes','Assessment changes','{"field":"assessmentEvent","operator":"changed"}') returning "AIDexterWatch_ID" into w;
        select count(*) into n from public."AI_DexterWatchEvents";
        perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,s,c,'watch-v1','{"notices":[{}]}');
        perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,s,c,'watch-v1','{"notices":[{}]}');
        if (select count(*) from public."AI_DexterWatchEvents")<>n+1 then raise exception 'assessment retry watch deduplication'; end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=w;
        perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,s,c,'watch-v2','{"notices":[{}]}');
        if (select count(*) from public."AI_DexterWatchEvents")<>n+1 then raise exception 'paused assessment watch fired'; end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=w;
        perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,s,c,'watch-v3','{"notices":[{}]}');
        if (select count(*) from public."AI_DexterWatchEvents")<>n+2 then raise exception 'resumed assessment watch missing'; end if;
        if not exists(select 1 from public."Comm_Notifications" where "CommNotif_Body" like '%assessment comparison was recorded%') then raise exception 'assessment notification wording'; end if;
        update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=owner_id;
        perform public.customs_record_assessment_comparison('00000000-0000-4000-8000-000000000001',d,s,c,'watch-v4','{"notices":[{}]}');
        if (select count(*) from public."AI_DexterWatchEvents")<>n+2 then raise exception 'revoked assessment watch fired'; end if;
      end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
