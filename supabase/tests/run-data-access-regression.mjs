import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// One command for CI and local releases. Never allow PostgreSQL fixtures to
// silently skip and turn an unavailable security check into a green build.
const configured = process.env.PG_TEST_BIN
const discovered = configured ? null : spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
const bin = configured || discovered.stdout?.trim()
assert.ok(bin, 'PostgreSQL is required. Set PG_TEST_BIN to its bin directory.')
for (const command of ['initdb', 'pg_ctl', 'psql']) {
  assert.equal(spawnSync(join(bin, command), ['--version']).status, 0, `${command} must be available in ${bin}`)
}
const tests = [
  'operational-shared-access-postgres.test.mjs',
  'customs-consistent-workspace-read-postgres.test.mjs',
  'customs-draft-insert-visibility-postgres.test.mjs',
  'notification-permissions-db.test.mjs',
  'reporting-workspace-db.test.mjs',
  'dexter-actor-context-postgres.test.mjs',
  'dexter-approval-role-postgres.test.mjs',
  'dexter-deal-watch-postgres.test.mjs',
  'dexter-address-watch-postgres.test.mjs',
  'booking-provisional-lifecycle-postgres.test.mjs',
  'quote-response-public-boundary-postgres.test.mjs',
  'operational-role-quote-booking-parity-contract.test.mjs',
  'booking-role-permissions-contract.test.mjs',
  'booking-quote-charge-operational-permission-contract.test.mjs',
  'crm-current-role-permissions.test.mjs',
  'warehouse-customer-purchase-order-boundary-contract.test.mjs',
]
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...tests.map(name => new URL(name, import.meta.url).pathname)], {
  stdio: 'inherit', env: { ...process.env, PG_TEST_BIN: bin, PATH: `${bin}:${process.env.PATH || ''}` },
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
// These broad suites also contain unrelated visual/copy checks. Run their
// access-boundary cases here; their full suites remain unchanged and separate.
const contracts = spawnSync(process.execPath, ['--test',
  '--test-name-pattern=^(calendar data remains service-only|operational ribbons inherit|public booking uses|provider boundaries|all finance reads|finance drafts derive|finance administration is|administration saves only|party finance defaults|legacy finance reports)',
  new URL('calendar-platform-contract.test.mjs', import.meta.url).pathname,
  new URL('finance-subledger-foundation-contract.test.mjs', import.meta.url).pathname,
], { stdio: 'inherit', env: { ...process.env, PG_TEST_BIN: bin } })
if (contracts.error) throw contracts.error
process.exitCode = contracts.status ?? 1
