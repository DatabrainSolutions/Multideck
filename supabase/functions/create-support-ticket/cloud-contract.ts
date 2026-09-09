const encoder = new TextEncoder()
const FORBIDDEN_CUSTOMER_KEYS = new Set(["tenantid", "customerid"])
function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("") }
async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))) }
function bytesFromBase64(value: string) {
  const decoded = atob(value)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}
function base64(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
}
export function containsCustomerSelector(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((item) => containsCustomerSelector(item, depth + 1))
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalizedKey = key.toLowerCase().replaceAll(/[^a-z]/g, "")
    return FORBIDDEN_CUSTOMER_KEYS.has(normalizedKey) || containsCustomerSelector(nested, depth + 1)
  })
}
export async function cloudSupportHeaders(
  privateKeyBase64: string,
  keyId: string,
  tenantHost: string,
  body: string,
  now = Date.now(),
  nonce = crypto.randomUUID(),
) {
  const timestamp = String(Math.floor(now / 1000))
  const bodyDigest = await sha256(body)
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytesFromBase64(privateKeyBase64),
    { name: "Ed25519" },
    false,
    ["sign"],
  )
  const signedValue = `${timestamp}.${nonce}.${bodyDigest}.${tenantHost}.${keyId}`
  const signature = base64(await crypto.subtle.sign("Ed25519", key, encoder.encode(signedValue)))
  return {
    "x-multideck-key-id": keyId,
    "x-multideck-timestamp": timestamp,
    "x-multideck-nonce": nonce,
    "x-multideck-signature": signature,
    "x-multideck-tenant-host": tenantHost,
  }
}
