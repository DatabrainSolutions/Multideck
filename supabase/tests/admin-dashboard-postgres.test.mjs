import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('Admin analytics enforce tenant roles, source permissions, confirmed outcomes, overlapping time and retention', () => {
  const bin = process.env.PG_TEST_BIN
  assert.ok(bin, 'PostgreSQL is mandatory')
  const dir = mkdtempSync(join(tmpdir(), 'admin-analytics-'))
  const run = (cmd, args, input) => spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 60000 })
  const ok = result => { assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const sql = input => run('psql', ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], input)
  const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [company, other, office, otherOffice, admin, colleague, foreign, inactive, companyAdmin, unlinked] = Array.from({ length: 10 }, (_, i) => uid(i + 1))
  const fd=uid(11), adminAuth=uid(90)
  const as = (user, statement, role = 'authenticated') => `set role ${role}; set request.jwt.claim.sub='${user===admin?adminAuth:user}'; ${statement};`
  const denied = (user, statement, pattern = /permission denied|Only active|unauthorised|confirmed workspace/) => { const result = sql(as(user, statement)); assert.notEqual(result.status, 0); assert.match(result.stderr, pattern) }
  let started = false
  try {
    ok(run('initdb', ['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8']))
    ok(run('pg_ctl', ['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start'])); started = true
    ok(sql(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;`))
    const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url),'utf8')
    for (const name of ['cmp_Company','cmp_Offices','cmp_Users','cmp_Users_Roles','sys_UserRoles','sys_Permissions','sys_UserRole_Permissions','Job_Header','Org_Master','Org_Master_Type','Org_Types','CRM_AccountProfiles','CRM_Leads','CusQuote_Header','CusQuote_Versions','CusQuote_Events','AI_DexterModelEgressAudit','DOCB_RenderJobs','FIN_IntegrationQueue','FIN_Documents','cmp_LegalEntities']) {
      const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
      assert.ok(start >= 0, name)
      const statement = baseline.slice(start, baseline.indexOf('\n);',start) + 4).split('\n').filter(l => !/^\s*CONSTRAINT /.test(l)).join('\n').trimEnd().replace(/,\s*\n\);$/,'\n);').replaceAll(' NOT NULL','')
      ok(sql(statement))
    }
    for (const [table, key] of [['cmp_Company','Company_ID'],['cmp_Users','User_ID'],['Job_Header','Job_ID']]) ok(sql(`create unique index on "${table}"("${key}");`))
    for (const name of ['"private"."is_tenant_administrator"','"public"."_multideck_crm_has_permission"']) {
      const start = baseline.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
      ok(sql(baseline.slice(start,baseline.indexOf('\n$$;',start) + 4)))
    }
    ok(sql(`insert into "cmp_Company"("Company_ID") values ('${company}'),('${other}');
      insert into "cmp_Offices"("Office_ID","Company_ID") values ('${office}','${company}'),('${otherOffice}','${other}');
      insert into "cmp_Users"("User_ID","Company_ID","Auth_User_ID","User_AccessStatus","User_Firstname") values
      ('${admin}','${company}','${adminAuth}','active','Admin'),('${colleague}','${company}','${colleague}','active','Colleague'),('${foreign}','${other}','${foreign}','active','Foreign'),
      ('${inactive}','${company}','${inactive}','deactivated','Inactive'),('${companyAdmin}','${company}','${companyAdmin}','active','Company admin'),('${unlinked}','${company}',null,'active','Unlinked'),('${fd}','${company}','${fd}','active','Finance Director');
      insert into "sys_UserRoles"("sys_UserRole_ID","sys_UserRole_Name") values ('${uid(20)}','Administrator'),('${uid(21)}','Operator'),('${uid(22)}','Company Admin'),('${uid(23)}','Finance Director');
      insert into "cmp_Users_Roles"("User_ID","sys_UserRole_ID") values ('${admin}','${uid(20)}'),('${companyAdmin}','${uid(22)}'),('${colleague}','${uid(21)}'),('${foreign}','${uid(20)}'),('${inactive}','${uid(20)}'),('${unlinked}','${uid(20)}'),('${fd}','${uid(23)}');
      insert into "sys_Permissions"("sys_Permission_ID","sys_Permission_Value") select gen_random_uuid(),value from unnest(array['CRM.Read','CRM.Write','Customers.Read','Quotes.Read','Quotes.Write','Bookings.Read','Bookings.Write','Documents.Read','Finance.Reporting.View','Finance.Director.Dashboard.View']) value;
      insert into "sys_UserRole_Permissions" select '${uid(20)}'::uuid,"sys_Permission_ID" from "sys_Permissions" where "sys_Permission_Value"<>'Finance.Director.Dashboard.View';
      insert into "sys_UserRole_Permissions" select '${uid(21)}'::uuid,"sys_Permission_ID" from "sys_Permissions" where "sys_Permission_Value" in ('Quotes.Read','Quotes.Write','Bookings.Read','Bookings.Write','CRM.Read','CRM.Write');
      insert into "sys_UserRole_Permissions" select '${uid(23)}'::uuid,"sys_Permission_ID" from "sys_Permissions" where "sys_Permission_Value"='Finance.Director.Dashboard.View';
      insert into "Org_Master"("Org_id","Org_Name") values ('${uid(30)}','Customer A'),('${uid(31)}','Other tenant'),('${uid(32)}','Prospect');
      insert into "Org_Types"("OrgType_ID","OrgType_Name") values ('${uid(33)}','Customer'),('${uid(34)}','Prospect');
      insert into "Org_Master_Type"("Org_ID","OrgType_ID") values ('${uid(30)}','${uid(33)}'),('${uid(31)}','${uid(33)}'),('${uid(32)}','${uid(34)}');
      insert into "CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID","CRMAccount_CreatedAt","CRMAccount_IsDeleted") values ('${uid(30)}','${company}',now(),false),('${uid(31)}','${other}',now(),false),('${uid(32)}','${company}',now(),false);
      insert into "Job_Header"("Job_ID","Job_Customer","Job_OrgOfficeID","Job_CreatedDate","Job_Status","Job_IsDeleted","Job_TransportModeSummary","Job_DestinationUNLocode") values
      ('${uid(40)}','${uid(30)}','${office}',now()-interval '40 days','confirmed',false,'Sea','CNSHA'),
      ('${uid(41)}','${uid(30)}','${office}',now(),'confirmed',false,'Air','GBLHR'),
      ('${uid(42)}','${uid(30)}','${office}',now(),'provisional',false,'Air','GBLHR'),
      ('${uid(43)}','${uid(30)}','${office}',now(),'cancelled',false,'Air','GBLHR'),
      ('${uid(44)}','${uid(31)}','${otherOffice}',now(),'confirmed',false,'Road','USNYC');
    `))
    ok(sql(readFileSync(new URL('../migrations/20260929230000_admin_dashboard_and_usage.sql',import.meta.url),'utf8')))
    const read = user => JSON.parse(ok(sql(as(user, `select public.multideck_admin_dashboard(current_date-29,current_date)`))))
    const report = read(admin)
    assert.equal(report.summary.bookings,1)
    assert.equal(report.summary.repeatCustomers,1)
    assert.equal(report.summary.customers,1)
    assert.equal(report.customers[0].name,'Customer A')
    assert.deepEqual(report.countries,[{code:'GB',count:1}])
    assert.equal(report.coverage.estimatedBookingDates,1)
    assert.equal(read(foreign).summary.bookings,1)
    assert.equal(read(foreign).customers[0].name,'Other tenant')
    assert.equal(report.coverage.previousUsageComplete,false)
    assert.equal(read(companyAdmin).summary.bookings,0, 'Admin role does not manufacture commercial permission')
    assert.equal(read(companyAdmin).permissions.bookings,false)
    for (const user of [colleague,fd,inactive,unlinked,uid(99)]) denied(user,'select public.multideck_admin_dashboard(current_date-29,current_date)')
    assert.notEqual(sql(as(admin,'select public.multideck_admin_dashboard(current_date-29,current_date)','anon')).status,0)
    denied(admin,'select * from public."Admin_UsageEvents"')
    const record = (user,event) => ok(sql(as(user, `select public.multideck_admin_record_usage('${JSON.stringify(event)}'::jsonb)`)))
    const now = Date.now()
    const time = (id,from,to,state='active') => ({id:uid(id),kind:'time',module:'quotes',state,from:new Date(now+from).toISOString(),to:new Date(now+to).toISOString()})
    record(colleague,time(50,-60000,-30000))
    record(colleague,time(51,-50000,-20000))
    record(colleague,time(52,-45000,-15000,'idle'))
    record(colleague,time(50,-60000,-30000))
    assert.equal(read(admin).summary.activeSeconds,40)
    assert.equal(read(admin).summary.idleSeconds,5)
    assert.equal(read(admin).summary.activeUsers,1)
    record(foreign,time(53,-60000,-30000))
    assert.equal(read(admin).summary.activeSeconds,40)
    const flow = {kind:'flow',flowId:uid(60),flow:'booking_create',step:'opened',state:'started'}
    record(colleague,{...flow,id:uid(61)})
    record(colleague,{...flow,id:uid(79),state:"validation_failed",step:"review"})
    denied(colleague,`select public.multideck_admin_record_usage('${JSON.stringify({...flow,id:uid(62),state:'completed',step:'saved',recordId:uid(44)})}'::jsonb)`)
    ok(sql(`update "Job_Header" set "Job_Status"='confirmed' where "Job_ID"='${uid(42)}';`))
    record(colleague,{...flow,id:uid(63),state:'completed',step:'saved',recordId:uid(42)})
    record(colleague,{...flow,id:uid(64),state:'completed',step:'saved',recordId:uid(42)})
    assert.equal(read(admin).workflows[0].completed,1)
    // Accepted submitted snapshot prices stay isolated from edited working prices and currencies.
    ok(sql(`insert into "CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_IsDeleted","CusQuoteHeader_CustomerID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID") values
      ('${uid(70)}','${office}',false,'${uid(30)}','accepted','${uid(71)}'),('${uid(72)}','${office}',false,'${uid(30)}','accepted','${uid(73)}'),('${uid(74)}','${office}',false,'${uid(30)}','accepted','${uid(75)}');
      insert into "CusQuote_Versions"("CusQuoteVersion_ID","CusQuoteHeader_ID","Company_ID","CusQuoteVersion_IsSubmitted","CusQuoteVersion_SnapshotJSON") values
      ('${uid(71)}','${uid(70)}','${company}',true,'{"quote":{"currency":"GBP","charges":[{"sellLocal":100},{"sellLocal":200}]}}'),
      ('${uid(73)}','${uid(72)}','${company}',true,'{"quote":{"currency":"USD","charges":[{"sellLocal":1000}]}}'),
      ('${uid(75)}','${uid(74)}','${company}',true,'{"quote":{"currency":"GBP","charges":[{"sellLocal":"invalid"}]}}');
      insert into "CusQuote_Events"("CusQuoteEvent_ID","Company_ID","CusQuoteHeader_ID","CusQuoteEvent_TypeCode","CusQuoteEvent_OccurredAt") values (gen_random_uuid(),'${company}','${uid(70)}','accepted',now()),(gen_random_uuid(),'${company}','${uid(72)}','accepted',now()),(gen_random_uuid(),'${company}','${uid(74)}','accepted',now());`))
    const priced = read(admin)
    assert.equal(priced.prices.find(p=>p.currency==='GBP').average,300)
    assert.equal(priced.prices.find(p=>p.currency==='USD').average,1000)
    assert.equal(priced.coverage.unpricedWins,1)
    // Malformed submitted JSON must be disclosed, not crash the whole report or become GBP.
    ok(sql(`update "CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"='{"quote":{"currency":"GBP","charges":null}}' where "CusQuoteVersion_ID"='${uid(75)}';`))
    assert.equal(read(admin).coverage.unpricedWins,1)
    ok(sql(`update "CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"='{"quote":{"currency":"broken","charges":[{"sellLocal":900}]}}' where "CusQuoteVersion_ID"='${uid(75)}';`))
    assert.equal(read(admin).coverage.unpricedWins,1)
    // Standard colleagues can record their own activity, but cannot read any employee report.
    ok(sql(`update "cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='${colleague}';`))
    denied(colleague,`select public.multideck_admin_record_usage('${JSON.stringify(time(80,-20000,-10000))}'::jsonb)`)
    assert.equal(read(admin).summary.activeSeconds,40,'Historical colleagues remain in totals')
    ok(sql(`update "Admin_WorkflowEvents" set occurred_at=now()-interval '91 days'; update "Admin_UsageEvents" set recorded_at=now()-interval '91 days'; select public.multideck_admin_usage_maintenance(); select public.multideck_admin_usage_maintenance();`))
    assert.equal(ok(sql('select count(*) from "Admin_UsageEvents"')), '0')
    assert.equal(ok(sql('select count(*) from "Admin_WorkflowEvents"')), '0')
    assert.equal(ok(sql('select sum(started)||\',\'||sum(completed)||\',\'||sum(errors) from "Admin_WorkflowDaily"')), '1,1,1')
    assert.equal(ok(sql(`select string_agg(r."sys_UserRole_Name",',') from "sys_UserRoles" r join "sys_UserRole_Permissions" l using("sys_UserRole_ID") join "sys_Permissions" p using("sys_Permission_ID") where p."sys_Permission_Value"='Finance.Director.Dashboard.View'`)),'Finance Director')
    ok(sql(`insert into "Admin_UsageDaily"(company_id,user_id,day,module,active_seconds,active_ranges) values
      ('${company}','${admin}',current_date-91,'_all',30,tstzmultirange(tstzrange(now()-interval '91 days',now()-interval '91 days'+interval '30 seconds'))),
      ('${company}','${admin}',current_date-interval '14 months','_all',30,'{}');
      select public.multideck_admin_usage_maintenance();`))
    assert.equal(ok(sql(`select active_seconds||','||(active_ranges='{}')::text from "Admin_UsageDaily" where user_id='${admin}' and day=current_date-91`)),'30,true')
    assert.equal(ok(sql(`select count(*) from "Admin_UsageDaily" where day<current_date-interval '13 months'`)),'0')
    ok(sql(`delete from "cmp_Users_Roles" where "User_ID"='${admin}';`))
    denied(admin,'select public.multideck_admin_dashboard(current_date-29,current_date)')
  } finally {
    if (started) run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
