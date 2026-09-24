import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
const bin = process.env.PG_TEST_BIN || spawnSync('pg_config',['--bindir'],{encoding:'utf8'}).stdout.trim()
const migration = readFileSync(new URL('../migrations/20260921120000_paid_seat_pricing_and_capacity.sql',import.meta.url),'utf8')
const voiceMigration = readFileSync(new URL('../migrations/20260921130000_preserve_paid_seat_voice_usage.sql',import.meta.url),'utf8')
const cloudContractMigration = readFileSync(new URL('../migrations/20260923160034_cloud_paid_seat_contract.sql',import.meta.url),'utf8')
test('paid seats govern AI, prices, documents and concurrent admissions without browser writes', async () => {
 const dir=mkdtempSync(join(tmpdir(),'paid-seats-')), data=join(dir,'db'); let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`);return r.stdout}
 const args=['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
 const sql=input=>run('psql',args,input)
 try {
 run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
 sql(`
 create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 grant usage on schema private to service_role;
 create table private.cloud_product_state(singleton boolean primary key,tenant_id uuid);
 grant select on private.cloud_product_state to service_role;
 create table public."cmp_Company"("Company_ID" uuid primary key);
 create table public."cmp_Users"("User_ID" uuid primary key default gen_random_uuid(),"Company_ID" uuid,"User_AccessStatus" text default 'active',"Auth_User_ID" uuid unique);
 create table public."AI_DexterUsagePolicies"("AIUsagePolicy_CompanyID" uuid primary key,"AIUsagePolicy_PlanCode" text default '25',"AIUsagePolicy_IncludedGbp" numeric default 1442.3077,"AIUsagePolicy_PayAsYouGoEnabled" boolean default false,"AIUsagePolicy_BillingReady" boolean default false,"AIUsagePolicy_ExtraUsageLimitGbp" numeric,"AIUsagePolicy_ExtraUsageRateMultiplier" numeric default 1,"AIUsagePolicy_UpdatedAt" timestamptz);
 alter table public."AI_DexterUsagePolicies" enable row level security;
 revoke all on public."AI_DexterUsagePolicies" from public,anon,authenticated;
 create table public."AI_DexterModelEgressAudit"("AIDexterEgress_CompanyID" uuid,"AIDexterEgress_Provider" text,"AIDexterEgress_Outcome" text,"AIDexterEgress_CreatedAt" timestamptz,"AIDexterEgress_ActualCostGBP" numeric,"AIDexterEgress_EstimatedCostGBP" numeric);
 create table public."AI_TranscriptionUsage"("TranscriptionUsage_CompanyID" uuid,"TranscriptionUsage_Status" text,"TranscriptionUsage_CreatedAt" timestamptz,"TranscriptionUsage_EstimatedCostGbp" numeric);
 create table public."DOCB_RenderJobs"("DOCBRJ_ID" uuid primary key default gen_random_uuid(),"DOCBRJ_CreatedBy" uuid,"DOCBRJ_RenderEngineCode" text default 'carbone',"DOCBRJ_StatusCode" text,"DOCBRJ_CompletedAt" timestamptz);
 create function public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer) returns uuid language plpgsql as $f$
 declare p_company_id alias for $1;v_seat_count integer:=25;v_ocr_included integer;begin
  v_ocr_included := v_seat_count * 1000;
 return gen_random_uuid();end $f$;
 create function public._multideck_dexter_context() returns table(user_id uuid,company_id uuid) language plpgsql as $$begin
 if current_setting('test.active',true) is distinct from 'true' then raise exception 'inactive' using errcode='42501';end if;
 return query select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,current_setting('test.company')::uuid;end$$;
 create function private.is_tenant_administrator(uuid) returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;
 create table public."AI_DexterVoiceSessions"(company_id uuid,seconds numeric,ended_at timestamptz,created_at timestamptz);
 create table public."cmp_Company_Modules"("Company_ID" uuid,"Module_Code" text,"Is_Enabled" boolean);
 create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
 create table public."ICUS_ApiConnections"("ICUSC_OrgOfficeID" uuid,"ICUSC_IsActive" boolean);
 alter table public."AI_DexterModelEgressAudit" add column "AIDexterEgress_InputUnits" integer,add column "AIDexterEgress_Purpose" text;
 create function public._multideck_usage_team(uuid,timestamptz,timestamptz,text,integer,numeric) returns jsonb language sql as $$select '[]'::jsonb$$;
 ${migration}
 ${voiceMigration}
 ${cloudContractMigration}
 grant select on public."cmp_Company" to service_role;
 grant select,insert,update on public."AI_DexterUsagePolicies" to service_role;
 grant execute on function public._multideck_subscription(uuid) to service_role;
 insert into public."cmp_Company" values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
 insert into private.cloud_product_state values(true,'11111111-1111-1111-1111-111111111111');
 insert into public."AI_DexterUsagePolicies"("AIUsagePolicy_CompanyID","AIUsagePolicy_PaidSeats") values('11111111-1111-1111-1111-111111111111',2);
 do $$declare c uuid:='11111111-1111-1111-1111-111111111111'; s jsonb; n integer; price integer;begin
 foreach n in array array[1,10,11,25,26,50,51] loop
 update public."AI_DexterUsagePolicies" set "AIUsagePolicy_PlanCode"='25',"AIUsagePolicy_PaidSeats"=n where "AIUsagePolicy_CompanyID"=c;
 s:=public._multideck_subscription(c);
 price:=case when n<=10 then 1995 when n<=25 then 2995 when n<=50 then 3995 else null end;
 if (s->>'monthlyGbp')::integer is distinct from price+n*149 then raise exception 'price wrong for %',n;end if;
 if (public._multideck_dexter_allowance_state(c)->>'includedUsageGbp')::numeric<>n*50*0.8 then raise exception 'AI allowance wrong';end if;
 end loop;
 update public."AI_DexterUsagePolicies" set "AIUsagePolicy_PlanCode"='25',"AIUsagePolicy_PaidSeats"=2,"AIUsagePolicy_AiOverrideGbp"=123,"AIUsagePolicy_DocumentOverride"=2 where "AIUsagePolicy_CompanyID"=c;
 s:=public._multideck_usage_categories(c);
 if (s->>'seatCount')::integer<>2 or (s->'subscription'->>'paidSeats')::integer<>2 then raise exception 'Paid-seat category context lost';end if;
 if (select count(*) from jsonb_array_elements(s->'categories') x where x->>'id'='voice')<>1 then raise exception 'Voice category lost or duplicated';end if;
 if (select (x->>'included')::integer from jsonb_array_elements(s->'categories') x where x->>'id'='documents')<>2 then raise exception 'Document override lost in category';end if;
 if (select (x->>'included')::integer from jsonb_array_elements(s->'categories') x where x->>'id'='ocr')<>2000 then raise exception 'OCR paid seats lost';end if;
 if (public._multideck_dexter_allowance_state(c)->>'includedUsageGbp')::numeric<>123 then raise exception 'Override lost';end if;
 insert into public."cmp_Users"("User_ID","Company_ID") values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',c),(gen_random_uuid(),c);
 update public."cmp_Users" set "Auth_User_ID"='cccccccc-cccc-cccc-cccc-cccccccccccc' where "User_ID"='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 insert into public."cmp_Users"("Company_ID","Auth_User_ID") values(c,'cccccccc-cccc-cccc-cccc-cccccccccccc') on conflict("Auth_User_ID") do update set "Company_ID"=excluded."Company_ID";
 if (public._multideck_subscription(c)->>'occupiedSeats')::integer<>2 then raise exception 'Auth refresh consumed another seat';end if;
 begin insert into public."cmp_Users"("Company_ID") values(c);raise exception 'over limit accepted';exception when raise_exception then if SQLERRM='over limit accepted' then raise;end if;end;
 insert into public."cmp_Users"("User_ID","Company_ID","User_AccessStatus") values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',c,'deactivated');
 begin update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';raise exception 'reactivation accepted';exception when raise_exception then if SQLERRM='reactivation accepted' then raise;end if;end;
 begin update public."AI_DexterUsagePolicies" set "AIUsagePolicy_PaidSeats"=1 where "AIUsagePolicy_CompanyID"=c;raise exception 'downgrade accepted';exception when invalid_parameter_value then null;end;
 update public."cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 insert into public."DOCB_RenderJobs"("DOCBRJ_CreatedBy","DOCBRJ_StatusCode","DOCBRJ_CompletedAt") values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','completed',now()),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','queued',null);
 begin insert into public."DOCB_RenderJobs"("DOCBRJ_CreatedBy","DOCBRJ_StatusCode") values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','queued');raise exception 'document cap bypass';exception when raise_exception then if SQLERRM='document cap bypass' then raise;end if;end;
 update public."DOCB_RenderJobs" set "DOCBRJ_StatusCode"='failed' where "DOCBRJ_StatusCode"='queued';
 insert into public."DOCB_RenderJobs"("DOCBRJ_CreatedBy","DOCBRJ_StatusCode") values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','queued');
 if (public._multideck_dexter_allowance_state('22222222-2222-2222-2222-222222222222')->>'includedUsageGbp')::numeric<>1442.3077 then raise exception 'Legacy pool changed';end if;
 if has_function_privilege('authenticated','public._multideck_subscription(uuid)','execute') or has_table_privilege('authenticated','public."AI_DexterUsagePolicies"','UPDATE') then raise exception 'Browser can change/read contract directly';end if;
 perform set_config('test.active','true',false);perform set_config('test.admin','false',false);perform set_config('test.company',c::text,false);
 begin perform public.multideck_get_subscription();raise exception 'nonadmin access';exception when insufficient_privilege then null;end;
 perform set_config('test.admin','true',false);perform set_config('test.company','22222222-2222-2222-2222-222222222222',false);
 if (public.multideck_get_subscription()->>'paidSeats') is not null then raise exception 'foreign contract disclosed';end if;
 perform set_config('test.active','false',false);
 begin perform public.multideck_get_subscription();raise exception 'inactive access';exception when insufficient_privilege then null;end;
 end$$;
 -- One remaining seat for simultaneous callers.
 insert into public."AI_DexterUsagePolicies"("AIUsagePolicy_CompanyID","AIUsagePolicy_PaidSeats") values('22222222-2222-2222-2222-222222222222',1);
 set role service_role;
 select public.multideck_cloud_apply_paid_seats('11111111-1111-1111-1111-111111111111',1,2,'10',null,null);
 reset role;
 do $$declare c uuid:='11111111-1111-1111-1111-111111111111';ack jsonb;begin
 ack:=public.multideck_cloud_apply_paid_seats(c,1,2,'10',null,null);
 if ack->>'confirmed'<>'true' or (ack->>'paidSeats')::integer<>2 then raise exception 'Cloud contract was not confirmed';end if;
 ack:=public.multideck_cloud_apply_paid_seats(c,1,2,'10',null,null);
 if ack->>'confirmed'<>'true' then raise exception 'Exact retry was not idempotent';end if;
 begin perform public.multideck_cloud_apply_paid_seats(c,1,3,'10',null,null);raise exception 'conflicting retry accepted';exception when serialization_failure then null;end;
 begin perform public.multideck_cloud_apply_paid_seats('22222222-2222-2222-2222-222222222222',2,1,'10',null,null);raise exception 'foreign tenant accepted';exception when insufficient_privilege then null;end;
 begin perform public.multideck_cloud_apply_paid_seats(c,2,1,'10',null,null);raise exception 'occupied seat reduction accepted';exception when invalid_parameter_value then null;end;
 ack:=public.multideck_cloud_apply_paid_seats(c,2,3,'10',null,null);
 if (ack->>'paidSeats')::integer<>3 then raise exception 'amendment was not applied';end if;
 if has_function_privilege('authenticated','public.multideck_cloud_apply_paid_seats(uuid,bigint,integer,text,numeric,integer)','execute') then raise exception 'browser can amend seats';end if;
 end$$;
 `)
 const concurrent=(input)=>new Promise(resolve=>{const p=spawn(join(bin,'psql'),args);let out='';p.stderr.on('data',b=>out+=b);p.on('close',code=>resolve({code,out}));p.stdin.end(input)})
 const results=await Promise.all([1,2].map(()=>concurrent(`begin;insert into public."cmp_Users"("Company_ID") values('22222222-2222-2222-2222-222222222222');select pg_sleep(0.3);commit;`)))
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results))
 assert.match(results.find(r=>r.code!==0).out,/no available seats/)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
