import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const sql=readFileSync(new URL('../migrations/20260910011512_crm_legacy_contact_employment.sql',import.meta.url),'utf8')
const foundation=readFileSync(new URL('../migrations/20260820110000_crm_organisation_contact_address_foundation.sql',import.meta.url),'utf8')
const start=foundation.indexOf('create or replace function public.multideck_crm_transfer_contact(')
const transfer=foundation.slice(start,foundation.indexOf('$$;',start)+3)
test('legacy transfer preserves unknown start date and existing history atomically',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-employment-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create table public."Org_Contacts"("OrgContact_ID" uuid primary key,"Org_ID" uuid);
   create table public."CRM_ContactProfiles"("CRMContact_ID" uuid primary key,"CRMContact_OrgContactID" uuid,"CRMContact_EditVersion" bigint,"CRMContact_MetadataJSON" jsonb,"CRMContact_RoleCode" text,"CRMContact_AccountID" uuid,"CRMContact_UpdatedAt" timestamptz,"CRMContact_UpdatedBy" uuid);
   create table public."CRM_AccountProfiles"("CRMAccount_ID" uuid primary key,"CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false);
   create table public."CRM_ContactOrganisationAssignments"("CRMContactOrg_ID" uuid default gen_random_uuid(),"CRMContactOrg_ContactID" uuid,"CRMContactOrg_OrgID" uuid,"CRMContactOrg_CompanyID" uuid,"CRMContactOrg_JobTitle" text,"CRMContactOrg_Department" text,"CRMContactOrg_RoleCode" text,"CRMContactOrg_StartedAt" date not null,"CRMContactOrg_EndedAt" date,"CRMContactOrg_IsCurrent" boolean,"CRMContactOrg_CreatedBy" uuid);
   create unique index one_current on public."CRM_ContactOrganisationAssignments"("CRMContactOrg_ContactID") where "CRMContactOrg_IsCurrent";
   create table public."Comm_Identities"("CommIdentity_ContactID" uuid,"CommIdentity_OrgID" uuid,"CommIdentity_IsDeleted" boolean,"CommIdentity_UpdatedAt" timestamptz);
   create function public._multideck_crm_write_actor(uuid) returns void language plpgsql as $$begin if $1 is null then raise insufficient_privilege;end if;end $$;
   create function public._multideck_crm_require_account_access(uuid,uuid) returns void language plpgsql as $$begin if not exists(select 1 from public."CRM_AccountProfiles" where "CRMAccount_OrgID"=$2 and not "CRMAccount_IsDeleted") then raise insufficient_privilege;end if;end $$;
   ${transfer}
   ${sql}
   do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();result jsonb;begin
    insert into public."CRM_AccountProfiles" values(gen_random_uuid(),a,c,false),(gen_random_uuid(),b,c,false);
    insert into public."Org_Contacts" values(contact,a);
    insert into public."CRM_ContactProfiles" values(gen_random_uuid(),contact,1,'{"jobTitle":"Manager","department":"Operations"}','buyer',null,null,null);
    insert into public."Comm_Identities" values(contact,a,false,null);
    begin perform public.multideck_crm_transfer_contact(u,contact,b,9,'{"startedAt":"2026-09-10"}');raise exception 'Stale version accepted';exception when sqlstate 'P0001' then if sqlerrm not like 'CRM_CONFLICT:%' then raise;end if;end;
    if exists(select 1 from public."CRM_ContactOrganisationAssignments") then raise exception 'Failed transfer wrote history';end if;
    begin perform public.multideck_crm_transfer_contact(u,contact,gen_random_uuid(),1,'{}');raise exception 'Inaccessible target accepted';exception when insufficient_privilege then null;end;
    result:=public.multideck_crm_transfer_contact(u,contact,b,1,'{"startedAt":"2026-09-10"}');
    if (select count(*) from public."CRM_ContactOrganisationAssignments")<>2 then raise exception 'Source employer not preserved';end if;
    if not exists(select 1 from public."CRM_ContactOrganisationAssignments" where "CRMContactOrg_OrgID"=a and "CRMContactOrg_StartedAt" is null and "CRMContactOrg_EndedAt"='2026-09-09' and not "CRMContactOrg_IsCurrent" and "CRMContactOrg_JobTitle"='Manager') then raise exception 'Invented or lost source history';end if;
    if not exists(select 1 from public."CRM_ContactOrganisationAssignments" where "CRMContactOrg_OrgID"=b and "CRMContactOrg_StartedAt"='2026-09-10' and "CRMContactOrg_IsCurrent") then raise exception 'Target history wrong';end if;
    if (select "CommIdentity_OrgID" from public."Comm_Identities" where "CommIdentity_ContactID"=contact) is distinct from b then raise exception 'Identity not moved';end if;
    perform public.multideck_crm_transfer_contact(u,contact,a,2,'{"startedAt":"2026-09-11"}');
    if (select count(*) from public."CRM_ContactOrganisationAssignments")<>3 then raise exception 'Existing source history duplicated';end if;
    if (select count(*) from public."CRM_ContactOrganisationAssignments" where "CRMContactOrg_IsCurrent")<>1 then raise exception 'Multiple current employers';end if;
   end $$;
  `)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
