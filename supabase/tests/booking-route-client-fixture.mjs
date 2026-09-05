import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require=createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const {transformSync}=require('esbuild')
export const bookingRouteSource=readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx',import.meta.url),'utf8')
const start=bookingRouteSource.indexOf('  function updateDraftRoute(')
assert.ok(start>0)
const code=transformSync(bookingRouteSource.slice(start,bookingRouteSource.indexOf('  function selectDraftRouteOrganisation(',start)),{loader:'ts'}).code
export function mutateBookingRoute(workspace,index,field,value) {
  let result=workspace
  const update=new Function('setDraftWorkspace',`${code};return updateDraftRoute`)(callback=>{result=callback(result)})
  update(index,field,value)
  return result
}
