// Local-only QA: production React/API code, real CRM migrations and disposable PostgreSQL.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { seedCrmSalesPreview } from './seed.mjs'
import { illustrativeSalesThemes } from './illustrative-themes.mjs'
import { applyCrmInsightSchema } from './insight-schema.mjs'
import { createCrmSalesFixture } from '../../../supabase/tests/crm-sales-fixture.mjs'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const root = resolve(import.meta.dirname, '../..')
const directory = mkdtempSync(join(tmpdir(), 'multideck-crm-sales-preview-'))
const run = (command, args, input) => spawnSync(join(bin, command), args, { input, encoding: 'utf8' })
const ok = result => assert.equal(result.status, 0, result.stderr)
const sql = input => run('psql', ['-X', '-At', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const rpcArgs = {
 multideck_crm_get_sales_briefing: {},
 multideck_crm_get_sales_insights: { p_days: 'integer', p_pipeline_id: 'uuid', p_owner_id: 'uuid' },
 multideck_crm_get_deal_essential: { p_deal_id: 'uuid' },
 multideck_crm_deal_people: { p_deal_id: 'uuid' },
 multideck_crm_pipeline_settings: {},
 multideck_crm_update_deal: { p_deal_id: 'uuid', p_expected_version: 'integer', p_input: 'jsonb' },
 multideck_crm_set_deal_next_action: { p_deal_id: 'uuid', p_expected_version: 'integer', p_input: 'jsonb' },
 multideck_crm_complete_deal_next_action: { p_deal_id: 'uuid', p_expected_version: 'integer', p_action_id: 'uuid', p_note: 'text' },
 multideck_crm_lose_deal: { p_deal_id: 'uuid', p_expected_version: 'integer', p_input: 'jsonb' },
 multideck_crm_move_deal_stage: { p_deal_id: 'uuid', p_pipeline_id: 'uuid', p_pipeline_stage_id: 'uuid' },
 multideck_crm_reopen_deal: { p_deal_id: 'uuid', p_expected_version: 'bigint', p_pipeline_stage_id: 'uuid', p_reason: 'text' },
 multideck_crm_win_deal: { p_deal_id: 'uuid', p_pipeline_stage_id: 'uuid', p_reason: 'text' },
}
ok(run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']))
ok(run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'pg.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start']))
ok(sql('create role anon; create role authenticated; create role service_role bypassrls;'))
try { createCrmSalesFixture(sql, ok); applyCrmInsightSchema(sql, ok); seedCrmSalesPreview(sql, ok) } catch (error) { run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']); rmSync(directory, { recursive: true, force: true }); throw error }
const server = await createServer({
 configFile: false, envFile: false, root, cacheDir: join(directory, 'vite-cache'),
 plugins: [react(), tailwind(), { name: 'crm-sales-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (['/', '/crm'].includes(req.url?.split('?')[0] ?? '') || req.url?.startsWith('/crm/') || req.url?.startsWith('/to-do')) { req.url = '/tests/crm-sales-preview/index.html'; return next() }
  if (!['/__crm_sales_test', '/__crm_sales_ai'].includes(req.url)) return next()
  res.setHeader('Content-Type', 'application/json')
  try {
   if (req.method !== 'POST') throw new Error('POST required')
   let raw = ''; for await (const part of req) { raw += part; if (raw.length > 100000) throw new Error('Too much input') }
   if (req.url === '/__crm_sales_ai') { res.statusCode = 503; res.end(JSON.stringify({ message: 'AI generation is unavailable in this isolated local verification workspace. No sales data was sent to a model.' })); return }
   const { user, name, args = {}, illustrative = false } = JSON.parse(raw)
   if (!/^[1-6]$/.test(String(user))) throw new Error('Fixture operator required')
   const allowed = rpcArgs[name]
   if (!allowed || Object.keys(args).some(key => !Object.hasOwn(allowed, key))) throw new Error('Unsupported QA operation')
   const values = Object.entries(args).map(([key, value]) => `${key} => ${value === null ? 'null' : quote(allowed[key] === 'jsonb' ? JSON.stringify(value) : value)}::${allowed[key]}`)
   const result = sql(`set role authenticated; select login(${Number(user)}); select public.${name}(${values.join(',')});`)
   if (result.status) { res.end(JSON.stringify({ data: null, error: { code: result.stderr.includes('CRM_CONFLICT:') ? 'P0001' : /permission|access|not authorised|not allowed/i.test(result.stderr) ? '42501' : '22023', message: result.stderr.match(/ERROR:\s+([^\n]+)/)?.[1] || 'Database request failed' } })); return }
   let data = JSON.parse(result.stdout.trim().split('\n').at(-1))
   if (illustrative === true && name === 'multideck_crm_get_sales_briefing') {
    const snapshotRead = sql(`set role authenticated; select login(${Number(user)}); select public.multideck_crm_get_sales_insights(90,null,null);`)
    ok(snapshotRead)
    const snapshot = JSON.parse(snapshotRead.stdout.trim().split('\n').at(-1))
    const illustration = illustrativeSalesThemes(snapshot)
    data = { ...data, result: illustration, generatedAt: illustration.generatedAt, status: 'ready', resultWithheld: false }
   }
   res.end(JSON.stringify({ data, error: null }))
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ data: null, error: { code: '22023', message: error.message } })) }
 }) } }],
 resolve: { dedupe: ['react', 'react-dom'], alias: [{ find: '@/lib/supabase', replacement: join(root, 'tests/crm-sales-preview/supabase.ts') }, { find: '@', replacement: join(root, 'src') }] },
 define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' },
 server: { host: '127.0.0.1', port: Number(process.env.CRM_SALES_QA_PORT || 3001), strictPort: true },
})
await server.listen(); console.log('CRM sales QA: http://127.0.0.1:3001/crm (real disposable PostgreSQL)')
let closing = false
async function close() { if (closing) return; closing = true; await server.close(); run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']); rmSync(directory, { recursive: true, force: true }); process.exit(0) }
process.on('SIGINT', close); process.on('SIGTERM', close)
