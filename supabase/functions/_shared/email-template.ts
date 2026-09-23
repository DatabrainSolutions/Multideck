import { renderEmailDocument, type BrandedEmailOptions, type EmailLocale } from "../../../shared/branded-email.ts"
export { escapeHtml } from "../../../shared/branded-email.ts"
export type { EmailLocale } from "../../../shared/branded-email.ts"

const appUrl = Deno.env.get("APP_URL")?.trim().replace(/\/+$/, "") || "https://dev.multideck.app"

const defaults = {
  appUrl,
  bannerUrl: Deno.env.get("EMAIL_BANNER_URL")?.trim() || `${appUrl}/email/multideck-email-banner.jpg`,
}

export function normaliseLocale(value: unknown): EmailLocale {
  void value
  return "en"
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
  return renderEmailDocument({
    ...options,
    buttonUrl: options.buttonUrl ? safeMultideckUrl(options.buttonUrl) : undefined,
  }, defaults)
}
