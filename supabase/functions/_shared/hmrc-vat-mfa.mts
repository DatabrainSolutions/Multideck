// Build one HMRC factor claim from Supabase Auth's verified JWT and factor
// directory. Neither browser input nor editable user metadata is evidence.
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const maxPromptAgeSeconds = 15 * 60

export type AuthSource = {
  auth: {
    getClaims: (jwt: string) => Promise<{ data: { claims: unknown } | null; error: unknown }>
    admin: {
      getUserById?: (userId: string) => Promise<{
        data: { user: unknown } | null
        error: unknown
      }>
      mfa: {
        listFactors: (input: { userId: string }) => Promise<{
          data: { factors: unknown } | null
          error: unknown
        }>
      }
    }
  }
}

// HMRC asks for both the application's internal user ID and the identifier
// used to sign in. Read the latter from Auth's server-owned user record, and
// require it to agree with the verified JWT on this request. Neither browser
// input nor user_metadata can set either value.
export async function collectHmrcVatUserIds(
  admin: AuthSource,
  jwt: string,
  authUserId: string,
) {
  if (!jwt || !uuid.test(authUserId) || !admin.auth.admin.getUserById) {
    throw new Error("Verified HMRC user identity evidence is unavailable.")
  }
  const [claimsResult, userResult] = await Promise.all([
    admin.auth.getClaims(jwt),
    admin.auth.admin.getUserById(authUserId),
  ])
  if (claimsResult.error || userResult.error || !claimsResult.data?.claims
    || !userResult.data?.user) {
    throw new Error("Verified HMRC user identity could not be read.")
  }
  const claims = claimsResult.data.claims as Record<string, unknown>
  const user = userResult.data.user as Record<string, unknown>
  const email = typeof user.email === "string" ? user.email.trim() : ""
  if (claims.sub !== authUserId || user.id !== authUserId
    || claims.role !== "authenticated" || typeof claims.email !== "string"
    || claims.email.trim().toLowerCase() !== email.toLowerCase()
    || !user.email_confirmed_at || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Verified HMRC sign-in identity does not match this request.")
  }
  return `multideck=${encodeURIComponent(authUserId)}&login=${encodeURIComponent(email)}`
}

export async function collectHmrcVatTotpEvidence(
  admin: AuthSource,
  jwt: string,
  authUserId: string,
  tenantProjectRef: string,
  now = new Date(),
) {
  if (!jwt || !uuid.test(authUserId) || !/^[a-z0-9.-]{3,255}$/i.test(tenantProjectRef)
    || !Number.isFinite(now.getTime())) {
    throw new Error("Verified HMRC user and tenant MFA evidence is unavailable.")
  }
  const [claimsResult, factorsResult] = await Promise.all([
    admin.auth.getClaims(jwt),
    admin.auth.admin.mfa.listFactors({ userId: authUserId }),
  ])
  if (claimsResult.error || factorsResult.error || !claimsResult.data?.claims
    || !factorsResult.data?.factors) {
    throw new Error("Verified HMRC MFA evidence could not be read.")
  }
  const claims = claimsResult.data.claims as Record<string, unknown>
  if (claims.sub !== authUserId || claims.aal !== "aal2" || !Array.isArray(claims.amr)) {
    throw new Error("A verified second factor is required for HMRC VAT.")
  }
  const totpEvents = claims.amr.filter((entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      && (entry as Record<string, unknown>).method === "totp") as Array<Record<string, unknown>>
  const latest = totpEvents.reduce<number>((time, event) =>
    Number.isSafeInteger(event.timestamp) ? Math.max(time, event.timestamp as number) : time, 0)
  const age = Math.floor(now.getTime() / 1000) - latest
  if (!latest || age < 0 || age > maxPromptAgeSeconds) {
    throw new Error("Verify a TOTP factor again before using HMRC VAT.")
  }
  if (!Array.isArray(factorsResult.data.factors)) {
    throw new Error("Verified HMRC MFA factors are unavailable.")
  }
  const factors = factorsResult.data.factors.filter((item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      && (item as Record<string, unknown>).factor_type === "totp"
      && (item as Record<string, unknown>).status === "verified") as Array<Record<string, unknown>>
  // AMR identifies the method and time, not the factor ID. With two TOTP
  // factors we cannot truthfully identify which secret was used.
  if (factors.length !== 1 || typeof factors[0].id !== "string" || !uuid.test(factors[0].id)) {
    throw new Error("HMRC VAT needs one identifiable verified TOTP factor.")
  }
  const factor = factors[0].id as string
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    `multideck-hmrc-vat-factor-v1:${tenantProjectRef.toLowerCase()}:${factor.toLowerCase()}`))
  const reference = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const timestamp = new Date(latest * 1000).toISOString().replace(".000Z", "Z")
  return `type=TOTP&timestamp=${encodeURIComponent(timestamp)}&unique-reference=${reference}`
}
