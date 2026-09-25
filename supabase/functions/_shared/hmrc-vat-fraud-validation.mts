import { buildHmrcVatFraudHeaders, hmrcVatApiAccept, hmrcVatFraudHeaderNames,
  type HmrcVatFraudHeaderName } from "./hmrc-vat-oauth.mts"

const sandboxOrigin = "https://test-api.service.hmrc.gov.uk"
const validatorPath = "/test/fraud-prevention-headers/validate"
const feedbackPath = "/test/fraud-prevention-headers/vat-mtd/validation-feedback"

type ValidationIssue = { code: string; headers: string[] }
export type HmrcVatFraudValidation = {
  specVersion: string
  code: "VALID_HEADERS" | "POTENTIALLY_INVALID_HEADERS" | "INVALID_HEADERS"
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  formatAppearsValid: boolean
}

const headerNames = new Set<string>(hmrcVatFraudHeaderNames.map((name) => name.toLowerCase()))

function applicationToken(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HMRC sandbox application authority is invalid.")
  }
  const value = payload as Record<string, unknown>
  const token = value.access_token
  const expires = Number(value.expires_in)
  if (typeof token !== "string" || !/^[\x21-\x7e]{10,8000}$/.test(token)
    || /\s/.test(token) || String(value.token_type).toLowerCase() !== "bearer"
    || !Number.isInteger(expires) || expires < 1 || expires > 14400) {
    throw new Error("HMRC sandbox application authority is invalid.")
  }
  return token
}

function issues(value: unknown): ValidationIssue[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new Error("HMRC fraud validation response is invalid.")
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("HMRC fraud validation response is invalid.")
    }
    const record = item as Record<string, unknown>
    if (typeof record.code !== "string" || !/^[A-Z_]{1,80}$/.test(record.code)
      || !Array.isArray(record.headers) || record.headers.length > 16
      || record.headers.some((header) => typeof header !== "string"
        || !headerNames.has(header.toLowerCase()))) {
      throw new Error("HMRC fraud validation response is invalid.")
    }
    return { code: record.code, headers: record.headers.map((header: string) => header.toLowerCase()) }
  })
}

async function requestApplicationToken(input: { clientId: string; clientSecret: string }, send: typeof fetch) {
  if (!input.clientId || input.clientId.length > 512
    || !input.clientSecret || input.clientSecret.length > 2048) {
    throw new Error("HMRC sandbox application credentials are unavailable.")
  }
  const tokenResponse = await send(`${sandboxOrigin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: input.clientId,
      client_secret: input.clientSecret, grant_type: "client_credentials" }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (!tokenResponse.ok) throw new Error(`HMRC sandbox application authority failed (HTTP ${tokenResponse.status}).`)
  const rawToken = await tokenResponse.text()
  if (rawToken.length > 16384) throw new Error("HMRC sandbox application authority is invalid.")
  let tokenPayload: unknown
  try { tokenPayload = JSON.parse(rawToken) }
  catch { throw new Error("HMRC sandbox application authority is invalid.") }
  return applicationToken(tokenPayload)
}

/** Sandbox-only conformance check. Credentials and fraud values must come from
 * a verified, tenant-owned server path. The returned diagnostic omits token,
 * raw header values and HMRC's free-text messages. No VAT API call is made. */
export async function requestHmrcVatFraudValidation(input: {
  clientId: string
  clientSecret: string
  fraudHeaders: Partial<Record<HmrcVatFraudHeaderName, string>>
}, send: typeof fetch): Promise<HmrcVatFraudValidation> {
  const headers = buildHmrcVatFraudHeaders(input.fraudHeaders)
  const token = await requestApplicationToken(input, send)
  const response = await send(`${sandboxOrigin}${validatorPath}`, {
    method: "GET",
    headers: { Accept: hmrcVatApiAccept, Authorization: `Bearer ${token}`, ...headers },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HMRC fraud-header validation failed (HTTP ${response.status}).`)
  const raw = await response.text()
  if (raw.length > 32768) throw new Error("HMRC fraud validation response is invalid.")
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { throw new Error("HMRC fraud validation response is invalid.") }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HMRC fraud validation response is invalid.")
  }
  const result = payload as Record<string, unknown>
  const code = result.code
  if (typeof result.specVersion !== "string" || !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(result.specVersion)
    || !["VALID_HEADERS", "POTENTIALLY_INVALID_HEADERS", "INVALID_HEADERS"].includes(String(code))) {
    throw new Error("HMRC fraud validation response is invalid.")
  }
  const errors = issues(result.errors)
  const warnings = issues(result.warnings)
  if (code === "VALID_HEADERS" && (errors.length || warnings.length)) {
    throw new Error("HMRC fraud validation response is contradictory.")
  }
  return { specVersion: result.specVersion,
    code: code as HmrcVatFraudValidation["code"], errors, warnings,
    formatAppearsValid: code === "VALID_HEADERS" && errors.length === 0 && warnings.length === 0 }
}

export type HmrcVatFraudFeedback = {
  requests: Array<{
    endpoint: "obligations" | "returns" | "liabilities" | "payments" | "other_vat"
    method: "GET" | "POST"
    requestTimestamp: string
    code: "VALID_HEADERS" | "POTENTIALLY_INVALID_HEADERS" | "INVALID_HEADERS" | "NO_HEADERS"
    headerStatuses: Array<{ header: string; code: string }>
    crossValidation: Array<{ headers: string[]; code: "VALID_HEADERS" | "INVALID_HEADERS" }>
  }>
  allReportedRequestsAppearValid: boolean
}

function endpoint(path: string): HmrcVatFraudFeedback["requests"][number]["endpoint"] {
  if (!/^\/organisations\/vat\/[0-9]{9}\//.test(path)) return "other_vat"
  const segment = path.split("/")[4]?.split("?")[0]
  return segment === "obligations" || segment === "returns"
    || segment === "liabilities" || segment === "payments" ? segment : "other_vat"
}

function checkedHeaderName(value: unknown) {
  if (typeof value !== "string" || !/^gov-(?:client|vendor)-[a-z0-9-]{1,80}$/i.test(value)) {
    throw new Error("HMRC VAT fraud feedback is invalid.")
  }
  return value.toLowerCase()
}

/** Summarise HMRC's latest sandbox VAT API request feedback. The provider may
 * return VRNs, header values and free-text messages; none leave this helper. */
export async function requestHmrcVatFraudFeedback(input: {
  clientId: string
  clientSecret: string
}, send: typeof fetch): Promise<HmrcVatFraudFeedback> {
  const token = await requestApplicationToken(input, send)
  const url = new URL(`${sandboxOrigin}${feedbackPath}`)
  url.searchParams.set("connectionMethod", "WEB_APP_VIA_SERVER")
  const response = await send(url.toString(), {
    method: "GET",
    headers: { Accept: hmrcVatApiAccept, Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HMRC VAT fraud feedback could not be read (HTTP ${response.status}).`)
  const raw = await response.text()
  if (raw.length > 262144) throw new Error("HMRC VAT fraud feedback is invalid.")
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { throw new Error("HMRC VAT fraud feedback is invalid.") }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HMRC VAT fraud feedback is invalid.")
  }
  const items = (payload as Record<string, unknown>).requests
  if (!Array.isArray(items) || items.length > 32) throw new Error("HMRC VAT fraud feedback is invalid.")
  const requests = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("HMRC VAT fraud feedback is invalid.")
    }
    const entry = item as Record<string, unknown>
    if (typeof entry.path !== "string" || entry.path.length > 1024
      || !["GET", "POST"].includes(String(entry.method))
      || typeof entry.requestTimestamp !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(entry.requestTimestamp)
      || !Number.isFinite(Date.parse(entry.requestTimestamp))
      || !["VALID_HEADERS", "POTENTIALLY_INVALID_HEADERS", "INVALID_HEADERS", "NO_HEADERS"].includes(String(entry.code))
      || !Array.isArray(entry.headers) || entry.headers.length > 64
      || !Array.isArray(entry.crossValidation) || entry.crossValidation.length > 64) {
      throw new Error("HMRC VAT fraud feedback is invalid.")
    }
    const headerStatuses = entry.headers.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("HMRC VAT fraud feedback is invalid.")
      }
      const header = item as Record<string, unknown>
      if (!/^(?:VALID_HEADER|INVALID_HEADER|POTENTIALLY_INVALID_HEADER|MISSING_HEADER|UNEXPECTED_HEADER|TEST_SCENARIO_HEADER)$/.test(String(header.code))) {
        throw new Error("HMRC VAT fraud feedback is invalid.")
      }
      return { header: checkedHeaderName(header.header), code: header.code as string }
    })
    const crossValidation = entry.crossValidation.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("HMRC VAT fraud feedback is invalid.")
      }
      const check = item as Record<string, unknown>
      if (!Array.isArray(check.headers) || check.headers.length > 32
        || !["VALID_HEADERS", "INVALID_HEADERS"].includes(String(check.code))) {
        throw new Error("HMRC VAT fraud feedback is invalid.")
      }
      return { headers: check.headers.map(checkedHeaderName),
        code: check.code as "VALID_HEADERS" | "INVALID_HEADERS" }
    })
    return { endpoint: endpoint(entry.path), method: entry.method as "GET" | "POST",
      requestTimestamp: entry.requestTimestamp,
      code: entry.code as HmrcVatFraudFeedback["requests"][number]["code"],
      headerStatuses, crossValidation }
  })
  return { requests, allReportedRequestsAppearValid: requests.length > 0 && requests.every((item) =>
    item.code === "VALID_HEADERS"
    && item.headerStatuses.every((header) => header.code === "VALID_HEADER")
    && hmrcVatFraudHeaderNames.every((name) => item.headerStatuses.some((header) =>
      header.header === name.toLowerCase() && header.code === "VALID_HEADER"))
    && item.crossValidation.every((check) => check.code === "VALID_HEADERS")) }
}
