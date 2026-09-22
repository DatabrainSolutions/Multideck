import { adminClient } from '../_shared/backend.ts';
import { parseProductRequest, ProductRequestError, validProductAuthentication } from '../_shared/cloud-product-contract.mts';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!await validProductAuthentication(request.headers, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')) {
    return reply({ error: 'Unauthorised.' }, 401);
  }
  try {
    // Bound streamed input as well as Content-Length; callers cannot force a large allocation.
    const reader = request.body?.getReader();
    if (!reader) throw new ProductRequestError(400, 'Request body required.');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new ProductRequestError(413, 'Request too large.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new ProductRequestError(400, 'Invalid JSON.'); }
    const command = parseProductRequest(input, Deno.env.get('MULTIDECK_CLOUD_TENANT_ID') || '');
    // A health response requires real installation evidence. Never manufacture
    // green checks from environment settings or the caller's requested version.
    if (command.action === 'health') {
      const { data, error } = await adminClient().rpc('multideck_cloud_installation_health', { p_tenant_id: command.tenantId });
      if (error || data?.tenantId !== command.tenantId) return reply({ error: 'Installation evidence could not be checked.' }, 503);
      return reply(data, data?.healthy === true ? 200 : 503);
    }
    if (command.action === 'shutdown' || command.action === 'verify_shutdown' || command.action === 'recover' || command.action === 'lifecycle_status') {
      if (command.action !== 'lifecycle_status' && Deno.env.get('MULTIDECK_LIFECYCLE_CONTROL_ENABLED') !== 'true') {
        return reply({error:'Access shutdown has not completed verification.'},503);
      }
      const {data,error} = await adminClient().rpc('multideck_cloud_lifecycle',{
        p_tenant_id:command.tenantId,p_action:command.action === 'lifecycle_status' ? 'status' : command.action,
        p_revision:command.revision ?? null,p_request_id:command.requestId ?? null,
      });
      if (error) return reply({error:'Lifecycle operation could not be confirmed.'},error.code==='40001'?409:503);
      return reply(data);
    }
    // Keep delivery disabled until every App access surface is covered and the
    // complete integration rehearsal passes; storage alone is not enforcement.
    if (Deno.env.get('MULTIDECK_PRODUCT_ENFORCEMENT_READY') !== 'true') {
      return reply({ error: 'Product enforcement has not completed verification.' }, 503);
    }
    const { data, error } = await adminClient().rpc('multideck_cloud_apply_features', {
      p_tenant_id: command.tenantId, p_revision: command.revision, p_features: command.features,
    });
    if (error) {
      const status = error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === '22023' ? 400 : 503;
      return reply({ error: status === 409 ? 'Feature revision conflict.' : 'Feature permissions could not be confirmed.' }, status);
    }
    return reply(data);
  } catch (error) {
    return reply({ error: error instanceof ProductRequestError ? error.message : 'Product connection unavailable.' }, error instanceof ProductRequestError ? error.status : 503);
  }
});
