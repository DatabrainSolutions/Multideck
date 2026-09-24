import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
const receipt = readFileSync(new URL('../migrations/20260915104214_erpnext_webhook_receipt_guardrails.sql', import.meta.url), 'utf8')
const inbound = readFileSync(new URL('../migrations/20260917194628_erpnext_reconciliation_and_inbound.sql', import.meta.url), 'utf8')
const catchup = readFileSync(new URL('../migrations/20260923130000_erpnext_checkpointed_catchup.sql', import.meta.url), 'utf8')
const table = name => {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0, name)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const quote = value => `'${value.replaceAll("'", "''")}'`

test('catch-up pages are atomic, scoped and fenced, without forging webhook signatures', () => {
  assert.equal(spawnSync(join(bin,'initdb'),['--version']).status,0,'PostgreSQL required')
  const directory = mkdtempSync(join(tmpdir(),'erpnext-catchup-'))
  let started = false
  const run = (command,args,input) => {
    const result = spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:30_000,maxBuffer:8*1024*1024})
    assert.equal(result.status,0,`${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout.trim()
  }
  const args=['-X','-qAt','-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql = input => run('psql',args,input)
  const denied = (input,pattern) => {
    const result=spawnSync(join(bin,'psql'),args,{input,encoding:'utf8',timeout:30_000})
    assert.notEqual(result.status,0)
    assert.match(result.stderr,pattern)
  }
  const page = (revision=0,rows=[{name:'SI-1',company:'Exact Co',modified:'2026-09-23 01:00:00.000000'}]) =>
    `select public.multideck_erpnext_record_scan_page('${id(100)}','Sales Invoice',${revision},'1900-01-01 00:00:00.000000','2026-09-23 01:00:00.000000',null,null,${quote(JSON.stringify(rows))}::jsonb,false,'https://erp.example.test');`
  try {
    run('initdb',['-D',join(directory,'data'),'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'log'),'-o',`-k ${directory} -c listen_addresses=''`,'-w','start'])
    started=true
    sql(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
      ${table('ACCI_Connections')}; ${table('ACCI_WebhookEvents')};
      ${table('ACCI_ExternalRefs')}; ${table('ACCI_ReconciliationIssues')}; ${table('ACCI_SyncEvents')};
      alter table public."ACCI_Connections" add primary key ("ACCIC_ID");
      alter table public."ACCI_WebhookEvents" add primary key ("ACCIWH_ID");
      alter table public."ACCI_ExternalRefs" add primary key ("ACCIER_ID");
      grant select,update on public."ACCI_Connections",public."cmp_LegalEntities",public."ACCI_ExternalRefs" to service_role;
      grant all on public."ACCI_WebhookEvents",public."ACCI_ReconciliationIssues",public."ACCI_SyncEvents" to service_role;
      insert into public."cmp_LegalEntities" values('${id(1)}','${id(2)}',true);
      insert into public."ACCI_Connections"("ACCIC_ID","ACCIC_ProviderCode","ACCIC_Name","ACCIC_StatusCode","ACCIC_LegalEntityID","ACCIC_AuthType","ACCIC_ExternalTenantName","ACCIC_SettingsJSON")
        values('${id(100)}','erpnext','ERPNext','active','${id(1)}','api_token','Exact Co','{"partySync":{"siteOrigin":"https://erp.example.test"}}');
      ${receipt} ${inbound} ${catchup}
    `)
    assert.equal(sql(`set role service_role; ${page()}`),'t')
    assert.equal(sql(`select "ACCIWH_SourceCode"||'|'||"ACCIWH_SignatureVerified"||'|'||"ACCIWH_ExternalID" from public."ACCI_WebhookEvents";`),'scan|false|SI-1')
    assert.equal(sql(`select watermark::text||'|'||revision from public."ACCI_ProviderScanCursors";`),'2026-09-23 01:00:00|1')
    assert.equal(sql(`set role service_role; ${page()}`),'f','stale revision cannot overwrite checkpoint')
    assert.equal(sql(`select count(*) from public."ACCI_WebhookEvents";`),'1')
    const claimed=JSON.parse(sql(`set role service_role; select public.multideck_erpnext_claim_inbound(5);`))
    assert.equal(claimed.length,1)
    assert.equal(claimed[0].ACCIWH_SourceCode,'scan')
    denied(`set role authenticated; ${page()}`,/permission denied/)
    denied(`set role authenticated; select * from public."ACCI_ProviderScanCursors";`,/permission denied/)
    denied(`set role service_role; select public.multideck_erpnext_record_scan_page('${id(100)}','Sales Invoice',1,'2026-09-23 00:00:00.000000','2026-09-23 02:00:00.000000',null,null,'[{"name":"SI-2","company":"Foreign","modified":"2026-09-23 02:00:00.000000"}]',false,'https://erp.example.test');`,/invalid identity/)
    assert.equal(sql(`select count(*) from public."ACCI_WebhookEvents";`),'1')
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public."ACCI_ProviderScanCursors"'::regclass;`),'t')
  } finally {
    if(started) spawnSync(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-m','immediate','-w','stop'],{encoding:'utf8',timeout:30_000})
    rmSync(directory,{recursive:true,force:true})
  }
})
