import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
import * as presentation from '../src/lib/dexter-approval-presentation.ts'

// Render the production approval component with lightweight visual primitives.
// The real normalisation, status logic and button guards all run unchanged.
const source = readFileSync(new URL('../src/components/multideck/dexter-action-approval.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText
const primitive = tag => ({children, initial, animate, transition, ...props}) => React.createElement(tag, props, children)
const icon = () => React.createElement('svg', {'aria-hidden':true})
const dependencies = {
  react:React, 'motion/react':{motion:{section:primitive('section'),div:primitive('div')},useReducedMotion:()=>true},
  '@/components/icons/hugeicons':{Check:icon,LoaderCircle:icon,Minus:icon,Plus:icon,X:icon},
  '@/components/ui/button':{Button:primitive('button')}, '@/i18n/language-provider':{useLanguage:()=>({language:'en-GB',t:value=>value})},
  '@/lib/utils':{cn:(...args)=>args.filter(Boolean).join(' ')}, '@/lib/motion':{mdEaseOut:[]}, '@/lib/dexter-approval-presentation':presentation,
}
const exports={}
new Function('require','exports','React',compiled)(name=>{if(!(name in dependencies))throw new Error(name);return dependencies[name]},exports,React)
const action={id:'approval',title:'Set next action',description:'Add the next action to Jordan’s Tasks.',changes:[{field:'Assigned to',value:'Jordan',after:'Jordan',before:null,beforeKnown:true,kind:'added'}]}
const render=props=>renderToStaticMarkup(React.createElement(exports.DexterActionApproval,{action,onDecision(){},...props}))
const approvalTag=html=>html.match(/<button[^>]*data-decision="approve"[^>]*>/)?.[0] ?? ''
test('verified proposals render readable evidence and offer an enabled approval',()=>{
 const html=render({})
 assert.match(html, /Jordan/)
 assert.ok(approvalTag(html))
 assert.doesNotMatch(approvalTag(html),/disabled/)
 assert.doesNotMatch(html,/\{&quot;/)
})
test('unreadable legacy details disable approval and keep Deny and recovery copy visible',()=>{
 const html=render({action:{...action,changes:[{field:'Input',value:'{"ownerId":"c38b47bc-2ea6-472b-ae28-318a66abf0d5"}'}]}})
 assert.match(approvalTag(html),/disabled/)
 assert.match(html,/prepare the change again/)
 assert.match(html,/>Deny</)
 assert.doesNotMatch(html,/c38b47bc/)
})
test('preparing, duplicate submission, and terminal ledger states never offer active approval',()=>{
 for(const props of [{isPreparing:true},{pendingDecision:'approve'},{pendingDecision:'decline'},...['succeeded','declined','failed','expired','superseded','executing','unavailable'].map(status=>({action:{...action,status}}))]) {
   assert.match(approvalTag(render(props)),/disabled/)
 }
})
test('invalid saved detail shapes cannot crash the conversation or enable approval',()=>{
 for(const changes of [null,undefined,[null],[{field:12,value:'bad'}]]) {
   assert.match(approvalTag(render({action:{...action,changes}})),/disabled/)
 }
})
test('recoverable errors retain exact evidence and do not claim success',()=>{
 const html=render({error:'The record changed. Prepare this change again.'})
 assert.match(html,/role="alert"/)
 assert.match(html,/The record changed/)
 assert.match(html,/Jordan/)
 assert.doesNotMatch(html,/>Completed</)
})

test('clearing a value with an unknown previous value still explains the destructive change',()=>{
 const html=render({action:{...action,changes:[{field:'Main contact',value:'',after:null,before:null,beforeKnown:false,kind:'removed'}]}})
 assert.match(html,/Clear this value/)
 assert.doesNotMatch(html,/Previous value/)
})
