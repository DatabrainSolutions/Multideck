import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const read=name=>readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8')
function extract(source,name){const start=source.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf('$$;',source.indexOf('as $$',start))+3)}
const foundation=read('20260802140000_dexter_watching_for_you')
const tables=foundation.slice(foundation.indexOf('create table if not exists'),foundation.indexOf('create index if not exists'))
const evaluator=extract(read('20260802150818_dexter_email_watch_reliability'),'_multideck_dexter_evaluate_watch_signal')
const cargo=read('20260905112211_dexter_booking_cargo_parity');const patchStart=cargo.indexOf('do $$\ndeclare definition text; previous text');const cargoPatch=cargo.slice(patchStart,cargo.indexOf('end $$;',patchStart)+7)
test('signature persistence, tenant/owner permissions, policy, snapshots, Dexter reads and deterministic watch lifecycle',()=>{
 assert.equal(spawnSync(join(bin,'initdb'),['--version']).status,0,'PostgreSQL required')
 const dir=mkdtempSync(join(tmpdir(),'signature-pg-')),data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`);return r.stdout}
 try{
 run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
 run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
 create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,phone text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table "cmp_Company"("Company_ID" uuid primary key);
 create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text default 'active');
 create table "cmp_Departments"("Department_ID" uuid primary key,"Company_ID" uuid,"Department_IsActive" boolean default true);
 create table "cmp_Users_Departments"("User_ID" uuid,"Department_ID" uuid);
 create table "sys_UserRoles"("sys_UserRole_ID" uuid primary key default gen_random_uuid(),"sys_UserRole_Name" text);
 create table "sys_Permissions"("sys_Permission_ID" uuid primary key default gen_random_uuid(),"sys_Permission_Value" text unique,"sys_Permission_Group" text,"sys_Permission_Name" text,"sys_Permission_Description" text);
 create table "sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid,primary key("sys_UserRole_ID","sys_Permission_ID"));
 create table "cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
 create table "Comm_Mailboxes"("CommMailbox_ID" uuid primary key);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 insert into "sys_UserRoles"("sys_UserRole_Name") values('Administrator'),('Operator');
 insert into "sys_Permissions"("sys_Permission_Value") values('Email.Send');
 insert into "sys_UserRole_Permissions" select "sys_UserRole_ID","sys_Permission_ID" from "sys_UserRoles" cross join "sys_Permissions";
 create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from "cmp_Users_Roles" ur join "sys_UserRole_Permissions" rp using("sys_UserRole_ID") join "sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=$1 and p."sys_Permission_Value"=$2)$$;
 create function _multideck_dexter_context() returns table(user_id uuid,company_id uuid) language sql as $$select "User_ID","Company_ID" from "cmp_Users" where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active'$$;
 create function _multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
 create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text primary key,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_SortOrder" integer);
 create table "sys_AIDexterActions"("AIDexterAction_Code" text,"AIDexterAction_DomainCode" text,"AIDexterAction_IsActive" boolean);
 ${tables}
 alter table "AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
 create table "Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
 ${extract(foundation,'_multideck_dexter_watch_matches')}
 ${extract(foundation,'multideck_dexter_create_watch')}
 ${extract(foundation,'multideck_dexter_set_watch_status')}
 ${evaluator}
 create schema booking_api;create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
 ${cargoPatch}
 create trigger evaluate after insert on "AI_DexterWatchSignals" for each row execute function _multideck_dexter_evaluate_watch_signal();
 ${read('20260911143000_email_signature_builder')}
 ${read('20260911145000_email_signature_dexter_parity')}
 ${read('20260911170000_signature_team_details')}
 ${read('20260911175000_email_signature_company_details')}
 create function check_events(n integer) returns void language plpgsql as $$begin
 if (select count(*) from "AI_DexterWatchEvents")<>n or (select count(*) from "Comm_Notifications")<>n then raise exception 'Expected % events, got %',n,(select count(*) from "AI_DexterWatchEvents");end if;
 if exists(select 1 from "AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Swallowed evaluator error';end if;end$$;
 do $$declare c uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();personal uuid:=gen_random_uuid();w uuid;payload jsonb;result jsonb;begin
 insert into "cmp_Company" values(c),(c2);insert into "cmp_Users" values(admin_id,c,admin_id,'active'),(u,c,u,'active'),(other_u,c2,other_u,'active');
 insert into "cmp_Users_Roles" select admin_id,"sys_UserRole_ID" from "sys_UserRoles" where "sys_UserRole_Name"='Administrator';
 insert into "cmp_Users_Roles" select id,"sys_UserRole_ID" from unnest(array[u,other_u]) id cross join "sys_UserRoles" where "sys_UserRole_Name"='Operator';
 insert into auth.users values(u,'{"phone":"01234","first_name":"Profile","last_name":"User"}',null),(other_u,'{"phone":"private"}',null);
 perform email_signature_company_details(admin_id,'{"name":"Company","phone":"01234"}',0);
 if (select company_details->>'phone' from email_signature_policies where company_id=c)<>'01234' then raise exception 'Company details not persisted';end if;
 if exists(select 1 from email_signature_policies where company_id=c2) then raise exception 'Foreign company affected';end if;
 begin perform email_signature_company_details(u,'{}',1);raise exception 'Operator write accepted';exception when insufficient_privilege then null;end;
 begin perform email_signature_company_details(other_u,'{}',1);raise exception 'Foreign write accepted';exception when insufficient_privilege then null;end;
 begin perform email_signature_company_details(admin_id,'{}',0);raise exception 'Stale write accepted';exception when serialization_failure then null;end;
 if (select phone from email_signature_profile_sources(c) where user_id=u)<>'01234' then raise exception 'Profile phone missing';end if;
 if exists(select 1 from email_signature_profile_sources(c) where user_id=other_u) then raise exception 'Foreign profile source exposed';end if;
 result:=email_signature_team_patch(admin_id,u,'phone','override',0);
 update auth.users set raw_user_meta_data='{"phone":"updated"}' where id=u;
 if (select overrides->>'phone' from email_signature_profiles where user_id=u)<>'override' then raise exception 'Override lost';end if;
 begin perform email_signature_team_patch(u,u,'phone','bad',1);raise exception 'Operator override';exception when insufficient_privilege then null;end;
 begin perform email_signature_team_patch(admin_id,other_u,'phone','bad',0);raise exception 'Foreign override';exception when insufficient_privilege then null;end;
 begin perform email_signature_team_patch(admin_id,u,'phone','bad',0);raise exception 'Stale override';exception when serialization_failure then null;end;
 perform email_signature_team_patch(admin_id,u,'phone',null,1);
 if (select overrides ? 'phone' from email_signature_profiles where user_id=u) then raise exception 'Reset retained override';end if;
 if (select phone from email_signature_profile_sources(c) where user_id=u)<>'updated' then raise exception 'Profile update not live';end if;
 update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=u;
 begin perform email_signature_team_patch(admin_id,u,'phone','bad',2);raise exception 'Inactive target override';exception when insufficient_privilege then null;end;
 update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=u;
 if has_function_privilege('authenticated','email_signature_profile_sources(uuid)','execute') or has_function_privilege('anon','email_signature_team_patch(uuid,uuid,text,text,integer)','execute') then raise exception 'Browser can bypass Edge';end if;

 payload:=jsonb_build_object('name','Company','document','{"version":1,"rows":[]}'::jsonb,'assignments','[{"kind":"everyone","id":null}]'::jsonb);
 result:=email_signature_commit(admin_id,sid,0,payload,false);
 if result->>'published_revision' is not null then raise exception 'Draft published prematurely';end if;
 begin perform email_signature_commit(u,sid,1,payload,true);raise exception 'Operator changed company template';exception when insufficient_privilege then null;end;
 begin perform email_signature_commit(other_u,sid,1,payload,true);raise exception 'Cross tenant write';exception when insufficient_privilege then null;end;
 result:=email_signature_commit(admin_id,sid,1,payload,true);
 if result->>'published_revision'<>'2' then raise exception 'Publish missing';end if;
 begin perform email_signature_commit(admin_id,sid,1,payload,false);raise exception 'Stale update accepted';exception when serialization_failure then null;end;
 perform set_config('test.actor',u::text,true);
 if jsonb_array_length(multideck_dexter_domain_email_signatures(c,'Company',10))<>1 then raise exception 'Assigned signature read failed';end if;
 begin perform multideck_dexter_domain_email_signatures(c2,null,10);raise exception 'Cross tenant read';exception when insufficient_privilege then null;end;
 w:=(multideck_dexter_create_watch('email_signatures','Signature updated','Company signature','Watch it',sid,'Company','{"field":"publishedRevision","operator":"changed"}',null)->>'id')::uuid;
 result:=email_signature_commit(admin_id,sid,2,payload,false);perform check_events(0);
 if result->>'published_revision'<>'2' then raise exception 'Draft changed live version';end if;
 result:=email_signature_commit(admin_id,sid,3,payload,true);perform check_events(1);
 result:=email_signature_commit(admin_id,sid,4,payload,true);perform check_events(2);
 perform multideck_dexter_set_watch_status(w,'paused');result:=email_signature_commit(admin_id,sid,5,payload,true);perform check_events(2);
 perform multideck_dexter_set_watch_status(w,'active');result:=email_signature_commit(admin_id,sid,6,payload,true);perform check_events(3);
 result:=email_signature_commit(u,personal,0,jsonb_build_object('name','Mine','document','{"version":1,"rows":[]}'::jsonb,'personal',true,'sourceTemplateId',sid),true);
 if not email_signature_available(u,c,personal) or email_signature_available(admin_id,c,personal) then raise exception 'Personal access boundary';end if;
 perform email_signature_policy(admin_id,u,false,null);
 if email_signature_available(u,c,personal) then raise exception 'Restricted personal signature remained available';end if;
 begin perform email_signature_commit(u,personal,1,jsonb_build_object('name','Mine','document','{}'::jsonb,'personal',true),false);raise exception 'Restricted user edited personal copy';exception when insufficient_privilege then null;end;
 begin perform email_signature_commit(admin_id,sid,7,payload||'{"assignments":[]}'::jsonb,true);raise exception 'Removed required default';exception when insufficient_privilege then null;end;
 perform email_signature_policy(admin_id,u,true,null);
 update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=u;
 result:=email_signature_commit(admin_id,sid,7,payload,true);perform check_events(3);
 if email_signature_available(u,c,sid) then raise exception 'Inactive access';end if;
 begin perform email_signature_commit(u,personal,1,jsonb_build_object('name','Mine','document','{}'::jsonb,'personal',true),false);raise exception 'Inactive write';exception when insufficient_privilege then null;end;
 perform set_config('test.actor',other_u::text,true);
 begin perform multideck_dexter_set_watch_status(w,'paused');raise exception 'Foreign watch access';exception when no_data_found then null;end;
 if exists(select 1 from pg_tables where tablename like 'email_signature_%' and not rowsecurity) then raise exception 'Missing RLS';end if;
 if has_table_privilege('authenticated','email_signature_templates','SELECT') or has_function_privilege('authenticated','email_signature_commit(uuid,uuid,integer,jsonb,boolean)','EXECUTE') then raise exception 'Browser bypass';end if;
 if (select count(*) from email_signature_events)=0 or (select count(*) from email_signature_versions)=0 then raise exception 'Audit/version evidence missing';end if;
 end $$;
 `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
