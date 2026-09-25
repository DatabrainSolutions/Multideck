import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// One command for CI and local releases. Never allow PostgreSQL fixtures to
// silently skip and turn an unavailable security check into a green build.
const configured = process.env.PG_TEST_BIN
const discovered = configured ? null : spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
const bin = configured || discovered.stdout?.trim()
assert.ok(bin, 'PostgreSQL is required. Set PG_TEST_BIN to its bin directory.')
const concurrency = Number(process.env.PG_TEST_CONCURRENCY || 4)
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 4,
  'PG_TEST_CONCURRENCY must be an integer from 1 to 4.')
for (const command of ['initdb', 'pg_ctl', 'psql']) {
  assert.equal(spawnSync(join(bin, command), ['--version']).status, 0, `${command} must be available in ${bin}`)
}
const tests = [
  'charge-catalogue-postgres.test.mjs',
  'nominal-classification-postgres.test.mjs',
  'nominal-structure-postgres.test.mjs',
  'cost-accrual-review-postgres.test.mjs',
  'accounting-profile-guardrails-postgres.test.mjs',
  'balanced-postings-postgres.test.mjs',
  'crm-sales-workflow-postgres.test.mjs',
  'crm-sales-analysis-cache-postgres.test.mjs',
  'crm-sales-briefings-postgres.test.mjs',
  'crm-sales-insight-series-postgres.test.mjs',
  'crm-sales-narrative-postgres.test.mjs',
  'crm-sales-insights.test.mjs',
  'crm-sales-insights-handler.test.mjs',
  'dexter-deal-sales-review.test.mjs',
  'dexter-strict-action-schema.test.mjs',
  'warehouse-item-import-postgres.test.mjs',
  'warehouse-import-watch-postgres.test.mjs',
  'warehouse-pricing-postgres.test.mjs',
  'mileage-claims-postgres.test.mjs',
  'paid-seat-capacity-postgres.test.mjs',
  'cloud-product-database.test.mjs',
  'cloud-phone-boundary-postgres.test.mjs',
  'customs-reference-preferences-postgres.test.mjs',
  'email-signatures-postgres.test.mjs',
  'email-tracking-postgres.test.mjs',
  'crm-contact-communication-access-postgres.test.mjs',
  'general-ledger-postgres.test.mjs',
  'finance-baseline-install-postgres.test.mjs',
  'finance-release-manifest-postgres.test.mjs',
  'opening-balance-cutover-postgres.test.mjs',
  'finance-charge-lifecycle-queue-postgres.test.mjs',
  'finance-accounting-period-close-postgres.test.mjs',
  'finance-trade-control-postgres.test.mjs',
  'finance-daily-operations-postgres.test.mjs',
  'finance-daily-model.test.mjs',
  'finance-bank-statement-postgres.test.mjs',
  'finance-reconciliation-dexter-postgres.test.mjs',
  'finance-charge-recognition-postgres.test.mjs',
  'charge-mapping-cutover-postgres.test.mjs',
  'finance-native-books-dexter-contract.test.mjs',
  'uk-vat-period-foundation-postgres.test.mjs',
  'uk-vat-staged-provisioning-postgres.test.mjs',
  'finance-nonrecoverable-posting-postgres.test.mjs',
  'uk-vat-hmrc-connection-postgres.test.mjs',
  'accounting-party-lifecycle-postgres.test.mjs',
  'accounting-address-postgres.test.mjs',
  'finance-export-atomic-postgres.test.mjs',
  'erpnext-webhook-receipt-postgres.test.mjs',
  'operational-shared-access-postgres.test.mjs',
  'customs-consistent-workspace-read-postgres.test.mjs',
  'customs-draft-insert-visibility-postgres.test.mjs',
  'notification-permissions-db.test.mjs',
  'reporting-workspace-db.test.mjs',
  'dexter-actor-context-postgres.test.mjs',
  'dexter-voice-postgres.test.mjs',
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
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...tests.map(name => new URL(name, import.meta.url).pathname)], {
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
