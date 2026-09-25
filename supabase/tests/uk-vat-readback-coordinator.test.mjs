import assert from "node:assert/strict"
import test from "node:test"
import { reconcileHmrcVatReturnReadback } from "../functions/_shared/hmrc-vat-readback.mts"

const actorId = "00000000-0000-4000-8000-000000000001"
const periodId = "00000000-0000-4000-8000-000000000003"
const connectionId = "00000000-0000-4000-8000-000000000004"
const attemptId = "00000000-0000-4000-8000-000000000005"
const correlationId = "c75f40a6-a3df-4429-a697-471eeec46435"
const now = new Date("2026-09-24T10:25:00.000Z")
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
const body = { periodKey: "#001", vatDueSales: 15, vatDueAcquisitions: 0,
  totalVatDue: 15, vatReclaimedCurrPeriod: 8, netVatDue: 7,
  totalValueSalesExVAT: 125, totalValuePurchasesExVAT: 50,
  totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0 }

function fixture(options = {}) {
  const calls = []
  const db = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === "multideck_hmrc_vat_access_for_period") {
      assert.equal(args.p_purpose, "readback")
      if (options.authorityFails) return { data: null, error: { code: "42501" } }
      return { data: { accessToken: "opaque-access-token", environment: "sandbox",
        vrn: "123456789", periodId, connectionId }, error: null }
    }
    if (name === "multideck_uk_vat_readback_context") {
      if (options.contextFails) return { data: null, error: { code: "42501" } }
      return { data: { attemptId, periodId, connectionId, environment: "sandbox",
        vrn: options.wrongVrn ? "987654321" : "123456789", periodKey: "#001" }, error: null }
    }
    if (name === "multideck_uk_vat_record_return_readback") {
      if (options.recordFails) return { data: null, error: { code: "08006" } }
      return { data: { attemptId, readbackId: "check-1",
        status: options.result === "matched" ? "accepted_readback" : "reconciliation_required",
        result: options.result ?? "not_found" }, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  } }
  return { calls, input: { db, actorId, entityId: "00000000-0000-4000-8000-000000000006",
    projectRef: "tenant.supabase.co", periodId, connectionId, attemptId,
    fraud, now: () => now } }
}

test("a matched HMRC GET is accepted only after the database records it", async () => {
  const f = fixture({ result: "matched" })
  let gets = 0
  const result = await reconcileHmrcVatReturnReadback({ ...f.input, send: async (url, init) => {
    gets++
    assert.equal(url, "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns/%23001")
    assert.equal(init.method, "GET")
    assert.equal(init.headers.Authorization, "Bearer opaque-access-token")
    return Response.json(body, { headers: { "X-CorrelationId": correlationId } })
  } })
  assert.deepEqual(result, { status: "accepted_readback", result: "matched", readbackId: "check-1" })
  assert.equal(gets, 1)
  assert.deepEqual(f.calls.map(call => call.name), ["multideck_hmrc_vat_access_for_period",
    "multideck_uk_vat_readback_context", "multideck_uk_vat_record_return_readback"])
  assert.equal(f.calls[2].args.p_raw_body, JSON.stringify(body))
  assert.equal(f.calls[2].args.p_correlation_id, correlationId)
})

test("404 and different figures stay unresolved with durable readback evidence", async () => {
  const missing = fixture({ result: "not_found" })
  const noReturn = await reconcileHmrcVatReturnReadback({ ...missing.input,
    send: async () => new Response(null, { status: 404,
      headers: { "X-CorrelationId": correlationId } }) })
  assert.deepEqual(noReturn, { status: "reconciliation_required", result: "not_found", readbackId: "check-1" })
  assert.equal(missing.calls[2].args.p_http_status, 404)
  assert.equal(missing.calls[2].args.p_raw_body, null)
  assert.equal(missing.calls[2].args.p_correlation_id, correlationId)
  const changed = fixture({ result: "mismatch" })
  const mismatchBody = { ...body, vatDueSales: 14 }
  const different = await reconcileHmrcVatReturnReadback({ ...changed.input,
    send: async () => Response.json(mismatchBody, { headers: { "X-CorrelationId": correlationId } }) })
  assert.deepEqual(different, { status: "reconciliation_required", result: "mismatch", readbackId: "check-1" })
  assert.equal(changed.calls[2].args.p_raw_body, JSON.stringify(mismatchBody))
})

test("scope and evidence failures prevent a GET; uncertain outcomes never produce a POST", async () => {
  const noSend = async () => { throw new Error("Unexpected HMRC request") }
  const foreign = fixture()
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...foreign.input,
    projectRef: "other-tenant", send: noSend }),
  { status: "preflight_failed", reason: "fraud_evidence" })
  assert.equal(foreign.calls.length, 0)
  const noAuthority = fixture({ authorityFails: true })
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...noAuthority.input, send: noSend }),
    { status: "preflight_failed", reason: "authority" })
  const noContext = fixture({ contextFails: true })
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...noContext.input, send: noSend }),
    { status: "preflight_failed", reason: "context" })
  const wrongVrn = fixture({ wrongVrn: true })
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...wrongVrn.input, send: noSend }),
    { status: "preflight_failed", reason: "context" })
  const network = fixture()
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...network.input,
    send: async () => { throw new Error("network") } }),
  { status: "unresolved", reason: "hmrc_read" })
  assert.equal(network.calls.length, 2)
  const untraceable = fixture()
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...untraceable.input,
    send: async () => Response.json(body) }),
  { status: "unresolved", reason: "hmrc_read" })
  assert.equal(untraceable.calls.length, 2)
  const lostRecord = fixture({ recordFails: true })
  assert.deepEqual(await reconcileHmrcVatReturnReadback({ ...lostRecord.input,
    send: async () => Response.json(body, { headers: { "X-CorrelationId": correlationId } }) }),
  { status: "unresolved", reason: "durable_record" })
})
