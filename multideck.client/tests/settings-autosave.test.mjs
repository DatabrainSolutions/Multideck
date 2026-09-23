import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
function harness() {
  const refs = [], effects = [], timers = new Map(), errors = []
  let cursor = 0, id = 0, scheduled = []
  const react = {
    useRef(value) { const i = cursor++; return refs[i] ??= { current: value } },
    useState(value) { cursor++; return [value, () => {}] },
    useEffect(effect, deps) {
      const i = cursor++, previous = effects[i]
      if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) scheduled.push(() => {
        previous?.cleanup?.(); effects[i] = { deps, cleanup: effect() }
      })
    },
  }
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/use-settings-autosave.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', 'window', source)(
    name => name === 'react' ? react : { toast: { error: (...args) => errors.push(args) } }, exports,
    fn => { timers.set(++id, fn); return id }, key => timers.delete(key), { addEventListener() {}, removeEventListener() {} })
  return {
    render(value, dirty, save) { cursor = 0; exports.useSettingsAutosave(value, dirty, save); scheduled.splice(0).forEach(fn => fn()) },
    async flush() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); for (let i = 0; i < 10; i++) await Promise.resolve() },
    unmount() { effects.forEach(effect => effect?.cleanup?.()) }, errors,
  }
}
test('coalesces edits and preserves a revert before saving', async () => {
  const h = harness(), writes = [], save = async value => { writes.push(value) }
  h.render('initial', false, save); await h.flush(); assert.deepEqual(writes, [])
  h.render('first', true, save); h.render('second', true, save); await h.flush()
  assert.deepEqual(writes, ['second'])
  h.render('third', true, save); h.render('second', false, save); await h.flush()
  assert.deepEqual(writes, ['second', 'second'])
})
test('serializes writes and flushes when leaving the tab', async () => {
  const h = harness(), writes = []; let release
  const save = async value => { writes.push(value); if (value === 'first') await new Promise(resolve => { release = resolve }) }
  h.render('first', true, save); await h.flush()
  h.render('latest', true, save); h.unmount(); assert.deepEqual(writes, ['first'])
  release(); await h.flush(); assert.deepEqual(writes, ['first', 'latest'])
})
test('failed saves can retry; stale retries cannot overwrite new edits', async () => {
  const h = harness(), writes = []; let fail = true
  const save = async value => { writes.push(value); if (fail) throw new Error('Offline') }
  h.render('first', true, save); await h.flush(); assert.equal(h.errors.length, 1)
  fail = false; h.errors[0][1].action.onClick(); await h.flush(); assert.deepEqual(writes, ['first', 'first'])
  h.render('latest', true, save); await h.flush()
  h.errors[0][1].action.onClick(); await h.flush(); assert.deepEqual(writes, ['first', 'first', 'latest'])
})
