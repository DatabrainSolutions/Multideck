import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
const require=createRequire(new URL('../package.json',import.meta.url))
const {buildSync,transformSync}=require('esbuild')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
function load(path){const code=buildSync({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;const module={exports:{}};new Function('module','exports',code)(module,module.exports);return module.exports}
const {changeBookingRouteMode,routeSharedReferenceFields}=load('../src/lib/booking-route-mode-change.ts')
const {freightBookingMode,freightRouteOperationalFields}=load('../src/lib/freight-field-policy.ts')
test('reviewed mode draft clears shared references, preserves typed evidence, and stays bound to the persisted baseline',()=>{
  const original={id:'saved',mode:'sea',masterTransportReference:'MBL',houseTransportReference:'HBL',vessel:'Vessel A',routeData:{source:'accepted_quote'}}
  const air=changeBookingRouteMode(original,'AIR',original)
  const road=changeBookingRouteMode({...air,houseTransportReference:'UNSAVED-AIR'},'ROAD',original)
  assert.equal(road.houseTransportReference,'')
  assert.equal(road.vessel,'Vessel A')
  assert.equal(road.routeData.source,'accepted_quote')
  assert.equal(road.routeData.modeChangeReview.fromMode,'sea')
  assert.equal(road.routeData.modeChangeReview.toMode,'road')
  assert.equal(road.routeData.modeChangeReview.beforeReferences.houseTransportReference,'HBL')
  assert.equal(original.houseTransportReference,'HBL')
  assert.equal(changeBookingRouteMode(original,'OCEAN',original).houseTransportReference,'HBL')
})
test('actual audit view displays escaped before/after references with their own mode labels',()=>{
  const source=readFileSync(new URL('../src/components/multideck/booking-components.tsx',import.meta.url),'utf8')
  const start=source.indexOf('function BookingActivityWorkspace(')
  const code=transformSync(source.slice(start,source.indexOf('function bookingQuoteSyncValue(',start)),{loader:'tsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).code
  const wrapper=({children})=>React.createElement('div',null,children)
  const asRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{}
  const recordText=(value,key)=>typeof value[key]==='string'?value[key]:''
  const View=new Function('React','useLanguage','Surface','BookingWorkspaceSectionTitle','asRecord','recordText','freightRouteOperationalFields','bookingWorkspaceMode','routeSharedReferenceFields',`${code};return BookingActivityWorkspace`)(React,()=>({language:'en-GB',t:value=>value}),wrapper,wrapper,asRecord,recordText,freightRouteOperationalFields,freightBookingMode,routeSharedReferenceFields)
  const html=renderToStaticMarkup(React.createElement(View,{record:{workspace:{events:[{id:'event',occurredAt:'2026-09-05T12:00:00Z',type:'route_mode_changed',summary:'Mode changed',actor:'Operator',metadata:{fromMode:'sea',toMode:'air',beforeReferences:{houseTransportReference:'HBL <script>bad</script>'},afterReferences:{masterTransportReference:'125-12345675'}}}]}}}))
  assert.match(html,/House bill of lading/)
  assert.match(html,/Master air waybill/)
  assert.match(html,/HBL &lt;script&gt;bad&lt;\/script&gt;/)
  assert.match(html,/125-12345675/)
  assert.doesNotMatch(html,/<script>/)
})
