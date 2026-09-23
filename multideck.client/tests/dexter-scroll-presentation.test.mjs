import assert from 'node:assert/strict'
import test from 'node:test'
import { stripTypeScriptTypes } from 'node:module'
import { readFileSync } from 'node:fs'
const source = stripTypeScriptTypes(readFileSync(new URL('../src/lib/dexter-scroll-presentation.ts', import.meta.url), 'utf8'))
const { shouldShowDexterJumpToLatest: show } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const readingLatest = { latestBottom: 470, visibleBottom: 500, visibleHeight: 450, remainingScroll: 400 }
test('voice layout and anchor spacer cannot reveal navigation when all messages are visible', () => {
  assert.equal(show(readingLatest), false)
  assert.equal(show({ ...readingLatest, latestBottom: null }), false)
  assert.equal(show({ ...readingLatest, latestBottom: 620 }), false)
})
test('earlier messages and newly expanded content keep a route to the latest reply', () => {
  assert.equal(show({ ...readingLatest, latestBottom: 900 }), true)
  assert.equal(show({ ...readingLatest, latestBottom: 900, visibleHeight: 250, visibleBottom: 300 }), true)
})
test('fully scrolled or hidden viewports never offer redundant navigation', () => {
  assert.equal(show({ ...readingLatest, latestBottom: 900, remainingScroll: 0 }), false)
  assert.equal(show({ ...readingLatest, latestBottom: 900, remainingScroll: 1.5 }), false)
  assert.equal(show({ ...readingLatest, latestBottom: 900, visibleHeight: 0 }), false)
})
