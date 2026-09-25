import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const baselinePath = join(root, 'baseline/public-schema.sql')
const migrationsPath = join(root, 'migrations')
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'
const vatMigrations = readdirSync(migrationsPath).filter(name => /^2026092[45]\d{6}_.*\.sql$/.test(name)).sort()

test('staged tenant schema accepts the UK VAT migration chain and source locks', () => {
  assert.ok(vatMigrations.length >= 16, 'Expected the complete UK VAT migration chain')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'vat-staged-provision-'))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, {
      input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024,
    })
    assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    // The real tenant already has these Supabase roles, extensions and Auth objects.
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
    const baseline = readFileSync(baselinePath, 'utf8')
    const boundary = baseline.indexOf(marker)
    assert.ok(boundary > 0 && baseline.indexOf(marker, boundary + 1) < 0,
      'The staged provisioning boundary has changed')
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', join(migrationsPath, '20260918123733_general_ledger_journals.sql')])
    // The hosted provisioner restores the dump preamble for this second stage.
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    run('psql', [...args, '-f', join(migrationsPath, '20260923150858_finance_chart_nominal_resolution.sql')])
    for (const name of vatMigrations) {
      run('psql', [...args, '-f', join(migrationsPath, name)])
    }
    assert.equal(sql(`select count(*) from pg_trigger
      where tgname in ('vat_signed_document_lock','vat_signed_document_line_lock',
        'vat_signed_document_job_link_lock','vat_signed_posting_line_lock',
        'vat_signed_posting_batch_lock') and not tgisinternal`), '5')
    assert.equal(sql(`select count(*) from information_schema.columns
      where table_schema='public' and table_name='FIN_IndirectTaxReconciliations'
        and column_name='reconciled_at'`), '1')
    assert.equal(sql(`select count(*) from pg_class
      where relname='FIN_IndirectTaxPriorPeriodErrorIntake' and relrowsecurity`), '1')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'),
      ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
