import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

const read=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')
const policy=read('20260904145000_quote_follow_up_policy.sql')
const start=policy.indexOf('create or replace function public.quote_workflow_finalize_customer_response_v4(')
assert.ok(start>=0)
const wrapper=policy.slice(start,policy.indexOf('\n$$;',start)+4)
const fix=read('20260906072644_quote_finalization_service_boundary.sql')
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0

test('real follow-up wrapper is service-only, with anonymous and authenticated denial before side effects',{skip:!available},()=>{
  const directory=mkdtempSync(join(tmpdir(),'multideck-finalize-acl-'))
  const data=join(directory,'data');let started=false
  const run=(command,args,input)=>{
    const result=spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:30000})
    assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result.stdout
  }
  const args=['-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql=input=>run('psql',args,input)
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${directory} -c listen_addresses=''`,'-w','start']);started=true
    // Only downstream delivery/scheduling work is a spy. The recreated wrapper
    // and the repair are exact production SQL; real Postgres enforces roles.
    sql(`create role anon;create role authenticated;create role service_role;
      create schema quote_api;
      create table quote_api.effects(kind text);
      create function public.quote_workflow_finalize_customer_response_pre_fu_20260904(uuid,text)
      returns jsonb language plpgsql security definer set search_path='' as $$
      begin insert into quote_api.effects values('delivery');return jsonb_build_object('provider',$2);end $$;
      revoke all on function public.quote_workflow_finalize_customer_response_pre_fu_20260904(uuid,text) from public,anon,authenticated,service_role;
      create function quote_api.schedule_customer_follow_up(uuid) returns timestamptz
      language plpgsql set search_path='' as $$begin insert into quote_api.effects values('follow_up');return '2026-09-09T09:00:00Z';end $$;
      ${wrapper}
      grant execute on function public.quote_workflow_finalize_customer_response_v4(uuid,text) to service_role;
      do $$begin
        if not has_function_privilege('anon','public.quote_workflow_finalize_customer_response_v4(uuid,text)','execute')
          then raise exception 'Expected recreate regression missing';end if;
      end $$;`)
    sql(fix)
    // Re-running the ACL migration is safe; it must not change the wrapper body.
    const before=sql("select md5(pg_get_functiondef('public.quote_workflow_finalize_customer_response_v4(uuid,text)'::regprocedure));")
    sql(fix)
    assert.equal(sql("select md5(pg_get_functiondef('public.quote_workflow_finalize_customer_response_v4(uuid,text)'::regprocedure));"),before)
    for(const role of ['anon','authenticated']) {
      sql(`set role ${role};do $$begin
        begin perform public.quote_workflow_finalize_customer_response_v4(gen_random_uuid(),'fabricated-provider');
          raise exception 'Untrusted caller was accepted';
        exception when insufficient_privilege then null;end;
      end $$;reset role;`)
    }
    sql(`do $$begin if exists(select 1 from quote_api.effects) then raise exception 'Rejected call produced side effects';end if;end $$;
      set role service_role;
      do $$declare result jsonb;begin
        result:=public.quote_workflow_finalize_customer_response_v4(gen_random_uuid(),'trusted-provider');
        if result->>'provider'<>'trusted-provider' or (result->>'followUpAt')::timestamptz<>'2026-09-09T09:00:00Z'::timestamptz
          then raise exception 'Service result changed';end if;
      end $$;reset role;
      do $$begin
        if (select count(*) from quote_api.effects where kind='delivery')<>1
          or (select count(*) from quote_api.effects where kind='follow_up')<>1 then raise exception 'Trusted flow did not run once';end if;
        if has_function_privilege('service_role','public.quote_workflow_finalize_customer_response_pre_fu_20260904(uuid,text)','execute')
          then raise exception 'Service may bypass follow-up wrapper';end if;
      end $$;`)
  } finally {
    if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'])
    rmSync(directory,{recursive:true,force:true})
  }
})
