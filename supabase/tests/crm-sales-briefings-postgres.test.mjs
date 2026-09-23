import test from 'node:test'
import {readFileSync} from 'node:fs'
import {withProductPostgres} from './local-product-postgres.mjs'
import {createCrmSalesFixture} from './crm-sales-fixture.mjs'

const migration=readFileSync(new URL('../migrations/20260922160000_crm_sales_briefings.sql',import.meta.url),'utf8')
function fixture(sql,ok){
 createCrmSalesFixture(sql,ok)
 ok(sql(`
 create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create schema net;create table net.test_calls(id bigserial,url text,body jsonb,headers jsonb);
 create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$declare id bigint;begin insert into net.test_calls(url,body,headers) values(url,body,headers) returning test_calls.id into id;return id;end$$;
 create schema cron;create table cron.job(jobid bigserial,jobname text,schedule text,command text,active boolean default true);
 create function cron.schedule(jobname text,schedule text,command text) returns bigint language plpgsql as $$declare id bigint;begin insert into cron.job(jobname,schedule,command) values(jobname,schedule,command) returning jobid into id;return id;end$$;
 create function cron.unschedule(id bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=id;return found;end$$;
 insert into vault.decrypted_secrets values('multideck_crm_sales_worker_endpoint','https://localfixture.supabase.co/functions/v1/crm-sales-insights'),('multideck_crm_sales_worker_secret',repeat('fixture-only-no-network-',3));
 `))
 ok(sql(migration))
 ok(sql(`
 create table test_briefing_job(data jsonb);grant select,insert,delete on test_briefing_job to authenticated;
 create function company(n integer default 1) returns uuid language sql immutable as $$select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
 create function actor(n integer default 1) returns uuid language sql immutable as $$select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
 create function force_due() returns void language sql as $$update "AI_CrmSalesBriefings" set due_at=now()-interval '1 minute',retry_at=null,last_claimed_at=now()-interval '7 hours',last_dispatched_at=null where company_id=company()$$;
 create function job_claim() returns jsonb language plpgsql as $$declare j jsonb;begin delete from test_briefing_job;j:=multideck_crm_claim_sales_briefing_jobs(1)->0;insert into test_briefing_job values(j);return j;end$$;
 create function job_finish(f text default repeat('a',64),r jsonb default '{"summary":"Review the next sales actions","findings":[]}',skip boolean default false) returns boolean language sql as $$select multideck_crm_finish_sales_briefing_job((data->>'companyId')::uuid,(data->>'userId')::uuid,(data->>'leaseId')::uuid,f,r,skip) from test_briefing_job$$;
 create function job_fail() returns boolean language sql as $$select multideck_crm_fail_sales_briefing_job((data->>'companyId')::uuid,(data->>'userId')::uuid,(data->>'leaseId')::uuid,'provider_unavailable') from test_briefing_job$$;
 create function saved_briefing_domain() returns jsonb language sql security definer as $$select multideck_dexter_query_domain('sales_briefing',null,1)->'data'$$;
 `))
}

test('saved briefing is queued once, coalesced/debounced, shared without model work and rate-limited',()=>withProductPostgres((sql,ok)=>{
 fixture(sql,ok)
 ok(sql(`
 select test_assert((select count(*)=2 from "AI_CrmSalesBriefings"),'bootstrap each existing company once');
 set role authenticated;select login(2);
 select test_assert(multideck_crm_get_sales_briefing()->>'status'='pending','first visit reads pending');
 select test_assert((multideck_crm_get_sales_briefing()->>'automationReady')::boolean,'configured scheduler ready');
 select multideck_crm_get_sales_briefing();select multideck_crm_get_sales_briefing();
 reset role;select test_assert((select dirty_version=1 and attempts=0 from "AI_CrmSalesBriefings" where company_id=company()),'page reads never queue or claim');
 select set_config('request.jwt.claim.role','service_role',false);
 select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs())=0,'quiet debounce prevents immediate claim');
 update "AI_CrmSalesBriefings" set pending_since=now()-interval '29 minutes' where company_id=company();
 set role authenticated;select login(2);
 select multideck_crm_update_deal(fid(1),deal_version(1),'{"expectedCloseDate":"2026-12-01"}');
 select multideck_crm_update_deal(fid(2),deal_version(2),'{"ownerId":"00000000-0000-0000-0000-000000000002"}');
 reset role;
 select test_assert((select count(*)=1 from "AI_CrmSalesBriefings" where company_id=company()),'events coalesce in one company row');
 select test_assert((select dirty_version=3 and due_at<=now()+interval '1 minute' from "AI_CrmSalesBriefings" where company_id=company()),'quiet debounce capped at30min since first pending');
 select force_due();select test_assert(job_claim()->>'companyId'=company()::text,'claim chooses queued company');
 select test_assert((select (data->'snapshot'->'coverage'->>'totalDeals')::int=4 from test_briefing_job),'snapshot is canonical exact company scope');
 select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs())=0,'active lease cannot be duplicated');
 select expect_denied($q$select job_finish(repeat('a',64),null,false)$q$,'22023');
 select test_assert(not multideck_crm_finish_sales_briefing_job(company(),actor(),gen_random_uuid(),repeat('a',64),'{}',false),'stale finish rejected');
 select test_assert(job_finish(),'first result saved');
 set role authenticated;select login(3);
 select test_assert(multideck_crm_get_sales_briefing()->'result'->>'summary'='Review the next sales actions','read-only colleague sees same saved briefing');
 select test_assert(saved_briefing_domain()->0->'result'->>'summary'='Review the next sales actions','chat reads saved briefing without generation');
 select login(5);select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'foreign company cannot read briefing');
 select login(2);select multideck_crm_update_deal(fid(1),deal_version(1),'{"ownerId":"00000000-0000-0000-0000-000000000002"}');
 select test_assert(multideck_crm_get_sales_briefing()->>'status'='stale','prior good briefing retained while evidence queues');
 reset role;update "AI_CrmSalesBriefings" set due_at=now()-interval '1 minute' where company_id=company();
 select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs())=0,'company capped once per6h after success');
 select force_due();select job_claim();select test_assert(job_finish(repeat('a',64),null,true),'same fingerprint can finish without provider result');
 select test_assert((select generated_at<checked_at from "AI_CrmSalesBriefings" where company_id=company()),'skipping retains generation time and updates check time');
 `))
}))

test('briefing preserves good results on finite failures, rejects revoked leases and recovers expired workers',()=>withProductPostgres((sql,ok)=>{
 fixture(sql,ok)
 ok(sql(`
 select set_config('request.jwt.claim.role','service_role',false);select login(2);select force_due();select job_claim();select job_finish();
 select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();
 select test_assert(not multideck_crm_finish_sales_briefing_job(company(2),actor(),(select(data->>'leaseId')::uuid from test_briefing_job),repeat('b',64),'{}',false),'lease cannot complete for foreign company');
 select test_assert(not multideck_crm_finish_sales_briefing_job(company(),actor(2),(select(data->>'leaseId')::uuid from test_briefing_job),repeat('b',64),'{}',false),'lease cannot substitute another eligible colleague');
 update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=(select(data->>'userId')::uuid from test_briefing_job);
 select test_assert(not job_finish(repeat('b',64)),'revoked actor cannot finish');
 select test_assert(not multideck_crm_validate_sales_briefing_job(company(),actor(),(select(data->>'leaseId')::uuid from test_briefing_job)),'revoked actor fails pre-model validation');
 update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor();
 update "AI_CrmSalesBriefings" set lease_until=now()-interval '1 minute' where company_id=company();
 select test_assert(not job_finish(repeat('b',64)),'expired worker cannot overwrite result');
 select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs())=0,'expired lease schedules backoff without model claim');
 select force_due();select job_claim();select test_assert(job_fail(),'second attempt records failure');
 select test_assert((select result->>'summary'='Review the next sales actions' from "AI_CrmSalesBriefings" where company_id=company()),'failure keeps good result');
 select force_due();select job_claim();select test_assert(job_fail(),'third attempt records terminal failure');
 select test_assert((select status='failed' and attempts=3 from "AI_CrmSalesBriefings" where company_id=company()),'finite retries stop');
 select force_due();select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs())=0,'no hourly model retry loop after exhaustion');
 select _multideck_crm_queue_sales_briefing(company());select test_assert((select attempts=0 and status='pending' from "AI_CrmSalesBriefings" where company_id=company()),'new real evidence may rearm exhausted queue');
 set role authenticated;select login(99);select expect_denied($q$select multideck_crm_get_sales_briefing()$q$,'42501');
 select login(2);select expect_denied($q$select multideck_crm_claim_sales_briefing_jobs()$q$,'42501');
 select expect_denied($q$select multideck_crm_sales_briefing_worker_secret()$q$,'42501');
 reset role;select test_assert(not has_table_privilege('authenticated','"AI_CrmSalesBriefings"','SELECT'),'raw result and lease data remain private');
 delete from "cmp_Users_Roles" where "User_ID"=actor(2);
 set role authenticated;select login(2);select expect_denied($q$select multideck_crm_get_sales_briefing()$q$,'42501');reset role;
 set role anon;select expect_denied($q$select multideck_crm_get_sales_briefing()$q$,'42501');reset role;
 `))
}))

test('saved source visibility is rechecked immediately and membership changes queue both companies',()=>withProductPostgres((sql,ok)=>{
 fixture(sql,ok)
 ok(sql(`
 select set_config('request.jwt.claim.role','service_role',false);select login(2);select force_due();select job_claim();select job_finish();
 select test_assert((select cardinality(result_source_ids)=4 from "AI_CrmSalesBriefings" where company_id=company()),'complete source membership captured independently of bounded evidence arrays');
 update "CRM_Opportunities" set "CRMOppty_IsDeleted"=true where "CRMOppty_ID"=fid(1);
 set role authenticated;select login(2);
 select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'deleted source hides saved names and interpretation immediately');
 select test_assert((multideck_crm_get_sales_briefing()->>'resultWithheld')::boolean,'withheld result distinguished from provider failure');
 select test_assert(saved_briefing_domain()->0->'result'='null'::jsonb,'chat cannot retain revoked source evidence');
 reset role;update "CRM_Opportunities" set "CRMOppty_IsDeleted"=false where "CRMOppty_ID"=fid(1);
 update "CRM_Opportunities" set "CRMOppty_PipelineID"=fid(201),"CRMOppty_PipelineStageID"=fid(214) where "CRMOppty_ID"=fid(1);
 set role authenticated;select login(2);select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'company move hides cached source immediately');
 reset role;
 select test_assert((select dirty_version>1 from "AI_CrmSalesBriefings" where company_id=company(1)) and (select dirty_version>1 from "AI_CrmSalesBriefings" where company_id=company(2)),'membership queues old and new company');
 select force_due();select job_claim();
 select test_assert((select data->'lastFingerprint'='null'::jsonb from test_briefing_job),'invisible original sources force fresh interpretation even with identical bounded evidence');
 select expect_denied($q$select job_finish(repeat('a',64),null,true)$q$,'22023');
 update "CRM_Opportunities" set "CRMOppty_IsDeleted"=true where "CRMOppty_ID"=fid(2);
 select test_assert(not job_finish(repeat('b',64)),'source deletion during generation invalidates exact lease finish');
 `))
}))

test('empty workspace clears prior analysis and in-flight evidence remains pending',()=>withProductPostgres((sql,ok)=>{
 fixture(sql,ok)
 ok(sql(`
 select set_config('request.jwt.claim.role','service_role',false);select login(2);select force_due();select job_claim();
 select _multideck_crm_queue_sales_briefing(company());
 select test_assert(job_finish(),'claimed evidence may finish while a later event queues');
 select test_assert((select status='pending' and dirty_version>processed_version from "AI_CrmSalesBriefings" where company_id=company()),'finish never consumes changes made during generation');
 update "CRM_Opportunities" set "CRMOppty_IsDeleted"=true where "CRMOppty_ID" in(fid(1),fid(2),fid(3),fid(4));
 select force_due();select job_claim();
 select test_assert((select (data->'snapshot'->'coverage'->>'totalDeals')::int=0 from test_briefing_job),'claim verifies empty company using canonical snapshot');
 select test_assert(job_finish(repeat('e',64),null,false),'verified empty workspace can clear obsolete result without provider');
 set role authenticated;select login(2);
 select test_assert(multideck_crm_get_sales_briefing()->>'status'='ready' and multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'empty result is current and contains no old evidence');
 reset role;select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();
 select test_assert(job_finish(repeat('e',64),null,true),'unchanged verified empty snapshot can skip without model');
 `))
}))

test('dispatcher sends only due work and saved briefing watches are deterministic and private',()=>withProductPostgres((sql,ok)=>{
 fixture(sql,ok)
 ok(sql(`
 select test_assert((select count(*)=1 from cron.job where jobname='multideck-crm-sales-briefings' and command='select public._multideck_crm_dispatch_sales_briefings()'),'migration installs queue-aware cron');
 select test_assert(not _multideck_crm_dispatch_sales_briefings(),'no due queue means no HTTP dispatch');
 select test_assert((select count(*)=0 from net.test_calls),'empty dispatch does not reach provider boundary');
 select force_due();select test_assert(_multideck_crm_dispatch_sales_briefings(),'due queue signals worker');
 select test_assert(not _multideck_crm_dispatch_sales_briefings(),'dispatch coalesced per minute');
 select test_assert((select count(*)=1 from net.test_calls),'one worker dispatch');
 create table test_briefing_watch(id uuid);grant select,insert on test_briefing_watch to authenticated;
 set role authenticated;select login(2);
 insert into test_briefing_watch select(multideck_dexter_create_watch('sales_briefing','Sales briefing changed','New sales evidence','Watch the saved briefing',company(),'Workspace','{"field":"fingerprint","operator":"changed"}',null)->>'id')::uuid;
 select login(5);select expect_denied($q$select multideck_dexter_create_watch('sales_briefing','x','x','x',company(),'x','{"field":"fingerprint","operator":"changed"}',null)$q$,'42501');
 reset role;select set_config('request.jwt.claim.role','service_role',false);select login(2);select job_claim();select job_finish();
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'new saved fingerprint triggers one event');
 select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();select job_finish(repeat('a',64),null,true);
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'unchanged fingerprint skip emits no event');
 set role authenticated;select login(2);select multideck_dexter_set_watch_status((select id from test_briefing_watch),'paused');
 reset role;select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();select job_finish(repeat('b',64));
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'pause suppresses saved-result events');
 set role authenticated;select login(2);select multideck_dexter_set_watch_status((select id from test_briefing_watch),'active');
 reset role;select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();select job_finish(repeat('c',64));
 select test_assert((select count(*)=2 from "AI_DexterWatchEvents"),'resume emits one later distinct result event');
 update "cmp_Users" set "Auth_User_ID"=null where "User_ID"=actor(2);
 select _multideck_crm_queue_sales_briefing(company());select force_due();select job_claim();select job_finish(repeat('d',64));
 select test_assert((select count(*)=2 from "AI_DexterWatchEvents"),'unlinked watch owner receives no shared result');
 select test_assert(not exists(select 1 from "AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error'),'no swallowed evaluator errors');
 update cron.job set active=false;
 set role authenticated;select login(3);select test_assert(not(multideck_crm_get_sales_briefing()->>'automationReady')::boolean,'disabled scheduled dispatch is not ready');
 reset role;delete from cron.job;
 set role authenticated;select test_assert(not(multideck_crm_get_sales_briefing()->>'automationReady')::boolean,'configuration without scheduled dispatch is not ready');
 `))
}))
