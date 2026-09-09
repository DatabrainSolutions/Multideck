import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveDescriptor } from '../scripts/live-connection.mjs';
const env = { VITE_LIVE_GATEWAY_ENABLED: 'true', VITE_MULTIDECK_TENANT_SLUG: 'jenkar', VITE_MULTIDECK_TENANT_HOST: 'jenkar.multideck.app', VITE_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-public' };
test('Live discovery publishes only the matching company gateway without credentials', () => {
  const value = createLiveDescriptor(env);
  assert.equal(value.appOrigin, 'https://jenkar.multideck.app');
  assert.equal(value.gateway.url, 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/live-company-gateway');
  assert(!JSON.stringify(value).includes('never-public'));
});
test('Live discovery is opt-in and rejects mismatched companies and endpoints', () => {
  assert.equal(createLiveDescriptor({}), null);
  for (const changed of [{ VITE_MULTIDECK_TENANT_HOST: 'dev.multideck.app' }, { VITE_SUPABASE_URL: 'https://evil.example' }, { VITE_SUPABASE_PROJECT_REF: 'localhost' }]) {
    assert.throws(() => createLiveDescriptor({ ...env, ...changed }), /matching App hostname/);
  }
});
