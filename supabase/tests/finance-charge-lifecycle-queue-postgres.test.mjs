import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260925070431_finance_accrual_wip_event_queue.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('source transactions coalesce exact charge events and preserve tenant boundaries', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'charge-events-'))
  let started = false
  const run = (cmd, args, input, allowed = 0) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, allowed, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = statement => run('psql', args, statement)
  const reject = statement => {
    const result = spawnSync(join(bin, 'psql'), args, { input: statement, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(result.status, 0)
    return result.stderr
  }
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid);
      create table "Job_Header"("Job_ID" uuid primary key,"Job_LegalEntityID" uuid);
      create table "FIN_CostAutomation"(legal_entity_id uuid,authorised_by uuid);
      create table "FIN_CostEvidence"(id uuid,legal_entity_id uuid,charge_id uuid);
      ${['Job_Costing_Lines','FIN_Documents','FIN_DocumentLineJobLinks','FIN_Accruals','FIN_WIPItems','FIN_Periods'].map(table).join('\n')}
      alter table "Job_Costing_Lines" add primary key("JobCostingLine_ID");
      create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text) returns void language plpgsql as $$
      begin if not exists(select 1 from "cmp_Users" u join "cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
        where u."User_ID"=p_actor and e."LegalEntity_ID"=p_entity and u."User_AccessStatus"='active') then
        raise exception 'No finance access' using errcode='42501'; end if; end $$;
      ${migration}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(9)}','${id(8)}','active');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}'),('${id(7)}','${id(8)}');
      insert into "Job_Header" values('${id(4)}','${id(3)}'),('${id(5)}','${id(7)}');
      insert into "Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode","JobCostingLine_CostAmountLocal","JobCostingLine_CreatedBy") values
        ('${id(11)}','${id(4)}',1,'Handling','freight',100,'${id(1)}'),('${id(12)}','${id(5)}',1,'Foreign','freight',200,'${id(9)}');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_PostingStatusCode","FINDoc_NativePostingStatusCode")
        values('${id(20)}','${id(3)}','pl_invoice','draft','draft');
      insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LocalNetAmount")
        values('${id(20)}','${id(21)}','${id(4)}','${id(11)}',60);`)
    assert.equal(sql(`select source_revision from "FIN_ChargeLifecycleQueue" where charge_id='${id(11)}'`), '2')
    sql(`begin;
      update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=110 where "JobCostingLine_ID"='${id(11)}';
      update "FIN_Documents" set "FINDoc_PostingStatusCode"='posted',"FINDoc_NativePostingStatusCode"='posted' where "FINDoc_ID"='${id(20)}';
      update "FIN_DocumentLineJobLinks" set "FINDocLineJob_LocalNetAmount"=65 where "FINDocLineJob_DocumentID"='${id(20)}';
      commit;`)
    assert.equal(sql(`select source_revision from "FIN_ChargeLifecycleQueue" where charge_id='${id(11)}'`), '5')
    assert.equal(sql(`select event_types @> array['estimate','invoice_posting','invoice_link'] from "FIN_ChargeLifecycleQueue" where charge_id='${id(11)}'`), 't')
    assert.equal(sql(`select count(*) from "FIN_ChargeLifecycleEvents" where charge_id='${id(11)}'`), '5')
    sql(`begin; update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=120 where "JobCostingLine_ID"='${id(11)}'; rollback;`)
    assert.equal(sql(`select source_revision from "FIN_ChargeLifecycleQueue" where charge_id='${id(11)}'`), '5', 'Rolled-back source edits leave no event')
    sql(`update "FIN_Documents" set "FINDoc_TypeCode"='debit_note' where "FINDoc_ID"='${id(20)}';`)
    assert.equal(sql(`select event_types @> array['credit_or_reversal'] from "FIN_ChargeLifecycleQueue" where charge_id='${id(11)}'`), 't')
    assert.equal(JSON.parse(sql(`select public.multideck_finance_charge_lifecycle_queue('${id(1)}','${id(3)}')`)).rows.length, 1)
    assert.equal(JSON.parse(sql(`select public.multideck_finance_charge_lifecycle_queue('${id(9)}','${id(7)}')`)).rows.length, 1)
    assert.match(reject(`select public.multideck_finance_charge_lifecycle_queue('${id(9)}','${id(3)}');`), /No finance access/)
    assert.match(reject(`set role authenticated; select public.multideck_finance_charge_lifecycle_queue('${id(1)}','${id(3)}');`), /permission denied/)
    assert.match(reject(`set role anon; select * from "FIN_ChargeLifecycleQueue";`), /permission denied/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
