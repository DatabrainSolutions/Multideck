const encoder = new TextEncoder();
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
const reply = (status: number, value: unknown) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function handler(request: Request): Promise<Response> {
  if (!/\/live-company-gateway\/?$/.test(new URL(request.url).pathname)) return reply(404, { error: "Gateway endpoint unavailable." });
  if (request.method !== "POST") return reply(405, { error: "Use a signed gateway request." });
  try {
    const audience = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(audience) || !serviceKey) return reply(503, { error: "Gateway unavailable." });
    const keyId = request.headers.get("X-Live-Key-Id") ?? "";
    const timestamp = request.headers.get("X-Live-Timestamp") ?? "";
    const nonce = request.headers.get("X-Live-Nonce") ?? "";
    const signature = request.headers.get("X-Live-Signature") ?? "";
    if (!identifier.test(keyId) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 120 ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return reply(401, { error: "Invalid gateway signature." });
    const keys = JSON.parse(Deno.env.get("LIVE_GATEWAY_KEYS") ?? "{}");
    const secret = Object.hasOwn(keys, keyId) ? keys[keyId] : null;
    if (typeof secret !== "string" || secret.length < 32) return reply(401, { error: "Invalid gateway signature." });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { error: "Request body required." });
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        length += chunk.value.length;
        if (length > 65_536) { await reader.cancel(); return reply(413, { error: "Request too large." }); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const canonical = ["multideck-live-v1", "POST", audience, "/functions/v1/live-company-gateway", keyId, timestamp, nonce, hex(await crypto.subtle.digest("SHA-256", bytes))].join("\n");
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatureBytes = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair, 16));
    if (!await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(canonical))) return reply(401, { error: "Invalid gateway signature." });
    let body;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return reply(400, { error: "Invalid gateway envelope." }); }
    if (!body || body.version !== 1 || !identifier.test(body.connectionId ?? "") || !identifier.test(body.subjectId ?? "") ||
      !identifier.test(body.grantId ?? "") || !body.input || typeof body.input !== "object" || Array.isArray(body.input) ||
      Object.keys(body).some(k => !["version", "connectionId", "subjectId", "grantId", "operation", "input"].includes(k))) return reply(400, { error: "Invalid gateway envelope." });
    if (!["warehouse.context", "warehouse.stock", "warehouse.products", "warehouse.product.create", "warehouse.product.rename", "warehouse.order.submit"].includes(body.operation)) return reply(501, { error: "This gateway operation is not enabled." });
    const response = await fetch(`${audience}/rest/v1/rpc/${["warehouse.product.create", "warehouse.product.rename", "warehouse.order.submit"].includes(body.operation) ? "live_gateway_mutate" : "live_gateway_read"}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key_id: keyId, p_connection_id: body.connectionId, p_subject_id: body.subjectId,
        p_grant_id: body.grantId, p_nonce: nonce, p_operation: body.operation, p_input: body.input }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const status = error.code === "42501" ? 403 : ["23505", "40001"].includes(error.code) ? 409 : ["22023", "22P02", "22003"].includes(error.code) ? 400 : 503;
      return reply(status, { error: status === 403 ? "Customer grant denied." : status === 409 ? "Request already used." : "Gateway request unavailable." });
    }
    return reply(200, await response.json());
  } catch { return reply(503, { error: "Gateway temporarily unavailable." }); }
}
if (import.meta.main) Deno.serve(handler);
