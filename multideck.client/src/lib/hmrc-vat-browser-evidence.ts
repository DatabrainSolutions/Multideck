// Browser-reported inputs for HMRC's WEB_APP_VIA_SERVER fraud headers.
// Network, MFA, tenant, user and vendor evidence must come from trusted server
// state when a VAT API route is implemented. This module cannot authorise a call.
const storageKey = "multideck.hmrc.vat.device-id.v1"
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type BrowserSource = {
  userAgent: string
  screenWidth: number
  screenHeight: number
  colourDepth: number
  scalingFactor: number
  windowWidth: number
  windowHeight: number
  timezoneOffsetMinutes: number
  storage: Pick<Storage, "getItem" | "setItem">
  randomUUID: () => string
}

export type HmrcVatBrowserEvidence = {
  browserJsUserAgent: string
  deviceId: string
  screens: string
  timezone: string
  windowSize: string
}

function positiveWhole(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000
}

function encodePairs(pairs: Record<string, string>) {
  return Object.entries(pairs).map(([key, value]) =>
    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")
}

export function formatHmrcVatBrowserEvidence(source: BrowserSource): HmrcVatBrowserEvidence {
  if (!source.userAgent || source.userAgent.length > 2048
    || /[^\x20-\x7e]/.test(source.userAgent)
    || !positiveWhole(source.screenWidth) || !positiveWhole(source.screenHeight)
    || !positiveWhole(source.colourDepth)
    || !Number.isFinite(source.scalingFactor) || source.scalingFactor <= 0
    || source.scalingFactor > 100
    || !positiveWhole(source.windowWidth) || !positiveWhole(source.windowHeight)
    || !Number.isInteger(source.timezoneOffsetMinutes)
    || Math.abs(source.timezoneOffsetMinutes) > 23 * 60 + 59) {
    throw new Error("HMRC browser device information is unavailable.")
  }
  const offset = -source.timezoneOffsetMinutes
  const sign = offset >= 0 ? "+" : "-"
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0")
  let deviceId: string
  try {
    const existing = source.storage.getItem(storageKey)
    deviceId = existing && uuidPattern.test(existing) ? existing : source.randomUUID()
    if (!uuidPattern.test(deviceId)) throw new Error("Invalid device ID")
    if (deviceId !== existing) source.storage.setItem(storageKey, deviceId)
  } catch {
    throw new Error("HMRC browser device ID could not be retained.")
  }
  return {
    browserJsUserAgent: source.userAgent,
    deviceId,
    screens: encodePairs({
      width: String(source.screenWidth),
      height: String(source.screenHeight),
      "scaling-factor": String(source.scalingFactor),
      "colour-depth": String(source.colourDepth),
    }),
    timezone: `UTC${sign}${hours}:${minutes}`,
    windowSize: encodePairs({
      width: String(source.windowWidth),
      height: String(source.windowHeight),
    }),
  }
}

export function collectHmrcVatBrowserEvidence(): HmrcVatBrowserEvidence {
  if (typeof window === "undefined" || typeof navigator === "undefined"
    || typeof screen === "undefined" || typeof localStorage === "undefined"
    || typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("HMRC browser device information is unavailable.")
  }
  return formatHmrcVatBrowserEvidence({
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colourDepth: screen.colorDepth,
    scalingFactor: window.devicePixelRatio,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    storage: localStorage,
    randomUUID: () => crypto.randomUUID(),
  })
}
