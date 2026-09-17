import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const tableCode = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/record-tables.ts', import.meta.url), 'utf8'))
const { createRecordTable, recordActionTarget } = await import(`data:text/javascript;base64,${Buffer.from(tableCode).toString('base64')}`)

const asyncCode = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/async-domain-reads.ts', import.meta.url), 'utf8'))
const { asyncDomainReads } = await import(`data:text/javascript;base64,${Buffer.from(asyncCode).toString('base64')}`)

const reasoningCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/reasoning-history.ts',import.meta.url),'utf8'))
const reasoningUrl=`data:text/javascript;base64,${Buffer.from(reasoningCode).toString('base64')}`
const historyCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/provider-history.ts',import.meta.url),'utf8')).replace('./reasoning-history.ts',reasoningUrl)
const {continueProviderHistory,recordProviderEvent}=await import(`data:text/javascript;base64,${Buffer.from(historyCode).toString('base64')}`)

const supersedeCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/supersede-approvals.ts',import.meta.url),'utf8'))
const supersedeUrl=`data:text/javascript;base64,${Buffer.from(supersedeCode).toString('base64')}`
const approvalCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/pending-approval-review.ts',import.meta.url),'utf8')).replace('./supersede-approvals.ts',supersedeUrl)
const {pendingApprovalReview}=await import(`data:text/javascript;base64,${Buffer.from(approvalCode).toString('base64')}`)

const edge = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
const cleanString = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : ''
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const subjectCode = stripTypeScriptTypes(edge.slice(edge.indexOf('function explicitEmailSubject('), edge.indexOf('function parseMessageIds(')))
const subject = new Function('cleanString', `${subjectCode}; return explicitEmailSubject`)(cleanString)

test('a same-line email subject stops at the body and other tasks', () => {
  assert.equal(subject("Subject: Dexter QA 9 September. Body: This is a test. Also find Demo. Do not send yet.", ''), 'Dexter QA 9 September')
  assert.equal(subject('Subject: Customs update; Message: Please review.', ''), 'Customs update')
  assert.equal(subject('Subject: "Body: a useful subject". Body: Test', ''), 'Body: a useful subject')
  assert.equal(subject('Write a polite email', 'Invented subject'), '')
  assert.equal(subject('Subject: Arrival update\nBody: Tomorrow', ''), 'Arrival update')
})

test('record tables reject unqueried IDs and use only server-returned values and safe links', () => {
  const records = new Map([['leads', new Map([['lead-1', { recordId: 'lead-1', companyName: 'Example', estimatedValue: 0, _citation: { url: '/crm/leads/lead-1' }, privateField: 'never shown' }]])]])
  assert.ok(createRecordTable({ domain: 'leads', record_ids: ['invented'] }, records).error)
  assert.ok(createRecordTable({ domain: 'customers', record_ids: ['lead-1'] }, records).error)
  const result = createRecordTable({ domain: 'leads', title: 'Selected leads', record_ids: ['lead-1'], rows: [{ companyName: 'Invented' }] }, records)
  assert.equal(result.table.rows[0].values.companyName, 'Example')
  assert.equal(result.table.rows[0].values.estimatedValue, 0)
  assert.equal(result.table.rows[0].url, '/crm/leads/lead-1')
  assert.equal(result.table.rows[0].values.privateField, undefined)
  records.get('leads').get('lead-1')._citation.url = '//untrusted.example'
  assert.equal(createRecordTable({ domain: 'leads', record_ids: ['lead-1'] }, records).table.rows[0].url, undefined)
})

const deferredCode = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/deferred-work.ts', import.meta.url), 'utf8'))
const {createDeferredWork} = await import(`data:text/javascript;base64,${Buffer.from(deferredCode).toString('base64')}`)

function harness(responses, options = {}) {
  const prepared = [], events = [], requests = []
  const dependencies = {
    createDeferredWork, pendingApprovalReview,
    requestDeadline: () => () => 95000,
    activeRunWorker: async () => ({announce:()=>{},poll:async()=>{},event:()=>{},flush:async()=>{},finish:async()=>{}}),
    continueProviderHistory, recordProviderEvent, redactModelSecrets: value => value,
    asyncDomainReads, cleanString, isObject, recordActionTarget, userInputMessage: content => ({ role: 'user', content }),
    requestedEmailAction: () => 'create_draft', isTrainingDatabase: async () => false,
    PREPARE_EMAIL_DRAFT_TOOL: 'prepare_email_draft', DEXTER_SCOPE_REDIRECT_TOOL: 'redirect_off_topic_request', DEXTER_DOCUMENT_OCR_TOOL: 'extract_uploaded_document', EMAIL_STYLE_TOOL: 'load_operator_email_style',
    MAX_TOOL_ROUNDS: 10, MAX_TOOL_CALLS: 24, PROMPT_VERSION: 'test',
    requestOpenAIStream: async (_gateway, _key, body) => { requests.push(structuredClone(body)); return responses.shift() },
    buildInstructions: () => 'instructions', addTokenUsage: () => {}, readTokenUsage: () => ({}), extractReasoningSummary: () => '', extractAnswer: response => response.answer,
    sanitiseArguments: value => value, requiresExplicitActionApproval: () => true,
    argumentsWithDocumentEvidence: value => value, documentEvidence: () => null,
    preparedActionDescription: (_locale, _code, args) => `Update ${args.target_id}`,
    actionChanges: (_locale, _code, args) => [{ field: 'name', after: args.name }],
    prepareServerAction: async (_admin, _actor, value) => { prepared.push(value); return { id: `prepared-${prepared.length}` } },
    sanitiseAnswer: value => value, actionDisplayName: (_locale, _code, name) => name,
    actionCopy: (_locale, _status, reason) => reason,
    providerErrorDiagnostics: () => ({}),
    loadOperatorEmailStyle: async () => ({}),
    prepareEmailDraft: async () => ({ draft: { id: 'email-1', mode: 'new', requestedAction: 'send' } }),
    securePreparedEmailAction: async ({ draft }) => ({ draft, completed: false, pendingAction: { id: 'send-1' } }),
    ...options.dependencies,
  }
  const source = stripTypeScriptTypes(edge.slice(edge.indexOf('async function runStreamedAgent('), edge.indexOf('\nDeno.serve')))
  const run = new Function(...Object.keys(dependencies), `${source}; return runStreamedAgent`)(...Object.values(dependencies))
  const input = { route: { model: 'test', effort: 'medium' }, actor: { companyId: 'company', userId: 'user' }, lane: 'fast', locale: 'en-GB', accessMode: 'approve', history: [], prompt: 'Update A and B', uploadedModelInputs: [], security: { authorisedRecipientAddresses: [] }, tools: [], actions: [{ code: 'update_lead', name: 'Update lead', description: 'Update lead' }], domainCodes: [], emailProviders: [], emailState: null }
  return { run: () => run({...input, ...options.input}, event => events.push(event)), prepared, events, requests }
}
const call = (id, target) => ({ type: 'function_call', name: 'update_lead', call_id: id, arguments: JSON.stringify({ target_id: target, name: 'Updated' }) })
const response = output => ({ status: 200, requestId: 'test', response: { output } })

test('multiple proposals are prepared separately and every call receives its own result', async () => {
  const h = harness([response([call('call-a', 'a'), call('call-b', 'b')]), { status: 200, response: { output: [], answer: 'Two changes need approval.' } }])
  const result = await h.run()
  assert.equal(h.prepared.length, 2)
  assert.equal(result.pendingActions.length, 2)
  assert.deepEqual(h.requests[1].input.filter(item => item.type === 'function_call_output').map(item => item.call_id), ['call-a', 'call-b'])
  assert.deepEqual(h.events.filter(event => event.type === 'pending_action').map(event => event.pendingAction.id), ['prepared-1', 'prepared-2'])
})

test('a repeated model proposal is not prepared twice', async () => {
  const h = harness([response([call('call-a', 'a')]), response([call('call-repeat', 'a')]), { status: 200, response: { output: [], answer: 'Review the change.' } }])
  assert.equal((await h.run()).pendingActions.length, 1)
  assert.equal(h.prepared.length, 1)
  assert.ok(h.requests[2].input.some(item => item.call_id === 'call-repeat' && item.type === 'function_call_output'))
})

test('a later provider failure preserves prepared changes without reporting success', async () => {
  const h = harness([response([call('call-a', 'a')]), { status: 503 }])
  const result = await h.run()
  assert.equal(result.pendingActions.length, 1)
  assert.match(result.answer, /could not finish/)
  assert.match(result.answer, /need your approval/)
})


test('follow-up tables retain explicitly requested empty fields and real expected deal values', () => {
  const records = new Map([
    ['leads', new Map([['lead', { recordId: 'lead', companyName: 'Example', nextActionDueAt: null, lastInteractionAt: null, owner: 'Operator' }]])],
    ['deals', new Map([['deal', { recordId: 'deal', name: 'Air enquiry', pipeline: 'Sales', expectedValue: 1234.5, currency: 'GBP' }]])],
  ])
  const lead = createRecordTable({ domain: 'leads', record_ids: ['lead'], fields: ['nextActionDueAt', 'lastInteractionAt', 'owner'] }, records).table
  assert.deepEqual(lead.columns.map(field => field.key), ['companyName', 'nextActionDueAt', 'lastInteractionAt', 'owner'])
  assert.ok(lead.columns.every(field => field.required))
  assert.equal(lead.rows[0].values.nextActionDueAt, null)
  const deal = createRecordTable({ domain: 'deals', record_ids: ['deal'], fields: ['expectedValue', 'currency'] }, records).table
  assert.equal(deal.rows[0].values.expectedValue, 1234.5)
  assert.ok(createRecordTable({ domain: 'deals', record_ids: ['deal'], fields: ['contactEmail'] }, records).error)
})

test('action targets show the authorised record identity and reject external links', () => {
  assert.equal(recordActionTarget(undefined), undefined)
  assert.equal(recordActionTarget({ companyName: 'Unidentified' }), undefined)
  assert.deepEqual(recordActionTarget({ recordId: 'lead-1', companyName: 'Actual lead', _citation: { url: '/crm/leads/lead-1' } }),
    { id: 'lead-1', label: 'Actual lead', url: '/crm/leads/lead-1' })
  assert.equal(recordActionTarget({ recordId: 'lead-1', companyName: 'Actual lead', _citation: { url: '//elsewhere.example' } }).url, undefined)
})

test('an empty final explanation retains prepared actions instead of losing the review', async () => {
  const h = harness([response([call('call-a', 'a')]), response([])])
  const result = await h.run()
  assert.equal(result.pendingActions.length, 1)
  assert.match(result.answer, /ready for review/)
  assert.equal(h.events.some(event => event.type === 'error'), false)
})

test('a prepared email keeps its composer approval link after an empty final response', async () => {
  const h = harness([
    response([{ type: 'function_call', name: 'load_operator_email_style', call_id: 'style', arguments: '{}' }]),
    response([{ type: 'function_call', name: 'prepare_email_draft', call_id: 'email', arguments: '{}' }]),
    response([]),
  ])
  const result = await h.run()
  assert.equal(result.emailDraft.id, 'email-1')
  assert.equal(result.pendingAction.id, 'send-1')
  assert.equal(result.pendingAction.emailDraftId, 'email-1')
  assert.deepEqual(result.pendingActions, [result.pendingAction])
  assert.equal(h.events.some(event => event.type === 'error'), false)
})


test('Astra starts a read early, reuses it, sends only new tool output and closes the socket', async () => {
  const requests=[];let readCount=0,closed=0,earlyObserved=false
  const query={type:'function_call',name:'query_data_domain',async:true,call_id:'read1',arguments:JSON.stringify({domain:'leads',search:null,take:5})}
  const h=harness([],{
    input:{route:{model:'gpt-6-astra',effort:'medium'},domainCodes:['leads'],
      tools:[{type:'function',name:'query_data_domain'}],
      userClient:{rpc:async()=>{readCount++;return {data:{data:[]},error:null}}}},
    dependencies:{
      collectEmailAddresses:()=>{},addDomainCitations:(_domain,data)=>data,rememberCurrentRecords:()=>{},
      governedResponsesSocket:(_context,_key,callbacks)=>({
        request:async body=>{
          requests.push(structuredClone(body))
          callbacks.onEvent({type:'response.created'})
          if(requests.length===1){
            callbacks.onEvent({type:'response.output_text.delta',delta:'Waiting for records.'})
            callbacks.onAsyncCall(query);await Promise.resolve();earlyObserved=readCount===1
            return {response:{id:'r1',output:[query]},responses:[]}
          }
          callbacks.onEvent({type:'response.output_text.delta',delta:'No matching leads.'})
          return {response:{id:'r2',output:[],answer:'No matching leads.'},responses:[]}
        },close:async()=>{closed++},
      }),
    },
  })
  assert.equal((await h.run()).answer,'No matching leads.')
  assert.equal(earlyObserved,true);assert.equal(readCount,1);assert.equal(closed,1)
  assert.equal(requests[0].tools[0].async,true)
  assert.deepEqual(requests[1].input.map(item=>item.type),['function_call_output'])
  assert.equal(requests[1].input[0].call_id,'read1')
  let visible=''
  for(const event of h.events){
    if(event.type==='answer_reset')visible=''
    if(event.type==='delta')visible+=event.delta
  }
  assert.equal(visible,'No matching leads.')
})

test('a synchronous action in a superseded response is returned as cancelled rather than prepared',async()=>{
 const requests=[]
 const h=harness([],{
  input:{route:{model:'gpt-6-astra',effort:'medium'}},
  dependencies:{governedResponsesSocket:()=>({
   request:async body=>{
    requests.push(structuredClone(body))
    if(requests.length===1){
     const old={id:'old',output:[call('old-action','a')]}
     const next={id:'next',output:[],answer:'Revised request.'}
     return {response:next,responses:[old,next]}
    }
    const final={id:'final',output:[],answer:'No change was made.'}
    return {response:final,responses:[final]}
   },close:async()=>{},
  })},
 })
 assert.equal((await h.run()).answer,'No change was made.')
 assert.equal(h.prepared.length,0)
 const output=requests[1].input.find(item=>item.type==='function_call_output')
 assert.equal(output.call_id,'old-action');assert.equal(JSON.parse(output.output).cancelled,true)
})


test('deadline between two actions retains the first approval and starts no second action or provider round', async () => {
  let checks = 0
  const h = harness([response([call('first', 'a'), call('second', 'b')])], {
    dependencies: {requestDeadline: () => () => ++checks < 4 ? 1000 : 0},
  })
  const result = await h.run()
  assert.equal(h.prepared.length, 1)
  assert.equal(result.pendingActions.length, 1)
  assert.equal(h.requests.length, 1)
  assert.match(result.answer, /time limit/)
})

test('deadline before generation starts performs no provider or action work', async () => {
  const h = harness([], {dependencies: {requestDeadline: () => () => 0}})
  assert.equal(await h.run(), null)
  assert.equal(h.requests.length, 0)
  assert.equal(h.prepared.length, 0)
  assert.equal(h.events.at(-1).code, 'dexter_request_timeout')
})


test('dependent work retains only real pending approvals and survives a partial response', async () => {
  const defer = {type:'function_call',name:'defer_work_until_approval',call_id:'defer-1',arguments:JSON.stringify({label:'Update the postcode',request:'Read company A again and prepare postcode B4 6QF.',after_action_ids:['prepared-1']})}
  const h = harness([response([call('call-a','a')]),response([defer]),{status:503,response:{error:'unavailable'}}])
  const result = await h.run()
  assert.deepEqual(result.deferredWork.afterActionIds,['prepared-1'])
  assert.equal(h.prepared.length,1)
  assert.equal(createDeferredWork({label:'Other',request:'Change B',after_action_ids:['foreign-action']},result.pendingActions,'approve'),null)
  assert.equal(createDeferredWork({label:'Other',request:'Change B',after_action_ids:['prepared-1']},result.pendingActions,'full'),null)
  assert.equal(createDeferredWork({label:'Other',request:'Change B',after_action_ids:['prepared-1']},[{id:'prepared-1',status:'superseded'}],'approve'),null)
})
