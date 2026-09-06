import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { freightBookingMode, freightModeKey, freightShipmentAllowed } from '../src/lib/freight-field-policy.ts'
const { transformSync } = createRequire(new URL('../package.json', import.meta.url))('esbuild')
const quoteSource = readFileSync(new URL('../src/pages/quotes-page.tsx', import.meta.url),'utf8')
const bookingSource = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url),'utf8')
function callbacks(source, end) {
  const start=source.indexOf('  function requestOverallMode(')
  return transformSync(source.slice(start,source.indexOf(end,start)),{loader:'tsx'}).code
}
function harness(kind, editable=true) {
  const quote={id:'quote-1',mode:'Sea',shipmentType:'FCL',routingLegsJson:'[{"id":"route-1","mode":"Sea"}]'}
  const record={booking:{id:'booking-1',mode:'OCEAN',shipmentType:'FCL'}}
  const workspace={routes:[{id:'route-1',mode:'Sea',houseTransportReference:'KEEP-HBL',plannedArrivalAt:'2026-10-01'}]}
  const source=kind==='quote'?callbacks(quoteSource,'  function baseRoutingLeg('):callbacks(bookingSource,'  return (')
  return new Function('quote','record','workspace','editable','freightModeKey','freightShipmentAllowed','bookingWorkspaceMode',`
    let pendingOverallMode=null;const patches=[],errors=[];
    const setPendingOverallMode=value=>pendingOverallMode=value, t=value=>value,toast={error:(...args)=>errors.push(args)};
    const detailValue=(_,fallback)=>fallback;
    const onQuotePatch=patch=>{patches.push(patch);Object.assign(quote,patch)};
    const onBookingChange=(field,value)=>{patches.push({[field]:value});record.booking[field]=value};
    const onDetailChange=onBookingChange;
    ${source}
    return {quote,record,workspace,patches,errors,requestOverallMode,confirmOverallMode,cancel:()=>setPendingOverallMode(null),state:()=>pendingOverallMode,setEditable:value=>editable=value};
  `)(quote,record,workspace,editable,freightModeKey,freightShipmentAllowed,freightBookingMode)
}
for (const kind of ['quote','booking']) {
  test(`${kind}: overall mode changes wait for approval, preserve routes and clear incompatible service only on confirm`,()=>{
    const ui=harness(kind);const beforeRoutes=structuredClone(ui.workspace.routes)
    const originalQuoteRoutes=ui.quote.routingLegsJson
    ui.requestOverallMode('AIR');assert.equal(ui.patches.length,0);assert.equal(ui.state().to,'AIR')
    ui.cancel();ui.confirmOverallMode();assert.equal(ui.patches.length,0)
    ui.requestOverallMode('AIR');ui.confirmOverallMode()
    const value=kind==='quote'?ui.quote:ui.record.booking
    assert.equal(value.mode,'AIR');assert.equal(value.shipmentType,'')
    assert.deepEqual(ui.workspace.routes,beforeRoutes);assert.equal(ui.quote.routingLegsJson,originalQuoteRoutes)
    assert.equal(ui.state(),null)
  })
  test(`${kind}: stale record, mode, service or routing invalidates the pending approval`,()=>{
    for (const change of ['id','mode','shipmentType','routes']) {
      const ui=harness(kind);ui.requestOverallMode('AIR')
      const value=kind==='quote'?ui.quote:ui.record.booking
      if(change==='routes') { if(kind==='quote')ui.quote.routingLegsJson='[]';else ui.workspace.routes[0].plannedArrivalAt='2026-11-01' }
      else value[change]='changed'
      ui.confirmOverallMode();assert.equal(ui.patches.length,0,change);assert.equal(ui.errors.length,1,change);assert.equal(ui.state(),null)
    }
  })
  test(`${kind}: aliases, read-only and permission changes cannot cause an unintended edit`,()=>{
    const same=harness(kind);same.requestOverallMode('Ocean');assert.equal(same.state(),null)
    const blocked=harness(kind,false);blocked.requestOverallMode('AIR');blocked.confirmOverallMode();assert.equal(blocked.patches.length,0)
    const revoked=harness(kind);revoked.requestOverallMode('AIR');revoked.setEditable(false);revoked.confirmOverallMode();assert.equal(revoked.patches.length,0)
    const valid=harness(kind);valid.requestOverallMode('RAIL');valid.confirmOverallMode()
    assert.equal((kind==='quote'?valid.quote:valid.record.booking).shipmentType,'FCL')
  })
}
test('quote: initial mode and optional shipment type remain valid draft states',()=>{
  const initial=harness('quote');initial.quote.mode='';initial.quote.shipmentType=undefined
  initial.requestOverallMode('Air');assert.equal(initial.quote.mode,'Air');assert.equal(initial.state(),null)
  const existing=harness('quote');existing.quote.shipmentType=undefined
  existing.requestOverallMode('Air');existing.confirmOverallMode()
  assert.equal(existing.quote.mode,'Air');assert.equal(existing.quote.shipmentType,'')
})
