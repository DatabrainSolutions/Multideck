import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260925071010_finance_accounting_period_close.sql')
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
      ${['FIN_Periods','FIN_PostingBatches','FIN_PostingLines','FIN_Accruals','FIN_WIPItems','FIN_NominalAccounts','FIN_Documents','FIN_BankAccounts','sys_WorkflowRecordTypes','Audit_Events'].map(table).join('\n')}
      alter table "FIN_Periods" add primary key("FINPeriod_ID");
      alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      create table "FIN_ChargeLifecycleQueue"(legal_entity_id uuid,status text);
      create table "FIN_Journals"(legal_entity_id uuid,accounting_date date,status text,mirror_status text);
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
    assert.match(reject(`update "FIN_Periods" set "FINPeriod_StatusCode"='open' where "FINPeriod_ID"='${id(10)}';`), /cannot be reopened/)
    assert.match(reject(`update "FIN_AccountingClosedPacks" set reason='changed' where id='${pack.id}';`), /immutable/)
    assert.match(reject(`set role authenticated; ${close(1,10,'read')}`), /permission denied/)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_AccountingDate","FINDoc_NativePostingStatusCode")
      values('${id(21)}','${id(3)}','sl_invoice','2026-10-08','posted');`)
    const october = JSON.parse(sql(close(1, 11, 'read'))).snapshot
    assert.ok(october.blockers.includes('ar_ap_control_unavailable'))
    assert.ok(october.blockers.includes('vat_control_unavailable'))
    const blockedReview = JSON.parse(sql(close(1, 11, 'prepare', {reason:'October requires reconciliation'})))
    assert.match(reject(close(4, 11, 'close', {reviewId:blockedReview.id,reason:'October cannot yet close'})), /close pack blockers/)
    assert.equal(sql(`select "FINPeriod_StatusCode" from "FIN_Periods" where "FINPeriod_ID"='${id(11)}'`), 'open')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
