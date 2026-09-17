import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const migration=readFileSync(new URL('../migrations/20260909212608_dexter_astra_usage_metering.sql',import.meta.url),'utf8')
test('Astra reservations cover cache writes; exact settlement accounts for cache hits, long context, scope and replay',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-astra-usage-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.role()returns text language sql as $$select current_setting('test.role')$$;
   create table public."AI_DexterModelEgressAudit"("AIDexterEgress_ID" uuid,"AIDexterEgress_CompanyID" uuid,"AIDexterEgress_UserID" uuid,"AIDexterEgress_Outcome" text,"AIDexterEgress_Provider" text,"AIDexterEgress_Model" text,"AIDexterEgress_ActualCostGBP" numeric);
   create function public.multideck_dexter_reserve_model_egress(p_company_id uuid,p_user_id uuid,p_conversation_id uuid,p_provider text,p_model text,p_purpose text,p_data_categories jsonb,p_record_count integer,p_byte_count bigint,p_estimated_input_units integer,p_estimated_output_units integer)
    returns uuid language plpgsql as $$begin perform public._multideck_dexter_estimated_usage_gbp(case when lower(p_model) like '%terra%' then 'worker' else 'fast' end,p_estimated_input_units,p_estimated_output_units);return gen_random_uuid();end$$;
   create function public.multideck_dexter_settle_model_egress(p_reservation_id uuid,p_company_id uuid,p_user_id uuid,p_outcome text,p_provider_request_id text,p_input_units integer,p_output_units integer,p_error_code text)
    returns void language plpgsql as $$declare v_row public."AI_DexterModelEgressAudit";cost numeric;begin
     select * into v_row from public."AI_DexterModelEgressAudit" where "AIDexterEgress_ID"=p_reservation_id;
     cost:=public._multideck_dexter_estimated_usage_gbp(case when lower(v_row."AIDexterEgress_Model") like '%terra%' then 'worker' else 'fast' end,p_input_units,p_output_units);
     update public."AI_DexterModelEgressAudit" set "AIDexterEgress_Outcome"=p_outcome,"AIDexterEgress_ActualCostGBP"=cost where "AIDexterEgress_ID"=p_reservation_id;end$$;
   ${migration}
   do $$declare id uuid:=gen_random_uuid();c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();usage jsonb;begin
    if public._multideck_dexter_astra_usage_gbp(100000,10000,0,0)<>1.2 then raise exception 'Uncached rate wrong';end if;
    if public._multideck_dexter_astra_usage_gbp(100000,10000,100000,0)<>0.48 then raise exception 'Cache read rate wrong';end if;
    if public._multideck_dexter_astra_usage_gbp(100000,10000,0,100000)<>1.4 then raise exception 'Cache write rate wrong';end if;
    if public._multideck_dexter_astra_usage_gbp(300000,10000,100000,100000)<>4.36 then raise exception 'Long context rate wrong';end if;
    if public._multideck_dexter_estimated_usage_gbp('gpt-6-astra',100000,10000)<>1.4 or public._multideck_dexter_estimated_usage_gbp('worker',100000,10000)<>0.32 then raise exception 'Reservation or legacy rates wrong';end if;
    begin perform public._multideck_dexter_astra_usage_gbp(10,1,8,8);raise exception 'Invalid cache counts accepted';exception when invalid_parameter_value then null;end;
    insert into public."AI_DexterModelEgressAudit"("AIDexterEgress_ID","AIDexterEgress_CompanyID","AIDexterEgress_UserID","AIDexterEgress_Outcome","AIDexterEgress_Provider","AIDexterEgress_Model") values(id,c,u,'attempted','openai','gpt-6-astra');
    usage:='{"input_tokens":100000,"output_tokens":10000,"input_tokens_details":{"cached_tokens":100000,"cache_write_tokens":0}}';
    perform set_config('test.role','authenticated',true);
    begin perform public.multideck_dexter_settle_responses_egress(id,c,u,'succeeded','response',usage,null);raise exception 'Browser settled usage';exception when insufficient_privilege then null;end;
    perform set_config('test.role','service_role',true);
    perform public.multideck_dexter_settle_responses_egress(id,gen_random_uuid(),u,'succeeded','response',usage,null);
    if (select "AIDexterEgress_Outcome" from public."AI_DexterModelEgressAudit")<>'attempted' then raise exception 'Foreign settlement changed row';end if;
    perform public.multideck_dexter_settle_responses_egress(id,c,u,'succeeded','response',usage,null);
    if (select "AIDexterEgress_ActualCostGBP" from public."AI_DexterModelEgressAudit")<>0.48 then raise exception 'Actual settlement lost cache rate';end if;
    perform public.multideck_dexter_settle_responses_egress(id,c,u,'failed','response','{}',null);
    if (select "AIDexterEgress_ActualCostGBP" from public."AI_DexterModelEgressAudit")<>0.48 then raise exception 'Replay repriced usage';end if;
    if has_function_privilege('authenticated','public.multideck_dexter_settle_responses_egress(uuid,uuid,uuid,text,text,jsonb,text)','execute') then raise exception 'Settlement exposed to browser';end if;
   end $$;
  `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
