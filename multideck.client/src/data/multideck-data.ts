import {
  AiBrain,
  AiEditing,
  AlarmClock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpDown,
  BadgeCheck,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChartAnalysis,
  ChartArea,
  ChartBar,
  ChartBarStacked,
  ChartLine,
  ChartNoAxesCombined,
  ChartPie,
  ChartScatter,
  ClipboardCheck,
  Clock3,
  Cloud,
  Component,
  FileText,
  Funnel,
  Gauge,
  Globe2,
  Grid3X3,
  House,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListOrdered,
  Mail,
  MapPin,
  MessageCircle,
  MoonStar,
  MousePointerClick,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Palette,
  Plane,
  ReceiptText,
  QrCode,
  Radar,
  Search,
  ScanText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Ship,
  SlidersHorizontal,
  Sparkles,
  Type,
  TriangleAlert,
  Truck,
  Users,
  Workflow,
  type LucideIcon,
} from "@/components/icons/hugeicons"
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
export type BookingMode = "OCEAN" | "AIR" | "ROAD" | "MULTIMODAL" | "FAS" | "FSA"
export type BookingDirection = "Import" | "Export" | "Domestic" | "Cross trade"
export type BookingShipmentType = "FCL" | "LCL" | "Breakbulk" | "RoRo" | "Dry bulk" | "Liquid bulk" | "Project cargo" | "General cargo" | "ULD" | "Air consolidation" | "Back-to-back" | "Express / courier" | "Charter" | "FTL" | "LTL" | "Groupage" | "Pallet network" | "Dedicated vehicle" | "Parcel / express" | "Multiple"

export const bookings = [
  { id: "MD-22682", customer: "Jenkar", route: "Leicester → Bristol", carrier: "Unassigned", container: "Pallet network", mode: "ROAD" as BookingMode, value: "£1,240", eta: "Awaiting date", time: "—", status: "Exception" as BookingStatus, progress: 8, owner: "EM", tone: "amber" as StatusTone, invoice: "", jobRef: "RD-10682", customerRef: "JK-PO-48216", supplierRef: "", origin: "Leicester, United Kingdom", destination: "Bristol, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning blocker", value: "Collection date missing" }, { label: "Road service", value: "Pallet network" }] },
  { id: "MD-22683", customer: "Jenkar", route: "Dartford → Manchester", carrier: "Unassigned", container: "LTL", mode: "ROAD" as BookingMode, value: "£1,680", eta: "Jul 23", time: "10:00", status: "Exception" as BookingStatus, progress: 12, owner: "EM", tone: "amber" as StatusTone, invoice: "", jobRef: "RD-10683", customerRef: "JK-PO-48228", supplierRef: "", origin: "Dartford, United Kingdom", destination: "Manchester, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning blocker", value: "Pallet height not supplied" }, { label: "Road service", value: "LTL" }] },
  { id: "MD-22676", customer: "Jenkar", route: "Birmingham → Glasgow", carrier: "Pending selection", container: "Dedicated 7.5t", mode: "ROAD" as BookingMode, value: "£1,980", eta: "Today", time: "14:00", status: "On track" as BookingStatus, progress: 24, owner: "EM", tone: "teal" as StatusTone, invoice: "", jobRef: "RD-10676", customerRef: "JK-PO-48191", supplierRef: "", origin: "Birmingham, United Kingdom", destination: "Glasgow, United Kingdom", vessel: "", departureDate: "2026-07-22", arrivalDate: "2026-07-23", vin: "", customFields: [{ label: "Planning state", value: "Carrier shortlist ready" }, { label: "Estimated margin", value: "18.4%" }] },
  { id: "MD-22679", customer: "Jenkar", route: "Coventry → Leeds", carrier: "Pending selection", container: "Next-day pallet", mode: "ROAD" as BookingMode, value: "£1,560", eta: "Jul 23", time: "09:00", status: "On track" as BookingStatus, progress: 24, owner: "EM", tone: "teal" as StatusTone, invoice: "", jobRef: "RD-10679", customerRef: "JK-PO-48203", supplierRef: "", origin: "Coventry, United Kingdom", destination: "Leeds, United Kingdom", vessel: "", departureDate: "2026-07-23", arrivalDate: "2026-07-24", vin: "", customFields: [{ label: "Planning state", value: "Carrier shortlist ready" }, { label: "Estimated margin", value: "22.1%" }] },
  { id: "MD-22671", customer: "Jenkar", route: "Rugby → Exeter", carrier: "Redline Transport", container: "Dedicated van", mode: "ROAD" as BookingMode, value: "£1,460", eta: "Today", time: "17:00", status: "On track" as BookingStatus, progress: 42, owner: "EM", tone: "blue" as StatusTone, invoice: "", jobRef: "RD-10671", customerRef: "JK-PO-48172", supplierRef: "RLT-10671", origin: "Rugby, United Kingdom", destination: "Exeter, United Kingdom", vessel: "", departureDate: "2026-07-22", arrivalDate: "2026-07-23", vin: "", customFields: [{ label: "Carrier state", value: "Confirmation due 11:30" }, { label: "Estimated margin", value: "20.7%" }] },
  { id: "MD-22664", customer: "Jenkar", route: "Milton Keynes → Newcastle", carrier: "Grove Haulage", container: "Dedicated 18t", mode: "ROAD" as BookingMode, value: "£2,380", eta: "Today", time: "15:20", status: "On track" as BookingStatus, progress: 84, owner: "EM", tone: "green" as StatusTone, invoice: "", jobRef: "RD-10664", customerRef: "JK-PO-48126", supplierRef: "GRV-10664", origin: "Milton Keynes, United Kingdom", destination: "Newcastle, United Kingdom", vessel: "", departureDate: "2026-07-21", arrivalDate: "2026-07-22", vin: "", customFields: [{ label: "Delivery state", value: "Out for delivery" }, { label: "Estimated margin", value: "19.6%" }] },
  { id: "MD-22658", customer: "Jenkar", route: "Derby → Cardiff", carrier: "PalletLine", container: "Pallet network", mode: "ROAD" as BookingMode, value: "£1,180", eta: "Delivered", time: "Yesterday", status: "On track" as BookingStatus, progress: 100, owner: "EM", tone: "green" as StatusTone, invoice: "", jobRef: "RD-10658", customerRef: "JK-PO-48094", supplierRef: "PL-10658", origin: "Derby, United Kingdom", destination: "Cardiff, United Kingdom", vessel: "", departureDate: "2026-07-20", arrivalDate: "2026-07-21", vin: "", customFields: [{ label: "Proof of delivery", value: "Received" }, { label: "Estimated margin", value: "16.8%" }] },
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

const visualizationFoundOn = [
  { label: "Reports", route: "/reports" },
  { label: "Template builder", route: "/reports/templates/monthly-client-review" },
  { label: "Report viewer", route: "/reports/rpt-marlow-may-review" },
  { label: "Components", route: "/components" },
]

function visualizationComponentCode(componentName: string, chartName: string, dataKeys: string) {
  return `export function ${componentName}({ data = chartData, series = defaultSeries, compact, className, showLegend = true }) {\n  const chartConfig = toChartConfig(series)\n\n  return (\n    <VisualizationShell title="Report metric" subtitle="Reusable across reports and dashboards" compact={compact} className={className}>\n      <ChartCanvas compact={compact}>\n        <ChartContainer config={chartConfig} className="h-[250px] w-full [aspect-ratio:auto]">\n          <${chartName} accessibilityLayer data={data}>\n            <CartesianGrid vertical={false} stroke="rgba(90,103,100,0.16)" />\n            <XAxis dataKey="period" tickLine={false} axisLine={false} />\n            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />\n            ${dataKeys}\n          </${chartName}>\n        </ChartContainer>\n      </ChartCanvas>\n      {showLegend ? <LegendRow items={series} /> : null}\n    </VisualizationShell>\n  )\n}`
}

function visualizationUsageCode(componentName: string, kind: string) {
  return `<${componentName} />\n\n<${componentName} compact title="Report section title" />\n\n<ReportVisualizationBlock kind="${kind}" title="Report block title" />`
}

export const galleryComponents = [
  {
    id: "colours",
    name: "Colours",
    category: "Design System",
    description: "The Multideck colour tokens for shell backgrounds, product surfaces, text, accents, and operational status.",
    details: "Use tokens from `src/styles.css` instead of one-off colour values. Colours should support calm scanning, not decoration.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Bookings", route: "/bookings" }, { label: "Booking detail", route: "/bookings/md-22455" }, { label: "Reports", route: "/reports" }, { label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `:root {\n  --md-ink: #0b1413;\n  --md-text: #4f5b58;\n  --md-subtle: #687570;\n  --md-hairline: #ccd4d1;\n  --md-bg: #ffffff;\n  --md-bg-strong: #eef1f0;\n  --md-sidebar-bg: #f7f8f8;\n  --md-surface: #ffffff;\n  --md-surface-soft: #f7f9f8;\n  --md-surface-tint: #eef1f0;\n  --md-field-bg: #e5e9e7;\n  --md-accent: #0a7068;\n  --md-green: #0a7068;\n  --md-amber: #dd8a2b;\n  --md-red: #d14e4e;\n  --md-blue: #4a7d9c;\n}`,
    usageCode: `<Surface className="bg-[var(--md-surface)] text-[var(--md-ink)]">\n  <StatusPill tone="teal">AI prepared</StatusPill>\n  <p className="text-[var(--md-text)]">Use token colours for calm operational hierarchy.</p>\n</Surface>`,
  },
  {
    id: "hugeicons-system",
    name: "Hugeicons Icon System",
    category: "Design System",
    description: "The shared Hugeicons renderer and semantic icon mapping used by navigation, tables, controls, feedback, and stateful microinteractions.",
    details: "Choose icons by the operator action or product object they represent. Use the shared adapter for the standard 1.5px stroke, current-colour behaviour, refs, accessibility props, and animated state swaps.",
    foundOn: [
      { label: "Home", route: "/" },
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Warehouse", route: "/warehouse" },
      { label: "Settings", route: "/settings" },
      { label: "Components", route: "/components?component=hugeicons-system" },
    ],
    componentCode: `export function createMultideckIcon(icon, displayName) {\n  const Icon = forwardRef(function MultideckHugeicon(\n    { color = "currentColor", size = 24, strokeWidth = 1.5, ...props },\n    ref,\n  ) {\n    return <HugeiconsIcon ref={ref} icon={icon} color={color} size={size} strokeWidth={strokeWidth} {...props} />\n  })\n  Icon.displayName = displayName\n  return Icon\n}`,
    usageCode: `// Semantic application icons\n<Home03 className="size-4" />\n<AiBrain className="size-4" />\n<Forklift className="size-4" />\n\n// Stateful icon swap\n<MorphingIcon from={Pin} to={PinOff} active={isPinned} className="size-4" />`,
  },
  {
    id: "typography",
    name: "Typography",
    category: "Design System",
    description: "The Multideck type scale for dense freight software: calm, compact, readable, and mostly medium weight.",
    details: "Use 11px and 12px for metadata, 13px for standard UI, 14px for section headings, 18px for subheads, and 24px for main page headings.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "CRM", route: "/crm" }, { label: "Reports", route: "/reports" }, { label: "Components", route: "/components" }],
    componentCode: `@theme inline {\n  --font-sans: "SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n}\n\n.type-page-title {\n  font-size: 24px;\n  font-weight: 500;\n  line-height: 1.15;\n}\n\n.type-section-title {\n  font-size: 14px;\n  font-weight: 500;\n}\n\n.type-body {\n  font-size: 13px;\n  font-weight: 400;\n  line-height: 1.55;\n}`,
    usageCode: `<h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)]">Overview</h1>\n<h2 className="text-[14px] font-medium text-[var(--md-ink)]">Live bookings</h2>\n<p className="text-[13px] leading-6 text-[var(--md-text)]">Use compact type for operational scanning.</p>\n<p className="text-[12px] text-[var(--md-subtle)]">Updated 41s ago</p>`,
  },
  {
    id: "surface",
    name: "Surface",
    category: "Foundation",
    description: "The base Multideck panel. It gives workflow areas quiet depth without creating heavy card clutter.",
    details: "Use for primary panels, side panels, preview wells, and command areas. Radius and shadow come from tokens.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "CRM accounts", route: "/crm/accounts" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "Warehouse inventory", route: "/warehouse/inventory" }, { label: "Components", route: "/components" }],
    componentCode: `export function Surface({ tone = "panel", padding = "md", className, children }) {\n  return (\n    <section className={cn("rounded-[var(--md-radius-lg)]", toneClass[tone], paddingClass[padding], className)}>\n      {children}\n    </section>\n  )\n}\n\nexport function SectionHeader({ eyebrow, title, meta, action, className }) {\n  return (\n    <div className={cn("flex items-start justify-between gap-3", className)}>\n      <div className="@container/section-header-copy min-w-0 flex-1">\n        {eyebrow ? <p className="mb-1 text-xs font-medium text-[var(--md-subtle)]">{eyebrow}</p> : null}\n        <div className="min-w-0 @min-[520px]/section-header-copy:flex @min-[520px]/section-header-copy:items-baseline @min-[520px]/section-header-copy:justify-between @min-[520px]/section-header-copy:gap-5">\n          <h2 className="truncate text-[14px] font-medium text-[var(--md-ink)]">{title}</h2>\n          {meta ? <p className="mt-1 text-[12px] text-[var(--md-text)] @min-[520px]/section-header-copy:mt-0 @min-[520px]/section-header-copy:text-end">{meta}</p> : null}\n        </div>\n      </div>\n      {action ? <div className="shrink-0">{action}</div> : null}\n    </div>\n  )\n}`,
    usageCode: `<Surface tone="panel" padding="md">\n  <SectionHeader title="Live bookings" meta="updated 41s ago" />\n  <BookingRow booking={booking} />\n</Surface>`,
  },
  {
    id: "status-pill",
    name: "Status Pill",
    category: "Feedback",
    description: "Compact semantic pills for every workflow status and descriptive attribute shown in a table.",
    details: "Every pill rendered inside an operator table uses the filled green, yellow, red, blue, orange, or purple semantic palette. The cyan information family uses a quieter, lower-saturation treatment in light mode, while dark mode retains the approved deep cyan pair. Pills outside tables keep the quieter surface shell and leading dot.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "To Do list", route: "/to-do" }, { label: "Bookings", route: "/bookings" }, { label: "Booking detail", route: "/bookings/md-22455" }, { label: "CRM leads", route: "/crm/leads" }, { label: "CRM accounts", route: "/crm/accounts" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "Contact cards", route: "/crm/contact-cards" }, { label: "Warehouse orders", route: "/warehouse/orders" }, { label: "Rates & contracts", route: "/rates" }, { label: "Compliance controls", route: "/compliance/screening" }, { label: "Reports", route: "/reports" }, { label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function StatusPill({ tone = "neutral", kind, indicator, children, className }) {\n  const tableKind = useContext(TablePillKindContext)\n  const resolvedKind = kind ?? tableKind ?? "status"\n  const filledTablePill = tableKind !== null || kind === "status"\n\n  return (\n    <Badge\n      data-pill-kind={resolvedKind}\n      data-tone={tone}\n      data-table-pill={filledTablePill ? "true" : undefined}\n      className={cn(baseClass, filledTablePill && filledTableClass, filledTablePill && tableToneClass[tone], className)}\n    >\n      {indicator ?? (!filledTablePill ? <span className="size-1.5 rounded-full" style={{ backgroundColor: toneToVar(tone) }} /> : null)}\n      {children}\n    </Badge>\n  )\n}`,
    usageCode: `<StatusPill kind="status" tone="purple">New</StatusPill>\n<StatusPill kind="status" tone="orange">Contacted</StatusPill>\n<StatusPill kind="status" tone="blue">Qualified</StatusPill>\n<StatusPill kind="status" tone="amber">Nurturing</StatusPill>\n<StatusPill kind="status" tone="green">Converted</StatusPill>\n<StatusPill kind="status" tone="red">Disqualified</StatusPill>\n\n<StatusPill kind="attribute" tone="blue">Ocean</StatusPill>`,
  },
  {
    id: "todo-completion-control",
    name: "To Do Completion Control",
    category: "Controls",
    description: "A personal-task checkbox with a tactile circle pop and a trimmed SVG tick.",
    details: "Use for completing or reopening To Do tasks. The footprint stays stable through optimistic saves, the tick draws only after direct input, and reduced-motion users receive the final state immediately.",
    foundOn: [{ label: "To Do list", route: "/to-do" }, { label: "Components", route: "/components?component=todo-completion-control" }],
    componentCode: `export function TodoCompletionControl({ checked, busy, label, onChange }) {\n  const reduce = useReducedMotion()\n  return (\n    <button aria-label={label} aria-pressed={checked} aria-busy={busy || undefined} onClick={() => onChange(!checked)}>\n      <motion.svg viewBox="0 0 24 24" animate={reduce ? undefined : { scale: checked ? [1, 0.88, 1.08, 1] : 1 }}>\n        <motion.circle cx="12" cy="12" r="9.25" animate={{ fill: checked ? "var(--md-accent)" : "transparent" }} />\n        <motion.path d="M7.8 12.2 10.6 15l5.8-6.2" animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }} />\n      </motion.svg>\n    </button>\n  )\n}`,
    usageCode: `<TodoCompletionControl\n  checked={task.status === "completed"}\n  busy={saving}\n  label={task.status === "completed" ? "Reopen task" : "Mark task complete"}\n  onChange={(checked) => updateTask({ status: checked ? "completed" : "open" })}\n/>`,
  },
  {
    id: "todo-priority-pill",
    name: "To Do Priority Pill",
    category: "Feedback",
    description: "The table-pill priority language for Low, Medium, High, and Urgent personal tasks.",
    details: "Use only when an operator assigns a priority. Colour and a directional icon work together, so the priority remains understandable without relying on colour alone.",
    foundOn: [{ label: "To Do list", route: "/to-do" }, { label: "Components", route: "/components?component=todo-priority-pill" }],
    componentCode: `export function TodoPriorityPill({ priority }) {\n  const { label, tone, Icon } = priorityPresentation[priority]\n  return <StatusPill kind="status" tone={tone} indicator={<Icon aria-hidden="true" />}>{label}</StatusPill>\n}`,
    usageCode: `{task.priority ? <TodoPriorityPill priority={task.priority} /> : null}`,
  },
  {
    id: "todo-action-state-icon",
    name: "To Do Action State Icon",
    category: "Feedback",
    description: "A fixed-footprint arrow, progress ring, and trimmed success tick for contextual task creation.",
    details: "Use inside the Dexter Add to To Do action. The arrow yields to a compact progress ring during the real save, then the tick draws after confirmation. Only progress rotation is linear, and reduced motion switches states instantly.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=todo-action-state-icon" }],
    componentCode: `export function TodoActionStateIcon({ state }) {\n  return (\n    <motion.svg viewBox="0 0 24 24">\n      <motion.g animate={{ opacity: state === "idle" ? 1 : 0 }}><path d="M5 12h13M13 7l5 5-5 5" /></motion.g>\n      <motion.circle animate={{ opacity: state === "loading" ? 1 : 0 }} />\n      <motion.path d="M6.8 12.2 10.4 15.7 17.5 8.3" animate={{ pathLength: state === "success" ? 1 : 0 }} />\n    </motion.svg>\n  )\n}`,
    usageCode: `<button disabled={state !== "idle"}>\n  <span>Add to To Do list</span>\n  <TodoActionStateIcon state={state} />\n</button>`,
  },
  {
    id: "todo-priority-picker",
    name: "To Do Priority Picker",
    category: "Controls",
    description: "An icon-led priority selector for assigning task urgency without making every task feel urgent.",
    details: "Use for task creation and editing. Each priority has a distinct icon and semantic colour; the menu keeps the standard Multideck surface and short entrance motion, with an explicit No priority state.",
    foundOn: [{ label: "To Do list", route: "/to-do" }, { label: "Components", route: "/components?component=todo-priority-picker" }],
    componentCode: `export function TodoPriorityPicker({ value, onValueChange, ariaLabel }) {\n  return (\n    <Select value={value || "none"} onValueChange={(next) => onValueChange(next === "none" ? "" : next)}>\n      <SelectTrigger aria-label={ariaLabel}><SelectValue /></SelectTrigger>\n      <SelectContent>{priorityOptions.map((option) => <SelectItem value={option.value}><PriorityOption {...option} /></SelectItem>)}</SelectContent>\n    </Select>\n  )\n}`,
    usageCode: `<TodoPriorityPicker value={priority} ariaLabel="Priority" onValueChange={setPriority} />`,
  },
  {
    id: "kbd",
    name: "Keyboard Key",
    category: "Controls",
    description: "A compact keycap for keyboard shortcuts and command hints.",
    details: "Use inside actionable controls or supporting hints when a keyboard route materially speeds up the workflow. Keep platform-specific modifiers accurate and pair keycaps with an accessible action label.",
    foundOn: [
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Keyboard shortcuts", route: "/settings?tab=shortcuts" },
      { label: "Components", route: "/components?component=kbd" },
    ],
    componentCode: `export function Kbd({ className, ...props }) {\n  return <kbd data-slot="kbd" className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 text-xs font-medium text-muted-foreground", className)} {...props} />\n}\n\nexport function KbdGroup({ className, ...props }) {\n  return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />\n}`,
    usageCode: `<Button aria-label="Send prompt" aria-keyshortcuts="Meta+Enter Control+Enter">\n  <KbdGroup dir="ltr">\n    <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>\n    <Kbd>↵</Kbd>\n  </KbdGroup>\n</Button>`,
  },
  {
    id: "shortcut-keys",
    name: "Shortcut Keys",
    category: "Controls",
    description: "A saved keyboard binding drawn as keycaps, in the modifier glyphs of the operator's own platform.",
    details: "Use anywhere a shortcut is worth advertising: beside a control, inside a menu row, or in the shortcut editor. It resolves ⌘ against Ctrl for you, and draws a two-key sequence as two groups joined by \"then\" rather than one unreadable run of glyphs. Keycaps always read left to right, including in right-to-left languages, because they describe a physical keyboard and a keyboard does not mirror.",
    foundOn: [
      { label: "Keyboard shortcuts", route: "/settings?tab=shortcuts" },
      { label: "Overview", route: "/" },
      { label: "Components", route: "/components?component=shortcut-keys" },
    ],
    componentCode: `export function ShortcutKeys({ binding, className, keyClassName, emptyLabel = "Not set" }) {\n  const platform = usePlatformShortcutLabels()\n  const steps = useMemo(() => bindingTokens(binding, platform), [binding, platform])\n\n  if (steps.length === 0) return <span className={className}>{emptyLabel}</span>\n\n  return (\n    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>\n      {steps.map((tokens, stepIndex) => (\n        <span key={stepIndex} className="inline-flex items-center gap-1.5">\n          {stepIndex > 0 ? <span className="text-[11px] text-[var(--md-subtle)]">then</span> : null}\n          <KbdGroup dir="ltr" data-i18n-skip>\n            {tokens.map((token, tokenIndex) => (\n              <Kbd key={\`\${token}-\${tokenIndex}\`} className={keyClassName}>{token}</Kbd>\n            ))}\n          </KbdGroup>\n        </span>\n      ))}\n    </span>\n  )\n}`,
    usageCode: `// From a saved binding\n<ShortcutKeys binding={useShortcutBinding("search.focus")} />\n\n// Or straight from a shortcut id\n<ShortcutHint shortcutId="dexter.summon" />\n\n// Inside a field, so the hint follows whatever the operator rebound it to\n<span className="pointer-events-none absolute inset-y-0 end-2 my-auto flex h-fit items-center">\n  <ShortcutKeys binding={searchShortcut} keyClassName="bg-[var(--md-surface-tint)]" emptyLabel="" />\n</span>`,
  },
  {
    id: "keyboard-shortcuts-panel",
    name: "Keyboard Shortcuts Panel",
    category: "Settings",
    description: "The editable shortcut list: grouped rows, live keycaps, an inline recorder, conflict warnings and per-row reset.",
    details: "Use as the whole body of a settings section, or inside a dialog for an in-place shortcut reference. Clicking a row's keys opens a recorder that takes over the keyboard, so pressing ⌘\\\\ records ⌘\\\\ rather than collapsing the sidebar underneath. Two plain keys in a row become a sequence; holding the modifier and double-clicking inside the recorder captures a mouse gesture instead. Duplicate bindings are shown rather than blocked, because an operator mid-swap between two shortcuts is a normal state and a silently shadowed shortcut looks like a bug in the app. Every change writes through to the signed-in operator's profile.",
    foundOn: [
      { label: "Keyboard shortcuts", route: "/settings?tab=shortcuts" },
      { label: "Components", route: "/components?component=keyboard-shortcuts-panel" },
    ],
    componentCode: `export function KeyboardShortcutsPanel({ className, compact = false }) {\n  const bindings = useShortcutBindings()\n  const [query, setQuery] = useState("")\n  const [recording, setRecording] = useState(null)\n  const [lastChange, setLastChange] = useState(null)\n\n  const groups = useMemo(\n    () => shortcutGroups\n      .map((group) => ({ group, items: shortcutDefinitions.filter((d) => d.group === group.id && matches(d)) }))\n      .filter((entry) => entry.items.length > 0),\n    [matches],\n  )\n\n  return (\n    <div className={className}>\n      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcuts" />\n      <Button onClick={resetAllShortcutBindings} disabled={customisedShortcutCount() === 0}>Reset all</Button>\n      {groups.map(({ group, items }) => (\n        <section key={group.id}>\n          <h3>{group.label}</h3>\n          {items.map((definition, index) => (\n            <ShortcutRow\n              key={definition.id}\n              definition={definition}\n              binding={bindings[definition.id]}\n              customised={isShortcutCustomised(definition.id)}\n              recording={recording}\n              index={index}\n              onStartRecording={() => setRecording({ shortcutId: definition.id, steps: [] })}\n              onCommit={(binding) => writeShortcutBinding(definition.id, binding)}\n              onReset={() => resetShortcutBinding(definition.id)}\n              onDisable={() => writeShortcutBinding(definition.id, null)}\n            />\n          ))}\n        </section>\n      ))}\n    </div>\n  )\n}`,
    usageCode: `// As a settings section\n<section className="md-settings-panel overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">\n  <KeyboardShortcutsPanel />\n</section>\n\n// Or over whatever the operator is working on, opened by its own shortcut\n<Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>\n  <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0">\n    <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>\n    <div className="md-scrollbar max-h-[560px] overflow-y-auto">\n      <KeyboardShortcutsPanel compact />\n    </div>\n  </DialogContent>\n</Dialog>`,
  },
  {
    id: "ai-edge-glow",
    name: "AI Edge Glow",
    category: "Feedback",
    description: "The Dexter working-state motif: a soft animated screen edge that tells operators AI is actively reading, checking, or preparing something.",
    details: "Use only while an AI process is running. Wrap the current screen or workflow area so the glow sits behind the existing UI and never replaces clear progress copy.",
    foundOn: [{ label: "Components", route: "/components?component=ai-edge-glow" }],
    componentCode: `export function AIEdgeGlow({ active = true, intensity = "active", variant = "surface", className, contentClassName, children }) {\n  return (\n    <div\n      className={cn(\n        "md-ai-edge-glow",\n        active && "md-ai-edge-glow--active",\n        intensity === "subtle" && "md-ai-edge-glow--subtle",\n        variant === "screen" && "md-ai-edge-glow--screen",\n        className,\n      )}\n      data-active={active ? "true" : "false"}\n    >\n      <span className="md-ai-edge-glow__wash" aria-hidden />\n      <span className="md-ai-edge-glow__signal" aria-hidden />\n      <span className="md-ai-edge-glow__frame" aria-hidden />\n      <div className={cn("relative z-10 h-full w-full", contentClassName)}>{children}</div>\n    </div>\n  )\n}`,
    usageCode: `<AIEdgeGlow active={isExtracting} variant="screen" className="min-h-screen rounded-none">\n  <NewJobWorkspace />\n</AIEdgeGlow>\n\n<AIEdgeGlow active={isCheckingRates} intensity="subtle" className="rounded-[var(--md-radius-2xl)]">\n  <RatesPanel />\n</AIEdgeGlow>`,
  },
  {
    id: "home-dexter-launcher",
    name: "Home Dexter Launcher",
    category: "Home",
    description: "The greeting and prompt box that opens Home: the real Dexter composer, a time-of-day welcome, and the prompts worth starting from today.",
    details: "Use as the head of Home. The greeting follows the operator's own clock — morning, afternoon, evening, and a plain welcome for the hours before dawn. Writing clears the deck below; sending drops the composer to the position it holds in a conversation and hands the whole draft — specialist, model, access mode, @ records and uploads — to the Dexter workspace, so nothing the operator set up is lost in the route change.",
    foundOn: [{ label: "Home", route: "/" }, { label: "Components", route: "/components?component=home-dexter-launcher" }],
    componentCode: `export function HomeDexterLauncher({ operatorName, standfirst, suggestions, engaged, onEngagedChange, docked, onDockedChange, navigate }) {\n  const now = useMinuteTick()\n  const [value, setValue] = useState("")\n  const greeting = greetingPartForHour(now.getHours())\n\n  function handOver(prompt, specialistId) {\n    rememberDexterHomeHandoff({ prompt, specialistId, modelId, accessMode, fullAccessGrantId, clientSessionId, mentions, uploadedDocuments })\n    onDockedChange(true)\n  }\n\n  return (\n    <div className="mx-auto flex w-full flex-col">\n      <AnimatePresence initial={false}>\n        {engaged ? null : (\n          <motion.div key="home-greeting" className="mx-auto mb-[var(--md-page-section-gap)] text-center">\n            <DexterBrandMark className="size-6" />\n            <h1>{greeting}</h1>\n            <p>{standfirst}</p>\n          </motion.div>\n        )}\n      </AnimatePresence>\n\n      <motion.div layout layoutDependency={docked} onLayoutAnimationComplete={openWorkspace}>\n        <DexterPromptComposer value={value} onChange={setValue} onSend={handOver} />\n      </motion.div>\n\n      <AnimatePresence initial={false}>\n        {engaged ? null : <HomePromptRail suggestions={suggestions} onPick={handOver} />}\n      </AnimatePresence>\n    </div>\n  )\n}`,
    usageCode: `const [engaged, setEngaged] = useState(false)\nconst [docked, setDocked] = useState(false)\n\n<HomeDexterLauncher\n  operatorName={currentUser?.name ?? null}\n  standfirst="Three jobs need you before today's cutoff."\n  suggestions={suggestions}\n  engaged={engaged}\n  onEngagedChange={setEngaged}\n  docked={docked}\n  onDockedChange={setDocked}\n  navigate={navigate}\n/>`,
  },
  {
    id: "home-prompt-rail",
    name: "Home Prompt Rail",
    category: "Home",
    description: "Personalised prompts on a hairline: rows drawn from the operator's own records, with one highlight that travels between them.",
    details: "Use under a prompt box when the suggestions are real sentences of different lengths. Rows on a rule rather than a grid of pills, which reflows into a ragged block every time the underlying work changes. Every suggestion should name a record or a figure so the request it sends is never a guess.",
    foundOn: [{ label: "Home", route: "/" }, { label: "Components", route: "/components?component=home-prompt-rail" }],
    componentCode: `export function HomePromptRail({ suggestions, onPick }) {\n  const [activeId, setActiveId] = useState(null)\n\n  return (\n    <div role="list">\n      {suggestions.map((suggestion, index) => (\n        <motion.div key={suggestion.id} role="listitem" className="border-t border-[var(--md-line)] first:border-t-0">\n          <button\n            type="button"\n            className="group relative isolate flex w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 py-2.5"\n            onPointerEnter={() => setActiveId(suggestion.id)}\n            onFocus={() => setActiveId(suggestion.id)}\n            onClick={() => onPick(suggestion.prompt, suggestion.specialistId)}\n          >\n            {activeId === suggestion.id ? (\n              <motion.span layoutId="rail-highlight" className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)]" />\n            ) : null}\n            <suggestion.icon className="size-[15px] text-[var(--md-accent)]" strokeWidth={1.35} />\n            <span className="min-w-0 flex-1 text-[13.5px] font-medium">{suggestion.title}</span>\n            <span className="text-[11.5px] text-[var(--md-subtle)]">{suggestion.meta}</span>\n          </button>\n        </motion.div>\n      ))}\n    </div>\n  )\n}`,
    usageCode: `<HomePromptRail\n  suggestions={[\n    { id: "triage", title: "Work through what is due before cutoff", prompt: "Take my queue for today in deadline order…", meta: "4 due", icon: Zap, specialistId: "ops" },\n  ]}\n  onPick={(prompt, specialistId) => handOver(prompt, specialistId)}\n/>`,
  },
  {
    id: "home-deck-panel",
    name: "Home Deck Panel",
    category: "Home",
    description: "One module of Home's deck: a recessed grey block of short rows, or a bare heading over entries that are their own containers.",
    details: "Use for a column of four or five facts that an operator scans rather than reads. `block` recesses the module behind the page so several of them read as one quiet band; `bare` keeps only the heading, for a column whose entries — a clock per region — are separate objects rather than a list. Pair with HomeDeckRow inside a block and HomeDeckTile outside one.",
    foundOn: [{ label: "Home", route: "/" }, { label: "Components", route: "/components?component=home-deck-panel" }],
    componentCode: `export function HomeDeckPanel({ title, count, action, variant = "block", children }) {\n  return (\n    <section\n      className={cn(\n        "flex h-full min-w-0 flex-col",\n        variant === "block" && "rounded-[var(--md-radius-2xl)] bg-[var(--md-deck-surface)] p-3",\n      )}\n      aria-label={title}\n    >\n      <header className="flex min-h-[20px] items-baseline justify-between gap-3">\n        <h2 className="truncate text-[12px] font-medium">{title}</h2>\n        <div className="flex shrink-0 items-baseline gap-2.5">\n          {count ? <span className="text-[11.5px] tabular-nums text-[var(--md-subtle)]">{count}</span> : null}\n          {action}\n        </div>\n      </header>\n      <div className={cn("mt-1.5 min-h-0 flex-1 overflow-y-auto", variant === "bare" && "flex flex-col gap-1.5")}>\n        {children}\n      </div>\n    </section>\n  )\n}`,
    usageCode: `<HomeDeckPanel title="My jobs" count={starred.length} action={<HomeDeckAction onClick={showAll}>All</HomeDeckAction>}>\n  {jobs.map((job, index) => (\n    <HomeDeckRow key={job.id} index={index}>\n      <button type="button" className={homeDeckRowButtonClass} onClick={() => open(job)}>\n        <span>{job.id}</span>\n        <span className="truncate text-[var(--md-subtle)]">{job.customer}</span>\n      </button>\n    </HomeDeckRow>\n  ))}\n</HomeDeckPanel>\n\n<HomeDeckPanel variant="bare" title="Clocking off">\n  {regions.map((region, index) => <HomeDeckTile key={region.code} index={index}>{/* … */}</HomeDeckTile>)}\n</HomeDeckPanel>`,
  },
  {
    id: "dashboard-customise-panel",
    name: "Dashboard Customise Panel",
    category: "Agent Dexter",
    description: "A docked dashboard assistant for AI prompts and manual widget selection.",
    details: "Use from the Overview Customise action when the operator wants to preview the dashboard assistant. Manual mode currently keeps the widget tray inside the panel as a visual preview while the standard dashboard stays unchanged.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components?component=dashboard-customise-panel" }],
    componentCode: `export function DashboardCustomisePanel({ open, onOpenChange, presentation = "docked", selectedDashboard, mode, onModeChange }) {\n  const [manualItems] = useState(createInitialManualBlocks)\n  const [activeWidgetId, setActiveWidgetId] = useState()\n\n  return (\n    <AnimatePresence>\n      {open ? (\n        <aside role="dialog" aria-label="Dashboard AI customisation panel" data-presentation={presentation}>\n          <header>\n            <h2>Dashboard assistant</h2>\n            <button onClick={() => onModeChange(mode === "manual" ? "ai" : "manual")}>Manual</button>\n            <button onClick={() => onOpenChange(false)}>Close</button>\n          </header>\n          {mode === "manual" ? (\n            <ManualDashboardControl items={manualItems} activeWidgetId={activeWidgetId} onPreviewWidget={setActiveWidgetId} />\n          ) : (\n            <DashboardPromptComposer />\n          )}\n        </aside>\n      ) : null}\n    </AnimatePresence>\n  )\n}`,
    usageCode: `const [customiseOpen, setCustomiseOpen] = useState(false)\nconst [customiseMode, setCustomiseMode] = useState("ai")\nconst [selectedDashboard, setSelectedDashboard] = useState(savedDashboardViews[0])\n\n<OverviewHero\n  selectedDashboard={selectedDashboard}\n  onSelectDashboard={setSelectedDashboard}\n  onOpenCustomise={() => setCustomiseOpen(true)}\n/>\n<OverviewDashboard />\n<DashboardCustomisePanel\n  open={customiseOpen}\n  onOpenChange={setCustomiseOpen}\n  presentation="docked"\n  selectedDashboard={selectedDashboard}\n  mode={customiseMode}\n  onModeChange={setCustomiseMode}\n/>`,
  },
  {
    id: "dexter-inline-citation",
    name: "Dexter Inline Citation",
    category: "Agent Dexter",
    description: "A source-linked claim in a Dexter answer, with a compact record badge and an inspectable source card.",
    details: "Use for facts Dexter read from connected workspace data. Link only the smallest supported phrase, keep advice and inference uncited, and use the exact source URL returned by the data tool so selecting the badge opens the underlying Multideck record.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=dexter-inline-citation" }],
    componentCode: `export function DexterInlineCitation({ children, href, title }) {
  const external = !href.startsWith("/")

  return (
    <InlineCitation>
      <InlineCitationText>{children}</InlineCitationText>
      <InlineCitationCard>
        <InlineCitationCardTrigger sources={[href]} href={href} label="Lead" external={external} />
        <InlineCitationCardBody>
          <InlineCitationCarousel>
            <InlineCitationCarouselHeader>
              <InlineCitationCarouselPrev aria-label="Previous source" />
              <InlineCitationCarouselNext aria-label="Next source" />
              <InlineCitationCarouselIndex />
            </InlineCitationCarouselHeader>
            <InlineCitationCarouselContent>
              <InlineCitationCarouselItem>
                <InlineCitationSource title={title} url={href} external={external} />
              </InlineCitationCarouselItem>
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  )
}`,
    usageCode: `<p>
  <DexterInlineCitation
    href="/crm/leads/8f81256b-3f0a-4c48-9d95-bd40ec63dc66"
    title="Northwind Logistics"
  >
    Northwind has a follow-up due today
  </DexterInlineCitation>.
</p>`,
  },
  {
    id: "dexter-email-attachment-card",
    name: "Dexter Email Attachment Card",
    category: "Agent Dexter",
    description: "An authorised Gmail or Outlook attachment surfaced in a Dexter answer or Watch update, with secure preview, download and handoff actions.",
    details: "Use only for attachment records returned by server-side email tools or the owner-scoped Watch RPC. The compact Watch variant adds Ask Dexter without sending a prompt. Every file fetch is re-authorised through the tenant Inbox Edge Function.",
    foundOn: [
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Components", route: "/components?component=dexter-email-attachment-card" },
    ],
    componentCode: `export function DexterEmailAttachmentCard({ attachment, variant = "default", onAskDexter, loadAttachment = getAttachmentBlobUrl }) {
  const kind = previewKind(attachment.mimeType)
  const [previewUrl, setPreviewUrl] = useState(null)

  async function view() {
    const opened = await loadAttachment(attachment.id)
    setPreviewUrl(opened.url)
  }

  return (
    <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
      <header>
        <ProviderLogo provider={attachment.provider} />
        <bdi dir="auto">{attachment.fileName}</bdi>
        {kind ? <Button onClick={view}>View</Button> : null}
        <Button onClick={download}>Download</Button>
        {variant === "watch" ? <Button onClick={() => onAskDexter?.(attachment)}>Ask Dexter</Button> : null}
      </header>
      {previewUrl ? <AttachmentPreview kind={kind} url={previewUrl} /> : null}
      <a href={attachment.sourceUrl}>Open email</a>
    </section>
  )
}`,
    usageCode: `<DexterEmailAttachmentCard attachment={message.emailAttachments[0]} />

<DexterEmailAttachmentCard
  attachment={watchEvent.context.attachments[0]}
  variant="watch"
  onAskDexter={attachToComposer}
/>

// The default loader downloads through the signed-in tenant's
// Inbox Edge Function. A custom loader is only useful for isolated previews.
`,
  },
  {
    id: "ai-prompt-morph",
    name: "AI Prompt Morph",
    category: "Agent Dexter",
    description: "A circular Dexter pencil that expands in place into a compact single-line prompt without moving the surrounding row.",
    details: "Use for optional AI refinement or drafting beside an existing workflow. Keep the 40px vertical anchor fixed, let the pill grow into available inline space, return focus to the trigger on close, and show work inside the same pill instead of opening another panel.",
    foundOn: [
      { label: "Broadcast", route: "/admin/broadcast" },
      { label: "System Preferences", route: "/admin/system-preferences" },
      { label: "Components", route: "/components?component=ai-prompt-morph" },
    ],
    componentCode: `export function AiPromptMorph({ open, value, busy, onOpenChange, onValueChange, onSubmit }) {
  return (
    <div className="relative h-10 w-full max-w-[520px]">
      <AnimatePresence initial={false} mode="wait">
        {open ? <motion.div className="absolute inset-0 flex gap-2">
        <form className="flex h-10 min-w-0 flex-1 items-center rounded-full" onSubmit={onSubmit}>
          <input value={value} onChange={(event) => onValueChange(event.target.value)} />
          <button type="submit" disabled={busy}>Send</button>
        </form>
        <button type="button" onClick={() => onOpenChange(false)}>Close</button>
        </motion.div> : <button type="button" onClick={() => onOpenChange(true)}>Open AI prompt</button>}
      </AnimatePresence>
    </div>
  )
}`,
    usageCode: `<AiPromptMorph
  id="reference-rule-prompt"
  open={promptOpen}
  value={prompt}
  busy={crafting}
  busyLabel="Crafting rule…"
  placeholder="Describe the reference you want…"
  triggerLabel="Custom rule"
  showTriggerLabel
  inputLabel="Custom rule"
  closeLabel="Cancel"
  submitLabel="Create rule"
  submitDisabled={!prompt.trim()}
  onOpenChange={setPromptOpen}
  onValueChange={setPrompt}
  onSubmit={createRule}
/>`,
  },
  {
    id: "dexter-email-compose-card",
    name: "Dexter Email Composer",
    category: "Agent Dexter",
    description: "An editable Gmail or Outlook email prepared inside a Dexter conversation, with in-place refinement and an explicit provider-backed Create draft or Send email action.",
    details: "Use only for structured email actions returned by Dexter's prepare_email_draft tool. Operators can refine the whole email from the edit icon or select a passage for focused changes without replacing the composer. Recipients and the mailbox stay empty unless confirmed by the selected thread, attached workspace context, or the operator. Provider draft creation and sending reuse Inbox permissions and idempotency, preserve the editable copy after failures, and show completion only after Gmail or Outlook confirms the action.",
    foundOn: [
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Components", route: "/components?component=dexter-email-compose-card" },
    ],
    componentCode: `export function DexterEmailComposeCard({ messageId, draft, onDraftChange }) {
  const [status, setStatus] = useState(draft.delivery.status)
  const idempotencyKey = useRef(createIdempotencyKey())

  async function runEmailAction() {
    setStatus(draft.requestedAction === "create_draft" ? "creating_draft" : "sending")
    const request = buildReplyRequest({
      mode: draft.mode,
      mailboxId: draft.mailboxId,
      threadId: draft.threadId,
      sourceMessageId: draft.sourceMessageId,
      edits: collectEditableFields(),
      idempotencyKey: idempotencyKey.current,
    })
    const receipt = draft.requestedAction === "create_draft"
      ? await createProviderDraft(request)
      : await sendMail(request)
    const delivery = draft.requestedAction === "create_draft"
      ? await recordDexterProviderDraftDelivery(messageId, receipt.messageId)
      : await recordDexterEmailDraftDelivery(messageId, receipt.id)
    setStatus(delivery.status)
    onDraftChange?.({ ...draft, delivery })
  }

  return <section aria-label="Editable email draft">
    <RefinementControl onSubmit={(instruction) => refineDraft(messageId, instruction)} />
    <MailboxSelect value={draft.mailboxId} sendCapableOnly />
    <RecipientFields to={draft.to} cc={draft.cc} bcc={draft.bcc} />
    <Input aria-label="Subject" value={draft.subject} />
    <Textarea aria-label="Message" value={draft.bodyText} onSelect={showSelectionActions} />
    <Button disabled={status === "sending" || status === "creating_draft"} onClick={runEmailAction}>
      {draft.requestedAction === "create_draft" ? "Create draft" : "Send email"}
    </Button>
    <p role="status">{deliveryStatusCopy(status)}</p>
  </section>
}`,
    usageCode: `<DexterEmailComposeCard
  messageId={message.id}
  draft={message.emailDraft}
  onDraftChange={(nextDraft) => updateConversationMessage(message.id, nextDraft)}
/>

// message.emailDraft must come from Dexter's structured prepare_email_draft
// result. In Approve mode the component is the approval surface. In Full
// access the same authenticated Inbox action is completed by Dexter.`,
  },
  {
    id: "dexter-action-pill",
    name: "Ask Dexter Shader Button",
    category: "Agent Dexter",
    description: "A universal Ask Dexter action with the Spectral Bloom shader, white text, and a calm letter-by-letter slot transition.",
    details: "Use beside always-needed page controls when the operator may want Dexter's help with the current screen. The shared component also supports icon-only send controls, keeping the shader, readable contrast, focus state, reduced-motion fallback, and hover lettering consistent everywhere.",
    foundOn: [
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Overview", route: "/" },
      { label: "Quotes", route: "/quotes" },
      { label: "Customers", route: "/customers" },
      { label: "Bookings", route: "/bookings" },
      { label: "CRM overview", route: "/crm" },
      { label: "CRM leads", route: "/crm/leads" },
      { label: "CRM contacts", route: "/crm/contacts" },
      { label: "CRM deals", route: "/crm/deals" },
      { label: "Inbox", route: "/inbox" },
      { label: "Components", route: "/components?component=dexter-action-pill" },
    ],
    componentCode: `export function DexterActionPill({ label = "Ask Dexter", icon: Icon = AiBrain, iconOnly = false, onClick }) {\n  return (\n    <Button\n      type="button"\n      variant="ghost"\n      aria-label={label}\n      data-icon-only={iconOnly || undefined}\n      className="md-dexter-pill relative h-10 min-w-[132px] overflow-hidden rounded-[var(--md-radius-lg)] px-3.5 text-[13px] font-medium text-white"\n      onClick={onClick}\n    >\n      <span className="md-dexter-pill__shader" aria-hidden>\n        <SpectralBloomShader />\n      </span>\n      <span className="md-dexter-pill__contrast" aria-hidden />\n      <Icon className="relative z-10 size-3.5" strokeWidth={1.25} />\n      {iconOnly ? null : <SlotLabel label={label} />}\n    </Button>\n  )\n}`,
    usageCode: `const [dexterOpen, setDexterOpen] = useState(false)\n\n<div className="flex flex-wrap items-center gap-2">\n  <SegmentedControl options={customerScopeTabs} value={scope} onChange={setScope} />\n  <DexterActionPill onClick={() => setDexterOpen(true)} />\n  <PageSettingsMenu\n    viewOptions={customerViewOptions}\n    value={viewMode}\n    onViewChange={setViewMode}\n    actions={[{ id: "export-customers", label: "Export CSV", icon: Download, onSelect: exportCustomers }]}\n  />\n</div>\n\n<DexterActionPill\n  icon={ArrowUp}\n  iconOnly\n  label="Send prompt"\n  onClick={sendPrompt}\n/>\n\n<DexterCompanionSidebar open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Customers" />`,
  },
  {
    id: "dexter-companion-sidebar",
    name: "Dexter Companion Sidebar",
    category: "Agent Dexter",
    description: "A right-side AI companion rail with a wide translucent fade into the current page and inline @ references to workspace records.",
    details: "Use when Dexter should feel present inside the workflow instead of taking the operator to a separate page. The fade veil is part of the component: it should softly dissolve the underlying content into the rail and avoid a hard drawer edge. Its composer reuses Dexter Mention Input so bookings, customers, leads, quotes, documents, and pages behave consistently here and in the full agent.",
    foundOn: [
      { label: "Customers", route: "/customers" },
      { label: "Bookings", route: "/bookings" },
      { label: "CRM overview", route: "/crm" },
      { label: "CRM leads", route: "/crm/leads" },
      { label: "CRM contacts", route: "/crm/contacts" },
      { label: "CRM deals", route: "/crm/deals" },
      { label: "Components", route: "/components?component=dexter-companion-sidebar" },
    ],
    componentCode: `export function DexterCompanionSidebar({ open, onClose, contextLabel = "Customers" }) {\n  const [prompt, setPrompt] = useState("")\n  const [mentions, setMentions] = useState([])\n\n  return (\n    <AnimatePresence>\n      {open ? (\n        <motion.aside className="md-dexter-companion-panel" role="dialog" aria-label="Dexter companion">\n          <h2>Ask Dexter</h2>\n          <p>Current page context loaded from {contextLabel}.</p>\n          <DexterMentionInput\n            value={prompt}\n            items={mentionItems}\n            selectedMentions={mentions}\n            onChange={setPrompt}\n            onMentionsChange={setMentions}\n            onSend={sendPrompt}\n          />\n        </motion.aside>\n      ) : null}\n    </AnimatePresence>\n  )\n}`,
    usageCode: `const [dexterOpen, setDexterOpen] = useState(false)\n\n<DexterActionPill onClick={() => setDexterOpen(true)} />\n<DexterCompanionSidebar\n  open={dexterOpen}\n  onClose={() => setDexterOpen(false)}\n  contextLabel="Customers"\n/>`,
  },
  {
    id: "report-data-editor",
    name: "Report Data Editor",
    category: "Reports",
    description: "A shared modal for choosing the source, metric, period, and breakdown behind a report or dashboard graph.",
    details: "Use after an operator adds a graph to an editable report canvas. The modal should update the block preview before applying so the choice feels concrete.",
    foundOn: [{ label: "Report viewer", route: "/reports/marlow-may-review" }, { label: "Template builder", route: "/reports/templates/monthly-client-review" }, { label: "Components", route: "/components?component=report-data-editor" }],
    componentCode: `export function ReportBlockDataEditorDialog({ block, open, onOpenChange, onSave }) {\n  const [draft, setDraft] = useState(resolveDataSelection(block))\n  const previewBlock = applyReportBlockDataSelection(block, draft)\n\n  return (\n    <Dialog open={open} onOpenChange={onOpenChange}>\n      <DialogContent className=\"flex max-h-[calc(100dvh-24px)] !w-[calc(100vw-24px)] !max-w-[920px] flex-col overflow-hidden sm:!w-[calc(100vw-32px)] lg:!w-[920px]\">\n        <DialogHeader>\n          <DialogTitle>Choose data</DialogTitle>\n          <DialogDescription>Pick the source, metric, period, and breakdown this block should show.</DialogDescription>\n        </DialogHeader>\n        <div className=\"grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]\">\n          <div className=\"grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1\">\n            <DataSelect label=\"Source\" value={draft.source} options={reportDataSources} onChange={(source) => setDraft({ ...draft, source })} />\n            <DataSelect label=\"Metric\" value={draft.metric} options={reportDataMetrics} onChange={(metric) => setDraft({ ...draft, metric })} />\n            <DataSelect label=\"Period\" value={draft.period} options={reportDataPeriods} onChange={(period) => setDraft({ ...draft, period })} />\n            <DataSelect label=\"Breakdown\" value={draft.breakdown} options={reportDataBreakdowns} onChange={(breakdown) => setDraft({ ...draft, breakdown })} />\n          </div>\n          <div className=\"md-report-data-editor-preview min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]\">\n            <p>Preview</p>\n            <ReportBlockView block={previewBlock} />\n          </div>\n        </div>\n        <DialogFooter className=\"flex-col-reverse sm:flex-row\">\n          <Button variant=\"ghost\">Cancel</Button>\n          <Button onClick={() => onSave(previewBlock)}>Apply data</Button>\n        </DialogFooter>\n      </DialogContent>\n    </Dialog>\n  )\n}`,
    usageCode: `const [editingBlock, setEditingBlock] = useState()\n\n<ReportDocumentPage\n  page={page}\n  totalPages={pages.length}\n  editable\n  onSelectBlock={setEditingBlock}\n  onDropWidget={addWidgetById}\n/>\n<ReportBlockDataEditorDialog\n  block={editingBlock}\n  open={Boolean(editingBlock)}\n  onOpenChange={(open) => !open && setEditingBlock(undefined)}\n  onSave={saveBlock}\n/>`,
  },
  {
    id: "toast",
    name: "Toast",
    category: "Feedback",
    description: "A compact bottom-right notification with a clear status icon, stacked multi-toast view, and a five-second visual dismissal indicator.",
    details: "Use for save, export, copy, and lightweight route feedback. Keep the title direct and add one short supporting line only when it helps. Multiple notifications fan into a visible stack and expand on hover or keyboard access; hovering pauses dismissal so the operator has time to read.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "Bookings", route: "/bookings" }, { label: "Reports", route: "/reports" }, { label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `const toastLifetimeMs = 5_000\n\nexport function Toaster(props) {\n  return (\n    <Sonner\n      position="bottom-right"\n      duration={toastLifetimeMs}\n      visibleToasts={4}\n      gap={12}\n      closeButton\n      className="toaster group md-toaster"\n      icons={{\n        success: <ToastStatusIcon src={toastSuccessIcon} kind="success" />,\n        info: <ToastStatusIcon src={toastGeneralIcon} kind="general" />,\n        warning: <ToastStatusIcon src={toastErrorIcon} kind="warning" />,\n        error: <ToastStatusIcon src={toastErrorIcon} kind="error" />,\n        close: <span>Dismiss</span>,\n      }}\n      style={{\n        "--normal-bg": "color-mix(in srgb, var(--md-surface) 94%, transparent)",\n        "--normal-text": "var(--md-ink)",\n        "--normal-border": "transparent",\n        "--border-radius": "var(--md-radius-2xl)",\n        "--width": "min(520px, calc(100vw - 32px))",\n        "--md-toast-duration": "5000ms",\n      }}\n      toastOptions={{\n        classNames: {\n          toast: "cn-toast md-toast",\n          icon: "md-toast-icon",\n          title: "md-toast-title",\n          description: "md-toast-description",\n          actionButton: "md-toast-action",\n          closeButton: "md-toast-close",\n        },\n      }}\n      {...props}\n    />\n  )\n}`,
    usageCode: `<Toaster />\n\ntoast.success("Customer CSV prepared", {\n  description: "The export is ready to download.",\n})\n\n// Triggering several toasts shows a compact stack. Hover or focus it to expand.\ntoast.warning("Declaration needs attention", {\n  description: "Two checks still need review.",\n})`,
  },
  {
    id: "metric-card",
    name: "KPI Box",
    category: "Data",
    description: "A calm KPI box for overview headers, report summaries, and performance snapshots.",
    details: "Use one metric per box. Keep labels short, scope explicit, and deltas plain. In reports, pair it with chart blocks rather than turning every number into a graph.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Reports", route: "/reports" }, { label: "Template builder", route: "/reports/templates/monthly-client-review" }, { label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function MetricCard({ label, scope, value, change, detail, tone, series, className }) {\n  return (\n    <Surface padding="md" className={cn("min-h-[128px] rounded-[var(--md-radius-xl)]", className)}>\n      <div className="flex h-full flex-col justify-between gap-5">\n        <p className="truncate text-[13px] font-medium text-[var(--md-text)]">\n          {label}\n          {scope ? <span className="text-[var(--md-subtle)]"> - {scope}</span> : null}\n        </p>\n        <div className="flex items-end justify-between gap-4">\n          <div>\n            <strong className="text-[40px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{value}</strong>\n            <div className="mt-4 flex items-center gap-2">\n              <StatusPill tone={tone}>{change}</StatusPill>\n              <span className="text-[13px] text-[var(--md-text)]">{detail}</span>\n            </div>\n          </div>\n          {series ? <Sparkline values={series} tone={tone} /> : null}\n        </div>\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<MetricCard\n  label="On-time arrivals"\n  scope="30d"\n  value="94.2%"\n  change="+1.8"\n  detail="vs prev. 30d"\n  tone="green"\n/>`,
  },
  {
    id: "line-chart",
    name: "Line Chart",
    category: "Visualizations",
    description: "A report-ready trend chart for on-time performance, dwell time, rate movement, and SLA tracking.",
    details: "Use when the shape of change matters over time. Keep the target or benchmark visible when the metric is judged against a promise.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("LineChartCard", "LineChart", '<Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={3} dot={false} />\n            <Line dataKey="target" type="monotone" stroke="var(--color-target)" strokeDasharray="5 5" strokeWidth={2} dot={false} />'),
    usageCode: visualizationUsageCode("LineChartCard", "line"),
  },
  {
    id: "area-chart",
    name: "Area Chart",
    category: "Visualizations",
    description: "A soft volume chart for showing freight load, seasonal movement, or forecast pressure.",
    details: "Use when totals and direction both matter. The filled area should stay subtle so the chart still feels calm inside dense operator screens.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("AreaChartCard", "AreaChart", '<Area dataKey="ocean" type="natural" fill="url(#volumeOcean)" stroke="var(--color-ocean)" strokeWidth={3} />\n            <Area dataKey="air" type="natural" fill="url(#volumeAir)" stroke="var(--color-air)" strokeWidth={2} />'),
    usageCode: visualizationUsageCode("AreaChartCard", "area"),
  },
  {
    id: "bar-chart",
    name: "Bar Chart",
    category: "Visualizations",
    description: "A grouped comparison chart for mode volume, customer volume, carrier performance, or monthly counts.",
    details: "Use when the operator needs to compare categories side by side. Keep series count low so the chart is readable in reports.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("BarChartCard", "BarChart", '<Bar dataKey="ocean" fill="var(--color-ocean)" radius={4} />\n            <Bar dataKey="air" fill="var(--color-air)" radius={4} />\n            <Bar dataKey="road" fill="var(--color-road)" radius={4} />'),
    usageCode: `<BarChartCard variant="single" />\n\n<BarChartCard\n  variant="comparison"\n  data={monthlyModeVolume}\n  series={[\n    { key: "ocean", label: "Ocean", color: "var(--md-accent)" },\n    { key: "air", label: "Air", color: "var(--md-blue)" },\n  ]}\n/>\n\n<ReportVisualizationBlock kind="bar" title="Mode volume" options={{ barVariant: "comparison" }} />`,
  },
  {
    id: "stacked-bar-chart",
    name: "Stacked Bar Chart",
    category: "Visualizations",
    description: "A cost or composition chart for breaking totals into useful parts without adding a second table.",
    details: "Use for quoted vs billed, surcharge mix, customs cost breakdowns, and report sections where a total needs context.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("StackedBarChartCard", "BarChart", '<Bar dataKey="quoted" stackId="cost" fill="var(--color-quoted)" radius={[4, 4, 0, 0]} />\n            <Bar dataKey="billed" stackId="cost" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />\n            <Bar dataKey="margin" stackId="cost" fill="var(--color-margin)" radius={[4, 4, 0, 0]} />'),
    usageCode: visualizationUsageCode("StackedBarChartCard", "stacked-bar"),
  },
  {
    id: "donut-chart",
    name: "Pie / Donut Chart",
    category: "Visualizations",
    description: "A compact share-of-total chart for lane mix, mode mix, document state, or exception type.",
    details: "Use for simple composition only. Prefer a bar chart when exact comparison matters more than share of total.",
    foundOn: visualizationFoundOn,
    componentCode: `export function DonutChartCard({\n  data = modeBreakdown,\n  showLegend = true,\n  innerRadius = 68,\n  outerRadius = 104,\n  centerLabel = "modes",\n  centerValueFormatter = formatPercent,\n}) {\n  const total = data.reduce((sum, item) => sum + item.value, 0)\n  let currentAngle = 0\n\n  return (\n    <VisualizationShell title="Lane mix" subtitle="Share of bookings by transport mode">\n      <svg viewBox="0 0 240 240" role="img" aria-label="Lane mix">\n        {data.map((entry) => {\n          const angle = total > 0 ? (entry.value / total) * 360 : 0\n          const startAngle = currentAngle\n          const endAngle = currentAngle + angle\n          currentAngle = endAngle\n\n          return (\n            <path\n              key={entry.name}\n              d={describePieSegment(120, 120, outerRadius, innerRadius, startAngle, endAngle)}\n              fill={entry.color}\n            />\n          )\n        })}\n        {innerRadius > 0 ? <ChartCenter value={centerValueFormatter(total)} label={centerLabel} /> : null}\n      </svg>\n      {showLegend ? <LegendRow items={data.map((item) => ({ label: item.name, color: item.color }))} /> : null}\n    </VisualizationShell>\n  )\n}`,
    usageCode: `<DonutChartCard />\n\n<DonutChartCard\n  title="Pie chart with key"\n  data={modeBreakdown}\n  showLegend\n/>\n\n<DonutChartCard\n  title="Pie chart without key"\n  data={documentStates}\n  showLegend={false}\n  innerRadius={0}\n/>\n\n<DonutChartCard\n  title="Booking count donut"\n  data={bookingModeCounts}\n  centerLabel="bookings"\n  centerValueFormatter={(value) => value.toLocaleString()}\n/>\n\n<ReportVisualizationBlock kind="pie" title="Mode mix" options={{ showLegend: false, pieInnerRadius: 0 }} />`,
  },
  {
    id: "funnel-chart",
    name: "Funnel Chart",
    category: "Visualizations",
    description: "A stage-by-stage chart for report builder flows, document processing, quote conversion, and customs clearance.",
    details: "Use when a process narrows as work moves through stages. Keep labels as operational stages, not abstract marketing words.",
    foundOn: visualizationFoundOn,
    componentCode: `export function FunnelChartCard({ data = funnelSteps, showSummary = true }) {\n  return (\n    <VisualizationShell title="Document funnel" subtitle="From intake to clearance">\n      <ChartContainer config={chartConfig} className="h-[250px] w-full [aspect-ratio:auto]">\n        <FunnelChart>\n          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />\n          <Funnel data={data} dataKey="value" nameKey="stage" isAnimationActive={false}>\n            {data.map((entry) => <Cell key={entry.stage} fill={entry.color} />)}\n          </Funnel>\n        </FunnelChart>\n      </ChartContainer>\n      {showSummary ? <FunnelStageSummary data={data} /> : null}\n    </VisualizationShell>\n  )\n}`,
    usageCode: `<FunnelChartCard />\n\n<FunnelChartCard\n  title="Three-step quote funnel"\n  data={[\n    { stage: "Quoted", value: 92, color: "var(--md-accent)" },\n    { stage: "Accepted", value: 48, color: "var(--md-green)" },\n    { stage: "Booked", value: 36, color: "var(--md-blue)" },\n  ]}\n/>\n\n<FunnelChartCard\n  title="Five-step customs funnel"\n  data={customsStages}\n  showSummary={false}\n/>\n\n<ReportVisualizationBlock kind="funnel" title="Document funnel" options={{ funnelData: customsStages }} />`,
  },
  {
    id: "heatmap-chart",
    name: "Heatmap",
    category: "Visualizations",
    description: "A matrix chart for origin-destination density, exception concentration, or route-level workload.",
    details: "Use when the user needs to find clusters quickly. Keep the grid compact, labelled, and readable without requiring hover.",
    foundOn: visualizationFoundOn,
    componentCode: `export function HeatmapChartCard({ compact, className }) {\n  return (\n    <VisualizationShell title="Lane density heatmap" subtitle="Origin and destination concentration" compact={compact} className={className}>\n      <div className="grid gap-2 rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]">\n        {rows.map((row) => columns.map((column) => (\n          <span style={{ background: \`color-mix(in srgb, var(--md-accent) \${row[column]}%, white)\` }}>\n            {row[column]}\n          </span>\n        )))}\n      </div>\n    </VisualizationShell>\n  )\n}`,
    usageCode: visualizationUsageCode("HeatmapChartCard", "heatmap"),
  },
  {
    id: "radial-goal-chart",
    name: "Radial Goal",
    category: "Visualizations",
    description: "A compact goal-progress chart for SLA, compliance, extraction confidence, or target completion.",
    details: "Use for one progress number with a clear target. Do not use it for unrelated multi-series comparisons.",
    foundOn: visualizationFoundOn,
    componentCode: `export function RadialGoalChartCard({ value = 94, max = 100, label = "target", color = "var(--md-accent)" }) {\n  return (\n    <VisualizationShell title="Clearance SLA" subtitle="Documents cleared inside target window">\n      <ChartContainer config={{ score: { label: "Score", color } }} className="mx-auto h-[240px] w-full max-w-[260px] [aspect-ratio:1]">\n        <RadialBarChart data={[{ name: "score", value }]} startAngle={90} endAngle={-270}>\n          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} domain={[0, max]} />\n          <RadialBar dataKey="value" background cornerRadius={8} fill="var(--color-score)" />\n        </RadialBarChart>\n      </ChartContainer>\n      <p>{value}% {label}</p>\n    </VisualizationShell>\n  )\n}`,
    usageCode: visualizationUsageCode("RadialGoalChartCard", "radial"),
  },
  {
    id: "scatter-chart",
    name: "Scatter Plot",
    category: "Visualizations",
    description: "A relationship chart for carrier efficiency, dwell time, margin outliers, or risk-vs-volume analysis.",
    details: "Use when the operator needs to spot outliers or tradeoffs. Always make both axes plain-English.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("ScatterChartCard", "ScatterChart", '<XAxis dataKey="dwell" name="Dwell days" type="number" />\n            <YAxis dataKey="onTime" name="On-time" type="number" />\n            <ZAxis dataKey="volume" range={[70, 280]} name="Volume" />\n            <Scatter data={carrierEfficiency} fill="var(--md-accent)" />'),
    usageCode: visualizationUsageCode("ScatterChartCard", "scatter"),
  },
  {
    id: "mixed-chart",
    name: "Mixed Chart",
    category: "Visualizations",
    description: "A combined bar-and-line chart for report sections where volume and performance need to be read together.",
    details: "Use for spend and margin, volume and SLA, or bookings and exceptions. Keep it to two signals so the chart remains believable in a PDF-style report.",
    foundOn: visualizationFoundOn,
    componentCode: visualizationComponentCode("MixedChartCard", "ComposedChart", '<Bar dataKey="billed" fill="var(--color-billed)" radius={4} />\n            <Line dataKey="margin" type="monotone" stroke="var(--color-margin)" strokeWidth={3} dot={false} />'),
    usageCode: visualizationUsageCode("MixedChartCard", "mixed"),
  },
  {
    id: "booking-row",
    name: "Booking Row",
    category: "Operations",
    description: "The repeated row pattern for live jobs, preserving origin, destination, ETA, mode, and progress.",
    details: "Use inside panels and detail sheets. It scales better than a dense table for operational attention.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingRow({ booking, compact }) {\n  return (\n    <div className={cn("grid grid-cols-[minmax(76px,110px)_1fr_auto] items-center gap-3 py-2", compact && "py-1.5")}>\n      <div className="min-w-0">\n        <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{booking.id}</p>\n        <p className="truncate text-[11px] text-[var(--md-subtle)]">{booking.mode}</p>\n      </div>\n      <div className="min-w-0">\n        <div className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--md-ink)]">\n          <span className="truncate">{booking.from}</span>\n          <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />\n          <span className="truncate">{booking.to}</span>\n        </div>\n        <Progress value={booking.progress} className="mt-2 h-1.5 rounded-full bg-[rgba(90,103,100,0.08)]" />\n      </div>\n      <div className="text-right">\n        <p className="text-[11px] text-[var(--md-subtle)]">ETA</p>\n        <p className="text-[12px] font-medium text-[var(--md-ink)]">{booking.eta}</p>\n      </div>\n    </div>\n  )\n}`,
    usageCode: `<BookingRow booking={liveBookings[0]} />`,
  },
  {
    id: "interactive-map",
    name: "Interactive Booking Map",
    category: "Operations",
    description: "A real map layer for live route tracking, booking markers, and selected-route context.",
    details: "Use where operators need geography, not decoration. Keep route data in shared booking records and let cards select the matching route.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Reports", route: "/reports" }, { label: "Components", route: "/components" }],
    componentCode: `export function InteractiveBookingMap() {\n  const [selectedId, setSelectedId] = useState(liveBookings[0].id)\n\n  return (\n    <>\n      <MapContainer className="md-booking-map h-full w-full" zoomControl={false}>\n        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />\n        <ZoomControl position="bottomright" />\n        {liveBookings.map((booking) => (\n          <BookingRoute key={booking.id} booking={booking} selected={booking.id === selectedId} onSelect={setSelectedId} />\n        ))}\n      </MapContainer>\n      <BookingMapCards selectedId={selectedId} onSelect={setSelectedId} />\n    </>\n  )\n}`,
    usageCode: `<Suspense fallback={<div className="h-[310px] bg-[var(--md-bg-strong)]" />}>\n  <InteractiveBookingMap />\n</Suspense>`,
  },
  {
    id: "command",
    name: "Command Input",
    category: "Navigation",
    description: "The shared search and jump control, with rich booking and quote matches that make a record recognisable before opening it.",
    details: "Use in the app header across operational modules. Each result should show its reference, customer, route and current operational context rather than a bare identifier.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Quotes", route: "/quotes" }, { label: "Road control", route: "/road-control" }, { label: "Components", route: "/components" }],
    componentCode: `export function CommandInput({ placeholder, onNavigate }) {\n  const [query, setQuery] = useState("")\n  const results = findBookingsAndQuotes(query)\n\n  return (\n    <div className="relative">\n      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />\n      {query ? results.map((result) => (\n        <button key={result.id} onClick={() => onNavigate?.(result.path)}>\n          <strong>{result.reference}</strong>\n          <span>{result.customer} · {result.route}</span>\n          <small>{result.mode} · {result.service} · {result.status}</small>\n        </button>\n      )) : null}\n    </div>\n  )\n}`,
    usageCode: `<CommandInput placeholder="Job, reference, customer, route..." onNavigate={navigate} />`,
  },
  {
    id: "app-breadcrumbs",
    name: "App Breadcrumbs",
    category: "Navigation",
    description: "The shared route trail for showing where an operator is and returning to the parent workspace without losing context.",
    details: "Use in the app header for list, detail, and nested workflow routes. Keep ancestor items actionable, the current page non-interactive, dynamic references left-to-right, and every static label localised.",
    foundOn: [{ label: "App shell", route: "/" }, { label: "Customers", route: "/customers" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Road control", route: "/road-control" }, { label: "Components", route: "/components?component=app-breadcrumbs" }],
    componentCode: `export function AppBreadcrumbs({ route, navigate, leafLabel }) {\n  const { direction, t } = useLanguage()\n  const trail = getAppBreadcrumbTrail(route, leafLabel)\n\n  function openRoute(event, path) {\n    if (!navigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return\n    event.preventDefault()\n    navigate(path)\n  }\n\n  return (\n    <Breadcrumb dir={direction}>\n      <BreadcrumbList>\n        {trail.map((item, index) => {\n          const isCurrent = index === trail.length - 1\n          return (\n            <Fragment key={item.route ?? item.label}>\n              {index > 0 ? <BreadcrumbSeparator /> : null}\n              <BreadcrumbItem>\n                {isCurrent ? (\n                  <BreadcrumbPage>{t(item.label)}</BreadcrumbPage>\n                ) : (\n                  <BreadcrumbLink asChild>\n                    <a href={item.route} onClick={(event) => openRoute(event, item.route)}>\n                      {t(item.label)}\n                    </a>\n                  </BreadcrumbLink>\n                )}\n              </BreadcrumbItem>\n            </Fragment>\n          )\n        })}\n      </BreadcrumbList>\n    </Breadcrumb>\n  )\n}`,
    usageCode: `<AppBreadcrumbs\n  route="/crm/leads/northstar-components/convert"\n  leafLabel="Northstar Components"\n  navigate={navigate}\n/>`,
  },
  {
    id: "sidebar",
    name: "Area Sidebar Navigation",
    category: "Navigation",
    description: "The two-level Multideck navigation pattern: Dexter stays first in every rail, followed by stable product areas or area-specific destinations with optional dropdown groups.",
    details: "Keep Dexter permanently mounted at the top and use its shared shader treatment in both navigation levels, so changing areas never restarts the shader. Selecting a CSV-backed area replaces only the remaining rail without changing the page; destinations can link directly or disclose smaller page links. The shared active surface, motion, collapsed state and RTL behavior remain consistent across both levels.",
    foundOn: [{ label: "App shell", route: "/" }, { label: "Operations", route: "/bookings" }, { label: "Sales & CRM", route: "/crm" }, { label: "Components", route: "/components?component=sidebar" }],
    componentCode: `export function AppSidebar({ route, navigate }) {\n  const [activeAreaId, setActiveAreaId] = useState(findAreaForRoute(route)?.id ?? null)\n  const [expandedIds, setExpandedIds] = useState(new Set())\n  const activeArea = sidebarAreas.find((area) => area.id === activeAreaId)\n\n  return (\n    <aside className="relative flex h-full flex-col bg-[var(--md-sidebar-bg)]">\n      <SidebarNavItem\n        item={{ label: "Agent Dexter", icon: AiBrain, route: "/agent-dexter" }}\n        accent="dexter"\n        onClick={() => navigate("/agent-dexter")}\n      />\n      <AnimatePresence mode="popLayout" initial={false}>\n        {activeArea ? (\n          <motion.nav key={activeArea.id}>\n            <button onClick={() => setActiveAreaId(null)}>All areas</button>\n            {activeArea.destinations.map((destination) => (\n              <div key={destination.id}>\n                <SidebarNavItem\n                  item={destination}\n                  expanded={destination.children ? expandedIds.has(destination.id) : undefined}\n                  onClick={destination.children\n                    ? () => toggleExpanded(destination.id)\n                    : destination.route ? () => navigate(destination.route) : undefined}\n                />\n                {expandedIds.has(destination.id)\n                  ? destination.children?.map((child) => (\n                      <SidebarNavItem key={child.label} item={child} nested onClick={() => navigate(child.route)} />\n                    ))\n                  : null}\n              </div>\n            ))}\n          </motion.nav>\n        ) : (\n          <motion.nav key="areas">\n            {sidebarAreas.map((area) => (\n              <SidebarNavItem key={area.id} item={area} onClick={() => setActiveAreaId(area.id)} />\n            ))}\n          </motion.nav>\n        )}\n      </AnimatePresence>\n    </aside>\n  )\n}`,
    usageCode: `<AppSidebar route={route} navigate={navigate} />`,
  },
  {
    id: "sidebar-item-menu",
    name: "Sidebar Item Menu",
    category: "Navigation",
    description: "The right-click menu on a navigation row, holding the pin and reorder actions so the sidebar itself stays free of permanent controls.",
    details: "Wrap any row the operator is allowed to customise. Right-click on desktop and long-press on touch both open it, and it follows the app language direction so the menu opens on the correct side in Arabic. Pass `disabled` for rows that must keep their place.",
    foundOn: [{ label: "App shell", route: "/" }, { label: "Operations", route: "/bookings" }, { label: "Sales & CRM", route: "/crm" }, { label: "Components", route: "/components?component=sidebar-item-menu" }],
    componentCode: `export function SidebarItemMenu({ children, pinned = false, onTogglePin, onReorder, disabled = false, className }) {\n  const { direction, t } = useLanguage()\n\n  if (disabled) return <>{children}</>\n\n  return (\n    <ContextMenuPrimitive.Root dir={direction}>\n      <ContextMenuPrimitive.Trigger asChild>\n        <div className={cn("relative", className)}>{children}</div>\n      </ContextMenuPrimitive.Trigger>\n      <ContextMenuPrimitive.Portal>\n        <ContextMenuPrimitive.Content collisionPadding={14} className="md-sidebar-menu premium-stroke z-50 rounded-[var(--md-radius-xl)] p-1 shadow-[var(--md-shadow-lift)] backdrop-blur-xl">\n          <SidebarItemMenuAction\n            icon={pinned ? PinOff : Pin}\n            label={t(pinned ? "Unpin" : "Pin to top")}\n            hint={t(pinned ? "Restore place" : "Keep first")}\n            onSelect={onTogglePin}\n          />\n          <SidebarItemMenuAction icon={ArrowUpDown} label={t("Reorder")} hint={t("Drag to arrange")} onSelect={onReorder} />\n        </ContextMenuPrimitive.Content>\n      </ContextMenuPrimitive.Portal>\n    </ContextMenuPrimitive.Root>\n  )\n}`,
    usageCode: `const { scope, togglePin } = useSidebarLayoutScope("areas")\n\n<SidebarItemMenu\n  pinned={scope.pinned.includes(destination.id)}\n  onTogglePin={() => togglePin(destination.id)}\n  onReorder={() => setArranging(true)}\n>\n  <SidebarNavItem item={destination} onClick={() => navigate(destination.route)} />\n</SidebarItemMenu>`,
  },
  {
    id: "sidebar-arrange-canvas",
    name: "Sidebar Arrange Canvas",
    category: "Navigation",
    description: "The drag-to-reorder editor that temporarily replaces a navigation list so the operator can rearrange and pin its rows.",
    details: "Use for any list the operator owns. Order and pins are edited as a draft and only committed on Save, so an abandoned rearrangement never changes the saved layout. Rows can also be moved with the arrow keys from the grip handle, and every move is announced for screen readers. Saved layouts persist per user through `useSidebarLayoutScope`.",
    foundOn: [{ label: "App shell", route: "/" }, { label: "Operations", route: "/bookings" }, { label: "Sales & CRM", route: "/crm" }, { label: "Components", route: "/components?component=sidebar-arrange-canvas" }],
    componentCode: `export function SidebarArrangeCanvas({ items, order, pinned, defaultOrder, onSave, onCancel }) {\n  const [draftOrder, setDraftOrder] = useState(order)\n  const [draftPinned, setDraftPinned] = useState(pinned)\n  const [heldId, setHeldId] = useState(null)\n  const dragOffset = useMotionValue(0)\n\n  return (\n    <div className="mt-3">\n      <ul role="list" className="flex flex-col" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>\n        {draftOrder.map((id, index) => (\n          <ArrangeRow\n            key={id}\n            item={itemsById.get(id)}\n            position={index}\n            y={heldId === id ? dragOffset : rowValue(id)}\n            held={heldId === id}\n            pinned={draftPinned.includes(id)}\n            onTogglePin={() => togglePin(id)}\n            onKeyboardMove={(direction) => moveByKeyboard(id, direction)}\n          />\n        ))}\n      </ul>\n      <div className="mt-3 flex items-center gap-2">\n        <button onClick={resetToDefault}>{t("Reset")}</button>\n        <button onClick={() => onSave({ order: draftOrder, pinned: draftPinned })}>{t("Save")}</button>\n      </div>\n    </div>\n  )\n}`,
    usageCode: `const { scope, save } = useSidebarLayoutScope("areas")\nconst { orderedIds } = resolveSidebarOrder(baseIds, scope)\n\n{arranging ? (\n  <SidebarArrangeCanvas\n    items={arrangeItems}\n    order={orderedIds}\n    pinned={scope.pinned}\n    defaultOrder={baseIds}\n    onSave={(next) => {\n      save(isDefaultScope(baseIds, next) ? null : next)\n      setArranging(false)\n    }}\n    onCancel={() => setArranging(false)}\n  />\n) : null}`,
  },
  {
    id: "theme-toggle",
    name: "Theme Toggle",
    category: "Navigation",
    description: "The sidebar appearance switch for moving between light and dark mode without leaving the workspace.",
    details: "Use in persistent navigation surfaces where the user's preference should feel immediate and calm. The shared theme boundary owns the visual change and cross-tab update, while profile persistence runs behind it and can never repaint an older choice. The thumb and persistent sun and moon layers communicate the new state without remounting; reduced-motion users receive the same clear state without spatial movement.",
    foundOn: [{ label: "Overview sidebar", route: "/" }, { label: "Components", route: "/components" }],
    componentCode: `export function ThemeToggle({ compact = false, showAppearanceLabel = true }) {\n  const { resolvedTheme, setTheme } = useTheme()\n  const { direction, t } = useLanguage()\n  const shouldReduceMotion = useReducedMotion()\n  const isDark = resolvedTheme === "dark"\n\n  return (\n    <button\n      type="button"\n      role="switch"\n      aria-checked={isDark}\n      aria-label={t(isDark ? "Switch to light mode" : "Switch to dark mode")}\n      onClick={() => setThemeWithProfileIntent(setTheme, isDark ? "light" : "dark")}\n    >\n      {compact ? null : (\n        <span>\n          {showAppearanceLabel ? <span>{t("Appearance")}</span> : null}\n          <span>{t(isDark ? "Dark mode" : "Light mode")}</span>\n        </span>\n      )}\n      <span className="relative h-[30px] w-12 rounded-full">\n        <motion.span\n          animate={{ x: compact ? 0 : isDark ? (direction === "rtl" ? -18 : 18) : 0 }}\n          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}\n        >\n          <motion.span initial={false} animate={{ opacity: isDark ? 0 : 1, scale: isDark ? 0.25 : 1 }}><Sun /></motion.span>\n          <motion.span initial={false} animate={{ opacity: isDark ? 1 : 0, scale: isDark ? 1 : 0.25 }}><Moon /></motion.span>\n        </motion.span>\n      </span>\n    </button>\n  )\n}`,
    usageCode: `<ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange enableSystem={false} storageKey="multideck.theme">\n  <AppShell>\n    <ThemeToggle />\n  </AppShell>\n</ThemeProvider>`,
  },
  {
    id: "animated-list",
    name: "Animated List",
    category: "Operations",
    description: "A standalone scrollable-list component for moments where a soft reveal treatment is intentionally useful.",
    details: "Use as a deliberate component, not as the default table treatment. It suits compact feeds, selectable option lists, or focused panels where the scroll motion improves orientation.",
    foundOn: [{ label: "Components", route: "/components" }],
    componentCode: `export function AnimatedList({ items, renderItem, maxHeight = 400, showGradients = true, fadeColor = "var(--md-surface)" }) {\n  const listRef = useRef(null)\n  const [isScrollable, setIsScrollable] = useState(false)\n\n  function updateScrollState(container) {\n    setIsScrollable(container.scrollHeight > container.clientHeight + 1)\n  }\n\n  return (\n    <div className="relative w-full overflow-hidden rounded-[var(--md-radius-xl)]" style={{ "--md-animated-list-fade": fadeColor }}>\n      <div ref={listRef} className="md-scrollbar overflow-y-auto" style={{ maxHeight }} onScroll={(event) => updateScrollState(event.currentTarget)}>\n        {items.map((item, index) => (\n          <AnimatedListItem key={item.id ?? index} animateOnScroll={isScrollable} listRef={listRef}>\n            {renderItem(item, index)}\n          </AnimatedListItem>\n        ))}\n      </div>\n      {showGradients && isScrollable ? <ScrollEdgeGradients fadeColor="var(--md-animated-list-fade)" /> : null}\n    </div>\n  )\n}`,
    usageCode: `<AnimatedList\n  items={activityItems}\n  getItemKey={(item, index) => \`\${item.title}-\${index}\`}\n  ariaLabel="Activity preview"\n  fadeColor="var(--md-bg-strong)"\n  maxHeight={300}\n  initialSelectedIndex={0}\n  renderItem={(item) => {\n    const Icon = item.icon\n\n    return (\n      <div className="grid grid-cols-[30px_1fr_auto] gap-3">\n        <div className="grid size-[30px] place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">\n          <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />\n        </div>\n        <div className="min-w-0">\n          <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.title}</p>\n          <p className="text-[11px] text-[var(--md-subtle)]">{item.source}</p>\n        </div>\n        <span className="pt-1 text-[11px] text-[var(--md-subtle)]">{item.time}</span>\n      </div>\n    )\n  }}\n/>`,
  },
  {
    id: "pagination",
    name: "Pagination",
    category: "Navigation",
    description: "A compact control for moving through long operational lists without losing the current range.",
    details: "Use below tables, card grids, and list views when the dataset is longer than the screen should comfortably show. Keep the range and rows-per-page control visible so operators can decide how dense the list should be.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Bookings", route: "/bookings" }, { label: "Quotes", route: "/quotes" }, { label: "Settings", route: "/settings" }, { label: "Compliance controls", route: "/compliance/screening" }, { label: "Components", route: "/components" }],
    componentCode: `import {\n  Pagination as PaginationRoot,\n  PaginationContent,\n  PaginationEllipsis,\n  PaginationItem,\n  PaginationLink,\n  PaginationNext,\n  PaginationPrevious,\n} from "@/components/ui/pagination"\n\nexport function Pagination({ page, pageCount, totalItems, pageSize, onPageChange, itemLabel = "items" }) {\n  const currentPage = Math.min(Math.max(page, 1), Math.max(pageCount, 1))\n  const visiblePages = getVisiblePages(currentPage, pageCount)\n\n  return (\n    <PaginationRoot aria-label={itemLabel + " pagination"}>\n      <p>Showing the current item range and total</p>\n      <PaginationContent>\n        <PaginationItem><PaginationPrevious href="#" /></PaginationItem>\n        {visiblePages.map((pageNumber) => (\n          <PaginationItem key={pageNumber}>\n            <PaginationLink href="#" isActive={pageNumber === currentPage}>{pageNumber}</PaginationLink>\n          </PaginationItem>\n        ))}\n        <PaginationItem><PaginationEllipsis /></PaginationItem>\n        <PaginationItem><PaginationNext href="#" /></PaginationItem>\n      </PaginationContent>\n    </PaginationRoot>\n  )\n}`,
    usageCode: `const [page, setPage] = useState(1)\nconst [rowsPerPage, setRowsPerPage] = useState(20)\nconst pageCount = Math.ceil(customers.length / rowsPerPage)\nconst paginatedCustomers = customers.slice((page - 1) * rowsPerPage, page * rowsPerPage)\n\n<Pagination\n  page={page}\n  pageCount={pageCount}\n  totalItems={customers.length}\n  pageSize={rowsPerPage}\n  pageSizeOptions={[10, 20, 30, 50]}\n  itemLabel="customers"\n  onPageChange={setPage}\n  onPageSizeChange={(nextRowsPerPage) => {\n    setRowsPerPage(nextRowsPerPage)\n    setPage(1)\n  }}\n/>`,
  },
  {
    id: "world-clock",
    name: "World Clock Cell",
    category: "Operations",
    description: "A compact city time cell for global freight teams working across time zones.",
    details: "Use in grids. Digital mode keeps the dense operator scan, while analogue mode centers a larger clock face and gives the city name enough room to wrap cleanly. After-hours offices should show an explicit OOH cue on both the time and the clock face.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components" }],
    componentCode: `export function WorldClockCell({ city, selected, onSelect, now = new Date(), displayMode = "digital" }) {\n  const clock = getCityClock(city, now)\n  const statusLine = getClockStatusLine(clock.tone)\n\n  return (\n    <button\n      type="button"\n      data-md-clock-display={displayMode}\n      className={cn(\n        "flex min-h-[96px] min-w-[145px] flex-col justify-between px-4 py-3 text-left transition-all duration-200 hover:bg-[rgba(255,255,255,0.45)]",\n        displayMode === "analogue" && "min-h-[154px] min-w-[192px] text-center",\n        selected && "bg-[rgba(255,255,255,0.4)]",\n      )}\n      onClick={onSelect}\n    >\n      <div className="flex items-center justify-between gap-2">\n        <span className="inline-flex items-center gap-1.5" dir="ltr">\n          <span className="size-2 rounded-full" style={{ background: toneToVar(clock.tone) }} />\n          <span className="text-[12px] font-medium text-[var(--md-text)]">{city.code}</span>\n          {clock.tone === "neutral" ? <span className="rounded-full bg-[rgba(11,20,19,0.08)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--md-ink)]">OOH</span> : null}\n        </span>\n        {displayMode === "analogue" ? <span className="max-w-[92px] truncate text-end text-[11px] font-medium text-[var(--md-text)]" dir="ltr">{clock.comparison}</span> : null}\n      </div>\n\n      {displayMode === "analogue" ? (\n        <div className="flex flex-1 flex-col items-center justify-center gap-2.5">\n          <AnalogueClockFace time={clock.time} tone={clock.tone} size="md" />\n          <div className="flex w-full min-w-0 flex-col items-center">\n            <p className="max-w-full whitespace-normal break-words text-center text-[13px] font-medium leading-tight text-[var(--md-ink)]">{city.city}</p>\n            <p className="mt-1 text-[13px] font-medium leading-tight text-[var(--md-text)]" dir="ltr">{clock.time}</p>\n            {statusLine ? <p className="mt-1 text-[11px] font-medium text-[var(--md-ink-soft)]">{statusLine}</p> : null}\n          </div>\n        </div>\n      ) : (\n        <div className="flex items-end justify-between gap-3">\n          <div className="min-w-0">\n            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{city.city}</p>\n            <p className="text-[18px] font-medium leading-tight text-[var(--md-ink)]">{clock.time}</p>\n            {statusLine ? <p className="mt-1 text-[11px] font-medium text-[var(--md-ink-soft)]">{statusLine}</p> : null}\n          </div>\n          <span className="max-w-[70px] text-right text-[12px] font-medium leading-snug text-[var(--md-text)]">{clock.comparison}</span>\n        </div>\n      )}\n    </button>\n  )\n}`,
    usageCode: `const now = useLiveNow()\n\n<WorldClockCell city={cityQueues[0]} selected={false} onSelect={() => {}} now={now} />\n<WorldClockCell city={cityQueues[4]} selected={false} onSelect={() => {}} now={now} displayMode="analogue" />`,
  },
  {
    id: "timezone-work-queue",
    name: "Timezone Work Queue",
    category: "Operations",
    description: "A focused timezone mode that turns a selected office clock into the bookings, RFQs, blockers, and cutoffs that need action before local close.",
    details: "Use when timezones should drive prioritisation. The selected city stays visible as context while the operator gets a clear queue of what to send, chase, or approve before that office closes.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components" }],
    componentCode: `export function TimezoneFocusPanel({ selectedCode }) {\n  const city = cityQueues.find((item) => item.code === selectedCode) ?? cityQueues[0]\n  const queue = timezoneWorkQueues[city.code]\n\n  return (\n    <motion.div layout>\n      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">\n        <FocusMetric label="Open RFQs" value={queue.openRfqs} detail={\`for \${city.city}\`} tone="neutral" />\n        <FocusMetric label="Need action" value={queue.needAction} detail="before cutoff" tone="amber" />\n        <FocusMetric label="Ready to quote" value={queue.readyToQuote} detail="send today" tone="green" />\n        <FocusMetric label="Pickup cutoff" value={queue.cutoffCountdown} detail={queue.cutoff} tone="red" />\n      </div>\n\n      <Surface padding="none">\n        <SectionHeader title={\`Outbound queue for \${city.city}\`} meta={\`Sorted by urgency - \${queue.items.length} active requests in this timezone\`} />\n        {queue.items.map((item) => <TimezoneWorkRow key={item.id} item={item} />)}\n      </Surface>\n    </motion.div>\n  )\n}`,
    usageCode: `const [selectedTimezone, setSelectedTimezone] = useState(null)\n\n<WorldClockPanel\n  selectedCode={selectedTimezone}\n  onSelectTimezone={setSelectedTimezone}\n/>\n<AnimatePresence>\n  {selectedTimezone ? <TimezoneFocusPanel selectedCode={selectedTimezone} /> : null}\n</AnimatePresence>`,
  },
  {
    id: "queue-row",
    name: "Queue Row",
    category: "Data",
    description: "A customs or document review row with state, progress, and owner-friendly labels.",
    details: "Use when a job needs operational follow-up. Keep the reason more visible than the ID.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components" }],
    componentCode: `export function QueueRow({ item }) {\n  return (\n    <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">\n      <TableCell className="w-[110px] py-3 pl-0 text-[12px] font-medium text-[var(--md-ink)]">{item.id}</TableCell>\n      <TableCell className="py-3 text-[13px] text-[var(--md-ink)]">{item.entry}</TableCell>\n      <TableCell className="py-3 text-right">\n        <StatusPill tone={item.tone}>{item.status}</StatusPill>\n      </TableCell>\n    </TableRow>\n  )\n}`,
    usageCode: `<QueueRow item={customsQueue[0]} />`,
  },
  {
    id: "customer-avatar",
    name: "Customer Avatar",
    category: "Operations",
    description: "A reusable initials avatar for customer records, contacts, table rows, cards, and detail headers.",
    details: "Use when a customer or contact needs a compact identity marker. Keep tone tied to the record so the same account feels familiar across lists and detail views.",
    foundOn: [{ label: "CRM accounts", route: "/crm/accounts" }, { label: "Account detail", route: "/crm/accounts/de1000c1-5eed-4ead-8000-000000000001" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "Contact detail", route: "/crm/contacts/de1000c3-5eed-4ead-8000-000000000001" }, { label: "Components", route: "/components" }],
    componentCode: `export function CustomerAvatar({ initials, tone = "teal", size = "md" }) {\n  return (\n    <span\n      className={cn(\n        "grid shrink-0 place-items-center rounded-[var(--md-radius-md)] font-medium",\n        avatarToneClass[tone] ?? avatarToneClass.teal,\n        size === "sm" && "size-8 text-[12px]",\n        size === "md" && "size-10 text-[13px]",\n        size === "lg" && "size-[74px] rounded-[var(--md-radius-lg)] text-[30px]",\n      )}\n    >\n      {initials}\n    </span>\n  )\n}`,
    usageCode: `<CustomerAvatar initials="MA" tone="olive" />\n<CustomerAvatar initials="BI" tone="blue" size="sm" />\n<CustomerAvatar initials="MA" tone="olive" size="lg" />`,
  },
  {
    id: "customer-metric-card",
    name: "Customer Metric Card",
    category: "Data",
    description: "A compact account KPI tile for customer detail pages and customer-health summaries.",
    details: "Use one customer-specific metric per tile. It is quieter than the main KPI box and works well in record headers where five facts need to scan together.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "Components", route: "/components" }],
    componentCode: `export function CustomerMetricCard({ label, value, detail, tone }) {\n  const isMuted = tone === "neutral"\n\n  return (\n    <Surface className="min-h-[104px] rounded-[var(--md-radius-xl)]" padding="md">\n      <div className="flex h-full flex-col justify-between gap-4">\n        <p className="truncate text-[13px] font-medium text-[var(--md-text)]">{label}</p>\n        <div>\n          <strong className={cn("text-[28px] font-medium leading-none", isMuted ? "text-[var(--md-ink)]" : "text-[var(--md-green)]")}>{value}</strong>\n          <p className="mt-2 text-[12px] text-[var(--md-text)]">{detail}</p>\n        </div>\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<CustomerMetricCard\n  label="On-time"\n  value="96%"\n  detail="+2.1 vs account avg"\n  tone="green"\n/>`,
  },
  {
    id: "contact-profile",
    name: "Contact Profile Module",
    category: "Operations",
    description: "An in-page contact module for seeing the full relationship context behind a primary customer contact.",
    details: "Use when a contact row needs to open more context without leaving the workflow or using a modal. Keep contact methods, decision context, open items, and next step visible together.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `export function ContactProfileModule({ contact, onClose }) {\n  return (\n    <Surface className="rounded-[var(--md-radius-xl)]" padding="none">\n      <div className="flex items-start justify-between gap-4 px-5 py-5">\n        <div className="flex min-w-0 items-start gap-4">\n          <CustomerAvatar initials={contact.initials} tone={contact.tone} size="lg" />\n          <div className="min-w-0">\n            <div className="flex flex-wrap items-center gap-2">\n              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">{contact.name}</h2>\n              {contact.primary ? <StatusPill tone="teal">Primary contact</StatusPill> : null}\n            </div>\n            <p className="mt-1 text-[13px] text-[var(--md-text)]">{contact.role}</p>\n          </div>\n        </div>\n        {onClose ? <Button variant="ghost" onClick={onClose}>Close</Button> : null}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<ContactProfileModule\n  contact={marlowContacts.find((contact) => contact.primary) ?? marlowContacts[0]}\n  onClose={() => setSelectedContactEmail(null)}\n/>`,
  },
  {
    id: "primary-contacts-panel",
    name: "Primary Contacts Panel",
    category: "Operations",
    description: "A customer-detail panel for account contacts, contact actions, selected state, and the add-contact entry point.",
    details: "Use when a record needs the key people visible beside the main account workflow. It is a panel component, not the whole customer detail screen.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `export function PrimaryContactsPanel({ selectedContact, onSelectContact }) {\n  return (\n    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">\n      <CustomerPanelHeader title="Primary contacts" meta="4" action={<ArrowTextButton>View all</ArrowTextButton>} />\n      {marlowContacts.map((contact) => (\n        <ContactRow\n          key={contact.email}\n          contact={contact}\n          selected={selectedContact?.email === contact.email}\n          onOpen={() => onSelectContact(contact)}\n        />\n      ))}\n      <AddContactButton />\n    </Surface>\n  )\n}`,
    usageCode: `<PrimaryContactsPanel\n  selectedContact={selectedContact}\n  onSelectContact={setSelectedContact}\n/>`,
  },
  {
    id: "page-settings-menu",
    name: "Page Settings Menu",
    category: "Navigation",
    description: "A compact animated popover for page-level view controls and secondary actions.",
    details: "Use when a page header would otherwise collect several view switches or utility actions in one row. Keep always-needed scope tabs outside the menu, and place lower-priority controls like view mode or export inside.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "Components", route: "/components?component=page-settings-menu" }],
    componentCode: `export function PageSettingsMenu({ viewOptions, value, onViewChange, actions = [] }) {\n  return (\n    <Popover>\n      <PopoverTrigger asChild>\n        <button aria-label="Open page settings">\n          <span aria-hidden>{/* three line menu icon */}</span>\n        </button>\n      </PopoverTrigger>\n      <PopoverContent align="end">\n        <motion.div variants={menuReveal} initial="hidden" animate="show">\n          <p>Page settings</p>\n          <div>\n            <p>View</p>\n            {viewOptions.map((option) => (\n              <motion.button key={option.value} aria-pressed={value === option.value} onClick={() => onViewChange(option.value)}>\n                <option.icon />\n                <span>{option.label ?? option.value}</span>\n                {value === option.value ? <Check /> : null}\n              </motion.button>\n            ))}\n          </div>\n          {actions.map((action) => (\n            <motion.button key={action.id} onClick={action.onSelect}>\n              <action.icon />\n              <span>{action.label}</span>\n            </motion.button>\n          ))}\n        </motion.div>\n      </PopoverContent>\n    </Popover>\n  )\n}`,
    usageCode: `<SegmentedControl options={customerScopeTabs} value={scope} onChange={setScope} />\n<DexterActionPill onClick={() => navigate("/agent-dexter")} />\n<PageSettingsMenu\n  viewOptions={customerViewOptions}\n  value={viewMode}\n  onViewChange={setViewMode}\n  actions={[{ id: "export-customers", label: "Export CSV", icon: Download, onSelect: exportCustomers }]}\n/>`,
  },
  {
    id: "date-range-picker",
    name: "Date Pickers",
    category: "Controls",
    description: "The shared branded date controls for a single date, date and time, or a range with optional comparison.",
    details: "Use these instead of browser-native date inputs. Every variant shares the glass calendar, date formatting, RTL-safe layout, constrained dates, and the rebranded Calendar Days icon; date-time fields add a compact branded time control.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "New booking", route: "/bookings/new" }, { label: "Bookings", route: "/bookings" }, { label: "Warehouse orders", route: "/warehouse/orders" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=date-range-picker" }],
    componentCode: `export function MultideckDatePicker({ value, onChange, minDate, maxDate }) {\n  return <MultideckDateRangePicker value={{ start: value, end: value }} onChange={(range) => onChange(range.start)} minDate={minDate} maxDate={maxDate} />\n}\n\nexport function MultideckDateTimePicker({ value, onChange }) {\n  const date = value.slice(0, 10)\n  const time = value.slice(11, 16)\n  return (\n    <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">\n      <MultideckDatePicker value={date} onChange={(nextDate) => onChange((nextDate ?? "") + "T" + time)} />\n      <BrandedTimeInput value={time} onChange={(nextTime) => onChange(date + "T" + nextTime)} />\n    </div>\n  )\n}`,
    usageCode: `const [expiryDate, setExpiryDate] = useState("2026-06-04")\nconst [appointment, setAppointment] = useState("2026-06-04T09:30")\n\n<MultideckDatePicker\n  value={expiryDate}\n  onChange={(date) => setExpiryDate(date ?? "")}\n  title="Expiry date"\n/>\n\n<MultideckDateTimePicker\n  value={appointment}\n  onChange={setAppointment}\n  title="Appointment"\n/>`,
  },
  {
    id: "pdf-document-viewer-dialog",
    name: "PDF Document Viewer Dialog",
    category: "Operations",
    description: "A full-page PDF reader that places white document sheets directly over the blurred application, with multipage scrolling, owned zoom controls, and an explicit download lifecycle.",
    details: "Use for private generated documents that operators need to inspect without losing their place. The first sheet fits completely inside the viewport, a restrained glass rail keeps zoom and download actions available, and Download moves through Downloading and Done while focus, Escape and reduced-motion behaviour remain intact.",
    foundOn: [{ label: "Standalone export", route: "/customs/standalone/export" }, { label: "Standalone import", route: "/customs/standalone/import" }, { label: "Components", route: "/components?component=pdf-document-viewer-dialog" }],
    componentCode: `export function PdfDocumentViewerDialog({ open, onOpenChange, blob, title, fileName, onDownload }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur" className="fixed inset-0 bg-transparent">
        <PdfPageStack pages={renderedPages} initialView="fit-page" />
        <PdfGlassControls onDownload={onDownload} />
      </DialogContent>
    </Dialog>
  )
}`,
    usageCode: `<PdfDocumentViewerDialog
  open={viewerOpen}
  onOpenChange={setViewerOpen}
  blob={declarationPdf}
  title="CDS export declaration"
  fileName="CDS-Export-MRN.pdf"
  meta="MRN 26GB…"
  onDownload={downloadDeclaration}
/>`,
  },
  {
    id: "document-workspace",
    name: "Document Workspace",
    category: "Operations",
    description: "A universal document browser with list and gallery views, relationship filters, and a live side preview.",
    details: "Use on quotes, customers, suppliers, destinations, routings, and other records where people need to see the file name, description, type, upload date, last modified date, and the business context a document belongs to.",
    foundOn: [{ label: "Quote documents", route: "/quotes/Q-19158" }, { label: "Components", route: "/components?component=document-workspace" }],
    componentCode: `export function DocumentWorkspace({ documents }) {\n  const [view, setView] = useState("list")\n  const [source, setSource] = useState("all")\n  const [selectedDocumentId, setSelectedDocumentId] = useState(null)\n  const visibleDocuments = source === "all" ? documents : documents.filter((document) => document.source === source)\n\n  return (\n    <section>\n      <DocumentWorkspaceToolbar view={view} source={source} onViewChange={setView} onSourceChange={setSource} />\n      <div className={selectedDocumentId ? "document-layout document-layout--preview" : "document-layout"}>\n        {view === "list" ? <DocumentList documents={visibleDocuments} /> : <DocumentGrid documents={visibleDocuments} />}\n        {selectedDocumentId ? <DocumentPreviewPanel document={documents.find((item) => item.id === selectedDocumentId)} /> : null}\n      </div>\n    </section>\n  )\n}`,
    usageCode: `<DocumentWorkspace\n  documents={documentWorkspaceSampleDocuments}\n  defaultView="list"\n  defaultSource="all"\n/>`,
  },
  {
    id: "document-extraction-progress",
    name: "Document Extraction Progress",
    category: "Operations",
    description: "The waiting state for document work that runs in stages, with the operator's own page under a reading sweep.",
    details: "Use when a document is being read and the wait is long enough to need explaining. Each stage owns a ceiling the bar eases towards but never reaches, so a slow stage keeps moving without claiming to be finished, and only the real work completes it. Give it a cancel handler whenever the operator can walk away, and it stays still under reduced motion.",
    foundOn: [
      { label: "Invoice import", route: "/customs" },
      { label: "Components", route: "/components?component=document-extraction-progress" },
    ],
    componentCode: `export function DocumentExtractionProgress({ title, stages, activeStageId, done, previewUrl, onCancel }) {
  const [stageElapsedMs, setStageElapsedMs] = useState(0)
  const percent = extractionProgressPercent({ stages, activeStageId, elapsedMs: stageElapsedMs, done })
  const finished = new Set(completedStageIds(stages, activeStageId, done))

  return (
    <Surface padding="none" aria-busy="true">
      <span className="page-preview">
        <img src={previewUrl} alt="" />
        <motion.span className="reading-sweep" animate={{ top: ["-30%", "100%"] }} />
      </span>
      <div>
        <h2>{title}</h2>
        <strong>{Math.floor(percent)}%</strong>
        <span className="bar"><span style={{ width: percent + "%" }} /></span>
        <ol>
          {stages.map((stage) => (
            <li key={stage.id} data-state={finished.has(stage.id) ? "done" : stage.id === activeStageId ? "active" : "waiting"}>
              {stage.label}
            </li>
          ))}
        </ol>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </Surface>
  )
}`,
    usageCode: `<DocumentExtractionProgress
  title="Preparing invoice lines"
  detail="This may take a moment. You can review every line before applying it."
  fileName="northwind-commercial-invoice.pdf"
  pageCount={3}
  previewUrl={firstPageImageUrl}
  stages={[
    { id: "reading", label: "Reading the document", ceiling: 24, expectedMs: 1400 },
    { id: "extracting", label: "Finding the item lines", ceiling: 88, expectedMs: 9000 },
    { id: "organising", label: "Preparing the review", ceiling: 99, expectedMs: 1200 },
  ]}
  activeStageId={stage}
  onCancel={cancelImport}
/>`,
  },
  {
    id: "document-evidence-viewer",
    name: "Document Evidence Viewer",
    category: "Operations",
    description: "A document beside the data taken from it, with a box over the place each value was read.",
    details: "Use wherever extracted values need to be trusted before they are accepted. Boxes are page fractions, so they stay aligned at any zoom, and an interpolated box such as one row of a table is drawn with a dashed edge to show it is approximate. Selecting a row elsewhere scrolls its box into view, and selecting a box reports back so the two panels stay in step.",
    foundOn: [
      { label: "Invoice import", route: "/customs" },
      { label: "Components", route: "/components?component=document-evidence-viewer" },
    ],
    componentCode: `export function DocumentEvidenceViewer({ pages, boxes, activeBoxId, onSelectBox, title }) {
  const [zoom, setZoom] = useState(1)
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeBoxId])

  return (
    <Surface padding="none">
      <header>{title}<ZoomControls zoom={zoom} onChange={setZoom} /></header>
      <div className="pages" style={{ width: zoom * 100 + "%" }}>
        {pages.map((page) => (
          <div key={page.page} style={{ aspectRatio: page.width + " / " + page.height }}>
            <img src={page.url} alt={"Page " + page.page} />
            {boxes.filter((box) => box.page === page.page).map((box) => (
              <button
                key={box.id}
                ref={box.id === activeBoxId ? activeRef : undefined}
                onClick={() => onSelectBox(box.id)}
                data-approximate={box.approximate}
                style={{ insetInlineStart: box.box.x * 100 + "%", top: box.box.y * 100 + "%" }}
              />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  )
}`,
    usageCode: `<DocumentEvidenceViewer
  pages={[{ page: 1, width: 800, height: 1130, url: pageImageUrl }]}
  boxes={[
    { id: "line-1", page: 1, box: { x: 0.07, y: 0.34, width: 0.86, height: 0.02 }, label: "Line 1" },
    { id: "line-2", page: 1, box: { x: 0.07, y: 0.37, width: 0.86, height: 0.02 }, label: "Line 2", approximate: true },
  ]}
  activeBoxId={activeLineId}
  onSelectBox={setActiveLineId}
  title="Your invoice"
  empty="The document preview is still being prepared."
/>`,
  },
  {
    id: "audit-timeline",
    name: "Audit Timeline",
    category: "Operations",
    description: "An operational history for completed events, the current review step, and upcoming workflow actions.",
    details: "Use where operators need to understand who changed what, when it happened, and what comes next.",
    foundOn: [{ label: "Quote audit", route: "/quotes" }, { label: "Components", route: "/components?component=audit-timeline" }],
    componentCode: `export function AuditTimeline({ events, title, description }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title={title} meta={description} />\n      {events.map((event) => <AuditTimelineRow key={event.id} event={event} />)}\n    </Surface>\n  )\n}`,
    usageCode: `<AuditTimeline\n  events={quoteAuditEvents}\n  title="Audit and workflow"\n  description="Quote changes and next actions."\n/>`,
  },
  {
    id: "audit-workspace",
    name: "Audit Workspace",
    category: "Operations",
    description: "A reusable audit workspace with a summary timeline, high-volume detailed table, row inspector, and shared time, person, and event filters.",
    details: "Use on quotes and other operational records when teams need a calm activity summary plus a sortable log where selecting a row reveals the exact field, actor, source, timestamp, and old and new values.",
    foundOn: [{ label: "Quote audit", route: "/quotes/Q-19158" }, { label: "Components", route: "/components?component=audit-workspace" }],
    componentCode: `export function AuditWorkspace({ records, defaultView = "summary" }) {\n  const [view, setView] = useState(defaultView)\n  const [filters, setFilters] = useState(emptyFilters)\n  const visibleRecords = filterAuditRecords(records, filters)\n\n  return (\n    <div>\n      <SegmentedControl options={["summary", "detailed"]} value={view} onChange={setView} />\n      <AuditFilters value={filters} onChange={setFilters} />\n      {view === "summary"\n        ? <AuditTimeline events={toSummaryEvents(visibleRecords)} />\n        : <DetailedAuditTable records={visibleRecords} onSelectRecord={openAuditInspector} />}\n    </div>\n  )\n}`,
    usageCode: `<AuditWorkspace\n  records={QUOTE_AUDIT_SAMPLE_DATA}\n  defaultView="summary"\n/>`,
  },
  {
    id: "dot-grid-loader",
    name: "Dot Grid Loader",
    category: "Feedback",
    description: "The product's one waiting state: twenty-five cells lit as a travelling square spiral.",
    details: "Use it for every wait long enough to need a mark — a route still downloading, a register still fetching rows, a panel still resolving a document list. One object across the whole product means a wait never looks like a different feature loading. It animates only opacity and transform, so it can sit inside the box the loaded content will occupy without moving anything around it, and it reserves its own size so rows arriving cannot shift the page. `size=\"sm\"` fits a 32px toolbar; `decorative` drops the status role where the surrounding block already announces the wait in words. Reduced-motion mode holds the centre cell lit instead of cycling.",
    foundOn: [{ label: "Every route", route: "/" }, { label: "CRM leads", route: "/crm/leads" }, { label: "CRM accounts", route: "/crm/accounts" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "CRM deals", route: "/crm/deals" }, { label: "Contact cards", route: "/crm/contact-cards" }, { label: "Bookings", route: "/bookings" }, { label: "Quotes", route: "/quotes" }, { label: "Warehouse inventory", route: "/warehouse/inventory" }, { label: "Components", route: "/components?component=dot-grid-loader" }],
    componentCode: `const spiralOrder = [
  0, 1, 2, 3, 4,
  15, 16, 17, 18, 5,
  14, 23, 24, 19, 6,
  13, 22, 21, 20, 7,
  12, 11, 10, 9, 8,
]

export const DotGridLoader = memo(function DotGridLoader({ label, size = "md", decorative = false }) {
  const { t } = useLanguage()
  const announced = label ? t(label) : undefined

  return (
    <div role={decorative ? undefined : "status"} aria-live={decorative ? undefined : "polite"} className="flex flex-col items-center gap-3.5">
      <div className="grid grid-cols-5 gap-[3px] text-[var(--md-accent)]" aria-hidden="true">
        {spiralOrder.map((order) => (
          <span key={order} className={cn("md-thinking-dot block rounded-full bg-current", dotSize[size])} style={{ animationDelay: \`\${order * 48 - 576}ms\` }} />
        ))}
      </div>
      {announced ? <p className="text-[13px] font-medium text-[var(--md-text)]">{announced}</p> : null}
    </div>
  )
})`,
    usageCode: `// A route still downloading
<DotGridLoader label="Loading…" />

// A register still fetching rows: the toolbar and the column
// header stay put, and only the table body carries the wait.
<DataTable rows={rows} emptyState={<DotGridLoaderPanel label="Loading warehouse records" minHeight={0} />} />

// Beside a block that already says "Loading facilities" in words
<StateBlock icon={<DotGridLoader decorative />} title="Loading facilities" detail="" />`,
  },
  {
    id: "register-toolbar",
    name: "Register Toolbar",
    category: "Operations",
    description: "View tabs on the left and right-aligned search, filters, options, and Columns above a register table.",
    details: "Every register puts one transparent control row on the page background above the rounded table surface. Only view tabs belong on the left. Search, filters, and secondary options stay on the right, with the icon-only Columns control fixed as the final option at the far logical edge. Facet options are built from the rows actually in hand, so a menu cannot offer a value that returns nothing, and an active trigger takes the accent colour. Search narrows loaded rows immediately and only asks the server once the operator stops typing. Controls share the tabs' corner radius; on narrow screens the right-side controls collapse into Controls while Columns remains the final standalone option.",
    foundOn: [{ label: "CRM accounts", route: "/crm/accounts" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "CRM deals", route: "/crm/deals" }, { label: "Warehouse inventory", route: "/warehouse/inventory" }, { label: "Facilities", route: "/warehouse/facilities" }, { label: "Items", route: "/warehouse/items" }, { label: "Goods in", route: "/warehouse/goods-in" }, { label: "Warehouse orders", route: "/warehouse/orders" }, { label: "Purchase orders", route: "/warehouse/purchase-orders" }, { label: "Components", route: "/components?component=register-toolbar" }],
    componentCode: `export function RegisterViewSwitch({ options, value, onChange, counts, ariaLabel }) {
  const { t } = useLanguage()

  return (
    <SegmentedControl
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className="p-[3px]"
      renderOption={(option) => (
        <>
          <span>{t(option)}</span>
          {counts?.[option] === undefined ? null : (
            <span data-i18n-skip dir="ltr" className="text-[10.5px] tabular-nums">{counts[option]}</span>
          )}
        </>
      )}
    />
  )
}`,
    usageCode: `<DataTable
  columns={columns}
  rows={filteredRows}
  getRowKey={(row) => row.id}
  toolbarTabs={(
    <RegisterViewSwitch options={views} value={view} onChange={setView} counts={counts} ariaLabel="Inventory view" />
  )}
  toolbarSearch={(
    <RegisterSearchField value={search} onChange={setSearch} onClear={clearSearch} label="Search warehouse records" placeholder="SKU, pallet, batch" />
  )}
  toolbarFilters={(
    <div className="flex items-center gap-1.5">
      <RegisterFacetSelect label="Condition" allLabel="All conditions" value={condition} options={conditionOptions} onChange={setCondition} />
      <RegisterFacetSelect label="Warehouse" allLabel="All warehouses" value={facilityId} options={facilityOptions} onChange={setFacilityId} />
    </div>
  )}
  toolbarOptions={(
    <RegisterRefreshButton pending={pending} onRefresh={refresh} />
  )}
/>`,
  },
  {
    id: "context-menu",
    name: "Context Menu",
    category: "Navigation",
    description: "The right-click menu for an item that has actions of its own.",
    details: "Use where an item can be acted on directly — a Drive folder or file, a row, a card — rather than adding a row of buttons to every tile. It shares the dropdown's surface, option rows, and motion, so a menu opened by pointer reads the same as one opened from a trigger: a 220ms blur-and-scale entry with the options following in a short cascade. Destructive items take the `destructive` variant. Reduced-motion mode drops the animation.",
    foundOn: [{ label: "Drive", route: "/crm/drive" }, { label: "Components", route: "/components?component=context-menu" }],
    componentCode: `export function ContextMenuContent({ className, collisionPadding = 12, ...props }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        collisionPadding={collisionPadding}
        className={cn("md-dropdown-content premium-stroke z-50 min-w-44 rounded-[var(--md-radius-xl)] p-1 shadow-[var(--md-shadow-lift)] backdrop-blur-xl", className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}`,
    usageCode: `<ContextMenu>
  <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => onOpen(file)}>
      <Eye strokeWidth={1.3} />
      Preview
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => onStartRename(file)}>
      <Pencil strokeWidth={1.3} />
      Rename
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem variant="destructive" onSelect={() => onDelete(file)}>
      <Trash2 strokeWidth={1.3} />
      Delete
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
  },
  {
    id: "multi-select-menu",
    name: "Multi-select Menu",
    category: "Navigation",
    description: "A compact checkbox menu for fields that can hold several choices without expanding the form.",
    details: "Use when choices can be combined, such as multimodal freight transport or warehouse access. Options may be plain translated strings or stable values with data-driven labels. It supports required, invalid, disabled, RTL, and translated states.",
    foundOn: [{ label: "Quote details", route: "/quotes" }, { label: "Company profiles", route: "/crm/accounts" }, { label: "Customer warehouse access", route: "/customers" }, { label: "Components", route: "/components?component=multi-select-menu" }],
    componentCode: `export function MultiSelectMenu({ value, options, onValueChange, placeholder }) {\n  const items = options.map((option) => typeof option === "string" ? { value: option, label: option } : option)\n  const selectedLabels = items.filter((option) => value.includes(option.value)).map((option) => option.label)\n  const toggle = (optionValue) => onValueChange(value.includes(optionValue) ? value.filter((item) => item !== optionValue) : [...value, optionValue])\n  return (\n    <DropdownMenu>\n      <DropdownMenuTrigger asChild><Button>{selectedLabels.length ? selectedLabels.join(" + ") : placeholder}</Button></DropdownMenuTrigger>\n      <DropdownMenuContent>{items.map((option) => <DropdownMenuCheckboxItem key={option.value} checked={value.includes(option.value)} onCheckedChange={() => toggle(option.value)}>{option.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>\n    </DropdownMenu>\n  )\n}`,
    usageCode: `<MultiSelectMenu\n  value={warehouseIds}\n  options={warehouses.map((warehouse) => ({\n    value: warehouse.id,\n    label: \`\${warehouse.code} · \${warehouse.name}\`,\n  }))}\n  onValueChange={setWarehouseIds}\n  placeholder="Select warehouses"\n  label="Warehouses"\n/>`,
  },
  {
    id: "inbox-thread-row",
    name: "Inbox Thread Row",
    category: "Operations",
    description: "One conversation in a mailbox list, with participants, subject, preview, unread state and a hover star.",
    details: "Use for any list of mail conversations. Pass the same `selectionLayoutId` to every row in one list so the selected surface travels between rows as a single shared element rather than two rows repainting. Unread state is carried by weight and a dot as well as the count, so it survives reduced motion and never depends on colour alone. Provider text is marked `data-i18n-skip` and `dir=\"auto\"`, so a customer's subject line is never machine-translated or reordered.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=inbox-thread-row" }],
    componentCode: `export function InboxThreadRow({ thread, selected, ownAddresses = [], selectionLayoutId, onSelect, onToggleStar }) {
  const shouldReduceMotion = useReducedMotion()
  const unread = thread.unreadCount > 0
  const participants = threadParticipantLabel(thread, ownAddresses)

  return (
    <div data-inbox-thread-row data-selected={selected || undefined} className="group relative isolate">
      {selected ? (
        <motion.span
          aria-hidden="true"
          layoutId={selectionLayoutId}
          transition={reduceMotion(shouldReduceMotion, mdMotion.spring)}
          className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-selected-bg)]"
        />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 group-hover:opacity-100" />
      )}
      <button type="button" aria-current={selected || undefined} onClick={onSelect}>
        {unread ? <span aria-hidden="true" className="size-[6px] rounded-full bg-[var(--md-accent)]" /> : null}
        <span data-i18n-skip dir="auto">{participants}</span>
        <span data-i18n-skip dir="ltr" className="tabular-nums">{formatThreadTimestamp(thread.lastMessageAt, language)}</span>
        <span data-i18n-skip dir="auto">{thread.subject}</span>
        <span data-i18n-skip dir="auto" className="line-clamp-2">{thread.preview}</span>
      </button>
      <button type="button" aria-pressed={thread.starred} onClick={onToggleStar}>
        <Star className={cn("size-3.5", thread.starred && "fill-current")} strokeWidth={1.4} />
      </button>
    </div>
  )
}`,
    usageCode: `{threads.map((item) => (
  <InboxThreadRow
    key={item.id}
    thread={item}
    selected={item.id === selectedThreadId}
    ownAddresses={ownAddresses}
    selectionLayoutId="inbox-thread-selection"
    onSelect={() => selectThread(item)}
    onToggleStar={() => void toggleStar(item)}
  />
))}`,
  },
  {
    id: "mailbox-provider-switch",
    name: "Mailbox Provider Switch",
    category: "Operations",
    description: "The provider toggle and mailbox picker for a connected mail workspace, with Shared and Group labels.",
    details: "Use to choose which mail account a workspace is reading. The provider toggle reuses the shared Segmented Control, and the Gmail and Outlook marks come from the local auth brand assets rather than a remote logo URL. Personal mailboxes are listed before shared and group ones, each labelled explicitly, because sending from the wrong address is the expensive mistake in an operations inbox. An expired connection surfaces its own Reconnect action instead of failing silently.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=mailbox-provider-switch" }],
    componentCode: `export function MailboxProviderSwitch({ providers, provider, onProviderChange, mailboxes, selectedMailboxId, onMailboxChange, onReconnect }) {
  const personal = mailboxes.filter((mailbox) => mailbox.kind === "personal")
  const shared = mailboxes.filter((mailbox) => mailbox.kind !== "personal")
  const needsReconnect = mailboxes.some((mailbox) => mailbox.status === "reauthorization_required")

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SegmentedControl
        options={providers}
        value={provider}
        onChange={onProviderChange}
        ariaLabel="Mail provider"
        renderOption={(option) => (
          <>
            <MailProviderMark provider={option} className="size-4" />
            <span className="truncate">{mailProviderLabels[option]}</span>
          </>
        )}
      />
      {needsReconnect ? <ReconnectNotice onReconnect={() => onReconnect(provider)} /> : null}
      {[{ label: "Personal", items: personal }, { label: "Shared mailboxes", items: shared }]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <MailboxGroup key={group.label} {...group} selectedMailboxId={selectedMailboxId} onMailboxChange={onMailboxChange} />
        ))}
    </div>
  )
}`,
    usageCode: `<MailboxProviderSwitch
  providers={["gmail", "outlook"]}
  provider={provider}
  onProviderChange={changeProvider}
  mailboxes={providerMailboxes}
  selectedMailboxId={mailboxId}
  onMailboxChange={changeMailbox}
  onReconnect={(target) => void reconnect(target)}
/>`,
  },
  {
    id: "email-delivery-status",
    name: "Email Delivery Status",
    category: "Operations",
    description: "A compact icon and label showing the strongest available evidence for an outbound email.",
    details: "Use beside a sent message. The trigger stays quiet while the popover separates provider-confirmed sent, delivered, replied, failed and bounced events from estimated opens. Open tracking never claims certainty: image blocking can hide an open and privacy proxies can load the image before a person reads the email.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=email-delivery-status" }],
    componentCode: `export function EmailDeliveryStatus({ delivery }) {
  const { language, t } = useLanguage()
  const presentation = presentationFor(delivery.status, t)
  const Icon = presentation.icon

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={presentation.label}>
          <Icon aria-hidden="true" />
          <span>{presentation.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <h2>{presentation.label}</h2>
        <p>{presentation.detail}</p>
        <DeliveryEventTimes delivery={delivery} language={language} />
        {delivery.openTrackingEnabled ? <OpenTrackingNotice /> : null}
      </PopoverContent>
    </Popover>
  )
}`,
    usageCode: `<EmailDeliveryStatus delivery={message.delivery} />`,
  },
  {
    id: "email-message-renderer",
    name: "Email Message Renderer",
    category: "Operations",
    description: "Renders one email body with theme-safe contrast and private inline images inside an isolated surface.",
    details: "Use for any provider email body. HTML is sanitised on the server and still treated as untrusted here: it never reaches `dangerouslySetInnerHTML`, it goes into a sandboxed iframe whose own Content Security Policy blocks scripts, frames, forms and every network request except HTTPS, data and authenticated private blob images. Sender-authored text and backgrounds retain readable contrast in light and dark appearance, while photos and logos keep their original colours. When there is no sanitised HTML the plain-text alternative is rendered directly. The frame is sized to its content, so the thread keeps one scroll axis.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=email-message-renderer" }],
    componentCode: `const sandboxPermissions = "allow-same-origin allow-popups allow-popups-to-escape-sandbox"

function contentPolicy() {
  return [
    "default-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
  ].join("; ")
}

export function EmailMessageRenderer({ sanitizedHtml, bodyText, inlineAttachments = [] }) {
  if (!sanitizedHtml) {
    return <div data-i18n-skip dir="auto" className="whitespace-pre-wrap">{bodyText}</div>
  }

  return (
    <div className="min-w-0">
      <iframe
        title="Message content"
        sandbox={sandboxPermissions}
        srcDoc={buildDocument({ html: replaceInlineImageSources(sanitizedHtml, inlineImageSources), theme, direction, language })}
        loading="eager"
        scrolling="no"
        style={{ height: frameHeight > 0 ? \`\${frameHeight}px\` : "72px" }}
      />
    </div>
  )
}`,
    usageCode: `<EmailMessageRenderer
  sanitizedHtml={message.sanitizedHtml}
  bodyText={message.bodyText}
  inlineAttachments={message.attachments}
/>`,
  },
  {
    id: "thread-summary",
    name: "Thread Summary",
    category: "Agent Dexter",
    description: "Dexter's opt-in read of an email thread, with pending, ready, out-of-date and failed states and links back to the messages it used.",
    details: "Use above a message trail after the operator presses the Dexter Summarise action. The surface does not mount and no model request runs when a conversation merely opens. Pending, ready, out-of-date and failed states share the full Dexter shader with a dark readability scrim. Every claim the API gives message ids for links back to that message, and the footnote keeps the summary attributed rather than authoritative.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=thread-summary" }],
    componentCode: `export function ThreadSummary({ summary, sources = [], onRegenerate, onOpenSource }) {
  const pending = summary.status === "pending"

  if (summary.status === "none") return null
  if (summary.status === "failed") return <SummaryFailed error={summary.error} onRegenerate={onRegenerate} />

  return (
    <SummaryShell tone={summary.status === "stale" ? "warning" : "default"}>
      <SpectralBloomShader shape="composer" />
      <SummaryScrim />
      <SummaryHeader status={summary.status} onRegenerate={onRegenerate} busy={pending} />
      {/* One reserved block for both states, so arrival changes the words and not the height. */}
      <div className="relative mt-2 min-h-[3.75rem]">
        <AnimatePresence initial={false} mode="wait">
          {pending ? <PendingLines key="pending" /> : (
            <motion.div key="ready" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={mdMotion.enter}>
              <p data-i18n-skip dir="auto" className="text-pretty">{summary.text}</p>
              <SourceLinks sources={sources} onOpenSource={onOpenSource} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SummaryShell>
  )
}`,
    usageCode: `{summaryVisible ? (
  <ThreadSummary
    summary={thread.summary}
    sources={summarySources}
    onRegenerate={() => void requestSummary(thread.id)}
    onOpenSource={focusMessage}
  />
) : (
  <DexterActionPill label="Summarise" onClick={openSummary} />
)}`,
  },
  {
    id: "mail-composer",
    name: "Mail Composer",
    category: "Operations",
    description: "The docked composer for a new message, draft, reply, reply all or forward, with Dexter wording, Save draft and an expand mode.",
    details: "Use wherever an operator answers mail. Compose with Dexter, Draft with Dexter and Reply with Dexter all prepare editable wording in place using Luna's low-thinking lane, the verified thread and the operator's enabled email-writing profile; they never send or save. For every response mode the browser reports only what was typed or changed by hand: it never computes the final recipient list, because the server reads the source message and resolves who receives a Reply all, so a thread that moved on in another tab cannot drop somebody quietly. Height animates between two explicit values, so reopening mid-close retargets without a jump, and inputs stay at 16px on mobile so iOS does not zoom the page.",
    foundOn: [{ label: "Inbox", route: "/inbox" }, { label: "Components", route: "/components?component=mail-composer" }],
    componentCode: `export function MailComposer({ state, onStateChange, mailbox, status, error, canSend, onSend, onSaveDraft, onDiscard, onComposeWithDexter, dexterAction, dexterStatus }) {
  const readOnly = mailbox ? !mailbox.outboundEnabled : true
  const expanded = state.presentation === "expanded"
  const open = state.presentation !== "docked"

  if (!open) return <ComposerTrigger readOnly={readOnly} onOpen={() => onStateChange({ ...state, presentation: "open" })} />

  return (
    <motion.section
      aria-label={composerModeLabels[state.mode]}
      // Height animates between two explicit values rather than an auto
      // measurement, so reopening mid-close retargets without a jump.
      animate={{ height: expanded ? "min(78vh, 640px)" : "min(48vh, 340px)" }}
      initial={false}
      transition={reduceMotion(shouldReduceMotion, mdMotion.panel)}
    >
      <ComposerHeader mode={state.mode} mailbox={mailbox} expanded={expanded} onChange={onStateChange}>
        <DexterActionPill
          label={dexterStatus === "drafting" ? "Dexter is drafting" : dexterAction === "reply" ? "Reply with Dexter" : dexterAction === "draft" ? "Draft with Dexter" : "Compose with Dexter"}
          className="md-inbox-summarise h-9 min-w-[154px] rounded-full px-3 text-[12.5px]"
          disabled={readOnly || dexterStatus === "drafting"}
          onClick={onComposeWithDexter}
        />
      </ComposerHeader>
      <ComposerFields state={state} onChange={onStateChange} readOnly={readOnly} />
      <footer>
        <Button disabled={!canSend || readOnly} onClick={onSend}>Send</Button>
        <Button variant="ghost" onClick={onSaveDraft}>Save draft</Button>
        <Button variant="ghost" onClick={onDiscard}>Discard</Button>
      </footer>
    </motion.section>
  )
}`,
    usageCode: `<MailComposer
  state={composer}
  onStateChange={setComposer}
  mailbox={activeMailbox}
  status={composerStatus}
  error={composerError}
  offlineDraftRestored={draftRestored}
  canSend={canSendComposer}
  onSend={() => void sendComposer()}
  onSaveDraft={() => void saveComposerDraft()}
  onDiscard={discardComposer}
  onComposeWithDexter={() => void composeWithDexter()}
  dexterAction={composer.mode.startsWith("reply") ? "reply" : remoteDraftId ? "draft" : "compose"}
  dexterStatus={dexterComposerStatus}
/>`,
  },
  {
    id: "segmented-control",
    name: "Segmented Control",
    category: "Navigation",
    description: "A compact mode switch with one spring-animated selection pill for two to four exclusive choices.",
    details: "Use for short mutually exclusive view modes. The selected pill preserves spatial continuity, respects reduced motion, and stays visually identical across settings, dashboards, registers, and workflows.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Bookings", route: "/bookings" }, { label: "Rates & contracts", route: "/rates" }, { label: "Inbox", route: "/inbox" }, { label: "Purchase orders", route: "/warehouse/purchase-orders" }, { label: "Standalone declarations", route: "/customs/standalone/export/new" }, { label: "Components", route: "/components" }],
    componentCode: `export function SegmentedControl({ options, value, onChange }) {\n  const controlId = useId()\n  const shouldReduceMotion = useReducedMotion()\n\n  return (\n    <div role="group" className="relative isolate inline-flex rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1">\n      {options.map((option) => (\n        <button key={option} aria-pressed={value === option} onClick={() => onChange(option)}>\n          {value === option ? (\n            <motion.span layoutId={controlId + "-active"} transition={reduceMotion(shouldReduceMotion, mdMotion.spring)} />\n          ) : null}\n          {option}\n        </button>\n      ))}\n    </div>\n  )\n}`,
    usageCode: `<SegmentedControl\n  options={["Table", "Board"]}\n  value={viewMode}\n  onChange={setViewMode}\n/>`,
  },
  {
    id: "choice-control",
    name: "Choice Control",
    category: "Navigation",
    description: "The common exclusive-choice control: switch for booleans, spring pill for two to four choices, and dropdown for five or more.",
    details: "Use instead of creating page-local toggles or segmented buttons. It keeps interaction predictable while choosing the right amount of visual space for the number of options.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Settings", route: "/settings" }, { label: "Overview", route: "/" }, { label: "Components", route: "/components?component=choice-control" }],
    componentCode: `export function ChoiceControl(props) {\n  if ("checked" in props) return <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />\n  if (props.options.length <= 4) return <SegmentedControl {...props} />\n  return (\n    <Select value={props.value} onValueChange={props.onChange}>\n      <SelectTrigger><SelectValue /></SelectTrigger>\n      <SelectContent>{props.options.map((option) => <SelectItem value={option.value}>{option.label}</SelectItem>)}</SelectContent>\n    </Select>\n  )\n}`,
    usageCode: `<ChoiceControl\n  options={["Table", "Board"]}\n  value={viewMode}\n  onChange={setViewMode}\n  ariaLabel="Booking view"\n/>\n\n<ChoiceControl\n  options={transportModes}\n  value={mode}\n  onChange={setMode}\n  ariaLabel="Transport mode"\n/>`,
  },
  {
    id: "checkbox",
    name: "Checkbox",
    category: "Navigation",
    description: "The common independent multi-select control for rows, permissions, overrides, and checklist choices.",
    details: "Use when choices can be combined independently. Do not substitute a switch or segmented pill for multi-select behaviour.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Booking wizard", route: "/bookings/new" }, { label: "Settings", route: "/settings" }, { label: "Domestic road booking", route: "/bookings/new/domestic-road" }, { label: "Components", route: "/components?component=checkbox" }],
    componentCode: `export function Checkbox(props) {\n  return (\n    <CheckboxPrimitive.Root {...props} className="grid size-5 place-items-center rounded-[var(--md-radius-sm)] data-[state=checked]:bg-[var(--md-accent)]">\n      <CheckboxPrimitive.Indicator><Check /></CheckboxPrimitive.Indicator>\n    </CheckboxPrimitive.Root>\n  )\n}`,
    usageCode: `<label className="flex items-center gap-2">\n  <Checkbox checked={selected} onCheckedChange={(checked) => setSelected(checked === true)} />\n  Include customs documents\n</label>`,
  },
  {
    id: "filter-chips",
    name: "Filter Chips",
    category: "Navigation",
    description: "A reusable filter chip row with a strong selected state, optional secondary filters, and an icon-only tooltip mode.",
    details: "Use at the top of list, table, and map workflows. The active filter should be unmistakable on mobile and desktop; use icon-only chips with tooltips where labels would otherwise make a compact filter too dense.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "Bookings", route: "/bookings" }, { label: "Warehouse", route: "/warehouse" }, { label: "Components", route: "/components" }],
    componentCode: `export function FilterChips({ options, activeOption, onChange, auxiliaryOptions = [] }) {\n  return (\n    <div className="flex flex-wrap items-center gap-2">\n      {options.map((option) => (\n        <button\n          key={option}\n          aria-pressed={activeOption === option}\n          className={cn("rounded-full px-4", activeOption === option && "bg-[var(--md-accent)] text-white")}\n          onClick={() => onChange(option)}\n        >\n          {activeOption === option ? <Check /> : null}\n          {option}\n        </button>\n      ))}\n      {auxiliaryOptions.map((option) => <button key={option}>{option}</button>)}\n    </div>\n  )\n}`,
    usageCode: `<FilterChips\n  options={bookingFilters}\n  activeOption={activeFilter}\n  onChange={setActiveFilter}\n  auxiliaryOptions={["+ Mode", "+ Carrier", "+ Customer", "+ Owner", "+ ETA range"]}\n/>`,
  },
  {
    id: "data-table",
    name: "Data Table",
    category: "Data",
    description: "The canonical Multideck table with persisted layout, right-click row selection, and field-aware CSV export.",
    details: "Declare each column's data kind so alignment and status treatments stay consistent. Right-click any row and choose Select to reveal the sticky checkbox column; operators can select several rows, then use the CSV action to choose displayed columns or expand hairline record sections for hidden fields. Register endpoints stay lean: pass exportConfig.loadRecords when full detail such as lead contacts, account addresses, or Customs parties should be loaded only after export is requested. Existing row actions such as Duplicate or Delete belong in rowContextActions so they share the same animated menu.",
    foundOn: [{ label: "Quotes", route: "/quotes" }, { label: "Customers", route: "/customers" }, { label: "CRM leads", route: "/crm/leads" }, { label: "CRM accounts", route: "/crm/accounts" }, { label: "CRM contacts", route: "/crm/contacts" }, { label: "Bookings", route: "/bookings" }, { label: "Customs declarations", route: "/customs/standalone/export" }, { label: "Rates & contracts", route: "/rates" }, { label: "Reports", route: "/reports" }, { label: "Scheduled reports", route: "/reports/scheduled" }, { label: "Users", route: "/admin/users" }, { label: "Active log", route: "/admin/activity" }, { label: "Detailed log", route: "/admin/detailed-log" }, { label: "Broadcast history", route: "/admin/broadcast" }, { label: "Facilities", route: "/warehouse/facilities" }, { label: "Locations", route: "/warehouse/locations" }, { label: "Items", route: "/warehouse/items" }, { label: "Purchase orders", route: "/warehouse/purchase-orders" }, { label: "Components", route: "/components?component=data-table" }],
    componentCode: `export function DataTable({ columns, rows, getRowKey, exportConfig, rowContextActions }) {\n  const [selectionMode, setSelectionMode] = useState(false)\n  const [selectedRowKeys, setSelectedRowKeys] = useState(new Set())\n\n  return (\n    <section>\n      <TableToolbar selection={selectionMode ? <SelectionExportActions selectedRowKeys={selectedRowKeys} /> : null} columnsLast />\n      <TableSurface>\n        <Table>{/* sticky selection column, semantic cells, persisted layout */}</Table>\n      </TableSurface>\n      <TableCsvExportDialog config={exportConfig} />\n      <AnimatedRowContextMenu actions={rowContextActions} onSelect={() => setSelectionMode(true)} />\n    </section>\n  )\n}`,
    usageCode: `<DataTable\n  ariaLabel="CRM leads"\n  columns={leadColumns}\n  rows={leads}\n  getRowKey={(lead) => lead.id}\n  storageKey="crm-leads"\n  exportConfig={{\n    fileName: "crm-leads",\n    recordCategory: "Lead details",\n    loadRecords: (selected) => Promise.all(selected.map((lead) => getLead(lead.id))),\n  }}\n  onRowClick={openLead}\n/>`,
  },
  {
    id: "unified-quote-charges-workspace",
    name: "Unified Quote Charges Workspace",
    category: "Operations",
    description: "One configurable quote-charges table for supplier cost, customer sell, both currencies, both exchange rates, base values, and profit.",
    details: "Use when pricing a quote. Operators can search suppliers and customers by code or name, switch currencies with correct symbols and decimal precision, see base conversions immediately, customise columns, and use freight calculators without leaving the selected charge line.",
    foundOn: [{ label: "Quote charges", route: "/quotes/Q-19158" }, { label: "Components", route: "/components?component=unified-quote-charges-workspace" }],
    componentCode: `export function UnifiedQuoteChargesWorkspace({ rows, onRowsChange, currencies, parties, exchangeRates, baseCurrency }) {\n  const resolvedRows = rows.map((row) => resolveChargeRow(row, exchangeRates, baseCurrency))\n\n  return (\n    <div>\n      <DataTable\n        columns={quoteChargeColumns}\n        rows={resolvedRows}\n        storageKey="unified-quote-charges"\n        selectedRowKey={selectedRowId}\n        onRowClick={(row) => setSelectedRowId(row.id)}\n      />\n      <div className="selected-line-layout">\n        <SelectedChargeDetails row={selectedRow} />\n        <ChargeCalculator />\n      </div>\n    </div>\n  )\n}`,
    usageCode: `<UnifiedQuoteChargesWorkspace\n  rows={chargeRows}\n  onRowsChange={setChargeRows}\n  currencies={currenciesFromSysCurrency}\n  parties={customersAndSuppliers}\n  exchangeRates={jobExchangeRates}\n  baseCurrency="GBP"\n/>`,
  },
  {
    id: "quote-search-builder",
    name: "Quote Filter Panel",
    category: "Operations",
    description: "The advanced quote filter, opened as a compact panel beside the toolbar button, with condition groups, field operators and saved filters.",
    details: "Open it from the table toolbar to combine commercial, route, ownership, timing and workflow conditions. Each group matches all or any of its conditions, the footer shows how many quotes the draft would return, and a named filter can be saved and picked again from the panel header.",
    foundOn: [{ label: "Quotes", route: "/quotes" }, { label: "Components", route: "/components?component=quote-search-builder" }],
    componentCode: `<AdvancedFilterPopover\n  fields={quoteSearchFieldOptions}\n  value={search}\n  onChange={setSearch}\n  storageKey="quote-register"\n  label="Advanced search"\n  title="Advanced quote search"\n  itemLabel="quotes"\n  countMatches={countDraftMatches}\n  totalCount={quotes.length}\n/>`,
    usageCode: `const [search, setSearch] = useState(createEmptyQuoteSearch)\nconst visibleQuotes = quotes.filter((quote) => quoteMatchesSearch(quote, search))\n\n<DataTable\n  columns={columns}\n  rows={visibleQuotes}\n  toolbarFilters={<AdvancedFilterPopover fields={quoteSearchFieldOptions} value={search} onChange={setSearch} storageKey="quote-register" />}\n/>`,
  },
  {
    id: "warehouse-table",
    name: "Warehouse Table",
    category: "Data",
    description: "A clean warehouse table pattern for products, stock rows, orders, and goods movements.",
    details: "Use for inventory-style records that need a white table surface, light grey header, subtle column lines, status chips, code-safe IDs, staggered row reveal, row-click product and order detail popovers, an Orders tab table, and product-code stock rows that select into a top summary with a focused locations table filtered by customer, product, and batch.",
    foundOn: [{ label: "Warehouse", route: "/warehouse" }, { label: "Components", route: "/components?component=warehouse-table" }],
    componentCode: `export function WarehouseInventoryTable({ rows, columns, renderRowDetail }) {\n  const [openRowId, setOpenRowId] = useState(null)\n\n  return (\n    <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">\n      <Table>\n        <TableHeader>{/* calm column headers */}</TableHeader>\n        <motion.tbody variants={tableBodyReveal} initial="hidden" animate="show">\n          {rows.map((row) => (\n            <Popover key={row.id} open={openRowId === row.id} onOpenChange={(open) => setOpenRowId(open ? row.id : null)}>\n              <PopoverAnchor asChild>\n                <motion.tr variants={rowReveal} onClick={() => setOpenRowId((current) => current === row.id ? null : row.id)}>\n                  {columns.map((column) => <TableCell key={column.key}>{column.render(row)}</TableCell>)}\n                </motion.tr>\n              </PopoverAnchor>\n              <PopoverContent>{renderRowDetail?.(row)}</PopoverContent>\n            </Popover>\n          ))}\n        </motion.tbody>\n      </Table>\n    </div>\n  )\n}`,
    usageCode: `<WarehouseProductsTable rows={warehouseProducts} />\n<WarehouseOrdersTable rows={warehouseOrders} />\n<WarehouseStockTable rows={warehouseStockRows} />\n\n// Product and order rows open a compact detail popover.\n// Stock rows select into a top summary and focused location table.`,
  },
  {
    id: "warehouse-form-field",
    name: "Warehouse Form Field",
    category: "Operations",
    description: "A calm, reusable labelled field wrapper for warehouse forms: label, optional required marker, the control, and a single hint-or-error line.",
    details: "Use inside the Facilities and Items create/edit dialogs and any warehouse form. It keeps every field aligned and shows FluentValidation messages from the API next to the right input. Localised automatically and direction-safe, so codes such as SKU, HS code, and country codes stay readable in right-to-left mode.",
    foundOn: [{ label: "Warehouse", route: "/warehouse" }, { label: "Components", route: "/components?component=warehouse-form-field" }],
    componentCode: `export function WarehouseFormField({ label, htmlFor, hint, error, required, className, children }) {\n  return (\n    <div className={cn("grid gap-1.5", className)}>\n      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-medium text-[var(--md-ink)]">\n        {label}\n        {required ? <span className="text-[var(--md-red)]" aria-hidden="true">*</span> : null}\n      </label>\n      {children}\n      {error ? (\n        <p className="flex items-center gap-1 text-[11.5px] text-[var(--md-red)]">\n          <AlertCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />\n          {error}\n        </p>\n      ) : hint ? (\n        <p className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{hint}</p>\n      ) : null}\n    </div>\n  )\n}`,
    usageCode: `<WarehouseFormField label="Facility code" htmlFor="facility-code" required hint="A short unique code, e.g. FXT-DC1." error={firstFieldError(errors, "Code")}>\n  <Input id="facility-code" dir="ltr" value={form.code} onChange={(event) => update("code", event.target.value)} className={fieldControlClass} />\n</WarehouseFormField>`,
  },
  {
    id: "warehouse-quantity-uom-field",
    name: "Warehouse Quantity & UOM Field",
    category: "Operations",
    description: "A quantity input that keeps the product's count, weight, or volume unit visible at the point of entry.",
    details: "Use for receipts, partial moves, sampling, damage, quarantine, and adjustments. The unit is fixed from the stock balance so an operator cannot accidentally post kilograms as litres or count units.",
    foundOn: [{ label: "Warehouse inventory", route: "/warehouse/inventory" }, { label: "Components", route: "/components?component=warehouse-quantity-uom-field" }],
    componentCode: `export function WarehouseQuantityUomField({ value, onChange, uomCode, max, label }) {
  return <WarehouseFormField label={label} required>
    <div className="quantity-uom-grid">
      <Input type="number" value={value} max={max} onChange={(event) => onChange(event.target.value)} />
      <span dir="ltr">{uomCode}</span>
    </div>
  </WarehouseFormField>
}`,
    usageCode: `<WarehouseQuantityUomField
  label="Quantity to sample"
  value={quantity}
  onChange={setQuantity}
  uomCode={balance.uomCode}
  max={balance.onHandQuantity}
/>`,
  },
  {
    id: "purchase-order-line-editor",
    name: "Purchase Order Line Editor",
    category: "Operations",
    description: "A structured line editor for entered or document-extracted purchase-order goods, with item matching, quantities, UOM, price, tax and delivery date.",
    details: "Use when an operator creates or reviews a purchase order. Item options arrive as a bounded server-search page for the selected warehouse and stock owner, so very large catalogues stay fast. Extracted supplier text remains editable and issuing stays blocked while any line is unmatched.",
    foundOn: [{ label: "New purchase order", route: "/warehouse/purchase-orders/new" }, { label: "Purchase order detail", route: "/warehouse/purchase-orders/d0c00000-0000-4000-8000-000000000001" }, { label: "Components", route: "/components?component=purchase-order-line-editor" }],
    componentCode: `export function PurchaseOrderLineEditor({ lines, items, facilityId, customerOrgId, itemLoading, itemsHaveMore, onItemSearch, onItemSelected, disabled, onChange }) {
  return lines.map((line, index) => (
    <PurchaseOrderLine
      key={line.id ?? index}
      line={line}
      items={items}
      loading={itemLoading}
      hasMore={itemsHaveMore}
      onSearch={onItemSearch}
      onItemSelected={onItemSelected}
      disabled={disabled}
      onChange={(changes) => onChange(lines.map((item, lineIndex) => lineIndex === index ? { ...item, ...changes } : item))}
    />
  ))
}`,
    usageCode: `<PurchaseOrderLineEditor
  lines={form.lines}
  items={itemPage.rows}
  facilityId={form.facilityId}
  customerOrgId={form.customerOrgId}
  itemLoading={itemPage.loading}
  itemsHaveMore={itemPage.hasMore}
  onItemSearch={setItemSearch}
  onItemSelected={rememberItem}
  onChange={(lines) => setForm((current) => ({ ...current, lines }))}
/>`,
  },
  {
    id: "warehouse-object-summary",
    name: "Warehouse Object Summary",
    category: "Operations",
    description: "A compact identity and contents summary for pallets, IBCs, cartons, drums, totes, and labelled loose stock.",
    details: "Use wherever an operator chooses, moves, or consolidates a warehouse object. It keeps the label, lifecycle state, stock-line count, and physical location together.",
    foundOn: [{ label: "Warehouse objects", route: "/warehouse/inventory" }, { label: "Components", route: "/components?component=warehouse-object-summary" }],
    componentCode: `export function WarehouseObjectSummary({ unit }) {
  return <div>
    <div>{unit.code}<StatusPill>{unit.lifecycleStatusCode}</StatusPill></div>
    <p>{unit.typeName} · {unit.contents.length} stock lines</p>
    <p>{unit.locationCode ?? "No physical location"}</p>
  </div>
}`,
    usageCode: `<WarehouseObjectSummary unit={selectedPallet} />`,
  },
  {
    id: "warehouse-exception-summary",
    name: "Warehouse Exception Summary",
    category: "Operations",
    description: "A compact investigation summary for empty bins, location overrides, damage, shortages, and sampling events.",
    details: "Use before resolving an inventory exception or approving a loss. It keeps the issue, workflow state, and expected physical location visible while the operator decides what happened.",
    foundOn: [{ label: "Warehouse exceptions", route: "/warehouse/inventory" }, { label: "Components", route: "/components?component=warehouse-exception-summary" }],
    componentCode: `export function WarehouseExceptionSummary({ exception }) {
  return <div>
    <div>{exception.title}<StatusPill>{exception.statusCode}</StatusPill></div>
    <p>{exception.description ?? exception.typeCode}</p>
    <p>Expected: {exception.expectedLocationCode}</p>
  </div>
}`,
    usageCode: `<WarehouseExceptionSummary exception={selectedException} />`,
  },
  {
    id: "warehouse-kanban-board",
    name: "Warehouse Kanban Board",
    category: "Operations",
    description: "A sortable warehouse board for goods in and goods out lanes.",
    details: "Use when warehouse work needs to be moved above or below other cards in real time. Cards lift, tilt from the pickup point, snap into place, and keep the same calm status-colour language as the rest of Warehouse.",
    foundOn: [{ label: "Warehouse goods in/out", route: "/warehouse" }, { label: "Components", route: "/components?component=warehouse-kanban-board" }],
    componentCode: `export function SortableWarehouseKanbanBoard({ columnsSource }) {\n  const [columns, setColumns] = useState(() => createKanbanColumns(columnsSource))\n  const kanban = useKanbanPointerDrag({\n    columns: columns.map((column) => ({ id: column.id, tasks: column.cards })),\n    getId: (card) => card.id,\n    onCommit: ({ columns: next }) => setColumns((current) => current.map((column) => ({\n      ...column,\n      cards: next.find((candidate) => candidate.id === column.id)?.tasks ?? column.cards,\n    }))),\n  })\n\n  return <KanbanColumns ref={kanban.boardRef} columns={kanban.previewColumns} drag={kanban} />\n}`,
    usageCode: `<SortableWarehouseKanbanBoard\n  ariaLabel="Goods in Kanban board"\n  boardId="goods-in"\n  columnsSource={warehouseGoodsInKanbanColumns}\n  gridClassName="xl:grid-cols-4"\n/>\n\n<SortableWarehouseKanbanBoard\n  ariaLabel="Goods out Kanban board"\n  boardId="goods-out"\n  columnsSource={warehouseGoodsOutKanbanColumns}\n  gridClassName="xl:grid-cols-4"\n/>`,
  },
  {
    id: "geo-panel",
    name: "Geo Panel",
    category: "Operations",
    description: "A geographic panel for showing regional footprint, pinned records, and related list context.",
    details: "Use when location matters to sales or operations. Pins should open the linked record and the side list should stay scan-friendly.",
    foundOn: [{ label: "Customers", route: "/customers" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Components", route: "/components" }],
    componentCode: `export function CustomerFootprintMap({ customers, onOpenCustomer }) {\n  return (\n    <Surface padding="none">\n      <div className="relative bg-[var(--md-bg-strong)]">\n        {mapPins.map((pin) => (\n          <button style={{ left: pin.left, top: pin.top }} onClick={() => onOpenCustomer(pin.customer)}>\n            {pin.initials}\n          </button>\n        ))}\n      </div>\n      {customers.map((customer) => <CustomerCard customer={customer} onOpen={() => onOpenCustomer(customer)} />)}\n    </Surface>\n  )\n}`,
    usageCode: `<CustomerFootprintMap\n  customers={paginatedCustomers}\n  onOpenCustomer={openCustomer}\n/>`,
  },
  {
    id: "record-header",
    name: "Record Header",
    category: "Operations",
    description: "A calm record header for identity, status, key metadata, and ownership.",
    details: "Use at the top of detail records. It should create context without becoming a marketing hero.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `export function CustomerDetailHero() {\n  return (\n    <section className="flex items-center gap-5">\n      <CustomerAvatar initials="MA" tone="olive" size="lg" />\n      <div>\n        <h1>Marlow Apparel Ltd</h1>\n        <StatusPill tone="teal">Premium</StatusPill>\n        <StatusPill tone="green">Active</StatusPill>\n        <StatusPill tone="amber">1 open exception</StatusPill>\n      </div>\n    </section>\n  )\n}`,
    usageCode: `<CustomerDetailHero />\n<CustomerMetricsGrid />`,
  },
  {
    id: "tabs",
    name: "Tabs",
    category: "Navigation",
    description: "A reusable horizontal tab rail for switching sections inside one record or workflow.",
    details: "Use when the user should stay in context while moving between overview, contacts, bookings, documents, activity, or notes.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Account detail", route: "/crm/accounts/de1000c1-5eed-4ead-8000-000000000001" }, { label: "Booking detail", route: "/bookings/md-22455" }, { label: "Warehouse", route: "/warehouse" }, { label: "Standalone declarations", route: "/customs/standalone/export/new" }, { label: "Components", route: "/components" }],
    componentCode: `export function TabsRail({ tabs, activeTab, onChange }) {\n  return (\n    <div className="flex gap-6 overflow-x-auto border-b border-[rgba(11,20,19,0.08)]">\n      {tabs.map((tab) => (\n        <button key={tab.label} onClick={() => onChange(tab.label)}>\n          {tab.label}\n          {tab.value ? <span>{tab.value}</span> : null}\n        </button>\n      ))}\n    </div>\n  )\n}`,
    usageCode: `<TabsRail\n  tabs={tabs}\n  activeTab={activeTab}\n  onChange={setActiveTab}\n/>`,
  },
  {
    id: "active-bookings-panel",
    name: "Active Bookings Panel",
    category: "Operations",
    description: "The customer detail booking panel for active routes, mode, ETA, exceptions, and progress.",
    details: "Use in account detail views where operators need the customer-specific booking queue without leaving the record.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `export function ActiveBookingsPanel() {\n  return (\n    <Surface padding="none">\n      <CustomerPanelHeader title="Active bookings" meta="6 · 1 exception" />\n      {marlowActiveBookings.map((booking) => (\n        <ActiveBookingRow key={booking.id} booking={booking} />\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<ActiveBookingsPanel />`,
  },
  {
    id: "your-jobs-panel",
    name: "Your Jobs Panel",
    category: "Operations",
    description: "A focused operator row for the bookings someone is actively working today, with favourite stars kept close to each job.",
    details: "Use near the top of dashboard or booking views when the user needs their own live work separated from the full company-wide booking list.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Bookings", route: "/bookings" }, { label: "Components", route: "/components" }],
    componentCode: `export function YourJobsPanel({ favouriteIds, onToggleFavourite, onOpenJobDrilldown }) {\n  return (\n    <Surface padding="none">\n      <header>\n        <h2>Your jobs</h2>\n        <StatusPill tone="teal">5 active</StatusPill>\n      </header>\n      <AnimatedList\n        items={operatorJobs}\n        maxHeight="none"\n        itemClassName="bg-[color-mix(in_srgb,var(--md-green)_17%,white)]"\n        renderItem={(job) => (\n          <button onClick={() => onOpenJobDrilldown(job.id)}>\n            <span>{job.task}</span>\n            <span>{job.customer}</span>\n            <button onClick={() => onToggleFavourite(job.bookingId)}>Star</button>\n          </button>\n        )}\n      />\n    </Surface>\n  )\n}`,
    usageCode: `<YourJobsPanel\n  favouriteIds={favouriteIds}\n  onToggleFavourite={toggleFavourite}\n  onOpenJobDrilldown={openDashboardDrilldown}\n  animated\n/>`,
  },
  {
    id: "priority-queue",
    name: "Priority Queue",
    category: "Operations",
    description: "Everything waiting on an operator, from any register, in one list ranked by real deadline and grouped by how much time is left.",
    details: "Use as the lead panel of a work surface. It replaces the pattern of running separate 'my tasks', 'exceptions' and 'record list' panels over the same records: each row carries the reference, the ask, the customer and lane, and the deadline it is actually measured against. The leading rule is the only urgency device on a row \u2014 do not add per-row gauges beside it. Keep the compact row actions visible; the shader icon hands the task to Dexter for review, clearing strikes and collapses with an undo toast, and the arrow opens the source record.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components?component=priority-queue" }],
    componentCode: `export function DashboardPriorityQueue({ items, operatorName, onOpenItem, onHandOverToDexter }) {\n  const groups = groupByBucket(items)\n\n  return (\n    <Surface padding="none" className="md-queue-panel">\n      <div className="md-queue-panel-head">\n        <h2 className="md-panel-title">Needs you now</h2>\n        <SegmentedControl options={["mine", "all"]} value={scope} onChange={setScope} />\n      </div>\n      <div className="md-queue-panel-body">\n        {groups.map((group) => (\n          <div key={group.bucket} className="md-queue-group" data-bucket={group.bucket}>\n            <p className="md-queue-group-label">{group.label}<span>{group.items.length}</span></p>\n            {group.items.map((item) => (\n              <QueueRow\n                key={item.id}\n                item={item}\n                onOpen={() => onOpenItem(item)}\n                onHandOver={() => onHandOverToDexter(item)}\n              />\n            ))}\n          </div>\n        ))}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `const items = dashboardPriorityQueue(bookings, quotes)\n\n<DashboardPriorityQueue\n  items={items}\n  operatorName={operatorName}\n  onOpenItem={(item) =>\n    navigate(item.bookingId ? getBookingDetailPath(item.bookingId) : \`/quotes/\${item.quoteReference}\`)\n  }\n  onHandOverToDexter={(item) => {\n    rememberDexterTaskHandoff(buildTaskPrompt(item))\n    navigate("/agent-dexter")\n  }}\n/>`,
  },
  {
    id: "performance-panel",
    name: "Performance Panel",
    category: "Data",
    description: "One large trend plot with a head that names the metric being drawn, driven by the KPI row above it.",
    details: "Use where a screen needs a single dominant chart rather than several small ones. Pair it with a `KpiStrip` that has `spark` off and a `markerId` set: the strip becomes the chart's control and the travelling rule under the selected card is the only thing that has to say so. Two drawings of one series \u2014 a sparkline in the tile and the same curve full size \u2014 is one drawing too many.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components?component=performance-panel" }],
    componentCode: `export function DashboardPerformancePanel({ kpis, trends, metricLabel }) {\n  const metric = kpis.find((item) => item.label === metricLabel) ?? kpis[0]\n  const points = (trends[metric.label] ?? []).map((point) => ({ label: point.period, value: point.value, target: point.target }))\n\n  return (\n    <Surface padding="none" className="md-performance-panel">\n      <div className="md-performance-head">\n        <div>\n          <p className="md-panel-eyebrow">Trend</p>\n          <h2 className="md-performance-title">{metric.label}</h2>\n          <p className="md-panel-meta">{metric.detail}</p>\n        </div>\n        <div className="md-performance-legend">\n          <span><span className="md-performance-swatch" />{metric.label}</span>\n        </div>\n      </div>\n      <div className="md-performance-canvas">\n        <DashboardAreaChart points={points} tone={metric.tone} height={268} />\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<KpiStrip\n  kpis={snapshot.kpis}\n  selectedLabel={activeMetric}\n  onSelect={setFocusMetric}\n  spark={false}\n  markerId="md-dashboard-metric-rule"\n/>\n<DashboardPerformancePanel\n  kpis={snapshot.kpis}\n  trends={snapshot.trends}\n  metricLabel={activeMetric}\n/>`,
  },
  {
    id: "breakdown-panel",
    name: "Breakdown Panel",
    category: "Data",
    description: "A split of a total drawn as bars \u2014 segmented, ranked horizontally, or compared as upright columns.",
    details: "Use for a categorical split in a side column. Prefer this over a ring or a funnel there: both carry a fixed aspect ratio, so beside a tall table they stretch and leave a band of empty surface under the drawing, and comparing lengths on a shared baseline is easier than comparing arc angles. Use `segmented` when the categories are parts of one quantity, `ranked` when the order is the point, and `columns` for a compact stage-by-stage comparison. Ranked and column bars scale against the largest category, not the total, so a long tail still has visible length.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components?component=breakdown-panel" }],
    componentCode: `export function DashboardBreakdownPanel({ title, subtitle, slices, variant = "ranked" }) {\n  const peak = slices.reduce((highest, slice) => Math.max(highest, slice.value), 0)\n\n  return (\n    <Surface padding="none" className="md-breakdown-panel">\n      <div className="md-breakdown-head">\n        <h2 className="md-panel-title">{title}</h2>\n        <p className="md-panel-meta">{subtitle}</p>\n      </div>\n      <div className="md-breakdown-body">\n        {variant === "columns" ? (\n          <ul className="md-breakdown-columns">\n            {slices.map((slice) => (\n              <li key={slice.label}>\n                <span className="md-breakdown-column-value">{slice.value}</span>\n                <span className="md-breakdown-column-plot">\n                  <motion.span className="md-breakdown-column-bar" style={{ height: String((slice.value / peak) * 100) + "%", background: slice.color }} />\n                </span>\n                <span className="md-breakdown-column-label">{slice.label}</span>\n              </li>\n            ))}\n          </ul>\n        ) : (\n          <ul className="md-breakdown-rows">\n            {slices.map((slice) => (\n              <li key={slice.label}>\n                <span className="md-breakdown-row-head">{slice.label}<span>{slice.value}</span></span>\n                <span className="md-breakdown-track"><motion.span className="md-breakdown-fill" animate={{ scaleX: slice.value / peak }} /></span>\n              </li>\n            ))}\n          </ul>\n        )}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<DashboardBreakdownPanel\n  title="Mode mix"\n  subtitle="Live bookings by transport mode"\n  slices={dashboardModeMix(bookings).map((slice) => ({ label: slice.name, value: slice.value, color: slice.color }))}\n  variant="segmented"\n  totalLabel="in transit"\n/>\n\n<DashboardBreakdownPanel\n  title="Quote pipeline"\n  subtitle="Open quotes by workflow stage"\n  slices={dashboardQuoteStages(quotes).map((slice) => ({ label: slice.name, value: slice.value, color: slice.color }))}\n  variant="columns"\n/>`,
  },
  {
    id: "coverage-panel",
    name: "Coverage Panel",
    category: "Operations",
    description: "Every operating region's working window drawn on one shared 24-hour track in the viewer's own time, with a single now line across all of them.",
    details: "Use where a team works across time zones and the real question is overlap, not the clock: how long until Shanghai closes, and who is awake to pick something up. A filled band is working, amber is closing within the hour, and a faint band is clocked off but still shows the shape of that region's day. A row only carries a count when work is actually waiting on a human. Selecting a row opens that region's queue.",
    foundOn: [{ label: "Overview", route: "/" }, { label: "Components", route: "/components?component=coverage-panel" }],
    componentCode: `export function DashboardCoveragePanel({ queues, onViewQueue }) {\n  const rows = cityQueues.map((city) => {\n    const shift = (getTimeZoneOffsetMinutes(now, city.timeZone) - localOffset) / 60\n    return { code: city.code, openAt: 8 - shift, closeAt: 17 - shift, waiting: queues[city.code]?.needAction ?? 0 }\n  })\n\n  return (\n    <Surface padding="none" className="md-coverage-panel">\n      <div className="md-coverage-plot">\n        <span className="md-coverage-nowline" style={{ insetInlineStart: \`\${nowRatio * 100}%\` }} />\n        {rows.map((row) => (\n          <button key={row.code} className="md-coverage-row" onClick={() => onViewQueue(row.code)}>\n            <span className="md-coverage-row-code">{row.code}</span>\n            <span className="md-coverage-track">\n              <span className="md-coverage-band" style={{ insetInlineStart: \`\${(row.openAt / 24) * 100}%\`, width: \`\${((row.closeAt - row.openAt) / 24) * 100}%\` }} />\n            </span>\n          </button>\n        ))}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<DashboardCoveragePanel queues={clockQueues} onViewQueue={selectTimezone} />`,
  },
  {
    id: "lane-mix-panel",
    name: "Lane Mix Panel",
    category: "Data",
    description: "A customer-detail breakdown showing the busiest lanes as compact horizontal bars.",
    details: "Use when a customer or account view needs operational volume context without pulling the user into a full charting workflow.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `export function LaneMixPanel() {\n  const max = Math.max(...marlowLaneMix.map((lane) => lane.value))\n\n  return (\n    <Surface className="rounded-[var(--md-radius-xl)]" padding="none">\n      <div className="px-5 py-4">\n        <SectionHeader title="Lane mix - last 90d" meta="6 lanes - 71 bookings" />\n      </div>\n      <div className="px-5 pb-5">\n        {marlowLaneMix.map((lane) => (\n          <div key={lane.lane} className="grid grid-cols-[220px_1fr_32px] items-center gap-4 border-t border-[rgba(11,20,19,0.06)] py-3">\n            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{lane.lane}</p>\n            <div className="h-2 rounded-full bg-[rgba(90,103,100,0.12)]">\n              <div className="h-full rounded-full bg-[var(--md-accent)]" style={{ width: \`\${(lane.value / max) * 100}%\` }} />\n            </div>\n            <p className="text-right text-[13px] font-medium text-[var(--md-ink)]">{lane.value}</p>\n          </div>\n        ))}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<LaneMixPanel />`,
  },
  {
    id: "booking-metric-card",
    name: "Booking Metric Card",
    category: "Data",
    description: "A single compact KPI tile for booking list headers, designed for quick count scanning.",
    details: "Use one per metric in booking-heavy views. Keep the card to a short label and one number so the row stays calm and scannable.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingMetricCard({ label, value, tone }) {\n  return (\n    <Surface padding="none" className="flex min-h-[52px] items-center justify-between gap-3 rounded-[var(--md-radius-xl)] px-4 py-2.5">\n      <p className="text-[12px] font-medium text-[var(--md-text)]">{label}</p>\n      <strong\n        className={cn("block text-[22px] font-medium leading-none", tone === "neutral" && "text-[var(--md-ink)]")}\n        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}\n      >\n        {value}\n      </strong>\n    </Surface>\n  )\n}`,
    usageCode: `<BookingMetricCard\n  label="In transit"\n  value="23"\n  tone="teal"\n/>`,
  },
  {
    id: "booking-search-builder",
    name: "Booking Filter Panel",
    category: "Operations",
    description: "The same advanced filter panel as Quotes, with booking fields and date conditions for departure and arrival.",
    details: "Open it from the booking table toolbar. Date fields switch the operator list to on, before, after and between, and the register only changes once the filter is applied.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Components", route: "/components" }],
    componentCode: `<AdvancedFilterPopover\n  fields={bookingFilterFields}\n  value={search}\n  onChange={setSearch}\n  storageKey="booking-register"\n  label="Advanced search"\n  title="Advanced booking search"\n  itemLabel="bookings"\n  countMatches={countDraftMatches}\n  totalCount={scopedBookings.length}\n/>`,
    usageCode: `const [search, setSearch] = useState(createEmptyFilterQuery)\nconst visibleBookings = scopedBookings.filter((booking) => bookingMatchesSearch(booking, search))\n\nfunction bookingMatchesSearch(booking, query) {\n  return matchesFilterQuery(booking, query, bookingFilterValue)\n}`,
  },
  {
    id: "bookings-table",
    name: "Booking Register",
    category: "Data",
    description: "The booking configuration of the common Data Table, with search, sorting, columns, resizing, pinning, and favourites.",
    details: "Use for the primary booking register. It intentionally shares the Quotes table engine and persists each operator's column layout.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingRegister({ rows, columns, onOpenBooking }) {\n  return (\n    <DataTable\n      columns={columns}\n      rows={rows}\n      getRowKey={(booking) => booking.id}\n      storageKey="booking-register"\n      onRowClick={onOpenBooking}\n    />\n  )\n}`,
    usageCode: `<DataTable\n  columns={bookingColumns}\n  rows={paginatedBookings}\n  getRowKey={(booking) => booking.id}\n  storageKey="booking-register"\n  onRowClick={openBooking}\n/>`,
  },
  {
    id: "booking-board-preview",
    name: "Booking Board Preview",
    category: "Operations",
    description: "A compact, reorderable board for bookings grouped by operational status.",
    details: "Use as an alternate booking list view when operators need to move work between On track, Delayed, and Exception. Cards use the shared Databrain drag frame and commit their status and order on release.",
    foundOn: [{ label: "Bookings", route: "/bookings" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingBoardPreview({ rows, onOpenBooking, onMoveBooking }) {\n  const kanban = useKanbanPointerDrag({\n    columns: bookingStatuses.map((status) => ({ id: status, tasks: rows.filter((booking) => booking.status === status) })),\n    getId: (booking) => booking.id,\n    onCommit: ({ cardId, columnId, columns }) => onMoveBooking?.(cardId, columnId, columns.flatMap((column) => column.tasks)),\n  })\n\n  return <KanbanColumns ref={kanban.boardRef} columns={kanban.previewColumns} drag={kanban} onOpenCard={onOpenBooking} />\n}`,
    usageCode: `<BookingBoardPreview rows={bookings} onOpenBooking={openBooking} onMoveBooking={moveBooking} />`,
  },
  {
    id: "domestic-job-stage-rail",
    name: "Domestic Job Stage Rail",
    category: "Operations",
    description: "A five-stage operational rail for domestic road work, from incomplete order intake through carrier confirmation and financial close.",
    details: "Use above a focused domestic transport queue. It keeps work that is not ready to plan visible without mixing it into live carrier or delivery monitoring.",
    foundOn: [{ label: "Road control", route: "/road-control" }, { label: "Components", route: "/components?component=domestic-job-stage-rail" }],
    componentCode: `export function DomesticJobStageRail({ stages, activeStage, onStageChange }) {\n  return (\n    <nav aria-label="Road job stages">\n      {stages.map((stage) => (\n        <button key={stage.id} aria-current={activeStage === stage.id ? "step" : undefined} onClick={() => onStageChange(stage.id)}>\n          <span>{stage.label}</span>\n          <strong>{stage.count}</strong>\n        </button>\n      ))}\n    </nav>\n  )\n}`,
    usageCode: `<DomesticJobStageRail stages={roadJobStages} activeStage={activeStage} onStageChange={setActiveStage} />`,
  },
  {
    id: "domestic-road-job-card",
    name: "Domestic Road Job Card",
    category: "Operations",
    description: "A compact domestic job row for scanning collection and delivery points, operational status, service, carrier and estimated margin, with a familiar favourite action.",
    details: "Use in a domestic planning queue. Selecting a row opens the shared parent booking, while its independent star lets an operator keep important jobs close.",
    foundOn: [{ label: "Road control", route: "/road-control" }, { label: "Components", route: "/components?component=domestic-road-job-card" }],
    componentCode: `export function DomesticRoadJobCard({ job, favourite, onOpenBooking, onToggleFavourite }) {\n  return (\n    <div>\n      <button onClick={() => onOpenBooking?.(job)}>{job.bookingId} · {job.customer}</button>\n      <button aria-pressed={favourite} onClick={() => onToggleFavourite?.(job)}>\n        <Star fill={favourite ? "currentColor" : "none"} />\n      </button>\n    </div>\n  )\n}`,
    usageCode: `<DomesticRoadJobCard\n  job={domesticRoadJobs[0]}\n  favourite={favouriteIds.has(domesticRoadJobs[0].bookingId)}\n  onToggleFavourite={(job) => toggleFavourite(job.bookingId)}\n  onOpenBooking={(job) => navigate(\`/bookings/\${job.bookingId.toLowerCase()}\`)}\n/>`,
  },
  {
    id: "domestic-road-kanban-board",
    name: "Domestic Road Kanban Board",
    category: "Operations",
    description: "A five-lane board that shows domestic road jobs by operating stage, with controlled drag-and-drop status updates and favourite actions.",
    details: "Use as an alternative to the Road control queue when planners need to scan the whole operation from intake to financial close. Dragging a card moves its stage and updates its operational status; open the parent booking for full detail.",
    foundOn: [{ label: "Road control", route: "/road-control" }, { label: "Components", route: "/components?component=domestic-road-kanban-board" }],
    componentCode: `export function DomesticRoadKanbanBoard({ jobs, favouriteIds, onMoveJob, onOpenBooking, onToggleFavourite }) {\n  const kanban = useKanbanPointerDrag({\n    columns: roadJobStages.map((stage) => ({ id: stage.id, tasks: jobs.filter((job) => job.stage === stage.id) })),\n    getId: (job) => job.id,\n    onCommit: ({ cardId, columnId, columns }) => onMoveJob?.(cardId, columnId, columns.flatMap((column) => column.tasks)),\n  })\n\n  return <RoadKanbanLanes ref={kanban.boardRef} columns={kanban.previewColumns} drag={kanban} favouriteIds={favouriteIds} onOpenBooking={onOpenBooking} onToggleFavourite={onToggleFavourite} />\n}`,
    usageCode: `<DomesticRoadKanbanBoard\n  jobs={scopedJobs}\n  favouriteIds={favouriteIds}\n  onMoveJob={(jobId, stage, orderedJobs) => moveRoadJob(jobId, stage, orderedJobs)}\n  onToggleFavourite={(job) => toggleFavourite(job.bookingId)}\n  onOpenBooking={(job) => navigate(\`/bookings/\${job.bookingId.toLowerCase()}\`)}\n/>`,
  },
  {
    id: "report-template-card",
    name: "Report Template Card",
    category: "Data",
    description: "A reusable report-starting point for saved layouts, cadence, output format, and a quick data preview.",
    details: "Use in report libraries where operators need to pick, run, or edit a reusable report layout. Pair it with the new-template card when creation belongs in the same grid.",
    foundOn: [{ label: "Reports", route: "/reports" }, { label: "Components", route: "/components" }],
    componentCode: `export function ReportTemplateCard({ template, onRun, onEdit }) {\n  return (\n    <Surface padding="none" className="flex min-h-[336px] flex-col rounded-[var(--md-radius-xl)] p-4">\n      <ReportPreviewGraphic template={template} />\n      <div className="mt-4 flex flex-1 flex-col">\n        <h3>{template.title}</h3>\n        <p>{template.description}</p>\n        <div>\n          <span>{template.cadence}</span>\n          <span>{template.format}</span>\n        </div>\n      </div>\n      <div className="mt-4 flex items-center justify-between border-t border-[rgba(11,20,19,0.06)] pt-4">\n        <button onClick={() => onRun?.(template)}>Run now</button>\n        <button onClick={() => onEdit?.(template)}>Edit</button>\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<ReportTemplateCard\n  template={reportTemplates[0]}\n  onRun={runTemplate}\n  onEdit={editTemplate}\n/>\n\n<NewReportTemplateCard onCreate={createTemplate} />`,
  },
  {
    id: "generated-report-table",
    name: "Generated Report Table",
    category: "Data",
    description: "A dense report history table for scope, period, creation state, and ready/download actions.",
    details: "Use for generated report libraries. Keep disabled actions visible for generating or scheduled reports so operators understand what is coming next.",
    foundOn: [{ label: "Reports", route: "/reports" }, { label: "Components", route: "/components" }],
    componentCode: `export function GeneratedReportsTable({ reports, onView, onDownload }) {\n  return (\n    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">\n      <Table>\n        <TableHeader>\n          <TableRow>\n            <TableHead>Report</TableHead>\n            <TableHead>Scope</TableHead>\n            <TableHead>Period</TableHead>\n            <TableHead>Created</TableHead>\n            <TableHead>Status</TableHead>\n            <TableHead>Actions</TableHead>\n          </TableRow>\n        </TableHeader>\n        <TableBody>\n          {reports.map((report) => <GeneratedReportRow key={report.id} report={report} />)}\n        </TableBody>\n      </Table>\n    </Surface>\n  )\n}`,
    usageCode: `<GeneratedReportsTable\n  reports={visibleReports}\n  onView={viewReport}\n  onDownload={downloadReport}\n/>`,
  },
  {
    id: "report-document-page",
    name: "Report Document Page",
    category: "Data",
    description: "An A4-style report page shell for generated reports and editable report templates.",
    details: "Use for report previews, template canvases, and later PDF-backed pages. Content is block-based so generated data can replace mock blocks without changing the workspace.",
    foundOn: [{ label: "Report viewer", route: "/reports/rpt-marlow-may-review" }, { label: "Template builder", route: "/reports/templates/monthly-client-review" }, { label: "Components", route: "/components" }],
    componentCode: `export function ReportDocumentPage({ page, totalPages, editable, selectedBlockId, onSelectBlock, onDropWidget }) {\n  return (\n    <section\n      className="aspect-[794/1123] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"\n      onDrop={(event) => onDropWidget?.(event.dataTransfer.getData("application/multideck-widget"), page.id)}\n    >\n      <ReportHeader preparedBy={page.preparedBy} />\n      <h1>{page.title}</h1>\n      {page.blocks.map((block) => (\n        <ReportBlockView\n          key={block.id}\n          block={block}\n          editable={editable}\n          selected={selectedBlockId === block.id}\n          onSelect={() => onSelectBlock?.(block)}\n        />\n      ))}\n      <footer>Page {page.pageNumber} of {totalPages}</footer>\n    </section>\n  )\n}`,
    usageCode: `<ReportDocumentPage\n  page={monthlyReviewPages[0]}\n  totalPages={monthlyReviewPages.length}\n/>\n\n<ReportDocumentPage\n  page={templatePage}\n  totalPages={templatePages.length}\n  editable\n  selectedBlockId={selectedBlockId}\n  onSelectBlock={setSelectedBlock}\n  onDropWidget={addWidgetById}\n/>`,
  },
  {
    id: "report-thumbnail-rail",
    name: "Report Thumbnail Rail",
    category: "Navigation",
    description: "A compact page navigator for multi-page report previews and template editing.",
    details: "Use beside a report canvas when the operator needs to move between pages without losing document context.",
    foundOn: [{ label: "Report viewer", route: "/reports/rpt-marlow-may-review" }, { label: "Template builder", route: "/reports/templates/monthly-client-review" }, { label: "Components", route: "/components" }],
    componentCode: `export function ReportPageThumbnailRail({ pages, activePageId, onChange }) {\n  return (\n    <aside className="md-scrollbar flex gap-4 overflow-auto">\n      {pages.map((page) => (\n        <button key={page.id} onClick={() => onChange(page.id)}>\n          <ReportMiniPage active={page.id === activePageId} />\n          <span>{page.pageNumber} - {page.label}</span>\n        </button>\n      ))}\n    </aside>\n  )\n}`,
    usageCode: `<ReportPageThumbnailRail\n  pages={monthlyReviewPages}\n  activePageId={activePageId}\n  onChange={setActivePageId}\n/>`,
  },
  {
    id: "report-page-controls",
    name: "Report Page Controls",
    category: "Navigation",
    description: "A compact previous/next control for moving through report pages without leaving the report viewer.",
    details: "Use in document-like previews where page position matters. It should stay small, disabled at either end, and close to the report actions.",
    foundOn: [{ label: "Report viewer", route: "/reports/rpt-marlow-may-review" }, { label: "Components", route: "/components" }],
    componentCode: `export function ReportPageControls({ page, totalPages, onPrevious, onNext }) {\n  return (\n    <div className="inline-flex items-center rounded-[var(--md-radius-lg)] bg-white/70 p-1 shadow-[var(--md-shadow-line)]">\n      <Button size="icon-sm" disabled={page <= 1} onClick={onPrevious} aria-label="Previous page">\n        <ChevronLeft />\n      </Button>\n      <span className="px-3 text-[12px] font-medium text-[var(--md-text)]">{page} / {totalPages}</span>\n      <Button size="icon-sm" disabled={page >= totalPages} onClick={onNext} aria-label="Next page">\n        <ChevronRight />\n      </Button>\n    </div>\n  )\n}`,
    usageCode: `<ReportPageControls\n  page={activePage.pageNumber}\n  totalPages={monthlyReviewPages.length}\n  onPrevious={() => movePage(-1)}\n  onNext={() => movePage(1)}\n/>`,
  },
  {
    id: "report-widget-palette",
    name: "Report Widget Palette",
    category: "Operations",
    description: "A searchable widget palette for editable report canvases and the dashboard panel preview tray.",
    details: "Use the sidebar presentation in report-template editors and the inline presentation inside the manual dashboard panel so the parent panel owns the scroll. Widgets carry a stable type for data binding, drill-down, and export later.",
    foundOn: [{ label: "Overview manual dashboard", route: "/" }, { label: "Report viewer", route: "/reports/rpt-marlow-may-review" }, { label: "Template builder", route: "/reports/templates/monthly-client-review" }, { label: "Components", route: "/components" }],
    componentCode: `export function ReportWidgetPalette({ widgets, query, onQueryChange, activeWidgetId, onAddWidget, presentation = "sidebar" }) {\n  const filteredWidgets = widgets.filter((widget) => widget.title.toLowerCase().includes(query.toLowerCase()))\n  const content = filteredWidgets.map((widget) => (\n    <button\n      key={widget.id}\n      draggable\n      aria-pressed={activeWidgetId === widget.id}\n      onDragStart={(event) => event.dataTransfer.setData("application/multideck-widget", widget.id)}\n      onClick={() => onAddWidget(widget)}\n    >\n      <WidgetMiniPreview widget={widget} />\n      <span>{widget.title}</span>\n      <span>{widget.description}</span>\n    </button>\n  ))\n\n  if (presentation === "inline") return <div>{content}</div>\n  return <aside>{content}</aside>\n}`,
    usageCode: `<ReportWidgetPalette\n  widgets={reportWidgets}\n  query={query}\n  onQueryChange={setQuery}\n  activeWidgetId={activeWidgetId}\n  onAddWidget={addWidget}\n/>\n\n<ReportWidgetPalette\n  widgets={reportWidgets}\n  query={dashboardQuery}\n  onQueryChange={setDashboardQuery}\n  onAddWidget={addDashboardWidget}\n  presentation="inline"\n/>`,
  },
  {
    id: "booking-arrival-card",
    name: "Booking Arrival Card",
    category: "Operations",
    description: "The prediction panel for a booking overview: arrival time, delay delta, confidence, booking, and milestone progress.",
    details: "Use at the top of booking detail overview when the operator needs the current arrival model and route stage in one place.",
    foundOn: [{ label: "Booking detail", route: "/bookings/md-22455" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingArrivalCard() {\n  return (\n    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">\n      <p>Predicted arrival · Long Beach, USLGB</p>\n      <strong>Jun 09, 03:00 PT</strong>\n      <span>+ 2 days 4 hrs</span>\n      <p>Model confidence 87% · last update 41 seconds ago</p>\n      <MilestoneRail milestones={bookingMilestones} />\n    </Surface>\n  )\n}`,
    usageCode: `<BookingArrivalCard />`,
  },
  {
    id: "booking-exception-panel",
    name: "Booking Exception Panel",
    category: "Operations",
    description: "A focused exception block with the issue, severity, context, and the next best resolution actions.",
    details: "Use inside booking overview when an exception needs action. It should explain why the hold exists and keep the fastest resolution choices close.",
    foundOn: [{ label: "Booking detail", route: "/bookings/md-22455" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingExceptionPanel() {\n  return (\n    <section className="rounded-[var(--md-radius-xl)] bg-white/38 p-5 shadow-[inset_0_0_0_1px_rgba(209,78,78,0.28)]">\n      <TriangleAlert />\n      <h2>Customs hold · CN export licence missing</h2>\n      <StatusPill tone="red">Critical</StatusPill>\n      <p>The required export licence is missing from the document set.</p>\n      <button>Request licence from shipper</button>\n      <button>Mark as own goods</button>\n      <button>Escalate to broker</button>\n    </section>\n  )\n}`,
    usageCode: `<BookingExceptionPanel />`,
  },
  {
    id: "booking-checklist",
    name: "Booking Checklist",
    category: "Operations",
    description: "A tickable operational checklist for clearing booking exceptions without losing the current booking context.",
    details: "Use inside booking overview or exception detail surfaces when the operator needs a shared, step-by-step resolution path.",
    foundOn: [{ label: "Booking detail", route: "/bookings/md-22455" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingResolutionChecklist() {\n  const [checkedItems, setCheckedItems] = useState(new Set([\"Confirm hold reason\"]))\n\n  return (\n    <Surface>\n      {items.map(([label, detail]) => (\n        <button onClick={() => toggleItem(label)}>\n          <Checkbox checked={checkedItems.has(label)} />\n          <span>{label}</span>\n          <span>{detail}</span>\n        </button>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<BookingResolutionChecklist />`,
  },
  {
    id: "customs-readiness-review",
    name: "Customs Readiness Review",
    category: "Operations",
    description: "A progress-led readiness review that shows exactly what blocks a declaration and opens the relevant correction inline.",
    details: "Use before a Customs handoff or submission. Keep each issue actionable, save through the owning workflow, then recalculate readiness from the server.",
    foundOn: [{ label: "Booking Customs review", route: "/bookings" }, { label: "Customs declaration Review", route: "/customs/standalone" }, { label: "Components", route: "/components?component=customs-readiness-review" }],
    componentCode: `export function CustomsReadinessReview({ percent, completeChecks, totalChecks, issues, renderFix }) {\n  return (\n    <Surface>\n      <h2>{percent}% complete</h2>\n      <p>{completeChecks}/{totalChecks} readiness checks passed</p>\n      {issues.map((issue) => (\n        <div key={issue.key}>\n          <span>{issue.label}</span>\n          <button>Fix</button>\n          {renderFix(issue)}\n        </div>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<CustomsReadinessReview\n  percent={readiness.percent}\n  completeChecks={readiness.completeChecks}\n  totalChecks={readiness.totalChecks}\n  issues={readiness.missing}\n  renderFix={(issue, close) => <InlineCorrection issue={issue} onSaved={close} />}\n/>`,
  },
  {
    id: "booking-ask-panel",
    name: "Booking Ask Panel",
    category: "Operations",
    description: "A floating, collapsible chatbot panel for asking contextual questions about one booking.",
    details: "Use on booking detail views where operators need quick answers without losing the current record. Keep it fixed on desktop so page scrolling does not move it.",
    foundOn: [{ label: "Booking detail", route: "/bookings/md-22455" }, { label: "Components", route: "/components" }],
    componentCode: `export function BookingAskPanel({ collapsed, onCollapsedChange }) {\n  const [draft, setDraft] = useState(\"\")\n  const [messages, setMessages] = useState(initialMessages)\n\n  if (collapsed) {\n    return (\n      <button aria-label=\"Open booking chat\" onClick={() => onCollapsedChange(false)}>\n        <span className=\"glow\" />\n        <AiBrain />\n      </button>\n    )\n  }\n\n  return (\n    <aside className=\"flex h-full flex-col rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)]\">\n      <header>\n        <AiBrain />\n        <h2>Ask about this booking</h2>\n        <button onClick={() => onCollapsedChange(true)}>Collapse</button>\n      </header>\n      <div>{messages.map((message) => <ChatBubble message={message} />)}</div>\n      <form onSubmit={askQuestion}>\n        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />\n        <button type=\"submit\">Send</button>\n      </form>\n    </aside>\n  )\n}`,
    usageCode: `<div className={chatCollapsed ? \"fixed right-6 top-6 size-14\" : \"fixed bottom-6 right-6 top-6 w-[368px]\"}>\n  <BookingAskPanel\n    collapsed={chatCollapsed}\n    onCollapsedChange={setChatCollapsed}\n  />\n</div>`,
  },
  {
    id: "dexter-mention-input",
    name: "Dexter Mention Input",
    category: "Agent Dexter",
    description: "An accessible rich prompt field that turns @ searches into durable inline references to bookings, customers, leads, quotes, documents, and Multideck pages.",
    details: "Use inside Dexter composers when an operator needs to ground a request in workspace context without opening a separate attachment flow. The menu keeps focus in the prompt, supports arrows, Enter, Tab, Escape, paste, deletion, RTL, and reduced motion, then sends the selected records as structured context.",
    foundOn: [
      { label: "Agent Dexter", route: "/agent-dexter" },
      { label: "Bookings", route: "/bookings" },
      { label: "Road control", route: "/road-control" },
      { label: "Customers", route: "/customers" },
      { label: "Quotes", route: "/quotes" },
      { label: "CRM overview", route: "/crm" },
      { label: "CRM leads", route: "/crm/leads" },
      { label: "CRM contacts", route: "/crm/contacts" },
      { label: "CRM deals", route: "/crm/deals" },
      { label: "Components", route: "/components?component=dexter-mention-input" },
    ],
    componentCode: `export function DexterMentionInput({ value, items, selectedMentions, onChange, onMentionsChange, onSend }) {\n  return (\n    <div className="relative">\n      <AnimatePresence initial={false}>\n        {mentionQuery !== null ? (\n          <motion.div role="listbox" className="md-dexter-mention-menu">\n            {results.map((item) => (\n              <button key={item.id} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(item)}>\n                <item.icon />\n                <span>{item.title}</span>\n                <span>{item.type}</span>\n              </button>\n            ))}\n          </motion.div>\n        ) : null}\n      </AnimatePresence>\n      <div\n        contentEditable\n        role="combobox"\n        aria-autocomplete="list"\n        aria-expanded={mentionQuery !== null}\n        data-placeholder="Ask anything, @ a record, or / for a command"\n        className="md-dexter-mention-editor"\n        onInput={handleInput}\n        onKeyDown={handleKeyDown}\n      />\n    </div>\n  )\n}`,
    usageCode: `<DexterMentionInput\n  value={prompt}\n  items={mentionItems}\n  selectedMentions={mentions}\n  placeholder="Ask anything, @ a record, or / for a command"\n  minHeight={76}\n  maxHeight={232}\n  canSend={Boolean(prompt.trim())}\n  onChange={setPrompt}\n  onMentionsChange={setMentions}\n  onSend={sendPrompt}\n/>`,
  },
  {
    id: "dexter-summon-prompt",
    name: "Dexter Summon Prompt",
    category: "Agent Dexter",
    description: "The Dexter prompt box, stripped to what an answer-in-place needs, pinned to whatever the operator summoned it on.",
    details: "Use as the tooltip half of the summon gesture: hold the platform modifier and double-click a field, chart, table or panel and this opens against it with that thing's context already attached. Everything the full composer carries that an interruption does not need is gone — no role picker, no attachments, no model choice — because the summon always runs on Fast so the answer lands while the operator is still looking. The header names what it is pinned to, Enter sends, and Open in full hands the same conversation to the Dexter workspace rather than starting again.",
    foundOn: [
      { label: "Every workspace screen", route: "/" },
      { label: "Keyboard shortcuts", route: "/settings?tab=shortcuts" },
      { label: "Components", route: "/components?component=dexter-summon-prompt" },
    ],
    componentCode: `export function DexterSummonPrompt({ target, status, question, answer, onQuestionChange, onSubmit, onClose, onCopy, onAskAnother, onContinueInDexter }) {\n  const KindIcon = kindIcons[target.kind]\n  const busy = status === "thinking" || status === "streaming"\n  const canSend = question.trim().length > 0 && !busy\n\n  return (\n    <div className="md-summon-prompt md-composer-bloom relative w-full overflow-hidden rounded-[22px]" role="dialog">\n      <span aria-hidden className="md-composer-bloom__shader"><SpectralBloomShader shape="composer" /></span>\n      <span aria-hidden className="md-composer-bloom__contrast" />\n\n      <header className="relative z-[2] flex h-9 items-center gap-1.5 ps-1.5 pe-1">\n        <DexterBrandMark className="size-6" />\n        <span className="md-summon-chip"><KindIcon /><span className="truncate">{target.label}</span></span>\n        <span className="md-summon-chip md-summon-chip--fast"><Zap /><span>Fast</span></span>\n        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="ms-auto" />\n      </header>\n\n      <div className="relative z-[2] mx-1.5 mb-1.5 rounded-[16px] bg-[var(--md-composer-panel-bg)]">\n        <AnimatePresence initial={false}>\n          {busy && !answer ? <ThinkingLine /> : null}\n          {answer ? <AnswerBlock answer={answer} onCopy={onCopy} onAskAnother={onAskAnother} onContinueInDexter={onContinueInDexter} /> : null}\n        </AnimatePresence>\n        <div className="flex items-end gap-2 px-2.5 py-2">\n          <textarea\n            rows={1}\n            value={question}\n            placeholder={summonPlaceholder(target.kind)}\n            onChange={(event) => onQuestionChange(event.target.value)}\n            onKeyDown={(event) => {\n              if (event.key !== "Enter") return\n              if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return\n              event.preventDefault()\n              if (canSend) onSubmit()\n            }}\n          />\n          <DexterActionPill icon={ArrowUp} iconOnly label="Ask" disabled={!canSend} onClick={onSubmit} />\n        </div>\n      </div>\n    </div>\n  )\n}`,
    usageCode: `// Driven by the summon overlay, which resolves the target and streams the answer\nconst target = describeSummonTarget(element)\n\n<DexterSummonPrompt\n  target={target}\n  status={status}\n  question={question}\n  answer={answer}\n  error={error}\n  copied={copied}\n  onQuestionChange={setQuestion}\n  onSubmit={submit}\n  onClose={close}\n  onCopy={copyAnswer}\n  onAskAnother={clearAnswer}\n  onContinueInDexter={() => {\n    rememberDexterConversationHandoff(conversationId)\n    navigate("/agent-dexter")\n  }}\n/>\n\n// The request itself always takes the quickest engine\nawait streamDexterMessage({\n  conversationId,\n  message: \`\${buildSummonBrief(target, readSummonPageContext())}\\n\\n---\\n\\nQuestion: \${question}\`,\n  specialist: "auto",\n  model: "fast",\n  locale: language,\n  accessMode: "approve",\n  attachments: [],\n}, { onAnswerDelta: (delta) => setAnswer((current) => current + delta) })`,
  },
  {
    id: "dexter-prompt-composer",
    name: "Dexter Prompt Composer",
    category: "Agent Dexter",
    description: "The central command box for Agent Dexter: @ mentions, attached context, slash commands, model and role choices, live context usage, plus explicit approval or full-access control.",
    details: "Use on the Agent Dexter landing and conversation footer. The + button opens the computer file chooser, @ references workspace or email context, and / switches between Chat and Watch; Approve remains the safe default and Full access is a deliberately warning-toned state for allowlisted writes.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=dexter-prompt-composer" }],
    componentCode: `export function DexterPromptComposer({ value, selectedSpecialistId, selectedModelId, accessMode, contextUsedTokens, contextMaxTokens, attachments, onChange, onOpenAttachments, onSelectSpecialist, onSelectModel, onAccessModeChange, onSend }) {\n  return (\n    <div className="md-composer md-composer-bloom relative overflow-hidden rounded-[26px]">\n      <span aria-hidden className="md-composer-bloom__shader">\n        <SpectralBloomShader shape="composer" />\n      </span>\n      <span aria-hidden className="md-composer-bloom__contrast" />\n      <div className="relative z-[2] flex h-[44px] items-center px-3">\n        <DexterRoleMenu selectedId={selectedSpecialistId} onSelect={onSelectSpecialist} />\n      </div>\n      <div className="relative z-[2] mx-1.5 mb-1.5 rounded-[21px] bg-[var(--md-composer-panel-bg)]">\n        {attachments.map((attachment) => <ContextChip key={attachment.id} attachment={attachment} />)}\n        <textarea\n          value={value}\n          rows={1}\n          onChange={(event) => onChange(event.target.value)}\n          onKeyDown={(event) => {\n            if (event.key === "Enter" && !event.shiftKey) {\n              event.preventDefault()\n              if (value.trim()) onSend()\n            }\n          }}\n        />\n        <button onClick={onOpenAttachments}>Attach</button>\n        <DexterModelMenu selectedId={selectedModelId} onSelect={onSelectModel} />\n        <Context\n          usedTokens={contextUsedTokens}\n          maxTokens={contextMaxTokens}\n          label={t("Conversation context")}\n          description={t("How much of this chat Dexter can keep in mind.")}\n        >\n          <ContextTrigger />\n          <ContextContent><ContextContentHeader /></ContextContent>\n        </Context>\n        <DexterAccessModeToggle mode={accessMode} onChange={onAccessModeChange} />\n        <DexterActionPill icon={ArrowUp} iconOnly disabled={!value.trim()} onClick={onSend} />\n      </div>\n    </div>\n  )\n}`,
    usageCode: `<DexterPromptComposer\n  value={prompt}\n  selectedSpecialistId={selectedSpecialistId}\n  selectedModelId={selectedModelId}\n  accessMode={accessMode}\n  contextUsedTokens={contextUsedTokens}\n  contextMaxTokens={128_000}\n  attachments={attachedItems}\n  commands={slashCommands}\n  onChange={setPrompt}\n  onOpenAttachments={() => computerFileInputRef.current?.click()}\n  attachmentActionLabel="Upload files"\n  onSelectSpecialist={setSelectedSpecialistId}\n  onSelectModel={setSelectedModelId}\n  onAccessModeChange={setAccessMode}\n  onCommand={handleSlashCommand}\n  onSend={startConversation}\n/>`,
  },
  {
    id: "watch-mode-aurora",
    name: "Watch Mode Aurora",
    category: "Agent Dexter",
    description: "A quiet full-surface shader that distinguishes Watch mode using tones derived from the operator's chosen accent colour.",
    details: "Use behind Dexter only while Watch mode is active. The light rises from the bottom, stays non-interactive, fades before it reaches the main content, follows live accent changes, and becomes still when reduced motion is enabled.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=watch-mode-aurora" }],
    componentCode: `<WatchModeAurora active={dexterMode === "watch"} />`,
    usageCode: `<div className="relative min-h-screen overflow-hidden bg-[var(--md-bg)]">
  <WatchModeAurora active={dexterMode === "watch"} />
  <main className="relative z-10">{children}</main>
</div>`,
  },
  {
    id: "context-usage-meter",
    name: "Context Usage Meter",
    category: "Agent Dexter",
    description: "A compact, click-open context-window indicator that shows only the percentage used and a progress bar.",
    details: "Use inside an AI prompt toolbar when the operator needs to understand how full the active conversation is. Keep token counts and price out of the customer-facing surface.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function ContextUsageMeter({ usedTokens, maxTokens, label, description, locale }) {\n  return (\n    <Context usedTokens={usedTokens} maxTokens={maxTokens} label={label} description={description} locale={locale}>\n      <ContextTrigger />\n      <ContextContent side="top">\n        <ContextContentHeader />\n      </ContextContent>\n    </Context>\n  )\n}`,
    usageCode: `<ContextUsageMeter\n  usedTokens={40_000}\n  maxTokens={128_000}\n  label={t("Conversation context")}\n  description={t("How much of this chat Dexter can keep in mind.")}\n  locale={language}\n/>`,
  },
  {
    id: "dexter-live-reasoning",
    name: "Dexter Live Reasoning",
    category: "Agent Dexter",
    description: "A compact disclosure for Dexter's in-progress reasoning summary, with the text continuing to stream when the operator opens it.",
    details: "Use while Dexter is producing a reply. Keep the same disclosure mounted as the answer begins, then transition it in place to the completed reasoning summary so the conversation does not jump or flicker.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=dexter-live-reasoning" }],
    componentCode: `<Reasoning defaultOpen={false} isStreaming>\n  <ReasoningTrigger getThinkingMessage={() => <span>Reasoning</span>} />\n  <ReasoningContent>{streamedReasoning}</ReasoningContent>\n</Reasoning>`,
    usageCode: `<Reasoning defaultOpen={false} isStreaming={isResponding} className="mb-0 max-w-[680px] py-1">\n  <ReasoningTrigger getThinkingMessage={() => <span>{t("Reasoning")}</span>} />\n  <ReasoningContent>{reasoningContent}</ReasoningContent>\n</Reasoning>`,
  },
  {
    id: "dexter-reasoning-summary",
    name: "Dexter Reasoning Summary",
    category: "Agent Dexter",
    description: "The completed state of Dexter's persistent reasoning disclosure, letting the operator revisit the supported summary attached to an answer.",
    details: "Keep the same disclosure used during streaming and change its label in place after completion. Render only provider-supported summary content, keep it closed by default, and do not add a card background.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=dexter-reasoning-summary" }],
    componentCode: `<Reasoning defaultOpen={false} isStreaming={false}>\n  <ReasoningTrigger getThinkingMessage={() => <span>Reasoning summary</span>} />\n  <ReasoningContent>{reasoningSummary}</ReasoningContent>\n</Reasoning>`,
    usageCode: `<DexterReasoningDisclosure\n  content={message.reasoningSummary ?? ""}\n  isStreaming={message.id === streamingMessageId}\n/>`,
  },
  {
    id: "dexter-action-approval",
    name: "Dexter Action Approval",
    category: "Agent Dexter",
    description: "The explicit review checkpoint for a workspace change, with animated field-level before and after comparisons plus clear Approve and Deny actions.",
    details: "Use only for a prepared allowlisted write. Show changed values as red previous and green proposed panels, identify additions and removals, keep the proposal visible while either decision is processing, and retain it with an inline error when the server cannot confirm the result.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components?component=dexter-action-approval" }],
    componentCode: `<DexterActionApproval\n  action={pendingAction}\n  pendingDecision={pendingDecision}\n  error={decisionError}\n  onDecision={handleActionDecision}\n/>`,
    usageCode: `{message.pendingAction ? (\n  <DexterActionApproval\n    action={message.pendingAction}\n    pendingDecision={pendingActionDecision}\n    error={actionDecisionError}\n    onDecision={(decision) => handleActionDecision(message.pendingAction, decision)}\n  />\n) : null}`,
  },
  {
    id: "dexter-specialist-picker",
    name: "Dexter Specialist Picker",
    category: "Agent Dexter",
    description: "A focused picker for choosing Auto or a specialist lane such as customs, customer comms, sales, ops, or analytics.",
    details: "Use directly below the composer. Auto should stay the default because it keeps the first-time experience simple.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterSpecialistPicker({ specialists, selectedId, onSelect }) {\n  return (\n    <Surface>\n      <h2>Specialists</h2>\n      {specialists.map((specialist) => (\n        <button key={specialist.id} onClick={() => onSelect(specialist.id)}>\n          <specialist.icon />\n          <span>{specialist.name}</span>\n          <span>{specialist.description}</span>\n        </button>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<DexterSpecialistPicker\n  specialists={defaultDexterSpecialists}\n  selectedId={selectedSpecialistId}\n  onSelect={setSelectedSpecialistId}\n/>`,
  },
  {
    id: "dexter-specialist-menu",
    name: "Dexter Role Menu",
    category: "Agent Dexter",
    description: "The role selector that rides on the composer's shared Dexter shader header, stating the lane every following reply is answered in.",
    details: "Use inside the composer header rather than as a separate panel: the role is persistent state, so it belongs on the control it changes. Reusing Dexter's shared shader keeps that state inside the agent's established visual language.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterRoleMenu({ specialists, selectedId, onSelect }) {\n  const selected = specialists.find((specialist) => specialist.id === selectedId)\n\n  return (\n    <DropdownMenu>\n      <DropdownMenuTrigger asChild>\n        <button className="md-composer-lead">\n          <SwapLabel value={selected.name} className="text-white dark:text-[var(--md-ink)]" />\n          <ChevronDown className="md-composer-chip__caret" />\n        </button>\n      </DropdownMenuTrigger>\n      <DropdownMenuContent align="start" className="w-[336px]">\n        <DropdownMenuLabel>Role</DropdownMenuLabel>\n        <DropdownMenuRadioGroup value={selectedId} onValueChange={onSelect}>\n          {specialists.map((specialist) => (\n            <DropdownMenuRadioItem key={specialist.id} value={specialist.id}>\n              <specialist.icon />\n              <span>{specialist.name}</span>\n              <span>{specialist.description}</span>\n            </DropdownMenuRadioItem>\n          ))}\n        </DropdownMenuRadioGroup>\n      </DropdownMenuContent>\n    </DropdownMenu>\n  )\n}`,
    usageCode: `<DexterRoleMenu\n  specialists={defaultDexterSpecialists}\n  selectedId={selectedSpecialistId}\n  onSelect={setSelectedSpecialistId}\n/>`,
  },
  {
    id: "dexter-model-menu",
    name: "Dexter Model Menu",
    category: "Agent Dexter",
    description: "The engine picker: Fast, Smart or Worker, each with its provider mark and a nine-bar capability meter.",
    details: "Use in the composer's action row. Keep vendor model names out of the trigger — an operator is choosing how hard the request should think, not a version string — and let the meter carry the comparison.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterModelMenu({ models, selectedId, onSelect }) {\n  const selected = models.find((model) => model.id === selectedId)\n\n  return (\n    <DropdownMenu>\n      <DropdownMenuTrigger asChild>\n        <button className="md-composer-chip">\n          <ModelProviderGlyph provider={selected.provider} />\n          <SwapLabel value={selected.name} />\n          <SwapLabel value={selected.tag} />\n          <ModelStrengthMeter strength={selected.strength} tone="muted" />\n          <ChevronDown className="md-composer-chip__caret" />\n        </button>\n      </DropdownMenuTrigger>\n      <DropdownMenuContent align="start" side="top" className="w-[318px]">\n        <DropdownMenuLabel>Models</DropdownMenuLabel>\n        <DropdownMenuRadioGroup value={selectedId} onValueChange={onSelect}>\n          {models.map((model) => (\n            <DropdownMenuRadioItem key={model.id} value={model.id}>\n              <ModelProviderGlyph provider={model.provider} />\n              <span>{model.name}</span>\n              <span>{model.description}</span>\n              <ModelStrengthMeter strength={model.strength} />\n            </DropdownMenuRadioItem>\n          ))}\n        </DropdownMenuRadioGroup>\n      </DropdownMenuContent>\n    </DropdownMenu>\n  )\n}`,
    usageCode: `<DexterModelMenu\n  models={dexterModels}\n  selectedId={selectedModelId}\n  onSelect={setSelectedModelId}\n/>`,
  },
  {
    id: "dexter-attachment-palette",
    name: "Dexter Attachment Palette",
    category: "Agent Dexter",
    description: "The attachment palette for securely uploading local files or attaching bookings, customers, and workspace documents as live Dexter context.",
    details: "Use when the operator clicks +. Lead with Upload from computer, then keep @-style workspace context searchable and grouped. Uploaded files are private, type-checked evidence; selected workspace records keep their exact IDs.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterAttachmentPalette({ query, items, selectedIds, onQueryChange, onToggle, onUploadFiles, isUploading, uploadError }) {\n  const fileInputRef = useRef(null)\n  const filtered = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))\n\n  return (\n    <Surface>\n      <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(event) => onUploadFiles(Array.from(event.currentTarget.files ?? []))} />\n      <button disabled={isUploading} onClick={() => fileInputRef.current?.click()}>Upload from computer</button>\n      {uploadError ? <p role="alert">{uploadError}</p> : null}\n      <input value={query} onChange={(event) => onQueryChange(event.target.value)} />\n      {filtered.map((item) => (\n        <button key={item.id} onClick={() => onToggle(item.id)}>\n          <span>{item.title}</span>\n          <span>{item.meta}</span>\n          <span>{selectedIds.has(item.id) ? "Attached" : "Attach"}</span>\n        </button>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<DexterAttachmentPalette\n  query={attachmentQuery}\n  items={defaultDexterAttachments}\n  selectedIds={selectedAttachmentIds}\n  onQueryChange={setAttachmentQuery}\n  onToggle={toggleAttachment}\n  onUploadFiles={uploadFilesToDexter}\n  isUploading={isUploading}\n  uploadError={uploadError}\n/>`,
  },
  {
    id: "dexter-history-list",
    name: "Dexter History List",
    category: "Agent Dexter",
    description: "The legacy standalone conversation rail, retained as a reference while Dexter history now lives in the main app sidebar.",
    details: "Do not add this as a second desktop sidebar. Dexter routes use the app sidebar history mode; this standalone version remains available only for isolated inspection.",
    foundOn: [{ label: "Components", route: "/components" }],
    componentCode: `export function DexterHistoryList({ items, activeId, variant = "rail", isLoading, onSelect, onNew, onClose }) {\n  return (\n    <aside data-variant={variant}>\n      <button onClick={onNew}>New</button>\n      {onClose ? <button onClick={onClose}>Close</button> : null}\n      {isLoading ? <HistorySkeleton /> : items.map((item) => (\n        <button key={item.id} aria-current={activeId === item.id ? "page" : undefined} onClick={() => onSelect(item.id)}>\n          {item.title}\n        </button>\n      ))}\n    </aside>\n  )\n}`,
    usageCode: `<DexterHistoryList\n  variant="panel"\n  items={historyItems}\n  activeId={activeHistoryId}\n  isLoading={isLoadingHistory}\n  onSelect={openConversation}\n  onNew={startNewConversation}\n  onClose={() => setShowHistory(false)}\n/>`,
  },
  {
    id: "dexter-monitor-card",
    name: "Dexter Monitor Card",
    category: "Agent Dexter",
    description: "A Watch card that answers is anything up, what happened, and which watch said so — in that order, inside the 288–336px Dexter rail.",
    details: "Use in the right rail of Agent Dexter. The change is the loud line and the watch's own name drops beneath it; the rule text never appears here because it repeats the title. An unopened watch gets a tone-coloured inline-start bar, a tinted field and the only breathing dot in the rail, so movement always means news rather than liveness.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterMonitorCard({ monitor, index = 0, active, onClick }) {\n  const state = dexterWatchState(monitor, t)\n  const stamp = dexterWatchStamp(state.at, language, t)\n  return (\n    <button\n      className="md-watch-card w-full min-w-0"\n      data-active={active}\n      data-state={state.key}\n      data-unread={state.unread ? "true" : undefined}\n      style={{ "--md-watch-tone": toneToVar(state.tone), "--md-watch-delay": \`\${index * 0.9}s\` }}\n      onClick={onClick}\n    >\n      <span className="flex items-center gap-2">\n        <span className="md-watch-dot" />\n        <span className="md-watch-card__state">{state.label}</span>\n        {stamp ? <time className="ms-auto tabular-nums">{stamp}</time> : null}\n      </span>\n      <span className="line-clamp-3 font-medium">{state.news || monitor.title}</span>\n      <span className="truncate">{state.news ? monitor.title : t("Nothing has matched yet")}</span>\n    </button>\n  )\n}`,
    usageCode: `<DexterMonitorStack monitors={monitors} onAsk={openWatcherComposer} />`,
  },
  {
    id: "dexter-monitor-detail",
    name: "Dexter Monitor Detail",
    category: "Agent Dexter",
    description: "The responsive Watch detail pane: what happened, the one next step, then what the watch is actually looking for.",
    details: "Use when an operator selects a Watch card. The change leads in plain words with its timestamp, and the email body, preview and attachments sit under it as evidence. There is one action row for the whole update rather than buttons buried in a sub-card. Only an email watch can report a lost source — a deal or quote change must never be described as a missing email. The rule stays expanded with labels in their own column, because it is the only thing that explains why the watch fired; constrained widths replace the list with this pane and provide Back.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `export function DexterMonitorDetailSheet({ monitor, compactBack, onClose, onAskEvent, onAskAttachment }) {\n  const state = dexterWatchState(monitor, t)\n  const email = monitor.latestEvent?.context?.kind === "email" ? monitor.latestEvent.context : null\n  const emailReadable = email?.availability === "available"\n  const emailLost = monitor.capability === "email" && monitor.latestEvent && !emailReadable\n  return (\n    <aside>\n      <header>\n        <h2>{monitor.title}</h2>\n        <StatusPill>{state.label}</StatusPill>\n      </header>\n\n      <section>\n        <h3>What happened</h3>\n        <p>{state.news || monitor.latestEvent?.body}</p>\n        <time dateTime={state.at}>{new Date(state.at).toLocaleString(language)}</time>\n        {emailReadable ? <EmailEvidence email={email} onAskAttachment={onAskAttachment} /> : null}\n        {emailLost ? <UnavailableUpdateState email={email} /> : null}\n        <Button onClick={onAskEvent}>Ask Dexter about this update</Button>\n      </section>\n\n      <section>\n        <h3>What I'm watching</h3>\n        <dl>{/* Looking for - How it checks - On - Last checked */}</dl>\n      </section>\n\n      <footer>\n        <Button onClick={togglePause}>Pause this watch</Button>\n        <Button onClick={onDelete}>Delete</Button>\n      </footer>\n    </aside>\n  )\n}`,
    usageCode: `<AnimatePresence>\n  {selectedMonitor ? (\n    <DexterMonitorDetailSheet\n      monitor={selectedMonitor}\n      onClose={() => setSelectedMonitor(null)}\n    />\n  ) : null}\n</AnimatePresence>`,
  },
  {
    id: "dexter-response-blocks",
    name: "Dexter Response Blocks",
    category: "Agent Dexter",
    description: "Structured answer blocks for customer snapshots, action checklists, and booking risk tables inside Dexter conversations.",
    details: "Use when Dexter returns something the operator should scan or act on. The answer should feel operational, not like a long chat transcript.",
    foundOn: [{ label: "Agent Dexter", route: "/agent-dexter" }, { label: "Components", route: "/components" }],
    componentCode: `<DexterCustomerSnapshot />\n<DexterChecklistCard items={steps} />\n<DexterRiskTable />`,
    usageCode: `<div className="grid grid-cols-[38px_1fr] gap-4">\n  <DexterBrandMark />\n  <div>\n    <p>Dexter</p>\n    <DexterRiskTable />\n  </div>\n</div>`,
  },
  {
    id: "side-drawer",
    name: "Side Drawer",
    category: "Operations",
    description: "The inset slide-in panel used for detail and settings surfaces, with modal and register-inspector modes, direction-aware motion, Escape handling, and focus restore.",
    details: "Use modal mode when a settings task needs exclusive focus. Use non-modal mode when an operator should keep a register visible and switch directly between records, as on Warehouse locations. The panel leans in from its docked edge, flips under right-to-left, and becomes instant when reduced motion is preferred. Pass an icon only when the drawer is a settings surface rather than a record.",
    foundOn: [{ label: "CRM deals", route: "/crm/deals" }, { label: "Warehouse locations", route: "/warehouse/locations" }, { label: "Components", route: "/components" }],
    componentCode: `export function SideDrawer({ open, onClose, eyebrow, title, icon: Icon, width = 480, modal = true, children }) {
  const { direction, t } = useLanguage()
  const reduce = Boolean(useReducedMotion())

  // The panel leans in from whichever edge it is docked to, which flips under right-to-left.
  const offset = direction === "rtl" ? -40 : 40

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <div className={cn("fixed inset-0 z-50 flex justify-end p-3", !modal && "pointer-events-none")} dir={direction}>
          {modal ? <motion.button
            className="absolute inset-0 bg-[rgba(11,20,19,0.14)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion(reduce, mdMotion.fast)}
            onClick={onClose}
          /> : null}
          <motion.aside
            role={modal ? "dialog" : "region"}
            aria-modal={modal ? "true" : undefined}
            aria-label={title}
            className="relative z-10 flex h-full w-full flex-col rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] p-3"
            style={{ maxWidth: width }}
            initial={{ x: offset, opacity: 0, filter: "blur(8px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: offset * 0.7, opacity: 0, filter: "blur(8px)" }}
            transition={reduceMotion(reduce, mdMotion.panel)}
          >
            <DrawerHeader eyebrow={eyebrow} title={title} icon={Icon} onClose={onClose} />
            <div className="md-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}`,
    usageCode: `<SideDrawer\n  open={settingsOpen}\n  onClose={() => setSettingsOpen(false)}\n  eyebrow={t("Deals")}\n  title={t("Pipeline settings")}\n  icon={Settings2}\n  width={980}\n>\n  <CrmSettingsBuilder canEdit={canEdit} />\n</SideDrawer>\n\n<SideDrawer\n  open={Boolean(selectedLocation)}\n  onClose={() => setSelectedLocation(null)}\n  eyebrow={t("Location details")}\n  title={t("Edit location")}\n  modal={false}\n>\n  <LocationForm location={selectedLocation} />\n</SideDrawer>`,
  },
  {
    id: "side-panels",
    name: "Side Panels",
    category: "Operations",
    description: "Supporting panels for activity, AI summaries, metadata, and secondary account context.",
    details: "Use as secondary context beside the main workflow. Side panels should support decisions without competing with the primary task.",
    foundOn: [{ label: "Customer detail", route: "/customers/marlow-apparel" }, { label: "Components", route: "/components" }],
    componentCode: `<CustomerActivityPanel />\n<DexterPulsePanel />\n<AccountPanel />`,
    usageCode: `<div className="flex flex-col gap-5">\n  <DexterPulsePanel />\n  <AccountPanel />\n</div>`,
  },
  {
    id: "crm-sales-command-center",
    name: "CRM Sales Command Center",
    category: "CRM",
    description: "A CRM overview hero panel that frames the sales dashboard around pipeline pressure, forecast confidence, and next best work.",
    details: "Use at the top of CRM overview-style pages when sales needs a quick read before drilling into pipeline, signals, or actions.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmSalesCommandCenter({ focus = crmDashboardFocus }) {\n  return (\n    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">\n      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)]">\n        <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-green-card)] p-5 shadow-[var(--md-shadow-green-card)]">\n          <StatusPill tone="teal">Sales dashboard</StatusPill>\n          <h2>See pipeline pressure, forecast confidence, and the sales work that needs attention now.</h2>\n        </div>\n        <div className="grid gap-3 sm:grid-cols-3">\n          {focus.map((item) => <CrmMiniStat key={item.label} item={item} />)}\n        </div>\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<CrmSalesCommandCenter />\n\n<CrmSalesCommandCenter focus={crmDashboardFocus} />`,
  },
  {
    id: "crm-metrics-grid",
    name: "CRM Metrics Grid",
    category: "CRM",
    description: "A compact relationship KPI row for CRM summary areas.",
    details: "Use when the operator needs commercial health, revenue, follow-up load, and risk in one scan. Do not use on the pure Kanban pipeline view.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmMetricsGrid({ metrics = crmSummaryMetrics }) {\n  return (\n    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">\n      {metrics.map((metric) => (\n        <CrmMetricCard key={metric.label} metric={metric} />\n      ))}\n    </div>\n  )\n}\n\nexport function CrmMetricCard({ metric }) {\n  return (\n    <Surface padding="md" className="min-h-[116px] rounded-[var(--md-radius-xl)]">\n      <p>{metric.label}</p>\n      <strong>{metric.value}</strong>\n      <p>{metric.detail}</p>\n    </Surface>\n  )\n}`,
    usageCode: `<CrmMetricsGrid />\n\n<CrmMetricsGrid metrics={crmSummaryMetrics} />`,
  },
  {
    id: "crm-sales-funnel-panel",
    name: "CRM Sales Funnel Panel",
    category: "CRM",
    description: "A horizontal funnel readout that shows lead volume, open value, and conversion through the sales stages.",
    details: "Use near sales dashboard summaries when the operator needs to spot where lead movement is thinning out.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmSalesFunnelPanel({ stages = crmSalesFunnel }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title="Sales funnel" meta="lead volume to committed revenue" />\n      {stages.map((stage) => (\n        <div key={stage.stage}>\n          <p>{stage.stage}</p>\n          <p>{stage.count} leads - {stage.value}</p>\n          <div style={{ width: \`\${stage.conversion}%\` }} />\n        </div>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<CrmSalesFunnelPanel />\n\n<CrmSalesFunnelPanel stages={crmSalesFunnel} />`,
  },
  {
    id: "crm-revenue-mix-panel",
    name: "CRM Revenue Mix Panel",
    category: "CRM",
    description: "A stacked revenue mix block for new business, renewals, expansion, and recovery value.",
    details: "Use when CRM needs to show what kind of work is making up open revenue, not just the total value.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmRevenueMixPanel({ mix = crmRevenueMix }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title="Revenue mix" meta="where open value is coming from" />\n      <div className="flex h-4 overflow-hidden rounded-full">\n        {mix.map((item) => <span key={item.label} style={{ width: \`\${item.share}%\` }} />)}\n      </div>\n      {mix.map((item) => <RevenueMixRow key={item.label} item={item} />)}\n    </Surface>\n  )\n}`,
    usageCode: `<CrmRevenueMixPanel />\n\n<CrmRevenueMixPanel mix={crmRevenueMix} />`,
  },
  {
    id: "crm-forecast-panel",
    name: "CRM Forecast Panel",
    category: "CRM",
    description: "A compact weekly forecast chart for committed revenue, best case, and attainment confidence.",
    details: "Use beside funnel or revenue mix panels when the sales team needs a fast visual check on forecast shape.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmForecastPanel({ trend = crmForecastTrend }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title="Forecast shape" meta="commit and best case by week" />\n      <div className="grid grid-cols-4 items-end gap-3">\n        {trend.map((item) => <ForecastBar key={item.period} item={item} />)}\n      </div>\n    </Surface>\n  )\n}`,
    usageCode: `<CrmForecastPanel />\n\n<CrmForecastPanel trend={crmForecastTrend} />`,
  },
  {
    id: "crm-priority-actions-panel",
    name: "CRM Priority Actions Panel",
    category: "CRM",
    description: "A sales action queue ranked by urgency, revenue impact, owner, and account.",
    details: "Use on CRM overview when the page should make the next commercial action obvious without opening a deal card.",
    foundOn: [{ label: "CRM overview", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmPriorityActionsPanel({ actions = crmPriorityActions }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title="Priority actions" meta="ranked by revenue and urgency" />\n      {actions.map((action) => (\n        <button key={action.title} type="button">\n          <span>{action.title}</span>\n          <StatusPill tone={action.tone}>{action.due}</StatusPill>\n          <span>{action.impact}</span>\n        </button>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<CrmPriorityActionsPanel />\n\n<CrmPriorityActionsPanel actions={crmPriorityActions} />`,
  },
  {
    id: "crm-pipeline-board",
    name: "CRM Pipeline Board",
    category: "CRM",
    description: "A switchable commercial pipeline board for quote follow-ups, renewals, service recovery, conversion work, and handoffs.",
    details: "Use when CRM work needs stage context. Each pipeline can have its own columns and lead cards, while each card keeps account, contact, value, urgency, and next step visible. Dragging uses the shared Databrain live-slot preview and commits stage and order on release.",
    foundOn: [{ label: "CRM", route: "/crm" }, { label: "CRM deals", route: "/crm/deals" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmPipelineBoard({ pipelines = crmPipelineBoards, selectedDealId, onSelectDeal }) {\n  const [boardStages, setBoardStages] = useState(() => cloneStages(pipelines[0].stages))\n  const kanban = useKanbanPointerDrag({\n    columns: boardStages.map((stage) => ({ id: stage.id, tasks: stage.deals })),\n    getId: (deal) => deal.id,\n    onCommit: ({ columns }) => setBoardStages((current) => current.map((stage) => ({\n      ...stage,\n      deals: columns.find((column) => column.id === stage.id)?.tasks ?? stage.deals,\n    }))),\n  })\n\n  return <PipelineColumns ref={kanban.boardRef} columns={kanban.previewColumns} drag={kanban} selectedDealId={selectedDealId} onSelectDeal={onSelectDeal} />\n}`,
    usageCode: `<CrmPipelineBoard\n  selectedDealId={detailOpen ? selectedDeal.id : undefined}\n  onSelectDeal={(deal) => {\n    setSelectedDeal(deal)\n    setDetailOpen(true)\n  }}\n  onPipelineChange={(pipeline) => {\n    setSelectedDeal(firstDeal(pipeline))\n    setDetailOpen(false)\n  }}\n  onOpenSettings={() => setSettingsOpen(true)}\n/>\n<DealDetailDrawer deal={selectedDeal} open={detailOpen} />\n<PipelineSettingsDrawer open={settingsOpen} />`,
  },
  {
    id: "drive-folder-tile",
    name: "Drive Folder Tile",
    category: "CRM",
    description: "A folder in Drive, carrying the colour and icon the operator chose for it.",
    details: "Use in the Drive grid. Two thin sheets sit behind the top edge so the tile reads as something that holds files rather than as another card, and they fan out a little further on hover. Colour comes from the ten accent presets, so a folder can only land on a tone already checked for contrast in both themes. The meta line counts the whole subtree, not just the immediate children. Right-click opens open, rename, colour and icon, and delete.",
    foundOn: [{ label: "Drive", route: "/crm/drive" }, { label: "Components", route: "/components?component=drive-folder-tile" }],
    componentCode: `export function DriveFolderTile({ folder, stats, renaming, onOpen, onRename, onCustomise, onDelete }) {
  const Icon = folderIconGlyphs[folder.icon]

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="button" tabIndex={0} className="md-drive-folder md-drive-tone" style={driveToneStyle(folder.colour)} onClick={() => onOpen(folder)}>
          <span className="md-drive-folder__sheet md-drive-folder__sheet--back" />
          <span className="md-drive-folder__sheet md-drive-folder__sheet--front" />
          <div className="md-drive-folder__body">
            <span className="md-drive-folder__icon"><Icon /></span>
            <DriveInlineName value={folder.name} editing={renaming} onCommit={(next) => onRename(folder, next)} />
            <span>{folderMeta(stats)}</span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>…</ContextMenuContent>
    </ContextMenu>
  )
}`,
    usageCode: `<div className="md-drive-grid">
  {childFolders.map((folder) => (
    <DriveGridItem key={folder.id} revealDelay={entryDelay(index)}>
      <DriveFolderTile
        folder={folder}
        stats={stats?.get(folder.id)}
        renaming={renamingId === folder.id}
        onOpen={openFolder}
        onRename={renameFolder}
        onStartRename={(target) => setRenamingId(target.id)}
        onCancelRename={() => setRenamingId(null)}
        onCustomise={startCustomiseFolder}
        onDelete={(target) => setRemoval({ kind: "folder", folder: target })}
      />
    </DriveGridItem>
  ))}
</div>`,
  },
  {
    id: "drive-file-tile",
    name: "Drive File Tile",
    category: "CRM",
    description: "A stored file shown as its own picture, with an inline preview that paints on the first frame.",
    details: "Use in the Drive grid. The thumbnail arrives in two passes over one box: the ~1 KB preview seed carried on the file row paints immediately, blurred, and the stored WebP thumbnail cross-fades over it once decoded. The seed is never removed, so the box is never empty and nothing can flicker. Files with no renderable preview show their type glyph instead. Set `pending` while a file is still uploading to hold the same box with a progress ring, so nothing moves when the upload lands.",
    foundOn: [{ label: "Drive", route: "/crm/drive" }, { label: "Components", route: "/components?component=drive-file-tile" }],
    componentCode: `export function DriveFileTile({ file, thumbnailUrl, pending, progress, renaming, onOpen, onRename, onDownload, onDelete }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="button" tabIndex={0} className="md-drive-file" onClick={() => onOpen(file)}>
          <span className="md-drive-thumb" data-fit={thumbnailFit(driveKindOf(file))}>
            {file.previewSeed ? <img src={file.previewSeed} className="md-drive-thumb__layer md-drive-thumb__seed" /> : null}
            {thumbnailUrl ? <img src={thumbnailUrl} data-loaded={loaded} className="md-drive-thumb__layer md-drive-thumb__image" onLoad={() => setLoaded(true)} /> : null}
            {pending ? <DriveProgressRing value={progress} /> : null}
          </span>
          <DriveInlineName value={file.name} editing={renaming} onCommit={(next) => onRename(file, next)} />
          <span>{driveFileTypeLabel(file)} · {formatDriveBytes(file.sizeBytes)}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>…</ContextMenuContent>
    </ContextMenu>
  )
}`,
    usageCode: `<DriveFileTile
  file={file}
  thumbnailUrl={file.thumbnailPath ? thumbnailUrls[file.thumbnailPath] : null}
  pending={Boolean(upload)}
  progress={upload?.progress}
  renaming={renamingId === file.id}
  onOpen={openPreview}
  onRename={renameFile}
  onStartRename={(target) => setRenamingId(target.id)}
  onCancelRename={() => setRenamingId(null)}
  onDownload={download}
  onDelete={(target) => setRemoval({ kind: "file", file: target })}
/>`,
  },
  {
    id: "organisation-foundation-panel",
    name: "Organisation Foundation Panel",
    category: "CRM",
    description: "The shared company setup surface for editable codes, responsible offices, operational addresses, opening hours, and destination-aware related-party defaults.",
    details: "Use on a company record after its identity and types are established. It keeps one Companies register while allowing the same organisation to be classified as a customer, supplier, or both. Address purposes can share one physical address, but each purpose has one explicit default.",
    foundOn: [{ label: "Company details", route: "/crm/accounts/de1000c1-5eed-4ead-8000-000000000001" }, { label: "Companies", route: "/crm/accounts" }, { label: "Components", route: "/components?component=organisation-foundation-panel" }],
    componentCode: `export function OrganisationFoundationPanel({ account, reference, onChange }) {
  return (
    <Surface padding="none">
      <CompanySetup code={account.accountCode} scope={account.scopeCode} offices={account.officeAssignments} />
      <OperationalAddresses
        addresses={account.addresses}
        capabilities={account.addressCapabilities}
        onSave={(address) => saveOrganisationAddress(account.id, address, account.editVersion)}
      />
      <RelatedPartyDefaults
        defaults={account.relatedPartyDefaults}
        onSave={(rule) => saveRelatedPartyDefault(account.id, rule, account.editVersion)}
      />
    </Surface>
  )
}`,
    usageCode: `<OrganisationFoundationPanel
  account={company}
  reference={crmReference}
  onChange={setCompany}
/>`,
  },
  {
    id: "contact-create-dialog",
    name: "Contact Create Dialog",
    category: "CRM",
    description: "The shared account-linked form for creating a CRM contact with role, department, and recorded marketing consent.",
    details: "Use from the Contacts directory or inside an account workspace. Pass a fixed account when the operator starts from an account so the same form stays scoped to that customer.",
    foundOn: [{ label: "CRM contacts", route: "/crm/contacts" }, { label: "Account details", route: "/crm/accounts/de1000c1-5eed-4ead-8000-000000000001" }, { label: "Components", route: "/components?component=contact-create-dialog" }],
    componentCode: `export function ContactCreateDialog({ open, onOpenChange, accounts, fixedAccountId, onCreated }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>Connect this person to an account and record only what helps the relationship now.</DialogDescription>
        </DialogHeader>
        <form onSubmit={createContact}>
          <AccountSelect accounts={accounts} value={fixedAccountId ?? accountId} disabled={Boolean(fixedAccountId)} />
          <ContactIdentityFields />
          <ContactRoleFields />
          <MarketingConsentFields />
          <DialogFooter><Button type="submit">Create contact</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}`,
    usageCode: `<ContactCreateDialog
  open={createOpen}
  onOpenChange={setCreateOpen}
  accounts={accounts}
  onCreated={(contact) => navigate(\`/crm/contacts/\${contact.id}\`)}
/>

<ContactCreateDialog
  open={createOpen}
  onOpenChange={setCreateOpen}
  accounts={[account]}
  fixedAccountId={account.id}
  onCreated={refreshAccount}
/>`,
  },
  {
    id: "crm-contact-table",
    name: "CRM Contact Table",
    category: "CRM",
    description: "A relationship contact table for account stakeholders, preferences, last touch, and quick actions.",
    details: "Use when contacts need to be scanned across leads. Emails and phone numbers should remain readable in right-to-left layouts.",
    foundOn: [{ label: "CRM contacts", route: "/crm/contacts" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmContactTable({ contacts = crmContacts, selectedEmail, onSelectContact }) {\n  return (\n    <Table>\n      <TableHeader>{/* contact, account, relationship, last touch, actions */}</TableHeader>\n      <TableBody>\n        {contacts.map((contact) => (\n          <TableRow key={contact.email} onClick={() => onSelectContact?.(contact)}>\n            <TableCell>\n              <CustomerAvatar initials={contact.initials} tone={contact.tone} />\n              <span>{contact.name}</span>\n              <span data-i18n-skip dir="ltr">{contact.email}</span>\n            </TableCell>\n            <TableCell>{contact.account}</TableCell>\n            <TableCell><StatusPill>{contact.relationship}</StatusPill></TableCell>\n          </TableRow>\n        ))}\n      </TableBody>\n    </Table>\n  )\n}`,
    usageCode: `<CrmContactTable\n  contacts={crmContacts}\n  selectedEmail={selectedEmail}\n  onSelectContact={(contact) => setSelectedEmail(contact.email)}\n/>`,
  },
  {
    id: "crm-lead-qualification-table",
    name: "CRM Lead Qualification Table",
    category: "CRM",
    description: "A lead worklist for qualification, ownership, engagement, follow-up, age, and genuine opportunity context.",
    details: "Use on the Leads route instead of customer-performance tables. Values come from CRM lead, activity, qualification, owner, and source-linked opportunity records; never infer bookings or customer revenue for a prospect.",
    foundOn: [{ label: "CRM leads", route: "/crm/leads" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmLeadQualificationTable({ leads, onOpenLead, ownerPhotoUrls }) {
  return (
    <Table>
      <TableHeader>{/* lead, primary contact, source, owner, stage, qualification, engagement, follow-up, age, value */}</TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id} onClick={() => onOpenLead(lead)}>
            <TableCell>{lead.companyName}</TableCell>
            <TableCell>{lead.primaryContactName}</TableCell>
            <TableCell>{lead.sourceName}</TableCell>
            <TableCell>{lead.ownerName}</TableCell>
            <TableCell><StatusPill>{lead.statusName}</StatusPill></TableCell>
            <TableCell><StatusPill>{lead.ratingName}</StatusPill></TableCell>
            <TableCell>{lead.lastActivitySubject}</TableCell>
            <TableCell>{lead.nextFollowUpAt}</TableCell>
            <TableCell>{lead.createdAt}</TableCell>
            <TableCell>{lead.valueAmount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}`,
    usageCode: `<CrmLeadQualificationTable
  leads={liveLeads}
  ownerPhotoUrls={signedOwnerPhotoUrls}
  onOpenLead={(lead) => navigate(\`/crm/leads/\${lead.id}\`)}
  emptyMessage="No leads have been recorded yet."
/>`,
  },
  {
    id: "copyable-field",
    name: "Copyable Field",
    category: "CRM",
    description: "A text value with a nearby hover and keyboard copy affordance, then the shared blur-slot feedback that changes the value to Copied.",
    details: "Use for useful text values such as emails, websites, phone numbers, addresses, references, dates, and commercial figures. The transition is chosen from the value itself, so no page has to pick one: short single-line text uses the same letter-by-letter blur slot as the Quotes header reference, while wrapped, very long, and right-to-left values fade and wipe as one block so feedback stays fast and text shaping stays intact. Values narrower than the word Copied grow their box first and hold it open until the value has slotted back, so nothing overlaps or clips. The control sits on the first line of the value. Keep links functional, copy the canonical value, and leave images and missing values non-interactive.",
    foundOn: [{ label: "CRM lead detail", route: "/crm/leads" }, { label: "Quote detail header", route: "/quotes/3" }, { label: "Components", route: "/components?component=copyable-field" }],
    componentCode: `export function CopyableField({ label, value, copyValue = value, children }) {
  const [copied, setCopied] = useState(false)

  async function copyField() {
    await navigator.clipboard.writeText(copyValue)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div data-copied={copied || undefined} className="group/copy inline-flex max-w-full items-center">
      <div className="relative min-w-0 overflow-hidden">
        <CopyFeedbackTransition
          value={copyValue}
          copiedValue="Copied"
          active={copied}
          effect="auto"
        >
          {children ?? value}
        </CopyFeedbackTransition>
      </div>
      <button type="button" aria-label={copied ? \`\${label}: Copied\` : \`Copy \${label}\`} onClick={copyField}>
        <Copy />
      </button>
    </div>
  )
}`,
    usageCode: `<CopyableField
  label="Company email"
  value={lead.company.email}
>
  <a href={\`mailto:\${lead.company.email}\`}>
    {lead.company.email}
  </a>
</CopyableField>`,
  },
  {
    id: "crm-lead-detail-panel",
    name: "CRM Lead Detail Workspace",
    category: "CRM",
    description: "A company-focused lead workspace with qualification context, customer information, contacts, activity, and a compact sticky company overview.",
    details: "Use on a live CRM lead route. Keep the right overview short enough to remain above the fold, with direct shader treatment and the most useful company fields. Put the complete customer record in the main workspace, return all contacts linked to the lead organisation, and preserve the captured primary-contact fallback for unlinked leads.",
    foundOn: [{ label: "CRM leads", route: "/crm/leads" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmLeadDetailPanel({ lead, ownerPhotoUrl, onBack, onStartQualification }) {\n  return (\n    <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">\n      <Surface padding="none">\n        <LeadRecordHeader lead={lead} ownerPhotoUrl={ownerPhotoUrl} onBack={onBack} />\n        <LeadQualificationSummary lead={lead} />\n        <LeadContacts lead={lead} />\n        <LeadCustomerInformation lead={lead} />\n        <LeadActivityAndContext lead={lead} />\n      </Surface>\n      <LeadCompanyOverview lead={lead} className="xl:sticky xl:top-[76px]" />\n    </div>\n  )\n}`,
    usageCode: `<CrmLeadDetailPanel\n  lead={liveLeadDetail}\n  ownerPhotoUrl={signedOwnerPhotoUrl}\n  onBack={() => navigate("/crm/leads")}\n  onStartQualification={(lead) => openQualification(lead.id)}\n/>`,
  },
  {
    id: "crm-activity-timeline",
    name: "CRM Activity Timeline",
    category: "CRM",
    description: "A relationship timeline that blends email, AI signals, quotes, booking exceptions, and account notes.",
    details: "Use when the operator needs to understand what changed across leads. It adapts the shared Audit Timeline so chronology, interaction, accessibility, and responsive behaviour stay consistent with Core activity. Compact mode is useful beside another primary workflow.",
    foundOn: [{ label: "CRM", route: "/crm" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmActivityTimeline({ activities = crmActivities, compact, loading, error, onRetry, onOpenContext }) {\n  const timelineEvents = activities.map(toAuditTimelineEvent)\n\n  return (\n    <AuditTimeline\n      events={timelineEvents}\n      title="Relationship activity"\n      description={compact ? "Latest customer signals" : "AI, email, sales, and booking events"}\n      loading={loading}\n      error={error}\n      emptyMessage="No relationship activity yet."\n      onRetry={onRetry}\n      onContextSelect={(event) => onOpenContext?.(event.contextRoute)}\n      groupConsecutiveDates\n      showCompletedCheck={false}\n      compact={compact}\n    />\n  )\n}`,
    usageCode: `<CrmActivityTimeline onOpenContext={navigate} />\n<CrmActivityTimeline activities={crmActivities.slice(0, 3)} compact />\n<CrmActivityTimeline activities={[]} />`,
  },
  {
    id: "crm-lead-signals",
    name: "CRM Lead Signals",
    category: "CRM",
    description: "A ranked lead signal list for expansion, watch, and risk moments.",
    details: "Use beside CRM workflows when AI or account data points to a relationship issue worth acting on.",
    foundOn: [{ label: "CRM", route: "/crm" }, { label: "CRM leads", route: "/crm/leads" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmLeadSignalList({ signals = crmAccountSignals, onOpenLead }) {\n  return (\n    <Surface padding="none">\n      <SectionHeader title="Lead signals" meta="ranked by commercial impact" />\n      {signals.map((signal) => (\n        <button key={signal.account} onClick={() => onOpenLead?.(signal)}>\n          <CustomerAvatar initials={signal.initials} tone={signal.tone} />\n          <span>{signal.account}</span>\n          <span>{signal.signal}</span>\n          <StatusPill tone={signal.statusTone}>{signal.status}</StatusPill>\n        </button>\n      ))}\n    </Surface>\n  )\n}`,
    usageCode: `<CrmLeadSignalList\n  signals={crmAccountSignals}\n  onOpenLead={(signal) => navigate("/crm/leads")}\n/>`,
  },
  {
    id: "crm-pipeline-editor",
    name: "CRM Pipeline Editor",
    category: "CRM",
    description: "A direct-manipulation canvas for shaping a sales process: drag stages to reorder, insert between them, rename in place, and tune the selected stage below.",
    details: "Use when an operator needs to shape the sales process itself. Stage cards sit on a flow line over a faint canvas grid and all share one width, so reordering resolves to exact slots instead of guessing from whatever sits under the pointer. Dragging lifts the card with a velocity-led tilt while its neighbours part in a staggered wave, edge scrolling ramps in when you reach past the rail, and the new order is only committed once the drop spring has settled so nothing snaps. An accent tether under the rail slides to the selected card and links it to the inspector below. Pointer drag, the move buttons, and Alt with the arrow keys are equivalent reorder paths.",
    foundOn: [{ label: "CRM deals", route: "/crm/deals" }, { label: "CRM settings", route: "/crm/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmPipelineEditor({ pipelines }) {
  const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id)
  const [heldId, setHeldId] = useState(null)

  // Uniform slots, so a stage's resting position is always an exact multiple of the pitch.
  const dragOffset = useMotionValue(0)
  const rotate = useTransform(useSpring(useVelocity(dragOffset)), [-2600, 0, 2600], [-2, 0, 2], { clamp: true })

  function handlePointerMove(event) {
    const travelled = (event.clientX - active.startX) * dirSign
    dragOffset.set(withEdgeResistance(travelled, min, max) * dirSign)

    // Hysteresis stops a card oscillating while the pointer sits on a slot boundary.
    const slots = clamp(travelled, min, max) / CARD_PITCH
    while (slots > slot + 0.5 + SLOT_HYSTERESIS) slot += 1
    while (slots < slot - 0.5 - SLOT_HYSTERESIS) slot -= 1
    applySlotShift(active.from, active.to = clamp(active.from + slot, 0, stages.length - 1))
  }

  function handlePointerUp() {
    // The card glides home first, so the reorder commit is never visible as a jump.
    void animate(dragOffset, (to - from) * CARD_PITCH * dirSign, dropSpring)
      .then(() => updatePipeline((p) => ({ ...p, stages: moveItem(p.stages, from, to) })))
  }

  return (
    <Surface padding="none">
      <PipelineToolbar name={pipeline.name} dirty={dirty} onSave={saveChanges} />
      <ol onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        {stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            x={stage.id === heldId ? dragOffset : cardValue(stage.id)}
            rotate={rotate}
            presence={presenceValue(stage.id)}
            onInsertBefore={() => insertStage(index)}
          />
        ))}
        <AddStageCard onClick={() => insertStage(stages.length)} />
      </ol>
      <SelectionTether x={tetherX} hidden={dragging} />
      <StageInspector stage={selectedStage} onChange={updateStage} onRemove={removeStage} />
    </Surface>
  )
}`,
    usageCode: `<CrmPipelineEditor pipelines={crmPipelineSettings} />\n<CrmPipelineEditor pipelines={[]} loading />\n<CrmPipelineEditor pipelines={[]} error="Pipelines could not load." onRetry={refetch} />`,
  },
  {
    id: "crm-settings-builder",
    name: "CRM Settings Builder",
    category: "CRM",
    description: "The composed CRM settings surface combining the visual pipeline editor with deal-card field visibility and customer-conversion rules.",
    details: "Use from the Deals pipeline settings drawer or the direct settings route. The visual pipeline editor owns pipeline changes, while the deal-card selector lets operators choose up to three useful details to scan without opening a deal.",
    foundOn: [{ label: "CRM deals", route: "/crm/deals" }, { label: "CRM settings", route: "/crm/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function CrmSettingsBuilder({ pipelines = crmPipelineSettings }) {\n  const [dealCardFields, setDealCardFields] = useDealCardFields()\n\n  return (\n    <div className="grid gap-5">\n      <CrmPipelineEditor pipelines={pipelines} />\n      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">\n        <DealCardFieldSelector value={dealCardFields} max={3} onChange={setDealCardFields} />\n        <CustomerConversionRule pipeline={pipelines[0]} />\n      </div>\n    </div>\n  )\n}`,
    usageCode: `<CrmSettingsBuilder pipelines={crmPipelineSettings} />`,
  },
  {
    id: "settings-rail",
    name: "Settings Rail",
    category: "Navigation",
    description: "A grouped secondary rail for embedded configuration areas that cannot use the product's primary sidebar.",
    details: "Use only for an embedded configuration workspace. Full account settings now drill into the main application sidebar so the product never shows two competing navigation rails.",
    foundOn: [{ label: "Components", route: "/components?component=settings-rail" }],
    componentCode: `export function SettingsRail({ groups, activeTab, onChange, onBack }) {\n  return (\n    <aside className="flex min-h-screen w-[260px] flex-col bg-[var(--md-surface-tint)] px-5 py-6">\n      <button onClick={onBack}>Back</button>\n      <h1>Settings</h1>\n      {groups.map((group) => (\n        <nav key={group.label}>\n          <p>{group.label}</p>\n          {group.items.map((item) => (\n            <button aria-current={activeTab === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>\n              {item.label}\n            </button>\n          ))}\n        </nav>\n      ))}\n    </aside>\n  )\n}`,
    usageCode: `<SettingsRail\n  groups={settingsGroups}\n  activeTab={activeTab}\n  onChange={setActiveTab}\n  onBack={() => navigate("/")}\n/>`,
  },
  {
    id: "settings-panel-row",
    name: "Settings Panel Row",
    category: "Foundation",
    description: "The repeated settings form structure: a quiet panel with labelled rows and aligned controls.",
    details: "Use when a setting needs a label, short explanation, and a control. It keeps settings pages scannable without turning every field into a separate card.",
    foundOn: [{ label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function SettingsPanel({ title, description, action, children }) {\n  return (\n    <section className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">\n      <div className="px-5 py-4">\n        <SectionHeader title={title} meta={description} action={action} metaClassName="text-[13px] leading-5" />\n      </div>\n      <div className="divide-y divide-[rgba(11,20,19,0.07)] shadow-[var(--md-stroke-top)]">{children}</div>\n    </section>\n  )\n}\n\nexport function SettingsFieldRow({ label, description, children }) {\n  return (\n    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(160px,260px)_minmax(0,1fr)]">\n      <div>\n        <p>{label}</p>\n        <p>{description}</p>\n      </div>\n      <div>{children}</div>\n    </div>\n  )\n}`,
    usageCode: `<SettingsPanel title="Working schedule" description="Used for notifications and escalation.">\n  <SettingsFieldRow label="Time zone">\n    <SettingsSelect value={timezone} options={timezones} onChange={setTimezone} />\n  </SettingsFieldRow>\n</SettingsPanel>`,
  },
  {
    id: "settings-integration-row",
    name: "Settings Integration Row",
    category: "Foundation",
    description: "A compact connector row for personal tools such as Gmail, Outlook, calendars, file storage, chat, and project systems.",
    details: "Use inside profile or settings panels when a user needs to connect, manage, or review one external tool. Keep the row factual: tool, why it matters, status, and the next action.",
    foundOn: [{ label: "Components", route: "/components?component=settings-integration-row" }],
    componentCode: `export function SettingsIntegrationRow({ icon: Icon, title, description, status, actionLabel, onAction }) {\n  return (\n    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center">\n      <div className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">\n        <Icon />\n      </div>\n      <div>\n        <p>{title}</p>\n        <span>{status}</span>\n        <p>{description}</p>\n      </div>\n      <button onClick={onAction}>{actionLabel}</button>\n    </div>\n  )\n}`,
    usageCode: `<SettingsPanel title="Connected tools">\n  <SettingsIntegrationRow\n    icon={Mail}\n    title="Gmail"\n    description="Connect your Google inbox for customer replies, quote follow-ups, and approved Dexter drafts."\n    status="Ready"\n    actionLabel="Connect"\n    onAction={connectGmail}\n  />\n</SettingsPanel>`,
  },
  {
    id: "settings-controls",
    name: "Settings Controls",
    category: "Navigation",
    description: "Compact input, select, switch, and adaptive choice controls for settings pages.",
    details: "Use these inside settings rows so field heights, radius, shadows, focus states, and choice behaviour stay consistent across every tab.",
    foundOn: [{ label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function SettingsInput(props) {\n  return <Input className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]" {...props} />\n}\n\nexport function SettingsChoiceGroup({ options, value, onChange }) {\n  return <ChoiceControl options={options} value={value} onChange={onChange} ariaLabel="Choose an option" />\n}`,
    usageCode: `<SettingsFieldRow label="Approval rule">\n  <SettingsChoiceGroup\n    options={["Always ask", "Ask non-reversible", "Never ask"]}\n    value={approvalRule}\n    onChange={setApprovalRule}\n  />\n</SettingsFieldRow>`,
  },
  {
    id: "settings-option-card",
    name: "Settings Option Card",
    category: "Navigation",
    description: "A larger selectable setting for choices that need short explanatory copy, such as Agent Dexter's autonomy level.",
    details: "Use when the operator is choosing a mode and needs to understand the behaviour before selecting it.",
    foundOn: [{ label: "Components", route: "/components?component=settings-option-card" }],
    componentCode: `export function SettingsOptionCard({ label, description, selected, onClick }) {\n  return (\n    <button aria-pressed={selected} onClick={onClick} className={cn("rounded-[var(--md-radius-lg)] p-4", selected && "bg-[rgba(14,125,116,0.08)]")}>\n      <span>{selected ? <Check /> : null}</span>\n      <p>{label}</p>\n      <p>{description}</p>\n    </button>\n  )\n}`,
    usageCode: `<SettingsOptionCard\n  label="Suggest"\n  description="Drafts and proposes. Always asks before sending or changing data."\n  selected={autonomy === "Suggest"}\n  onClick={() => setAutonomy("Suggest")}\n/>`,
  },
  {
    id: "settings-summary-card",
    name: "Settings Summary Card",
    category: "Data",
    description: "A compact right-side summary for profile facts, usage totals, support cover, and settings health.",
    details: "Use beside the main settings form when a page needs stable reference data rather than another editable panel.",
    foundOn: [{ label: "Settings", route: "/settings" }, { label: "Components", route: "/components" }],
    componentCode: `export function SettingsSummaryCard({ title, rows }) {\n  return (\n    <aside className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">\n      <p>{title}</p>\n      {rows.map(([label, value]) => (\n        <div key={label}>\n          <span>{label}</span>\n          <span>{value}</span>\n        </div>\n      ))}\n    </aside>\n  )\n}`,
    usageCode: `<SettingsSummaryCard\n  title="At a glance"\n  rows={[\n    ["Member since", "Jan 2024"],\n    ["Bookings handled", "1,847"],\n    ["Role", "Admin - Ops"],\n  ]}\n/>`,
  },
  {
    id: "settings-progress-ring",
    name: "Settings Progress Ring",
    category: "Data",
    description: "A compact, labelled progress signal for profile readiness, security posture, seat use, and AI budgets.",
    details: "Use for one bounded percentage where the label and supporting detail explain what the number means. The ring is redundant to visible text, uses semantic colour sparingly, and remains static under reduced motion.",
    foundOn: [
      { label: "Profile", route: "/settings" },
      { label: "Security", route: "/settings?tab=security" },
      { label: "AI usage", route: "/admin/ai-usage" },
      { label: "Components", route: "/components?component=settings-progress-ring" },
    ],
    componentCode: `export function SettingsProgressRing({ value, label, detail, tone = "accent" }) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div role="img" aria-label={label + ": " + clampedValue + "%. " + detail}>
      <span
        className="md-settings-progress-ring"
        style={{ "--md-settings-progress": clampedValue + "%" }}
      >
        <span>{clampedValue}%</span>
      </span>
      <span>
        <strong>{label}</strong>
        <span>{detail}</span>
      </span>
    </div>
  )
}`,
    usageCode: `<SettingsProgressRing
  value={68}
  label="Monthly AI budget"
  detail="EUR 1,024 of EUR 1,500 used"
  tone="blue"
/>`,
  },
  {
    id: "auth-workspace-router",
    name: "Auth Workspace Router",
    category: "Navigation",
    description: "A configurable company chooser that routes customers and Databrain testers from multideck.app to the correct isolated workspace.",
    details: "Use only on the root Multideck domain. It lists only provisioned companies supplied by configuration; before any companies are live, it remains a workspace-name field for internal testing. Sign-in and all Supabase access happen only after the redirect inside the selected tenant deployment.",
    foundOn: [{ label: "Workspace access", route: "/auth" }, { label: "Components", route: "/components?component=auth-workspace-router" }],
    componentCode: `export function WorkspaceRouterPanel({ onContinue }) {
  const [workspace, setWorkspace] = useState("")

  function openWorkspace(value = workspace) {
    const slug = parseWorkspaceSlug(value)
    if (!isValidWorkspaceSlug(slug)) return
    onContinue?.(slug) ?? window.location.assign(
      new URL("/auth", "https://" + slug + ".multideck.app").toString()
    )
  }

  return <WorkspaceDirectory
    workspaces={configuredWorkspaces}
    onSelect={openWorkspace}
    fallback={<WorkspaceField value={workspace} onChange={setWorkspace} onSubmit={openWorkspace} />}
  />
}`,
    usageCode: `<WorkspaceRouterPanel
  workspaces={[
    { slug: "example", name: "Example company" },
  ]}
  onContinue={(workspace) => {
    window.location.assign(\`https://\${workspace}.multideck.app/auth\`)
  }}
/>`,
  },
  {
    id: "auth-provider-selector",
    name: "Auth Provider Selector",
    category: "Navigation",
    description: "A compact provider chooser for Google, passkeys, LinkedIn, Facebook, and Microsoft.",
    details: "Use on invite-only sign-in screens. Each option starts authentication for an identity that has already been connected to a Multideck account.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components?component=auth-provider-selector" }],
    componentCode: `export function AuthProviderSelector({ busyProvider, onSelect }) {
  return (
    <div className="grid grid-cols-5 gap-2.5" role="group" aria-label="Sign-in providers">
      {authProviderDefinitions.map((provider) => (
        <button
          key={provider.id}
          aria-label={"Continue with " + provider.label}
          onClick={() => onSelect(provider.id)}
        >
          <AuthProviderMark provider={provider.id} />
        </button>
      ))}
    </div>
  )
}`,
    usageCode: `<AuthProviderSelector
  busyProvider={busyProvider}
  onSelect={signInWithProvider}
/>`,
  },
  {
    id: "auth-identity-manager",
    name: "Auth Identity Manager",
    category: "Operations",
    description: "The account-security list for connecting Google, passkeys, LinkedIn, Facebook, and Microsoft after an administrator creates the user.",
    details: "Use in Login & security for invite-only workspaces. It reads real Supabase identities and registers passkeys against the signed-in user.",
    foundOn: [{ label: "Login & security", route: "/settings?tab=security" }, { label: "Components", route: "/components?component=auth-identity-manager" }],
    componentCode: `export function AuthIdentityManager() {
  async function connectProvider(provider) {
    await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin + "/settings?tab=security" },
    })
  }

  async function registerPasskey() {
    await supabase.auth.registerPasskey()
  }

  return <SignInMethodList onConnect={connectProvider} onRegisterPasskey={registerPasskey} />
}`,
    usageCode: `<SettingsPanel
  title="Sign-in methods"
  description="Connect optional identities here for future sign-ins."
>
  <AuthIdentityManager embedded />
</SettingsPanel>`,
  },
  {
    id: "auth-narrative-panel",
    name: "Auth Narrative Panel",
    category: "Operations",
    description: "The branded freight context panel used beside auth forms, with the same animated shader as Dexter surfaces.",
    details: "Use as the left-side context module for auth and session handoff states. It reuses the shared Dexter shader rather than introducing a separate visual effect.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components?component=auth-narrative-panel" }],
    componentCode: `export function FreightNarrative({ step = "signin", className }) {\n  const copy = authCopyByStep[step]\n\n  return (\n    <aside className={cn("relative flex min-h-[720px] overflow-hidden bg-[#062420] text-white", className)}>\n      <div className="absolute inset-0"><SpectralBloomShader /></div>\n      <BrandLockup inverted />\n      <h1>{copy.title}</h1>\n      <p>{copy.body}</p>\n      {authBookings.map((booking) => <AuthBookingCard key={booking.id} booking={booking} />)}\n      <p>{copy.footnote}</p>\n    </aside>\n  )\n}`,
    usageCode: `<FreightNarrative step="signin" />\n<FreightNarrative step="verify" />\n<FreightNarrative step="signed-out" />`,
  },
  {
    id: "auth-sign-in-panel",
    name: "Auth Sign In Panel",
    category: "Navigation",
    description: "The invite-only sign-in panel with connected identity providers and a simple email-and-password fallback.",
    details: "Use for the first auth step. It deliberately offers no sign-up action: workspace administrators create accounts and users connect additional identities from Login & security.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components" }],
    componentCode: `export function SignInPanel({ email, password, onEmailChange, onPasswordChange, onPasswordSignIn, onProviderSignIn }) {\n  return (\n    <div className="w-full max-w-[520px]">\n      <BrandLockup />\n      <h2>Sign in to Multideck</h2>\n      <AuthProviderSelector onSelect={onProviderSignIn} />\n      <p>or use email and password</p>\n      <PasswordSignInForm email={email} password={password} onEmailChange={onEmailChange} onPasswordChange={onPasswordChange} onSubmit={onPasswordSignIn} />\n      <p>Accounts are created by your workspace administrator.</p>\n    </div>\n  )\n}`,
    usageCode: `<SignInPanel\n  email={email}\n  password={password}\n  onEmailChange={setEmail}\n  onPasswordChange={setPassword}\n  onPasswordSignIn={signInWithPassword}\n  onProviderSignIn={signInWithProvider}\n  busyProvider={busyProvider}\n  isSubmitting={isSubmitting}\n  error={authError}\n/>`,
  },
  {
    id: "auth-verification-panel",
    name: "Auth Verification Panel",
    category: "Navigation",
    description: "The inbox verification panel that combines the mail icon, sent-to email, six-digit code input, resend actions, and session note.",
    details: "Use after a work email has been submitted. Keep resend and different-email actions inside this panel so the flow remains self-contained.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components" }],
    componentCode: `export function VerifyPanel({ email, code, onCodeChange, onBack, onComplete, onResend, isSubmitting, error }) {\n  return (\n    <div className="w-full max-w-[600px]">\n      <Mail />\n      <h2>Check your inbox</h2>\n      <p>We sent a code to {email}</p>\n      <CodeInput code={code} onCodeChange={onCodeChange} onComplete={onComplete} disabled={isSubmitting} />\n      <AuthAlert tone="error">{error}</AuthAlert>\n      <button onClick={onResend}>Resend</button>\n      <button onClick={onBack}>Use a different email</button>\n    </div>\n  )\n}`,
    usageCode: `<VerifyPanel\n  email={email}\n  code={code}\n  onCodeChange={setCode}\n  onBack={() => setStep("signin")}\n  onComplete={verifyCode}\n  onResend={sendMagicLink}\n  isSubmitting={isSubmitting}\n  error={authError}\n/>`,
  },
  {
    id: "auth-code-input",
    name: "Auth Code Input",
    category: "Navigation",
    description: "The six-digit magic-code input used inside the verification panel.",
    details: "Use for one-time auth codes only. It should stay numeric, fixed-width, and auto-complete the flow when all six digits are entered.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components" }],
    componentCode: `export function CodeInput({ code, onCodeChange, onComplete }) {\n  const digits = code.padEnd(6, " ").slice(0, 6).split("")\n\n  return (\n    <div className="flex gap-4">\n      {digits.map((digit, index) => (\n        <Input value={digit.trim()} inputMode="numeric" maxLength={1} onChange={(event) => updateDigit(index, event.target.value)} />\n      ))}\n    </div>\n  )\n}`,
    usageCode: `<CodeInput\n  code={code}\n  onCodeChange={setCode}\n  onComplete={verifyCode}\n/>`,
  },
  {
    id: "auth-signed-out-panel",
    name: "Auth Signed Out Panel",
    category: "Operations",
    description: "The signed-out recap panel with day-summary stats and account return actions.",
    details: "Use for session end states. It should reassure the operator what happened today and make signing back in or switching accounts obvious.",
    foundOn: [{ label: "Auth", route: "/auth" }, { label: "Components", route: "/components" }],
    componentCode: `export function SignedOutPanel({ onSignBackIn, onSwitchAccount }) {\n  return (\n    <div className="w-full max-w-[560px]">\n      <BrandLockup />\n      <h2>You're signed out</h2>\n      {signedOutStats.map(([value, label]) => <StatRow key={label} value={value} label={label} />)}\n      <Button onClick={onSignBackIn}>Sign back in</Button>\n      <Button onClick={onSwitchAccount}>Switch account</Button>\n    </div>\n  )\n}`,
    usageCode: `<SignedOutPanel\n  onSignBackIn={() => setStep("signin")}\n  onSwitchAccount={() => {\n    setEmail("")\n    setStep("signin")\n  }}\n/>`,
  },
  {
    id: "contact-card-layout-picker",
    name: "Contact Card Layout Picker",
    category: "CRM",
    description: "Four visual presets for choosing how a public QR contact card is arranged without exposing layout jargon.",
    details: "Use in Contact Card design settings. Each option previews its hierarchy, supports keyboard selection, and leaves colour and QR styling independent.",
    foundOn: [{ label: "Contact Cards", route: "/crm/contact-cards" }, { label: "Components", route: "/components?component=contact-card-layout-picker" }],
    componentCode: `export function ContactCardLayoutPicker({ value, onChange }) {\n  return (\n    <div role="radiogroup" aria-label="Layout preset">\n      {layoutPresets.map((preset) => (\n        <button role="radio" aria-checked={value === preset.id} onClick={() => onChange(preset.id)}>\n          <LayoutThumbnail preset={preset.id} />\n          <span>{preset.label}</span>\n          <small>{preset.detail}</small>\n        </button>\n      ))}\n    </div>\n  )\n}`,
    usageCode: `<ContactCardLayoutPicker\n  value={card.branding.layout}\n  onChange={(layout) => updateBranding(card.id, { layout })}\n/>`,
  },
  {
    id: "contact-card-social-links-editor",
    name: "Contact Card Social Links Editor",
    category: "CRM",
    description: "A reorderable, branded social-link editor for LinkedIn, Facebook, Instagram, WhatsApp, email, and website details.",
    details: "Use for person-owned public contact profiles. Blank links remain safely disabled, while enabled links keep the exact order shown in the editor.",
    foundOn: [{ label: "Contact Card settings", route: "/crm/contact-cards" }, { label: "Components", route: "/components?component=contact-card-social-links-editor" }],
    componentCode: `export function ContactCardSocialLinksEditor({ links, onChange }) {\n  return links.map((link, index) => (\n    <div key={link.id}>\n      <ContactSocialMark kind={link.kind} />\n      <Input value={link.value} onChange={(event) => update(link.id, event.target.value)} />\n      <MoveButtons index={index} onMove={move} />\n      <Switch checked={link.enabled} disabled={!link.value.trim()} />\n    </div>\n  ))\n}`,
    usageCode: `<ContactCardSocialLinksEditor\n  links={card.person.socialLinks}\n  onChange={(socialLinks) => updatePerson(card.id, { socialLinks })}\n/>`,
  },
  {
    id: "automation-run-history",
    name: "Automation Run History",
    category: "CRM",
    description: "An operator-friendly record of automation runs with expandable failures, preserved input, step traces, and safe reruns.",
    details: "Use below an automation canvas. Start with status, time, duration, and affected records; reveal the technical evidence only when a run needs investigation.",
    foundOn: [{ label: "Contact Card automation", route: "/crm/contact-cards" }, { label: "Components", route: "/components?component=automation-run-history" }],
    componentCode: `export function AutomationRunHistory({ runs, onRerun }) {\n  return runs.map((run) => (\n    <section key={run.id}>\n      <button aria-expanded={expanded === run.id} onClick={() => setExpanded(run.id)}>\n        <StatusPill>{run.status}</StatusPill>\n        <time>{run.startedAt}</time>\n        <span>{run.durationMs}ms</span>\n      </button>\n      {expanded === run.id ? <RunEvidence run={run} onRerun={onRerun} /> : null}\n    </section>\n  ))\n}`,
    usageCode: `<AutomationRunHistory\n  runs={card.automation.runs}\n  onRerun={(run) => rerunAutomationRun(run.id)}\n/>`,
  },
  {
    id: "marketing-opt-in-control",
    name: "Marketing Opt-in Control",
    category: "CRM",
    description: "A compact, auditable consent toggle for lead, contact, and customer records.",
    details: "Use on live CRM record detail views. The current state stays easy to scan while the source and last change remain visible as supporting evidence.",
    foundOn: [{ label: "CRM lead details", route: "/crm/leads" }, { label: "Account details", route: "/crm/accounts/de1000c1-5eed-4ead-8000-000000000001" }, { label: "Contact details", route: "/crm/contacts/de1000c3-5eed-4ead-8000-000000000001" }, { label: "Components", route: "/components?component=marketing-opt-in-control" }],
    componentCode: `export function MarketingOptInControl({ checked, source, updatedAt, onCheckedChange }) {\n  return (\n    <div>\n      <div>\n        <p>Opt-in marketing</p>\n        <p>{checked ? "Can receive marketing updates." : "No marketing updates will be sent."}</p>\n        <small>{source} · {updatedAt}</small>\n      </div>\n      <Switch checked={checked} onCheckedChange={onCheckedChange} />\n    </div>\n  )\n}`,
    usageCode: `<MarketingOptInControl\n  checked={lead.marketingOptIn}\n  source={lead.marketingConsentSource}\n  updatedAt={lead.marketingConsentUpdatedAt}\n  onCheckedChange={(checked) => setMarketingOptIn("lead", lead.id, checked)}\n/>`,
  },
  {
    id: "screening-outcome-pill",
    name: "Screening Outcome Pill",
    category: "Operations",
    description: "Compact party-screening language for no match, possible match, match, and a stale government list.",
    details: "Use on Compliance controls, customer records, and anywhere a completed sanctions screen needs to be scanned without turning the result into legal certainty.",
    foundOn: [{ label: "Compliance controls", route: "/compliance/screening" }, { label: "Customer detail", route: "/customers" }, { label: "Components", route: "/components?component=screening-outcome-pill" }],
    componentCode: `export function ScreeningOutcomePill({ outcome, stale = false }) {\n  return (\n    <span className="inline-flex flex-wrap items-center gap-1.5">\n      <StatusPill tone={outcomeTone[outcome]}>{outcomeLabel[outcome]}</StatusPill>\n      {stale ? <StatusPill tone="amber">List stale</StatusPill> : null}\n    </span>\n  )\n}`,
    usageCode: `<ScreeningOutcomePill outcome={check.outcome} stale={check.listStale} />`,
  },
  {
    id: "screening-list-freshness",
    name: "Screening List Freshness",
    category: "Operations",
    description: "Shows whether the workspace copy of the UK OFSI list is loaded, current, or due a refresh.",
    details: "Use above a screening form so operators can see the list publisher, name count, and last update before they rely on a no-match result.",
    foundOn: [{ label: "Compliance controls", route: "/compliance/screening" }, { label: "Components", route: "/components?component=screening-list-freshness" }],
    componentCode: `export function ScreeningListFreshness({ list, action }) {\n  return (\n    <div className="flex items-start justify-between gap-3">\n      <div>\n        <p>{list.sourceName}</p>\n        <StatusPill>{list.stale ? "Needs refresh" : "Current"}</StatusPill>\n        <p>{list.entryCount} names · Updated {list.downloadedAt}</p>\n      </div>\n      {action}\n    </div>\n  )\n}`,
    usageCode: `<ScreeningListFreshness\n  list={workspace.list}\n  action={<Button onClick={refreshList}>Refresh list</Button>}\n/>`,
  },
  {
    id: "screening-match-row",
    name: "Screening Match Row",
    category: "Operations",
    description: "One government-list name that matched a screened party, with the sanctions programme, UK list reference, and why they are listed.",
    details: "Use under a screening result. Keep listed names and listing notes readable in both left-to-right and right-to-left layouts; identifiers stay in their original form.",
    foundOn: [{ label: "Compliance controls", route: "/compliance/screening" }, { label: "Customer detail", route: "/customers" }, { label: "Components", route: "/components?component=screening-match-row" }],
    componentCode: `export function ScreeningMatchRow({ match }) {\n  return (\n    <div className="grid gap-2">\n      <div className="flex items-start justify-between gap-3">\n        <p>{match.listedName}</p>\n        <StatusPill tone={match.matchKind === "exact" ? "red" : "amber"}>\n          {match.matchKind === "exact" ? "Exact name" : "Similar name"}\n        </StatusPill>\n      </div>\n      <p>Sanctions programme: {match.regime}</p>\n      <p>UK list reference: {match.ukRef}</p>\n      <p>Why listed</p>\n      <p>{match.listingNotes}</p>\n    </div>\n  )\n}`,
    usageCode: `{check.matches.map((match) => (\n  <ScreeningMatchRow key={match.groupId + match.listedName} match={match} />\n))}`,
  },
  {
    id: "screening-match-list",
    name: "Screening Match List",
    category: "Operations",
    description: "Shows listed names from a screen, 12 at a time, with a filter and the existing pager when there are more hits.",
    details: "Use under a screening result. The pager shows the total count so operators can see that more listed names exist. It does not hide older government listings.",
    foundOn: [{ label: "Compliance controls", route: "/compliance/screening" }, { label: "Customer detail", route: "/customers" }, { label: "Components", route: "/components?component=screening-match-list" }],
    componentCode: `export function ScreeningMatchList({ matches }) {\n  return (\n    <div>\n      <Input placeholder="Filter listed names" />\n      {page.map((match) => <ScreeningMatchRow key={match.groupId + match.listedName} match={match} />)}\n      <Pagination page={page} pageCount={pageCount} totalItems={matches.length} pageSize={12} itemLabel="listed names" onPageChange={setPage} />\n    </div>\n  )\n}`,
    usageCode: `<ScreeningMatchList matches={check.matches} />`,
  },
  {
    id: "screening-result-summary",
    name: "Screening Result Summary",
    category: "Operations",
    description: "Explains a completed screen in plain language: match, possible match, no match, or list unavailable.",
    details: "Use above match rows so the operator sees what the outcome means before reading the sanctions programme and listing notes.",
    foundOn: [{ label: "Compliance controls", route: "/compliance/screening" }, { label: "Customer detail", route: "/customers" }, { label: "Components", route: "/components?component=screening-result-summary" }],
    componentCode: `export function ScreeningResultSummary({ subjectName, country, outcome }) {\n  return (\n    <div>\n      <p>{subjectName}{country ? \` · \${country}\` : ""}</p>\n      <p>{outcome === "match"\n        ? "This name matches a person or organisation on the UK OFSI consolidated list."\n        : "No listed names matched this search."}</p>\n    </div>\n  )\n}`,
    usageCode: `<ScreeningResultSummary subjectName={check.subjectName} country={check.country} outcome={check.outcome} />`,
  },
]

export const galleryCategories = ["All", "Design System", "Foundation", "Controls", "Navigation", "Data", "Visualizations", "Feedback", "Operations", "CRM", "Agent Dexter"]

export const galleryIcons = {
  colours: Palette,
  "hugeicons-system": Component,
  typography: Type,
  surface: Gauge,
  "status-pill": BadgeCheck,
  "todo-completion-control": ClipboardCheck,
  "todo-priority-pill": ClipboardCheck,
  "todo-action-state-icon": ClipboardCheck,
  "todo-priority-picker": ClipboardCheck,
  kbd: KeyRound,
  "ai-edge-glow": BrainCircuit,
  "dashboard-customise-panel": AiEditing,
  "ai-prompt-morph": AiEditing,
  "dexter-action-pill": AiBrain,
  "dexter-companion-sidebar": AiBrain,
  toast: Bell,
  "metric-card": BarChart3,
  "line-chart": ChartLine,
  "area-chart": ChartArea,
  "bar-chart": ChartBar,
  "stacked-bar-chart": ChartBarStacked,
  "donut-chart": ChartPie,
  "funnel-chart": Funnel,
  "heatmap-chart": Grid3X3,
  "radial-goal-chart": Gauge,
  "scatter-chart": ChartScatter,
  "mixed-chart": ChartNoAxesCombined,
  "audit-timeline": Clock3,
  "booking-row": Ship,
  "interactive-map": Globe2,
  command: ScanText,
  "app-breadcrumbs": ListOrdered,
  sidebar: LayoutDashboard,
  "sidebar-item-menu": MousePointerClick,
  "sidebar-arrange-canvas": ArrowUpDown,
  "theme-toggle": MoonStar,
  "page-settings-menu": Settings2,
  "date-range-picker": CalendarDays,
  "animated-list": ListOrdered,
  pagination: ListOrdered,
  "world-clock": Globe2,
  "timezone-work-queue": Clock3,
  "queue-row": ClipboardCheck,
  "customer-avatar": Users,
  "customer-metric-card": BarChart3,
  "contact-profile": Users,
  "primary-contacts-panel": Users,
  "segmented-control": LayoutDashboard,
  "multi-select-menu": SlidersHorizontal,
  "filter-chips": Users,
  "data-table": Users,
  "warehouse-table": Boxes,
  "warehouse-quantity-uom-field": Boxes,
  "purchase-order-line-editor": ReceiptText,
  "warehouse-object-summary": Boxes,
  "warehouse-exception-summary": Boxes,
  "warehouse-kanban-board": LayoutDashboard,
  "geo-panel": Globe2,
  "record-header": BriefcaseBusiness,
  tabs: LayoutDashboard,
  "active-bookings-panel": Ship,
  "your-jobs-panel": BriefcaseBusiness,
  "lane-mix-panel": ChartBar,
  "booking-metric-card": BarChart3,
  "booking-search-builder": Search,
  "bookings-table": Ship,
  "booking-board-preview": LayoutDashboard,
  "domestic-job-stage-rail": Truck,
  "domestic-road-job-card": Truck,
  "domestic-road-kanban-board": LayoutDashboard,
  "report-template-card": ChartAnalysis,
  "generated-report-table": FileText,
  "report-document-page": FileText,
  "report-thumbnail-rail": ListOrdered,
  "report-page-controls": ListOrdered,
  "report-widget-palette": Component,
  "report-data-editor": SlidersHorizontal,
  "booking-arrival-card": Clock3,
  "booking-exception-panel": TriangleAlert,
  "booking-checklist": ClipboardCheck,
  "booking-ask-panel": MessageCircle,
  "crm-metrics-grid": BarChart3,
  "crm-pipeline-board": BriefcaseBusiness,
  "crm-asset-folder-card": Boxes,
  "crm-asset-row": FileText,
  "contact-create-dialog": Users,
  "crm-contact-table": Mail,
  "crm-lead-qualification-table": Users,
  "crm-lead-detail-panel": Users,
  "crm-activity-timeline": Clock3,
  "crm-lead-signals": Radar,
  "crm-settings-builder": Settings2,
  "dexter-prompt-composer": AiBrain,
  "context-usage-meter": Gauge,
  "dexter-live-reasoning": BrainCircuit,
  "dexter-reasoning-summary": BrainCircuit,
  "dexter-action-approval": ClipboardCheck,
  "dexter-specialist-picker": PackageCheck,
  "dexter-specialist-menu": PackageCheck,
  "dexter-attachment-palette": Search,
  "dexter-history-list": ListOrdered,
  "dexter-monitor-card": Radar,
  "dexter-monitor-detail": Radar,
  "dexter-response-blocks": BarChart3,
  "side-panels": BarChart3,
  "settings-rail": LayoutDashboard,
  "settings-panel-row": Gauge,
  "settings-integration-row": Cloud,
  "settings-controls": KeyRound,
  "settings-option-card": Sparkles,
  "settings-summary-card": BarChart3,
  "settings-progress-ring": Gauge,
  "auth-narrative-panel": LayoutDashboard,
  "auth-workspace-router": Building2,
  "auth-provider-selector": KeyRound,
  "auth-sign-in-panel": KeyRound,
  "auth-identity-manager": KeyRound,
  "auth-verification-panel": Mail,
  "auth-code-input": KeyRound,
  "auth-signed-out-panel": BarChart3,
  "contact-card-layout-picker": QrCode,
  "contact-card-social-links-editor": Users,
  "automation-run-history": Workflow,
  "marketing-opt-in-control": BadgeCheck,
  "screening-outcome-pill": ShieldCheck,
  "screening-list-freshness": ShieldCheck,
  "screening-match-row": ShieldCheck,
  "screening-match-list": ShieldCheck,
  "screening-result-summary": ShieldCheck,
} satisfies Record<string, LucideIcon>
