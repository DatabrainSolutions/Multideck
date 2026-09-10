import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const read=name=>readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8')
const foundation=read('20260820110000_crm_organisation_contact_address_foundation')
const start=foundation.indexOf('create or replace function public.multideck_crm_update_organisation_foundation(')
const writer=foundation.slice(start,foundation.indexOf('$$;',foundation.indexOf('as $$',start))+3)
const migration=read('20260909210736_dexter_company_foundation_preserve_offices')
test('company adapter changes only requested setup through the canonical writer and rejects stale scope and invalid offices',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-company-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create schema auth;create function auth.role() returns text language sql as $$select current_setting('test.role')$$;
   create table public."CRM_AccountProfiles"("CRMAccount_ID" uuid primary key,"CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_EditVersion" bigint default 1,"CRMAccount_ScopeCode" text default 'standard',"CRMAccount_UpdatedAt" timestamptz,"CRMAccount_UpdatedBy" uuid,"CRMAccount_OrgOfficeID" uuid);
   create table public."Org_Master"("Org_id" uuid primary key,"Org_AccCode" text,"Org_CRMIsPotentialCustomer" boolean default false,"Org_CRMUpdatedAt" timestamptz);
   create table public."CRM_AccountOfficeAssignments"("CRMAccountOffice_AccountID" uuid,"CRMAccountOffice_OrgOfficeID" uuid,"CRMAccountOffice_IsPrimary" boolean,"CRMAccountOffice_CompanyID" uuid,"CRMAccountOffice_CreatedBy" uuid);
   create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid,"Office_IsActive" boolean);
   create table public."sys_AIDexterActions"("AIDexterAction_Code" text,"AIDexterAction_AlwaysRequiresApproval" boolean);
   create function public._multideck_crm_actor_company(uuid) returns uuid language sql as $$select nullif(current_setting('test.company',true),'')::uuid$$;
   create function public._multideck_crm_write_actor(uuid) returns void language plpgsql as $$begin if current_setting('test.allowed')<>'yes' then raise exception 'Denied' using errcode='42501';end if;end$$;
   create function public._multideck_crm_require_account_access(uuid,uuid) returns void language plpgsql as $$begin if not exists(select 1 from public."CRM_AccountProfiles" where "CRMAccount_OrgID"=$2 and "CRMAccount_CompanyID"=public._multideck_crm_actor_company($1)) then raise exception 'Denied' using errcode='42501';end if;end$$;
   create function public._multideck_crm_account_code(text,text) returns text language sql as $$select upper($1)$$;
   ${writer}
   ${migration}
   create function denied(c uuid,u uuid,args jsonb,code text) returns void language plpgsql as $$begin begin perform public.multideck_dexter_action_update_company_foundation(c,u,args);exception when others then if sqlstate<>code then raise;end if;return;end;raise exception 'Unexpected success';end$$;
   do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();org uuid:=gen_random_uuid();profile uuid:=gen_random_uuid();office uuid:=gen_random_uuid();args jsonb;begin
    perform set_config('test.company',c::text,true);perform set_config('test.allowed','yes',true);perform set_config('test.role','service_role',true);
    insert into public."CRM_AccountProfiles"("CRMAccount_ID","CRMAccount_OrgID","CRMAccount_CompanyID")values(profile,org,c);
    insert into public."Org_Master"("Org_id","Org_AccCode")values(org,'CUS5');
    args:=jsonb_build_object('target_id',org,'expected_version',1,'account_code','QA5','scope_code','standard','is_potential',false,'office_assignments','[]'::jsonb);
    perform public.multideck_dexter_action_update_company_foundation(c,u,args);
    if (select "Org_AccCode" from public."Org_Master")<>'QA5' or (select "CRMAccount_EditVersion" from public."CRM_AccountProfiles")<>2 then raise exception 'Canonical code edit failed';end if;
    perform denied(c,u,args,'P0001');args:=args||'{"expected_version":2}';
    perform denied(gen_random_uuid(),u,args,'42501');perform set_config('test.allowed','no',true);perform denied(c,u,args,'42501');perform set_config('test.allowed','yes',true);
    perform set_config('test.role','authenticated',true);perform denied(c,u,args,'42501');perform set_config('test.role','service_role',true);
    perform denied(c,u,args||jsonb_build_object('office_assignments',jsonb_build_array(jsonb_build_object('officeId',office,'isPrimary',true))),'22023');
    insert into public."cmp_Offices" values(office,c,true);
    args:=args||jsonb_build_object('office_assignments',jsonb_build_array(jsonb_build_object('officeId',office,'isPrimary',true)));
    perform public.multideck_dexter_action_update_company_foundation(c,u,args);
    if (select count(*) from public."CRM_AccountOfficeAssignments")<>1 then raise exception 'Canonical office update failed';end if;
    perform denied(c,u,args||'{"expected_version":3,"office_assignments":[]}','22023');
   end $$;
  `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
