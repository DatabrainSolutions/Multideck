import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { isTenantBrandConfigured, tenantBrandRow, tenantBrandSettings, TENANT_BRAND_ASSETS_BUCKET, TENANT_BRAND_MAX_LOGO_BYTES } from "./tenant-branding.ts"
import { multideckDocumentLogo } from "./multideck-document-logo.ts"

type DocumentIdentity = {
  branding: { logoDataUri: string; source: "tenant" | "multideck" }
  issuer: { name: string; address: string; email: string; registration: string; vatNumber: string }
}

function string(value: unknown) { return typeof value === "string" ? value.trim() : "" }
function dataUri(bytes: Uint8Array, mime: string) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

/** Printable images must be self-contained and fit within the Admin size limit. */
export function printableLogoMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/svg+xml" | null {
  if (bytes.length < 24 || bytes.length > TENANT_BRAND_MAX_LOGO_BYTES) return null
  if ([137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16), height = view.getUint32(20)
    return width > 0 && height > 0 && width <= 10000 && height <= 10000 && width * height <= 25000000 ? "image/png" : null
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  const svg = new TextDecoder().decode(bytes)
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg) && /<\/svg>\s*$/i.test(svg)
    && !/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|image|use)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\s*\(|@import/i.test(svg)) return "image/svg+xml"
  return null
}

export async function documentLogo(admin: SupabaseClient, companyId: string): Promise<DocumentIdentity["branding"]> {
  const fallback: DocumentIdentity["branding"] = { logoDataUri: multideckDocumentLogo, source: "multideck" }
  const brand = await tenantBrandRow(admin, companyId)
  const settings = tenantBrandSettings(brand)
  const path = string(settings.logoPath)
  if (!isTenantBrandConfigured(settings) || !path) return fallback
  // Admin branding is authoritative; an absent/reset logo never revives a
  // legacy logo upload. Download failure must not prevent an operational PDF.
  const result = await admin.storage.from(TENANT_BRAND_ASSETS_BUCKET).download(path)
  if (result.error || !result.data || result.data.size > TENANT_BRAND_MAX_LOGO_BYTES) return fallback
  const bytes = new Uint8Array(await result.data.arrayBuffer())
  const mime = printableLogoMime(bytes)
  return mime ? { logoDataUri: dataUri(bytes, mime), source: "tenant" } : fallback
}

/** Call only after the source record has passed server authorisation. The legal
 * identity comes from the job's entity; the logo comes from Admin branding. */
export async function jobDocumentIdentity(admin: SupabaseClient, authorisedJobId: string, authorisedCompanyId: string): Promise<DocumentIdentity> {
  const job = await admin.from("Job_Header").select("Job_LegalEntityID,Job_LegalEntityNameSnapshot").eq("Job_ID", authorisedJobId).single()
  if (job.error) throw job.error
  const legalId = job.data.Job_LegalEntityID
  const legal = legalId ? await admin.from("cmp_LegalEntities")
    .select("LegalEntity_Name,LegalEntity_AddressSnapshot,LegalEntity_EmailSnapshot,LegalEntity_CompanyRegistrationNo,LegalEntity_VATNumber")
    .eq("LegalEntity_ID", legalId).eq("Company_ID", authorisedCompanyId).single() : { data: null, error: null }
  if (legal.error) throw legal.error
  return {
    branding: await documentLogo(admin, authorisedCompanyId),
    issuer: {
      name: string(legal.data?.LegalEntity_Name) || string(job.data.Job_LegalEntityNameSnapshot),
      address: string(legal.data?.LegalEntity_AddressSnapshot),
      email: string(legal.data?.LegalEntity_EmailSnapshot),
      registration: string(legal.data?.LegalEntity_CompanyRegistrationNo),
      vatNumber: string(legal.data?.LegalEntity_VATNumber),
    },
  }
}

