import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const page = fs.readFileSync(new URL("../src/pages/settings-branding-tab.tsx", import.meta.url), "utf8")
const profileNavigation = fs.readFileSync(new URL("../src/data/settings-navigation.ts", import.meta.url), "utf8")
const productNavigation = fs.readFileSync(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
const settings = fs.readFileSync(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const admin = fs.readFileSync(new URL("../src/pages/admin-page.tsx", import.meta.url), "utf8")
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const store = fs.readFileSync(new URL("../src/lib/contact-card-store.ts", import.meta.url), "utf8")

test("Branding is a tenant-administrator route, not a personal settings tab", () => {
  assert.match(productNavigation, /id: "admin-branding", label: "Branding", icon: Palette, route: "\/admin\/branding"/)
  assert.match(admin, /"\/admin\/branding": "Branding"/)
  assert.match(admin, /route === "\/admin\/branding"[\s\S]*AdminBrandingContent/)
  assert.match(app, /"\/admin\/branding"/)
  assert.doesNotMatch(profileNavigation, /id: "branding"|\| "branding"/)
  assert.match(settings, /branding: "\/admin\/branding"/)
  assert.match(page, /export function AdminBrandingContent/)
})

test("the editor advertises and accepts the requested logo formats", () => {
  assert.match(page, /SVG is preferred\. PNG and JPEG are supported up to 2 MB/)
  assert.match(page, /accept="\.svg,\.png,\.jpg,\.jpeg,image\/svg\+xml,image\/png,image\/jpeg"/)
  assert.match(page, /SUPPORTED_LOGO_TYPES/)
})

test("Luna imports a reviewable draft rather than saving automatically", () => {
  assert.match(page, /Import with Luna/)
  assert.match(page, /Review every suggestion before saving it/)
  assert.doesNotMatch(page, /importTenantBranding\([\s\S]{0,500}saveTenantBranding/)
})

test("website import is an on-demand Dexter disclosure instead of a permanent panel", () => {
  assert.match(page, /<DexterActionPill[\s\S]*label=\{t\("Import from website"\)\}/)
  assert.match(page, /aria-expanded=\{importExpanded\}/)
  assert.match(page, /data-testid="brand-import-disclosure"/)
  assert.match(page, /grid-rows-\[0fr\][\s\S]*duration-\[160ms\][\s\S]*cubic-bezier\(0\.4,0,1,1\)/)
  assert.match(page, /grid-rows-\[1fr\][\s\S]*duration-\[240ms\][\s\S]*cubic-bezier\(0\.16,1,0\.3,1\)/)
  assert.match(page, /motion-reduce:transition-none/)
  assert.doesNotMatch(page, /<SettingsPanel title=\{t\("Import from your website"\)\}/)
})

test("the import disclosure manages keyboard focus and rapid reversal safely", () => {
  assert.match(page, /requestAnimationFrame\(\(\) => importInputRef\.current\?\.focus\(\)\)/)
  assert.match(page, /window\.cancelAnimationFrame\(frame\)/)
  assert.match(page, /event\.key !== "Escape"/)
  assert.match(page, /document\.getElementById\("brand-import-trigger"\)\?\.focus\(\)/)
  assert.match(page, /tabIndex=\{importExpanded \? 0 : -1\}/)
})

test("the editor uses the deployed tenant branding service", () => {
  assert.match(page, /return getTenantBranding\(session\.access_token\)/)
  assert.doesNotMatch(page, /localTenantBrandingPreview|Local preview only|serviceUnavailable/)
  assert.match(page, /saveTenantBranding\(session\.access_token/)
  assert.match(page, /importTenantBranding\(session\.access_token/)
})

test("the settings show both consumer previews without redundant page copy", () => {
  assert.match(page, /Contact card preview/)
  assert.match(page, /Email preview/)
  assert.doesNotMatch(page, /Choose the identity customers see on contact cards/)
  assert.doesNotMatch(page, /Brand assets are public by design/)
  assert.doesNotMatch(page, /Changes appear in the previews immediately/)
})

test("the consumer previews share a matching-height layout", () => {
  assert.match(page, /data-testid="contact-brand-preview" className="h-full/)
  assert.match(page, /data-testid="email-brand-preview" className="h-full/)
  assert.match(page, /className="mt-3 flex-1"><ContactBrandPreview/)
  assert.match(page, /className="mt-3 flex-1"><EmailBrandPreview/)
})

test("light and dark appearance can be imported, manually overridden and saved", () => {
  assert.match(page, /SettingsChoiceGroup options=\{\["Light", "Dark"\]\}/)
  assert.match(page, /setAppearanceMode\(value === "Dark" \? "dark" : "light"\)/)
  assert.match(page, /appearanceMode: draft\.appearanceMode/)
  assert.match(page, /APPEARANCE_PALETTES\[appearanceMode\]/)
})

test("uploaded logos sit directly on the brand background", () => {
  assert.match(page, /logoPreview \? "w-full max-w-\[240px\] overflow-visible"/)
  assert.match(page, /max-h-20 max-w-full object-contain/)
  assert.doesNotMatch(page, /logoPreview[\s\S]{0,120}size-full object-contain p-3/)
})

test("the reset action uses a clear refresh icon", () => {
  assert.match(page, /<RefreshCw className="size-4"/)
  assert.doesNotMatch(page, /<RotateCcw/)
})

test("the editor preserves the real permission and loading boundaries", () => {
  assert.match(page, /const canManage = hasPermission\(currentUser, "Settings\.Manage"\)/)
  assert.doesNotMatch(page, /true \|\| hasPermission|Jenkar Shipping/)
  assert.match(page, /Brand settings could not be loaded/)
})

test("reset restores Multideck visual defaults without saving automatically", () => {
  assert.match(page, /Reset to default/)
  assert.match(page, /DEFAULT_TENANT_BRAND/)
  assert.match(page, /setDraft\(\(current\) => current \? \{ \.\.\.current, \.\.\.DEFAULT_TENANT_BRAND/)
  assert.doesNotMatch(page, /resetToDefault\([\s\S]{0,400}saveTenantBranding/)
})

test("contact cards inherit the tenant brand until deliberately customised", () => {
  assert.match(store, /brandSource: update\.brandSource \?\? "custom"/)
  assert.match(store, /card\.branding\.brandSource !== "tenant"/)
  assert.match(store, /logoDataUrl: tenantBranding\.logoUrl/)
})
