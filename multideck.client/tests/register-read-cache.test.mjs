import assert from 'node:assert/strict'
import test from 'node:test'
import { createRegisterReadCache } from '../src/lib/register-read-cache.ts'
const flush = () => new Promise(setImmediate)
const setup = options => { const cache = createRegisterReadCache(options); cache.setScope('project-a', 'user-a'); return cache }

test('shares concurrent reads and exposes fresh complete-query snapshots synchronously', async () => {
  const cache = setup(); let calls = 0, finish
  const load = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const a = cache.read('user-a', 'quotes:page:1', load), b = cache.read('user-a', 'quotes:page:1', load)
  await flush(); assert.equal(calls, 1)
  finish({ rows: ['one'] }); await Promise.all([a, b])
  assert.deepEqual(cache.peek('user-a', 'quotes:page:1'), { rows: ['one'] })
  assert.equal(cache.peek('user-a', 'quotes:page:2'), undefined)
  assert.equal(cache.peek('user-b', 'quotes:page:1'), undefined)
  await cache.read('user-a', 'quotes:page:1', load); assert.equal(calls, 1)
})

test('one consumer cancelling does not cancel another and the final cancellation aborts transport', async () => {
  const cache = setup(); let transport, finish
  const load = signal => { transport = signal; return new Promise(resolve => { finish = resolve }) }
  const a = new AbortController(), b = new AbortController()
  const first = cache.read('user-a', 'one', load, a.signal), second = cache.read('user-a', 'one', load, b.signal)
  await flush(); a.abort(); await assert.rejects(first, { name: 'AbortError' }); assert.equal(transport.aborted, false)
  finish('result'); assert.equal(await second, 'result')
  const c = new AbortController(); const last = cache.read('user-a', 'two', load, c.signal)
  await flush(); c.abort(); await assert.rejects(last, { name: 'AbortError' }); await flush(); assert.equal(transport.aborted, true)
})

test('timeout settles a transport which ignores abort, and remains distinguishable from cancellation', async () => {
  const cache = setup({ timeoutMs: 10 })
  await assert.rejects(cache.read('user-a', 'one', () => new Promise(() => {})), { name: 'TimeoutError' })
  assert.equal(await cache.read('user-a', 'one', async () => 'retry'), 'retry')
})

test('sign-out, project, user and permission changes clear snapshots and reject obsolete in-flight results', async () => {
  for (const change of [c => c.setScope('project-a', null), c => c.setScope('project-b', 'user-a'), c => c.setScope('project-a', 'user-b'), c => c.setScope('project-a', 'user-a', true)]) {
    const cache = setup(); let finish
    await cache.read('user-a', 'ready', async () => 'old')
    const pending = cache.read('user-a', 'pending', () => new Promise(resolve => { finish = resolve }))
    await flush(); change(cache); finish('late')
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(cache.peek('user-a', 'ready'), undefined)
    assert.equal(cache.peek('user-a', 'pending'), undefined)
  }
})

test('mutation invalidation rejects obsolete reads and cannot repopulate a newer entry', async () => {
  const cache = setup(); let finish
  const old = cache.read('user-a', 'quotes:one', () => new Promise(resolve => { finish = resolve }))
  await flush(); cache.invalidate('quotes:'); await assert.rejects(old, { name: 'AbortError' })
  assert.equal(await cache.read('user-a', 'quotes:one', async () => 'new'), 'new')
  finish('old'); await flush(); assert.equal(cache.peek('user-a', 'quotes:one'), 'new')
})

test('expiry and least-recently-used eviction bound completed entries', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const cache = setup({ ttlMs: 100, maxEntries: 2 })
  await cache.read('user-a', 'one', async () => 1)
  t.mock.timers.tick(1); await cache.read('user-a', 'two', async () => 2)
  t.mock.timers.tick(1); cache.peek('user-a', 'one')
  t.mock.timers.tick(1); await cache.read('user-a', 'three', async () => 3)
  assert.equal(cache.peek('user-a', 'two'), undefined)
  assert.equal(cache.peek('user-a', 'one'), 1)
  t.mock.timers.tick(101); assert.equal(cache.peek('user-a', 'one'), undefined)
  assert.equal(await cache.read('user-a', 'one', async () => 4), 4)
})
