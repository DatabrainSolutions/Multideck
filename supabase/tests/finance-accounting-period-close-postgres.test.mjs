import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260925071010_finance_accounting_period_close.sql')
const vatSignoff = read('migrations/20260925083125_accounting_period_vat_control_signoff.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('independent current close pack locks only a reconciled period and denies late posting', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'finance-close-'))
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
  const close = (actor, period, action, input = {}) => `select public.multideck_finance_accounting_close('${id(actor)}','${id(3)}','${id(period)}','${action}','${JSON.stringify(input)}');`
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid);
      create table permissions(actor uuid,permission text);
      create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text) returns void language plpgsql as $$
      begin if not exists(select 1 from "cmp_Users" u join "cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
        join permissions p on p.actor=u."User_ID" and p.permission=p_permission
        where u."User_ID"=p_actor and e."LegalEntity_ID"=p_entity and u."User_AccessStatus"='active') then
        raise exception 'No finance access' using errcode='42501'; end if; end $$;
      ${['FIN_Periods','FIN_PostingBatches','FIN_PostingLines','FIN_Accruals','FIN_WIPItems','FIN_NominalAccounts','FIN_Documents','FIN_DocumentLineJobLinks','FIN_CashTransactions','FIN_BankAccounts','sys_WorkflowRecordTypes','Audit_Events'].map(table).join('\n')}
      alter table "FIN_Periods" add primary key("FINPeriod_ID");
      alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      create table "FIN_ChargeLifecycleQueue"(legal_entity_id uuid,status text);
      create table "FIN_Journals"(legal_entity_id uuid,accounting_date date,status text,mirror_status text);
      create table "ACCI_Connections"("ACCIC_ID" uuid,"ACCIC_LegalEntityID" uuid,"ACCIC_StatusCode" text);
      create function public._multideck_finance_mirror_state(uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
        language sql as $$select 'disabled'::text,false,true$$;
      ${migration}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(9)}','${id(8)}','active');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}'),('${id(7)}','${id(8)}');
      insert into permissions select actor,permission from (values('${id(1)}'::uuid),('${id(4)}'::uuid),('${id(9)}'::uuid)) actor(actor)
        cross join (values('Finance.Management.View'),('Finance.Management.Prepare'),('Finance.Management.Approve'),('Finance.Management.Post')) permission(permission);
      insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_BaseCurrencyCode") values
        ('${id(10)}','${id(3)}','202609','September','2026-09-01','2026-09-30','GBP'),
        ('${id(11)}','${id(3)}','202610','October','2026-10-01','2026-10-31','GBP');`)
    sql(`insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID")
      values('${id(19)}','PREPARED','${id(10)}','${id(3)}');
      insert into "FIN_PostingLines"("FINPostLine_ID","FINPostLine_BatchID","FINPostLine_LineNo")
      values('${id(18)}','${id(19)}',1);
      update "FIN_PostingLines" set "FINPostLine_Description"='Prepared line' where "FINPostLine_ID"='${id(18)}';`)
    const preview = JSON.parse(sql(close(1, 10, 'read'))).snapshot
    assert.deepEqual(preview.blockers, [])
    assert.equal(preview.trialBalance.difference, 0)
    assert.match(reject(`update "FIN_Periods" set "FINPeriod_StatusCode"='locked' where "FINPeriod_ID"='${id(10)}';`), /close pack first/)
    const review = JSON.parse(sql(close(1, 10, 'prepare', {reason:'September control review complete'})))
    assert.match(reject(close(1, 10, 'close', {reviewId:review.id,reason:'Approving September close'})), /Another authorised/)
    assert.match(reject(close(9, 10, 'close', {reviewId:review.id,reason:'Approving September close'})), /No finance access/)
    const pack = JSON.parse(sql(close(4, 10, 'close', {reviewId:review.id,reason:'Approving September close'})))
    assert.equal(pack.review_id, review.id)
    assert.equal(sql(`select "FINPeriod_StatusCode" from "FIN_Periods" where "FINPeriod_ID"='${id(10)}'`), 'locked')
    assert.match(reject(`insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID") values('${id(20)}','LATE','${id(10)}','${id(3)}');`), /period is locked/)
    assert.match(reject(`insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo") values('${id(19)}',2);`), /period is locked/)
    assert.match(reject(`update "FIN_PostingLines" set "FINPostLine_Description"='Changed' where "FINPostLine_ID"='${id(18)}';`), /period is locked/)
    assert.match(reject(`update "FIN_PostingBatches" set "FINPostBatch_PeriodID"='${id(11)}' where "FINPostBatch_ID"='${id(19)}';`), /locked period/)
    assert.match(reject(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_AccountingDate","FINDoc_NativePostingStatusCode") values('${id(23)}','${id(3)}','sl_invoice','2026-09-20','posted');`), /posted source in a locked period/)
    assert.match(reject(`update "FIN_Periods" set "FINPeriod_StatusCode"='open' where "FINPeriod_ID"='${id(10)}';`), /cannot be reopened/)
    assert.match(reject(`update "FIN_AccountingClosedPacks" set reason='changed' where id='${pack.id}';`), /immutable/)
    assert.match(reject(`set role authenticated; ${close(1,10,'read')}`), /permission denied/)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_AccountingDate","FINDoc_NativePostingStatusCode")
      values('${id(21)}','${id(3)}','sl_invoice','2026-10-08','posted');`)
    const october = JSON.parse(sql(close(1, 11, 'read'))).snapshot
    assert.ok(october.blockers.includes('ar_ap_control'))
    assert.ok(october.blockers.includes('vat_control_unavailable'))
    const blockedReview = JSON.parse(sql(close(1, 11, 'prepare', {reason:'October requires reconciliation'})))
    assert.match(reject(close(4, 11, 'close', {reviewId:blockedReview.id,reason:'October cannot yet close'})), /close pack blockers/)
    assert.equal(sql(`select "FINPeriod_StatusCode" from "FIN_Periods" where "FINPeriod_ID"='${id(11)}'`), 'open')
    sql(`alter table "cmp_LegalEntities" add column "LegalEntity_CountryCode" text;
      alter table "cmp_LegalEntities" add column "LegalEntity_BaseCurrencyCodeSnapshot" text;
      update "cmp_LegalEntities" set "LegalEntity_CountryCode"='GB',"LegalEntity_BaseCurrencyCodeSnapshot"='GBP'
        where "LegalEntity_ID"='${id(3)}';
      create function public._multideck_dexter_has_permission(uuid,text) returns boolean language sql stable as $$select true$$;
      create function public._multideck_uk_vat_read_access(p_actor uuid,p_entity uuid) returns void language plpgsql as $$
      begin perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View'); end $$;
      create function public._multideck_uk_vat_access(p_actor uuid,p_entity uuid) returns void language plpgsql as $$
      begin perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve'); end $$;
      create table test_vat_inventory(period_id uuid,source_digest text,blocked boolean default false);
      insert into test_vat_inventory values('${id(11)}',repeat('a',64),false);
      create function public.multideck_uk_vat_accounting_period_inventory(p_actor uuid,p_entity uuid,p_period uuid)
      returns jsonb language plpgsql stable as $$
      declare inventory test_vat_inventory;
      begin
        perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
        select * into inventory from test_vat_inventory where period_id=p_period;
        return jsonb_build_object('status',case when inventory.blocked then 'blocked' else 'ready_for_review' end,
          'sourceDigest',inventory.source_digest,'lineCount',1,'openingExcludedLines',0,
          'unclassifiedLines',case when inventory.blocked then 1 else 0 end,
          'unreviewedCutoffDifferences',0,'orphanEvidence',0,'missingDocumentSources',0,'issues','[]'::jsonb);
      end $$;`)
    sql(vatSignoff)
    const vat = (actor, action, input = {}) => `select public.multideck_finance_accounting_vat_control('${id(actor)}','${id(3)}','${id(11)}','${action}','${JSON.stringify(input)}');`
    assert.equal(JSON.parse(sql(close(1,11,'read'))).snapshot.vatStatus, 'awaiting_approval')
    const vatReview = JSON.parse(sql(vat(1,'prepare',{reason:'October native VAT lines and source match'})))
    assert.match(reject(vat(1,'approve',{reviewId:vatReview.id,reason:'Approve October VAT control'})), /second authorised finance operator/)
    const vatApproval = JSON.parse(sql(vat(4,'approve',{reviewId:vatReview.id,reason:'Approve October VAT control'})))
    assert.equal(vatApproval.review_id, vatReview.id)
    assert.equal(JSON.parse(sql(close(1,11,'read'))).snapshot.vatStatus, 'verified')
    assert.match(reject(vat(9,'read')), /No finance access/)
    assert.match(reject(`set role authenticated; ${vat(1,'read')}`), /permission denied/)
    sql(`update test_vat_inventory set source_digest=repeat('b',64) where period_id='${id(11)}';`)
    assert.equal(JSON.parse(sql(close(1,11,'read'))).snapshot.vatStatus, 'stale')
    sql(`update test_vat_inventory set blocked=true where period_id='${id(11)}';`)
    assert.match(reject(vat(1,'prepare',{reason:'Attempt blocked VAT sign-off'})), /Resolve monthly VAT control exceptions/)
    sql(`update test_vat_inventory set blocked=false,source_digest=null where period_id='${id(11)}';`)
    assert.equal(JSON.parse(sql(close(1,11,'read'))).snapshot.vatStatus, 'blocked')
    assert.match(reject(vat(1,'prepare',{reason:'Attempt null digest VAT sign-off'})), /Resolve monthly VAT control exceptions/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
