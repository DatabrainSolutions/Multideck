import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260922072154_cost_accrual_review_model.sql')
const controlsMigration = read('migrations/20260922074228_cost_accrual_controls.sql')
const workerMigration = read('migrations/20260922075012_cost_accrual_finalisation_worker.sql')
const readsMigration = read('migrations/20260922080908_cost_accrual_control_reads.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const access = read('migrations/20260918123733_general_ledger_journals.sql').split('create function public._multideck_journal_access')[1].split('create function public.multideck_finance_journal')[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('cost review: lifetime evidence, precise values, source scope and role-aware access', async () => {
  assert.ok(baseline.includes(migration.trim()), 'Provisioning snapshot contains the tested cost-review migration')
  assert.ok(baseline.includes(controlsMigration.trim()), 'Provisioning snapshot includes the exact controls migration')
  assert.ok(baseline.includes(workerMigration.trim()), 'Provisioning snapshot includes the exact worker migration')
  assert.ok(baseline.includes(readsMigration.trim()), 'Provisioning snapshot includes the exact controlled reads migration')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'cost-review-')); let started = false
  const run = (cmd, args, input) => { const r = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = q => run('psql', args, q)
  const query = (actor = 1, entity = 3, offset = 0, search = '') => `select public.multideck_finance_cost_review('${id(actor)}','${id(entity)}',${offset},'${search}');`
  const reject = q => { const r = spawnSync(join(bin, 'psql'), args, { input: q, encoding: 'utf8' }); assert.notEqual(r.status, 0); return r.stderr }
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table "cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table "Job_Header"("Job_ID" uuid,"Job_LegalEntityID" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_Number" integer,"Job_Period" text,"Job_Status" text,"Job_IsDeleted" boolean);
      create table permissions(actor uuid,permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from permissions where actor=$1 and permission=$2)$$;
      ${['Job_Costing_Lines','FIN_Documents','FIN_DocumentLineJobLinks','FIN_Accruals','FIN_Periods','FIN_NominalAccounts'].map(table).join('\n')}
      create function public._multideck_journal_access${access}
      ${migration}
      alter table "cmp_Users" add primary key("User_ID");
      alter table "cmp_LegalEntities" add primary key("LegalEntity_ID");
      alter table "Job_Costing_Lines" add primary key("JobCostingLine_ID");
      alter table "FIN_Documents" add primary key("FINDoc_ID");
      ${table('sys_WorkflowRecordTypes')}
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      ${table('Audit_Events')}
      ${controlsMigration}
      ${['FIN_PostingBatches','FIN_PostingLines','FIN_PeriodCloseRunItems','FIN_PeriodCloseRuns'].map(table).join('\n')}
      alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");
      ${read('migrations/20260918123733_general_ledger_journals.sql').split('create table public."FIN_Journals"')[1].split('create function public._multideck_journal_access')[0].replace(/^/, 'create table public."FIN_Journals"')}
      ${read('migrations/20260921072027_enforce_balanced_ledger_postings.sql')}
      create function _multideck_finance_mirror_state(uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean) language sql as $$select 'optional'::text,true,true$$;
      ${workerMigration}
      ${readsMigration}
      insert into "cmp_Users" values ('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active'),('${id(7)}','${id(2)}','inactive'),('${id(8)}',null,'active');
      insert into permissions select u,'Finance.Management.View' from unnest(array['${id(1)}'::uuid,'${id(4)}','${id(5)}','${id(7)}','${id(8)}']) u;
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}',true,'GBP'),('${id(9)}','${id(6)}',true,'GBP');
      insert into "cmp_Offices" values('${id(10)}','${id(2)}'),('${id(11)}','${id(6)}');
      insert into "Job_Header" values('${id(20)}','${id(3)}','${id(10)}',null,100,'202608','active',false),('${id(21)}','${id(9)}','${id(11)}',null,200,'202608','active',false);
      insert into "Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode","JobCostingLine_CostAmountLocal","JobCostingLine_CostNominalAccountID","JobCostingLine_SupplierID","JobCostingLine_CreatedBy") values
        ('${id(30)}','${id(20)}',1,'Handling','freight',100,'${id(40)}','${id(70)}','${id(1)}'),('${id(31)}','${id(21)}',1,'Foreign','freight',900,'${id(40)}',null,'${id(5)}');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_IsControlAccount") values('${id(40)}','${id(3)}','5050','Handling','Expense Account',false);
      insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_BaseCurrencyCode") values('${id(50)}','${id(3)}','202608','August','2026-08-01','2026-08-31','GBP');
      insert into "FIN_Accruals"("FINAccrual_ID","FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_AccountingDate","FINAccrual_StatusCode","FINAccrual_AccruedAmount","FINAccrual_RelievedAmount","FINAccrual_CurrencyCodeSnapshot") values('${id(60)}','${id(20)}','${id(30)}','${id(50)}','2026-08-31','partially_reversed',100,96,'GBP');
      insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_NativePostingStatusCode","FINDoc_AccountingDate","FINDoc_PartyOrgID") values
        ('${id(80)}','${id(3)}','pl_invoice','posted','2026-08-31','${id(70)}'),('${id(81)}','${id(3)}','pl_invoice','posted','2026-09-15','${id(70)}'),('${id(82)}','${id(9)}','pl_invoice','posted','2026-09-15','${id(70)}');
      insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LocalNetAmount") values
        ('${id(80)}','${id(90)}','${id(20)}','${id(30)}',60),('${id(81)}','${id(91)}','${id(20)}','${id(30)}',36),('${id(82)}','${id(92)}','${id(20)}','${id(30)}',800);`)
    const result = JSON.parse(sql(query()))
    assert.equal(result.total, 1); assert.equal(result.mode, 'controlled')
    assert.equal(result.rows[0].actualCost, '96.0000'); assert.equal(result.rows[0].openAccrual, '4.0000'); assert.equal(result.rows[0].remainingEstimate, '4.0000')
    assert.equal(result.rows[0].originalEstimate, null); assert.equal(result.rows[0].sourceDocumentIds.length, 2)
    assert.ok(result.rows[0].reasons.includes('Confirm partial or final invoice'))
    const control = (action, input = {}, actor = 1, entity = 3) => `select public.multideck_finance_cost_controls('${id(actor)}','${id(entity)}','${action}','${JSON.stringify(input)}');`
    assert.equal(JSON.parse(sql(control('read'))).postingEnabled, false)
    assert.match(reject(control('save_policy', {})), /access/)
    sql(`insert into permissions select '${id(1)}',p from unnest(array['Finance.Management.Prepare','Finance.Management.Approve']) p;
      insert into permissions values('${id(4)}','Finance.Management.Approve');`)
    const policyInput = { underPercent: '5', underCap: '10', overPercent: '2', overCap: '5', autoFinalise: true, recognitionRule: 'Signed proof that the service was completed.' }
    const policy = JSON.parse(sql(control('save_policy', policyInput)))
    assert.equal(policy.revision, 1); assert.equal(policy.approved_by, null)
    assert.match(reject(control('approve_policy', {id: policy.id, reason: 'Reviewed thresholds'})), /Another authorised/)
    const approved = JSON.parse(sql(control('approve_policy', {id: policy.id, reason: 'Reviewed thresholds'}, 4)))
    assert.equal(approved.approved_by, id(4))
    assert.equal(JSON.parse(sql(control('read'))).postingEnabled, false, 'Approval alone cannot activate accounting')
    assert.match(reject(control('save_policy', {...policyInput, underPercent: '101'})), /Percentage/)
    assert.match(reject(control('save_policy', {...policyInput, underCap: '1e2'})), /decimal/)
    const charge = JSON.parse(sql(control('charge', {chargeId: id(30)})))
    assert.equal(charge.documents.length, 2, 'Foreign invoice is not offered for final confirmation')
    const confirmation = { chargeId: id(30), revision: charge.revision, serviceCompletedOn: '2026-08-01', invoiceReceivedOn: '2026-09-15', finalDocumentId: id(81), isFinal: true, reason: 'Supplier confirmed final handling invoice' }
    assert.match(reject(control('record_evidence', {...confirmation, finalDocumentId: id(82)})), /exactly matched/)
    assert.match(reject(control('record_evidence', {...confirmation, serviceCompletedOn: '2999-01-01'})), /actual service/)
    const evidence = JSON.parse(sql(control('record_evidence', confirmation)))
    assert.equal(evidence.recorded_by, id(1)); assert.equal(evidence.is_final, true)
    assert.equal(JSON.parse(sql(control('charge', {chargeId:id(30)}))).evidenceCurrent, true)
    sql(`update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=101 where "JobCostingLine_ID"='${id(30)}';`)
    assert.equal(JSON.parse(sql(control('charge', {chargeId:id(30)}))).evidenceCurrent, false)
    assert.match(reject(control('record_evidence', confirmation)), /changed/)
    assert.equal(sql('select count(*) from "FIN_CostControlAudit"'), '3')
    assert.equal(sql(`select count(*) from "Audit_Events" where "AuditEvent_RecordTypeCode"='cost_control'`), '3')
    for (const actor of [5,7,8]) assert.match(reject(control('charge', {chargeId:id(30)}, actor)), /access/)
    assert.match(reject(control('charge', {chargeId:id(31)})), /accessible/)
    assert.match(reject(`set role authenticated; ${control('read')}`), /permission denied/)
    assert.match(reject(`set role anon; ${control('read')}`), /permission denied/)
    assert.match(reject('set role service_role; delete from "FIN_CostControlAudit";'), /permission denied/)
    assert.match(reject('set role service_role; update "FIN_CostEvidence" set is_final=false;'), /permission denied/)
    sql(`update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=100 where "JobCostingLine_ID"='${id(30)}';`)
    // Worker: £100 estimate, £96 actual already relieved, £4 remaining. Use the
    // original 5050/2300 pair, not a generic profit nominal.
    sql(`insert into permissions values('${id(4)}','Finance.Management.Post');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_IsControlAccount") values('${id(41)}','${id(3)}','2300','Accruals','Current Liability',true);
      update "FIN_Periods" set "FINPeriod_Code"=to_char(current_date,'YYYYMM'),"FINPeriod_StatusCode"='open';
      insert into "FIN_PeriodCloseRuns"("FINCloseRun_ID","FINCloseRun_RunTypeCode","FINCloseRun_LegalEntityID","FINCloseRun_PeriodID","FINCloseRun_PostingBatchID") values('${id(100)}','accrual_wip','${id(3)}','${id(50)}','${id(102)}');
      insert into "FIN_PeriodCloseRunItems"("FINCloseItem_ID","FINCloseItem_ItemTypeCode","FINCloseItem_CloseRunID","FINCloseItem_JobID") values('${id(101)}','job','${id(100)}','${id(20)}');
      update "FIN_Accruals" set "FINAccrual_CloseRunItemID"='${id(101)}';
      begin;
      insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal") values('${id(102)}','AC-1','posted','${id(50)}','${id(3)}',100,100);
      insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values('${id(102)}',1,'${id(40)}','${id(60)}',100,0),('${id(102)}',2,'${id(41)}','${id(60)}',0,100);
      commit;`)
    sql(`delete from "FIN_DocumentLineJobLinks" where "FINDocLineJob_DocumentID"='${id(82)}';`)
    const workerEvidence = JSON.parse(sql(control('record_evidence', {...confirmation, revision: JSON.parse(sql(control('charge', {chargeId:id(30)}))).revision})))
    const runFinal = `select public.multideck_cost_finalise('${id(3)}','${workerEvidence.id}');`
    assert.equal(JSON.parse(sql(runFinal)).status, 'disabled')
    sql(`select multideck_cost_automation('${id(4)}','${id(3)}',true,'${policy.id}','Reviewed residual automation scope');`)
    assert.equal(JSON.parse(sql('select multideck_cost_work_queue();')).pending.length, 1)
    sql(`begin; delete from permissions where actor='${id(4)}' and permission='Finance.Management.Post';
      do $$begin begin perform multideck_cost_finalise('${id(3)}','${workerEvidence.id}'); raise exception 'revocation not enforced'; exception when insufficient_privilege then null; end; end$$; rollback;`)
    sql(`begin; update "FIN_Accruals" set "FINAccrual_RelievedAmount"=90;
      do $$declare r jsonb; begin r:=multideck_cost_finalise('${id(3)}','${workerEvidence.id}');
        if r->>'reason' not like '%Reconcile invoice relief%' then raise exception 'unreconciled relief was accepted: %',r; end if; end$$; rollback;`)
    sql(`begin; update "FIN_Accruals" set "FINAccrual_CurrencyCodeSnapshot"='USD';
      do $$declare r jsonb; begin r:=multideck_cost_finalise('${id(3)}','${workerEvidence.id}');
        if r->>'reason' not like '%currency%' then raise exception 'currency mismatch was accepted: %',r; end if; end$$; rollback;`)
    sql(`begin; update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=101 where "JobCostingLine_ID"='${id(30)}';
      do $$declare r jsonb; begin r:=multideck_cost_finalise('${id(3)}','${workerEvidence.id}');
        if r->>'reason' not like '%confirmation%' then raise exception 'stale confirmation was accepted: %',r; end if; end$$; rollback;`)
    // Outside tolerance can only be released after an independent, snapshot-bound approval.
    sql(`begin;
      update "FIN_DocumentLineJobLinks" set "FINDocLineJob_LocalNetAmount"=30 where "FINDocLineJob_DocumentID"='${id(81)}';
      update "FIN_Accruals" set "FINAccrual_RelievedAmount"=90;
      do $$declare e jsonb; r jsonb; a jsonb; begin
        e:=multideck_finance_cost_controls('${id(1)}','${id(3)}','record_evidence', '${JSON.stringify(confirmation)}'::jsonb||jsonb_build_object('revision',md5(_multideck_cost_source('${id(3)}','${id(30)}')::text)));
        r:=multideck_cost_finalise('${id(3)}',(e->>'id')::uuid);
        if r->>'reason'<>'Outside approved tolerance; human review required' then raise exception 'unexpected review: %',r; end if;
        begin perform multideck_cost_approve_exception('${id(1)}','${id(3)}',(r->>'id')::uuid,'Agreed supplier settlement'); raise exception 'self approval allowed'; exception when insufficient_privilege then null; end;
        a:=multideck_cost_approve_exception('${id(4)}','${id(3)}',(r->>'id')::uuid,'Agreed supplier settlement');
        r:=multideck_cost_finalise('${id(3)}',(e->>'id')::uuid);
        if r->>'status'<>'posted' or r->'snapshot'->>'exceptionApprovalId'<>a->>'id' then raise exception 'approved exception did not post: %',r; end if;
      end$$;
      rollback;`)
    sql(`update "FIN_Periods" set "FINPeriod_StatusCode"='hard_closed';`)
    assert.match(JSON.parse(sql(runFinal)).reason, /period/)
    assert.equal(sql('select count(*) from "FIN_Journals"'), '0')
    sql(`update "FIN_Periods" set "FINPeriod_StatusCode"='open';`)
    const concurrent = await Promise.all([1,2].map(() => promisify(execFile)(join(bin,'psql'), [...args, '-c', runFinal], {timeout:30000})))
    const final = JSON.parse(concurrent[0].stdout)
    assert.equal(JSON.parse(concurrent[1].stdout).journal_id, final.journal_id, 'Competing workers share exactly one native journal')
    assert.equal(final.status, 'posted', final.reason); assert.ok(final.journal_id)
    assert.equal(sql('select "FINAccrual_RelievedAmount" from "FIN_Accruals"'), '100.0000')
    assert.equal(sql(`select sum("FINPostLine_DebitAmount")::text||'/'||sum("FINPostLine_CreditAmount")::text from "FIN_PostingLines" where "FINPostLine_BatchID"=(select batch_id from "FIN_Journals")`), '4.0000/4.0000')
    assert.equal(sql(`select "FINPostLine_CreditAmount" from "FIN_PostingLines" where "FINPostLine_BatchID"=(select batch_id from "FIN_Journals") and "FINPostLine_NominalAccountID"='${id(40)}'`), '4.0000')
    assert.equal(sql('select mirror_status from "FIN_Journals"'), 'queued')
    assert.equal(JSON.parse(sql(query())).rows[0].remainingEstimate, '0.0000', 'Finalised residual is no longer reported as expected liability')
    assert.equal(JSON.parse(sql(runFinal)).journal_id, final.journal_id)
    assert.equal(sql('select count(*) from "FIN_Journals"'), '1', 'Duplicate event cannot post again')
    assert.match(reject(`set role authenticated; ${runFinal}`), /permission denied/)
    assert.match(reject(`insert into "FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_AccountingDate") values('${id(20)}','${id(30)}','${id(50)}',current_date)`), /finalised/)
    // Restore the fixture balance for the independent review assertions below.
    sql('update "FIN_Accruals" set "FINAccrual_RelievedAmount"=96;')
    assert.deepEqual(JSON.parse(sql(query(4))).rows, JSON.parse(sql(query(1))).rows) // Permitted colleague, not creator-only.
    for (const actor of [5,7,8]) assert.match(reject(query(actor)), /access/)
    assert.match(reject(query(1,9)), /access/)
    assert.match(reject(`set role authenticated; ${query()}`), /permission denied/)
    assert.match(reject(`set role anon; ${query()}`), /permission denied/)
    assert.match(reject(query(1,3,-1)), /Invalid/)
    assert.equal(JSON.parse(sql(query(1,3,100))).rows.length, 0)
    assert.equal(JSON.parse(sql(query(1,3,0,'no match'))).total, 0)
    sql(`update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='${id(1)}';`)
    assert.equal(JSON.parse(sql(query(4))).rows.length, 1) // Inactive creator does not hide evidence.
    sql(`delete from permissions where actor='${id(4)}';`)
    assert.match(reject(query(4)), /access/)
    sql(`insert into permissions values('${id(4)}','Finance.Management.View'); update "FIN_Documents" set "FINDoc_TypeCode"='debit_note' where "FINDoc_ID"='${id(81)}';`)
    const credit = JSON.parse(sql(query(4))).rows[0]
    assert.equal(credit.actualCost, '24.0000'); assert.equal(credit.remainingEstimate, null)
    assert.ok(credit.reasons.includes('Credit or reversal requires review'))
    sql(`update "FIN_Accruals" set "FINAccrual_CurrencyCodeSnapshot"='USD';`)
    assert.equal(JSON.parse(sql(query(4))).rows[0].openAccrual, null)
    // Reads did not relieve or post anything.
    assert.equal(sql('select "FINAccrual_RelievedAmount" from "FIN_Accruals";'), '96.0000')
    sql(`update "cmp_LegalEntities" set "LegalEntity_IsActive"=false where "LegalEntity_ID"='${id(3)}';`)
    assert.match(reject(query(4)), /access/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
