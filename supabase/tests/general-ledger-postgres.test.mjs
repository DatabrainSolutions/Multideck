import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = new URL('../', import.meta.url)
const migration = readFileSync(new URL('migrations/20260918123733_general_ledger_journals.sql', root), 'utf8')
const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const read = name => readFileSync(new URL(`migrations/${name}.sql`, root), 'utf8')
const watchFoundation = read('20260802140000_dexter_watching_for_you')
const watchTables = watchFoundation.slice(watchFoundation.indexOf('create table if not exists public."sys_AIDexterWatchCapabilities"'), watchFoundation.indexOf('create index if not exists'))
const cargo = read('20260905112211_dexter_booking_cargo_parity')
const cargoStart = cargo.indexOf('do $$\ndeclare definition text; previous text')
const cargoPatch = cargo.slice(cargoStart, cargo.indexOf('end $$;', cargoStart) + 7)
function fn(source, name) { const start = source.indexOf(`create or replace function public.${name}(`); assert.ok(start >= 0); return source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3) }
test('GL journals: posting, enquiries, permissions, rollback, period locks and fenced delivery', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin', dir = mkdtempSync(join(tmpdir(), 'gl-journal-'))
  let started = false
  const run = (cmd, args, input) => { const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  const reject = (input, pattern) => { const result = spawnSync(join(bin, 'psql'), args, { input, encoding: 'utf8' }); assert.notEqual(result.status, 0); assert.match(result.stderr, pattern) }
  const lines = [{ accountId: id(10), debit: '120.1234', credit: '0', description: 'Expense' }, { accountId: id(11), debit: '0', credit: '120.1234', description: 'Accrued cost' }]
  const command = (action, input, actor = 1, entity = 3) => `select multideck_finance_journal('${id(actor)}','${id(entity)}','${action}','${JSON.stringify(input)}');`
  const draft = (n, extra = {}) => ({ id: id(n), accountingDate: '2026-09-18', description: 'Manual adjustment', reference: 'TEST', lines, ...extra })
  const enquiry = (actor = 1, account = 10, from = '202609') => `select multideck_finance_gl_enquiry('${id(actor)}','${id(3)}','${from}','202612','${id(account)}',0);`
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table permissions(actor uuid, permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as 'select exists(select 1 from public.permissions where actor=$1 and permission=$2)';
      ${['FIN_NominalAccounts', 'FIN_PostingBatches', 'FIN_PostingLines', 'FIN_Periods', 'Audit_Events'].map(table).join('\n')}
      alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");
      create unique index period_code on "FIN_Periods"("FINPeriod_LegalEntityID","FINPeriod_Code") where "FINPeriod_LegalEntityID" is not null;
      alter table "FIN_NominalAccounts" add column if not exists "FINNom_AllowManualPosting" boolean not null default true;
      create function _multideck_finance_mirror_state(uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean) language sql as $$ select 'optional'::text,true,true $$;
      ${readFileSync(new URL('migrations/20260830214204_fix_finance_period_end_interval.sql', root), 'utf8')}
      insert into "cmp_Users" values ('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active'),('${id(7)}','${id(2)}','inactive'),('${id(8)}',null,'active');
      insert into "cmp_LegalEntities" values ('${id(3)}','${id(2)}',true,'GBP'),('${id(9)}','${id(6)}',true,'GBP');
      insert into permissions select '${id(1)}',unnest(array['Finance.Management.View','Finance.Management.Prepare','Finance.Management.Post']);
      insert into permissions select u, 'Finance.Management.View' from unnest(array['${id(4)}'::uuid,'${id(5)}','${id(7)}','${id(8)}']) u;
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_LegalEntityID","FINNom_IsControlAccount") values
        ('${id(10)}','5000','Costs','Expense Account','${id(3)}',false),('${id(11)}','2100','Accrued costs','Liability','${id(3)}',false),('${id(12)}','1100','AR','Asset','${id(3)}',true),('${id(13)}','6000','Foreign','Expense Account','${id(9)}',false);
      create table "cmp_Company"("Company_ID" uuid primary key);
      insert into "cmp_Company" values('${id(2)}'),('${id(6)}');
      ${table('sys_AIDexterDataDomains')}
      alter table "sys_AIDexterDataDomains" add column if not exists "AIDexterDomain_RequiredPermissionsJSON" jsonb,add column if not exists "AIDexterDomain_DataCategoriesJSON" jsonb;
      ${watchTables}
      alter table "sys_AIDexterWatchCapabilities" add column "AIDexterWatchCapability_RequiredPermissionsJSON" jsonb;
      alter table "AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
      create function _multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
      create table "Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
      ${fn(read('20260802153000_dexter_email_sender_attachment_watches'), '_multideck_dexter_watch_matches')}
      ${fn(read('20260802150818_dexter_email_watch_reliability'), '_multideck_dexter_evaluate_watch_signal')}
      alter table "cmp_Users" add column "Auth_User_ID" uuid;
      create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create function multideck_dexter_list_watches() returns jsonb language sql as $$select coalesce(jsonb_agg(jsonb_build_object('id',"AIDexterWatch_ID",'capability',"AIDexterWatch_CapabilityCode")),'[]') from public."AI_DexterWatches"$$;
      create schema booking_api; create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
      ${cargoPatch}
      ${migration}
      ${read('20260921072027_enforce_balanced_ledger_postings')}
      ${table('sys_WorkflowRecordTypes')}
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      alter table "Audit_Events" add constraint audit_record_type_fk foreign key("AuditEvent_RecordTypeCode") references "sys_WorkflowRecordTypes"("WorkflowRecordType_Code");
      ${read('20260921075603_finance_journal_audit_registration')}
      ${read('20260921075745_finance_transaction_audit_snapshots')}
      create trigger evaluate after insert on "AI_DexterWatchSignals" for each row execute function _multideck_dexter_evaluate_watch_signal();`)
    const saved = JSON.parse(sql(command('save', draft(20))))
    assert.equal(saved.version, 1)
    assert.equal(sql('select count(*) from "Audit_Events" where "AuditEvent_MetadataJSON"->>\'evidenceKind\'=\'row_snapshot\';'), '1')
    reject(command('save', draft(20, { version: 0 })), /changed/)
    reject(command('save', draft(21, { lines: [lines[0], { ...lines[1], accountId: id(13) }] })), /active account/)
    reject(command('save', draft(21, { lines: [lines[0], { ...lines[1], accountId: id(12) }] })), /control accounts/)
    reject(command('save', draft(21, { lines: [lines[0], { ...lines[1], credit: '-10' }] })), /non-negative/)
    reject(command('save', draft(21, { lines: [lines[0], { ...lines[1], credit: '1.12345' }] })), /four decimal/)
    for (const actor of [4, 5, 7, 8]) reject(command('save', draft(21), actor), /access/)
    for (const actor of [5, 7, 8]) reject(enquiry(actor), /access/)
    reject(`set role anon; ${enquiry()}`, /permission denied/)
    reject(`set role authenticated; select * from "FIN_Journals";`, /permission denied/)
    sql(command('save', draft(21, { lines: [lines[0], { ...lines[1], credit: '100' }] })))
    reject(command('post', { id: id(21), version: 1 }), /balance/)
    assert.equal(sql('select count(*) from "FIN_PostingBatches";'), '0')
    sql(command('save', draft(22, { accountingDate: '2026-08-10' })))
    sql(`select _multideck_finance_ensure_period('${id(3)}','202608','${id(1)}'); update "FIN_Periods" set "FINPeriod_StatusCode"='closed' where "FINPeriod_Code"='202608';`)
    reject(command('post', { id: id(22), version: 1 }), /open accounting period/)
    sql(`insert into "AI_DexterWatches"("AIDexterWatch_ID","AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON") values('${id(50)}','${id(2)}','${id(4)}','general_ledger','Journal posted','Journal posted','Watch this journal','${id(20)}','{"field":"status","operator":"eq","value":"posted"}');`)
    const posted = JSON.parse(sql(command('post', { id: id(20), version: 1 })))
    assert.equal(posted.status, 'posted'); assert.equal(posted.mirror_status, 'queued')
    assert.equal(JSON.parse(sql(command('post', { id: id(20), version: 1 }))).batch_id, posted.batch_id)
    assert.equal(sql('select count(*) from "FIN_PostingBatches";'), '1')
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '1')
    sql(`update "cmp_Users" set "Auth_User_ID"="User_ID";`)
    assert.equal(JSON.parse(sql(`set test.actor='${id(4)}'; select multideck_dexter_list_watches();`)).length, 1)
    assert.equal(JSON.parse(sql(`select multideck_dexter_domain_general_ledger('${id(2)}','Manual',25);`)).length, 3)
    assert.deepEqual(JSON.parse(sql(`select multideck_dexter_domain_general_ledger('${id(6)}',null,25);`)), [])
    reject(command('save', draft(20, { version: 2 })), /cannot be edited/)
    assert.equal(JSON.parse(sql(enquiry(4))).closing, 120.1234)
    assert.equal(JSON.parse(sql(enquiry(4, 10, '202610'))).opening, 120.1234)
    sql(`update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='${id(1)}';`)
    assert.equal(JSON.parse(sql(enquiry(4))).rows.length, 1)
    reject(command('claim', { id: id(20), connectionId: id(40), payload: {} }), /access/)
    sql(`update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"='${id(1)}';`)
    const claim = JSON.parse(sql(command('claim', { id: id(20), connectionId: id(40), payload: { company: 'A' } })))
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '1')
    sql(`update "AI_DexterWatches" set "AIDexterWatch_RuleJSON"='{"field":"mirrorStatus","operator":"changed"}',"AIDexterWatch_StatusCode"='paused';`)
    reject(command('claim', { id: id(20), connectionId: id(40), payload: {} }), /already in progress/)
    reject(command('finish', { id: id(20), token: id(41), status: 'synced' }), /reservation expired/)
    sql(command('finish', { id: id(20), token: claim.mirror_token, status: 'failed', error: 'Timeout' }))
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '1')
    sql(`update "AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';`)
    const retry = JSON.parse(sql(command('claim', { id: id(20), connectionId: id(42), payload: { company: 'B' } })))
    assert.equal(retry.mirror_payload.company, 'A'); assert.equal(retry.mirror_connection_id, id(40))
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '2')
    sql(command('finish', { id: id(20), token: retry.mirror_token, status: 'synced', externalId: 'ERP-JN-1' }))
    assert.equal(JSON.parse(sql(command('claim', { id: id(20) }))).external_id, 'ERP-JN-1')
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '3')
    assert.equal(sql('select count(*) from "FIN_PostingLines";'), '2')
    sql(`delete from permissions where actor='${id(4)}';`)
    reject(enquiry(4), /access/)
    assert.deepEqual(JSON.parse(sql(`set test.actor='${id(4)}'; select multideck_dexter_list_watches();`)), [])
    sql(`insert into "AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values('${id(2)}','general_ledger','FIN_Journals','${id(20)}','{"mirrorStatus":"failed"}','{"mirrorStatus":"synced"}');`)
    assert.equal(sql('select count(*) from "AI_DexterWatchEvents";'), '3')
    assert.ok(Number(sql('select count(*) from "Audit_Events";')) >= 7)
  } finally { if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']); rmSync(dir, { recursive: true, force: true }) }
})
