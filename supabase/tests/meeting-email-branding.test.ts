import assert from "node:assert/strict"
import { renderEmailDocument, type EmailBrand } from "../../shared/branded-email.ts"
import { renderBrandedEmail, safeMultideckUrl } from "../functions/_shared/email-template.ts"
import { meetingEmailPresentation } from "../../shared/meeting-email-presentation.ts"

const defaults = { bannerUrl: "https://dev.multideck.app/email/multideck-email-banner.jpg" }
const content = {
  subject: "Manage: Freight planning call", preview: "Hello Sam Taylor,",
  ...meetingEmailPresentation.management,
  body: ["Hello Sam Taylor,", "Your meeting is confirmed."],
  buttonLabel: "Manage meeting", buttonUrl: "https://workspace.multideck.app/meetings/manage/example",
}
const brand: EmailBrand = {
  displayName: "Example Freight", logoUrl: "https://example.com/logo.png", primaryColor: "#316FAB",
  backgroundColor: "#FFFFFF", surfaceColor: "#FFFFFF", textColor: "#2D4E67",
  cornerStyle: "sharp", emailSignOff: "Example Freight · Your freight team",
}

Deno.test("unbranded meeting email uses Multideck banner, teal action and sign-off", () => {
  const { html, text } = renderEmailDocument(content, defaults)
  assert.match(html, /alt="Multideck"/)
  assert.match(html, /multideck-email-banner\.jpg/)
  assert.match(html, /background:#0E7D74/)
  assert.match(text, /Multideck · Private freight operations workspace/)
})
Deno.test("saved tenant identity replaces the banner and sign-off, including sharp corners", () => {
  const { html, text } = renderEmailDocument({ ...content, brand }, defaults)
  assert.match(html, /alt="Example Freight"/)
  assert.match(html, /background:#316FAB/)
  assert.match(html, /border-radius:3px/)
  assert.match(text, /Example Freight · Your freight team/)
  assert.doesNotMatch(html, /multideck-email-banner/)
})
Deno.test("tenant without a logo uses its name and its saved dark palette", () => {
  const { html } = renderEmailDocument({ ...content, brand: { ...brand, logoUrl: null, backgroundColor: "#101820", surfaceColor: "#172530", textColor: "#F8FAFC", cornerStyle: "rounded" } }, defaults)
  assert.match(html, />Example Freight<\/span>/)
  assert.match(html, /background:#101820/)
  assert.match(html, /background:#172530/)
  assert.match(html, /color:#F8FAFC/)
  assert.match(html, /border-radius:18px/)
})
Deno.test("copy and branding text are escaped in the preview and email", () => {
  const { html } = renderEmailDocument({ ...content, body: ['<img src=x onerror="alert(1)">'], brand: { ...brand, displayName: '<script>alert(1)</script>', emailSignOff: 'A & B' } }, defaults)
  assert.doesNotMatch(html, /<script>|<img src=x/)
  assert.match(html, /&lt;img/)
  assert.match(html, /A &amp; B/)
})
Deno.test("delivery uses the same document as preview and still rejects unsafe actions", () => {
  const appUrl = Deno.env.get("APP_URL")?.trim().replace(/\/+$/, "") || "https://dev.multideck.app"
  const bannerUrl = Deno.env.get("EMAIL_BANNER_URL")?.trim() || `${appUrl}/email/multideck-email-banner.jpg`
  for (const identity of [null, brand]) {
    assert.deepEqual(renderBrandedEmail({ ...content, brand: identity }), renderEmailDocument({ ...content, brand: identity }, { bannerUrl }))
  }
  assert.equal(safeMultideckUrl("javascript:alert(1)"), appUrl)
  assert.equal(safeMultideckUrl("https://untrusted.example/path"), appUrl)
})
