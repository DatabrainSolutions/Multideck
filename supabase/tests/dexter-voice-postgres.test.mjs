import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const read=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8')
const categories=read('20260826190000_admin_usage_categories.sql')
const extract=(sql,name)=>{const start=sql.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0);return sql.slice(start,sql.indexOf('\n$$;',start)+4)}
const security=read('20260816120000_dexter_security_hardening.sql')
const ledgerStart=security.indexOf('create table if not exists public."AI_DexterModelEgressAudit"')
const ledger=security.slice(ledgerStart,security.indexOf('\n);',ledgerStart)+3)
test('voice enforces owner, tenant, active identity, shared daily budget, durable usage and private retention',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-voice-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;
   create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
   create table "cmp_Company"("Company_ID" uuid primary key);
   create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text, permitted boolean default true);
   create table "AI_Conversations"("AICNV_ID" uuid primary key,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid,"AICNV_Channel" text default 'chat',"AICNV_EndedAt" timestamptz);
   alter table "AI_Conversations" add column "AICNV_Title" text,add column "AICNV_DomainCode" text,add column "AICNV_Status" text,
    add column "AICNV_SecurityClass" text,add column "AICNV_IsTrainingAllowed" boolean,add column "AICNV_MetadataJSON" jsonb,
    add column "AICNV_StartedAt" timestamptz,add column "AICNV_CreatedAt" timestamptz,add column "AICNV_CreatedBy" uuid,
    add column "AICNV_UpdatedAt" timestamptz,add column "AICNV_UpdatedBy" uuid;
   create table "AI_ConversationParticipants"("AICNP_ConversationID" uuid,"AICNP_ParticipantType" text,"AICNP_UserID" uuid,
    "AICNP_DisplayNameSnapshot" text,"AICNP_IsPrimary" boolean,"AICNP_CreatedAt" timestamptz);
   ${ledger}
   ${read('20260910010200_dexter_active_actor_context.sql')}
   create function _multideck_dexter_has_permissions(p_user_id uuid,p_permissions jsonb) returns boolean language sql as $$select permitted from "cmp_Users" where "User_ID"=p_user_id$$;
   create table "AI_DexterUsagePolicies"("AIUsagePolicy_CompanyID" uuid,"AIUsagePolicy_PlanCode" text,"AIUsagePolicy_IncludedGbp" numeric,"AIUsagePolicy_PayAsYouGoEnabled" boolean,"AIUsagePolicy_BillingReady" boolean,"AIUsagePolicy_ExtraUsageLimitGbp" numeric,"AIUsagePolicy_ExtraUsageRateMultiplier" numeric);
   create table "AI_TranscriptionUsage"("TranscriptionUsage_CompanyID" uuid,"TranscriptionUsage_EstimatedCostGbp" numeric,"TranscriptionUsage_Status" text,"TranscriptionUsage_CreatedAt" timestamptz);
   ${extract(read('20260830220000_complete_workspace_ai_usage_metering.sql'),'_multideck_dexter_allowance_state')}
   create function _multideck_dexter_estimated_usage_gbp(text,integer,integer) returns numeric language sql as $$select 0.02::numeric$$;
   ${extract(categories,'multideck_dexter_reserve_model_egress')}
   create function _multideck_usage_categories(p_company_id uuid) returns jsonb language sql as $$select jsonb_build_object('seatCount',10,'categories',jsonb_build_array(jsonb_build_object('id','ai','used',(_multideck_dexter_allowance_state(p_company_id)->>'usageGbp')::numeric)))$$;
   create table "AI_DexterWatches"("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
   create table "AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
   ${extract(categories,'_multideck_emit_usage_watch_signal')}
   create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Description" text);
   create table "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text);
   ${read('20260917103946_dexter_live_voice.sql')}
   ${read('20260917105428_dexter_voice_conversation_history.sql')}
   ${read('20260917123000_dexter_voice_account_exception.sql')}
   do $$<<voice_test>> declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();chat uuid:=gen_random_uuid();id uuid;r jsonb;v jsonb;cost numeric;s text;begin
    insert into "cmp_Company" values(c),(other_c);
    insert into "cmp_Users" values(u,c,a,'active',true),(other_u,other_c,gen_random_uuid(),'active',true);
    insert into "AI_Conversations"("AICNV_ID","AICNV_CompanyID","AICNV_OwnerUserID") values(chat,other_c,other_u);
    insert into "AI_DexterWatches" values(c,'usage','active',null),(other_c,'usage','active',null);
    begin perform multideck_voice_preferences();raise exception 'Anonymous voice accepted';exception when insufficient_privilege then null;end;
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    set local role authenticated;
    r:=multideck_voice_preferences('willow');
    if r->>'voice'<>'willow' or (r->>'remainingSeconds')::int<>300 then raise exception 'Preferences failed';end if;
    begin perform * from "AI_DexterVoiceSessions";raise exception 'Private voice rows exposed';exception when insufficient_privilege then null;end;
    begin perform multideck_voice_reserve(c,u,null,'willow',false);raise exception 'Browser reservation accepted';exception when insufficient_privilege then null;end;
    reset role;
    foreach s in array array['disabled','suspended','invited','revoked'] loop
      update "cmp_Users" set "User_AccessStatus"=s where "User_ID"=u;
      begin perform multideck_voice_preferences();raise exception 'Inactive account accepted';exception when insufficient_privilege then null;end;
    end loop;
    update "cmp_Users" set "User_AccessStatus"='active',permitted=false where "User_ID"=u;
    begin perform multideck_voice_preferences();raise exception 'Missing Dexter permission accepted';exception when insufficient_privilege then null;end;
    update "cmp_Users" set permitted=true where "User_ID"=u;
    perform set_config('request.jwt.claim.role','service_role',true);
    begin perform multideck_voice_reserve(other_c,u,null,'willow',false);raise exception 'Foreign operator accepted';exception when insufficient_privilege then null;end;
    begin perform multideck_voice_reserve(c,u,chat,'willow',false);raise exception 'Foreign chat accepted';exception when insufficient_privilege then null;end;
    r:=multideck_voice_reserve(c,u,null,'willow',true);id:=(r->>'id')::uuid;
    if (r->>'seconds')::int<>18 then raise exception 'Preview unbounded';end if;
    if r->>'conversationId' is not null then raise exception 'Preview created chat';end if;
    begin perform multideck_voice_reserve(c,u,null,'willow',false);raise exception 'Concurrent session accepted';exception when sqlstate 'P0001' then if sqlerrm<>'voice_already_active' then raise;end if;end;
    perform multideck_voice_settle(id,other_c,u,10,true,'provider','[]','closed');
    if exists(select 1 from "AI_DexterVoiceSessions" s where s.id=voice_test.id and ended_at is not null) then raise exception 'Foreign settle accepted';end if;
    perform multideck_voice_settle(id,c,u,10,true,'provider','[{"delta":"Private caption"}]','closed');
    perform multideck_voice_settle(id,c,u,12,true,'provider','[]','duplicate');
    if (select sum(seconds) from "AI_DexterVoiceSessions")<>10 then raise exception 'Duplicate charged';end if;
    if (select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"=c)<>1 then raise exception 'Voice signal not exactly once';end if;
    if exists(select 1 from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"=other_c) then raise exception 'Foreign signal emitted';end if;
    cost:=(_multideck_dexter_allowance_state(c)->>'usageGbp')::numeric;
    if abs(cost-10::numeric/60*.05/1.3)>0.000001 then raise exception 'Voice excluded from pooled AI';end if;
    select value into v from jsonb_array_elements(_multideck_usage_categories(c)->'categories') where value->>'id'='voice';
    if v->>'unit'<>'minutes' or (v->>'used')::numeric<>0.2 then raise exception 'Voice category missing';end if;
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>290 then raise exception 'Preview allowance not charged';end if;
    r:=multideck_voice_reserve(c,u,null,'willow',false);id:=(r->>'id')::uuid;
    if (r->>'seconds')::int<>290 then raise exception 'Remaining duration wrong';end if;
    if not exists(select 1 from "AI_Conversations" where "AICNV_ID"=(r->>'conversationId')::uuid
      and "AICNV_OwnerUserID"=u and "AICNV_CompanyID"=c) then raise exception 'Voice-only conversation not persisted privately';end if;
    if (select count(*) from "AI_ConversationParticipants" where "AICNP_ConversationID"=(r->>'conversationId')::uuid)<>2 then raise exception 'Voice participants missing';end if;
    update "AI_DexterVoiceSessions" set expires_at=now()-interval '1 second' where "AI_DexterVoiceSessions".id=voice_test.id;
    if multideck_voice_reconcile(c)<>1 then raise exception 'Expired worker unreconciled';end if;
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>0 then raise exception 'Crashed worker erased allowance';end if;
    begin perform multideck_voice_reserve(c,u,null,'willow',false);raise exception 'Daily cap exceeded';exception when sqlstate 'P0001' then if sqlerrm<>'voice_daily_limit' then raise;end if;end;
    insert into auth.users values(a,'HARRY@DATABRAIN.SOLUTIONS',null);
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>0 then raise exception 'Unverified email exempted';end if;
    update auth.users set email_confirmed_at=now() where auth.users.id=a;
    if (multideck_voice_preferences()->>'dailyUnlimited')::boolean is not true
      or (multideck_voice_preferences()->>'remainingSeconds')::int<>300 then raise exception 'Verified account still capped';end if;
    r:=multideck_voice_reserve(c,u,null,'willow',false);
    if (r->>'seconds')::int<>300 then raise exception 'Exempt account cannot reserve after daily cap';end if;
    perform multideck_voice_settle((r->>'id')::uuid,c,u,0,true,null,'[]','cancelled_before_connection');
    update auth.users set email='colleague@databrain.solutions' where auth.users.id=a;
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>0 then raise exception 'Another account exempted';end if;
    delete from auth.users where auth.users.id=a;
    update "AI_DexterVoiceSessions" set day=day-1,created_at=now()-interval '31 days';
    perform multideck_voice_reconcile(c);
    if exists(select 1 from "AI_DexterVoiceSessions" where transcript<>'[]') then raise exception 'Captions retained too long';end if;
    if (select sum(seconds) from "AI_DexterVoiceSessions")<>300 then raise exception 'Retention erased accounting';end if;
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>300 then raise exception 'Daily reset failed';end if;
    insert into "AI_DexterUsagePolicies" values(c,'10',cost+.20,false,false,null,1);
    r:=multideck_voice_reserve(c,u,null,'willow',false);id:=(r->>'id')::uuid;
    begin perform multideck_dexter_reserve_model_egress(c,u,null,'openai','test','dexter_chat','[]',0,0,10,10);raise exception 'Model spent reserved voice budget';exception when sqlstate 'P0001' then if sqlerrm<>'usage_allowance_reached' then raise;end if;end;
    perform multideck_voice_settle(id,c,u,0,true,null,'[]','cancelled_before_connection');
    if (multideck_voice_preferences()->>'remainingSeconds')::int<>300 then raise exception 'Unused connection not refunded';end if;
    if has_function_privilege('authenticated','multideck_voice_settle(uuid,uuid,uuid,numeric,boolean,text,jsonb,text)','execute') then raise exception 'Browser can settle usage';end if;
   end $$;
  `)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
