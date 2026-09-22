import { corsHeaders } from './backend.ts';

type Handler = (request: Request, info: Deno.ServeHandlerInfo) => Response | Promise<Response>;

/** No cached 'active' state: shutdown must also deny existing access tokens. */
export function withTenantLifecycle(handler: Handler): Handler {
  return async (request, info) => {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders(request)});
    const unavailable = (status: number, detail: string) => new Response(JSON.stringify({detail}),{
      status,headers:{...corsHeaders(request),'Content-Type':'application/json','Cache-Control':'no-store'},
    });
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return unavailable(503,'Customer access could not be checked.');
    try {
      const response = await fetch(`${url}/rest/v1/rpc/multideck_tenant_access_enabled`,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
        headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',
      });
      if (!response.ok) return unavailable(503,'Customer access could not be checked.');
      const enabled = await response.json();
      if (enabled === false) return unavailable(403,'This customer installation is offline.');
      if (enabled !== true) return unavailable(503,'Customer access could not be checked.');
    } catch {
      return unavailable(503,'Customer access could not be checked.');
    }
    return await handler(request,info);
  };
}

export function serveTenant(handler: Handler) {
  return Deno.serve(withTenantLifecycle(handler));
}
