import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

test('schema-only tenant baseline installs finance release, charge and account boundaries', () => {
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

    const installed = JSON.parse(sql(`select jsonb_build_object(
      'management_period_history', to_regclass('public."FIN_JobPeriodHistory"') is not null,
      'management_close_runs', to_regclass('public."FIN_PeriodCloseRuns"') is not null,
      'management_transition', to_regprocedure('public.multideck_finance_transition_accrual_wip(uuid,uuid,uuid,text,text)') is not null,
      'management_post', to_regprocedure('public.multideck_finance_post_accrual_wip(uuid,uuid,uuid)') is not null,
      'management_reverse', to_regprocedure('public.multideck_finance_reverse_accrual_wip(uuid,uuid,uuid,text,text)') is not null,
      'release_table', to_regclass('public."FIN_AccrualWIPReleases"') is not null,
      'release_trigger', exists(select 1 from pg_trigger where tgname='TR_FIN_Documents_automatic_accrual_wip_release' and not tgisinternal),
      'release_unique_pairs', (select count(*) from pg_constraint where conrelid='public."FIN_AccrualWIPReleases"'::regclass and contype='u' and conname in
        ('FIN_AccrualWIPReleases_FINRelease_DocumentID_FINRelease_Acc_key','FIN_AccrualWIPReleases_FINRelease_DocumentID_FINRelease_WIP_key'))=2,
      'period_end', exists(select 1 from pg_proc where proname='_multideck_finance_ensure_period' and prosrc like '%interval ''1 month''-interval ''1 day''%'),
      'posting_dimension_guard', exists(select 1 from pg_trigger where tgname='TR_FIN_PostingLines_job_dimension_guard' and not tgisinternal),
      'charge_period_table', to_regclass('public."FIN_JobChargePeriodAllocations"') is not null,
      'charge_profit_view', to_regclass('public."FIN_JobChargeProfitability"') is not null,
      'profit_view_invoker', exists(select 1 from pg_class where oid='public."FIN_JobChargeProfitability"'::regclass and reloptions @> array['security_invoker=true']),
      'charge_nominal_trigger', exists(select 1 from pg_trigger where tgname='TR_FIN_default_job_charge_nominals' and not tgisinternal),
      'charge_remap_trigger', exists(select 1 from pg_trigger where tgname='TR_FIN_remap_job_charge_nominals' and not tgisinternal),
      'universal_charge_function', exists(select 1 from pg_proc where proname='multideck_finance_upsert_job_charge'),
      'warehouse_charge_trigger', exists(select 1 from pg_trigger where tgname='TR_FIN_adapt_warehouse_billing_event' and not tgisinternal),
      'legacy_charge_triggers', (select count(*) from pg_trigger where tgname in ('TR_FIN_adapt_legacy_charge_in','TR_FIN_adapt_legacy_charge_out') and not tgisinternal)=2,
      'charge_watch_trigger', exists(select 1 from pg_trigger where tgname='TR_FIN_job_charge_dexter_watch' and not tgisinternal),
      'customer_finance_projection', to_regprocedure('public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)') is not null,
      'customer_projection_service_only', not has_function_privilege('authenticated','public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)','EXECUTE')
        and has_function_privilege('service_role','public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)','EXECUTE')
    );`))
    for (const [name, passed] of Object.entries(installed)) assert.equal(passed, true, `${name} is absent or unsafe in the installed baseline`)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
