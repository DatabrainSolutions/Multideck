import {assertEquals} from 'jsr:@std/assert';
import {withTenantLifecycle} from '../functions/_shared/tenant-lifecycle.ts';

Deno.test('operational entrypoints deny offline and unavailable state before user, provider or Dexter work',async()=>{
  const previousFetch=globalThis.fetch;
  const values={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only-key'};
  const previous=Object.fromEntries(Object.keys(values).map(k=>[k,Deno.env.get(k)]));
  let operations=0;
  const handler=withTenantLifecycle(()=>{operations++;return new Response('operational');});
  const invoke=()=>handler(new Request('https://fixture.invalid/operational',{headers:{authorization:'Bearer previously-issued-token'}}),{} as Deno.ServeHandlerInfo);
  try {
    for(const [key,value] of Object.entries(values))Deno.env.set(key,value);
    globalThis.fetch=async()=>Response.json(true);
    assertEquals((await invoke()).status,200);
    globalThis.fetch=async()=>Response.json(false);
    assertEquals((await invoke()).status,403);
    globalThis.fetch=async()=>new Response(null,{status:503});
    assertEquals((await invoke()).status,503);
    globalThis.fetch=async()=>Response.json({enabled:true});
    assertEquals((await invoke()).status,503);
    globalThis.fetch=async()=>{throw new Error('connection lost');};
    assertEquals((await invoke()).status,503);
    assertEquals(operations,1);
  } finally {
    globalThis.fetch=previousFetch;
    for(const [key,value] of Object.entries(previous))value===undefined?Deno.env.delete(key):Deno.env.set(key,value);
  }
});
