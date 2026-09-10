import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const migration=readFileSync(new URL('../migrations/20260909220517_dexter_provider_history.sql',import.meta.url),'utf8')
test('Provider history is owner-private, immutable and attached only to an owned assistant message',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-astra-usage-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role()returns text language sql as $$select current_setting('test.role')$$;
   create table public."cmp_Users"("User_ID" uuid,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
   create table public."AI_Conversations"("AICNV_ID" uuid primary key,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid,"AICNV_Channel" text,"AICNV_EndedAt" timestamptz);
   create table public."AI_Messages"("AIMSG_ID" uuid primary key,"AIMSG_ConversationID" uuid,"AIMSG_Role" text);
   ${migration}
   do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();conv uuid:=gen_random_uuid();m uuid:=gen_random_uuid();
    other_user uuid:=gen_random_uuid();other_auth uuid:=gen_random_uuid();h jsonb:='{"model":"gpt-6-astra","baseEffort":"medium","lastEffort":"high","contract":"permissions-hash","items":[{"role":"user","content":"Synthetic"},{"type":"configuration_update","reasoning":{"effort":"high"}}]}';
   begin
    insert into public."cmp_Users" values(u,c,a,'active'),(other_user,c,other_auth,'active');
    insert into public."AI_Conversations" values(conv,c,u,'chat',null);
    insert into public."AI_Messages" values(m,conv,'assistant');
    perform set_config('test.role','authenticated',true);
    begin perform public.multideck_dexter_provider_history(c,u,a,conv,m,h);raise exception 'browser wrote history';exception when insufficient_privilege then null;end;
    perform set_config('test.role','service_role',true);
    perform public.multideck_dexter_provider_history(c,u,a,conv,m,h);
    if public.multideck_dexter_provider_history(c,u,a,conv,m)<>h then raise exception 'history changed';end if;
    perform public.multideck_dexter_provider_history(c,u,a,conv,m,h);
    begin perform public.multideck_dexter_provider_history(c,u,a,conv,m,h||'{"baseEffort":"high"}');raise exception 'rewrote cached history';exception when invalid_parameter_value then null;end;
    begin perform public.multideck_dexter_provider_history(c,other_user,other_auth,conv,m);raise exception 'foreign owner';exception when insufficient_privilege then null;end;
    begin perform public.multideck_dexter_provider_history(gen_random_uuid(),u,a,conv,m);raise exception 'foreign company';exception when insufficient_privilege then null;end;
    begin perform public.multideck_dexter_provider_history(c,u,a,gen_random_uuid(),m);raise exception 'foreign conversation';exception when insufficient_privilege then null;end;
    update public."AI_Messages" set "AIMSG_Role"='user';
    begin perform public.multideck_dexter_provider_history(c,u,a,conv,m);raise exception 'not assistant';exception when insufficient_privilege then null;end;
    update public."AI_Messages" set "AIMSG_Role"='assistant';
    update public."cmp_Users" set "User_AccessStatus"='disabled' where "User_ID"=u;
    begin perform public.multideck_dexter_provider_history(c,u,a,conv,m);raise exception 'revoked user';exception when insufficient_privilege then null;end;
    if has_table_privilege('authenticated','public."AI_DexterProviderHistory"','select') or
     has_function_privilege('authenticated','public.multideck_dexter_provider_history(uuid,uuid,uuid,uuid,uuid,jsonb)','execute') then raise exception 'browser access';end if;
   end $$;
  `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
