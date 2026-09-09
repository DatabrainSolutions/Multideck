import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const app = await read("../../multideck.client/src/App.tsx")
const themeProvider = await read("../../multideck.client/src/lib/theme-provider.tsx")
const publicTheme = await read("../../multideck.client/src/lib/public-brand-theme.ts")
const bookingPage = await read("../../multideck.client/src/pages/public-booking-page.tsx")
const managePage = await read("../../multideck.client/src/pages/meeting-manage-page.tsx")
const quotePage = await read("../../multideck.client/src/pages/quote-response-page.tsx")
const quoteApi = await read("../functions/quote-response/index.ts")
const contactCards = await read("../../multideck.client/src/data/contact-card-data.ts")

test("every current external web route is isolated from personal appearance preferences", () => {
  for (const route of ["isQuoteResponseRoute", "isPublicBookingRoute", "isMeetingManageRoute", "isContactCardPublicRoute"]) {
    assert.match(app, new RegExp(`function isExternalSurfaceRoute[\\s\\S]*${route}\\(path\\)`))
  }
  assert.match(app, /forcedTheme=\{isExternalSurfaceRoute\(route\) \? "light" : undefined\}/)
  assert.match(app, /isExternalSurfaceRoute\(route\) \? null : <ThemeProfileSync \/>/)
  assert.match(themeProvider, /const renderedTheme = forcedTheme \?\? theme/)
  assert.match(themeProvider, /applyDocumentTheme\(forcedTheme \?\? mode\)/)
  assert.doesNotMatch(quotePage, /quote-response\.theme|Use dark mode|Use light mode/)
})

test("unconfigured external pages use fixed white and Multideck teal", () => {
  assert.match(publicTheme, /background: "#ffffff"/)
  assert.match(publicTheme, /surface: "#ffffff"/)
  assert.match(publicTheme, /accent: "#0E7D74"/)
  assert.match(contactCards, /defaultBranding\(accent = "#0E7D74"\)/)
  assert.match(contactCards, /background: "#FFFFFF"/)
  assert.match(contactCards, /surface: "#FFFFFF"/)
})

test("public booking, meeting and quote links consume only the tenant brand contract", () => {
  assert.match(bookingPage, /publicBrandTheme\(brand\)/)
  assert.match(managePage, /publicBrandTheme\(brand\)/)
  assert.match(quotePage, /publicBrandTheme\(brand\)/)
  assert.match(quotePage, /data-customer-theme=\{appearance\}/)
  assert.match(quoteApi, /readConfiguredTenantBrand/)
  assert.match(quoteApi, /branding: brand \? publicBrandContract\(brand\) : null/)
  assert.match(quoteApi, /Public quote branding fallback used/)
})
