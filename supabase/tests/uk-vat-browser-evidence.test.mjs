import assert from "node:assert/strict"
import test from "node:test"
import { collectHmrcVatBrowserEvidence, formatHmrcVatBrowserEvidence } from "../../multideck.client/src/lib/hmrc-vat-browser-evidence.ts"
import { buildHmrcVatFraudHeaders } from "../functions/_shared/hmrc-vat-oauth.mts"

const first = "beec798b-b366-47fa-b1f8-92cede14a1ce"
const second = "631d7ea9-c5c9-4323-b271-e1da2cd2c44e"

function browser(overrides = {}) {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  return {
    values,
    source: {
      userAgent: "Mozilla/5.0 (Test Browser)",
      screenWidth: 1920, screenHeight: 1080, colourDepth: 24,
      scalingFactor: 1.25, windowWidth: 1280, windowHeight: 720,
      timezoneOffsetMinutes: -180, storage, randomUUID: () => first,
      ...overrides,
    },
  }
}

test("HMRC browser evidence retains one device ID and reports current screen, window and timezone", () => {
  const { source, values } = browser()
  const initial = formatHmrcVatBrowserEvidence(source)
  assert.equal(initial.deviceId, first)
  assert.equal(initial.timezone, "UTC+03:00")
  assert.equal(initial.screens, "width=1920&height=1080&scaling-factor=1.25&colour-depth=24")
  assert.equal(initial.windowSize, "width=1280&height=720")
  assert.equal(values.size, 1)
  assert.equal(formatHmrcVatBrowserEvidence({ ...source, randomUUID: () => second }).deviceId, first)
  assert.equal(formatHmrcVatBrowserEvidence({ ...source, timezoneOffsetMinutes: 345 }).timezone, "UTC-05:45")
  const checked = buildHmrcVatFraudHeaders({
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": initial.browserJsUserAgent,
    "Gov-Client-Device-ID": initial.deviceId,
    "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-09-24T10%3A20Z&unique-reference=" + "a".repeat(64),
    "Gov-Client-Public-IP": "8.8.8.8",
    "Gov-Client-Public-IP-Timestamp": "2026-09-24T10:20:30.000Z",
    "Gov-Client-Public-Port": "12345",
    "Gov-Client-Screens": initial.screens,
    "Gov-Client-Timezone": initial.timezone,
    "Gov-Client-User-IDs": "multideck=operator-1",
    "Gov-Client-Window-Size": initial.windowSize,
    "Gov-Vendor-Forwarded": "by=1.1.1.1&for=8.8.8.8",
    "Gov-Vendor-License-IDs": "multideck=" + "b".repeat(64),
    "Gov-Vendor-Product-Name": "Multideck",
    "Gov-Vendor-Public-IP": "1.1.1.1",
    "Gov-Vendor-Version": "multideck=1.0.0",
  })
  assert.equal(checked["Gov-Client-Device-ID"], first)
})

test("HMRC browser evidence fails closed when source data or persistent storage is unavailable", () => {
  const { source } = browser()
  assert.throws(() => collectHmrcVatBrowserEvidence(), /unavailable/)
  assert.throws(() => formatHmrcVatBrowserEvidence({ ...source, windowWidth: 0 }), /unavailable/)
  assert.throws(() => formatHmrcVatBrowserEvidence({ ...source, userAgent: "agent\r\nInjected: yes" }), /unavailable/)
  assert.throws(() => formatHmrcVatBrowserEvidence({ ...source, scalingFactor: Number.NaN }), /unavailable/)
  assert.throws(() => formatHmrcVatBrowserEvidence({ ...source, storage: {
    getItem: () => { throw new Error("blocked") },
    setItem: () => undefined,
  } }), /could not be retained/)
  assert.throws(() => formatHmrcVatBrowserEvidence({ ...source, randomUUID: () => "bad-id" }), /could not be retained/)
})
