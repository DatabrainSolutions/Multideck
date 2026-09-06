import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import { invalidateCachedCrmResources, readCachedCrmResource } from "@/lib/crm-read-cache"

export type TenantBrandCornerStyle = "rounded" | "sharp"
export type TenantBrandAppearance = "light" | "dark"

export type TenantBranding = {
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
  pendingImport?: TenantBrandImport | null
}

export const DEFAULT_TENANT_BRAND = {
  primaryColor: "#0E7D74",
  secondaryColor: "#164E49",
  backgroundColor: "#F3F4F4",
  surfaceColor: "#FFFFFF",
  textColor: "#292929",
  appearanceMode: "light" as const,
  cornerStyle: "rounded" as const,
  emailSignOff: "",
}

export type TenantBrandImport = {
  draft: Omit<TenantBranding, "configured" | "brandId" | "logoUrl" | "logoMimeType" | "updatedAt" | "importedFrom" | "pendingImport"> & {
    importedLogoUrl: string | null
  }
  evidence: {
    sourceUrl: string
    model: string
    importedAt: string
    confidence: "high" | "medium" | "low"
    note: string
    logoCandidateCount: number
  }
}

async function responseJson<T>(responsePromise: Response | Promise<Response>, fallback: string) {
  const response = await responsePromise
  if (response.ok) return response.json() as Promise<T>
  const payload = await response.json().catch(() => null) as { detail?: string } | null
  throw new Error(payload?.detail || fallback)
}

export async function getTenantBranding(accessToken: string) {
  const session = await getSupabaseSession()
  if (!session?.user || session.access_token !== accessToken) throw new Error("Sign in again to load brand settings.")
  return readCachedCrmResource(session.user.id, "tenant-branding", () => responseJson<TenantBranding>(
    edgeFetch("tenant-branding", "", accessToken), "Brand settings could not be loaded.",
  ))
}

function brandingChanged<T>(value: T) {
  invalidateCachedCrmResources(null, ["tenant-branding"])
  return value
}

export function importTenantBranding(accessToken: string, websiteUrl: string) {
  return responseJson<TenantBrandImport>(
    edgeFetch("tenant-branding", "/import", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl }),
    }),
    "Luna could not import that website.",
  ).then(brandingChanged)
}

export function discardTenantBrandImport(accessToken: string) {
  return responseJson<{ discarded: true }>(
    edgeFetch("tenant-branding", "/discard-import", accessToken, { method: "POST" }),
    "The imported brand draft could not be discarded.",
  ).then(brandingChanged)
}

export function saveTenantBrandImportDraft(accessToken: string, pendingImport: TenantBrandImport) {
  return responseJson<TenantBrandImport>(
    edgeFetch("tenant-branding", "/save-import-draft", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingImport),
    }),
    "The imported brand draft could not be saved.",
  ).then(brandingChanged)
}

export function saveTenantBranding(
  accessToken: string,
  branding: Pick<TenantBranding, "displayName" | "websiteUrl" | "primaryColor" | "secondaryColor" | "backgroundColor" | "surfaceColor" | "textColor" | "appearanceMode" | "cornerStyle" | "emailSignOff"> & {
    configured?: boolean
    removeLogo: boolean
    importedLogoUrl?: string | null
    importedFrom?: TenantBranding["importedFrom"]
  },
  logoFile?: File | null,
) {
  const form = new FormData()
  form.set("settings", JSON.stringify(branding))
  if (logoFile) form.set("logo", logoFile)
  return responseJson<TenantBranding>(
    edgeFetch("tenant-branding", "/save", accessToken, { method: "POST", body: form }),
    "Brand settings could not be saved.",
  ).then(brandingChanged)
}
