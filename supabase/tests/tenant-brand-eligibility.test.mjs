import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/tenant-branding.ts", import.meta.url), "utf8")
const javascript = stripTypeScriptTypes(source, { mode: "strip" })
const { DEFAULT_TENANT_BRAND, isTenantBrandConfigured, tenantBrandFromRow } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`)

const legacyReset = {
  version: 1,
  ...DEFAULT_TENANT_BRAND,
  logoPath: null,
  logoMimeType: null,
  importedFrom: { url: "https://www.jenkar.com/", importedAt: "2026-09-01T23:45:10.982Z", model: "website-import" },
}

test("the observed legacy Jenkar reset is not active branding", () => {
  assert.equal(isTenantBrandConfigured(legacyReset), false)
  const brand = tenantBrandFromRow({}, {
    Brand_ID: "saved-brand",
    Brand_Name: "Jenkar Shipping",
    Brand_DisplayName: "Jenkar Shipping",
    Brand_WebsiteURL: "https://www.jenkar.com/",
    Brand_TemplateSettingsJSON: { tenantBranding: legacyReset },
  })
  assert.equal(brand.configured, false)
  assert.equal(brand.displayName, "Jenkar Shipping")
  assert.equal(brand.logoUrl, null)
})

test("missing settings and untouched defaults never activate the company choice", () => {
  for (const settings of [{}, { version: 1 }, { version: 1, ...DEFAULT_TENANT_BRAND }]) {
    assert.equal(isTenantBrandConfigured(settings), false)
  }
})

test("a legacy logo or custom palette remains valid without a new configuration flag", () => {
  assert.equal(isTenantBrandConfigured({ ...legacyReset, logoPath: "logos/company.svg" }), true)
  assert.equal(isTenantBrandConfigured({ ...legacyReset, primaryColor: "#316FAB", secondaryColor: "#FFB800" }), true)
})

test("an explicit reset wins over any remaining custom values", () => {
  assert.equal(isTenantBrandConfigured({ ...legacyReset, configured: false, primaryColor: "#316FAB", logoPath: "old-logo.svg" }), false)
})

test("a newly saved deliberate identity may use default colours and an initials mark", () => {
  assert.equal(isTenantBrandConfigured({ ...legacyReset, configured: true }), true)
})
