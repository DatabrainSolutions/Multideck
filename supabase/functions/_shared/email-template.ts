import { renderEmailMarkdown } from "./email-markdown.ts"
import type { TenantBrand } from "./tenant-branding.ts"

export type EmailLocale = "en"

type BrandedEmailOptions = {
  subject: string
  preview: string
  title: string
  body: string[]
  bodyFormat?: "paragraphs" | "markdown"
  locale?: EmailLocale
  buttonLabel?: string
  buttonUrl?: string
  code?: string
  eyebrow?: string
  footer?: string
  /** Omit for Multideck-owned auth, invite, recovery and security emails. */
  brand?: TenantBrand | null
}

const appUrl = Deno.env.get("APP_URL")?.trim().replace(/\/+$/, "") || "https://dev.multideck.app"

const defaults = {
  appUrl,
  bannerUrl: Deno.env.get("EMAIL_BANNER_URL")?.trim() || `${appUrl}/email/multideck-email-banner.jpg`,
}

export function normaliseLocale(value: unknown): EmailLocale {
  void value
  return "en"
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function emailButtonInk(background: string) {
  const value = background.replace(/^#/, "")
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#FFFFFF"
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.05
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#0B1413"
}

export function safeMultideckUrl(value: unknown, fallback = defaults.appUrl) {
  try {
    const url = new URL(String(value ?? ""), `${defaults.appUrl}/`)
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.toString()
    if (
      url.hostname === "multideck.app" || url.hostname.endsWith(".multideck.app")
      || url.hostname === "multideck.live" || url.hostname.endsWith(".multideck.live")
    ) return url.toString()
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    if (supabaseUrl && url.origin === new URL(supabaseUrl).origin && url.pathname === "/auth/v1/verify") {
      return url.toString()
    }
  } catch {
    // Invalid and externally controlled destinations fall back to the tenant app.
  }
  return fallback
}

export function renderBrandedEmail(options: BrandedEmailOptions) {
  const direction = "ltr"
  const align = "left"
  const brand = options.brand ?? null
  const pageBackground = brand?.backgroundColor ?? "#F3F4F4"
  const surface = brand?.surfaceColor ?? "#FFFFFF"
  const ink = brand?.textColor ?? "#292929"
  const bodyText = brand?.textColor ?? "#5D5D5D"
  const accent = brand?.primaryColor ?? "#0E7D74"
  const outerRadius = brand?.cornerStyle === "sharp" ? "3px" : "18px"
  const innerRadius = brand?.cornerStyle === "sharp" ? "2px" : "12px"
  const brandFooter = brand
    ? brand.emailSignOff || `${brand.displayName} · Operational update`
    : "Multideck · Private freight operations workspace"
  const structuredBody = options.bodyFormat === "markdown"
    ? renderEmailMarkdown(options.body.join("\n\n"), direction)
    : null
  const bodyHtml = structuredBody?.html ?? options.body
    .map((paragraph) => `<p style="margin:0 0 16px;color:${bodyText};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:24px;text-align:${align};">${escapeHtml(paragraph)}</p>`)
    .join("")
  const actionUrl = options.buttonUrl ? safeMultideckUrl(options.buttonUrl) : null

  const html = `<!doctype html>
<html lang="${options.locale ?? "en"}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(options.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${pageBackground};color:${ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${pageBackground};">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            ${brand ? `<tr><td style="padding:0 0 18px;text-align:center;">${brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.displayName)}" style="display:inline-block;max-width:240px;max-height:76px;width:auto;height:auto;border:0;">` : `<span style="color:${ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;font-weight:600;line-height:28px;">${escapeHtml(brand.displayName)}</span>`}</td></tr>` : `<tr><td style="padding:0 0 16px;text-align:center;"><img src="${escapeHtml(defaults.bannerUrl)}" width="600" height="98" alt="Multideck" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px;"></td></tr>`}
            <tr>
              <td style="border-radius:${outerRadius};background:${surface};padding:36px;box-shadow:inset 0 0 0 1px rgba(11,20,19,0.05);text-align:${align};">
                ${options.eyebrow ? `<p style="margin:0 0 12px;color:${accent};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:600;letter-spacing:.02em;">${escapeHtml(options.eyebrow)}</p>` : ""}
                <h1 style="margin:0 0 18px;color:${ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:26px;font-weight:600;line-height:34px;letter-spacing:-.01em;text-align:${align};">${escapeHtml(options.title)}</h1>
                ${bodyHtml}
                ${options.code ? `<div style="margin:24px 0;border-radius:14px;background:#F5F7F7;padding:20px;color:#0B1413;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:8px;text-align:center;" dir="ltr">${escapeHtml(options.code)}</div>` : ""}
                ${actionUrl && options.buttonLabel ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr><td style="border-radius:${innerRadius};background:${accent};"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 20px;color:${emailButtonInk(accent)};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(options.buttonLabel)}</a></td></tr></table>` : ""}
                ${options.footer ? `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #F2F2F2;color:#7F7F7F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:19px;text-align:${align};">${escapeHtml(options.footer)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 6px 0;color:#7F7F7F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:19px;text-align:${align};">
                ${escapeHtml(brandFooter)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    options.title,
    "",
    structuredBody?.text ?? options.body.join("\n\n"),
    options.code ? `\n${options.code}` : "",
    actionUrl && options.buttonLabel ? `\n${options.buttonLabel}: ${actionUrl}` : "",
    options.footer ? `\n${options.footer}` : "",
    `\n${brandFooter}`,
  ].filter(Boolean).join("\n")

  return { html, text }
}
