import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { normaliseMultideckAppOrigin } from "../_shared/multideck-app-origin.ts"
import { readConfiguredTenantBrand } from "../_shared/tenant-branding.ts"
import { companyEventInvitationLocale, renderCompanyEventInvitationEmail, type CompanyEventInvitationBrand } from "../../../shared/company-event-invitation-email.ts"
import { companyEventCalendarFile } from "../../../shared/company-event-calendar.ts"

export const COMPANY_EVENT_IMAGE_BUCKET = "company-event-images"
/** Inline cover limit before base64; larger originals are sent without a cover. */
export const COMPANY_EVENT_COVER_MAX_BYTES = 3 * 1024 * 1024
const coverCrop = { width: 1200, height: 500 }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const imagePathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}[.](jpg|png|webp)$/
const coverTypes: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }

export type CompanyEventInvitationContext = {
  id: string
  companyId: string
  companyName: string | null
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  details: string
  imagePath: string | null
  status: string
  editVersion: number
  formFieldCount: number
  hostName: string | null
}

export type EmailAttachment = { content: string; filename: string; content_id?: string; content_type: string }

export type CompanyEventInvitationMessage = {
  subject: string
  html: string
  text: string
  attachments: EmailAttachment[]
  receipt: { template: "company_event_invitation"; event_edit_version: number; cover: "inline" | "none" }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value)
}

/**
 * The tenant's own app origin from server configuration. Never taken from a
 * payload. APP_URL must be a tenant app origin, and when the deployment names
 * its tenant host the two must agree; anything else refuses to send.
 */
export function trustedTenantOrigin(appUrl: string | undefined, tenantHost: string | undefined) {
  const origin = normaliseMultideckAppOrigin(appUrl)
  if (!origin) throw new Error("APP_URL is not a trusted tenant app origin")
  const host = tenantHost?.trim().toLowerCase()
  if (host && new URL(origin).hostname !== host) throw new Error("APP_URL does not match MULTIDECK_TENANT_HOST")
  return origin
}

export function companyEventUrl(origin: string, eventId: string) {
  if (!isUuid(eventId)) throw new Error("The event reference is not valid")
  return `${origin}/events/${eventId.toLowerCase()}`
}

function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

type StorageDownload = { data: Blob | null; error: unknown }
type StorageLike = {
  from(bucket: string): { download(path: string, options?: Record<string, unknown>): Promise<StorageDownload> }
}

/**
 * The event cover as an inline (CID) attachment, so the private image stays
 * private: no public or long-lived signed URL is written into the email. A
 * server-side crop is preferred (smaller, predictable shape); where image
 * transformation is unavailable the original is used within the size limit.
 * A missing or unusable image never blocks the invitation.
 */
export async function loadCompanyEventCover(storage: StorageLike, imagePath: string | null) {
  const match = imagePath?.match(imagePathPattern)
  if (!imagePath || !match) return null
  const bucket = storage.from(COMPANY_EVENT_IMAGE_BUCKET)
  const attempts: Array<{ options?: Record<string, unknown>; size: typeof coverCrop | null }> = [
    { options: { transform: { ...coverCrop, resize: "cover", quality: 80 } }, size: coverCrop },
    { size: null },
  ]
  for (const attempt of attempts) {
    try {
      const { data, error } = await bucket.download(imagePath, attempt.options)
      if (error || !data || data.size === 0 || data.size > COMPANY_EVENT_COVER_MAX_BYTES) continue
      const reported = data.type.split(";")[0].trim().toLowerCase()
      const contentType = Object.values(coverTypes).includes(reported) ? reported : coverTypes[match[1]]
      const extension = Object.entries(coverTypes).find(([, type]) => type === contentType)?.[0] ?? match[1]
      return {
        attachment: {
          content: toBase64(new Uint8Array(await data.arrayBuffer())),
          filename: `event-cover.${extension}`,
          content_id: "event-cover",
          content_type: contentType,
        } satisfies EmailAttachment,
        size: attempt.size,
      }
    } catch {
      // Try the original, then send without a cover.
    }
  }
  return null
}

function emailBrand(brand: Awaited<ReturnType<typeof readConfiguredTenantBrand>>): CompanyEventInvitationBrand | null {
  if (!brand) return null
  let logoUrl: string | null = null
  try {
    // Gmail and Outlook do not render SVG; those tenants show their name instead.
    if (brand.logoUrl && brand.logoMimeType !== "image/svg+xml" && new URL(brand.logoUrl).protocol === "https:") logoUrl = brand.logoUrl
  } catch { /* Name only. */ }
  return {
    displayName: brand.displayName,
    logoUrl,
    backgroundColor: brand.backgroundColor,
    surfaceColor: brand.surfaceColor,
    textColor: brand.textColor,
    primaryColor: brand.primaryColor,
    cornerStyle: brand.cornerStyle,
    emailSignOff: brand.emailSignOff,
    appearanceMode: brand.appearanceMode,
  }
}

export type PrepareCompanyEventInvitation = {
  admin: SupabaseClient
  eventId: string
  userId: string
  purpose: "invitation" | "test"
  appUrl: string | undefined
  tenantHost: string | undefined
  /** en-GB unless en-US is explicitly supplied. */
  locale?: unknown
  /** Self-addressed previews only; normal invitations always use saved branding. */
  testBranding?: "multideck"
  now?: Date
}

/**
 * Resolves what one colleague may be emailed about one event. The database
 * decides eligibility with the same visibility and invitation functions as
 * every Events read; this only renders what it returns.
 */
export async function prepareCompanyEventInvitation(input: PrepareCompanyEventInvitation):
  Promise<{ skipped: "event_unavailable" | "event_finished" } | { message: CompanyEventInvitationMessage; context: CompanyEventInvitationContext }> {
  if (!isUuid(input.eventId) || !isUuid(input.userId)) return { skipped: "event_unavailable" }
  const origin = trustedTenantOrigin(input.appUrl, input.tenantHost)
  const { data, error } = await input.admin.rpc("company_event_invitation_email_context", {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_purpose: input.purpose,
  })
  if (error) throw new Error("The event invitation could not be checked")
  if (!data || typeof data !== "object") return { skipped: "event_unavailable" }
  const context = data as CompanyEventInvitationContext
  if (!isUuid(context.id) || !isUuid(context.companyId)) return { skipped: "event_unavailable" }
  const finishes = new Date(context.endsAt ?? context.startsAt)
  if (input.purpose === "invitation" && !(finishes > (input.now ?? new Date()))) return { skipped: "event_finished" }

  const brand = input.purpose === "test" && input.testBranding === "multideck"
    ? null
    : emailBrand(await readConfiguredTenantBrand(input.admin, context.companyId))
  const cover = await loadCompanyEventCover(input.admin.storage as unknown as StorageLike, context.imagePath)
  const rendered = renderCompanyEventInvitationEmail({
    event: context,
    eventUrl: companyEventUrl(origin, context.id),
    image: cover ? { src: `cid:${cover.attachment.content_id}`, ...(cover.size ?? {}) } : null,
    brand,
    multideckLogoUrl: `${origin}/email/multideck-logo.png`,
    test: input.purpose === "test",
    locale: companyEventInvitationLocale(input.locale),
    calendarAttachment: true,
  })
  return {
    context,
    message: {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        ...(cover ? [cover.attachment] : []),
        { filename: "event.ics", content_type: "text/calendar; charset=utf-8; method=PUBLISH", content: toBase64(new TextEncoder().encode(companyEventCalendarFile(context, companyEventUrl(origin, context.id), input.now))) },
      ],
      receipt: { template: "company_event_invitation", event_edit_version: context.editVersion, cover: cover ? "inline" : "none" },
    },
  }
}
