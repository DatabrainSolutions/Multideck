import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction, currentReadPolicies, currentRolePermissionMutations } from './operational-access-source.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tables = {
  cmp_Users: '"User_ID" uuid, "Auth_User_ID" uuid, "Company_ID" uuid, "User_AccessStatus" text',
  cmp_Offices: '"Office_ID" uuid, "Company_ID" uuid',
  Job_Header: '"Job_ID" uuid, "Job_OrgOfficeID" uuid, "Job_OfficeID" uuid, "Job_Customer" uuid, "Job_Carrier" uuid, "Job_CreatedBy" uuid',
  Job_Routing: '"Job_ID" uuid',
  Job_Cargo: '"JobCargo_JobID" uuid',
  CusQuote_Header: '"CusQuoteHeader_ID" uuid, "CusQuoteHeader_OrgOfficeID" uuid, "OrgOffice_ID" uuid, "CusQuoteHeader_CustomerID" uuid, "CusQuoteHeader_CreatedBy" uuid',
  CusQuote_Lines: '"CusQuoteHeader_ID" uuid',
  Org_Master: '"Org_id" uuid',
  DOC_StoredObjects: '"DOCStoredObject_CreatedBy" uuid',
  RPT_ReportRuns: '"RPTReportRun_RequestedBy" uuid',
  Comm_Notifications: '"CommNotif_UserID" uuid',
  App_UserJobStars: '"User_ID" uuid',
  CRM_DriveFolders: '"Company_ID" uuid',
  CRM_DriveFiles: '"Company_ID" uuid',
}
const helpers = [
  ['public', 'app_current_company_id'], ['public', 'app_current_workspace_user_id'],
  ['public', 'app_user_can_access_office'], ['public', 'multideck_crm_company_can_access_account'],
  ['public', 'app_user_can_access_organisation'], ['public', '_crm_drive_has_permission'],
  ['booking_api', 'has_permission'],
].map(([schema, name]) => currentFunction(schema, name).sql).join('\n')
const policies = Object.keys(tables).flatMap(table => currentReadPolicies(table).map(p => p.sql)).join('\n')

test('current operational policies share colleague records, preserve child rows and isolate restricted identities', () => {
  // Deliberately fail rather than skip when the security-test database is absent.
  assert.equal(spawnSync(join(bin, 'initdb'), ['--version']).status, 0, 'PostgreSQL required; set PG_TEST_BIN')
  const dir = mkdtempSync(join(tmpdir(), 'shared-access-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout)
    return result.stdout
  }
  const sql = input => run('psql', ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
  const asUser = (actor, query) => sql(`set request.jwt.claim.sub='${id(actor)}'; set role authenticated; ${query}`)
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role authenticated; create role anon; create role service_role;
      create schema auth; create schema booking_api;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      ${Object.entries(tables).map(([table, fields]) => `create table public."${table}"(${fields}); alter table public."${table}" enable row level security; grant select on public."${table}" to authenticated;`).join('\n')}
      create table public."CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_MetadataJSON" jsonb default '{}');
      create table public."sys_UserRoles"("sys_UserRole_ID" uuid primary key default gen_random_uuid(),"sys_UserRole_Name" text unique);
      create table public."sys_Permissions"("sys_Permission_ID" uuid primary key default gen_random_uuid(),"sys_Permission_Value" text unique,"sys_Permission_Group" text,"sys_Permission_Name" text,"sys_Permission_Description" text,"sys_Permission_IsDangerous" boolean);
      create table public."sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid,primary key("sys_UserRole_ID","sys_Permission_ID"));
      create table public."cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
      create table public."cmp_Users_Departments"("User_ID" uuid,"Department_ID" uuid);
      create table public."cmp_Departments"("Department_ID" uuid,"Department_IsActive" boolean);
      create table booking_api.office_customs_departments(department_id uuid,company_id uuid);
      ${helpers}
      ${policies}
      insert into public."cmp_Users" values
        ('${id(1)}','${id(101)}','${id(1001)}','active'),
        ('${id(2)}','${id(102)}','${id(1001)}','active'),
        ('${id(3)}','${id(103)}','${id(1002)}','active'),
        ('${id(4)}','${id(104)}','${id(1001)}','inactive'),
        ('${id(5)}','${id(105)}','${id(1001)}','deleted'),
        ('${id(6)}','${id(106)}','${id(1001)}','active'),
        ('${id(7)}','${id(107)}','${id(1001)}','active');
      insert into public."cmp_Offices" values('${id(11)}','${id(1001)}'),('${id(12)}','${id(1002)}');
      -- Two colleague-created records in company A, plus a foreign record and
      -- a missing-office record which must fail closed.
      insert into public."Job_Header" values
        ('${id(21)}','${id(11)}',null,'${id(31)}',null,'${id(101)}'),
        ('${id(22)}',null,'${id(11)}','${id(31)}',null,'${id(102)}'),
        ('${id(23)}','${id(12)}',null,'${id(32)}',null,'${id(103)}'),
        ('${id(24)}',null,null,null,null,'${id(101)}');
      insert into public."CusQuote_Header" select "Job_ID","Job_OrgOfficeID","Job_OfficeID","Job_Customer","Job_CreatedBy" from public."Job_Header";
      insert into public."Job_Routing" select "Job_ID" from public."Job_Header";
      insert into public."Job_Cargo" select "Job_ID" from public."Job_Header";
      insert into public."CusQuote_Lines" select "CusQuoteHeader_ID" from public."CusQuote_Header";
      insert into public."Org_Master" values('${id(31)}'),('${id(32)}'),('${id(33)}');
      insert into public."CRM_AccountProfiles" values('${id(33)}','${id(1001)}',false,'{}');
      insert into public."DOC_StoredObjects" values('${id(1)}'),('${id(2)}'),('${id(3)}');
      insert into public."RPT_ReportRuns" select "DOCStoredObject_CreatedBy" from public."DOC_StoredObjects";
      insert into public."Comm_Notifications" values('${id(1)}'),('${id(2)}'),('${id(3)}');
      insert into public."App_UserJobStars" values('${id(101)}'),('${id(102)}'),('${id(103)}');
      insert into public."CRM_DriveFolders" values('${id(1001)}'),('${id(1002)}');
      insert into public."CRM_DriveFiles" select * from public."CRM_DriveFolders";
      insert into public."sys_UserRoles"("sys_UserRole_Name") values('Company User'),('Viewer'),('Company Manager'),('Company Admin'),('System Admin'),('Administrator'),('Operations manager'),('Operator');
      insert into public."sys_Permissions"("sys_Permission_Value") values('Quotes.Read'),('Quotes.Write'),('Bookings.Read'),('Bookings.Write'),('CRM.Drive.Read');
      insert into public."cmp_Users_Roles" select u."User_ID",r."sys_UserRole_ID" from public."cmp_Users" u cross join public."sys_UserRoles" r where r."sys_UserRole_Name"=case when u."User_ID"='${id(6)}' then 'Viewer' when u."User_ID"='${id(7)}' then 'Unprivileged' else 'Company User' end;
      insert into public."sys_UserRole_Permissions" select r."sys_UserRole_ID",p."sys_Permission_ID" from public."sys_UserRoles" r cross join public."sys_Permissions" p where r."sys_UserRole_Name"='Company User' and p."sys_Permission_Value"='CRM.Drive.Read';
      ${readFileSync(new URL('../migrations/20260820225732_grant_booking_permissions_to_operational_roles.sql', import.meta.url), 'utf8')}
      ${readFileSync(new URL('../migrations/20260904151000_operational_role_quote_booking_parity.sql', import.meta.url), 'utf8')}
      ${currentRolePermissionMutations().map(change => change.sql).join('\n')}
    `)
    const shared = ['Job_Header','Job_Routing','Job_Cargo','CusQuote_Header','CusQuote_Lines','Org_Master','DOC_StoredObjects','RPT_ReportRuns']
    for (const actor of [101, 102]) {
      for (const table of shared) assert.equal(asUser(actor, `select count(*) from public."${table}";`).trim(), '2', `${actor}: colleague visibility in ${table}`)
      for (const table of ['Comm_Notifications','App_UserJobStars','CRM_DriveFolders','CRM_DriveFiles']) assert.equal(asUser(actor, `select count(*) from public."${table}";`).trim(), '1', `${actor}: scoped ${table}`)
    }
    for (const table of shared) assert.equal(asUser(103, `select count(*) from public."${table}";`).trim(), '1', `Foreign caller sees only own company: ${table}`)
    for (const actor of [104,105,199]) {
      for (const table of shared.concat(['CRM_DriveFolders','CRM_DriveFiles'])) assert.equal(asUser(actor, `select count(*) from public."${table}";`).trim(), '0', `${actor}: denied ${table}`)
    }
    assert.equal(asUser(107, 'select count(*) from public."CRM_DriveFiles";').trim(), '0', 'Drive permission remains required')
    for (const permission of ['Quotes.Read','Quotes.Write','Bookings.Read','Bookings.Write']) {
      assert.equal(sql(`select booking_api.has_permission('${id(102)}','${permission}');`).trim(), 't', `Company User ${permission}`)
      assert.equal(sql(`select booking_api.has_permission('${id(104)}','${permission}');`).trim(), 'f', `Inactive ${permission}`)
    }
    for (const permission of ['Quotes.Write','Bookings.Write']) assert.equal(sql(`select booking_api.has_permission('${id(106)}','${permission}');`).trim(), 'f', `Viewer ${permission}`)
    // Revoking a colleague must not hide the company's historical business data.
    sql(`update public."cmp_Users" set "User_AccessStatus"='deleted' where "User_ID"='${id(1)}';`)
    for (const table of shared) assert.equal(asUser(102, `select count(*) from public."${table}";`).trim(), '2', `Historical ${table}`)
    // Refreshing a session after deactivation immediately loses operational access.
    sql(`update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='${id(2)}';`)
    for (const table of shared) assert.equal(asUser(102, `select count(*) from public."${table}";`).trim(), '0', `Revoked ${table}`)
    const anonymous = spawnSync(join(bin, 'psql'), ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], {input:'set role anon; select * from public."Job_Header";',encoding:'utf8'})
    assert.notEqual(anonymous.status,0,'Anonymous business read denied')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
