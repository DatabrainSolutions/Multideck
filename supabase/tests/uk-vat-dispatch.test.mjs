import assert from "node:assert/strict"
import test from "node:test"
import { dispatchHmrcVatReturn } from "../functions/_shared/hmrc-vat-dispatch.mts"

const now = new Date("2026-09-24T10:25:00.000Z")
const actorId = "00000000-0000-4000-8000-000000000001"
const periodId = "00000000-0000-4000-8000-000000000003"
const connectionId = "00000000-0000-4000-8000-000000000004"
const attemptId = "00000000-0000-4000-8000-000000000005"
const payloadBody = '{"periodKey":"#001","vatDueSales":15.00,"vatDueAcquisitions":0.00,"totalVatDue":15.00,"vatReclaimedCurrPeriod":8.00,"netVatDue":7.00,"totalValueSalesExVAT":125.00,"totalValuePurchasesExVAT":50.00,"totalValueGoodsSuppliedExVAT":0.00,"totalAcquisitionsExVAT":0.00,"finalised":true}'
const auth = { auth: {
  getClaims: async () => ({ data: { claims: { sub: actorId, role: "authenticated",
    email: "ops@example.com", aal: "aal2", amr: [{ method: "totp", timestamp: 1790245200 }] } }, error: null }),
  admin: {
    getUserById: async () => ({ data: { user: { id: actorId, email: "ops@example.com",
      email_confirmed_at: "2026-01-02T10:00:00Z" } }, error: null }),
    mfa: { listFactors: async () => ({ data: { factors: [{
      id: "00000000-0000-4000-8000-000000000002", factor_type: "totp", status: "verified",
    }] }, error: null }) },
  },
} }
const fraud = {
  browser: {
    browserJsUserAgent: "Mozilla/5.0 (Test Browser)",
    deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce",
    screens: "width=1920&height=1080&scaling-factor=1.25&colour-depth=24",
    timezone: "UTC+03:00", windowSize: "width=1280&height=720",
  },
  auth, jwt: "verified-jwt", authUserId: actorId, tenantProjectRef: "tenant.supabase.co",
  ingress: { originatingPublicIp: "8.8.8.8", originatingPublicTcpSourcePort: 12345,
    observedAt: "2026-09-24T10:24:59.000Z",
    publicTlsHops: [{ receivedByPublicIp: "1.1.1.1", sentByPublicIp: "8.8.8.8" }] },
  vendor: { productName: "Multideck App", licenseHashes: { multideck: "a".repeat(64) },
    versions: { multideck: "1.0.0" } },
}

async function hash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

async function fixture(options = {}) {
  const calls = []
  let state = "reserved"
  const digest = await hash(payloadBody)
  const db = { rpc: async (name, args) => {
    calls.push(name)
    if (name === "multideck_hmrc_vat_access_for_period") {
      if (options.accessFails) return { data: null, error: { code: "42501" } }
      assert.equal(args.p_project_ref, "tenant.supabase.co")
      assert.equal(args.p_purpose, "submission")
      return { data: { accessToken: "opaque-access-token", environment: "sandbox", vrn: "123456789",
        periodId, connectionId }, error: null }
    }
    if (name === "multideck_uk_vat_claim_submission_dispatch") {
      if (options.claimResponseLost) { state = "dispatching"; throw new Error("response lost") }
      if (state !== "reserved") return { data: null, error: { code: "22023" } }
      state = "dispatching"
      return { data: { status: "dispatching", attemptId, payloadBody,
        payloadSha256: options.badHash ? "b".repeat(64) : digest }, error: null }
    }
    if (name === "multideck_uk_vat_record_submission_uncertainty") {
      if (options.uncertaintyFails) return { data: null, error: { code: "08006" } }
      assert.equal(state, "dispatching")
      state = "reconciliation_required"
      return { data: { status: state, attemptId }, error: null }
    }
    if (name === "multideck_uk_vat_record_submission_receipt") {
      if (options.receiptFails) return { data: null, error: { code: "08006" } }
      assert.equal(state, "dispatching")
      assert.equal(args.p_receipt.formBundleNumber, "256660290587")
      state = "accepted"
      return { data: { status: state, attemptId, receiptId: "receipt-1" }, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  } }
  const input = { db, actorId, entityId: "00000000-0000-4000-8000-000000000006",
    projectRef: "tenant.supabase.co", periodId, connectionId, attemptId, fraud, now: () => now }
  return { input, calls, get state() { return state } }
}

const receiptHeaders = { "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435",
  "Receipt-ID": "2dd537bc-4244-4ebf-bac9-96321be13cdc",
  "Receipt-Timestamp": "2026-09-24T10:20:30Z" }
const accepted = () => Response.json({ processingDate: "2026-09-24T10:20:30.000+0000",
  formBundleNumber: "256660290587" }, { status: 201, headers: receiptHeaders })

test("HMRC coordinator commits one claim before its sole POST and persists the receipt", async () => {
  const f = await fixture()
  let posts = 0
  const result = await dispatchHmrcVatReturn({ ...f.input, send: async (url, init) => {
    posts++
    assert.deepEqual(f.calls, ["multideck_hmrc_vat_access_for_period", "multideck_uk_vat_claim_submission_dispatch"])
    assert.equal(url, "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns")
    assert.equal(init.body, payloadBody)
    return accepted()
  } })
  assert.equal(result.status, "accepted")
  assert.equal(result.receiptId, "receipt-1")
  assert.equal(posts, 1)
  assert.equal(f.state, "accepted")
  assert.deepEqual(f.calls.slice(-1), ["multideck_uk_vat_record_submission_receipt"])
})

test("missing fraud evidence or authority never claims or sends", async () => {
  const f = await fixture()
  const noSend = async () => { throw new Error("Unexpected HMRC POST") }
  assert.deepEqual(await dispatchHmrcVatReturn({ ...f.input, fraud: {
    ...fraud, ingress: { ...fraud.ingress, originatingPublicTcpSourcePort: 443 },
  }, send: noSend }), { status: "preflight_failed", reason: "fraud_evidence" })
  assert.deepEqual(f.calls, [])
  assert.deepEqual(await dispatchHmrcVatReturn({ ...f.input, projectRef: "other-tenant", send: noSend }),
    { status: "preflight_failed", reason: "fraud_evidence" })
  const authority = await fixture({ accessFails: true })
  assert.deepEqual(await dispatchHmrcVatReturn({ ...authority.input, send: noSend }),
    { status: "preflight_failed", reason: "authority" })
  assert.deepEqual(authority.calls, ["multideck_hmrc_vat_access_for_period"])
})

test("lost claim response never sends or retries the POST", async () => {
  const f = await fixture({ claimResponseLost: true })
  const send = async () => { throw new Error("Unexpected HMRC POST") }
  assert.deepEqual(await dispatchHmrcVatReturn({ ...f.input, send }), { status: "claim_outcome_unknown" })
  assert.equal(f.state, "dispatching")
  assert.deepEqual(await dispatchHmrcVatReturn({ ...f.input, send }), { status: "claim_outcome_unknown" })
  assert.equal(f.calls.filter(name => name === "multideck_uk_vat_claim_submission_dispatch").length, 2)
})

test("tampered claim or aged ingress stays blocking without an HMRC POST", async () => {
  const noSend = async () => { throw new Error("Unexpected HMRC POST") }
  const badHash = await fixture({ badHash: true })
  assert.deepEqual(await dispatchHmrcVatReturn({ ...badHash.input, send: noSend }),
    { status: "reconciliation_required", kind: "other", recorded: true })
  assert.equal(badHash.state, "reconciliation_required")
  const stale = await fixture()
  let reads = 0
  assert.deepEqual(await dispatchHmrcVatReturn({ ...stale.input,
    now: () => ++reads === 1 ? now : new Date("2026-09-24T10:28:00Z"), send: noSend }),
  { status: "reconciliation_required", kind: "other", recorded: true })
  assert.equal(stale.state, "reconciliation_required")
})

test("non-201 and network failures are recorded as unresolved without retry", async () => {
  const rejected = await fixture()
  let posts = 0
  const result = await dispatchHmrcVatReturn({ ...rejected.input, send: async () => {
    posts++
    return new Response(null, { status: 503 })
  } })
  assert.deepEqual(result, { status: "reconciliation_required", kind: "server_response", recorded: true })
  assert.equal(posts, 1)
  assert.equal(rejected.state, "reconciliation_required")
  const lost = await fixture({ uncertaintyFails: true })
  assert.deepEqual(await dispatchHmrcVatReturn({ ...lost.input, send: async () => { throw new Error("timeout") } }),
    { status: "reconciliation_required", kind: "network_failure", recorded: false })
  assert.equal(lost.state, "dispatching")
})

test("a 201 receipt that cannot be saved remains unresolved and is returned for manual recovery", async () => {
  const f = await fixture({ receiptFails: true })
  let posts = 0
  const result = await dispatchHmrcVatReturn({ ...f.input, send: async () => { posts++; return accepted() } })
  assert.equal(result.status, "reconciliation_required")
  assert.equal(result.kind, "other")
  assert.equal(result.recorded, true)
  assert.equal(result.receipt.formBundleNumber, "256660290587")
  assert.equal(posts, 1)
  assert.equal(f.state, "reconciliation_required")
})
