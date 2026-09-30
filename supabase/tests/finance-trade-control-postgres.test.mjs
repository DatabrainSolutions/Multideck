import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260925072017_finance_trade_control_reconciliation.sql')
const openingBridge = read('migrations/20260925080343_opening_trade_control_bridge.sql')
const fxBridge = read('migrations/20260925084337_opening_trade_control_fx_settlement_bridge.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('posted invoice, credit and cash source totals reconcile to exact AR/AP controls', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'trade-control-'))
  let started = false
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = statement => run('psql', args, statement)
  const reject = statement => {
    const result = spawnSync(join(bin, 'psql'), args, { input: statement, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(result.status, 0)
    return result.stderr
  }
  const bridge = (actor = 1, entity = 3) => `select public.multideck_finance_trade_control_bridge('${id(actor)}','${id(entity)}','${id(10)}');`
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid);
      create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text) returns void language plpgsql as $$
      begin if not exists(select 1 from "cmp_Users" u join "cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
        where u."User_ID"=p_actor and e."LegalEntity_ID"=p_entity and u."User_AccessStatus"='active') then
        raise exception 'No finance access' using errcode='42501'; end if; end $$;
      ${['FIN_Periods','FIN_Documents','FIN_CashTransactions','FIN_CashAllocations','FIN_PostingBatches','FIN_PostingLines','FIN_NominalAccounts'].map(table).join('\n')}
      alter table "FIN_Documents" add column "FINDoc_OpeningBalancePackageID" uuid;
      alter table "FIN_CashTransactions" add column "FINCash_OpeningBalancePackageID" uuid;
      create table "FIN_OpeningBalancePackages"(id uuid,legal_entity_id uuid,status text,opening_date date,package_kind text,source_items_count integer,posting_batch_id uuid);
      create table "FIN_OpeningSourceItems"(id uuid,package_id uuid,source_row_number integer,kind text,
        control_nominal_id uuid,outstanding_base_amount numeric,original_base_amount numeric,
        operational_document_id uuid,operational_cash_id uuid,party_org_id uuid,currency_code text);
      create table "FIN_OpeningFXSettlements"(id uuid,legal_entity_id uuid,package_id uuid,allocation_id uuid,
        cash_id uuid,document_id uuid,cash_control_nominal_id uuid,source_control_nominal_id uuid,
        fx_nominal_id uuid,source_amount numeric,cash_rate numeric,document_rate numeric,cash_local numeric,
        document_local numeric,gain_loss_amount numeric,status text,proposed_by uuid,posted_by uuid,posting_batch_id uuid);
      create table "FIN_FXGainLossEvents"("FINFXEvent_CashAllocationID" uuid,"FINFXEvent_DocumentID" uuid,
        "FINFXEvent_PeriodID" uuid,"FINFXEvent_GainLossAmount" numeric);
      ${migration}
      ${openingBridge}
      ${fxBridge}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(9)}','${id(8)}','active');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}'),('${id(7)}','${id(8)}');
      insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate")
        values('${id(10)}','${id(3)}','202609','September','2026-09-01','2026-09-30');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_IsControlAccount") values
        ('${id(40)}','${id(3)}','6210','AR','Receivable',true),('${id(41)}','${id(3)}','8210','AP','Payable',true);
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID") values
        ('${id(50)}','AR-1','posted','${id(10)}','${id(3)}'),('${id(51)}','AP-1','posted','${id(10)}','${id(3)}'),
        ('${id(52)}','RECEIPT','posted','${id(10)}','${id(3)}'),('${id(53)}','PAYMENT','posted','${id(10)}','${id(3)}');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID","FINDoc_AccountingDate","FINDoc_LocalGrossAmount") values
        ('${id(20)}','${id(3)}','sl_invoice','posted','posted','${id(50)}','2026-09-10',120),
        ('${id(21)}','${id(3)}','pl_invoice','posted','posted','${id(51)}','2026-09-11',70);
      insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID","FINCash_TypeCode","FINCash_StatusCode","FINCash_NativePostingStatusCode","FINCash_NativePostingBatchID","FINCash_AccountingDate","FINCash_LocalAmount") values
        ('${id(30)}','${id(3)}','customer_receipt','posted','posted','${id(52)}','2026-09-15',20),
        ('${id(31)}','${id(3)}','supplier_payment','posted','posted','${id(53)}','2026-09-16',10);
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_CashID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(50)}',1,'${id(40)}','${id(20)}',null,120,0),('${id(51)}',1,'${id(41)}','${id(21)}',null,0,70),
        ('${id(52)}',2,'${id(40)}',null,'${id(30)}',0,20),('${id(53)}',2,'${id(41)}',null,'${id(31)}',10,0);`)
    const good = JSON.parse(sql(bridge()))
    assert.equal(good.status, 'verified', JSON.stringify(good))
    assert.equal(good.ar.source, 100); assert.equal(good.ar.control, 100)
    assert.equal(good.ap.source, 60); assert.equal(good.ap.control, 60)
    assert.equal(good.issueCount, 0)
    sql(`insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID") values
        ('${id(55)}','AR-CREDIT','posted','${id(10)}','${id(3)}'),('${id(56)}','AP-DEBIT','posted','${id(10)}','${id(3)}');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID","FINDoc_AccountingDate","FINDoc_LocalGrossAmount") values
        ('${id(23)}','${id(3)}','credit_note','posted','posted','${id(55)}','2026-09-17',15),
        ('${id(24)}','${id(3)}','debit_note','posted','posted','${id(56)}','2026-09-18',5);
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(55)}',1,'${id(40)}','${id(23)}',0,15),('${id(56)}',1,'${id(41)}','${id(24)}',5,0);`)
    const credits = JSON.parse(sql(bridge()))
    assert.equal(credits.status, 'verified', JSON.stringify(credits))
    assert.equal(credits.ar.source, 85); assert.equal(credits.ar.control, 85)
    assert.equal(credits.ap.source, 55); assert.equal(credits.ap.control, 55)
    sql(`insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID")
      values('${id(54)}','MANUAL-AR','posted','${id(10)}','${id(3)}');
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DebitAmount") values('${id(54)}',1,'${id(40)}',1);`)
    const difference = JSON.parse(sql(bridge()))
    assert.equal(difference.status, 'unreconciled'); assert.equal(difference.ar.difference, -1)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_NativePostingStatusCode","FINDoc_AccountingDate")
      values('${id(22)}','${id(3)}','credit_note','approved','draft','2026-09-20');`)
    assert.equal(JSON.parse(sql(bridge())).unpostedApprovedCount, 1)
    assert.match(reject(bridge(9)), /No finance access/)
    assert.match(reject(`set role authenticated; ${bridge()}`), /permission denied/)
    sql(`delete from "FIN_PostingLines" where "FINPostLine_BatchID"='${id(54)}';
      delete from "FIN_Documents" where "FINDoc_ID"='${id(22)}';
      insert into "FIN_OpeningBalancePackages" values('${id(60)}','${id(3)}','posted','2026-09-01','full_open_items',2,'${id(61)}');
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID")
        values('${id(61)}','OPENING','posted','FIN_OpeningBalancePackages','${id(60)}','${id(10)}','${id(3)}');
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(61)}',1,'${id(40)}',80,0),('${id(61)}',2,'${id(41)}',0,50);
      insert into "FIN_OpeningSourceItems" values
        ('${id(64)}','${id(60)}',1,'customer_invoice','${id(40)}',80,80,'${id(62)}',null,'${id(70)}','USD'),
        ('${id(65)}','${id(60)}',2,'supplier_invoice','${id(41)}',50,50,'${id(63)}',null,'${id(71)}','GBP');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID","FINDoc_OpeningBalancePackageID","FINDoc_AccountingDate","FINDoc_CurrencyCodeSnapshot","FINDoc_LocalGrossAmount","FINDoc_LocalOutstandingAmount","FINDoc_PartyOrgID") values
        ('${id(62)}','${id(3)}','sl_invoice','approved','posted','${id(61)}','${id(60)}','2026-09-01','USD',80,80,'${id(70)}'),
        ('${id(63)}','${id(3)}','pl_invoice','approved','posted','${id(61)}','${id(60)}','2026-09-01','GBP',50,50,'${id(71)}');`)
    const opened = JSON.parse(sql(bridge()))
    assert.equal(opened.status, 'verified', JSON.stringify(opened))
    assert.equal(opened.ar.source, 165); assert.equal(opened.ar.control, 165)
    assert.equal(opened.ap.source, 105); assert.equal(opened.ap.control, 105)
    assert.equal(opened.sourceCount, 8)
    sql(`update "FIN_OpeningSourceItems" set outstanding_base_amount=79 where id='${id(64)}';`)
    const openingMismatch = JSON.parse(sql(bridge()))
    assert.equal(openingMismatch.status, 'unreconciled')
    assert.ok(openingMismatch.issues.some(issue => issue.reason === 'opening_control_mismatch'))
    sql(`update "FIN_OpeningSourceItems" set outstanding_base_amount=80 where id='${id(64)}';
      update "FIN_Documents" set "FINDoc_LocalOutstandingAmount"=72 where "FINDoc_ID"='${id(62)}';
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID")
        values('${id(68)}','OPENING-RECEIPT','posted','${id(10)}','${id(3)}');
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_CashID","FINPostLine_CreditAmount")
        values('${id(68)}',2,'${id(40)}','${id(66)}',9);
      insert into "FIN_CashTransactions"("FINCash_ID","FINCash_LegalEntityID","FINCash_TypeCode","FINCash_StatusCode","FINCash_NativePostingStatusCode","FINCash_NativePostingBatchID","FINCash_AccountingDate","FINCash_CurrencyCodeSnapshot","FINCash_ExchangeRate","FINCash_Amount","FINCash_LocalAmount")
        values('${id(66)}','${id(3)}','customer_receipt','posted','posted','${id(68)}','2026-09-20','USD',0.9,10,9);
      insert into "FIN_CashAllocations"("FINCashAlloc_ID","FINCashAlloc_CashID","FINCashAlloc_DocumentID","FINCashAlloc_AllocationStatusCode","FINCashAlloc_AllocatedAmount","FINCashAlloc_LocalAllocatedAmount","FINCashAlloc_AllocatedAt")
        values('${id(67)}','${id(66)}','${id(62)}','allocated',10,8,'2026-09-20');`)
    const fxGap = JSON.parse(sql(bridge()))
    assert.equal(fxGap.ar.difference, 0)
    assert.equal(fxGap.status, 'unreconciled')
    assert.ok(fxGap.issues.some(issue => issue.reason === 'opening_allocation_fx_trueup_required'))
    sql(`update "FIN_Documents" set "FINDoc_ExchangeRate"=0.8 where "FINDoc_ID"='${id(62)}';
      update "FIN_CashTransactions" set "FINCash_PartyOrgID"='${id(70)}' where "FINCash_ID"='${id(66)}';
      update "FIN_PostingBatches" set "FINPostBatch_SourceTable"='FIN_CashTransactions',
        "FINPostBatch_SourceID"='${id(66)}' where "FINPostBatch_ID"='${id(68)}';
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode")
        values('${id(42)}','${id(3)}','7900','FX gain','income');
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode",
        "FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
        "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal")
        values('${id(69)}','OPEN-FX','posted','FIN_OpeningFXSettlements','${id(80)}','${id(10)}','${id(3)}',9,9);
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID",
        "FINPostLine_CashID","FINPostLine_DocumentID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values
        ('${id(69)}',1,'${id(40)}','${id(66)}','${id(62)}',9,0),
        ('${id(69)}',2,'${id(40)}','${id(66)}','${id(62)}',0,8),
        ('${id(69)}',3,'${id(42)}','${id(66)}','${id(62)}',0,1);
      insert into "FIN_OpeningFXSettlements" values('${id(80)}','${id(3)}','${id(60)}','${id(67)}',
        '${id(66)}','${id(62)}','${id(40)}','${id(40)}','${id(42)}',10,0.9,0.8,9,8,1,
        'posted','${id(1)}','${id(9)}','${id(69)}');
      insert into "FIN_FXGainLossEvents" values('${id(67)}','${id(62)}','${id(10)}',1);`)
    const settled = JSON.parse(sql(bridge()))
    assert.equal(settled.status, 'verified', JSON.stringify(settled))
    assert.equal(settled.ar.source, 157); assert.equal(settled.ar.control, 157)
    assert.equal(settled.ap.source, 105); assert.equal(settled.ap.control, 105)
    assert.equal(settled.issueCount, 0)
    sql(`update "FIN_OpeningFXSettlements" set gain_loss_amount=2 where id='${id(80)}';`)
    const tampered = JSON.parse(sql(bridge()))
    assert.equal(tampered.status, 'unreconciled')
    assert.ok(tampered.issues.some(issue => issue.reason === 'opening_allocation_fx_trueup_required'))
    sql(`insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_IsControlAccount")
        values('${id(43)}','${id(3)}','6220','Imported AR','Receivable',true);
      update "FIN_OpeningSourceItems" set control_nominal_id='${id(43)}' where id='${id(64)}';
      update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='${id(43)}'
        where "FINPostLine_BatchID"='${id(61)}' and "FINPostLine_NominalAccountID"='${id(40)}';
      update "FIN_Documents" set "FINDoc_ExchangeRate"=0.9,"FINDoc_LocalOutstandingAmount"=71 where "FINDoc_ID"='${id(62)}';
      update "FIN_CashAllocations" set "FINCashAlloc_LocalAllocatedAmount"=9 where "FINCashAlloc_ID"='${id(67)}';
      update "FIN_PostingLines" set "FINPostLine_NominalAccountID"='${id(43)}',"FINPostLine_CreditAmount"=9
        where "FINPostLine_BatchID"='${id(69)}' and "FINPostLine_LineNo"=2;
      delete from "FIN_PostingLines" where "FINPostLine_BatchID"='${id(69)}' and "FINPostLine_LineNo"=3;
      update "FIN_OpeningFXSettlements" set status='proposed',source_control_nominal_id='${id(43)}',
        document_rate=0.9,document_local=9,gain_loss_amount=0,fx_nominal_id=null where id='${id(80)}';`)
    const missingReclass = JSON.parse(sql(bridge()))
    assert.equal(missingReclass.status, 'unreconciled')
    assert.ok(missingReclass.issues.some(issue => issue.reason === 'opening_control_reclassification_required'))
    sql(`update "FIN_OpeningFXSettlements" set status='posted' where id='${id(80)}';`)
    const reclassified = JSON.parse(sql(bridge()))
    assert.equal(reclassified.status, 'verified', JSON.stringify(reclassified))
    assert.equal(reclassified.ar.source, 156); assert.equal(reclassified.ar.control, 156)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
