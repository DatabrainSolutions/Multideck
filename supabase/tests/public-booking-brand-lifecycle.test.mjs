import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`)
}
const { publicBrandTheme, readableInk } = await load("../../multideck.client/src/lib/public-brand-theme.ts")
const { startPublicBrandRefresh } = await load("../../multideck.client/src/lib/public-brand-refresh.ts")
const { readConfiguredTenantBrand, DEFAULT_TENANT_BRAND } = await load("../functions/_shared/tenant-branding.ts")
const brand = { displayName: "Jenkar Shipping", logoUrl: "https://assets.example/logo.svg", primaryColor: "#FFB800", secondaryColor: "#316FAB", backgroundColor: "#101214", surfaceColor: "#202428", textColor: "#FFFFFF", appearanceMode: "dark", cornerStyle: "sharp", emailSignOff: "" }

test("adding, changing and removing a brand resets every public theme role", () => {
  const fallback = publicBrandTheme(null)
  const themed = publicBrandTheme(brand)
  assert.equal(themed["--brand-accent"], brand.primaryColor)
  assert.equal(themed["--brand-secondary"], brand.secondaryColor)
  assert.equal(themed["--brand-bg"], brand.backgroundColor)
  assert.equal(themed["--brand-surface"], brand.surfaceColor)
  assert.equal(themed["--brand-ink"], brand.textColor)
  assert.equal(themed["--brand-control-radius"], "0px")
  assert.equal(themed.colorScheme, "dark")
  assert.equal(themed["--brand-accent-ink"], "#0b1413")
  const changed = publicBrandTheme({ ...brand, primaryColor: "#112255", cornerStyle: "rounded", appearanceMode: "light" })
  assert.equal(changed["--brand-accent-ink"], "#ffffff")
  assert.equal(changed["--brand-control-radius"], "10px")
  assert.deepEqual({ ...themed, ...publicBrandTheme(null) }, fallback)
  assert.equal(fallback["--brand-bg"], "#ffffff")
  assert.equal(fallback["--brand-accent"], "#0E7D74")
  assert.equal(fallback.colorScheme, "light")
})

test("malformed colours use safe defaults and mid-tone buttons have readable text", () => {
  const result = publicBrandTheme({ ...brand, primaryColor: "url(bad)", backgroundColor: "", surfaceColor: "invalid", textColor: "invalid" })
  assert.equal(result["--brand-accent"], "#0E7D74")
  assert.equal(result["--brand-bg"], "#ffffff")
  assert.equal(result["--brand-surface"], "#ffffff")
  assert.equal(readableInk("#888888"), "#0b1413")
})

test("booking and attendee pages refresh only branding and use a recoverable bounded logo", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
  for (const page of ["public-booking-page", "meeting-manage-page"]) {
    const source = await read(`../../multideck.client/src/pages/${page}.tsx`)
    assert.match(source, /startPublicBrandRefresh\(/)
    assert.match(source, /\{ \.\.\.current, branding \}/)
    assert.match(source, /<PublicBrandIdentity key=\{brand\?\.logoUrl \?\? "no-logo"\} brand=\{brand\}/)
  }
  const identity = await read("../../multideck.client/src/components/multideck/public-brand-identity.tsx")
  assert.match(identity, /onError=\{\(\) => setFailedUrl\(logo\)\}/)
  assert.match(identity, /max-h-11 min-w-0 max-w-full object-contain/)
  assert.match(identity, /brand\.displayName/)
  assert.match(identity, /alt="Multideck"/)
  const booking = await read("../../multideck.client/src/pages/public-booking-page.tsx")
  assert.match(booking, /const email = event\.currentTarget\.value; setDetails/)
  assert.match(booking, /brandTheme=\{scope\}/)
  const api = await read("../../multideck.client/src/lib/calendar-api.ts")
  assert.match(api, /cache: "no-store"/)
  assert.match(api, /AbortSignal\.timeout\(20_000\)/)
  const backend = await read("../functions/calendar-public/index.ts")
  assert.match(backend, /"Cache-Control", "private, no-store, max-age=0"/)
  assert.match(backend, /readConfiguredTenantBrand\(admin, companyId\)/)
})

test("server reads resolve the current company brand, including reset, deletion and logo replacement", async () => {
  let current = null
  const queries = []
  const query = { select() { return this }, eq(key, value) { queries.push([key, value]); return this }, order() { return this }, limit() { return this }, async maybeSingle() { return { data: current, error: null } } }
  const admin = { from(table) { assert.equal(table, "cmp_Brands"); return query }, storage: { from() { return { getPublicUrl(path) { return { data: { publicUrl: `https://assets.example/${path}` } } } } } } }
  assert.equal(await readConfiguredTenantBrand(admin, "company-a"), null)
  const settings = { version: 1, configured: true, ...DEFAULT_TENANT_BRAND, primaryColor: brand.primaryColor, logoPath: "company-a/first.svg" }
  current = { Brand_ID: "brand-a", Brand_DisplayName: brand.displayName, Brand_TemplateSettingsJSON: { tenantBranding: settings } }
  assert.equal((await readConfiguredTenantBrand(admin, "company-a")).logoUrl, "https://assets.example/company-a/first.svg")
  settings.logoPath = "company-a/replacement.svg"
  assert.equal((await readConfiguredTenantBrand(admin, "company-a")).logoUrl, "https://assets.example/company-a/replacement.svg")
  settings.logoPath = null
  assert.equal((await readConfiguredTenantBrand(admin, "company-a")).logoUrl, null)
  settings.configured = false
  assert.equal(await readConfiguredTenantBrand(admin, "company-a"), null)
  settings.configured = true
  assert.equal((await readConfiguredTenantBrand(admin, "company-a")).primaryColor, brand.primaryColor)
  current = null
  assert.equal(await readConfiguredTenantBrand(admin, "company-a"), null)
  assert.ok(queries.some(([key, value]) => key === "Company_ID" && value === "company-a"))
  assert.ok(queries.some(([key, value]) => key === "Brand_IsActive" && value === true))
})

test("open pages refresh on lifecycle signals, retain confirmed state on failure, and clean up", async () => {
  const saved = Object.fromEntries(["window", "document", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const page = new EventTarget()
  const document = new EventTarget()
  document.visibilityState = "visible"
  let tick
  let cleared = false
  page.setInterval = (callback, ms) => { assert.equal(ms, 60_000); tick = callback; return 1 }
  page.clearInterval = () => { cleared = true }
  Object.defineProperty(globalThis, "window", { configurable: true, value: page })
  Object.defineProperty(globalThis, "document", { configurable: true, value: document })
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } })
  let next = brand
  let fail = false
  let count = 0
  let rendered = null
  const flush = () => new Promise((resolve) => setImmediate(resolve))
  try {
    const stop = startPublicBrandRefresh(async () => { count++; if (fail) throw Error("offline"); return next }, (value) => { rendered = value })
    page.dispatchEvent(new Event("focus")); await flush()
    assert.equal(rendered, brand)
    fail = true; await tick(); assert.equal(rendered, brand)
    fail = false; next = null; page.dispatchEvent(new Event("online")); await flush()
    assert.equal(rendered, null)
    next = brand; document.dispatchEvent(new Event("visibilitychange")); await flush()
    assert.equal(rendered, brand)
    document.visibilityState = "hidden"; const before = count; await tick(); assert.equal(count, before)
    document.visibilityState = "visible"
    stop(); page.dispatchEvent(new Event("focus")); await tick(); assert.equal(count, before); assert.ok(cleared)
    let resolve
    const cancel = startPublicBrandRefresh(() => new Promise((done) => { resolve = done }), () => assert.fail("stale response applied"))
    page.dispatchEvent(new Event("focus")); page.dispatchEvent(new Event("online")); cancel(); resolve(null); await flush()
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
