import assert from "node:assert/strict"
import test from "node:test"
import { assembleHmrcVatFraudEvidence } from "../functions/_shared/hmrc-vat-fraud-evidence.mts"

const now = new Date("2026-09-24T10:25:00.000Z")
const userId = "00000000-0000-4000-8000-000000000001"
const auth = {
  auth: {
    getClaims: async () => ({ data: { claims: {
      sub: userId, role: "authenticated", email: "ops@example.com", aal: "aal2",
      amr: [{ method: "totp", timestamp: 1790245200 }],
    } }, error: null }),
    admin: {
      getUserById: async () => ({ data: { user: {
        id: userId, email: "ops@example.com", email_confirmed_at: "2026-01-02T10:00:00Z",
      } }, error: null }),
      mfa: { listFactors: async () => ({ data: { factors: [{
        id: "00000000-0000-4000-8000-000000000002", factor_type: "totp", status: "verified",
      }] }, error: null }) },
    },
  },
}

const input = {
  browser: {
    browserJsUserAgent: "Mozilla/5.0 (Test Browser)",
    deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce",
    screens: "width=1920&height=1080&scaling-factor=1.25&colour-depth=24",
    timezone: "UTC+03:00",
    windowSize: "width=1280&height=720",
  },
  auth, jwt: "verified-jwt", authUserId: userId, tenantProjectRef: "tenant.supabase.co", now,
  ingress: {
    originatingPublicIp: "8.8.8.8",
    originatingPublicTcpSourcePort: 12345,
    observedAt: "2026-09-24T10:24:59.000Z",
    publicTlsHops: [
      { receivedByPublicIp: "1.1.1.1", sentByPublicIp: "8.8.8.8" },
      { receivedByPublicIp: "9.9.9.9", sentByPublicIp: "1.1.1.1" },
    ],
  },
  vendor: {
    productName: "Multideck App",
    licenseHashes: { multideck: "a".repeat(64) },
    versions: { "multideck-app": "1.2.3" },
  },
}

test("HMRC assembly separates browser, verified Auth, ingress and server product evidence", async () => {
  const headers = await assembleHmrcVatFraudEvidence({
    ...input,
    browser: { ...input.browser, "Gov-Client-Public-IP": "2.2.2.2", "Gov-Client-Public-Port": "54321",
      "Gov-Client-User-IDs": "attacker=1", "Gov-Vendor-License-IDs": `fake=${"b".repeat(64)}` },
  })
  assert.equal(Object.keys(headers).length, 16)
  assert.equal(headers["Gov-Client-Public-IP"], "8.8.8.8")
  assert.equal(headers["Gov-Client-Public-Port"], "12345")
  assert.equal(headers["Gov-Client-User-IDs"], `multideck=${userId}&login=ops%40example.com`)
  assert.match(headers["Gov-Client-Multi-Factor"], /^type=TOTP&timestamp=2026-09-24T10%3A20%3A00Z&unique-reference=[a-f0-9]{64}$/)
  assert.equal(headers["Gov-Vendor-License-IDs"], `multideck=${"a".repeat(64)}`)
  assert.equal(headers["Gov-Vendor-Forwarded"], "by=1.1.1.1&for=8.8.8.8,by=9.9.9.9&for=1.1.1.1")
  assert.equal(headers["Gov-Vendor-Public-IP"], "1.1.1.1")
  assert.equal(headers["Gov-Vendor-Product-Name"], "Multideck%20App")
})

test("HMRC assembly stops on missing, stale or contradictory observations", async () => {
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, ingress: {
    ...input.ingress, originatingPublicTcpSourcePort: 443,
  } }), /invalid connection method/)
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, ingress: {
    ...input.ingress, observedAt: "2026-09-24T10:22:00.000Z",
  } }), /ingress evidence is unavailable/)
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, ingress: {
    ...input.ingress, publicTlsHops: [{ receivedByPublicIp: "1.1.1.1", sentByPublicIp: "7.7.7.7" }],
  } }), /inconsistent/)
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, vendor: {
    ...input.vendor, licenseHashes: {},
  } }), /vendor licence/)
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, vendor: {
    ...input.vendor, versions: {},
  } }), /vendor version/)
  await assert.rejects(assembleHmrcVatFraudEvidence({ ...input, browser: {
    ...input.browser, deviceId: "unknown",
  } }), /Gov-Client-Device-ID/)
})
