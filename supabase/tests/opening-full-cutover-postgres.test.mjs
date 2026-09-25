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
    item(4, 'supplier_payment', 'AP', 21, 20),
    { ...item(5, 'customer_invoice', 'AR', 20, 120), currency: 'EUR', originalBaseAmount: '110', outstandingBaseAmount: '100' },
    { ...item(6, 'customer_credit', 'AR', 20, 120), currency: 'EUR', originalBaseAmount: '110', outstandingBaseAmount: '100' },
    { ...item(7, 'supplier_invoice', 'AP', 21, 120), currency: 'EUR', originalBaseAmount: '110', outstandingBaseAmount: '100' },
    { ...item(8, 'supplier_credit', 'AP', 21, 120), currency: 'EUR', originalBaseAmount: '110', outstandingBaseAmount: '100' }]
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
        ('${id(43)}','${id(3)}','EQUITY','Equity','Equity','equity',false),
        ('${id(44)}','${id(3)}','1100','Default AR','Receivable','asset',true),
        ('${id(45)}','${id(3)}','7000','Realised FX','Income Account','finance',false),
        ('${id(46)}','${id(3)}','2000','Default AP','Payable','liability',true);
      insert into public."FIN_BankAccounts"("FINBank_ID","FINBank_Code","FINBank_Name",
        "FINBank_LegalEntityID","FINBank_CurrencyCode","FINBank_NominalAccountID")
        values('${id(70)}','EUR-BANK','EUR bank','${id(3)}','EUR','${id(42)}');
      insert into public."sys_AuditActorTypes"("AuditActorType_Code","AuditActorType_Name") values('user','User');
      insert into public."sys_AuditEventTypes"("AuditEventType_Code","AuditEventType_Name") values('finance_lifecycle','Finance lifecycle');
      insert into public."sys_AuditOutcomeStatuses"("AuditOutcomeStatus_Code","AuditOutcomeStatus_Name") values('success','Success');
      insert into public."sys_AuditRetentionClasses"("AuditRetentionClass_Code","AuditRetentionClass_Name")
        values('standard_7y','Standard seven years');
      insert into public."sys_AuditSensitivityLevels"("AuditSensitivity_Code","AuditSensitivity_Name")
        values('normal','Normal');
      insert into public."sys_FinancePeriodStatuses"("FINPERST_Code","FINPERST_Name") values
        ('open','Open'),('soft_closed','Soft closed');
      insert into public."sys_FinancePostingStatuses"("FINPOSTST_Code","FINPOSTST_Name") values
        ('posted','Posted'),('draft','Draft');
      insert into public."sys_FinanceDocumentStatuses"("FINDST_Code","FINDST_Name") values('approved','Approved');
      insert into public."sys_FinanceDocumentTypes"("FINDT_Code","FINDT_Name") values
        ('sl_invoice','Sales invoice'),('pl_invoice','Purchase invoice'),('credit_note','Credit note'),('debit_note','Debit note');
      insert into public."sys_FinanceCashStatuses"("FINCASHST_Code","FINCASHST_Name") values('approved','Approved');
      insert into public."sys_FinanceCashTypes"("FINCASHT_Code","FINCASHT_Name") values
        ('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment');
      insert into public."sys_FinanceAllocationStatuses"("FINALLOCST_Code","FINALLOCST_Name")
        values('allocated','Allocated');
      insert into public."sys_FinanceFXGainLossTypes"("FINFXGLT_Code","FINFXGLT_Name")
        values('realised_gain','Realised gain'),('realised_loss','Realised loss');
      insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name")
        values('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment') on conflict do nothing;
      insert into public."sys_AccountingProviders"("ACCP_Code","ACCP_Name","ACCP_DefaultAuthType")
        values('erpnext','ERPNext','api_key');
      insert into public."sys_AccountingConnectionStatuses"("ACCCS_Code","ACCCS_Name") values
        ('active','Active'),('draft','Draft');`)
    reject(call(5, 'stage', stage(items)), /do not have access/)
    reject(call(1, 'stage', stage(items, [
      { sourceRow: 1, accountCode: 'AR', debit: '99', credit: '0' },
      { sourceRow: 2, accountCode: 'BANK', debit: '51', credit: '0' },
      { sourceRow: 3, accountCode: 'AP', debit: '0', credit: '30' },
      { sourceRow: 4, accountCode: 'EQUITY', debit: '0', credit: '120' },
    ])), /do not reconcile/)
    const staged = JSON.parse(sql(call(1, 'stage', stage(items))))
    assert.equal(staged.status, 'staged')
    assert.equal(staged.reconciliation.openItems, 8)
    reject(call(1, 'approve', { id: staged.id }), /second finance operator/)
    const policy = (workflow, maxAmount) => `select public.multideck_finance_save_approval_policy(
      '${id(2)}','${id(1)}','${id(3)}','${workflow}','automatic',${maxAmount},20,
      'Explicit operator action within reviewed exposure');`
    assert.equal(JSON.parse(sql(policy('opening_balance', 100))).mode, 'automatic')
    reject(call(1, 'approve', { id: staged.id }), /second finance operator/)
    assert.equal(JSON.parse(sql(policy('opening_balance', 200))).mode, 'automatic')
    assert.equal(JSON.parse(sql(call(1, 'approve', { id: staged.id }))).status, 'approved')
    sql(`insert into public."ACCI_Connections"("ACCIC_ID","ACCIC_ProviderCode","ACCIC_Name",
      "ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_AuthType","ACCIC_ExternalBaseCurrencyCode")
      values('${id(80)}','erpnext','Linked books','active','${id(3)}','api_key','GBP');`)
    reject(call(1, 'post', { id: staged.id }), /blocked for a linked accounts system/)
    assert.equal(sql(`select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"='${id(3)}';`), '0')
    sql(`update public."ACCI_Connections" set "ACCIC_StatusCode"='draft' where "ACCIC_ID"='${id(80)}';`)
    const posted = JSON.parse(sql(call(1, 'post', { id: staged.id })))
    assert.equal(posted.status, 'posted')
    assert.equal(sql(`select count(*) from public."Audit_Events" where "AuditEvent_RecordID"='${staged.id}'
      and "AuditEvent_Action"='same_operator_policy_waiver';`), '2')
    assert.equal(sql(`select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"='${id(3)}';`), '1')
    assert.equal(sql(`select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"='${posted.posting_batch_id}';`), '4')
    assert.equal(sql(`select count(*) from public."FIN_Documents" where "FINDoc_OpeningBalancePackageID"='${staged.id}'
      and "FINDoc_NativePostingBatchID"='${posted.posting_batch_id}';`), '6')
    assert.equal(sql(`select count(*) from public."FIN_CashTransactions" where "FINCash_OpeningBalancePackageID"='${staged.id}'
      and "FINCash_NativePostingBatchID"='${posted.posting_batch_id}';`), '2')
    const invoice = sql(`select operational_document_id from public."FIN_OpeningSourceItems"
      where package_id='${staged.id}' and source_id='CW-5';`)
    const supplierInvoice = sql(`select operational_document_id from public."FIN_OpeningSourceItems"
      where package_id='${staged.id}' and source_id='CW-7';`)
    sql(`insert into public."FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode",
      "FINCash_Number","FINCash_BankAccountID","FINCash_PartyOrgID","FINCash_TransactionDate",
      "FINCash_AccountingDate","FINCash_CurrencyCodeSnapshot","FINCash_ExchangeRate",
      "FINCash_Amount","FINCash_LocalAmount","FINCash_UnallocatedAmount","FINCash_LocalUnallocatedAmount",
      "FINCash_CreatedBy","FINCash_UpdatedBy","FINCash_LegalEntityID") values
      ('${id(90)}','customer_receipt','approved','EUR-RECEIPT-1','${id(70)}','${id(20)}',
        '2026-09-15','2026-09-15','EUR',0.9,120,108,0,0,'${id(1)}','${id(1)}','${id(3)}');
      insert into public."FIN_CashAllocations"("FINCashAlloc_ID","FINCashAlloc_CashID",
        "FINCashAlloc_DocumentID","FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount",
        "FINCashAlloc_LocalAllocatedAmount","FINCashAlloc_AllocatedBy") values
        ('${id(91)}','${id(90)}','${invoice}','allocated',120,100,'${id(1)}');
      update public."FIN_Documents" set "FINDoc_OutstandingAmount"=0,
        "FINDoc_LocalOutstandingAmount"=0 where "FINDoc_ID"='${invoice}';
      insert into public."FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode",
        "FINCash_Number","FINCash_BankAccountID","FINCash_PartyOrgID","FINCash_TransactionDate",
        "FINCash_AccountingDate","FINCash_CurrencyCodeSnapshot","FINCash_ExchangeRate",
        "FINCash_Amount","FINCash_LocalAmount","FINCash_UnallocatedAmount","FINCash_LocalUnallocatedAmount",
        "FINCash_CreatedBy","FINCash_UpdatedBy","FINCash_LegalEntityID") values
        ('${id(92)}','supplier_payment','approved','EUR-PAYMENT-1','${id(70)}','${id(21)}',
          '2026-09-16','2026-09-16','EUR',0.9,120,108,0,0,'${id(1)}','${id(1)}','${id(3)}');
      insert into public."FIN_CashAllocations"("FINCashAlloc_ID","FINCashAlloc_CashID",
        "FINCashAlloc_DocumentID","FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount",
        "FINCashAlloc_LocalAllocatedAmount","FINCashAlloc_AllocatedBy") values
        ('${id(93)}','${id(92)}','${supplierInvoice}','allocated',120,100,'${id(1)}');
      update public."FIN_Documents" set "FINDoc_OutstandingAmount"=0,
        "FINDoc_LocalOutstandingAmount"=0 where "FINDoc_ID"='${supplierInvoice}';`)
    const cashPosted = JSON.parse(sql(`select public._multideck_finance_post_cash_native('${id(90)}','${id(1)}');`))
    assert.equal(cashPosted.status, 'posted')
    assert.equal(sql(`select "FINPostLine_NominalAccountID" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${cashPosted.postingBatchId}' and "FINPostLine_LineNo"=2;`), id(44),
      'normal cash posts to the default AR control before reviewed reclassification')
    const supplierCashPosted = JSON.parse(sql(`select public._multideck_finance_post_cash_native('${id(92)}','${id(1)}');`))
    assert.equal(supplierCashPosted.status, 'posted')
    assert.equal(sql(`select "FINPostLine_NominalAccountID" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${supplierCashPosted.postingBatchId}' and "FINPostLine_LineNo"=2;`), id(46))
    const cashPeriod = sql(`select "FINCash_PeriodID" from public."FIN_CashTransactions" where "FINCash_ID"='${id(90)}';`)
    const beforeSettlement = JSON.parse(sql(`select public.multideck_finance_trade_control_bridge(
      '${id(4)}','${id(3)}','${cashPeriod}');`))
    assert.equal(beforeSettlement.status, 'unreconciled')
    assert.ok(beforeSettlement.issues.some(issue => issue.reason === 'opening_allocation_fx_trueup_required'))
    const fxInput = { allocationId: id(91), fxNominalId: id(45), reason: 'Reviewed CargoWise EUR receipt and bank rate' }
    const fxCall = (actor, action, input) => `select public.multideck_finance_opening_fx_settlement(
      '${id(actor)}','${id(3)}','${action}','${JSON.stringify(input)}'::jsonb);`
    const worklist = JSON.parse(sql(fxCall(4, 'read', { packageId: staged.id, offset: 0 })))
    assert.equal(worklist.total, 2)
    assert.equal(worklist.rows.length, 2)
    assert.ok(worklist.rows.some(row => row.cashReference === 'EUR-RECEIPT-1'
      && row.sourceReference === 'CW-DOC-5' && row.cashControlCode === '1100' && row.sourceControlCode === 'AR'))
    assert.equal(JSON.parse(sql(fxCall(4, 'read', { packageId: staged.id, offset: 1 }))).rows.length, 1)
    const proposedFx = JSON.parse(sql(fxCall(1, 'propose', fxInput)))
    assert.equal(proposedFx.gain_loss_amount, 8)
    assert.equal(proposedFx.cash_control_nominal_id, id(44))
    assert.equal(proposedFx.source_control_nominal_id, id(40))
    const supplierFx = JSON.parse(sql(fxCall(1, 'propose', {
      allocationId: id(93), fxNominalId: id(45), reason: 'Reviewed CargoWise EUR supplier payment and bank rate' })))
    assert.equal(supplierFx.gain_loss_amount, -8)
    assert.equal(supplierFx.cash_control_nominal_id, id(46))
    assert.equal(supplierFx.source_control_nominal_id, id(41))
    reject(fxCall(1, 'post', { id: proposedFx.id }), /second finance operator/)
    assert.equal(JSON.parse(sql(policy('opening_fx', 100))).mode, 'automatic')
    reject(fxCall(1, 'post', { id: supplierFx.id }), /second finance operator/)
    assert.equal(JSON.parse(sql(policy('opening_fx', 200))).mode, 'automatic')
    const supplierPosted = JSON.parse(sql(fxCall(1, 'post', { id: supplierFx.id })))
    assert.equal(supplierPosted.status, 'posted')
    assert.equal(sql(`select count(*) from public."Audit_Events" where "AuditEvent_RecordID"='${supplierFx.id}'
      and "AuditEvent_Action"='same_operator_policy_waiver';`), '1')
    sql(`update public."FIN_Periods" set "FINPeriod_StatusCode"='soft_closed' where "FINPeriod_ID"='${cashPeriod}';`)
    reject(fxCall(1, 'post', { id: proposedFx.id, correctionDate: '2026-10-01' }), /second finance operator/)
    reject(fxCall(4, 'post', { id: proposedFx.id }), /dated correction after the closed cash period/)
    const fxPosted = JSON.parse(sql(fxCall(4, 'post', { id: proposedFx.id, correctionDate: '2026-10-01' })))
    assert.equal(fxPosted.status, 'posted')
    assert.equal(fxPosted.correction_date, '2026-10-01')
    assert.equal(sql(`select p."FINPeriod_Code" from public."FIN_PostingBatches" b
      join public."FIN_Periods" p on p."FINPeriod_ID"=b."FINPostBatch_PeriodID"
      where b."FINPostBatch_ID"='${fxPosted.posting_batch_id}';`), '202610')
    assert.equal(sql(`select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"='${fxPosted.posting_batch_id}';`), '3')
    assert.equal(sql(`select "FINPostLine_DebitAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${fxPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(44)}';`), '108.0000')
    assert.equal(sql(`select "FINPostLine_CreditAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${fxPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(40)}';`), '100.0000')
    assert.equal(sql(`select "FINPostLine_CreditAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${fxPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(45)}';`), '8.0000')
    assert.equal(sql(`select count(*) from public."FIN_FXGainLossEvents" where "FINFXEvent_CashAllocationID"='${id(91)}';`), '1')
    assert.equal(sql(`select "FINPostLine_CreditAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${supplierPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(46)}';`), '108.0000')
    assert.equal(sql(`select "FINPostLine_DebitAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${supplierPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(41)}';`), '100.0000')
    assert.equal(sql(`select "FINPostLine_DebitAmount" from public."FIN_PostingLines"
      where "FINPostLine_BatchID"='${supplierPosted.posting_batch_id}' and "FINPostLine_NominalAccountID"='${id(45)}';`), '8.0000')
    const correctionPeriod = sql(`select "FINPostBatch_PeriodID" from public."FIN_PostingBatches"
      where "FINPostBatch_ID"='${fxPosted.posting_batch_id}';`)
    const afterSettlement = JSON.parse(sql(`select public.multideck_finance_trade_control_bridge(
      '${id(4)}','${id(3)}','${correctionPeriod}');`))
    assert.equal(afterSettlement.status, 'verified', JSON.stringify(afterSettlement.issues))
    const settledWorklist = JSON.parse(sql(fxCall(4, 'read', { packageId: staged.id })))
    assert.equal(settledWorklist.rows.filter(row => row.settlement?.status === 'posted').length, 2)
    reject(fxCall(4, 'post', { id: proposedFx.id }), /not found/)
    reject(`update public."FIN_PostingLines" set "FINPostLine_CreditAmount"=1
      where "FINPostLine_BatchID"='${fxPosted.posting_batch_id}' and "FINPostLine_LineNo"=3;`, /immutable/)
    reject(`delete from public."FIN_CashAllocations" where "FINCashAlloc_ID"='${id(91)}';`, /cannot be deleted/)
    reject(call(4, 'post', { id: staged.id }), /stages in order/)
    reject(`update public."FIN_OpeningSourceItems" set original_amount=1 where package_id='${staged.id}';`, /immutable/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
