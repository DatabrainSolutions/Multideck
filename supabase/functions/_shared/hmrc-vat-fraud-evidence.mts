import { collectHmrcVatTotpEvidence, collectHmrcVatUserIds, type AuthSource } from "./hmrc-vat-mfa.mts"
import { buildHmrcVatFraudHeaders } from "./hmrc-vat-oauth.mts"

// The ingress observation must be supplied by a deployment-specific adapter
// that has verified the header/transport provenance. This module checks
// coherence and freshness, but cannot turn an untrusted proxy header into a
// trusted network observation. No HMRC request route may call it until that
// adapter and the product-licence source have been established.
export type HmrcVatIngressObservation = {
  originatingPublicIp: string
  originatingPublicTcpSourcePort: number
  observedAt: string
  publicTlsHops: Array<{ receivedByPublicIp: string; sentByPublicIp: string }>
}

export type HmrcVatServerVendorEvidence = {
  productName: string
  licenseHashes: Record<string, string>
  versions: Record<string, string>
}

export type HmrcVatBrowserReport = {
  browserJsUserAgent: string
  deviceId: string
  screens: string
  timezone: string
  windowSize: string
}

function pairs(values: Record<string, string>, label: string) {
  const entries = values && typeof values === "object" && !Array.isArray(values)
    ? Object.entries(values) : []
  if (!entries.length || entries.length > 8 || entries.some(([key, value]) => !key || !value)) {
    throw new Error(`Verified HMRC ${label} evidence is unavailable.`)
  }
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")
}

export async function assembleHmrcVatFraudEvidence(input: {
  browser: HmrcVatBrowserReport
  auth: AuthSource
  jwt: string
  authUserId: string
  tenantProjectRef: string
  ingress: HmrcVatIngressObservation
  vendor: HmrcVatServerVendorEvidence
  now?: Date
}) {
  const now = input.now ?? new Date()
  const observed = Date.parse(input.ingress?.observedAt ?? "")
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(observed)
    || now.getTime() - observed > 120_000 || observed - now.getTime() > 5_000
    || !Number.isSafeInteger(input.ingress.originatingPublicTcpSourcePort)
    || input.ingress.originatingPublicTcpSourcePort < 1
    || input.ingress.originatingPublicTcpSourcePort > 65535
    || !Array.isArray(input.ingress.publicTlsHops)
    || input.ingress.publicTlsHops.length < 1 || input.ingress.publicTlsHops.length > 8) {
    throw new Error("Current verified HMRC ingress evidence is unavailable.")
  }
  const hops = input.ingress.publicTlsHops
  if (hops[0]?.sentByPublicIp !== input.ingress.originatingPublicIp
    || hops.some((hop, index) => !hop?.receivedByPublicIp || !hop.sentByPublicIp
      || (index > 0 && hop.sentByPublicIp !== hops[index - 1].receivedByPublicIp))) {
    throw new Error("HMRC ingress hop evidence is incomplete or inconsistent.")
  }
  if (!input.vendor?.productName || input.vendor.productName.length > 2048) {
    throw new Error("Verified HMRC vendor product evidence is unavailable.")
  }
  const licenses = pairs(input.vendor.licenseHashes, "vendor licence")
  const versions = pairs(input.vendor.versions, "vendor version")
  const [userIds, multiFactor] = await Promise.all([
    collectHmrcVatUserIds(input.auth, input.jwt, input.authUserId),
    collectHmrcVatTotpEvidence(input.auth, input.jwt, input.authUserId, input.tenantProjectRef, now),
  ])
  return buildHmrcVatFraudHeaders({
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": input.browser?.browserJsUserAgent,
    "Gov-Client-Device-ID": input.browser?.deviceId,
    "Gov-Client-Multi-Factor": multiFactor,
    "Gov-Client-Public-IP": input.ingress.originatingPublicIp,
    "Gov-Client-Public-IP-Timestamp": input.ingress.observedAt,
    "Gov-Client-Public-Port": String(input.ingress.originatingPublicTcpSourcePort),
    "Gov-Client-Screens": input.browser?.screens,
    "Gov-Client-Timezone": input.browser?.timezone,
    "Gov-Client-User-IDs": userIds,
    "Gov-Client-Window-Size": input.browser?.windowSize,
    "Gov-Vendor-Forwarded": hops.map((hop) =>
      `by=${encodeURIComponent(hop.receivedByPublicIp)}&for=${encodeURIComponent(hop.sentByPublicIp)}`).join(","),
    "Gov-Vendor-License-IDs": licenses,
    "Gov-Vendor-Product-Name": encodeURIComponent(input.vendor.productName),
    "Gov-Vendor-Public-IP": hops[0].receivedByPublicIp,
    "Gov-Vendor-Version": versions,
  })
}
