import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

test('party profiles: atomic creation, scope, retained documents and mappings cannot be orphaned', async () => {
  const bin=process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir=mkdtempSync(join(tmpdir(),'party-profile-'))
  const run=(cmd,args,input)=>spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000})
  const ok=r=>{assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
  const sql=input=>run('psql',['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input)
  const reject=input=>{const r=sql(input);assert.notEqual(r.status,0);assert.match(r.stderr,/CRM profile/)}
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
  let started=false
  try {
    ok(run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8']))
    ok(run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']));started=true
    ok(sql(`create role anon;create role authenticated;
      create table "Org_Master"("Org_id" uuid primary key,"Org_Name" text);
      create table "Org_Types"("OrgType_ID" uuid primary key,"OrgType_Name" text);
      create table "Org_Master_Type"("Org_ID" uuid,"OrgType_ID" uuid);
      create table "CRM_AccountProfiles"("CRMAccount_OrgID" uuid primary key,"CRMAccount_CompanyID" uuid,"CRMAccount_LegalEntityID" uuid,"CRMAccount_IsDeleted" boolean default false);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid);
      create table "ACCI_Connections"("ACCIC_ID" uuid primary key,"ACCIC_LegalEntityID" uuid);
      create table "ACCI_PartyMappings"("ACCIPM_ID" uuid primary key,"ACCIPM_OrgID" uuid,"ACCIPM_ConnectionID" uuid,"ACCIPM_IsActive" boolean);
      create table "FIN_Documents"("FINDoc_ID" uuid primary key,"FINDoc_PartyOrgID" uuid,"FINDoc_LegalEntityID" uuid);
      insert into "Org_Master" values('${id(1)}','Customer');
      insert into "Org_Types" values('${id(2)}','Customer');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(4)}'),('${id(5)}','${id(6)}'),('${id(9)}','${id(4)}');
      insert into "ACCI_Connections" values('${id(7)}','${id(3)}');`))
    const migration=readFileSync(new URL('../migrations/20260921180006_accounting_party_profile_guardrails.sql',import.meta.url),'utf8')
    assert.ok(readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8').includes(migration.trim()),'Provisioning includes the tested safeguards')
    ok(sql(migration))
    reject(`insert into "Org_Master_Type" values('${id(1)}','${id(2)}');`)
    assert.equal(ok(sql('select count(*) from "Org_Master_Type";')),'0')
    ok(sql(`begin;insert into "Org_Master_Type" values('${id(1)}','${id(2)}');insert into "CRM_AccountProfiles" values('${id(1)}','${id(4)}',null,false);commit;`))
    reject(`delete from "CRM_AccountProfiles";`)
    reject(`update "CRM_AccountProfiles" set "CRMAccount_IsDeleted"=true;`)
    reject(`insert into "FIN_Documents" values('${id(8)}','${id(1)}','${id(5)}');`)
    ok(sql(`insert into "FIN_Documents" values('${id(8)}','${id(1)}','${id(3)}');`))
    reject(`update "CRM_AccountProfiles" set "CRMAccount_CompanyID"='${id(6)}';`)
    reject(`update "CRM_AccountProfiles" set "CRMAccount_LegalEntityID"='${id(9)}';`)
    ok(sql(`insert into "ACCI_PartyMappings" values('${id(10)}','${id(1)}','${id(7)}',true);delete from "Org_Master_Type";`))
    reject('delete from "CRM_AccountProfiles";')
    ok(sql('delete from "FIN_Documents";'))
    reject('delete from "CRM_AccountProfiles";')
    ok(sql('begin;update "ACCI_PartyMappings" set "ACCIPM_IsActive"=false;delete from "CRM_AccountProfiles";commit;'))
    reject('update "ACCI_PartyMappings" set "ACCIPM_IsActive"=true;')
    const denied=sql(`set role authenticated;select public._accounting_require_party_profile('${id(1)}');`)
    assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/)
    // A document writer and profile remover cannot both commit an orphan.
    ok(sql(`insert into "CRM_AccountProfiles" values('${id(1)}','${id(4)}',null,false);`))
    const writer=spawn(join(bin,'psql'),['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'])
    const completed=new Promise((resolve,reject)=>{writer.once('error',reject);writer.once('exit',code=>resolve(code))})
    const locked=new Promise((resolve,reject)=>{
      writer.stdout.on('data',chunk=>{if(chunk.toString().includes('locked'))resolve()})
      writer.once('error',reject)
      writer.once('exit',()=>reject(new Error('Writer ended before lock acquired')))
    })
    writer.stdin.end(`begin;insert into "FIN_Documents" values('${id(8)}','${id(1)}','${id(3)}');select 'locked';select pg_sleep(0.3);commit;`)
    await locked
    reject('delete from "CRM_AccountProfiles";')
    assert.equal(await completed,0)
    assert.equal(ok(sql('select count(*) from "CRM_AccountProfiles";')),'1')
  } finally {
    if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
