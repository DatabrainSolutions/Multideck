import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const root = new URL('../', import.meta.url)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

test('statement import, bank ledger control, sign-off and entity access use posted evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finance-bank-statement-'))
  const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
  const boundary = baseline.indexOf(marker)
  assert.ok(boundary > 0)
  let started = false
  const run = (command, arguments_, input, succeeds = true) => {
    const result = spawnSync(join(bin, command), arguments_, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    if (succeeds) assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    else assert.notEqual(result.status, 0, `${command} unexpectedly succeeded`)
    return result
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input).stdout.trim()
  const reject = (input, pattern) => assert.match(run('psql', args, input, false).stderr, pattern)
  const importCommand = (hash = 'a'.repeat(64)) => `select public.multideck_bank_statement_import('${id(1)}','${id(3)}','${id(10)}','september.csv','${hash}',
    '{"openingBalance":"100.0000","closingBalance":"115.0000","dateFrom":"2026-09-01","dateTo":"2026-09-30","rows":[{"lineNo":1,"date":"2026-09-10","reference":"R1","description":"Receipt","amount":"20.0000","balance":"120.0000"},{"lineNo":2,"date":"2026-09-20","reference":"P1","description":"Payment","amount":"-5.0000","balance":"115.0000"}]}'::jsonb);`
  const control = (entity = 3) => `select public.multideck_bank_statement_control('${id(1)}','${id(entity)}','${id(12)}','${id(10)}');`
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin; create role supabase_functions_admin;
      create role pgsodium_keyholder; create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions; create extension pgcrypto with schema extensions; create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table auth.users(id uuid primary key);`)
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', new URL('migrations/20260918123733_general_ledger_journals.sql', root).pathname])
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    for (const name of ['20260925071153_opening_balance_gl_cutover.sql', '20260925075621_opening_source_items_and_operational_markers.sql', '20260925080000_bank_statement_reconciliation.sql', '20260925085000_finance_opening_mirror_delivery.sql', '20260925090000_finance_provider_period_reconciliation.sql', '20260925100000_finance_reconciliation_dexter.sql', '20260925103000_finance_approval_policies.sql', '20260925104000_bank_statement_automatic_matching.sql']) {
      run('psql', [...args, '-f', new URL(`migrations/${name}`, root).pathname])
    }
    sql(`create table finance_test_permissions(actor uuid, permission text);
      create or replace function public._multideck_dexter_has_permission(p_user_id uuid,p_permission text)
      returns boolean language sql stable as $$ select exists(select 1 from finance_test_permissions where actor=p_user_id and permission=p_permission) $$;
      insert into public."cmp_Company"("Company_ID","Company_Name") values('${id(2)}','Test tenant'),('${id(4)}','Other tenant');
      insert into public."cmp_Users"("User_ID","Company_ID","User_Email") values('${id(1)}','${id(2)}','finance@example.test'),('${id(7)}','${id(2)}','colleague@example.test'),('${id(5)}','${id(4)}','other@example.test');
      insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_Name","LegalEntity_BaseCurrencyCodeSnapshot") values
        ('${id(3)}','${id(2)}','Test Freight','GBP'),('${id(6)}','${id(4)}','Other Freight','GBP');
      insert into finance_test_permissions values('${id(1)}','Finance.Banks.Manage'),('${id(1)}','Finance.Management.View'),('${id(1)}','Finance.Management.Post'),('${id(1)}','Finance.Integration.Manage'),('${id(1)}','Finance.Configuration.Manage'),('${id(7)}','Finance.Management.View'),('${id(5)}','Finance.Banks.Manage');
      insert into public."sys_AccountingProviders"("ACCP_Code","ACCP_Name","ACCP_DefaultAuthType") values('erpnext','ERPNext','api_token');
      insert into public."sys_AccountingConnectionStatuses"("ACCCS_Code","ACCCS_Name") values('active','Active');
      insert into public."sys_FinancePeriodStatuses"("FINPERST_Code","FINPERST_Name") values('open','Open');
      insert into public."sys_FinancePostingStatuses"("FINPOSTST_Code","FINPOSTST_Name") values('draft','Draft'),('posted','Posted');
      insert into public."sys_FinanceCashStatuses"("FINCASHST_Code","FINCASHST_Name") values('approved','Approved');
      insert into public."sys_FinanceCashTypes"("FINCASHT_Code","FINCASHT_Name") values('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment');
      insert into public."sys_AuditActorTypes"("AuditActorType_Code","AuditActorType_Name") values('user','User');
      insert into public."sys_AuditEventTypes"("AuditEventType_Code","AuditEventType_Name") values('finance_lifecycle','Finance lifecycle');
      insert into public."sys_AuditOutcomeStatuses"("AuditOutcomeStatus_Code","AuditOutcomeStatus_Name") values('success','Success');
      insert into public."sys_AuditRetentionClasses"("AuditRetentionClass_Code","AuditRetentionClass_Name") values('standard_7y','Standard');
      insert into public."sys_AuditSensitivityLevels"("AuditSensitivity_Code","AuditSensitivity_Name") values('normal','Normal');
      insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name") values('bank_statement','Bank statement'),('bank_match','Bank match');
      insert into public."sys_CommLinkTypes"("CommLinkType_Code","CommLinkType_Name") values('dexter_watch','Dexter watch');
      insert into public."sys_CommPriorities"("CommPriority_Code","CommPriority_Name") values('normal','Normal');
      insert into public."sys_CommNotificationStatuses"("CommNotificationStatus_Code","CommNotificationStatus_Name") values('unread','Unread');
      insert into public."ACCI_Connections"("ACCIC_ID","ACCIC_ProviderCode","ACCIC_Name","ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_AuthType","ACCIC_ExternalTenantName","ACCIC_ExternalBaseCurrencyCode") values
        ('${id(70)}','erpnext','ERPNext test','active','${id(3)}','api_token','Example Freight','GBP');
      insert into public."FIN_NominalAccounts"("FINNom_ID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_LegalEntityID") values
        ('${id(20)}','1100','Main bank','Bank','${id(3)}'),('${id(21)}','3000','Counter account','Equity','${id(3)}');
      insert into public."FIN_BankAccounts"("FINBank_ID","FINBank_Code","FINBank_Name","FINBank_LegalEntityID","FINBank_CurrencyCode","FINBank_NominalAccountID") values
        ('${id(10)}','MAIN','Main account','${id(3)}','GBP','${id(20)}');
      insert into public."FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_BaseCurrencyCode") values
        ('${id(11)}','${id(3)}','202608','August','2026-08-01','2026-08-31','GBP'),
        ('${id(12)}','${id(3)}','202609','September','2026-09-01','2026-09-30','GBP');
      insert into public."FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode","FINCash_BankAccountID","FINCash_TransactionDate","FINCash_AccountingDate","FINCash_CurrencyCodeSnapshot","FINCash_Amount","FINCash_LocalAmount","FINCash_LegalEntityID","FINCash_NativePostingStatusCode") values
        ('${id(31)}','customer_receipt','approved','${id(10)}','2026-09-10','2026-09-10','GBP',20,20,'${id(3)}','posted'),
        ('${id(32)}','supplier_payment','approved','${id(10)}','2026-09-20','2026-09-20','GBP',5,5,'${id(3)}','posted');
      begin;
      insert into public."FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal") values
        ('${id(40)}','posted','FIN_OpeningBalancePackages','${id(50)}','${id(12)}','${id(3)}',100,100),
        ('${id(41)}','posted','FIN_CashTransactions','${id(31)}','${id(12)}','${id(3)}',20,20),
        ('${id(42)}','posted','FIN_CashTransactions','${id(32)}','${id(12)}','${id(3)}',5,5);
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_CashID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(40)}',1,'${id(20)}',null,100,0),
        ('${id(40)}',2,'${id(21)}',null,0,100),
        ('${id(41)}',1,'${id(20)}','${id(31)}',20,0),
        ('${id(41)}',2,'${id(21)}','${id(31)}',0,20),
        ('${id(42)}',1,'${id(20)}','${id(32)}',0,5),
        ('${id(42)}',2,'${id(21)}','${id(32)}',5,0);
      commit;
      insert into public."FIN_OpeningBalancePackages"(id,legal_entity_id,source_system,source_file_name,source_sha256,closing_date,opening_date,base_currency,evidence,debit_total,credit_total,status,staged_by,posted_by,posting_batch_id)
        values('${id(50)}','${id(3)}','CargoWise','trial-balance.csv','${'b'.repeat(64)}','2026-08-31','2026-09-01','GBP','{}',100,100,'posted','${id(1)}','${id(1)}','${id(40)}');`)
    sql(`insert into public."AI_DexterWatches"("AIDexterWatch_ID","AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON","AIDexterWatch_StatusCode") values
      ('${id(80)}','${id(2)}','${id(1)}','bank_reconciliation','Bank status','Bank status','Watch this bank','${id(10)}','{"field":"status","operator":"changed"}','paused'),
      ('${id(81)}','${id(2)}','${id(1)}','provider_reconciliation','Provider status','Provider status','Watch this provider','${id(70)}','{"field":"status","operator":"changed"}','active');`)
    reject(`set role authenticated; ${importCommand()}`, /permission denied/)
    reject(`select public.multideck_bank_statement_import('${id(5)}','${id(3)}','${id(10)}','september.csv','${'a'.repeat(64)}','{}'::jsonb);`, /access/)
    assert.equal(JSON.parse(sql(control())).status, 'incomplete')
    const openingPayload = { id: id(50), siteOrigin: 'https://erpnext.example.test', company: 'Example Freight', currency: 'GBP', date: '2026-09-01', sourceSha256: 'b'.repeat(64),
      description: 'CargoWise opening', lines: [{ account: 'Bank', nominalCode: '1100', expectedRootType: 'Asset', debit: '100', credit: '0' }, { account: 'Equity', nominalCode: '3000', expectedRootType: 'Equity', debit: '0', credit: '100' }] }
    const openingRpc = (name, arguments_) => `select public.${name}(${arguments_});`
    const enqueue = openingRpc('multideck_finance_opening_mirror_enqueue', `'${id(1)}','${id(3)}','${id(50)}','${id(70)}'`)
    assert.equal(JSON.parse(sql(enqueue)).status, 'queued')
    assert.equal(JSON.parse(sql(enqueue)).status, 'queued')
    reject(`set role authenticated; ${enqueue}`, /permission denied/)
    const claim = () => openingRpc('multideck_finance_opening_mirror_claim', `'${id(1)}','${id(3)}','${id(50)}','${JSON.stringify(openingPayload)}'::jsonb`)
    const firstClaim = JSON.parse(sql(claim()))
    assert.equal(firstClaim.status, 'leased')
    reject(claim(), /already in progress/)
    const finish = (token, status, hash = null) => openingRpc('multideck_finance_opening_mirror_finish', `'${id(1)}','${id(3)}','${id(50)}','${token}','${status}','ERP-OPEN-001',${hash ? `'${hash}'` : 'null'},${status === 'failed' ? "'Provider temporarily unavailable'" : 'null'}`)
    assert.equal(JSON.parse(sql(finish(firstClaim.token, 'failed'))).status, 'failed')
    const retry = JSON.parse(sql(claim()))
    assert.equal(retry.externalId, 'ERP-OPEN-001')
    assert.deepEqual(retry.payload, openingPayload)
    reject(openingRpc('multideck_finance_opening_mirror_claim', `'${id(1)}','${id(3)}','${id(50)}','${JSON.stringify({ ...openingPayload, currency: 'EUR' })}'::jsonb`), /frozen opening journal|source identity/)
    assert.equal(JSON.parse(sql(finish(retry.token, 'matched', 'c'.repeat(64)))).status, 'matched')
    assert.equal(JSON.parse(sql(claim())).status, 'matched')
    assert.equal(JSON.parse(sql(importCommand())).duplicate, false)
    assert.equal(JSON.parse(sql(importCommand())).duplicate, true)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='bank_reconciliation';`), '0')
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"='${id(80)}';`)
    assert.equal(JSON.parse(sql(control())).status, 'incomplete')
    const line = n => sql(`select "FINStmtLine_ID" from public."FIN_StatementLines" where "FINStmtLine_LineNo"=${n}`)
    const importedId = sql(`select "FINStmtImp_ID" from public."FIN_StatementImports" where "FINStmtImp_FileHashSHA256"='${'a'.repeat(64)}';`)
    const autoMatch = () => JSON.parse(sql(`select public.multideck_bank_statement_auto_match('${id(1)}','${id(3)}','${importedId}');`))
    reject(`set role authenticated; select public.multideck_bank_statement_auto_match('${id(1)}','${id(3)}','${importedId}');`, /permission denied/)
    reject(`select public.multideck_bank_statement_auto_match('${id(5)}','${id(3)}','${importedId}');`, /access/)
    reject(`select public.multideck_bank_statement_auto_match('${id(7)}','${id(3)}','${importedId}');`, /access/)
    assert.equal(autoMatch().matched, 0)
    assert.equal(autoMatch().requiresReview, 2)
    sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','bank_match','automatic',100,0,'Automate exact bank matches');`)
    const ambiguous = JSON.parse(sql(`begin;
      insert into public."FIN_StatementLines"("FINStmtLine_ImportID","FINStmtLine_LineNo","FINStmtLine_TransactionDate","FINStmtLine_Reference","FINStmtLine_CurrencyCodeSnapshot","FINStmtLine_Amount")
        values('${importedId}',3,'2026-09-10','Duplicate receipt','GBP',20);
      select public.multideck_bank_statement_auto_match('${id(1)}','${id(3)}','${importedId}');
      rollback;`))
    assert.equal(ambiguous.matched, 1)
    assert.equal(ambiguous.requiresReview, 2)
    assert.ok(ambiguous.exceptions.every(item => item.reason === 'ambiguous_statement_lines'))
    assert.equal(sql(`select count(*) from public."FIN_BankMatches";`), '0')
    const importWithAuto = JSON.parse(sql(importCommand().replace('multideck_bank_statement_import(', 'multideck_bank_statement_import_with_auto(')))
    assert.equal(importWithAuto.duplicate, true)
    assert.equal(importWithAuto.automaticMatching.matched, 2)
    assert.equal(importWithAuto.automaticMatching.requiresReview, 0)
    assert.equal(autoMatch().matched, 0)
    assert.equal(sql(`select count(*) from public."FIN_BankMatches" where "FINBankMatch_MatchTypeCode"='automatic';`), '2')
    assert.equal(sql(`select count(*) from public."Audit_Events" where "AuditEvent_Action"='auto_match' and "AuditEvent_LegalEntityID"='${id(3)}';`), '2')
    assert.equal(sql(`select "FINStmtImp_StatusCode" from public."FIN_StatementImports" where "FINStmtImp_ID"='${importedId}';`), 'matched')
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='bank_reconciliation';`), '1')
    assert.equal(sql(`select "AIDexterWatchSignal_NewJSON"->>'status' from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='bank_reconciliation';`), 'matched')
    const dexterBank = JSON.parse(sql(`select public.multideck_dexter_domain_bank_reconciliation('${id(2)}','',10);`))
    assert.equal(dexterBank[0].automaticMatches, 2)
    assert.equal(dexterBank[0].reviewRows, 0)
    assert.deepEqual(JSON.parse(sql(`select public.multideck_dexter_domain_bank_reconciliation('${id(4)}','',10);`)), [])
    assert.equal(JSON.parse(sql(`select public.multideck_bank_statement_control('${id(7)}','${id(3)}','${id(12)}','${id(10)}');`)).status, 'ready_for_review')
    sql(`select public.multideck_bank_statement_unmatch('${id(1)}','${id(3)}','${line(1)}','Correct match evidence');`)
    assert.equal(sql(`select "FINStmtImp_StatusCode" from public."FIN_StatementImports" where "FINStmtImp_ID"='${importedId}';`), 'imported')
    sql(`select public.multideck_bank_statement_match('${id(1)}','${id(3)}','${line(1)}','${id(31)}','Exact posted receipt');`)
    assert.equal(sql(`select "FINStmtImp_StatusCode" from public."FIN_StatementImports" where "FINStmtImp_ID"='${importedId}';`), 'matched')
    assert.equal(JSON.parse(sql(control())).status, 'ready_for_review')
    reject(control(6), /access|not found/)
    assert.equal(JSON.parse(sql(`select public.multideck_bank_statement_verify('${id(1)}','${id(3)}','${id(12)}','${id(10)}','Statement matches posted ledger');`)).status, 'verified')
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='bank_reconciliation';`), '1', sql(`select "AIDexterWatch_LastHealthError" from public."AI_DexterWatches" where "AIDexterWatch_ID"='${id(80)}';`))
    assert.equal(JSON.parse(sql(control())).status, 'verified')
    reject(`select public.multideck_bank_statement_unmatch('${id(1)}','${id(3)}','${line(1)}','Remove this match');`, /already verified/)
    sql(`begin;
      insert into public."FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal") values('${id(43)}','posted','${id(12)}','${id(3)}',1,1);
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(43)}',1,'${id(20)}',1,0),('${id(43)}',2,'${id(21)}',0,1); commit;`)
    assert.equal(JSON.parse(sql(control())).status, 'incomplete')
    sql(`with snapshot as (select public.multideck_finance_period_local_snapshot('${id(1)}','${id(3)}','${id(12)}','${id(70)}') as value)
      insert into public."ACCI_PeriodReconciliationRuns"(legal_entity_id,period_id,connection_id,provider_code,provider_company,currency,period_start,period_end,source_cutoff,provider_checkpoint,mapping_revision,status,local_hash,provider_hash,evidence,comparison,requested_by)
      select '${id(3)}','${id(12)}','${id(70)}','erpnext','Example Freight','GBP','2026-09-01','2026-09-30',now(),'fixture','fixture','verified',repeat('d',64),repeat('e',64),jsonb_build_object('rawLocal',value),'{"differences":[],"issues":[]}'::jsonb,'${id(1)}' from snapshot;`)
    const providerStatus = `select public.multideck_finance_provider_period_status('${id(1)}','${id(3)}','${id(12)}','${id(70)}');`
    assert.equal(JSON.parse(sql(providerStatus)).status, 'verified')
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='provider_reconciliation';`), '1')
    sql(`delete from finance_test_permissions where actor='${id(1)}' and permission='Finance.Management.View';`)
    assert.equal(JSON.parse(sql(importCommand('f'.repeat(64)))).duplicate, false)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='bank_reconciliation';`), '1')
    sql(`insert into finance_test_permissions values('${id(1)}','Finance.Management.View');
      update public."FIN_BankAccounts" set "FINBank_IsActive"=false where "FINBank_ID"='${id(10)}';`)
    assert.equal(JSON.parse(sql(providerStatus)).status, 'incomplete')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
