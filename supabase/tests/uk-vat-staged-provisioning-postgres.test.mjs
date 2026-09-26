import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const baselinePath = join(root, 'baseline/public-schema.sql')
const migrationsPath = join(root, 'migrations')
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'
const vatMigrations = readdirSync(migrationsPath).filter(name => /^2026092[45]\d{6}_.*\.sql$/.test(name)).sort()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('staged tenant schema accepts the UK VAT migration chain and source locks', () => {
  assert.ok(vatMigrations.length >= 16, 'Expected the complete UK VAT migration chain')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'vat-staged-provision-'))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, {
      input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024,
    })
    assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    // The real tenant already has these Supabase roles, extensions and Auth objects.
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin;
      create role supabase_functions_admin; create role pgsodium_keyholder;
      create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions;
      create extension pgcrypto with schema extensions;
      create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table auth.users(id uuid primary key);`)
    const baseline = readFileSync(baselinePath, 'utf8')
    const boundary = baseline.indexOf(marker)
    assert.ok(boundary > 0 && baseline.indexOf(marker, boundary + 1) < 0,
      'The staged provisioning boundary has changed')
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', join(migrationsPath, '20260918123733_general_ledger_journals.sql')])
    // The hosted provisioner restores the dump preamble for this second stage.
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    run('psql', [...args, '-f', join(migrationsPath, '20260923150858_finance_chart_nominal_resolution.sql')])
    for (const name of vatMigrations) {
      run('psql', [...args, '-f', join(migrationsPath, name)])
    }
    assert.equal(sql(`select count(*) from pg_trigger
      where tgname in ('vat_signed_document_lock','vat_signed_document_line_lock',
        'vat_signed_document_job_link_lock','vat_signed_posting_line_lock',
        'vat_signed_posting_batch_lock') and not tgisinternal`), '5')
    assert.equal(sql(`select count(*) from information_schema.columns
      where table_schema='public' and table_name='FIN_IndirectTaxReconciliations'
        and column_name='reconciled_at'`), '1')
    assert.equal(sql(`select count(*) from pg_class
      where relname='FIN_IndirectTaxPriorPeriodErrorIntake' and relrowsecurity`), '1')
    // GB integration: the full opening writer must pass the VAT gate, keep
    // historical items out of current VAT, and isolate opening VAT control.
    sql(`create or replace function public._multideck_dexter_has_permission(p_user_id uuid,p_permission text)
      returns boolean language sql stable as $$select true$$;
      insert into public."cmp_Company"("Company_ID","Company_Name") values('${id(2)}','UK test');
      insert into public."cmp_Users"("User_ID","Company_ID","User_Email") values
        ('${id(1)}','${id(2)}','stage-gb@example.test'),
        ('${id(4)}','${id(2)}','approve-gb@example.test');
      insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_Name",
        "LegalEntity_CountryCode","LegalEntity_BaseCurrencyCodeSnapshot")
        values('${id(3)}','${id(2)}','UK entity','GB','GBP');
      insert into public."FIN_LocalisationPacks"("FINLocPack_ID","FINLocPack_Code","FINLocPack_Name",
        "FINLocPack_CountryCode","FINLocPack_ReportingCurrencyCode")
        values('${id(90)}','test-gb','UK test pack','GB','GBP');
      insert into public."FIN_ComplianceObligations"("FINCompliance_ID","FINCompliance_PackID",
        "FINCompliance_Code","FINCompliance_Name","FINCompliance_ObligationTypeCode",
        "FINCompliance_AuthorityName","FINCompliance_FilingChannelCode","FINCompliance_FrequencyCode",
        "FINCompliance_SourceURL","FINCompliance_EffectiveFrom")
        values('${id(91)}','${id(90)}','gb-vat-mtd','UK VAT','indirect_tax',
          'HMRC','mtd_api','quarterly','https://www.gov.uk/','2020-01-01');
      insert into public."FIN_LegalEntityComplianceRegistrations"(
        "FINComplianceReg_ID","FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID",
        "FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference",
        "FINComplianceReg_EffectiveFrom","FINComplianceReg_SettingsJSON")
        values('${id(92)}','${id(3)}','${id(91)}','configured','123456789',
          '2020-01-01','{"schemeCode":"standard","accountingBasis":"invoice"}'::jsonb);
      insert into public."sys_Currency"("Currency_ID","Currency_Code") values('${id(7)}','GBP');
      insert into public."Org_Master"("Org_id","Org_Name","Org_BaseCurrency","Org_AccCode") values
        ('${id(20)}','Customer','${id(7)}','CUSTOMER'),
        ('${id(21)}','Supplier','${id(7)}','SUPPLIER');
      insert into public."sys_CRMRelationshipStatuses"("CRMRelStatus_Code","CRMRelStatus_Name") values('lead','Lead');
      insert into public."CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID",
        "CRMAccount_LegalEntityID") values
        ('${id(20)}','${id(2)}','${id(3)}'),('${id(21)}','${id(2)}','${id(3)}');
      insert into public."Org_Types"("OrgType_ID","OrgType_Name") values
        ('${id(30)}','Customer'),('${id(31)}','Supplier');
      insert into public."Org_Master_Type"("Org_ID","OrgType_ID") values
        ('${id(20)}','${id(30)}'),('${id(21)}','${id(31)}');
      insert into public."FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code",
        "FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode","FINNom_IsControlAccount",
        "FINNom_ControlTypeCode") values
        ('${id(40)}','${id(3)}','AR','AR','Receivable','asset',true,null),
        ('${id(41)}','${id(3)}','AP','AP','Payable','liability',true,null),
        ('${id(42)}','${id(3)}','BANK','Bank','Bank','asset',false,null),
        ('${id(43)}','${id(3)}','EQUITY','Equity','Equity','equity',false,null),
        ('${id(44)}','${id(3)}','2100','Opening VAT liability','Liability','liability',true,'vat');
      insert into public."sys_AuditActorTypes"("AuditActorType_Code","AuditActorType_Name") values('user','User');
      insert into public."sys_AuditEventTypes"("AuditEventType_Code","AuditEventType_Name") values('finance_lifecycle','Finance lifecycle');
      insert into public."sys_AuditOutcomeStatuses"("AuditOutcomeStatus_Code","AuditOutcomeStatus_Name") values('success','Success');
      insert into public."sys_AuditRetentionClasses"("AuditRetentionClass_Code","AuditRetentionClass_Name") values('standard_7y','Seven years');
      insert into public."sys_AuditSensitivityLevels"("AuditSensitivity_Code","AuditSensitivity_Name") values('normal','Normal');
      insert into public."sys_FinancePeriodStatuses"("FINPERST_Code","FINPERST_Name") values('open','Open');
      insert into public."sys_FinancePostingStatuses"("FINPOSTST_Code","FINPOSTST_Name") values('posted','Posted');
      insert into public."sys_FinanceDocumentStatuses"("FINDST_Code","FINDST_Name") values('approved','Approved');
      insert into public."sys_FinanceDocumentTypes"("FINDT_Code","FINDT_Name") values
        ('sl_invoice','Sales invoice'),('pl_invoice','Purchase invoice'),
        ('credit_note','Credit note'),('debit_note','Debit note');
      insert into public."sys_FinanceCashStatuses"("FINCASHST_Code","FINCASHST_Name") values('approved','Approved');
      insert into public."sys_FinanceCashTypes"("FINCASHT_Code","FINCASHT_Name") values
        ('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment');`)
    const openingItems = [
      [1, 'customer_invoice', 'AR', 20, 120], [2, 'customer_receipt', 'AR', 20, 20],
      [3, 'supplier_invoice', 'AP', 21, 50], [4, 'supplier_payment', 'AP', 21, 20],
    ].map(([row, kind, account, party, outstanding]) => ({
      sourceRow: row, sourceId: `CW-${row}`, partyCode: `CW-PARTY-${party}`,
      partyOrgId: id(party), reference: `CW-DOC-${row}`, accountCode: account,
      kind, documentDate: '2026-08-20', dueDate: '2026-09-30', currency: 'GBP',
      originalAmount: String(outstanding + 10), originalBaseAmount: String(outstanding + 10),
      outstandingAmount: String(outstanding), outstandingBaseAmount: String(outstanding),
      historicalVatEvidenceRef: `PRIOR-RETURN-${row}`,
    }))
    const stagedInput = { packageKind: 'full_open_items', sourceSystem: 'CargoWise',
      sourceFileName: 'gb-tb.xlsx', sourceSha256: 'a'.repeat(64),
      sourceItemsFileName: 'gb-open-items.xlsx', sourceItemsSha256: 'b'.repeat(64),
      cutoffDate: '2026-08-31', baseCurrency: 'GBP',
      evidence: { bank: 'BANK-01', tax: 'TAX-01', accrualWip: 'WIP-01',
        sourceReconciliation: 'RECON-01', partyMapping: 'PARTY-01',
        openItems: 'ITEM-01', fx: 'FX-01' },
      trialBalance: [
        { sourceRow: 1, accountCode: 'AR', debit: '100', credit: '0' },
        { sourceRow: 2, accountCode: 'BANK', debit: '50', credit: '0' },
        { sourceRow: 3, accountCode: 'AP', debit: '0', credit: '30' },
        { sourceRow: 4, accountCode: '2100', debit: '0', credit: '20' },
        { sourceRow: 5, accountCode: 'EQUITY', debit: '0', credit: '100' },
      ], openItems: openingItems }
    const callOpening = (actor, action, input) => `select public.multideck_finance_opening_balances(
      '${id(actor)}','${id(3)}','${action}','${JSON.stringify(input)}'::jsonb);`
    const staged = JSON.parse(sql(callOpening(1, 'stage', stagedInput)))
    assert.equal(staged.status, 'staged')
    assert.equal(JSON.parse(sql(callOpening(4, 'approve', { id: staged.id }))).status, 'approved')
    const posted = JSON.parse(sql(callOpening(4, 'post', { id: staged.id })))
    assert.equal(posted.status, 'posted')
    assert.equal(sql(`select count(*) from public."FIN_IndirectTaxEvidence" e
      join public."FIN_Documents" d on d."FINDoc_ID"=e.source_document_id
      where d."FINDoc_OpeningBalancePackageID"='${staged.id}'`), '0')
    assert.equal(sql(`select count(*) from public."FIN_Documents" d
      where d."FINDoc_OpeningBalancePackageID"='${staged.id}' and d."FINDoc_NativePostingStatusCode"='posted'`), '2')
    const inventory = JSON.parse(sql(`select public.multideck_uk_vat_accounting_period_inventory(
      '${id(4)}','${id(3)}',(select "FINPostBatch_PeriodID" from public."FIN_PostingBatches"
        where "FINPostBatch_ID"='${posted.posting_batch_id}'));`))
    assert.equal(inventory.status, 'ready_for_review')
    assert.equal(inventory.openingExcludedLines, 1)
    assert.equal(inventory.missingDocumentSources, 0)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'),
      ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
