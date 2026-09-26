import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(new URL('../migrations/20260925153000_uk_vat_cash_balance_rollforward_inventory.sql', import.meta.url), 'utf8')
const pgBin = process.env.PG_TEST_BIN ?? '/opt/homebrew/opt/postgresql@17/bin'
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('Cash VAT-control balance reconciles historical and period postings and blocks unexplained lines', () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-cash-balance-'))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = input => run('psql', ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
  const inventory = () => JSON.parse(sql(`select public.multideck_uk_vat_cash_control_source_inventory('${id(1)}','${id(2)}','${id(3)}','${id(4)}')`))
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table public."FIN_PostingBatches" ("FINPostBatch_ID" uuid primary key,"FINPostBatch_StatusCode" text,"FINPostBatch_LegalEntityID" uuid,"FINPostBatch_PeriodID" uuid,"FINPostBatch_SourceTable" text,"FINPostBatch_SourceID" uuid,"FINPostBatch_PostedAt" timestamptz);
      create table public."FIN_PostingLines" ("FINPostLine_ID" uuid primary key,"FINPostLine_BatchID" uuid,"FINPostLine_NominalAccountID" uuid,"FINPostLine_DocumentID" uuid,"FINPostLine_DocumentLineID" uuid,"FINPostLine_Description" text,"FINPostLine_DebitAmount" numeric,"FINPostLine_CreditAmount" numeric,"FINPostLine_CurrencyCodeSnapshot" text);
      create table public."FIN_Periods" ("FINPeriod_ID" uuid primary key,"FINPeriod_LegalEntityID" uuid,"FINPeriod_StartDate" date,"FINPeriod_EndDate" date);
      create table public."FIN_NominalAccounts" ("FINNom_ID" uuid primary key,"FINNom_LegalEntityID" uuid,"FINNom_Code" text,"FINNom_ControlTypeCode" text);
      create table public."FIN_TaxCodes" ("FINTax_LegalEntityID" uuid,"FINTax_OutputNominalID" uuid,"FINTax_InputNominalID" uuid);
      create table public."FIN_OpeningBalancePackages" (id uuid primary key,posting_batch_id uuid,legal_entity_id uuid,status text);
      create table public."FIN_IndirectTaxCashCalculationEventLines" (calculation_id uuid,period_id uuid,box_number smallint,signed_amount numeric);
      create function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
        returns jsonb language sql stable as $$ select jsonb_build_object(
          'truncated',false,'sourceDigest',repeat('a',64),
          'context',jsonb_build_object('periodStart','2026-04-01','periodEnd','2026-06-30'),
          'ledgerMovements',jsonb_build_object('status','period_movements_matched'),
          'acceptedHistory',jsonb_build_object('status','accepted_history_matched','periods',jsonb_build_array(
            jsonb_build_object('status','accepted','periodId','${id(5)}','calculationId','${id(6)}'))),
          'journalEvidence',jsonb_build_object('lines',jsonb_build_array(
            jsonb_build_object('invoiceId','${id(10)}','lineId','${id(11)}','batchId','${id(12)}',
              'postingLines',jsonb_build_array(jsonb_build_object('id','${id(13)}','description','Tax: output VAT'))),
            jsonb_build_object('invoiceId','${id(20)}','lineId','${id(21)}','batchId','${id(22)}',
              'postingLines',jsonb_build_array(jsonb_build_object('id','${id(23)}','description','Tax: input VAT')))))) $$;
      insert into public."FIN_NominalAccounts" values ('${id(30)}','${id(2)}','2100','vat_output'),('${id(31)}','${id(2)}','1200','vat_input');
      insert into public."FIN_Periods" values ('${id(5)}','${id(2)}','2026-01-01','2026-03-31'),('${id(7)}','${id(2)}','2026-04-01','2026-06-30');
      insert into public."FIN_PostingBatches" values ('${id(12)}','posted','${id(2)}','${id(5)}','FIN_Documents','${id(10)}','2026-01-15 12:00+00'),('${id(22)}','posted','${id(2)}','${id(7)}','FIN_Documents','${id(20)}','2026-05-15 12:00+00');
      insert into public."FIN_PostingLines" values ('${id(13)}','${id(12)}','${id(30)}','${id(10)}','${id(11)}','Tax: output VAT',0,20,'GBP'),('${id(23)}','${id(22)}','${id(31)}','${id(20)}','${id(21)}','Tax: input VAT',40,0,'GBP');
      insert into public."FIN_IndirectTaxCashCalculationEventLines" values ('${id(6)}','${id(5)}',1,10);
    `)
    sql(migration)
    let result = inventory()
    assert.equal(result.controlBalance.status, 'balance_rollforward_matched')
    assert.equal(result.controlBalance.openingNetCreditGbp, '20')
    assert.equal(result.controlBalance.periodNetCreditGbp, '-40')
    assert.equal(result.controlBalance.closingNetCreditGbp, '-20')
    assert.equal(result.controlBalance.priorAcceptedNetDueGbp, '10')
    assert.equal(result.controlBalance.lineCount, 2)
    assert.equal(result.returnReady, false)
    assert.match(result.sourceDigest, /^[a-f0-9]{64}$/)
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)','EXECUTE')`), 'f')
    assert.equal(sql(`select has_function_privilege('service_role','public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)','EXECUTE')`), 't')
    sql(`insert into public."FIN_PostingLines" values ('${id(24)}','${id(12)}','${id(30)}',null,null,'HMRC settlement',20,0,'GBP')`)
    result = inventory()
    assert.equal(result.controlBalance.status, 'blocked')
    assert.equal(result.controlBalance.unclassifiedOpeningLines, 1)
    sql(`delete from public."FIN_PostingLines" where "FINPostLine_ID"='${id(24)}'`)
    sql(`insert into public."FIN_PostingBatches" values ('${id(40)}','posted','${id(2)}',null,'manual',null,null);
      insert into public."FIN_PostingLines" values ('${id(41)}','${id(40)}','${id(30)}',null,null,'VAT correction',0,5,'GBP')`)
    result = inventory()
    assert.equal(result.controlBalance.status, 'blocked')
    assert.equal(result.controlBalance.invalidAccountingPeriodLines, 1)
  } finally {
    if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
