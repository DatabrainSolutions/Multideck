import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

async function importTypeScript(url) {
  const source = await readFile(url, "utf8")
  const javascript = stripTypeScriptTypes(source, { mode: "strip" })
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`)
}

const { getPasswordPolicyError } = await importTypeScript(new URL("../functions/_shared/password-policy.ts", import.meta.url))
const { buildPasswordRecoveryUrl } = await importTypeScript(new URL("../functions/send-auth-email/recovery-link.ts", import.meta.url))

const clientPolicy = await readFile(new URL("../../multideck.client/src/lib/password-policy.ts", import.meta.url), "utf8")
const serverPolicy = await readFile(new URL("../functions/_shared/password-policy.ts", import.meta.url), "utf8")
const authConfig = await readFile(new URL("../config.toml", import.meta.url), "utf8")
const authFlow = await readFile(new URL("../../multideck.client/src/components/multideck/auth-flow.tsx", import.meta.url), "utf8")
const supabaseClient = await readFile(new URL("../../multideck.client/src/lib/supabase.ts", import.meta.url), "utf8")

test("server password policy covers length, case, digits, symbols, and the maximum boundary", () => {
  assert.equal(getPasswordPolicyError("Short1A"), "Use at least 8 characters.")
  assert.equal(getPasswordPolicyError("UPPERCASE1"), "Add at least one lowercase letter.")
  assert.equal(getPasswordPolicyError("lowercase1"), "Add at least one uppercase letter.")
  assert.equal(getPasswordPolicyError("NoNumbers"), "Add at least one number.")
  assert.equal(getPasswordPolicyError("Compliant8"), null)
  assert.equal(getPasswordPolicyError("Compliant8!"), null)
  assert.equal(getPasswordPolicyError(`Aa1${"x".repeat(125)}`), null)
  assert.equal(getPasswordPolicyError(`Aa1${"x".repeat(126)}`), "Use no more than 128 characters.")
})

test("client, Edge Functions, and local Auth configuration use the same policy", () => {
  for (const policySource of [clientPolicy, serverPolicy]) {
    assert.match(policySource, /PASSWORD_MIN_LENGTH = 8/u)
    assert.match(policySource, /PASSWORD_MAX_LENGTH = 128/u)
    assert.match(policySource, /!\/\[a-z\]\//u)
    assert.match(policySource, /!\/\[A-Z\]\//u)
    assert.match(policySource, /!\/\[0-9\]\//u)
  }
  assert.match(authConfig, /minimum_password_length = 8/u)
  assert.match(authConfig, /password_requirements = "lower_upper_letters_digits"/u)
})

test("recovery email targets only the exact configured tenant and keeps its token in the fragment", () => {
  const tokenHash = "a".repeat(64)
  const url = buildPasswordRecoveryUrl(
    "https://dev.multideck.app",
    "https://dev.multideck.app/auth?mode=reset-password",
    tokenHash,
  )
  assert.equal(url, `https://dev.multideck.app/auth?mode=reset-password#token_hash=${tokenHash}&type=recovery`)
  assert.throws(() => buildPasswordRecoveryUrl(
    "https://dev.multideck.app",
    "https://other.multideck.app/auth?mode=reset-password",
    tokenHash,
  ), /configured tenant application/u)
  assert.throws(() => buildPasswordRecoveryUrl(
    "https://dev.multideck.app",
    "https://dev.multideck.app/auth",
    tokenHash,
  ), /configured tenant application/u)
})

test("the client requires explicit recovery proof and revokes only other sessions", () => {
  assert.match(authFlow, /Continue securely/u)
  assert.match(authFlow, /hasVerifiedPasswordRecovery\(passwordSession\)/u)
  assert.match(authFlow, /signOut\(\{ scope: "others" \}\)/u)
  assert.match(authFlow, /Do not reset it again/u)
  assert.match(supabaseClient, /verifyOtp\(\{ token_hash: context\.tokenHash, type: "recovery" \}\)/u)
  assert.doesNotMatch(supabaseClient, /return getSupabaseSession\(\)/u)
})
