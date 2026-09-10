const encoder = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
export function liveAccessConnection() {
  const config = JSON.parse(Deno.env.get("LIVE_PORTAL_CONNECTION") ?? "null");
  const keys = JSON.parse(Deno.env.get("LIVE_GATEWAY_KEYS") ?? "{}");
  if (
    !config || !/^[a-z]{20}$/.test(config.projectRef ?? "") ||
    !/^[0-9a-f-]{36}$/.test(config.id ?? "") ||
    typeof keys[config.keyId] !== "string" || keys[config.keyId].length < 32
  ) throw new Error("Multideck Live has not been connected to this workspace.");
  return { ...config, secret: keys[config.keyId] as string };
}
export async function liveAccessRequest(input: Record<string, unknown>) {
  const c = liveAccessConnection(),
    audience = `https://${c.projectRef}.supabase.co`,
    path = "/functions/v1/live-company-access",
    timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = crypto.randomUUID();
  const body = JSON.stringify({ ...input, version: 1, connectionId: c.id });
  const canonical = [
    "multideck-live-access-v1",
    "POST",
    audience,
    path,
    c.keyId,
    timestamp,
    nonce,
    hex(await crypto.subtle.digest("SHA-256", encoder.encode(body))),
  ].join("\n");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(c.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = hex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)),
  );
  const response = await fetch(audience + path, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: {
      "Content-Type": "application/json",
      "X-Live-Key-Id": c.keyId,
      "X-Live-Timestamp": timestamp,
      "X-Live-Nonce": nonce,
      "X-Live-Signature": signature,
    },
    body,
  });
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (!reader) throw new Error("Multideck Live returned an empty response.");
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 65536) {
        await reader.cancel();
        throw new Error("Multideck Live returned an invalid response.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  const result = JSON.parse(new TextDecoder().decode(data));
  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? result.detail
        : "Multideck Live could not complete the customer connection. Ask a Live administrator to check their access.",
    );
  }
  return result;
}
