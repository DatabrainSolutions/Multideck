import test from "node:test"
import assert from "node:assert/strict"
import { collectHmrcVatTotpEvidence, collectHmrcVatUserIds } from "../functions/_shared/hmrc-vat-mfa.mts"

const userId = "00000000-0000-4000-8000-000000000001"
const factorId = "00000000-0000-4000-8000-000000000002"
const now = new Date("2026-09-24T10:25:00.000Z")
const claims = { sub: userId, role: "authenticated", email: "ops+vat@example.com", aal: "aal2", amr: [{ method: "totp", timestamp: 1790245200 }] }
const factors = [{ id: factorId, factor_type: "totp", status: "verified" }]
const user = { id: userId, email: "ops+vat@example.com", email_confirmed_at: "2026-01-02T10:00:00Z" }

function authSource(overrides = {}) {
  return {
    auth: {
      getClaims: async () => ({ data: { claims: overrides.claims ?? claims }, error: null }),
      admin: {
        getUserById: async () => ({ data: { user: overrides.user ?? user }, error: null }),
        mfa: { listFactors: async () => ({ data: { factors: overrides.factors ?? factors }, error: null }) },
      },
    },
  }
}

test("HMRC MFA evidence uses verified TOTP time and one stable factor reference", async () => {
  const header = await collectHmrcVatTotpEvidence(authSource(), "verified-jwt", userId, "tenant.supabase.co", now)
  assert.match(header, /^type=TOTP&timestamp=2026-09-24T10%3A20%3A00Z&unique-reference=[a-f0-9]{64}$/)
  assert.equal(await collectHmrcVatTotpEvidence(authSource(), "verified-jwt", userId, "tenant.supabase.co", now), header)
  assert.notEqual(await collectHmrcVatTotpEvidence(authSource(), "verified-jwt", userId, "other.supabase.co", now), header)
})

test("HMRC user IDs are request-bound to verified Auth subject and sign-in email", async () => {
  const source = authSource()
  assert.equal(await collectHmrcVatUserIds(source, "verified-jwt", userId),
    `multideck=${userId}&login=ops%2Bvat%40example.com`)
  await assert.rejects(collectHmrcVatUserIds(authSource({ claims: { ...claims, sub: factorId } }), "jwt", userId), /does not match/)
  await assert.rejects(collectHmrcVatUserIds(authSource({ user: { ...user, id: factorId } }), "jwt", userId), /does not match/)
  await assert.rejects(collectHmrcVatUserIds(authSource({ user: { ...user, email: "changed@example.com" } }), "jwt", userId), /does not match/)
  await assert.rejects(collectHmrcVatUserIds(authSource({ user: { ...user, email_confirmed_at: null } }), "jwt", userId), /does not match/)
  await assert.rejects(collectHmrcVatUserIds(authSource({ claims: { ...claims, role: "service_role" } }), "jwt", userId), /does not match/)
})

test("HMRC MFA evidence rejects another user, stale prompt and ambiguous factors", async () => {
  await assert.rejects(collectHmrcVatTotpEvidence(authSource({ claims: { ...claims, sub: factorId } }), "jwt", userId, "tenant.supabase.co", now), /second factor/)
  await assert.rejects(collectHmrcVatTotpEvidence(authSource(), "jwt", userId, "tenant.supabase.co", new Date("2026-09-24T10:36:00Z")), /Verify a TOTP/)
  await assert.rejects(collectHmrcVatTotpEvidence(authSource({ factors: [...factors, { ...factors[0], id: userId }] }), "jwt", userId, "tenant.supabase.co", now), /one identifiable/)
  await assert.rejects(collectHmrcVatTotpEvidence(authSource({ claims: { ...claims, aal: "aal1" } }), "jwt", userId, "tenant.supabase.co", now), /second factor/)
})
