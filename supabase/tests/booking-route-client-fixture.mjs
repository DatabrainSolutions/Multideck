import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require=createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const {transformSync,buildSync}=require('esbuild')
const helper=buildSync({entryPoints:[new URL('../../multideck.client/src/lib/booking-route-mode-change.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text
const helperModule={exports:{}}
new Function('module','exports',helper)(helperModule,helperModule.exports)
export const {changeBookingRouteMode}=helperModule.exports
const cutoffs=buildSync({entryPoints:[new URL('../../multideck.client/src/lib/booking-route-cutoffs.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text
const cutoffModule={exports:{}}
new Function('module','exports',cutoffs)(cutoffModule,cutoffModule.exports)
export const {bookingRouteCutoffFields,routeCutoffInputValue,changeRouteCutoff}=cutoffModule.exports
export const bookingRouteSource=readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx',import.meta.url),'utf8')
const start=bookingRouteSource.indexOf('  function updateDraftRoute(')
assert.ok(start>0)
const code=transformSync(bookingRouteSource.slice(start,bookingRouteSource.indexOf('  function selectDraftRouteOrganisation(',start)),{loader:'ts'}).code
export function mutateBookingRoute(workspace,index,field,value,savedWorkspace=workspace) {
  let result=workspace
  const update=new Function('setDraftWorkspace','changeBookingRouteMode','loadedRecord','bookingRouteCutoffFields',`${code};return updateDraftRoute`)(callback=>{result=callback(result)},changeBookingRouteMode,{workspace:savedWorkspace},bookingRouteCutoffFields)
  update(index,field,value)
  return result
}
