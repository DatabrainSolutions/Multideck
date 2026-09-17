import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const sql=readFileSync(new URL('../migrations/20260910000924_dexter_dismiss_deferred_work.sql',import.meta.url),'utf8')
test('dismissal is owner scoped, idempotent, preserves unrelated metadata and rejects browser database roles',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-deferred-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;
   create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
   create table public."AI_Conversations"("AICNV_ID" uuid primary key,"AICNV_CompanyID" uuid,"AICNV_OwnerUserID" uuid);
   create table public."AI_Messages"("AIMSG_ID" uuid primary key,"AIMSG_ConversationID" uuid,"AIMSG_Role" text,"AIMSG_ContentJSON" jsonb);
   ${sql}
   do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();chat uuid:=gen_random_uuid();m uuid:=gen_random_uuid();before_json jsonb;after_json jsonb;begin
    insert into public."AI_Conversations" values(chat,c,u);
    insert into public."AI_Messages" values(m,chat,'assistant','{"content":"Original answer","metadata":{"deferredWork":{"label":"Next","request":"Do remaining work","afterActionIds":["a"]},"pendingActions":[{"id":"a"}],"other":"keep"}}');
    perform set_config('request.jwt.claim.role','service_role',true);
    if public.multideck_dexter_dismiss_deferred_work(c,gen_random_uuid(),chat,m) then raise exception 'Other user could dismiss';end if;
    if public.multideck_dexter_dismiss_deferred_work(gen_random_uuid(),u,chat,m) then raise exception 'Other company could dismiss';end if;
    if public.multideck_dexter_dismiss_deferred_work(c,u,gen_random_uuid(),m) then raise exception 'Other conversation could dismiss';end if;
    if exists(select 1 from public."AI_Messages" where "AIMSG_ContentJSON"#>>'{metadata,deferredWorkDismissedAt}' is not null) then raise exception 'Denial mutated message';end if;
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin perform public.multideck_dexter_dismiss_deferred_work(c,u,chat,m);raise exception 'Browser role accepted';exception when insufficient_privilege then null;end;
    perform set_config('request.jwt.claim.role','service_role',true);
    select "AIMSG_ContentJSON" into before_json from public."AI_Messages" where "AIMSG_ID"=m;
    if not public.multideck_dexter_dismiss_deferred_work(c,u,chat,m) then raise exception 'Owner could not dismiss';end if;
    select "AIMSG_ContentJSON" into after_json from public."AI_Messages" where "AIMSG_ID"=m;
    if after_json#>>'{metadata,deferredWorkDismissedAt}' is null or after_json #- '{metadata,deferredWorkDismissedAt}' is distinct from before_json then raise exception 'Unrelated metadata lost';end if;
    perform public.multideck_dexter_dismiss_deferred_work(c,u,chat,m);
    if (select "AIMSG_ContentJSON" from public."AI_Messages" where "AIMSG_ID"=m) is distinct from after_json then raise exception 'Repeat dismissal altered history';end if;
    if has_function_privilege('authenticated','public.multideck_dexter_dismiss_deferred_work(uuid,uuid,uuid,uuid)','execute') then raise exception 'RPC exposed to browser role';end if;
   end $$;
  `)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
