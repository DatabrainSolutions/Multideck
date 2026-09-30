import assert from "node:assert/strict"
import test from "node:test"
import { requestHmrcVatFraudFeedback, requestHmrcVatFraudValidation } from "../functions/_shared/hmrc-vat-fraud-validation.mts"

const headers = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Test Browser)",
  "Gov-Client-Device-ID": "beec798b-b366-47fa-b1f8-92cede14a1ce",
  "Gov-Client-Multi-Factor": `type=TOTP&timestamp=2026-09-24T10%3A20Z&unique-reference=${"a".repeat(64)}`,
  "Gov-Client-Public-IP": "8.8.8.8",
  "Gov-Client-Public-IP-Timestamp": "2026-09-24T10:20:30.000Z",
  "Gov-Client-Public-Port": "12345",
  "Gov-Client-Screens": "width=1920&height=1080&scaling-factor=1.25&colour-depth=24",
  "Gov-Client-Timezone": "UTC+03:00",
  "Gov-Client-User-IDs": "multideck=operator-1&login=ops%40example.com",
  "Gov-Client-Window-Size": "width=1280&height=720",
  "Gov-Vendor-Forwarded": "by=1.1.1.1&for=8.8.8.8",
  "Gov-Vendor-License-IDs": `multideck=${"b".repeat(64)}`,
  "Gov-Vendor-Product-Name": "Multideck",
  "Gov-Vendor-Public-IP": "1.1.1.1",
  "Gov-Vendor-Version": "multideck=1.0.0",
}
const credentials = { clientId: "sandbox-app-id", clientSecret: "sandbox-secret", fraudHeaders: headers }

test("sandbox validator obtains an application token and sends every fraud header without a VAT consent token", async () => {
  const calls = []
  const send = async (url, init) => {
    calls.push({ url, init })
    return calls.length === 1
      ? Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 })
      : Response.json({ specVersion: "3.1", code: "VALID_HEADERS",
        message: "All headers appear to be valid" })
  }
  const result = await requestHmrcVatFraudValidation(credentials, send)
  assert.deepEqual(result, { specVersion: "3.1", code: "VALID_HEADERS",
    errors: [], warnings: [], formatAppearsValid: true })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, "https://test-api.service.hmrc.gov.uk/oauth/token")
  assert.equal(calls[0].init.method, "POST")
  assert.equal(calls[0].init.body.get("grant_type"), "client_credentials")
  assert.equal(calls[0].init.body.get("scope"), null)
  assert.equal(calls[1].url, "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate")
  assert.equal(calls[1].init.method, "GET")
  assert.equal(calls[1].init.headers.Accept, "application/vnd.hmrc.1.0+json")
  assert.equal(calls[1].init.headers.Authorization, "Bearer application-token")
  assert.equal(calls[1].init.headers["Gov-Client-Public-Port"], "12345")
  assert.equal(JSON.stringify(result).includes("application-token"), false)
  assert.equal(JSON.stringify(result).includes("8.8.8.8"), false)
})

test("malformed fraud evidence stops before obtaining application authority", async () => {
  let calls = 0
  await assert.rejects(requestHmrcVatFraudValidation({ ...credentials,
    fraudHeaders: { ...headers, "Gov-Client-Public-Port": "443" },
  }, async () => { calls++; throw new Error("network should not be called") }), /invalid connection method/)
  assert.equal(calls, 0)
})

test("validator errors and advisories remain blocking and expose no raw values", async () => {
  const responses = [
    Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 }),
    Response.json({ specVersion: "3.1", code: "INVALID_HEADERS", message: "raw details",
      errors: [{ code: "INVALID_HEADER", message: "received private value 8.8.8.8",
        headers: ["gov-client-public-ip"] }],
      warnings: [{ code: "POTENTIALLY_INVALID_HEADER", message: "raw browser details",
        headers: ["gov-client-browser-js-user-agent"] }] }),
  ]
  const result = await requestHmrcVatFraudValidation(credentials, async () => responses.shift())
  assert.equal(result.formatAppearsValid, false)
  assert.deepEqual(result.errors, [{ code: "INVALID_HEADER", headers: ["gov-client-public-ip"] }])
  assert.deepEqual(result.warnings, [{ code: "POTENTIALLY_INVALID_HEADER",
    headers: ["gov-client-browser-js-user-agent"] }])
  assert.equal(JSON.stringify(result).includes("raw"), false)
  await assert.rejects(requestHmrcVatFraudValidation(credentials, async (_url, init) =>
    init.method === "POST"
      ? Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 })
      : Response.json({ specVersion: "3.1", code: "VALID_HEADERS",
        warnings: [{ code: "POTENTIALLY_INVALID_HEADER", headers: ["gov-client-public-ip"] }] })),
  /contradictory/)
})

test("authentication failures and unrecognised provider payloads fail closed", async () => {
  await assert.rejects(requestHmrcVatFraudValidation(credentials, async () =>
    Response.json({ error: "invalid_client", client_secret: "leaked" }, { status: 401 })),
  /application authority failed \(HTTP 401\)/)
  await assert.rejects(requestHmrcVatFraudValidation(credentials, async (_url, init) =>
    init.method === "POST"
      ? Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 })
      : Response.json({ specVersion: "3.1", code: "INVALID_HEADERS",
        errors: [{ code: "INVALID_HEADER", headers: ["outside-header"], value: "private" }] })),
  /response is invalid/)
})

test("sandbox feedback strips VAT numbers, tokens, header values and free-text messages", async () => {
  const calls = []
  const feedback = { requests: [{ path: "/organisations/vat/123456789/obligations",
    method: "GET", requestTimestamp: "2026-09-25T09:30:00.000Z", code: "VALID_HEADERS",
    headers: Object.keys(headers).map((header) => ({ header: header.toLowerCase(),
      value: headers[header], code: "VALID_HEADER", errors: [], warnings: [] })),
    crossValidation: [{ headers: ["gov-client-public-ip", "gov-vendor-forwarded"],
      code: "VALID_HEADERS", errors: [] }] }] }
  const send = async (url, init) => {
    calls.push({ url, init })
    return init.method === "POST"
      ? Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 })
      : Response.json(feedback)
  }
  const result = await requestHmrcVatFraudFeedback(credentials, send)
  assert.equal(calls[1].url, "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/vat-mtd/validation-feedback?connectionMethod=WEB_APP_VIA_SERVER")
  assert.equal(result.allReportedRequestsAppearValid, true)
  assert.equal(result.requests[0].endpoint, "obligations")
  assert.equal(result.requests[0].headerStatuses.length, 16)
  assert.equal(JSON.stringify(result).includes("123456789"), false)
  assert.equal(JSON.stringify(result).includes("application-token"), false)
  assert.equal(JSON.stringify(result).includes("8.8.8.8"), false)
})

test("missing or invalid sandbox feedback never becomes a green gate", async () => {
  const token = () => Response.json({ access_token: "application-token", token_type: "bearer", expires_in: 14400 })
  const empty = await requestHmrcVatFraudFeedback(credentials, async (_url, init) =>
    init.method === "POST" ? token() : Response.json({ requests: [] }))
  assert.equal(empty.allReportedRequestsAppearValid, false)
  const missing = await requestHmrcVatFraudFeedback(credentials, async (_url, init) =>
    init.method === "POST" ? token() : Response.json({ requests: [{
      path: "/organisations/vat/123456789/returns", method: "POST",
      requestTimestamp: "2026-09-25T09:30:00.000Z", code: "INVALID_HEADERS",
      headers: [{ header: "gov-client-public-port", code: "MISSING_HEADER",
        errors: ["Client port absent"], warnings: [] }], crossValidation: [],
    }] }))
  assert.equal(missing.allReportedRequestsAppearValid, false)
  assert.deepEqual(missing.requests[0].headerStatuses,
    [{ header: "gov-client-public-port", code: "MISSING_HEADER" }])
  await assert.rejects(requestHmrcVatFraudFeedback(credentials, async (_url, init) =>
    init.method === "POST" ? token() : Response.json({ requests: [{
      path: "/organisations/vat/123456789/returns", method: "POST",
      requestTimestamp: "2026-09-25T09:30:00.000Z", code: "INVALID_HEADERS",
      headers: [{ header: "raw secret", code: "INVALID_HEADER" }], crossValidation: [],
    }] })), /feedback is invalid/)
})
