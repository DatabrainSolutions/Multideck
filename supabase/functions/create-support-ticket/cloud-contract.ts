const encoder = new TextEncoder()
const FORBIDDEN_CUSTOMER_KEYS = new Set(["tenantid", "customerid"])
function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("") }
async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))) }
async function hmac(secret: string, value: string) { const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value))) }
export function containsCustomerSelector(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((item) => containsCustomerSelector(item, depth + 1))
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalizedKey = key.toLowerCase().replaceAll(/[^a-z]/g, "")
    return FORBIDDEN_CUSTOMER_KEYS.has(normalizedKey) || containsCustomerSelector(nested, depth + 1)
  })
}
export async function cloudSupportHeaders(secret: string, tenantHost: string, body: string, now = Date.now(), nonce = crypto.randomUUID()) {
  const timestamp = String(Math.floor(now / 1000)); const bodyDigest = await sha256(body); const signature = await hmac(secret, `${timestamp}.${nonce}.${bodyDigest}`)
  return { "x-multideck-credential": secret, "x-multideck-timestamp": timestamp, "x-multideck-nonce": nonce, "x-multideck-signature": signature, "x-multideck-tenant-host": tenantHost }
}
