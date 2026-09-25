import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const migration = readFileSync(new URL('../migrations/20260830204914_accrual_wip_management.sql', import.meta.url), 'utf8')
const assignment = 'create or replace function public.multideck_finance_assign_job_period('
  + migration.split('create or replace function public.multideck_finance_assign_job_period(')[1]
    .split('create or replace function public.multideck_finance_transition_accrual_wip')[0]
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('an unassigned job needs exact company scope, a reason and an audited Finance assignment before WIP', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'finance-job-assignment-'))
  let started = false
  const run = (cmd, args, input, expectSuccess = true) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status === 0, expectSuccess, result.stderr)
    return result
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = (query) => run('psql', args, query).stdout.trim()
  const reject = (query) => run('psql', args, query, false).stderr
  const assign = (actor, company, entity, job, reason = 'Reviewed source and legal entity') =>
    `select public.multideck_finance_assign_job_period('${id(company)}','${id(actor)}','${id(entity)}','${id(job)}','202609','${reason}');`
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table public."cmp_Users"("User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid);
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table public."Job_Header"("Job_ID" uuid,"Job_LegalEntityID" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_IsDeleted" boolean,"Job_Period" text,"Job_UpdatedAt" timestamptz,"Job_UpdatedBy" uuid);
      create table public."FIN_JobPeriodHistory"("FINJobPeriodHistory_JobID" uuid,"FINJobPeriodHistory_LegalEntityID" uuid,"FINJobPeriodHistory_FromPeriodCode" text,"FINJobPeriodHistory_ToPeriodCode" text,"FINJobPeriodHistory_Reason" text,"FINJobPeriodHistory_AssignedBy" uuid);
      create table public."Audit_Events"("AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,"AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,"AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,"AuditEvent_Action" text,"AuditEvent_Title" text,"AuditEvent_Reason" text,"AuditEvent_HasFieldChanges" boolean,"AuditEvent_ChangedFieldCount" integer,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_finance_ensure_period(uuid,text,uuid) returns uuid language sql as $$select '${id(90)}'::uuid$$;
      ${assignment}
      insert into public."cmp_Users" values ('${id(1)}','${id(2)}','active'),('${id(3)}','${id(2)}','inactive'),('${id(4)}','${id(5)}','active');
      insert into public."cmp_LegalEntities" values ('${id(6)}','${id(2)}'),('${id(7)}','${id(2)}'),('${id(8)}','${id(5)}');
      insert into public."cmp_Offices" values ('${id(9)}','${id(2)}'),('${id(10)}','${id(5)}');
      insert into public."Job_Header"("Job_ID","Job_LegalEntityID","Job_OrgOfficeID","Job_IsDeleted","Job_Period") values
        ('${id(11)}',null,'${id(9)}',false,'202608'),
        ('${id(12)}','${id(6)}','${id(9)}',false,'202608'),
        ('${id(13)}',null,'${id(10)}',false,'202608');`)
    assert.match(reject(assign(1, 2, 6, 11, '')), /Explain why the job period is changing/)
    assert.match(reject(assign(3, 2, 6, 11)), /outside this workspace/)
    assert.match(reject(assign(1, 2, 8, 11)), /legal entity is outside this workspace/)
    assert.match(reject(assign(1, 2, 6, 13)), /Job not found/)
    assert.match(reject(assign(1, 2, 7, 12)), /another legal entity/)
    assert.match(reject(`set role authenticated; ${assign(1, 2, 6, 11)}`), /permission denied/)
    const result = JSON.parse(sql(assign(1, 2, 6, 11)))
    assert.equal(result.changed, true)
    assert.equal(sql(`select "Job_LegalEntityID"::text||'/'||"Job_Period" from public."Job_Header" where "Job_ID"='${id(11)}'`), `${id(6)}/202609`)
    assert.equal(sql(`select count(*) from public."FIN_JobPeriodHistory" where "FINJobPeriodHistory_JobID"='${id(11)}' and "FINJobPeriodHistory_LegalEntityID"='${id(6)}' and "FINJobPeriodHistory_AssignedBy"='${id(1)}'`), '1')
    assert.equal(sql(`select count(*) from public."Audit_Events" where "AuditEvent_RecordID"='${id(11)}' and "AuditEvent_Action"='assign_job_management_period' and "AuditEvent_Reason"='Reviewed source and legal entity'`), '1')
    assert.equal(JSON.parse(sql(assign(1, 2, 6, 11))).changed, false)
    assert.equal(sql('select count(*) from public."FIN_JobPeriodHistory"'), '1')
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
