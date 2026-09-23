import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = readFileSync(new URL('../src/lib/warehouse.ts', import.meta.url), 'utf8')
const apiSource = stripTypeScriptTypes(source.slice(source.indexOf('export async function importWarehouseItems('), source.indexOf('export type WarehouseLocation ='))).replaceAll('export ', '')
function api({ capabilities = { version: 1, preview: true }, response = { created: 0, failed: 0, preview: true, results: [] }, status = 200, fail = false } = {}) {
  const requests = []
  let invalidations = 0
  const dependencies = {
    requestWarehouse: async (path, method) => { requests.push({ path, method }); return capabilities },
    WarehouseApiError: Error,
    getSupabaseSession: async () => ({ access_token: 'test-token', user: { id: 'test-user' } }),
    supabasePublicApiKey: 'public-test-key',
    warehouseEdgeUrl: path => `https://tenant.example.test/warehouse${path}`,
    warehouseReadScope: id => id,
    invalidateWarehouseResources: () => invalidations++,
    fetch: async (url, options) => { requests.push({ url, options }); if (fail) throw new Error('Connection lost'); return new Response(JSON.stringify(response), { status }) },
  }
  const methods = new Function(...Object.keys(dependencies), `${apiSource}\nreturn { importWarehouseItems, importWarehouseLocations };`)(...Object.values(dependencies))
  return { ...methods, requests, invalidations: () => invalidations }
}
const file = new File(['fixture'], 'items.xlsx')

test('old warehouse service never receives a preview upload or create request', async () => {
  for (const capabilities of [{}, { version: 1, preview: false }, { version: 2, preview: true }]) {
    const client = api({ capabilities })
    await assert.rejects(client.importWarehouseItems({ customerOrgId: 'customer', facilityId: 'facility', file, preview: true }), /update the warehouse service/)
    assert.equal(client.requests.length, 1)
    assert.equal(client.requests[0].method, 'GET')
  }
})

test('preview passes chosen scope, file and explicit dry-run flag without invalidating saved data', async () => {
  const client = api()
  await client.importWarehouseItems({ customerOrgId: 'customer', facilityId: 'facility', file, preview: true })
  assert.equal(client.requests[0].path, '/items/import/capabilities')
  const form = client.requests[1].options.body
  assert.equal(form.get('customerOrgId'), 'customer')
  assert.equal(form.get('facilityId'), 'facility')
  assert.equal(form.get('preview'), 'true')
  assert.equal(form.get('file').name, 'items.xlsx')
  assert.equal(client.invalidations(), 0)
})

test('confirmed imports invalidate warehouse records and surface server validation errors', async () => {
  const client = api({ response: { created: 1, failed: 0, preview: false, results: [] } })
  await client.importWarehouseItems({ customerOrgId: 'customer', facilityId: 'facility', file, preview: false })
  assert.equal(client.requests[1].options.body.get('preview'), 'false')
  assert.equal(client.invalidations(), 1)
  const rejected = api({ status: 409, response: { detail: 'SKU already exists' } })
  await assert.rejects(rejected.importWarehouseItems({ customerOrgId: 'customer', facilityId: 'facility', file }), /SKU already exists/)
  const disconnected = api({ fail: true })
  await assert.rejects(disconnected.importWarehouseItems({ customerOrgId: 'customer', facilityId: 'facility', file }), /Connection lost/)
})

test('location import carries its facility and default type into both phases', async () => {
  const client = api()
  await client.importWarehouseLocations({ facilityId: 'facility-one', defaultTypeCode: 'bin', file, preview: true })
  assert.equal(client.requests[0].path, '/facilities/facility-one/locations/import/capabilities')
  assert.equal(client.requests[1].options.body.get('defaultTypeCode'), 'bin')
  assert.equal(client.requests[1].options.body.get('preview'), 'true')
})
