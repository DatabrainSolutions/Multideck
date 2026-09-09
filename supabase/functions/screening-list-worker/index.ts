import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { refreshOfsiList } from "../_shared/screening-ingest.ts"

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const leftDigest = await crypto.subtle.digest("SHA-256", encoder.encode(left))
  const rightDigest = await crypto.subtle.digest("SHA-256", encoder.encode(right))
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true }, 204)
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
    if (!url || !serviceRoleKey) return json({ code: "runtime_not_configured" }, 503)

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const suppliedSecret = request.headers.get("x-multideck-screening-list-secret")?.trim() ?? ""
    const { data: expectedSecret, error: secretError } = await admin.rpc("CMP_GetScreeningListWorkerSecret")
    if (
      secretError
      || typeof expectedSecret !== "string"
      || !suppliedSecret
      || !await constantTimeEqual(suppliedSecret, expectedSecret)
    ) {
      return json({ code: "worker_unauthorized" }, 401)
    }

    const result = await refreshOfsiList(admin)
    return json({ ok: result.status !== "failed", ...result }, result.status === "failed" ? 502 : 200)
  } catch (error) {
    return json({
      code: "screening_list_refresh_failed",
      message: error instanceof Error ? error.message : "The OFSI list could not be refreshed.",
    }, 500)
  }
})
