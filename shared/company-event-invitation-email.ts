import { escapeHtml, type EmailBrand } from "./branded-email.ts"
import { companyEventGoogleCalendarUrl } from "./company-event-calendar.ts"

/**
 * Company event invitation email. Tenant-brandable by explicit product
 * decision: it carries the workspace's own event to its own colleagues. It is
 * not an account or security invitation — those stay on the Multideck template.
 *
 * Presentation only: no backend clients, environment reads or network access.
 * Every URL passed in must already be validated by the caller.
 */
export type CompanyEventInvitationLocale = "en-GB" | "en-US"

export function companyEventInvitationLocale(value: unknown): CompanyEventInvitationLocale {
  return value === "en-US" ? "en-US" : "en-GB"
}

export type CompanyEventInvitationBrand = EmailBrand & { appearanceMode?: "light" | "dark" }

export type CompanyEventInvitationEvent = {
  title: string
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string
  details: string
  companyName?: string | null
  hostName?: string | null
  formFieldCount?: number
}

export type CompanyEventInvitationEmailOptions = {
  event: CompanyEventInvitationEvent
  /** The trusted tenant deep link to the event detail page. */
  eventUrl: string
  /** `cid:` reference for an attached cover, or a trusted https URL. */
  image?: { src: string; width?: number; height?: number } | null
  /** Omit for the fixed Multideck fallback. */
  brand?: CompanyEventInvitationBrand | null
  /** Multideck mark shown when no tenant brand is configured. */
  multideckLogoUrl: string
  /** Self-addressed test render: labelled in the subject and the body. */
  test?: boolean
  /** en-GB by default; en-US changes date order, the clock and spelling. */
  locale?: CompanyEventInvitationLocale
  /** Delivery attached event.ics: say so for Apple Calendar and Outlook users. */
  calendarAttachment?: boolean
}

const font = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const ticketWidth = 600
const stubWidth = 132
const perforationWidth = 18
const notchDepth = 9
const inset = 9

type Rgb = [number, number, number]

function rgb(hex: string): Rgb | null {
  const value = hex.replace(/^#/, "")
  if (!/^[0-9a-f]{6}$/i.test(value)) return null
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as Rgb
}

function hex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("").toUpperCase()}`
}

/** `amount` of `top` over `base`, as a solid colour email clients can render. */
function mix(top: string, base: string, amount: number) {
  const a = rgb(top), b = rgb(base)
  if (!a || !b) return base
  return hex([0, 1, 2].map((index) => a[index] * amount + b[index] * (1 - amount)) as Rgb)
}

function luminance(color: string) {
  const channels = rgb(color)
  if (!channels) return 1
  const [r, g, b] = channels.map((channel) => channel / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(left: string, right: string) {
  const [light, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

function buttonInk(background: string) {
  return contrast("#FFFFFF", background) >= contrast("#0B1413", background) ? "#FFFFFF" : "#0B1413"
}

/** The tenant accent where it reads on the surface; otherwise the ink, so the date never disappears. */
function readableAccent(accent: string, surface: string, ink: string) {
  return contrast(accent, surface) >= 3 ? accent : ink
}

function palette(brand: CompanyEventInvitationBrand | null | undefined) {
  if (!brand) {
    // Fixed Multideck fallback: white page and surfaces, teal action, dark text.
    return {
      page: "#FFFFFF", surface: "#FFFFFF", ink: "#1F2524", text: "#4A5250", subtle: "#747C7A",
      line: "#E1E4E3", edge: "#D8DCDB", perforation: "#C4CAC8", accent: "#0E7D74", date: "#0E7D74", dark: false,
      outer: 18, innerImage: 9, button: 12,
    }
  }
  const page = brand.backgroundColor
  const surface = brand.surfaceColor
  const ink = brand.textColor
  const dark = brand.appearanceMode === "dark" || luminance(page) < 0.18
  const sharp = brand.cornerStyle === "sharp"
  return {
    page,
    surface,
    ink,
    text: mix(ink, page, 0.82),
    subtle: mix(ink, page, 0.62),
    line: mix(ink, page, 0.14),
    edge: mix(ink, surface, dark ? 0.2 : 0.16),
    perforation: mix(ink, surface, 0.3),
    accent: brand.primaryColor,
    date: readableAccent(brand.primaryColor, surface, ink),
    dark,
    outer: sharp ? 3 : 18,
    innerImage: sharp ? 2 : 9,
    button: sharp ? 2 : 12,
  }
}

/** Lightens a brand accent until it reads on a dark surface, keeping its hue. */
function liftAccent(accent: string, surface: string) {
  for (let amount = 0; amount <= 0.8; amount += 0.1) {
    const candidate = mix("#FFFFFF", accent, amount)
    if (contrast(candidate, surface) >= 3) return candidate
  }
  return "#F1F5F3"
}

/**
 * Email-client dark mode, for light-appearance emails only. Used where the
 * client honours prefers-color-scheme or Outlook.com's dark selectors, so it
 * renders a designed dark version instead of auto-inverting. Neutrals follow
 * the Multideck dark tokens; the tenant accent keeps its hue.
 */
function darkPalette(light: ReturnType<typeof palette>, brand: CompanyEventInvitationBrand | null | undefined) {
  const page = "#111315", surface = "#1B1E20"
  const accent = brand ? liftAccent(light.accent, surface) : "#53B7AA"
  return {
    page, surface, ink: "#F1F5F3", text: "#BAC2BF", subtle: "#909B97",
    line: "#2C3133", edge: "#3A4043", perforation: "#50585A",
    accent, date: accent, notice: mix(accent, page, 0.16),
  }
}

type DateParts = { weekday: string; weekdayShort: string; day: string; month: string; monthShort: string; year: string; time: string; zone: string; dateKey: string }

function parts(value: Date, timeZone: string, locale: CompanyEventInvitationLocale): DateParts {
  const pick = (options: Intl.DateTimeFormatOptions) => {
    const map: Record<string, string> = {}
    for (const part of new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatToParts(value)) map[part.type] = part.value
    return map
  }
  const long = pick({ weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const short = pick({ weekday: "short", month: "short" })
  const clock = locale === "en-US"
    ? pick({ hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })
    : pick({ hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" })
  const zoneName = clock.timeZoneName ?? ""
  // "GMT+8" says little; name the event's own city instead.
  const zone = /^(GMT|UTC)[+-]/.test(zoneName)
    ? `${(timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")} time`
    : zoneName
  return {
    weekday: long.weekday, weekdayShort: short.weekday, day: long.day, month: long.month,
    monthShort: short.month, year: long.year,
    time: locale === "en-US" ? `${clock.hour}:${clock.minute} ${(clock.dayPeriod ?? "").toUpperCase()}`.trim() : `${clock.hour}:${clock.minute}`,
    zone,
    dateKey: new Intl.DateTimeFormat("en-CA", { timeZone }).format(value),
  }
}

export function companyEventInvitationWhen(event: Pick<CompanyEventInvitationEvent, "startsAt" | "endsAt" | "timezone">, locale: CompanyEventInvitationLocale = "en-GB") {
  const start = new Date(event.startsAt)
  if (Number.isNaN(start.getTime())) throw new Error("The event start time is not valid")
  let timeZone = event.timezone
  try { new Intl.DateTimeFormat("en-GB", { timeZone }) } catch { timeZone = "Europe/London" }
  const end = event.endsAt ? new Date(event.endsAt) : null
  const from = parts(start, timeZone, locale)
  const until = end && !Number.isNaN(end.getTime()) && end > start ? parts(end, timeZone, locale) : null
  const sameDay = until?.dateKey === from.dateKey
  const us = locale === "en-US"
  const longDate = (value: DateParts) => us
    ? `${value.weekday}, ${value.month} ${value.day}, ${value.year}`
    : `${value.weekday} ${value.day} ${value.month} ${value.year}`
  const shortDate = (value: DateParts) => us
    ? `${value.weekdayShort}, ${value.monthShort} ${value.day}`
    : `${value.weekdayShort} ${value.day} ${value.monthShort}`
  const range = until && sameDay ? `${from.time}–${until.time} ${from.zone}` : `${from.time} ${from.zone}`
  return {
    stub: { month: from.monthShort, day: from.day, weekday: from.weekdayShort, time: from.time },
    /** One line for the ticket. */
    compact: until && !sameDay
      ? `${shortDate(from)}, ${from.time} – ${shortDate(until)}, ${until.time} ${until.zone}`
      : `${shortDate(from)} · ${range}`,
    /** Full date, then time, for the details list. */
    lines: until && !sameDay
      ? [`${longDate(from)}, ${from.time} ${from.zone}`, `until ${longDate(until)}, ${until.time}`]
      : [longDate(from), range],
  }
}

function paragraphsHtml(text: string, className: string, style: string) {
  return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .map((paragraph) => `<p class="${className}" style="${style}">${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("")
}

/** The shared pre-filled Google Calendar link, used only if it really is one. */
function googleCalendarUrl(event: CompanyEventInvitationEvent, eventUrl: string) {
  try {
    const href = companyEventGoogleCalendarUrl({
      title: event.title, startsAt: event.startsAt, endsAt: event.endsAt,
      timezone: event.timezone, location: event.location, details: event.details ?? "",
    }, eventUrl)
    const url = new URL(href)
    return url.protocol === "https:" && url.hostname === "calendar.google.com" && !url.username && !url.password ? href : null
  } catch {
    return null
  }
}

/** Google Maps' documented search URL; only the location text varies, and it is encoded. */
export function companyEventMapsUrl(location: string) {
  const query = location.trim()
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}

function rsvpSummary(count: number | undefined) {
  if (!count) return "Yes, maybe or no — one tap"
  return count === 1 ? "Your answer and one short question" : `Your answer and ${count} short questions`
}

export function renderCompanyEventInvitationEmail(options: CompanyEventInvitationEmailOptions) {
  const { event, brand } = options
  const c = palette(brand)
  const locale = companyEventInvitationLocale(options.locale)
  const organiser = locale === "en-US" ? "organizer" : "organiser"
  const when = companyEventInvitationWhen(event, locale)
  const title = event.title.trim() || "Company event"
  const location = event.location.trim()
  const host = event.hostName?.trim() || null
  const company = brand?.displayName?.trim() || event.companyName?.trim() || null
  // Every word the organiser wrote. The database caps details at 8,000 characters.
  const details = (event.details ?? "").replace(/\r\n?/g, "\n").trim()
  const subject = `${options.test ? "Test: " : ""}You're invited: ${title}`
  const preview = [when.compact, location, host ? `Hosted by ${host}` : null].filter(Boolean).join(" · ")
  const url = escapeHtml(options.eventUrl)
  const mapsUrl = companyEventMapsUrl(event.location)
  const calendarUrl = googleCalendarUrl(event, options.eventUrl)
  const image = options.image?.src ? options.image : null
  const imageWidth = ticketWidth - stubWidth - perforationWidth - inset * 2
  const imageHeight = image?.width && image?.height ? Math.round(imageWidth * image.height / image.width) : null
  const intro = host
    ? `${host} has invited you${company ? ` to a ${company} event` : ""}. Have a look and let them know if you can make it.`
    : `You're invited${company ? ` to a ${company} event` : ""}. Have a look and let the ${organiser} know if you can make it.`
  const fontStyle = `font-family:${font};`
  const edge = `1px solid ${c.line}`
  const d = c.dark ? null : darkPalette(c, brand)
  const muted = mix(c.ink, c.surface, 0.8)
  const faint = mix(c.ink, c.surface, 0.6)

  // Logos keep the background they were designed on. Gmail's dark mode inverts
  // colours but leaves images and background images alone, so a transparent
  // dark logo would sit dark-on-dark. A compact backplate painted as a solid
  // gradient keeps its colour there; in normal viewing it matches the page and
  // disappears. Text-only identities need no plate: text is inverted properly.
  const plateColor = brand ? brand.backgroundColor : "#FFFFFF"
  const plate = (image: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td class="ev-plate" style="padding:6px ${inset}px;border-radius:${c.innerImage}px;background-color:${plateColor};background-image:linear-gradient(${plateColor},${plateColor});">${image}</td></tr></table>`
  const identity = brand
    ? brand.logoUrl
      ? plate(`<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.displayName)}" height="32" style="display:block;height:32px;max-height:32px;width:auto;max-width:180px;border:0;">`)
      : `<span class="ev-ink" style="${fontStyle}color:${c.ink};font-size:15px;font-weight:600;line-height:20px;">${escapeHtml(brand.displayName)}</span>`
    : plate(`<img src="${escapeHtml(options.multideckLogoUrl)}" alt="Multideck" width="112" height="24" style="display:block;width:112px;height:24px;border:0;">`)
  const identityPadding = brand && !brand.logoUrl ? `0 2px 20px` : `0 0 14px`

  const testNotice = options.test
    ? `<tr><td style="padding:0 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="ev-notice" style="border-radius:${c.button}px;background:${mix(c.accent, c.page, 0.1)};padding:10px 14px;${fontStyle}color:${c.ink};font-size:13px;line-height:19px;"><strong style="font-weight:600;">Test email.</strong> Only you received this. Nobody on the guest list has been sent anything.</td></tr></table></td></tr>`
    : ""

  const imageHtml = image
    ? `<tr><td style="padding:0 0 4px;"><img src="${escapeHtml(image.src)}" alt="" width="${imageWidth}"${imageHeight ? ` height="${imageHeight}"` : ""} class="ev-cover" style="display:block;width:100%;max-width:${imageWidth}px;height:auto;border:0;border-radius:${c.innerImage}px;background:${c.line};"></td></tr>`
    : ""

  // Ticket: body | perforation | stub, as on the Events page, with a quiet
  // outline drawn by cell borders so it follows the corners and notches. The
  // perforation column has three rows: a notch, the dashed tear line and a
  // notch. The notch rows are fixed-height; the tear-line row is auto and
  // carries 1px of content, so table layout gives it all the height the body
  // and stub add (an empty auto row would collapse to 0px and lose the line).
  const outline = `1px solid ${c.edge}`
  const half = perforationWidth / 2
  const notch = (at: "top" | "bottom") => `<td class="ev-surface" colspan="2" width="${perforationWidth}" height="${notchDepth}" valign="${at}" style="width:${perforationWidth}px;height:${notchDepth}px;padding:0;background:${c.surface};font-size:0;line-height:0;">
      <div class="ev-page ev-edge" style="width:${perforationWidth - 2}px;height:${notchDepth - 1}px;background:${c.page};border:${outline};border-${at}:0;border-radius:${at === "top" ? `0 0 ${half}px ${half}px` : `${half}px ${half}px 0 0`};font-size:0;line-height:0;"></div>
    </td>`
  const ticket = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ev-ticket" style="width:100%;border-collapse:separate;border-spacing:0;">
  <tr>
    <td class="ev-surface ev-edge" rowspan="3" valign="bottom" style="border-top:${outline};border-bottom:${outline};border-left:${outline};border-radius:${c.outer}px 0 0 ${c.outer}px;background:${c.surface};padding:${inset}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${imageHtml}
        <tr><td class="ev-ticket-copy" style="padding:${image ? "14px 10px 6px" : "20px 12px 10px"};">
          <p class="ev-title ev-ink" style="margin:0;${fontStyle}color:${c.ink};font-size:20px;font-weight:500;line-height:26px;letter-spacing:-0.01em;word-break:break-word;">${escapeHtml(title)}</p>
          <p class="ev-muted" style="margin:6px 0 0;${fontStyle}color:${muted};font-size:13px;line-height:19px;">${escapeHtml(when.compact)}</p>
          <p class="ev-muted" style="margin:2px 0 0;${fontStyle}color:${muted};font-size:13px;line-height:19px;word-break:break-word;">${escapeHtml(location)}</p>
        </td></tr>
      </table>
    </td>
    ${notch("top")}
    <td rowspan="3" width="${stubWidth}" align="center" valign="middle" class="ev-stub ev-surface ev-edge" style="width:${stubWidth}px;border-top:${outline};border-bottom:${outline};border-right:${outline};border-radius:0 ${c.outer}px ${c.outer}px 0;background:${c.surface};padding:20px 8px;text-align:center;">
      <p class="ev-muted" style="margin:0;${fontStyle}color:${muted};font-size:12px;font-weight:500;line-height:16px;">${escapeHtml(when.stub.month)}</p>
      <p class="ev-day ev-date" style="margin:2px 0;${fontStyle}color:${c.date};font-size:40px;font-weight:500;line-height:44px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;">${escapeHtml(when.stub.day)}</p>
      <p class="ev-faint" style="margin:0;${fontStyle}color:${faint};font-size:12px;line-height:16px;">${escapeHtml(when.stub.weekday)}</p>
      <p class="ev-muted" style="margin:18px 0 0;${fontStyle}color:${muted};font-size:12px;line-height:16px;font-variant-numeric:tabular-nums;">${escapeHtml(when.stub.time)}</p>
    </td>
  </tr>
  <tr>
    <td class="ev-tear ev-surface" width="${half}" style="width:${half}px;padding:0;background:${c.surface};border-right:1px dashed ${c.perforation};font-size:1px;line-height:1px;">&nbsp;</td>
    <td class="ev-surface" width="${half}" style="width:${half}px;padding:0;background:${c.surface};font-size:1px;line-height:1px;">&nbsp;</td>
  </tr>
  <tr>
    ${notch("bottom")}
  </tr>
</table>`

  const label = `${fontStyle}color:${c.subtle};font-size:13px;line-height:20px;`
  const value = `${fontStyle}color:${c.ink};font-size:14px;line-height:21px;word-break:break-word;`
  const row = (name: string, content: string, first = false) => `<tr>
    <td class="ev-label ev-subtle${first ? "" : " ev-line"}" width="96" valign="top" style="width:96px;padding:12px 16px 12px 0;${first ? "" : `border-top:${edge};`}${label}">${name}</td>
    <td class="ev-value ev-ink${first ? "" : " ev-line"}" valign="top" style="padding:12px 0;${first ? "" : `border-top:${edge};`}${value}">${content}</td>
  </tr>`
  const detailRows = [
    row("When", when.lines.map(escapeHtml).join("<br>"), true),
    row("Where", escapeHtml(location)),
    host ? row("Host", escapeHtml(host)) : "",
    row("RSVP", escapeHtml(rsvpSummary(event.formFieldCount))),
  ].join("")

  const about = details
    ? `<tr><td style="padding:28px 0 0;">
        <p class="ev-subtle" style="margin:0 0 8px;${label}">About</p>
        ${paragraphsHtml(details, "ev-text", `margin:0 0 12px;${fontStyle}color:${c.text};font-size:14px;line-height:22px;word-break:break-word;`)}
      </td></tr>`
    : ""

  const signOff = brand
    ? brand.emailSignOff || `${brand.displayName} · Sent with Multideck`
    : "Multideck · Private freight operations workspace"
  const reason = `You're receiving this because you were invited to ${company ? `a ${company}` : "a company"} event in Multideck.`

  // Quieter than See event: text links in the readable accent, with a tap
  // target tall enough on phones.
  const secondary = [
    calendarUrl ? { label: "Add to calendar", href: calendarUrl } : null,
    mapsUrl ? { label: "Open in maps", href: mapsUrl } : null,
  ].filter((action): action is { label: string; href: string } => Boolean(action))
  const secondaryActions = secondary.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ev-secondary" style="margin:10px 0 0;border-collapse:separate;"><tr>${secondary.map((action) => `<td style="padding:0 24px 0 0;"><a class="ev-date" href="${escapeHtml(action.href)}" style="display:inline-block;padding:8px 0;${fontStyle}color:${c.date};font-size:14px;font-weight:500;line-height:20px;text-decoration:underline;text-underline-offset:3px;">${escapeHtml(action.label)}</a></td>`).join("")}</tr></table>`
    : ""
  const calendarNote = options.calendarAttachment ? "For Apple Calendar or Outlook, open the attached event.ics file." : null
  const calendarNoteHtml = calendarNote
    ? `<p class="ev-subtle" style="margin:2px 0 0;${fontStyle}color:${c.subtle};font-size:12px;line-height:18px;">${escapeHtml(calendarNote)}</p>`
    : ""

  // A tenant's saved dark appearance is its brand and stays dark everywhere.
  // Light emails declare both schemes and supply their own dark version.
  const scheme = d ? "light dark" : "dark"
  const darkRules = (prefix: string, colours: boolean, backgrounds: boolean) => d ? [
    backgrounds ? `${prefix}.ev-page { background-color: ${d.page} !important; }` : "",
    backgrounds ? `${prefix}.ev-surface { background-color: ${d.surface} !important; }` : "",
    backgrounds ? `${prefix}.ev-notice { background-color: ${d.notice} !important; }` : "",
    backgrounds ? `${prefix}.ev-action { background-color: ${d.accent} !important; }` : "",
    backgrounds ? `${prefix}.ev-cover { background-color: ${d.line} !important; }` : "",
    backgrounds ? `${prefix}.ev-plate { background-color: ${plateColor} !important; }` : "",
    colours ? `${prefix}.ev-edge { border-color: ${d.edge} !important; }` : "",
    colours ? `${prefix}.ev-line { border-color: ${d.line} !important; }` : "",
    colours ? `${prefix}.ev-tear { border-right-color: ${d.perforation} !important; }` : "",
    colours ? `${prefix}.ev-ink, ${prefix}.ev-notice { color: ${d.ink} !important; }` : "",
    colours ? `${prefix}.ev-text, ${prefix}.ev-muted { color: ${d.text} !important; }` : "",
    colours ? `${prefix}.ev-subtle, ${prefix}.ev-faint { color: ${d.subtle} !important; }` : "",
    colours ? `${prefix}.ev-date { color: ${d.date} !important; }` : "",
    colours ? `${prefix}.ev-action-ink { color: ${buttonInk(d.accent)} !important; }` : "",
  ].filter(Boolean).map((rule) => `        ${rule}`).join("\n") : ""
  // Kept apart from the layout styles: a client that drops this block still
  // keeps the mobile rules.
  const darkStyles = d ? `
    <style>
      @media (prefers-color-scheme: dark) {
${darkRules("", true, true)}
      }
${darkRules("[data-ogsc] ", true, false).replace(/^ {2}/gm, "")}
${darkRules("[data-ogsb] ", false, true).replace(/^ {2}/gm, "")}
    </style>` : ""

  const html = `<!doctype html>
<html lang="${locale}" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="${scheme}">
    <meta name="supported-color-schemes" content="${scheme}">
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme: ${scheme}; supported-color-schemes: ${scheme}; }
      a { color: inherit; }
      @media only screen and (max-width: 520px) {
        .ev-shell { padding: 20px 12px 32px !important; }
        .ev-stub { width: 84px !important; padding: 16px 4px !important; }
        .ev-day { font-size: 30px !important; line-height: 34px !important; }
        .ev-title { font-size: 17px !important; line-height: 23px !important; }
        .ev-ticket-copy { padding-left: 6px !important; padding-right: 6px !important; }
        .ev-heading { font-size: 20px !important; line-height: 27px !important; }
        .ev-label { width: 72px !important; }
        .ev-button a { display: block !important; text-align: center !important; }
      }
    </style>${darkStyles}
  </head>
  <body class="ev-page" style="margin:0;padding:0;background:${c.page};color:${c.ink};-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ev-page" style="width:100%;background:${c.page};">
      <tr>
        <td align="center" class="ev-shell" style="padding:32px 20px 48px;">
          <table role="presentation" width="${ticketWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${ticketWidth}px;">
            ${testNotice}
            <tr><td style="padding:${identityPadding};">${identity}</td></tr>
            <tr><td>${ticket}</td></tr>
            <tr><td style="padding:36px 2px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td>
                  <h1 class="ev-heading ev-ink" style="margin:0;${fontStyle}color:${c.ink};font-size:24px;font-weight:500;line-height:31px;letter-spacing:-0.01em;">You're invited</h1>
                  <p class="ev-text" style="margin:8px 0 0;${fontStyle}color:${c.text};font-size:15px;line-height:23px;">${escapeHtml(intro)}</p>
                </td></tr>
                <tr><td style="padding:24px 0 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ev-line" style="border-collapse:separate;border-spacing:0;border-bottom:${edge};">${detailRows}</table>
                </td></tr>
                ${about}
                <tr><td style="padding:28px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ev-button" style="border-collapse:separate;">
                    <tr><td class="ev-action" style="border-radius:${c.button}px;background:${c.accent};">
                      <a class="ev-action-ink" href="${url}" style="display:inline-block;padding:13px 26px;${fontStyle}color:${buttonInk(c.accent)};font-size:15px;font-weight:500;line-height:20px;text-decoration:none;border-radius:${c.button}px;">See event</a>
                    </td></tr>
                  </table>
                  ${secondaryActions}${calendarNoteHtml}
                  <p class="ev-subtle" style="margin:12px 0 0;${fontStyle}color:${c.subtle};font-size:12px;line-height:18px;">RSVP from the event page. If the button doesn't open, paste this link into your browser:<br><a class="ev-subtle" href="${url}" style="color:${c.subtle};text-decoration:underline;word-break:break-all;">${url}</a></p>
                </td></tr>
                <tr><td style="padding:36px 0 0;">
                  <p class="ev-subtle ev-line" style="margin:0;padding-top:18px;border-top:${edge};${fontStyle}color:${c.subtle};font-size:12px;line-height:18px;">${escapeHtml(reason)}</p>
                  <p class="ev-subtle" style="margin:8px 0 0;${fontStyle}color:${c.subtle};font-size:12px;line-height:18px;">${escapeHtml(signOff)}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    options.test ? "TEST EMAIL — only you received this. Nobody on the guest list has been sent anything.\n" : "",
    "You're invited",
    "",
    title,
    intro,
    "",
    `When: ${when.lines.join(", ")}`,
    `Where: ${location}`,
    host ? `Host: ${host}` : "",
    `RSVP: ${rsvpSummary(event.formFieldCount)}`,
    details ? `\nAbout\n${details}` : "",
    "",
    `See event: ${options.eventUrl}`,
    ...secondary.map((action) => `${action.label}: ${action.href}`),
    calendarNote ?? "",
    "",
    reason,
    signOff,
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n").trim()

  return { subject, preview, html, text }
}
