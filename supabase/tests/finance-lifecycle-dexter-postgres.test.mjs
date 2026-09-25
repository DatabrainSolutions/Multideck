import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = readFileSync(new URL('../migrations/20260925080746_finance_lifecycle_dexter_parity.sql', import.meta.url), 'utf8')
const resolutionMigration = readFileSync(new URL('../migrations/20260925081955_finance_charge_case_dexter_parity.sql', import.meta.url), 'utf8')
const vatDexterMigration = readFileSync(new URL('../migrations/20260925083833_accounting_period_vat_control_dexter_parity.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('finance lifecycle Dexter reads and watches stay tenant scoped and permission aware', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'finance-lifecycle-dexter-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid);
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "FIN_ChargeLifecycleQueue"(legal_entity_id uuid,charge_id uuid,source_revision bigint,status text,
        event_types text[],amount_local numeric,reason text,next_action text,last_queued_at timestamptz default now());
      create table "FIN_ChargeCorrections"(id uuid,legal_entity_id uuid,charge_id uuid,kind text,status text,
        target_balance numeric,delta numeric,period_id uuid,prepared_at timestamptz,approved_at timestamptz,
        posting_batch_id uuid,prepared_reason text);
      create table "FIN_RecognitionMandates"(id uuid,legal_entity_id uuid,status text,cost_enabled boolean,
        revenue_enabled boolean,effective_date date,revenue_service_rule text,prepared_at timestamptz,
        approved_at timestamptz,paused_at timestamptz);
      create table "FIN_Periods"("FINPeriod_ID" uuid,"FINPeriod_Code" text,"FINPeriod_Name" text);
      create table "FIN_AccountingCloseReviews"(id uuid,legal_entity_id uuid,period_id uuid,source_digest text,
        snapshot jsonb,prepared_at timestamptz);
      create table "FIN_AccountingClosedPacks"(id uuid,legal_entity_id uuid,period_id uuid,source_digest text,closed_at timestamptz);
      create table "FIN_ChargeCaseResolutions"(id uuid,legal_entity_id uuid,charge_id uuid,queue_revision bigint,status text,
        prepared_reason text,prepared_at timestamptz,approved_at timestamptz);
      create table "FIN_AccountingVatControlReviews"(id uuid,legal_entity_id uuid,period_id uuid,source_digest text,
        inventory jsonb,prepared_at timestamptz);
      create table "FIN_AccountingVatControlApprovals"(id uuid,legal_entity_id uuid,period_id uuid,review_id uuid,
        source_digest text,approved_at timestamptz);
      create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Description" text,"AIDexterDomain_UpdatedAt" timestamptz,
        "AIDexterDomain_Name" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_DataCategoriesJSON" jsonb);
      create table "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text,
        "AIDexterWatchCapability_FieldsJSON" jsonb,"AIDexterWatchCapability_UpdatedAt" timestamptz,
        "AIDexterWatchCapability_Name" text,"AIDexterWatchCapability_RequiredPermissionsJSON" jsonb);
      create table "AI_DexterWatches"("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_OwnerUserID" uuid,
        "AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
      create table "AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,
        "AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,
        "AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
      create function public._multideck_dexter_has_permission(p_actor uuid,p_permission text) returns boolean
        language sql stable as $$ select exists(select 1 from "cmp_Users" where "User_ID"=p_actor and "User_AccessStatus"='active') $$;
      create function public.multideck_dexter_domain_finance(uuid,text,integer) returns jsonb language sql as $$ select '[]'::jsonb $$;
      insert into "sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Description","AIDexterDomain_UpdatedAt") values('finance','Original',now());
      insert into "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_UpdatedAt") values('finance','Original','["status"]',now());
      insert into "cmp_LegalEntities" values('${id(1)}','${id(10)}'),('${id(2)}','${id(20)}');
      insert into "cmp_Users" values('${id(11)}','${id(10)}','active'),('${id(12)}','${id(10)}','disabled'),('${id(21)}','${id(20)}','active');
      insert into "FIN_Periods" values('${id(31)}','202609','September'),('${id(32)}','202609','September');
      insert into "AI_DexterWatches" values('${id(10)}','${id(11)}','finance','active','${id(41)}'),
        ('${id(20)}','${id(21)}','finance','active','${id(42)}');`)
    sql(migration)
    sql(resolutionMigration)
    sql(vatDexterMigration)
    sql(`insert into "FIN_ChargeLifecycleQueue" values('${id(1)}','${id(41)}',1,'pending','{charge_changed}',100,'New source','Review',now()),
      ('${id(2)}','${id(42)}',1,'pending','{charge_changed}',200,'Foreign','Review',now());`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'`), '1')
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(20)}'`), '1')
    sql(`update "FIN_ChargeLifecycleQueue" set reason='New source' where charge_id='${id(41)}';`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'`), '1')
    sql(`update "FIN_ChargeLifecycleQueue" set status='review',reason='Late source' where charge_id='${id(41)}';`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'`), '2')
    sql(`update "AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_CompanyID"='${id(10)}';
      update "FIN_ChargeLifecycleQueue" set status='pending' where charge_id='${id(41)}';`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'`), '2')
    sql(`update "AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_CompanyID"='${id(10)}';
      update "cmp_Users" set "User_AccessStatus"='disabled' where "User_ID"='${id(11)}';
      update "FIN_ChargeLifecycleQueue" set status='review' where charge_id='${id(41)}';`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'`), '2')
    const own = JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(10)}','',25)`))
    assert.equal(own.length, 1)
    assert.equal(own[0].recordId, id(41))
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(20)}','',25)`)).length, 1)
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(10)}','Foreign',25)`)).length, 0)
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_dexter_domain_finance(uuid,text,integer)','EXECUTE')`), 'f')
    assert.equal(sql(`select has_function_privilege('service_role','public.multideck_dexter_domain_finance(uuid,text,integer)','EXECUTE')`), 't')
    sql(`update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"='${id(11)}';
      insert into "FIN_ChargeCaseResolutions" values('${id(51)}','${id(1)}','${id(41)}',3,'prepared','Reviewed unchanged balance',now(),null),
        ('${id(52)}','${id(2)}','${id(42)}',3,'prepared','Foreign reviewed balance',now(),null);`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'
      and "AIDexterWatchSignal_SourceTable"='FIN_ChargeCaseResolutions'`), '1')
    assert.equal(sql(`select "AIDexterWatchSignal_SourceID" from "AI_DexterWatchSignals"
      where "AIDexterWatchSignal_SourceTable"='FIN_ChargeCaseResolutions' and "AIDexterWatchSignal_CompanyID"='${id(10)}'`), id(41))
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(10)}','Reviewed unchanged',25)`))[0].recordId, id(51))
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(10)}','Foreign reviewed',25)`)).length, 0)
    sql(`insert into "FIN_ChargeCorrections" values('${id(61)}','${id(1)}','${id(41)}','cost','prepared',80,-20,'${id(31)}',now(),null,null,'Reviewed late estimate');
      insert into "AI_DexterWatches" values('${id(10)}','${id(11)}','finance','active','${id(31)}');
      insert into "FIN_AccountingCloseReviews" values('${id(62)}','${id(1)}','${id(31)}','digest','{"blockers":[]}',now());
      insert into "FIN_AccountingClosedPacks" values('${id(63)}','${id(1)}','${id(31)}','digest',now());`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'
      and "AIDexterWatchSignal_SourceID"='${id(41)}' and "AIDexterWatchSignal_SourceTable"='FIN_ChargeCorrections'`), '1')
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(10)}'
      and "AIDexterWatchSignal_SourceID"='${id(31)}' and "AIDexterWatchSignal_SourceTable" in ('FIN_AccountingCloseReviews','FIN_AccountingClosedPacks')`), '2')
    sql(`insert into "AI_DexterWatches" values('${id(10)}','${id(11)}','accounting_vat_control','active','${id(31)}');
      insert into "FIN_AccountingVatControlReviews" values('${id(71)}','${id(1)}','${id(31)}',repeat('a',64),'{"lineCount":1,"openingExcludedLines":0}',now()),
        ('${id(72)}','${id(2)}','${id(32)}',repeat('b',64),'{"lineCount":1,"openingExcludedLines":0}',now());
      insert into "FIN_AccountingVatControlApprovals" values('${id(73)}','${id(1)}','${id(31)}','${id(71)}',repeat('a',64),now());`)
    assert.equal(sql(`select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='accounting_vat_control'
      and "AIDexterWatchSignal_CompanyID"='${id(10)}' and "AIDexterWatchSignal_SourceID"='${id(31)}'`), '2')
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_accounting_vat_control('${id(10)}','September',25)`)).length, 2)
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_accounting_vat_control('${id(10)}','${id(72)}',25)`)).length, 0)
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_dexter_domain_accounting_vat_control(uuid,text,integer)','EXECUTE')`), 'f')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
