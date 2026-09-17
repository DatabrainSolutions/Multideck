import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Isolated socket-only PostgreSQL. Never accepts a hosted connection string.
export function withProductPostgres(runTests) {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'multideck-product-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => spawnSync(join(bin, command), args, {
    input, encoding: 'utf8', timeout: 30_000,
  })
  const ok = result => assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || result.error || ''}`)
  try {
    ok(run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']))
    ok(run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start']))
    started = true
    const sql = input => run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
    ok(sql('create role anon; create role authenticated; create role service_role bypassrls;'))
    runTests(sql, ok)
  } finally {
    if (started) ok(run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']))
    // Only the freshly allocated fixture directory is removed.
    rmSync(directory, { recursive: true, force: true })
  }
}
