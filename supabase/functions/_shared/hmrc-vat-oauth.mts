import { parseHmrcVatReturnReadbackText, type HmrcVatReturnInput } from "./hmrc-vat-return.mts"

export type HmrcVatEnvironment = "sandbox" | "production"

const endpoints = {
  sandbox: {
    authorise: "https://test-www.tax.service.gov.uk/oauth/authorize",
    token: "https://test-api.service.hmrc.gov.uk/oauth/token",
  },
  production: {
    authorise: "https://www.tax.service.gov.uk/oauth/authorize",
    token: "https://api.service.hmrc.gov.uk/oauth/token",
  },
} as const

export const hmrcVatScope = "read:vat write:vat"
export const hmrcVatApiAccept = "application/vnd.hmrc.1.0+json"

export function hmrcVatEndpoints(environment: HmrcVatEnvironment) {
  return endpoints[environment]
}

export function hmrcVatAuthorisationUrl(input: {
  environment: HmrcVatEnvironment
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}) {
  const url = new URL(endpoints[input.environment].authorise)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    scope: hmrcVatScope,
    state: input.state,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString()
  return url.toString()
}

export function hmrcVatCodeExchangeBody(input: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
  verifier: string
}) {
  return new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.verifier,
  })
}

export function hmrcVatRefreshBody(input: { clientId: string; clientSecret: string; refreshToken: string }) {
  return new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  })
}

export function parseHmrcVatToken(payload: unknown, options: { allowMissingScope?: boolean } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HMRC token response is invalid.")
  const value = payload as Record<string, unknown>
  const accessToken = typeof value.access_token === "string" ? value.access_token : ""
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : ""
  const tokenType = typeof value.token_type === "string" ? value.token_type.toLowerCase() : ""
  const expiresIn = typeof value.expires_in === "number" ? value.expires_in : Number(value.expires_in)
  const scopes = typeof value.scope === "string" ? value.scope.trim().split(/\s+/).sort() : []
  const scopeValid = scopes.length === 2 && scopes[0] === "read:vat" && scopes[1] === "write:vat"
    || (options.allowMissingScope === true && value.scope === undefined)
  if (accessToken.length < 10 || accessToken.length > 8000
    || refreshToken.length < 10 || refreshToken.length > 8000
    || tokenType !== "bearer" || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 14400
    || !scopeValid) {
    throw new Error("HMRC did not return a renewable VAT authority with the requested scope.")
  }
  return {
    bundle: { access_token: accessToken, refresh_token: refreshToken, token_type: "bearer" },
    expiresIn,
    scope: hmrcVatScope,
  }
}

export type HmrcVatObligation = {
  start: string
  end: string
  due: string
  status: "O" | "F"
  periodKey: string
  received?: string
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function hmrcVatObligationsUrl(input: {
  environment: HmrcVatEnvironment
  vrn: string
  from: string
  to: string
  status?: "O" | "F"
}) {
  if ((input.environment !== "sandbox" && input.environment !== "production")
    || !/^\d{9}$/.test(input.vrn) || !validDate(input.from) || !validDate(input.to)
    || input.to < input.from
    || (Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 86_400_000 > 366
    || (input.status !== undefined && input.status !== "O" && input.status !== "F")) {
    throw new Error("Choose a valid VAT registration, date range and obligation status.")
  }
  const origin = input.environment === "sandbox" ? "https://test-api.service.hmrc.gov.uk" : "https://api.service.hmrc.gov.uk"
  const url = new URL(`/organisations/vat/${input.vrn}/obligations`, origin)
  url.searchParams.set("from", input.from)
  url.searchParams.set("to", input.to)
  if (input.status) url.searchParams.set("status", input.status)
  return url.toString()
}

export function parseHmrcVatObligations(payload: unknown): HmrcVatObligation[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HMRC VAT obligations response is invalid.")
  const rows = (payload as Record<string, unknown>).obligations
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error("HMRC VAT obligations response is invalid.")
  const keys = new Set<string>()
  const obligations = rows.map((row): HmrcVatObligation => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("HMRC VAT obligation is invalid.")
    const item = row as Record<string, unknown>
    const { start, end, due, status, periodKey, received } = item
    if (!validDate(start) || !validDate(end) || !validDate(due) || end < start
      || (status !== "O" && status !== "F")
      || typeof periodKey !== "string" || !/^(?:[A-Za-z0-9]{4}|#[A-Za-z0-9]{3})$/.test(periodKey)
      || (received !== undefined && !validDate(received))
      || (status === "F" && received === undefined)
      || (status === "O" && received !== undefined)
      || keys.has(periodKey)) {
      throw new Error("HMRC VAT obligation is invalid.")
    }
    keys.add(periodKey)
    return { start, end, due, status, periodKey, ...(received ? { received } : {}) }
  })
  return obligations.sort((left, right) => left.start.localeCompare(right.start) || left.periodKey.localeCompare(right.periodKey))
}

export function matchOpenHmrcVatObligation(obligations: HmrcVatObligation[], start: string, end: string) {
  if (!validDate(start) || !validDate(end) || end < start) throw new Error("Choose valid local VAT period dates.")
  const matches = obligations.filter((obligation) => obligation.start === start && obligation.end === end && obligation.status === "O")
  if (matches.length !== 1) throw new Error("HMRC did not return exactly one open obligation matching this VAT period.")
  return matches[0]
}

export type HmrcVatSubmissionReceipt = {
  processingDate: string
  formBundleNumber: string
  correlationId: string
  receiptId: string
  receiptTimestamp: string
  paymentIndicator?: "DD" | "BANK"
  chargeRefNumber?: string
}

/** A 201 is not a durable filing receipt unless HMRC's response references
 * and timestamps can be captured. Preserve the original values for audit. */
export function parseHmrcVatSubmissionReceipt(payload: unknown, headers: Headers): HmrcVatSubmissionReceipt {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HMRC VAT submission receipt is invalid.")
  const value = payload as Record<string, unknown>
  const processingDate = value.processingDate
  const formBundleNumber = value.formBundleNumber
  const paymentIndicator = value.paymentIndicator
  const chargeRefNumber = value.chargeRefNumber
  const correlationId = headers.get("X-CorrelationId")
  const receiptId = headers.get("Receipt-ID")
  const receiptTimestamp = headers.get("Receipt-Timestamp")
  const validTimestamp = (item: unknown) => typeof item === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(item)
    && Number.isFinite(Date.parse(item))
  if (!validTimestamp(processingDate) || typeof formBundleNumber !== "string" || !/^\d{12}$/.test(formBundleNumber)
    || !/^[\x21-\x7e]{36}$/.test(correlationId || "")
    || !/^[\x21-\x7e]{36}$/.test(receiptId || "")
    || !validTimestamp(receiptTimestamp)
    || (paymentIndicator !== undefined && paymentIndicator !== "DD" && paymentIndicator !== "BANK")
    || (chargeRefNumber !== undefined && (typeof chargeRefNumber !== "string" || !/^[\x21-\x7e]{1,16}$/.test(chargeRefNumber)))) {
    throw new Error("HMRC VAT submission receipt is invalid.")
  }
  return {
    processingDate, formBundleNumber, correlationId: correlationId!, receiptId: receiptId!,
    receiptTimestamp: receiptTimestamp!,
    ...(paymentIndicator ? { paymentIndicator } : {}),
    ...(chargeRefNumber ? { chargeRefNumber } : {}),
  } as HmrcVatSubmissionReceipt
}

// HMRC's WEB_APP_VIA_SERVER connection method requires every one of these
// headers. Values come from the real browser, authentication and network path;
// this helper deliberately cannot substitute made-up values for missing data.
export const hmrcVatFraudHeaderNames = [
  "Gov-Client-Connection-Method",
  "Gov-Client-Browser-JS-User-Agent",
  "Gov-Client-Device-ID",
  "Gov-Client-Multi-Factor",
  "Gov-Client-Public-IP",
  "Gov-Client-Public-IP-Timestamp",
  "Gov-Client-Public-Port",
  "Gov-Client-Screens",
  "Gov-Client-Timezone",
  "Gov-Client-User-IDs",
  "Gov-Client-Window-Size",
  "Gov-Vendor-Forwarded",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Product-Name",
  "Gov-Vendor-Public-IP",
  "Gov-Vendor-Version",
] as const

export type HmrcVatFraudHeaderName = typeof hmrcVatFraudHeaderNames[number]

function encodedPairs(value: string) {
  if (!/^[A-Za-z0-9._~%+-]+=[A-Za-z0-9._~%+-]*(?:&[A-Za-z0-9._~%+-]+=[A-Za-z0-9._~%+-]*)*$/.test(value)
    || /%(?![0-9a-f]{2})/i.test(value)) return null
  const pairs = new Map<string, string>()
  try {
    for (const pair of value.split("&")) {
      const separator = pair.indexOf("=")
      const key = decodeURIComponent(pair.slice(0, separator))
      const item = decodeURIComponent(pair.slice(separator + 1))
      if (!key || pairs.has(key)) return null
      pairs.set(key, item)
    }
  } catch { return null }
  return pairs
}

function positiveWhole(value: string | undefined) {
  return value !== undefined && /^[1-9]\d{0,5}$/.test(value)
}

function ipAddress(value: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    const octets = value.split(".").map(Number)
    return octets.every((part) => part >= 0 && part <= 255)
      && octets[0] !== 0 && octets[0] !== 10 && octets[0] !== 127
      && octets[0] < 224 && !(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      && !(octets[0] === 192 && octets[1] === 168)
      && !(octets[0] === 169 && octets[1] === 254)
      && !(octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
  }
  if (!value.includes(":")) return false
  try {
    const url = new URL(`https://[${value}]/`)
    const address = url.hostname.toLowerCase()
    return address.startsWith("[") && address.endsWith("]")
      && address !== "[::]" && address !== "[::1]"
      && !/^\[(?:fc|fd|fe[89ab])/i.test(address)
  } catch { return false }
}

function structuredFraudHeadersValid(headers: Record<HmrcVatFraudHeaderName, string>) {
  const screens = headers["Gov-Client-Screens"].split(",").map(encodedPairs)
  const factors = headers["Gov-Client-Multi-Factor"].split(",").map(encodedPairs)
  const forwarded = headers["Gov-Vendor-Forwarded"].split(",").map(encodedPairs)
  const window = encodedPairs(headers["Gov-Client-Window-Size"])
  const users = encodedPairs(headers["Gov-Client-User-IDs"])
  const licenses = encodedPairs(headers["Gov-Vendor-License-IDs"])
  const versions = encodedPairs(headers["Gov-Vendor-Version"])
  const product = headers["Gov-Vendor-Product-Name"]
  if (!headers["Gov-Client-Browser-JS-User-Agent"].includes("/")
    || !ipAddress(headers["Gov-Client-Public-IP"])
    || !ipAddress(headers["Gov-Vendor-Public-IP"])
    || !screens.length || screens.some((screen) => !screen
      || !positiveWhole(screen.get("width")) || !positiveWhole(screen.get("height"))
      || !positiveWhole(screen.get("colour-depth"))
      || !screen.get("scaling-factor") || !/^\d+(?:\.\d+)?$/.test(screen.get("scaling-factor")!)
      || Number(screen.get("scaling-factor")) <= 0)
    || !window || !positiveWhole(window.get("width")) || !positiveWhole(window.get("height"))
    || !users || !users.size || [...users.values()].some((value) => !value)
    || !licenses || !licenses.size || [...licenses.values()].some((value) => !/^[a-f0-9]{32,128}$/i.test(value))
    || !versions || !versions.size || [...versions.values()].some((value) => !value)
    || !product || /%(?![0-9a-f]{2})/i.test(product)
    || !factors.length || factors.some((factor) => !factor
      || !["TOTP", "AUTH_CODE", "OTHER"].includes(factor.get("type") || "")
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(factor.get("timestamp") || "")
      || !Number.isFinite(Date.parse(factor.get("timestamp")!))
      || !factor.get("unique-reference"))
    || !forwarded.length || forwarded.some((hop) => !hop
      || !ipAddress(hop.get("by") || "") || !ipAddress(hop.get("for") || ""))
    || forwarded[0]?.get("by") !== headers["Gov-Vendor-Public-IP"]
    || forwarded[0]?.get("for") !== headers["Gov-Client-Public-IP"]
    || forwarded.some((hop, index) => index > 0 && hop?.get("for") !== forwarded[index - 1]?.get("by"))) return false
  return true
}

export function buildHmrcVatFraudHeaders(input: Partial<Record<HmrcVatFraudHeaderName, string>>) {
  const result: Record<HmrcVatFraudHeaderName, string> = {} as Record<HmrcVatFraudHeaderName, string>
  for (const name of hmrcVatFraudHeaderNames) {
    const value = input[name]
    if (typeof value !== "string" || value.trim().length < 1 || value.length > 2048
      || /[^\x20-\x7e]/.test(value)
      || /^(?:null|undefined|unknown|n\/a|not available)$/i.test(value.trim())) {
      throw new Error(`HMRC fraud-prevention data is missing or invalid: ${name}.`)
    }
    result[name] = value
  }
  if (result["Gov-Client-Connection-Method"] !== "WEB_APP_VIA_SERVER"
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result["Gov-Client-Device-ID"])
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result["Gov-Client-Public-IP-Timestamp"])
    || !Number.isFinite(Date.parse(result["Gov-Client-Public-IP-Timestamp"]))
    || new Date(result["Gov-Client-Public-IP-Timestamp"]).toISOString() !== result["Gov-Client-Public-IP-Timestamp"]
    || !/^[1-9]\d{0,4}$/.test(result["Gov-Client-Public-Port"])
    || Number(result["Gov-Client-Public-Port"]) > 65535
    || [80, 443].includes(Number(result["Gov-Client-Public-Port"]))
    || !/^UTC[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(result["Gov-Client-Timezone"])
    || !structuredFraudHeadersValid(result)) {
    throw new Error("HMRC fraud-prevention data has an invalid connection method, device, timestamp, port or timezone.")
  }
  return result
}

/** Backend-only protocol step. The caller must obtain the token and fraud values
 * from verified tenant, authentication and ingress state; this does not collect
 * those values or establish that HMRC accepts them. */
export async function requestHmrcVatObligations(input: {
  environment: HmrcVatEnvironment
  vrn: string
  from: string
  to: string
  status?: "O" | "F"
  accessToken: string
  fraudHeaders: Partial<Record<HmrcVatFraudHeaderName, string>>
}, send: typeof fetch): Promise<{ obligations: HmrcVatObligation[]; correlationId: string }> {
  const url = hmrcVatObligationsUrl(input)
  const fraudHeaders = buildHmrcVatFraudHeaders(input.fraudHeaders)
  if (!/^[\x21-\x7e]{10,8000}$/.test(input.accessToken) || /[\s]/.test(input.accessToken)) {
    throw new Error("HMRC VAT access authority is unavailable.")
  }
  const response = await send(url, {
    method: "GET",
    headers: {
      Accept: hmrcVatApiAccept,
      Authorization: `Bearer ${input.accessToken}`,
      ...fraudHeaders,
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error("HMRC VAT authority has expired or cannot read this registration.")
  }
  if (!response.ok) throw new Error(`HMRC VAT obligations could not be read (HTTP ${response.status}).`)
  const correlationId = response.headers.get("X-CorrelationId")
  if (!correlationId || !/^[\x21-\x7e]{36}$/.test(correlationId)) {
    throw new Error("HMRC VAT obligations response lacked a valid tracking reference.")
  }
  return { obligations: parseHmrcVatObligations(await response.json()), correlationId }
}

/** Keep the raw 200 response for the database's authoritative exact-value
 * comparison. A different return is evidence of a mismatch, not a parser
 * failure. A 404 remains inconclusive after an uncertain submission. */
export async function requestHmrcVatReturnReadbackEvidence(input: {
  environment: HmrcVatEnvironment
  vrn: string
  periodKey: string
  accessToken: string
  fraudHeaders: Partial<Record<HmrcVatFraudHeaderName, string>>
}, send: typeof fetch) {
  if ((input.environment !== "sandbox" && input.environment !== "production")
    || !/^\d{9}$/.test(input.vrn)
    || !/^(?:[A-Za-z0-9]{4}|#[A-Za-z0-9]{3})$/.test(input.periodKey)) {
    throw new Error("Choose a valid HMRC VAT return for readback.")
  }
  const headers = buildHmrcVatFraudHeaders(input.fraudHeaders)
  if (!/^[\x21-\x7e]{10,8000}$/.test(input.accessToken) || /[\s]/.test(input.accessToken)) {
    throw new Error("HMRC VAT access authority is unavailable.")
  }
  const origin = input.environment === "sandbox" ? "https://test-api.service.hmrc.gov.uk" : "https://api.service.hmrc.gov.uk"
  const periodKey = encodeURIComponent(input.periodKey)
  const response = await send(`${origin}/organisations/vat/${input.vrn}/returns/${periodKey}`, {
    method: "GET",
    headers: { Accept: hmrcVatApiAccept, Authorization: `Bearer ${input.accessToken}`, ...headers },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) {
    const correlationId = response.headers.get("X-CorrelationId")
    if (correlationId && !/^[\x21-\x7e]{36}$/.test(correlationId)) {
      throw new Error("HMRC VAT return readback had an invalid tracking reference.")
    }
    return { status: "not_found" as const, httpStatus: 404 as const,
      rawBody: null, correlationId }
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("HMRC VAT authority has expired or cannot read this registration.")
  }
  if (!response.ok) throw new Error(`HMRC VAT return could not be read (HTTP ${response.status}).`)
  const rawBody = await response.text()
  const correlationId = response.headers.get("X-CorrelationId")
  if (rawBody.length < 50 || rawBody.length > 8192
    || !correlationId || !/^[\x21-\x7e]{36}$/.test(correlationId)) {
    throw new Error("HMRC VAT return readback lacked bounded, traceable evidence.")
  }
  return { status: "observed" as const, httpStatus: 200 as const, rawBody, correlationId }
}

/** Local comparison is useful to consumers that hold an expected return; the
 * durable coordinator records raw evidence so SQL can retain mismatches. */
export async function requestHmrcVatReturnReadback(input: {
  environment: HmrcVatEnvironment
  vrn: string
  expected: HmrcVatReturnInput
  accessToken: string
  fraudHeaders: Partial<Record<HmrcVatFraudHeaderName, string>>
}, send: typeof fetch) {
  const evidence = await requestHmrcVatReturnReadbackEvidence({
    ...input, periodKey: input.expected.periodKey,
  }, send)
  if (evidence.status === "not_found") return { status: "not_found" as const }
  return { status: "matched" as const,
    readback: parseHmrcVatReturnReadbackText(evidence.rawBody, input.expected),
    rawBody: evidence.rawBody, correlationId: evidence.correlationId }
}

/** Call only after the database's one-way dispatch claim has committed. This
 * helper never retries a POST and never treats a non-201 response as proof that
 * HMRC did not receive it. The caller must persist every returned outcome. */
export async function requestHmrcVatSubmission(input: {
  environment: HmrcVatEnvironment
  vrn: string
  payloadBody: string
  accessToken: string
  fraudHeaders: Partial<Record<HmrcVatFraudHeaderName, string>>
}, send: typeof fetch): Promise<
  | { status: "accepted"; httpStatus: 201; receipt: HmrcVatSubmissionReceipt }
  | { status: "reconciliation_required"; kind: "network_failure" | "server_response" | "client_response" | "malformed_success" | "other"; httpStatus: number | null }
> {
  if ((input.environment !== "sandbox" && input.environment !== "production")
    || !/^\d{9}$/.test(input.vrn)
    || typeof input.payloadBody !== "string" || input.payloadBody.length < 100
    || input.payloadBody.length > 2000) {
    throw new Error("A claimed HMRC VAT submission payload is required.")
  }
  const headers = buildHmrcVatFraudHeaders(input.fraudHeaders)
  if (!/^[\x21-\x7e]{10,8000}$/.test(input.accessToken) || /[\s]/.test(input.accessToken)) {
    throw new Error("HMRC VAT access authority is unavailable.")
  }
  const origin = input.environment === "sandbox" ? "https://test-api.service.hmrc.gov.uk" : "https://api.service.hmrc.gov.uk"
  let response: Response
  try {
    response = await send(`${origin}/organisations/vat/${input.vrn}/returns`, {
      method: "POST",
      headers: {
        Accept: hmrcVatApiAccept,
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        ...headers,
      },
      body: input.payloadBody,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { status: "reconciliation_required", kind: "network_failure", httpStatus: null }
  }
  if (response.status === 201) {
    try {
      const receipt = parseHmrcVatSubmissionReceipt(await response.json(), response.headers)
      return { status: "accepted", httpStatus: 201, receipt }
    } catch {
      return { status: "reconciliation_required", kind: "malformed_success", httpStatus: 201 }
    }
  }
  return {
    status: "reconciliation_required",
    kind: response.status >= 500 ? "server_response" : response.status >= 400 ? "client_response" : "other",
    httpStatus: response.status,
  }
}
