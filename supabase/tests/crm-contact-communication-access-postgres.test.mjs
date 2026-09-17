import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migrations = new URL('../migrations/', import.meta.url)
function currentFunction(name) {
  let result
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
    const source = readFileSync(new URL(file, migrations), 'utf8')
    const match = source.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))
    if (match) result = match[0]
  }
  assert.ok(result, name)
  return result
}
test('contact access follows the actual company/lead boundary and denies revoked, foreign and unlinked actors', () => {
  assert.equal(spawnSync(join(bin,'initdb'),['--version']).status, 0, 'PostgreSQL is required')
  const dir = mkdtempSync(join(tmpdir(), 'crm-contact-access-')); const data = join(dir,'data'); let started = false
  const run = (command,args,input) => { const result = spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:30000}); assert.equal(result.status,0,result.stderr + result.stdout) }
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']); started = true
    run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table "Org_Contacts"("OrgContact_ID" uuid primary key,"Org_ID" uuid);
      create table "CRM_Leads"("CRMLead_ID" uuid primary key,"CRMLead_OrgID" uuid,"CRMLead_PrimaryContactID" uuid,"CRMLead_OwnerUserID" uuid,"CRMLead_CreatedBy" uuid,"CRMLead_IsDeleted" boolean default false,"CRMLead_MetadataJSON" jsonb default '{}');
      create table "CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_MetadataJSON" jsonb default '{}');
      create table "cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table "Job_Header"("Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_Customer" uuid);
      create table "CusQuote_Header"("CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,"CusQuoteHeader_CustomerID" uuid);
      ${currentFunction('_multideck_crm_actor_company')}
      ${currentFunction('multideck_crm_company_can_access_account')}
      ${currentFunction('_multideck_crm_lead_is_reachable')}
      ${currentFunction('multideck_crm_company_can_access_contact')}
      ${currentFunction('_multideck_crm_require_contact_access')}
      revoke all on function _multideck_crm_require_contact_access(uuid,uuid) from public,anon,authenticated;
      grant execute on function _multideck_crm_require_contact_access(uuid,uuid) to service_role;
      create function denied(u uuid,c uuid) returns void language plpgsql as $$begin
        begin perform _multideck_crm_require_contact_access(u,c); exception when sqlstate 'P0002' or sqlstate '42501' then return; end;
        raise exception 'Unexpected contact access'; end$$;
      do $$declare company uuid:=gen_random_uuid(); foreign_company uuid:=gen_random_uuid(); creator uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); contact uuid:=gen_random_uuid(); other_contact uuid:=gen_random_uuid(); lead uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); begin
        insert into "cmp_Users" values(creator,gen_random_uuid(),company,'active'),(colleague,gen_random_uuid(),company,'active'),(outsider,gen_random_uuid(),foreign_company,'active');
        insert into "Org_Contacts" values(contact,null),(other_contact,null);
        insert into "CRM_Leads"("CRMLead_ID","CRMLead_PrimaryContactID","CRMLead_OwnerUserID","CRMLead_CreatedBy") values(lead,contact,creator,creator);
        perform _multideck_crm_require_contact_access(colleague,contact);
        perform denied(outsider,contact); perform denied(colleague,other_contact); perform denied(gen_random_uuid(),contact);
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=colleague;
        perform denied(colleague,contact);
        update "cmp_Users" set "User_AccessStatus"='active',"Auth_User_ID"=null where "User_ID"=colleague;
        perform denied(colleague,contact);
        update "cmp_Users" set "Auth_User_ID"=gen_random_uuid() where "User_ID"=colleague;
        update "CRM_Leads" set "CRMLead_IsDeleted"=true where "CRMLead_ID"=lead;
        perform denied(colleague,contact);
        update "CRM_Leads" set "CRMLead_IsDeleted"=false,"CRMLead_MetadataJSON"='{"isDemo":true}' where "CRMLead_ID"=lead;
        perform denied(colleague,contact);
        update "CRM_Leads" set "CRMLead_MetadataJSON"='{}' where "CRMLead_ID"=lead;
        -- A reachable lead cannot bypass a foreign organisation attached to the person.
        update "Org_Contacts" set "Org_ID"=org where "OrgContact_ID"=contact;
        insert into "CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID") values(org,foreign_company);
        perform denied(colleague,contact);
        update "CRM_AccountProfiles" set "CRMAccount_CompanyID"=company;
        perform _multideck_crm_require_contact_access(colleague,contact);
        -- Historical organisation-linked work survives creator deactivation.
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=creator;
        perform _multideck_crm_require_contact_access(colleague,contact);
        if has_function_privilege('authenticated','_multideck_crm_require_contact_access(uuid,uuid)','execute') or has_function_privilege('anon','_multideck_crm_require_contact_access(uuid,uuid)','execute') then raise exception 'Exposed privileged helper';end if;
      end$$;
    `)
  } finally { if(started) spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']); rmSync(dir,{recursive:true,force:true}) }
})
