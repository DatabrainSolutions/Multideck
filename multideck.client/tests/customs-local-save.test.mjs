import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/pages/customs-declarations-page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let save
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'saveDraft') save = node.getText(ast); ts.forEachChild(node, visit) }
visit(ast)
function fixture({ failure = false, provider = false } = {}) {
 const calls = []
 const context = vm.createContext({ savingDraft:false, draft:{ multideckReference:'TEST' }, declarationId:'test-id', scope:'job-related', kind:'export', registerPath:'/customs', invoiceImportRecoveryKey:'test', autosaveQueueRef:{current:Promise.resolve()}, lastSavedDraftSnapshotRef:{current:null}, iCustomsState:{declaration:{hasCustomsDraft:provider,provider:{status:'draft'}}},
  setSavingDraft: value => calls.push(['busy',value]), setAutosaveStatus: value => calls.push(['status',value]), setProviderSaveFailed:()=>{}, setDraft:()=>{}, setICustomsBusy:()=>{},
  saveDeclarationDraft:async()=>{calls.push(['save']);if(failure)throw new Error('Offline');return {id:'test-id',reference:'TEST'}},
  moveCustomsInvoiceImportRecovery:()=>{}, t:value=>value, navigate:path=>calls.push(['navigate',path]),
  startICustomsProviderDraft:async()=>{throw new Error('Unexpected provider creation')}, saveICustomsProviderDraft:async()=>{throw new Error('Unexpected provider update')}, validateICustomsDeclaration:async()=>{throw new Error('Unexpected provider validation')},
  toast:{success:value=>calls.push(['success',value]),warning:value=>calls.push(['warning',value])}, console:{error(){}}, ICustomsApiError: class extends Error{},
 })
 vm.runInContext(ts.transpileModule(save,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
 return {calls,run:()=>context.saveDraft(false)}
}
test('Save draft saves only in Multideck with and without an existing provider draft',async()=>{
 for (const provider of [false,true]) {
  const f=fixture({provider});await f.run()
  assert.ok(f.calls.some(([name,value])=>name==='success'&&value==='Draft saved in Multideck'))
  assert.equal(f.calls.filter(([name])=>name==='save').length,1)
  assert.equal(f.calls.some(([name])=>name==='warning'),false)
 }
})
test('failed save reports unsaved state and never claims success',async()=>{
 const f=fixture({failure:true});await f.run()
 assert.ok(f.calls.some(([name,value])=>name==='status'&&value==='error'))
 assert.equal(f.calls.some(([name])=>name==='success'),false)
})
