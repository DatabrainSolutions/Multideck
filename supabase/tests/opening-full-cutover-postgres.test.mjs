import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'
const digest = letter => letter.repeat(64)

test('full CargoWise opening posts one TB and operational AR/AP and unapplied cash', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'finance-full-opening-'))
  let started = false
  const run = (name, arguments_, input, success = true) => {
    const result = spawnSync(join(bin, name), arguments_, {
      input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024,
    })
    if (success) assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout.slice(-1500)}`)
    else assert.notEqual(result.status, 0, `${name}: ${result.stdout}`)
    return result
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input).stdout.trim()
  const reject = (input, pattern) => assert.match(run('psql', args, input, false).stderr, pattern)
  const stage = (items, trial = null) => ({
    packageKind: 'full_open_items', sourceSystem: 'CargoWise', sourceFileName: 'cw-tb.xlsx',
    sourceSha256: digest('a'), sourceItemsFileName: 'cw-open-items.xlsx', sourceItemsSha256: digest('b'),
    cutoffDate: '2026-08-31', baseCurrency: 'GBP',
    evidence: { bank: 'BANK-01', tax: 'TAX-01', accrualWip: 'WIP-01', sourceReconciliation: 'RECON-01',
      partyMapping: 'PARTY-01', openItems: 'ITEM-01', fx: 'FX-01' },
    trialBalance: trial ?? [
      { sourceRow: 1, accountCode: 'AR', debit: '100', credit: '0' },
      { sourceRow: 2, accountCode: 'BANK', debit: '50', credit: '0' },
      { sourceRow: 3, accountCode: 'AP', debit: '0', credit: '30' },
      { sourceRow: 4, accountCode: 'EQUITY', debit: '0', credit: '120' },
    ], openItems: items,
  })
  const item = (row, kind, account, party, outstanding) => ({
    sourceRow: row, sourceId: `CW-${row}`, partyCode: `CW-PARTY-${party}`, partyOrgId: id(party),
    reference: `CW-DOC-${row}`, accountCode: account, kind, documentDate: '2026-08-20',
    dueDate: '2026-09-30', currency: 'GBP', originalAmount: String(Number(outstanding) + 10),
    originalBaseAmount: String(Number(outstanding) + 10), outstandingAmount: String(outstanding),
    outstandingBaseAmount: String(outstanding), historicalVatEvidenceRef: `PRIOR-RETURN-${row}`,
  })
  const items = [item(1, 'customer_invoice', 'AR', 20, 120),
    item(2, 'customer_receipt', 'AR', 20, 20),
    item(3, 'supplier_invoice', 'AP', 21, 50),
    item(4, 'supplier_payment', 'AP', 21, 20)]
  const call = (actor, action, input) => `select public.multideck_finance_opening_balances(
    '${id(actor)}','${id(3)}','${action}', '${JSON.stringify(input)}'::jsonb);`
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin;
      create role supabase_functions_admin; create role pgsodium_keyholder;
      create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions; create extension pgcrypto with schema extensions;
      create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.role() returns text language sql stable as $$select 'service_role'::text$$;
      create table auth.users(id uuid primary key);`)
    const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
    const boundary = baseline.indexOf(marker)
    assert.ok(boundary > 0)
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', new URL('migrations/20260918123733_general_ledger_journals.sql', root).pathname])
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    const migrations = readdirSync(new URL('migrations/', root))
      .filter(name => name >= '20260925070431' && name.endsWith('.sql') && !/_(?:uk_vat|hmrc)_/.test(name)).sort()
    for (const migration of migrations) run('psql', [...args, '-f', new URL(`migrations/${migration}`, root).pathname])
    // Authorisation is isolated in this fixture; the real access function is covered by the journal suite.
    sql(`create or replace function public._multideck_dexter_has_permission(p_user_id uuid,p_permission text)
      returns boolean language sql stable as $$select true$$;
      insert into public."cmp_Company"("Company_ID","Company_Name") values
        ('${id(2)}','Test'),('${id(6)}','Other tenant') on conflict do nothing;
      insert into public."cmp_Users"("User_ID","Company_ID","User_Email") values
        ('${id(1)}','${id(2)}','stage@example.test'),('${id(4)}','${id(2)}','approve@example.test'),
        ('${id(5)}','${id(6)}','foreign@example.test');
      insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_Name",
        "LegalEntity_CountryCode","LegalEntity_BaseCurrencyCodeSnapshot")
        values('${id(3)}','${id(2)}','Test entity','FR','GBP');
      insert into public."sys_Currency"("Currency_ID","Currency_Code") values('${id(7)}','GBP');
      insert into public."Org_Master"("Org_id","Org_Name","Org_BaseCurrency","Org_AccCode") values
        ('${id(20)}','Customer','${id(7)}','CUSTOMER'),('${id(21)}','Supplier','${id(7)}','SUPPLIER');
      insert into public."sys_CRMRelationshipStatuses"("CRMRelStatus_Code","CRMRelStatus_Name") values('lead','Lead');
      insert into public."CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID",
        "CRMAccount_LegalEntityID") values ('${id(20)}','${id(2)}','${id(3)}'),('${id(21)}','${id(2)}','${id(3)}');
      insert into public."Org_Types"("OrgType_ID","OrgType_Name") values('${id(30)}','Customer'),('${id(31)}','Supplier');
      insert into public."Org_Master_Type"("Org_ID","OrgType_ID") values
        ('${id(20)}','${id(30)}'),('${id(21)}','${id(31)}');
      insert into public."FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code",
        "FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode","FINNom_IsControlAccount") values
        ('${id(40)}','${id(3)}','AR','AR','Receivable','asset',true),
        ('${id(41)}','${id(3)}','AP','AP','Payable','liability',true),
        ('${id(42)}','${id(3)}','BANK','Bank','Bank','asset',false),
        ('${id(43)}','${id(3)}','EQUITY','Equity','Equity','equity',false);
      insert into public."sys_AuditActorTypes"("AuditActorType_Code","AuditActorType_Name") values('user','User');
      insert into public."sys_AuditEventTypes"("AuditEventType_Code","AuditEventType_Name") values('finance_lifecycle','Finance lifecycle');
      insert into public."sys_AuditOutcomeStatuses"("AuditOutcomeStatus_Code","AuditOutcomeStatus_Name") values('success','Success');
      insert into public."sys_AuditRetentionClasses"("AuditRetentionClass_Code","AuditRetentionClass_Name")
        values('standard_7y','Standard seven years');
      insert into public."sys_AuditSensitivityLevels"("AuditSensitivity_Code","AuditSensitivity_Name")
        values('normal','Normal');
      insert into public."sys_FinancePeriodStatuses"("FINPERST_Code","FINPERST_Name") values('open','Open');
      insert into public."sys_FinancePostingStatuses"("FINPOSTST_Code","FINPOSTST_Name") values('posted','Posted');
      insert into public."sys_FinanceDocumentStatuses"("FINDST_Code","FINDST_Name") values('approved','Approved');
      insert into public."sys_FinanceDocumentTypes"("FINDT_Code","FINDT_Name") values
        ('sl_invoice','Sales invoice'),('pl_invoice','Purchase invoice'),('credit_note','Credit note'),('debit_note','Debit note');
      insert into public."sys_FinanceCashStatuses"("FINCASHST_Code","FINCASHST_Name") values('approved','Approved');
      insert into public."sys_FinanceCashTypes"("FINCASHT_Code","FINCASHT_Name") values
        ('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment');`)
    reject(call(5, 'stage', stage(items)), /do not have access/)
    reject(call(1, 'stage', stage(items, [
      { sourceRow: 1, accountCode: 'AR', debit: '99', credit: '0' },
      { sourceRow: 2, accountCode: 'BANK', debit: '51', credit: '0' },
      { sourceRow: 3, accountCode: 'AP', debit: '0', credit: '30' },
      { sourceRow: 4, accountCode: 'EQUITY', debit: '0', credit: '120' },
    ])), /do not reconcile/)
    const staged = JSON.parse(sql(call(1, 'stage', stage(items))))
    assert.equal(staged.status, 'staged')
    assert.equal(staged.reconciliation.openItems, 4)
    reject(call(1, 'approve', { id: staged.id }), /second finance operator/)
    assert.equal(JSON.parse(sql(call(4, 'approve', { id: staged.id }))).status, 'approved')
    const posted = JSON.parse(sql(call(4, 'post', { id: staged.id })))
    assert.equal(posted.status, 'posted')
    assert.equal(sql(`select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"='${id(3)}';`), '1')
    assert.equal(sql(`select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"='${posted.posting_batch_id}';`), '4')
    assert.equal(sql(`select count(*) from public."FIN_Documents" where "FINDoc_OpeningBalancePackageID"='${staged.id}'
      and "FINDoc_NativePostingBatchID"='${posted.posting_batch_id}';`), '2')
    assert.equal(sql(`select count(*) from public."FIN_CashTransactions" where "FINCash_OpeningBalancePackageID"='${staged.id}'
      and "FINCash_NativePostingBatchID"='${posted.posting_batch_id}';`), '2')
    reject(call(4, 'post', { id: staged.id }), /stages in order/)
    reject(`update public."FIN_OpeningSourceItems" set original_amount=1 where package_id='${staged.id}';`, /immutable/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
