import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteWorkspaceFromVersion, selectVersion, makeVersion, makeWorkspace, renderVersion, renderSelectedPanel, attemptRevisionWithUnavailableSnapshot } from './quote-submitted-fixture.mjs'

test('issued snapshots never inherit missing content from the current Quote', () => {
  const version=makeVersion(1,{terms:null,customerNotes:'',shipmentFacts:{}})
  const current=makeWorkspace([version])
  const original=structuredClone(current)
  const result=quoteWorkspaceFromVersion(current,version)
  assert.equal(result.quote.reference,'JQ20020')
  assert.equal(result.quote.customerName,'Saved customer')
  assert.equal(result.quote.customerId,'')
  assert.equal(result.quote.terms,null)
  assert.equal(result.quote.customerNotes,'')
  assert.equal(result.quote.contactEmail,undefined)
  assert.equal(result.quote.payer,undefined)
  assert.deepEqual(result.quote.shipmentFacts,{})
  assert.deepEqual(result.charges,[])
  assert.deepEqual(current,original)
})

test('the real page switches current issued and historical versions without live payer fallback or editing', () => {
  const v1=makeVersion(1,{terms:'Original terms',shipmentFacts:{goodsValue:'100'}})
  const v2=makeVersion(2,{terms:'',shipmentFacts:{goodsValue:'200'}})
  const current=makeWorkspace([v1,v2])
  const lookups={organisations:[{id:'current-customer',name:'CURRENT PAYER',quoteTerms:{terms:'CHANGED MASTER TERMS'}}]}
  const first=selectVersion(current,'version-1',{terms:'DRAFT TERMS'},[],lookups)
  const second=selectVersion(current,null,{terms:'DRAFT TERMS'},[],lookups)
  assert.equal(first.presentedQuote.terms,'Original terms')
  assert.equal(second.presentedQuote.terms,'')
  assert.equal(first.presentedQuote.goodsValue,'100')
  assert.equal(second.presentedQuote.goodsValue,'200')
  assert.equal(first.workspaceEditable,false)
  assert.equal(second.workspaceEditable,false)
  assert.deepEqual(first.activeCharges,[])
  const draft=makeVersion(3);draft.CusQuoteVersion_IsSubmitted=false;draft.CusQuoteVersion_IsCurrent=true;v2.CusQuoteVersion_IsCurrent=false
  const draftRecord={terms:'Draft in progress'}
  const draftCharges=[{id:'draft-charge'}]
  const state=selectVersion(makeWorkspace([v1,v2,draft]),null,draftRecord,draftCharges,lookups)
  assert.equal(state.workspaceEditable,true)
  assert.equal(state.presentedQuote,draftRecord)
  assert.equal(state.activeCharges,draftCharges)
  assert.equal(selectVersion(makeWorkspace([v1,v2,draft]),'version-2',draftRecord,draftCharges,lookups).workspaceEditable,false)
})

test('missing or malformed snapshots fail visibly rather than falling back to an editable draft', () => {
  for(const quote of [null,[],{shipmentFacts:[]},{charges:[null]},{shipmentFacts:{cargoLines:'broken'}}]) {
    const version=makeVersion(1);version.CusQuoteVersion_SnapshotJSON={quote}
    assert.equal(quoteWorkspaceFromVersion(makeWorkspace([version]),version),null)
  }
  const version=makeVersion(1);version.CusQuoteVersion_SnapshotJSON=null
  const draft=makeVersion(2);draft.CusQuoteVersion_IsSubmitted=false
  const state=selectVersion(makeWorkspace([version,draft]),'version-1',{terms:'Draft'},[],null)
  assert.equal(state.workspaceEditable,false)
  assert.equal(state.viewedVersionWorkspace,null)
  assert.match(renderVersion(version),/role="alert"/)
  assert.doesNotMatch(renderVersion(version),/Draft|CURRENT/)
})

test('summary renders full version values, precise cargo, routing and terms as text without edit controls', () => {
  const version=makeVersion(2,{terms:'First line\nSecond line',payer:{name:'Saved payer',address:'Saved billing address'},internalNotes:'Operator-only note',
    shipmentFacts:{estimatedDeparture:'2026-09-18',estimatedArrival:'2026-10-18',goodsValue:'0',goodsValueCurrency:'GBP',
      cargoLines:[{id:'one',description:'<script>alert(1)</script>Long description',grossWeightKg:'9999999999999999.99',isHazardous:false,isTemperatureControlled:true},
        {id:'two',description:'Second cargo',grossWeightKg:'0'}],routingLegs:[{id:'route1',mode:'rail',origin:{place:'Saved origin'},destination:{place:'Saved destination'},estimatedArrival:'2026-10-18'}],
      containerRequests:[{id:'c1',quantity:'2',type:'40HC'}]}})
  for(const language of ['en-GB','en-US']) {
    globalThis.quoteTestLanguage=language
    const html=renderVersion(version)
    for(const text of ['Saved payer','Saved billing address','First line\nSecond line','9999999999999999.99','Second cargo','Saved origin','Saved destination','40HC','0 GBP','Operator-only note']) assert.ok(html.includes(text),text)
    assert.match(html,/>No<\/dd>/)
    assert.match(html,/>Yes<\/dd>/)
    assert.match(html,/JQ20020 - V2/)
    assert.doesNotMatch(html,/<input|<textarea|<select|contenteditable=|<script>/)
    assert.match(html,/&lt;script&gt;/)
    assert.match(html,/<details/)
    assert.match(html,/<summary/)
    assert.match(html,/<dt/)
    assert.match(html,/<dd/)
  }
  const original=renderVersion(makeVersion(1))
  assert.doesNotMatch(original,/JQ20020 - V1/)
})

test('empty structured cargo never revives legacy totals; malformed nested data is reported', () => {
  assert.doesNotMatch(renderVersion(makeVersion(1,{shipmentFacts:{containerRequests:[],container:'LEGACY CONTAINER'}})),/LEGACY CONTAINER/)
  assert.match(renderVersion(makeVersion(1,{shipmentFacts:{container:'Legacy 20GP'}})),/Legacy 20GP/)
  assert.doesNotMatch(renderVersion(makeVersion(1,{shipmentFacts:{cargoLines:[],packageQuantity:'LEGACY TOTAL'}})),/LEGACY TOTAL/)
  assert.match(renderVersion(makeVersion(1,{shipmentFacts:{packageQuantity:'Legacy 4'}})),/Legacy 4/)
  assert.match(renderVersion(makeVersion(1,{shipmentFacts:{supplierOptionsJson:JSON.stringify([{supplierName:'Supplier',carriers:'broken'}])}})),/Carrier options could not be read/)
  assert.match(renderVersion(makeVersion(1,{shipmentFacts:{cargoLines:[null]}})),/Cargo lines could not be read/)
})

test('submitted charges show saved amounts and rates without a live finance dependency', () => {
  const version=makeVersion(2,{currency:'GBP',charges:[{id:'saved-charge',description:'Saved freight',sourceLabel:'Saved supplier',
    costAmount:100,costCurrency:'USD',sellAmount:160,sellCurrency:'USD',costLocal:77.77,sellLocal:123.45,costRoe:1.285879,sellRoe:1.296071,
    showToCustomer:false,internalNotes:'Internal supplier negotiation',customerNotes:'Customer line note'}]})
  const html=renderVersion(version,false,true)
  for(const value of ['Saved freight','Saved supplier','100 USD','160 USD','77.77 GBP','123.45 GBP','1.285879','1.296071','Internal supplier negotiation','Customer line note']) assert.ok(html.includes(value),value)
  assert.match(html,/>No<\/dd>/)
  assert.doesNotMatch(html,/<input|<textarea|<select|Cargo lines/)
  assert.match(renderVersion(makeVersion(2),false,true),/No charge lines were recorded/)
})

test('overview stays concise and details preserve the complete saved record', () => {
  const version=makeVersion(2,{internalNotes:'PRIVATE RECORDED NOTE',terms:'Detailed terms'})
  assert.match(renderVersion(version,true),/At a glance/)
  assert.doesNotMatch(renderVersion(version,true),/PRIVATE RECORDED NOTE|Detailed terms/)
  assert.match(renderVersion(version),/Detailed terms/)
})

test('the real page uses snapshot-only panels for every submitted content tab and blocks unreadable versions', () => {
  const version=makeVersion(2,{terms:'Saved terms',shipmentFacts:{cargoLines:[{id:'00000000-0000-4000-8000-000000000001',description:'Snapshot cargo'}]},
    charges:[{id:'recorded-line',description:'Snapshot charge',costLocal:12.34,sellLocal:45.67}]})
  const state=selectVersion(makeWorkspace([version]),null,{terms:'CURRENT DRAFT'},[],null)
  for(const tab of ['overview','details','charges']) {
    const html=renderSelectedPanel(state,tab)
    assert.match(html,/Submitted version/)
    assert.doesNotMatch(html,/Draft panel|CURRENT DRAFT|<input|<select|<textarea/)
  }
  assert.match(renderSelectedPanel(state,'details'),/Snapshot cargo/)
  assert.match(renderSelectedPanel(state,'charges'),/Snapshot charge/)
  version.CusQuoteVersion_SnapshotJSON=null
  const unreadable=selectVersion(makeWorkspace([version]),null,{terms:'CURRENT DRAFT'},[],null)
  for(const tab of ['overview','details','charges']) {
    const html=renderSelectedPanel(unreadable,tab)
    assert.match(html,/role="alert"/)
    assert.doesNotMatch(html,/Snapshot charge|Snapshot cargo|CURRENT DRAFT|Draft panel/)
  }
  version.CusQuoteVersion_IsSubmitted=false
  assert.equal(renderSelectedPanel(selectVersion(makeWorkspace([version]),null,{},[],null),'details'),'Draft panel')
})

test('neither copy nor blank revision silently uses a different Quote when the selected snapshot is unavailable', async () => {
  const errors=await attemptRevisionWithUnavailableSnapshot()
  assert.equal(errors.length,2)
  for(const error of errors) assert.match(error,/selected version’s saved details are unavailable/)
})
