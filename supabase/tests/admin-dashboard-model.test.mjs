import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(new URL('../../multideck.client/package.json',import.meta.url))
const { transformSync } = require('esbuild')
function load(path) {
  const module = {exports:{}}
  new Function('module','exports',transformSync(readFileSync(new URL(path,import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code)(module,module.exports)
  return module.exports
}
const { measuredUsage, idleAfterMs, usageModuleForRoute } = load('../../multideck.client/src/lib/workspace-usage-model.ts')
const { validateTelemetry, reportingDates } = load('../functions/admin-dashboard/core.ts')

test('Usage splits at five minutes and excludes hidden windows or suspended timer gaps',()=>{
  assert.deepEqual(measuredUsage(idleAfterMs-10000,idleAfterMs+20000,0,true),[{from:290000,to:300000,state:'active'},{from:300000,to:320000,state:'idle'}])
  assert.deepEqual(measuredUsage(0,30000,0,false),[])
  assert.deepEqual(measuredUsage(0,120000,0,true),[])
  assert.deepEqual(measuredUsage(100,100,0,true),[])
  assert.equal(usageModuleForRoute('/finance/dashboard'),'finance')
  assert.equal(usageModuleForRoute('/admin'),'admin')
})
test('Telemetry discards user-entered content and rejects forged states and elapsed periods',()=>{
  const id='00000000-0000-4000-8000-000000000001',now=Date.now()
  const event={id,kind:'time',module:'quotes',state:'active',from:new Date(now-30000).toISOString(),to:new Date(now).toISOString(),typedContent:'secret',companyId:id,userId:id}
  assert.deepEqual(Object.keys(validateTelemetry(event,now)).sort(),['from','id','kind','module','state','to'])
  assert.throws(()=>validateTelemetry({...event,from:new Date(now-120000).toISOString()},now))
  assert.throws(()=>validateTelemetry({...event,module:'private_mailbox'},now))
  assert.throws(()=>validateTelemetry({...event,state:'productive'},now))
  assert.throws(()=>validateTelemetry({id,kind:'flow',flowId:id,flow:'delete_customer',state:'completed',step:'saved'}))
})
test('Report dates are complete valid ISO dates, ordered and bounded',()=>{
  assert.deepEqual(reportingDates('2026-08-01','2026-08-31'),{from:'2026-08-01',to:'2026-08-31'})
  for(const range of [['2026-02-30','2026-03-01'],['2026-08-01','2026-07-31'],['2024-01-01','2026-01-01'],['foo','2026-01-01']]) assert.throws(()=>reportingDates(...range))
})
