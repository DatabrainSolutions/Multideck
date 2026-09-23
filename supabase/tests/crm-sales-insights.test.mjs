import './register-typescript.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salesNarrativeFixture, salesThemeFixture } from './crm-sales-analysis-fixture.mjs'
const { buildSalesEvidence, parseSalesAnalysis, salesFilters, modelOutputText, salesEvidenceFingerprint, salesAnalysisSchemaFor } = await import('../functions/crm-sales-insights/core.ts')
const { buildSalesNarrative, parseSalesThemes } = await import('../functions/crm-sales-insights/narrative.ts')

const id='10000000-0000-0000-0000-000000000001'
test('provider schema only permits existing evidence on its matching chart and no themes without feedback',()=>{
  const facts=buildSalesEvidence({summary:{openDeals:7,missingActions:7,slippingDeals:6}})
  const schema=salesAnalysisSchemaFor(facts,buildSalesNarrative(undefined))
  assert.equal(schema.properties.themes.maxItems,0)
  const choices=schema.properties.findings.items.anyOf
  assert.deepEqual(choices.map(choice=>choice.properties.section.enum[0]),['trend','stages','dates'])
  assert.deepEqual(choices.find(choice=>choice.properties.section.enum[0]==='stages').properties.evidenceIds.items.enum,['summary.missingActions'])
  const narrative=buildSalesNarrative(salesNarrativeFixture())
  const themeSchema=salesAnalysisSchemaFor(facts,narrative).properties.themes
  assert.deepEqual(themeSchema.items.properties.memberships.items.properties.sourceId.enum,narrative.documents.map(document=>document.id))
  assert.throws(()=>parseSalesAnalysis({summary:'A review',themes:[],findings:[{section:'trend',title:'Actions',observation:'Missing actions',recommendation:'Set actions',evidenceIds:['summary.missingActions']}]},facts,'',undefined,buildSalesNarrative(undefined)))
})
test('analysis filters are bounded and cannot supply customer metrics or arbitrary scope',()=>{
  assert.deepEqual(salesFilters({}),{days:90,pipelineId:null,ownerId:null})
  assert.deepEqual(salesFilters({days:30,pipelineId:id}),{days:30,pipelineId:id,ownerId:null})
  for(const input of [{days:0},{days:100000},{days:'90'},{ownerId:'someone'},{companyId:id},{metrics:{won:99}}]) assert.throws(()=>salesFilters(input))
})
test('facts retain measured denominators, valid sources and unknown stage coverage',()=>{
  const facts=buildSalesEvidence({summary:{openDeals:5,wonDeals:2,lostDeals:1,closedDeals:3,winRatePct:66.666},
    outcomes:[{id,outcome:'won'},{id:'not-a-record',outcome:'lost'}],
    stages:[{name:'Unmeasured',averageDays:null,sampleSize:0},{name:'Proposal',pipelineName:'Freight',averageDays:12.4,medianDays:10,sampleSize:3,dealIds:[id,id,'https://bad.test']}],
    lossReasons:[{name:'Price',count:1,sharePct:100,dealIds:[id]}]})
  assert.equal(facts.find(x=>x.id==='summary.winRatePct').value,'66.7% (2 won / 3 closed)')
  assert.equal(facts.filter(x=>x.id.startsWith('stage.')).length,1)
  assert.deepEqual(facts.find(x=>x.id==='stage.1').dealIds,[id])
  assert.equal(buildSalesEvidence({summary:{winRatePct:null}}).length,0)
})
test('model cannot invent evidence values, source links or unsupported evidence IDs',()=>{
  const facts=[{id:'known',label:'Recorded losses',value:'4',dealIds:[id]}]
  const finding={title:'Review losses',observation:'The recorded losses deserve review.',recommendation:'Review the reasons together.',evidenceIds:['known'],evidence:[{label:'fake',value:'500',dealIds:['unknown']}]}
  const parsed=parseSalesAnalysis({summary:'Review the recorded outcomes.',findings:[finding]},facts,'2026-09-22T10:00:00Z','2026-09-22T10:01:00Z')
  assert.deepEqual(parsed.findings[0].evidence,[{label:'Recorded losses',value:'4',dealIds:[id]}])
  assert.equal(parsed.dataAsOf,'2026-09-22T10:00:00Z')
  assert.throws(()=>parseSalesAnalysis({summary:'a',findings:[{...finding,evidenceIds:['invented']}]},facts,''))
  assert.throws(()=>parseSalesAnalysis({summary:'a',findings:[{...finding,evidenceIds:[]}]},facts,''))
  assert.throws(()=>parseSalesAnalysis({summary:'a',findings:Array(5).fill(finding)},facts,''))
})
test('provider text parsing handles standard response envelopes',()=>{
  assert.equal(modelOutputText({output:[{content:[{type:'output_text',text:'{"summary":"x"}'}]}]}),'{"summary":"x"}')
  assert.equal(modelOutputText({output:[{content:[{type:'refusal',refusal:'unavailable'}]}]}),'')
})
test('material evidence fingerprints ignore response timestamps and object key order',async()=>{
  const a={generatedAt:'2026-09-22T10:00Z',coverage:{note:'Observed only',totalDeals:2},evidence:[{id:'summary.openDeals',value:'2'}]}
  const b={evidence:[{value:'2',id:'summary.openDeals'}],coverage:{totalDeals:2,note:'Observed only'},generatedAt:'2026-09-23T12:00Z'}
  assert.equal(await salesEvidenceFingerprint(a,'gpt-5-mini'),await salesEvidenceFingerprint(b,'gpt-5-mini'))
  b.evidence[0].value='3'
  assert.notEqual(await salesEvidenceFingerprint(a,'gpt-5-mini'),await salesEvidenceFingerprint(b,'gpt-5-mini'))
})
test('weekly evidence preserves partial periods and historical outcomes rather than implying current conversion',()=>{
  const facts=buildSalesEvidence({trend:{buckets:[{start:'2026-09-21',end:'2026-09-23',won:1,lost:2,isPartial:true,wonDealIds:[id],lostDealIds:['foreign-string']}]}})
  assert.match(facts[0].value,/partial week/);assert.match(facts[0].value,/later reopened/);assert.deepEqual(facts[0].dealIds,[id])
})

test('semantic groups preserve canonical source quotations and outcome metadata without model-authored metrics',()=>{
  const source = buildSalesNarrative(salesNarrativeFixture())
  const themes = parseSalesThemes(salesThemeFixture(), source)
  assert.deepEqual(themes[0].memberships.map(row=>row.dealId), source.deals.map(row=>row.id))
  assert.deepEqual(themes[0].memberships.map(row=>row.kind), ['loss_feedback','action_outcome'])
  assert.equal(themes[0].memberships[0].recordedAt, source.documents[0].recordedAt)
  assert.equal(themes[0].count, undefined)
  const analysis = parseSalesAnalysis({summary:'Feedback reviewed.',findings:[],themes:salesThemeFixture()},[],'2026-09-22T10:00:00Z',undefined,source)
  assert.equal(analysis.schemaVersion,3)
  assert.deepEqual(analysis.narrative.deals,source.deals)
  assert.equal(analysis.narrative.documents,undefined,'Do not save full raw documents in the generated result')
})

test('themes cannot fabricate quotations, deal references, probabilities or recurring patterns from one deal',()=>{
  const source=buildSalesNarrative(salesNarrativeFixture())
  for(const mutate of [
    themes=>{themes[0].memberships[0].sourceId='loss_feedback:60000000-0000-0000-0000-000000000099'},
    themes=>{themes[0].memberships[0].excerpt='Customer says we are much too expensive'},
    themes=>{themes[0].memberships[0].dealId=source.deals[1].id},
    themes=>{themes[0].winProbability=0.99},
    themes=>{themes[0].memberships.push({...themes[0].memberships[0]})},
    themes=>{themes[0].memberships.pop()},
    themes=>{themes.push(structuredClone(themes[0]))},
  ]){ const themes=salesThemeFixture();mutate(themes);assert.throws(()=>parseSalesThemes(themes,source)) }
  const oneDeal=structuredClone(source)
  oneDeal.documents[1].dealId=oneDeal.documents[0].dealId
  assert.throws(()=>parseSalesThemes(salesThemeFixture(),oneDeal))
  assert.throws(()=>parseSalesThemes(salesThemeFixture(),buildSalesNarrative(undefined)))
  assert.deepEqual(parseSalesThemes([],buildSalesNarrative(undefined)),[])
})

test('narrative corpus is bounded, excludes unsupported/private source kinds and affects the saved fingerprint',async()=>{
  const source=salesNarrativeFixture()
  for(const mutate of [
    value=>{value.documents=Array(41).fill(value.documents[0])},
    value=>{value.documents[0].kind='private_mail'},
    value=>{value.documents[0].dealId='60000000-0000-0000-0000-000000000099'},
    value=>{value.documents[0].text='x'.repeat(601)},
    value=>{value.deals[0].outcome='predicted_won'},
    value=>{value.documents[0].recordedAt='not a date'},
  ]){const value=structuredClone(source);mutate(value);assert.throws(()=>buildSalesNarrative(value))}
  const a=await salesEvidenceFingerprint({narrative:buildSalesNarrative(source)},'model')
  source.documents[0].text+=' Revised feedback.'
  assert.notEqual(a,await salesEvidenceFingerprint({narrative:buildSalesNarrative(source)},'model'))
  const subset=buildSalesNarrative({...source,totalDocuments:60,totalDeals:50})
  assert.equal(subset.truncated,true)
  assert.equal(subset.includedDocuments,2)
})

test('chart explanations need relevant canonical evidence and a supported section',()=>{
  const facts=buildSalesEvidence({summary:{closedDeals:3},lossReasons:[{name:'Price',count:2,sharePct:66.7,dealIds:[id]}]})
  const payload={summary:'Feedback reviewed.',themes:[],findings:[{section:'losses',title:'Review pricing feedback',observation:'Price is recorded on two losses.',recommendation:'Review the original feedback.',evidenceIds:['loss.0']}]}
  assert.equal(parseSalesAnalysis(payload,facts,'',undefined,buildSalesNarrative(undefined)).findings[0].section,'losses')
  payload.findings[0].section='trend'
  assert.throws(()=>parseSalesAnalysis(payload,facts,'',undefined,buildSalesNarrative(undefined)))
  payload.findings[0].section='arbitrary_widget'
  assert.throws(()=>parseSalesAnalysis(payload,facts,'',undefined,buildSalesNarrative(undefined)))
})


test('saved classifications ignore narrative clock bounds and live joins while retaining source changes',async()=>{
  const original={evidence:[{id:'summary.openDeals',value:'1'}],narrative:buildSalesNarrative(salesNarrativeFixture())}
  const changed=structuredClone(original)
  changed.narrative.from='2026-06-25T12:30:00Z';changed.narrative.to='2026-09-23T12:30:00Z'
  changed.narrative.deals[0].daysInStage=100.12345
  changed.narrative.deals[0].stageName='Another stage'
  changed.narrative.deals[0].ownerId=id
  const fingerprint=await salesEvidenceFingerprint(original,'model')
  assert.equal(fingerprint,await salesEvidenceFingerprint(changed,'model'))
  changed.narrative.documents[0].recordedAt='2026-09-23T10:00:00Z'
  assert.notEqual(fingerprint,await salesEvidenceFingerprint(changed,'model'))
  changed.narrative=structuredClone(original.narrative)
  changed.evidence[0].value='2'
  assert.notEqual(fingerprint,await salesEvidenceFingerprint(changed,'model'))
})
