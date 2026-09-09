import assert from "node:assert/strict"
import test from "node:test"
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  getPasswordPolicyError,
} from "../src/lib/password-policy.ts"
import {
  createRecoveryMarker,
  parsePasswordRecoveryLink,
  recoveryMarkerMatches,
  scrubPasswordRecoveryUrl,
} from "../src/lib/password-recovery.ts"

test("password policy enforces every requirement and keeps symbols optional", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8)
  assert.equal(PASSWORD_MAX_LENGTH, 128)
  assert.equal(getPasswordPolicyError("Short1A"), "Use at least 8 characters.")
  assert.equal(getPasswordPolicyError("A".repeat(128) + "a1"), "Use no more than 128 characters.")
  assert.equal(getPasswordPolicyError("UPPERCASE1"), "Add at least one lowercase letter.")
  assert.equal(getPasswordPolicyError("lowercase1"), "Add at least one uppercase letter.")
  assert.equal(getPasswordPolicyError("NoNumbers"), "Add at least one number.")
  assert.equal(getPasswordPolicyError("Compliant8"), null)
  assert.equal(getPasswordPolicyError("Compliant8!"), null)
  assert.equal(getPasswordPolicyError(`Aa1${"x".repeat(125)}`), null)
})

test("recovery parser accepts new token hashes and supported legacy callbacks", () => {
  const tokenHash = "a".repeat(64)
  assert.deepEqual(
    parsePasswordRecoveryLink(`https://dev.multideck.app/auth?mode=reset-password#token_hash=${tokenHash}&type=recovery`),
    { kind: "token-hash", tokenHash },
  )

  const code = "legacy-code-abcdefghijklmnopqrstuvwxyz"
  assert.deepEqual(
    parsePasswordRecoveryLink(`https://dev.multideck.app/auth?mode=reset-password&code=${code}`),
    { kind: "legacy-code", code },
  )

  const accessToken = `header.${"a".repeat(40)}.signature`
  const refreshToken = `refresh-${"b".repeat(40)}`
  assert.deepEqual(
    parsePasswordRecoveryLink(`https://dev.multideck.app/auth?mode=reset-password#access_token=${accessToken}&refresh_token=${refreshToken}&type=recovery`),
    { kind: "legacy-session", accessToken, refreshToken },
  )
})

test("recovery parser rejects denied, missing, and malformed links", () => {
  assert.deepEqual(
    parsePasswordRecoveryLink("https://dev.multideck.app/auth?mode=reset-password#error=access_denied&error_code=otp_expired"),
    { kind: "invalid", reason: "denied" },
  )
  assert.deepEqual(
    parsePasswordRecoveryLink("https://dev.multideck.app/auth?mode=reset-password#token_hash=short&type=recovery"),
    { kind: "invalid", reason: "malformed" },
  )
  assert.deepEqual(
    parsePasswordRecoveryLink("https://dev.multideck.app/auth?mode=reset-password"),
    { kind: "missing" },
  )
})

test("callback secrets are scrubbed while the reset route is retained", () => {
  const scrubbed = scrubPasswordRecoveryUrl("https://dev.multideck.app/auth?mode=reset-password&code=secret#error=denied")
  assert.equal(scrubbed, "/auth?mode=reset-password")
})

test("the short-lived recovery marker authorises only the verified user", () => {
  const now = 1_000_000
  const marker = createRecoveryMarker("verified-user", now)
  assert.equal(recoveryMarkerMatches(marker, "verified-user", now + 9 * 60 * 1000), true)
  assert.equal(recoveryMarkerMatches(marker, "unrelated-session", now + 1), false)
  assert.equal(recoveryMarkerMatches(marker, "verified-user", now + 10 * 60 * 1000), false)
  assert.equal(recoveryMarkerMatches(null, "verified-user", now), false)
})
