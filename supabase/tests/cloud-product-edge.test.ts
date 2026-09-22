import assert from 'node:assert/strict';

// Execute the real Edge handlers with an in-memory Supabase transport. No
// network permission is granted to this test; provider delivery cannot occur.
Deno.test('phone routes fail closed before provider work and product receiver refuses unverified acknowledgement', async () => {
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const environment = {
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'offline-server-key',
    MULTIDECK_CLOUD_TENANT_ID: '11111111-1111-4111-8111-111111111111',
    MULTIDECK_PRODUCT_ENFORCEMENT_READY: '',
  };
  const prior = new Map(Object.keys(environment).map(key => [key, Deno.env.get(key)]));
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let granted = false;
  let unavailable = false;
  let health: Record<string, unknown> = {tenantId:environment.MULTIDECK_CLOUD_TENANT_ID,healthy:false,status:'unverified'};
  const calls: string[] = [];
  try {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);
    console.error = () => {};
    Deno.serve = ((callback: typeof handler) => { handler = callback; return {}; }) as typeof Deno.serve;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/rpc/multideck_cloud_installation_health')) {
        assert.deepEqual(JSON.parse(String(init?.body)),{p_tenant_id:environment.MULTIDECK_CLOUD_TENANT_ID});
        return Response.json(health);
      }
      assert.equal(url, 'http://127.0.0.1:1/rest/v1/rpc/multideck_cloud_product_access');
      assert.deepEqual(JSON.parse(String(init?.body)), { p_feature: 'jenkar_phone' });
      return unavailable
        ? new Response(JSON.stringify({ code: 'PGRST000', message: 'offline' }), { status: 503 })
        : new Response(JSON.stringify(granted), { headers: { 'Content-Type': 'application/json' } });
    };
    await import('../functions/phone-calls/index.ts');
    assert.ok(handler);
    const phone = handler;
    for (const path of ['calls', 'sync/twilio', 'webhooks/jenkar/screening', 'webhooks/elevenlabs/post-call', 'maintenance/retry']) {
      const result = await phone(new Request(`https://app.invalid/functions/v1/phone-calls/${path}`, { method: 'POST' }));
      assert.equal(result.status, 403, path);
      assert.match(await result.text(), /verified Jenkar/);
    }
    assert.equal(calls.length, 5);
    unavailable = true;
    assert.equal((await phone(new Request('https://app.invalid/functions/v1/phone-calls/calls'))).status, 503);
    unavailable = false;
    granted = true;
    // A grant does not bypass the ordinary user authentication boundary.
    assert.equal((await phone(new Request('https://app.invalid/functions/v1/phone-calls/calls'))).status, 401);

    await import('../functions/multideck-cloud-product/index.ts');
    assert.ok(handler);
    const product = handler;
    const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://app.invalid/functions/v1/multideck-cloud-product', {
      method: 'POST', headers: { authorization: 'Bearer offline-server-key', apikey: 'offline-server-key', ...headers }, body: JSON.stringify(body),
    });
    const command = { contractVersion: 1, action: 'features', tenantId: environment.MULTIDECK_CLOUD_TENANT_ID, revision: 1, features: ['icustoms'] };
    const count = calls.length;
    assert.equal((await product(request(command))).status, 503);
    assert.equal((await product(request({ ...command, action: 'health', version: '99.0.0' }))).status, 503);
    assert.equal((await product(request({ ...command, features: ['rate_management'] }))).status, 503);
    assert.equal((await product(request({ ...command, features: ['jenkar_phone'] }))).status, 400);
    assert.equal((await product(request(command, { origin: 'https://app.invalid' }))).status, 401);
    assert.equal((await product(request(command, { authorization: 'Bearer user-token' }))).status, 401);
    assert.equal((await product(request('x'.repeat(5000)))).status, 413);
    assert.equal(calls.length, count + 1, 'Only the read-only health operation may reach the database');
    health = {...health,healthy:true,status:'verified',version:'1.2.1'};
    const checked = await product(request({...command,action:'health',version:'99.0.0'}));
    assert.equal(checked.status,200);
    assert.equal((await checked.json()).version,'1.2.1','Returns recorded evidence, never the requested version');
    health = {...health,tenantId:'22222222-2222-4222-8222-222222222222'};
    assert.equal((await product(request({...command,action:'health'}))).status,503,'Reject conflicting database identity');
  } finally {
    Deno.serve = originalServe;
    globalThis.fetch = originalFetch;
    console.error = originalError;
    for (const [key, value] of prior) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
  }
});
