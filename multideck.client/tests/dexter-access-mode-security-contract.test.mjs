import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const page = read("multideck.client/src/pages/agent-dexter-page.tsx")
const components = read("multideck.client/src/components/multideck/agent-dexter-components.tsx")

// Exercise legacy mode requests against a controlled server response. The live
// composer no longer offers Full access; the server remains authoritative.
const handler = page.slice(page.indexOf('  async function handleAccessModeChange('), page.indexOf('  async function handleHistorySelect('))
const code = ts.transpileModule(handler, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText
function modeHarness() {
  let resolve, reject
  const state = {requests: 0, AccessMode: 'approve', FullAccessGrantId: null}
  const context = {accessMode:'approve', fullAccessGrantId:null, isWorking:false,
    accessModeRequestInFlightRef:{current:false}, accessModeRequestVersionRef:{current:0},
    conversationIntentRef:{current:{version:1}}, activeConversation:{id:'chat'}, dexterClientSessionIdRef:{current:'session'},
    t:value=>value, setDexterAccessMode:()=>{state.requests++;return new Promise((yes,no)=>{resolve=yes;reject=no})}}
  for (const name of new Set(handler.match(/\bset[A-Z]\w+/g))) if (!(name in context)) context[name]=value=>{state[name.slice(3)]=value}
  const change=new Function(...Object.keys(context),`${code};return handleAccessModeChange`)(...Object.values(context))
  return {state,context,change,resolve:value=>resolve(value),reject:error=>reject(error)}
}
test('legacy mode requests serialize and retain the server-issued approval requirement', async () => {
  const h=modeHarness(), pending=h.change('full')
  await h.change('full')
  assert.equal(h.state.requests,1)
  assert.equal(h.state.IsAccessModeChanging,true)
  h.resolve({mode:'approve',grantId:null});await pending
  assert.equal(h.state.AccessMode,'approve')
  assert.equal(h.state.FullAccessGrantId,null)
  assert.equal(h.state.IsAccessModeChanging,false)
})
test('failed mode requests preserve the prior mode and explain the failure', async () => {
  const h=modeHarness(), pending=h.change('full')
  h.reject(new Error('Service unavailable'));await pending
  assert.equal(h.state.AccessMode,'approve')
  assert.equal(h.state.FullAccessGrantId,null)
  assert.equal(h.state.PendingAccessMode,null)
  assert.equal(h.state.Error,'Service unavailable')
})
test('late mode responses cannot change a newly selected conversation', async () => {
  const h=modeHarness(), pending=h.change('full')
  h.context.conversationIntentRef.current.version++
  h.resolve({mode:'full',grantId:'old-grant'});await pending
  assert.equal(h.state.AccessMode,'approve')
  assert.equal(h.state.FullAccessGrantId,null)
})
test('the composer offers no Full access bypass and preserves send guards', () => {
  assert.doesNotMatch(components, /<DexterAccessModeToggle/)
  assert.match(page, /isSending=\{isWorking \|\| recoveryNeedsCheck\}/)
  assert.match(components, /disabled=\{showVoiceAction \? !canStartVoice : !canSend\}/)
})

test("conversation changes invalidate pending mode responses and restore Approve", () => {
  assert.ok((page.match(/accessModeRequestVersionRef\.current \+= 1/g) ?? []).length >= 2)
  assert.ok((page.match(/dexterClientSessionIdRef\.current = crypto\.randomUUID\(\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setAccessMode\("approve"\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setFullAccessGrantId\(null\)/g) ?? []).length >= 2)
  assert.ok((page.match(/setPendingAccessMode\(null\)/g) ?? []).length >= 3)
})

test("recording captions are not shipped as Dexter product UI", () => {
  for (const recordingCaption of [
    "Safe read-only request",
    "READ-ONLY RESULT",
    "FAIL-CLOSED",
    "Access resets to Approve",
  ]) {
    assert.doesNotMatch(page, new RegExp(recordingCaption, "i"))
    assert.doesNotMatch(components, new RegExp(recordingCaption, "i"))
  }
})
