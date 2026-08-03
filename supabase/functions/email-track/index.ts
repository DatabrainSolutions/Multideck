import { createClient } from "npm:@supabase/supabase-js@2.108.2"

const transparentGif = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="), (character) => character.charCodeAt(0))
const imageHeaders = {
  "Content-Type": "image/gif",
  "Content-Length": String(transparentGif.byteLength),
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Content-Security-Policy": "default-src 'none'",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
}

function pixel(method: string) {
  return new Response(method === "HEAD" ? null : transparentGif, { status: 200, headers: imageHeaders })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (request) => {
  const method = request.method.toUpperCase()
  if (method !== "GET" && method !== "HEAD") return pixel(method)

  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? ""
    if (token.length < 32 || token.length > 200) return pixel(method)

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!supabaseUrl || !serviceRoleKey) return pixel(method)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-client-info": "multideck-email-track/1" } },
    })
    await admin.rpc("comm_record_tracking_open", { p_token_hash: await sha256(token) })
  } catch {
    // Tracking is deliberately non-observable to the caller: an invalid token,
    // expired token or temporary database error returns the same blank image.
  }

  return pixel(method)
})
