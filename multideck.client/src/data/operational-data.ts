import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Boxes, BriefcaseBusiness, Clock3, PackageCheck, Plane, ScanText, ShieldAlert, Ship, TriangleAlert } from "@/components/icons/hugeicons"
import type { AuditTimelineEvent } from "@/components/multideck/audit-timeline"

export type StatusTone = "green" | "amber" | "red" | "blue" | "orange" | "purple" | "neutral" | "teal"

export const quoteAuditEvents: AuditTimelineEvent[] = [
  { id: "quote-opened", title: "Quote opened", detail: "Local reference SPQ-74218 was created from the spot quote.", date: "08 Jan 2026", time: "09:42", actor: "Maya Stone", source: "Quote workspace", state: "completed", kind: "created" },
  { id: "charges-entered", title: "Charges entered", detail: "Nine charge lines were copied into the pricing grid.", date: "08 Jan 2026", time: "10:18", actor: "Theo Grant", source: "Pricing", state: "completed", kind: "pricing" },
  { id: "margin-recalculated", title: "Margin recalculated", detail: "Sell and cost changes moved the quote margin to 16.18%.", date: "Today", time: "11:06", actor: "Multideck", source: "Automatic calculation", state: "completed", kind: "calculation" },
  { id: "commercial-review", title: "Commercial approval", detail: "Review the current margin and confirm the quote is ready to issue.", date: "Current", actor: "Commercial team", source: "Action required", state: "current", kind: "approval" },
  { id: "booking-conversion", title: "Convert to booking", detail: "Create the provisional booking with the approved quote and customer terms.", date: "Next", actor: "Operations", source: "Planned workflow", state: "upcoming", kind: "booking" },
]

export const systemPeople = [
  { code: "AM1", name: "Maya Stone", roles: ["sales"] },
  { code: "EM", name: "Elena Moreno", roles: ["admin", "operations", "sales"] },
  { code: "JL", name: "Julia Lee", roles: ["operations", "sales"] },
] as const

export {
  crmSidebarItems,
  customerWarehouseNavigation,
  homeNavItem,
  sidebarAreas,
  sidebarPrimary,
  sidebarSecondary,
  warehouseNavigation,
} from "./navigation-data"
export type { NavItem, SidebarArea, SidebarDestination } from "./navigation-data"

export const metricCards = [
  {
    label: "On-time arrivals",
    scope: "30d",
    value: "94.2%",
    change: "+1.8",
    detail: "vs prev. 30d",
    tone: "green" as StatusTone,
    series: [18, 26, 23, 31, 28, 37, 33, 42, 38, 48, 43, 55, 50, 62],
  },
  {
    label: "Avg. customs clearance",
    scope: "",
    value: "11h",
    change: "-3h",
    detail: "vs prev. 30d",
    tone: "teal" as StatusTone,
    series: [20, 31, 27, 39, 34, 45, 40, 51, 46, 58, 52, 64],
  },
  {
    label: "Open exceptions",
    scope: "",
    value: "7",
    change: "-2",
    detail: "vs prev. 30d",
    tone: "amber" as StatusTone,
    series: [62, 52, 69, 43, 55, 34, 45, 29, 38, 24, 31, 22, 29],
  },
  {
    label: "Docs auto-parsed",
    scope: "today",
    value: "184",
    change: "94%",
    detail: "vs prev. 30d",
    tone: "teal" as StatusTone,
    series: [22, 34, 29, 41, 36, 49, 43, 55, 50, 62, 56, 68],
  },
]

export const dashboardRangeOptions = ["today", "week", "month", "quarter"] as const
export type DashboardPresetRange = (typeof dashboardRangeOptions)[number]
export type DashboardRange = DashboardPresetRange | "custom"
export type DashboardCustomRange = {
  start: string | null
  end: string | null
}

export const savedDashboardViews = ["Today ops brief", "My bookings", "Customs watch", "Customer replies"]

export const dashboardSnapshots: Record<DashboardRange, {
  label: string
  headline: string
  summary: string
  meta: string
  briefLead: string
  briefItems: Array<{
    label: string
    value: string
    detail: string
    source: string
    tone: StatusTone
  }>
  kpis: typeof metricCards
}> = {
  today: {
    label: "Today",
    headline: "Good morning, Elena.",
    summary: "You have 10 active jobs, 6 customer emails waiting, and 4 quotes that should go out before local cutoffs.",
    meta: "Live from Outlook, quotes, bookings, and customs queues",
    briefLead: "Start with the customer-facing replies and blockers that are most likely to slow bookings down.",
    briefItems: [
      { label: "Reply to Sandra Hale", value: "Reply", detail: "Marlow asked whether MD-22481 can still hit the Felixstowe handover. Send the cleared-docs note with the ETA.", source: "Outlook inbox", tone: "amber" },
      { label: "Approve Yong Hua chase", value: "Approve", detail: "Dexter drafted the licence request for MD-22455. Check wording, then send when you are ready.", source: "Customs hold", tone: "red" },
      { label: "Send Pacific air quote", value: "Send", detail: "DXB → Heathrow rate is confirmed and inside margin rules. Customer is waiting for pickup options.", source: "Quotes", tone: "green" },
      { label: "Notify Bauhaus ETA slip", value: "Notify", detail: "Rotterdam berth queue moved MD-22479 by 36h. Use the customer-safe draft and attach the new ETA.", source: "Booking update", tone: "teal" },
    ],
    kpis: [
      { label: "Active jobs", scope: "today", value: "10", change: "5 need action", detail: "before 15:00", tone: "amber", series: [3, 4, 4, 5, 6, 7, 8, 8, 9, 10] },
      { label: "Emails waiting", scope: "Outlook", value: "6", change: "3 customer", detail: "reply first", tone: "red", series: [8, 7, 9, 6, 7, 5, 6, 4, 6, 6] },
      { label: "Quotes due", scope: "today", value: "4", change: "2 ready", detail: "send now", tone: "green", series: [1, 2, 2, 3, 4, 3, 5, 4, 4, 4] },
      { label: "Watched bookings", scope: "favourites", value: "7", change: "2 exceptions", detail: "keep close", tone: "teal", series: [4, 4, 5, 6, 6, 7, 7, 8, 7, 7] },
    ],
  },
  week: {
    label: "Week",
    headline: "This week is mostly about quotes and customs risk.",
    summary: "You own 18 jobs this week. 11 are moving cleanly, 4 need customer updates, and 3 are waiting on document or broker action.",
    meta: "Mon-Sun operating view",
    briefLead: "The week is healthy, but quote speed and customs paperwork are where margin and trust can slip.",
    briefItems: [
      { label: "Clear premium replies", value: "Mon", detail: "Marlow, Pacific, and Bauhaus have customer-visible questions that should be closed before the weekly report run.", source: "Outlook inbox", tone: "amber" },
      { label: "Send seven ready quotes", value: "Tue", detail: "Prioritise Asia-Europe ocean lanes first; three need margin notes before approval.", source: "Quotes", tone: "green" },
      { label: "Review customs pattern", value: "Wed", detail: "Three licence holds share the same broker handoff gap. Prepare a rule change for Dexter.", source: "Customs", tone: "red" },
      { label: "Schedule customer updates", value: "Fri", detail: "Bundle the non-urgent ETA and milestone updates into account-level summaries.", source: "Dexter brief", tone: "teal" },
    ],
    kpis: [
      { label: "Active jobs", scope: "week", value: "18", change: "5 at risk", detail: "3 customs", tone: "amber", series: [9, 10, 12, 11, 15, 16, 18, 17, 18, 18] },
      { label: "Emails waiting", scope: "week", value: "21", change: "-8 cleared", detail: "since Monday", tone: "green", series: [32, 29, 27, 25, 24, 22, 21, 23, 20, 21] },
      { label: "Quotes due", scope: "week", value: "14", change: "7 ready", detail: "4 high value", tone: "teal", series: [5, 8, 11, 12, 15, 13, 14, 13, 14, 14] },
      { label: "Watched bookings", scope: "favourites", value: "9", change: "3 changed", detail: "since Monday", tone: "blue", series: [5, 5, 6, 8, 8, 9, 10, 9, 9, 9] },
    ],
  },
  month: {
    label: "Month",
    headline: "June is tracking well, with customs exceptions still the pressure point.",
    summary: "Your owned work includes 42 bookings, 28 quote threads, and 9 account follow-ups across premium customers.",
    meta: "Month-to-date operating view",
    briefLead: "The month is commercially strong, but keep premium customers updated before exception noise becomes relationship risk.",
    briefItems: [
      { label: "Tighten premium reply SLA", value: "1h 42m", detail: "Response time is good, but Marlow and Pacific still create most urgent follow-up load.", source: "Outlook inbox", tone: "green" },
      { label: "Review quote conversion", value: "62%", detail: "Accepted quotes are strongest on Asia-Europe ocean lanes; air quotes need faster carrier confirmation.", source: "Quotes", tone: "teal" },
      { label: "Close exception history", value: "4", detail: "Four owned bookings had exception history this month. Capture the cause before the client review.", source: "Bookings", tone: "amber" },
      { label: "Reduce detention risk", value: "9", detail: "Most open risks are customs holds or containers nearing free-time expiry.", source: "Dexter brief", tone: "red" },
    ],
    kpis: [
      { label: "Active jobs", scope: "month", value: "42", change: "31 clean", detail: "month to date", tone: "teal", series: [12, 16, 21, 24, 28, 31, 35, 38, 40, 42] },
      { label: "Emails waiting", scope: "month", value: "84", change: "1h 42m", detail: "avg reply", tone: "green", series: [11, 22, 31, 39, 46, 58, 66, 72, 79, 84] },
      { label: "Quotes sent", scope: "month", value: "38", change: "62% accepted", detail: "or negotiating", tone: "green", series: [4, 7, 11, 14, 18, 23, 27, 31, 35, 38] },
      { label: "Watched bookings", scope: "favourites", value: "12", change: "4 exceptions", detail: "this month", tone: "amber", series: [4, 6, 7, 8, 9, 9, 10, 11, 12, 12] },
    ],
  },
  quarter: {
    label: "Quarter",
    headline: "The quarter is about account trust and repeatable quote speed.",
    summary: "Across the quarter, your book shows stronger quote conversion, fewer late replies, and a small cluster of recurring customs issues.",
    meta: "Quarter-to-date operating view",
    briefLead: "The pattern is clear: quote speed is improving, but customs follow-through still decides customer confidence.",
    briefItems: [
      { label: "Protect premium SLA", value: "91%", detail: "Premium replies are mostly inside target, but spikes still happen when customs holds arrive after local cutoff.", source: "Outlook inbox", tone: "green" },
      { label: "Standardise quote playbook", value: "112", detail: "Quote volume is high enough to turn accepted Asia-Europe patterns into reusable defaults.", source: "Quotes", tone: "teal" },
      { label: "Reduce manual interventions", value: "24", detail: "The recurring manual work is concentrated in docs, broker handoff, and customer-safe ETA updates.", source: "Bookings", tone: "amber" },
      { label: "Fix repeated customs patterns", value: "7", detail: "Licence, HS-code, and detention issues repeat by lane. These should become watchers, not surprises.", source: "Dexter brief", tone: "red" },
    ],
    kpis: [
      { label: "Active jobs", scope: "quarter", value: "148", change: "84% clean", detail: "handled", tone: "teal", series: [22, 36, 48, 61, 76, 89, 104, 121, 136, 148] },
      { label: "Emails waiting", scope: "quarter", value: "286", change: "91% SLA", detail: "premium replies", tone: "green", series: [38, 69, 91, 121, 149, 177, 203, 231, 260, 286] },
      { label: "Quotes sent", scope: "quarter", value: "112", change: "+18%", detail: "vs last qtr", tone: "green", series: [12, 22, 31, 45, 56, 69, 82, 91, 103, 112] },
      { label: "Watched bookings", scope: "favourites", value: "16", change: "7 patterns", detail: "worth review", tone: "amber", series: [7, 8, 9, 10, 12, 13, 14, 15, 16, 16] },
    ],
  },
  custom: {
    label: "Custom",
    headline: "Custom range selected for the current dashboard.",
    summary: "Use this view to focus the dashboard around the operating window you choose.",
    meta: "Custom operating view",
    briefLead: "The dashboard is scoped to your selected dates. Prioritise the replies, quotes, and blockers inside that window.",
    briefItems: [
      { label: "Review date-specific replies", value: "Review", detail: "Check customer-facing threads that fall inside the selected date range.", source: "Outlook inbox", tone: "amber" },
      { label: "Audit active blockers", value: "Audit", detail: "Look for customs, licence, or carrier issues that need action before the range closes.", source: "Bookings", tone: "red" },
      { label: "Send ready quotes", value: "Send", detail: "Prioritise quotes that can still protect margin and service level inside this window.", source: "Quotes", tone: "green" },
      { label: "Prepare customer recap", value: "Draft", detail: "Summarise movement, risk, and next steps for the selected operating period.", source: "Dexter brief", tone: "teal" },
    ],
    kpis: [
      { label: "Active jobs", scope: "custom", value: "24", change: "6 need action", detail: "in range", tone: "amber", series: [8, 11, 12, 14, 17, 18, 20, 22, 23, 24] },
      { label: "Emails waiting", scope: "custom", value: "17", change: "5 customer", detail: "reply first", tone: "red", series: [21, 19, 18, 16, 18, 15, 17, 14, 16, 17] },
      { label: "Quotes due", scope: "custom", value: "9", change: "4 ready", detail: "send now", tone: "green", series: [3, 4, 5, 6, 7, 8, 7, 9, 8, 9] },
      { label: "Watched bookings", scope: "custom", value: "11", change: "3 exceptions", detail: "keep close", tone: "teal", series: [6, 7, 7, 8, 9, 10, 10, 11, 10, 11] },
    ],
  },
}

/**
 * The operating regions coverage is measured across, ordered west to east so the
 * working-window bands step across the day in reading order instead of
 * criss-crossing the track.
 */
export const cityQueues = [
  { code: "LAX", country: "US", city: "Los Angeles", timeZone: "America/Los_Angeles" },
  { code: "CHI", country: "US", city: "Chicago", timeZone: "America/Chicago" },
  { code: "NYC", country: "US", city: "New York", timeZone: "America/New_York" },
  { code: "YYZ", country: "CA", city: "Toronto", timeZone: "America/Toronto" },
  { code: "GRU", country: "BR", city: "Sao Paulo", timeZone: "America/Sao_Paulo" },
  { code: "LDN", country: "UK", city: "London", timeZone: "Europe/London" },
  { code: "AMS", country: "NL", city: "Amsterdam", timeZone: "Europe/Amsterdam" },
  { code: "FRA", country: "DE", city: "Frankfurt", timeZone: "Europe/Berlin" },
  { code: "IST", country: "TR", city: "Istanbul", timeZone: "Europe/Istanbul" },
  { code: "DXB", country: "AE", city: "Dubai", timeZone: "Asia/Dubai" },
  { code: "BOM", country: "IN", city: "Mumbai", timeZone: "Asia/Kolkata" },
  { code: "SIN", country: "SG", city: "Singapore", timeZone: "Asia/Singapore" },
  { code: "HKG", country: "HK", city: "Hong Kong", timeZone: "Asia/Hong_Kong" },
  { code: "SHA", country: "CN", city: "Shanghai", timeZone: "Asia/Shanghai" },
  { code: "TYO", country: "JP", city: "Tokyo", timeZone: "Asia/Tokyo" },
  { code: "SYD", country: "AU", city: "Sydney", timeZone: "Australia/Sydney" },
]

export type TimezoneWorkItem = {
  id: string
  lane: string
  cargo: string
  customer: string
  ready: string
  status: string
  action: string
  tone: StatusTone
  priority: StatusTone
  kind: "RFQ" | "Booking"
}

export const timezoneWorkQueues: Record<string, {
  cutoff: string
  cutoffCountdown: string
  summary: string
  openRfqs: number
  needAction: number
  readyToQuote: number
  items: TimezoneWorkItem[]
}> = {
  LDN: {
    cutoff: "17:30 local",
    cutoffCountdown: "7h 48m",
    summary: "UK export docs and short-sea quotes still have plenty of room, but two customs notes should go first.",
    openRfqs: 5,
    needAction: 2,
    readyToQuote: 2,
    items: [
      { id: "RFQ-3294", lane: "Felixstowe → Rotterdam", cargo: "2 x 40HC · retail fixtures", customer: "Marlow Apparel", ready: "Jun 03", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "MD-22468", lane: "Tilbury → Hamburg", cargo: "LCL · machinery parts", customer: "Aldridge & Sons", ready: "Today", status: "CDS submitted", action: "Check broker", tone: "teal", priority: "amber", kind: "Booking" },
      { id: "RFQ-3288", lane: "London → Dubai", cargo: "1 x ULD · samples", customer: "Pacific Goods", ready: "Jun 04", status: "Air rate needed", action: "Request rate", tone: "blue", priority: "blue", kind: "RFQ" },
    ],
  },
  AMS: {
    cutoff: "18:00 local",
    cutoffCountdown: "8h 18m",
    summary: "Amsterdam has a later close, so clear the one blocker then come back after the China queue.",
    openRfqs: 6,
    needAction: 1,
    readyToQuote: 4,
    items: [
      { id: "RFQ-3304", lane: "Rotterdam → Felixstowe", cargo: "3 x 40HC · furniture", customer: "Northwind GmbH", ready: "Jun 03", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3301", lane: "Amsterdam → Istanbul", cargo: "LCL · packaging", customer: "Atlas Office Supply", ready: "Jun 04", status: "Carrier confirm", action: "Chase carrier", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "MD-22479", lane: "Ningbo → Rotterdam", cargo: "1 x 40GP · homeware", customer: "Bauhaus Importe", ready: "Today", status: "ETA shifted", action: "Notify client", tone: "amber", priority: "red", kind: "Booking" },
    ],
  },
  IST: {
    cutoff: "18:15 local",
    cutoffCountdown: "5h 33m",
    summary: "Turkey desk needs document checks before the local agent hands over to tomorrow's shift.",
    openRfqs: 4,
    needAction: 2,
    readyToQuote: 1,
    items: [
      { id: "RFQ-3279", lane: "Istanbul → Southampton", cargo: "1 x 20GP · ceramics", customer: "Mediterranean Spice", ready: "Jun 03", status: "CI/PL mismatch", action: "Approve fix", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "MD-22492", lane: "Mersin → Hamburg", cargo: "2 x 40HC · textiles", customer: "Valencia Textiles", ready: "Today", status: "Licence needed", action: "Email shipper", tone: "red", priority: "red", kind: "Booking" },
      { id: "RFQ-3275", lane: "Izmir → Felixstowe", cargo: "LCL · lighting", customer: "Lisbon Lighting", ready: "Jun 05", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
    ],
  },
  DXB: {
    cutoff: "18:30 local",
    cutoffCountdown: "4h 48m",
    summary: "Dubai is close enough to prioritise air movements and customs checks before slower EU lanes.",
    openRfqs: 5,
    needAction: 2,
    readyToQuote: 2,
    items: [
      { id: "RFQ-3310", lane: "Dubai → Heathrow", cargo: "1 x ULD · electronics", customer: "Pacific Goods", ready: "Today", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3308", lane: "Jebel Ali → Felixstowe", cargo: "2 x 40HC · fixtures", customer: "Rotterdam Retail", ready: "Jun 03", status: "Awaiting BoL", action: "Chase BoL", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "MD-22502", lane: "Dubai → JFK", cargo: "Air · medical supplies", customer: "Meridian Medical", ready: "Today", status: "Temperature doc", action: "Send note", tone: "blue", priority: "red", kind: "Booking" },
    ],
  },
  SHA: {
    cutoff: "18:30 local",
    cutoffCountdown: "1h 18m",
    summary: "China offices are closing soon. Clear the blocker-heavy RFQs before moving back to Europe.",
    openRfqs: 7,
    needAction: 3,
    readyToQuote: 3,
    items: [
      { id: "RFQ-3318", lane: "Shanghai → Long Beach", cargo: "1 x 40HC · optical terminals", customer: "Marlow Apparel", ready: "Jun 02", status: "Licence needed", action: "Email shipper", tone: "red", priority: "red", kind: "RFQ" },
      { id: "RFQ-3316", lane: "Yantian → Felixstowe", cargo: "2 x 40HC · apparel", customer: "Northwind GmbH", ready: "Jun 03", status: "Awaiting BoL", action: "Chase BoL", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "RFQ-3312", lane: "Qingdao → Felixstowe", cargo: "LCL · 8 cbm · homeware", customer: "Aldridge & Sons", ready: "Jun 04", status: "CI/PL mismatch", action: "Approve fix", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "RFQ-3309", lane: "Shenzhen → Oakland", cargo: "1 x 20GP · electronics", customer: "Pacific Goods", ready: "Jun 05", status: "USTR check", action: "Send note", tone: "blue", priority: "blue", kind: "RFQ" },
      { id: "RFQ-3305", lane: "Ningbo → Hamburg", cargo: "1 x 40HC · furniture", customer: "Northwind GmbH", ready: "Jun 02", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3301", lane: "Shanghai → Felixstowe", cargo: "3 x 40HC · mixed", customer: "Marlow Apparel", ready: "Jun 06", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3298", lane: "Tianjin → Tilbury", cargo: "LCL · 14 cbm", customer: "Marlow Apparel", ready: "Jun 07", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
    ],
  },
  SIN: {
    cutoff: "18:15 local",
    cutoffCountdown: "1h 33m",
    summary: "Singapore closes shortly after Shanghai, so keep this queue warm once China is clean.",
    openRfqs: 6,
    needAction: 2,
    readyToQuote: 2,
    items: [
      { id: "RFQ-3322", lane: "Singapore → Southampton", cargo: "1 x 40HC · electronics", customer: "Pacific Goods", ready: "Jun 02", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3319", lane: "Singapore → Rotterdam", cargo: "LCL · labware", customer: "Zurich Labware", ready: "Jun 03", status: "Awaiting MSDS", action: "Chase docs", tone: "amber", priority: "amber", kind: "RFQ" },
      { id: "MD-22508", lane: "Singapore → Hamburg", cargo: "2 x 20GP · components", customer: "Tallinn Tech", ready: "Today", status: "DG check", action: "Send note", tone: "blue", priority: "red", kind: "Booking" },
    ],
  },
  NYC: {
    cutoff: "17:00 local",
    cutoffCountdown: "12h 18m",
    summary: "US East Coast is still early. Park the non-urgent quotes until the closing Asia desks are handled.",
    openRfqs: 3,
    needAction: 1,
    readyToQuote: 2,
    items: [
      { id: "RFQ-3268", lane: "JFK → Frankfurt", cargo: "Air · samples", customer: "Black Forest Foods", ready: "Jun 03", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "MD-22466", lane: "Frankfurt → JFK", cargo: "1 ULD · chilled food", customer: "Black Forest Foods", ready: "Today", status: "Customs cleared", action: "Notify consignee", tone: "green", priority: "blue", kind: "Booking" },
      { id: "RFQ-3261", lane: "Newark → Felixstowe", cargo: "1 x 40GP · office goods", customer: "Atlas Office Supply", ready: "Jun 06", status: "Carrier confirm", action: "Request rate", tone: "amber", priority: "amber", kind: "RFQ" },
    ],
  },
  LAX: {
    cutoff: "17:00 local",
    cutoffCountdown: "15h 18m",
    summary: "Los Angeles is after hours. Keep urgent exceptions visible, but quote work can wait until Asia and Europe are clear.",
    openRfqs: 2,
    needAction: 1,
    readyToQuote: 1,
    items: [
      { id: "MD-22455", lane: "Shanghai → Long Beach", cargo: "1 x 40HC · optical terminals", customer: "Marlow Apparel", ready: "Jun 09", status: "Customs hold", action: "Email shipper", tone: "red", priority: "red", kind: "Booking" },
      { id: "RFQ-3258", lane: "Long Beach → Felixstowe", cargo: "1 x 40HC · fixtures", customer: "Rotterdam Retail", ready: "Jun 06", status: "Ready to quote", action: "Send quote", tone: "green", priority: "green", kind: "RFQ" },
      { id: "RFQ-3252", lane: "Oakland → Hamburg", cargo: "LCL · electronics", customer: "Pacific Goods", ready: "Jun 07", status: "Awaiting weight", action: "Chase shipper", tone: "amber", priority: "amber", kind: "RFQ" },
    ],
  },
}

export const liveBookings = [
  { id: "MD-22481", from: "Yantian", to: "Felixstowe", mode: "Ocean", eta: "Jun 04", time: "06:20", progress: 72, tone: "teal" as StatusTone, origin: [22.56, 114.23] as const, destination: [51.95, 1.35] as const },
  { id: "MD-22479", from: "Ningbo", to: "Rotterdam", mode: "Ocean", eta: "Jun 06", time: "11:45", progress: 58, tone: "amber" as StatusTone, origin: [29.87, 121.55] as const, destination: [51.95, 4.14] as const },
  { id: "MD-22466", from: "Frankfurt", to: "JFK", mode: "Air", eta: "May 28", time: "21:10", progress: 86, tone: "green" as StatusTone, origin: [50.04, 8.56] as const, destination: [40.64, -73.78] as const },
  { id: "MD-22455", from: "Long Beach", to: "Felixstowe", mode: "Ocean", eta: "Jun 09", time: "03:00", progress: 39, tone: "red" as StatusTone, origin: [33.75, -118.21] as const, destination: [51.95, 1.35] as const },
  { id: "MD-22441", from: "Hamburg", to: "Milano", mode: "Road", eta: "May 27", time: "14:00", progress: 64, tone: "blue" as StatusTone, origin: [53.55, 9.99] as const, destination: [45.46, 9.19] as const },
]

export type DashboardTrendPoint = { period: string; value: number; target: number }

function makeTrendPeriods(range: DashboardRange, length: number): string[] {
  const bases: Record<DashboardRange, string[]> = {
    today: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00", "Now", "+1", "+2", "+3"],
    week: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "+1", "+2", "+3", "+4", "+5", "+6"],
    month: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13"],
    quarter: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "+1"],
    custom: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
  }
  const labels = bases[range] ?? bases.custom
  return Array.from({ length }, (_, index) => labels[index] ?? `${index + 1}`)
}

/**
 * Per-range, per-KPI trend series for the dashboard graph. Derived from each
 * snapshot KPI's own sparkline so the tile value and the expanded graph always
 * tell the same story, with a gently rising target line for context.
 */
export const dashboardTrends: Record<DashboardRange, Record<string, DashboardTrendPoint[]>> =
  Object.fromEntries(
    (Object.keys(dashboardSnapshots) as DashboardRange[]).map((range) => {
      const entries = dashboardSnapshots[range].kpis.map((kpi) => {
        const series = kpi.series ?? []
        const periods = makeTrendPeriods(range, series.length)
        const max = Math.max(...series, 1)
        const points: DashboardTrendPoint[] = series.map((value, index) => ({
          period: periods[index] ?? `${index + 1}`,
          value,
          target: Math.round(max * (0.55 + (index / Math.max(series.length - 1, 1)) * 0.4)),
        }))
        return [kpi.label, points] as const
      })
      return [range, Object.fromEntries(entries)] as const
    }),
  ) as Record<DashboardRange, Record<string, DashboardTrendPoint[]>>

export type LiveBookingFeedItem = {
  id: string
  lane: string
  mode: string
  customer: string
  milestone: string
  progress: number
  eta: string
  updated: string
  tone: StatusTone
}

export const liveBookingFeed: LiveBookingFeedItem[] = [
  { id: "MD-22481", lane: "Yantian → Felixstowe", mode: "Ocean", customer: "Marlow Apparel", milestone: "Sailing · on schedule", progress: 72, eta: "Jun 04 06:20", updated: "41s ago", tone: "teal" },
  { id: "MD-22479", lane: "Ningbo → Rotterdam", mode: "Ocean", customer: "Bauhaus Importe", milestone: "ETA shifted +36h", progress: 58, eta: "Jun 06 11:45", updated: "2m ago", tone: "amber" },
  { id: "MD-22466", lane: "Frankfurt → JFK", mode: "Air", customer: "Black Forest Foods", milestone: "Customs cleared", progress: 86, eta: "May 28 21:10", updated: "3m ago", tone: "green" },
  { id: "MD-22455", lane: "Long Beach → Felixstowe", mode: "Ocean", customer: "Marlow Apparel", milestone: "Customs hold · licence", progress: 39, eta: "Jun 09 03:00", updated: "5m ago", tone: "red" },
  { id: "MD-22441", lane: "Hamburg → Milano", mode: "Road", customer: "Northwind GmbH", milestone: "In transit · border cleared", progress: 64, eta: "May 27 14:00", updated: "6m ago", tone: "blue" },
  { id: "MD-22468", lane: "Tilbury → Hamburg", mode: "Ocean", customer: "Aldridge & Sons", milestone: "CDS submitted", progress: 48, eta: "May 29 09:30", updated: "8m ago", tone: "teal" },
  { id: "MD-22502", lane: "Dubai → JFK", mode: "Air", customer: "Meridian Medical", milestone: "Temperature doc pending", progress: 31, eta: "May 30 18:40", updated: "11m ago", tone: "amber" },
  { id: "MD-22508", lane: "Singapore → Hamburg", mode: "Ocean", customer: "Tallinn Tech", milestone: "DG check in progress", progress: 22, eta: "Jun 12 07:15", updated: "14m ago", tone: "blue" },
]

export const bookingFilters = ["Open · 34", "On-track · 26", "Delayed · 3", "Exceptions · 2", "Delivered · 48"] as const

export const warehouseProductFilters = ["All · 128", "Low stock · 8", "Inbound · 12", "Quarantine · 3"] as const
export const warehouseOrderFilters = ["All orders · 6", "Inbound · 2", "Outbound · 3", "Hold · 1"] as const
export const warehouseStockFilters = ["All stock · 642", "Low stock · 8", "Allocated · 184", "Quarantine · 3"] as const

/**
 * The warehouse header band. Seven figures, each answering a different question —
 * the live set in `lib/warehouse.ts` uses the same labels, so the mock and the
 * real dashboard read as one screen.
 */
export const warehouseMetrics = [
  { label: "Ready to receive", value: "12", detail: "Inbound orders with lines still to book in.", tone: "amber" as StatusTone, icon: ArrowDownToLine },
  { label: "Ready to dispatch", value: "9", detail: "Outbound orders with lines still to pick and load.", tone: "blue" as StatusTone, icon: ArrowUpFromLine },
  { label: "Stock holds", value: "3", detail: "Stock lines held in quarantine, damage or investigation.", tone: "red" as StatusTone, icon: ShieldAlert },
  { label: "Past due", value: "2", detail: "Open orders whose expected day has already passed.", tone: "red" as StatusTone, icon: AlarmClock },
  { label: "Booked today", value: "46", detail: "Orders expected on the dock today.", tone: "teal" as StatusTone, icon: Clock3 },
  { label: "SKUs on hand", value: "128", detail: "Distinct items with physical stock in the warehouse.", tone: "neutral" as StatusTone, icon: Boxes },
  { label: "Available SKUs", value: "114", detail: "Distinct items free to allocate to an order.", tone: "green" as StatusTone, icon: PackageCheck },
]

export const warehouseProducts = [
  { id: "prd-mar-thermal", name: "Thermal activewear carton", customer: "Marlow Apparel Ltd", category: "Apparel", sku: "MAR-ACT-044", hsCode: "6109.90.20", supplierRef: "QD-GAR-502", onHand: 1840, available: 1214, inbound: 620, status: "In stock", tone: "green" as StatusTone, owner: "EM" },
  { id: "prd-mar-rain-shell", name: "Rain shell jackets", customer: "Marlow Apparel Ltd", category: "Outerwear", sku: "MAR-RSJ-118", hsCode: "6201.40.90", supplierRef: "YH-SO-1440", onHand: 426, available: 118, inbound: 780, status: "Low stock", tone: "amber" as StatusTone, owner: "EM" },
  { id: "prd-bau-lamp", name: "Ceramic table lamp", customer: "Bauhaus Importe GmbH", category: "Homeware", sku: "BAU-LMP-220", hsCode: "9405.29.40", supplierRef: "NB-FAC-302", onHand: 962, available: 844, inbound: 0, status: "In stock", tone: "green" as StatusTone, owner: "JL" },
  { id: "prd-nw-router", name: "Enterprise router module", customer: "Northwind GmbH", category: "Electronics", sku: "NW-RTR-762", hsCode: "8517.62.00", supplierRef: "YONG-HUA-448", onHand: 210, available: 0, inbound: 340, status: "Quarantine", tone: "red" as StatusTone, owner: "WC" },
  { id: "prd-bff-chilled", name: "Chilled meal packs", customer: "Black Forest Foods", category: "Food", sku: "BFF-CHL-018", hsCode: "2106.90.98", supplierRef: "FRA-COLD-18", onHand: 148, available: 66, inbound: 120, status: "Low stock", tone: "amber" as StatusTone, owner: "JL" },
  { id: "prd-aos-desk", name: "Modular desk pod", customer: "Atlas Office Supply", category: "Furniture", sku: "AOS-DSK-A12", hsCode: "9403.30.19", supplierRef: "SZ-OFF-77", onHand: 372, available: 290, inbound: 0, status: "In stock", tone: "green" as StatusTone, owner: "EM" },
  { id: "prd-mst-herbs", name: "Dried herb cartons", customer: "Mediterranean Spice Trading", category: "Food", sku: "MST-HRB-072", hsCode: "0910.99.33", supplierRef: "PIR-SPICE-15", onHand: 284, available: 214, inbound: 180, status: "Inbound", tone: "teal" as StatusTone, owner: "WC" },
]

export const warehouseStockRows = [
  {
    id: "stk-mar-act-044",
    location: "A01-04-02",
    zone: "Fast pick",
    product: "Thermal activewear carton",
    productCode: "MAR-ACT-044",
    customer: "Marlow Apparel Ltd",
    lot: "LOT-MAR-7721",
    onHand: 1840,
    allocated: 626,
    available: 1214,
    fill: 82,
    nextMovement: "Pick wave 14:00",
    status: "Allocated",
    tone: "teal" as StatusTone,
    branchLocations: [
      { id: "stk-a01-mar-044", location: "A01-04-02", zone: "Fast pick", lot: "LOT-MAR-7721", onHand: 840, allocated: 420, available: 420, fill: 82, nextMovement: "Pick wave 14:00", status: "Allocated", tone: "teal" as StatusTone },
      { id: "stk-r01-mar-044", location: "R01-08-04", zone: "Reserve", lot: "LOT-MAR-7721", onHand: 620, allocated: 126, available: 494, fill: 64, nextMovement: "Replenish A01", status: "Available", tone: "green" as StatusTone },
      { id: "stk-a04-mar-044", location: "A04-01-02", zone: "Overflow", lot: "LOT-MAR-7728", onHand: 380, allocated: 80, available: 300, fill: 51, nextMovement: "No movement", status: "Available", tone: "green" as StatusTone },
    ],
  },
  {
    id: "stk-mar-rsj-118",
    location: "A03-02-05",
    zone: "Outerwear",
    product: "Rain shell jackets",
    productCode: "MAR-RSJ-118",
    customer: "Marlow Apparel Ltd",
    lot: "LOT-MAR-7712",
    onHand: 426,
    allocated: 308,
    available: 118,
    fill: 38,
    nextMovement: "Replenish from PO",
    status: "Low stock",
    tone: "amber" as StatusTone,
    branchLocations: [
      { id: "stk-a03-mar-118", location: "A03-02-05", zone: "Outerwear", lot: "LOT-MAR-7712", onHand: 426, allocated: 308, available: 118, fill: 38, nextMovement: "Replenish from PO", status: "Low stock", tone: "amber" as StatusTone },
    ],
  },
  {
    id: "stk-bau-lmp-220",
    location: "B02-01-01",
    zone: "Homeware",
    product: "Ceramic table lamp",
    productCode: "BAU-LMP-220",
    customer: "Bauhaus Importe GmbH",
    lot: "LOT-BAU-4420",
    onHand: 962,
    allocated: 118,
    available: 844,
    fill: 76,
    nextMovement: "Cycle count Fri",
    status: "Available",
    tone: "green" as StatusTone,
    branchLocations: [
      { id: "stk-b02-bau-220", location: "B02-01-01", zone: "Homeware", lot: "LOT-BAU-4420", onHand: 642, allocated: 118, available: 524, fill: 76, nextMovement: "Cycle count Fri", status: "Available", tone: "green" as StatusTone },
      { id: "stk-b02-bau-220b", location: "B02-03-04", zone: "Homeware", lot: "LOT-BAU-4426", onHand: 320, allocated: 0, available: 320, fill: 44, nextMovement: "No movement", status: "Available", tone: "green" as StatusTone },
    ],
  },
  {
    id: "stk-nw-rtr-762",
    location: "Q01-HOLD",
    zone: "Quarantine",
    product: "Enterprise router module",
    productCode: "NW-RTR-762",
    customer: "Northwind GmbH",
    lot: "LOT-NW-8517",
    onHand: 210,
    allocated: 210,
    available: 0,
    fill: 64,
    nextMovement: "Licence review",
    status: "Quarantine",
    tone: "red" as StatusTone,
    branchLocations: [
      { id: "stk-q01-nw-762", location: "Q01-HOLD", zone: "Quarantine", lot: "LOT-NW-8517", onHand: 210, allocated: 210, available: 0, fill: 64, nextMovement: "Licence review", status: "Quarantine", tone: "red" as StatusTone },
    ],
  },
  {
    id: "stk-bff-chl-018",
    location: "COLD-2-08",
    zone: "Chilled",
    product: "Chilled meal packs",
    productCode: "BFF-CHL-018",
    customer: "Black Forest Foods",
    lot: "LOT-BFF-8841",
    onHand: 148,
    allocated: 82,
    available: 66,
    fill: 45,
    nextMovement: "Dispatch 18:30",
    status: "Low stock",
    tone: "amber" as StatusTone,
    branchLocations: [
      { id: "stk-cold-bff-018", location: "COLD-2-08", zone: "Chilled", lot: "LOT-BFF-8841", onHand: 98, allocated: 82, available: 16, fill: 45, nextMovement: "Dispatch 18:30", status: "Low stock", tone: "amber" as StatusTone },
      { id: "stk-cold-bff-018b", location: "COLD-STAGE", zone: "Dispatch staging", lot: "LOT-BFF-8841", onHand: 50, allocated: 0, available: 50, fill: 24, nextMovement: "Carrier handoff", status: "Ready", tone: "green" as StatusTone },
    ],
  },
  {
    id: "stk-aos-dsk-a12",
    location: "C04-03-03",
    zone: "Furniture",
    product: "Modular desk pod",
    productCode: "AOS-DSK-A12",
    customer: "Atlas Office Supply",
    lot: "LOT-AOS-5108",
    onHand: 372,
    allocated: 82,
    available: 290,
    fill: 68,
    nextMovement: "No movement",
    status: "Available",
    tone: "green" as StatusTone,
    branchLocations: [
      { id: "stk-c04-aos-a12", location: "C04-03-03", zone: "Furniture", lot: "LOT-AOS-5108", onHand: 372, allocated: 82, available: 290, fill: 68, nextMovement: "No movement", status: "Available", tone: "green" as StatusTone },
    ],
  },
  {
    id: "stk-mst-hrb-072",
    location: "D02-05-01",
    zone: "Food ambient",
    product: "Dried herb cartons",
    productCode: "MST-HRB-072",
    customer: "Mediterranean Spice Trading",
    lot: "LOT-MST-7004",
    onHand: 284,
    allocated: 70,
    available: 214,
    fill: 58,
    nextMovement: "Putaway pending",
    status: "Inbound",
    tone: "teal" as StatusTone,
    branchLocations: [
      { id: "stk-d02-mst-072", location: "D02-05-01", zone: "Food ambient", lot: "LOT-MST-7004", onHand: 204, allocated: 70, available: 134, fill: 58, nextMovement: "Putaway pending", status: "Inbound", tone: "teal" as StatusTone },
      { id: "stk-dock-mst-072", location: "DOCK-1", zone: "Goods in", lot: "LOT-MST-7005", onHand: 80, allocated: 0, available: 80, fill: 20, nextMovement: "Move to D02", status: "Inbound", tone: "teal" as StatusTone },
    ],
  },
]

export const warehouseOrders = [
  { id: "WO-10482", customer: "Marlow Apparel Ltd", route: "Felixstowe DC to Manchester retail", type: "Outbound", lines: 18, value: "GBP 42,600", due: "Today", window: "14:00-16:00", status: "Picking", tone: "amber" as StatusTone },
  { id: "WO-10479", customer: "Bauhaus Importe GmbH", route: "Ningbo inbound to B02 homeware", type: "Inbound", lines: 9, value: "GBP 18,420", due: "Today", window: "Dock 3 - 11:30", status: "Receiving", tone: "teal" as StatusTone },
  { id: "WO-10475", customer: "Northwind GmbH", route: "Quarantine hold to customs review", type: "Hold", lines: 6, value: "GBP 184,200", due: "Today", window: "Broker review", status: "Blocked", tone: "red" as StatusTone },
  { id: "WO-10471", customer: "Black Forest Foods", route: "Cold store to Heathrow consolidation", type: "Outbound", lines: 4, value: "GBP 8,840", due: "Today", window: "18:30 cutoff", status: "Ready", tone: "green" as StatusTone },
  { id: "WO-10466", customer: "Atlas Office Supply", route: "Furniture zone to Hamburg road", type: "Outbound", lines: 12, value: "GBP 16,300", due: "Tomorrow", window: "08:00-10:00", status: "Allocated", tone: "blue" as StatusTone },
  { id: "WO-10460", customer: "Mediterranean Spice Trading", route: "Inbound putaway to D02", type: "Inbound", lines: 7, value: "GBP 11,940", due: "Tomorrow", window: "Dock 1 - 09:15", status: "Booked", tone: "neutral" as StatusTone },
]

export const warehouseGoodsMovements = [
  { id: "GIN-8821", direction: "In" as const, product: "Ceramic table lamp", reference: "PO BAU-CREF-912 - 9 lines", quantity: "640 ctn", dock: "Dock 3", time: "11:30", status: "Receiving", tone: "teal" as StatusTone },
  { id: "GOUT-6710", direction: "Out" as const, product: "Thermal activewear carton", reference: "WO-10482 - Manchester retail", quantity: "420 ctn", dock: "Door 7", time: "14:00", status: "Picking", tone: "amber" as StatusTone },
  { id: "GIN-8817", direction: "In" as const, product: "Dried herb cartons", reference: "INV-MST-7004 - phyto checked", quantity: "180 ctn", dock: "Dock 1", time: "09:15", status: "Putaway", tone: "green" as StatusTone },
  { id: "GOUT-6704", direction: "Out" as const, product: "Chilled meal packs", reference: "Cold chain dispatch", quantity: "82 ctn", dock: "Cold 2", time: "18:30", status: "Ready", tone: "green" as StatusTone },
  { id: "GIN-8809", direction: "In" as const, product: "Enterprise router module", reference: "CN export licence pending", quantity: "210 ctn", dock: "Q01-HOLD", time: "10:20", status: "Blocked", tone: "red" as StatusTone },
  { id: "GOUT-6698", direction: "Out" as const, product: "Modular desk pod", reference: "AOS Hamburg road groupage", quantity: "82 units", dock: "Door 4", time: "Tomorrow", status: "Allocated", tone: "blue" as StatusTone },
]

export const warehouseGoodsInKanbanColumns = [
  {
    id: "goods-in-pending",
    title: "Pending",
    meta: "Booked inbound work waiting to be claimed.",
    cards: [
      { id: "GIN-8824", title: "Supplier ASN for rain shell cartons", meta: "780 ctn - documents due before 13:00", status: "Pending", tone: "amber" as StatusTone },
      { id: "GIN-8823", title: "Homeware overflow slot confirmation", meta: "Dock 5 - pallet count to confirm", status: "Pending", tone: "neutral" as StatusTone },
    ],
  },
  {
    id: "goods-in-picking",
    title: "Picking",
    meta: "Claimed and being checked by the floor team.",
    cards: [
      { id: "GIN-8821", title: "Bauhaus homeware cartons at Dock 3", meta: "640 ctn - pallet check in progress", status: "Claimed", tone: "teal" as StatusTone },
      { id: "GIN-8820", title: "Outerwear reserve top-up unload", meta: "A03 reserve - split by carton type", status: "Picking", tone: "blue" as StatusTone },
    ],
  },
  {
    id: "goods-in-sat",
    title: "Sat in Goods in",
    meta: "Received and waiting for final putaway or review.",
    cards: [
      { id: "GIN-8817", title: "Mediterranean herbs await putaway", meta: "Phyto cert checked - bin D02-05-01", status: "Sat", tone: "green" as StatusTone },
      { id: "GIN-8809", title: "Router modules held for licence review", meta: "Q01-HOLD - broker follow-up", status: "Hold", tone: "red" as StatusTone },
    ],
  },
  {
    id: "goods-in-loaded",
    title: "Loaded",
    meta: "Putaway confirmed into warehouse locations.",
    cards: [
      { id: "GIN-8798", title: "Desk pod cartons loaded to C04", meta: "82 units - replenishment complete", status: "Loaded", tone: "green" as StatusTone },
    ],
  },
] as const

export const warehouseGoodsOutKanbanColumns = [
  {
    id: "goods-out-pending",
    title: "Pending",
    meta: "Outbound work waiting for a picker or dispatch owner.",
    cards: [
      { id: "GOUT-6714", title: "Atlas Hamburg preload queue", meta: "82 units - trailer details pending", status: "Pending", tone: "blue" as StatusTone },
      { id: "GOUT-6712", title: "Marlow label batch before pick", meta: "18 lines - carrier labels approved", status: "Pending", tone: "neutral" as StatusTone },
    ],
  },
  {
    id: "goods-out-picking",
    title: "Picking",
    meta: "Claimed and picking for customer dispatch.",
    cards: [
      { id: "GOUT-6710", title: "Thermal activewear Manchester wave", meta: "420 ctn - due 14:00", status: "Picking", tone: "amber" as StatusTone },
      { id: "GOUT-6708", title: "Black Forest chilled order split", meta: "Cold 2 - temperature log ready", status: "Claimed", tone: "teal" as StatusTone },
    ],
  },
  {
    id: "goods-out-sat",
    title: "Sat in Goods out",
    meta: "Picked work staged at the outbound door.",
    cards: [
      { id: "GOUT-6704", title: "Chilled meal packs staged for handoff", meta: "82 ctn - 18:30 cutoff", status: "Sat", tone: "green" as StatusTone },
    ],
  },
  {
    id: "goods-out-loaded",
    title: "Loaded",
    meta: "Loaded to trailer or carrier handoff complete.",
    cards: [
      { id: "GOUT-6698", title: "Modular desk pod trailer load", meta: "Door 4 - Hamburg groupage", status: "Loaded", tone: "blue" as StatusTone },
      { id: "GOUT-6692", title: "Retail labels print run dispatched", meta: "Carrier labels approved", status: "Loaded", tone: "green" as StatusTone },
    ],
  },
] as const

export const warehouseKanbanColumns = [
  {
    title: "Receiving",
    cards: [
      { id: "GIN-8821", title: "Bauhaus homeware cartons at Dock 3", meta: "640 ctn - pallet check in progress", status: "Live", tone: "teal" as StatusTone },
      { id: "GIN-8817", title: "Mediterranean herbs await putaway", meta: "Phyto cert checked", status: "Ready", tone: "green" as StatusTone },
      { id: "GIN-8824", title: "Rain shell ASN waiting at Dock 5", meta: "Documents due before 13:00", status: "Pending", tone: "amber" as StatusTone },
    ],
  },
  {
    title: "Quality",
    cards: [
      { id: "Q-221", title: "Router modules held for licence review", meta: "HS 8517.62.00 - broker follow-up", status: "Blocked", tone: "red" as StatusTone },
      { id: "Q-218", title: "Rain shell carton count mismatch", meta: "12 cartons short vs ASN", status: "Check", tone: "amber" as StatusTone },
      { id: "Q-224", title: "Homeware carton damage photos", meta: "Supplier evidence pack needed", status: "Review", tone: "blue" as StatusTone },
    ],
  },
  {
    title: "Putaway",
    cards: [
      { id: "PUT-340", title: "Move herbs into D02 food ambient", meta: "180 ctn - bin D02-05-01", status: "Next", tone: "blue" as StatusTone },
      { id: "PUT-338", title: "Top up A03 outerwear reserve", meta: "780 inbound expected", status: "Booked", tone: "neutral" as StatusTone },
      { id: "PUT-344", title: "Lamp pallets to B02 overflow", meta: "Homeware aisle after QC clear", status: "Next", tone: "teal" as StatusTone },
    ],
  },
  {
    title: "Pick",
    cards: [
      { id: "PICK-908", title: "Marlow Manchester retail wave", meta: "18 lines - due 14:00", status: "Picking", tone: "amber" as StatusTone },
      { id: "PICK-904", title: "Black Forest chilled dispatch", meta: "Cold chain handoff 18:30", status: "Ready", tone: "green" as StatusTone },
      { id: "PICK-911", title: "Atlas desk pod split pick", meta: "82 units - Door 4 preload", status: "Allocated", tone: "blue" as StatusTone },
    ],
  },
  {
    title: "Dispatch",
    cards: [
      { id: "DSP-551", title: "Atlas road groupage preload", meta: "Door 4 - trailer pending", status: "Allocated", tone: "blue" as StatusTone },
      { id: "DSP-548", title: "Marlow retail labels print run", meta: "Carrier labels approved", status: "Ready", tone: "green" as StatusTone },
    ],
  },
]

export const warehouseCalendarViewModes = ["Week", "Month"] as const

export type WarehouseCalendarCustomerId =
  | "marlow"
  | "atlas"
  | "bauhaus"
  | "mediterranean"
  | "black-forest"
  | "northwind"
  | "pacific"
  | "internal"

export const warehouseCalendarCustomers = [
  { id: "marlow", name: "Marlow Apparel Ltd", shortName: "Marlow", color: "var(--md-accent)" },
  { id: "atlas", name: "Atlas Office Supply", shortName: "Atlas", color: "var(--md-blue)" },
  { id: "bauhaus", name: "Bauhaus Importe GmbH", shortName: "Bauhaus", color: "var(--md-amber)" },
  { id: "mediterranean", name: "Mediterranean Spice Trading", shortName: "Mediterranean", color: "color-mix(in srgb, var(--md-amber) 54%, var(--md-blue))" },
  { id: "black-forest", name: "Black Forest Foods", shortName: "Black Forest", color: "color-mix(in srgb, var(--md-red) 62%, var(--md-amber))" },
  { id: "northwind", name: "Northwind GmbH", shortName: "Northwind", color: "var(--md-red)" },
  { id: "pacific", name: "Pacific Goods Co", shortName: "Pacific", color: "color-mix(in srgb, var(--md-blue) 65%, var(--md-accent))" },
  { id: "internal", name: "Internal warehouse team", shortName: "Internal", color: "color-mix(in srgb, var(--md-text) 55%, var(--md-surface))" },
] as const satisfies readonly { id: WarehouseCalendarCustomerId; name: string; shortName: string; color: string }[]

export type WarehouseCalendarEvent = {
  id: string
  date: string
  time: string
  endTime: string
  title: string
  type: string
  direction: "inbound" | "outbound"
  customerId: WarehouseCalendarCustomerId
  tone: StatusTone
}

export const warehouseCalendarEvents: WarehouseCalendarEvent[] = [
  { id: "wh-cal-0602-atlas", date: "2026-06-02", time: "08:20", endTime: "09:40", title: "Desk pod container unload", type: "Goods in", direction: "inbound", customerId: "atlas", tone: "blue" },
  { id: "wh-cal-0604-mediterranean", date: "2026-06-04", time: "11:10", endTime: "12:00", title: "Herb cartons QC sample", type: "Stock check", direction: "outbound", customerId: "mediterranean", tone: "green" },
  { id: "wh-cal-0605-bauhaus", date: "2026-06-05", time: "14:30", endTime: "15:20", title: "Lamp pallet dock audit", type: "Goods in", direction: "inbound", customerId: "bauhaus", tone: "teal" },
  { id: "wh-cal-0609-marlow", date: "2026-06-09", time: "09:45", endTime: "11:00", title: "Retail labels print run", type: "Goods out", direction: "outbound", customerId: "marlow", tone: "amber" },
  { id: "wh-cal-0611-black-forest", date: "2026-06-11", time: "18:30", endTime: "19:10", title: "Chilled dispatch handoff", type: "Dispatch", direction: "outbound", customerId: "black-forest", tone: "green" },
  { id: "wh-cal-0616-northwind", date: "2026-06-16", time: "10:15", endTime: "11:15", title: "Router quarantine review", type: "Hold", direction: "outbound", customerId: "northwind", tone: "red" },
  { id: "wh-cal-0618-pacific", date: "2026-06-18", time: "13:20", endTime: "14:10", title: "Milano road pallet transfer", type: "Dispatch", direction: "outbound", customerId: "pacific", tone: "blue" },
  { id: "wh-cal-0619-internal", date: "2026-06-19", time: "16:00", endTime: "17:00", title: "Aisle A reserve sweep", type: "Capacity", direction: "outbound", customerId: "internal", tone: "neutral" },
  { id: "wh-cal-0622-mediterranean", date: "2026-06-22", time: "09:15", endTime: "10:45", title: "Mediterranean herbs receiving", type: "Goods in", direction: "inbound", customerId: "mediterranean", tone: "teal" },
  { id: "wh-cal-0623-atlas", date: "2026-06-23", time: "08:00", endTime: "09:30", title: "Atlas furniture preload", type: "Dispatch", direction: "outbound", customerId: "atlas", tone: "blue" },
  { id: "wh-cal-0623-bauhaus", date: "2026-06-23", time: "11:30", endTime: "12:30", title: "Bauhaus dock slot", type: "Goods in", direction: "inbound", customerId: "bauhaus", tone: "teal" },
  { id: "wh-cal-0624-internal", date: "2026-06-24", time: "10:00", endTime: "11:30", title: "Aisle B cycle count", type: "Stock check", direction: "outbound", customerId: "internal", tone: "green" },
  { id: "wh-cal-0624-marlow", date: "2026-06-24", time: "10:30", endTime: "11:15", title: "Marlow urgent relabel", type: "Goods out", direction: "outbound", customerId: "marlow", tone: "amber" },
  { id: "wh-cal-0624-bauhaus", date: "2026-06-24", time: "10:45", endTime: "11:45", title: "Bauhaus lamp QA", type: "Stock check", direction: "outbound", customerId: "bauhaus", tone: "teal" },
  { id: "wh-cal-0625-marlow-pick", date: "2026-06-25", time: "13:30", endTime: "15:00", title: "Marlow pick wave", type: "Goods out", direction: "outbound", customerId: "marlow", tone: "amber" },
  { id: "wh-cal-0625-northwind", date: "2026-06-25", time: "16:00", endTime: "17:00", title: "Router licence review", type: "Hold", direction: "outbound", customerId: "northwind", tone: "red" },
  { id: "wh-cal-0626-mediterranean", date: "2026-06-26", time: "09:00", endTime: "10:00", title: "Food ambient variance close", type: "Stock check", direction: "outbound", customerId: "mediterranean", tone: "green" },
  { id: "wh-cal-0627-internal", date: "2026-06-27", time: "10:30", endTime: "11:30", title: "Overflow warehouse sweep", type: "Capacity", direction: "outbound", customerId: "internal", tone: "neutral" },
  { id: "wh-cal-0628-internal", date: "2026-06-28", time: "12:00", endTime: "12:30", title: "Quiet day monitor", type: "OOH", direction: "outbound", customerId: "internal", tone: "neutral" },
]

export type BookingStatus = "On track" | "Delayed" | "Exception"
export type BookingMode = "OCEAN" | "AIR" | "ROAD" | "RAIL" | "MULTIMODAL" | "FAS" | "FSA"
export type BookingDirection = "Import" | "Export" | "Domestic" | "Cross trade"
export type BookingShipmentType = "FCL" | "LCL" | "Breakbulk" | "RoRo" | "Dry bulk" | "Liquid bulk" | "Project cargo" | "General cargo" | "ULD" | "Air consolidation" | "Back-to-back" | "Express / courier" | "Charter" | "FTL" | "LTL" | "Groupage" | "Pallet network" | "Dedicated vehicle" | "Parcel / express" | "Multiple"

export const bookings = [
  { id: "MD-22682", customer: "Demo Freight Company", route: "Leicester → Bristol", carrier: "Unassigned", container: "Pallet network", mode: "ROAD" as BookingMode, value: "£1,240", eta: "Awaiting date", time: "—", status: "Exception" as BookingStatus, progress: 8, owner: "EM", tone: "amber" as StatusTone, invoice: "", jobRef: "RD-10682", customerRef: "DFC-PO-48216", supplierRef: "", origin: "Leicester, United Kingdom", destination: "Bristol, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning blocker", value: "Collection date missing" }, { label: "Road service", value: "Pallet network" }] },
  { id: "MD-22683", customer: "Demo Freight Company", route: "Dartford → Manchester", carrier: "Unassigned", container: "LTL", mode: "ROAD" as BookingMode, value: "£1,680", eta: "Jul 23", time: "10:00", status: "Exception" as BookingStatus, progress: 12, owner: "EM", tone: "amber" as StatusTone, invoice: "", jobRef: "RD-10683", customerRef: "DFC-PO-48228", supplierRef: "", origin: "Dartford, United Kingdom", destination: "Manchester, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning blocker", value: "Pallet height not supplied" }, { label: "Road service", value: "LTL" }] },
  { id: "MD-22676", customer: "Demo Freight Company", route: "Birmingham → Glasgow", carrier: "Pending selection", container: "Dedicated 7.5t", mode: "ROAD" as BookingMode, value: "£1,980", eta: "Today", time: "14:00", status: "On track" as BookingStatus, progress: 24, owner: "EM", tone: "teal" as StatusTone, invoice: "", jobRef: "RD-10676", customerRef: "DFC-PO-48191", supplierRef: "", origin: "Birmingham, United Kingdom", destination: "Glasgow, United Kingdom", vessel: "", departureDate: "2026-07-22", arrivalDate: "2026-07-23", vin: "", customFields: [{ label: "Planning state", value: "Carrier shortlist ready" }, { label: "Estimated margin", value: "18.4%" }] },
  { id: "MD-22679", customer: "Demo Freight Company", route: "Coventry → Leeds", carrier: "Pending selection", container: "Next-day pallet", mode: "ROAD" as BookingMode, value: "£1,560", eta: "Jul 23", time: "09:00", status: "On track" as BookingStatus, progress: 24, owner: "EM", tone: "teal" as StatusTone, invoice: "", jobRef: "RD-10679", customerRef: "DFC-PO-48203", supplierRef: "", origin: "Coventry, United Kingdom", destination: "Leeds, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning state", value: "Carrier shortlist ready" }, { label: "Estimated margin", value: "22.1%" }] },
  { id: "MD-22671", customer: "Demo Freight Company", route: "Rugby → Exeter", carrier: "Redline Transport", container: "Dedicated van", mode: "ROAD" as BookingMode, value: "£1,460", eta: "Today", time: "17:00", status: "On track" as BookingStatus, progress: 42, owner: "EM", tone: "blue" as StatusTone, invoice: "", jobRef: "RD-10671", customerRef: "DFC-PO-48172", supplierRef: "RLT-10671", origin: "Rugby, United Kingdom", destination: "Exeter, United Kingdom", vessel: "", departureDate: "2026-07-22", arrivalDate: "2026-07-23", vin: "", customFields: [{ label: "Carrier state", value: "Confirmation due 11:30" }, { label: "Estimated margin", value: "20.7%" }] },
  { id: "MD-22664", customer: "Demo Freight Company", route: "Milton Keynes → Newcastle", carrier: "Grove Haulage", container: "Dedicated 18t", mode: "ROAD" as BookingMode, value: "£2,380", eta: "Today", time: "15:20", status: "On track" as BookingStatus, progress: 84, owner: "EM", tone: "green" as StatusTone, invoice: "", jobRef: "RD-10664", customerRef: "DFC-PO-48126", supplierRef: "GRV-10664", origin: "Milton Keynes, United Kingdom", destination: "Newcastle, United Kingdom", vessel: "", departureDate: "2026-07-21", arrivalDate: "2026-07-22", vin: "", customFields: [{ label: "Delivery state", value: "Out for delivery" }, { label: "Estimated margin", value: "19.6%" }] },
  { id: "MD-22658", customer: "Demo Freight Company", route: "Derby → Cardiff", carrier: "PalletLine", container: "Pallet network", mode: "ROAD" as BookingMode, value: "£1,180", eta: "Delivered", time: "Yesterday", status: "On track" as BookingStatus, progress: 100, owner: "EM", tone: "green" as StatusTone, invoice: "", jobRef: "RD-10658", customerRef: "DFC-PO-48094", supplierRef: "PL-10658", origin: "Derby, United Kingdom", destination: "Cardiff, United Kingdom", vessel: "", departureDate: "2026-07-20", arrivalDate: "2026-07-21", vin: "", customFields: [{ label: "Proof of delivery", value: "Received" }, { label: "Estimated margin", value: "16.8%" }] },
  { id: "MD-22481", customer: "Marlow Apparel Ltd", route: "Yantian → Felixstowe", carrier: "COSCO", container: "40HC", mode: "OCEAN" as BookingMode, value: "€84,200", eta: "Jun 04", time: "06:20", status: "On track" as BookingStatus, progress: 64, owner: "EM", tone: "green" as StatusTone, invoice: "INV-MAR-8841", jobRef: "JOB-LON-22481", customerRef: "MAR-PO-7781", supplierRef: "YH-SO-1440", origin: "Yantian, China", destination: "Felixstowe, United Kingdom", vessel: "COSCO Pride", departureDate: "2026-05-25", arrivalDate: "2026-06-04", vin: "", customFields: [{ label: "Season", value: "SS26 launch" }, { label: "Buyer", value: "Sandra Hale" }] },
  { id: "MD-22479", customer: "Bauhaus Importe GmbH", route: "Ningbo → Rotterdam", carrier: "MAERSK", container: "40GP", mode: "OCEAN" as BookingMode, value: "€41,820", eta: "Jun 06", time: "11:45", status: "Delayed" as BookingStatus, progress: 41, owner: "EM", tone: "amber" as StatusTone, invoice: "INV-BAU-4420", jobRef: "JOB-RTM-22479", customerRef: "BAU-CREF-912", supplierRef: "NB-FAC-302", origin: "Ningbo, China", destination: "Rotterdam, Netherlands", vessel: "Maersk Girona", departureDate: "2026-05-23", arrivalDate: "2026-06-06", vin: "", customFields: [{ label: "Delay reason", value: "Rotterdam berth queue" }, { label: "Incoterms", value: "FOB Ningbo" }] },
  { id: "MD-22466", customer: "Black Forest Foods", route: "Frankfurt → JFK", carrier: "LH 8841", container: "1 ULD", mode: "AIR" as BookingMode, value: "€18,400", eta: "May 28", time: "21:10", status: "On track" as BookingStatus, progress: 88, owner: "JL", tone: "green" as StatusTone, invoice: "INV-BFF-1198", jobRef: "JOB-JFK-22466", customerRef: "BFF-CHILL-44", supplierRef: "FRA-COLD-18", origin: "Frankfurt, Germany", destination: "JFK, United States", vessel: "LH 8841", departureDate: "2026-05-28", arrivalDate: "2026-05-28", vin: "", customFields: [{ label: "Temperature", value: "Chilled 2-8C" }, { label: "FDA prior notice", value: "PN-8841" }] },
  { id: "MD-22455", customer: "Northwind GmbH", route: "Shanghai → Long Beach", carrier: "EVERGREEN", container: "40HC", mode: "OCEAN" as BookingMode, value: "€184,200", eta: "Jun 09", time: "03:00", status: "Exception" as BookingStatus, progress: 22, owner: "EM", tone: "red" as StatusTone, invoice: "INV-YH-6629", jobRef: "JOB-LAX-22455", customerRef: "NW-US-7710", supplierRef: "YONG-HUA-448", origin: "Shanghai, China", destination: "Long Beach, United States", vessel: "Ever Given", departureDate: "2026-05-21", arrivalDate: "2026-06-09", vin: "", customFields: [{ label: "HS code", value: "8517.62.00" }, { label: "Licence", value: "CN export licence missing" }] },
  { id: "MD-22441", customer: "Pacific Goods Co", route: "Hamburg → Milano", carrier: "DHL 2218", container: "LTL", mode: "ROAD" as BookingMode, value: "€8,420", eta: "May 27", time: "14:00", status: "On track" as BookingStatus, progress: 71, owner: "WC", tone: "green" as StatusTone, invoice: "INV-PAC-2044", jobRef: "JOB-MIL-22441", customerRef: "PAC-IT-511", supplierRef: "HH-ROAD-09", origin: "Hamburg, Germany", destination: "Milano, Italy", vessel: "DHL 2218", departureDate: "2026-05-25", arrivalDate: "2026-05-27", vin: "WVWZZZ1KZ6W612345", customFields: [{ label: "Trailer", value: "DE-HH-4182" }, { label: "Delivery slot", value: "Dock 4 afternoon" }] },
  { id: "MD-22429", customer: "Mediterranean Spice Trading", route: "Piraeus → Marseille", carrier: "CMA CGM", container: "20GP", mode: "OCEAN" as BookingMode, value: "€32,180", eta: "Jun 03", time: "07:30", status: "On track" as BookingStatus, progress: 56, owner: "WC", tone: "green" as StatusTone, invoice: "INV-MST-7004", jobRef: "JOB-MRS-22429", customerRef: "MST-HERB-72", supplierRef: "PIR-SPICE-15", origin: "Piraeus, Greece", destination: "Marseille, France", vessel: "CMA CGM Mistral", departureDate: "2026-05-29", arrivalDate: "2026-06-03", vin: "", customFields: [{ label: "Commodity", value: "Dried herbs" }, { label: "Phyto cert", value: "GR-44817" }] },
  { id: "MD-22414", customer: "Marlow Apparel Ltd", route: "Qingdao → Felixstowe", carrier: "MAERSK", container: "40HC", mode: "OCEAN" as BookingMode, value: "€96,400", eta: "Jun 11", time: "17:00", status: "Exception" as BookingStatus, progress: 38, owner: "EM", tone: "red" as StatusTone, invoice: "INV-MAR-8902", jobRef: "JOB-FXT-22414", customerRef: "MAR-PO-7810", supplierRef: "QD-GAR-502", origin: "Qingdao, China", destination: "Felixstowe, United Kingdom", vessel: "Maersk Cardiff", departureDate: "2026-05-26", arrivalDate: "2026-06-11", vin: "", customFields: [{ label: "Exception", value: "Packing list mismatch" }, { label: "Range", value: "Marlow activewear" }] },
  { id: "MD-22399", customer: "Marlow Apparel Ltd", route: "Ningbo → Southampton", carrier: "ONE", container: "40HC", mode: "OCEAN" as BookingMode, value: "€72,100", eta: "Jun 13", time: "04:00", status: "On track" as BookingStatus, progress: 28, owner: "EM", tone: "green" as StatusTone, invoice: "INV-MAR-8755", jobRef: "JOB-SOU-22399", customerRef: "MAR-PO-7688", supplierRef: "NB-TEX-205", origin: "Ningbo, China", destination: "Southampton, United Kingdom", vessel: "ONE Innovation", departureDate: "2026-05-30", arrivalDate: "2026-06-13", vin: "", customFields: [{ label: "Range", value: "Outlet replenishment" }, { label: "Priority", value: "Standard" }] },
  { id: "MD-22388", customer: "Atlas Office Supply", route: "Shenzhen → Hamburg", carrier: "HMM", container: "20GP", mode: "OCEAN" as BookingMode, value: "€16,300", eta: "Jun 02", time: "11:00", status: "On track" as BookingStatus, progress: 60, owner: "JL", tone: "green" as StatusTone, invoice: "INV-AOS-5108", jobRef: "JOB-HAM-22388", customerRef: "AOS-DESK-301", supplierRef: "SZ-OFF-77", origin: "Shenzhen, China", destination: "Hamburg, Germany", vessel: "HMM Oslo", departureDate: "2026-05-22", arrivalDate: "2026-06-02", vin: "SALGA2BFXGA234567", customFields: [{ label: "Commodity", value: "Office furniture" }, { label: "Assembly kit", value: "Desk pod A12" }] },
]

export const bookingShapeById: Record<string, { direction: BookingDirection; shipmentType: BookingShipmentType }> = {
  "MD-22682": { direction: "Domestic", shipmentType: "Pallet network" }, "MD-22683": { direction: "Domestic", shipmentType: "LTL" }, "MD-22676": { direction: "Domestic", shipmentType: "FTL" }, "MD-22679": { direction: "Domestic", shipmentType: "Pallet network" }, "MD-22671": { direction: "Domestic", shipmentType: "FTL" }, "MD-22664": { direction: "Domestic", shipmentType: "FTL" }, "MD-22658": { direction: "Domestic", shipmentType: "Pallet network" }, "MD-22481": { direction: "Import", shipmentType: "FCL" }, "MD-22479": { direction: "Import", shipmentType: "FCL" }, "MD-22466": { direction: "Export", shipmentType: "ULD" }, "MD-22455": { direction: "Import", shipmentType: "FCL" }, "MD-22441": { direction: "Cross trade", shipmentType: "LTL" }, "MD-22429": { direction: "Cross trade", shipmentType: "FCL" }, "MD-22414": { direction: "Import", shipmentType: "FCL" }, "MD-22399": { direction: "Import", shipmentType: "FCL" }, "MD-22388": { direction: "Export", shipmentType: "FCL" },
}

export function getBookingShape(bookingId: string) {
  return bookingShapeById[bookingId] ?? { direction: "Cross trade" as const, shipmentType: "LTL" as const }
}

export const currentOperator = {
  name: "Elena Moreno",
  initials: "EM",
}

export const bookingScopeTabs = ["My Jobs", "All Jobs", "Staged Jobs"] as const
export const customerScopeTabs = ["All customers", "My customers"] as const
export const initialFavouriteBookingIds = ["MD-22481", "MD-22455", "MD-22414"] as const

export const operatorJobs = [
  {
    id: "job-md-22455",
    bookingId: "MD-22455",
    customer: "Northwind GmbH",
    route: "Shanghai → Long Beach",
    task: "Request CN export licence from Yong Hua",
    detail: "Customs hold blocks release and customer update.",
    due: "10:30",
    status: "Needs reply",
    tone: "red" as StatusTone,
  },
  {
    id: "job-md-22481",
    bookingId: "MD-22481",
    customer: "Marlow Apparel Ltd",
    route: "Yantian → Felixstowe",
    task: "Send arrival note and attach cleared docs",
    detail: "All documents parsed; customer is waiting on a clean ETA.",
    due: "11:15",
    status: "Ready",
    tone: "green" as StatusTone,
  },
  {
    id: "job-rfq-3310",
    bookingId: "RFQ-3310",
    customer: "Pacific Goods Co",
    route: "Dubai → Heathrow",
    task: "Send air quote before Dubai cutoff",
    detail: "Carrier rate is confirmed; margin approval is inside rules.",
    due: "12:00",
    status: "Quote due",
    tone: "amber" as StatusTone,
  },
  {
    id: "job-md-22479",
    bookingId: "MD-22479",
    customer: "Bauhaus Importe GmbH",
    route: "Ningbo → Rotterdam",
    task: "Notify customer about +36h berth delay",
    detail: "Dexter drafted the update from the latest ETA model.",
    due: "13:40",
    status: "Draft ready",
    tone: "teal" as StatusTone,
  },
  {
    id: "job-md-22414",
    bookingId: "MD-22414",
    customer: "Marlow Apparel Ltd",
    route: "Qingdao → Felixstowe",
    task: "Review CI/PL value mismatch",
    detail: "One invoice line does not match the packing-list quantity.",
    due: "15:00",
    status: "Check docs",
    tone: "red" as StatusTone,
  },
] as const

export const bookingMetrics = [
  { label: "Open", value: "34", tone: "neutral" as StatusTone },
  { label: "In transit", value: "23", tone: "teal" as StatusTone },
  { label: "At destination", value: "6", tone: "blue" as StatusTone },
  { label: "Exceptions", value: "2", tone: "red" as StatusTone },
  { label: "Delivered", value: "48", tone: "green" as StatusTone },
]

export const bookingMilestones = [
  { label: "Picked up", detail: "May 22", state: "done" },
  { label: "Origin port", detail: "May 24", state: "done" },
  { label: "Departed", detail: "May 25", state: "done" },
  { label: "In transit", detail: "now", state: "current" },
  { label: "Destination", detail: "Jun 09", state: "pending" },
  { label: "Customs", detail: "pending", state: "pending" },
  { label: "Delivered", detail: "—", state: "pending" },
]

export const bookingCargo = [
  ["Container", "EGLV 728 4419 (40HC)"],
  ["Seal", "0148-2266"],
  ["HS code", "8517.62.00"],
  ["Description", "Optical network terminals, qty 1,840"],
  ["Gross weight", "14,820 kg"],
  ["Declared value", "USD 184,200.00"],
  ["Incoterms", "CIF Long Beach"],
]

export const bookingDocuments = [
  ["Commercial invoice", "CI-202604-7184.pdf", "extracted · 99%"],
  ["Packing list", "PL-202604-7184.pdf", "extracted · 98%"],
  ["Bill of lading", "EGLV-MBL-728.pdf", "extracted · 96%"],
  ["Certificate of origin", "CO-CN-44128.pdf", "extracted · 94%"],
  ["Insurance certificate", "INS-22455.pdf", "extracted · 99%"],
]

export const bookingTimeline = [
  { time: "09:42 · AI", text: "Customs hold raised — see exception above.", tone: "red" as StatusTone },
  { time: "08:30 · Wei Chen", text: "Submitted CDS entry to HMRC on parallel booking MD-22481.", tone: "blue" as StatusTone },
  { time: "07:14 · AI", text: "BoL parsed · 18 fields extracted · 96% avg confidence.", tone: "green" as StatusTone },
  { time: "May 25 18:02 · EVERGREEN", text: "Vessel departed Shanghai · ETA pinned to model.", tone: "neutral" as StatusTone },
  { time: "May 24 11:30 · Yong Hua", text: "Container gated in at terminal SH-Waigaoqiao.", tone: "neutral" as StatusTone },
  { time: "May 22 09:15 · Elena Moreno", text: "Booking confirmed · vessel \"Ever Given\" voyage 4421E.", tone: "neutral" as StatusTone },
]

export type ReportTemplateChart = "kpi" | "line" | "donut" | "bars"

export type ReportTemplate = {
  id: string
  title: string
  description: string
  cadence: string
  format: string
  chart: ReportTemplateChart
  metric?: string
  series?: number[]
  bars?: number[][]
}

export type GeneratedReportStatus = "Ready" | "Generating" | "Scheduled"

export type GeneratedReport = {
  id: string
  title: string
  subtitle: string
  scope: string
  period: string
  created: string
  status: GeneratedReportStatus
}

export const reportTemplates: ReportTemplate[] = [
  {
    id: "monthly-client-review",
    title: "Monthly client review",
    description: "KPIs, bookings, exceptions & spend for one customer",
    cadence: "Monthly · 1st",
    format: "PDF",
    chart: "kpi",
    metric: "94%",
    series: [18, 22, 29, 27, 31, 37, 36, 44],
  },
  {
    id: "carrier-performance",
    title: "Carrier performance",
    description: "On-time, dwell and rate trends across carriers",
    cadence: "Quarterly",
    format: "PDF + XLSX",
    chart: "line",
    series: [18, 21, 26, 31, 34, 33, 35, 39, 45, 51],
  },
  {
    id: "customs-compliance",
    title: "Customs & compliance",
    description: "Declarations, HS-code audit trail, duty paid",
    cadence: "Monthly · 5th",
    format: "PDF",
    chart: "donut",
  },
  {
    id: "spend-summary",
    title: "Spend summary",
    description: "Billed vs quoted, surcharges, currency exposure",
    cadence: "Weekly · Mon",
    format: "XLSX",
    chart: "bars",
    bars: [
      [88, 40, 28],
      [62, 54, 34],
      [80, 42, 26],
    ],
  },
]

export const generatedReports: GeneratedReport[] = [
  {
    id: "rpt-marlow-may-review",
    title: "Marlow Apparel — May review",
    subtitle: "Monthly client review · 2.4 MB",
    scope: "Marlow Apparel Ltd",
    period: "May 2026",
    created: "Jun 01, 06:00",
    status: "Ready",
  },
  {
    id: "rpt-carrier-q2",
    title: "Carrier performance — Q2 to date",
    subtitle: "Carrier performance · 1.1 MB",
    scope: "All carriers",
    period: "Apr – Jun 2026",
    created: "Jun 09, 07:15",
    status: "Ready",
  },
  {
    id: "rpt-bauhaus-may-review",
    title: "Bauhaus Importe — May review",
    subtitle: "Monthly client review · 1.9 MB",
    scope: "Bauhaus Importe GmbH",
    period: "May 2026",
    created: "Jun 01, 06:00",
    status: "Ready",
  },
  {
    id: "rpt-customs-audit-may",
    title: "Customs audit — May",
    subtitle: "Customs & compliance · 4.2 MB",
    scope: "EU + UK lanes",
    period: "May 2026",
    created: "Jun 05, 06:30",
    status: "Ready",
  },
  {
    id: "rpt-spend-week-24",
    title: "Spend summary — week 24",
    subtitle: "Spend summary · —",
    scope: "All customers",
    period: "Jun 08 – 14",
    created: "Generating now",
    status: "Generating",
  },
  {
    id: "rpt-northwind-june-review",
    title: "Northwind GmbH — June review",
    subtitle: "Monthly client review · —",
    scope: "Northwind GmbH",
    period: "Jun 2026",
    created: "Scheduled · Jul 01",
    status: "Scheduled",
  },
]

export const reportFilters = ["All", "Ready", "Scheduled", "Client reviews"] as const

export const digestItems = [
  "MD-22455 is on customs hold. Missing CN export licence. Reach out to Yong Hua Logistics?",
  "Rotterdam berth queue is pushing MD-22479 ETA out 36h. Notify Northwind GmbH?",
  "Otherwise quiet: 23 bookings on track, customs average is 11h.",
]

export const activityItems = [
  { title: "MD-22455 placed on customs hold. Export licence missing.", source: "AI - Exception engine", time: "09:28", tone: "red" as StatusTone, icon: TriangleAlert },
  { title: "BoL MSKU-7814322.pdf parsed. 18 fields extracted at 98% confidence.", source: "AI - Document inbox", time: "09:11", tone: "teal" as StatusTone, icon: ScanText },
  { title: "MD-22466 cleared US customs. Released to airline.", source: "Customs broker", time: "08:54", tone: "green" as StatusTone, icon: BadgeCheck },
  { title: "MD-22479 ETA shifted +36h. Rotterdam berth queue.", source: "AI - ETA model", time: "08:30", tone: "amber" as StatusTone, icon: Clock3 },
  { title: "Quote Q-1882 accepted by Northwind GmbH for GBP 8,420.", source: "Sales", time: "08:16", tone: "blue" as StatusTone, icon: BriefcaseBusiness },
]

export const customsQueue = [
  { id: "MD-22455", entry: "CN export licence missing", status: "Action req.", progress: 46, tone: "red" as StatusTone },
  { id: "MD-22468", entry: "CDS entry submitted", status: "Submitted", progress: 68, tone: "teal" as StatusTone },
  { id: "MD-22479", entry: "Awaiting HMRC response", status: "Under review", progress: 54, tone: "amber" as StatusTone },
]

export const bookingModes = [
  { label: "Ocean", count: 14, icon: Ship, tone: "teal" as StatusTone },
  { label: "Air", count: 6, icon: Plane, tone: "blue" as StatusTone },
  { label: "Road", count: 3, icon: PackageCheck, tone: "green" as StatusTone },
]

export type CustomerStatus = "Premium" | "Standard" | "Trial" | "New"

export type CustomerRecord = {
  id: string
  lastContactAt?: string | null
  initials: string
  name: string
  location: string
  industry: string
  contacts: number
  active: string
  activeTone: StatusTone
  bookings30d: number[]
  sparkTone: StatusTone
  billedYtd: string
  onTime: string
  onTimeTone: StatusTone
  status: CustomerStatus
  owner: string
  avatarTone: string
}

const placeholderCustomerProfiles = [
  { id: "hartmann-textiles", initials: "HT", name: "Hartmann Textiles", location: "Hamburg, DE", industry: "Apparel & textiles", status: "New", owner: "EM", avatarTone: "teal" },
  { id: "nordic-homeware", initials: "NH", name: "Nordic Homeware AB", location: "Stockholm, SE", industry: "Furniture & home", status: "Premium", owner: "EM", avatarTone: "blue" },
  { id: "meridian-medical", initials: "MM", name: "Meridian Medical Supplies", location: "Leeds, UK", industry: "Healthcare supplies", status: "Standard", owner: "JL", avatarTone: "teal" },
  { id: "rhein-auto-parts", initials: "RA", name: "Rhein Auto Parts GmbH", location: "Cologne, DE", industry: "Automotive parts", status: "Standard", owner: "WC", avatarTone: "olive" },
  { id: "cobalt-cycleworks", initials: "CC", name: "Cobalt Cycleworks", location: "Bristol, UK", industry: "Sports equipment", status: "Trial", owner: "EM", avatarTone: "cream" },
  { id: "lisbon-lighting", initials: "LL", name: "Lisbon Lighting Co", location: "Lisbon, PT", industry: "Lighting & fixtures", status: "Premium", owner: "JL", avatarTone: "teal" },
  { id: "valencia-textiles", initials: "VT", name: "Valencia Textiles SL", location: "Valencia, ES", industry: "Apparel & textiles", status: "Standard", owner: "WC", avatarTone: "cream" },
  { id: "copenhagen-kids", initials: "CK", name: "Copenhagen Kidswear", location: "Copenhagen, DK", industry: "Childrenswear", status: "Standard", owner: "EM", avatarTone: "blue" },
  { id: "baltic-brewery", initials: "BB", name: "Baltic Brewery Group", location: "Gdansk, PL", industry: "Food & beverage", status: "Premium", owner: "JL", avatarTone: "olive" },
  { id: "terra-garden", initials: "TG", name: "Terra Garden Imports", location: "Milan, IT", industry: "Garden & outdoor", status: "Standard", owner: "WC", avatarTone: "teal" },
  { id: "bristol-bathware", initials: "BW", name: "Bristol Bathware Ltd", location: "Bristol, UK", industry: "Bathroom fixtures", status: "New", owner: "EM", avatarTone: "cream" },
  { id: "hanseatic-tools", initials: "HT", name: "Hanseatic Tools GmbH", location: "Bremen, DE", industry: "Industrial tools", status: "Standard", owner: "JL", avatarTone: "blue" },
  { id: "paris-packaging", initials: "PP", name: "Paris Packaging SA", location: "Paris, FR", industry: "Packaging", status: "Standard", owner: "WC", avatarTone: "teal" },
  { id: "zurich-labware", initials: "ZL", name: "Zurich Labware AG", location: "Zurich, CH", industry: "Laboratory equipment", status: "Premium", owner: "EM", avatarTone: "olive" },
  { id: "edinburgh-outdoor", initials: "EO", name: "Edinburgh Outdoor Co", location: "Edinburgh, UK", industry: "Outdoor apparel", status: "Standard", owner: "JL", avatarTone: "cream" },
  { id: "rotterdam-retail", initials: "RR", name: "Rotterdam Retail Fixtures", location: "Rotterdam, NL", industry: "Retail fixtures", status: "Standard", owner: "WC", avatarTone: "blue" },
  { id: "oslo-marine", initials: "OM", name: "Oslo Marine Interiors", location: "Oslo, NO", industry: "Marine & offshore", status: "Premium", owner: "EM", avatarTone: "teal" },
  { id: "vienna-instruments", initials: "VI", name: "Vienna Instruments GmbH", location: "Vienna, AT", industry: "Musical instruments", status: "Standard", owner: "JL", avatarTone: "olive" },
  { id: "lille-living", initials: "LV", name: "Lille Living Maison", location: "Lille, FR", industry: "Homeware", status: "Trial", owner: "WC", avatarTone: "cream" },
  { id: "dublin-device", initials: "DD", name: "Dublin Device Works", location: "Dublin, IE", industry: "Consumer electronics", status: "Standard", owner: "EM", avatarTone: "blue" },
  { id: "antwerp-apothecary", initials: "AA", name: "Antwerp Apothecary", location: "Antwerp, BE", industry: "Health & beauty", status: "Standard", owner: "JL", avatarTone: "teal" },
  { id: "prague-printworks", initials: "PW", name: "Prague Printworks", location: "Prague, CZ", industry: "Print & materials", status: "Standard", owner: "WC", avatarTone: "olive" },
  { id: "malmo-mobility", initials: "MO", name: "Malmo Mobility AB", location: "Malmo, SE", industry: "Mobility hardware", status: "Premium", owner: "EM", avatarTone: "cream" },
  { id: "seville-ceramics", initials: "SC", name: "Seville Ceramics", location: "Seville, ES", industry: "Ceramics", status: "Standard", owner: "JL", avatarTone: "blue" },
  { id: "ghent-gourmet", initials: "GG", name: "Ghent Gourmet Foods", location: "Ghent, BE", industry: "Specialty foods", status: "Standard", owner: "WC", avatarTone: "teal" },
  { id: "munster-machinery", initials: "MC", name: "Munster Machinery GmbH", location: "Munster, DE", industry: "Machinery", status: "Premium", owner: "EM", avatarTone: "olive" },
  { id: "cardiff-coldchain", initials: "CD", name: "Cardiff Coldchain Ltd", location: "Cardiff, UK", industry: "Cold chain", status: "Standard", owner: "JL", avatarTone: "cream" },
  { id: "florence-fabrics", initials: "FF", name: "Florence Fabrics SRL", location: "Florence, IT", industry: "Apparel & textiles", status: "Standard", owner: "WC", avatarTone: "blue" },
  { id: "porto-petcare", initials: "PC", name: "Porto Petcare", location: "Porto, PT", industry: "Pet products", status: "New", owner: "EM", avatarTone: "teal" },
  { id: "lyon-leisure", initials: "LY", name: "Lyon Leisure Goods", location: "Lyon, FR", industry: "Leisure goods", status: "Standard", owner: "JL", avatarTone: "olive" },
  { id: "tallinn-tech", initials: "TT", name: "Tallinn Tech Components", location: "Tallinn, EE", industry: "Electronic components", status: "Trial", owner: "WC", avatarTone: "cream" },
] satisfies Array<{
  id: string
  initials: string
  name: string
  location: string
  industry: string
  status: CustomerStatus
  owner: string
  avatarTone: string
}>

function makeBookingSeries(index: number) {
  const base = 4 + (index % 7)
  return Array.from({ length: 12 }, (_, step) => base + step * ((index % 3) + 1) + ((step + index) % 4))
}

const placeholderCustomers: CustomerRecord[] = placeholderCustomerProfiles.map((customer, index) => {
  const hasException = index % 9 === 3
  const activeCount = 2 + (index % 8)
  const onTimeValue = 88 + (index % 12)

  return {
    ...customer,
    contacts: 1 + (index % 5),
    active: hasException ? `${activeCount} · 1!` : String(activeCount),
    activeTone: hasException ? "amber" : "neutral",
    bookings30d: makeBookingSeries(index),
    sparkTone: (["teal", "blue", "amber"] as StatusTone[])[index % 3],
    billedYtd: index < 8 ? `€${(1.1 + index * 0.22).toFixed(1)}M` : `€${420 + index * 35}k`,
    onTime: `${onTimeValue}%`,
    onTimeTone: onTimeValue >= 96 ? "green" : onTimeValue <= 90 ? "amber" : "neutral",
  }
})

export const customers: CustomerRecord[] = [
  {
    id: "marlow-apparel",
    initials: "MA",
    name: "Marlow Apparel Ltd",
    location: "London, UK",
    industry: "Apparel & textiles",
    contacts: 4,
    active: "6 · 1!",
    activeTone: "amber" as StatusTone,
    bookings30d: [18, 24, 21, 28, 25, 31, 29, 36, 33, 41, 38, 47, 44],
    sparkTone: "teal" as StatusTone,
    billedYtd: "€4.2M",
    onTime: "96%",
    onTimeTone: "green" as StatusTone,
    status: "Premium" as CustomerStatus,
    owner: "EM",
    avatarTone: "olive",
  },
  {
    id: "bauhaus-importe",
    initials: "BI",
    name: "Bauhaus Importe GmbH",
    location: "Hamburg, DE",
    industry: "Furniture & home",
    contacts: 3,
    active: "4",
    activeTone: "neutral" as StatusTone,
    bookings30d: [12, 9, 16, 13, 20, 17, 21, 18, 25, 22, 26, 30],
    sparkTone: "teal" as StatusTone,
    billedYtd: "€2.8M",
    onTime: "94%",
    onTimeTone: "neutral" as StatusTone,
    status: "Standard" as CustomerStatus,
    owner: "EM",
    avatarTone: "blue",
  },
  {
    id: "black-forest-foods",
    initials: "BF",
    name: "Black Forest Foods",
    location: "Stuttgart, DE",
    industry: "Food & beverage",
    contacts: 5,
    active: "9 · 1!",
    activeTone: "amber" as StatusTone,
    bookings30d: [8, 14, 11, 17, 14, 21, 18, 24, 21, 28, 25, 31],
    sparkTone: "blue" as StatusTone,
    billedYtd: "€2.1M",
    onTime: "91%",
    onTimeTone: "neutral" as StatusTone,
    status: "Premium" as CustomerStatus,
    owner: "JL",
    avatarTone: "cream",
  },
  {
    id: "pacific-goods",
    initials: "PG",
    name: "Pacific Goods Co",
    location: "Oakland, US",
    industry: "Consumer electronics",
    contacts: 2,
    active: "5",
    activeTone: "neutral" as StatusTone,
    bookings30d: [10, 14, 11, 18, 14, 14, 18, 18, 22, 22, 18, 28],
    sparkTone: "teal" as StatusTone,
    billedYtd: "€1.9M",
    onTime: "89%",
    onTimeTone: "amber" as StatusTone,
    status: "Standard" as CustomerStatus,
    owner: "EM",
    avatarTone: "cream",
  },
  {
    id: "mediterranean-spice",
    initials: "MS",
    name: "Mediterranean Spice Trading",
    location: "Athens, GR",
    industry: "Specialty foods",
    contacts: 3,
    active: "7",
    activeTone: "neutral" as StatusTone,
    bookings30d: [9, 11, 11, 13, 10, 16, 13, 19, 16, 22, 19, 25],
    sparkTone: "amber" as StatusTone,
    billedYtd: "€1.4M",
    onTime: "93%",
    onTimeTone: "neutral" as StatusTone,
    status: "Premium" as CustomerStatus,
    owner: "WC",
    avatarTone: "cream",
  },
  {
    id: "atlas-office",
    initials: "AO",
    name: "Atlas Office Supply",
    location: "Berlin, DE",
    industry: "B2B office",
    contacts: 2,
    active: "3",
    activeTone: "neutral" as StatusTone,
    bookings30d: [4, 7, 7, 10, 6, 9, 9, 12, 9, 12, 12, 15],
    sparkTone: "blue" as StatusTone,
    billedYtd: "€620k",
    onTime: "97%",
    onTimeTone: "green" as StatusTone,
    status: "Standard" as CustomerStatus,
    owner: "JL",
    avatarTone: "teal",
  },
  {
    id: "aldridge-sons",
    initials: "AS",
    name: "Aldridge & Sons",
    location: "Manchester, UK",
    industry: "Industrial parts",
    contacts: 2,
    active: "2 · 1!",
    activeTone: "amber" as StatusTone,
    bookings30d: [5, 9, 9, 13, 9, 13, 13, 16, 12, 16, 16, 20],
    sparkTone: "teal" as StatusTone,
    billedYtd: "€410k",
    onTime: "88%",
    onTimeTone: "amber" as StatusTone,
    status: "Trial" as CustomerStatus,
    owner: "EM",
    avatarTone: "blue",
  },
  {
    id: "kessler-sohne",
    initials: "KS",
    name: "Kessler & Söhne KG",
    location: "Munich, DE",
    industry: "Precision mechanical",
    contacts: 3,
    active: "3",
    activeTone: "neutral" as StatusTone,
    bookings30d: [3, 3, 6, 3, 6, 6, 9, 6, 9, 9, 13, 9],
    sparkTone: "amber" as StatusTone,
    billedYtd: "€890k",
    onTime: "99%",
    onTimeTone: "green" as StatusTone,
    status: "Standard" as CustomerStatus,
    owner: "WC",
    avatarTone: "blue",
  },
  {
    id: "helsinki-marine",
    initials: "HM",
    name: "Helsinki Marine Equipment",
    location: "Helsinki, FI",
    industry: "Marine & offshore",
    contacts: 1,
    active: "1",
    activeTone: "neutral" as StatusTone,
    bookings30d: [2, 5, 5, 5, 8, 5, 8, 8, 11, 8, 11, 11],
    sparkTone: "blue" as StatusTone,
    billedYtd: "€180k",
    onTime: "100%",
    onTimeTone: "green" as StatusTone,
    status: "New" as CustomerStatus,
    owner: "JL",
    avatarTone: "teal",
  },
  ...placeholderCustomers,
]

function getCustomerStatusCount(status: CustomerStatus) {
  return customers.filter((customer) => customer.status === status).length
}

export const customerFilters = [
  `All · ${customers.length}`,
  `Premium · ${getCustomerStatusCount("Premium")}`,
  `Standard · ${getCustomerStatusCount("Standard")}`,
  `Trial · ${getCustomerStatusCount("Trial")} !`,
  `New · ${getCustomerStatusCount("New")}`,
]

export const marlowMetrics = [
  { label: "YTD bookings", value: "287", detail: "+18% vs '25", tone: "teal" as StatusTone },
  { label: "Billed YTD", value: "€4.2M", detail: "€620k avg/mo", tone: "neutral" as StatusTone },
  { label: "On-time", value: "96%", detail: "trailing 90d", tone: "green" as StatusTone },
  { label: "Avg margin", value: "18.4%", detail: "company avg 16.2%", tone: "green" as StatusTone },
  { label: "NPS · last survey", value: "62", detail: "May 2026 · 8 responses", tone: "neutral" as StatusTone },
]

export const marlowTabs = [
  { label: "Overview" },
  { label: "Contacts", value: "4" },
  { label: "Bookings", value: "6 active · 287 YTD" },
  { label: "Documents", value: "94" },
  { label: "Quotes", value: "3 open" },
  { label: "Activity" },
  { label: "Notes" },
]

export const marlowActiveBookings = [
  { id: "MD-22481", route: "Yantian → Felixstowe", detail: "COSCO 7184 · CFC service", mode: "OCEAN", eta: "Jun 04", progress: 64, tone: "green" as StatusTone },
  { id: "MD-22414", route: "Qingdao → Felixstowe", detail: "Maersk · doc mismatch", mode: "OCEAN", eta: "Jun 11", progress: 38, tone: "red" as StatusTone },
  { id: "MD-22399", route: "Ningbo → Southampton", detail: "ONE · JCV3", mode: "OCEAN", eta: "Jun 13", progress: 28, tone: "green" as StatusTone },
  { id: "MD-22372", route: "Shanghai → Felixstowe", detail: "Evergreen · CES", mode: "OCEAN", eta: "Jun 18", progress: 12, tone: "green" as StatusTone },
  { id: "MD-22288", route: "Hong Kong → London STN", detail: "CV 8861", mode: "AIR", eta: "May 29", progress: 84, tone: "green" as StatusTone },
  { id: "MD-22260", route: "Ho Chi Minh → Felixstowe", detail: "CMA CGM · FAL3", mode: "OCEAN", eta: "Jun 09", progress: 58, tone: "amber" as StatusTone },
]

export const marlowContacts = [
  {
    initials: "SA",
    name: "Sandra Aldridge",
    role: "VP Operations · prefers WhatsApp",
    email: "sandra@marlow.co.uk",
    phone: "+44 20 7946 0184",
    mobile: "+44 7700 900184",
    status: "active replied yesterday",
    primary: true,
    tone: "blue",
    location: "London, UK",
    department: "Operations",
    influence: "Final sign-off for service levels and peak-season capacity",
    preference: "WhatsApp for urgent issues, email for commercial decisions",
    owner: "Elena Moreno",
    lastTouch: "Email reply yesterday · AW26 capacity planning",
    nextStep: "Confirm September allocation before new volume forecast locks",
    openItems: ["AW26 forecast +20% above baseline", "MD-22414 customs hold visibility", "Quarterly service review in July"],
    linkedBookings: ["MD-22481", "MD-22414", "MD-22260"],
    notes: "Values early warnings and concise options. Avoid long operational threads unless there is a decision needed.",
  },
  {
    initials: "RP",
    name: "Robin Park",
    role: "Customs lead · prefers Email",
    email: "robin@marlow.co.uk",
    phone: "+44 20 7946 0186",
    mobile: "+44 7700 900186",
    status: "active 2 days ago",
    primary: false,
    tone: "teal",
    location: "London, UK",
    department: "Customs",
    influence: "Controls customs documentation accuracy and broker handoffs",
    preference: "Email with document references in the subject line",
    owner: "Elena Moreno",
    lastTouch: "Docs query 2 days ago · commercial invoice values",
    nextStep: "Send corrected CI/PL values for MD-22414",
    openItems: ["CI/PL value mismatch", "Broker response time review"],
    linkedBookings: ["MD-22414", "MD-22399"],
    notes: "Needs exact references and attachment names. Best contacted before 3pm UK for same-day customs checks.",
  },
  {
    initials: "JL",
    name: "Jenny Liu",
    role: "Logistics coord. · prefers Slack",
    email: "jenny@marlow.co.uk",
    phone: "+44 20 7946 0188",
    mobile: "+44 7700 900188",
    status: "active today",
    primary: false,
    tone: "cream",
    location: "London, UK",
    department: "Logistics",
    influence: "Daily booking chasing and internal warehouse coordination",
    preference: "Slack for quick status checks, email for final ETAs",
    owner: "Elena Moreno",
    lastTouch: "Status check today · Felixstowe arrivals",
    nextStep: "Share updated berth timing for MD-22481",
    openItems: ["Felixstowe delivery slot", "Warehouse intake timing"],
    linkedBookings: ["MD-22481", "MD-22372"],
    notes: "Responds quickly when updates include booking ID, ETA, and what changed.",
  },
  {
    initials: "TW",
    name: "Tom Whitfield",
    role: "Finance director · prefers Email",
    email: "tom@marlow.co.uk",
    phone: "+44 20 7946 0190",
    mobile: "+44 7700 900190",
    status: "active last week",
    primary: false,
    tone: "teal",
    location: "London, UK",
    department: "Finance",
    influence: "Approves credit limit changes, invoice terms, and margin escalations",
    preference: "Email with billing context and totals upfront",
    owner: "Elena Moreno",
    lastTouch: "Invoice query last week · open balance",
    nextStep: "Confirm EUR invoice treatment for June statements",
    openItems: ["Open balance €84,210", "Annual renewal pricing"],
    linkedBookings: ["Q-1882"],
    notes: "Commercially sharp. Keep finance messages short and attach the supporting statement.",
  },
]

export const marlowLaneMix = [
  { lane: "Shanghai → Felixstowe", value: 28 },
  { lane: "Yantian → Felixstowe", value: 18 },
  { lane: "Ningbo → Southampton", value: 12 },
  { lane: "Hong Kong → London STN", value: 7 },
  { lane: "Qingdao → Felixstowe", value: 4 },
  { lane: "Ho Chi Minh → Felixstowe", value: 2 },
]

export const marlowActivity = [
  { time: "Today 09:42", title: "Customs hold raised on MD-22414 · CI/PL value mismatch", source: "AI · Exception engine", tone: "red" as StatusTone },
  { time: "Today 08:30", title: "Sandra Aldridge replied to your AW26 capacity question", source: "Email · Sandra Aldridge", tone: "teal" as StatusTone },
  { time: "Mon 16:18", title: "Quote Q-1882 sent · 14d service Yantian → Felixstowe", source: "Sales · Elena Moreno", tone: "blue" as StatusTone },
]

export const marlowAccount = [
  ["Legal entity", "Marlow Apparel Limited"],
  ["VAT", "GB 482 119 322"],
  ["Billing", "Net 30 · invoice EUR"],
  ["Credit limit", "€500,000"],
  ["Open balance", "€84,210"],
  ["Renewal", "Annual · 14 Mar 2027"],
]

export const crmSummaryMetrics = [
  { label: "Relationship health", value: "91%", detail: "premium leads in good shape", tone: "green" as StatusTone },
  { label: "Open revenue", value: "€842k", detail: "quotes, renewals, and uplifts", tone: "teal" as StatusTone },
  { label: "Follow-ups due", value: "9", detail: "5 customer-facing today", tone: "amber" as StatusTone },
  { label: "At-risk leads", value: "3", detail: "customs noise or renewal risk", tone: "red" as StatusTone },
]

export const crmDashboardFocus = [
  { label: "Pipeline value", value: "€842k", detail: "+18% vs last month", tone: "teal" as StatusTone },
  { label: "Weighted forecast", value: "€486k", detail: "June commit", tone: "green" as StatusTone },
  { label: "Win rate", value: "38%", detail: "+4 pts in 30 days", tone: "blue" as StatusTone },
]

export const crmSalesFunnel = [
  { stage: "New leads", count: "39", value: "€1.42M", conversion: 100, tone: "blue" as StatusTone },
  { stage: "Qualified", count: "26", value: "€1.08M", conversion: 67, tone: "teal" as StatusTone },
  { stage: "Quoted", count: "14", value: "€842k", conversion: 36, tone: "amber" as StatusTone },
  { stage: "Committed", count: "5", value: "€486k", conversion: 13, tone: "green" as StatusTone },
]

export const crmRevenueMix = [
  { label: "New business", value: "€318k", share: 38, tone: "teal" as StatusTone, detail: "trial and cold lead conversion" },
  { label: "Renewals", value: "€286k", share: 34, tone: "green" as StatusTone, detail: "active account retention" },
  { label: "Expansion", value: "€154k", share: 18, tone: "blue" as StatusTone, detail: "new lanes and seasonal volume" },
  { label: "Recovery", value: "€84k", share: 10, tone: "amber" as StatusTone, detail: "service recovery work" },
]

export const crmForecastTrend = [
  { period: "Week 1", commit: "€74k", bestCase: "€112k", attainment: 72, tone: "green" as StatusTone },
  { period: "Week 2", commit: "€96k", bestCase: "€156k", attainment: 81, tone: "teal" as StatusTone },
  { period: "Week 3", commit: "€118k", bestCase: "€184k", attainment: 68, tone: "amber" as StatusTone },
  { period: "Week 4", commit: "€198k", bestCase: "€262k", attainment: 86, tone: "green" as StatusTone },
]

export const crmPriorityActions = [
  { title: "Close Pacific air quote before cutoff", account: "Pacific Goods Co", due: "Today", owner: "EM", impact: "€54k", tone: "amber" as StatusTone },
  { title: "Book Marlow AW26 capacity review", account: "Marlow Apparel Ltd", due: "Tomorrow", owner: "EM", impact: "€310k", tone: "green" as StatusTone },
  { title: "Send Bauhaus service recovery note", account: "Bauhaus Importe GmbH", due: "Jun 19", owner: "JL", impact: "€184k", tone: "amber" as StatusTone },
  { title: "Resolve Aldridge customs blocker", account: "Aldridge & Sons", due: "Overdue", owner: "EM", impact: "€92k", tone: "red" as StatusTone },
]

export const crmAccountSignals = [
  {
    account: "Marlow Apparel Ltd",
    initials: "MA",
    tone: "olive",
    signal: "AW26 forecast is 20% above baseline",
    metric: "€4.2M YTD",
    detail: "Capacity conversation should happen before September allocations lock.",
    status: "Expansion",
    statusTone: "green" as StatusTone,
  },
  {
    account: "Pacific Goods Co",
    initials: "PG",
    tone: "cream",
    signal: "Air quote response time is slipping",
    metric: "89% on-time",
    detail: "Commercial opportunity is good, but customer confidence needs tighter reply rhythm.",
    status: "Watch",
    statusTone: "amber" as StatusTone,
  },
  {
    account: "Aldridge & Sons",
    initials: "AS",
    tone: "blue",
    signal: "Trial account has one customs exception",
    metric: "€410k YTD",
    detail: "Resolve the open hold and turn the trial into a cleaner retained account.",
    status: "Risk",
    statusTone: "red" as StatusTone,
  },
]

export const crmPipelineStages = [
  {
    id: "qualifying",
    title: "Qualifying",
    meta: "3 leads",
    tone: "blue" as StatusTone,
    deals: [
      {
        id: "crm-aldridge-trial",
        title: "Convert Aldridge trial",
        account: "Aldridge & Sons",
        contact: "Sandra Aldridge",
        value: "€92k",
        due: "Jun 14",
        owner: "EM",
        status: "Customs blocker",
        summary: "Trial volume is strong, but one customs hold needs closing before commercial sign-off.",
        nextStep: "Send resolved-hold summary with next 30d lane plan.",
        tone: "red" as StatusTone,
      },
      {
        id: "crm-zurich-labware",
        title: "Zurich labware cold chain",
        account: "Zurich Labware AG",
        contact: "Lena Vogt",
        value: "€68k",
        due: "Jun 17",
        owner: "EM",
        status: "Needs lane check",
        summary: "Customer wants Basel pickup options and GDP handling confirmation.",
        nextStep: "Confirm carrier capacity and temperature docs.",
        tone: "amber" as StatusTone,
      },
    ],
  },
  {
    id: "quoted",
    title: "Quoted",
    meta: "4 deals",
    tone: "teal" as StatusTone,
    deals: [
      {
        id: "crm-marlow-aw26",
        title: "AW26 capacity block",
        account: "Marlow Apparel Ltd",
        contact: "Sandra Aldridge",
        value: "€310k",
        due: "Jun 12",
        owner: "EM",
        status: "Proposal sent",
        summary: "Asia to UK seasonal allocation with service-level promise and customs escalation lane.",
        nextStep: "Book 20 minute capacity review with Sandra and Tom.",
        tone: "green" as StatusTone,
      },
      {
        id: "crm-pacific-air",
        title: "Pacific air lane uplift",
        account: "Pacific Goods Co",
        contact: "Maya Chen",
        value: "€54k",
        due: "Today",
        owner: "EM",
        status: "Reply due",
        summary: "DXB to Heathrow rate is ready; customer asked for pickup windows and insurance terms.",
        nextStep: "Send final quote before Dubai cutoff.",
        tone: "amber" as StatusTone,
      },
    ],
  },
  {
    id: "negotiating",
    title: "Negotiating",
    meta: "2 renewals",
    tone: "amber" as StatusTone,
    deals: [
      {
        id: "crm-bauhaus-renewal",
        title: "Bauhaus quarterly renewal",
        account: "Bauhaus Importe GmbH",
        contact: "Lukas Meyer",
        value: "€184k",
        due: "Jun 19",
        owner: "EM",
        status: "Margin review",
        summary: "Renewal can hold margin if Rotterdam delay communication is handled cleanly.",
        nextStep: "Send service recovery note and revised lane mix.",
        tone: "amber" as StatusTone,
      },
    ],
  },
  {
    id: "committed",
    title: "Committed",
    meta: "3 wins",
    tone: "green" as StatusTone,
    deals: [
      {
        id: "crm-northwind-repeat",
        title: "Northwind repeat ocean work",
        account: "Northwind GmbH",
        contact: "Greta Schneider",
        value: "€148k",
        due: "Won",
        owner: "JL",
        status: "Handoff",
        summary: "Repeat Asia-Europe ocean volume accepted with same broker escalation path.",
        nextStep: "Create booking templates and notify operations.",
        tone: "green" as StatusTone,
      },
    ],
  },
]

export const crmPipelineBoards = [
  {
    id: "commercial",
    name: "Commercial pipeline",
    stages: crmPipelineStages,
  },
  {
    id: "renewals",
    name: "Renewal pipeline",
    stages: [
      {
        id: "renewal-review",
        title: "Review",
        meta: "2 accounts",
        tone: "neutral" as StatusTone,
        deals: [
          {
            id: "crm-renewal-bauhaus-review",
            title: "Q3 renewal health check",
            account: "Bauhaus Importe GmbH",
            contact: "Lukas Meyer",
            value: "€184k",
            due: "Jun 19",
            owner: "EM",
            status: "Review",
            summary: "Lane mix is healthy, but Rotterdam delay communication needs closing before renewal pricing.",
            nextStep: "Confirm accepted recovery note and prepare revised terms.",
            tone: "amber" as StatusTone,
          },
          {
            id: "crm-renewal-marlow-review",
            title: "AW26 renewal forecast",
            account: "Marlow Apparel Ltd",
            contact: "Sandra Aldridge",
            value: "€310k",
            due: "Jun 21",
            owner: "EM",
            status: "Volume check",
            summary: "Early AW26 bookings point to a higher capacity requirement from September.",
            nextStep: "Check allocation against carrier commitments.",
            tone: "teal" as StatusTone,
          },
        ],
      },
      {
        id: "renewal-commercials",
        title: "Commercials",
        meta: "1 account",
        tone: "amber" as StatusTone,
        deals: [
          {
            id: "crm-renewal-northwind-commercials",
            title: "Repeat ocean terms",
            account: "Northwind GmbH",
            contact: "Greta Schneider",
            value: "€148k",
            due: "Jun 24",
            owner: "JL",
            status: "Pricing",
            summary: "Accepted repeat volume needs updated surcharge wording before final renewal.",
            nextStep: "Send clean commercial terms and operations handoff note.",
            tone: "amber" as StatusTone,
          },
        ],
      },
      {
        id: "renewal-renewed",
        title: "Renewed",
        meta: "1 account",
        tone: "green" as StatusTone,
        deals: [
          {
            id: "crm-renewal-pacific-renewed",
            title: "Air lane retained",
            account: "Pacific Goods Co",
            contact: "Maya Chen",
            value: "€54k",
            due: "Renewed",
            owner: "EM",
            status: "Retained",
            summary: "DXB to Heathrow uplift retained after pickup window and insurance terms were clarified.",
            nextStep: "Update customer defaults and monitor first two bookings.",
            tone: "green" as StatusTone,
          },
        ],
      },
    ],
  },
  {
    id: "service-recovery",
    name: "Service recovery",
    stages: [
      {
        id: "recovery-open",
        title: "Open issue",
        meta: "2 issues",
        tone: "red" as StatusTone,
        deals: [
          {
            id: "crm-recovery-aldridge-hold",
            title: "Trial customs hold",
            account: "Aldridge & Sons",
            contact: "Sandra Aldridge",
            value: "€92k",
            due: "Today",
            owner: "EM",
            status: "At risk",
            summary: "Customs hold is blocking trial conversion and needs a customer-safe closure path.",
            nextStep: "Send resolved-hold summary with exact next action.",
            tone: "red" as StatusTone,
          },
          {
            id: "crm-recovery-bauhaus-delay",
            title: "Rotterdam berth delay",
            account: "Bauhaus Importe GmbH",
            contact: "Lukas Meyer",
            value: "€184k",
            due: "Today",
            owner: "EM",
            status: "Needs note",
            summary: "Delay explanation needs to be sent before renewal commercials move forward.",
            nextStep: "Approve and send service recovery note.",
            tone: "amber" as StatusTone,
          },
        ],
      },
      {
        id: "recovery-plan",
        title: "Recovery plan",
        meta: "1 plan",
        tone: "amber" as StatusTone,
        deals: [
          {
            id: "crm-recovery-zurich-plan",
            title: "Cold chain confidence plan",
            account: "Zurich Labware AG",
            contact: "Lena Vogt",
            value: "€68k",
            due: "Jun 17",
            owner: "EM",
            status: "Plan ready",
            summary: "Customer needs GDP handling evidence and backup carrier options before proceeding.",
            nextStep: "Send carrier options and handling proof.",
            tone: "amber" as StatusTone,
          },
        ],
      },
      {
        id: "recovery-closed",
        title: "Closed",
        meta: "1 closed",
        tone: "green" as StatusTone,
        deals: [
          {
            id: "crm-recovery-pacific-closed",
            title: "Insurance terms clarified",
            account: "Pacific Goods Co",
            contact: "Maya Chen",
            value: "€54k",
            due: "Closed",
            owner: "JL",
            status: "Resolved",
            summary: "Pickup windows and insurance terms were clarified; quote can move back to commercial follow-up.",
            nextStep: "Watch first booking and confirm customer satisfaction.",
            tone: "green" as StatusTone,
          },
        ],
      },
    ],
  },
]

export const crmContacts = [
  ...marlowContacts.map((contact) => ({
    ...contact,
    account: "Marlow Apparel Ltd",
    relationship: contact.primary ? "Decision maker" : contact.department,
  })),
  {
    initials: "MC",
    name: "Maya Chen",
    account: "Pacific Goods Co",
    role: "Supply chain director · prefers Email",
    email: "maya@pacificgoods.com",
    phone: "+1 510 555 0144",
    mobile: "+1 510 555 0194",
    status: "waiting on quote",
    primary: true,
    tone: "cream",
    location: "Oakland, US",
    department: "Supply chain",
    influence: "Controls air freight escalation and premium electronics moves",
    preference: "Email first, phone for same-day quote decisions",
    owner: "Elena Moreno",
    lastTouch: "Quote request today · Dubai to Heathrow",
    nextStep: "Send pickup options and insurance language before Dubai cutoff",
    openItems: ["DXB air quote", "Insurance terms", "Pickup cutoff"],
    linkedBookings: ["RFQ-3310", "MD-22441"],
    notes: "Responds best when options include price, time, and risk in the first three lines.",
    relationship: "Decision maker",
  },
  {
    initials: "LM",
    name: "Lukas Meyer",
    account: "Bauhaus Importe GmbH",
    role: "Import manager · prefers Email",
    email: "lukas@bauhaus-importe.de",
    phone: "+49 40 5550 421",
    mobile: "+49 151 5550 421",
    status: "active this week",
    primary: true,
    tone: "blue",
    location: "Hamburg, DE",
    department: "Imports",
    influence: "Owns renewal, lane changes, and Rotterdam exception decisions",
    preference: "Email with ETA deltas and carrier cause explained clearly",
    owner: "Elena Moreno",
    lastTouch: "ETA delay note drafted · Rotterdam berth queue",
    nextStep: "Approve customer-safe delay note and renewal context",
    openItems: ["MD-22479 ETA slip", "Quarterly renewal", "Rotterdam lane plan"],
    linkedBookings: ["MD-22479"],
    notes: "Commercially calm when delay causes are clear and next actions are already proposed.",
    relationship: "Commercial owner",
  },
  {
    initials: "GS",
    name: "Greta Schneider",
    account: "Northwind GmbH",
    role: "Operations lead · prefers Teams",
    email: "greta@northwind-gmbh.de",
    phone: "+49 30 5550 811",
    mobile: "+49 170 5550 811",
    status: "handoff ready",
    primary: true,
    tone: "teal",
    location: "Berlin, DE",
    department: "Operations",
    influence: "Owns repeat ocean work and operational escalations",
    preference: "Teams for quick approvals, email for final docs",
    owner: "Julia Lee",
    lastTouch: "Quote accepted today · repeat ocean work",
    nextStep: "Create booking templates and introduce operations owner",
    openItems: ["Template setup", "Broker handoff", "Repeat lane watch"],
    linkedBookings: ["Q-1882", "RFQ-3305"],
    notes: "Values repeatable process. Keep handoff precise and make the next booking easy to start.",
    relationship: "Operations sponsor",
  },
]

export const crmActivities = [
  { time: "Today 09:42", account: "Marlow Apparel Ltd", title: "Customs hold raised on MD-22414", source: "AI · Exception engine", detail: "CI/PL values mismatch. Robin Park needs corrected docs before broker can clear.", tone: "red" as StatusTone },
  { time: "Today 08:30", account: "Marlow Apparel Ltd", title: "Sandra replied to AW26 capacity question", source: "Email · Sandra Aldridge", detail: "Forecast is likely 20% above baseline. Capacity review should happen this week.", tone: "teal" as StatusTone },
  { time: "Today 08:16", account: "Northwind GmbH", title: "Quote Q-1882 accepted", source: "Sales · Julia Lee", detail: "Repeat ocean lane accepted. Operations template handoff is next.", tone: "green" as StatusTone },
  { time: "Yesterday 16:05", account: "Pacific Goods Co", title: "Air quote requested for DXB to Heathrow", source: "Email · Maya Chen", detail: "Pickup options and insurance terms requested before local cutoff.", tone: "amber" as StatusTone },
  { time: "Mon 14:20", account: "Bauhaus Importe GmbH", title: "Renewal risk note added", source: "Dexter · Account pulse", detail: "Rotterdam delay communication may affect renewal confidence if not handled today.", tone: "amber" as StatusTone },
]

export const crmTasks = [
  { id: "task-marlow-capacity", title: "Book Marlow capacity review", account: "Marlow Apparel Ltd", owner: "EM", due: "Today 14:00", status: "Customer-facing", detail: "Use Sandra's AW26 reply and include September allocation options.", tone: "green" as StatusTone },
  { id: "task-pacific-quote", title: "Send Pacific DXB air quote", account: "Pacific Goods Co", owner: "EM", due: "Today 12:00", status: "Quote due", detail: "Include pickup windows, insurance terms, and carrier cutoff.", tone: "amber" as StatusTone },
  { id: "task-bauhaus-note", title: "Approve Bauhaus delay note", account: "Bauhaus Importe GmbH", owner: "EM", due: "Today 13:40", status: "Needs review", detail: "Customer-safe explanation for Rotterdam berth delay.", tone: "amber" as StatusTone },
  { id: "task-aldridge-trial", title: "Resolve Aldridge trial hold", account: "Aldridge & Sons", owner: "EM", due: "Tomorrow", status: "Risk", detail: "Close customs blocker before conversion email goes out.", tone: "red" as StatusTone },
  { id: "task-northwind-handoff", title: "Create Northwind booking templates", account: "Northwind GmbH", owner: "JL", due: "Jun 13", status: "Handoff", detail: "Turn accepted quote into repeatable lane defaults.", tone: "teal" as StatusTone },
]

export const crmPipelineSettings = [
  {
    name: "Commercial pipeline",
    owner: "Elena Moreno",
    defaultStage: "Qualifying",
    conversionStage: "Committed",
    automation: "Create customer handoff when a lead reaches Committed.",
    stages: [
      { name: "Qualifying", tone: "blue" as StatusTone, rule: "Inbound lead, lane fit, or trial account needs triage." },
      { name: "Quoted", tone: "teal" as StatusTone, rule: "Rates sent and customer is comparing options." },
      { name: "Negotiating", tone: "amber" as StatusTone, rule: "Commercial terms, service levels, or renewal margin in review." },
      { name: "Committed", tone: "green" as StatusTone, rule: "Ready to become a Multideck customer record." },
    ],
  },
  {
    name: "Renewal pipeline",
    owner: "Julia Lee",
    defaultStage: "Review",
    conversionStage: "Renewed",
    automation: "Open a customer review task when renewal risk turns amber.",
    stages: [
      { name: "Review", tone: "neutral" as StatusTone, rule: "Customer health and lane mix checked." },
      { name: "Commercials", tone: "amber" as StatusTone, rule: "Pricing, margin, and service recovery reviewed." },
      { name: "Renewed", tone: "green" as StatusTone, rule: "Renewal accepted and operating defaults updated." },
    ],
  },
]

export const crmLeadFieldSettings = [
  {
    label: "Lead source",
    type: "Dropdown",
    activeOption: "Inbound email",
    options: ["Inbound email", "Referral", "Existing customer", "Trade lane", "Website"],
  },
  {
    label: "Services needed",
    type: "Multi-select dropdown",
    activeOption: "Ocean, Customs",
    options: ["Ocean", "Air", "Customs", "Warehousing", "Insurance"],
  },
  {
    label: "Buying committee",
    type: "Multi-select dropdown",
    activeOption: "Decision maker, Finance",
    options: ["Decision maker", "Finance", "Operations", "Broker", "Warehouse"],
  },
  {
    label: "Conversion trigger",
    type: "Dropdown",
    activeOption: "Committed stage",
    options: ["Committed stage", "Quote accepted", "First booking created", "Manual approval"],
  },
]
