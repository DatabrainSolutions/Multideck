import { cloudSupportHeaders, containsCustomerSelector } from "./cloud-contract.ts"

function equal(actual: unknown, expected: unknown, message = "Values differ") {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`)
}

function base64(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
}

Deno.test("signs customer tickets with Ed25519 without transmitting the private key", async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const privateKey = base64(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  const publicKey = await crypto.subtle.importKey(
    "spki",
    await crypto.subtle.exportKey("spki", pair.publicKey),
    { name: "Ed25519" },
    false,
    ["verify"],
  )
  const keyId = "jenkar-support-2026-09"
  const tenantHost = "jenkar.multideck.app"
  const body = JSON.stringify({ action: "finalize", reporterUserId: crypto.randomUUID() })
  const timestampMilliseconds = 1_788_512_400_000
  const nonce = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"
  const headers = await cloudSupportHeaders(privateKey, keyId, tenantHost, body, timestampMilliseconds, nonce)

  equal("x-multideck-credential" in headers, false)
  equal(headers["x-multideck-key-id"], keyId)
  equal(headers["x-multideck-tenant-host"], tenantHost)

  const bodyDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  const signedValue = `${headers["x-multideck-timestamp"]}.${nonce}.${bodyDigest}.${tenantHost}.${keyId}`
  const signatureBytes = Uint8Array.from(atob(headers["x-multideck-signature"]), (character) => character.charCodeAt(0))
  equal(await crypto.subtle.verify("Ed25519", publicKey, signatureBytes, new TextEncoder().encode(signedValue)), true)
  equal(await crypto.subtle.verify("Ed25519", publicKey, signatureBytes, new TextEncoder().encode(`${signedValue}.changed`)), false)
})

Deno.test("continues to reject customer and tenant selectors anywhere in a ticket", () => {
  equal(containsCustomerSelector({ context: { tenantId: "spoofed" } }), true)
  equal(containsCustomerSelector({ customer_id: "spoofed" }), true)
  equal(containsCustomerSelector({ reporterUserId: crypto.randomUUID() }), false)
})
