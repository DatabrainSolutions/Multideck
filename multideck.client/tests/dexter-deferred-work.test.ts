import assert from "node:assert/strict"
import test from "node:test"
import {deferredWorkState, deferredWorkPrompt} from "../src/lib/dexter-deferred-work.ts"
import type {DexterMessage} from "../src/lib/dexter-api"
const plan = (): DexterMessage => ({id:"plan",role:"assistant",content:"Approve first",createdAt:"now",deferredWork:{label:"Postcode",request:"Update company A postcode to B4 6QF.",afterActionIds:["a","b"]},pendingActions:[{id:"a",title:"First",description:"",changes:[],status:"prepared"},{id:"b",title:"Second",description:"",changes:[],status:"prepared"}]})
test("every dependency must succeed; denied and missing dependencies cannot continue", () => {
 const p=plan();assert.equal(deferredWorkState(p,[p]),"waiting")
 p.pendingActions![0].status="succeeded";assert.equal(deferredWorkState(p,[p]),"waiting")
 p.pendingActions![1].status="succeeded";assert.equal(deferredWorkState(p,JSON.parse(JSON.stringify([p]))),"ready")
 p.pendingActions![1].status="declined";assert.equal(deferredWorkState(p,[p]),"blocked")
 p.pendingActions=[];assert.equal(deferredWorkState(p,[p]),"blocked")
 assert.equal(deferredWorkState(p,[]),null)
})
test("approval replies retain the continuation; the submitted continuation consumes it on reload", () => {
 const p=plan();p.pendingActions!.forEach(a=>a.status="succeeded")
 const approve: DexterMessage={id:"approve",role:"user",content:"Approve: First",createdAt:"now"}
 const done: DexterMessage={id:"done",role:"assistant",content:"Saved",createdAt:"now",isActionDecision:true,responseToUserMessageId:"approve"}
 assert.equal(deferredWorkState(p,[p,approve,done]),"ready")
 const question: DexterMessage={id:"question",role:"user",content:"Which address is this?",createdAt:"now"}
 assert.equal(deferredWorkState(p,[p,approve,done,question]),"ready")
 const followup: DexterMessage={id:"next",role:"user",content:deferredWorkPrompt(p),createdAt:"now"}
 assert.equal(deferredWorkState(p,JSON.parse(JSON.stringify([p,approve,done,followup]))),null)
 assert.equal(followup.content,"Continue request: Postcode")
})


test("dismissed remaining work cannot become ready even if dependencies succeed later", () => {
 const p=plan();p.deferredWorkDismissed=true;p.pendingActions!.forEach(action=>action.status="succeeded")
 assert.equal(deferredWorkState(p,JSON.parse(JSON.stringify([p]))),"dismissed")
 assert.equal(deferredWorkState(p,[]),null)
})


test("matching labels do not consume a different saved continuation", () => {
 const first=plan();first.pendingActions!.forEach(a=>a.status="succeeded")
 const second={...plan(),id:"plan-two",serverId:"saved-two"};second.pendingActions!.forEach(a=>a.status="succeeded")
 const submitted: DexterMessage={id:"submit-two",role:"user",content:deferredWorkPrompt(second),createdAt:"now",continuationMessageId:"saved-two"}
 assert.equal(deferredWorkState(first,[first,second,submitted]),"ready")
 assert.equal(deferredWorkState(second,[first,second,submitted]),null)
 const savedUser={...submitted,continuationMessageId:undefined}
 const reply: DexterMessage={id:"reply-two",role:"assistant",content:"Ready",createdAt:"now",responseToUserMessageId:submitted.id,continuationMessageId:"saved-two"}
 const reloaded=JSON.parse(JSON.stringify([first,second,savedUser,reply]))
 assert.equal(deferredWorkState(first,reloaded),"ready")
 assert.equal(deferredWorkState(second,reloaded),null)
 assert.equal(deferredWorkState(first,[first,second,savedUser]),"ready")
 assert.equal(deferredWorkState(second,[first,second,savedUser]),"ready")
})
