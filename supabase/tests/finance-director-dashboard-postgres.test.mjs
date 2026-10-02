import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const tables = [
  'cmp_Users', 'cmp_Users_Roles', 'sys_UserRoles', 'sys_Permissions', 'sys_UserRole_Permissions', 'cmp_LegalEntities',
  'FIN_Periods', 'FIN_NominalAccounts', 'FIN_PostingBatches', 'FIN_PostingLines', 'FIN_CashTransactions',
  'FIN_Documents', 'FIN_DocumentLineJobLinks', 'FIN_BankAccounts', 'Job_Header', 'Org_Master',
]

test('Admin dashboard reads the right figures only for users holding Finance Director', () => {
  const bin = process.env.PG_TEST_BIN || spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout.trim()
  const dir = mkdtempSync(join(tmpdir(), 'finance-director-'))
  let started = false
  const run = (cmd, args, input) => spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 60000 })
  const ok = result => { assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const sql = input => run('psql', ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
  const denied = (input, pattern) => { const result = sql(input); assert.notEqual(result.status, 0, `expected denial: ${input}`); assert.match(result.stderr, pattern) }

  const company = '00000000-0000-4000-8000-00000000c001'
  const otherCompany = '00000000-0000-4000-8000-00000000c002'
  const director = '00000000-0000-4000-8000-0000000000d1'
  const administrator = '00000000-0000-4000-8000-0000000000a1'
  const companyAdmin = '00000000-0000-4000-8000-0000000000a2'
  const colleague = '00000000-0000-4000-8000-0000000000c3'
  const outsider = '00000000-0000-4000-8000-0000000000e1'
  const entity = '00000000-0000-4000-8000-0000000000f1'
  const otherEntity = '00000000-0000-4000-8000-0000000000f2'
  const [income, directCost, overhead, bank] = ['4000', '5000', '7000', '1200'].map(code => `00000000-0000-4000-8000-00000000${code}`)
  const [august, september] = ['00000000-0000-4000-8000-0000000p0808', '00000000-0000-4000-8000-0000000p0909'].map(value => value.replace('p', '0'))
  const [orgA, orgB] = ['00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb']
  const [jobSea, jobAir] = ['00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000052']
  const call = (user, entityId = entity, companyId = company) =>
    `select public.multideck_finance_director_dashboard('${companyId}','${user}','${entityId}','2026-07-01','2026-09-30','2026-09-28')`

  try {
    ok(run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8']))
    ok(run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])); started = true
    ok(sql('create role anon; create role authenticated; create role service_role;'))
    const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
    for (const name of tables) {
      const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
      assert.ok(start >= 0, name)
      // Only the columns: the fixture fills just what the dashboard reads, so
      // check constraints and unrelated NOT NULL columns are dropped.
      const statement = baseline.slice(start, baseline.indexOf('\n);', start) + 4)
        .split('\n').filter(line => !/^\s*CONSTRAINT /.test(line)).join('\n').trimEnd().replace(/,\s*\n\);$/, '\n);').replaceAll(' NOT NULL', '')
      ok(sql(statement))
    }
    ok(sql(`
      create unique index on "sys_Permissions"("sys_Permission_Value");
      alter table "sys_UserRole_Permissions" add primary key ("sys_UserRole_ID","sys_Permission_ID");
      insert into "sys_UserRoles"("sys_UserRole_ID","sys_UserRole_Name") values
        ('00000000-0000-4000-8000-0000000000r1'::text::uuid, 'Administrator'),
        ('0b8874ef-5e70-4e51-b0ab-9b466d0e6937', 'Company Admin');
    `.replace("'00000000-0000-4000-8000-0000000000r1'::text::uuid", "'0b8874ef-5e70-4e51-b0ab-9b466d0e6936'")))

    // The migration removes a pre-existing dashboard grant from Administrator.
    ok(sql(`
      insert into "sys_Permissions"("sys_Permission_ID","sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description")
      values (gen_random_uuid(),'Finance.Director.Dashboard.View','Finance','Seeded early','Seeded early'),
             (gen_random_uuid(),'Finance.Reporting.View','Finance','Reporting','Reporting');
      insert into "sys_UserRole_Permissions" select '0b8874ef-5e70-4e51-b0ab-9b466d0e6936'::uuid, "sys_Permission_ID" from "sys_Permissions";
    `))
    ok(sql(readFileSync(new URL('../migrations/20260928090000_finance_director_dashboard.sql', import.meta.url), 'utf8')))
    assert.equal(ok(sql(`
      select string_agg(role."sys_UserRole_Name", ',' order by role."sys_UserRole_Name")
      from "sys_UserRole_Permissions" link
      join "sys_UserRoles" role using ("sys_UserRole_ID")
      join "sys_Permissions" permission using ("sys_Permission_ID")
      where permission."sys_Permission_Value"='Finance.Director.Dashboard.View';
    `)), 'Finance Director')
    assert.equal(ok(sql(`select count(*) from "sys_UserRole_Permissions" link join "sys_UserRoles" role using ("sys_UserRole_ID") join "sys_Permissions" p using ("sys_Permission_ID") where role."sys_UserRole_Name"='Finance Director' and p."sys_Permission_Value"='Finance.Reporting.View';`)), '1')

    ok(sql(`
      insert into "cmp_Users"("User_ID","Company_ID","User_AccessStatus") values
        ('${director}','${company}','active'),('${administrator}','${company}','active'),('${companyAdmin}','${company}','active'),('${colleague}','${company}','active'),('${outsider}','${otherCompany}','active');
      insert into "cmp_Users_Roles"("User_ID","sys_UserRole_ID")
        select '${director}'::uuid,"sys_UserRole_ID" from "sys_UserRoles" where "sys_UserRole_Name"='Finance Director'
        union all select '${director}'::uuid,'0b8874ef-5e70-4e51-b0ab-9b466d0e6936'::uuid
        union all select '${outsider}'::uuid,"sys_UserRole_ID" from "sys_UserRoles" where "sys_UserRole_Name"='Finance Director'
        union all select '${administrator}'::uuid,'0b8874ef-5e70-4e51-b0ab-9b466d0e6936'::uuid
        union all select '${companyAdmin}'::uuid,'0b8874ef-5e70-4e51-b0ab-9b466d0e6937'::uuid;
      insert into "cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_Name","LegalEntity_CountryCode","LegalEntity_BaseCurrencyCodeSnapshot","LegalEntity_IsActive") values
        ('${entity}','${company}','Northwind Freight Ltd','GB','gbp',true),('${otherEntity}','${otherCompany}','Other Co','GB','GBP',true);
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_Code","FINNom_Name","FINNom_LegalEntityID","FINNom_ReportCategoryCode","FINNom_IsActive") values
        ('${income}','4000','Freight income','${entity}','income',true),('${directCost}','5000','Carrier costs','${entity}','direct_cost',true),
        ('${overhead}','7000','Office rent','${entity}','expense',true),('${bank}','1200','Bank','${entity}','asset',true);
      insert into "FIN_BankAccounts"("FINBank_ID","FINBank_Code","FINBank_Name","FINBank_LegalEntityID","FINBank_NominalAccountID","FINBank_IsActive") values
        (gen_random_uuid(),'MAIN','Main','${entity}','${bank}',true),(gen_random_uuid(),'MAIN2','Same nominal','${entity}','${bank}',true);
      insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_StartDate","FINPeriod_EndDate") values
        ('${august}','${entity}','202608','2026-08-01','2026-08-31'),('${september}','${entity}','202609','2026-09-01','2026-09-30');
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_PostedAt") values
        ('00000000-0000-4000-8000-00000000b001','posted','${august}','${entity}','2026-08-31'),
        ('00000000-0000-4000-8000-00000000b002','posted','${september}','${entity}','2026-09-20'),
        ('00000000-0000-4000-8000-00000000b003','draft','${september}','${entity}',null);
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('00000000-0000-4000-8000-00000000b001',1,'${income}',0,1000),('00000000-0000-4000-8000-00000000b001',2,'${directCost}',600,0),
        ('00000000-0000-4000-8000-00000000b001',3,'${bank}',400,0),
        ('00000000-0000-4000-8000-00000000b002',1,'${income}',0,1300),('00000000-0000-4000-8000-00000000b002',2,'${overhead}',250,0),
        ('00000000-0000-4000-8000-00000000b002',3,'${bank}',1050,0),
        ('00000000-0000-4000-8000-00000000b003',1,'${income}',0,99999);
      -- The schema defaults AccountingDate to CURRENT_DATE. Pin both dates to
      -- the reporting example so this fixture also runs after September ends.
      insert into "FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode","FINCash_LegalEntityID","FINCash_TransactionDate","FINCash_AccountingDate","FINCash_LocalAmount") values
        (gen_random_uuid(),'customer_receipt','approved','${entity}','2026-09-10','2026-09-10',800),
        (gen_random_uuid(),'supplier_payment','submitted','${entity}','2026-09-12','2026-09-12',-300),
        (gen_random_uuid(),'customer_receipt','draft','${entity}','2026-09-12','2026-09-12',5000);
      insert into "Org_Master"("Org_id","Org_Name") values ('${orgA}','Acme Imports'),('${orgB}','Blue Harbour');
      insert into "Job_Header"("Job_ID","Job_Customer","Job_TransportModeSummary","Job_OriginUNLocode","Job_DestinationUNLocode") values
        ('${jobSea}','${orgA}','sea','GBFXT','CNSHA'),('${jobAir}','${orgB}','Air','USNYC','GBLHR');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_AccountingDate","FINDoc_DueDate","FINDoc_LocalNetAmount","FINDoc_LocalOutstandingAmount") values
        ('00000000-0000-4000-8000-00000000d001','sl_invoice','posted','${entity}','${orgA}','2026-09-01','2026-08-15',1000,1200),
        ('00000000-0000-4000-8000-00000000d002','credit_note','approved','${entity}','${orgA}','2026-09-05','2026-09-05',-100,0),
        ('00000000-0000-4000-8000-00000000d003','pl_invoice','approved','${entity}',null,'2026-09-06','2026-10-06',600,600),
        ('00000000-0000-4000-8000-00000000d004','sl_invoice','submitted','${entity}','${orgB}','2026-08-20','2026-10-20',400,480),
        ('00000000-0000-4000-8000-00000000d005','sl_invoice','draft','${entity}','${orgB}','2026-09-20','2026-10-20',9999,9999),
        ('00000000-0000-4000-8000-00000000d006','sl_invoice','posted','${entity}','${orgB}','2026-05-20','2026-06-20',7777,0);
      insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_ID","FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount") values
        (gen_random_uuid(),'00000000-0000-4000-8000-00000000d001',gen_random_uuid(),'${jobSea}','charge',1000,1000),
        (gen_random_uuid(),'00000000-0000-4000-8000-00000000d002',gen_random_uuid(),'${jobSea}','charge',100,100),
        (gen_random_uuid(),'00000000-0000-4000-8000-00000000d003',gen_random_uuid(),'${jobSea}','charge',600,600),
        (gen_random_uuid(),'00000000-0000-4000-8000-00000000d004',gen_random_uuid(),'${jobAir}','charge',400,400);
    `))

    const read = (path) => ok(sql(`select (${call(director)})${path};`))
    assert.equal(read(`->>'currency'`), 'GBP')
    assert.equal(read(`->'months'->>-1`).length > 0, true)
    assert.equal(ok(sql(`select jsonb_array_length((${call(director)})->'months');`)), '24')
    // Posted ledger only: the draft batch's 99,999 never reaches the P&L.
    assert.deepEqual(JSON.parse(read(`->'months'->-2`)), { month: '2026-08', revenue: 1000, directCost: 600, overheads: 0, cashIn: 0, cashOut: 0 })
    assert.deepEqual(JSON.parse(read(`->'months'->-1`)), { month: '2026-09', revenue: 1300, directCost: 0, overheads: 250, cashIn: 800, cashOut: 300 })
    assert.equal(read(`->'overheadAccounts'->0->>'name'`), 'Office rent')
    // Two bank records on one nominal are one balance, not two.
    assert.equal(read(`->>'cashAtBank'`), '1450.00')
    // A credit note stored negative still reduces revenue once.
    assert.deepEqual(JSON.parse(read(`->'customers'`)).map(({ name, revenue, linkedRevenue, linkedCost }) => ({ name, revenue, linkedRevenue, linkedCost })), [
      { name: 'Acme Imports', revenue: 900, linkedRevenue: 900, linkedCost: 600 },
      { name: 'Blue Harbour', revenue: 400, linkedRevenue: 400, linkedCost: 0 },
    ])
    assert.deepEqual(JSON.parse(read(`->'modes'`)), [
      { key: 'sea', revenue: 900, cost: 600, jobs: 1 },
      { key: 'air', revenue: 400, cost: 0, jobs: 1 },
    ])
    // The overseas end of each lane: Shanghai for the export, New York for the import.
    assert.deepEqual(JSON.parse(read(`->'regions'`)).map(({ key, revenue }) => ({ key, revenue })), [
      { key: 'Asia', revenue: 900 }, { key: 'North America', revenue: 400 },
    ])
    assert.equal(read(`->>'salesRevenue'`), '1300.00')
    assert.equal(read(`->'receivables'->>'total'`), '1680.00')
    assert.deepEqual(JSON.parse(read(`->'receivables'->'buckets'`)).map(bucket => bucket.amount), [480, 0, 1200, 0, 0])
    assert.equal(read(`->'payables'->>'total'`), '600.00')
    assert.equal(ok(sql(`select private.multideck_finance_region('gb','GB') || private.multideck_finance_region('ZA','GB') || private.multideck_finance_region(null,'GB');`)), 'DomesticAfricaUnassigned')

    // Administrator alone, Company Admin and standard colleagues are denied.
    denied(call(administrator), /for Finance Directors/)
    denied(call(companyAdmin), /for Finance Directors/)
    denied(call(colleague), /for Finance Directors/)
    denied(call(outsider), /outside this workspace/)
    denied(call(director, otherEntity), /outside this workspace/)
    denied(call(director, entity, otherCompany), /outside this workspace/)
    denied(`set role authenticated; ${call(director)};`, /permission denied/)
    denied(`set role anon; ${call(director)};`, /permission denied/)
    ok(sql(`update "cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='${director}';`))
    denied(call(director), /outside this workspace/)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
