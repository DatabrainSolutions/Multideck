import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const migration=readFileSync(new URL('../migrations/20260910212840_dexter_background_tasks.sql',import.meta.url),'utf8')
const recoveryMigration=readFileSync(new URL('../migrations/20260910214530_dexter_task_recovery.sql',import.meta.url),'utf8')
const calendarMigration=readFileSync(new URL('../migrations/20260910214949_dexter_task_calendar_context.sql',import.meta.url),'utf8')
const retryMigration=readFileSync(new URL('../migrations/20260910215732_dexter_task_retry_phase.sql',import.meta.url),'utf8')
const conversationMigration=readFileSync(new URL('../migrations/20260910220611_dexter_task_conversation_lifecycle.sql',import.meta.url),'utf8')
const deletedControlMigration=readFileSync(new URL('../migrations/20260910221122_dexter_task_deleted_control.sql',import.meta.url),'utf8')
test('durable tasks: owner isolation, three slots, leases, saved results, schedules, events and confirmed completion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-tasks-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
 run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
 const sql=input=>run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input)
 sql(`
 create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
 create table "cmp_Company"("Company_ID" uuid primary key);
 create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text,"User_Email" text,"User_Firstname" text,"User_Lastname" text);
 create table "OPS_UserTasks"("TodoTask_ID" uuid primary key default gen_random_uuid(),"TodoTask_CompanyID" uuid,"TodoTask_OwnerUserID" uuid,"TodoTask_Title" text,"TodoTask_StatusCode" text default 'open',"TodoTask_IsDeleted" boolean default false,"TodoTask_ScheduledDate" date default current_date,"TodoTask_PriorityCode" text,"TodoTask_CompletedAt" timestamptz,"TodoTask_LinksJSON" jsonb default '[]',"TodoTask_TagsJSON" jsonb default '[]',"TodoTask_CreatedAt" timestamptz default now());
 create table "AI_Conversations"("AICNV_ID" uuid primary key,"AICNV_Title" text,"AICNV_Channel" text,"AICNV_DomainCode" text,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid,"AICNV_Status" text,"AICNV_SecurityClass" text,"AICNV_IsTrainingAllowed" boolean,"AICNV_MetadataJSON" jsonb,"AICNV_StartedAt" timestamptz,"AICNV_EndedAt" timestamptz,"AICNV_CreatedAt" timestamptz,"AICNV_CreatedBy" uuid,"AICNV_UpdatedAt" timestamptz,"AICNV_UpdatedBy" uuid);
 create table "AI_Messages"("AIMSG_ID" uuid primary key default gen_random_uuid(),"AIMSG_ConversationID" uuid,"AIMSG_Role" text,"AIMSG_ContentJSON" jsonb);
 create table "AI_DexterWatches"("AIDexterWatch_ID" uuid primary key default gen_random_uuid(),"AIDexterWatch_OwnerUserID" uuid,"AIDexterWatch_CompanyID" uuid,"AIDexterWatch_ActionJSON" jsonb,"AIDexterWatch_StatusCode" text default 'active',"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_TargetID" uuid);
 create table "AI_DexterWatchEvents"("AIDexterWatchEvent_WatchID" uuid,"AIDexterWatchEvent_OwnerUserID" uuid);
 create table "AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
 create table "Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
 create table "AI_DexterPreparedActions"("AIDexterPrepared_ID" uuid primary key,"AIDexterPrepared_ConversationID" uuid,"AIDexterPrepared_UserID" uuid,"AIDexterPrepared_CompanyID" uuid,"AIDexterPrepared_Status" text,"AIDexterPrepared_ActionCode" text,"AIDexterPrepared_ResultJSON" jsonb,"AIDexterPrepared_ArgumentsJSON" jsonb);
 create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text);
 create table "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Name" text,"AIDexterWatchCapability_Description" text,"AIDexterWatchCapability_FieldsJSON" jsonb);
 create function _multideck_dexter_context() returns table(user_id uuid,company_id uuid) language plpgsql as $$begin return query select "User_ID","Company_ID" from "cmp_Users" where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active';if not found then raise insufficient_privilege;end if;end$$;
 create function _multideck_todo_task_json(t "OPS_UserTasks") returns jsonb language sql as $$select to_jsonb(t)$$;
 create function _multideck_todo_update_for_actor(c uuid,u uuid,t uuid,p jsonb) returns jsonb language plpgsql as $$begin update "OPS_UserTasks" set "TodoTask_StatusCode"=p->>'status' where "TodoTask_ID"=t and "TodoTask_CompanyID"=c and "TodoTask_OwnerUserID"=u;return p;end$$;
 create function multideck_dexter_set_watch_status(id uuid,s text) returns void language sql as $$update "AI_DexterWatches" set "AIDexterWatch_StatusCode"=s where "AIDexterWatch_ID"=id$$;
 create function multideck_dexter_list_domains() returns jsonb language sql as $$select jsonb_build_object('user',auth.uid(),'role',auth.role())$$;
 create function multideck_dexter_get_conversation(id uuid) returns jsonb language sql as $$select jsonb_build_object('id',id)$$;
 create table "CAL_Meetings"("CALMeeting_ID" uuid,"CALMeeting_CompanyID" uuid,"CALMeeting_OrganiserUserID" uuid,"CALMeeting_Title" text,"CALMeeting_StartAt" timestamptz,"CALMeeting_EndAt" timestamptz,"CALMeeting_TimeZone" text,"CALMeeting_StatusCode" text,"CALMeeting_ProviderCode" text,"CALMeeting_LeadID" uuid,"CALMeeting_AccountID" uuid);
 create table "CAL_ProviderConnections"("CALConnection_ID" uuid,"CALConnection_CompanyID" uuid,"CALConnection_UserID" uuid,"CALConnection_ProviderCode" text,"CALConnection_StatusCode" text);
 create table "CAL_ProviderEvents"("CALProviderEvent_ID" uuid,"CALProviderEvent_CompanyID" uuid,"CALProviderEvent_OwnerUserID" uuid,"CALProviderEvent_ConnectionID" uuid,"CALProviderEvent_MeetingID" uuid,"CALProviderEvent_Title" text,"CALProviderEvent_IsPrivate" boolean,"CALProviderEvent_StartAt" timestamptz,"CALProviderEvent_EndAt" timestamptz,"CALProviderEvent_JoinURL" text,"CALProviderEvent_IsOrganiser" boolean,"CALProviderEvent_ResponseCode" text,"CALProviderEvent_IsCancelled" boolean);
 ${migration}
 ${recoveryMigration}
 ${calendarMigration}
 ${retryMigration}
 ${conversationMigration}
 ${deletedControlMigration}
 -- Local fixture has no outbound network. Keep all actual queue/lease logic.
 create or replace function _dexter_task_kick() returns void language sql as $$select$$;
 update "AI_DexterTaskSettings" set enabled=true;
 do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();authuser uuid:=gen_random_uuid();other uuid:=gen_random_uuid();t uuid;firsttask uuid;a uuid;conv uuid;r uuid;token uuid;v jsonb;claims jsonb;msg uuid;watch uuid;pa uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();
 begin
 insert into "cmp_Company" values(c);insert into "cmp_Users" values(u,c,authuser,'active','qa@example.invalid','QA','User');
 perform set_config('request.jwt.claim.sub',authuser::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 for i in 1..4 loop
  insert into "OPS_UserTasks"("TodoTask_CompanyID","TodoTask_OwnerUserID","TodoTask_Title") values(c,u,'QA task '||i) returning "TodoTask_ID" into t;
  v:=multideck_task_handoff(t);if i=1 then firsttask:=t;a:=(v->>'id')::uuid;conv:=(v->>'conversation_id')::uuid;end if;
 end loop;
 if (multideck_task_handoff(firsttask)->>'id')::uuid<>a then raise exception 'duplicate handoff';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 begin perform multideck_task_assignments();raise exception 'foreign owner read';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',authuser::text,true);
 begin perform multideck_task_claim();raise exception 'browser worker';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.role','service_role',true);
 claims:=multideck_task_claim();if jsonb_array_length(claims)<>3 then raise exception 'three slots missing';end if;
 if multideck_task_claim()<>'[]'::jsonb then raise exception 'fourth task ran';end if;
 if (select count(distinct icon) from "AI_DexterTaskAssignments" where status='working')<>3 then raise exception 'duplicate active icon';end if;
 select id,lease_token into r,token from "AI_DexterTaskRuns" where assignment_id=a;
 begin perform multideck_task_worker_rpc(r,gen_random_uuid(),'multideck_dexter_list_domains');raise exception 'stale lease accepted';exception when insufficient_privilege then null;end;
 begin perform multideck_task_worker_rpc(r,token,'multideck_todo_delete');raise exception 'arbitrary RPC';exception when insufficient_privilege then null;end;
 v:=multideck_task_worker_rpc(r,token,'multideck_dexter_list_domains');if v->>'user'<>authuser::text or v->>'role'<>'authenticated' or auth.role()<>'service_role' then raise exception 'owner context leak';end if;
 update "cmp_Users" set "User_AccessStatus"='suspended' where "User_ID"=u;
 begin perform multideck_task_worker_context(r,token);raise exception 'revoked user ran';exception when insufficient_privilege then null;end;
 update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=u;
 begin perform multideck_task_finish(r,token,'{"status":"ready","outcome":"deliver_result"}');raise exception 'unsaved success';exception when object_not_in_prerequisite_state then null;end;
 insert into "AI_Messages"("AIMSG_ConversationID","AIMSG_Role","AIMSG_ContentJSON") values(conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('taskRunId',r))) returning "AIMSG_ID" into msg;
 perform multideck_task_finish(r,token,'{"status":"ready","outcome":"deliver_result","summary":"Result with evidence"}');
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'open' then raise exception 'unseen result completed';end if;
 if jsonb_array_length(multideck_task_claim())<>1 then raise exception 'review did not release slot';end if;
 begin perform multideck_task_finish(r,token,'{"status":"ready"}');raise exception 'result replay';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.role','authenticated',true);
 v:=multideck_task_control(a,'view',0,null,1);
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'completed' then raise exception 'view did not deliver';end if;
 begin perform multideck_task_control(a,'retry',0);raise exception 'stale edit';exception when serialization_failure then null;end;
 v:=multideck_task_control(a,'reschedule',(select version from "AI_DexterTaskAssignments" where id=a),null,null,now()+interval '1 day');
 perform set_config('request.jwt.claim.role','service_role',true);
 if multideck_task_claim()<>'[]'::jsonb then raise exception 'future run early';end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform multideck_task_control(a,'cancel',(v->>'version')::int);
 if exists(select 1 from "AI_DexterTaskRuns" where assignment_id=a and state in ('running','queued')) then raise exception 'cancel left work';end if;
 -- Retry while other agents occupy three slots, then release them.
 v:=multideck_task_control(a,'retry',(select version from "AI_DexterTaskAssignments" where id=a));
 if (select phase from "AI_DexterTaskRuns" where assignment_id=a and state='queued')<>'execute' then raise exception 'retry rediscovered scheduled work';end if;
 update "AI_DexterTaskRuns" set state='cancelled',lease_until=null where assignment_id<>a;
 perform set_config('request.jwt.claim.role','service_role',true);perform multideck_task_claim();
 select id,lease_token into r,token from "AI_DexterTaskRuns" where assignment_id=a and state='running';
 insert into "AI_Messages"("AIMSG_ConversationID","AIMSG_Role","AIMSG_ContentJSON") values(conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('taskRunId',r,'emailDraft',jsonb_build_object('id',draft)))) returning "AIMSG_ID" into msg;
 perform multideck_task_finish(r,token,'{"status":"ready","outcome":"send_email","summary":"Draft ready"}');
 perform set_config('request.jwt.claim.role','authenticated',true);perform multideck_task_control(a,'view',0,null,2);
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'open' then raise exception 'draft view completed send';end if;
 insert into "AI_DexterPreparedActions" values(pa,conv,u,c,'prepared','create_email_draft','{"emailDraft":{"delivery":{"status":"draft_created"}}}',jsonb_build_object('draft',jsonb_build_object('id',draft)));
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='succeeded' where "AIDexterPrepared_ID"=pa;
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'open' then raise exception 'provider draft completed send';end if;
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='prepared',"AIDexterPrepared_ActionCode"='send_email',"AIDexterPrepared_ResultJSON"='{"emailDraft":{"delivery":{"status":"sent"}}}' where "AIDexterPrepared_ID"=pa;
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='succeeded' where "AIDexterPrepared_ID"=pa;
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'completed' then raise exception 'confirmed send not completed';end if;
 -- Every change in the delivered result must succeed under the same owner.
 v:=multideck_task_control(a,'followup',(select version from "AI_DexterTaskAssignments" where id=a),'Prepare two record changes');
 perform set_config('request.jwt.claim.role','service_role',true);perform multideck_task_claim();
 select id,lease_token into r,token from "AI_DexterTaskRuns" where assignment_id=a and state='running';
 if (select phase from "AI_DexterTaskRuns" where id=r)<>'discover' then raise exception 'followup inherited execution phase';end if;
 pa:=gen_random_uuid();draft:=gen_random_uuid();
 insert into "AI_Messages"("AIMSG_ConversationID","AIMSG_Role","AIMSG_ContentJSON") values(conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('taskRunId',r,'pendingActions',jsonb_build_array(jsonb_build_object('id',pa),jsonb_build_object('id',draft)))));
 perform multideck_task_finish(r,token,'{"status":"ready","outcome":"apply_changes","summary":"Two changes to review"}');
 insert into "AI_DexterPreparedActions" values(pa,conv,u,c,'prepared','update_booking','{}','{}'),(draft,conv,u,c,'prepared','update_booking','{}','{}');
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='succeeded' where "AIDexterPrepared_ID"=pa;
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'open' then raise exception 'partial changes completed task';end if;
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='failed' where "AIDexterPrepared_ID"=draft;
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'open' then raise exception 'failed change completed task';end if;
 update "AI_DexterPreparedActions" set "AIDexterPrepared_Status"='succeeded' where "AIDexterPrepared_ID"=draft;
 if (select "TodoTask_StatusCode" from "OPS_UserTasks" where "TodoTask_ID"=firsttask)<>'completed' then raise exception 'all confirmed changes did not complete';end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 -- Real event delivery is one-shot; foreign watch IDs never queue this task.
 v:=multideck_task_control(a,'retry',(select version from "AI_DexterTaskAssignments" where id=a));
 perform set_config('request.jwt.claim.role','service_role',true);perform multideck_task_claim();
 select id,lease_token into r,token from "AI_DexterTaskRuns" where assignment_id=a and state='running';
 insert into "AI_DexterWatches"("AIDexterWatch_OwnerUserID","AIDexterWatch_CompanyID") values(u,c) returning "AIDexterWatch_ID" into watch;
 insert into "AI_Messages"("AIMSG_ConversationID","AIMSG_Role","AIMSG_ContentJSON") values(conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('taskRunId',r)));
 perform multideck_task_finish(r,token,jsonb_build_object('status','waiting','watch_id',watch,'summary','Waiting'));
 insert into "AI_DexterWatchEvents" values(gen_random_uuid(),u);if (select status from "AI_DexterTaskAssignments" where id=a)<>'waiting' then raise exception 'foreign event';end if;
 insert into "AI_DexterWatchEvents" values(watch,u),(watch,u);
 if (select count(*) from "AI_DexterTaskRuns" where assignment_id=a and state='queued')<>1 then raise exception 'event duplicate';end if;
 if (select "AIDexterWatch_StatusCode" from "AI_DexterWatches" where "AIDexterWatch_ID"=watch)<>'paused' then raise exception 'one shot not paused';end if;
 perform multideck_task_claim();
 select id,lease_token into r,token from "AI_DexterTaskRuns" where assignment_id=a and state='running';
 perform multideck_task_worker_interrupted(r,token,'stream_incomplete');
 if (select state from "AI_DexterTaskRuns" where id=r)<>'queued' or (select due_at from "AI_DexterTaskRuns" where id=r)<=now() then raise exception 'retry did not back off';end if;
 begin perform multideck_task_worker_context(r,token);raise exception 'interrupted lease still valid';exception when insufficient_privilege then null;end;
 if multideck_task_claim()<>'[]'::jsonb then raise exception 'retry started without backoff';end if;
 update "AI_DexterTaskRuns" set due_at=now(),attempts=2 where id=r;
 perform multideck_task_claim();select lease_token into token from "AI_DexterTaskRuns" where id=r;
 perform multideck_task_worker_interrupted(r,token,'stream_incomplete');
 if (select state from "AI_DexterTaskRuns" where id=r)<>'failed' or (select status from "AI_DexterTaskAssignments" where id=a)<>'failed' then raise exception 'unbounded retry';end if;
 begin update "AI_Conversations" set "AICNV_EndedAt"=now() where "AICNV_ID"=conv;raise exception 'task conversation silently orphaned';exception when object_not_in_prerequisite_state then null;end;
 update "OPS_UserTasks" set "TodoTask_IsDeleted"=true where "TodoTask_ID"=firsttask;
 if (select "AICNV_EndedAt" from "AI_Conversations" where "AICNV_ID"=conv) is null or (select status from "AI_DexterTaskAssignments" where id=a)<>'cancelled' then raise exception 'task deletion did not close background work';end if;
 begin perform multideck_task_control(a,'retry',(select version from "AI_DexterTaskAssignments" where id=a));raise exception 'deleted task restarted';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','public."AI_DexterTaskRuns"','SELECT') or has_function_privilege('authenticated','public.multideck_task_worker_rpc(uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'worker data exposed';end if;
 end$$;
 do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();id uuid:=gen_random_uuid();conn uuid:=gen_random_uuid();v jsonb;bounds record;
 begin
  insert into "cmp_Company" values(c);insert into "cmp_Users" values(u,c,actor,'active',null,null,null);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into "CAL_Meetings" values(id,c,u,'Untitled customer meeting','2026-09-14T23:30:00Z','2026-09-15T00:30:00Z','Europe/London','confirmed','local',null,null);
  v:=multideck_dexter_domain_calendar(c,'2026-09-15@Europe/London',25);if jsonb_array_length(v)<>1 then raise exception 'local day missed midnight meeting';end if;
  if multideck_dexter_domain_calendar(gen_random_uuid(),'2026-09-15@Europe/London',25)<>'[]'::jsonb then raise exception 'foreign calendar';end if;
  if jsonb_array_length(multideck_dexter_domain_calendar(c,id::text,25))<>1 then raise exception 'exact meeting ID';end if;
  select * into bounds from _dexter_calendar_window('2026-03-29@Europe/London');if bounds.ends_at-bounds.starts_at<>interval '23 hours' then raise exception 'spring DST boundary';end if;
  select * into bounds from _dexter_calendar_window('2026-10-25@Europe/London');if bounds.ends_at-bounds.starts_at<>interval '25 hours' then raise exception 'autumn DST boundary';end if;
  insert into "CAL_ProviderConnections" values(conn,c,u,'google','connected');
  insert into "CAL_ProviderEvents" values(id,c,u,conn,null,'Private detail',true,now()+interval '1 day',now()+interval '1 day 1 hour',null,true,null,false);
  v:=multideck_dexter_domain_external_events(c,to_char(now()+interval '1 day','YYYY-MM-DD')||'@UTC',25);
  if jsonb_array_length(v)<>1 or v->0->>'title'<>'Busy' then raise exception 'private event title exposed';end if;
  if multideck_dexter_domain_external_events(c,'Private detail',25)<>'[]'::jsonb then raise exception 'private title searchable';end if;
 end$$;
 `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
