import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('sales analysis leases bound repeats, isolate users and deny revoked or foreign access',()=>{
  const bin=process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir=mkdtempSync(join(tmpdir(),'crm-analysis-cache-'))
  let started=false
  const run=(cmd,args,input)=>{const result=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);return result.stdout}
  try {
    run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'pg.log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
    const migration=readFileSync(new URL('../migrations/20260922150000_crm_sales_analysis_cache.sql',import.meta.url),'utf8')
    run('psql',['-X','-h',dir,'-U','postgres','-v','ON_ERROR_STOP=1'],`
      create role anon;create role authenticated;create role service_role;
      create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
      create function _multideck_crm_has_permission(uuid,text) returns boolean language sql as $$select current_setting('test.permission',true)='yes'$$;
      ${migration}
      create function denied(c uuid,u uuid,f text) returns void language plpgsql as $$begin
        begin perform multideck_crm_claim_sales_analysis(c,u,f);exception when others then if sqlstate in ('42501','P0001','22023') then return;end if;raise;end;
        raise exception 'Expected denial';end$$;
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();f text:=repeat('a',64);claim jsonb;begin
        insert into "cmp_Users" values(u,c,gen_random_uuid(),'active'),(u2,c,gen_random_uuid(),'active');
        perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('test.permission','yes',true);
        perform denied(c,u,f);perform set_config('request.jwt.claim.role','service_role',true);
        perform denied(gen_random_uuid(),u,f);perform denied(c,u,'bad');
        claim:=multideck_crm_claim_sales_analysis(c,u,f);
        if claim->>'leaseId' is null then raise exception 'No lease';end if;
        perform denied(c,u,f);perform denied(c,u,repeat('b',64));
        if multideck_crm_finish_sales_analysis(c,u,gen_random_uuid(),'{"summary":"wrong"}') then raise exception 'Stale lease accepted';end if;
        if not multideck_crm_finish_sales_analysis(c,u,(claim->>'leaseId')::uuid,'{"summary":"saved"}') then raise exception 'Save failed';end if;
        if multideck_crm_claim_sales_analysis(c,u,f)#>>'{cached,summary}'<>'saved' then raise exception 'Cache failed';end if;
        if multideck_crm_claim_sales_analysis(c,u2,f)->>'leaseId' is null then raise exception 'Cross-user cache leaked';end if;
        perform set_config('test.permission','no',true);perform denied(c,u,f);perform set_config('test.permission','yes',true);
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=u;perform denied(c,u,f);
        if has_table_privilege('authenticated','"AI_CrmSalesAnalyses"','select') or has_function_privilege('anon','multideck_crm_claim_sales_analysis(uuid,uuid,text)','execute') then raise exception 'Private cache exposed';end if;
      end$$;
    `)
  } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
