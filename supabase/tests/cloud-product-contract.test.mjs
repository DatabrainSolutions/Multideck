import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseProductRequest, validProductAuthentication } from '../functions/_shared/cloud-product-contract.mts'

const tenant = '11111111-1111-4111-8111-111111111111'
const request = { contractVersion: 1, action: 'features', tenantId: tenant, revision: 1, features: ['icustoms'] }
test('lifecycle commands require exact customer identity and their own revision and request identity',()=>{
  const shutdown={contractVersion:1,action:'shutdown',tenantId:tenant,revision:1,requestId:tenant}
  assert.deepEqual(parseProductRequest(shutdown,tenant),shutdown)
  assert.deepEqual(parseProductRequest({...shutdown,action:'verify_shutdown'},tenant),{...shutdown,action:'verify_shutdown'})
  assert.deepEqual(parseProductRequest({...shutdown,action:'lifecycle_status'},tenant),{contractVersion:1,action:'lifecycle_status',tenantId:tenant})
  for(const change of [{requestId:''},{revision:0},{revision:1.2},{tenantId:'22222222-2222-4222-8222-222222222222'}]) assert.throws(()=>parseProductRequest({...shutdown,...change},tenant))
})
test('registered paid features are accepted; protected and unknown features are rejected', () => {
  assert.deepEqual(parseProductRequest(request, tenant), request)
  assert.deepEqual(parseProductRequest({ ...request, features: [] }, tenant).features, [])
  assert.deepEqual(parseProductRequest({ ...request, features: ['rate_management', 'icustoms'] }, tenant).features, ['rate_management', 'icustoms'])
  assert.deepEqual(parseProductRequest({ ...request, features: ['icustoms', 'icustoms'] }, tenant).features, ['icustoms'])
  for (const features of [['jenkar_phone'], ['phone_calls'], ['warehouse'], [null], 'icustoms']) {
    assert.throws(() => parseProductRequest({ ...request, features }, tenant))
  }
  for (const revision of [0, -1, 1.1, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseProductRequest({ ...request, revision }, tenant))
  }
  assert.throws(() => parseProductRequest(request, ''))
  assert.throws(() => parseProductRequest({ ...request, tenantId: '22222222-2222-4222-8222-222222222222' }, tenant))
  assert.throws(() => parseProductRequest({ ...request, contractVersion: 2 }, tenant))
})
test('only both exact server credentials authenticate; browser calls fail', async () => {
  const headers = new Headers({ authorization: 'Bearer test-server-key', apikey: 'test-server-key' })
  assert.equal(await validProductAuthentication(headers, 'test-server-key'), true)
  for (const change of [{ authorization: 'Bearer user-jwt' }, { apikey: 'public-key' }, { origin: 'http://localhost:3000' }, { authorization: 'test-server-key' }]) {
    const changed = new Headers(headers)
    for (const [k, v] of Object.entries(change)) changed.set(k, v)
    assert.equal(await validProductAuthentication(changed, 'test-server-key'), false)
  }
  assert.equal(await validProductAuthentication(headers, ''), false)
})
