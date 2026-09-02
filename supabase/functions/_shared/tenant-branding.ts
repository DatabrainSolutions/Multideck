import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"

type JsonObject = Record<string, unknown>

export const TENANT_BRAND_ASSETS_BUCKET = "tenant-brand-assets"
export const TENANT_BRAND_MAX_LOGO_BYTES = 2 * 1024 * 1024

export type TenantBrandCornerStyle = "rounded" | "sharp"
export type TenantBrandAppearance = "light" | "dark"

export type TenantBrand = {
  configured: boolean
  brandId: string | null
  displayName: string
  websiteUrl: string
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  appearanceMode: TenantBrandAppearance
  cornerStyle: TenantBrandCornerStyle
  emailSignOff: string
  logoUrl: string | null
  logoMimeType: "image/svg+xml" | "image/png" | "image/jpeg" | null
  updatedAt: string | null
  importedFrom: { url: string; importedAt: string; model: string } | null
}

export const DEFAULT_TENANT_BRAND: Omit<TenantBrand, "configured" | "brandId" | "displayName" | "websiteUrl" | "logoUrl" | "logoMimeType" | "updatedAt" | "importedFrom"> = {
  primaryColor: "#0E7D74",
  secondaryColor: "#164E49",
  backgroundColor: "#F3F4F4",
  surfaceColor: "#FFFFFF",
  textColor: "#292929",
  appearanceMode: "light",
  cornerStyle: "rounded",
  emailSignOff: "",
}

export type TenantBrandRow = {
  Brand_ID: string
  Brand_Name: string
  Brand_DisplayName: string | null
  Brand_WebsiteURL: string | null
  Brand_PrimaryColor: string | null
  Brand_TemplateSettingsJSON: JsonObject | null
  Brand_UpdatedAt: string | null
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function text(value: unknown, maximum: number, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : fallback
}

export function normaliseHex(value: unknown, fallback: string) {
  const candidate = text(value, 7).toUpperCase()
  return /^#[0-9A-F]{6}$/.test(candidate) ? candidate : fallback
}

export function tenantBrandSettings(row: TenantBrandRow | null | undefined) {
  const template = object(row?.Brand_TemplateSettingsJSON)
  return object(template.tenantBranding)
}

/** Older resets kept the company name and import evidence, but no brand. */
export function isTenantBrandConfigured(settings: JsonObject) {
  if (settings.version !== 1 || settings.configured === false) return false
  if (settings.configured === true) return true
  if (text(settings.logoPath, 500)) return true
  return (Object.keys(DEFAULT_TENANT_BRAND) as (keyof typeof DEFAULT_TENANT_BRAND)[])
    .some((key) => {
      const fallback = DEFAULT_TENANT_BRAND[key]
      const value = key.endsWith("Color")
        ? normaliseHex(settings[key], fallback)
        : text(settings[key], 500, fallback)
      return value !== fallback
    })
}

export async function tenantBrandRow(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from("cmp_Brands")
    .select("Brand_ID,Brand_Name,Brand_DisplayName,Brand_WebsiteURL,Brand_PrimaryColor,Brand_TemplateSettingsJSON,Brand_UpdatedAt")
    .eq("Company_ID", companyId)
    .eq("Brand_IsActive", true)
    .order("Brand_IsDefault", { ascending: false })
    .order("Brand_CreatedAt", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TenantBrandRow | null
}

export function tenantBrandFromRow(admin: SupabaseClient, row: TenantBrandRow | null, companyName = ""): TenantBrand {
  const settings = tenantBrandSettings(row)
  const imported = object(settings.importedFrom)
  const logoPath = text(settings.logoPath, 500)
  const logoMimeType = text(settings.logoMimeType, 40)
  const logoUrl = logoPath
    ? admin.storage.from(TENANT_BRAND_ASSETS_BUCKET).getPublicUrl(logoPath).data.publicUrl
    : null
  const importedUrl = text(imported.url, 2_000)
  const importedAt = text(imported.importedAt, 80)
  const importedModel = text(imported.model, 120)

  return {
    configured: isTenantBrandConfigured(settings),
    brandId: row?.Brand_ID ?? null,
    displayName: text(row?.Brand_DisplayName, 240, text(row?.Brand_Name, 180, companyName || "Workspace")),
    websiteUrl: text(row?.Brand_WebsiteURL, 2_000),
    primaryColor: normaliseHex(settings.primaryColor ?? row?.Brand_PrimaryColor, DEFAULT_TENANT_BRAND.primaryColor),
    secondaryColor: normaliseHex(settings.secondaryColor, DEFAULT_TENANT_BRAND.secondaryColor),
    backgroundColor: normaliseHex(settings.backgroundColor, DEFAULT_TENANT_BRAND.backgroundColor),
    surfaceColor: normaliseHex(settings.surfaceColor, DEFAULT_TENANT_BRAND.surfaceColor),
    textColor: normaliseHex(settings.textColor, DEFAULT_TENANT_BRAND.textColor),
    appearanceMode: settings.appearanceMode === "dark" ? "dark" : "light",
    cornerStyle: settings.cornerStyle === "sharp" ? "sharp" : "rounded",
    emailSignOff: text(settings.emailSignOff, 500),
    logoUrl,
    logoMimeType: logoMimeType === "image/svg+xml" || logoMimeType === "image/png" || logoMimeType === "image/jpeg" ? logoMimeType : null,
    updatedAt: row?.Brand_UpdatedAt ?? null,
    importedFrom: importedUrl && importedAt && importedModel ? { url: importedUrl, importedAt, model: importedModel } : null,
  }
}

export async function readTenantBrand(admin: SupabaseClient, companyId: string, companyName = "") {
  return tenantBrandFromRow(admin, await tenantBrandRow(admin, companyId), companyName)
}

/** Existing tenants keep the Multideck email template until Branding is saved once. */
export async function readConfiguredTenantBrand(admin: SupabaseClient, companyId: string) {
  const row = await tenantBrandRow(admin, companyId)
  const settings = tenantBrandSettings(row)
  return row && isTenantBrandConfigured(settings) ? tenantBrandFromRow(admin, row) : null
}
