import { handler } from "../functions/live-company-gateway/index.ts";
const secret = "synthetic-long-live-integration-key-for-tests";
const url = "https://abcdefghijklmnopqrst.supabase.co";
const assert = (value: unknown) => { if (!value) throw new Error("Assertion failed"); };
async function signed(input: unknown, audience = url) {
  const body = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID();
  const bytes = new TextEncoder();
  const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), n => n.toString(16).padStart(2, "0")).join("");
  const canonical = ["multideck-live-v1", "POST", audience, "/functions/v1/live-company-gateway", "test-key", timestamp, nonce, hex(await crypto.subtle.digest("SHA-256", bytes.encode(body)))].join("\n");
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Request(url + "/functions/v1/live-company-gateway", { method: "POST", body, headers: {
    "X-Live-Key-Id": "test-key", "X-Live-Timestamp": timestamp, "X-Live-Nonce": nonce,
    "X-Live-Signature": hex(await crypto.subtle.sign("HMAC", key, bytes.encode(canonical))),
  } });
}
Deno.test("App gateway verifies signed company requests before the service-only grant RPC", async () => {
  Deno.env.set("SUPABASE_URL", url); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  Deno.env.set("LIVE_GATEWAY_KEYS", JSON.stringify({ "test-key": secret }));
  const original = globalThis.fetch; const seen = new Set<string>(); let calls = 0;
  globalThis.fetch = async (request, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert(String(request) === url + "/rest/v1/rpc/" + (body.p_operation === "warehouse.order.submit" ? "live_gateway_mutate" : "live_gateway_read")); assert(body.p_subject_id === "subject-1");
    if (seen.has(body.p_nonce)) return Response.json({ code: "23505" }, { status: 409 });
    seen.add(body.p_nonce); return Response.json({ assignments: [] });
  };
  const envelope = { version: 1, connectionId: "company-1", subjectId: "subject-1", grantId: "grant-1", operation: "warehouse.context", input: {} };
  try {
    const request = await signed(envelope);
    assert((await handler(request.clone())).status === 200);
    assert((await handler(request)).status === 409);
    assert((await handler(await signed(envelope, "https://tsrqponmlkjihgfedcba.supabase.co"))).status === 401);
    const tampered = await signed(envelope); const headers = new Headers(tampered.headers);
    assert((await handler(new Request(tampered.url, { method: "POST", headers, body: JSON.stringify({ ...envelope, subjectId: "subject-2" }) }))).status === 401);
    assert((await handler(await signed({ ...envelope, operation: "warehouse.order.submit" }))).status === 200);
    assert((await handler(await signed({ ...envelope, operation: "warehouse.stock.dispatch" }))).status === 501);
    assert(calls === 3);
  } finally { globalThis.fetch = original; }
});
