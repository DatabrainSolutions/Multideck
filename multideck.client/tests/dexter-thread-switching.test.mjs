import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual navigation handler with controlled network completion.
const source = await readFile(new URL('../src/pages/agent-dexter-page.tsx', import.meta.url), 'utf8')
const handler = source.slice(source.indexOf('  async function handleHistorySelect('), source.indexOf('  async function loadEarlierConversationMessages('))
const compiled = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
function harness() {
  const state = { ActiveConversation: { id: 'old', messages: ['old message'] }, LiveReasoning: 'old reasoning' }
  const requests = new Map()
  const context = {
    voice: { reset() {} }, currentUser: null, recoveryRef: { current: null },
    activePromptAbortControllerRef: { current: null }, promptSubmissionInFlightRef: { current: false },
    conversationIntentRef: { current: { id: 'old', version: 0 } },
    accessModeRequestVersionRef: { current: 0 }, accessModeRequestInFlightRef: { current: false },
    dexterClientSessionIdRef: { current: '' }, actionDecisionInFlightRef: { current: null },
    pendingScrollToLatestRef: { current: false }, liveReasoningRef: { current: 'old reasoning' },
    crypto: { randomUUID: () => 'session' }, rememberOpenDexterConversation() {},
    t: value => value, defaultDexterModelId: 'default',
    getDexterConversation: id => new Promise((resolve, reject) => requests.set(id, { resolve, reject })),
  }
  for (const name of new Set(handler.match(/\bset[A-Z]\w+/g))) {
    context[name] = value => { state[name.slice(3)] = value }
  }
  const select = new Function(...Object.keys(context), `${compiled}; return handleHistorySelect`)(...Object.values(context))
  return { state, requests, select }
}

test('clears the previous messages and reasoning before a slow history request completes', async () => {
  const { state, requests, select } = harness()
  const pending = select('next')
  assert.equal(state.ActiveConversation, null)
  assert.equal(state.LiveReasoning, '')
  assert.equal(state.IsLoadingConversation, true)
  requests.get('next').resolve({ id: 'next', messages: [] })
  await pending
  assert.equal(state.ActiveConversation.id, 'next')
  assert.equal(state.IsLoadingConversation, false)
})

test('a failed selection never leaves another conversation visible', async () => {
  const { state, requests, select } = harness()
  const pending = select('next')
  requests.get('next').reject(new Error('Connection interrupted'))
  await pending
  assert.equal(state.ActiveConversation, null)
  assert.equal(state.Error, 'Connection interrupted')
  assert.equal(state.IsLoadingConversation, false)
})

test('rapid switching ignores out-of-order replies', async () => {
  const { state, requests, select } = harness()
  const first = select('first')
  const second = select('second')
  requests.get('second').resolve({ id: 'second', messages: [] })
  await second
  requests.get('first').resolve({ id: 'first', messages: [] })
  await first
  assert.equal(state.ActiveConversation.id, 'second')
  assert.equal(state.IsLoadingConversation, false)
})
