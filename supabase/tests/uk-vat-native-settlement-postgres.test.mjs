import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(new URL('../migrations/20260925160000_uk_vat_native_settlement.sql', import.meta.url), 'utf8')
const bridgeMigration = readFileSync(new URL('../migrations/20260925163000_uk_vat_cash_settlement_bridge.sql', import.meta.url), 'utf8')
const pgBin = process.env.PG_TEST_BIN ?? '/opt/homebrew/opt/postgresql@17/bin'
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('accepted HMRC return settles once through reviewed VAT and bank postings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-vat-settlement-'))
  let started = false
  const run = (name, args, input, expected = 0) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, expected, result.stderr)
    return expected === 0 ? result.stdout.trim() : result.stderr
  }
  const sql = input => run('psql', ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
  const rejection = input => run('psql', ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input, 3)
  const action = (actor, kind, review = null, statement = id(20)) => JSON.parse(sql(`select public.multideck_uk_vat_settlement('${id(actor)}','${id(2)}','${kind}','${id(5)}','${statement}',${review ? `'${review}'` : 'null'},'Reviewed against accepted HMRC return')`))
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table public."cmp_LegalEntities" ("LegalEntity_ID" uuid primary key);
      create table public."cmp_Users" ("User_ID" uuid primary key);
      create table public."FIN_Periods" ("FINPeriod_ID" uuid primary key,"FINPeriod_LegalEntityID" uuid,"FINPeriod_StartDate" date,"FINPeriod_EndDate" date,"FINPeriod_StatusCode" text,"FINPeriod_BaseCurrencyCode" text);
      create table public."FIN_NominalAccounts" ("FINNom_ID" uuid primary key,"FINNom_LegalEntityID" uuid,"FINNom_IsActive" boolean,"FINNom_Code" text,"FINNom_ControlTypeCode" text);
      create table public."FIN_BankAccounts" ("FINBank_ID" uuid primary key,"FINBank_LegalEntityID" uuid,"FINBank_IsActive" boolean,"FINBank_CurrencyCode" text,"FINBank_NominalAccountID" uuid);
      create table public."FIN_PostingBatches" ("FINPostBatch_ID" uuid primary key default gen_random_uuid(),"FINPostBatch_Number" text,"FINPostBatch_StatusCode" text,"FINPostBatch_SourceTable" text,"FINPostBatch_SourceID" uuid,"FINPostBatch_PeriodID" uuid,"FINPostBatch_LegalEntityID" uuid,"FINPostBatch_DebitTotal" numeric,"FINPostBatch_CreditTotal" numeric,"FINPostBatch_CurrencyCodeSnapshot" text,"FINPostBatch_CreatedBy" uuid,"FINPostBatch_PostedBy" uuid,"FINPostBatch_PostedAt" timestamptz);
      create table public."FIN_PostingLines" ("FINPostLine_ID" uuid primary key default gen_random_uuid(),"FINPostLine_BatchID" uuid,"FINPostLine_LineNo" integer,"FINPostLine_NominalAccountID" uuid,"FINPostLine_Description" text,"FINPostLine_DebitAmount" numeric,"FINPostLine_CreditAmount" numeric,"FINPostLine_CurrencyCodeSnapshot" text,"FINPostLine_CashID" uuid);
      create table public."FIN_StatementImports" ("FINStmtImp_ID" uuid primary key,"FINStmtImp_BankAccountID" uuid,"FINStmtImp_FileHashSHA256" text,"FINStmtImp_StatementDateFrom" date,"FINStmtImp_StatementDateTo" date,"FINStmtImp_RowCount" integer,"FINStmtImp_ImportedAt" timestamptz default now(),legal_entity_id uuid,currency_code text,opening_balance numeric,closing_balance numeric,verified_at timestamptz,verified_by uuid,verified_period_id uuid);
      create table public."FIN_StatementLines" ("FINStmtLine_ID" uuid primary key,"FINStmtLine_ImportID" uuid,"FINStmtLine_LineNo" integer,"FINStmtLine_TransactionDate" date,"FINStmtLine_CurrencyCodeSnapshot" text,"FINStmtLine_Amount" numeric,"FINStmtLine_BalanceAfter" numeric,"FINStmtLine_MatchStatusCode" text default 'unmatched');
      create table public."FIN_BankMatches" ("FINBankMatch_ID" uuid primary key default gen_random_uuid(),"FINBankMatch_StatementLineID" uuid unique,"FINBankMatch_CashID" uuid,"FINBankMatch_MatchTypeCode" text,"FINBankMatch_MatchedBy" uuid,"FINBankMatch_Notes" text);
      create table public."FIN_CashTransactions" ("FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid,"FINCash_BankAccountID" uuid,"FINCash_StatusCode" text,"FINCash_NativePostingStatusCode" text,"FINCash_CurrencyCodeSnapshot" text,"FINCash_TransactionDate" date,"FINCash_AccountingDate" date,"FINCash_Amount" numeric,"FINCash_TypeCode" text);
      create table public."FIN_IndirectTaxPeriods" (id uuid primary key,legal_entity_id uuid,jurisdiction_code text,status text,active_review_lock_id uuid,end_date date);
      create table public."FIN_HmrcVatSubmissionAttempts" (id uuid primary key,period_id uuid,approval_id uuid,tenant_project_ref text,environment text,registration_id uuid,vrn text,period_key text,payload_body text,payload_sha256 text,status text);
      create table public."FIN_IndirectTaxFilingApprovals" (id uuid primary key,period_id uuid,registration_id uuid,tenant_project_ref text,environment text,vrn text,period_key text,review_lock_id uuid,lock_fingerprint text);
      create table public."FIN_IndirectTaxPeriodReviewLocks" (id uuid primary key,period_id uuid,calculation_id uuid,lock_fingerprint text,source_digest text);
      create table public."FIN_IndirectTaxCalculations" (id uuid primary key,period_id uuid,source_digest text,box_totals jsonb);
      create table public."FIN_IndirectTaxFilingApprovalRevocations" (approval_id uuid);
      create table public."FIN_IndirectTaxPeriodReviewUnlocks" (lock_id uuid);
      create table public."FIN_HmrcVatSubmissionReceipts" (attempt_id uuid,period_id uuid,tenant_project_ref text,payload_sha256 text);
      create table public."FIN_HmrcVatReturnReadbackChecks" (attempt_id uuid,period_id uuid,tenant_project_ref text,payload_sha256 text,result text);
      create table public."Audit_Events" ("AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,"AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,"AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,"AuditEvent_Action" text,"AuditEvent_Title" text,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_uk_vat_access(actor uuid,entity uuid) returns void language plpgsql as $$ begin if actor not in ('${id(1)}','${id(3)}') or entity<>'${id(2)}' then raise exception 'denied' using errcode='42501'; end if; end $$;
      create function public._multideck_bank_statement_access(actor uuid,entity uuid,permission text) returns void language plpgsql as $$ begin if actor not in ('${id(1)}','${id(3)}') or entity<>'${id(2)}' then raise exception 'denied' using errcode='42501'; end if; end $$;
      insert into public."cmp_LegalEntities" values ('${id(2)}');
      insert into public."cmp_Users" values ('${id(1)}'),('${id(3)}');
      insert into public."FIN_Periods" values ('${id(10)}','${id(2)}','2026-04-01','2026-04-30','open','GBP');
      insert into public."FIN_NominalAccounts" values ('${id(11)}','${id(2)}',true,'2100','vat_output'),('${id(12)}','${id(2)}',true,'1100','bank');
      insert into public."FIN_BankAccounts" values ('${id(13)}','${id(2)}',true,'GBP','${id(12)}');
      insert into public."FIN_IndirectTaxPeriods" values ('${id(4)}','${id(2)}','GB','review_locked','${id(8)}','2026-03-31');
      insert into public."FIN_HmrcVatSubmissionAttempts" values ('${id(5)}','${id(4)}','${id(7)}','tenant-a','production','${id(6)}','123456789','A123','accepted-body',encode(sha256(convert_to('accepted-body','UTF8')),'hex'),'accepted');
      insert into public."FIN_IndirectTaxFilingApprovals" values ('${id(7)}','${id(4)}','${id(6)}','tenant-a','production','123456789','A123','${id(8)}',repeat('b',64));
      insert into public."FIN_IndirectTaxPeriodReviewLocks" values ('${id(8)}','${id(4)}','${id(9)}',repeat('b',64),repeat('c',64));
      insert into public."FIN_IndirectTaxCalculations" values ('${id(9)}','${id(4)}',repeat('c',64),'{"3":10,"4":0,"5":10}');
      insert into public."FIN_HmrcVatSubmissionReceipts" values ('${id(5)}','${id(4)}','tenant-a',encode(sha256(convert_to('accepted-body','UTF8')),'hex'));
      insert into public."FIN_StatementImports"("FINStmtImp_ID","FINStmtImp_BankAccountID","FINStmtImp_FileHashSHA256","FINStmtImp_StatementDateFrom","FINStmtImp_StatementDateTo","FINStmtImp_RowCount",legal_entity_id,currency_code,opening_balance,closing_balance)
        values ('${id(14)}','${id(13)}',repeat('d',64),'2026-04-01','2026-04-30',1,'${id(2)}','GBP',100,90);
      insert into public."FIN_StatementLines" values ('${id(20)}','${id(14)}',1,'2026-04-15','GBP',-10,90,'unmatched');
      insert into public."FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot")
        values ('${id(50)}','OPEN','posted','FIN_OpeningBalancePackages','${id(51)}','${id(10)}','${id(2)}',100,100,'GBP');
      insert into public."FIN_PostingLines"("FINPostLine_ID","FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
        values ('${id(52)}','${id(50)}',1,'${id(12)}','Bank opening',100,0,'GBP');
    `)
    sql(migration)
    assert.equal(sql(`select has_table_privilege('service_role','public."FIN_HmrcVatSettlements"','INSERT')`), 'f')
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_uk_vat_settlement(uuid,uuid,text,uuid,uuid,uuid,text)','EXECUTE')`), 'f')
    assert.match(rejection(`select public.multideck_uk_vat_settlement('${id(99)}','${id(2)}','prepare','${id(5)}','${id(20)}',null,'Reviewed against accepted HMRC return')`), /denied/)
    sql(`delete from public."FIN_HmrcVatSubmissionReceipts" where attempt_id='${id(5)}'`)
    assert.match(rejection(`select public.multideck_uk_vat_settlement('${id(1)}','${id(2)}','prepare','${id(5)}','${id(20)}',null,'Reviewed against accepted HMRC return')`), /receipt or return readback/)
    sql(`insert into public."FIN_HmrcVatSubmissionReceipts" values ('${id(5)}','${id(4)}','tenant-a',encode(sha256(convert_to('accepted-body','UTF8')),'hex'))`)
    const prepared = action(1, 'prepare')
    assert.equal(prepared.status, 'prepared')
    assert.equal(prepared.source.amountGbp, '10')
    sql(`update public."FIN_StatementLines" set "FINStmtLine_Amount"=-9 where "FINStmtLine_ID"='${id(20)}'`)
    assert.match(rejection(`select public.multideck_uk_vat_settlement('${id(3)}','${id(2)}','post','${id(5)}','${id(20)}','${prepared.id}','Reviewed against accepted HMRC return')`), /source changed/)
    sql(`update public."FIN_StatementLines" set "FINStmtLine_Amount"=-10 where "FINStmtLine_ID"='${id(20)}'`)
    assert.match(rejection(`select public.multideck_uk_vat_settlement('${id(1)}','${id(2)}','post','${id(5)}','${id(20)}','${prepared.id}','Reviewed against accepted HMRC return')`), /second authorised operator/)
    const posted = action(3, 'post', prepared.id)
    assert.equal(posted.status, 'posted')
    assert.equal(sql(`select "FINPostBatch_StatusCode" from public."FIN_PostingBatches" where "FINPostBatch_ID"='${posted.batchId}'`), 'posted')
    assert.equal(sql(`select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"='${posted.batchId}'`), '2')
    assert.equal(sql(`select "FINPostLine_DebitAmount"=10 and "FINPostLine_CreditAmount"=0 from public."FIN_PostingLines" where "FINPostLine_ID"='${posted.vatPostingLineId}'`), 't')
    assert.equal(sql(`select "FINPostLine_DebitAmount"=0 and "FINPostLine_CreditAmount"=10 from public."FIN_PostingLines" where "FINPostLine_ID"='${posted.bankPostingLineId}'`), 't')
    assert.equal(sql(`select "FINBankMatch_MatchTypeCode" from public."FIN_BankMatches" where vat_settlement_id='${prepared.id}'`), 'vat_settlement')
    assert.equal(sql(`select "FINStmtLine_MatchStatusCode" from public."FIN_StatementLines" where "FINStmtLine_ID"='${id(20)}'`), 'matched')
    assert.match(rejection(`update public."FIN_HmrcVatSettlements" set amount_gbp=9 where id='${prepared.id}'`), /cannot be changed/)
    assert.match(rejection(`update public."FIN_StatementLines" set "FINStmtLine_Amount"=-9 where "FINStmtLine_ID"='${id(20)}'`), /locks its bank statement source/)
    assert.match(rejection(`update public."FIN_StatementImports" set "FINStmtImp_FileHashSHA256"=repeat('e',64) where "FINStmtImp_ID"='${id(14)}'`), /locks its bank statement import/)
    assert.match(rejection(`delete from public."FIN_BankMatches" where vat_settlement_id='${prepared.id}'`), /cannot be removed/)
    assert.match(rejection(`select public.multideck_uk_vat_settlement('${id(3)}','${id(2)}','post','${id(5)}','${id(20)}','${prepared.id}','Reviewed against accepted HMRC return')`), /already posted/)
    const control = JSON.parse(sql(`select public.multideck_bank_statement_control('${id(1)}','${id(2)}','${id(10)}','${id(13)}')`))
    assert.equal(control.status, 'ready_for_review', JSON.stringify(control))
    assert.equal(control.vatSettlementMovement, -10)
    assert.equal(control.unrepresentedVatSettlements, 0)
    assert.equal(control.ledgerMovement, -10)
    assert.equal(control.orphanBankLines, 0)
    sql(`alter table public."FIN_IndirectTaxPeriods" add column scheme_code text;
      update public."FIN_IndirectTaxPeriods" set scheme_code='cash';
      insert into public."FIN_Periods" values ('${id(60)}','${id(2)}','2026-01-01','2026-03-31','closed','GBP');
      insert into public."FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot")
        values ('${id(61)}','PRIOR','posted','FIN_Documents','${id(63)}','${id(60)}','${id(2)}',10,10,'GBP');
      insert into public."FIN_PostingLines"("FINPostLine_ID","FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot")
        values ('${id(62)}','${id(61)}',1,'${id(11)}','Tax: output VAT',0,10,'GBP');
      create function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
      returns jsonb language sql stable as $$ select jsonb_build_object(
        'truncated',false,'sourceDigest',repeat('a',64),'status','cash_control_source_only','returnReady',false,
        'context',jsonb_build_object('periodStart','2026-04-01','periodEnd','2026-04-30'),
        'accountingControls',jsonb_build_object('status','verified'),
        'acceptedHistory',jsonb_build_object('status','accepted_history_matched','periods',jsonb_build_array(
          jsonb_build_object('status','accepted','attemptId','${id(5)}','periodId','${id(4)}'))),
        'ledgerMovements',jsonb_build_object('status','blocked','digest',repeat('b',64),
          'lineCount',1,'unresolvedLines',1,'verifiedOpeningExcludedLines',0,
          'matchedInvoiceLines',0,'expectedPostingCount',0,
          'duplicateSourcePostingReferences',0,'partialAccountingPeriods',0,
          'invalidAccountingPeriodTaxLines',0,'invalidSourcePeriodLinks',0,
          'postedOutputVatGbp','0','expectedOutputVatGbp','0',
          'postedInputVatGbp','0','expectedInputVatGbp','0',
          'lines',jsonb_build_array(jsonb_build_object('id','${posted.vatPostingLineId}','classification','unsupported'))),
        'controlBalance',jsonb_build_object('status','blocked','digest',repeat('c',64),
          'lineCount',2,'unclassifiedOpeningLines',0,'unclassifiedPeriodLines',1,
          'invalidAccountingPeriodLines',0,
          'openingNetCreditGbp','10','periodNetCreditGbp','-10','closingNetCreditGbp','0',
          'periodInvoiceNetCreditGbp','0','periodPackageNetCreditGbp','0',
          'lines',jsonb_build_array(
            jsonb_build_object('id','${id(62)}','phase','opening','classification','matched_invoice','accountingStart','2026-01-01'),
            jsonb_build_object('id','${posted.vatPostingLineId}','phase','current','classification','unclassified','accountingStart','2026-04-01')))) $$;`)
    sql(bridgeMigration)
    const cash = JSON.parse(sql(`select public.multideck_uk_vat_cash_control_source_inventory('${id(1)}','${id(2)}','${id(4)}','${id(5)}')`))
    assert.equal(cash.settlements.status, 'verified')
    assert.equal(cash.settlements.periodNetCreditGbp, '-10.0000')
    assert.equal(cash.ledgerMovements.status, 'period_movements_matched')
    assert.equal(cash.controlBalance.status, 'balance_rollforward_matched')
    assert.equal(cash.controlBalance.lines[1].classification, 'accepted_hmrc_settlement')
    assert.equal(cash.returnReady, false)
    sql(`update public."FIN_HmrcVatSubmissionAttempts" set status='reconciliation_required' where id='${id(5)}'`)
    const revoked = JSON.parse(sql(`select public.multideck_uk_vat_cash_control_source_inventory('${id(1)}','${id(2)}','${id(4)}','${id(5)}')`))
    assert.equal(revoked.settlements.status, 'blocked')
    assert.equal(revoked.controlBalance.status, 'blocked')
  } finally {
    if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
