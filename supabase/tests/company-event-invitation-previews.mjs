// Writes local HTML previews of the company event invitation email to
// output/event-invite-email/. Run: node supabase/tests/company-event-invitation-previews.mjs
// Real emails reference the cover as cid:event-cover (an inline attachment);
// previews point at a local sample image instead so they open in a browser.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { importTypeScriptGraph } from "./import-typescript-graph.mjs"

const { renderCompanyEventInvitationEmail } = await importTypeScriptGraph(new URL("../../shared/company-event-invitation-email.ts", import.meta.url))

const out = new URL("../../output/event-invite-email/", import.meta.url)
mkdirSync(out, { recursive: true })
copyFileSync(new URL("../../multideck.client/public/email/multideck-logo.png", import.meta.url), new URL("multideck-logo.png", out))

const cover = { src: "sample-cover.jpg", width: 1200, height: 500 }
const eventUrl = "https://dev.multideck.app/events/7c5d278d-cb76-4590-8337-d2551da1d947"
const multideckLogoUrl = "multideck-logo.png"
const base = {
  title: "Christmas Party",
  startsAt: "2026-12-11T19:00:00Z",
  endsAt: "2026-12-11T23:30:00Z",
  timezone: "Europe/London",
  location: "The Glasshouse, 14 Canal Street, Manchester",
  details: "Dinner, a few words from the directors, then the dance floor until late.\n\nDress code is festive. Let us know about any dietary needs in your RSVP.",
  companyName: "Databrain",
  hostName: "Sam Taylor",
  formFieldCount: 2,
}
const lightBrand = {
  displayName: "Harbour & Finch", logoUrl: "sample-tenant-logo.png", primaryColor: "#B4532A",
  backgroundColor: "#FFFFFF", surfaceColor: "#FFFFFF", textColor: "#2B2320",
  cornerStyle: "rounded", emailSignOff: "Harbour & Finch · People team", appearanceMode: "light",
}
const darkBrand = {
  displayName: "Northline Freight", logoUrl: null, primaryColor: "#7DD3C0",
  backgroundColor: "#0F1716", surfaceColor: "#18221F", textColor: "#EEF4F2",
  cornerStyle: "sharp", emailSignOff: "", appearanceMode: "dark",
}

const variants = [
  ["multideck-fallback", "Multideck fallback · cover image · en-GB · event.ics note", { event: base, image: cover, calendarAttachment: true }],
  ["tenant-light-rounded", "Tenant brand · light · rounded · logo · event.ics note", { event: { ...base, companyName: "Harbour & Finch" }, image: cover, brand: lightBrand, calendarAttachment: true }],
  ["tenant-dark-sharp", "Tenant brand · dark · sharp · name mark", { event: { ...base, companyName: "Northline Freight", formFieldCount: 0 }, image: cover, brand: darkBrand }],
  ["no-image", "No cover · no host · no details · no end time", { event: { ...base, endsAt: null, details: "", hostName: null, formFieldCount: 0 } }],
  ["long-copy", "Long title, location and details · multi-day · New York · escaping", {
    event: {
      ...base,
      title: "Annual all-hands, customer awards & winter planning weekend for every office <script>alert(1)</script>",
      startsAt: "2027-01-15T22:00:00Z", endsAt: "2027-01-17T17:00:00Z", timezone: "America/New_York",
      location: "The Grand Harbourside Conference Centre, Pier 17, 89 South Street, Seaport District, New York, NY 10038, United States",
      details: Array.from({ length: 9 }, (_, index) => `Session ${index + 1}: a long paragraph describing the plan & the agenda <b>in detail</b>, including travel, rooms, dinners, the awards evening and the Sunday wrap-up, so everyone knows what to expect before they reply.`).join("\n\n"),
      formFieldCount: 1,
    },
    image: cover, brand: lightBrand,
  }],
  ["en-us", "en-US formatting and spelling", { event: { ...base, hostName: null }, image: cover, locale: "en-US" }],
  ["test-send", "Self-addressed test send", { event: base, image: cover, test: true }],
]

// Two review-only renderings (never sent):
// - "dark": the email's own prefers-color-scheme block applied unconditionally,
//   i.e. what Apple Mail, iOS Mail and other supporting clients show in dark mode.
// - "gmail": an approximation of Gmail iOS forced inversion. Colours are
//   inverted; images and the gradient logo backplate are not, as in Gmail.
//   A browser simulation, not proof of any real client.
const forcedDark = (html) => html.replace(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n      \}/, "$1")
// Gmail ignores the dark block, so the simulation removes it before inverting.
const gmailInversion = (html) => html.replace(/\n    <style>\n      @media \(prefers-color-scheme: dark\)[\s\S]*?<\/style>/, "").replace("</head>", `<style>
      html { filter: invert(1) hue-rotate(180deg); background: #FFFFFF; }
      img, .ev-plate { filter: invert(1) hue-rotate(180deg); }
      .ev-plate img { filter: none; }
    </style></head>`)

const files = []
for (const [name, label, options] of variants) {
  const { subject, html, text } = renderCompanyEventInvitationEmail({ eventUrl, multideckLogoUrl, ...options })
  writeFileSync(new URL(`${name}.html`, out), html)
  writeFileSync(new URL(`${name}.txt`, out), `Subject: ${subject}\n\n${text}\n`)
  const modes = [["light", `${name}.html`]]
  if (html.includes("prefers-color-scheme: dark")) {
    writeFileSync(new URL(`${name}.dark.html`, out), forcedDark(html))
    modes.push(["dark (supporting clients)", `${name}.dark.html`])
  }
  writeFileSync(new URL(`${name}.gmail-sim.html`, out), gmailInversion(html))
  modes.push(["Gmail iOS inversion (simulated)", `${name}.gmail-sim.html`])
  files.push({ name, label, subject, modes })
}

const escape = (value) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character])
writeFileSync(new URL("index.html", out), `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event invitation previews</title>
<style>
  body { margin: 0; padding: 32px 24px; background: #F3F4F4; color: #1F2524; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 500; }
  p { margin: 0 0 28px; color: #5D5D5D; }
  section { margin: 0 0 40px; }
  h2 { margin: 0 0 2px; font-size: 14px; font-weight: 500; }
  h3 { margin: 16px 0 8px; font-size: 13px; font-weight: 500; color: #5D5D5D; }
  .subject { margin: 0 0 12px; color: #7A8280; font-size: 13px; }
  .frames { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  iframe { border: 0; border-radius: 12px; background: #FFF; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
  a { color: #0E7D74; }
</style></head><body>
<h1>Company event invitation email</h1>
<p>Each variant in light, dark (clients that honour <code>prefers-color-scheme</code>) and a simulated Gmail iOS inversion, at desktop (640px) and phone (375px) widths. The simulation is a browser approximation, not proof of Gmail, Outlook or any real client. Real emails attach the cover inline as <code>cid:event-cover</code>; these previews use a local sample image.</p>
${files.map(({ name, label, subject, modes }) => `<section><h2>${escape(label)} · <a href="${name}.txt">text</a></h2><div class="subject">Subject: ${escape(subject)}</div>
${modes.map(([mode, file]) => `<h3>${escape(mode)} · <a href="${file}">open</a></h3><div class="frames"><iframe src="${file}" width="640" height="1180" title="${escape(label)} ${escape(mode)} desktop"></iframe><iframe src="${file}" width="375" height="1180" title="${escape(label)} ${escape(mode)} phone"></iframe></div>`).join("\n")}</section>`).join("\n")}
</body></html>`)
console.log(`Wrote ${files.length} previews to ${out.pathname}`)
