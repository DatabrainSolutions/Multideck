import assert from "node:assert/strict"
import test from "node:test"
import { verifyHmrcVatObligation } from "../functions/_shared/hmrc-vat-obligation.mts"

const actorId = "00000000-0000-4000-8000-000000000001"
const periodId = "00000000-0000-4000-8000-000000000003"
const connectionId = "00000000-0000-4000-8000-000000000004"
const correlationId = "c75f40a6-a3df-4429-a697-471eeec46435"
const now = new Date("2026-09-24T10:25:00.000Z")
const fraud = {
  browser: { browserJsUserAgent: "Mozilla/5.0 (Test Browser)",
    deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce",
    screens: "width=1920&height=1080&scaling-factor=1.25&colour-depth=24",
    timezone: "UTC+03:00", windowSize: "width=1280&height=720" },
  auth: { auth: {
    getClaims: async () => ({ data: { claims: { sub: actorId, role: "authenticated",
      email: "ops@example.com", aal: "aal2", amr: [{ method: "totp", timestamp: 1790245200 }] } }, error: null }),
    admin: { getUserById: async () => ({ data: { user: { id: actorId,
      email: "ops@example.com", email_confirmed_at: "2026-01-02T10:00:00Z" } }, error: null }),
      mfa: { listFactors: async () => ({ data: { factors: [{
        id: "00000000-0000-4000-8000-000000000002", factor_type: "totp", status: "verified",
      }] }, error: null }) } },
  } },
  jwt: "verified-jwt", authUserId: actorId, tenantProjectRef: "tenant.supabase.co",
  ingress: { originatingPublicIp: "8.8.8.8", originatingPublicTcpSourcePort: 12345,
    observedAt: "2026-09-24T10:24:59.000Z",
    publicTlsHops: [{ receivedByPublicIp: "1.1.1.1", sentByPublicIp: "8.8.8.8" }] },
  vendor: { productName: "Multideck App", licenseHashes: { multideck: "a".repeat(64) },
    versions: { multideck: "1.0.0" } },
}

function fixture(options = {}) {
  const calls = []
  const db = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === "multideck_hmrc_vat_access_for_period") {
      assert.equal(args.p_purpose, "obligations")
      if (options.authorityFails) return { data: null, error: { code: "42501" } }
      return { data: { accessToken: "opaque-access-token", environment: "sandbox",
        vrn: "123456789", periodId, connectionId }, error: null }
    }
    if (name === "multideck_hmrc_vat_obligation_context") {
      if (options.contextFails) return { data: null, error: { code: "42501" } }
      return { data: { periodId, connectionId, environment: "sandbox",
        vrn: options.wrongVrn ? "987654321" : "123456789",
        startDate: "2026-07-01", endDate: "2026-09-30" }, error: null }
    }
    if (name === "multideck_hmrc_vat_record_obligation") {
      if (options.recordFails) return { data: null, error: { code: "08006" } }
      return { data: { verificationId: "verification-1", periodId,
        periodKey: options.wrongKey ? "26B1" : "26A1", due: "2026-11-07",
        environment: "sandbox", observedAt: "2026-09-24T10:25:01Z" }, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  } }
  return { calls, input: { db, actorId,
    entityId: "00000000-0000-4000-8000-000000000006",
    projectRef: "tenant.supabase.co", periodId, connectionId, fraud,
    now: () => now } }
}

const open = { start: "2026-07-01", end: "2026-09-30", due: "2026-11-07",
  status: "O", periodKey: "26A1" }

test("HMRC obligation GET uses server dates and records one exact open match", async () => {
  const f = fixture()
  let gets = 0
  const result = await verifyHmrcVatObligation({ ...f.input, send: async (url, init) => {
    gets++
    const parsed = new URL(url)
    assert.equal(parsed.origin, "https://test-api.service.hmrc.gov.uk")
    assert.equal(parsed.pathname, "/organisations/vat/123456789/obligations")
    assert.equal(parsed.searchParams.get("from"), "2026-07-01")
    assert.equal(parsed.searchParams.get("to"), "2026-09-30")
    assert.equal(init.method, "GET")
    assert.equal(init.headers.Authorization, "Bearer opaque-access-token")
    return Response.json({ obligations: [open] }, { headers: { "X-CorrelationId": correlationId } })
  } })
  assert.deepEqual(result, { status: "verified", verificationId: "verification-1",
    dueDate: "2026-11-07", observedAt: "2026-09-24T10:25:01Z" })
  assert.equal(gets, 1)
  assert.deepEqual(f.calls.map(call => call.name), ["multideck_hmrc_vat_access_for_period",
    "multideck_hmrc_vat_obligation_context", "multideck_hmrc_vat_record_obligation"])
  assert.deepEqual(f.calls[2].args.p_obligation, open)
  assert.equal(f.calls[2].args.p_correlation_id, correlationId)
  assert.equal(JSON.stringify(result).includes("26A1"), false)
})

test("missing, closed and duplicate open obligations cannot be verified", async () => {
  for (const obligations of [[], [{ ...open, status: "F", received: "2026-09-24" }],
    [open, { ...open, periodKey: "26B1" }]]) {
    const f = fixture()
    assert.deepEqual(await verifyHmrcVatObligation({ ...f.input,
      send: async () => Response.json({ obligations }, { headers: { "X-CorrelationId": correlationId } }) }),
    { status: "unresolved", reason: "no_exact_open_obligation" })
    assert.equal(f.calls.length, 2)
  }
})

test("failed fraud, authority, context, HMRC and recording stages fail closed", async () => {
  const noSend = async () => { throw new Error("Unexpected HMRC request") }
  const foreign = fixture()
  assert.deepEqual(await verifyHmrcVatObligation({ ...foreign.input,
    projectRef: "other-tenant", send: noSend }),
  { status: "preflight_failed", reason: "fraud_evidence" })
  assert.equal(foreign.calls.length, 0)
  for (const [options, reason] of [[{ authorityFails: true }, "authority"],
    [{ contextFails: true }, "context"], [{ wrongVrn: true }, "context"]]) {
    const f = fixture(options)
    assert.deepEqual(await verifyHmrcVatObligation({ ...f.input, send: noSend }),
      { status: "preflight_failed", reason })
  }
  const network = fixture()
  assert.deepEqual(await verifyHmrcVatObligation({ ...network.input,
    send: async () => { throw new Error("network") } }),
  { status: "unresolved", reason: "hmrc_read" })
  assert.equal(network.calls.length, 2)
  const lostRecord = fixture({ recordFails: true })
  assert.deepEqual(await verifyHmrcVatObligation({ ...lostRecord.input,
    send: async () => Response.json({ obligations: [open] },
      { headers: { "X-CorrelationId": correlationId } }) }),
  { status: "unresolved", reason: "durable_record" })
  const changedReply = fixture({ wrongKey: true })
  assert.deepEqual(await verifyHmrcVatObligation({ ...changedReply.input,
    send: async () => Response.json({ obligations: [open] },
      { headers: { "X-CorrelationId": correlationId } }) }),
  { status: "unresolved", reason: "durable_record" })
})
