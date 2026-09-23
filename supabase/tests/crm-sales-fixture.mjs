import {readFileSync} from 'node:fs'
import {currentFunction} from './operational-access-source.mjs'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url),'utf8')
const baseline=readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8')
const table=name=>{const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`);if(start<0)throw Error(name);return baseline.slice(start,baseline.indexOf('\n);',start)+4)}
const native=name=>currentFunction('public',name).sql
const baselineFunction=(schema,name)=>{const start=baseline.indexOf(`CREATE OR REPLACE FUNCTION "${schema}"."${name}"(`);if(start<0)throw Error(name);const body=baseline.indexOf('AS $$',start);return baseline.slice(start,baseline.indexOf('$$;',body+5)+3)}
function from(file,name,alias=name){const source=read(file);const match=new RegExp(`create (?:or replace )?function public\\.${name}\\(`,'i').exec(source);if(!match)throw Error(name);const head=match.index;const body=/as\s+\$\$/i.exec(source.slice(head));const end=source.indexOf('$$;',head+body.index+body[0].length);return source.slice(head,end+3).replace(`function public.${name}(`,`function public.${alias}(`).replace(/^create function/,'create or replace function')}
export function createCrmSalesFixture(sql,ok){
 ok(sql(`
 create schema auth;create schema booking_api;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
 create table "cmp_Company"("Company_ID" uuid primary key);
 create table "cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_Firstname" text,"User_Lastname" text,"User_Email" text,"User_AccessStatus" text default 'active');
 create table "cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
 create table "sys_UserRoles"("sys_UserRole_ID" uuid primary key,"sys_UserRole_Name" text);
 create table "sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid);
 create table "sys_Permissions"("sys_Permission_ID" uuid primary key,"sys_Permission_Value" text);
 create function public.multideck_cloud_product_access(text) returns boolean language sql stable as $$select false$$;
 create table "Org_Master"("Org_id" uuid primary key,"Org_Name" text,"Org_CRMRelationshipStatusCode" text,"Org_CRMIsLead" boolean,"Org_CRMIsPotentialCustomer" boolean,"Org_CRMUpdatedAt" timestamptz);
 create table "Org_Contacts"("OrgContact_ID" uuid primary key,"Org_ID" uuid,"OrgContact_FirstName" text,"OrgContact_LastName" text);
 create table "Org_Master_Type"("Org_ID" uuid,"OrgType_ID" uuid);
 create table "Org_Types"("OrgType_ID" uuid primary key,"OrgType_Name" text,"OrgType_Order" int);
 ${['CRM_Opportunities','CRM_Pipelines','CRM_PipelineStages','CRM_LeadFieldSettings','CRM_Leads','CRM_AccountProfiles','CRM_OpportunityStageHistory','CRM_Activities','OrgContact_Emails','sys_CRMActivityTypes','sys_CRMRelationshipStatuses','sys_CRMOpportunityTypes','sys_CRMOpportunityStages','sys_CRMOpportunityStatuses','sys_CRMLossReasons','OPS_UserTasks','sys_AIDexterDataDomains','sys_AIDexterActions','sys_AIDexterWatchCapabilities','AI_DexterWatches','AI_DexterWatchSignals','AI_DexterWatchEvents','AI_DexterWatchStates','AI_DexterPreparedActions','AI_DexterIntentPlans','AI_DexterActionAudit','AI_DexterSecurityEvents','AI_DexterConversationGrants','AI_Conversations'].map(table).join('\n')}
 alter table "OPS_UserTasks" add column "TodoTask_DexterConversationID" uuid;
 alter table "CRM_Opportunities" add primary key("CRMOppty_ID");alter table "OPS_UserTasks" add primary key("TodoTask_ID");
 alter table "sys_CRMLossReasons" add primary key("CRMLossReason_Code");
 alter table "sys_AIDexterWatchCapabilities" add primary key("AIDexterWatchCapability_Code");
 alter table "AI_DexterWatches" add primary key("AIDexterWatch_ID");
 alter table "AI_DexterWatchStates" add primary key("AIDexterWatchState_WatchID","AIDexterWatchState_SourceID");
 create unique index account_org on "CRM_AccountProfiles"("CRMAccount_OrgID");
 create table "Comm_Notifications"("CommNotif_ID" uuid default gen_random_uuid(),"CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
 ${native('_multideck_crm_context')}
 ${native('_multideck_crm_has_permission')}
 ${native('_multideck_dexter_context')}
 ${native('_multideck_dexter_has_permission')}
 ${native('_multideck_dexter_has_permissions')}
 ${native('_multideck_crm_deal_is_fixture')}
 ${native('_multideck_crm_deal_is_operator_visible')}
 ${native('_multideck_crm_account_profile_company')}
 create trigger account_company before insert or update on "CRM_AccountProfiles" for each row execute function _multideck_crm_account_profile_company();
 ${native('_multideck_crm_increment_deal_edit_version')}
 create trigger "TR_CRM_Opportunities_edit_version" before update on "CRM_Opportunities" for each row execute function _multideck_crm_increment_deal_edit_version();
 ${from('202607300002_crm_supabase_rpc','_multideck_crm_deal_json','_multideck_crm_deal_json_unfiltered_20260818')}
 ${from('20260818142716_crm_fixture_deal_isolation','_multideck_crm_deal_json')}
 ${from('20260818125500_crm_deal_contact_column_fix','_multideck_crm_update_deal_unversioned_20260818')}
 ${from('20260818123000_crm_lead_deal_optimistic_concurrency','multideck_crm_update_deal','_multideck_crm_update_deal_visible_guard_20260818')}
 ${from('20260818142716_crm_fixture_deal_isolation','multideck_crm_update_deal')}
 ${from('202607300002_crm_supabase_rpc','multideck_crm_move_deal_stage','_multideck_crm_move_deal_stage_unfiltered_20260818')}
 ${from('20260803150000_crm_shawn_essentials','multideck_crm_win_deal','_multideck_crm_win_deal_unfiltered_20260818')}
 ${from('20260818142716_crm_fixture_deal_isolation','multideck_crm_win_deal')}
 ${from('20260803150000_crm_shawn_essentials','_multideck_crm_deal_conversion_state')}
 ${native('multideck_crm_get_deal_essential')}
 ${native('multideck_crm_deal_register_page')}
 ${native('multideck_crm_deal_conversion_options')}
 ${native('multideck_crm_pipeline_settings')}
 ${native('_multideck_todo_task_json')}
 ${native('_multideck_todo_assert_actor')}
 ${native('_multideck_todo_clean_references')}
 ${native('_multideck_todo_update_for_actor')}
 ${native('multideck_todo_update')}
 ${native('multideck_todo_list')}
 ${native('multideck_dexter_query_domain')}
 ${native('_multideck_dexter_can_manage')}
 ${native('_multideck_dexter_deny_prepared_action')}
 ${baselineFunction('public','multideck_dexter_execute_prepared_action')}
 ${native('multideck_dexter_approve_prepared_action')}
 ${currentFunction('private','multideck_dexter_guard_mandatory_approval').sql}
 create trigger mandatory_approval before update of "AIDexterPrepared_Status" on "AI_DexterPreparedActions" for each row execute function private.multideck_dexter_guard_mandatory_approval();
 create function booking_api.customs_access(uuid,uuid,boolean) returns boolean language sql as $$select false$$;
 create function multideck_lifecycle_note_target_authorised(uuid,uuid) returns boolean language sql as $$select false$$;
 create function private.is_tenant_administrator(uuid) returns boolean language sql as $$select false$$;
 create table "Support_CloudTicketSignals"("CloudTicketSignal_TicketID" uuid,"CloudTicketSignal_CompanyID" uuid,"CloudTicketSignal_ReporterUserID" uuid);

 ${from('20260825170000_quote_booking_customs_lifecycle_notes','multideck_dexter_create_watch','_multideck_dexter_create_watch_before_support_tickets_20260828')}
 ${from('20260828140000_cloud_support_ticket_dexter_parity','multideck_dexter_create_watch','_multideck_dexter_watch_before_reports_20260907')}
 ${from('20260907223500_reporting_dexter','multideck_dexter_create_watch')}
 ${native('multideck_dexter_set_watch_status')}
 ${from('20260802153000_dexter_email_sender_attachment_watches','_multideck_dexter_watch_matches')}
 ${from('20260802150818_dexter_email_watch_reliability','_multideck_dexter_evaluate_watch_signal')}
 create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
 create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
 ${from('20260909204719_dexter_deal_stage_changes','_multideck_dexter_deal_stage_signal')}
 create trigger "TR_CRM_Opportunities_dexter_watch" after insert or update on "CRM_Opportunities" for each row execute function _multideck_dexter_deal_stage_signal();
 create function test_assert(b boolean,m text) returns void language plpgsql as $$begin if b is distinct from true then raise exception 'ASSERTION: %',m;end if;end$$;
 create function expect_denied(statement text,code text) returns void language plpgsql as $$begin
 begin execute statement;exception when others then if sqlstate=code then return;end if;raise;end;raise exception 'Expected SQLSTATE %: %',code,statement;end$$;
 create function login(n integer) returns void language sql as $$select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-'||lpad(n::text,12,'0'),false)::text is not null$$;
 create function fid(n integer) returns uuid language sql immutable as $$select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
 insert into "cmp_Company" values('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
 insert into "cmp_Users" select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n=5 then '20000000-0000-0000-0000-000000000002' else '20000000-0000-0000-0000-000000000001' end::uuid,
 case n when 1 then 'Alex' when 2 then 'Sam' else 'Colleague' end,n::text,'sales'||n||'@example.test','active' from generate_series(1,6) n;
 insert into "sys_UserRoles" values('30000000-0000-0000-0000-000000000001','Sales'),('30000000-0000-0000-0000-000000000002','Operations');
 insert into "sys_Permissions" values('40000000-0000-0000-0000-000000000001','CRM.Read'),('40000000-0000-0000-0000-000000000002','CRM.Write'),('40000000-0000-0000-0000-000000000003','CRM.Deals.Win'),('40000000-0000-0000-0000-000000000004','AgentDexter.Manage');
 insert into "sys_UserRole_Permissions" select '30000000-0000-0000-0000-000000000001',"sys_Permission_ID" from "sys_Permissions";
 insert into "sys_UserRole_Permissions" values('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001');
 insert into "cmp_Users_Roles" select "User_ID",case when "User_ID"='00000000-0000-0000-0000-000000000003' then '30000000-0000-0000-0000-000000000002' else '30000000-0000-0000-0000-000000000001' end::uuid from "cmp_Users";
 insert into "Org_Master"("Org_id","Org_Name") values(fid(100),'Northstar Components'),(fid(101),'Foreign customer');
 insert into "Org_Contacts" values(fid(110),fid(100),'Jamie','Wilson'),(fid(111),fid(101),'Private','Contact');
 insert into "Org_Types" values(fid(120),'customer',1);
 insert into "sys_CRMOpportunityTypes"("CRMOpptyType_Code","CRMOpptyType_Name") values('spot_shipment','Shipment');
 insert into "sys_CRMOpportunityStages"("CRMStage_Code","CRMStage_Name","CRMStage_IsOpen","CRMStage_IsWon","CRMStage_IsLost") values('prospecting','Prospecting',true,false,false),('won','Won',false,true,false),('lost','Lost',false,false,true);
 insert into "sys_CRMOpportunityStatuses"("CRMOpptyStatus_Code","CRMOpptyStatus_Name","CRMOpptyStatus_IsOpen") values('open','Open',true),('won','Won',false),('lost','Lost',false);
 insert into "sys_CRMRelationshipStatuses"("CRMRelStatus_Code","CRMRelStatus_Name","CRMRelStatus_IsCustomer") values('customer','Customer',true);
 insert into "CRM_Pipelines"("CRMPipeline_ID","Company_ID","CRMPipeline_Name") values(fid(200),'20000000-0000-0000-0000-000000000001','New business'),(fid(201),'20000000-0000-0000-0000-000000000002','Foreign pipeline');
 insert into "CRM_PipelineStages"("CRMPipelineStage_ID","CRMPipeline_ID","Company_ID","CRMPipelineStage_Name","CRMPipelineStage_SortOrder","CRMPipelineStage_ProbabilityPct","CRMPipelineStage_IsConversion") values
 (fid(210),fid(200),'20000000-0000-0000-0000-000000000001','Qualification',1,20,false),(fid(211),fid(200),'20000000-0000-0000-0000-000000000001','Proposal',2,60,false),(fid(212),fid(200),'20000000-0000-0000-0000-000000000001','Won',3,100,true),(fid(213),fid(200),'20000000-0000-0000-0000-000000000001','Lost',4,0,false),(fid(214),fid(201),'20000000-0000-0000-0000-000000000002','Foreign stage',1,20,false);
 insert into "sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON") values('deals','Deals','Deals','multideck_dexter_domain_deal_sales','["CRM.Read"]');
 insert into "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values('deals','Deals','Deals','["stage","status","expectedCloseDate","nextActionDueAt"]','["CRM.Read"]');
 `))
 const cargo=read('20260905112211_dexter_booking_cargo_parity');const patchStart=cargo.indexOf('do $$\ndeclare definition text; previous text');
 ok(sql(cargo.slice(patchStart,cargo.indexOf('end $$;',patchStart)+7)))
 ok(sql(read('20260909205603_dexter_deal_watch_evaluation')))
 ok(sql('create trigger evaluate_watch after insert on "AI_DexterWatchSignals" for each row execute function _multideck_dexter_evaluate_watch_signal();'))
 ok(sql(read('20260922140000_crm_deal_sales_workflow')))
 ok(sql(read('20260922160940_dexter_deal_sales_strict_schema')))
 ok(sql(`
 create function deal_version(n integer) returns bigint language sql security definer as $$select "CRMOppty_EditVersion" from "CRM_Opportunities" where "CRMOppty_ID"=fid(n)$$;
 create function query_sales() returns jsonb language sql security definer as $$select multideck_dexter_query_domain('deal_sales',null,25)->'data'$$;
 create function query_insights() returns jsonb language sql security definer as $$select multideck_dexter_query_domain('sales_insights',null,1)->'data'$$;
 insert into "CRM_Opportunities"("CRMOppty_ID","CRMOppty_OrgID","CRMOppty_OwnerUserID","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_ExpectedCloseDate","CRMOppty_ExpectedValueAmount","CRMOppty_CurrencyCode","CRMOppty_CreatedBy","CRMOppty_UpdatedBy") select fid(n),fid(case when n=5 then 101 else 100 end),('00000000-0000-0000-0000-'||lpad(case when n=5 then '5' else '1' end,12,'0'))::uuid,case n when 1 then 'European road freight renewal' when 2 then 'Air freight opportunity' when 3 then 'Weekly sea freight lane' when 4 then 'Contract review' else 'Foreign private deal' end,fid(case when n=5 then 201 else 200 end),fid(case when n=5 then 214 else 210 end),current_date+14,12000,'GBP',('00000000-0000-0000-0000-'||lpad(case when n=5 then '5' else '1' end,12,'0'))::uuid,('00000000-0000-0000-0000-'||lpad(case when n=5 then '5' else '1' end,12,'0'))::uuid from generate_series(1,5) n;
 grant usage on schema auth to authenticated,service_role;
 grant execute on all functions in schema auth to authenticated,service_role;
 revoke all on "OPS_UserTasks","CRM_Opportunities","CRM_DealActions","CRM_DealEvents" from authenticated,anon;
 grant execute on function multideck_crm_get_deal_essential(uuid),multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer),multideck_crm_pipeline_settings(),multideck_crm_deal_conversion_options() to authenticated;
 `))
}
