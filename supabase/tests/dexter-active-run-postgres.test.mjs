import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const migration=readFileSync(new URL('../migrations/20260909214416_dexter_active_response_steering.sql',import.meta.url),'utf8')
const resultMigration=readFileSync(new URL('../migrations/20260909225755_dexter_active_run_results.sql',import.meta.url),'utf8')
test('Steering queue enforces ownership, claim-once, immutable retries, transitions and expiry',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-astra-usage-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role()returns text language sql as $$select current_setting('test.role')$$;
   create table public."cmp_Users"("User_ID" uuid,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
   create table public."AI_Conversations"("AICNV_ID" uuid,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid,"AICNV_Channel" text,"AICNV_EndedAt" timestamptz);
   create table public."AI_Messages"("AIMSG_ID" uuid,"AIMSG_ConversationID" uuid,"AIMSG_Role" text,"AIMSG_ContentJSON" jsonb);
   ${migration}
   ${resultMigration}
   do $$declare r uuid:=gen_random_uuid();c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();
    conv uuid:=gen_random_uuid();msg uuid:=gen_random_uuid();other_msg uuid:=gen_random_uuid();
    session uuid:=gen_random_uuid();worker uuid:=gen_random_uuid();i uuid:=gen_random_uuid();j uuid:=gen_random_uuid();v jsonb;
   begin
    insert into public."cmp_Users" values(u,c,a,'active');
    perform set_config('test.role','authenticated',true);
    begin perform public.multideck_dexter_active_run('begin',r,c,u,a,session,null,worker);raise exception 'browser access';exception when insufficient_privilege then null;end;
    perform set_config('test.role','service_role',true);
    begin perform public.multideck_dexter_active_run('begin',r,c,u,a,session,gen_random_uuid(),worker);raise exception 'foreign conversation';exception when insufficient_privilege then null;end;
    v:=public.multideck_dexter_active_run('begin',r,c,u,a,session,null,worker);
    if v ? 'worker_token' then raise exception 'worker exposed';end if;
    begin perform public.multideck_dexter_active_run('status',r,gen_random_uuid(),u,a,session);raise exception 'foreign company';exception when insufficient_privilege then null;end;
    begin perform public.multideck_dexter_active_run('status',r,c,u,a,gen_random_uuid());raise exception 'foreign session';exception when insufficient_privilege then null;end;
    begin perform public.multideck_dexter_active_run('claim',r,c,u,a,session,null,gen_random_uuid());raise exception 'foreign worker';exception when insufficient_privilege then null;end;
    perform public.multideck_dexter_active_run('enqueue',r,c,u,a,session,null,null,i,'Only active leads');
    perform public.multideck_dexter_active_run('enqueue',r,c,u,a,session,null,null,i,'Only active leads');
    if (select count(*) from public."AI_DexterSteeringInputs")<>1 then raise exception 'retry duplicated';end if;
    begin perform public.multideck_dexter_active_run('enqueue',r,c,u,a,session,null,null,i,'Changed input');raise exception 'changed retry';exception when invalid_parameter_value then null;end;
    begin perform public.multideck_dexter_active_run('enqueue',r,c,u,a,session,null,null,j,'Second correction');raise exception 'multiple pending';exception when object_not_in_prerequisite_state then null;end;
    v:=public.multideck_dexter_active_run('claim',r,c,u,a,session,null,worker);
    if v->>'status'<>'claimed' then raise exception 'not claimed';end if;
    if public.multideck_dexter_active_run('claim',r,c,u,a,session,null,worker) is not null then raise exception 'claimed twice';end if;
    begin perform public.multideck_dexter_active_run('transition',r,c,u,a,session,null,worker,i,null,'incorporated','resp1');raise exception 'unsubmitted commit';exception when object_not_in_prerequisite_state then null;end;
    perform public.multideck_dexter_active_run('transition',r,c,u,a,session,null,worker,i,null,'submitted');
    perform public.multideck_dexter_active_run('transition',r,c,u,a,session,null,worker,i,null,'queued');
    perform public.multideck_dexter_active_run('transition',r,c,u,a,session,null,worker,i,null,'incorporated','resp1');
    begin perform public.multideck_dexter_active_run('transition',r,c,u,a,session,null,worker,i,null,'unconfirmed');raise exception 'commit downgraded';exception when object_not_in_prerequisite_state then null;end;
    perform public.multideck_dexter_active_run('enqueue',r,c,u,a,session,null,null,j,'Second correction');
    perform public.multideck_dexter_active_run('claim',r,c,u,a,session,null,worker);
    update public."AI_DexterActiveRuns" set expires_at=clock_timestamp()-interval '1 second';
    v:=public.multideck_dexter_active_run('status',r,c,u,a,session);
    if v->>'status'<>'expired' then raise exception 'not expired';end if;
    if (select status from public."AI_DexterSteeringInputs" where id=i)<>'incorporated' or
       (select status from public."AI_DexterSteeringInputs" where id=j)<>'unconfirmed' then raise exception 'expiry lost truthful states';end if;
    -- Expired/completed model execution alone must not pretend a reply was saved.
    if v->'savedResult'<>'null'::jsonb then raise exception 'unsaved result exposed';end if;
    insert into public."AI_Conversations" values(conv,c,u,'chat',null);
    insert into public."AI_Messages" values(msg,conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('activeRunId',r)));
    begin perform public.multideck_dexter_bind_run_result(r,c,u,a,gen_random_uuid(),conv,msg);raise exception 'foreign bind session';exception when insufficient_privilege then null;end;
    perform set_config('test.role','authenticated',true);
    begin perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,msg);raise exception 'browser bind';exception when insufficient_privilege then null;end;
    perform set_config('test.role','service_role',true);
    update public."AI_Conversations" set "AICNV_OwnerUserID"=gen_random_uuid();
    begin perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,msg);raise exception 'foreign saved reply';exception when insufficient_privilege then null;end;
    update public."AI_Conversations" set "AICNV_OwnerUserID"=u;
    update public."AI_Messages" set "AIMSG_Role"='user';
    begin perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,msg);raise exception 'user message bound';exception when insufficient_privilege then null;end;
    update public."AI_Messages" set "AIMSG_Role"='assistant';
    perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,msg);
    perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,msg);
    v:=public.multideck_dexter_active_run('status',r,c,u,a,session);
    if v->'savedResult'->>'messageId'<>msg::text or v->'savedResult'->>'conversationId'<>conv::text then raise exception 'saved result missing';end if;
    insert into public."AI_Messages" values(other_msg,conv,'assistant',jsonb_build_object('metadata',jsonb_build_object('activeRunId',r)));
    begin perform public.multideck_dexter_bind_run_result(r,c,u,a,session,conv,other_msg);raise exception 'result rebound';exception when object_not_in_prerequisite_state then null;end;
    update public."AI_Conversations" set "AICNV_EndedAt"=clock_timestamp();
    v:=public.multideck_dexter_active_run('status',r,c,u,a,session);
    if v->'savedResult'<>'null'::jsonb then raise exception 'ended conversation exposed';end if;
    if has_function_privilege('authenticated','public.multideck_dexter_bind_run_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid)','execute') then raise exception 'browser bind grant';end if;
    update public."cmp_Users" set "User_AccessStatus"='disabled';
    begin perform public.multideck_dexter_active_run('status',r,c,u,a,session);raise exception 'revoked user';exception when insufficient_privilege then null;end;
    if has_table_privilege('authenticated','public."AI_DexterSteeringInputs"','select') or
      has_function_privilege('authenticated','public.multideck_dexter_active_run(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text)','execute') then raise exception 'browser grants';end if;
   end $$;
  `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
