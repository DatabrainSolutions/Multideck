import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

test('Finance 1–4 post-snapshot migrations install together on the tenant baseline', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'finance-baseline-install-'))
  const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
  const boundary = baseline.indexOf(marker)
  assert.ok(boundary > 0 && baseline.indexOf(marker, boundary + 1) < 0,
    'The documented journal dependency boundary must remain unique')
  let started = false
  const run = (name, arguments_, input) => {
    const result = spawnSync(join(bin, name), arguments_, {
      input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024,
    })
    assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    // The hosted installer supplies these Supabase roles, schemas and extensions.
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin;
      create role supabase_functions_admin; create role pgsodium_keyholder;
      create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions;
      create extension pgcrypto with schema extensions;
      create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table auth.users(id uuid primary key);`)
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', new URL('migrations/20260918123733_general_ledger_journals.sql', root).pathname])
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)

    // This is the Finance 1–4 manifest against the committed schema snapshot.
    // VAT migrations are a separate release and must not be a hidden dependency.
    const migrations = [
      '20260925070431_finance_accrual_wip_event_queue.sql',
      '20260925070458_finance_daily_operations.sql',
      '20260925070532_charge_mapping_cutover_posting.sql',
      '20260925071010_finance_accounting_period_close.sql',
      '20260925071153_opening_balance_gl_cutover.sql',
      '20260925072009_linked_journal_reversals.sql',
      '20260925072017_finance_trade_control_reconciliation.sql',
      '20260925072611_immutable_committed_native_postings.sql',
      '20260925072948_charge_lifecycle_processing.sql',
      '20260925073046_versioned_charge_mapping_cutovers.sql',
      '20260925073443_charge_recognition_authority.sql',
      '20260925073707_dated_charge_group_accrual_posting.sql',
      '20260925073708_charge_event_initial_recognition.sql',
      '20260925080000_bank_statement_reconciliation.sql',
      '20260925090000_finance_provider_period_reconciliation.sql',
      '20260925100000_finance_reconciliation_dexter.sql',
    ]
    const laterMigrations = readdirSync(new URL('migrations/', root))
      .filter(name => name >= '20260925070431' && name.endsWith('.sql') && !/_(?:uk_vat|hmrc)_/.test(name))
      .sort()
    assert.deepEqual(migrations, laterMigrations,
      'Review every new post-snapshot migration for this release and update its ordered manifest.')
    for (const migration of migrations) {
      run('psql', [...args, '-f', new URL(`migrations/${migration}`, root).pathname])
    }

    const installed = JSON.parse(sql(`select jsonb_build_object(
      'lifecycle_queue', to_regclass('public."FIN_ChargeLifecycleQueue"') is not null,
      'supplier_orders', to_regclass('public."FIN_SupplierPurchaseOrders"') is not null,
      'mapping_cutovers', to_regclass('public."FIN_ChargeMappingCutovers"') is not null,
      'close_reviews', to_regclass('public."FIN_AccountingCloseReviews"') is not null,
      'opening_packages', to_regclass('public."FIN_OpeningBalancePackages"') is not null,
      'journal_reversal', exists(select 1 from pg_attribute where attrelid='public."FIN_Journals"'::regclass and attname='reversal_of_id' and not attisdropped),
      'trade_bridge', exists(select 1 from pg_proc where proname='multideck_finance_trade_control_bridge'),
      'committed_batch_guard', exists(select 1 from pg_trigger where tgname='AA_FIN_PostingBatches_committed_immutable' and not tgisinternal),
      'committed_line_guard', exists(select 1 from pg_trigger where tgname='AA_FIN_PostingLines_committed_immutable' and not tgisinternal),
      'lifecycle_process', to_regprocedure('public.multideck_charge_lifecycle_process(uuid,uuid,bigint)') is not null,
      'mapping_pin', to_regprocedure('public._multideck_finance_pin_document_charge_mapping()') is not null,
      'recognition_mandates', to_regclass('public."FIN_RecognitionMandates"') is not null,
      'event_recognitions', to_regclass('public."FIN_ChargeEventRecognitions"') is not null,
      'bank_reconciliation_watch', exists(select 1 from pg_trigger where tgname='bank_reconciliation_watch' and not tgisinternal),
      'bank_control', exists(select 1 from pg_proc where proname='multideck_bank_statement_control'),
      'provider_period_runs', to_regclass('public."ACCI_PeriodReconciliationRuns"') is not null,
      'provider_period_differences', to_regclass('public."ACCI_PeriodReconciliationDifferences"') is not null,
      'bank_control_service_only', not has_function_privilege('authenticated','public.multideck_bank_statement_control(uuid,uuid,uuid,uuid)','EXECUTE')
        and has_function_privilege('service_role','public.multideck_bank_statement_control(uuid,uuid,uuid,uuid)','EXECUTE'),
      'provider_runs_service_only', not has_table_privilege('authenticated','public."ACCI_PeriodReconciliationRuns"','SELECT')
        and has_table_privilege('service_role','public."ACCI_PeriodReconciliationRuns"','SELECT')
    );`))
    for (const [name, passed] of Object.entries(installed)) assert.equal(passed, true, `${name} is absent or unsafe in the installed baseline`)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
