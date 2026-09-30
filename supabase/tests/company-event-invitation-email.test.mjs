import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"
import { importTypeScriptGraph } from "./import-typescript-graph.mjs"

const template = await importTypeScriptGraph(new URL("../../shared/company-event-invitation-email.ts", import.meta.url))
const delivery = await importTypeScriptGraph(new URL("../functions/send-notification-email/company-event-invitation.ts", import.meta.url))
const { renderCompanyEventInvitationEmail } = template

const eventId = "7c5d278d-cb76-4590-8337-d2551da1d947"
const companyId = "2d7c8f0a-5b1e-4c3d-9a8b-7e6f5d4c3b2a"
const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
const eventUrl = `https://dev.multideck.app/events/${eventId}`
const event = {
  title: "Christmas Party", startsAt: "2026-12-11T19:00:00Z", endsAt: "2026-12-11T23:30:00Z", timezone: "Europe/London",
  location: "The Glasshouse, Manchester", details: "Dinner, then dancing.\n\nDress code is festive.",
  companyName: "Databrain", hostName: "Sam Taylor", formFieldCount: 2,
}
const brand = {
  displayName: "Harbour & Finch", logoUrl: "https://tenant.supabase.co/storage/v1/object/public/tenant-brand-assets/logo.png",
  primaryColor: "#B4532A", backgroundColor: "#FBF7F3", surfaceColor: "#FFFFFF", textColor: "#2B2320",
  cornerStyle: "rounded", emailSignOff: "Harbour & Finch · People team", appearanceMode: "light",
}
const render = (options = {}) => renderCompanyEventInvitationEmail({ event, eventUrl, multideckLogoUrl: "https://dev.multideck.app/email/multideck-logo.png", image: { src: "cid:event-cover", width: 1200, height: 500 }, ...options })
const ticketOf = (html) => html.slice(html.indexOf('class="ev-ticket"'), html.indexOf("You're invited</h1>"))

test("Multideck fallback: white page and surface, quiet outline, teal action, Multideck mark", () => {
  const { html, subject } = render()
  assert.equal(subject, "You're invited: Christmas Party")
  assert.match(html, /<body class="ev-page" style="margin:0;padding:0;background:#FFFFFF;/)
  assert.match(html, /alt="Multideck"/)
  assert.match(html, /border-top:1px solid #D8DCDB/)
  assert.match(html, /background:#0E7D74;"[^>]*>\s*<a class="ev-action-ink" href="https:\/\/dev\.multideck\.app\/events\/7c5d278d-cb76-4590-8337-d2551da1d947"[^>]*>See event<\/a>/)
  assert.match(html, /src="cid:event-cover"/)
  assert.match(html, /Multideck · Private freight operations workspace/)
  assert.match(html, /<meta name="color-scheme" content="light dark">/)
})

test("the ticket keeps the Events layout: date stub, notches and a tear line that cannot collapse", () => {
  const ticket = ticketOf(render().html)
  assert.match(ticket, />Dec</)
  assert.match(ticket, /class="ev-day ev-date"[^>]*>11</)
  assert.match(ticket, />Fri</)
  assert.match(ticket, />19:00</)
  assert.equal((ticket.match(/rowspan="3"/g) ?? []).length, 2, "body and stub span the notch, tear and notch rows")
  // The tear-line row must carry real content or table layout gives it 0px.
  assert.match(ticket, /class="ev-tear ev-surface"[^>]*border-right:1px dashed [^;]+;font-size:1px;line-height:1px;">&nbsp;<\/td>/)
  assert.equal((ticket.match(/border-radius:0 0 9px 9px|border-radius:9px 9px 0 0/g) ?? []).length, 2)
})

test("tenant brand is honoured as saved: page, surface, accent, logo and sign-off", () => {
  const { html, text } = render({ brand })
  assert.match(html, /<body class="ev-page" style="margin:0;padding:0;background:#FBF7F3;/)
  assert.match(html, /alt="Harbour &amp; Finch"/)
  assert.match(html, /background:#B4532A;/)
  assert.match(html, /border-radius:18px 0 0 18px/)
  assert.doesNotMatch(html, /alt="Multideck"/)
  assert.match(text, /Harbour & Finch · People team/)
})

test("tenant background stays authoritative even when it matches the surface", () => {
  const { html } = render({ brand: { ...brand, backgroundColor: "#FFFFFF" } })
  assert.match(html, /<body class="ev-page" style="margin:0;padding:0;background:#FFFFFF;/)
  assert.match(html, /border-top:1px solid #/)
})

test("dark, sharp tenant: dark colour scheme, sharp corners, name mark and a readable date", () => {
  const dark = { ...brand, logoUrl: null, primaryColor: "#123456", backgroundColor: "#0F1716", surfaceColor: "#18221F", textColor: "#EEF4F2", cornerStyle: "sharp", emailSignOff: "", appearanceMode: "dark" }
  const { html, text } = render({ brand: dark })
  assert.match(html, /<meta name="color-scheme" content="dark">/)
  assert.match(html, /border-radius:3px 0 0 3px/)
  assert.match(html, /<span class="ev-ink" style="[^"]*font-size:15px;font-weight:600;line-height:20px;">Harbour &amp; Finch<\/span>/)
  // #123456 disappears on #18221F; the date falls back to the ink.
  assert.match(html, /class="ev-day ev-date" style="[^"]*color:#EEF4F2;/)
  assert.match(text, /Harbour & Finch · Sent with Multideck/)
})

const styleBlocks = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1])

test("light emails declare both schemes and carry their own dark version in a separate style block", () => {
  for (const options of [{}, { brand }]) {
    const { html } = render(options)
    assert.match(html, /<meta name="color-scheme" content="light dark">/)
    assert.match(html, /<meta name="supported-color-schemes" content="light dark">/)
    const [layout, dark] = styleBlocks(html)
    assert.match(layout, /max-width: 520px/)
    assert.doesNotMatch(layout, /prefers-color-scheme/, "a client that drops the dark block keeps the mobile rules")
    assert.match(dark, /@media \(prefers-color-scheme: dark\)/)
    assert.match(dark, /\[data-ogsc\] \.ev-ink, \[data-ogsc\] \.ev-notice \{ color: #F1F5F3 !important; \}/)
    assert.match(dark, /\[data-ogsb\] \.ev-page \{ background-color: #111315 !important; \}/)
    assert.match(dark, /\.ev-surface \{ background-color: #1B1E20 !important; \}/)
  }
  assert.match(styleBlocks(render().html)[1], /\.ev-action \{ background-color: #53B7AA !important; \}[\s\S]*\.ev-action-ink \{ color: #0B1413 !important; \}/)
})

test("every coloured element can be restyled for dark mode", () => {
  const { html } = render({ test: true, brand: { ...brand, logoUrl: null } })
  const body = html.slice(html.indexOf("<body"))
  const coloured = [...body.matchAll(/<(p|td|span|h1|a|div|body|table)\b([^>]*)style="([^"]*)"/g)]
    .filter(([, , , style]) => /(^|;)(color|background|background-color):/.test(style))
  assert.ok(coloured.length > 30)
  const unclassed = coloured.filter(([, , attributes]) => !/class="[^"]*\bev-/.test(attributes)).map(([tag]) => tag.slice(0, 90))
  assert.deepEqual(unclassed, [], "elements with inline colour but no dark-mode class")
})

test("a tenant's saved dark appearance stays dark: no light/dark swap", () => {
  const dark = { ...brand, logoUrl: null, backgroundColor: "#0F1716", surfaceColor: "#18221F", textColor: "#EEF4F2", appearanceMode: "dark" }
  const { html } = render({ brand: dark })
  assert.match(html, /<meta name="color-scheme" content="dark">/)
  assert.equal(styleBlocks(html).length, 1)
  assert.doesNotMatch(html, /prefers-color-scheme|data-ogs/)
})

test("dark mode lifts a tenant accent until it reads, keeping its hue", () => {
  const dark = styleBlocks(render({ brand: { ...brand, primaryColor: "#123456" } }).html)[1]
  const accent = dark.match(/\.ev-date \{ color: (#[0-9A-F]{6}) !important; \}/)[1]
  assert.notEqual(accent, "#123456")
  const channels = accent.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16))
  assert.ok(channels[2] > channels[1] && channels[1] > channels[0], `${accent} keeps the blue hue`)
})

test("logos sit on an inversion-proof backplate of the colour they were designed on", () => {
  const multideck = render().html
  assert.match(multideck, /<td class="ev-plate" style="padding:6px 9px;border-radius:9px;background-color:#FFFFFF;background-image:linear-gradient\(#FFFFFF,#FFFFFF\);"><img src="https:\/\/dev\.multideck\.app\/email\/multideck-logo\.png" alt="Multideck"/)
  assert.match(styleBlocks(multideck)[1], /\.ev-plate \{ background-color: #FFFFFF !important; \}/, "the plate keeps its colour in dark mode too")
  const tenant = render({ brand }).html
  assert.match(tenant, /class="ev-plate" style="[^"]*background-color:#FBF7F3;background-image:linear-gradient\(#FBF7F3,#FBF7F3\);"><img src="https:\/\/tenant\.supabase\.co\/[^"]+" alt="Harbour &amp; Finch"/)
  const sharp = render({ brand: { ...brand, cornerStyle: "sharp" } }).html
  assert.match(sharp, /class="ev-plate" style="padding:6px 9px;border-radius:2px;/)
  const nameOnly = render({ brand: { ...brand, logoUrl: null } }).html
  assert.doesNotMatch(nameOnly, /ev-plate"/, "text identities are inverted correctly and need no plate")
})

test("Open in maps is a quieter link to a Google Maps search for the encoded location", () => {
  const { html, text } = render()
  const href = "https://www.google.com/maps/search/?api=1&amp;query=The%20Glasshouse%2C%20Manchester"
  assert.match(html, new RegExp(`<a class="ev-date" href="${href.replace(/[?.]/g, "\\$&")}" style="[^"]*font-size:14px;font-weight:500;[^"]*text-decoration:underline;[^"]*">Open in maps</a>`))
  assert.ok(html.indexOf(">See event</a>") < html.indexOf(">Open in maps</a>"), "below the primary action")
  assert.match(text, /Open in maps: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=The%20Glasshouse%2C%20Manchester/)
  const hostile = render({ event: { ...event, location: `Pier 17 & "Dock" <b>#4</b>? javascript:alert(1)` } }).html
  const maps = hostile.match(/<a class="ev-date" href="([^"]+)"[^>]*>Open in maps/)[1]
  assert.equal(maps, "https://www.google.com/maps/search/?api=1&amp;query=Pier%2017%20%26%20%22Dock%22%20%3Cb%3E%234%3C%2Fb%3E%3F%20javascript%3Aalert(1)")
  const long = "The Grand Harbourside Conference Centre, Pier 17, 89 South Street, Seaport District, New York, NY 10038, United States".repeat(2)
  assert.ok(render({ event: { ...event, location: long } }).html.includes(encodeURIComponent(long)))
  const none = render({ event: { ...event, location: "   " } })
  assert.doesNotMatch(none.html, /Open in maps/)
  assert.doesNotMatch(none.text, /Open in maps/)
  assert.equal(template.companyEventMapsUrl(""), null)
})

test("Add to calendar uses the shared Google Calendar link, beside the quieter maps link", async () => {
  const { companyEventGoogleCalendarUrl } = await importTypeScriptGraph(new URL("../../shared/company-event-calendar.ts", import.meta.url))
  const expected = companyEventGoogleCalendarUrl({ title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone, location: event.location, details: event.details }, eventUrl)
  const { html, text } = render()
  const links = [...html.matchAll(/<a class="ev-date" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => [label, href])
  assert.deepEqual(links.map(([label]) => label), ["Add to calendar", "Open in maps"])
  assert.equal(links[0][1], expected.replaceAll("&", "&amp;").replaceAll('"', "&quot;"))
  assert.ok(html.indexOf(">See event</a>") < html.indexOf(">Add to calendar</a>"), "below the primary action")
  assert.ok(text.includes(`Add to calendar: ${expected}`))
  assert.doesNotMatch(html + text, /event\.ics/, "the attachment note appears only when delivery attaches one")
  const attached = render({ calendarAttachment: true })
  assert.match(attached.html, /<p class="ev-subtle"[^>]*>For Apple Calendar or Outlook, open the attached event\.ics file\.<\/p>/)
  assert.match(attached.text, /For Apple Calendar or Outlook, open the attached event\.ics file\./)
})

test("no image, no host, no details and no end time still render a complete invitation", () => {
  const { html, text } = render({ image: null, event: { ...event, endsAt: null, hostName: null, details: "", formFieldCount: 0 } })
  assert.doesNotMatch(html, /<img[^>]+cid:/)
  assert.doesNotMatch(html, />Host</)
  assert.doesNotMatch(html, />About</)
  assert.match(html, /Fri 11 Dec · 19:00 GMT/)
  assert.match(text, /RSVP: Yes, maybe or no — one tap/)
  assert.match(text, /let the organiser know/)
})

test("the full details are included, paragraphs and line breaks intact", () => {
  const details = Array.from({ length: 160 }, (_, index) => `Paragraph ${index} explains the plan in detail.\nSecond line ${index}.`).join("\n\n").slice(0, 8000)
  const { html, text } = render({ event: { ...event, details } })
  const last = details.trim().split("\n").at(-1)
  assert.ok(html.includes(last) && text.includes(last), "nothing is cut off")
  assert.equal((html.match(/<p class="ev-text" style="margin:0 0 12px;/g) ?? []).length, details.split(/\n{2,}/).length)
  assert.match(html, /Paragraph 0 explains the plan in detail\.<br>Second line 0\./)
  assert.ok(text.includes(details))
  assert.doesNotMatch(html, /Read the full details/)
})

test("every piece of event and brand data is escaped", () => {
  const hostile = '<script>alert(1)</script>"><img src=x onerror=alert(2)>'
  const { html, subject } = render({
    event: { ...event, title: hostile, location: hostile, details: hostile, hostName: hostile, companyName: hostile },
    brand: { ...brand, displayName: hostile, emailSignOff: hostile },
  })
  assert.doesNotMatch(html, /<script>|<img src=x/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.equal(subject, `You're invited: ${hostile}`, "the subject is a header, not HTML")
})

test("the event's own timezone is named, and a multi-day event says when it ends", () => {
  const { text } = render({ event: { ...event, startsAt: "2027-01-15T22:00:00Z", endsAt: "2027-01-17T17:00:00Z", timezone: "America/New_York" } })
  assert.match(text, /When: Friday 15 January 2027, 17:00 New York time, until Sunday 17 January 2027, 12:00/)
})

test("en-GB is the default; en-US changes date order, the clock and spelling", () => {
  const gb = render({ image: null, event: { ...event, hostName: null } })
  const us = render({ image: null, event: { ...event, hostName: null }, locale: "en-US" })
  assert.match(gb.html, /<html lang="en-GB"/)
  assert.match(gb.text, /When: Friday 11 December 2026, 19:00–23:30 GMT/)
  assert.match(gb.text, /organiser/)
  assert.match(us.html, /<html lang="en-US"/)
  assert.match(us.text, /When: Friday, December 11, 2026, 7:00 PM–11:30 PM GMT/)
  assert.match(us.html, /Fri, Dec 11 · 7:00 PM–11:30 PM GMT/)
  assert.match(us.text, /organizer/)
  assert.doesNotMatch(us.text, /organiser/)
  assert.equal(template.companyEventInvitationLocale("fr-FR"), "en-GB")
})

test("a test render is labelled in the subject, the body and the text version", () => {
  const { subject, html, text } = render({ test: true })
  assert.equal(subject, "Test: You're invited: Christmas Party")
  assert.match(html, /Test email\.<\/strong> Only you received this/)
  assert.match(text, /^TEST EMAIL/)
})

test("event invitations have their own email preference, and the footer promises nothing beyond it", () => {
  const preferences = readFileSync(new URL("../../multideck.client/src/lib/notification-preferences.ts", import.meta.url), "utf8")
  const settings = readFileSync(new URL("../../multideck.client/src/pages/settings-page.tsx", import.meta.url), "utf8")
  assert.match(preferences, /"company_event_invitation",\n\] as const/)
  assert.match(preferences, /company_event_invitation: true,/)
  assert.match(settings, /checked=\{preferences\.company_event_invitation\}[\s\S]{0,120}setEmailPreference\("company_event_invitation"/)
  // The footer must stay true before the Settings toggle ships.
  const { text } = render()
  assert.match(text, /You're receiving this because you were invited to a Databrain event in Multideck\./)
  assert.doesNotMatch(text, /turn off|settings/i)
})

test("deep links come only from the configured tenant origin and fail closed", () => {
  const { trustedTenantOrigin, companyEventUrl } = delivery
  assert.equal(trustedTenantOrigin("https://dev.multideck.app", "dev.multideck.app"), "https://dev.multideck.app")
  assert.equal(trustedTenantOrigin("https://jenkar.multideck.app/", undefined), "https://jenkar.multideck.app")
  assert.equal(trustedTenantOrigin("http://localhost:3000", undefined), "http://localhost:3000")
  for (const [appUrl, host] of [
    [undefined, undefined], ["", "dev.multideck.app"], ["https://multideck.app", undefined],
    ["http://dev.multideck.app", undefined], ["https://dev.multideck.app.evil.test", undefined],
    ["https://user:pass@dev.multideck.app", undefined], ["https://dev.multideck.app/app", undefined],
    ["https://jenkar.multideck.app", "dev.multideck.app"], ["javascript:alert(1)", undefined],
  ]) assert.throws(() => trustedTenantOrigin(appUrl, host), undefined, `${appUrl} / ${host}`)
  assert.equal(companyEventUrl("https://dev.multideck.app", eventId.toUpperCase()), eventUrl)
  assert.throws(() => companyEventUrl("https://dev.multideck.app", "../admin"))
})

function storage(responses) {
  const calls = []
  return {
    calls,
    from(bucket) {
      return { async download(path, options) { calls.push({ bucket, path, options }); return responses.shift() ?? { data: null, error: Error("missing") } } }
    },
  }
}
const coverPath = `${userId}/${eventId}.webp`

test("the private cover is attached inline, cropped when transforms are available", async () => {
  const store = storage([{ data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), error: null }])
  const cover = await delivery.loadCompanyEventCover(store, coverPath)
  assert.equal(store.calls[0].bucket, "company-event-images")
  assert.deepEqual(store.calls[0].options.transform, { width: 1200, height: 500, resize: "cover", quality: 80 })
  assert.deepEqual(cover, { attachment: { content: "AQID", filename: "event-cover.webp", content_id: "event-cover", content_type: "image/webp" }, size: { width: 1200, height: 500 } })
})

test("without transforms the original is used, and unusable covers never block the invitation", async () => {
  const fallback = storage([{ data: null, error: Error("transformations disabled") }, { data: new Blob([new Uint8Array([9])], { type: "application/octet-stream" }), error: null }])
  const original = await delivery.loadCompanyEventCover(fallback, coverPath.replace(".webp", ".jpg"))
  assert.equal(fallback.calls[1].options, undefined)
  assert.equal(original.attachment.content_type, "image/jpeg")
  assert.equal(original.size, null)
  const huge = new Blob([new Uint8Array(delivery.COMPANY_EVENT_COVER_MAX_BYTES + 1)], { type: "image/png" })
  assert.equal(await delivery.loadCompanyEventCover(storage([{ data: huge, error: null }, { data: huge, error: null }]), coverPath), null)
  const untouched = storage([])
  assert.equal(await delivery.loadCompanyEventCover(untouched, "../../tenant-brand-assets/logo.png"), null)
  assert.equal(await delivery.loadCompanyEventCover(untouched, null), null)
  assert.equal(untouched.calls.length, 0)
})

function admin({ context, rpcError = null, brandRow = null } = {}) {
  const rpcCalls = []
  const query = { select() { return query }, eq() { return query }, order() { return query }, limit() { return query }, maybeSingle: async () => ({ data: brandRow, error: null }) }
  return {
    rpcCalls,
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: context, error: rpcError } },
    from: () => query,
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array([1])], { type: "image/png" }), error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://tenant.supabase.co/storage/v1/object/public/tenant-brand-assets/${path}` } }),
      }),
    },
  }
}
const context = { ...event, id: eventId, companyId, imagePath: coverPath, status: "published", editVersion: 4 }
const prepare = (client, overrides = {}) => delivery.prepareCompanyEventInvitation({
  admin: client, eventId, userId, purpose: "invitation", appUrl: "https://dev.multideck.app", tenantHost: "dev.multideck.app",
  now: new Date("2026-12-01T00:00:00Z"), ...overrides,
})

test("the database decides eligibility; nothing renders for an event the colleague cannot receive", async () => {
  const client = admin({ context: null })
  assert.deepEqual(await prepare(client), { skipped: "event_unavailable" })
  assert.deepEqual(client.rpcCalls, [{ name: "company_event_invitation_email_context", args: { p_event_id: eventId, p_user_id: userId, p_purpose: "invitation" } }])
  await assert.rejects(prepare(admin({ context: null, rpcError: Error("db down") })), /could not be checked/)
  assert.deepEqual(await prepare(admin({ context }), { now: new Date("2026-12-12T00:00:00Z") }), { skipped: "event_finished" })
  assert.deepEqual(await prepare(admin({ context }), { eventId: "not-a-uuid" }), { skipped: "event_unavailable" })
  await assert.rejects(prepare(admin({ context }), { appUrl: "https://evil.example" }), /trusted tenant app origin/)
})

test("a prepared invitation links to the tenant event, embeds the cover and records the template", async () => {
  const result = await prepare(admin({ context }))
  assert.equal(result.message.subject, "You're invited: Christmas Party")
  assert.match(result.message.html, new RegExp(`href="${eventUrl}"`))
  assert.match(result.message.html, /src="cid:event-cover"/)
  assert.equal(result.message.attachments[0].content_id, "event-cover")
  const calendar = result.message.attachments.find((attachment) => attachment.filename === "event.ics")
  assert.ok(calendar, "The delivered email includes the promised calendar attachment")
  assert.match(Buffer.from(calendar.content, "base64").toString("utf8"), /BEGIN:VCALENDAR/)
  assert.match(result.message.html, /open the attached event\.ics file/)
  assert.deepEqual(result.message.receipt, { template: "company_event_invitation", event_edit_version: 4, cover: "inline" })
  const test = await prepare(admin({ context: { ...context, status: "draft" } }), { purpose: "test", locale: "en-US" })
  assert.match(test.message.subject, /^Test: /)
  assert.match(test.message.html, /<html lang="en-US"/)
})

test("SVG tenant logos fall back to the company name, which email clients can always show", async () => {
  const brandRow = { Brand_ID: "brand", Brand_Name: "Jenkar", Brand_DisplayName: "Jenkar", Brand_WebsiteURL: null, Brand_PrimaryColor: "#224466", Brand_UpdatedAt: null,
    Brand_TemplateSettingsJSON: { tenantBranding: { version: 1, configured: true, logoPath: "company/logo.svg", logoMimeType: "image/svg+xml", primaryColor: "#224466" } } }
  const svg = await prepare(admin({ context, brandRow }))
  assert.doesNotMatch(svg.message.html, /logo\.svg/)
  assert.match(svg.message.html, />Jenkar<\/span>/)
  const fallback = await prepare(admin({ context, brandRow }), { purpose: "test", testBranding: "multideck" })
  assert.match(fallback.message.html, /email\/multideck-logo\.png/)
  assert.doesNotMatch(fallback.message.html, />Jenkar<\/span>/)
  const normal = await prepare(admin({ context, brandRow }), { testBranding: "multideck" })
  assert.match(normal.message.html, />Jenkar<\/span>/)
  const png = await prepare(admin({ context, brandRow: { ...brandRow, Brand_TemplateSettingsJSON: { tenantBranding: { ...brandRow.Brand_TemplateSettingsJSON.tenantBranding, logoPath: "company/logo.png", logoMimeType: "image/png" } } } }))
  assert.match(png.message.html, /tenant-brand-assets\/company\/logo\.png" alt="Jenkar"/)
})

// Edge Function: the real handler with its imports replaced by recorded stubs.
const source = readFileSync(new URL("../functions/send-notification-email/index.ts", import.meta.url), "utf8").replace(/^import .*\n/gm, "")
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

function edge({ user = true, metadata = { event_type: "company_event_invitation" }, preference = null, prepared, auditError = null } = {}) {
  let handler
  const sends = [], prepares = [], audits = [], receipts = []
  const notification = { CommNotif_ID: "notification-1", CommNotif_UserID: "recipient", CommNotif_Title: "You're invited: Christmas Party", CommNotif_Body: "Open Events", CommNotif_MetadataJSON: metadata, CommNotif_TargetTable: "company_events", CommNotif_TargetID: eventId }
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: "auth-user", email: "auth@example.invalid" } : null }, error: null }) },
    rpc: async () => ({ data: "webhook-secret", error: null }),
    from(table) {
      let update, insert
      const result = () => table === "company_event_audit" ? { data: null, error: auditError }
        : table === "Comm_Notifications" ? update ? { data: null, error: null } : { data: notification, error: null }
        : table === "cmp_Users" ? { data: { User_ID: userId, User_Email: "harry@example.invalid", Company_ID: companyId }, error: null }
        : { data: preference === null ? null : { CommNotifPref_IsEnabled: preference }, error: null }
      const query = {
        select() { return query }, eq() { if (update) receipts.push(update); return query },
        update(value) { update = value; return query },
        insert(value) { insert = value; audits.push(value); return query },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }
      void insert
      return query
    },
  }
  const message = { subject: "Test: You're invited: Christmas Party", html: "<html>", text: "text", attachments: [{ content: "AQID", filename: "event-cover.png", content_id: "event-cover", content_type: "image/png" }], receipt: { template: "company_event_invitation", event_edit_version: 4, cover: "inline" } }
  vm.runInNewContext(code, {
    Deno: { env: { get: (name) => ({ SUPABASE_URL: "https://tenant.supabase.co", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "service-key", RESEND_API_KEY: "test-key", APP_URL: "https://dev.multideck.app", MULTIDECK_TENANT_HOST: "dev.multideck.app" })[name] }, serve: (value) => { handler = value } },
    createClient: () => client, normaliseLocale: () => "en",
    renderBrandedEmail: () => ({ html: "generic", text: "generic" }), readConfiguredTenantBrand: async () => null,
    isUuid: delivery.isUuid,
    prepareCompanyEventInvitation: async (input) => { prepares.push(input); return prepared ?? { message, context: { id: eventId, companyId, editVersion: 4 } } },
    MULTIDECK_EMAIL_FROM: "Multideck <support@multideck.co.uk>", MULTIDECK_EMAIL_REPLY_TO: "support@multideck.co.uk",
    fetch: async (_url, options) => { sends.push({ headers: options.headers, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ id: "provider-1" }), { status: 200 }) },
    Request, Response, URL, AbortSignal, Date, Math, console: { error() {} },
  })
  const call = (body, bearer = user ? "user-token" : "service-key") => handler(new Request("https://tenant.supabase.co/functions/v1/send-notification-email", {
    method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }))
  return { sends, prepares, audits, receipts, call }
}
const requestId = "fa823bcc-71df-42cb-b6b7-980fd67f8e73"

test("a test send goes only to the signed-in colleague, once per requestId, and is audited", async () => {
  const h = edge()
  const response = await h.call({ action: "event_invitation_test", eventId, requestId, locale: "en-GB", branding: "multideck", to: "everyone@example.invalid" })
  assert.equal(response.status, 200)
  assert.equal(h.sends.length, 1)
  assert.deepEqual(h.sends[0].body.to, ["harry@example.invalid"])
  assert.match(h.sends[0].body.subject, /^Test: /)
  assert.equal(h.sends[0].headers["Idempotency-Key"], `event-invitation-test/${eventId}/${userId}/${requestId}`)
  assert.equal(h.sends[0].body.attachments[0].content_id, "event-cover")
  assert.equal(h.prepares[0].purpose, "test")
  assert.equal(h.prepares[0].userId, userId)
  assert.equal(h.prepares[0].locale, "en-GB")
  assert.equal(h.prepares[0].testBranding, "multideck")
  assert.equal(h.prepares[0].tenantHost, "dev.multideck.app")
  assert.deepEqual({ ...h.audits[0], details: { ...h.audits[0].details } }, {
    company_id: companyId, event_id: eventId, actor_id: userId, kind: "invitation_test_emailed",
    details: { recipient: "self", requestId, resendId: "provider-1", editVersion: 4, cover: "inline" },
  })
})

test("test sends need a user session, a real event reference and an event the caller may see", async () => {
  const service = edge({ user: false })
  assert.equal((await service.call({ action: "event_invitation_test", eventId })).status, 403)
  const h = edge()
  assert.equal((await h.call({ action: "event_invitation_test", eventId: "x" })).status, 400)
  assert.equal((await h.call({ action: "event_invitation_test", eventId, requestId: "nope" })).status, 400)
  const hidden = edge({ prepared: { skipped: "event_unavailable" } })
  assert.equal((await hidden.call({ action: "event_invitation_test", eventId })).status, 404)
  assert.equal(service.sends.length + h.sends.length + hidden.sends.length, 0)
  const unaudited = edge({ auditError: Error("db down") })
  assert.equal((await unaudited.call({ action: "event_invitation_test", eventId, requestId })).status, 500)
})

test("published invitations use the event email, the notification idempotency key and a receipt", async () => {
  const h = edge({ user: false })
  const response = await h.call({ action: "dispatch", notificationId: "notification-1" })
  assert.equal(response.status, 200)
  assert.equal(h.prepares[0].purpose, "invitation")
  assert.equal(h.prepares[0].eventId, eventId)
  assert.equal(h.sends[0].headers["Idempotency-Key"], "notification/notification-1")
  assert.deepEqual(h.sends[0].body.to, ["harry@example.invalid"])
  assert.equal(h.receipts[0].CommNotif_MetadataJSON.email_delivery.template, "company_event_invitation")
  assert.equal(h.receipts[0].CommNotif_MetadataJSON.email_delivery.resend_id, "provider-1")
})

test("invitation email respects the preference, historical in-app-only rows and send-time eligibility", async () => {
  const off = edge({ user: false, preference: false })
  assert.equal((await (await off.call({ action: "dispatch", notificationId: "notification-1" })).json()).skipped, "preference_disabled")
  const historical = edge({ user: false, metadata: { event_type: "company_event_invitation", in_app_only: true } })
  assert.equal((await (await historical.call({ action: "dispatch", notificationId: "notification-1" })).json()).skipped, "in_app_only")
  const removed = edge({ user: false, prepared: { skipped: "event_unavailable" } })
  assert.equal((await (await removed.call({ action: "dispatch", notificationId: "notification-1" })).json()).skipped, "event_unavailable")
  const sent = edge({ user: false, metadata: { event_type: "company_event_invitation", email_delivery: { resend_id: "earlier" } } })
  assert.equal((await (await sent.call({ action: "dispatch", notificationId: "notification-1" })).json()).skipped, "already_accepted")
  assert.equal(off.sends.length + historical.sends.length + removed.sends.length + sent.sends.length, 0)
  assert.equal(off.prepares.length + historical.prepares.length + sent.prepares.length, 0)
  const users = edge({ user: true })
  assert.equal((await users.call({ action: "dispatch", notificationId: "notification-1" })).status, 403)
})
