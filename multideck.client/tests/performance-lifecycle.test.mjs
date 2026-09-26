import assert from 'node:assert/strict'
import test from 'node:test'
import { createPageLoader } from '../src/lib/page-loader.ts'
import { connectVisibleRefresh } from '../src/lib/visible-refresh.ts'
import { createPageVisibility } from '../src/lib/page-visibility.ts'

test('hover, focus and navigation share a module load and failed preloads can retry', async () => {
  let calls = 0
  const load = createPageLoader(async () => { if (++calls === 1) throw Error('offline'); return 'module' })
  const first = load(); assert.equal(load(), first)
  await assert.rejects(first, /offline/)
  const next = load(); assert.equal(load(), next); assert.equal(await next, 'module'); assert.equal(calls, 2)
})

test('a hung route import reaches recovery instead of waiting forever', async () => {
  await assert.rejects(createPageLoader(() => new Promise(() => {}), 10)(), /took too long/)
})

test('focus and visibility events coalesce; hidden tabs stop polling and resume once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' }), host = new EventTarget()
  let reads = 0
  const stop = connectVisibleRefresh(() => { reads++ }, page, host, 1000)
  host.dispatchEvent(new Event('focus')); host.dispatchEvent(new Event('online')); page.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.tick(75); assert.equal(reads, 1)
  page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.tick(10000); assert.equal(reads, 1)
  page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange')); host.dispatchEvent(new Event('focus'))
  t.mock.timers.tick(75); assert.equal(reads, 2)
  stop(); t.mock.timers.tick(10000); assert.equal(reads, 2)
})

test('shader visibility snapshot changes synchronously and listeners clean up', () => {
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const visibility = createPageVisibility(page); let notifications = 0
  const stop = visibility.subscribe(() => { notifications++ })
  assert.equal(visibility.getSnapshot(), true)
  page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(visibility.getSnapshot(), false); assert.equal(notifications, 1)
  page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(visibility.getSnapshot(), true); assert.equal(notifications, 2)
  stop(); page.dispatchEvent(new Event('visibilitychange')); assert.equal(notifications, 2)
})
