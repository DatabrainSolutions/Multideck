import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction } from './operational-access-source.mjs'

import { accountFinanceAccess } from '../functions/_shared/account-finance-access.mts'

test('supplier finance reads require payables, current account access and separately gated integration access', () => {
  const read = ['Customers.Read', 'Finance.Payables.View']
  assert.deepEqual(accountFinanceAccess('supplier', read), { financialAccess: true, accountingSyncAccess: false })
  assert.equal(accountFinanceAccess('supplier', [...read, 'Finance.Integration.Manage']).accountingSyncAccess, true)
  for (const permissions of [[], ['Customers.Read'], ['Finance.Payables.View'], ['Customers.Read', 'Finance.Receivables.View'], ['Customers.Read', 'Finance.Integration.Manage']]) {
    assert.equal(accountFinanceAccess('supplier', permissions).financialAccess, false)
  }
  assert.equal(accountFinanceAccess('customer', read).financialAccess, false)
  assert.equal(accountFinanceAccess('company', read).financialAccess, false)
  assert.equal(accountFinanceAccess('customer', ['Customers.Read', 'Finance.Receivables.View']).financialAccess, true)
})

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('supplier account projection isolates payables, credits, profiles and tenant totals', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'supplier-finance-'))
  const run = (name, args, input) => spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 30000 })
  const ok = result => { assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const sql = input => run('psql', ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
  let started = false
  try {
    ok(run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8']))
    ok(run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])); started = true
    ok(sql(`create role anon; create role authenticated; create role service_role;
      create table "Org_Master"("Org_id" uuid);
      create table "Org_Types"("OrgType_ID" uuid,"OrgType_Name" text);
      create table "Org_Master_Type"("Org_ID" uuid,"OrgType_ID" uuid);
      create table "CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_MetadataJSON" jsonb default '{}');
      create table "CRM_AccountOperationalProfiles"("CRMAccountOps_OrgID" uuid,"CRMAccountOps_CompanyID" uuid,"CRMAccountOps_InvoicePreferencesJSON" jsonb);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table "cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table "Job_Header"("Job_Customer" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid);
      create table "CusQuote_Header"("CusQuoteHeader_CustomerID" uuid,"CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid);
      create table "FIN_Documents"("FINDoc_PartyOrgID" uuid,"FINDoc_LegalEntityID" uuid,"FINDoc_TypeCode" text,"FINDoc_PartyRole" text,"FINDoc_StatusCode" text,"FINDoc_LocalOutstandingAmount" numeric,"FINDoc_OutstandingAmount" numeric,"FINDoc_DueDate" date);
      create table "ACCI_Connections"("ACCIC_ID" uuid,"ACCIC_LegalEntityID" uuid,"ACCIC_StatusCode" text);
      create table "ACCI_PartyMappings"("ACCIPM_ConnectionID" uuid,"ACCIPM_OrgID" uuid,"ACCIPM_LastSyncedAt" timestamptz,"ACCIPM_CreatedAt" timestamptz,"ACCIPM_PartyType" text,"ACCIPM_IsActive" boolean);
      create table "ACCI_SyncEvents"("ACCISE_ID" uuid,"ACCISE_ConnectionID" uuid,"ACCISE_LocalID" uuid,"ACCISE_EventCode" text,"ACCISE_Severity" text,"ACCISE_CreatedAt" timestamptz,"ACCISE_LocalTable" text);
      ${currentFunction('public', 'multideck_crm_accessible_account_ids').sql}
      grant select on all tables in schema public to service_role;
      insert into "Org_Master" values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
      insert into "Org_Types" values('${id(10)}','Supplier'),('${id(11)}','Customer');
      insert into "Org_Master_Type" values('${id(1)}','${id(10)}'),('${id(2)}','${id(10)}'),('${id(3)}','${id(11)}'),('${id(4)}','${id(10)}');
      insert into "CRM_AccountProfiles" values('${id(1)}','${id(100)}',false,'{}'),('${id(2)}','${id(200)}',false,'{}'),('${id(3)}','${id(100)}',false,'{}'),('${id(4)}','${id(100)}',false,'{}');
      insert into "cmp_LegalEntities" values('${id(101)}','${id(100)}',true,'GBP'),('${id(201)}','${id(200)}',true,'GBP'),('${id(102)}','${id(100)}',false,'GBP');
      insert into "CRM_AccountOperationalProfiles" values('${id(1)}','${id(100)}','{"purchasePaymentTermCode":"NET45","payableTermDays":45,"supplierAccountingStatusCode":"on_hold","creditLimit":9999,"creditHold":true,"salesPaymentTermCode":"NET7"}');
      insert into "FIN_Documents" values
      ('${id(1)}','${id(101)}','pl_invoice','supplier','approved',100,100,current_date-10),
      ('${id(1)}','${id(102)}','pl_invoice','supplier','submitted',50,50,current_date+10),
      ('${id(1)}','${id(101)}','debit_note','supplier','approved',-20,-20,current_date-10),
      ('${id(1)}','${id(101)}','sl_invoice','customer','approved',900,900,current_date-10),
      ('${id(1)}','${id(201)}','pl_invoice','supplier','approved',800,800,current_date-10),
      ('${id(1)}','${id(101)}','pl_invoice','supplier','draft',700,700,current_date-10),
      ('${id(2)}','${id(201)}','pl_invoice','supplier','approved',600,600,current_date-10),
      ('${id(3)}','${id(101)}','pl_invoice','supplier','approved',500,500,current_date-10),
      ('${id(4)}','${id(101)}','pl_invoice','supplier','approved',25,25,current_date-2);`))
    const migration = readFileSync(new URL('../migrations/20260929153900_supplier_account_finance_register.sql', import.meta.url), 'utf8')
    ok(sql(migration))
    assert.ok(readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8').includes(migration.trim()))
    const snapshot = (company = 100, requested = [1,2,3]) => JSON.parse(ok(sql(`set role service_role; select public.multideck_finance_supplier_account_snapshot('${id(company)}',array[${requested.map(n => `'${id(n)}'::uuid`).join(',')}],false);`)))
    const result = snapshot()
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].organisationId, id(1))
    assert.equal(result.rows[0].balanceDue, 130)
    assert.equal(result.rows[0].overdueAmount, 100)
    assert.equal(result.rows[0].openInvoiceCount, 2)
    assert.equal(result.rows[0].paymentTermsCode, 'NET45')
    assert.equal(result.rows[0].paymentTermDays, 45)
    assert.equal(result.rows[0].accountStatus, 'on_hold')
    assert.equal(result.rows[0].creditLimit, null)
    assert.equal(result.rows[0].creditHold, false)
    assert.equal(result.rows[0].accountingSyncStatus, undefined)
    assert.equal(result.summary.balanceDue, 155)
    assert.equal(result.summary.overdueSupplierCount, 2)
    assert.equal(result.summary.onHoldCount, 1)
    assert.deepEqual(snapshot(200).rows.map(row => row.organisationId), [id(2)])
    for (const role of ['anon', 'authenticated']) {
      const denied = sql(`set role ${role}; select public.multideck_finance_supplier_account_snapshot('${id(100)}',array['${id(1)}'::uuid]);`)
      assert.notEqual(denied.status, 0); assert.match(denied.stderr, /permission denied/)
    }
    ok(sql(`update "cmp_LegalEntities" set "LegalEntity_BaseCurrencyCodeSnapshot"='EUR' where "LegalEntity_ID"='${id(102)}';`))
    assert.equal(snapshot().financeReady, false)
    assert.equal(snapshot().rows[0].balanceDue, null)
    assert.equal(snapshot().summary.balanceDue, null)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
