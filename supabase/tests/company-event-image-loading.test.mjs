import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../../multideck.client/src/lib/company-events-api.ts', import.meta.url), 'utf8')
const cacheSource = stripTypeScriptTypes(source.slice(source.indexOf('const signedUrls ='), source.indexOf('export function useEventImage')).replace('export function', 'function'))
function fixture(sign) {
  let now = 0
  const calls = []
  const context = vm.createContext({
    Map, Promise, Array, queueMicrotask,
    Date: { now: () => now }, EventsApiError: Error, eventImageBucket: 'company-event-images',
    client: () => ({ storage: { from: () => ({ createSignedUrls: async (paths, lifetime) => {
      calls.push({ paths: [...paths], lifetime })
      return sign ? sign(paths, calls.length) : { data: paths.map(path => ({ path, signedUrl: `${path}?version=${calls.length}`, error: null })), error: null }
    } }) } }),
  })
  vm.runInContext(cacheSource, context)
  return { calls, url: context.eventImageUrl, advance: ms => { now += ms } }
}

test('tickets share one signing request, including duplicate consumers', async () => {
  const f = fixture()
  const first = f.url('a.webp')
  assert.equal(first, f.url('a.webp'))
  assert.deepEqual(await Promise.all([first, f.url('b.webp')]), ['a.webp?version=1', 'b.webp?version=1'])
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0], { paths: ['a.webp', 'b.webp'], lifetime: 3600 })
  assert.equal(await f.url('a.webp'), 'a.webp?version=1')
  assert.equal(f.calls.length, 1)
})

test('expiring links are refreshed before they become unusable', async () => {
  const f = fixture()
  await f.url('a.webp')
  f.advance(3540001)
  assert.equal(await f.url('a.webp'), 'a.webp?version=2')
})

test('one denied image does not prevent permitted images loading, and can retry', async () => {
  const f = fixture((paths, attempt) => ({ data: paths.map(path => ({ path, signedUrl: path === 'denied' && attempt === 1 ? null : path, error: path === 'denied' && attempt === 1 ? 'denied' : null })), error: null }))
  const result = await Promise.allSettled([f.url('allowed'), f.url('denied')])
  assert.equal(result[0].status, 'fulfilled')
  assert.equal(result[1].status, 'rejected')
  assert.equal(await f.url('denied'), 'denied')
})

test('network failures release pending requests so a later visit can retry', async () => {
  const f = fixture((paths, attempt) => {
    if (attempt === 1) throw new Error('offline')
    return { data: paths.map(path => ({ path, signedUrl: path, error: null })), error: null }
  })
  await assert.rejects(f.url('a.webp'), /offline/)
  assert.equal(await f.url('a.webp'), 'a.webp')
})

test('large lists use bounded signing batches', async () => {
  const f = fixture()
  const results = await Promise.all(Array.from({ length: 205 }, (_, i) => f.url(`${i}.webp`)))
  assert.equal(results.length, 205)
  assert.deepEqual(f.calls.map(call => call.paths.length), [100, 100, 5])
})
