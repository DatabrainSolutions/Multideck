import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { adminDashboardFixture } from './admin-dashboard-fixture.mjs'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function moduleAt(path, dependencies = {}) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', transformSync(read(path), { loader: 'ts', format: 'cjs' }).code)(name => {
    assert.ok(name in dependencies, `Explicit test dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

// React's commit ordering: changed layout effects commit before passive cleanups.
// This harness executes the real hooks and their browser event listeners.
function hookCommit() {
  const slots = []
  let position = 0, pending = []
  const effect = type => (setup, deps) => {
    const index = position++, previous = slots[index]
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) pending.push({ index, type, setup, deps })
  }
  return {
    react: { useRef: value => slots[position++] ??= { current: value }, useEffect: effect('passive'), useLayoutEffect: effect('layout') },
    render(fn) {
      position = 0; pending = []; fn()
      for (const type of ['layout', 'passive']) {
        const changes = pending.filter(item => item.type === type)
        changes.forEach(item => slots[item.index]?.cleanup?.())
        changes.forEach(item => { slots[item.index] = { ...item, cleanup: item.setup() } })
      }
    },
  }
}

test('Usage follows routes, excludes hidden time and never attributes an old session to the next actor', async () => {
  const saved = { window: globalThis.window, document: globalThis.document, now: Date.now }
  let now = Date.parse('2026-09-29T10:00:00Z'), sessionActor = 'actor-a', focused = true, tick
  const requests = [], commit = hookCommit()
  const window = new EventTarget(), document = new EventTarget()
  window.setInterval = fn => { tick = fn; return 1 }; window.clearInterval = () => {}
  document.visibilityState = 'visible'; document.hasFocus = () => focused
  globalThis.window = window; globalThis.document = document; Date.now = () => now
  const model = moduleAt('../../multideck.client/src/lib/workspace-usage-model.ts')
  const { useWorkspaceUsage } = moduleAt('../../multideck.client/src/lib/workspace-usage.ts', {
    react: commit.react, './workspace-usage-model': model,
    '@/lib/api': { edgeFetch: async (_, path, actor, options) => requests.push({ actor, path, ...JSON.parse(options.body) }) },
    '@/lib/supabase': { getSupabaseSession: async () => ({ access_token: sessionActor, user: { id: sessionActor } }) },
    './workspace-environment': { workspaceStorageKey: value => value },
  })
  const settle = () => new Promise(resolve => setImmediate(resolve))
  const render = (actor, route) => commit.render(() => useWorkspaceUsage({ id: actor, actorType: 'internal' }, route, true))
  try {
    render('actor-a', '/quotes')
    now += 30000; tick(); await settle()
    now += 10000; render('actor-a', '/finance/dashboard'); await settle()
    now += 30000; tick(); await settle()
    now += 5000; document.visibilityState = 'hidden'; focused = false; document.dispatchEvent(new Event('visibilitychange')); await settle()
    now += 30000; tick(); await settle()
    now += 5000; document.visibilityState = 'visible'; focused = true; document.dispatchEvent(new Event('visibilitychange')); await settle()
    now += 30000; tick(); await settle()
    now += 5000; sessionActor = 'actor-b'; render('actor-b', '/finance/dashboard')
    now += 30000; tick(); await settle()
    assert.deepEqual(requests.map(event => [event.actor, event.module, Date.parse(event.to) - Date.parse(event.from)]), [
      ['actor-a', 'quotes', 30000], ['actor-a', 'quotes', 10000], ['actor-a', 'finance', 30000],
      ['actor-a', 'finance', 5000], ['actor-a', 'finance', 30000], ['actor-b', 'finance', 30000],
    ])
    assert.ok(requests.every(event => event.state === 'active' && event.path === '/telemetry'))
  } finally {
    globalThis.window = saved.window; globalThis.document = saved.document; Date.now = saved.now
  }
})

test('Incomplete deployments fail visibly; reports never manufacture missing metrics', () => {
  const { validateAdminDashboard } = moduleAt('../../multideck.client/src/lib/admin-dashboard-api.ts', { '@/lib/api': {}, '@/lib/supabase': {} })
  const period = { from: '2026-08-01', to: '2026-08-30' }, data = adminDashboardFixture(period)
  assert.equal(validateAdminDashboard(data, period), data)
  for (const broken of [null, { ...data, prices: null }, { ...data, users: undefined }, { ...data, summary: { ...data.summary, bookings: NaN } }, { ...data, period: { ...data.period, from: '2026-07-01' } }]) assert.throws(() => validateAdminDashboard(broken, period), /incomplete report/)
})

test('Dexter chat and the actual watch compiler both explain the Admin analytics exception', () => {
  const edge = read('../functions/agent-dexter/index.ts')
  const source = edge.slice(edge.indexOf('function buildInstructions('), edge.indexOf('function emailWritingTools('))
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code
  const build = new Function('SPECIALIST_INSTRUCTIONS', 'PROMPT_VERSION', 'DEXTER_SCOPE_REDIRECT_TOOL', 'localeInstruction', 'supportTicketCopy', 'DEXTER_DOCUMENT_OCR_TOOL', `${code}; return buildInstructions`)({ auto: 'General operations' }, 'test', 'scope_redirect', locale => locale, () => '', 'read_document')
  for (const locale of ['en-GB', 'en-US']) for (const mode of ['approve', 'full']) {
    const prompt = build('auto', [{ code: 'bookings', description: 'Permitted bookings' }], [], mode, locale, [], false)
    assert.match(prompt, /active\/idle time.*unavailable in Dexter chat and Watching for you/)
    assert.match(prompt, /Never estimate employee time from presence, audit frequency or AI calls/)
    assert.match(prompt, /Finance > Dashboard.*Finance\.Director\.Dashboard\.View/)
    assert.match(prompt, /bookings: Permitted bookings/)
  }
  const watchSection = edge.slice(edge.indexOf('if (operation === "create-watch")'), edge.indexOf('const compilerResult', edge.indexOf('if (operation === "create-watch")')) + 10000)
  const begin = watchSection.indexOf('instructions: [') + 'instructions: '.length
  const end = watchSection.indexOf('].join("\\n")', begin) + 1
  const watchPrompt = new Function('localeInstruction', 'locale', `return ${watchSection.slice(begin, end)}.join("\\n")`)(locale => locale, 'en-GB')
  assert.match(watchPrompt, /employee usage rankings.*watches are unsupported/)
  assert.match(watchPrompt, /Choose status=unsupported and direct administrators to Admin > Dashboard/)
  assert.match(watchPrompt, /Never substitute presence, audit counts, AI requests/)
})
