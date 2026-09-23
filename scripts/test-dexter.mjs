import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const discovered = process.env.PG_TEST_BIN ? null : spawnSync('pg_config', ['--bindir'], {encoding:'utf8'})
const bin = process.env.PG_TEST_BIN || discovered?.stdout?.trim()
assert.ok(bin, 'PostgreSQL is required for Dexter lifecycle and isolation tests. Set PG_TEST_BIN to its bin directory.')
for (const command of ['initdb','pg_ctl','psql']) {
  assert.equal(spawnSync(join(bin,command),['--version']).status,0,`${command} must be available in ${bin}`)
}
const backend = readdirSync(join(root,'supabase/tests'))
  .filter(name => /^(dexter-|agent-dexter-).*\.test\.mjs$/.test(name))
  .map(name => `supabase/tests/${name}`)
// These TypeScript tests use Node. The separate Deno OCR/scope suites remain
// under their existing runtime; this command does not claim provider E2E proof.
const typedBackend = ['dexter-background-outcome','dexter-response-format','dexter-activity','dexter-conversation-artifacts']
  .map(name => `supabase/tests/${name}.test.ts`)
const client = readdirSync(join(root,'multideck.client/tests'))
  .filter(name => /^dexter-.*\.test\.(mjs|ts)$/.test(name))
  .map(name => `multideck.client/tests/${name}`)
const result = spawnSync(process.execPath, [
  '--import','./supabase/tests/register-typescript.mjs',
  '--test','--test-concurrency=4',...backend.sort(),...typedBackend,...client.sort(),
], {cwd:root,stdio:'inherit',env:{...process.env,PG_TEST_BIN:bin,PATH:`${bin}:${process.env.PATH ?? ''}`}})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
