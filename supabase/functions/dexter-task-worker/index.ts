import { adminClient, corsHeaders } from '../_shared/backend.ts'
import { executeBackgroundTask } from '../agent-dexter/index.ts'
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const json = (request: Request, value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
async function equal(a: string, b: string) {
  const encode = new TextEncoder()
  const [x, y] = await Promise.all(
    [a, b].map((v) => crypto.subtle.digest('SHA-256', encode.encode(v))),
  )
  return (
    new Uint8Array(x).reduce(
      (diff, byte, i) => diff | (byte ^ new Uint8Array(y)[i]),
      0,
    ) === 0
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST')
    return json(request, { code: 'method_not_allowed' }, 405)
  const admin = adminClient()
  // Only tenant pg_cron calls this endpoint. The browser queues through owner RPCs.
  const supplied = request.headers.get('x-multideck-task-secret') ?? ''
  const { data: expected, error } = await admin.rpc(
    'multideck_task_worker_secret',
  )
  if (
    error ||
    typeof expected !== 'string' ||
    !supplied ||
    !(await equal(supplied, expected))
  )
    return json(request, { code: 'worker_unauthorised' }, 401)
  const { data: runs, error: claimError } = await admin.rpc(
    'multideck_task_claim',
  )
  if (claimError) return json(request, { code: 'task_claim_failed' }, 503)
  const work = Promise.all(
    (Array.isArray(runs) ? runs : []).map(async (run) => {
      try {
        const result = await executeBackgroundTask(
          admin,
          run.id,
          run.lease_token,
        )
        const { error: finishError } = await admin.rpc(
          'multideck_task_finish',
          { p_run: run.id, p_token: run.lease_token, p_result: result },
        )
        if (finishError) throw new Error('task_finish_failed')
        return { id: run.id, status: result.status }
      } catch (error) {
        const code = error instanceof Error ? error.message : 'task_failed'
        // Leave transient failures leased for bounded recovery. A revoked/cancelled
        // lease can never save a new result or restart work.
        await admin.rpc('multideck_task_worker_interrupted', {
          p_run: run.id,
          p_token: run.lease_token,
          p_code: code,
        })
        console.error(
          'Dexter task interrupted',
          run.id,
          code.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 100),
        )
        return { id: run.id, status: 'interrupted' }
      }
    }),
  )
  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(work)
    return json(
      request,
      { accepted: Array.isArray(runs) ? runs.length : 0 },
      202,
    )
  }
  return json(request, { runs: await work })
})
