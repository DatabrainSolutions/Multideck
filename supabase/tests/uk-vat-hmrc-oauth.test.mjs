import assert from "node:assert/strict"
import test from "node:test"
import { buildHmrcVatFraudHeaders, hmrcVatApiAccept, hmrcVatAuthorisationUrl, hmrcVatCodeExchangeBody, hmrcVatEndpoints, hmrcVatFraudHeaderNames, hmrcVatObligationsUrl, hmrcVatRefreshBody, matchOpenHmrcVatObligation, parseHmrcVatObligations, parseHmrcVatSubmissionReceipt, parseHmrcVatToken, requestHmrcVatObligations, requestHmrcVatReturnReadback, requestHmrcVatSubmission } from "../functions/_shared/hmrc-vat-oauth.mts"

test("HMRC consent opens only the environment-specific HMRC site with state and PKCE", () => {
  const url = new URL(hmrcVatAuthorisationUrl({ environment: "sandbox", clientId: "client-id", redirectUri: "https://tenant.example/callback", state: "opaque-state", codeChallenge: "challenge" }))
  assert.equal(url.origin, "https://test-www.tax.service.gov.uk")
  assert.equal(url.searchParams.get("scope"), "read:vat write:vat")
  assert.equal(url.searchParams.get("state"), "opaque-state")
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.equal(url.searchParams.has("client_secret"), false)
  assert.equal(hmrcVatEndpoints("production").token, "https://api.service.hmrc.gov.uk/oauth/token")
})

test("code exchange keeps the client secret and verifier in a server-side form body", () => {
  const body = hmrcVatCodeExchangeBody({ clientId: "id", clientSecret: "server-secret", redirectUri: "https://tenant.example/callback", code: "single-use-code", verifier: "verifier" })
  assert.equal(body.get("grant_type"), "authorization_code")
  assert.equal(body.get("client_secret"), "server-secret")
  assert.equal(body.get("code_verifier"), "verifier")
})

test("token validation requires a bounded, renewable VAT grant", () => {
  const valid = { access_token: "access-token-123", refresh_token: "refresh-token-456", token_type: "bearer", expires_in: 14400, scope: "write:vat read:vat" }
  assert.deepEqual(parseHmrcVatToken(valid), { bundle: { access_token: valid.access_token, refresh_token: valid.refresh_token, token_type: "bearer" }, expiresIn: 14400, scope: "read:vat write:vat" })
  assert.throws(() => parseHmrcVatToken({ ...valid, refresh_token: "" }), /renewable VAT authority/)
  assert.throws(() => parseHmrcVatToken({ ...valid, scope: "read:vat" }), /requested scope/)
  assert.throws(() => parseHmrcVatToken({ ...valid, expires_in: 86400 }), /renewable VAT authority/)
})

test("refresh keeps the single-use token server-side and accepts an omitted scope", () => {
  const body = hmrcVatRefreshBody({ clientId: "id", clientSecret: "server-secret", refreshToken: "single-use-token" })
  assert.equal(body.get("grant_type"), "refresh_token")
  assert.equal(body.get("refresh_token"), "single-use-token")
  assert.equal(body.get("client_secret"), "server-secret")
  const valid = { access_token: "new-access-token", refresh_token: "new-refresh-token", token_type: "bearer", expires_in: 14400 }
  assert.equal(parseHmrcVatToken(valid, { allowMissingScope: true }).scope, "read:vat write:vat")
  assert.throws(() => parseHmrcVatToken(valid), /requested scope/)
  assert.throws(() => parseHmrcVatToken({ ...valid, scope: "read:vat" }, { allowMissingScope: true }), /requested scope/)
})

test("VAT obligation requests use the correct HMRC environment, VRN and bounded dates", () => {
  const url = new URL(hmrcVatObligationsUrl({ environment: "sandbox", vrn: "123456789", from: "2026-07-01", to: "2026-09-30", status: "O" }))
  assert.equal(url.origin, "https://test-api.service.hmrc.gov.uk")
  assert.equal(url.pathname, "/organisations/vat/123456789/obligations")
  assert.equal(url.searchParams.get("from"), "2026-07-01")
  assert.equal(url.searchParams.get("status"), "O")
  assert.equal(hmrcVatApiAccept, "application/vnd.hmrc.1.0+json")
  assert.equal(new URL(hmrcVatObligationsUrl({ environment: "production", vrn: "123456789", from: "2026-07-01", to: "2026-09-30" })).origin, "https://api.service.hmrc.gov.uk")
  assert.throws(() => hmrcVatObligationsUrl({ environment: "sandbox", vrn: "123456789", from: "2025-01-01", to: "2026-09-30" }), /valid VAT registration/)
  assert.throws(() => hmrcVatObligationsUrl({ environment: "sandbox", vrn: "12345678/", from: "2026-07-01", to: "2026-09-30" }), /valid VAT registration/)
  assert.throws(() => hmrcVatObligationsUrl({ environment: "unexpected", vrn: "123456789", from: "2026-07-01", to: "2026-09-30" }), /valid VAT registration/)
})

test("only one exact open HMRC obligation can supply a VAT period key", () => {
  const obligations = parseHmrcVatObligations({ obligations: [
    { start: "2026-04-01", end: "2026-06-30", due: "2026-08-07", status: "F", periodKey: "26A1", received: "2026-08-05" },
    { start: "2026-07-01", end: "2026-09-30", due: "2026-11-07", status: "O", periodKey: "#002" },
  ] })
  assert.equal(matchOpenHmrcVatObligation(obligations, "2026-07-01", "2026-09-30").periodKey, "#002")
  assert.throws(() => matchOpenHmrcVatObligation(obligations, "2026-07-01", "2026-09-29"), /exactly one open/)
  assert.throws(() => matchOpenHmrcVatObligation(obligations, "2026-04-01", "2026-06-30"), /exactly one open/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [...obligations, { ...obligations[1], start: "2026-10-01" }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[1], start: "2026-02-30" }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[1], periodKey: "../other" }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[1], periodKey: "#2" }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[1], periodKey: "##02" }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[0], received: undefined }] }), /invalid/)
  assert.throws(() => parseHmrcVatObligations({ obligations: [{ ...obligations[1], received: "2026-10-01" }] }), /invalid/)
})

test("HMRC 201 receipt requires a form bundle and traceable response references", () => {
  const payload = { processingDate: "2026-09-24T10:20:30.000+0000", formBundleNumber: "256660290587", paymentIndicator: "DD", chargeRefNumber: "aCxFaNx0FZsCvyWF" }
  const headers = new Headers({
    "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435",
    "Receipt-ID": "2dd537bc-4244-4ebf-bac9-96321be13cdc",
    "Receipt-Timestamp": "2026-09-24T10:20:30Z",
  })
  assert.equal(parseHmrcVatSubmissionReceipt(payload, headers).formBundleNumber, "256660290587")
  assert.equal(parseHmrcVatSubmissionReceipt(payload, headers).receiptId, "2dd537bc-4244-4ebf-bac9-96321be13cdc")
  assert.throws(() => parseHmrcVatSubmissionReceipt({ ...payload, formBundleNumber: "123" }, headers), /receipt is invalid/)
  assert.throws(() => parseHmrcVatSubmissionReceipt({ ...payload, paymentIndicator: "OTHER" }, headers), /receipt is invalid/)
  assert.throws(() => parseHmrcVatSubmissionReceipt(payload, new Headers()), /receipt is invalid/)
})

const validFraudHeaders = {
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

test("VAT API fraud headers fail closed on missing, placeholder and malformed data", () => {
  const headers = validFraudHeaders
  assert.equal(Object.keys(buildHmrcVatFraudHeaders(headers)).length, 16)
  assert.deepEqual(Object.keys(headers).sort(), [...hmrcVatFraudHeaderNames].sort())
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Public-Port": "" }), /Gov-Client-Public-Port/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Multi-Factor": "unknown" }), /Gov-Client-Multi-Factor/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Public-Port": "443".repeat(3) }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Public-Port": "443" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Public-IP": "192.168.1.2" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Public-IP": "::ffff:192.168.1.2" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Vendor-Public-IP": "::ffff:127.0.0.1" }), /invalid connection method/)
  assert.equal(buildHmrcVatFraudHeaders({
    ...headers,
    "Gov-Client-Public-IP": "::ffff:8.8.8.8",
    "Gov-Vendor-Forwarded": "by=1.1.1.1&for=%3A%3Affff%3A8.8.8.8",
  })["Gov-Client-Public-IP"], "::ffff:8.8.8.8")
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Screens": "sample-value" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Window-Size": "width=0&height=720" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Vendor-Forwarded": "by=1.1.1.1&for=9.9.9.9" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Vendor-Version": "sample-value" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Vendor-License-IDs": "multideck=not-a-hash" }), /invalid connection method/)
  assert.throws(() => buildHmrcVatFraudHeaders({ ...headers, "Gov-Client-Browser-JS-User-Agent": "agent\r\nAuthorization: leaked" }), /Gov-Client-Browser-JS-User-Agent/)
})

test("backend obligation read sends the exact VAT request and keeps tokens out of failures", async () => {
  const calls = []
  const send = async (url, init) => {
    calls.push({ url, init })
    return Response.json({ obligations: [{ start: "2026-07-01", end: "2026-09-30", due: "2026-11-07", status: "O", periodKey: "26B1" }] }, {
      headers: { "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435" },
    })
  }
  const input = {
    environment: "sandbox", vrn: "123456789", from: "2026-07-01", to: "2026-09-30", status: "O",
    accessToken: "opaque-access-token", fraudHeaders: validFraudHeaders,
  }
  const result = await requestHmrcVatObligations(input, send)
  assert.equal(result.obligations[0].periodKey, "26B1")
  assert.equal(result.correlationId, "c75f40a6-a3df-4429-a697-471eeec46435")
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).origin, "https://test-api.service.hmrc.gov.uk")
  assert.equal(calls[0].init.method, "GET")
  assert.equal(calls[0].init.redirect, "error")
  assert.equal(calls[0].init.headers.Accept, hmrcVatApiAccept)
  assert.equal(calls[0].init.headers.Authorization, "Bearer opaque-access-token")
  assert.equal(calls[0].init.headers["Gov-Client-Public-Port"], "12345")
  await assert.rejects(() => requestHmrcVatObligations({ ...input, fraudHeaders: { ...validFraudHeaders, "Gov-Client-Public-Port": "443" } }, send), /fraud-prevention data/)
  assert.equal(calls.length, 1)
  await assert.rejects(() => requestHmrcVatObligations({ ...input, accessToken: "bad\r\ntoken" }, send), /authority is unavailable/)
  assert.equal(calls.length, 1)
  await assert.rejects(() => requestHmrcVatObligations(input, async () => new Response("denied", { status: 401 })), (error) => !error.message.includes(input.accessToken) && /authority has expired/.test(error.message))
  await assert.rejects(() => requestHmrcVatObligations(input, async () => Response.json({ obligations: [{ periodKey: "../invalid" }] }, {
    headers: { "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435" },
  })), /obligation is invalid/)
  await assert.rejects(() => requestHmrcVatObligations(input, async () => Response.json({ obligations: [] })), /tracking reference/)
  await assert.rejects(() => requestHmrcVatObligations(input, async () => Response.json({ obligations: [] }, {
    headers: { "X-CorrelationId": "invalid-reference" },
  })), /tracking reference/)
})

test("VAT return readback encodes hash keys and treats 404 as inconclusive", async () => {
  const expected = { periodKey: "#001", declarationConfirmed: true, boxes: {
    1: "15.00", 2: "0.00", 3: "15.00", 4: "8.00", 5: "7.00",
    6: "125.00", 7: "50.00", 8: "0.00", 9: "0.00",
  } }
  const input = { environment: "sandbox", vrn: "123456789", expected,
    accessToken: "opaque-access-token", fraudHeaders: validFraudHeaders }
  const calls = []
  const result = await requestHmrcVatReturnReadback(input, async (url, init) => {
    calls.push({ url, init })
    return Response.json({ periodKey: "#001", vatDueSales: 15, vatDueAcquisitions: 0,
      totalVatDue: 15, vatReclaimedCurrPeriod: 8, netVatDue: 7,
      totalValueSalesExVAT: 125, totalValuePurchasesExVAT: 50,
      totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0 }, {
      headers: { "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435" },
    })
  })
  assert.equal(result.status, "matched")
  assert.equal(calls[0].url, "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns/%23001")
  assert.equal(calls[0].init.method, "GET")
  assert.equal(calls[0].init.headers["Gov-Client-Public-Port"], "12345")
  assert.deepEqual(await requestHmrcVatReturnReadback(input, async () => new Response(null, { status: 404 })), { status: "not_found" })
  await assert.rejects(() => requestHmrcVatReturnReadback(input, async () => Response.json({ periodKey: "#001", vatDueSales: 14,
    vatDueAcquisitions: 0, totalVatDue: 15, vatReclaimedCurrPeriod: 8, netVatDue: 7,
    totalValueSalesExVAT: 125, totalValuePurchasesExVAT: 50,
    totalValueGoodsSuppliedExVAT: 0, totalAcquisitionsExVAT: 0 }, {
    headers: { "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435" },
  })), /differs from the submitted return/)
  await assert.rejects(() => requestHmrcVatReturnReadback({ ...input, fraudHeaders: {} }, async () => { throw new Error("sent") }), /fraud-prevention data/)
})

test("VAT submit uses one POST and keeps every non-confirmed result blocked", async () => {
  const payloadBody = '{"periodKey":"#001","vatDueSales":15.00,"vatDueAcquisitions":0.00,"totalVatDue":15.00,"vatReclaimedCurrPeriod":8.00,"netVatDue":7.00,"totalValueSalesExVAT":125.00,"totalValuePurchasesExVAT":50.00,"totalValueGoodsSuppliedExVAT":0.00,"totalAcquisitionsExVAT":0.00,"finalised":true}'
  const input = { environment: "sandbox", vrn: "123456789", payloadBody,
    accessToken: "opaque-access-token", fraudHeaders: validFraudHeaders }
  const calls = []
  const receiptHeaders = {
    "X-CorrelationId": "c75f40a6-a3df-4429-a697-471eeec46435",
    "Receipt-ID": "2dd537bc-4244-4ebf-bac9-96321be13cdc",
    "Receipt-Timestamp": "2026-09-24T10:20:30Z",
  }
  const accepted = await requestHmrcVatSubmission(input, async (url, init) => {
    calls.push({ url, init })
    return Response.json({ processingDate: "2026-09-24T10:20:30.000+0000",
      formBundleNumber: "256660290587" }, { status: 201, headers: receiptHeaders })
  })
  assert.equal(accepted.status, "accepted")
  assert.equal(accepted.receipt.formBundleNumber, "256660290587")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns")
  assert.equal(calls[0].init.method, "POST")
  assert.equal(calls[0].init.redirect, "error")
  assert.equal(calls[0].init.body, payloadBody)
  assert.equal(calls[0].init.headers.Accept, hmrcVatApiAccept)
  assert.equal(calls[0].init.headers.Authorization, "Bearer opaque-access-token")
  assert.equal(calls[0].init.headers["Gov-Client-Public-Port"], "12345")
  assert.deepEqual(await requestHmrcVatSubmission(input, async () => new Response(null, { status: 400 })),
    { status: "reconciliation_required", kind: "client_response", httpStatus: 400 })
  assert.deepEqual(await requestHmrcVatSubmission(input, async () => new Response(null, { status: 503 })),
    { status: "reconciliation_required", kind: "server_response", httpStatus: 503 })
  assert.deepEqual(await requestHmrcVatSubmission(input, async () => { throw new Error("timeout") }),
    { status: "reconciliation_required", kind: "network_failure", httpStatus: null })
  assert.deepEqual(await requestHmrcVatSubmission(input, async () => Response.json({}, { status: 201 })),
    { status: "reconciliation_required", kind: "malformed_success", httpStatus: 201 })
  await assert.rejects(() => requestHmrcVatSubmission({ ...input, fraudHeaders: {} }, async () => { throw new Error("sent") }), /fraud-prevention data/)
})
