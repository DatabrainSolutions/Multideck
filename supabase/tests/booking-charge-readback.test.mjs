import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require=createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const ts=require('typescript')
const source=readFileSync(new URL('../../multideck.client/src/lib/booking-charge-readback.ts',import.meta.url),'utf8')
const context=vm.createContext({exports:{}})
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context)
const read=context.exports.planningChargeReadback
test('readback distinguishes source amounts from base amounts without recalculation',()=>{
 assert.equal(read({planningCurrency:{cost:'EUR',sell:'USD',base:'GBP'},costAmount:120,sellAmount:250,costLocal:100,sellLocal:200},x=>x),
 'Cost EUR 120.00 · Sell USD 250.00 · Base cost GBP 100.00 · Base sell GBP 200.00')
})
test('readback preserves zero and exposes missing values without guessing currency',()=>{
 assert.equal(read({planningCurrency:{},costAmount:0,sellAmount:null,costLocal:NaN,sellLocal:0},x=>x),
 'Cost Currency not recorded 0.00 · Sell Not recorded · Base cost Not recorded · Base sell Currency not recorded 0.00')
 assert.equal(read({costLocal:100},x=>x),null,'Legacy charges retain their existing rendering')
})
