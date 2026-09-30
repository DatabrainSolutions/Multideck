import test from 'node:test'
import {withProductPostgres} from './local-product-postgres.mjs'
import {createCrmSalesFixture} from './crm-sales-fixture.mjs'
test('CRM sales workflow real PostgreSQL lifecycle, access, To Do and measured insights',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(`set role authenticated;select login(2);
 select test_assert(multideck_crm_get_deal_essential(fid(1))->>'name'='European road freight renewal','colleague reads deal');
 select test_assert(jsonb_array_length(multideck_crm_pipeline_settings()->'pipelines')=1,'native pipeline settings load');
 select test_assert(jsonb_array_length(multideck_crm_deal_conversion_options()->'opportunityTypes')=1,'native conversion options load');
 select test_assert((multideck_crm_deal_register_page()->>'total')::int=4,'native register loads enriched same-company rows');
 select test_assert((multideck_crm_deal_people(fid(1))->>'canReassign')::boolean,'sales role can assign');
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),jsonb_build_object('title','Confirm volumes with Jamie','type','call','ownerId','00000000-0000-0000-0000-000000000002','dueAt',(current_date-1+time '12:00')::timestamptz));
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'title'='Confirm volumes with Jamie','named next action saved');
 select test_assert(jsonb_array_length(multideck_todo_list(current_date-1))=1,'assigned action appears in own real tasks');
 select test_assert(jsonb_array_length(query_sales())=4,'Dexter reads shared same-company deals');
 select test_assert((query_insights()->0->'summary'->>'overdueActions')::int=1,'Dexter reads computed sales insights');
 select multideck_todo_update((multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'taskId')::uuid,'{"status":"completed"}');
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'nextAction'='null'::jsonb,'task completion completes deal action');
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'actionHistory'->0->>'status'='completed','completion history retained');
 select multideck_crm_update_deal(fid(1),deal_version(1),'{"ownerId":"00000000-0000-0000-0000-000000000002","primaryContactId":"60000000-0000-0000-0000-000000000110"}');
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),jsonb_build_object('title','Send a revised proposal','type','quote','ownerId','00000000-0000-0000-0000-000000000002','dueAt',now()+interval '1 day'));
 select multideck_crm_lose_deal(fid(1),deal_version(1),jsonb_build_object('reasonCode','competitor','details','Chose an existing carrier contract','competitor','Example Logistics','revisitDate',current_date+30));
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'loss'->>'reasonCode'='competitor','structured loss saved');
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'nextAction'='null'::jsonb,'loss retires current action');
 select test_assert(jsonb_array_length(multideck_todo_list(current_date+30))=1,'loss revisit is actionable');
 select multideck_crm_move_deal_stage(fid(2),fid(200),fid(211));
 select multideck_crm_update_deal(fid(2),deal_version(2),jsonb_build_object('expectedCloseDate',current_date+30));
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'slippingDeals')::int=1,'actual outward close-date change counted');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'closedDeals')::int=1,'closed cohort denominator');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'winRatePct')::numeric=0,'one lost no wins is zero percent');
 select test_assert((multideck_crm_get_sales_insights()->'stages'->0->>'movedOnDeals')::int=2,'observed stage transitions counted');
 reset role;
 select test_assert((select count(*)>0 from "CRM_DealEvents" where deal_id=fid(1) and actor_id='00000000-0000-0000-0000-000000000002'),'changes audited with actor');
 `))
}))

test('CRM boundary denies foreign, inactive, unlinked, anonymous, read-only and stale callers while preserving history',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(`set role authenticated;select login(3);
 select test_assert(multideck_crm_get_deal_essential(fid(1))->>'id'=fid(1)::text,'standard read colleague can open');
 select test_assert(not(multideck_crm_deal_people(fid(1))->>'canEdit')::boolean,'read does not imply write');
 select expect_denied($q$select multideck_crm_update_deal(fid(1),1,'{"name":"forged"}')$q$,'42501');
 select expect_denied($q$select multideck_crm_lose_deal(fid(1),1,'{"reasonCode":"price"}')$q$,'42501');
 select login(2);
 select expect_denied($q$select multideck_crm_update_deal(fid(1),999,'{"name":"stale"}')$q$,'P0001');
 select expect_denied($q$select multideck_crm_update_deal(fid(1),deal_version(1),'{"ownerId":"00000000-0000-0000-0000-000000000005"}')$q$,'22023');
 select expect_denied($q$select multideck_crm_update_deal(fid(1),deal_version(1),'{"primaryContactId":"60000000-0000-0000-0000-000000000111"}')$q$,'22023');
 select expect_denied($q$select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"other","details":" "}')$q$,'22023');
 select expect_denied($q$select multideck_crm_move_deal_stage(fid(1),fid(200),fid(213))$q$,'22023');
 select expect_denied($q$select multideck_crm_move_deal_stage(fid(1),fid(200),fid(212))$q$,'22023');
 select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"price","details":"Budget declined"}');
 select expect_denied($q$select multideck_crm_win_deal(fid(1),fid(212),'bypass')$q$,'22023');
 select expect_denied($q$select multideck_crm_move_deal_stage(fid(1),fid(200),fid(210))$q$,'22023');
 select expect_denied($q$select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'')$q$,'22023');
 select expect_denied($q$select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(213),'retry')$q$,'22023');
 select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Customer revised their budget');
 select test_assert(not(multideck_crm_get_deal_essential(fid(1))->>'isLost')::boolean,'reopened to open');
 select test_assert(jsonb_array_length(multideck_crm_get_deal_essential(fid(1))->'outcomeHistory')=2,'loss and recovery preserved');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'closedDeals')::int=0,'reopened excluded from currently closed cohort');
 select login(5);
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'openDeals')::int=1,'foreign company own cohort only');
 select expect_denied($q$select multideck_crm_get_deal_essential(fid(1))$q$,'P0002');
 select expect_denied($q$select multideck_crm_deal_people(fid(1))$q$,'P0002');
 select expect_denied($q$select multideck_crm_get_sales_insights(90,fid(200),null)$q$,'22023');
 select expect_denied($q$select multideck_crm_lose_deal(fid(1),1,'{"reasonCode":"price"}')$q$,'P0002');
 select login(99);select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
 reset role;update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='00000000-0000-0000-0000-000000000001';
 set role authenticated;select login(1);select expect_denied($q$select multideck_crm_get_deal_essential(fid(1))$q$,'42501');
 select login(2);select test_assert(multideck_crm_get_deal_essential(fid(1))->>'id'=fid(1)::text,'creator deactivation preserves historical company work');
 reset role;update "cmp_Users" set "Auth_User_ID"=null where "User_ID"='00000000-0000-0000-0000-000000000002';
 set role authenticated;select login(2);select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
 reset role;set role anon;select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');reset role;
 select test_assert(not has_table_privilege('authenticated','"CRM_DealActions"','UPDATE'),'no browser table action bypass');
 select test_assert(not has_table_privilege('authenticated','"CRM_DealEvents"','SELECT'),'event evidence only via scoped reads');
 select test_assert(not has_function_privilege('authenticated','multideck_dexter_action_update_deal_sales(uuid,uuid,jsonb)','EXECUTE'),'action adapter server only');
 `))
}))

test('CRM Dexter actual watch creation, deterministic event matching, pause/resume and ownership',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(`
 create table test_watch(id uuid);grant select,insert on test_watch to authenticated;
 create function event_count() returns bigint language plpgsql security definer as $$begin if exists(select 1 from "AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch health: %',(select "AIDexterWatch_LastHealthError" from "AI_DexterWatches" limit 1);end if;return(select count(*) from "AI_DexterWatchEvents");end$$;
 set role authenticated;select login(2);
 insert into test_watch select (multideck_dexter_create_watch('deals','When this deal is lost','Notify on loss','Watch this deal',fid(1),'Deal 1','{"field":"lossReasonCode","operator":"changed"}',null)->>'id')::uuid;
 select multideck_crm_update_deal(fid(1),deal_version(1),'{"expectedValueAmount":13000}');
 select test_assert(event_count()=0,'non-matching change does not notify');
 select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"price"}');
 select test_assert(event_count()=1,'matching real loss fires exactly once');
 select multideck_crm_update_deal(fid(1),deal_version(1),'{"expectedValueAmount":14000}');
 select test_assert(event_count()=1,'unchanged loss no duplicate');
 select multideck_dexter_set_watch_status((select id from test_watch),'paused');
 select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Budget restored');
 select test_assert(event_count()=1,'pause blocks matching change');
 select multideck_dexter_set_watch_status((select id from test_watch),'active');
 select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"timing"}');
 select test_assert(event_count()=2,'resume observes later change once');
 select login(1);select expect_denied($q$select multideck_dexter_set_watch_status((select id from test_watch),'paused')$q$,'P0002');
 select login(5);select expect_denied($q$select multideck_dexter_create_watch('deals','x','x','x',fid(1),'x','{"field":"lossReasonCode","operator":"changed"}',null)$q$,'42501');
 reset role;delete from "cmp_Users_Roles" where "User_ID"='00000000-0000-0000-0000-000000000002';
 set role authenticated;select login(1);select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Customer returned');
 select test_assert(event_count()=2,'watch owner permission revocation stops notifications');
 reset role;insert into "cmp_Users_Roles" values('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001');
 update "cmp_Users" set "Auth_User_ID"=null where "User_ID"='00000000-0000-0000-0000-000000000002';
 set role authenticated;select login(1);select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"cancelled"}');
 select test_assert(event_count()=2,'unlinked watch owner cannot receive new events');

 reset role;
 select test_assert(not exists(select 1 from "AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error'),'no swallowed watch errors');
 `))
}))

test('CRM Dexter uses real prepared approval, canonical writer, audit and idempotent retry',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(`
 select login(2);select set_config('request.jwt.claim.role','service_role',false);
 insert into "AI_DexterIntentPlans"("AIDexterIntent_ID","AIDexterIntent_CompanyID","AIDexterIntent_UserID","AIDexterIntent_ClientSessionID","AIDexterIntent_PromptSHA256","AIDexterIntent_AllowedActionsJSON","AIDexterIntent_Specialist","AIDexterIntent_AccessMode","AIDexterIntent_ExpiresAt") values(fid(300),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',fid(301),repeat('a',64),'["update_deal_sales"]','sales','approve',now()+interval '10 minutes');
 insert into "AI_DexterPreparedActions"("AIDexterPrepared_ID","AIDexterPrepared_CompanyID","AIDexterPrepared_UserID","AIDexterPrepared_ClientSessionID","AIDexterPrepared_IntentID","AIDexterPrepared_ActionCode","AIDexterPrepared_ArgumentsJSON","AIDexterPrepared_TargetID","AIDexterPrepared_Title","AIDexterPrepared_Description","AIDexterPrepared_AccessMode","AIDexterPrepared_ExpiresAt") values(fid(302),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',fid(301),fid(300),'update_deal_sales',jsonb_build_object('target_id',fid(1),'expected_version',1,'operation','set_next_action','input',jsonb_build_object('title','Call about customs requirements','type','call','ownerId','00000000-0000-0000-0000-000000000002','dueAt',now()+interval '1 day'),'reason','Agree shipment requirements'),fid(1),'Schedule next action','Call about customs requirements','approve',now()+interval '10 minutes');
 select expect_denied($q$select multideck_dexter_execute_prepared_action(fid(302),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null)$q$,'42501');
 select test_assert((select count(*)=0 from "CRM_DealActions"),'unapproved prepared write does not mutate');
 select test_assert(multideck_dexter_approve_prepared_action(fid(302),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null),'actual approval accepted');
 select test_assert((multideck_dexter_execute_prepared_action(fid(302),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null)->>'updated')::boolean,'approved executor executes canonical action');
 select test_assert((select count(*)=1 from "CRM_DealActions"),'one action persisted');
 select test_assert((select count(*)=1 from "AI_DexterActionAudit" where "AIDexterAudit_Status"='succeeded' and "AIDexterAudit_ActionCode"='update_deal_sales'),'actual Dexter audit records success');
 select test_assert((multideck_dexter_execute_prepared_action(fid(302),'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',null)->>'replayed')::boolean,'retry replays result');
 select test_assert((select count(*)=1 from "CRM_DealActions"),'retry does not duplicate task or action');
 select test_assert(multideck_dexter_execute_prepared_action(fid(302),'20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005',null)->'error'->>'code'='prepared_action_unavailable','foreign actor cannot execute another prepared action');
 `))
}))

test('CRM legacy closures, timezone task dates, replacement and won handover remain consistent',()=>withProductPostgres((sql,ok)=>{
 createCrmSalesFixture(sql,ok)
 ok(sql(`
 update "CRM_Opportunities" set "CRMOppty_StatusCode"='lost' where "CRMOppty_ID"=fid(3);
 update "CRM_Opportunities" set "CRMOppty_PipelineStageID"=fid(213) where "CRMOppty_ID"=fid(4);
 set role authenticated;select login(2);
 select test_assert((multideck_crm_get_deal_essential(fid(3))->>'isLost')::boolean,'legacy lost status recognised without invented date');
 select test_assert(multideck_crm_get_deal_essential(fid(3))->'lostAt'='null'::jsonb,'legacy loss timestamp remains unknown');
 select test_assert((multideck_crm_get_sales_insights()->'coverage'->>'undatedClosedDeals')::int=2,'unknown outcome dates disclosed');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'openDeals')::int=2,'legacy closed deals excluded from open snapshot');
 select test_assert((multideck_crm_deal_register_page()->'summary'->>'open')::int=2,'register open total matches legacy outcomes');
 select test_assert((multideck_crm_deal_register_page(null,'lost')->>'total')::int=2,'register lost filter includes legacy lost stage');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'closedDeals')::int=0,'legacy dates not invented into period outcomes');
 select expect_denied($q$select multideck_crm_set_deal_next_action(fid(3),deal_version(3),jsonb_build_object('title','Bypass','type','call','ownerId','00000000-0000-0000-0000-000000000002','dueAt',now()))$q$,'22023');
 select multideck_crm_reopen_deal(fid(3),deal_version(3),fid(210),'Correct an imported outcome');
 select test_assert(not(multideck_crm_get_deal_essential(fid(3))->>'isLost')::boolean,'legacy loss has deliberate recovery');
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),'{"title":"Late local follow-up","type":"call","ownerId":"00000000-0000-0000-0000-000000000002","dueAt":"2026-10-01T21:15:00Z","taskDate":"2026-10-02"}');
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'taskScheduledDate'='2026-10-02','local task day retained across UTC midnight');
 select multideck_todo_update((multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'taskId')::uuid,'{"scheduledDate":"2026-10-03","title":"Rescheduled local follow-up"}');
 select test_assert((multideck_crm_get_deal_essential(fid(1))->'nextAction'->>'dueAt')::timestamptz='2026-10-02T21:15:00Z'::timestamptz,'To Do reschedule preserves due time');
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),jsonb_build_object('title','Updated next step','type','meeting','ownerId','00000000-0000-0000-0000-000000000002','dueAt',now()+interval '1 day'));
 select test_assert(jsonb_array_length(multideck_crm_get_deal_essential(fid(1))->'actionHistory')=2,'replacement preserves action history');
 select test_assert(jsonb_array_length(multideck_todo_list('2026-10-03'))=0,'superseded task retired');
 select expect_denied($q$select multideck_crm_set_deal_next_action(fid(2),deal_version(2),jsonb_build_object('title','Bad owner','type','call','ownerId','00000000-0000-0000-0000-000000000003','dueAt',now()))$q$,'22023');
 select multideck_crm_win_deal(fid(1),fid(212),'Customer agreed the proposal');
 select test_assert((multideck_crm_get_deal_essential(fid(1))->>'isWon')::boolean,'native won activation succeeds');
 select test_assert(multideck_crm_get_deal_essential(fid(1))->'nextAction'='null'::jsonb,'won retires active action');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'wonDeals')::int=1,'won outcome measured');
 select test_assert((multideck_crm_get_sales_insights()->'summary'->>'winRatePct')::numeric=100,'won denominator is explicit');
 reset role;
 update "CRM_PipelineStages" set "CRMPipelineStage_Name"='Dormant' where "CRMPipelineStage_ID"=fid(213);
 update "CRM_DealEvents" set occurred_at=now()-interval '20 days' where deal_id=fid(2);
 set role authenticated;
 select multideck_crm_lose_deal(fid(2),deal_version(2),'{"reasonCode":"timing"}');
 select test_assert(multideck_crm_get_deal_essential(fid(2))->>'pipelineStageId'=fid(210)::text,'loss without configured lost stage preserves real stage');
 select multideck_crm_reopen_deal(fid(2),deal_version(2),fid(210),'Ready to restart');
 select test_assert((select (r->>'daysInStage')::numeric<1 from jsonb_array_elements(multideck_crm_get_sales_insights()->'records') r where r->>'id'=fid(2)::text),'same-stage reopen resets dwell instead of counting closed time');

 `))
}))
