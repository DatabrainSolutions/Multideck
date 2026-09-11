import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/action-error.ts',import.meta.url),'utf8'))
const {preparedActionErrorMessage:message}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('stale proposals explain fresh review without exposing a backend prefix',()=>{
 for(const error of [{code:'P0001',message:'CRM_CONFLICT:This organisation changed since it was loaded.'},{code:'40001'}]) {
  assert.match(message(error),/prepare a fresh approval/);assert.doesNotMatch(message(error),/CRM_CONFLICT/)
 }
 assert.match(message({}),/check its current status/)
 assert.equal(message({code:'22023',message:'Choose one primary office.'}),'Choose one primary office.')
})
