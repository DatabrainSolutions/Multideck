import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const migration=readFileSync(new URL('../migrations/20260910151110_booking_provisional_lifecycle.sql',import.meta.url),'utf8')
const financeMigration=readFileSync(new URL('../migrations/20260910151116_provisional_no_financial_records.sql',import.meta.url),'utf8')
const cancelCustomerMigration=readFileSync(new URL('../migrations/20260922115340_provisional_cancel_without_customer.sql',import.meta.url),'utf8')
const cancellationMigrationName='20260919080625_provisional_cancellation_audit.sql'
const cancellationMigration=readFileSync(new URL(`../migrations/${cancellationMigrationName}`,import.meta.url),'utf8')
const cancellationChecks=readFileSync(new URL('./provisional-cancellation-checks.sql',import.meta.url),'utf8')
const chargeDomainMigration=readFileSync(new URL('../migrations/20260915174500_booking_quote_charge_domain.sql',import.meta.url),'utf8')
const planningMigration=readFileSync(new URL('../migrations/20260919095813_booking_planning_charge_foundation.sql',import.meta.url),'utf8')
const planningChecks=readFileSync(new URL('./booking-planning-charge-foundation-checks.sql',import.meta.url),'utf8')
const planningCancellationMigration=readFileSync(new URL('../migrations/20260919102445_booking_manual_planning_cancellation.sql',import.meta.url),'utf8')
const planningCancellationChecks=readFileSync(new URL('./booking-manual-planning-cancellation-checks.sql',import.meta.url),'utf8')
const planningReleaseMigration=readFileSync(new URL('../migrations/20260919102957_booking_planning_charge_release.sql',import.meta.url),'utf8')
const planningReleaseChecks=readFileSync(new URL('./booking-planning-charge-release-checks.sql',import.meta.url),'utf8')
const planningAccessMigration=readFileSync(new URL('../migrations/20260919110708_booking_planning_charge_access.sql',import.meta.url),'utf8')
const planningAccessChecks=readFileSync(new URL('./booking-planning-charge-access-checks.sql',import.meta.url),'utf8')
const planningPartyMigration=readFileSync(new URL('../migrations/20260919113132_booking_planning_charge_parties.sql',import.meta.url),'utf8')
const planningPartyChecks=readFileSync(new URL('./booking-planning-charge-party-checks.sql',import.meta.url),'utf8')
assert.ok(cancellationMigrationName > '20260915174500_booking_quote_charge_domain.sql', 'Cancellation protection must run after the freight-domain function replacement')
const baseline=readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8')
// Optional read-only release snapshot: rehearse deployed lifecycle definitions
// in this disposable database, never against the connected service.
const releaseDefinitions=process.env.BOOKING_RELEASE_DEFINITIONS
 ? JSON.parse(readFileSync(process.env.BOOKING_RELEASE_DEFINITIONS,'utf8')) : []
const liveLifecycleDefinitions=releaseDefinitions.filter(row=>!row.signature.includes('workspace_before_goods_value')).map(row=>row.definition+';').join('\n')
const chargeProjectionSource=releaseDefinitions.find(row=>row.signature.includes('workspace_before_goods_value'))?.definition ?? baseline
const readbackMigration=readFileSync(new URL('../migrations/20260919151833_booking_planning_charge_readback.sql',import.meta.url),'utf8')
const auditDetailsMigration=readFileSync(new URL('../migrations/20260919202654_booking_planning_audit_details.sql',import.meta.url),'utf8')
const chargeProjectionEnd=chargeProjectionSource.indexOf('into charges_value from public."Job_Costing_Lines" charge where charge."Job_ID" = job_row."Job_ID";')
const chargeProjection=chargeProjectionSource.slice(chargeProjectionSource.lastIndexOf('  select coalesce(jsonb_agg',chargeProjectionEnd),chargeProjectionEnd)+'into charges_value from public."Job_Costing_Lines" charge where charge."Job_ID" = job_row."Job_ID";'
assert.ok(chargeProjectionEnd>0 && chargeProjection.includes('costAmount'))
const crmAccessStart=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."multideck_crm_company_can_access_account"(')
const crmAccessFunction=baseline.slice(crmAccessStart,baseline.indexOf('\nALTER FUNCTION',crmAccessStart))
assert.ok(crmAccessStart>=0 && crmAccessFunction.includes('developmentFixture'))
const financeChargeStart=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."_multideck_finance_upsert_job_charge"(')
const financeChargeFunction=baseline.slice(financeChargeStart,baseline.indexOf('\nALTER FUNCTION',financeChargeStart))
assert.ok(financeChargeStart>=0 && financeChargeFunction.includes('return v_line_id;'), 'Use the real Finance charge function in the release fixture')
const tableStart=baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."Job_Costing_Lines" (')
const costingTable=baseline.slice(tableStart,baseline.indexOf('\n);',tableStart)+3)
const registerSource=readFileSync(new URL('../migrations/20260818201000_commercial_register_paging.sql',import.meta.url),'utf8')
const registerStart=registerSource.indexOf('create or replace function public.multideck_booking_register_page(')
const registerFunction=registerSource.slice(registerStart,registerSource.indexOf('create or replace function public.multideck_quote_register_page(',registerStart))
const registerFields=[...new Set([...registerFunction.matchAll(/booking\."([^"]+)"/g)].map(m=>m[1]))]
const registerView=registerFields.map(name=>{
 if(name==='Job_ID')return '"Job_ID"'
 if(name==='Booking_Reference')return '"Job_ID"::text as "Booking_Reference"'
 if(name==='Customer_Name')return '\'Customer\'::text as "Customer_Name"'
 if(name==='Status')return 'case when "Job_Status"=\'draft\' then \'Draft\' when "Job_Status"=\'booked\' then \'Exception\' else \'On track\' end as "Status"'
 if(name==='Progress')return 'case when "Job_Status"=\'complete\' then 100 else 0 end as "Progress"'
 if(name==='Is_Favourite')return 'false as "Is_Favourite"'
 if(name==='Custom_Fields')return '\'[]\'::jsonb as "Custom_Fields"'
 if(name.endsWith('_Date'))return `null::date as "${name}"`
 if(name.endsWith('_At'))return `null::timestamptz as "${name}"`
 return `''::text as "${name}"`
}).join(',')

test('real lifecycle migration: same record, validation rollback, scope, concurrency, audit and job-report exclusion',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'booking-lifecycle-')), data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout}
 try{
 run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
 run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
 run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
 create table public."Job_Header"("Job_Status" varchar(30),"Job_Customer" uuid,"Job_ProvisionalCancelled" boolean default false,
 constraint "CK_Job_Header_customer_after_draft" check ("Job_Status"='draft' or "Job_Customer" is not null));
 ${cancelCustomerMigration}
 insert into public."Job_Header" values('draft',null,false),('cancelled',null,true),('open',gen_random_uuid(),false);
 do $$declare state text;begin
 foreach state in array array['open','complete','cancelled'] loop
  begin insert into public."Job_Header" values(state,null,false);
   raise exception 'Missing customer allowed for %',state;
  exception when check_violation then null;end;
 end loop;
 update public."Job_Header" set "Job_Status"='draft',"Job_ProvisionalCancelled"=false where "Job_Status"='cancelled';
 end $$;
 drop table public."Job_Header";
 `)
 run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
 create role anon;create role authenticated;create role service_role;create schema booking_api;
 create table public."cmp_Users"("Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,can_write boolean);
 create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
 create table public."Job_Header"("Job_ID" uuid primary key,"Job_Status" text,"Job_Customer" uuid,"Job_TransportModeSummary" text,
 "Job_OriginUNLocode" text,"Job_OriginNameSnapshot" text,"Job_DestinationUNLocode" text,"Job_DestinationNameSnapshot" text,
 "Job_ClosedDate" date,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_UpdatedBy" uuid,"Job_UpdatedAt" timestamptz default now(),"Job_IsDeleted" boolean default false);
 create table public."sys_JobStatuses"("JS_Code" text primary key,"JS_Name" text,"JS_Description" text,"JS_IsFinal" boolean,"JS_SortOrder" int,"JS_IsActive" boolean);
 create table booking_api.events(company_id uuid,job_id uuid,event_type text,summary text,metadata jsonb,actor_user_id uuid);
 create table public."FIN_Documents"("FINDoc_ID" uuid,"FINDoc_SourceJobID" uuid,"FINDoc_PostingStatusCode" text);
 create table public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID" uuid,"FINDocLineJob_JobID" uuid);
 create table public."FIN_WIPItems"("FINWIP_JobID" uuid);create table public."FIN_Accruals"("FINAccrual_JobID" uuid);
 create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Description" text);
 create table public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text);
 create view public."App_Live_Bookings" with(security_invoker=true) as select ${registerView} from public."Job_Header";
 create view public."FIN_JobFinanceSummary" with(security_invoker=true) as select "Job_ID",10 amount from public."Job_Header";
 create view public."FIN_JobChargeFinanceSummary" with(security_invoker=true) as select "Job_ID" as "FINChargeState_JobID",10 amount from public."Job_Header";
 create schema auth;create function auth.uid() returns uuid language sql as $$select gen_random_uuid()$$;
 create function public.multideck_register_filter_matches(jsonb,jsonb) returns boolean language sql as $$select true$$;
 ${registerFunction}
 create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select coalesce((select can_write from public."cmp_Users" where "Auth_User_ID"=$1),false)$$;
 create function booking_api.workspace_with_document_groups(uuid,text) returns jsonb language sql as $$select '{"documents":["retained"],"booking":{"id":"same"}}'::jsonb$$;
 -- The existing aggregate save is a fixture; real new wrapper and row triggers
 -- are exercised. Other aggregate stages have separate preservation tests.
 create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb) returns jsonb language plpgsql as $$begin
 update public."Job_Header" set "Job_Status"=coalesce(payload->>'status',"Job_Status"),"Job_UpdatedBy"=caller_auth_user_id,"Job_UpdatedAt"=clock_timestamp() where "Job_ID"=requested_job_id;
 return booking_api.workspace_with_document_groups(caller_auth_user_id,'same');end$$;
 ${migration}
 alter table public."Job_Header" add column "Job_SourceQuoteID" uuid,add column "Job_SourceSnapshotJSON" jsonb;
 alter table public."FIN_Documents" add column "FINDoc_SourceTable" text,add column "FINDoc_SourceID" uuid,add foreign key("FINDoc_SourceJobID") references public."Job_Header"("Job_ID");
 alter table public."FIN_DocumentLineJobLinks" add foreign key("FINDocLineJob_JobID") references public."Job_Header"("Job_ID");
 alter table public."FIN_WIPItems" add foreign key("FINWIP_JobID") references public."Job_Header"("Job_ID");
 alter table public."FIN_Accruals" add foreign key("FINAccrual_JobID") references public."Job_Header"("Job_ID");
 ${costingTable}
 alter table public."Job_Costing_Lines" add foreign key("Job_ID") references public."Job_Header"("Job_ID");
 create function booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid) returns integer language plpgsql as $$
 declare payload jsonb:='{"charges":[{"description":"From quote"}]}';job_status text:='draft';charge jsonb;total integer:=0;begin
 for charge in select value from jsonb_array_elements(coalesce(payload->'charges', '[]'::jsonb)) loop total:=total+1;end loop;return total;end $$;
 -- Explicit pre-migration historical fixture; never create this state through the new guard.
 alter table public."FIN_DocumentLineJobLinks" add column "FINDocLineJob_JobCostingLineID" uuid;
 insert into public."Job_Header"("Job_ID","Job_Status") values('00000000-0000-4000-8000-000000000001','draft');
 insert into public."Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode") values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,'Historical charge','freight');
 ${financeMigration}
 ${chargeDomainMigration}
 do $$begin
 begin insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_JobCostingLineID") values('00000000-0000-4000-8000-000000000002');raise exception 'Indirect historical charge bypass';exception when sqlstate '22023' then null;end;
 if not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"='00000000-0000-4000-8000-000000000002') then raise exception 'Historical evidence removed';end if;
 end $$;
 delete from public."Job_Costing_Lines" where "JobCostingLine_ID"='00000000-0000-4000-8000-000000000002';
 delete from public."Job_Header" where "Job_ID"='00000000-0000-4000-8000-000000000001';
 do $$declare actor uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();foreign_actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();job uuid:=gen_random_uuid();stamp timestamptz;result jsonb;begin
 insert into public."cmp_Users" values(actor,company,'active',true),(reader,company,'active',false),(foreign_actor,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_UpdatedBy") values(job,'draft',office,actor);
 begin insert into public."FIN_Documents"("FINDoc_SourceJobID") values(job);raise exception 'Provisional invoice accepted';exception when sqlstate '22023' then null;end;
 begin insert into public."FIN_Documents"("FINDoc_SourceTable","FINDoc_SourceID") values('Job_Header',job);raise exception 'Polymorphic source bypass';exception when sqlstate '22023' then null;end;
 begin insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_JobID") values(job);raise exception 'Mixed invoice allocation accepted';exception when sqlstate '22023' then null;end;
 begin insert into public."FIN_WIPItems" values(job);raise exception 'Provisional WIP accepted';exception when sqlstate '22023' then null;end;
 begin insert into public."FIN_Accruals" values(job);raise exception 'Provisional accrual accepted';exception when sqlstate '22023' then null;end;
 begin insert into public."Job_Costing_Lines"("Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode") values(job,1,'Provisional charge','freight');raise exception 'Provisional cost line accepted';exception when sqlstate '22023' then null;end;
 if booking_api.convert_accepted_quote_before_sync_review_20260904(null,null,null)<>0 then raise exception 'Quote conversion still copies provisional charges';end if;
 if exists(select 1 from public."FIN_JobFinanceSummary") or exists(select 1 from public."FIN_JobChargeFinanceSummary") then raise exception 'Provisional job included';end if;
 begin perform public.booking_workflow_save(actor,job,'{"status":"complete"}');raise exception 'Skipped progression';exception when sqlstate '22023' then null;end;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Missing customer accepted';exception when sqlstate '22023' then null;end;
 if exists(select 1 from booking_api.events) or (select "Job_Status" from public."Job_Header" where "Job_ID"=job)<>'draft' then raise exception 'Failure mutated record';end if;
 update public."Job_Header" set "Job_Customer"=gen_random_uuid() where "Job_ID"=job;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Missing mode accepted';exception when sqlstate '22023' then null;end;
 update public."Job_Header" set "Job_TransportModeSummary"='road' where "Job_ID"=job;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Missing route accepted';exception when sqlstate '22023' then null;end;
 update public."Job_Header" set "Job_OriginNameSnapshot"='Leeds',"Job_DestinationNameSnapshot"='London' where "Job_ID"=job;
 begin perform public.booking_workflow_save(reader,job,'{"status":"open"}');raise exception 'Reader wrote';exception when sqlstate '42501' then null;end;
 begin perform public.booking_workflow_save(foreign_actor,job,'{"status":"open"}');raise exception 'Foreign actor wrote';exception when sqlstate '42501' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 result:=public.booking_workflow_save(actor,job,jsonb_build_object('status','open','expectedUpdatedAt',stamp));
 if result->>'lifecycleSupported'<>'true' or result#>>'{documents,0}'<>'retained' then raise exception 'Lost capability or document continuity';end if;
 if (select count(*) from public."Job_Header")<>1 or (select count(*) from public."FIN_JobFinanceSummary")<>1 then raise exception 'Record duplicated or progress excluded';end if;
 begin perform public.booking_workflow_save(actor,job,jsonb_build_object('status','complete','expectedUpdatedAt',stamp));raise exception 'Stale save accepted';exception when sqlstate '40001' then null;end;
 perform public.booking_workflow_save(actor,job,'{"status":"complete"}');
 if (select "Job_ClosedDate" from public."Job_Header" where "Job_ID"=job) is null then raise exception 'Missing completion date';end if;
 if (select count(*) from booking_api.events)<>2 then raise exception 'Expected one audit per successful change';end if;
 perform public.booking_workflow_save(actor,job,'{"status":"complete"}');
 if (select count(*) from booking_api.events)<>2 then raise exception 'No-op duplicated audit';end if;
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select "Job_ClosedDate" from public."Job_Header" where "Job_ID"=job) is not null then raise exception 'Reopen kept closed date';end if;
 insert into public."FIN_Documents"("FINDoc_ID","FINDoc_SourceJobID","FINDoc_PostingStatusCode") values(gen_random_uuid(),job,'posted');
 begin perform public.booking_workflow_save(actor,job,'{"status":"draft"}');raise exception 'Posted activity hidden';exception when sqlstate '22023' then null;end;
 if (select count(*) from public."FIN_Documents")<>1 then raise exception 'Changed posted ledger evidence';end if;
 if has_function_privilege('authenticated','public.booking_workflow_save(uuid,uuid,jsonb)','execute') then raise exception 'Browser bypass';end if;
 if booking_api.lifecycle_label('booked')<>'In progress' or booking_api.lifecycle_label('cancelled')<>'cancelled' then raise exception 'Legacy semantics lost';end if;
 end $$;
 do $$declare actor uuid;office uuid;job uuid:=gen_random_uuid();begin
 select "Auth_User_ID" into actor from public."cmp_Users" where can_write and "Company_ID" in (select "Company_ID" from public."cmp_Offices") limit 1;
 select "Office_ID" into office from public."cmp_Offices" limit 1;
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),'{"acceptedSnapshot":{"quote":{"charges":[{"description":"Retained quote charge","costLocal":"23.45","sellLocal":"56.78"}]}}}');
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>1 or (select "JobCostingLine_RevenueAmountLocal" from public."Job_Costing_Lines" where "Job_ID"=job)<>56.78 then raise exception 'Deferred quote charges lost or wrong';end if;
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>1 then raise exception 'Deferred charges duplicated';end if;
 begin perform public.booking_workflow_save(actor,job,'{"status":"draft"}');raise exception 'Charge-bearing job returned to Provisional';exception when sqlstate '22023' then null;end;
 job:=gen_random_uuid();
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_SourceQuoteID","Job_SourceSnapshotJSON") values(job,'draft',office,gen_random_uuid(),'{"acceptedSnapshot":{"quote":{"charges":[{"description":"Cancelled intent"}]}}}');
 perform public.booking_workflow_save(actor,job,'{"status":"cancelled"}');
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Cancellation released quote charges';end if;

 end $$;
 do $$declare rows jsonb;expected jsonb;actual jsonb;begin
 insert into public."Job_Header"("Job_ID","Job_Status") values(gen_random_uuid(),'draft'),(gen_random_uuid(),'booked'),(gen_random_uuid(),'complete');
 rows:=public.multideck_booking_register_page(p_search=>'Provisional')->'rows';
 if jsonb_array_length(rows)=0 or exists(select 1 from jsonb_array_elements(rows) r where r->>'Lifecycle_Status'<>'draft') then raise exception 'Lifecycle search is incorrect';end if;
 rows:=public.multideck_booking_register_page(p_sort=>'status',p_limit=>50)->'rows';
 select jsonb_agg(booking_api.lifecycle_label(r->>'Lifecycle_Status') order by lower(booking_api.lifecycle_label(r->>'Lifecycle_Status'))) into expected from jsonb_array_elements(rows) r;
 select jsonb_agg(booking_api.lifecycle_label(r->>'Lifecycle_Status')) into actual from jsonb_array_elements(rows) r;
 if actual<>expected then raise exception 'Lifecycle sorting is incorrect: %',actual;end if;
 rows:=public.multideck_booking_register_page(p_sort=>'trackingStatus',p_sort_direction=>'desc',p_limit=>50)->'rows';
 select jsonb_agg(r->>'Status' order by lower(r->>'Status') desc) into expected from jsonb_array_elements(rows) r;
 select jsonb_agg(r->>'Status') into actual from jsonb_array_elements(rows) r;
 if actual<>expected then raise exception 'Tracking sorting is incorrect: %',actual;end if;
 end $$;
 alter table public."cmp_Users" add column "User_ID" uuid default gen_random_uuid();
 alter table public."Job_Header" add column "Job_Number" bigint generated by default as identity,add column "Job_BookingReference" text;
 create table public."Job_Cargo"(id uuid primary key default gen_random_uuid(),"Job_ID" uuid references public."Job_Header"("Job_ID"),description text);
 create table public."Job_CargoDimensions"(id uuid primary key default gen_random_uuid(),"JobCargoDim_JobCargoID" uuid references public."Job_Cargo"(id),length_cm numeric);
 create table public."Job_Documents"(id uuid primary key default gen_random_uuid(),"JobDoc_JobID" uuid references public."Job_Header"("Job_ID"),file_path text);
 ${cancellationMigration}
 ${cancellationChecks}
 ${liveLifecycleDefinitions}
 ${planningMigration}
 ${planningChecks}
 ${planningCancellationMigration}
 ${cancellationChecks}
 ${planningCancellationChecks}
 alter table public."Job_Header" add column "Job_LegalEntityID" uuid;
 create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_BaseCurrencyCodeSnapshot" text,"LegalEntity_IsActive" boolean);
 create table public."sys_Currency"("Currency_ID" uuid primary key default gen_random_uuid(),"Currency_Code" text);
 insert into public."sys_Currency"("Currency_Code") values('GBP'),('EUR'),('USD');
 ${financeChargeFunction}
 ${planningReleaseMigration}
 ${planningReleaseChecks}
 create table public."FIN_CurrencySettings"("FINCurSet_CurrencyCode" text,"FINCurSet_Name" text,"FINCurSet_DecimalPlaces" integer default 2,
 "FINCurSet_IsActive" boolean default true,"FINCurSet_IsPermittedForQuote" boolean default true,"FINCurSet_LegalEntityID" uuid);
 -- Read-only users can now exercise the public read boundary; prior suites retain
 -- their original permission fixture. Actor activity/company are checked by SQL.
 create or replace function booking_api.has_permission(uuid,text) returns boolean language sql as $$
 select coalesce((select ($2='Bookings.Read' or can_write) from public."cmp_Users" where "Auth_User_ID"=$1),false)$$;
 ${planningAccessMigration}
 ${planningAccessChecks}
 create table public."Org_Master"("Org_id" uuid primary key,"Org_Name" text,"Org_AccCode" text);
 create table public."Org_Master_Type"("Org_ID" uuid,"OrgType_ID" uuid);
 create table public."Org_Types"("OrgType_ID" uuid primary key,"OrgType_Name" text);
 create table public."CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_MetadataJSON" jsonb default '{}');
 create table public."CusQuote_Header"("CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,"CusQuoteHeader_CustomerID" uuid);
 ${crmAccessFunction}
 ${planningPartyMigration}
 ${planningPartyChecks}
 -- Exercise the unchanged production charge SELECT, with only unrelated aggregate
 -- sections omitted. This does not substitute for hosted workspace authorisation.
 create function booking_api.workspace_before_goods_value_20260905(caller_auth_user_id uuid,requested_reference text)
 returns jsonb language plpgsql as $$declare job_row public."Job_Header"%rowtype;charges_value jsonb;begin
 select * into job_row from public."Job_Header" where "Job_ID"=requested_reference::uuid;
 ${chargeProjection}
 return charges_value;end$$;
 ${readbackMigration}
 do $$declare line record;actual jsonb;begin
 for line in select * from public."Job_Costing_Lines" loop
 select item into actual from jsonb_array_elements(booking_api.workspace_before_goods_value_20260905(null,line."Job_ID"::text)) item
 where item->>'id'=line."JobCostingLine_ID"::text;
 if actual->>'costAmount' is distinct from line."JobCostingLine_CostAmountCurrency"::text
 or actual->>'sellLocal' is distinct from line."JobCostingLine_RevenueAmountLocal"::text then raise exception 'Amounts changed on readback';end if;
 if line."JobCostingLine_SourceTable"='booking_api.planning_charge_sets' and line."JobCostingLine_DomainCode"='freight' then
 if actual#>>'{planningCurrency,cost}' is distinct from line."JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,costCurrency}'
 or actual#>>'{planningCurrency,sell}' is distinct from line."JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,sellCurrency}'
 or actual#>>'{planningCurrency,base}' is distinct from line."JobCostingLine_SourceMetadataJSON"->>'baseCurrency' then raise exception 'Source currencies lost';end if;
 elsif actual ? 'planningCurrency' then raise exception 'Non-planning charge changed';end if;
 end loop;
 if not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,costCurrency}'='EUR') then raise exception 'Foreign-currency coverage missing';end if;
 end$$;
 `)
 run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
 alter table booking_api.events add column event_id uuid default gen_random_uuid(), add column occurred_at timestamptz default now();
 create or replace function booking_api.workspace_before_goods_value_20260905(caller_auth_user_id uuid,requested_reference text)
 returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',event.event_id,
 'metadata', event.metadata, 'occurredAt',event.occurred_at)), '[]'::jsonb)
 from booking_api.events event where event.job_id=requested_reference::uuid $$;
 ${auditDetailsMigration}
 do $$declare saved record; actual jsonb; checked integer:=0; begin
 for saved in select h.*,e.event_id from booking_api.planning_charge_history h
 join booking_api.events e on e.job_id=h.job_id and e.metadata->>'revision'=h.revision::text
 where e.event_type='planning_charges_saved' loop
 select item->'metadata'->'planningHistory' into actual
 from jsonb_array_elements(booking_api.workspace_before_goods_value_20260905(null,saved.job_id::text)) item
 where item->>'id'=saved.event_id::text;
 if actual->'afterRows' is distinct from saved.after_state->'rows'
 or actual->'beforeRows' is distinct from coalesce(nullif(saved.before_state->'rows','null'::jsonb),'[]'::jsonb)
 then raise exception 'Audit revision projection mismatch'; end if;
 checked:=checked+1;
 end loop;
 if checked=0 then raise exception 'No saved planning history exercised';end if;
 end $$;
 `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
