export type EmailLocale = "en" | "de" | "fr" | "ar"

type BrandedEmailOptions = {
  subject: string
  preview: string
  title: string
  body: string[]
  locale?: EmailLocale
  buttonLabel?: string
  buttonUrl?: string
  code?: string
  eyebrow?: string
  footer?: string
}

const defaults = {
  appUrl: Deno.env.get("APP_URL") ?? "https://dev.multideck.app",
  logoUrl: Deno.env.get("EMAIL_LOGO_URL") ?? "https://dev.multideck.app/email/multideck-logo.png",
}

export function normaliseLocale(value: unknown): EmailLocale {
  const locale = String(value ?? "").trim().toLowerCase().split(/[-_]/, 1)[0]
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en"
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function safeMultideckUrl(value: unknown, fallback = defaults.appUrl) {
  try {
    const url = new URL(String(value ?? ""))
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.toString()
    if (url.hostname === "multideck.app" || url.hostname.endsWith(".multideck.app")) return url.toString()
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
  const direction = options.locale === "ar" ? "rtl" : "ltr"
  const align = options.locale === "ar" ? "right" : "left"
  const bodyHtml = options.body
    .map((paragraph) => `<p style="margin:0 0 16px;color:#5D5D5D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:24px;text-align:${align};">${escapeHtml(paragraph)}</p>`)
    .join("")
  const actionUrl = options.buttonUrl ? safeMultideckUrl(options.buttonUrl) : null

  const html = `<!doctype html>
<html lang="${options.locale ?? "en"}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(options.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F3F4F4;color:#292929;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F3F4F4;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 6px 22px;text-align:${align};">
                <img src="${escapeHtml(defaults.logoUrl)}" width="154" height="33" alt="Multideck" style="display:block;width:154px;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="border-radius:18px;background:#FFFFFF;padding:36px;box-shadow:inset 0 0 0 1px rgba(11,20,19,0.05);text-align:${align};">
                ${options.eyebrow ? `<p style="margin:0 0 12px;color:#0E7D74;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:600;letter-spacing:.02em;">${escapeHtml(options.eyebrow)}</p>` : ""}
                <h1 style="margin:0 0 18px;color:#292929;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:26px;font-weight:600;line-height:34px;letter-spacing:-.01em;text-align:${align};">${escapeHtml(options.title)}</h1>
                ${bodyHtml}
                ${options.code ? `<div style="margin:24px 0;border-radius:14px;background:#F5F7F7;padding:20px;color:#0B1413;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:600;letter-spacing:8px;text-align:center;" dir="ltr">${escapeHtml(options.code)}</div>` : ""}
                ${actionUrl && options.buttonLabel ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr><td style="border-radius:12px;background:#0E7D74;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 20px;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(options.buttonLabel)}</a></td></tr></table>` : ""}
                ${options.footer ? `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #F2F2F2;color:#7F7F7F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:19px;text-align:${align};">${escapeHtml(options.footer)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 6px 0;color:#7F7F7F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:19px;text-align:${align};">
                Multideck · Private freight operations workspace
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
    ...options.body,
    options.code ? `\n${options.code}` : "",
    actionUrl && options.buttonLabel ? `\n${options.buttonLabel}: ${actionUrl}` : "",
    options.footer ? `\n${options.footer}` : "",
    "\nMultideck · Private freight operations workspace",
  ].filter(Boolean).join("\n")

  return { html, text }
}
