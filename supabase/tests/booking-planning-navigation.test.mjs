import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require=createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const ts=require('typescript')
const source=readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx',import.meta.url),'utf8')
const ast=ts.createSourceFile('booking.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function handler(name) {
 const found=[]
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found.push(node.getText(ast));ts.forEachChild(node,visit)}
 visit(ast);assert.equal(found.length,1)
 return ts.transpileModule(found[0],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
}
function harness(pending) {
 const state={navigationDirtyRef:{current:pending},planningPendingRef:{current:pending},pendingNavigationRef:{current:null},planningPending:pending,activeTab:'Finance',t:x=>x,
  warnings:[],tabs:[],queued:[],toast:{error:message=>state.warnings.push(message)},setPendingNavigation:value=>state.queued.push(value),setCustomsView:()=>{},setActiveTab:value=>state.tabs.push(value)}
 vm.createContext(state)
 vm.runInContext(handler('beforeNavigate')+handler('beforeUnload')+handler('changeActiveTab'),state)
 return state
}
test('actual Booking navigation handlers retain pending charges and do not queue a later surprise navigation',()=>{
 const s=harness(true);let prevented=0
 s.beforeNavigate({preventDefault(){prevented++},detail:{proceed(){throw Error('Must not leave')}}})
 s.changeActiveTab('Details')
 const unload={preventDefault(){prevented++}};s.beforeUnload(unload)
 assert.equal(prevented,2);assert.equal(unload.returnValue,'')
 assert.equal(s.pendingNavigationRef.current,null);assert.equal(s.queued.length,0);assert.equal(s.tabs.length,0);assert.equal(s.warnings.length,2)
})
test('navigation resumes normally once charges are saved or unsaved edits explicitly discarded',()=>{
 const s=harness(false)
 s.beforeNavigate({preventDefault(){throw Error('Clean navigation blocked')}})
 s.changeActiveTab('Details');assert.deepEqual(s.tabs,['Details'])
 s.beforeUnload({preventDefault(){throw Error('Clean unload blocked')}})
})
test('existing Booking detail autosave navigation is preserved',()=>{
 const s=harness(false);s.navigationDirtyRef.current=true;const proceed=()=>{}
 s.beforeNavigate({preventDefault(){},detail:{proceed}})
 assert.equal(s.pendingNavigationRef.current,proceed);assert.deepEqual(s.queued,[true])
})
