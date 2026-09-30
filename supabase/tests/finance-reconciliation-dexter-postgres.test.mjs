import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const root = new URL('../', import.meta.url)
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

test('bank and provider reconciliation Dexter domains and watches install with least privilege', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finance-reconciliation-dexter-'))
  const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
  const boundary = baseline.indexOf(marker)
  assert.ok(boundary > 0)
  let started = false
  const run = (command, arguments_, input) => {
    const result = spawnSync(join(bin, command), arguments_, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin;
      create role supabase_functions_admin; create role pgsodium_keyholder;
      create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions; create extension pgcrypto with schema extensions; create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table auth.users(id uuid primary key);`)
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', new URL('migrations/20260918123733_general_ledger_journals.sql', root).pathname])
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    for (const name of ['20260925071153_opening_balance_gl_cutover.sql', '20260925075621_opening_source_items_and_operational_markers.sql', '20260925080000_bank_statement_reconciliation.sql', '20260925085000_finance_opening_mirror_delivery.sql', '20260925090000_finance_provider_period_reconciliation.sql', '20260925100000_finance_reconciliation_dexter.sql']) {
      run('psql', [...args, '-f', new URL(`migrations/${name}`, root).pathname])
    }
    const status = JSON.parse(sql(`select jsonb_build_object(
      'bank_domain',(select count(*)=1 from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code"='bank_reconciliation'),
      'provider_domain',(select count(*)=1 from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code"='provider_reconciliation'),
      'bank_watch',(select count(*)=1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='bank_reconciliation'),
      'provider_watch',(select count(*)=1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='provider_reconciliation'),
      'bank_trigger',exists(select 1 from pg_trigger where tgname='bank_reconciliation_watch' and not tgisinternal),
      'provider_trigger',exists(select 1 from pg_trigger where tgname='provider_reconciliation_watch' and not tgisinternal),
      'service_only',not has_function_privilege('authenticated','public.multideck_dexter_domain_provider_reconciliation(uuid,text,integer)','EXECUTE')
        and has_function_privilege('service_role','public.multideck_dexter_domain_provider_reconciliation(uuid,text,integer)','EXECUTE')
    );`))
    for (const [key, value] of Object.entries(status)) assert.equal(value, true, key)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
