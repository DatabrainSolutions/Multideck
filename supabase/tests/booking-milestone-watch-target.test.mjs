import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'

const read = file => readFileSync(new URL(`../functions/agent-dexter/${file}`,import.meta.url),'utf8')
const {resolveBookingMilestoneWatchTarget: resolve} = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(read('booking-milestone-watch.ts'))).toString('base64')}`)
const id='78c5d03b-2388-4214-8a83-d9d5b05aad22'
const other='273b8213-e3d3-448a-b28d-77c70661ae8b'
const prompt=`Watch only internal test operational milestone ${id} on Booking JE0991134, Sea leg 1, external reference QA-DEXTER-MILESTONE-20260907-NOT-A-SHIPMENT. Notify me when its estimated time changes, including clearing it.`
const record={recordId:id,sourceTable:'Job_RouteMilestones',source:'operator',operatorEditable:true,type:'cargo_ready',bookingReference:'JE0991134',legNumber:1,name:'Cargo ready'}
const result = (records=[record],error=null) => ({data:{data:records},error})

test('the exact operator milestone ID wins over a descriptive or different model target',async()=>{
  for(const target of [{id:'',search:'Booking JE0991134, Sea leg 1, external reference QA'}, {id:other,search:'JE0991134'}]) {
    const queries=[]
    const resolved=await resolve(prompt,target,async search=>{queries.push(search);return result()})
    assert.deepEqual(queries,[id])
    assert.deepEqual(resolved,{ok:true,targetId:id,targetLabel:'JE0991134 · Leg 1 · Cargo ready'})
  }
})

test('every target is permission-checked, including model IDs with no search text',async()=>{
  const queries=[]
  assert.equal((await resolve('Watch this milestone',{id,search:''},async search=>{queries.push(search);return result()})).ok,true)
  assert.deepEqual(queries,[id])
  for (const response of [result([],{}),result([]),result([record,record]),result([{...record,recordId:other}]),
    ...[{source:'provider'},{operatorEditable:false},{type:'customs_released'},{sourceTable:'Job_Routing'},{legNumber:0},{name:''}].map(change=>result([{...record,...change}]))]) {
    assert.equal((await resolve(prompt,{id,search:''},async()=>response)).ok,false)
  }
})

test('human Booking reference still resolves only one eligible saved milestone; ambiguous or empty scope never widens',async()=>{
  const queries=[]
  const resolved=await resolve('Watch the Cargo ready milestone on JE0991134',{id:'',search:'JE0991134'},async search=>{queries.push(search);return result()})
  assert.equal(resolved.ok,true)
  assert.deepEqual(queries,['JE0991134'])
  let calls=0
  const query=async()=>{calls++;return result()}
  assert.equal((await resolve(`Watch milestone ${id} and milestone ${other}`,{id,search:''},query)).ok,false)
  assert.equal((await resolve('Watch milestones',{id:'',search:''},query)).ok,false)
  assert.equal(calls,0)
})

// Execute the actual Edge target-resolution branch, not a parallel test copy.
const edge=read('index.ts')
const branch=edge.slice(edge.indexOf('    let targetId = cleanString(definition.targetId'),edge.indexOf('    let action: JsonObject | null = null',edge.indexOf('    let targetId = cleanString(definition.targetId')))
const runBranch=new Function('deps',`
  const {resolveBookingMilestoneWatchTarget,userClient,prompt,definition}=deps;
  const capability='booking_milestones',attachments=[],request={},locale='en-GB';
  const cleanString=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const isUuid=value=>/^[0-9a-f-]{36}$/i.test(value);
  const watchCandidates=(_,value)=>value.data,watchTargetLabel=(_,value)=>value.targetLabel||value.bookingReference;
  const json=(_,value)=>value;
  ${stripTypeScriptTypes(`async function targetBranch(){${branch}\nreturn {status:'resolved',targetId,targetLabel};}`)}
  return targetBranch;
`)

test('actual create-watch branch uses verified exact identity and label before saving',async()=>{
  const queries=[]
  const actual=await runBranch({resolveBookingMilestoneWatchTarget:resolve,prompt,
    definition:{targetId:'',targetSearch:'Booking JE0991134, Sea leg 1, external reference QA',targetLabel:'Model label'},
    userClient:{rpc:async(name,args)=>{queries.push({name,args});return args.p_search===id?result():result([])}}})()
  assert.equal(actual.status,'resolved')
  assert.equal(actual.targetId,id)
  assert.equal(actual.targetLabel,'JE0991134 · Leg 1 · Cargo ready')
  assert.equal(queries.length,1)
  assert.equal(queries[0].name,'multideck_dexter_query_domain')
  assert.equal(queries[0].args.p_search,id)
})

test('actual create-watch branch stops on denied or retired exact targets',async()=>{
  for(const response of [result([],{}),result([{...record,operatorEditable:false}])]) {
    const actual=await runBranch({resolveBookingMilestoneWatchTarget:resolve,prompt,
      definition:{targetId:id,targetSearch:'',targetLabel:'Invented'},userClient:{rpc:async()=>response}})()
    assert.equal(actual.status,'clarification')
    assert.equal(actual.targetId,undefined)
  }
})

test('real chat instructions provide a truthful dedicated-watch handoff in both English locales',()=>{
  const source=edge.slice(edge.indexOf('function buildInstructions('),edge.indexOf('function emailWritingTools('))
  const build=new Function(`const SPECIALIST_INSTRUCTIONS={auto:'Auto'},PROMPT_VERSION='test',DEXTER_SCOPE_REDIRECT_TOOL='redirect',DEXTER_DOCUMENT_OCR_TOOL='read';
    const localeInstruction=()=>'',supportTicketCopy=()=>'';
    ${stripTypeScriptTypes(source)}; return buildInstructions;`)()
  for (const locale of ['en-GB','en-US']) {
    const instructions=build('auto',[{code:'booking_milestones',description:'Saved milestones'}],[],'approve',locale,[])
    assert.match(instructions,/Watchers > Watch something else \(or \/watch\)/)
    assert.match(instructions,/Ordinary chat cannot create the watch/)
    assert.match(instructions,/not evidence that Watching for you is disconnected/)
    assert.match(instructions,/Do not claim a watch was created/)
    const absent=build('auto',[],[],'approve',locale,[])
    assert.doesNotMatch(absent,/Milestone monitoring is configured in the dedicated Watchers flow/)
  }
})
