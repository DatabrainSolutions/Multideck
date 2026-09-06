import { defaultPaginationPageSize } from "@/lib/pagination"
import { AdvancedFilterPopover } from "@/components/multideck/advanced-filter-popover"
import { createEmptyFilterQuery, filterQueryIsEmpty, type FilterFieldOption, type FilterQuery } from "@/lib/advanced-filters"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  AlarmClock,
  ArrowRightLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building2,
  ChartNoAxesCombined,
  CirclePause,
  Download,
  FileText,
  Folder,
  Image,
  LayoutTemplate,
  ListFilter,
  LoaderCircle,
  MailCheck,
  MapPin,
  MousePointerClick,
  PenLine,
  Plus,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Upload,
  UploadCloud,
  UserRound,
  Users,
  Wallet,
  Workflow,
  X,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader, DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import {
  getDateKey,
  MultideckDateRangePicker,
  parseDateKey,
  type MultideckDateComparisonOption,
  type MultideckDateRange,
} from "@/components/multideck/date-picker"
import {
  CrmActivityTimeline,
  CrmDealDetailPanel,
  CrmForecastPanel,
  CrmLeadDetailPanel,
  CrmLeadQualificationTable,
  CrmLeadSignalList,
  CrmMetricsGrid,
  CrmPipelineBoard,
  CrmPriorityActionsPanel,
  CrmRevenueMixPanel,
  CrmSalesCommandCenter,
  CrmSalesFunnelPanel,
  CrmSettingsBuilder,
  type CrmDeal,
  type CrmPipelineBoardData,
} from "@/components/multideck/crm-components"
import {
  CrmActivityFeed,
  CrmAreaHeatmap,
  CrmBand,
  CrmDashboardSkeleton,
  CrmFollowUpQueue,
  CrmOpportunityValue,
  CrmQuietLeads,
} from "@/components/multideck/crm-dashboard"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { Pagination } from "@/components/multideck/pagination"
import { PhoneCallLinkedRecordSection } from "@/components/multideck/phone-call-components"
import { RegisterFacetSelect, RegisterRevalidatingMark, RegisterSearchField, RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { InlineField, InlineFieldCard } from "@/components/multideck/inline-field"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import {
  crmActivities,
  crmPipelineBoards,
  crmPipelineStages,
  type StatusTone,
} from "@/data/operational-data"
import { useLanguage } from "@/i18n/language-provider"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { mdMotion } from "@/lib/motion"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { getApiTeamUsersByIds } from "@/lib/api"
import { createCustomer, createCustomerContact, getCustomerReference, listAccountsPage, type ApiCustomer } from "@/lib/customer-api"
import { getDeal, listDealsPage, markDealWon, moveDealStage, type ApiDeal, type DealRegisterPage, type DealRegisterSort } from "@/lib/deal-api"
import {
  createFollowUpLead,
  getCrmDashboard,
  getCrmFollowUpOpportunities,
  getLead,
  cancelLeadTransfer,
  decideLeadTransfer,
  listLeadTransferRequests,
  listCrmTransferUsersPage,
  listLeadsPage,
  requestLeadTransfer,
  transferLead,
  type ApiLead,
  type ApiLeadDetail,
  type CrmRegisterSort,
  type CrmDashboardData,
  type CrmFollowUpData,
  type CrmFollowUpOpportunity,
  type CrmLeadTransferRequest,
  type LeadRegisterPage,
  type CrmTransferUser,
  updateLead,
  type UpdateLeadInput,
} from "@/lib/lead-api"
import { getPipelineSettings, type ApiPipeline } from "@/lib/pipeline-api"
import { createProfilePhotoSignedUrls } from "@/lib/profile-photo"
import { setMarketingOptIn } from "@/lib/marketing-consent-api"
import { CrmConflictError, CrmMutationOutcomeUnknownError } from "@/lib/crm-supabase"
import { getSupabaseSession } from "@/lib/supabase"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"

const rowsPerPageOptions = [10, 20, 30, 50]
type CrmPipeline = CrmPipelineBoardData
type DealViewMode = "Board" | "List"
const emptyLeadSummary: LeadRegisterPage["summary"] = { leads: 0, open: 0, converted: 0, disqualified: 0, unassigned: 0, dueFollowUps: 0, valued: 0, recent: 0, qualified: 0, estimatedValue: 0 }
const emptyLeadFacets: LeadRegisterPage["facets"] = { statuses: [], sources: [], ratings: [], owners: [], hasUnassigned: false }
const emptyDealFacets: DealRegisterPage["facets"] = { pipelines: [], stages: [], statuses: [], owners: [], hasUnassigned: false }
const leadScopes = ["All", "Mine"] as const
type LeadScope = (typeof leadScopes)[number]

function useDialogReturnFocus(open: boolean) {
  const previousOpen = useRef(open)
  const returnFocusTarget = useRef<HTMLElement | null>(null)

  if (open && !previousOpen.current && typeof document !== "undefined") {
    const activeElement = document.activeElement
    returnFocusTarget.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null
  }

  useEffect(() => {
    previousOpen.current = open
  }, [open])

  return (event: Event) => {
    const target = returnFocusTarget.current
    returnFocusTarget.current = null
    if (!target?.isConnected) return
    event.preventDefault()
    target.focus()
  }
}
type Lead = ApiLead

const dealValueFormatters = new Map<string, Intl.NumberFormat>()

function getDealValueFormatter(currency: string, compact: boolean, language = "en-GB") {
  const key = `${language}:${currency}:${compact ? "compact" : "standard"}`
  let formatter = dealValueFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: 0,
    })
    dealValueFormatters.set(key, formatter)
  }
  return formatter
}

function isDealOpen(deal: ApiDeal) {
  return !deal.isWon && !deal.wonAt && !deal.statusCode.toLocaleLowerCase().includes("lost")
}

function isDealCloseOverdue(deal: ApiDeal) {
  if (!deal.expectedCloseDate || !isDealOpen(deal)) return false
  return new Date(`${deal.expectedCloseDate}T23:59:59`).getTime() < Date.now()
}

function formatDealClose(deal: ApiDeal, language: string, translate: (key: string) => string, includeYear = false) {
  if (!deal.expectedCloseDate) return translate("No close date")
  const date = new Intl.DateTimeFormat(language, includeYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" })
    .format(new Date(`${deal.expectedCloseDate}T12:00:00`))
  return isDealCloseOverdue(deal) ? `${translate("Overdue")} · ${date}` : date
}

function formatDealNextAction(value: string | null, language: string, translate: (key: string) => string) {
  return value
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : translate("Not recorded")
}

function apiDealTone(deal: ApiDeal): StatusTone {
  const stage = `${deal.stageCode} ${deal.stageName} ${deal.statusCode}`.toLowerCase()
  if (stage.includes("lost") || stage.includes("cancel")) return "red"
  if (stage.includes("won") || stage.includes("commit")) return "green"
  if (stage.includes("negotiat")) return "amber"
  if (stage.includes("quote") || stage.includes("proposal")) return "teal"
  return "blue"
}

function apiDealToBoardDeal(deal: ApiDeal, tone: StatusTone, language: string, translate: (key: string) => string): CrmDeal {
  const due = formatDealClose(deal, language, translate)
  const value = deal.expectedValueAmount === null
    ? translate("Value pending")
    : getDealValueFormatter(
      deal.currencyCode || "GBP",
      deal.expectedValueAmount >= 100_000,
      language,
    ).format(deal.expectedValueAmount)
  const owner = deal.ownerName
    ? deal.ownerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : "—"
  const margin = deal.expectedMarginAmount === null
    ? translate("Not recorded")
    : getDealValueFormatter(deal.currencyCode || "GBP", false, language).format(deal.expectedMarginAmount)
  const nextAction = formatDealNextAction(deal.nextActionDueAt, language, translate)

  return {
    id: deal.id,
    title: deal.name,
    account: deal.companyName,
    contact: deal.primaryContactName || translate("Contact pending"),
    value,
    due,
    owner,
    status: deal.statusName,
    isOverdue: isDealCloseOverdue(deal),
    summary: deal.customerNeed || deal.serviceInterest || translate("Commercial scope ready for qualification."),
    nextStep: deal.nextActionDueAt
      ? `${translate("Next action due")} ${nextAction}.`
      : translate("Set the next customer-facing action."),
    tone: tone === "neutral" ? apiDealTone(deal) : tone,
    cardFields: {
      expectedValue: value,
      expectedMargin: margin,
      probability: deal.probabilityPct === null ? translate("Not recorded") : `${deal.probabilityPct}%`,
      primaryContact: deal.primaryContactName || translate("Not recorded"),
      owner,
      expectedClose: due,
      mode: translate(humanizeDealCode(deal.modeCode) || "Not recorded"),
      direction: translate(humanizeDealCode(deal.directionCode) || "Not recorded"),
      origin: deal.originName || translate("Not recorded"),
      destination: deal.destinationName || translate("Not recorded"),
      tradeLane: deal.tradeLane || translate("Not recorded"),
      serviceInterest: deal.serviceInterest || translate("Not recorded"),
      nextAction,
    },
  }
}

function humanizeDealCode(value: string | null) {
  return value
    ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase())
    : ""
}

function buildDealPipelines(pipelines: ApiPipeline[], deals: ApiDeal[], language: string, translate: (key: string) => string): CrmPipelineBoardData[] {
  const dealsByStage = new Map<string, ApiDeal[]>()
  for (const deal of deals) {
    const key = `${deal.pipelineId}:${deal.pipelineStageId}`
    const groupedDeals = dealsByStage.get(key)
    if (groupedDeals) groupedDeals.push(deal)
    else dealsByStage.set(key, [deal])
  }

  return pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      title: stage.name,
      tone: stage.tone,
      deals: (dealsByStage.get(`${pipeline.id}:${stage.id}`) ?? [])
        .map((deal) => apiDealToBoardDeal(deal, stage.tone, language, translate)),
    })),
  }))
}

async function loadLeadOwnerPhotoUrls(ownerIds: string[]) {
  const session = await getSupabaseSession()
  if (!session?.access_token || !ownerIds.length) return new Map<string, string>()

  const users = await getApiTeamUsersByIds(session.access_token, ownerIds)
  const usersWithPhotos = users.filter((user) => user.profilePhoto !== null)
  const signedUrlsByPath = await createProfilePhotoSignedUrls(usersWithPhotos.map((user) => user.profilePhoto!))

  return new Map(
    usersWithPhotos.flatMap((user) => {
      const signedUrl = user.profilePhoto ? signedUrlsByPath.get(user.profilePhoto.path) : null
      return signedUrl ? [[user.id, signedUrl] as const] : []
    }),
  )
}

const crmEmailLists = [
  {
    id: "eu-importers-apparel",
    name: "EU importers · apparel",
    type: "Smart",
    count: 142,
    delta: "+9 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "June rates · QBR invites",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Apparel importers with recent EU lanes, seasonal quotes, or open capacity conversations.",
    rules: ["Industry includes apparel", "Region is EU or UK", "Engaged in the last 120 days"],
    members: [
      ["Marlow Apparel Ltd", "Sandra Aldridge", "sandra@marlowapparel.co.uk", "Premium", "Opened June rates"],
      ["Bauhaus Importe GmbH", "Lukas Meyer", "lukas@bauhaus-importe.de", "Active lead", "Clicked QBR invite"],
      ["Nordic Thread Co", "Maja Lund", "maja@nordicthread.dk", "Customer", "Quote requested"],
      ["Maison Port Supply", "Camille Roche", "camille@maisonport.fr", "Prospect", "No reply yet"],
    ],
  },
  {
    id: "all-active-customers",
    name: "All active customers",
    type: "Smart",
    count: 268,
    delta: "+3 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "Peak season advisory",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Customers with bookings, quotes, or account activity in the current commercial cycle.",
    rules: ["Customer status is active", "No suppression flag", "Primary contact has a valid work email"],
    members: [
      ["Northwind GmbH", "Elena Moreno", "elena@northwind.de", "Customer", "Opened last advisory"],
      ["Pacific Goods Co", "Wei Chen", "wei@pacificgoods.com", "Customer", "Clicked service update"],
      ["Black Forest Foods", "Jonas Keller", "jonas@blackforestfoods.de", "Customer", "Replied yesterday"],
      ["Atlas Office Supply", "Mina Okafor", "mina@atlasoffice.co", "Customer", "Viewed report"],
    ],
  },
  {
    id: "dormant-90d",
    name: "Dormant 90d+",
    type: "Smart",
    count: 57,
    delta: "-4 this week",
    deltaTone: "red" as StatusTone,
    usedIn: "Win-back broadcast",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "WC",
    updated: "Live from CRM",
    description: "Accounts with no booking activity in the last 90 days and no active deal in pipeline.",
    rules: ["Last booking older than 90 days", "No open quote", "Contact is not suppressed"],
    members: [
      ["Harbour Homeware", "Amelia Stone", "amelia@harbourhome.co.uk", "Dormant", "Last opened May rates"],
      ["Forma Retail Group", "Oscar Bennett", "oscar@formaretail.co", "Dormant", "No booking 112d"],
      ["Ridgeway Textiles", "Priya Shah", "priya@ridgewaytextiles.co.uk", "Dormant", "Clicked win-back"],
    ],
  },
  {
    id: "qbr-attendees-h1",
    name: "QBR attendees · H1",
    type: "Static",
    count: 34,
    delta: "manual",
    deltaTone: "neutral" as StatusTone,
    usedIn: "QBR follow-up",
    statusLabel: "May 28",
    statusTone: "neutral" as StatusTone,
    owner: "JL",
    updated: "Imported May 28",
    description: "Manually curated contacts from first-half QBR sessions and follow-up meetings.",
    rules: ["Static import", "QBR attendance confirmed", "Manual owner review"],
    members: [
      ["Marlow Apparel Ltd", "Sandra Aldridge", "sandra@marlowapparel.co.uk", "Attendee", "Asked for June lanes"],
      ["Pacific Goods Co", "Wei Chen", "wei@pacificgoods.com", "Attendee", "Requested deck"],
      ["Black Forest Foods", "Jonas Keller", "jonas@blackforestfoods.de", "Attendee", "Follow-up booked"],
    ],
  },
  {
    id: "peak-season-air-prospects",
    name: "Peak-season air prospects",
    type: "Smart",
    count: 81,
    delta: "+12 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "not used yet",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Prospects likely to need air options when ocean schedules tighten.",
    rules: ["Recent delay on ocean lane", "High value or urgent goods", "Air quote interest signal"],
    members: [
      ["Copenhagen Components", "Freja Nielsen", "freja@cphcomponents.dk", "Prospect", "Air quote viewed"],
      ["Milano Market Group", "Rosa Conti", "rosa@milanomarket.it", "Lead", "Peak season note"],
      ["Bristol Bike Parts", "Theo Carter", "theo@bristolbikeparts.co.uk", "Lead", "Clicked air advisory"],
    ],
  },
]
const crmEmailTemplates = [
  {
    name: "Monthly rates newsletter",
    detail: "Lane tables + Dexter market note",
    accent: "wide",
  },
  {
    name: "Service advisory",
    detail: "Single urgent update, one CTA",
    accent: "simple",
  },
  {
    name: "Branded announcement",
    detail: "New lane, new service, hires",
    accent: "wide",
  },
  {
    name: "Win-back",
    detail: "Personal note + tailored rates",
    accent: "simple",
  },
]

const crmEmailCampaigns = [
  {
    id: "june-ocean-rates-update",
    name: "June ocean rates update",
    subject: "June ocean rates: Felixstowe, Rotterdam and Hamburg",
    preheader: "Updated lane tables with Dexter's market note.",
    type: "Newsletter",
    audience: "June rates audience · 412",
    status: "Sent",
    tone: "green" as StatusTone,
    when: "Jun 9, 08:00",
    open: "52%",
    click: "18%",
    uploads: "rate-table-june.csv",
    edited: "Sent by Elena",
    stats: { delivered: "408", openRate: "52%", clickRate: "18%", unsubscribed: "3" },
    engaged: [
      ["Sandra Aldridge", "Marlow Apparel Ltd", "Opened + clicked lane table"],
      ["Lukas Meyer", "Bauhaus Importe GmbH", "Clicked Felixstowe rates"],
      ["Wei Chen", "Pacific Goods Co", "Forwarded internally"],
    ],
    unsubscribed: [
      ["Oscar Bennett", "Forma Retail Group", "Unsubscribed after send"],
      ["Amelia Stone", "Harbour Homeware", "Marketing opt-out"],
      ["Mina Okafor", "Atlas Office Supply", "Changed email preference"],
    ],
  },
  {
    id: "peak-season-advisory",
    name: "Peak season advisory — book by Jul 15",
    subject: "Peak season advisory: book capacity by Jul 15",
    preheader: "Recommended booking windows for active customers.",
    type: "Advisory",
    audience: "All active customers · 268",
    status: "Scheduled",
    tone: "blue" as StatusTone,
    when: "Jun 13, 08:00",
    open: "—",
    click: "—",
    uploads: "advisory-hero.html",
    edited: "Final copy ready",
    stats: { delivered: "scheduled", openRate: "—", clickRate: "—", unsubscribed: "—" },
    engaged: [
      ["Elena Moreno", "Northwind Forwarding", "Internal approval ready"],
      ["Wei Chen", "Pacific Goods Co", "Preview recipient"],
    ],
    unsubscribed: [],
  },
  {
    id: "win-back-dormant-90d",
    name: "Win-back: dormant 90d+",
    subject: "Still planning summer freight?",
    preheader: "A short personal note with tailored rate lines.",
    type: "Win-back",
    audience: "Dormant 90d+ · 57",
    status: "Draft",
    tone: "neutral" as StatusTone,
    when: "edited 2h ago",
    open: "—",
    click: "—",
    uploads: "personal-rate-lines.csv",
    edited: "Needs subject line",
    stats: { delivered: "draft", openRate: "—", clickRate: "—", unsubscribed: "—" },
    engaged: [
      ["Priya Shah", "Ridgeway Textiles", "Likely to re-engage"],
      ["Amelia Stone", "Harbour Homeware", "Opened May rates"],
    ],
    unsubscribed: [
      ["Oscar Bennett", "Forma Retail Group", "Suppressed from win-back"],
    ],
  },
  {
    id: "may-ocean-rates-update",
    name: "May ocean rates update",
    subject: "May ocean rates update",
    preheader: "Lane tables and schedule notes for May.",
    type: "Newsletter",
    audience: "May rates audience · 396",
    status: "Sent",
    tone: "green" as StatusTone,
    when: "May 12, 08:00",
    open: "49%",
    click: "15%",
    uploads: "rate-table-may.csv",
    edited: "Archived",
    stats: { delivered: "392", openRate: "49%", clickRate: "15%", unsubscribed: "4" },
    engaged: [
      ["Sandra Aldridge", "Marlow Apparel Ltd", "Opened twice"],
      ["Jonas Keller", "Black Forest Foods", "Clicked customs note"],
      ["Maja Lund", "Nordic Thread Co", "Replied for quote"],
    ],
    unsubscribed: [
      ["Camille Roche", "Maison Port Supply", "Unsubscribed"],
      ["Theo Carter", "Bristol Bike Parts", "Paused marketing"],
    ],
  },
]

type EmailMarketingContactStatus = "Subscribed" | "Unsubscribed" | "Bounced" | "Pending" | "Replied"

const emailMarketingContacts = [
  {
    email: "sandra@marlowapparel.co.uk",
    name: "Sandra Aldridge",
    company: "Marlow Apparel Ltd",
    status: "Subscribed" as EmailMarketingContactStatus,
    source: "CRM contact",
    lists: "EU importers · apparel",
    lastActivity: "Clicked June rates · 2h ago",
  },
  {
    email: "lukas@bauhaus-importe.de",
    name: "Lukas Meyer",
    company: "Bauhaus Importe GmbH",
    status: "Subscribed" as EmailMarketingContactStatus,
    source: "Quote enquiry",
    lists: "EU importers · apparel",
    lastActivity: "Opened peak season preview",
  },
  {
    email: "wei@pacificgoods.com",
    name: "Wei Chen",
    company: "Pacific Goods Co",
    status: "Subscribed" as EmailMarketingContactStatus,
    source: "Customer import",
    lists: "All active customers",
    lastActivity: "Forwarded June rates",
  },
  {
    email: "oscar@formaretail.co",
    name: "Oscar Bennett",
    company: "Forma Retail Group",
    status: "Unsubscribed" as EmailMarketingContactStatus,
    source: "CRM contact",
    lists: "Suppression list",
    lastActivity: "Unsubscribed · Jun 9",
  },
  {
    email: "amelia@harbourhome.co.uk",
    name: "Amelia Stone",
    company: "Harbour Homeware",
    status: "Unsubscribed" as EmailMarketingContactStatus,
    source: "Customer import",
    lists: "Suppression list",
    lastActivity: "Changed preference · Jun 8",
  },
  {
    email: "orders@atlasoffice.co",
    name: "Mina Okafor",
    company: "Atlas Office Supply",
    status: "Bounced" as EmailMarketingContactStatus,
    source: "Spreadsheet import",
    lists: "All active customers",
    lastActivity: "Hard bounce · Jun 9",
  },
  {
    email: "freja@cphcomponents.dk",
    name: "Freja Nielsen",
    company: "Copenhagen Components",
    status: "Pending" as EmailMarketingContactStatus,
    source: "Air quote form",
    lists: "Peak-season air prospects",
    lastActivity: "Consent requested · 4h ago",
  },
  {
    email: "jonas@blackforestfoods.de",
    name: "Jonas Keller",
    company: "Black Forest Foods",
    status: "Replied" as EmailMarketingContactStatus,
    source: "CRM contact",
    lists: "All active customers",
    lastActivity: "Replied to service update",
  },
]

const recentSubscriberChanges = {
  subscribed: [
    ["Freja Nielsen", "Copenhagen Components", "Air quote form · 4h ago"],
    ["Rosa Conti", "Milano Market Group", "Peak-season guide · Yesterday"],
    ["David Lloyd", "Westbridge Medical", "CRM contact · Yesterday"],
  ],
  unsubscribed: [
    ["Oscar Bennett", "Forma Retail Group", "June rates · Jun 9"],
    ["Amelia Stone", "Harbour Homeware", "Preference centre · Jun 8"],
    ["Camille Roche", "Maison Port Supply", "May rates · Jun 3"],
  ],
}

const emailMarketingAutomations = [
  {
    name: "New enquiry welcome",
    trigger: "CRM lead created",
    audience: "New freight enquiries",
    status: "Active",
    tone: "green" as StatusTone,
    entered: "128",
    performance: "41% CTR",
    lastRun: "12 minutes ago",
  },
  {
    name: "Quote follow-up",
    trigger: "Quote viewed, no reply after 48h",
    audience: "Open quote contacts",
    status: "Active",
    tone: "green" as StatusTone,
    entered: "64",
    performance: "18 replies",
    lastRun: "1 hour ago",
  },
  {
    name: "Dormant customer win-back",
    trigger: "No booking activity for 90 days",
    audience: "Dormant 90d+",
    status: "Paused",
    tone: "amber" as StatusTone,
    entered: "57",
    performance: "9.8% CTR",
    lastRun: "Paused Jun 7",
  },
  {
    name: "Peak-season capacity alert",
    trigger: "Capacity risk flag added",
    audience: "Affected active customers",
    status: "Draft",
    tone: "neutral" as StatusTone,
    entered: "—",
    performance: "Not started",
    lastRun: "Edited yesterday",
  },
]

type EmailMarketingSection = "dashboard" | "broadcasts" | "lists" | "templates" | "automations" | "emails"
type EmailDashboardPreset = "today" | "week" | "month" | "ninety" | "custom"

type EmailDashboardSnapshot = {
  subscribedContacts: number
  newSubscribers: number
  unsubscribed: number
  averageCtr: number
  averageOpenRate: number
  deliveryRate: number
  subscriberSeries: number[]
  ctrSeries: number[]
  openSeries: number[]
  deliverySeries: number[]
}

const emailMarketingSections: { id: EmailMarketingSection; label: string; icon: typeof Send }[] = [
  { id: "dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { id: "broadcasts", label: "Broadcasts", icon: Send },
  { id: "lists", label: "Lists", icon: Users },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "automations", label: "Automations", icon: Workflow },
  { id: "emails", label: "Emails", icon: MailCheck },
]

const emailDashboardPresets = ["today", "week", "month", "ninety"] as const
const emailMarketingDataStart = "2026-01-01"
const emailMarketingDataEnd = "2026-07-30"

function addDaysToDateKey(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  date.setDate(date.getDate() + amount)
  return getDateKey(date)
}

function getEmailPresetRange(preset: Exclude<EmailDashboardPreset, "custom">): MultideckDateRange {
  const end = emailMarketingDataEnd
  if (preset === "today") return { start: end, end }
  if (preset === "week") return { start: addDaysToDateKey(end, -6), end }
  if (preset === "month") return { start: addDaysToDateKey(end, -29), end }
  return { start: addDaysToDateKey(end, -89), end }
}

function getPreviousEmailPeriod(range?: MultideckDateRange): MultideckDateRange {
  if (!range) return { start: null, end: null }
  const start = parseDateKey(range.start)
  const end = parseDateKey(range.end)
  if (!start || !end) return { start: null, end: null }
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  return {
    start: addDaysToDateKey(range.start!, -days),
    end: addDaysToDateKey(range.start!, -1),
  }
}

function getEmailComparisonRange(range: MultideckDateRange | undefined, days: number): MultideckDateRange {
  if (!range?.start) return { start: null, end: null }
  const end = addDaysToDateKey(range.start, -1)
  return {
    start: addDaysToDateKey(end, -(Math.max(days, 1) - 1)),
    end,
  }
}

function rangeDayCount(range: MultideckDateRange) {
  const start = parseDateKey(range.start)
  const end = parseDateKey(range.end)
  if (!start || !end || start > end) return 0
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

function makeEmailSeries(endValue: number, spread: number, points = 8) {
  return Array.from({ length: points }, (_, index) => {
    const progress = index / Math.max(points - 1, 1)
    const movement = Math.sin(index * 1.35) * spread * 0.22
    return Number((endValue - spread + spread * progress + movement).toFixed(2))
  })
}

function getEmailDashboardSnapshot(range: MultideckDateRange): EmailDashboardSnapshot | null {
  const days = rangeDayCount(range)
  if (!range.start || !range.end || !days || range.start < emailMarketingDataStart || range.end > emailMarketingDataEnd) return null

  const coverageStart = parseDateKey(emailMarketingDataStart)!
  const rangeEnd = parseDateKey(range.end)!
  const elapsedDays = Math.round((rangeEnd.getTime() - coverageStart.getTime()) / 86_400_000) + 1
  const monthOffset = (rangeEnd.getFullYear() - 2026) * 12 + rangeEnd.getMonth() - 6
  const dayOffset = rangeEnd.getDate() - 30
  const subscribedContacts = 2499 + Math.round(elapsedDays * 1.645)
  const newSubscribers = Math.max(1, Math.round(days * 1.93))
  const unsubscribed = Math.max(0, Math.round(days * 0.5))
  const averageCtr = Number((16.4 + monthOffset * 0.35 + dayOffset * 0.02 + (days - 30) * 0.004).toFixed(1))
  const averageOpenRate = Number((50.6 + monthOffset * 0.72 + dayOffset * 0.04 + (days - 30) * 0.006).toFixed(1))
  const deliveryRate = Number(Math.min(99.7, 99.2 + monthOffset * 0.18 + dayOffset * 0.008 + (days - 30) * 0.001).toFixed(1))

  return {
    subscribedContacts,
    newSubscribers,
    unsubscribed,
    averageCtr,
    averageOpenRate,
    deliveryRate,
    subscriberSeries: makeEmailSeries(subscribedContacts, Math.max(8, days * 1.45)),
    ctrSeries: makeEmailSeries(averageCtr, Math.max(0.8, days * 0.035)),
    openSeries: makeEmailSeries(averageOpenRate, Math.max(1.8, days * 0.075)),
    deliverySeries: makeEmailSeries(deliveryRate, Math.max(0.18, days * 0.009)),
  }
}

function readEmailMarketingSection(): EmailMarketingSection {
  const value = new URLSearchParams(window.location.search).get("tab")
  return emailMarketingSections.some((section) => section.id === value)
    ? value as EmailMarketingSection
    : "dashboard"
}

function contactStatusTone(status: EmailMarketingContactStatus): StatusTone {
  if (status === "Subscribed") return "green"
  if (status === "Pending") return "amber"
  if (status === "Unsubscribed") return "red"
  if (status === "Replied") return "blue"
  return "neutral"
}

function firstDeal(pipeline: CrmPipeline = crmPipelineBoards[0]) {
  return pipeline.stages.flatMap((stage) => stage.deals)[0] ?? crmPipelineStages.flatMap((stage) => stage.deals)[0]
}

function getLeadCrmPath(lead: Lead) {
  return `/crm/leads/${lead.id}`
}

function getCrmListPath(list: (typeof crmEmailLists)[number]) {
  return `/crm/lists/${list.id}`
}

function getCrmEmailCampaignPath(campaign: (typeof crmEmailCampaigns)[number], mode: "stats" | "edit") {
  return `/crm/emails/${campaign.id}/${mode}`
}

function CrmPageHeader({
  eyebrow = "CRM",
  title,
  summary,
  meta,
  action,
  onSpeakToDexter,
}: {
  eyebrow?: string
  title: string
  summary?: ReactNode
  meta?: string
  action?: ReactNode
  onSpeakToDexter?: () => void
}) {
  const actions = action || onSpeakToDexter ? (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {onSpeakToDexter ? <DexterActionPill onClick={onSpeakToDexter} /> : null}
      {action}
    </div>
  ) : null

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{title}</h1>
          {eyebrow !== "CRM" ? <p className="text-[11px] font-medium text-[var(--md-subtle)]">{eyebrow}</p> : null}
          {meta ? <p className="text-[11px] font-medium text-[var(--md-subtle)]">{meta}</p> : null}
        </div>
        {summary ? <p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{summary}</p> : null}
      </div>
      {actions ? <div className="lg:justify-self-end">{actions}</div> : null}
    </div>
  )
}

function PrimaryActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
      onClick={onClick}
    >
      <Plus data-icon="inline-start" strokeWidth={1.2} />
      {children}
    </Button>
  )
}

type FollowUpCreateKind = "lead" | "contact" | "account"

function personNameParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts.shift() || null, lastName: parts.join(" ") || null }
}

function companyNameFromEmail(email: string) {
  const domain = email.split("@")[1]?.split(".")[0] || ""
  return domain ? domain.charAt(0).toLocaleUpperCase() + domain.slice(1).replaceAll(/[-_]/g, " ") : ""
}

function FollowUpCreateMenu({ opportunity, onChoose }: { opportunity: CrmFollowUpOpportunity; onChoose: (kind: FollowUpCreateKind) => void }) {
  const { t } = useLanguage()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
          onClick={(event) => event.stopPropagation()}
          aria-label={t("Create CRM record")}
        >
          <Plus className="size-3.5" strokeWidth={1.4} />
          {t("Create")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{t("Create from this email")}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChoose("lead")}>
          <Users className="size-4 text-[var(--md-accent)]" strokeWidth={1.3} />
          <span><span className="block font-medium text-[var(--md-ink)]">{t("Lead")}</span><span className="block text-[11px] text-[var(--md-subtle)]">{t("New sales opportunity")}</span></span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChoose("contact")}>
          <UserRound className="size-4 text-[var(--md-blue)]" strokeWidth={1.3} />
          <span><span className="block font-medium text-[var(--md-ink)]">{t("Contact")}</span><span className="block text-[11px] text-[var(--md-subtle)]">{t("Person at an existing account")}</span></span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChoose("account")}>
          <Building2 className="size-4 text-[var(--md-green)]" strokeWidth={1.3} />
          <span><span className="block font-medium text-[var(--md-ink)]">{t("Account")}</span><span className="block text-[11px] text-[var(--md-subtle)]">{t("New customer organisation")}</span></span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FollowUpRecordDialog({
  opportunity,
  kind,
  open = false,
  onClose,
  onCreated,
}: {
  opportunity: CrmFollowUpOpportunity | null
  kind: FollowUpCreateKind | null
  open?: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useLanguage()
  const dialogOpen = Boolean(kind && (opportunity || open))
  const restoreDialogFocus = useDialogReturnFocus(dialogOpen)
  const [personName, setPersonName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [email, setEmail] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [townCity, setTownCity] = useState("")
  const [countyState, setCountyState] = useState("")
  const [postZipCode, setPostZipCode] = useState("")
  const [countryCode, setCountryCode] = useState("")
  const [accountId, setAccountId] = useState("")
  const [accountSearch, setAccountSearch] = useState("")
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [accountState, setAccountState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!kind || (!opportunity && !open)) return
    setPersonName(opportunity?.personName || "")
    setCompanyName(opportunity?.companyName || companyNameFromEmail(opportunity?.email || ""))
    setEmail(opportunity?.email || "")
    setAddressLine1("")
    setAddressLine2("")
    setTownCity("")
    setCountyState("")
    setPostZipCode("")
    setCountryCode("")
    setAccountId("")
    setAccountSearch("")
    setAccounts([])
    setError(null)
    setAccountState(kind === "contact" ? "loading" : "idle")
  }, [kind, open, opportunity])

  useEffect(() => {
    if (kind !== "contact" || (!opportunity && !open)) return undefined
    let active = true
    setAccountState("loading")
    const timer = window.setTimeout(() => {
      listAccountsPage({
        search: accountSearch.trim(),
        sort: { id: "account", direction: "asc" },
        limit: 25,
        offset: 0,
      })
      .then((page) => {
        if (!active) return
        setAccounts(page.rows)
        setAccountState("ready")
      })
      .catch(() => {
        if (!active) return
        setAccountState("error")
      })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [accountSearch, kind, open, opportunity])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!kind || (!opportunity && !open)) return
    setSubmitting(true)
    setError(null)
    try {
      if (kind === "lead") {
        await createFollowUpLead({
          email,
          personName,
          companyName,
          threadId: opportunity?.threadId,
          address: {
            line1: addressLine1 || null,
            line2: addressLine2 || null,
            townCity: townCity || null,
            countyState: countyState || null,
            postZipCode: postZipCode || null,
            countryCode: countryCode || null,
          },
        })
      } else if (kind === "contact") {
        if (!accountId) throw new Error(t("Choose the account this contact belongs to."))
        const name = personNameParts(personName)
        await createCustomerContact(accountId, { ...name, email })
      } else {
        const reference = await getCustomerReference()
        const orgType = reference.organisationTypes.find((type) => type.name.toLocaleLowerCase() === "customer") ?? reference.organisationTypes[0]
        if (!orgType) throw new Error(t("No customer account type is configured."))
        const name = personNameParts(personName)
        await createCustomer({
          name: companyName,
          orgTypeIds: [orgType.id],
          addressLine1: null,
          townCity: null,
          postZipCode: null,
          countryCode: null,
          contactFirstName: name.firstName,
          contactLastName: name.lastName,
          contactEmail: email,
        })
      }
      toast.success(t(kind === "lead" ? "Lead created" : kind === "contact" ? "Contact created" : "Account created"))
      onCreated()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("This CRM record could not be created."))
    } finally {
      setSubmitting(false)
    }
  }

  const title = kind === "lead" ? t(opportunity ? "Create lead" : "New lead") : kind === "contact" ? t("Create contact") : t("Create account")
  return (
    <Dialog open={dialogOpen} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent onCloseAutoFocus={restoreDialogFocus} className="max-h-[calc(100vh-2rem)] overflow-y-auto border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
        <DialogHeader className="text-start">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(opportunity ? "Review the details found in the email before adding them to CRM." : "New sales opportunity")}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {kind !== "contact" ? (
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              {kind === "account" ? t("Account name") : t("Company")}
              <Input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="h-10" dir="auto" />
            </label>
          ) : (
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
              {t("Account")}
              <Input
                value={accountSearch}
                onChange={(event) => {
                  setAccountSearch(event.target.value)
                  setAccountId("")
                }}
                placeholder={t("Search accounts")}
                aria-label={t("Search accounts")}
                className="h-10"
                dir="auto"
              />
              <Select value={accountId} onValueChange={setAccountId} disabled={accountState !== "ready"}>
                <SelectTrigger className="h-10"><SelectValue placeholder={accountState === "loading" ? t("Loading accounts…") : t("Choose account")} /></SelectTrigger>
                <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}><span dir="auto">{account.name}</span></SelectItem>)}</SelectContent>
              </Select>
              {accountState === "error" ? <span className="text-[11px] text-[var(--md-red)]">{t("Accounts could not be loaded.")}</span> : null}
              {accountState === "ready" && !accounts.length ? <span className="text-[11px] text-[var(--md-subtle)]">{t("No accounts match this search.")}</span> : null}
            </label>
          )}
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            {t("Person")}
            <Input required value={personName} onChange={(event) => setPersonName(event.target.value)} className="h-10" dir="auto" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
            {t("Email")}
            <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10" dir="ltr" />
          </label>
          {kind === "lead" ? (
            <div className="grid gap-3 border-t border-[var(--md-line)] pt-4">
              <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Address")}</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Address line 1")}
                  <Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} className="h-10" dir="auto" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Address line 2")}
                  <Input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} className="h-10" dir="auto" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Town or city")}
                  <Input value={townCity} onChange={(event) => setTownCity(event.target.value)} className="h-10" dir="auto" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("County / State")}
                  <Input value={countyState} onChange={(event) => setCountyState(event.target.value)} className="h-10" dir="auto" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Postcode")}
                  <Input value={postZipCode} onChange={(event) => setPostZipCode(event.target.value)} className="h-10" dir="ltr" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">
                  {t("Country code")}
                  <Input
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                    className="h-10"
                    dir="ltr"
                    maxLength={2}
                    aria-invalid={Boolean(countryCode && !/^[A-Z]{2}$/.test(countryCode))}
                  />
                  {countryCode && !/^[A-Z]{2}$/.test(countryCode) ? (
                    <span className="text-[11px] text-[var(--md-red)]">{t("Enter a two-letter ISO country code, such as GB.")}</span>
                  ) : null}
                </label>
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] px-3 py-2 text-[12px] text-[var(--md-red)]" dir="auto">{t(error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={submitting || !email.trim() || !personName.trim() || (kind === "lead" && Boolean(countryCode) && !/^[A-Z]{2}$/.test(countryCode)) || (kind === "contact" && !accountId) || (kind !== "contact" && !companyName.trim())}>
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {submitting ? t("Creating…") : title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DealDetailDrawer({
  deal,
  open,
  onClose,
}: {
  deal: CrmDeal
  open: boolean
  onClose: () => void
}) {
  const { t } = useLanguage()

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={t("Deal details")} title={deal.account} width={480}>
      <CrmDealDetailPanel deal={deal} />
    </SideDrawer>
  )
}

/** How long an open lead can sit without contact before it counts as quiet. */
const crmInactivityDays = 90

export function CrmOverviewPage() {
  const { language, t } = useLanguage()
  const [dexterOpen, setDexterOpen] = useState(false)
  const [data, setData] = useState<CrmDashboardData | null>(null)
  const [followUpData, setFollowUpData] = useState<CrmFollowUpData | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [createOpportunity, setCreateOpportunity] = useState<CrmFollowUpOpportunity | null>(null)
  const [createKind, setCreateKind] = useState<FollowUpCreateKind | null>(null)

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    Promise.all([
      getCrmDashboard(crmInactivityDays),
      getCrmFollowUpOpportunities(),
    ])
      .then(([result, followUps]) => {
        if (!active) return
        setData(result)
        setFollowUpData(followUps)
        setState("ready")
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : t("The CRM dashboard could not be loaded."))
        setState("error")
      })
    return () => { active = false }
  }, [reloadKey, t])

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1)
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh() }
    window.addEventListener("focus", refresh)
    window.addEventListener("multideck:crm-changed", refresh)
    window.addEventListener("multideck:inbox-changed", refresh)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    const interval = window.setInterval(refreshWhenVisible, 120_000)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("multideck:crm-changed", refresh)
      window.removeEventListener("multideck:inbox-changed", refresh)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      window.clearInterval(interval)
    }
  }, [])

  const money = useMemo(() => new Intl.NumberFormat(language, {
    style: "currency",
    currency: data?.summary.currencyCode || "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }), [data?.summary.currencyCode, language])
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const shortDate = useMemo(() => new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }), [language])
  const formatDateTime = useCallback((value: string) => dateTime.format(new Date(value)), [dateTime])
  const formatShortDate = useCallback((value: string) => shortDate.format(new Date(value)), [shortDate])
  const formatMoney = useCallback(
    (value: number, currency: string) =>
      new Intl.NumberFormat(language, { style: "currency", currency: currency || "GBP", notation: "compact", maximumFractionDigits: 1 }).format(value),
    [language],
  )

  /**
   * Six numbers, each with a real destination. There is no previous period in
   * the CRM snapshot, so no cell claims a delta it cannot evidence — the
   * supporting line carries a second real fact instead.
   */
  const kpis = useMemo<DashboardKpi[]>(() => {
    if (!data) return []
    const queueTotal = followUpData?.summary.total ?? 0
    const notInCrm = followUpData?.summary.notInCrm ?? 0
    const largestArea = data.areas.reduce<{ label: string; count: number } | null>(
      (best, area) => (!best || area.count > best.count ? { label: area.label.split(" · ")[0], count: area.count } : best),
      null,
    )
    return [
      { label: t("Open leads"), value: String(data.summary.openLeads), detail: data.summary.staleLeads ? `${data.summary.staleLeads} ${t("gone quiet")}` : t("all recently touched"), tone: "teal", icon: Users },
      { label: t("Needs follow-up"), value: String(queueTotal), detail: notInCrm ? `${notInCrm} ${t("not in CRM yet")}` : t("all already on record"), tone: "amber", icon: AlarmClock },
      { label: t("Replies due"), value: String(followUpData?.summary.repliesDue ?? 0), detail: t("people waiting on you"), tone: "red", icon: Reply },
      { label: t("Open deals"), value: String(data.summary.openDeals), detail: `${data.pipeline.length} ${data.pipeline.length === 1 ? t("stage across all pipelines") : t("stages across all pipelines")}`, tone: "blue", icon: Briefcase },
      { label: t("Pipeline value"), value: money.format(data.summary.pipelineValue), detail: t("company-wide, open and unweighted"), tone: "green", icon: Wallet },
      { label: t("Areas"), value: String(data.areas.length), detail: largestArea ? `${t("most in")} ${largestArea.label}` : t("no address on file"), tone: "neutral", icon: MapPin },
    ]
  }, [data, followUpData, money, t])

  const openKpi = useCallback((label: string) => {
    if (label === t("Open deals") || label === t("Pipeline value")) window.location.href = "/crm/deals"
    else if (label === t("Areas")) window.location.href = "/crm/accounts"
    else if (label === t("Open leads")) window.location.href = "/crm/leads"
  }, [t])

  const openFollowUp = useCallback((opportunity: CrmFollowUpOpportunity) => {
    if (opportunity.recordType === "lead" && opportunity.recordId) window.location.href = `/crm/leads/${opportunity.recordId}`
    else if (opportunity.recordType === "deal" && opportunity.recordId) window.location.href = `/crm/deals/${opportunity.recordId}`
    else if (opportunity.recordType === "quote" && opportunity.recordId) window.location.href = `/quotes/${opportunity.recordId}`
    else if (opportunity.threadId && opportunity.mailboxId) window.location.href = `/inbox?mailbox=${encodeURIComponent(opportunity.mailboxId)}&thread=${encodeURIComponent(opportunity.threadId)}`
    else if (opportunity.recordType === "contact" && opportunity.recordId) window.location.href = `/crm/contacts/${opportunity.recordId}`
    else if (opportunity.recordType === "account" && opportunity.recordId) window.location.href = `/crm/accounts/${opportunity.recordId}`
  }, [])

  const renderCreate = useCallback((opportunity: CrmFollowUpOpportunity) => (
    <FollowUpCreateMenu opportunity={opportunity} onChoose={(kind) => { setCreateOpportunity(opportunity); setCreateKind(kind) }} />
  ), [])

  const openLead = useCallback((leadId: string) => { window.location.href = `/crm/leads/${leadId}` }, [])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("CRM dashboard")} className="md-page md-page-stack-compact md-dashboard md-crm-dashboard">
      <CrmPageHeader
        title={t("CRM dashboard")}
        summary={<>{t("Your assigned leads and follow-ups, with the company deal pipeline in one consistent view.")}</>}
        onSpeakToDexter={() => setDexterOpen(true)}
        action={<Button className="h-10 rounded-[var(--md-radius-lg)]" onClick={() => { window.location.href = "/crm/deals" }}>{t("Open deals")}</Button>}
      />

      {/* The skeleton reserves the loaded page's geometry, so arriving data
          changes opacity rather than pushing the page around. */}
      <AnimatePresence mode="wait" initial={false}>
        {state === "loading" ? (
          <motion.div key="loading" exit={{ opacity: 0 }} transition={mdMotion.exit}>
            <CrmDashboardSkeleton />
          </motion.div>
        ) : state === "error" ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={mdMotion.enter}>
            <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
              <SectionHeader title={t("The CRM dashboard could not be loaded.")} meta={error ?? undefined} />
              <Button variant="outline" className="mt-4" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw className="size-4" />{t("Retry")}</Button>
            </Surface>
          </motion.div>
        ) : data ? (
          <motion.div
            key="ready"
            className="flex flex-col gap-[var(--md-page-stack-gap-compact)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={mdMotion.enter}
          >
            <CrmBand index={0}>
              <KpiStrip kpis={kpis} columns={6} onSelect={openKpi} />
            </CrmBand>

            {/* What the pipeline is worth, beside the work that is waiting —
                the pair a salesperson actually operates from. */}
            <CrmBand index={1} className="md-crm-lead">
              <CrmOpportunityValue
                stages={data.pipeline}
                totalValue={data.summary.pipelineValue}
                totalDeals={data.summary.openDeals}
                currencyCode={data.summary.currencyCode || "GBP"}
                formatValue={formatMoney}
                onOpen={() => { window.location.href = "/crm/deals" }}
              />
              <CrmFollowUpQueue
                data={followUpData}
                onOpen={openFollowUp}
                renderCreate={renderCreate}
                onViewAll={() => { window.location.href = "/inbox" }}
              />
            </CrmBand>

            {/* Money quietly at risk, where the leads are, and what has just
                happened — the three supporting reads. */}
            <CrmBand index={2} className="md-crm-trio">
              <CrmQuietLeads
                leads={data.followUps}
                inactivityDays={crmInactivityDays}
                formatValue={formatMoney}
                formatDate={formatShortDate}
                onOpenLead={openLead}
                onViewAll={() => { window.location.href = "/crm/leads" }}
              />
              <CrmAreaHeatmap areas={data.areas} onOpen={() => { window.location.href = "/crm/accounts" }} />
              <CrmActivityFeed
                activity={data.activity}
                formatDateTime={formatDateTime}
              />
            </CrmBand>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <FollowUpRecordDialog
        opportunity={createOpportunity}
        kind={createKind}
        onClose={() => { setCreateOpportunity(null); setCreateKind(null) }}
        onCreated={() => setReloadKey((key) => key + 1)}
      />
    </DexterDockedPage>
  )
}

function PipelineSettingsDrawer({
  open,
  canEdit,
  addStageRequestKey,
  onClose,
}: {
  open: boolean
  canEdit: boolean
  addStageRequestKey: number
  onClose: () => void
}) {
  const { t } = useLanguage()

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      eyebrow={t("Deals")}
      title={t("Pipeline settings")}
      icon={Settings2}
      width={980}
      bodyClassName="overflow-x-hidden rounded-[var(--md-radius-xl)]"
    >
      <CrmSettingsBuilder canEdit={canEdit} addStageRequestKey={addStageRequestKey} stacked />
    </SideDrawer>
  )
}

export function CrmLeadsPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const [advancedFilter, setAdvancedFilter] = useState<FilterQuery>(() => createEmptyFilterQuery("lead"))
  const [leadScope, setLeadScope] = useState<LeadScope>("All")
  const currentLeadOwnerId = currentUser?.internalUserId ?? null
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(defaultPaginationPageSize)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [revalidating, setRevalidating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const lastConsumedReloadToken = useRef(0)
  const hasLoadedLeads = useRef(false)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(emptyLeadSummary)
  const [facets, setFacets] = useState(emptyLeadFacets)
  const [sort, setSort] = useState<CrmRegisterSort | null>({ id: "lead", direction: "asc" })
  const { language, t } = useLanguage()

  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCrmLead, () => setCreateLeadOpen(true)), [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    let isMounted = true
    const forceRefresh = reloadToken !== lastConsumedReloadToken.current
    lastConsumedReloadToken.current = reloadToken
    if (hasLoadedLeads.current) setRevalidating(true)
    else setLoadState("loading")
    setLoadError(null)

    const serverSort = sort ? {
      id: ({
        stage: "status",
        qualification: "rating",
        engagement: "last-activity",
        "follow-up": "next-follow-up",
      } as Record<string, string>)[sort.id] ?? sort.id,
      direction: sort.direction,
    } : null
    listLeadsPage({
      search: debouncedSearch,
      ownerId: leadScope === "Mine" ? currentLeadOwnerId ?? "__no_current_user__" : undefined,
      filterQuery: filterQueryIsEmpty(advancedFilter) ? null : advancedFilter,
      sort: serverSort,
      limit: rowsPerPage,
      offset: (page - 1) * rowsPerPage,
    }, { forceRefresh })
      .then((data) => {
        if (!isMounted) return
        setLeads(data.rows)
        setTotal(data.total)
        setSummary(data.summary)
        setFacets(data.facets)
        hasLoadedLeads.current = true
        setRevalidating(false)
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        const message = error instanceof Error ? error.message : t("Unable to load CRM leads. Check your connection and try again.")
        setLoadError(message)
        setRevalidating(false)
        if (hasLoadedLeads.current) {
          toast.error(message)
          return
        }
        setLoadState("error")
      })

    return () => {
      isMounted = false
    }
  }, [advancedFilter, currentLeadOwnerId, debouncedSearch, leadScope, page, reloadToken, rowsPerPage, sort, t])

  const { dueFollowUps, recent: recentLeads, valued: valuedLeads, open: openLeads, qualified: qualifiedLeads } = summary
  const advancedFilterFields: FilterFieldOption[] = [
    { value: "lead", label: t("Lead name") },
    { value: "contact", label: t("Primary contact") },
    { value: "email", label: t("Email") },
    { value: "stage", label: t("Stage"), kind: "select", options: facets.statuses.map(item => ({ value: item.code, label: item.name })) },
    { value: "source", label: t("Source"), kind: "select", options: facets.sources.map(item => ({ value: item.code, label: item.name })) },
    { value: "owner", label: t("Owner"), kind: "select", options: facets.owners.map(item => ({ value: item.id, label: item.name })) },
    { value: "rating", label: t("Rating"), kind: "select", options: facets.ratings.map(item => ({ value: item.code, label: item.name })) },
    { value: "follow-up", label: t("Follow-up"), kind: "select", options: [
      { value: "overdue", label: t("Overdue") }, { value: "scheduled", label: t("Scheduled") }, { value: "unscheduled", label: t("Not scheduled") },
    ] },
    { value: "value", label: t("Value"), kind: "select", options: [
      { value: "valued", label: t("Value recorded") }, { value: "unvalued", label: t("No value recorded") },
    ] },
    { value: "next-follow-up", label: t("Next follow-up date"), kind: "date" },
    { value: "created", label: t("Created date"), kind: "date" },
    { value: "last-activity", label: t("Last activity date"), kind: "date" },
    { value: "trade-lane", label: t("Trade lane") },
    { value: "service", label: t("Service interest") },
  ]
  const countAdvancedMatches = useCallback(async (query: FilterQuery) => {
    const result = await listLeadsPage({
      search: debouncedSearch,
      ownerId: leadScope === "Mine" ? currentLeadOwnerId ?? "__no_current_user__" : undefined,
      filterQuery: filterQueryIsEmpty(query) ? null : query, limit: 1, offset: 0,
    })
    return result.total
  }, [debouncedSearch, leadScope, currentLeadOwnerId])

  const pageCount = Math.max(Math.ceil(total / rowsPerPage), 1)

  useEffect(() => {
    setPage(1)
  }, [advancedFilter, debouncedSearch, leadScope])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function openLeadDetail(lead: Lead) {
    navigate(getLeadCrmPath(lead))
  }

  function changeLeadScope(nextScope: LeadScope) {
    if (nextScope === leadScope) return
    if (hasLoadedLeads.current) setRevalidating(true)
    setLeadScope(nextScope)
  }

  function clearLeadFilters() {
    setSearchQuery("")
    setLeadScope("All")
    setAdvancedFilter(createEmptyFilterQuery("lead"))
    setPage(1)
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Leads")} className="md-page md-page-stack-compact">
      <CrmPageHeader
        title={t("Leads")}
        summary={
          <>
            {t("Qualify prospects using their source, engagement, next action, commercial fit, and real opportunity context.")}
          </>
        }
        onSpeakToDexter={() => setDexterOpen(true)}
      />

      {loadState === "ready" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            [t("Total leads"), summary.leads, t("all recorded prospects")],
            [t("Open leads"), openLeads, t("still in qualification")],
            [t("Due follow-ups"), dueFollowUps, t("need attention now")],
            [t("Valued leads"), valuedLeads, t("with value or opportunity context")],
            [t("Recent leads"), recentLeads, t("created in the last 30 days")],
            [t("Qualified leads"), qualifiedLeads, t("score 70 or above")],
          ].map(([label, value, detail]) => (
            <Surface key={String(label)} padding="none" className="h-[44px] min-w-0 rounded-[var(--md-radius-lg)] px-3 py-1.5">
              <div className="flex h-full min-w-0 items-center gap-2.5">
                <p className="shrink-0 text-[19px] font-medium leading-none tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">
                  {new Intl.NumberFormat(language).format(Number(value))}
                </p>
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] font-medium leading-[13px] text-[var(--md-text)]">{label}</p>
                  <p className="truncate text-[9px] leading-[11px] text-[var(--md-subtle)]">{detail}</p>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      ) : null}

      {loadState === "loading" ? (
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)]">
          <DotGridLoaderPanel label="Loading CRM leads…" minHeight={0} />
        </Surface>
      ) : null}

      {loadState === "error" ? (
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
          <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Unable to load CRM leads. Check your connection and try again.")}</p>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]" dir="auto">{loadError ? t(loadError) : null}</p>
          <Button
            variant="ghost"
            className="mt-4 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCw data-icon="inline-start" strokeWidth={1.2} />
            {t("Retry")}
          </Button>
        </Surface>
      ) : null}

      {loadState === "ready" ? (
        <>
          <CrmLeadQualificationTable
            leads={leads}
            onOpenLead={openLeadDetail}
            loadExportRecords={(selectedLeads) => Promise.all(selectedLeads.map((lead) => getLead(lead.id)))}
            registerExport={{
              busy: revalidating || Boolean(loadError) || searchQuery.trim() !== debouncedSearch,
              loadAllRows: (signal) => collectExportPages((exportPage) => listLeadsPage({
                search: debouncedSearch,
                ownerId: leadScope === "Mine" ? currentLeadOwnerId ?? "__no_current_user__" : undefined,
                filterQuery: filterQueryIsEmpty(advancedFilter) ? null : advancedFilter,
                sort: sort ? { id: ({ stage: "status", qualification: "rating", engagement: "last-activity", "follow-up": "next-follow-up" } as Record<string, string>)[sort.id] ?? sort.id, direction: sort.direction } : null,
                ...exportPage,
              }, { forceRefresh: true }), (lead) => lead.id, signal),
            }}
            emptyMessage={summary.leads ? t(leadScope === "Mine" ? "No leads assigned to you." : "No leads match this view.") : t("No leads have been recorded yet.")}
            serverSorting={{ value: sort, onChange: (next) => { setSort(next ?? { id: "lead", direction: "asc" }); setPage(1) } }}
            toolbarTabs={<RegisterViewSwitch options={leadScopes} value={leadScope} onChange={changeLeadScope} counts={revalidating ? {} : { All: leadScope === "All" ? total : undefined, Mine: leadScope === "Mine" ? total : undefined }} ariaLabel="Lead ownership filter" compact />}
            toolbarOptions={<RegisterRevalidatingMark active={revalidating} />}
            toolbarSearch={(
              <div className="relative min-w-[128px] max-w-[280px] flex-1 sm:min-w-[200px] sm:flex-none">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.35} aria-hidden="true" />
                  <Input
                    type="search"
                    value={searchQuery}
                    dir="auto"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label={t("Search leads")}
                    placeholder={t("Search leads")}
                    className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] ps-8 pe-8 text-base shadow-[var(--md-shadow-line)] md:text-[12px]"
                  />
                  {searchQuery ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={t("Clear quick search")} className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-[var(--md-radius-sm)]" onClick={() => setSearchQuery("")}>
                      <X className="size-3.5" strokeWidth={1.4} />
                    </Button>
                  ) : null}
              </div>
            )}
            toolbarFilters={<AdvancedFilterPopover
              fields={advancedFilterFields}
              value={advancedFilter}
              onChange={(value) => { setAdvancedFilter(value); setPage(1) }}
              storageKey="crm-lead-register"
              itemLabel="leads"
              totalCount={total}
              countMatches={countAdvancedMatches}
            />}
            emptyState={summary.leads ? (
              <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
                <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                  <Search className="size-4" strokeWidth={1.3} aria-hidden="true" />
                </span>
                <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(leadScope === "Mine" ? "No leads assigned to you." : "No leads match this view.")}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(leadScope === "Mine" ? "Leads appear here when you are the current owner." : "Change or clear a filter to see more leads.")}</p>
                <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-3 text-[12px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" onClick={clearLeadFilters}>
                  {t("Clear filters")}
                </Button>
              </div>
            ) : undefined}
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={total}
            pageSize={rowsPerPage}
            pageSizeOptions={rowsPerPageOptions}
            loading={revalidating}
            itemCount={leads.length}
            itemLabel="leads"
            onPageChange={setPage}
            onPageSizeChange={(nextRowsPerPage) => {
              setRowsPerPage(nextRowsPerPage)
              setPage(1)
            }}
          />
        </>
      ) : null}
      <FollowUpRecordDialog
        opportunity={null}
        kind="lead"
        open={createLeadOpen}
        onClose={() => setCreateLeadOpen(false)}
        onCreated={() => setReloadToken((token) => token + 1)}
      />
    </DexterDockedPage>
  )
}

export function CrmLeadDetailPage({
  navigate,
  leadId,
  currentUser,
}: {
  navigate: (path: string) => void
  leadId: string
  currentUser?: AuthUserSummary | null
}) {
  const [lead, setLead] = useState<ApiLeadDetail | null>(null)
  const [ownerPhotoUrls, setOwnerPhotoUrls] = useState<Map<string, string>>(new Map())
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [transferUsers, setTransferUsers] = useState<CrmTransferUser[]>([])
  const [transferUsersState, setTransferUsersState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [transferUsersTotal, setTransferUsersTotal] = useState(0)
  const [transferUsersReloadToken, setTransferUsersReloadToken] = useState(0)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferSearch, setTransferSearch] = useState("")
  const [debouncedTransferSearch, setDebouncedTransferSearch] = useState("")
  const [transferReason, setTransferReason] = useState("")
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferRequests, setTransferRequests] = useState<CrmLeadTransferRequest[]>([])
  const [ownershipNote, setOwnershipNote] = useState("")
  const [ownershipError, setOwnershipError] = useState<string | null>(null)
  const [ownershipSaving, setOwnershipSaving] = useState<string | null>(null)
  const leadRef = useRef<ApiLeadDetail | null>(null)
  const leadSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const { t } = useLanguage()

  useEffect(() => {
    let isMounted = true
    setLoadState("loading")
    setLoadError(null)
    leadRef.current = null

    const leadRequest = getLead(leadId)
    Promise.all([
      leadRequest,
      leadRequest.then((data) => loadLeadOwnerPhotoUrls(data.ownerId ? [data.ownerId] : [])).catch(() => new Map<string, string>()),
      listLeadTransferRequests(leadId)
        .then((requests) => ({ requests, error: null as string | null }))
        .catch((cause: unknown) => ({
          requests: [] as CrmLeadTransferRequest[],
          error: cause instanceof Error ? cause.message : t("Ownership requests could not be loaded."),
        })),
    ])
      .then(([data, nextOwnerPhotoUrls, ownership]) => {
        if (!isMounted) return
        leadRef.current = data
        setLead(data)
        setOwnerPhotoUrls(nextOwnerPhotoUrls)
        setTransferRequests(ownership.requests)
        setOwnershipError(ownership.error)
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        setLoadError(error instanceof Error ? error.message : t("Unable to load this lead. Check your connection and try again."))
        setLoadState("error")
      })

    return () => {
      isMounted = false
    }
  }, [leadId, reloadToken, t])

  const currentTransferUser = currentUser?.internalUserId ? {
    id: currentUser.internalUserId,
    name: currentUser.name ?? currentUser.email ?? t("Current user"),
    email: currentUser.email ?? "",
    isCurrentUser: true,
  } satisfies CrmTransferUser : null
  const isOwner = Boolean(currentTransferUser && lead?.ownerId === currentTransferUser.id)
  const canOverrideTransfer = hasPermission(currentUser, "CRM.Leads.Reassign")
  const canDirectTransfer = isOwner || canOverrideTransfer
  const pendingRequests = transferRequests.filter((request) => request.status === "pending")
  const requestsToReview = pendingRequests.filter((request) => request.canDecide)
  const currentPendingRequest = currentTransferUser
    ? pendingRequests.find((request) => request.requesterId === currentTransferUser.id)
    : undefined
  const availableTransferUsers = transferUsers

  useEffect(() => {
    if (!transferOpen) return
    const timer = window.setTimeout(() => setDebouncedTransferSearch(transferSearch.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [transferOpen, transferSearch])

  useEffect(() => {
    if (!transferOpen || !canDirectTransfer || !lead) return
    let active = true
    setTransferUsersState("loading")
    listCrmTransferUsersPage({
      search: debouncedTransferSearch,
      excludeUserId: lead.ownerId,
      limit: 25,
      offset: 0,
    })
      .then((page) => {
        if (!active) return
        setTransferUsers(page.rows)
        setTransferUsersTotal(page.total)
        setTransferUsersState("ready")
      })
      .catch(() => {
        if (!active) return
        setTransferUsers([])
        setTransferUsersTotal(0)
        setTransferUsersState("error")
      })
    return () => { active = false }
  }, [canDirectTransfer, debouncedTransferSearch, lead, transferOpen, transferUsersReloadToken])

  async function submitTransfer(targetUser: CrmTransferUser) {
    if (!lead || !canDirectTransfer || transferSaving) return
    if (!isOwner && !transferReason.trim()) {
      toast.error(t("Add a reason before overriding the current owner."))
      return
    }
    setTransferSaving(true)
    try {
      await transferLead(lead.id, targetUser.id, transferReason)
      toast.success(`${t("Lead transferred to")} ${targetUser.name}`)
      setTransferOpen(false)
      setTransferSearch("")
      setTransferReason("")
      setReloadToken((token) => token + 1)
    } catch (submitError) {
      if (submitError instanceof CrmMutationOutcomeUnknownError) {
        setReloadToken((token) => token + 1)
      }
      toast.error(submitError instanceof Error ? submitError.message : t("Lead ownership could not be updated."))
    } finally {
      setTransferSaving(false)
    }
  }

  async function refreshOwnershipRequests() {
    try {
      const requests = await listLeadTransferRequests(leadId)
      setTransferRequests(requests)
      setOwnershipError(null)
    } catch (cause) {
      setOwnershipError(cause instanceof Error ? cause.message : t("Ownership requests could not be loaded."))
    }
  }

  async function submitOwnershipRequest() {
    if (!lead || !currentTransferUser || ownershipSaving) return
    setOwnershipSaving("request")
    try {
      const request = await requestLeadTransfer(lead.id, ownershipNote)
      setTransferRequests((current) => [request, ...current.filter((item) => item.id !== request.id)])
      setOwnershipNote("")
      toast.success(t("Ownership request sent"))
    } catch (cause) {
      if (cause instanceof CrmMutationOutcomeUnknownError) await refreshOwnershipRequests()
      toast.error(cause instanceof Error ? cause.message : t("The ownership request could not be sent."))
    } finally {
      setOwnershipSaving(null)
    }
  }

  async function cancelOwnershipRequest(request: CrmLeadTransferRequest) {
    if (ownershipSaving) return
    setOwnershipSaving(request.id)
    try {
      const cancelled = await cancelLeadTransfer(request.id)
      setTransferRequests((current) => current.map((item) => item.id === cancelled.id ? cancelled : item))
      toast.success(t("Ownership request cancelled"))
    } catch (cause) {
      if (cause instanceof CrmMutationOutcomeUnknownError) await refreshOwnershipRequests()
      toast.error(cause instanceof Error ? cause.message : t("The ownership request could not be cancelled."))
    } finally {
      setOwnershipSaving(null)
    }
  }

  async function decideOwnershipRequest(request: CrmLeadTransferRequest, decision: "approved" | "declined") {
    if (ownershipSaving) return
    setOwnershipSaving(request.id)
    try {
      await decideLeadTransfer(request.id, decision, ownershipNote)
      toast.success(t(decision === "approved" ? "Ownership request approved" : "Ownership request declined"))
      setOwnershipNote("")
      if (decision === "approved") {
        setTransferOpen(false)
        setReloadToken((token) => token + 1)
      } else {
        await refreshOwnershipRequests()
      }
    } catch (cause) {
      if (cause instanceof CrmMutationOutcomeUnknownError) {
        await refreshOwnershipRequests()
        setReloadToken((token) => token + 1)
      }
      toast.error(cause instanceof Error ? cause.message : t("The ownership request could not be updated."))
    } finally {
      setOwnershipSaving(null)
    }
  }

  async function changeLeadMarketingOptIn(optedIn: boolean) {
    if (!lead) return
    try {
      await setMarketingOptIn("lead", lead.id, optedIn)
      const latest = await getLead(lead.id)
      leadRef.current = latest
      setLead(latest)
      toast.success(t(optedIn ? "Marketing opt-in recorded" : "Marketing opt-out recorded"))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("Marketing consent could not be updated."))
      throw cause
    }
  }

  function patchLead(change: UpdateLeadInput) {
    const save = leadSaveQueue.current.then(async () => {
      const current = leadRef.current
      if (!current) throw new Error(t("This lead is not ready to edit yet."))
      try {
        const summary = await updateLead(leadId, change, current.editVersion)
        const next = { ...current, ...summary }
        leadRef.current = next
        setLead(next)
      } catch (cause) {
        if (cause instanceof CrmConflictError) {
          const latest = await getLead(leadId)
          leadRef.current = latest
          setLead(latest)
        }
        throw cause
      }
    })
    leadSaveQueue.current = save.catch(() => undefined)
    return save
  }

  async function changeContactMarketingOptIn(contactId: string, optedIn: boolean) {
    try {
      const result = await setMarketingOptIn("contact", contactId, optedIn)
      setLead((current) => current ? {
        ...current,
        contacts: current.contacts.map((contact) => contact.id === contactId ? {
          ...contact,
          marketingOptIn: result.marketingOptIn,
          marketingConsentSource: result.marketingConsentSource,
          marketingConsentUpdatedAt: result.marketingConsentUpdatedAt,
        } : contact),
      } : current)
      toast.success(t(optedIn ? "Marketing opt-in recorded" : "Marketing opt-out recorded"))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("Marketing consent could not be updated."))
      throw cause
    }
  }

  if (loadState === "loading") {
    return (
      <div className="md-page">
        <Surface padding="lg" className="grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)]">
          <DotGridLoaderPanel label="Loading lead qualification…" minHeight={0} />
        </Surface>
      </div>
    )
  }

  if (loadState === "error" || !lead) {
    return (
      <div className="md-page md-page-stack">
        <Button
          variant="ghost"
          className="w-fit rounded-[var(--md-radius-md)] bg-white/45 shadow-[var(--md-shadow-line)]"
          onClick={() => navigate("/crm/leads")}
        >
          <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
          {t("Back to leads")}
        </Button>
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
          <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Lead unavailable")}</p>
          <p className="mt-2 text-[13px] text-[var(--md-text)]" dir="auto">{t(loadError ?? "This lead may have been removed or you may no longer have access.")}</p>
          <Button
            variant="ghost"
            className="mt-4 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCw data-icon="inline-start" strokeWidth={1.2} />
            {t("Retry")}
          </Button>
        </Surface>
      </div>
    )
  }

  return (
    <div className="md-page md-page-stack-compact">
      <CrmLeadDetailPanel
        lead={lead}
        ownerPhotoUrl={lead.ownerId ? ownerPhotoUrls.get(lead.ownerId) : undefined}
        ownerAction={currentTransferUser ? (
          <Popover open={transferOpen} onOpenChange={(open) => {
            setTransferOpen(open)
            if (!open) {
              setTransferSearch("")
              setDebouncedTransferSearch("")
              setTransferUsers([])
              setTransferUsersTotal(0)
              setTransferUsersState("idle")
              setTransferReason("")
              setOwnershipNote("")
            }
          }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-11 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]"
                aria-label={t(canDirectTransfer ? "Manage ownership" : currentPendingRequest ? "Ownership request pending" : "Request ownership")}
                title={t(canDirectTransfer ? "Manage ownership" : currentPendingRequest ? "Ownership request pending" : "Request ownership")}
              >
                <ArrowRightLeft className="size-4" strokeWidth={1.4} aria-hidden="true" />
                {requestsToReview.length ? <span className="absolute -end-0.5 -top-0.5 grid min-w-3.5 place-items-center rounded-full bg-[var(--md-accent)] px-1 text-[8px] font-medium leading-[14px] text-white" data-i18n-skip>{requestsToReview.length}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(360px,calc(100vw-32px))] rounded-[var(--md-radius-lg)] border-0 p-0 shadow-[var(--md-shadow-lift)]">
              <div className="p-3 shadow-[var(--md-stroke-bottom)]">
                <p className="text-[12px] font-medium text-[var(--md-ink)]">{t(canDirectTransfer ? "Manage ownership" : "Request ownership")}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--md-subtle)]">{t(canDirectTransfer ? "Transfer this lead or review requests from colleagues." : "Ask the current owner to transfer this lead to you.")}</p>
              </div>
              <div className="md-scrollbar max-h-[min(520px,calc(100vh-180px))] overflow-y-auto">
                {ownershipError ? (
                  <div role="alert" className="m-3 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_7%,var(--md-surface))] p-3 text-[11px] leading-4 text-[var(--md-text)]">
                    <p dir="auto">{ownershipError}</p>
                    <Button type="button" variant="outline" className="mt-2 h-8" onClick={() => void refreshOwnershipRequests()}>{t("Try again")}</Button>
                  </div>
                ) : null}

                {requestsToReview.length ? (
                  <section className="grid gap-2 p-3 shadow-[var(--md-stroke-bottom)]" aria-labelledby="ownership-requests-title">
                    <div>
                      <p id="ownership-requests-title" className="text-[11px] font-medium text-[var(--md-ink)]">{t("Ownership requests")}</p>
                      <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Approve only when responsibility has been agreed with the requester.")}</p>
                    </div>
                    {requestsToReview.map((request) => (
                      <div key={request.id} className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-2.5">
                        <p className="text-[11.5px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{request.requesterName}</p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">{t("Wants to take ownership")}</p>
                        {request.requestNote ? <p className="mt-2 text-[11px] leading-4 text-[var(--md-text)]" dir="auto">{request.requestNote}</p> : null}
                        <div className="mt-2 flex gap-2">
                          <Button type="button" className="h-8 flex-1" disabled={Boolean(ownershipSaving)} onClick={() => void decideOwnershipRequest(request, "approved")}>
                            {ownershipSaving === request.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}{t("Approve")}
                          </Button>
                          <Button type="button" variant="outline" className="h-8 flex-1" disabled={Boolean(ownershipSaving)} onClick={() => void decideOwnershipRequest(request, "declined")}>{t("Decline")}</Button>
                        </div>
                      </div>
                    ))}
                    <Textarea value={ownershipNote} onChange={(event) => setOwnershipNote(event.target.value)} placeholder={t("Decision note (optional)")} aria-label={t("Decision note")} dir="auto" className="min-h-[64px] rounded-[var(--md-radius-md)] text-[12px]" />
                  </section>
                ) : null}

                {canDirectTransfer ? (
                  <section className="grid gap-2 p-3" aria-labelledby="transfer-lead-title">
                    <div>
                      <p id="transfer-lead-title" className="text-[11px] font-medium text-[var(--md-ink)]">{t("Transfer lead")}</p>
                      <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t(isOwner ? "Choose the team member who should own this lead." : "A reason is required because you are overriding the current owner.")}</p>
                    </div>
                    <Textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder={t(isOwner ? "Transfer note (optional)" : "Reason for overriding ownership")} aria-label={t(isOwner ? "Transfer note" : "Override reason")} dir="auto" className="min-h-[64px] rounded-[var(--md-radius-md)] text-[12px]" />
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                      <Input
                        autoFocus={!requestsToReview.length}
                        value={transferSearch}
                        onChange={(event) => setTransferSearch(event.target.value)}
                        placeholder={t("Search team members…")}
                        aria-label={t("Search team members")}
                        className="h-9 rounded-[var(--md-radius-md)] ps-9 text-[12px]"
                      />
                    </div>
                    <div role="listbox" aria-label={t("Team members")}>
                      {transferUsersState === "loading" ? (
                        <div className="flex min-h-24 items-center justify-center gap-2 px-3 py-6 text-[12px] text-[var(--md-subtle)]" role="status" aria-live="polite">
                          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          {t("Loading team members…")}
                        </div>
                      ) : transferUsersState === "error" ? (
                        <div className="grid min-h-24 place-items-center gap-2 px-3 py-5 text-center" role="alert">
                          <p className="text-[12px] text-[var(--md-subtle)]">{t("Team members could not be loaded.")}</p>
                          <Button type="button" variant="outline" className="h-8" onClick={() => setTransferUsersReloadToken((value) => value + 1)}>{t("Try again")}</Button>
                        </div>
                      ) : availableTransferUsers.length ? availableTransferUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          role="option"
                          aria-selected="false"
                          disabled={transferSaving || (!isOwner && !transferReason.trim())}
                          className="flex min-h-11 w-full items-center gap-3 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start transition-colors hover:bg-[var(--md-surface-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] disabled:opacity-50"
                          onClick={() => void submitTransfer(user)}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--md-accent-a11)] text-[11px] font-medium text-[var(--md-accent)]" aria-hidden="true">
                            {user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{user.name}</span>
                            <span className="block truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{user.email}</span>
                          </span>
                          {transferSaving ? <LoaderCircle className="size-4 animate-spin text-[var(--md-subtle)]" aria-hidden="true" /> : null}
                        </button>
                      )) : (
                        <p className="px-3 py-6 text-center text-[12px] text-[var(--md-subtle)]">{t("No team members match this search.")}</p>
                      )}
                    </div>
                    {transferUsersState === "ready" && transferUsersTotal > availableTransferUsers.length ? (
                      <p className="px-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">
                        {t("Showing the first results. Search by name or email to narrow the list.")}
                      </p>
                    ) : null}
                  </section>
                ) : currentPendingRequest ? (
                  <section className="grid gap-3 p-3">
                    <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3">
                      <p className="text-[11.5px] font-medium text-[var(--md-ink)]">{t("Ownership request pending")}</p>
                      <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-text)]">{t("The current owner has been notified. You can keep working elsewhere while they decide.")}</p>
                      {currentPendingRequest.requestNote ? <p className="mt-2 text-[11px] leading-4 text-[var(--md-subtle)]" dir="auto">{currentPendingRequest.requestNote}</p> : null}
                    </div>
                    <Button type="button" variant="outline" className="h-9" disabled={Boolean(ownershipSaving)} onClick={() => void cancelOwnershipRequest(currentPendingRequest)}>
                      {ownershipSaving === currentPendingRequest.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}{t("Cancel request")}
                    </Button>
                  </section>
                ) : (
                  <section className="grid gap-3 p-3">
                    <Textarea value={ownershipNote} onChange={(event) => setOwnershipNote(event.target.value)} placeholder={t("Tell the owner why you should take this lead (optional)")} aria-label={t("Ownership request note")} dir="auto" className="min-h-[76px] rounded-[var(--md-radius-md)] text-[12px]" />
                    <Button type="button" className="h-9" disabled={Boolean(ownershipSaving)} onClick={() => void submitOwnershipRequest()}>
                      {ownershipSaving === "request" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}{t("Send ownership request")}
                    </Button>
                  </section>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : undefined}
        onBack={() => navigate("/crm/leads")}
        onMarketingOptInChange={changeLeadMarketingOptIn}
        onContactMarketingOptInChange={changeContactMarketingOptIn}
      />

      <PhoneCallLinkedRecordSection recordType="lead" recordId={lead.id} navigate={navigate} />

      {/* The panel above reads the lead. This is where it is changed — the same
          inline fields the account, contact and deal records use, so one record
          does not behave differently from the next. */}
      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
        <InlineFieldCard title="The lead" directEdit>
          <InlineField label="Company" value={lead.companyName ?? ""} required onSave={(companyName) => patchLead({ companyName })} />
          <InlineField label="Contact" value={lead.primaryContactName ?? ""} onSave={(primaryContactName) => patchLead({ primaryContactName: primaryContactName || null })} />
          <InlineField label="Email" kind="email" placeholder="name@example.com" value={lead.primaryContactEmail ?? ""} onSave={(primaryContactEmail) => patchLead({ primaryContactEmail: primaryContactEmail || null })} />
          <InlineField label="Country" value={lead.countryCode ?? ""} placeholder="GB" hint="Two-letter country code" onSave={(countryCode) => patchLead({ countryCode: countryCode || null })} />
          <InlineField label="Owner" value={lead.ownerName ?? ""} readOnly />
          <InlineField label="Status" value={lead.statusName ?? ""} readOnly />
        </InlineFieldCard>

        <InlineFieldCard title="What they want" directEdit>
          <InlineField label="Service" value={lead.serviceInterest ?? ""} onSave={(serviceInterest) => patchLead({ serviceInterest: serviceInterest || null })} />
          <InlineField label="Trade lane" value={lead.tradeLane ?? ""} onSave={(tradeLane) => patchLead({ tradeLane: tradeLane || null })} />
          <InlineField
            label="Estimated value"
            kind="number"
            value={lead.valueAmount == null ? "" : String(lead.valueAmount)}
            onSave={(value) => patchLead({ valueAmount: value === "" ? null : Number(value) })}
          />
          <InlineField label="Currency" value={lead.valueCurrencyCode ?? ""} placeholder="GBP" hint="Three-letter currency code" onSave={(valueCurrencyCode) => patchLead({ valueCurrencyCode: valueCurrencyCode || null })} />
          <InlineField
            label="Next follow-up"
            kind="date"
            value={lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : ""}
            onSave={(nextFollowUpAt) => patchLead({ nextFollowUpAt: nextFollowUpAt || null })}
          />
        </InlineFieldCard>
      </div>
    </div>
  )
}
function EmailTemplatePreview({ variant }: { variant: string }) {
  return (
    <div className="rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
      <div className="h-1.5 w-12 rounded-full bg-[var(--md-accent)]" />
      <div className="mt-3 grid gap-2">
        {variant === "wide" ? <div className="h-7 rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a14)]" /> : null}
        <div className="h-1.5 w-4/5 rounded-full bg-[rgba(91,113,108,0.18)]" />
        <div className="h-1.5 w-2/3 rounded-full bg-[rgba(91,113,108,0.14)]" />
        <div className="h-1.5 w-1/2 rounded-full bg-[rgba(91,113,108,0.12)]" />
      </div>
      <div className="mt-4 h-4 w-16 rounded-[var(--md-radius-sm)] bg-[var(--md-accent)]" />
    </div>
  )
}

export function CrmListsPage({ navigate }: { navigate: (path: string) => void }) {
  const [dexterOpen, setDexterOpen] = useState(false)

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Lists" className="md-page md-page-stack">
      <CrmPageHeader
        title="Lists"
        summary={
          <>
            Smart lists update themselves from CRM data — build a rule once and every campaign that uses the list stays current.
          </>
        }
        onSpeakToDexter={() => setDexterOpen(true)}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => toast.success("CSV import opened")}
            >
              <Upload data-icon="inline-start" strokeWidth={1.2} />
              Import CSV
            </Button>
            <PrimaryActionButton onClick={() => toast.success("Email list draft created")}>New list</PrimaryActionButton>
          </>
        }
      />

      <div className="grid gap-[var(--md-gap-lg)] lg:grid-cols-2 2xl:grid-cols-3">
        {crmEmailLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className="group min-h-[184px] rounded-[var(--md-radius-xl)] bg-white/72 p-5 text-left shadow-[var(--md-shadow-line)] transition-[background,transform,box-shadow] duration-200 hover:scale-[1.01] hover:bg-white/88 hover:shadow-[var(--md-shadow-lift)]"
            onClick={() => navigate(getCrmListPath(list))}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[16px] font-medium leading-6 text-[var(--md-ink)]">{list.name}</h2>
              <StatusPill tone={list.type === "Smart" ? "teal" : "neutral"}>{list.type}</StatusPill>
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-[34px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{list.count}</span>
              <span className={list.deltaTone === "red" ? "text-[13px] font-medium text-[var(--md-red)]" : list.deltaTone === "green" ? "text-[13px] font-medium text-[var(--md-green)]" : "text-[13px] font-medium text-[var(--md-subtle)]"}>
                {list.delta}
              </span>
            </div>
            <div className="mt-5 h-px bg-[rgba(11,20,19,0.08)]" />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-[13px] text-[var(--md-text)]">Used in: {list.usedIn}</p>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--md-green)]">
                <span className="size-2 rounded-full bg-[var(--md-green)]" />
                {list.statusLabel}
              </span>
            </div>
          </button>
        ))}

        <button
          type="button"
          className="grid min-h-[184px] place-items-center rounded-[var(--md-radius-xl)] bg-white/20 p-5 text-center shadow-[var(--md-shadow-line)] transition-[background,transform] duration-200 hover:scale-[1.01] hover:bg-white/35"
          onClick={() => toast.success("New list draft created")}
        >
          <span>
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--md-accent-a12)] text-[22px] font-medium text-[var(--md-accent)]">+</span>
            <span className="mt-4 block text-[14px] font-medium text-[var(--md-ink)]">New list</span>
            <span className="mt-2 block text-[13px] text-[var(--md-text)]">or describe one to Dexter</span>
          </span>
        </button>
      </div>
    </DexterDockedPage>
  )
}

export function CrmListDetailPage({ navigate, listId }: { navigate: (path: string) => void; listId: string }) {
  const list = crmEmailLists.find((item) => item.id === listId) ?? crmEmailLists[0]
  const memberColumns = useMemo<DataTableColumn<(typeof list.members)[number]>[]>(() => [
    { id: "company", label: "Company", width: 190, minWidth: 150, kind: "identity", cell: (member) => <span className="font-medium text-[var(--md-ink)]">{member[0]}</span> },
    { id: "contact", label: "Contact", width: 160, minWidth: 128, kind: "identity", cell: (member) => <span className="text-[var(--md-text)]">{member[1]}</span> },
    { id: "email", label: "Email", width: 230, minWidth: 190, kind: "text", cellTitle: (member) => member[2], cell: (member) => <span data-i18n-skip dir="ltr" className="block truncate text-[var(--md-text)]">{member[2]}</span> },
    { id: "status", label: "Status", width: 120, minWidth: 104, kind: "status", cell: (member) => <StatusPill kind="status" tone={member[3] === "Dormant" ? "amber" : member[3] === "Lead" || member[3] === "Prospect" ? "blue" : "green"}>{member[3]}</StatusPill> },
    { id: "lastEngagement", label: "Last engagement", width: 160, minWidth: 132, kind: "date", cell: (member) => <span className="text-[var(--md-text)]">{member[4]}</span> },
  ], [list.members])

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Lists"
        title={list.name}
        summary={list.description}
        meta={`${list.count} contacts · ${list.updated}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/lists")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to lists
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => toast.success(`${list.name} exported`)}
            >
              <Download data-icon="inline-start" strokeWidth={1.2} />
              Export
            </Button>
            <PrimaryActionButton onClick={() => toast.success("List rules opened")}>Edit rules</PrimaryActionButton>
          </>
        }
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Members" meta="people currently included in this audience" metaPlacement="responsive-inline" />
          </div>
          <div className="px-5 pb-5"><DataTable clientPagination ariaLabel="List members" columnsButtonLabel="Manage list member columns" columns={memberColumns} rows={list.members} getRowKey={(member) => `${member[0]}-${member[2]}`} storageKey={`crm-list-members-${list.id}`} minimumWidth={860} className="rounded-[var(--md-radius-lg)]" /></div>
        </Surface>

        <div className="md-panel-column">
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="Audience health" meta={list.type === "Smart" ? "updated from CRM rules" : "manual import"} />
            <div className="mt-[var(--md-page-stack-gap)] grid grid-cols-2 gap-3">
              {[
                ["Contacts", String(list.count)],
                ["Owner", list.owner],
                ["Used in", list.usedIn],
                ["Status", list.statusLabel],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[var(--md-radius-lg)] bg-white/45 p-3 shadow-[var(--md-shadow-line)]">
                  <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{value}</p>
                </div>
              ))}
            </div>
          </Surface>

          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="List rules" meta="who is included" />
            <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
              {list.rules.map((rule) => (
                <div key={rule} className="shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{rule}</p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

function EmailMarketingTabs({
  activeSection,
  onSelect,
}: {
  activeSection: EmailMarketingSection
  onSelect: (section: EmailMarketingSection) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showEndFade, setShowEndFade] = useState(false)

  const updateEndFade = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const remaining = element.scrollWidth - element.clientWidth - Math.abs(element.scrollLeft)
    setShowEndFade(remaining > 2)
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    updateEndFade()
    const observer = new ResizeObserver(updateEndFade)
    observer.observe(element)
    const tablist = element.firstElementChild
    if (tablist instanceof HTMLElement) observer.observe(tablist)
    window.addEventListener("resize", updateEndFade)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateEndFade)
    }
  }, [updateEndFade])

  return (
    <div className="md-email-marketing-tabs-shell -mx-1 min-w-0 flex-[1_1_360px]">
      <div
        ref={scrollRef}
        className="md-email-marketing-tabs min-w-0 overflow-x-auto px-1 py-0.5"
        onScroll={updateEndFade}
      >
        <div
          role="tablist"
          aria-label="Email marketing sections"
          className="flex min-w-max gap-0.5"
        >
          {emailMarketingSections.map((section) => {
            const Icon = section.icon
            const selected = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.96] ${
                  selected
                    ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),var(--md-shadow-line)]"
                    : "text-[var(--md-text)] hover:bg-[color-mix(in_srgb,var(--md-surface)_62%,transparent)] hover:text-[var(--md-ink)]"
                }`}
                onClick={() => onSelect(section.id)}
              >
                <Icon className="size-3.5" strokeWidth={selected ? 1.7 : 1.4} />
                {section.label}
              </button>
            )
          })}
        </div>
      </div>
      {showEndFade ? <span aria-hidden="true" className="md-email-marketing-tabs-fade" /> : null}
    </div>
  )
}

function EmailAreaChart({
  values,
  comparisonValues,
  comparisonTone = "neutral",
  label,
  large = false,
}: {
  values: number[]
  comparisonValues?: number[]
  comparisonTone?: EmailComparisonTone
  label: string
  large?: boolean
}) {
  const width = large ? 320 : 150
  const height = large ? 126 : 48
  const insetX = large ? 4 : 3
  const insetY = large ? 9 : 5
  const allValues = [...values, ...(comparisonValues ?? [])]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = Math.max(max - min, 0.01)

  function pointsFor(series: number[]) {
    return series.map((value, index) => {
      const x = insetX + (index / Math.max(series.length - 1, 1)) * (width - insetX * 2)
      const y = insetY + (height - insetY * 2) - ((value - min) / range) * (height - insetY * 2)
      return [x, y] as const
    })
  }

  function pathFor(points: readonly (readonly [number, number])[]) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  }

  const currentPoints = pointsFor(values)
  const currentPath = pathFor(currentPoints)
  const areaPath = `${currentPath} L ${width - insetX} ${height - insetY} L ${insetX} ${height - insetY} Z`
  const comparisonPath = comparisonValues ? pathFor(pointsFor(comparisonValues)) : null
  const lastPoint = currentPoints.at(-1)
  const comparisonStroke = emailComparisonColor(comparisonTone)

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={large ? "h-[126px] w-full" : "h-12 w-full"}
    >
      <path d={areaPath} fill="var(--md-accent-a10)" />
      {comparisonPath ? (
        <path
          d={comparisonPath}
          fill="none"
          stroke={comparisonStroke}
          strokeDasharray={large ? "6 5" : "4 4"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={large ? 2 : 1.5}
          opacity="0.72"
        />
      ) : null}
      <path
        d={currentPath}
        fill="none"
        stroke="var(--md-accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={large ? 2.6 : 2}
      />
      {lastPoint ? (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r={large ? 3.5 : 2.8}
          fill="var(--md-accent)"
          stroke="var(--md-surface)"
          strokeWidth="2"
        />
      ) : null}
    </svg>
  )
}

type EmailComparisonTone = "positive" | "negative" | "neutral"

type EmailComparisonDelta = {
  label: string
  tone: EmailComparisonTone
}

function emailComparisonDelta(current: number, comparison: number, lowerIsBetter = false): EmailComparisonDelta {
  const difference = current - comparison
  const percentage = comparison > 0 ? (difference / comparison) * 100 : current > 0 ? 100 : 0
  const tone: EmailComparisonTone = difference === 0
    ? "neutral"
    : (lowerIsBetter ? difference < 0 : difference > 0)
      ? "positive"
      : "negative"

  return {
    label: `${difference > 0 ? "+" : ""}${percentage.toFixed(1)}%`,
    tone,
  }
}

function emailComparisonColor(tone: EmailComparisonTone) {
  if (tone === "positive") return "var(--md-comparison-positive)"
  if (tone === "negative") return "var(--md-comparison-negative)"
  return "var(--md-subtle)"
}

function EmailDashboardDateControl({
  preset,
  currentRange,
  customRange,
  comparing,
  comparisonRange,
  currentHasData,
  comparisonHasData,
  onPresetChange,
  onCustomRangeChange,
  onComparingChange,
  onComparisonRangeChange,
}: {
  preset: EmailDashboardPreset
  currentRange: MultideckDateRange
  customRange: MultideckDateRange
  comparing: boolean
  comparisonRange: MultideckDateRange
  currentHasData: boolean
  comparisonHasData: boolean
  onPresetChange: (preset: EmailDashboardPreset) => void
  onCustomRangeChange: (range: MultideckDateRange) => void
  onComparingChange: (comparing: boolean) => void
  onComparisonRangeChange: (range: MultideckDateRange) => void
}) {
  const { t } = useLanguage()
  const comparisonOptions: MultideckDateComparisonOption[] = [
    { id: "last-seven", label: "Last 7 days", range: getEmailComparisonRange(currentRange, 7) },
    { id: "last-thirty", label: "Last 30 days", range: getEmailComparisonRange(currentRange, 30) },
    { id: "last-ninety", label: "Last 90 days", range: getEmailComparisonRange(currentRange, 90) },
    { id: "previous-period", label: "Previous period", range: getPreviousEmailPeriod(currentRange) },
    { id: "one-year", label: "One year", range: getEmailComparisonRange(currentRange, 365) },
    { id: "custom", label: "Custom", range: null },
  ]

  return (
    <div className="ms-auto min-w-0 shrink-0">
      <div className="max-w-full overflow-x-auto pb-1 md-scrollbar">
        <div className="flex min-w-max items-center justify-end gap-1.5">
          <div className="shrink-0">
            <SegmentedControl
              options={emailDashboardPresets}
              value={preset as (typeof emailDashboardPresets)[number]}
              onChange={onPresetChange}
              className="rounded-[var(--md-radius-lg)] p-0.5"
              ariaLabel={t("Dashboard date range")}
              renderOption={(value) => t({
                today: "Today",
                week: "7D",
                month: "30D",
                ninety: "90D",
              }[value])}
            />
          </div>
          <MultideckDateRangePicker
            value={customRange}
            onChange={(range) => {
              onPresetChange("custom")
              onCustomRangeChange(range)
            }}
            triggerLabel={preset === "custom" ? undefined : t("Custom")}
            placeholder="Custom"
            title="Custom range"
            description="Pick a start date, then an end date."
            startLabel="Start"
            endLabel="End"
            footerLabel="Selected custom range"
            active={preset === "custom"}
            align="end"
            triggerClassName="h-9 w-auto min-w-[82px] rounded-[var(--md-radius-md)] px-2.5 text-[12px]"
            comparison={{
              enabled: comparing,
              value: comparisonRange,
              onEnabledChange: onComparingChange,
              onChange: onComparisonRangeChange,
              options: comparisonOptions,
              missing: comparing && !comparisonHasData,
            }}
            onOpenChange={(open) => {
              if (open) onPresetChange("custom")
            }}
          />
        </div>
      </div>

      {!currentHasData ? (
        <p
          role="status"
          className="mt-1.5 text-end text-[11.5px] font-medium text-[var(--md-red)]"
        >
          {t("No data for the selected period.")}
        </p>
      ) : null}
    </div>
  )
}

function AudiencePulse({
  snapshot,
  comparisonSnapshot,
  comparing,
}: {
  snapshot: EmailDashboardSnapshot | null
  comparisonSnapshot: EmailDashboardSnapshot | null
  comparing: boolean
}) {
  const { t } = useLanguage()
  if (!snapshot) return null
  const comparisonAvailable = comparing && Boolean(comparisonSnapshot)
  const netSubscribers = snapshot.newSubscribers - snapshot.unsubscribed
  const audienceComparison = comparisonAvailable
    ? emailComparisonDelta(snapshot.subscribedContacts, comparisonSnapshot!.subscribedContacts)
    : null
  const subscriberComparison = audienceComparison
  const newSubscriberComparison = comparisonAvailable
    ? emailComparisonDelta(snapshot.newSubscribers, comparisonSnapshot!.newSubscribers)
    : null
  const unsubscribedComparison = comparisonAvailable
    ? emailComparisonDelta(snapshot.unsubscribed, comparisonSnapshot!.unsubscribed, true)
    : null
  const kpis = [
    {
      label: "Average CTR",
      value: `${snapshot.averageCtr.toFixed(1)}%`,
      current: snapshot.averageCtr,
      comparison: comparisonSnapshot?.averageCtr,
      series: snapshot.ctrSeries,
      comparisonSeries: comparisonSnapshot?.ctrSeries,
      Icon: MousePointerClick,
    },
    {
      label: "Average open rate",
      value: `${snapshot.averageOpenRate.toFixed(1)}%`,
      current: snapshot.averageOpenRate,
      comparison: comparisonSnapshot?.averageOpenRate,
      series: snapshot.openSeries,
      comparisonSeries: comparisonSnapshot?.openSeries,
      Icon: MailCheck,
    },
    {
      label: "Delivery rate",
      value: `${snapshot.deliveryRate.toFixed(1)}%`,
      current: snapshot.deliveryRate,
      comparison: comparisonSnapshot?.deliveryRate,
      series: snapshot.deliverySeries,
      comparisonSeries: comparisonSnapshot?.deliverySeries,
      Icon: Send,
    },
  ]

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="grid min-h-[352px] lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,0.68fr)]">
        <div className="flex flex-col justify-between bg-[var(--md-green-card)] p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusPill tone="teal">Audience pulse</StatusPill>
              <span
                className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums"
                style={{ color: audienceComparison ? emailComparisonColor(audienceComparison.tone) : "var(--md-text)" }}
              >
                {audienceComparison ? (
                  <>
                    {audienceComparison.tone !== "negative"
                      ? <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                      : <ArrowDownRight className="size-3.5" strokeWidth={1.5} />}
                    {audienceComparison.label} {t("vs comparison")}
                  </>
                ) : comparing ? t("No comparison data") : t("Selected period")}
              </span>
            </div>
            <p className="mt-7 text-[12px] font-medium text-[var(--md-text)]">Subscribed contacts</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <strong className="text-[42px] font-medium leading-none tracking-[-0.035em] text-[var(--md-ink)] tabular-nums">
                {snapshot.subscribedContacts.toLocaleString("en-GB")}
              </strong>
              <span className="pb-1 text-[13px] font-medium text-[var(--md-green)]">
                {netSubscribers >= 0 ? "+" : ""}{netSubscribers} {t("net in selected period")}
              </span>
            </div>
            <p className="mt-4 max-w-[56ch] text-[13px] leading-[1.55] text-[var(--md-text)]">
              Growth is steady and engagement remains strongest in service advisories and rate updates.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {kpis.map(({ label, value, current, comparison, series, comparisonSeries, Icon }) => {
              const delta = comparisonAvailable && comparison !== undefined
                ? emailComparisonDelta(current, comparison)
                : null

              return (
                <div key={label} className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_74%,transparent)] p-3.5 shadow-[var(--md-shadow-line)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
                    <Icon className="size-4 text-[var(--md-text)]" strokeWidth={1.4} />
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-[21px] font-medium leading-none text-[var(--md-ink)] tabular-nums">{value}</p>
                    <span
                      className="text-end text-[10.5px] font-medium tabular-nums"
                      style={{ color: delta ? emailComparisonColor(delta.tone) : "var(--md-text)" }}
                    >
                      {delta
                        ? `${delta.label} ${t("vs comparison")}`
                        : comparing
                          ? t("No comparison data")
                          : t("Selected period")}
                    </span>
                  </div>
                  <div className="mt-2">
                    <EmailAreaChart
                      values={series}
                      comparisonValues={comparisonAvailable ? comparisonSeries : undefined}
                      comparisonTone={delta?.tone}
                      label={t(label)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between bg-[var(--md-surface)] p-5 sm:p-6">
          <div>
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Subscriber momentum</p>
            <h3 className="mt-2 max-w-[18ch] text-balance text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--md-ink)]">
              More relevant contacts, fewer silent sends.
            </h3>
          </div>

          <div className="mt-7">
            <EmailAreaChart
              values={snapshot.subscriberSeries}
              comparisonValues={comparisonAvailable ? comparisonSnapshot?.subscriberSeries : undefined}
              comparisonTone={subscriberComparison?.tone}
              label={t("Subscriber momentum over time")}
              large
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-[var(--md-text)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-[var(--md-accent)]" />
                {t("Selected period")}
              </span>
              {comparisonAvailable ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-5 border-t border-dashed"
                    style={{ borderColor: emailComparisonColor(subscriberComparison?.tone ?? "neutral") }}
                  />
                  {t("Comparison period")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium text-[var(--md-subtle)]">New subscribers</p>
              <p className="mt-1 text-[18px] font-medium text-[var(--md-ink)] tabular-nums">+{snapshot.newSubscribers}</p>
              {newSubscriberComparison ? (
                <p
                  className="mt-1 text-[10.5px] font-medium tabular-nums"
                  style={{ color: emailComparisonColor(newSubscriberComparison.tone) }}
                >
                  {newSubscriberComparison.label} {t("vs comparison")}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--md-subtle)]">Unsubscribed</p>
              <p className="mt-1 text-[18px] font-medium text-[var(--md-ink)] tabular-nums">{snapshot.unsubscribed}</p>
              {unsubscribedComparison ? (
                <p
                  className="mt-1 text-[10.5px] font-medium tabular-nums"
                  style={{ color: emailComparisonColor(unsubscribedComparison.tone) }}
                >
                  {unsubscribedComparison.label} {t("vs comparison")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Surface>
  )
}

function SubscriberChangesPanel({
  snapshot,
  comparisonSnapshot,
  comparing,
  onOpenEmails,
}: {
  snapshot: EmailDashboardSnapshot
  comparisonSnapshot: EmailDashboardSnapshot | null
  comparing: boolean
  onOpenEmails: () => void
}) {
  const { t } = useLanguage()

  function changeMeta(value: number, comparisonValue?: number) {
    if (!comparing) return `${value} ${t("selected period")}`
    if (comparisonValue === undefined) return `${value} · ${t("No comparison data")}`
    const difference = value - comparisonValue
    return `${value} · ${difference >= 0 ? "+" : ""}${difference} ${t("vs comparison")}`
  }

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5">
        <SectionHeader title="Audience changes" meta="latest subscribes and unsubscribes" />
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:scale-[0.96]"
          onClick={onOpenEmails}
        >
          View all emails
          <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} />
        </Button>
      </div>

      <div className="grid gap-px bg-[var(--md-surface-tint)] md:grid-cols-2">
        {([
          ["Subscribed", changeMeta(snapshot.newSubscribers, comparisonSnapshot?.newSubscribers), recentSubscriberChanges.subscribed, ArrowUpRight, "green"],
          ["Unsubscribed", changeMeta(snapshot.unsubscribed, comparisonSnapshot?.unsubscribed), recentSubscriberChanges.unsubscribed, ArrowDownRight, "neutral"],
        ] as const).map(([title, meta, people, Icon, tone]) => (
          <section key={title} className="bg-[var(--md-surface)] p-5" aria-label={title}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`grid size-8 place-items-center rounded-[var(--md-radius-md)] ${
                  tone === "green" ? "bg-[var(--md-green-soft)] text-[var(--md-green)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"
                }`}>
                  <Icon className="size-4" strokeWidth={1.5} />
                </span>
                <h3 className="text-[14px] font-medium text-[var(--md-ink)]">{title}</h3>
              </div>
              <span className="text-[12px] font-medium text-[var(--md-subtle)] tabular-nums">{meta}</span>
            </div>
            <div className="mt-4 grid gap-1">
              {people.map(([name, company, detail]) => (
                <div key={`${title}-${name}`} className="grid gap-1 rounded-[var(--md-radius-lg)] px-3 py-2.5 hover:bg-[var(--md-surface-tint)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{name}</p>
                    <p className="truncate text-[12px] text-[var(--md-text)]">{company}</p>
                  </div>
                  <p className="text-[11px] text-[var(--md-subtle)] sm:text-end">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Surface>
  )
}

function RecentBroadcastsPanel({
  navigate,
  onOpenBroadcasts,
}: {
  navigate: (path: string) => void
  onOpenBroadcasts: () => void
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5">
        <SectionHeader title="Recent broadcasts" meta="performance and delivery state" />
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:scale-[0.96]"
          onClick={onOpenBroadcasts}
        >
          View broadcasts
          <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} />
        </Button>
      </div>
      <div className="grid gap-1 px-3 pb-3">
        {crmEmailCampaigns.map((broadcast) => (
          <button
            key={broadcast.id}
            type="button"
            className="grid gap-3 rounded-[var(--md-radius-lg)] p-3 text-start transition-[background,transform] duration-150 hover:bg-[var(--md-surface-tint)] active:scale-[0.99] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5"
            onClick={() => navigate(getCrmEmailCampaignPath(broadcast, "stats"))}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[13px] font-medium text-[var(--md-ink)]">{broadcast.name}</h3>
                <StatusPill tone={broadcast.tone}>{broadcast.status}</StatusPill>
              </div>
              <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{broadcast.audience}</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-medium text-[var(--md-subtle)]">Open</p>
                <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)] tabular-nums">{broadcast.open}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-[var(--md-subtle)]">CTR</p>
                <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)] tabular-nums">{broadcast.click}</p>
              </div>
            </div>
            <ArrowRight className="hidden size-4 text-[var(--md-subtle)] rtl:rotate-180 sm:block" strokeWidth={1.4} />
          </button>
        ))}
      </div>
    </Surface>
  )
}

function BroadcastsView({ navigate }: { navigate: (path: string) => void }) {
  const columns = useMemo<DataTableColumn<(typeof crmEmailCampaigns)[number]>[]>(() => [
    { id: "name", label: "Broadcast", width: 220, minWidth: 180, kind: "identity", sortValue: (broadcast) => broadcast.name, cell: (broadcast) => <span className="font-medium text-[var(--md-ink)]">{broadcast.name}</span> },
    { id: "type", label: "Type", width: 110, minWidth: 92, kind: "attribute", cell: (broadcast) => <StatusPill kind="attribute" tone="blue">{broadcast.type}</StatusPill> },
    { id: "audience", label: "List", width: 180, minWidth: 150, kind: "attribute", cell: (broadcast) => <span className="text-[var(--md-text)]">{broadcast.audience}</span> },
    { id: "status", label: "Status", width: 120, minWidth: 104, kind: "status", cell: (broadcast) => <StatusPill kind="status" tone={broadcast.tone}>{broadcast.status}</StatusPill> },
    { id: "when", label: "Send time", width: 160, minWidth: 132, kind: "date", cell: (broadcast) => <span className="text-[var(--md-text)]">{broadcast.when}</span> },
    { id: "open", label: "Open", width: 88, minWidth: 74, kind: "number", cell: (broadcast) => <span className="font-medium text-[var(--md-ink)]">{broadcast.open}</span> },
    { id: "click", label: "CTR", width: 88, minWidth: 74, kind: "number", cell: (broadcast) => <span className="font-medium text-[var(--md-ink)]">{broadcast.click}</span> },
    { id: "actions", label: "Actions", width: 92, minWidth: 92, kind: "actions", canHide: false, canPin: false, cell: (broadcast) => <div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); navigate(getCrmEmailCampaignPath(broadcast, "stats")) }}><ChartNoAxesCombined className="size-3.5" strokeWidth={1.4} />Stats</Button><Button type="button" variant="ghost" size="icon" aria-label={`Edit ${broadcast.name}`} className="size-8 rounded-[var(--md-radius-sm)] opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); navigate(getCrmEmailCampaignPath(broadcast, "edit")) }}><PenLine strokeWidth={1.4} /></Button></div> },
  ], [navigate])
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5">
        <SectionHeader title="Broadcasts" meta="scheduled, sent, and draft email sends" metaPlacement="responsive-inline" className="min-w-0 flex-1" />
        <p className="text-[12px] font-medium text-[var(--md-text)]">Average CTR 16.4% · open rate 50.6%</p>
      </div>
      <div className="px-5 pb-5"><DataTable clientPagination ariaLabel="Broadcasts" columnsButtonLabel="Manage broadcast columns" columns={columns} rows={crmEmailCampaigns} getRowKey={(broadcast) => broadcast.id} storageKey="crm-email-broadcasts" minimumWidth={1080} rowClassName="group h-[68px]" onRowClick={(broadcast) => navigate(getCrmEmailCampaignPath(broadcast, "stats"))} /></div>
    </Surface>
  )
}

function ListsView({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 xl:grid-cols-3">
      {crmEmailLists.map((list) => (
        <button
          key={list.id}
          type="button"
          className="group flex min-h-[240px] flex-col rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 text-start shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--md-surface)_88%,var(--md-accent)_12%)] hover:shadow-[var(--md-shadow-lift)] active:scale-[0.98]"
          onClick={() => navigate(getCrmListPath(list))}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-text)]">
              <Users className="size-5" strokeWidth={1.4} />
            </span>
            <StatusPill tone={list.statusTone}>{list.type}</StatusPill>
          </div>
          <h3 className="mt-5 text-balance text-[16px] font-medium leading-[1.25] text-[var(--md-ink)]">{list.name}</h3>
          <p className="mt-2 line-clamp-2 text-pretty text-[13px] leading-[1.55] text-[var(--md-text)]">{list.description}</p>
          <div className="mt-auto flex items-end justify-between gap-4 pt-6">
            <div>
              <p className="text-[24px] font-medium leading-none text-[var(--md-ink)] tabular-nums">{list.count}</p>
              <p className="mt-1 text-[11px] text-[var(--md-subtle)]">contacts · {list.delta}</p>
            </div>
            <ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={1.4} />
          </div>
        </button>
      ))}
    </div>
  )
}

function TemplatesView() {
  return (
    <section className="grid gap-[var(--md-gap-md)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium tracking-[-0.015em] text-[var(--md-ink)]">Email templates</h2>
          <p className="mt-1 max-w-[65ch] text-pretty text-[13px] leading-[1.55] text-[var(--md-text)]">
            Reusable layouts already connected to your logo, colours, and compliance footer.
          </p>
        </div>
        <Button
          variant="ghost"
          className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:scale-[0.96]"
          onClick={() => toast.success("HTML upload opened")}
        >
          <Upload className="size-4" strokeWidth={1.4} />
          Upload template
        </Button>
      </div>
      <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 2xl:grid-cols-4">
        {crmEmailTemplates.map((template) => (
          <button
            key={template.name}
            type="button"
            className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 text-start shadow-[var(--md-shadow-line)] transition-[background,transform,box-shadow] duration-150 hover:bg-[color-mix(in_srgb,var(--md-surface)_90%,var(--md-accent)_10%)] hover:shadow-[var(--md-shadow-lift)] active:scale-[0.98]"
            onClick={() => toast.success(`${template.name} selected`)}
          >
            <EmailTemplatePreview variant={template.accent} />
            <h3 className="mt-4 text-[15px] font-medium text-[var(--md-ink)]">{template.name}</h3>
            <p className="mt-1 text-[13px] leading-[1.5] text-[var(--md-text)]">{template.detail}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

function AutomationsView() {
  return (
    <div className="grid gap-[var(--md-gap-md)] xl:grid-cols-2">
      {emailMarketingAutomations.map((automation) => (
        <Surface key={automation.name} padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex items-start gap-4 p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-ink)]">
              {automation.status === "Paused" ? <CirclePause className="size-5" strokeWidth={1.4} /> : <Workflow className="size-5" strokeWidth={1.4} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-medium text-[var(--md-ink)]">{automation.name}</h3>
                <StatusPill tone={automation.tone}>{automation.status}</StatusPill>
              </div>
              <p className="mt-2 text-[13px] leading-[1.5] text-[var(--md-text)]">{automation.trigger}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit ${automation.name}`}
              className="size-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] active:scale-[0.96]"
              onClick={() => toast.success(`${automation.name} opened`)}
            >
              <PenLine strokeWidth={1.4} />
            </Button>
          </div>
          <div className="grid gap-px bg-[var(--md-surface-tint)] sm:grid-cols-4">
            {[
              ["Audience", automation.audience],
              ["Entered", automation.entered],
              ["Result", automation.performance],
              ["Last run", automation.lastRun],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--md-surface)] px-4 py-3">
                <p className="text-[10px] font-medium text-[var(--md-subtle)]">{label}</p>
                <p className="mt-1 text-[12px] font-medium leading-[1.4] text-[var(--md-ink)]">{value}</p>
              </div>
            ))}
          </div>
        </Surface>
      ))}
    </div>
  )
}

function EmailsView() {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | EmailMarketingContactStatus>("all")
  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return emailMarketingContacts.filter((contact) => {
      const matchesQuery = !normalized
        || `${contact.email} ${contact.name} ${contact.company} ${contact.lists}`.toLowerCase().includes(normalized)
      const matchesStatus = status === "all" || contact.status === status
      return matchesQuery && matchesStatus
    })
  }, [query, status])
  const columns = useMemo<DataTableColumn<(typeof emailMarketingContacts)[number]>[]>(() => [
    { id: "email", label: "Email", width: 240, minWidth: 190, kind: "identity", sortValue: (contact) => contact.email, cellTitle: (contact) => contact.email, cell: (contact) => <span className="block truncate font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr"><bdi>{contact.email}</bdi></span> },
    { id: "name", label: "Contact", width: 160, minWidth: 128, kind: "identity", cell: (contact) => <span className="text-[var(--md-text)]">{contact.name}</span> },
    { id: "company", label: "Company", width: 180, minWidth: 140, kind: "identity", cell: (contact) => <span className="text-[var(--md-text)]">{contact.company}</span> },
    { id: "status", label: "Status", width: 128, minWidth: 112, kind: "status", cell: (contact) => <StatusPill kind="status" tone={contactStatusTone(contact.status)} className={`md-email-status-pill md-email-status-pill--${contact.status.toLowerCase()} !h-[26px] !w-[104px] !justify-center !rounded-[var(--md-radius-lg)] !px-2.5 !text-center !text-[12.5px] !font-medium !leading-none`}>{t(contact.status)}</StatusPill> },
    { id: "source", label: "Source", width: 130, minWidth: 104, kind: "attribute", cell: (contact) => <StatusPill kind="attribute" tone="teal">{contact.source}</StatusPill> },
    { id: "lists", label: "Lists", width: 180, minWidth: 140, kind: "attribute", cellTitle: (contact) => contact.lists, cell: (contact) => <span className="block truncate text-[var(--md-text)]">{contact.lists}</span> },
    { id: "lastActivity", label: "Last activity", width: 160, minWidth: 132, kind: "date", cell: (contact) => <span className="text-[var(--md-text)]">{contact.lastActivity}</span> },
  ], [t])

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-5">
        <SectionHeader title="Emails" meta={`${emailMarketingContacts.length} contact records with consent and delivery status`} metaPlacement="responsive-inline" />
      </div>
      <div className="px-5 pb-5"><DataTable clientPagination ariaLabel="Marketing emails" columnsButtonLabel="Manage email columns" columns={columns} rows={filteredContacts} getRowKey={(contact) => contact.email} storageKey="crm-marketing-emails" minimumWidth={1120} toolbarSearch={<label className="relative min-w-0 sm:w-[280px]"><span className="sr-only">Search emails</span><Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 bg-[var(--md-field-bg)] ps-9 text-base sm:text-[12px]" placeholder="Search email, contact, company, or list…" /></label>} toolbarFilters={<Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="h-8 min-w-[156px] bg-[var(--md-field-bg)] text-base sm:text-[12px]"><ListFilter className="size-3.5" strokeWidth={1.4} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All statuses")}</SelectItem><SelectItem value="Subscribed">{t("Subscribed")}</SelectItem><SelectItem value="Unsubscribed">{t("Unsubscribed")}</SelectItem><SelectItem value="Bounced">{t("Bounced")}</SelectItem><SelectItem value="Pending">{t("Pending")}</SelectItem><SelectItem value="Replied">{t("Replied")}</SelectItem></SelectContent></Select>} emptyState={<div className="grid min-h-[180px] place-items-center p-6 text-center">
          <div>
            <Search className="mx-auto size-5 text-[var(--md-subtle)]" strokeWidth={1.4} />
            <h3 className="mt-3 text-[14px] font-medium text-[var(--md-ink)]">No matching emails</h3>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">Clear the search or choose another status.</p>
            <Button
              type="button"
              variant="ghost"
              className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]"
              onClick={() => {
                setQuery("")
                setStatus("all")
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>} /></div>
    </Surface>
  )
}

export function CrmEmailsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [activeSection, setActiveSection] = useState<EmailMarketingSection>(readEmailMarketingSection)
  const [dashboardPreset, setDashboardPreset] = useState<EmailDashboardPreset>("month")
  const [customRange, setCustomRange] = useState<MultideckDateRange>(() => getEmailPresetRange("month"))
  const [comparing, setComparing] = useState(false)
  const [comparisonRange, setComparisonRange] = useState<MultideckDateRange>(() => (
    getPreviousEmailPeriod(getEmailPresetRange("month"))
  ))
  const selectedRange = dashboardPreset === "custom" ? customRange : getEmailPresetRange(dashboardPreset)
  const dashboardSnapshot = useMemo(() => getEmailDashboardSnapshot(selectedRange), [selectedRange.start, selectedRange.end])
  const comparisonSnapshot = useMemo(
    () => comparing ? getEmailDashboardSnapshot(comparisonRange) : null,
    [comparing, comparisonRange.start, comparisonRange.end],
  )

  useEffect(() => {
    const onPopState = () => setActiveSection(readEmailMarketingSection())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function selectSection(section: EmailMarketingSection) {
    setActiveSection(section)
    const url = new URL(window.location.href)
    if (section === "dashboard") url.searchParams.delete("tab")
    else url.searchParams.set("tab", section)
    window.history.replaceState(null, "", `${url.pathname}${url.search}`)
  }

  function selectDashboardPreset(preset: EmailDashboardPreset) {
    setDashboardPreset(preset)
    const nextRange = preset === "custom" ? customRange : getEmailPresetRange(preset)
    setComparisonRange(getPreviousEmailPeriod(nextRange))
  }

  function updateCustomRange(range: MultideckDateRange) {
    setCustomRange(range)
    setDashboardPreset("custom")
    setComparisonRange(getPreviousEmailPeriod(range))
  }

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Email marketing"
        title="Email marketing"
        summary="Build audiences, send broadcasts, and turn engagement into the next useful customer conversation."
        meta={dashboardSnapshot
          ? `${dashboardSnapshot.subscribedContacts.toLocaleString("en-GB")} ${t("subscribed")} · ${dashboardSnapshot.averageCtr.toFixed(1)}% ${t("average CTR")} · ${dashboardSnapshot.deliveryRate.toFixed(1)}% ${t("delivered")}`
          : t("No data for the selected period.")}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] active:scale-[0.96]"
              onClick={() => selectSection("templates")}
            >
              <LayoutTemplate className="size-4" strokeWidth={1.4} />
              Templates
            </Button>
            <PrimaryActionButton onClick={() => toast.success(t("Broadcast draft created"))}>
              New broadcast
            </PrimaryActionButton>
          </>
        }
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <EmailMarketingTabs activeSection={activeSection} onSelect={selectSection} />
        {activeSection === "dashboard" ? (
          <EmailDashboardDateControl
            preset={dashboardPreset}
            currentRange={selectedRange}
            customRange={customRange}
            comparing={comparing}
            comparisonRange={comparisonRange}
            currentHasData={Boolean(dashboardSnapshot)}
            comparisonHasData={Boolean(comparisonSnapshot)}
            onPresetChange={selectDashboardPreset}
            onCustomRangeChange={updateCustomRange}
            onComparingChange={setComparing}
            onComparisonRangeChange={setComparisonRange}
          />
        ) : null}
      </div>

      <div role="tabpanel" aria-label={emailMarketingSections.find((section) => section.id === activeSection)?.label}>
        {activeSection === "dashboard" ? (
          <div className="grid gap-[var(--md-page-stack-gap)]">
            {dashboardSnapshot ? (
              <>
                <AudiencePulse
                  snapshot={dashboardSnapshot}
                  comparisonSnapshot={comparisonSnapshot}
                  comparing={comparing}
                />
                <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
                  <SubscriberChangesPanel
                    snapshot={dashboardSnapshot}
                    comparisonSnapshot={comparisonSnapshot}
                    comparing={comparing}
                    onOpenEmails={() => selectSection("emails")}
                  />
                  <RecentBroadcastsPanel navigate={navigate} onOpenBroadcasts={() => selectSection("broadcasts")} />
                </div>
              </>
            ) : (
              <Surface padding="lg" className="grid min-h-[280px] place-items-center rounded-[var(--md-radius-xl)] text-center">
                <div className="max-w-[420px]">
                  <ChartNoAxesCombined className="mx-auto size-6 text-[var(--md-subtle)]" strokeWidth={1.4} />
                  <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">{t("No email marketing data for these dates")}</h2>
                  <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
                    {t("Choose a period between 1 January and 30 July 2026 to see the dashboard.")}
                  </p>
                </div>
              </Surface>
            )}
          </div>
        ) : null}
        {activeSection === "broadcasts" ? <BroadcastsView navigate={navigate} /> : null}
        {activeSection === "lists" ? <ListsView navigate={navigate} /> : null}
        {activeSection === "templates" ? <TemplatesView /> : null}
        {activeSection === "automations" ? <AutomationsView /> : null}
        {activeSection === "emails" ? <EmailsView /> : null}
      </div>
    </div>
  )
}

export function CrmEmailStatsPage({ navigate, campaignId }: { navigate: (path: string) => void; campaignId: string }) {
  const campaign = crmEmailCampaigns.find((item) => item.id === campaignId) ?? crmEmailCampaigns[0]
  type SignalRow = (typeof campaign.engaged)[number]
  const engagedColumns = useMemo<DataTableColumn<SignalRow>[]>(() => [
    { id: "contact", label: "Contact", width: 190, minWidth: 150, kind: "identity", cell: (row) => <span className="font-medium text-[var(--md-ink)]">{row[0]}</span> },
    { id: "company", label: "Company", width: 180, minWidth: 140, kind: "identity", cell: (row) => <span className="text-[var(--md-text)]">{row[1]}</span> },
    { id: "signal", label: "Signal", width: 250, minWidth: 190, kind: "attribute", cell: (row) => <StatusPill kind="attribute" tone="green">{row[2]}</StatusPill> },
  ], [])
  const unsubscribedColumns = useMemo<DataTableColumn<(typeof campaign.unsubscribed)[number]>[]>(() => [
    { id: "contact", label: "Contact", width: 190, minWidth: 150, kind: "identity", cell: (row) => <span className="font-medium text-[var(--md-ink)]">{row[0]}</span> },
    { id: "company", label: "Company", width: 180, minWidth: 140, kind: "identity", cell: (row) => <span className="text-[var(--md-text)]">{row[1]}</span> },
    { id: "reason", label: "Reason", width: 250, minWidth: 190, kind: "long-text", cellTitle: (row) => row[2], cell: (row) => <span className="block truncate text-[var(--md-text)]">{row[2]}</span> },
  ], [])

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Broadcasts"
        title={`${campaign.name} statistics`}
        summary="Broadcast performance, engaged contacts, and unsubscribes in one focused workspace."
        meta={`${campaign.audience} · ${campaign.when}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/emails")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to broadcasts
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate(getCrmEmailCampaignPath(campaign, "edit"))}
            >
              <PenLine data-icon="inline-start" strokeWidth={1.2} />
              Edit broadcast
            </Button>
          </>
        }
      />

      <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Delivered", campaign.stats.delivered],
          ["Open", campaign.stats.openRate],
          ["Click-through", campaign.stats.clickRate],
          ["Unsubscribed", campaign.stats.unsubscribed],
        ].map(([label, value]) => (
          <Surface key={label} padding="lg" className="rounded-[var(--md-radius-xl)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="mt-3 text-[30px] font-medium leading-none text-[var(--md-ink)]">{value}</p>
          </Surface>
        ))}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Who's up" meta="contacts showing buying or engagement signals" metaPlacement="responsive-inline" />
          </div>
          <div className="px-5 pb-5"><DataTable ariaLabel="Engaged contacts" columnsButtonLabel="Manage engagement columns" columns={engagedColumns} rows={campaign.engaged} getRowKey={(row) => `${row[0]}-${row[2]}`} minimumWidth={620} showToolbar={false} showColumnManager={false} className="rounded-[var(--md-radius-lg)]" /></div>
        </Surface>

        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Unsubscribed" meta="contacts removed from future marketing sends" metaPlacement="responsive-inline" />
          </div>
          <div className="px-5 pb-5"><DataTable ariaLabel="Unsubscribed contacts" columnsButtonLabel="Manage unsubscribe columns" columns={unsubscribedColumns} rows={campaign.unsubscribed} getRowKey={(row) => `${row[0]}-${row[2]}`} minimumWidth={620} showToolbar={false} showColumnManager={false} className="rounded-[var(--md-radius-lg)]" emptyState={<p className="text-[13px] text-[var(--md-text)]">No unsubscribes recorded yet.</p>} /></div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmEmailEditPage({ navigate, campaignId }: { navigate: (path: string) => void; campaignId: string }) {
  const campaign = crmEmailCampaigns.find((item) => item.id === campaignId) ?? crmEmailCampaigns[0]

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Broadcasts"
        title={`Edit ${campaign.name}`}
        summary="Update the subject, audience, uploaded assets, and send settings before the next review."
        meta={`${campaign.status} · ${campaign.edited}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/emails")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to broadcasts
            </Button>
            <Button
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              onClick={() => toast.success("Email changes saved")}
            >
              Save changes
            </Button>
          </>
        }
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title="Email setup" meta="content and delivery" />
          <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
            {[
              ["Subject line", campaign.subject],
              ["Preview text", campaign.preheader],
              ["Audience list", campaign.audience],
              ["Send time", campaign.when],
              ["Uploaded asset", campaign.uploads],
            ].map(([label, value]) => (
              <label key={label} className="grid gap-2">
                <span className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</span>
                <input
                  className="h-11 rounded-[var(--md-radius-lg)] bg-white/55 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--md-accent)]"
                  defaultValue={value}
                  data-i18n-skip={label.includes("Subject") || label.includes("Preview") ? undefined : true}
                  dir={label.includes("Subject") || label.includes("Preview") ? undefined : "ltr"}
                />
              </label>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
                onClick={() => toast.success("Replacement upload opened")}
              >
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Upload assets
              </Button>
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
                onClick={() => navigate(getCrmEmailCampaignPath(campaign, "stats"))}
              >
                <ChartNoAxesCombined data-icon="inline-start" strokeWidth={1.2} />
                See statistics
              </Button>
            </div>
          </div>
        </Surface>

        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title="Review" meta="current broadcast state" />
          <div className="mt-[var(--md-page-stack-gap)] grid gap-3">
            {[
              ["Type", campaign.type],
              ["Status", campaign.status],
              ["Open", campaign.open],
              ["Click", campaign.click],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                <span className="text-[13px] font-medium text-[var(--md-text)]">{label}</span>
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{value}</span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmDealsPage({ currentUser, navigate }: { currentUser?: AuthUserSummary | null; navigate?: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [dealLeadSearch, setDealLeadSearch] = useState("")
  const [dealLeadOptions, setDealLeadOptions] = useState<ApiLead[]>([])
  const [dealLeadState, setDealLeadState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [dealLeadError, setDealLeadError] = useState<string | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [liveDeals, setLiveDeals] = useState<ApiDeal[]>([])
  const [livePipelines, setLivePipelines] = useState<ApiPipeline[]>([])
  const [stagePages, setStagePages] = useState<Record<string, { total: number; loading: boolean }>>({})
  const [viewMode, setViewMode] = useState<DealViewMode>("Board")
  const [dealQuery, setDealQuery] = useState("")
  const [debouncedDealQuery, setDebouncedDealQuery] = useState("")
  const [dealListRows, setDealListRows] = useState<ApiDeal[]>([])
  const [dealListTotal, setDealListTotal] = useState(0)
  const [dealListFacets, setDealListFacets] = useState<DealRegisterPage["facets"]>(emptyDealFacets)
  const [dealListOffset, setDealListOffset] = useState(0)
  const [dealListPageSize, setDealListPageSize] = useState(defaultPaginationPageSize)
  const [dealListSort, setDealListSort] = useState<DealRegisterSort | null>({ id: "created", direction: "desc" })
  const [dealPipelineFilter, setDealPipelineFilter] = useState("")
  const [dealStatusFilter, setDealStatusFilter] = useState("")
  const [dealOwnerFilter, setDealOwnerFilter] = useState("")
  const [dealListState, setDealListState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [dealListError, setDealListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const lastConsumedReloadKey = useRef(0)
  const lastConsumedListReloadKey = useRef(0)
  const [pendingWin, setPendingWin] = useState<{ deal: ApiDeal; stage: ApiPipeline["stages"][number] } | null>(null)
  const [winning, setWinning] = useState(false)
  const restoreNewDealFocus = useDialogReturnFocus(newDealOpen)
  const requestedDealIdRef = useRef(new URLSearchParams(window.location.search).get("record"))
  const canManagePipelines = hasPermission(currentUser, "Settings.Manage")

  useEffect(() => subscribeTopBarAction(topBarActionEvents.createCrmDeal, () => setNewDealOpen(true)), [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDealQuery(dealQuery.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [dealQuery])

  useEffect(() => {
    setDealListOffset(0)
  }, [debouncedDealQuery, dealOwnerFilter, dealPipelineFilter, dealStatusFilter])

  useEffect(() => {
    if (!newDealOpen) return undefined
    let active = true
    const timer = window.setTimeout(() => {
    setDealLeadState("loading")
    setDealLeadError(null)
    listLeadsPage({ search: dealLeadSearch, openOnly: true, sort: { id: "lead", direction: "asc" }, limit: 25, offset: 0 })
      .then((page) => {
        if (!active) return
        setDealLeadOptions(page.rows)
        setDealLeadState("ready")
      })
      .catch((error: unknown) => {
        if (!active) return
        setDealLeadError(error instanceof Error ? error.message : t("Open leads could not be loaded."))
        setDealLeadState("error")
      })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [dealLeadSearch, newDealOpen, t])

  function startDealFromLead(leadId: string) {
    setNewDealOpen(false)
    setDealLeadSearch("")
    const path = `/crm/leads/${encodeURIComponent(leadId)}/convert`
    if (navigate) navigate(path)
    else window.location.href = path
  }

  useEffect(() => {
    let active = true
    const forceRefresh = reloadKey !== lastConsumedReloadKey.current
    lastConsumedReloadKey.current = reloadKey
    setLoading(true)
    setLoadError(null)
    getPipelineSettings({ forceRefresh })
      .then(async (settings) => {
        const stages = settings.pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => ({ pipelineId: pipeline.id, stageId: stage.id })))
        const pages = await Promise.all(stages.map(({ pipelineId, stageId }) => listDealsPage({
          pipelineId,
          pipelineStageId: stageId,
          sort: { id: "created", direction: "desc" },
          limit: 40,
          offset: 0,
        }, { forceRefresh })))
        if (!active) return
        setLivePipelines(settings.pipelines)
        setLiveDeals(Array.from(new Map(pages.flatMap((page) => page.rows).map((deal) => [deal.id, deal])).values()))
        setStagePages(Object.fromEntries(stages.map((stage, index) => [stage.stageId, { total: pages[index]?.total ?? 0, loading: false }])))
      })
      .catch((error) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : t("The CRM service could not be reached."))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey, t])

  useEffect(() => {
    if (viewMode !== "List") return undefined
    let active = true
    const forceRefresh = reloadKey !== lastConsumedListReloadKey.current
    lastConsumedListReloadKey.current = reloadKey
    setDealListState("loading")
    setDealListError(null)
    listDealsPage({
      search: debouncedDealQuery,
      pipelineId: dealPipelineFilter || undefined,
      statusCode: dealStatusFilter || undefined,
      ownerId: dealOwnerFilter && dealOwnerFilter !== "__unassigned__" ? dealOwnerFilter : undefined,
      unassigned: dealOwnerFilter === "__unassigned__",
      sort: dealListSort ?? { id: "created", direction: "desc" },
      limit: dealListPageSize,
      offset: dealListOffset,
    }, { forceRefresh })
      .then((page) => {
        if (!active) return
        setDealListRows(page.rows)
        setDealListTotal(page.total)
        setDealListFacets(page.facets)
        setDealListState("ready")
      })
      .catch((error: unknown) => {
        if (!active) return
        setDealListError(error instanceof Error ? error.message : t("Deals could not be loaded."))
        setDealListState("error")
      })
    return () => { active = false }
  }, [dealListOffset, dealListPageSize, dealListSort, dealOwnerFilter, dealPipelineFilter, dealStatusFilter, debouncedDealQuery, reloadKey, t, viewMode])

  async function loadMoreDealsForStage(pipelineId: string, stageId: string) {
    const current = stagePages[stageId]
    if (!current || current.loading) return
    const loaded = liveDeals.filter((deal) => deal.pipelineStageId === stageId).length
    if (loaded >= current.total) return
    setStagePages((pages) => ({ ...pages, [stageId]: { ...current, loading: true } }))
    try {
      const page = await listDealsPage({
        pipelineId,
        pipelineStageId: stageId,
        sort: { id: "created", direction: "desc" },
        limit: 40,
        offset: loaded,
      })
      setLiveDeals((deals) => Array.from(new Map([...deals, ...page.rows].map((deal) => [deal.id, deal])).values()))
      setStagePages((pages) => ({ ...pages, [stageId]: { total: page.total, loading: false } }))
    } catch (error) {
      setStagePages((pages) => ({ ...pages, [stageId]: { ...current, loading: false } }))
      toast.error(error instanceof Error ? error.message : t("More deals could not be loaded."))
    }
  }

  const dealPipelines = useMemo(
    () => buildDealPipelines(livePipelines, liveDeals, language, t),
    [language, liveDeals, livePipelines, t],
  )

  const dealListColumns = useMemo<DataTableColumn<ApiDeal>[]>(() => [
    {
      id: "deal",
      label: "Deal",
      kind: "identity",
      width: 260,
      minWidth: 210,
      resizable: true,
      sortValue: (deal) => deal.name,
      cellTitle: (deal) => `${deal.name} · ${deal.companyName}`,
      cell: (deal) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{deal.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--md-text)]" data-i18n-skip dir="auto">{deal.companyName}</p>
        </div>
      ),
    },
    {
      id: "pipeline",
      label: "Pipeline",
      kind: "attribute",
      width: 180,
      resizable: true,
      sortValue: (deal) => deal.pipelineName,
      cellTitle: (deal) => `${deal.pipelineName} · ${deal.pipelineStageName}`,
      cell: (deal) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{deal.pipelineStageName}</p>
          <p className="mt-0.5 truncate text-[10.5px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{deal.pipelineName}</p>
        </div>
      ),
    },
    {
      id: "status",
      label: "Status",
      kind: "status",
      width: 130,
      sortValue: (deal) => deal.statusName,
      cell: (deal) => <StatusPill tone={apiDealTone(deal)}>{deal.statusName}</StatusPill>,
    },
    {
      id: "owner",
      label: "Owner",
      kind: "text",
      width: 160,
      resizable: true,
      sortValue: (deal) => deal.ownerName ?? "",
      cell: (deal) => <span className={deal.ownerName ? "block truncate text-[12px] text-[var(--md-ink)]" : "block truncate text-[12px] text-[var(--md-subtle)]"} data-i18n-skip={Boolean(deal.ownerName) || undefined} dir="auto">{deal.ownerName || t("Unassigned")}</span>,
    },
    {
      id: "value",
      label: "Expected value",
      kind: "number",
      width: 145,
      sortValue: (deal) => deal.expectedValueAmount,
      cell: (deal) => deal.expectedValueAmount === null
        ? <span className="text-[12px] text-[var(--md-subtle)]">{t("Not recorded")}</span>
        : <span className="text-[12px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">{getDealValueFormatter(deal.currencyCode || "GBP", false, language).format(deal.expectedValueAmount)}</span>,
    },
    {
      id: "close-date",
      label: "Expected close",
      kind: "date",
      width: 160,
      sortValue: (deal) => deal.expectedCloseDate ?? "",
      cell: (deal) => (
        <span className={isDealCloseOverdue(deal) ? "text-[12px] font-medium text-[var(--md-danger)]" : "text-[12px] text-[var(--md-text)]"} data-i18n-skip dir="auto">
          {formatDealClose(deal, language, t, true)}
        </span>
      ),
    },
    {
      id: "next-action",
      label: "Next action",
      kind: "date",
      width: 190,
      resizable: true,
      defaultHidden: true,
      cell: (deal) => <span className={deal.nextActionDueAt ? "block truncate text-[12px] text-[var(--md-text)]" : "block truncate text-[12px] text-[var(--md-subtle)]"} data-i18n-skip={Boolean(deal.nextActionDueAt) || undefined} dir="auto">{formatDealNextAction(deal.nextActionDueAt, language, t)}</span>,
    },
    {
      id: "created",
      label: "Created",
      kind: "date",
      width: 140,
      defaultHidden: true,
      sortValue: (deal) => deal.createdAt,
      cell: (deal) => <span className="text-[12px] text-[var(--md-text)]" data-i18n-skip dir="auto">{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(deal.createdAt))}</span>,
    },
  ], [language, t])

  const listPipelineOptions = dealListFacets.pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))
  const listStatusOptions = dealListFacets.statuses.map((status) => ({ value: status.code, label: status.name }))
  const listOwnerOptions = [
    ...dealListFacets.owners.map((owner) => ({ value: owner.id, label: owner.name })),
    ...(dealListFacets.hasUnassigned ? [{ value: "__unassigned__", label: t("Unassigned") }] : []),
  ]
  const boardDealTotal = Object.values(stagePages).reduce((sum, stage) => sum + stage.total, 0)
  const dealFiltersActive = Boolean(dealQuery || dealPipelineFilter || dealStatusFilter || dealOwnerFilter)

  function clearDealListFilters() {
    setDealQuery("")
    setDealPipelineFilter("")
    setDealStatusFilter("")
    setDealOwnerFilter("")
    setDealListOffset(0)
  }

  useEffect(() => {
    const requestedDealId = requestedDealIdRef.current
    if (loading || !requestedDealId) return
    requestedDealIdRef.current = null
    if (navigate) {
      navigate(`/crm/deals/${encodeURIComponent(requestedDealId)}`)
      return
    }
    const requestedDeal = dealPipelines
      .flatMap((pipeline) => pipeline.stages)
      .flatMap((stage) => stage.deals)
      .find((deal) => deal.id === requestedDealId)
    if (requestedDeal) {
      setSelectedDeal(requestedDeal)
      setDetailOpen(true)
      return
    }
    void getDeal(requestedDealId).then((deal) => {
      const stage = livePipelines.flatMap((pipeline) => pipeline.stages).find((candidate) => candidate.id === deal.pipelineStageId)
      setSelectedDeal(apiDealToBoardDeal(deal, stage?.tone ?? "neutral", language, t))
      setDetailOpen(true)
    }).catch((error) => toast.error(error instanceof Error ? error.message : t("This deal could not be opened.")))
  }, [dealPipelines, language, livePipelines, loading, navigate, t])

  function openDealDetail(deal: CrmDeal) {
    if (navigate) { navigate(`/crm/deals/${encodeURIComponent(deal.id)}`); return }
    setSelectedDeal(deal)
    setDetailOpen(true)
  }

  function openApiDealDetail(deal: ApiDeal) {
    const stage = livePipelines.flatMap((pipeline) => pipeline.stages).find((candidate) => candidate.id === deal.pipelineStageId)
    openDealDetail(apiDealToBoardDeal(deal, stage?.tone ?? "neutral", language, t))
  }

  function switchPipeline(pipeline: CrmPipeline) {
    setSelectedDeal(pipeline.stages.flatMap((stage) => stage.deals)[0] ?? null)
    setDetailOpen(false)
  }

  function reconcileStageTotals(previous: ApiDeal, next: ApiDeal) {
    if (previous.pipelineStageId === next.pipelineStageId) return
    setStagePages((pages) => ({
      ...pages,
      [previous.pipelineStageId]: { total: Math.max(0, (pages[previous.pipelineStageId]?.total ?? 1) - 1), loading: false },
      [next.pipelineStageId]: { total: (pages[next.pipelineStageId]?.total ?? 0) + 1, loading: false },
    }))
  }

  async function persistDealMove(dealId: string, pipelineId: string, stageId: string) {
    const destinationStage = livePipelines.find((pipeline) => pipeline.id === pipelineId)?.stages.find((stage) => stage.id === stageId)
    const sourceDeal = liveDeals.find((deal) => deal.id === dealId)
    if (destinationStage?.isConversion && sourceDeal) {
      setPendingWin({ deal: sourceDeal, stage: destinationStage })
      return
    }
    try {
      const updated = await moveDealStage(dealId, pipelineId, stageId)
      if (sourceDeal) reconcileStageTotals(sourceDeal, updated)
      setLiveDeals((deals) => deals.map((deal) => deal.id === updated.id ? updated : deal))
      setDealListRows((deals) => deals.map((deal) => deal.id === updated.id ? updated : deal))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("This deal could not be moved."))
      setReloadKey((key) => key + 1)
    }
  }

  async function confirmDealWon() {
    if (!pendingWin || winning) return
    setWinning(true)
    try {
      const updated = await markDealWon(pendingWin.deal.id, pendingWin.stage.id)
      reconcileStageTotals(pendingWin.deal, updated)
      setLiveDeals((deals) => deals.map((deal) => deal.id === updated.id ? updated : deal))
      setDealListRows((deals) => deals.map((deal) => deal.id === updated.id ? updated : deal))
      setPendingWin(null)
      toast.success(t("Deal marked won and customer activated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("This deal could not be converted into a customer."))
      setReloadKey((key) => key + 1)
    } finally {
      setWinning(false)
    }
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Deals")} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t("Deals")}</h1>
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">
              {viewMode === "Board"
                ? (loading ? t("Loading deal totals…") : `${new Intl.NumberFormat(language).format(boardDealTotal)} ${t(boardDealTotal === 1 ? "deal" : "deals")} · ${t("Pipeline board")}`)
                : (dealListState === "idle" || (dealListState === "loading" && dealListRows.length === 0)
                    ? t("Loading deal totals…")
                    : `${new Intl.NumberFormat(language).format(dealListTotal)} ${t(dealListTotal === 1 ? "deal" : "deals")} · ${t("Company-wide list")}`)}
            </p>
          </div>
          <p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">
            {t(viewMode === "Board" ? "Move opportunities between stages and keep the commercial path visible." : "Search, sort and review every deal without loading the full pipeline into the browser.")}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <RegisterViewSwitch options={["Board", "List"] as const} value={viewMode} onChange={setViewMode} ariaLabel="Deal view" compact />
          <DexterActionPill onClick={() => setDexterOpen(true)} />
        </div>
      </header>

      {viewMode === "Board" ? (loading ? (
        <Surface padding="lg" className="min-h-[280px] animate-pulse rounded-[var(--md-radius-xl)] bg-[var(--md-surface)]">
          <span className="sr-only">{t("Loading deals")}</span>
        </Surface>
      ) : loadError ? (
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title={t("Deals could not be loaded")} meta={loadError} />
          <Button className="mt-5" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="size-4" strokeWidth={1.2} />
            {t("Retry")}
          </Button>
        </Surface>
      ) : dealPipelines.length === 0 ? (
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title={t("No deal pipelines yet")} meta={t("Create the first pipeline to start organising deals.")} />
          {canManagePipelines ? (
            <Button className="mt-5" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" strokeWidth={1.2} />
              {t("Open pipeline settings")}
            </Button>
          ) : null}
        </Surface>
      ) : (
        <CrmPipelineBoard
          pipelines={dealPipelines}
          selectedDealId={detailOpen && selectedDeal ? selectedDeal.id : undefined}
          onSelectDeal={openDealDetail}
          onPipelineChange={switchPipeline}
          onOpenSettings={() => setSettingsOpen(true)}
          onMoveDeal={persistDealMove}
          stagePaging={Object.fromEntries(livePipelines.flatMap((pipeline) => pipeline.stages.map((stage) => [stage.id, {
            total: stagePages[stage.id]?.total ?? 0,
            loading: stagePages[stage.id]?.loading ?? false,
            onLoadMore: () => void loadMoreDealsForStage(pipeline.id, stage.id),
          }])))}
        />
      )) : (
        <DataTable
          ariaLabel="Deal directory"
          columnsButtonLabel="Manage deal columns"
          storageKey="crm-deals-list"
          columns={dealListColumns}
          rows={dealListRows}
          getRowKey={(deal) => deal.id}
          onRowClick={openApiDealDetail}
          rowClassName="group h-[64px] hover:bg-[var(--md-hover)]"
          serverSorting={{ value: dealListSort, onChange: (next) => { setDealListSort(next ?? { id: "created", direction: "desc" }); setDealListOffset(0) } }}
          pagination={{ offset: dealListOffset, limit: dealListPageSize, total: dealListTotal, loading: dealListState === "loading", onOffsetChange: setDealListOffset, onLimitChange: setDealListPageSize, error: dealListState === "error" }}
          compactToolbar
          toolbarSearch={<RegisterSearchField value={dealQuery} onChange={setDealQuery} onClear={() => setDealQuery("")} label="Search deals" placeholder="Deal, company, pipeline or owner…" className="sm:w-[210px]" />}
          toolbarFilters={<>
            <RegisterFacetSelect label="Pipeline" allLabel="All pipelines" value={dealPipelineFilter} options={listPipelineOptions} onChange={setDealPipelineFilter} className="w-[132px]" />
            <RegisterFacetSelect label="Status" allLabel="All statuses" value={dealStatusFilter} options={listStatusOptions} onChange={setDealStatusFilter} className="w-[122px]" />
            <RegisterFacetSelect label="Owner" allLabel="All owners" value={dealOwnerFilter} options={listOwnerOptions} onChange={setDealOwnerFilter} className="w-[126px]" />
          </>}
          toolbarOptions={<RegisterRevalidatingMark active={dealListState === "loading" && dealListRows.length > 0} />}
          contentBeforeTable={dealListState === "error" && dealListRows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-danger)_8%,var(--md-surface))] px-3 py-2" role="alert">
              <p className="text-[12px] text-[var(--md-danger)]" dir="auto">{dealListError ? t(dealListError) : t("Deals could not be refreshed.")}</p>
              <Button type="button" variant="outline" className="h-8" onClick={() => setReloadKey((key) => key + 1)}>{t("Try again")}</Button>
            </div>
          ) : undefined}
          exportConfig={{ fileName: "crm-deals", recordCategory: "Deal details", loadRecords: (selectedDeals) => Promise.all(selectedDeals.map((deal) => getDeal(deal.id))), register: {
            busy: dealQuery.trim() !== debouncedDealQuery,
            dateLabel: "Deal created date", dateValue: (deal) => deal.createdAt,
            loadAllRows: (signal) => collectExportPages((page) => listDealsPage({
              search: debouncedDealQuery, pipelineId: dealPipelineFilter || undefined, statusCode: dealStatusFilter || undefined,
              ownerId: dealOwnerFilter && dealOwnerFilter !== "__unassigned__" ? dealOwnerFilter : undefined,
              unassigned: dealOwnerFilter === "__unassigned__", sort: dealListSort ?? { id: "created", direction: "desc" }, ...page,
            }, { forceRefresh: true }), (deal) => deal.id, signal),
          } }}
          emptyState={dealListState === "idle" || dealListState === "loading"
            ? <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading deals…" /></div>
            : dealListState === "error"
              ? <div className="grid min-h-[180px] place-items-center p-6 text-center" role="alert"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Deals could not be loaded.")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]" dir="auto">{dealListError ? t(dealListError) : null}</p><Button type="button" variant="outline" className="mt-3" onClick={() => setReloadKey((key) => key + 1)}>{t("Try again")}</Button></div></div>
              : <div className="grid min-h-[180px] place-items-center p-6 text-center"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(dealFiltersActive ? "No deals match these filters." : "No deals yet.")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t(dealFiltersActive ? "Clear a filter or try another deal, company, pipeline or owner." : "Convert a qualified lead to create the first deal.")}</p>{dealFiltersActive ? <Button type="button" variant="outline" className="mt-3" onClick={clearDealListFilters}>{t("Clear filters")}</Button> : null}</div></div>}
        />
      )}
      {selectedDeal ? <DealDetailDrawer deal={selectedDeal} open={detailOpen} onClose={() => setDetailOpen(false)} /> : null}
      <PipelineSettingsDrawer
        open={settingsOpen}
        canEdit={canManagePipelines}
        addStageRequestKey={0}
        onClose={() => {
          setSettingsOpen(false)
          setReloadKey((key) => key + 1)
        }}
      />
      <Dialog open={newDealOpen} onOpenChange={(open) => {
        setNewDealOpen(open)
        if (!open) setDealLeadSearch("")
      }}>
        <DialogContent onCloseAutoFocus={restoreNewDealFocus} className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("New deal")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Choose an open lead. You will review the commercial details before the deal is created.")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={dealLeadSearch}
            onChange={(event) => setDealLeadSearch(event.target.value)}
            placeholder={t("Search company, contact, owner or lane")}
            aria-label={t("Search open leads")}
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]"
          />
          <div className="max-h-[360px] overflow-y-auto rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
            {dealLeadState === "loading" ? (
              <p className="px-4 py-8 text-center text-[13px] text-[var(--md-text)]" role="status">{t("Loading open leads…")}</p>
            ) : dealLeadState === "error" ? (
              <div className="px-4 py-6 text-center" role="alert">
                <p className="text-[13px] text-[var(--md-text)]">{dealLeadError}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => { setNewDealOpen(false); window.setTimeout(() => setNewDealOpen(true), 0) }}>{t("Try again")}</Button>
              </div>
            ) : dealLeadOptions.length ? (
              dealLeadOptions.map((lead, index) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => startDealFromLead(lead.id)}
                  className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-start outline-none transition-colors hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a20)] ${index ? "border-t border-[var(--md-line)]" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto">{lead.companyName}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-text)]" dir="auto">{[lead.primaryContactName, lead.ownerName, lead.tradeLane].filter(Boolean).join(" · ") || t("No supporting detail recorded")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--md-accent)]">{t("Review deal")}<ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} /></span>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(dealLeadSearch.trim() ? "No open leads match this search." : "No open leads are ready to convert.")}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Create or qualify a lead first, then start its deal from here.")}</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => { setNewDealOpen(false); navigate?.("/crm/leads") }}>{t("Go to leads")}</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={pendingWin !== null} onOpenChange={(open) => {
        if (!open && !winning) {
          setPendingWin(null)
          setReloadKey((key) => key + 1)
        }
      }}>
        <DialogContent className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("Confirm deal won")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("This will mark the deal won and activate the organisation as an operational customer. Contacts, notes and CRM history will be preserved.")}
            </DialogDescription>
          </DialogHeader>
          {pendingWin ? (
            <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
              <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{pendingWin.deal.name}</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]" data-i18n-skip dir="auto">{pendingWin.deal.companyName}</p>
              <p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Destination stage")}: <span dir="auto">{pendingWin.stage.name}</span></p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={winning} onClick={() => { setPendingWin(null); setReloadKey((key) => key + 1) }}>{t("Cancel")}</Button>
            <Button disabled={winning} onClick={() => void confirmDealWon()}>{winning ? <LoaderCircle className="size-4 animate-spin" /> : null}{t("Mark won and create customer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DexterDockedPage>
  )
}

export function CrmActivityPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title="Activity"
        summary={
          <>
            A relationship timeline that blends lead notes, quote events, email replies, AI signals, and booking exceptions.
          </>
        }
        meta="Updated from the last 24 hours of customer-facing work"
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <CrmActivityTimeline onOpenContext={navigate} />
        <div className="md-panel-column">
          <CrmLeadSignalList onOpenLead={() => navigate("/crm/leads")} />
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="Activity mix" meta="where this week's customer work came from" />
            <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
              {[
                ["Email replies", "12", "teal"],
                ["Quote updates", "7", "green"],
                ["Booking exceptions", "3", "red"],
                ["Renewal notes", "2", "amber"],
              ].map(([label, value, tone]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                  <span className="text-[13px] font-medium text-[var(--md-text)]">{label}</span>
                  <StatusPill tone={tone as StatusTone}>{value}</StatusPill>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

export function CrmSettingsPage({ currentUser }: { currentUser?: AuthUserSummary | null }) {
  const { t } = useLanguage()

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title={t("CRM settings")}
        summary={
          <>
            {t("Build and refine the sales stages that move a lead towards becoming a customer.")}
          </>
        }
        meta={t("Drag stages to reorder, or use the move buttons.")}
      />

      <CrmSettingsBuilder canEdit={hasPermission(currentUser, "Settings.Manage")} />
    </div>
  )
}
