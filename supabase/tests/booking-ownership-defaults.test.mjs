import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../migrations/20260919175923_booking_ownership_defaults.sql')
const editorMigration = read('../migrations/20260919182854_booking_ownership_editor.sql')
const auditWorkspaceMigration = read('../migrations/20260919193238_booking_editor_audit_workspace.sql')
const original = read('../migrations/20260907121414_booking_explicit_open_direction.sql')
const opener = original.slice(original.indexOf('create function booking_api.open_booking('), original.indexOf('create or replace function booking_api.open_booking('))
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'

test('Dexter cannot bypass ownership defaults or substitute watches', () => {
  const source = read('../functions/agent-dexter/index.ts')
  assert.match(source, /Reassigning Booking ownership, editing company\/user defaults, and ownership-specific watches are unsupported/)
  assert.match(source, /Booking branch, billing-entity and ownership-default watches are unsupported\. Choose status=unsupported/)
  assert.match(source, /never use generic update_booking or finance actions to bypass it/)
})

test('ownership defaults: real opener, scoped resolution, ambiguity, conversion insertion and replay', () => {
  assert.equal(spawnSync(join(bin, 'initdb'), ['--version']).status, 0, 'PostgreSQL is required for this release test')
  const dir = mkdtempSync(join(tmpdir(), 'booking-ownership-'))
  const data = join(dir, 'data')
  let started = false
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema booking_api;
      create table public."cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,"User_Firstname" text,"User_Lastname" text);
      create table public."cmp_Offices"("Office_ID" uuid primary key,"Company_ID" uuid,"Office_IsActive" boolean default true,"Office_LegalEntityID" uuid,"Office_Name" text default 'Test branch');
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean default true,"LegalEntity_IsDefault" boolean default false,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table public."cmp_Users_Offices"("User_ID" uuid,"Office_ID" uuid);
      create table public."SEC_UserOfficeAccess"("SECUserOffice_UserID" uuid,"SECUserOffice_OrgOfficeID" uuid,"SECUserOffice_StatusCode" text default 'active',"SECUserOffice_IsDefault" boolean default false,"SECUserOffice_CanView" boolean default true,"SECUserOffice_CanCreateJobs" boolean default true,"SECUserOffice_EffectiveFrom" timestamptz default now(),"SECUserOffice_EffectiveTo" timestamptz);
      create table public."Job_Header"("Job_ID" uuid primary key default gen_random_uuid(),"Job_Period" text,"Job_CreatedBy" uuid,"Job_Customer" uuid,"Job_OfficeID" uuid,"Job_OrgOfficeID" uuid,"Job_LegalEntityID" uuid,"Job_Status" text,"Job_Direction" text,"Job_TransportModeSummary" text,"Job_TrackingStatus" text,"Job_CurrentLocationNameSnapshot" text,"Job_BookingReference" text,"Job_CreateIdempotencyKey" uuid,"Job_UpdatedBy" uuid,"Job_IsDeleted" boolean default false);
      alter table public."Job_Header" add "Job_OperationsOwnerID" uuid,add "Job_EditableDetailsJSON" jsonb default '{}',add "Job_UpdatedAt" timestamptz default now(),add "Job_ProvisionalCancelled" boolean default false;
      create table booking_api.events(company_id uuid,job_id uuid,event_type text,summary text,actor_user_id uuid,metadata jsonb);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from public."cmp_Users" where "Auth_User_ID"=$1 and "User_AccessStatus"='active')$$;
      create function booking_api.allocate_reference(uuid,text,text) returns text language sql as $$select gen_random_uuid()::text$$;
      ${opener}
      -- Conversion fixture preserves the actual insertion anchors and a source office
      -- distinct from the user's default. It does not simulate the entire Quote workflow.
      create function booking_api.convert_accepted_quote_before_sync_review_20260904(requested_quote_id uuid, requested_actor_user_id uuid, requested_response_id uuid)
      returns jsonb language plpgsql as $$
      declare office_id uuid:=requested_quote_id;job_status text:='open';direction_code text:='export';mode_code text:='sea';job_id uuid;actor_user_id uuid:=requested_actor_user_id;customer_id uuid;
      begin
        insert into public."Job_Header" ("Job_Period", "Job_CreatedBy", "Job_Customer", "Job_OfficeID", "Job_OrgOfficeID", "Job_Status", "Job_Direction", "Job_TransportModeSummary")
        values (to_char(current_date, 'YYYYMM'), actor_user_id, customer_id, office_id, office_id, job_status, direction_code, mode_code) returning "Job_ID" into job_id;
        return jsonb_build_object('jobId',job_id);
      end $$;
      ${migration}
      do $test$
      declare actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();other_company uuid:=gen_random_uuid();
        branch uuid:=gen_random_uuid();second_branch uuid:=gen_random_uuid();foreign_branch uuid:=gen_random_uuid();
        entity uuid:=gen_random_uuid();second_entity uuid:=gen_random_uuid();foreign_entity uuid:=gen_random_uuid();
        key uuid:=gen_random_uuid();opened jsonb;replayed jsonb;job uuid;converted uuid;n bigint;
      begin
        insert into public."cmp_Users"("User_ID","Auth_User_ID","Company_ID","User_AccessStatus") values(actor,actor,company,'active');
        insert into public."cmp_Offices"("Office_ID","Company_ID") values(branch,company),(foreign_branch,other_company);
        insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_IsDefault","LegalEntity_BaseCurrencyCodeSnapshot") values(entity,company,true,'GBP'),(foreign_entity,other_company,true,'USD');
        if booking_api.default_booking_office(actor)<>branch then raise exception 'Sole branch failed';end if;
        opened:=booking_api.open_booking(actor,key,'default','domestic');job:=(opened->>'jobId')::uuid;
        if not exists(select 1 from public."Job_Header" where "Job_ID"=job and "Job_OrgOfficeID"=branch and "Job_LegalEntityID"=entity) then raise exception 'Defaults not saved';end if;
        if not exists(select 1 from booking_api.events where job_id=job and event_type='ownership_assigned' and metadata->>'legalEntityId'=entity::text) then raise exception 'Audit absent';end if;
        insert into public."cmp_Offices"("Office_ID","Company_ID") values(second_branch,company);
        begin perform booking_api.default_booking_office(actor);raise exception 'Ambiguous branch accepted';exception when invalid_parameter_value then null;end;
        insert into public."cmp_Users_Offices" values(actor,second_branch);
        if booking_api.default_booking_office(actor)<>second_branch then raise exception 'Team branch ignored';end if;
        select count(*) into n from booking_api.events;
        replayed:=booking_api.open_booking(actor,key,'default','export');
        if replayed->>'jobId'<>job::text or replayed->>'reused'<>'true' or (select count(*) from booking_api.events)<>n
          or (select "Job_OrgOfficeID" from public."Job_Header" where "Job_ID"=job)<>branch then raise exception 'Replay reassigned existing booking';end if;
        insert into public."SEC_UserOfficeAccess"("SECUserOffice_UserID","SECUserOffice_OrgOfficeID","SECUserOffice_IsDefault") values(actor,branch,true);
        if booking_api.default_booking_office(actor)<>branch then raise exception 'Explicit default ignored';end if;
        update public."SEC_UserOfficeAccess" set "SECUserOffice_CanCreateJobs"=false;
        begin perform booking_api.default_booking_office(actor);raise exception 'Denied default fell back';exception when invalid_parameter_value then null;end;
        update public."SEC_UserOfficeAccess" set "SECUserOffice_CanCreateJobs"=true,"SECUserOffice_OrgOfficeID"=foreign_branch;
        begin perform booking_api.default_booking_office(actor);raise exception 'Foreign branch accepted';exception when invalid_parameter_value then null;end;
        update public."SEC_UserOfficeAccess" set "SECUserOffice_OrgOfficeID"=second_branch;
        insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_BaseCurrencyCodeSnapshot") values(second_entity,company,'EUR');
        update public."cmp_Offices" set "Office_LegalEntityID"=second_entity where "Office_ID"=branch;
        converted:=(booking_api.convert_accepted_quote_before_sync_review_20260904(branch,actor,null)->>'jobId')::uuid;
        if not exists(select 1 from public."Job_Header" where "Job_ID"=converted and "Job_OrgOfficeID"=branch and "Job_LegalEntityID"=second_entity and "Job_Status"='open') then raise exception 'Quote branch or linked entity lost';end if;
        update public."cmp_Offices" set "Office_LegalEntityID"=foreign_entity where "Office_ID"=branch;
        begin perform booking_api.default_booking_legal_entity(branch);raise exception 'Foreign entity accepted';exception when invalid_parameter_value then null;end;
        update public."cmp_Offices" set "Office_LegalEntityID"=null where "Office_ID"=branch;
        update public."cmp_LegalEntities" set "LegalEntity_IsDefault"=true where "LegalEntity_ID"=second_entity;
        begin perform booking_api.default_booking_legal_entity(branch);raise exception 'Duplicate defaults accepted';exception when invalid_parameter_value then null;end;
        update public."cmp_LegalEntities" set "LegalEntity_IsDefault"=false where "LegalEntity_ID"=second_entity;
        update public."cmp_LegalEntities" set "LegalEntity_BaseCurrencyCodeSnapshot"=null where "LegalEntity_ID"=entity;
        select count(*) into n from public."Job_Header";
        begin perform booking_api.open_booking(actor,gen_random_uuid(),'default','domestic');raise exception 'Missing currency accepted';exception when invalid_parameter_value then null;end;
        if (select count(*) from public."Job_Header")<>n then raise exception 'Failure left partial booking';end if;
        begin perform booking_api.open_booking(gen_random_uuid(),gen_random_uuid(),'default','domestic');raise exception 'Foreign actor accepted';exception when insufficient_privilege then null;end;
        if has_function_privilege('anon','booking_api.default_booking_office(uuid)','EXECUTE')
          or has_function_privilege('authenticated','booking_api.default_booking_legal_entity(uuid)','EXECUTE')
          or has_function_privilege('service_role','booking_api.default_booking_office(uuid)','EXECUTE') then raise exception 'Private helpers exposed';end if;
      end $test$;
      -- Minimal existing save/workspace providers; the new actor/ownership validation,
      -- transactions and audit wrapper are real SQL. Auth provider itself is a fixture.
      create function public."SEC_UserHasPermission"(uuid,text,uuid) returns boolean language sql as $$select false$$;
      create function public.booking_workflow_workspace(uuid,text) returns jsonb language sql as $$
      select jsonb_build_object('booking',jsonb_build_object('jobId',j."Job_ID",'officeId',j."Job_OrgOfficeID",'ownerId',j."Job_OperationsOwnerID",'updatedAt',j."Job_UpdatedAt",'editableDetails',j."Job_EditableDetailsJSON"),
      'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from booking_api.events e where e.job_id=j."Job_ID")) from public."Job_Header" j where j."Job_BookingReference"=$2$$;
      -- The historic projection does not include operational editableDetails.
      create function booking_api.workspace(uuid,text) returns jsonb language sql as $$
       select public.booking_workflow_workspace($1,$2)#-'{booking,editableDetails}'$$;
      create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb) returns jsonb language plpgsql as $$
      declare ref text;begin
       update public."Job_Header" set "Job_EditableDetailsJSON"=coalesce(payload->'editableDetails',"Job_EditableDetailsJSON"),"Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=(select "User_ID" from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id) where "Job_ID"=requested_job_id returning "Job_BookingReference" into ref;
       return public.booking_workflow_workspace(caller_auth_user_id,ref);
      end $$;
      ${editorMigration}
      ${auditWorkspaceMigration}
      do $test$
      declare company uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();foreign_user uuid:=gen_random_uuid();
       auth_a uuid:=gen_random_uuid();auth_b uuid:=gen_random_uuid();branch uuid:=gen_random_uuid();other_branch uuid:=gen_random_uuid();entity uuid:=gen_random_uuid();job uuid;stamp timestamptz;n bigint;context jsonb;
      begin
       insert into public."cmp_Users" values(a,auth_a,company,'active','Owner','A'),(b,auth_b,company,'active','Editor','B'),(foreign_user,gen_random_uuid(),gen_random_uuid(),'active','Other','Tenant');
       insert into public."cmp_Offices"("Office_ID","Company_ID") values(branch,company),(other_branch,company);
       insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_IsDefault","LegalEntity_BaseCurrencyCodeSnapshot") values(entity,company,true,'GBP');
       insert into public."cmp_Users_Offices" values(a,branch),(b,branch),(b,other_branch);
       job:=(booking_api.open_booking(auth_a,gen_random_uuid(),'default','domestic')->>'jobId')::uuid;
       if (select "Job_OperationsOwnerID" from public."Job_Header" where "Job_ID"=job)<>a then raise exception 'Initial owner not durable';end if;
       select count(*) into n from booking_api.events;
       context:=public.booking_ownership_workspace(auth_b,job);
       if context->>'ownerId'<>a::text or context->>'owner'<>'Owner A' or (select count(*) from booking_api.events)<>n then raise exception 'Viewer changed ownership or audit';end if;
       perform public.booking_workflow_save(auth_b,job,'{"editableDetails":{"customerPO":"Changed by B"},"actor_user_id":"spoof"}');
       if not exists(select 1 from booking_api.events where job_id=job and event_type='details_changed' and actor_user_id=b and metadata#>>'{after,booking,editableDetails,customerPO}'='Changed by B') then raise exception 'Details audit attributed to wrong actor';end if;
       if (select "Job_OperationsOwnerID" from public."Job_Header" where "Job_ID"=job)<>a then raise exception 'Editing reassigned owner';end if;
       select count(*) into n from booking_api.events;
       perform public.booking_workflow_save(auth_b,job,'{"editableDetails":{"customerPO":"Changed by B"}}');
       if (select count(*) from booking_api.events)<>n then raise exception 'No-op produced change audit';end if;
       select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
       perform public.booking_ownership_save(auth_b,job,other_branch,a,stamp);
       if not exists(select 1 from booking_api.events where job_id=job and event_type='ownership_changed' and actor_user_id=b and metadata#>>'{before,officeId}'=branch::text and metadata#>>'{after,officeId}'=other_branch::text) then raise exception 'Branch audit incorrect';end if;
       begin perform public.booking_ownership_save(auth_b,job,branch,b,stamp);raise exception 'Stale ownership accepted';exception when serialization_failure then null;end;
       select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
       begin perform public.booking_ownership_save(auth_b,job,other_branch,foreign_user,stamp);raise exception 'Foreign owner accepted';exception when invalid_parameter_value then null;end;
       perform public.booking_ownership_save(auth_b,job,other_branch,b,stamp);
       if not exists(select 1 from booking_api.events where job_id=job and actor_user_id=b and metadata#>>'{before,ownerId}'=a::text and metadata#>>'{after,ownerId}'=b::text) then raise exception 'Owner audit wrong';end if;
       begin perform public.booking_workflow_save(auth_b,job,jsonb_build_object('operationsOwnerId',a));raise exception 'Generic owner bypass allowed';exception when invalid_parameter_value then null;end;
       update public."Job_Header" set "Job_LegalEntityID"=gen_random_uuid() where "Job_ID"=job;
       select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
       begin perform public.booking_ownership_save(auth_b,job,branch,b,stamp);raise exception 'Billing entity switch accepted';exception when invalid_parameter_value then null;end;
       update public."Job_Header" set "Job_ProvisionalCancelled"=true where "Job_ID"=job;
       begin perform public.booking_ownership_save(auth_b,job,other_branch,a,stamp);raise exception 'Cancelled edit accepted';exception when insufficient_privilege then null;end;
       if has_function_privilege('authenticated','public.booking_ownership_save(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE') or has_function_privilege('service_role','public.booking_workflow_save_before_editor_audit_20260919(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Bypass exposed';end if;
      end $test$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
