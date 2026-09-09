import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
const require=createRequire(new URL('../package.json',import.meta.url))
const {transformSync}=require('esbuild')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const source=readFileSync(new URL('../src/components/multideck/booking-components.tsx',import.meta.url),'utf8')
const panel=source.slice(source.indexOf('function BookingQuoteSyncReviewPanel('),source.indexOf('function BookingDetailTabPage('))
const callbacks=transformSync(panel.slice(panel.indexOf('  function requestApply('),panel.indexOf('\n  return (')),{loader:'tsx'}).code
function interaction(differences,disabled=false){
  return new Function('availableDifferences','controlsDisabled',`
    const review={reviewToken:'original-token'},pendingModeReviewToken={current:null},applyTriggerRef={current:null},calls=[];
    let pendingModeFields=null,modeReviewError=null;
    const setPendingModeFields=v=>pendingModeFields=v,setModeReviewError=v=>modeReviewError=v,onApply=(...args)=>calls.push(args);
    ${callbacks}
    return {requestApply,confirmModeChange,review,calls,state:()=>({pendingModeFields,modeReviewError})};
  `)(differences,disabled)
}
test('actual review callbacks require selected nested mode approval, but not dates or unrelated conflicts',()=>{
  const mode={key:'routing',warningCode:'mode_change'}
  const changed=interaction([mode,{key:'customerNotes',conflict:true}])
  changed.requestApply(['routing','customerNotes'],{})
  assert.equal(changed.calls.length,0)
  assert.deepEqual(changed.state().pendingModeFields,['routing','customerNotes'])
  changed.confirmModeChange()
  assert.deepEqual(changed.calls,[[['routing','customerNotes'],true]])
  for(const fields of [['customerNotes'],['routing']]){
    const ordinary=interaction([{key:'routing',warningCode:'booking_changed',conflict:true},{key:'customerNotes'}])
    ordinary.requestApply(fields,{})
    assert.deepEqual(ordinary.calls,[[fields,false]])
  }
  const unselectedMode=interaction([mode,{key:'customerNotes'}]);unselectedMode.requestApply(['customerNotes'],{})
  assert.deepEqual(unselectedMode.calls,[[['customerNotes'],false]])
  const topMode=interaction([{key:'mode'}]);topMode.requestApply(['mode'],{});assert.equal(topMode.calls.length,0)
  for(const fields of [[],['routing']]){const blocked=interaction([mode],true);blocked.requestApply(fields,{});assert.equal(blocked.calls.length,0)}
})
test('confirmation is bound to the review that opened the dialog, not a newer incoming review',()=>{
  const ui=interaction([{key:'routing',warningCode:'mode_change'}]);ui.requestApply(['routing'],{})
  ui.review.reviewToken='changed-token';ui.confirmModeChange()
  assert.equal(ui.calls.length,0)
  assert.equal(ui.state().pendingModeFields,null)
  assert.match(ui.state().modeReviewError,/review changed/)
  ui.requestApply(['routing'],{});ui.confirmModeChange();assert.deepEqual(ui.calls,[[['routing'],true]])
})

const code=transformSync(source.slice(source.indexOf('function bookingQuoteSyncValue('),source.indexOf('function BookingDetailTabPage(')),{loader:'tsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).code
const wrapper=({children})=>React.createElement('div',null,children)
const mocks={React,useState:React.useState,useRef:React.useRef,useLanguage:()=>({language:'en-GB',t:v=>v}),cn:(...parts)=>parts.filter(Boolean).join(' ')}
for(const name of ['Surface','StatusPill','Button','Checkbox','ArrowRight','Check','TriangleAlert','Dialog','DialogClose','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'])mocks[name]=wrapper
const View=new Function(...Object.keys(mocks),`${code};return BookingQuoteSyncReviewPanel`)(...Object.values(mocks))
const route={mode:'Sea',origin:'GBFXT',destination:'USNYC',originUnlocode:'GBFXT',destinationUnlocode:'USNYC',plannedDepartureAt:'2026-09-18',plannedArrivalAt:'2026-10-01',carrierName:'Carrier <script>bad</script>',serviceLevel:'Standard',internalNotes:'PRIVATE_DATA_MUST_NOT_RENDER'}
function render(values){return renderToStaticMarkup(React.createElement(View,{busy:false,refreshing:false,detailsDirty:false,expanded:true,error:null,onApply(){},onOpenDetails(){},onRefresh(){},onToggle(){},selectedFields:new Set(),review:{reviewId:'test',reviewToken:'token',appliedFields:[],quoteReference:'JQTEST',proposedVersionNumber:2,differences:[{key:'routing',label:'Routing plan',section:'Route & service',warningCode:'mode_change',requiresConfirmation:true,...values}]}}))}
test('actual routing comparison exposes each source, leg and applied field, not just a line count',()=>{
  const html=render({previousQuoteValue:[route],bookingValue:[route],newQuoteValue:[{...route,mode:'Air',serviceLevel:'Express'},{...route,mode:'Road',destination:'USCHI'}]})
  for(const expected of ['Inspect routing plan','Previous quote','Current booking','New accepted quote','Mode change','Leg 2','Air','Road','USCHI','Express','18 Sept 2026','1 Oct 2026','Booking-only legs remain separate'])assert.ok(html.includes(expected),expected)
  assert.match(html,/Carrier &lt;script&gt;bad&lt;\/script&gt;/)
  assert.doesNotMatch(html,/<script>|PRIVATE_DATA_MUST_NOT_RENDER/)
  assert.ok(html.indexOf('</label>')<html.indexOf('Inspect routing plan'),'Inspecting details must not select Apply')
})
test('unavailable, empty and malformed routing evidence remains explicit',()=>{
  const html=render({previousQuoteValue:null,bookingValue:[],newQuoteValue:[null]})
  for(const expected of ['Routing plan unavailable','No Quote-owned legs','Routing leg unavailable'])assert.ok(html.includes(expected))
})
