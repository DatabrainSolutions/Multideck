import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260921154728_booking_charge_provenance.sql', import.meta.url), 'utf8')
const removalMigration = readFileSync(new URL('../migrations/20260921154731_booking_charge_removal.sql', import.meta.url), 'utf8')
const restorationMigration = readFileSync(new URL('../migrations/20260921154733_booking_charge_restoration.sql', import.meta.url), 'utf8')
const editorMigration = readFileSync(new URL('../migrations/20260921154737_booking_operational_charge_editor.sql', import.meta.url), 'utf8')
const customerReadbackMigration = readFileSync(new URL('../migrations/20260922114402_booking_quote_charge_customer_readback.sql', import.meta.url), 'utf8')
const sourceMigration = readFileSync(new URL('../migrations/20260921154738_booking_charge_source_and_bulk_guards.sql', import.meta.url), 'utf8')
const reviewMigration = readFileSync(new URL('../migrations/20260921154739_booking_quote_charge_review.sql', import.meta.url), 'utf8')
const activationMigration = readFileSync(new URL('../migrations/20260921154740_booking_charge_editor_activation.sql', import.meta.url), 'utf8')
const releaseDefinitions = process.env.BOOKING_CHARGE_RELEASE_DEFINITIONS ? JSON.parse(readFileSync(process.env.BOOKING_CHARGE_RELEASE_DEFINITIONS, 'utf8')) : []
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
const baselineFunction = name => {
  const start = baseline.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, `Missing baseline function ${name}`)
  return baseline.slice(start, baseline.indexOf('\nALTER FUNCTION', start))
}
const sourceFunctions = ['"booking_api"."convert_accepted_quote_before_sync_review_20260904"', '"booking_api"."save_operational_booking"', '"public"."booking_workflow_apply_quote_sync_before_payer_20260904"'].map(name => {
  const live = releaseDefinitions.find(row => row.signature.split('(')[0].replace(/^public\./, '') === name.replaceAll('"', '').replace(/^public\./, ''))
  return live ? live.definition + ';' : baselineFunction(name)
}).join('\n')
const releaseFunction = releaseDefinitions.find(row => row.signature === 'booking_api.release_provisional_quote_charges()')?.definition + ';'
const effectiveReleaseFunction = releaseDefinitions.length ? releaseFunction : readFileSync(new URL('../migrations/20260915174500_booking_quote_charge_domain.sql', import.meta.url), 'utf8')
test('private charge provenance: PostgreSQL authorisation, matching, stale snapshots, evidence and atomic audit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'charge-provenance-')), data = join(dir, 'data')
  let started = false
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema booking_api;
      create table public."cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,can_write boolean);
      create table public."cmp_Offices"("Office_ID" uuid primary key,"Company_ID" uuid);
      create table public."Job_Header"("Job_ID" uuid primary key,"Job_Status" text,"Job_SourceQuoteID" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_IsDeleted" boolean default false,"Job_UpdatedAt" timestamptz,"Job_UpdatedBy" uuid);
      create table public."CusQuote_Header"("CusQuoteHeader_ID" uuid primary key,"CusQuoteHeader_IsDeleted" boolean default false);
      create table public."CusQuote_Versions"("CusQuoteVersion_ID" uuid primary key,"CusQuoteHeader_ID" uuid,"CusQuoteVersion_IsSubmitted" boolean,"CusQuoteVersion_StatusCode" text,"CusQuoteVersion_SnapshotJSON" jsonb);
      create table public."Job_Costing_Lines"("JobCostingLine_ID" uuid primary key,"Job_ID" uuid,"JobCostingLine_DomainCode" text,"JobCostingLine_SourceTable" text,"JobCostingLine_SourceID" uuid,cost numeric,"JobCostingLine_SourceLineID" uuid);
      create table booking_api.events(company_id uuid,job_id uuid,event_type text,summary text,metadata jsonb,actor_user_id uuid);
      create table public."FIN_DocumentLineJobLinks"("FINDocLineJob_JobCostingLineID" uuid);
      create table public."FIN_Accruals"("FINAccrual_JobCostingLineID" uuid);
      create table public."FIN_WIPItems"("FINWIP_JobCostingLineID" uuid);
      create table public."FIN_AccrualWIPReleases"("FINRelease_JobCostingLineID" uuid);
      create table public."FIN_JobChargePeriodAllocations"("FINChargePeriod_JobCostingLineID" uuid);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select coalesce((select can_write from public."cmp_Users" where "Auth_User_ID"=$1),false)$$;
      ${migration}
      create function pg_temp.expect_failure(statement text, code text) returns void language plpgsql as $$
      begin begin execute statement; exception when others then
       if sqlstate=code then return;end if;raise;
      end;raise exception 'Expected failure %, but statement succeeded: %',code,statement;end$$;
      do $$declare
       actor uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); other_auth uuid:=gen_random_uuid();
       company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); foreign_office uuid:=gen_random_uuid();
       job uuid:=gen_random_uuid(); foreign_job uuid:=gen_random_uuid(); quote uuid:=gen_random_uuid(); version uuid:=gen_random_uuid();
       line uuid:=gen_random_uuid(); line2 uuid:=gen_random_uuid(); snapshot jsonb; result jsonb; call text; before_quote jsonb;
      begin
       insert into public."cmp_Users" values(actor,auth_id,company,'active',true),(colleague,other_auth,company,'active',true);
       insert into public."cmp_Offices" values(office,company),(foreign_office,gen_random_uuid());
       insert into public."CusQuote_Header" values(quote,false);
       insert into public."CusQuote_Versions" values(version,quote,true,'accepted','{"quote":{"charges":[{"id":"q1","costAmount":100}]}}');
       select "CusQuoteVersion_SnapshotJSON" into before_quote from public."CusQuote_Versions";
       insert into public."Job_Header"("Job_ID","Job_Status","Job_SourceQuoteID","Job_OrgOfficeID") values(job,'open',quote,office),(foreign_job,'open',quote,foreign_office);
       insert into public."Job_Costing_Lines" values(line,job,'freight',null,null,100,null),(line2,job,'freight',null,null,200,null);
       select to_jsonb(c) into snapshot from public."Job_Costing_Lines" c where "JobCostingLine_ID"=line;
       call:=format('select booking_api.record_charge_origin(%L,%L,%L,%L::jsonb,%L,%L,%L,%L)',auth_id,job,line,snapshot,'quote',version,'q1','Reviewed legacy line');
       perform pg_temp.expect_failure(replace(call,auth_id::text,gen_random_uuid()::text),'42501');
       perform pg_temp.expect_failure(replace(call,job::text,foreign_job::text),'42501');
       perform pg_temp.expect_failure(replace(call,'q1','missing'),'22023');
       update public."cmp_Users" set can_write=false where "User_ID"=actor;
       perform pg_temp.expect_failure(call,'42501');
       update public."cmp_Users" set can_write=true,"User_AccessStatus"='inactive' where "User_ID"=actor;
       perform pg_temp.expect_failure(call,'42501');
       update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
       update public."Job_Costing_Lines" set cost=101 where "JobCostingLine_ID"=line;
       perform pg_temp.expect_failure(call,'40001');
       update public."Job_Costing_Lines" set cost=100 where "JobCostingLine_ID"=line;
       insert into public."FIN_DocumentLineJobLinks" values(line);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_DocumentLineJobLinks";
       insert into public."FIN_JobChargePeriodAllocations" values(line);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_JobChargePeriodAllocations";
       insert into public."FIN_Accruals" values(line);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_Accruals";
       insert into public."FIN_WIPItems" values(line);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_WIPItems";
       insert into public."FIN_AccrualWIPReleases" values(line);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_AccrualWIPReleases";
       update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode"='draft';
       perform pg_temp.expect_failure(call,'42501');update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode"='accepted';
       update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"='{"quote":{"charges":[{"id":"q1"},{"id":"q1"}]}}';
       perform pg_temp.expect_failure(call,'22023');update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=before_quote;
       update public."Job_Header" set "Job_Status"='complete' where "Job_ID"=job;
       perform pg_temp.expect_failure(call,'55000');update public."Job_Header" set "Job_Status"='open' where "Job_ID"=job;
       if exists(select 1 from booking_api.charge_origins) or exists(select 1 from booking_api.events) then raise exception 'Rejected actions wrote data';end if;
       -- A permitted colleague, not a record owner, can make the reviewed mapping.
       execute replace(call,auth_id::text,other_auth::text) into result;
       if result->>'recorded_by'<>colleague::text or (select actor_user_id from booking_api.events)<>colleague then raise exception 'Wrong audit actor';end if;
       if (select to_jsonb(c) from public."Job_Costing_Lines" c where "JobCostingLine_ID"=line)<>snapshot then raise exception 'Charge changed';end if;
       if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions")<>before_quote then raise exception 'Quote changed';end if;
       perform pg_temp.expect_failure(call,'40001');
       perform pg_temp.expect_failure('update booking_api.charge_origins set origin=origin','55000');
       perform pg_temp.expect_failure('delete from booking_api.charge_origins','55000');
       perform pg_temp.expect_failure(format('delete from public."Job_Costing_Lines" where "JobCostingLine_ID"=%L',line),'23503');
       -- Duplicate source mappings roll back, including their audit.
       select to_jsonb(c) into snapshot from public."Job_Costing_Lines" c where "JobCostingLine_ID"=line2;
       call:=format('select booking_api.record_charge_origin(%L,%L,%L,%L::jsonb,%L,%L,%L,%L)',auth_id,job,line2,snapshot,'quote',version,'q1','Duplicate');
       perform pg_temp.expect_failure(call,'23505');
       if (select count(*) from booking_api.events)<>1 then raise exception 'Failed mapping leaked audit';end if;
       perform booking_api.record_charge_origin(auth_id,job,line2,snapshot,'booking',null,null,'Confirmed additional Booking charge');
       if (select count(*) from booking_api.charge_origins)<>2 then raise exception 'Missing manual mapping';end if;
       -- A later transaction failure must roll back map, event and timestamp.
       declare line3 uuid:=gen_random_uuid(); stamp timestamptz; begin
        insert into public."Job_Costing_Lines" values(line3,job,'freight',null,null,300,null);
        select to_jsonb(c) into snapshot from public."Job_Costing_Lines" c where "JobCostingLine_ID"=line3;
        select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
        begin
         perform booking_api.record_charge_origin(auth_id,job,line3,snapshot,'booking',null,null,'Transaction rollback test');
         raise exception 'Rollback requested' using errcode='P0001';
        exception when sqlstate 'P0001' then null;end;
        if exists(select 1 from booking_api.charge_origins where costing_line_id=line3)
          or (select count(*) from booking_api.events)<>2
          or (select "Job_UpdatedAt" from public."Job_Header" where "Job_ID"=job) is distinct from stamp then
         raise exception 'Transaction rollback failed';end if;
       end;
       if has_table_privilege('authenticated','booking_api.charge_origins','select')
         or has_function_privilege('service_role','booking_api.record_charge_origin(uuid,uuid,uuid,jsonb,text,uuid,text,text)','execute') then raise exception 'Foundation exposed';end if;
      end$$;
      ${removalMigration}
      do $$declare
       origin booking_api.charge_origins%rowtype; actor uuid; auth_id uuid; snapshot jsonb; call text; before_count int;
      begin
       select o.* into strict origin from booking_api.charge_origins o where o.origin='quote';
       select "User_ID","Auth_User_ID" into actor,auth_id from public."cmp_Users" where "User_ID"=origin.recorded_by;
       select to_jsonb(c) into snapshot from public."Job_Costing_Lines" c where "JobCostingLine_ID"=origin.costing_line_id;
       select count(*) into before_count from booking_api.events;
       call:=format('select booking_api.remove_operational_charge(%L,%L,%L,%L::jsonb,%L)',auth_id,origin.job_id,origin.costing_line_id,snapshot,'Customer no longer needs this charge');
       perform pg_temp.expect_failure(replace(call,auth_id::text,gen_random_uuid()::text),'42501');
       perform pg_temp.expect_failure(replace(call,origin.job_id::text,gen_random_uuid()::text),'42501');
       perform pg_temp.expect_failure(format('delete from public."Job_Costing_Lines" where "JobCostingLine_ID"=%L',origin.costing_line_id),'55000');
       update public."Job_Costing_Lines" set cost=101 where "JobCostingLine_ID"=origin.costing_line_id;
       perform pg_temp.expect_failure(call,'40001');
       update public."Job_Costing_Lines" set cost=100 where "JobCostingLine_ID"=origin.costing_line_id;
       insert into public."FIN_DocumentLineJobLinks" values(origin.costing_line_id);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_DocumentLineJobLinks";
       update public."Job_Header" set "Job_Status"='complete' where "Job_ID"=origin.job_id;
       perform pg_temp.expect_failure(call,'55000');update public."Job_Header" set "Job_Status"='open' where "Job_ID"=origin.job_id;
       -- A later transaction failure leaves the active line and no removal evidence.
       begin execute call;raise exception 'Force rollback';exception when raise_exception then null;end;
       if exists(select 1 from booking_api.removed_charges) or (select count(*) from booking_api.events)<>before_count
         or not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=origin.costing_line_id) then
        raise exception 'Removal rollback failed';end if;
       execute call;
       if exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=origin.costing_line_id) then raise exception 'Active row survived';end if;
       if (select before_state from booking_api.removed_charges where costing_line_id=origin.costing_line_id)<>snapshot then raise exception 'Incomplete removal history';end if;
       if not exists(select 1 from booking_api.charge_origins where costing_line_id=origin.costing_line_id) then raise exception 'Origin history lost';end if;
       if not exists(select 1 from booking_api.events where event_type='operational_charge_removed' and actor_user_id=actor
         and metadata->'before'=snapshot and metadata->'after'='null'::jsonb) then raise exception 'Missing actor/diff audit';end if;
       if not exists(select 1 from public."Job_Costing_Lines" where cost=200) then raise exception 'Booking-added line affected';end if;
       if (select "CusQuoteVersion_SnapshotJSON"#>>'{quote,charges,0,costAmount}' from public."CusQuote_Versions")<>'100' then raise exception 'Accepted Quote changed';end if;
       perform pg_temp.expect_failure(call,'42501');
       perform pg_temp.expect_failure('delete from booking_api.removed_charges','55000');
       perform pg_temp.expect_failure('update booking_api.removed_charges set reason=reason','55000');
       if has_function_privilege('service_role','booking_api.remove_operational_charge(uuid,uuid,uuid,jsonb,text)','execute')
         or has_table_privilege('authenticated','booking_api.removed_charges','select') then raise exception 'Private removal exposed';end if;
      end$$;
      ${restorationMigration}
      do $$declare
       removed booking_api.removed_charges%rowtype; auth_id uuid; call text; event_count int; second_removal jsonb;
      begin
       select * into strict removed from booking_api.removed_charges;
       select "Auth_User_ID" into auth_id from public."cmp_Users" where "User_ID"=removed.removed_by;
       call:=format('select booking_api.restore_operational_charge(%L,%L,%L,%L::jsonb,%L)',auth_id,removed.job_id,removed.removal_id,removed.before_state,'Explicitly requested by operator');
       perform pg_temp.expect_failure(replace(call,auth_id::text,gen_random_uuid()::text),'42501');
       perform pg_temp.expect_failure(replace(call,removed.job_id::text,gen_random_uuid()::text),'42501');
       perform pg_temp.expect_failure(format('select booking_api.restore_operational_charge(%L,%L,%L,%L::jsonb,%L)',auth_id,removed.job_id,removed.removal_id,'{}','Stale snapshot'),'40001');
       update public."cmp_Users" set can_write=false where "Auth_User_ID"=auth_id;
       perform pg_temp.expect_failure(call,'42501');
       update public."cmp_Users" set can_write=true where "Auth_User_ID"=auth_id;
       insert into public."FIN_DocumentLineJobLinks" values(removed.costing_line_id);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_DocumentLineJobLinks";
       perform pg_temp.expect_failure(format('insert into public."Job_Costing_Lines" select * from jsonb_populate_record(null::public."Job_Costing_Lines",%L::jsonb)',removed.before_state),'55000');
       update public."Job_Header" set "Job_Status"='cancelled' where "Job_ID"=removed.job_id;
       perform pg_temp.expect_failure(call,'55000');
       update public."Job_Header" set "Job_Status"='open' where "Job_ID"=removed.job_id;
       select count(*) into event_count from booking_api.events;
       begin execute call;raise exception 'Force rollback';exception when raise_exception then null;end;
       if exists(select 1 from booking_api.charge_restorations) or (select count(*) from booking_api.events)<>event_count
        or exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=removed.costing_line_id) then
        raise exception 'Restoration rollback failed';end if;
       execute call;
       if (select to_jsonb(c) from public."Job_Costing_Lines" c where "JobCostingLine_ID"=removed.costing_line_id)<>removed.before_state then
        raise exception 'Restoration changed the original line';end if;
       if not exists(select 1 from booking_api.events where event_type='operational_charge_restored'
        and actor_user_id=removed.removed_by and metadata->'after'=removed.before_state) then raise exception 'Restoration audit missing';end if;
       perform pg_temp.expect_failure(call,'40001');
       -- An old archive must not authorise a later unlogged deletion.
       perform pg_temp.expect_failure(format('delete from public."Job_Costing_Lines" where "JobCostingLine_ID"=%L',removed.costing_line_id),'55000');
       second_removal:=booking_api.remove_operational_charge(auth_id,removed.job_id,removed.costing_line_id,removed.before_state,'Removed again after review');
       if second_removal->>'removal_id'=removed.removal_id::text or (select count(*) from booking_api.removed_charges)<>2 then
        raise exception 'Repeat removal lost historical identity';end if;
       perform pg_temp.expect_failure(call,'40001');
       perform booking_api.restore_operational_charge(auth_id,removed.job_id,(second_removal->>'removal_id')::uuid,removed.before_state,'Second explicit restoration');
       if (select count(*) from booking_api.charge_restorations)<>2 then raise exception 'Restoration history lost';end if;
       perform pg_temp.expect_failure('delete from booking_api.charge_restorations','55000');
       perform pg_temp.expect_failure('update booking_api.charge_restorations set reason=reason','55000');
       if not exists(select 1 from public."Job_Costing_Lines" where cost=200)
        or (select "CusQuoteVersion_SnapshotJSON"#>>'{quote,charges,0,costAmount}' from public."CusQuote_Versions")<>'100' then
        raise exception 'Unrelated charge or accepted Quote changed';end if;
       if has_function_privilege('service_role','booking_api.restore_operational_charge(uuid,uuid,uuid,jsonb,text)','execute')
        or has_table_privilege('authenticated','booking_api.charge_restorations','select') then raise exception 'Private restoration exposed';end if;
      end$$;
      alter table public."Job_Header" add column "Job_LegalEntityID" uuid;
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      alter table public."Job_Costing_Lines"
       add column "JobCostingLine_Number" integer,
       add column "JobCostingLine_Description" text,
       add column "JobCostingLine_SupplierID" uuid,
       add column "JobCostingLine_CostAmountCurrency" numeric(18,4),
       add column "JobCostingLine_RevenueAmountCurrency" numeric(18,4),
       add column "JobCostingLine_CostAmountLocal" numeric(18,4),
       add column "JobCostingLine_RevenueAmountLocal" numeric(18,4),
       add column "JobCostingLine_CostROE" numeric(18,5),
       add column "JobCostingLine_RevenueROE" numeric(18,5),
       add column "JobCostingLine_SourceMetadataJSON" jsonb default '{}',
       add column "JobCostingLine_CreatedBy" uuid,
       add column "JobCostingLine_UpdatedBy" uuid,
       add column "JobCostingLine_UpdatedAt" timestamptz;
      create table booking_api.planning_charge_releases(job_id uuid,costing_line_ids uuid[]);
      -- Dependency fixtures: production catalogue/access functions are exercised
      -- by the existing planning/access suites. No identity comes from the body.
      create function booking_api.planning_charge_workspace(uuid,uuid) returns jsonb language plpgsql as $$begin
       if not exists(select 1 from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=j."Job_OrgOfficeID"
        join public."cmp_Users" u on u."Company_ID"=o."Company_ID" where j."Job_ID"=$2 and u."Auth_User_ID"=$1 and u."User_AccessStatus"='active') then
        raise exception 'Denied' using errcode='42501';end if;
       return '{"currencies":[{"code":"GBP"},{"code":"USD"}],"parties":[]}';end $$;
      create function booking_api.validate_planning_charge_parties(jsonb,jsonb) returns void language plpgsql as $$begin
       if exists(select 1 from jsonb_array_elements($1) r where r->>'supplierId' is not null or r->>'customerId' is not null) then
        raise exception 'Unavailable party' using errcode='22023';end if;end $$;
      ${editorMigration}
      ${customerReadbackMigration}
      do $$declare value jsonb; result jsonb; customer uuid:=gen_random_uuid(); replacement uuid:=gen_random_uuid();
      begin
       value:=jsonb_build_object('JobCostingLine_SourceMetadataJSON',jsonb_build_object('quoteCharge',jsonb_build_object('customerId',customer)));
       result:=booking_api.operational_charge_values(value);
       if result->>'customerId' is distinct from customer::text then raise exception 'Accepted Quote customer missing';end if;
       value:=jsonb_set(value,'{JobCostingLine_SourceMetadataJSON,bookingCharge}',jsonb_build_object('customerId',replacement));
       if booking_api.operational_charge_values(value)->>'customerId' is distinct from replacement::text then raise exception 'Operator customer overridden';end if;
       value:=jsonb_set(value,'{JobCostingLine_SourceMetadataJSON,bookingCharge,customerId}','null');
       if booking_api.operational_charge_values(value)->'customerId' is distinct from 'null'::jsonb then raise exception 'Explicit clearing undone';end if;
       if booking_api.operational_charge_values('{}')->'customerId' is distinct from 'null'::jsonb then raise exception 'Legacy customer invented';end if;
      end $$;
      do $$declare auth_id uuid; actor uuid; company uuid; office uuid; entity uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
       line_id uuid:=gen_random_uuid(); other_line uuid:=gen_random_uuid(); value jsonb; context jsonb; saved jsonb; op jsonb; call text; stamp timestamptz;
      begin
       select "Auth_User_ID","User_ID","Company_ID" into auth_id,actor,company from public."cmp_Users" limit 1;
       select "Office_ID" into office from public."cmp_Offices" where "Company_ID"=company;
       insert into public."cmp_LegalEntities" values(entity,company,true,'GBP');
       insert into public."Job_Header"("Job_ID","Job_Status","Job_OrgOfficeID","Job_LegalEntityID","Job_UpdatedAt") values(job,'open',office,entity,clock_timestamp());
       value:=jsonb_build_object('id',line_id,'code','TEST','description','Operational charge','cost',100,'sell',150,'costCurrency','GBP','sellCurrency','GBP',
        'costRoe',1,'sellRoe',1,'quantity',1,'calculationBasis','fixed','supplierId',null,'customerId',null);
       op:=jsonb_build_object('id',line_id,'action','add','after',value,'reason','Charge agreed');
       select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
       call:=format('select booking_api.save_operational_charges(%L,%L,%L,%L::jsonb)',auth_id,job,stamp,jsonb_build_array(op));
       perform pg_temp.expect_failure(replace(call,auth_id::text,gen_random_uuid()::text),'42501');
       update public."Job_Header" set "Job_Status"='draft' where "Job_ID"=job;
       perform pg_temp.expect_failure(call,'55000');update public."Job_Header" set "Job_Status"='open' where "Job_ID"=job;
       execute call into context;
       if (context#>>'{lines,0,values,cost}')::numeric<>100 or (context#>>'{lines,0,values,sell}')::numeric<>150 then raise exception 'Add readback failed';end if;
       perform pg_temp.expect_failure(call,'40001');
       saved:=context#>'{lines,0,snapshot}';
       value:=value||'{"cost":125,"sell":175}';
       op:=jsonb_build_object('id',line_id,'action','update','before',saved,'after',value,'reason','Customer agreed revision');
       call:=format('select booking_api.save_operational_charges(%L,%L,%L,%L::jsonb)',auth_id,job,context->>'bookingUpdatedAt',jsonb_build_array(op));
       insert into public."FIN_DocumentLineJobLinks" values(line_id);
       perform pg_temp.expect_failure(call,'55000');delete from public."FIN_DocumentLineJobLinks";
       execute call into context;
       if (context#>>'{lines,0,values,cost}')::numeric<>125 or (select "JobCostingLine_CostAmountLocal" from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id)<>125 then raise exception 'Update failed';end if;
       if not exists(select 1 from booking_api.events where job_id=job and event_type='operational_charge_saved' and actor_user_id=actor
        and metadata#>>'{planningHistory,beforeRows,0,cost}'='100.0000' and metadata#>>'{planningHistory,afterRows,0,cost}'='125.0000') then raise exception 'Change audit incomplete';end if;
       saved:=context#>'{lines,0,snapshot}';
       op:=jsonb_build_object('id',line_id,'action','remove','before',saved,'reason','No longer required');
       -- Whole batch rolls back when the following add is invalid.
       call:=format('select booking_api.save_operational_charges(%L,%L,%L,%L::jsonb)',auth_id,job,context->>'bookingUpdatedAt',
        jsonb_build_array(op,jsonb_build_object('id',other_line,'action','add','reason','Invalid','after',value||jsonb_build_object('id',other_line,'cost',-1))));
       perform pg_temp.expect_failure(call,'22023');
       if not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id) or exists(select 1 from booking_api.removed_charges where costing_line_id=line_id) then raise exception 'Batch rollback failed';end if;
       context:=booking_api.save_operational_charges(auth_id,job,(context->>'bookingUpdatedAt')::timestamptz,jsonb_build_array(op));
       if context->'lines'<>'[]'::jsonb or not exists(select 1 from booking_api.removed_charges where costing_line_id=line_id and before_state=saved) then raise exception 'Removal failed';end if;
       call:=format('select booking_api.save_operational_charges(%L,%L,%L,%L::jsonb)',auth_id,job,context->>'bookingUpdatedAt',
        jsonb_build_array(jsonb_build_object('id',line_id,'action','add','reason','Cannot silently restore','after',value)));
       perform pg_temp.expect_failure(call,'40001');
       if has_function_privilege('service_role','booking_api.save_operational_charges(uuid,uuid,timestamptz,jsonb)','execute') then raise exception 'Incomplete editor exposed';end if;
      end$$;
      alter table public."Job_Header" add column "Job_Customer" uuid, add column "Job_SourceQuoteVersionID" uuid, add column "Job_SourceQuoteResponseID" uuid,
       add column "Job_PendingQuoteVersionID" uuid, add column "Job_PendingQuoteResponseID" uuid, add column "Job_QuoteSyncStatus" text,
       add column "Job_QuoteSyncDetectedAt" timestamptz, add column "Job_SourceSnapshotJSON" jsonb default '{}';
      alter table public."Job_Costing_Lines" add column "JobCostingLine_InternalNotes" text, add column "JobCostingLine_CustomerNotes" text, add column "JobCostingLine_ShowToCustomer" boolean default true;
      create table booking_api.quote_sync_reviews(review_id uuid primary key,job_id uuid,company_id uuid,quote_id uuid,applied_version_id uuid,proposed_version_id uuid,
       proposed_response_id uuid,status_code text,applied_fields jsonb default '[]',differences jsonb default '[]',created_at timestamptz default now(),decided_at timestamptz,decided_by uuid);
      -- The wider cargo/routing projection is tested in its own suite. Model its
      -- refreshed comparison independently of the stored review for this fixture.
      create table booking_api.test_fresh_differences(review_id uuid primary key,differences jsonb);
      create function booking_api.refreshed_cargo_review(uuid) returns jsonb language sql as $$
       select jsonb_build_object('differences',coalesce((select differences from booking_api.test_fresh_differences where review_id=$1),differences))
       from booking_api.quote_sync_reviews where review_id=$1
      $$;
      ${sourceFunctions}
      ${effectiveReleaseFunction}
      ${sourceMigration}
      alter table public."CusQuote_Versions" add column "CusQuoteVersion_Number" integer default 1;
      ${reviewMigration}
      do $$declare actor uuid; auth_id uuid; company uuid; office uuid; entity uuid; job uuid:=gen_random_uuid(); quote uuid:=gen_random_uuid();
       v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); review_id_value uuid:=gen_random_uuid(); source_line uuid:=gen_random_uuid();
       line_id uuid:=gen_random_uuid(); manual_id uuid:=gen_random_uuid(); charge jsonb; review jsonb; context jsonb; call text;
      begin
       select "Auth_User_ID","User_ID","Company_ID" into auth_id,actor,company from public."cmp_Users" limit 1;
       select "Office_ID" into office from public."cmp_Offices" where "Company_ID"=company;
       select "LegalEntity_ID" into entity from public."cmp_LegalEntities" where "Company_ID"=company;
       insert into public."CusQuote_Header" values(quote,false);
       charge:=jsonb_build_object('id',source_line,'description','Quoted freight','costAmount',100,'sellAmount',150,'costCurrency','GBP','sellCurrency','GBP',
        'costRoe',1,'sellRoe',1,'quantity',1,'internalNotes','Original notes','customerNotes','Customer notes','showToCustomer',true);
       insert into public."CusQuote_Versions" values(v1,quote,true,'accepted',jsonb_build_object('quote',jsonb_build_object('charges',jsonb_build_array(charge))),default),
        (v2,quote,true,'accepted',jsonb_build_object('quote',jsonb_build_object('charges',jsonb_build_array(charge||'{"costAmount":125,"sellAmount":175,"internalNotes":"Revised notes"}'))),default);
       insert into public."Job_Header"("Job_ID","Job_Status","Job_OrgOfficeID","Job_LegalEntityID","Job_UpdatedAt","Job_SourceQuoteID","Job_SourceQuoteVersionID","Job_PendingQuoteVersionID")
        values(job,'open',office,entity,clock_timestamp(),quote,v1,v2);
       insert into public."Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_DomainCode","JobCostingLine_SourceTable","JobCostingLine_SourceID",
        "JobCostingLine_SourceMetadataJSON","JobCostingLine_CreatedBy","JobCostingLine_Description","JobCostingLine_CostAmountCurrency","JobCostingLine_RevenueAmountCurrency","JobCostingLine_CostROE","JobCostingLine_RevenueROE")
        values(line_id,job,'freight','CusQuote_Versions',v1,jsonb_build_object('quoteCharge',charge),actor,'Quoted freight',100,150,1,1);
       if not exists(select 1 from booking_api.charge_origins where costing_line_id=line_id and quote_line_id=source_line::text) then raise exception 'Creation lost source identity';end if;
       insert into booking_api.quote_sync_reviews(review_id,job_id,company_id,quote_id,applied_version_id,proposed_version_id,status_code,differences)
        values(review_id_value,job,company,quote,v1,v2,'pending','[{"key":"charges"}]');
       context:=booking_api.operational_charge_workspace(auth_id,job);
       perform booking_api.save_operational_charges(auth_id,job,(context->>'bookingUpdatedAt')::timestamptz,
        jsonb_build_array(jsonb_build_object('id',manual_id,'action','add','reason','Booking extra','after',booking_api.quote_charge_values(charge,manual_id,null))));
       review:=booking_api.quote_charge_review(auth_id,job);
       if jsonb_array_length(review->'items')<>2 then raise exception 'Review did not include preserved manual line';end if;
       call:=format('select booking_api.apply_quote_charge_review(%L,%L,%L,%L,%L::jsonb,%L)',auth_id,job,review_id_value,review->>'token',
        jsonb_build_array(jsonb_build_object('key','booking:'||manual_id,'action','replace')),'Cannot replace manual');
       perform pg_temp.expect_failure(call,'55000');
       perform pg_temp.expect_failure(replace(call,review->>'token','stale'),'40001');
       call:=format('select booking_api.apply_quote_charge_review(%L,%L,%L,%L,%L::jsonb,%L)',auth_id,job,review_id_value,review->>'token',
        jsonb_build_array(jsonb_build_object('key','booking:'||line_id,'action','replace')),'Accepted revised price');
       execute call;
       if (select "JobCostingLine_CostAmountCurrency" from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id)<>125
        or (select "JobCostingLine_InternalNotes" from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id)<>'Revised notes'
        or (select "JobCostingLine_CostAmountCurrency" from public."Job_Costing_Lines" where "JobCostingLine_ID"=manual_id)<>100 then raise exception 'Line-level preservation failed';end if;
       if (select "CusQuoteVersion_SnapshotJSON"#>>'{quote,charges,0,costAmount}' from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1)<>'100' then raise exception 'Original Quote changed';end if;
       if booking_api.quote_charge_review(auth_id,job) is not null then raise exception 'Completed charge review remained pending';end if;
       if not exists(select 1 from booking_api.events where job_id=job and event_type='quote_charge_decisions' and actor_user_id=actor
        and jsonb_array_length(metadata->'decisions')=2) then raise exception 'Decision receipt missing';end if;
       -- A later accepted version omits this line; explicit removal preserves the
       -- manual extra. Another version offers restoration, never an implicit add.
       v2:=gen_random_uuid(); review_id_value:=gen_random_uuid();
       insert into public."CusQuote_Versions" values(v2,quote,true,'accepted','{"quote":{"charges":[]}}',default);
       update public."Job_Header" set "Job_PendingQuoteVersionID"=v2 where "Job_ID"=job;
       insert into booking_api.quote_sync_reviews(review_id,job_id,company_id,quote_id,proposed_version_id,status_code,differences)
        values(review_id_value,job,company,quote,v2,'pending','[{"key":"charges"}]');
       update booking_api.quote_sync_reviews set applied_version_id=(select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job) where review_id=review_id_value;
       review:=booking_api.quote_charge_review(auth_id,job);
       perform booking_api.apply_quote_charge_review(auth_id,job,review_id_value,review->>'token',jsonb_build_array(jsonb_build_object('key','booking:'||line_id,'action','remove')),'Service removed');
       if exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id) or not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=manual_id) then raise exception 'Selective removal failed';end if;
       v2:=gen_random_uuid(); review_id_value:=gen_random_uuid();
       insert into public."CusQuote_Versions" values(v2,quote,true,'accepted',jsonb_build_object('quote',jsonb_build_object('charges',jsonb_build_array(charge,charge||jsonb_build_object('id',gen_random_uuid(),'description','New quote line')))),default);
       update public."Job_Header" set "Job_PendingQuoteVersionID"=v2 where "Job_ID"=job;
       insert into booking_api.quote_sync_reviews(review_id,job_id,company_id,quote_id,proposed_version_id,status_code,differences)
        values(review_id_value,job,company,quote,v2,'pending','[{"key":"charges"}]');
       update booking_api.quote_sync_reviews set applied_version_id=(select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job) where review_id=review_id_value;
       review:=booking_api.quote_charge_review(auth_id,job);
       if not exists(select 1 from jsonb_array_elements(review->'items') i where i->>'kind'='restore' and i->>'bookingLineId'=line_id::text) then raise exception 'Restore not explicitly offered';end if;
       call:=format('select booking_api.apply_quote_charge_review(%L,%L,%L,%L,%L::jsonb,%L)',auth_id,job,review_id_value,review->>'token',
        jsonb_build_array(jsonb_build_object('key','quote:'||source_line,'action','add')),'Cannot add discarded line');
       perform pg_temp.expect_failure(call,'55000');
       perform booking_api.apply_quote_charge_review(auth_id,job,review_id_value,review->>'token',
        (select jsonb_agg(jsonb_build_object('key',i->>'key','action',i->>'kind')) from jsonb_array_elements(review->'items') i where i->>'kind' in ('restore','add')),'Explicit restoration and additional service');
       if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>3
       or not exists(select 1 from booking_api.charge_restorations s join booking_api.removed_charges r using(removal_id) where r.costing_line_id=line_id) then raise exception 'Restore/add failed';end if;
       -- A newly refreshed non-charge difference must prevent premature finalisation,
       -- even when the stored review listed only charges. Keep changes no lines.
       v1:=v2; v2:=gen_random_uuid(); review_id_value:=gen_random_uuid();
       insert into public."CusQuote_Versions" select v2,quote,true,'accepted',"CusQuoteVersion_SnapshotJSON",1 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
       update public."Job_Header" set "Job_PendingQuoteVersionID"=v2 where "Job_ID"=job;
       insert into booking_api.quote_sync_reviews(review_id,job_id,company_id,quote_id,applied_version_id,proposed_version_id,status_code,differences)
        values(review_id_value,job,company,quote,v1,v2,'pending','[{"key":"charges"}]');
       insert into booking_api.test_fresh_differences values(review_id_value,'[{"key":"charges"},{"key":"routingPlan"}]');
       review:=booking_api.quote_charge_review(auth_id,job);
       perform booking_api.apply_quote_charge_review(auth_id,job,review_id_value,review->>'token','[]','Keep all current charges');
       if not exists(select 1 from public."Job_Header" where "Job_ID"=job and "Job_SourceQuoteVersionID"=v1 and "Job_PendingQuoteVersionID"=v2 and "Job_QuoteSyncStatus"='partially_applied')
        or (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>3 then raise exception 'Fresh non-charge review was lost';end if;
      end$$;
      create table booking_api.provisional_cancellations(job_id uuid,decision text,review_required boolean);
      ${releaseDefinitions.find(row => row.signature.replace(/^public\./, '') === 'booking_provisional_state(uuid,uuid)')?.definition ?? "create function public.booking_provisional_state(uuid,uuid) returns jsonb language sql as $$select jsonb_build_object('planningEditorSupported',true)$$"};
      ${releaseDefinitions.find(row => row.signature === 'booking_api.refreshed_cargo_review(uuid)')?.definition ?? baselineFunction('"booking_api"."refreshed_cargo_review"')};
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Description" text,"AIDexterDomain_Code" text);
      create table public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Description" text,"AIDexterWatchCapability_Code" text);
      ${releaseDefinitions.find(row => row.signature === 'booking_api.workspace_before_goods_value_20260905(uuid,text)')?.definition ?? baselineFunction('"booking_api"."workspace_before_goods_value_20260905"')};
      ${releaseDefinitions.some(row => row.signature === 'booking_api.workspace_before_goods_value_20260905(uuid,text)') ? '' : readFileSync(new URL('../migrations/20260919151833_booking_planning_charge_readback.sql', import.meta.url), 'utf8')}
      ${activationMigration}
      do $$begin
       if not has_function_privilege('service_role','public.booking_operational_charges_save(uuid,uuid,timestamptz,jsonb)','execute')
        or has_function_privilege('authenticated','public.booking_operational_charges_save(uuid,uuid,timestamptz,jsonb)','execute')
        or has_function_privilege('anon','public.booking_quote_charge_review_apply(uuid,uuid,uuid,text,jsonb,text)','execute') then raise exception 'Unsafe endpoint grants';end if;
      end$$;
    `)
    // Real FK key-share locks serialize financial linking against our FOR UPDATE
    // charge locks, including the financial link with ON DELETE SET NULL.
    const connection = ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    run('psql', connection, `alter table public."FIN_DocumentLineJobLinks" add foreign key ("FINDocLineJob_JobCostingLineID") references public."Job_Costing_Lines"("JobCostingLine_ID") on delete set null;`)
    const line = run('psql', [...connection, '-At'], `select c."JobCostingLine_ID" from public."Job_Costing_Lines" c join booking_api.charge_origins o on o.costing_line_id=c."JobCostingLine_ID" limit 1`).trim()
    assert.match(line, /^[a-f0-9-]{36}$/)
    const locker = spawn(join(bin, 'psql'), [...connection, '-At'], { stdio: ['pipe', 'pipe', 'pipe'] })
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Charge lock fixture timed out')), 10000)
        locker.once('error', error => { clearTimeout(timer); reject(error) })
        locker.stdout.on('data', data => { if (data.toString().includes('CHARGE_LOCKED')) { clearTimeout(timer); resolve() } })
        locker.stdin.write(`begin; select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"='${line}' for update; select 'CHARGE_LOCKED';\n`)
      })
      const linked = spawnSync(join(bin, 'psql'), connection, { encoding: 'utf8', timeout: 5000,
        input: `set lock_timeout='300ms'; insert into public."FIN_DocumentLineJobLinks" values('${line}');` })
      assert.notEqual(linked.status, 0)
      assert.match(linked.stderr, /lock timeout/)
    } finally {
      locker.stdin.end('rollback;\\q\n')
      await new Promise(resolve => locker.once('exit', resolve))
    }
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
