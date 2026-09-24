import test from 'node:test'
import {readFileSync} from 'node:fs'
import {withProductPostgres} from './local-product-postgres.mjs'
import {createCrmSalesFixture} from './crm-sales-fixture.mjs'

const read=name=>readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8')
export function createCrmNarrativeFixture(sql,ok){
 createCrmSalesFixture(sql,ok)
 for(const name of ['20260922160000_crm_sales_briefings','20260922161000_crm_sales_insight_series','20260922170000_crm_sales_narrative_evidence'])ok(sql(read(name)))
 const baseline=readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8')
 const start=baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."CRM_Notes" (')
 ok(sql(baseline.slice(start,baseline.indexOf('\n);',start)+4)))
 ok(sql(`
 alter table "CRM_Notes" enable row level security;grant select on "CRM_Notes" to authenticated;
 create function company(n integer default 1) returns uuid language sql immutable as $$select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
 create function actor(n integer default 1) returns uuid language sql immutable as $$select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
 create function seed_outcome(n int,deal int,body text,at_time timestamptz default now()) returns void language sql as $$
 insert into "CRM_DealActions"(id,company_id,deal_id,title,type,owner_id,due_at,status,completed_at,completion_note,created_by,updated_by)
 values(fid(n),company(case when deal=5 then 2 else 1 end),fid(deal),'Sales follow-up','call',actor(case when deal=5 then 5 else 1 end),at_time,'completed',at_time,body,actor(),actor())$$;
 create function narrative() returns jsonb language sql as $$select multideck_crm_get_sales_insights()->'narrative'$$;
 create table test_narrative_job(data jsonb);
 create function claim_narrative() returns jsonb language plpgsql as $$declare j jsonb;begin
 update "AI_CrmSalesBriefings" set due_at=now()-interval '1 minute',retry_at=null,last_claimed_at=now()-interval '7 hours' where company_id=company();
 delete from test_narrative_job;j:=multideck_crm_claim_sales_briefing_jobs(1)->0;insert into test_narrative_job values(j);return j;end$$;
 create function finish_narrative(f text default repeat('a',64),skip boolean default false) returns boolean language sql as $$
 select multideck_crm_finish_sales_briefing_job((data->>'companyId')::uuid,(data->>'userId')::uuid,(data->>'leaseId')::uuid,f,
 case when skip then null else jsonb_build_object('schemaVersion',3,'generatedAt',now(),'dataAsOf',now(),'summary','Generated classification','findings','[]'::jsonb,'themes',jsonb_build_array(jsonb_build_object('id','theme1','label','Service fit','description','A shared concern','memberships',(select jsonb_agg(d-'text'||jsonb_build_object('sourceId',d->>'id','excerpt',d->>'text')) from jsonb_array_elements(data->'snapshot'->'narrative'->'documents')d))),
 'narrative',(data->'snapshot'->'narrative')-'documents')end,skip) from test_narrative_job$$;
 create function validate_narrative() returns boolean language sql as $$select multideck_crm_validate_sales_briefing_job((data->>'companyId')::uuid,(data->>'userId')::uuid,(data->>'leaseId')::uuid) from test_narrative_job$$;
 create function saved_narrative_domain() returns jsonb language sql security definer as $$select multideck_dexter_query_domain('sales_briefing',null,1)->'data'$$;
 `))
}

test('narrative corpus uses complete eligibility counts, deterministic bounded shared sources and native filters',()=>withProductPostgres((sql,ok)=>{
 createCrmNarrativeFixture(sql,ok)
 ok(sql(`
 select seed_outcome(1000+n,case when n%2=0 then 1 else 2 end,repeat('Measured handover concern. ',40),now()-make_interval(mins=>n)) from generate_series(1,45)n;
 select seed_outcome(1100,5,'FOREIGN PRIVATE CUSTOMER');
 select seed_outcome(1101,3,'Old feedback outside period',now()-interval '100 days');
 select seed_outcome(1102,3,'Cancelled feedback');update "CRM_DealActions" set status='cancelled' where id=fid(1102);
 select seed_outcome(1103,3,'  ');
 insert into "CRM_Notes"("CRMNote_OpportunityID","CRMNote_Body","CRMNote_SensitivityCode","CRMNote_CreatedBy") values(fid(1),'RESTRICTED NOTE','restricted',actor()),(fid(1),'PERSONAL NOTE','private',actor()),(fid(1),'UNSHARED INTERNAL NOTE','internal',actor());
 set role authenticated;select login(2);
 select test_assert((select count(*)=0 from "CRM_Notes"),'existing note RLS does not expose even internal notes');
 select test_assert((narrative()->>'totalDocuments')::int=45 and (narrative()->>'includedDocuments')::int=40,'complete eligible count and bounded documents');
 select test_assert((narrative()->>'truncated')::boolean,'truncation explicit');
 select test_assert((narrative()->>'totalDeals')::int=2 and (narrative()->>'includedDeals')::int=2,'unique narrative deal cohort counts');
 select test_assert(narrative()->'documents'->0->>'id'='action_outcome:'||fid(1001)::text,'newest ordering with stable source identifier');
 select test_assert(not exists(select 1 from jsonb_array_elements(narrative()->'documents')d where length(d->>'text')>600),'individual text bounded');
 select test_assert(narrative()::text not like '%PRIVATE%' and narrative()::text not like '%UNSHARED%' and narrative()::text not like '%Cancelled%' and narrative()::text not like '%Old feedback%','private foreign cancelled and old sources excluded');
 select test_assert((multideck_crm_get_sales_insights(90,fid(200),actor(2))->'narrative'->>'includedDocuments')::int=0,'current owner filter applies');
 select test_assert((query_insights()->0->'narrative'->>'includedDocuments')::int=40,'Dexter reads same bounded sources');
 select expect_denied($q$select multideck_crm_get_sales_insights(90,fid(201),null)$q$,'22023');
 reset role;update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=actor();
 set role authenticated;select login(3);select test_assert((narrative()->>'totalDocuments')::int=45,'inactive author does not remove shared historical feedback');
 select login(5);select test_assert((narrative()->>'totalDocuments')::int=1,'foreign colleague sees only their company');
 select login(99);select expect_denied($q$select narrative()$q$,'42501');reset role;
 set role anon;select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');reset role;
 `))
}))

test('real loss and next-action outcomes queue analysis and form measured source-linked cohorts',()=>withProductPostgres((sql,ok)=>{
 createCrmNarrativeFixture(sql,ok)
 ok(sql(`
 set role authenticated;select login(2);
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),jsonb_build_object('title','Discuss service handover','type','call','ownerId',actor(2),'dueAt',now()+interval '1 day'));
 select multideck_crm_complete_deal_next_action(fid(1),deal_version(1),(select(multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'id')::uuid),'Needs weekly handover updates.');
 select multideck_crm_lose_deal(fid(2),deal_version(2),'{"reasonCode":"service_fit","details":"Weekly visibility did not meet their needs."}');
 select test_assert((narrative()->>'includedDocuments')::int=2 and (narrative()->>'includedDeals')::int=2,'native lifecycle produces two traceable documents');
 select test_assert(exists(select 1 from jsonb_array_elements(narrative()->'documents')d where d->>'kind'='loss_feedback' and d->>'id'='loss_feedback:'||fid(2)::text),'loss source stable and explicit');
 select test_assert(exists(select 1 from jsonb_array_elements(narrative()->'deals')d where d->>'id'=fid(2)::text and d->>'outcome'='lost' and d->>'closedAt' is not null),'loss outcome metadata measured');
 reset role;select test_assert((select dirty_version>2 from "AI_CrmSalesBriefings" where company_id=company()),'native source changes invalidate automatic queue');
 select set_config('request.jwt.claim.role','service_role',false);select claim_narrative();select test_assert(validate_narrative(),'claimed current source manifest valid');select test_assert(finish_narrative(),'saved generated result persists');
 set role authenticated;select login(3);select test_assert(saved_narrative_domain()->0->'result'->>'schemaVersion'='3','shared saved Dexter read exposes generated version');
 reset role;update "CRM_Opportunities" set "CRMOppty_OwnerUserID"=actor(2),"CRMOppty_PipelineStageID"=fid(211) where "CRMOppty_ID"=fid(1);
 set role authenticated;select login(3);
 select test_assert(exists(select 1 from jsonb_array_elements(multideck_crm_get_sales_briefing()->'result'->'narrative'->'deals')d where d->>'id'=fid(1)::text and d->>'ownerId'=actor(2)::text and d->>'stageId'=fid(211)::text),'saved cohort projects current owner and stage without model call');
 select test_assert(multideck_crm_get_sales_briefing()->'result'->>'metricsAsOf' is not null,'current metrics time explicit');
 reset role;select test_assert((select attempts=0 and status='pending' from "AI_CrmSalesBriefings" where company_id=company()),'reads do not claim generation');
 `))
}))

test('source edits deletion moves and clearing revoke saved excerpts and in-flight leases',()=>withProductPostgres((sql,ok)=>{
 createCrmNarrativeFixture(sql,ok)
 ok(sql(`
 select seed_outcome(1001,1,'Confirmed weekly visibility matters.');
 select set_config('request.jwt.claim.role','service_role',false);select login(2);select claim_narrative();select finish_narrative();
 update "CRM_DealActions" set completion_note='The earlier note was incorrect.' where id=fid(1001);
 set role authenticated;select login(3);
 select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb and (multideck_crm_get_sales_briefing()->>'resultWithheld')::boolean,'edited source immediately suppresses old excerpts');
 select test_assert(saved_narrative_domain()->0->'result'='null'::jsonb,'saved chat does not leak invalidated excerpts');
 reset role;select test_assert(claim_narrative()->'lastFingerprint'='null'::jsonb,'source edit forces fresh interpretation even if aggregates match');
 select expect_denied($q$select finish_narrative(repeat('a',64),true)$q$,'22023');
 update "CRM_DealActions" set deal_id=fid(2) where id=fid(1001);
 select test_assert(not validate_narrative() and not finish_narrative(repeat('b',64)),'source movement invalidates in-flight lease');
 update "CRM_DealActions" set deal_id=fid(1) where id=fid(1001);select test_assert(finish_narrative(repeat('b',64)),'restored exact source can finish valid lease');
 update "CRM_DealActions" set deal_id=fid(5),company_id=company(2) where id=fid(1001);
 set role authenticated;select login(3);select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'moving source to another company hides its saved excerpt');
 reset role;select test_assert((select dirty_version>2 from "AI_CrmSalesBriefings" where company_id=company(2)),'source movement queues destination company');
 update "CRM_DealActions" set deal_id=fid(1),company_id=company(1) where id=fid(1001);
 delete from "CRM_DealActions" where id=fid(1001);
 set role authenticated;select login(3);select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'hard deletion hides saved excerpts');
 select login(2);select multideck_crm_lose_deal(fid(2),deal_version(2),'{"reasonCode":"other","details":"Specific customer feedback."}');
 reset role;select claim_narrative();select finish_narrative(repeat('c',64));
 update "CRM_Opportunities" set "CRMOppty_LossDetails"=null where "CRMOppty_ID"=fid(2);
 set role authenticated;select login(3);select test_assert(multideck_crm_get_sales_briefing()->'result'='null'::jsonb,'cleared loss feedback hides saved text');
 reset role;select test_assert(not has_function_privilege('authenticated','_multideck_crm_sales_narrative_sources(uuid)','EXECUTE'),'browser cannot bypass actor-bound reader');
 `))
}))

test('saved narrative watch changes remain deterministic with access, pause and repeat protection',()=>withProductPostgres((sql,ok)=>{
 createCrmNarrativeFixture(sql,ok)
 ok(sql(`
 select seed_outcome(1001,1,'Needs weekly visibility.');
 create table test_narrative_watch(id uuid);grant select,insert on test_narrative_watch to authenticated;
 set role authenticated;select login(2);
 insert into test_narrative_watch select(multideck_dexter_create_watch('sales_briefing','Theme changes','Sales themes','Watch source-backed themes',company(),'Workspace','{"field":"fingerprint","operator":"changed"}',null)->>'id')::uuid;
 reset role;select set_config('request.jwt.claim.role','service_role',false);select claim_narrative();select finish_narrative();
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'saved generated themes fire one actual watch');
 select _multideck_crm_queue_sales_briefing(company());select claim_narrative();select finish_narrative(repeat('a',64),true);
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'unchanged source check does not refire');
 set role authenticated;select login(2);select multideck_dexter_set_watch_status((select id from test_narrative_watch),'paused');reset role;
 update "CRM_DealActions" set completion_note='Needs weekly visibility and milestone reports.' where id=fid(1001);select claim_narrative();select finish_narrative(repeat('b',64));
 select test_assert((select count(*)=1 from "AI_DexterWatchEvents"),'paused theme watch remains quiet');
 set role authenticated;select login(2);select multideck_dexter_set_watch_status((select id from test_narrative_watch),'active');reset role;
 update "CRM_DealActions" set completion_note='Milestone reports were agreed.' where id=fid(1001);select claim_narrative();select finish_narrative(repeat('c',64));
 select test_assert((select count(*)=2 from "AI_DexterWatchEvents"),'resumed watch receives later generated result');
 update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=actor(2);
 update "CRM_DealActions" set completion_note='New handover agreement.' where id=fid(1001);select claim_narrative();select finish_narrative(repeat('d',64));
 select test_assert((select count(*)=2 from "AI_DexterWatchEvents"),'revoked watcher gets no excerpt notification');
 `))
}))

test('upgrade preserves prior saved results and existing worker functions claim the new narrative snapshot',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(read('20260922160000_crm_sales_briefings')))
 ok(sql(read('20260922161000_crm_sales_insight_series')))
 ok(sql(`
 select login(2);select set_config('request.jwt.claim.role','service_role',false);
 create table test_upgrade_job(data jsonb);
 update "AI_CrmSalesBriefings" set due_at=now()-interval '1 minute' where company_id='20000000-0000-0000-0000-000000000001';
 insert into test_upgrade_job select multideck_crm_claim_sales_briefing_jobs(1)->0;
 select multideck_crm_finish_sales_briefing_job((data->>'companyId')::uuid,(data->>'userId')::uuid,(data->>'leaseId')::uuid,repeat('a',64),'{"summary":"Previous saved result","findings":[]}',false) from test_upgrade_job;
 select multideck_crm_get_sales_briefing();
 ${read('20260922170000_crm_sales_narrative_evidence')}
 select test_assert(multideck_crm_get_sales_briefing()->'result'->>'summary'='Previous saved result','upgrade retains compatible prior good result');
 select test_assert((select status='pending' and dirty_version>processed_version from "AI_CrmSalesBriefings" where company_id='20000000-0000-0000-0000-000000000001'),'new narrative version queues once');
 select test_assert(jsonb_array_length(multideck_crm_claim_sales_briefing_jobs(1))=0,'upgrade preserves six-hour cooldown');
 update "AI_CrmSalesBriefings" set due_at=now()-interval '1 minute',last_claimed_at=now()-interval '7 hours' where company_id='20000000-0000-0000-0000-000000000001';
 delete from test_upgrade_job;insert into test_upgrade_job select multideck_crm_claim_sales_briefing_jobs(1)->0;
 select test_assert((select data->'snapshot'->'narrative'->>'version'='1' from test_upgrade_job),'previously warmed worker function uses upgraded canonical snapshot');
 select test_assert((select (data->'snapshot'->'narrative'->>'includedDeals')::int=0 and jsonb_array_length(data->'snapshot'->'narrative'->'deals')=0 from test_upgrade_job),'empty narrative returns no fabricated cohort');
 `))
}))
