import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import * as policy from '../functions/agent-dexter/email-approval.mjs'

const read = file => readFileSync(new URL(`../functions/agent-dexter/${file}`, import.meta.url), 'utf8')
const edge = read('index.ts')
const helpers = stripTypeScriptTypes(edge.slice(edge.indexOf('function isExplicitEmailWritingRequest('), edge.indexOf('function explicitEmailSubject(')), { mode: 'transform' })
const { writing, action } = new Function('emailInstructionText', 'emailSendRequested', `${helpers}; return {writing:isExplicitEmailWritingRequest,action:requestedEmailAction}`)(policy.emailInstructionText,policy.emailSendRequested)
const securitySource = stripTypeScriptTypes(read('security.ts')).replace('"./email-approval.mjs"', JSON.stringify(new URL('../functions/agent-dexter/email-approval.mjs', import.meta.url).href))
const security = await import(`data:text/javascript;base64,${Buffer.from(securitySource).toString('base64')}`)
const codes = ['send_email', 'create_email_draft']
const readonly = 'Read-only internal verification: inspect the saved operational milestone. Report its saved status. Do not change anything, create a watch, send an email, or infer a real cargo movement.'

test('read-only and negated requests cannot enable email writing or sending, even with a selected email', () => {
  for (const prompt of [readonly, 'Show the milestone. Do not send an email.', "Don't send an email", 'Do NOT draft or send a message',
    'Inspect the saved record without drafting or sending an email', 'Never write an email for this check',
    'No email should be sent. Report the saved dates.', 'Read the dates; do not change anything, draft a message, or send it.',
    'Do not reply to this email', 'Please refrain from sending an email', 'Send the email? No, do not send it.',
    'Explain what "send an email" means', 'Show the instruction `send the email now` without executing it']) {
    for (const selected of [false, true]) assert.equal(writing(prompt, selected), false, prompt)
    assert.notEqual(action(prompt), 'send', prompt)
    for (const mode of ['approve', 'full']) assert.deepEqual(security.allowedActionsForPrompt(prompt, codes, mode), [], `${mode}: ${prompt}`)
  }
})

test('affirmative drafts and selected-email replies remain available without authorising send', () => {
  for (const prompt of ['Draft an email to test@example.com', 'Write a message to the customer', 'Compose an email with subject "Do not send"',
    'Draft an email, but do not send it', 'Do not send anything; instead draft an email', 'Prepare an email without sending it',
    'Write an email and do not send it', 'Draft a message, no sending', 'Draft an email. It must not be sent.', 'Draft an email today']) {
    assert.equal(writing(prompt, false), true, prompt)
    assert.equal(action(prompt), 'create_draft', prompt)
    assert.equal(security.operatorAuthorisesAction(prompt, 'send_email'), false, prompt)
    assert.ok(security.allowedActionsForPrompt(prompt, codes, 'approve').includes('create_email_draft'), prompt)
  }
  for (const prompt of ['Reply politely', 'Make it shorter', 'Thank them']) {
    assert.equal(writing(prompt, true), true, prompt)
    assert.equal(writing(prompt, false), false, prompt)
  }
})

test('affirmative sends retain mandatory final approval and do not borrow negated intent', () => {
  for (const prompt of ['Send an email to test@example.com', 'Please send this email now', 'Send the message today', 'Send the message']) {
    assert.equal(writing(prompt, false), true, prompt)
    assert.equal(action(prompt), 'send', prompt)
    assert.equal(security.operatorAuthorisesAction(prompt, 'send_email'), true, prompt)
    for (const mode of ['approve', 'full']) assert.equal(policy.requiresExplicitActionApproval('send_email', mode), true)
  }
  assert.equal(action('Draft an email, but do not send it today'), 'create_draft')
  assert.equal(writing('Read the milestone and reply only with its status', false), false)
})

const guardSource = stripTypeScriptTypes(edge.slice(edge.indexOf('async function securePreparedEmailAction('), edge.indexOf('async function loadOperatorEmailStyle(')), { mode: 'transform' })
function guardHarness() {
  const calls = []
  const guard = new Function('deps', `const {operatorAuthorisesAction,isExplicitEmailWritingRequest,requestedEmailAction,prepareServerAction,executePreparedActionById,requiresExplicitActionApproval}=deps;
    const SEND_EMAIL_ACTION='send_email',CREATE_EMAIL_DRAFT_ACTION='create_email_draft',actionDisplayName=()=> 'Email',emailPreparedChanges=()=>[],isObject=v=>v&&typeof v==='object';
    ${guardSource}; return securePreparedEmailAction;`)({
    operatorAuthorisesAction:security.operatorAuthorisesAction, isExplicitEmailWritingRequest:writing, requestedEmailAction:action,
    requiresExplicitActionApproval:policy.requiresExplicitActionApproval,
    prepareServerAction:async()=>{calls.push('prepare');return {id:'test-only'}},
    executePreparedActionById:async()=>{calls.push('execute');return {data:{completed:true}}},
  })
  return {calls,guard}
}
const input = (prompt, accessMode, requestedAction) => ({operatorPrompt:prompt,accessMode,draft:{requestedAction},
  security:{allowedActionCodes:codes},actions:codes.map(code=>({code,name:code})),locale:'en-GB'})

test('shared preparation guard rejects model-proposed email actions outside current intent in both response modes', async () => {
  // Both response paths call this real shared function; transport/provider are spies.
  for (const mode of ['approve','full']) for (const requested of ['send','create_draft']) {
    const {guard,calls}=guardHarness()
    await assert.rejects(guard(input(readonly,mode,requested)), /email_action_outside_operator_intent/)
    assert.deepEqual(calls,[])
  }
  const {guard,calls}=guardHarness()
  await assert.rejects(guard(input('Draft an email but do not send it','approve','send')), /email_action_outside_operator_intent/)
  assert.deepEqual(calls,[])
  for (const mode of ['approve','full']) {
    const {guard,calls}=guardHarness()
    const denied=input('Send an email to test@example.com',mode,'send')
    denied.security.allowedActionCodes=[]
    await assert.rejects(guard(denied), /email_action_outside_operator_intent/)
    assert.deepEqual(calls,[])
  }
  for (const mode of ['approve','full']) {
    const {guard,calls}=guardHarness()
    const result=await guard(input('Send an email to test@example.com',mode,'send'))
    assert.equal(result.completed,false)
    assert.deepEqual(calls,['prepare'])
  }
  for (const mode of ['approve','full']) {
    const {guard,calls}=guardHarness()
    const result=await guard(input('Draft an email to test@example.com',mode,'create_draft'))
    assert.equal(result.completed,mode==='full')
    assert.deepEqual(calls,mode==='full'?['prepare','execute']:['prepare'])
  }
})

test('unrequested model draft does not record a writing-profile event before the security guard', async () => {
  const source=stripTypeScriptTypes(edge.slice(edge.indexOf('async function prepareEmailDraft('),edge.indexOf('function rememberCurrentRecords(')),{mode:'transform'})
  const prepare=new Function('isExplicitEmailWritingRequest','requestedEmailAction',`
    const cleanString=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'',isUuid=()=>false;
    ${source};return prepareEmailDraft;`)(writing,action)
  const calls=[]
  const client={rpc:async name=>{calls.push(name);return {data:null,error:null}}}
  const result=await prepare(client,{mode:'new',bodyText:'Saved evidence'},readonly,new Set(),'send')
  assert.match(result.error,/not requested/)
  assert.deepEqual(calls,[])
})
