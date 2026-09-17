import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {requiresExplicitActionApproval} from '../functions/agent-dexter/email-approval.mjs'
const require=createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const ts=require('typescript')
const source=readFileSync(new URL('../functions/agent-dexter/security.ts',import.meta.url),'utf8')
const start=source.indexOf('export async function resolveConversationAccessMode(')
const end=source.indexOf('export async function createSecurityContext',start)
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={};new Function('exports',code)(exports)
test('legacy full-access grants cannot bypass review',async()=>{
 const mode=await exports.resolveConversationAccessMode({grantId:'11111111-1111-4111-8111-111111111111',clientSessionId:'22222222-2222-4222-8222-222222222222',conversationId:'33333333-3333-4333-8333-333333333333',admin:{},actor:{}})
 assert.equal(mode,'approve')
})
for(const action of ['send_email','create_email_draft','update_lead','update_company_foundation','move_deal_stage','future_action'])test(`${action} always requires confirmation`,()=>{
 for(const mode of ['approve','full',undefined])assert.equal(requiresExplicitActionApproval(action,mode),true)
})
