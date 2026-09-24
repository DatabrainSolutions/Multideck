import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const migration=readFileSync(new URL('../migrations/20260917205326_require_accounting_address.sql',import.meta.url),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
test('mandatory accounting address: atomic CRM creation, role selection, removal and access boundaries',()=>{
 const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin',dir=mkdtempSync(join(tmpdir(),'accounting-address-'));let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
 const args=['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
 const sql=q=>run('psql',args,q)
 const rejected=(q,pattern=/accounting address/)=>{const r=spawnSync(join(bin,'psql'),args,{input:q,encoding:'utf8',timeout:30000});assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,pattern)}
 try{
  run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8'])
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  sql(`create role anon;create role authenticated;create role service_role;
   create table "Org_Master"("Org_id" uuid primary key,"Org_Name" text);
   create table "Org_Types"("OrgType_ID" uuid primary key,"OrgType_Name" text);
   create table "Org_Master_Type"("Org_ID" uuid,"OrgType_ID" uuid);
   create table "CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_IsDeleted" boolean default false);
   create table "CRM_AccountOperationalProfiles"("CRMAccountOps_OrgID" uuid,"CRMAccountOps_InvoicePreferencesJSON" jsonb);
   create table "RefCountry"("RN_Code" text);
   create table "sys_AddressTypes"("sys_AddressType_ID" int,"sys_AddressType_Code" text,"sys_AddressType_IsActive" boolean default true);
   create table "Org_AddressTypes"("OrgAdd_ID" uuid,"OrgAddType_Type" int,"OrgAddType_IsDefault" boolean,"OrgAddType_OrgID" uuid);
   create table "Org_Addresses"("OrgAdd_ID" uuid primary key,"Org_ID" uuid,"OrgAdd_IsActive" boolean default true,"OrgAdd_Line1" text,"OrgAdd_TownCity" text,"OrgAdd_Country" text);
   insert into "Org_Types" values('${id(1)}','Customer'),('${id(2)}','Supplier'),('${id(3)}','Prospect');
   insert into "RefCountry" values('GB');insert into "sys_AddressTypes" values(1,'billing',true),(2,'accounts_receivable',true),(3,'legacy-5',true);
   ${migration}`)
  const account=(n,role)=>`insert into "Org_Master" values('${id(n)}','Example');insert into "CRM_AccountProfiles" values('${id(n)}',false);insert into "Org_Master_Type" values('${id(n)}','${id(role)}');`
  const address=(n,org)=>`insert into "Org_Addresses" values('${id(n)}','${id(org)}',true,'1 Example Street','Exampleton','GB');`
  rejected(`begin;${account(10,1)}commit;`)
  assert.equal(sql('select count(*) from "Org_Master"'), '0','failed create rolls back the whole account')
  sql(`begin;${account(10,1)}${address(20,10)}commit;`)
  assert.equal(sql(`select multideck_accounting_address('${id(10)}','customer')->>'OrgAdd_ID'`),id(20))
  rejected(`update "Org_Addresses" set "OrgAdd_Line1"=' ' where "OrgAdd_ID"='${id(20)}';`)
  rejected(`delete from "Org_Addresses" where "OrgAdd_ID"='${id(20)}';`)
  rejected(`update "Org_Addresses" set "OrgAdd_IsActive"=false where "OrgAdd_ID"='${id(20)}';`)
  rejected(`begin;${address(21,10)}commit;`)
  sql(`begin;insert into "Org_AddressTypes" values('${id(20)}',1,true,'${id(10)}');${address(21,10)}insert into "Org_AddressTypes" values('${id(21)}',2,true,'${id(10)}');commit;`)
  assert.equal(sql(`select multideck_accounting_address('${id(10)}','customer')->>'OrgAdd_ID'`),id(21),'AR purpose wins over general billing')
  sql(`begin;insert into "Org_Master_Type" values('${id(10)}','${id(2)}');insert into "Org_AddressTypes" values('${id(20)}',3,true,'${id(10)}');commit;`)
  assert.equal(sql(`select multideck_accounting_address('${id(10)}','supplier')->>'OrgAdd_ID'`),id(20),'purchase-ledger purpose serves supplier')
  rejected(`insert into "CRM_AccountOperationalProfiles" values('${id(10)}','{"accountingAddressId":"${id(99)}"}');`,/selected accounting address/)
  sql(`begin;${account(11,3)}commit;`)
  rejected(`insert into "Org_Master_Type" values('${id(11)}','${id(2)}');`)
  rejected(`set role authenticated;select multideck_accounting_address('${id(10)}','customer');`,/permission denied/)
  rejected(`set role anon;select multideck_accounting_address('${id(10)}','customer');`,/permission denied/)
  assert.equal(sql(`select has_function_privilege('service_role','public.multideck_accounting_address(uuid,text)','execute')`),'t')
  sql(`create table "ACCI_PartySyncQueue"(id uuid primary key,connection_id uuid,org_id uuid,party_type text,revision bigint,status text,verified_payload jsonb,provider_id text,attempts int,next_attempt_at timestamptz,last_error text,updated_at timestamptz,verified_at timestamptz);
   create table "cmp_Users"("User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
   create table "cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
   create table "ACCI_Connections"("ACCIC_ID" uuid,"ACCIC_LegalEntityID" uuid,"ACCIC_StatusCode" text,"ACCIC_ProviderCode" text);
   alter table "CRM_AccountProfiles" add column "CRMAccount_CompanyID" uuid,add column "CRMAccount_LegalEntityID" uuid;
   create table "ACCI_PartyMappings"("ACCIPM_ConnectionID" uuid,"ACCIPM_OrgID" uuid,"ACCIPM_IsActive" boolean,"ACCIPM_PartyType" text,"ACCIPM_ProviderPartyID" text);
   create table "ACCI_SyncEvents"("ACCISE_ConnectionID" uuid,"ACCISE_Severity" text,"ACCISE_EventCode" text,"ACCISE_Message" text,"ACCISE_LocalTable" text,"ACCISE_LocalID" uuid,"ACCISE_ExternalObjectType" text,"ACCISE_ExternalID" text,"ACCISE_ResponsePayloadJSON" jsonb);
   insert into "cmp_Users" values('${id(70)}','${id(71)}','active'),('${id(72)}','${id(73)}','active');
   insert into "cmp_LegalEntities" values('${id(74)}','${id(71)}',true);
   insert into "ACCI_Connections" values('${id(75)}','${id(74)}','active','erpnext');
   update "CRM_AccountProfiles" set "CRMAccount_CompanyID"='${id(71)}' where "CRMAccount_OrgID"='${id(10)}';
   insert into "ACCI_PartyMappings" values('${id(75)}','${id(10)}',true,'customer','ERP-1');
   insert into "ACCI_PartySyncQueue"(id,connection_id,org_id,party_type,revision,status) values('${id(76)}','${id(75)}','${id(10)}','customer',1,'blocked');
   ${readFileSync(new URL('../migrations/20260917210443_accounting_party_identity_review.sql',import.meta.url),'utf8')}`)
  const snapshot=JSON.stringify({party:{custom_multideck_party_key:'a'.repeat(64),customer_name:'Example'},address:null})
  const review=(revision=1,actor=70)=>`select multideck_accounting_review_party('${id(76)}',${revision},'ERP-1','${snapshot}','${id(actor)}');`
  rejected(review(2),/account check changed/)
  rejected(review(1,72),/outside the active workspace/)
  rejected(`set role authenticated;${review()}`,/permission denied/)
  sql(review())
  assert.equal(sql(`select status||':'||revision||':'||(verified_at is null)::text from "ACCI_PartySyncQueue" where id='${id(76)}'`),'queued:2:true','review is never delivery success')
  assert.equal(sql('select count(*) from "ACCI_SyncEvents"'),'1')
  rejected(review(),/account check changed/)
  assert.equal(sql('select count(*) from "ACCI_SyncEvents"'),'1','stale confirmation cannot duplicate the audit')

 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','immediate','-w','stop'],{encoding:'utf8'});rmSync(dir,{recursive:true,force:true})}
})
