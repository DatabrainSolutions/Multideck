import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRef = process.argv[2]
assert.match(projectRef ?? '', /^[a-z]{20}$/, 'Pass the exact disposable Supabase project ref')
const cli = process.env.SUPABASE_CLI || 'npx'
const prefix = process.env.SUPABASE_CLI ? [] : ['--yes', 'supabase']
const sql = fileURLToPath(new URL('finance-provisioned-checks.sql', import.meta.url))
const response = spawnSync(cli, [...prefix, 'db', 'query', '--linked', '--project-ref', projectRef, '--file', sql], {
  encoding: 'utf8', timeout: 120_000, maxBuffer: 100_000,
})
if (response.error) throw response.error
assert.equal(response.status, 0, `${response.stderr}\n${response.stdout}`)
const start = response.stdout.indexOf('{')
assert.ok(start >= 0, 'No structured Supabase query response')
const rows = JSON.parse(response.stdout.slice(start)).rows
assert.equal(rows?.length, 13, 'All thirteen provisioning areas must be checked')
for (const row of rows) assert.equal(row.passed, true, `${row.name} is absent or has the wrong access boundary`)
console.log('13 finance provisioning checks passed on the fresh Supabase project.')
