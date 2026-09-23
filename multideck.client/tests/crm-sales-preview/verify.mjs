import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createCrmSalesFixture } from '../../../supabase/tests/crm-sales-fixture.mjs'
import { seedCrmSalesPreview } from './seed.mjs'
import { illustrativeSalesThemes } from './illustrative-themes.mjs'
import { applyCrmInsightSchema } from './insight-schema.mjs'
const directory = mkdtempSync(join(tmpdir(), 'crm-sales-page-check-'))
const run = (name, args, input) => spawnSync(join(process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin', name), args, { encoding: 'utf8', input })
const ok = result => assert.equal(result.status, 0, result.stderr)
const sql = input => run('psql', ['-X', '-At', '-h', directory, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
try {
 ok(run('initdb', ['-D', directory + '/data', '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']))
 ok(run('pg_ctl', ['-D', directory + '/data', '-l', directory + '/log', '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start']))
 ok(sql('create role anon; create role authenticated; create role service_role bypassrls;'))
 createCrmSalesFixture(sql, ok)
 applyCrmInsightSchema(sql, ok)
 seedCrmSalesPreview(sql, ok)
 for (const [name, expression, check] of [
  ['deal detail', 'multideck_crm_get_deal_essential(fid(1))', value => assert.equal(value.name, 'European road freight renewal')],
  ['people', 'multideck_crm_deal_people(fid(1))', value => assert.ok(value.owners.length > 0)],
  ['pipeline settings', 'multideck_crm_pipeline_settings()', value => assert.ok(value.pipelines.length > 0)],
  ['saved briefing', 'multideck_crm_get_sales_briefing()', value => { assert.equal(value.result, null); assert.equal(value.automationReady, false) }],
  ['empty pipeline', 'multideck_crm_get_sales_insights(90,fid(299),null)', value => { assert.equal(value.coverage.totalDeals, 0); assert.equal(value.summary.openDeals, 0); assert.equal(value.trend.buckets.length, 0) }],
  ['insights', 'multideck_crm_get_sales_insights()', value => { assert.equal(value.summary.wonDeals, 13); assert.equal(value.summary.lostDeals, 7); assert.equal(value.summary.openDeals, 8); assert.ok(value.summary.slippingDeals >= 4); assert.ok(value.trend.buckets.length >= 8); assert.ok(value.narrative.documents.length >= 20); const illustrated = illustrativeSalesThemes(value); assert.equal(illustrated.schemaVersion, 3); assert.equal(illustrated.themes.length, 4); assert.ok(illustrated.themes.every(theme => theme.memberships.length >= 2)) }],
 ]) {
  const result = sql(`set role authenticated; select login(1); select ${expression};`)
  ok(result)
  check(JSON.parse(result.stdout.trim().split('\n').at(-1)))
  console.log(`${name}: passed`)
 }
} finally {
 run('pg_ctl', ['-D', directory + '/data', '-m', 'immediate', '-w', 'stop'])
 rmSync(directory, { recursive: true, force: true })
}
