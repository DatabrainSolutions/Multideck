import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260915104214_erpnext_webhook_receipt_guardrails.sql', import.meta.url), 'utf8')
const inboundMigration = readFileSync(new URL('../migrations/20260917194628_erpnext_reconciliation_and_inbound.sql', import.meta.url), 'utf8')
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
const table = name => {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const quote = value => `'${value.replaceAll("'", "''")}'`
const payload = patch => JSON.stringify({ doctype: 'Sales Invoice', name: 'INV-1', company: 'Example Freight', modified: '2026-09-15 10:30:00.123456', event: 'on_update', ...patch })
const receive = raw => `select public.multideck_erpnext_receive_webhook(${quote(raw)});`

test('real PostgreSQL receipts are scoped, service-only and idempotent under concurrency', async () => {
  assert.ok(baseline.includes(migration.trim()), 'Provisioning baseline must include the exact tested receipt migration')
  assert.equal(spawnSync(join(bin, 'initdb'), ['--version']).status, 0, 'PostgreSQL required; set PG_TEST_BIN')
  const directory = mkdtempSync(join(tmpdir(), 'erpnext-receipt-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  const denied = (input, pattern) => {
    const result = spawnSync(join(bin, 'psql'), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, pattern)
  }
  const asService = raw => JSON.parse(sql(`set role service_role; ${receive(raw)}`))
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public."cmp_LegalEntities" ("LegalEntity_ID" uuid primary key, "Company_ID" uuid, "LegalEntity_IsActive" boolean);
      ${table('ACCI_Connections')};
      ${table('ACCI_WebhookEvents')};
      alter table public."ACCI_Connections" add primary key ("ACCIC_ID");
      alter table public."ACCI_WebhookEvents" add primary key ("ACCIWH_ID");
      alter table public."ACCI_WebhookEvents" add foreign key ("ACCIWH_ConnectionID") references public."ACCI_Connections"("ACCIC_ID") on delete set null;
      grant select, update on public."ACCI_Connections",public."cmp_LegalEntities" to service_role;
      grant all on public."ACCI_WebhookEvents" to anon,authenticated,service_role;
      insert into public."cmp_LegalEntities" values ('${id(1)}','${id(10)}',true),('${id(2)}','${id(10)}',false);
      insert into public."ACCI_Connections" ("ACCIC_ID","ACCIC_ProviderCode","ACCIC_Name","ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_AuthType","ACCIC_ExternalTenantName") values
        ('${id(100)}','erpnext','ERPNext','active','${id(1)}','api_token','Example Freight'),
        ('${id(101)}','erpnext','Inactive','inactive','${id(1)}','api_token','Inactive Company'),
        ('${id(102)}','erpnext','Inactive entity','active','${id(2)}','api_token','Inactive Entity'),
        ('${id(103)}','sage_50','Sage','active','${id(1)}','local_agent','Sage Company');
      insert into public."ACCI_WebhookEvents" ("ACCIWH_ProviderCode","ACCIWH_EventType","ACCIWH_RawPayloadJSON") values ('erpnext','legacy','{}');
      ${migration}
    `)
    const raw = payload({ remarks: "Café's freight", grand_total: '9007199254740993.1234' })
    const first = asService(raw)
    assert.equal(first.accepted, true)
    assert.equal(first.duplicate, false)
    assert.equal(sql(`select "ACCIWH_ConnectionID" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`), id(100))
    assert.equal(sql(`select "ACCIWH_RawPayloadText" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`), raw)
    assert.equal(sql(`select "ACCIWH_PayloadSHA256"=encode(sha256(convert_to("ACCIWH_RawPayloadText",'UTF8')),'hex') from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`), 't')
    assert.equal(sql(`select count(*) from public."ACCI_WebhookEvents" where "ACCIWH_DeliveryKey" is null;`), '1')
    const before = sql(`select "ACCIWH_ReceivedAt"::text from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`)
    sql(`update public."ACCI_WebhookEvents" set "ACCIWH_ProcessingStatusCode"='synced' where "ACCIWH_ID"='${first.eventId}';`)
    const duplicate = asService(JSON.stringify(JSON.parse(raw), null, 2))
    assert.deepEqual(duplicate, { accepted: true, duplicate: true, eventId: first.eventId })
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode"||'|'||"ACCIWH_ReceivedAt"::text from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`), `synced|${before}`)
    denied(`set role service_role; ${receive(payload({ grand_total: 999 }))}`, /conflicting payloads/)
    assert.equal(sql(`select "ACCIWH_RawPayloadText" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${first.eventId}';`), raw)

    for (const role of ['anon', 'authenticated']) {
      denied(`set role ${role}; ${receive(payload())}`, /permission denied/)
      denied(`set role ${role}; select * from public."ACCI_WebhookEvents";`, /permission denied/)
      denied(`set role ${role}; insert into public."ACCI_WebhookEvents" ("ACCIWH_ProviderCode","ACCIWH_EventType") values ('erpnext','spoof');`, /permission denied/)
    }
    for (const company of ['Foreign Company', 'Inactive Company', 'Inactive Entity', 'Sage Company']) denied(`set role service_role; ${receive(payload({ company }))}`, /exactly one active ERPNext/)
    sql(`insert into public."ACCI_Connections" ("ACCIC_ProviderCode","ACCIC_Name","ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_AuthType","ACCIC_ExternalTenantName") values ('erpnext','Duplicate','active','${id(1)}','api_token','Example Freight');`)
    denied(`set role service_role; ${receive(payload())}`, /exactly one active ERPNext/)
    sql(`delete from public."ACCI_Connections" where "ACCIC_Name"='Duplicate';`)

    for (const raw of ['null', '[]', '{', payload({ name: null }), payload({ name: 'x'.repeat(241) }), payload({ company: '' }), payload({ modified: null }), payload({ modified: '2026-02-30 00:00:00' }), payload({ event: '' }), payload({ doctype: 'User' }), payload({ remarks: 'x'.repeat(262144) })]) denied(`set role service_role; ${receive(raw)}`, /ERROR:/)
    const newer = asService(payload({ modified: '2026-09-15 10:31:00.123456' }))
    assert.equal(newer.duplicate, false)
    assert.notEqual(newer.eventId, first.eventId)
    const numericRaw = payload({ name: 'PRECISE', grand_total: '9007199254740993.1234' }).replace('"9007199254740993.1234"', '9007199254740993.1234')
    const precise = asService(numericRaw)
    assert.equal(sql(`select "ACCIWH_RawPayloadJSON"->>'grand_total' from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${precise.eventId}';`), '9007199254740993.1234')
    assert.equal(asService(payload({ name: 'INV-1', event: 'on_submit' })).duplicate, false)
    // Late events remain evidence. Receipt time must not masquerade as version
    // order; a future processor must handle the source timestamp explicitly.
    assert.equal(asService(payload({ modified: '2026-09-14 10:31:00' })).duplicate, false)

    const concurrentRaw = payload({ name: 'CONCURRENT' })
    const results = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const process = spawn(join(bin, 'psql'), [...args, '-c', `set role service_role; ${receive(concurrentRaw)}`], { timeout: 10000 })
      let stdout = '', stderr = ''
      process.stdout.on('data', chunk => { stdout += chunk })
      process.stderr.on('data', chunk => { stderr += chunk })
      process.on('error', reject)
      process.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr)))

    })))
    assert.equal(results.filter(result => !result.duplicate).length, 1)
    assert.equal(new Set(results.map(result => result.eventId)).size, 1)
    assert.equal(sql(`select count(*) from public."ACCI_WebhookEvents" where "ACCIWH_ExternalID"='CONCURRENT';`), '1')
    assert.equal(sql(`select prosecdef from pg_proc where oid='public.multideck_erpnext_receive_webhook(text)'::regprocedure;`), 'f')
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public."ACCI_WebhookEvents"'::regclass;`), 't')
    assert.ok(baseline.includes(inboundMigration.trim()), 'Baseline includes inbound migration')
    sql(`${table('ACCI_ExternalRefs')}; ${table('ACCI_ReconciliationIssues')}; ${table('ACCI_SyncEvents')};
      grant select,update on public."ACCI_ExternalRefs" to service_role;
      grant select,insert,update on public."ACCI_ReconciliationIssues",public."ACCI_SyncEvents" to service_role;
      ${inboundMigration}
      update public."ACCI_WebhookEvents" set "ACCIWH_ProcessingStatusCode"='synced';`)
    const pending = asService(payload({ name: 'PROCESS-ME' }))
    const claim = () => JSON.parse(sql('set role service_role; select public.multideck_erpnext_claim_inbound(5);'))
    const finish = (job, result, token = job.ACCIWH_LeaseToken) => sql(`set role service_role; select public.multideck_erpnext_finish_inbound('${job.ACCIWH_ID}','${token}',${quote(JSON.stringify(result))}::jsonb);`)
    const job = claim()[0]
    assert.equal(job.ACCIWH_ID, pending.eventId)
    assert.deepEqual(claim(), [], 'Live lease excludes another worker')
    assert.equal(finish(job, { outcome: 'review', message: 'Mismatch' }, id(999)), 'f', 'Wrong token rejected')
    sql(`update public."ACCI_WebhookEvents" set "ACCIWH_LeaseUntil"=now()-interval '1 second' where "ACCIWH_ID"='${job.ACCIWH_ID}';`)
    assert.equal(finish(job, { outcome: 'review' }), 'f', 'Expired worker rejected')
    const reclaimed = claim()[0]
    assert.notEqual(reclaimed.ACCIWH_LeaseToken, job.ACCIWH_LeaseToken)
    assert.equal(finish(job, { outcome: 'review' }), 'f', 'Old worker fenced after reclaim')
    assert.equal(finish(reclaimed, { outcome: 'review', message: 'Provider only record' }), 't')
    assert.equal(finish(reclaimed, { outcome: 'review' }), 'f', 'Terminal completion idempotent')
    assert.equal(sql(`select count(*) from public."ACCI_ReconciliationIssues" where "ACCIRI_WebhookEventID"='${job.ACCIWH_ID}';`), '1')
    assert.equal(sql(`select count(*) from public."ACCI_SyncEvents" where "ACCISE_RequestID"='${job.ACCIWH_ID}';`), '1')
    assert.equal(asService(payload({ name: 'PROCESS-ME' })).duplicate, true)
    assert.deepEqual(claim(), [], 'Duplicate receipt cannot reset completed processing')
    for (const role of ['anon','authenticated']) {
      denied(`set role ${role}; select public.multideck_erpnext_claim_inbound(5);`, /permission denied/)
      denied(`set role ${role}; select public.multideck_erpnext_finish_inbound('${job.ACCIWH_ID}','${job.ACCIWH_LeaseToken}','{}');`, /permission denied/)
    }
    asService(payload({ name: 'RETRY-ME' }))
    let retryJob = claim()[0]
    assert.equal(finish(retryJob, { outcome: 'matched', expectedPayload: {}, referenceId: id(666) }), 't')
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${retryJob.ACCIWH_ID}';`), 'failed', 'No reference cannot pass a match')
    assert.deepEqual(claim(), [], 'Retry respects backoff')
    sql(`update public."ACCI_WebhookEvents" set "ACCIWH_Attempts"=7,"ACCIWH_NextAttemptAt"=now() where "ACCIWH_ID"='${retryJob.ACCIWH_ID}';`)
    retryJob = claim()[0]
    assert.equal(finish(retryJob, { outcome: 'retry' }), 't')
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${retryJob.ACCIWH_ID}';`), 'blocked', 'Exhausted retries require review')
    assert.equal(sql(`select count(*) from public."ACCI_ReconciliationIssues" where "ACCIRI_WebhookEventID"='${retryJob.ACCIWH_ID}';`), '1')
    sql(`update public."ACCI_Connections" set "ACCIC_SettingsJSON"='{"partySync":{"siteOrigin":"https://erp.example.test"}}' where "ACCIC_ID"='${id(100)}';
      insert into public."ACCI_ExternalRefs"("ACCIER_ID","ACCIER_ConnectionID","ACCIER_DocumentTypeCode","ACCIER_LocalTable","ACCIER_LocalID","ACCIER_ExternalObjectType","ACCIER_ExternalID")
      values('${id(700)}','${id(100)}','sl_invoice','FIN_Documents','${id(701)}','Sales Invoice','MATCH-ME');`)
    asService(payload({ name: 'MATCH-ME' }))
    const matchJob = claim()[0]
    assert.equal(finish(matchJob, { outcome: 'matched', referenceId: id(700), expectedPayload: {}, reviewedSite: 'https://erp.example.test', message: 'Delivery matched' }), 't')
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${matchJob.ACCIWH_ID}';`), 'synced')
    assert.equal(sql(`select "ACCIWH_ProcessingEvidence"->>'fullLedgerReconciled' from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${matchJob.ACCIWH_ID}';`), 'false')
    asService(payload({ name: 'MATCH-ME', modified: '2026-09-17 12:00:00' }))
    const stale = claim()[0]
    sql(`update public."ACCI_ExternalRefs" set "ACCIER_LastPayloadJSON"='{"new":true}' where "ACCIER_ID"='${id(700)}';`)
    assert.equal(finish(stale, { outcome: 'matched', referenceId: id(700), expectedPayload: {}, reviewedSite: 'https://erp.example.test' }), 't')
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${stale.ACCIWH_ID}';`), 'failed', 'Changed reference invalidates in-flight match')
    // Even a crash during the eighth claim remains recoverable.
    sql(`update public."ACCI_WebhookEvents" set "ACCIWH_ProcessingStatusCode"='processing',"ACCIWH_Attempts"=8,"ACCIWH_LeaseUntil"=now()-interval '1 second' where "ACCIWH_ID"='${stale.ACCIWH_ID}';`)
    const finalRecovery = claim()[0]
    assert.equal(finalRecovery.ACCIWH_ID, stale.ACCIWH_ID)
    sql(`update public."cmp_LegalEntities" set "LegalEntity_IsActive"=false where "LegalEntity_ID"='${id(1)}';`)
    assert.equal(finish(finalRecovery, { outcome: 'matched', referenceId: id(700), expectedPayload: {new:true}, reviewedSite: 'https://erp.example.test' }), 't')
    assert.equal(sql(`select "ACCIWH_ProcessingStatusCode" from public."ACCI_WebhookEvents" where "ACCIWH_ID"='${stale.ACCIWH_ID}';`), 'blocked', 'Revocation takes effect before completion')
    assert.equal(JSON.parse(sql(`set role service_role; select public.multideck_erpnext_inbound_health('${id(101)}');`)).attention, 0, 'Health does not mix connections')
    denied(`set role authenticated; select public.multideck_erpnext_inbound_health('${id(100)}');`, /permission denied/)


  } finally {
    if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
