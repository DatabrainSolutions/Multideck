import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const sql=readFileSync(new URL('../migrations/20260910010200_dexter_active_actor_context.sql',import.meta.url),'utf8')
test('Dexter actor context rejects disabled, missing and ambiguous identities',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-actor-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public."cmp_Users"("User_ID" uuid,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
   ${sql}
   create function public.test_dexter_read() returns uuid language sql security definer set search_path=pg_catalog,public as $$select company_id from public._multideck_dexter_context()$$;
   grant execute on function public.test_dexter_read() to authenticated;
   do $$declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();s text;begin
    begin perform public.test_dexter_read();raise exception 'Anonymous identity accepted';exception when insufficient_privilege then null;end;
    perform set_config('request.jwt.claim.sub',a::text,true);
    begin perform public.test_dexter_read();raise exception 'Unlinked identity accepted';exception when insufficient_privilege then null;end;
    insert into public."cmp_Users" values(u,c,a,'active');
    if public.test_dexter_read() is distinct from c then raise exception 'Wrong company';end if;
    foreach s in array array['disabled','suspended','invited','revoked'] loop
     update public."cmp_Users" set "User_AccessStatus"=s where "User_ID"=u;
     begin perform public.test_dexter_read();raise exception 'Inactive identity accepted: %',s;exception when insufficient_privilege then null;end;
    end loop;
    update public."cmp_Users" set "User_AccessStatus"=null where "User_ID"=u;
    if public.test_dexter_read() is distinct from c then raise exception 'Legacy active semantics lost';end if;
    update public."cmp_Users" set "Company_ID"=null where "User_ID"=u;
    begin perform public.test_dexter_read();raise exception 'Missing company accepted';exception when insufficient_privilege then null;end;
    update public."cmp_Users" set "Company_ID"=c where "User_ID"=u;
    insert into public."cmp_Users" values(gen_random_uuid(),other_c,a,'active');
    begin perform public.test_dexter_read();raise exception 'Ambiguous identity accepted';exception when insufficient_privilege then null;end;
    delete from public."cmp_Users" where "Company_ID"=other_c;
    update public."cmp_Users" set "Company_ID"=other_c where "User_ID"=u;
    if public.test_dexter_read() is distinct from other_c then raise exception 'Old company context retained';end if;
    if has_function_privilege('authenticated','public._multideck_dexter_context()','execute') then raise exception 'Internal helper directly exposed';end if;
    set local role authenticated;
    if public.test_dexter_read() is distinct from other_c then raise exception 'Authorised browser RPC wrapper failed';end if;
    reset role;
   end $$;
  `)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
