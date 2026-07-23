import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Bell, Check, ChevronDown, Clipboard, Cloud, Component, Download, FileText, Folder, Image, KeyRound, Mail, Search, Ship, Sparkles, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { activityItems, cityQueues, crmAccountSignals, crmActivities, crmContacts, crmPipelineStages, crmSummaryMetrics, customerFilters, customerScopeTabs, customers, customsQueue, galleryComponents, galleryIcons, generatedReports, initialFavouriteBookingIds, liveBookings, marlowContacts, marlowMetrics, metricCards, quoteAuditEvents, reportTemplates, bookingFilters, bookingMetrics, bookings, warehouseOrders, warehouseProducts, warehouseStockRows } from "@/data/multideck-data"
import { AnimatedList } from "@/components/multideck/animated-list"
import { CommandInput } from "@/components/multideck/command-input"
import { SidebarNavItem } from "@/components/multideck/app-sidebar"
import { MetricCard } from "@/components/multideck/metric-card"
import { Pagination } from "@/components/multideck/pagination"
import { QueueRow, BookingRow, TimezoneFocusPanel, WorldClockCell, useLiveNow } from "@/components/multideck/overview-panels"
import {
  AccountPanel,
  ActiveBookingsPanel,
  DexterPulsePanel,
  ContactProfileModule,
  CustomerAvatar,
  CustomerActivityPanel,
  CustomerDetailHero,
  CustomerFootprintMap,
  CustomerListTable,
  CustomerMetricCard,
  CustomerMetricsGrid,
  customerViewOptions,
  type CustomerViewMode,
  LaneMixPanel,
  PrimaryContactsPanel,
} from "@/components/multideck/customer-components"
import { CrmActivityTimeline, CrmAssetFolderCard, CrmAssetRow, CrmContactTable, CrmForecastPanel, CrmLeadDetailPanel, CrmLeadSignalList, CrmMetricsGrid, CrmPipelineBoard, CrmPriorityActionsPanel, CrmRevenueMixPanel, CrmSalesCommandCenter, CrmSalesFunnelPanel, CrmSettingsBuilder } from "@/components/multideck/crm-components"
import { FilterChips, SegmentedControl, TabsRail } from "@/components/multideck/workflow-components"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { CodeInput, FreightNarrative, SignInPanel, SignedOutPanel, VerifyPanel, WorkspaceRouterPanel } from "@/components/multideck/auth-flow"
import { AuthIdentityManager, AuthProviderSelector } from "@/components/multideck/auth-provider-selector"
import { BookingAdvancedSearch, BookingArrivalCard, BookingAskPanel, BookingBoardPreview, BookingExceptionPanel, BookingMetricCard, BookingResolutionChecklist, BookingsTable, YourJobsPanel, bookingViewModes, bookingViewOptions, type BookingSearchCriterion, type BookingViewMode } from "@/components/multideck/booking-components"
import { DomesticJobStageRail, DomesticRoadJobCard, DomesticRoadKanbanBoard, domesticRoadJobs, roadJobStageStatus, roadJobStages } from "@/components/multideck/domestic-road-components"
import { WarehouseKanbanBoardPreview, WarehouseOrdersTable, WarehouseProductsTable, WarehouseStockTable } from "@/components/multideck/warehouse-components"
import { WarehouseFormField } from "@/components/multideck/warehouse-management-components"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DexterAttachmentPalette,
  DexterChecklistCard,
  DexterCustomerSnapshot,
  DexterHistoryList,
  DexterMonitorCard,
  DexterMonitorDetailSheet,
  DexterPromptComposer,
  DexterRiskTable,
  DexterSpecialistMenu,
  DexterSpecialistPicker,
  defaultDexterAttachments,
  defaultDexterSpecialists,
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import {
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  FunnelChartCard,
  HeatmapChartCard,
  LineChartCard,
  MixedChartCard,
  RadialGoalChartCard,
  ScatterChartCard,
  StackedBarChartCard,
} from "@/components/multideck/chart-components"
import {
  GeneratedReportsTable,
  monthlyReviewPages,
  ReportBlockDataEditorDialog,
  ReportDocumentPage,
  ReportPageControls,
  ReportPageThumbnailRail,
  ReportWidgetPalette,
  NewReportTemplateCard,
  reportWidgets,
  ReportTemplateCard,
} from "@/components/multideck/report-components"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsIntegrationRow,
  SettingsOptionCard,
  SettingsPanel,
  SettingsRail,
  SettingsSummaryCard,
  type SettingsTabGroup,
} from "@/components/multideck/settings-components"
import { Table, TableBody } from "@/components/ui/table"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"
import { AIEdgeGlow } from "@/components/multideck/ai-edge-glow"
import { DashboardCustomisePanel } from "@/components/multideck/dashboard-customise-panel"
import { MultideckDateRangePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterCompanionSidebar } from "@/components/multideck/dexter-companion-sidebar"
import { PageSettingsMenu } from "@/components/multideck/page-settings-menu"
import { AuditTimeline } from "@/components/multideck/audit-timeline"
import { AuditWorkspace, QUOTE_AUDIT_SAMPLE_DATA } from "@/components/multideck/audit-workspace"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { UnifiedQuoteChargesWorkspace, type UnifiedQuoteChargeRow } from "@/components/multideck/unified-quote-charges-workspace"
import { QuoteSearchBuilder, type QuoteSearchQuery } from "@/components/multideck/quote-search-builder"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { DocumentViewer, PaperTrayStack } from "@/components/multideck/paper-tray"
import { DocumentWorkspace, documentWorkspaceSampleDocuments } from "@/components/multideck/document-workspace"
import { createInitialPaperTrays } from "@/data/paper-tray-data"

type GalleryIconKey = keyof typeof galleryIcons

const sectionLinks = ["Introduction", "Components", "Usage", "Theming", "Tokens"]
const rightRail = ["Purpose", "Preview", "Code", "Usage", "Token dependency"]
const galleryTabTriggerClass =
  "relative h-10 rounded-none border-0 bg-transparent px-0 pr-8 text-[14px] font-medium text-[var(--md-text)] shadow-none after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-[calc(100%-2rem)] after:rounded-full after:bg-[var(--md-ink)] after:opacity-0 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none data-active:border-transparent data-active:bg-transparent data-active:shadow-none data-active:after:opacity-100 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-[var(--md-ink)] data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
type GalleryComponent = (typeof galleryComponents)[number]
type GallerySidebarGroup = {
  label: string
  helper: string
  ids: string[]
}

const gallerySidebarGroups: GallerySidebarGroup[] = [
  {
    label: "Design system",
    helper: "Tokens, type, surfaces",
    ids: ["colours", "typography", "surface"],
  },
  {
    label: "Chart components",
    helper: "Graphs, KPI boxes, report visuals",
    ids: ["metric-card", "line-chart", "area-chart", "bar-chart", "stacked-bar-chart", "donut-chart", "funnel-chart", "heatmap-chart", "radial-goal-chart", "scatter-chart", "mixed-chart"],
  },
  {
    label: "Button & control components",
    helper: "Navigation and input controls",
    ids: ["command", "sidebar", "theme-toggle", "page-settings-menu", "date-range-picker", "segmented-control", "filter-chips", "tabs", "multi-select-menu", "pagination", "settings-controls", "settings-option-card"],
  },
  {
    label: "Auth components",
    helper: "Sign-in and return states",
    ids: ["auth-narrative-panel", "auth-workspace-router", "auth-provider-selector", "auth-sign-in-panel", "auth-identity-manager", "auth-verification-panel", "auth-code-input", "auth-signed-out-panel"],
  },
  {
    label: "Reports",
    helper: "Templates, pages, widgets",
    ids: ["report-template-card", "generated-report-table", "report-document-page", "report-thumbnail-rail", "report-page-controls", "report-widget-palette", "report-data-editor"],
  },
  {
    label: "Operations",
    helper: "Freight workflow pieces",
    ids: ["paper-tray-stack", "document-viewer", "document-workspace", "audit-timeline", "audit-workspace", "booking-row", "interactive-map", "animated-list", "world-clock", "timezone-work-queue", "queue-row", "customer-avatar", "customer-metric-card", "contact-profile", "primary-contacts-panel", "data-table", "unified-quote-charges-workspace", "quote-search-builder", "warehouse-table", "warehouse-form-field", "warehouse-kanban-board", "geo-panel", "record-header", "active-bookings-panel", "your-jobs-panel", "lane-mix-panel", "booking-metric-card", "booking-advanced-search", "bookings-table", "booking-board-preview", "domestic-job-stage-rail", "domestic-road-job-card", "domestic-road-kanban-board", "booking-arrival-card", "booking-exception-panel", "booking-checklist", "booking-ask-panel", "side-panels"],
  },
  {
    label: "CRM",
    helper: "Leads, contacts, deals, activity, marketing, settings",
    ids: ["crm-sales-command-center", "crm-metrics-grid", "crm-sales-funnel-panel", "crm-revenue-mix-panel", "crm-forecast-panel", "crm-priority-actions-panel", "crm-pipeline-board", "crm-asset-folder-card", "crm-asset-row", "crm-lead-detail-panel", "crm-contact-table", "crm-activity-timeline", "crm-lead-signals", "crm-settings-builder"],
  },
  {
    label: "Agent Dexter",
    helper: "Prompt, context, specialists, answers",
    ids: ["dashboard-customise-panel", "dexter-action-pill", "dexter-companion-sidebar", "dexter-prompt-composer", "dexter-specialist-picker", "dexter-specialist-menu", "dexter-attachment-palette", "dexter-history-list", "dexter-monitor-card", "dexter-monitor-detail", "dexter-response-blocks"],
  },
  {
    label: "Feedback",
    helper: "Status and notifications",
    ids: ["status-pill", "ai-edge-glow", "toast"],
  },
  {
    label: "Settings",
    helper: "Configuration surfaces",
    ids: ["settings-rail", "settings-panel-row", "settings-integration-row", "settings-summary-card"],
  },
]

const previewPaperTrays = createInitialPaperTrays()

type PreviewChargeRow = {
  id: string
  description: string
  supplier: string
  cost: number
  sell: number
}

const previewChargeRows: PreviewChargeRow[] = [
  { id: "FRT", description: "International freight", supplier: "Bluewave Ocean", cost: 840, sell: 980 },
  { id: "OCART", description: "Pickup transport", supplier: "Severn Road Logistics", cost: 610, sell: 630 },
  { id: "DTHC", description: "Destination handling", supplier: "Kobe Gateway Agency", cost: 304, sell: 360 },
]

const previewUnifiedChargeRowsSeed: UnifiedQuoteChargeRow[] = [
  { id: "preview-frt", code: "FRT", description: "International freight", supplierId: "supplier-bluewave", customerId: "customer-harbourworks", cost: 840, costCurrency: "USD", sell: 980, sellCurrency: "USD", costRoe: 1.25, sellRoe: 1.25, costRoeSource: "rate", sellRoeSource: "rate" },
  { id: "preview-ocart", code: "OCART", description: "Pickup transport", supplierId: "supplier-severn", customerId: "customer-harbourworks", cost: 610, costCurrency: "GBP", sell: 630, sellCurrency: "GBP", costRoe: 1, sellRoe: 1, costRoeSource: "rate", sellRoeSource: "rate" },
  { id: "preview-dthc", code: "DTHC", description: "Destination handling", supplierId: "supplier-kobe", customerId: "customer-harbourworks", cost: 380, costCurrency: "USD", sell: 450, sellCurrency: "USD", costRoe: 1.25, sellRoe: 1.25, costRoeSource: "rate", sellRoeSource: "rate" },
]

const previewChargeColumns: DataTableColumn<PreviewChargeRow>[] = [
  { id: "code", label: "Code", width: 100, defaultPinned: true, cell: (row) => <span dir="ltr">{row.id}</span>, sortValue: (row) => row.id },
  { id: "description", label: "Description", width: 220, cell: (row) => row.description, sortValue: (row) => row.description },
  { id: "supplier", label: "Supplier", width: 210, cell: (row) => row.supplier, sortValue: (row) => row.supplier },
  { id: "cost", label: "Cost", width: 110, cell: (row) => `£${row.cost.toFixed(2)}`, sortValue: (row) => row.cost },
  { id: "sell", label: "Sell", width: 110, cell: (row) => `£${row.sell.toFixed(2)}`, sortValue: (row) => row.sell },
]

const previewMarketingFolders = [
  {
    id: "brand-logos",
    name: "Brand logos",
    description: "Primary marks, partner lockups, favicon exports, and approved logo variations.",
    itemCount: 9,
    size: "48 MB",
    updated: "Updated today",
    owner: "Elena",
    tone: "green" as const,
    icon: Folder,
  },
  {
    id: "graphics",
    name: "Graphics",
    description: "Lane visuals, customer education graphics, hero images, and social-ready artwork.",
    itemCount: 14,
    size: "312 MB",
    updated: "Updated Tue",
    owner: "Will",
    tone: "green" as const,
    icon: Image,
  },
  {
    id: "sales-collateral",
    name: "Sales collateral",
    description: "One-pagers, trade-lane explainers, customer report inserts, and proposal assets.",
    itemCount: 11,
    size: "186 MB",
    updated: "Updated Jun 7",
    owner: "Mina",
    tone: "green" as const,
    icon: FileText,
  },
]

const previewMarketingAssets = [
  {
    id: "md-primary-logo-svg",
    folderId: "brand-logos",
    name: "multideck-primary-logo.svg",
    type: "SVG",
    size: "124 KB",
    updated: "Today",
    owner: "Elena",
    usage: "Approved primary logo for light surfaces",
    tone: "green" as const,
    icon: FileText,
  },
  {
    id: "peak-season-hero",
    folderId: "graphics",
    name: "peak-season-capacity-hero.png",
    type: "PNG",
    size: "18.6 MB",
    updated: "Tue",
    owner: "Will",
    usage: "Hero graphic for peak-season advisory",
    tone: "green" as const,
    icon: Image,
  },
  {
    id: "monthly-rates-html",
    folderId: "email-templates",
    name: "monthly-rates-newsletter.html",
    type: "HTML",
    size: "86 KB",
    updated: "Jun 10",
    owner: "Jamie",
    usage: "Reusable rates newsletter shell",
    tone: "green" as const,
    icon: Mail,
  },
]

function groupGalleryComponents(filtered: GalleryComponent[]) {
  const byId = new Map(filtered.map((component) => [component.id, component]))
  const used = new Set<string>()
  const groups = gallerySidebarGroups
    .map((group) => {
      const components = group.ids.flatMap((id) => {
        const component = byId.get(id)
        if (!component) return []
        used.add(id)
        return [component]
      })

      return { ...group, components }
    })
    .filter((group) => group.components.length > 0)

  const otherComponents = filtered.filter((component) => !used.has(component.id))
  if (otherComponents.length > 0) {
    groups.push({
      label: "Other components",
      helper: "Unsorted reusable pieces",
      ids: otherComponents.map((component) => component.id),
      components: otherComponents,
    })
  }

  return groups
}

const introNotes = [
  {
    title: "What they are",
    body: "Reusable Multideck building blocks: panels, rows, map modules, status labels, navigation, typography, and data treatments that make the product feel consistent.",
  },
  {
    title: "What they do",
    body: "They turn freight work into clear, scannable UI. Each component helps a rep show what needs attention, where a booking is, what state a customer is in, or what action should happen next.",
  },
  {
    title: "How to use them",
    body: "Start with the live preview, read the purpose, then use the code and usage tabs when a screen needs the same pattern. Compose these pieces before inventing a new one.",
  },
]
const colourTokens = [
  ["Ink", "--md-ink", "#0b1413"],
  ["Text", "--md-text", "#4f5b58"],
  ["Subtle", "--md-subtle", "#687570"],
  ["Background", "--md-bg", "#f3f4f4"],
  ["Strong bg", "--md-bg-strong", "#eef1f0"],
  ["Surface", "--md-surface", "#ffffff"],
  ["Tint", "--md-surface-tint", "#eef1f0"],
  ["Field", "--md-field-bg", "#e5e9e7"],
  ["Selected", "--md-selected-bg", "#c8dcd6"],
  ["Accent", "--md-accent", "#0a7068"],
  ["Green", "--md-green", "#0a7068"],
  ["Amber", "--md-amber", "#dd8a2b"],
  ["Red", "--md-red", "#d14e4e"],
  ["Blue", "--md-blue", "#4a7d9c"],
]
const typographyRows = [
  ["24px / Medium", "Main page headings", "Northwind operations"],
  ["18px / Medium", "Subheads and important summaries", "Two bookings need attention"],
  ["14px / Medium", "Section headings", "Live bookings"],
  ["13px / Regular", "Standard product copy", "Customs documents are ready for review."],
  ["12px / Regular", "Metadata and hints", "Updated 41s ago"],
  ["11px / Medium", "Pills and dense labels", "AI note"],
]
const settingsPreviewGroups: SettingsTabGroup[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: UserRound },
      { id: "security", label: "Login & security", icon: KeyRound },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "notifications", label: "Notifications", badge: "3", icon: Bell },
      { id: "agent-dexter", label: "Agent Dexter", icon: Sparkles },
    ],
  },
]
const InteractiveBookingMapPreview = lazy(() =>
  import("@/components/multideck/interactive-booking-map").then((module) => ({
    default: module.InteractiveBookingMap,
  })),
)

function getInitialComponentId() {
  const componentId = new URLSearchParams(window.location.search).get("component")
  if (componentId && galleryComponents.some((component) => component.id === componentId)) {
    return componentId
  }

  return galleryComponents[0].id
}

function getInitialSection() {
  return new URLSearchParams(window.location.search).has("component") ? "Components" : sectionLinks[0]
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 rounded-[var(--md-radius-lg)] bg-white/60 px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        toast.success("Code copied")
        window.setTimeout(() => setCopied(false), 1300)
      }}
    >
      {copied ? <Check data-icon="inline-start" strokeWidth={1.2} /> : <Clipboard data-icon="inline-start" strokeWidth={1.2} />}
      {copied ? "Copied" : "Copy code"}
    </Button>
  )
}

const syntaxTokenClass: Record<string, string> = {
  attribute: "text-[#9ad7c8]",
  comment: "text-[#6f8984]",
  keyword: "text-[#f0b86f]",
  number: "text-[#d4c77d]",
  punctuation: "text-[#91a7a1]",
  string: "text-[#b8db8f]",
  tag: "text-[#7fc7ff]",
  text: "text-[#d8e2df]",
}

function getSyntaxToken(value: string) {
  if (/^\/\//.test(value) || /^\/\*/.test(value)) return "comment"
  if (/^["'`]/.test(value)) return "string"
  if (/^<\/?[A-Za-z]/.test(value)) return "tag"
  if (/^(export|function|return|const|let|var|type|interface|import|from|as|default|if|else|true|false|null|undefined)$/.test(value)) return "keyword"
  if (/^\d/.test(value)) return "number"
  if (/^[A-Za-z_$][\w$-]*(?==)/.test(value)) return "attribute"
  if (/^[{}()[\].,;:?]$/.test(value)) return "punctuation"
  return "text"
}

function highlightCode(code: string) {
  const tokenPattern =
    /(\/\/.*|\/\*[\s\S]*?\*\/|(["'`])(?:\\.|(?!\2)[\s\S])*?\2|<\/?[A-Za-z][A-Za-z0-9.-]*|[A-Za-z_$][\w$-]*(?==)|\b(?:export|function|return|const|let|var|type|interface|import|from|as|default|if|else|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:?])/g
  const parts: ReactNode[] = []
  let cursor = 0

  for (const match of code.matchAll(tokenPattern)) {
    const value = match[0]
    const index = match.index ?? 0

    if (index > cursor) {
      parts.push(code.slice(cursor, index))
    }

    parts.push(
      <span key={`${index}-${value}`} className={syntaxTokenClass[getSyntaxToken(value)]}>
        {value}
      </span>,
    )

    cursor = index + value.length
  }

  if (cursor < code.length) {
    parts.push(code.slice(cursor))
  }

  return parts
}

function CodeBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = code.split("\n").length > 8

  useEffect(() => {
    setExpanded(false)
  }, [code])

  return (
    <div className="relative overflow-hidden rounded-[var(--md-radius-lg)] bg-[#07100f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <pre
        className={cn(
          "overflow-auto p-[var(--md-page-stack-gap)] font-mono text-[12px] leading-6 text-[#d8e2df] md-scrollbar transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          canExpand && "pb-16",
          canExpand ? (expanded ? "max-h-[1100px]" : "max-h-[320px]") : "max-h-none",
        )}
      >
        <code>{highlightCode(code)}</code>
      </pre>

      {canExpand ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[#07100f] via-[#07100f]/82 to-transparent px-5 pb-4 pt-16">
          <Button
            type="button"
            variant="ghost"
            className="pointer-events-auto h-9 rounded-[var(--md-radius-md)] bg-white/8 px-4 text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_0_1px_rgba(0,0,0,0.18)] backdrop-blur-md hover:bg-white/12"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "View all code"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FoundOnLinks({ links }: { links: (typeof galleryComponents)[number]["foundOn"] }) {
  return (
    <div className="mt-[var(--md-page-stack-gap)] flex flex-wrap items-center gap-[var(--md-gap-sm)]">
      <span className="text-[12px] font-medium text-[var(--md-subtle)]">Found on</span>
      {links.map((link) => (
        <a
          key={`${link.label}-${link.route}`}
          href={link.route}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-white/55 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-white/80 hover:text-[var(--md-ink)]"
        >
          {link.label}
          <ArrowRight className="size-3 text-[var(--md-subtle)]" strokeWidth={1.2} />
        </a>
      ))}
    </div>
  )
}

function ComponentPreview({ id }: { id: string }) {
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [previewBookingFilter, setPreviewBookingFilter] = useState<string>(bookingFilters[0])
  const [previewBookingView, setPreviewBookingView] = useState<BookingViewMode>("Table")
  const [previewCustomerView, setPreviewCustomerView] = useState<CustomerViewMode>("List")
  const [previewSelectedIds, setPreviewSelectedIds] = useState<Set<string>>(new Set(["marlow-apparel"]))
  const [previewCustomerTab, setPreviewCustomerTab] = useState("Overview")
  const [previewAuthEmail, setPreviewAuthEmail] = useState("john.doe@multideck.app")
  const [previewAuthCode, setPreviewAuthCode] = useState("742")
  const [previewSettingsTab, setPreviewSettingsTab] = useState("profile")
  const [previewSettingsChoice, setPreviewSettingsChoice] = useState("Always ask")
  const [previewSettingsOption, setPreviewSettingsOption] = useState("Suggest")
  const [previewScreenGlow, setPreviewScreenGlow] = useState(false)
  const [previewReportPageId, setPreviewReportPageId] = useState(monthlyReviewPages[0].id)
  const [previewReportControlPage, setPreviewReportControlPage] = useState(1)
  const [previewWidgetQuery, setPreviewWidgetQuery] = useState("")
  const [previewWidgetId, setPreviewWidgetId] = useState(reportWidgets[0].id)
  const [previewDataEditorOpen, setPreviewDataEditorOpen] = useState(false)
  const [previewBookingSelectedIds, setPreviewBookingSelectedIds] = useState<Set<string>>(new Set(["MD-22455"]))
  const [previewFavouriteBookingIds, setPreviewFavouriteBookingIds] = useState<Set<string>>(() => new Set(initialFavouriteBookingIds))
  const [previewRoadFavouriteBookingIds, setPreviewRoadFavouriteBookingIds] = useState<Set<string>>(() => new Set(["MD-22676"]))
  const [previewRoadJobs, setPreviewRoadJobs] = useState(() => [...domesticRoadJobs])
  const [previewDateRange, setPreviewDateRange] = useState<MultideckDateRange>({ start: "2026-05-25", end: "2026-06-04" })
  const [previewBookingSearchCriteria, setPreviewBookingSearchCriteria] = useState<BookingSearchCriterion[]>([
    { id: "preview-booking-search-invoice", field: "invoice", groupId: "preview-search-main", value: "INV-MAR", valueTo: "" },
    { id: "preview-booking-search-destination", connector: "and", field: "destination", groupId: "preview-search-main", value: "Felixstowe", valueTo: "" },
    { id: "preview-booking-search-vin", field: "vin", groupConnector: "or", groupId: "preview-search-vin", value: "WVW", valueTo: "" },
  ])
  const [previewQuoteSearch, setPreviewQuoteSearch] = useState<QuoteSearchQuery>({
    match: "all",
    groups: [{
      id: "preview-quote-search-main",
      match: "all",
      conditions: [
        { id: "preview-quote-status", field: "status", operator: "is-not", value: "Expired" },
        { id: "preview-quote-origin", field: "origin", operator: "contains", value: "GB" },
      ],
    }],
  })
  const [previewContactEmail, setPreviewContactEmail] = useState(marlowContacts[0].email)
  const [previewDexterPrompt, setPreviewDexterPrompt] = useState("Prep Marlow's QBR and attach the latest open booking context.")
  const [previewDexterSpecialistId, setPreviewDexterSpecialistId] = useState<DexterSpecialistId>("auto")
  const [previewDexterAttachmentQuery, setPreviewDexterAttachmentQuery] = useState("")
  const [previewDexterAttachmentIds, setPreviewDexterAttachmentIds] = useState<Set<string>>(new Set(["marlow", "md-22414"]))
  const [previewCrmDealId, setPreviewCrmDealId] = useState(crmPipelineStages[0].deals[0].id)
  const [previewCrmLeadId, setPreviewCrmLeadId] = useState(customers[0].id)
  const [previewCrmContactEmail, setPreviewCrmContactEmail] = useState(crmContacts[0].email)
  const [previewMarketingFolderId, setPreviewMarketingFolderId] = useState(previewMarketingFolders[0].id)
  const [previewPaperDocumentId, setPreviewPaperDocumentId] = useState<string | null>(null)
  const [previewTransportModes, setPreviewTransportModes] = useState(["Sea FCL", "Road"])
  const [previewUnifiedChargeRows, setPreviewUnifiedChargeRows] = useState<UnifiedQuoteChargeRow[]>(previewUnifiedChargeRowsSeed)
  const previewNow = useLiveNow()
  const previewPaperDocument = previewPaperTrays.flatMap((tray) => tray.documents).find((document) => document.id === previewPaperDocumentId) ?? null
  const previewPaperDocumentTrayId = previewPaperTrays.find((tray) => tray.documents.some((document) => document.id === previewPaperDocumentId))?.id ?? null
  const previewBookingSearchCount = useMemo(() => {
    function matchesCriterion(booking: (typeof bookings)[number], criterion: BookingSearchCriterion) {
      const query = criterion.value.trim().toLowerCase()
      const queryTo = criterion.valueTo?.trim()
      if (!query && !queryTo) return true
      if (criterion.field === "date") {
        return [booking.departureDate, booking.arrivalDate].some((date) => date >= (criterion.value || queryTo || "") && date <= (queryTo || criterion.value || "9999-12-31"))
      }
      if (criterion.field === "departure") return booking.departureDate >= (criterion.value || queryTo || "") && booking.departureDate <= (queryTo || criterion.value || "9999-12-31")
      if (criterion.field === "arrival") return booking.arrivalDate >= (criterion.value || queryTo || "") && booking.arrivalDate <= (queryTo || criterion.value || "9999-12-31")

      const customFields = booking.customFields.flatMap((field) => [field.label, field.value, `${field.label} ${field.value}`])
      const valuesByField: Record<Exclude<BookingSearchCriterion["field"], "date" | "departure" | "arrival">, string[]> = {
        any: [booking.id, booking.customer, booking.route, booking.carrier, booking.container, booking.invoice, booking.jobRef, booking.customerRef, booking.supplierRef, booking.origin, booking.destination, booking.vessel, booking.vin, ...customFields],
        invoice: [booking.invoice],
        jobRef: [booking.jobRef],
        customerRef: [booking.customerRef],
        supplierRef: [booking.supplierRef],
        destination: [booking.destination, booking.route],
        origin: [booking.origin, booking.route],
        vessel: [booking.vessel, booking.carrier],
        vin: [booking.vin],
        customFields,
      }

      return valuesByField[criterion.field].some((value) => value.toLowerCase().includes(query))
    }

    const groups = previewBookingSearchCriteria.reduce<Array<{ id: string; connector: "and" | "or"; criteria: BookingSearchCriterion[] }>>((currentGroups, criterion, index) => {
      if (!criterion.value.trim() && !criterion.valueTo?.trim()) return currentGroups
      const groupId = criterion.groupId ?? "preview-search-main"
      const existingGroup = currentGroups.find((group) => group.id === groupId)
      if (existingGroup) {
        existingGroup.criteria.push(criterion)
        return currentGroups
      }

      currentGroups.push({
        id: groupId,
        connector: criterion.groupConnector ?? (index === 0 ? "and" : "or"),
        criteria: [criterion],
      })
      return currentGroups
    }, [])

    return bookings.filter((booking) => {
      if (!groups.length) return true
      return groups.reduce<boolean>((searchMatches, group, groupIndex) => {
        const groupMatches = group.criteria.reduce<boolean>((matches, criterion, criterionIndex) => {
          const criterionMatches = matchesCriterion(booking, criterion)
          if (criterionIndex === 0) return criterionMatches
          return (criterion.connector ?? "and") === "or" ? matches || criterionMatches : matches && criterionMatches
        }, true)

        if (groupIndex === 0) return groupMatches
        return group.connector === "or" ? searchMatches || groupMatches : searchMatches && groupMatches
      }, true)
    }).length
  }, [previewBookingSearchCriteria])
  useEffect(() => {
    if (!previewScreenGlow) return undefined

    const timeoutId = window.setTimeout(() => setPreviewScreenGlow(false), 4200)
    return () => window.clearTimeout(timeoutId)
  }, [previewScreenGlow])

  function togglePreviewCustomer(id: string) {
    setPreviewSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePreviewBooking(id: string) {
    setPreviewBookingSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePreviewFavouriteBooking(id: string) {
    setPreviewFavouriteBookingIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePreviewDexterAttachment(id: string) {
    setPreviewDexterAttachmentIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const previewDexterSpecialist = defaultDexterSpecialists.find((specialist) => specialist.id === previewDexterSpecialistId) ?? defaultDexterSpecialists[0]
  const previewDexterAttachments = defaultDexterAttachments.filter((attachment) => previewDexterAttachmentIds.has(attachment.id))
  const previewCrmLead = customers.find((customer) => customer.id === previewCrmLeadId) ?? customers[0]

  return (
    <div className="grid min-h-[430px] min-w-0 place-items-center overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] p-[var(--md-gap-xl)]">
      {previewScreenGlow ? (
        <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden>
          <AIEdgeGlow active variant="screen" className="h-screen w-screen rounded-none" />
        </div>
      ) : null}

      {id === "colours" ? (
        <div className="w-full max-w-[720px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colourTokens.map(([label, token, hex]) => (
              <div key={token} className="rounded-[var(--md-radius-lg)] bg-white/60 p-2 shadow-[var(--md-shadow-line)]">
                <div className="h-20 rounded-[var(--md-radius-md)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]" style={{ background: `var(${token})` }} />
                <div className="mt-3 px-1 pb-1">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--md-text)]">{token}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--md-subtle)]">{hex}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {id === "typography" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
            {typographyRows.map(([spec, use, sample], index) => (
              <div key={spec} className="grid gap-3 border-b border-[rgba(11,20,19,0.06)] pb-5 last:border-b-0 last:pb-0 md:grid-cols-[150px_1fr]">
                <div>
                  <p className="font-mono text-[11px] text-[var(--md-subtle)]">{spec}</p>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{use}</p>
                </div>
                <p
                  className={cn(
                    "text-[var(--md-ink)]",
                    index === 0 && "text-[24px] font-medium leading-tight",
                    index === 1 && "text-[18px] font-medium leading-6",
                    index === 2 && "text-[14px] font-medium",
                    index === 3 && "text-[13px] leading-6 text-[var(--md-text)]",
                    index === 4 && "text-[12px] text-[var(--md-subtle)]",
                    index === 5 && "text-[11px] font-medium uppercase tracking-normal text-[var(--md-accent)]",
                  )}
                >
                  {sample}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {id === "surface" ? (
        <Surface className="w-full max-w-[620px]" padding="lg">
          <SectionHeader title="Live bookings" meta="A production panel built from shared tokens." />
          <div className="mt-[var(--md-page-stack-gap)] divide-y divide-[rgba(11,20,19,0.05)]">
            {liveBookings.slice(0, 3).map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </div>
        </Surface>
      ) : null}

      {id === "status-pill" ? (
        <div className="flex w-full max-w-[560px] flex-wrap gap-[var(--md-gap-md)] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <StatusPill tone="green">Cleared</StatusPill>
          <StatusPill tone="amber">Under review</StatusPill>
          <StatusPill tone="red">Action req.</StatusPill>
          <StatusPill tone="blue">AI note</StatusPill>
          <StatusPill tone="teal">Submitted</StatusPill>
          <StatusPill tone="neutral">After hours</StatusPill>
        </div>
      ) : null}

      {id === "ai-edge-glow" ? (
        <div className="flex w-full max-w-[820px] flex-col gap-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-[var(--md-radius-md)] bg-white/64 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/82"
              onClick={() => setPreviewScreenGlow(true)}
            >
              {previewScreenGlow ? "Effect running" : "Trigger screen effect"}
            </Button>
          </div>

          <AIEdgeGlow className="min-h-[430px] w-full" contentClassName="p-[var(--md-gap-lg)] sm:p-[var(--md-page-stack-gap)]">
            <div className="flex h-full flex-col justify-between rounded-[var(--md-radius-lg)] bg-white/28 p-[var(--md-gap-lg)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)] backdrop-blur-[2px] sm:p-[var(--md-page-stack-gap)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-8 rounded-[var(--md-radius-md)] bg-white/40 shadow-[var(--md-shadow-line)]" />
                  <span className="h-3 w-28 rounded-full bg-[var(--md-ink)]/16" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/70" />
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/50" />
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/35" />
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-[560px] gap-2.5">
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="grid grid-cols-[22px_120px_1fr] items-center gap-4 rounded-[var(--md-radius-md)] bg-white/48 px-4 py-3 shadow-[var(--md-shadow-line)]">
                    <span className="size-3 rounded-full bg-[var(--md-accent)]/62" />
                    <span className="h-2 rounded-full bg-[var(--md-text)]/18" />
                    <span className="h-2 rounded-full bg-[var(--md-ink)]/12" />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="h-10 w-40 rounded-[var(--md-radius-md)] bg-[var(--md-accent)]/92 shadow-[var(--md-shadow-line)]" />
                <span className="h-10 w-24 rounded-[var(--md-radius-md)] bg-white/36 shadow-[var(--md-shadow-line)]" />
              </div>
            </div>
          </AIEdgeGlow>
        </div>
      ) : null}

      {id === "dashboard-customise-panel" ? (
        <div className="grid w-full max-w-[760px] place-items-center">
          <DashboardCustomisePanel open onOpenChange={() => undefined} presentation="preview" />
        </div>
      ) : null}

      {id === "dexter-action-pill" ? (
        <div className="flex w-full max-w-[720px] flex-wrap items-center gap-2 rounded-[var(--md-radius-xl)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]">
          <SegmentedControl options={customerScopeTabs} value="All customers" onChange={() => undefined} />
          <DexterActionPill
            onClick={() =>
              toast.success("Dexter opened", {
                description: "Starting a new conversation.",
              })
            }
          />
          <PageSettingsMenu
            viewOptions={customerViewOptions}
            value={previewCustomerView}
            onViewChange={setPreviewCustomerView}
            actions={[{ id: "preview-export-customers", label: "Export CSV", icon: Download, onSelect: () => toast.success("Customer CSV prepared") }]}
          />
        </div>
      ) : null}

      {id === "dexter-companion-sidebar" ? (
        <div className="w-full max-w-[900px]">
          <DexterCompanionSidebar open onClose={() => undefined} contextLabel="Customers" presentation="preview" />
        </div>
      ) : null}

      {id === "toast" ? (
        <div className="relative flex min-h-[340px] w-full max-w-[760px] items-center justify-center overflow-hidden rounded-[var(--md-radius-xl)] bg-[linear-gradient(135deg,rgba(251,253,253,0.72),rgba(233,242,240,0.72))] p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[var(--md-radius-lg)] bg-white/70 px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
            onClick={() =>
              toast.success("Customer CSV prepared", {
                description: "The export is ready for Northwind Forwarding.",
              })
            }
          >
            Trigger toast
          </Button>

          <div className="pointer-events-none absolute bottom-6 right-6 w-[min(520px,calc(100%-48px))]">
            <div data-type="success" className="md-toast flex items-start">
              <div className="md-toast-icon shrink-0">
                <Check className="size-4.5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="md-toast-title">Customer CSV prepared</p>
                <p className="md-toast-description">The export is ready for Northwind Forwarding.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {id === "metric-card" ? <MetricCard {...metricCards[0]} className="w-full max-w-[420px]" /> : null}

      {id === "line-chart" ? (
        <div className="w-full max-w-[860px]">
          <LineChartCard />
        </div>
      ) : null}

      {id === "area-chart" ? (
        <div className="w-full max-w-[860px]">
          <AreaChartCard />
        </div>
      ) : null}

      {id === "bar-chart" ? (
        <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-2">
          <BarChartCard variant="single" title="Single bar chart" subtitle="One series for focused counts" />
          <BarChartCard variant="comparison" title="Comparison bar chart" subtitle="Multiple series side by side" />
        </div>
      ) : null}

      {id === "stacked-bar-chart" ? (
        <div className="w-full max-w-[860px]">
          <StackedBarChartCard />
        </div>
      ) : null}

      {id === "donut-chart" ? (
        <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-2">
          <DonutChartCard title="Pie chart with key" subtitle="Legend visible for share-of-total reports" />
          <DonutChartCard title="Pie chart without key" subtitle="Best when the surrounding text names the slices" showLegend={false} innerRadius={0} />
        </div>
      ) : null}

      {id === "funnel-chart" ? (
        <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-2">
          <FunnelChartCard title="Four-step funnel" subtitle="Document processing workflow" />
          <FunnelChartCard
            title="Three-step funnel"
            subtitle="Quote-to-booking conversion"
            data={[
              { stage: "Quoted", value: 92, color: "var(--md-accent)" },
              { stage: "Accepted", value: 48, color: "var(--md-green)" },
              { stage: "Booked", value: 36, color: "var(--md-blue)" },
            ]}
          />
        </div>
      ) : null}

      {id === "heatmap-chart" ? (
        <div className="w-full max-w-[860px]">
          <HeatmapChartCard />
        </div>
      ) : null}

      {id === "radial-goal-chart" ? (
        <div className="w-full max-w-[700px]">
          <RadialGoalChartCard />
        </div>
      ) : null}

      {id === "scatter-chart" ? (
        <div className="w-full max-w-[860px]">
          <ScatterChartCard />
        </div>
      ) : null}

      {id === "mixed-chart" ? (
        <div className="w-full max-w-[860px]">
          <MixedChartCard />
        </div>
      ) : null}

      {id === "booking-row" ? (
        <Surface className="w-full max-w-[680px]">
          {liveBookings.slice(0, 4).map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </Surface>
      ) : null}

      {id === "interactive-map" ? (
        <div className="w-full max-w-[780px] overflow-hidden rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]">
          <Suspense fallback={<div className="h-[430px] bg-[var(--md-bg-strong)]" />}>
            <InteractiveBookingMapPreview />
          </Suspense>
        </div>
      ) : null}

      {id === "command" ? (
        <div className="w-full max-w-[680px]">
          <CommandInput />
          <Textarea
            className="mt-3 min-h-[110px] rounded-[var(--md-radius-lg)] border-0 bg-white/70 text-[13px] shadow-[var(--md-shadow-line)]"
            defaultValue="Ask: show bookings with customs risk today"
          />
        </div>
      ) : null}

      {id === "sidebar" ? (
        <div className="grid w-full max-w-[660px] gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
            <SidebarNavItem item={{ label: "Agent Dexter", icon: Sparkles }} accent="dexter" onClick={() => undefined} />
            <SidebarNavItem item={{ label: "Home & Work", icon: galleryIcons.sidebar }} onClick={() => undefined} />
            <SidebarNavItem item={{ label: "Operations", icon: Ship }} onClick={() => undefined} />
            <SidebarNavItem item={{ label: "Sales & CRM", icon: galleryIcons["crm-pipeline-board"] }} onClick={() => undefined} />
          </div>
          <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
            <SidebarNavItem item={{ label: "Agent Dexter", icon: Sparkles }} accent="dexter" onClick={() => undefined} />
            <div className="mb-3 flex items-center gap-2 px-2 text-[12px] font-medium text-[var(--md-subtle)]">
              <ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              <span>Operations</span>
            </div>
            <SidebarNavItem
              item={{ label: "Bookings & jobs", icon: Ship }}
              onClick={() => undefined}
              expanded
              trailing={<ChevronDown className="size-3.5 rotate-180" strokeWidth={1.2} />}
            />
            <div className="mt-1 ps-4">
              <div className="rounded-[var(--md-radius-lg)] bg-white/40 p-1 shadow-[var(--md-shadow-line)]">
                <SidebarNavItem item={{ label: "Bookings overview", value: "7", icon: Ship }} isActive onClick={() => undefined} nested />
                <SidebarNavItem item={{ label: "New booking", icon: FileText }} onClick={() => undefined} nested />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {id === "theme-toggle" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
          <ThemeToggle className="bg-[var(--md-glass)]" />
        </div>
      ) : null}

      {id === "paper-tray-stack" ? (
        <div className="w-full max-w-[920px] overflow-hidden py-2">
          <PaperTrayStack
            trays={previewPaperTrays.slice(0, 2)}
            selectedDocumentId={previewPaperDocumentId}
            mobileTrayId={previewPaperTrays[0].id}
            onSelectDocument={(document) => setPreviewPaperDocumentId(document.id)}
            onFilesAdded={(_, files) => toast.success(`${files.length} file${files.length === 1 ? "" : "s"} ready to add`)}
            onMoveDocument={() => toast.success("Document moved in preview")}
          />
        </div>
      ) : null}

      {id === "document-viewer" ? (
        <div className="grid min-h-[320px] w-full max-w-[520px] place-items-center rounded-[var(--md-radius-xl)] bg-white/55 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <Button onClick={() => setPreviewPaperDocumentId(previewPaperTrays[0].documents[0].id)}>Open document viewer</Button>
          <DocumentViewer
            item={previewPaperDocument}
            trays={previewPaperTrays}
            currentTrayId={previewPaperDocumentTrayId}
            onClose={() => setPreviewPaperDocumentId(null)}
            onMove={(trayId) => toast.success(`Would move to ${previewPaperTrays.find((tray) => tray.id === trayId)?.name ?? "tray"}`)}
            onRemove={() => setPreviewPaperDocumentId(null)}
            onDownload={() => toast.success("Download preview started")}
          />
        </div>
      ) : null}

      {id === "document-workspace" ? (
        <div className="w-full max-w-[1120px]">
          <DocumentWorkspace documents={documentWorkspaceSampleDocuments} />
        </div>
      ) : null}

      {id === "audit-timeline" ? (
        <div className="w-full max-w-[820px]">
          <AuditTimeline events={quoteAuditEvents} title="Audit and workflow" description="Quote changes and next actions" />
        </div>
      ) : null}

      {id === "audit-workspace" ? (
        <div className="w-full max-w-[1120px]">
          <AuditWorkspace records={QUOTE_AUDIT_SAMPLE_DATA} />
        </div>
      ) : null}

      {id === "animated-list" ? (
        <div className="w-full max-w-[680px]">
          <AnimatedList
            items={[...activityItems, ...activityItems, ...activityItems]}
            getItemKey={(item, index) => `${item.title}-${index}`}
            ariaLabel="Activity preview"
            initialSelectedIndex={0}
            fadeColor="var(--md-bg-strong)"
            maxHeight={300}
            itemClassName="px-3 py-3"
            renderItem={(item) => {
              const Icon = item.icon

              return (
                <div className="grid grid-cols-[30px_1fr_auto] gap-3">
                  <div className="grid size-[30px] place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                    <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{item.source}</p>
                  </div>
                  <span className="pt-1 text-[11px] text-[var(--md-subtle)]">{item.time}</span>
                </div>
              )
            }}
          />
        </div>
      ) : null}

      {id === "pagination" ? (
        <div className="w-full max-w-[720px]">
          <div className="mb-3 grid gap-2">
            {["Marlow Apparel Ltd", "Bauhaus Importe GmbH", "Black Forest Foods", "Pacific Goods Co", "Mediterranean Spice Trading"].map((customer) => (
              <div key={customer} className="flex h-12 items-center justify-between rounded-[var(--md-radius-lg)] bg-white/55 px-4 shadow-[var(--md-shadow-line)]">
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{customer}</span>
                <span className="text-[12px] text-[var(--md-text)]">Active customer</span>
              </div>
            ))}
          </div>
          <Pagination
            page={previewPage}
            pageCount={Math.max(Math.ceil(customers.length / previewPageSize), 1)}
            totalItems={customers.length}
            pageSize={previewPageSize}
            pageSizeOptions={[10, 20, 30, 50]}
            itemLabel="customers"
            onPageChange={setPreviewPage}
            onPageSizeChange={(nextPageSize) => {
              setPreviewPageSize(nextPageSize)
              setPreviewPage(1)
            }}
          />
        </div>
      ) : null}

      {id === "world-clock" ? (
        <div className="grid w-full max-w-[760px] gap-3">
          <div className="grid gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 shadow-[var(--md-shadow-line)] sm:grid-cols-4">
            {cityQueues.slice(0, 4).map((city, index) => (
              <WorldClockCell key={city.code} city={city} selected={index === 0} onSelect={() => undefined} now={previewNow} />
            ))}
          </div>
          <div className="grid gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 shadow-[var(--md-shadow-line)] sm:grid-cols-2">
            {cityQueues.slice(4, 8).map((city, index) => (
              <WorldClockCell key={city.code} city={city} selected={index === 0} onSelect={() => undefined} now={previewNow} displayMode="analogue" />
            ))}
          </div>
        </div>
      ) : null}

      {id === "timezone-work-queue" ? (
        <div className="w-full max-w-[1180px]">
          <TimezoneFocusPanel selectedCode="SHA" />
        </div>
      ) : null}

      {id === "queue-row" ? (
        <Surface className="w-full max-w-[680px]">
          <Table>
            <TableBody>
              {customsQueue.map((item) => (
                <QueueRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        </Surface>
      ) : null}

      {id === "customer-avatar" ? (
        <div className="flex w-full max-w-[680px] items-end justify-center gap-[var(--md-gap-xl)] rounded-[var(--md-radius-xl)] bg-white/55 p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <CustomerAvatar initials="MA" tone="olive" size="lg" />
          <CustomerAvatar initials="BI" tone="blue" />
          <CustomerAvatar initials="PG" tone="teal" />
          <CustomerAvatar initials="NH" tone="cream" size="sm" />
        </div>
      ) : null}

      {id === "customer-metric-card" ? (
        <div className="grid w-full max-w-[920px] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {marlowMetrics.slice(0, 3).map((metric) => (
            <CustomerMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}

      {id === "contact-profile" ? (
        <div className="w-full max-w-[820px]">
          <ContactProfileModule contact={marlowContacts[0]} />
        </div>
      ) : null}

      {id === "primary-contacts-panel" ? (
        <div className="w-full max-w-[760px]">
          <PrimaryContactsPanel
            selectedContact={marlowContacts.find((contact) => contact.email === previewContactEmail)}
            onSelectContact={(contact) => setPreviewContactEmail(contact.email)}
          />
        </div>
      ) : null}

      {id === "date-range-picker" ? (
        <div className="grid w-full max-w-[560px] gap-3 rounded-[var(--md-radius-xl)] bg-white/54 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">Collection dates</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">A paired date range using one selector and highlighted in-between days.</p>
          </div>
          <MultideckDateRangePicker
            value={previewDateRange}
            onChange={setPreviewDateRange}
            placeholder="Select collection dates"
            title="Collection dates"
            description="Pick when cargo is ready, then the requested collection date."
            startLabel="Cargo ready from"
            endLabel="Requested collection date"
            footerLabel="Selected collection dates"
          />
        </div>
      ) : null}

      {id === "segmented-control" ? (
        <div className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-white/50 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <SegmentedControl options={bookingViewModes} value={previewBookingView} onChange={setPreviewBookingView} />
        </div>
      ) : null}

      {id === "multi-select-menu" ? (
        <div className="grid min-h-[280px] w-full max-w-[520px] place-items-center rounded-[var(--md-radius-xl)] bg-white/55 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="grid w-full max-w-[320px] gap-2">
            <span className="text-[12px] font-medium text-[var(--md-text)]">Transport modes</span>
            <MultiSelectMenu
              value={previewTransportModes}
              options={["Sea FCL", "Sea LCL", "Air", "Road", "Rail"]}
              onValueChange={setPreviewTransportModes}
              placeholder="Select transport modes"
              label="Transport modes"
            />
          </div>
        </div>
      ) : null}

      {id === "page-settings-menu" ? (
        <div className="flex w-full max-w-[720px] flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-xl)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]">
          <SegmentedControl options={customerScopeTabs} value="All customers" onChange={() => undefined} />
          <div className="flex items-center gap-2">
            <PageSettingsMenu
              viewOptions={customerViewOptions}
              value={previewCustomerView}
              onViewChange={setPreviewCustomerView}
              actions={[{ id: "preview-export-customers", label: "Export CSV", icon: Download, onSelect: () => toast.success("Customer CSV prepared") }]}
            />
            <PageSettingsMenu
              viewOptions={bookingViewOptions}
              value={previewBookingView}
              onViewChange={setPreviewBookingView}
            />
          </div>
        </div>
      ) : null}

      {id === "filter-chips" ? (
        <div className="w-full max-w-[980px]">
          <FilterChips
            options={bookingFilters}
            activeOption={previewBookingFilter}
            onChange={setPreviewBookingFilter}
            auxiliaryOptions={["+ Mode", "+ Carrier", "+ Customer", "+ Owner", "+ ETA range"]}
          />
        </div>
      ) : null}

      {id === "data-table" ? (
        <div className="w-full max-w-[1120px] overflow-x-auto md-scrollbar">
          <DataTable
            columns={previewChargeColumns}
            rows={previewChargeRows}
            getRowKey={(row) => row.id}
            storageKey="gallery-charge-table"
            ariaLabel="Quote charges preview"
          />
        </div>
      ) : null}

      {id === "unified-quote-charges-workspace" ? (
        <div className="w-full max-w-[1320px]">
          <UnifiedQuoteChargesWorkspace rows={previewUnifiedChargeRows} onRowsChange={setPreviewUnifiedChargeRows} storageKey="gallery-unified-quote-charges" />
        </div>
      ) : null}

      {id === "quote-search-builder" ? (
        <div className="w-full max-w-[1120px]">
          <QuoteSearchBuilder
            value={previewQuoteSearch}
            onChange={setPreviewQuoteSearch}
          />
        </div>
      ) : null}

      {id === "warehouse-table" ? (
        <div className="grid w-full max-w-[1120px] gap-3 overflow-x-auto md-scrollbar">
          <WarehouseProductsTable rows={warehouseProducts.slice(0, 4)} />
          <WarehouseOrdersTable rows={warehouseOrders.slice(0, 3)} />
          <WarehouseStockTable rows={warehouseStockRows.slice(0, 3)} />
        </div>
      ) : null}

      {id === "warehouse-form-field" ? (
        <div className="grid w-full max-w-[520px] gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <WarehouseFormField label="Facility code" htmlFor="gallery-facility-code" required hint="A short unique code, e.g. FXT-DC1.">
            <Input id="gallery-facility-code" dir="ltr" defaultValue="FXT-DC1" className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]" />
          </WarehouseFormField>
          <WarehouseFormField label="Facility type" required>
            <Select defaultValue="bonded">
              <SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                <SelectItem value="bonded" className="text-[13px]">Bonded warehouse</SelectItem>
                <SelectItem value="dc" className="text-[13px]">Distribution centre</SelectItem>
              </SelectContent>
            </Select>
          </WarehouseFormField>
          <WarehouseFormField label="Country code" htmlFor="gallery-country" error="Country code must be a 2-letter ISO code.">
            <Input id="gallery-country" dir="ltr" defaultValue="GBR" className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]" />
          </WarehouseFormField>
        </div>
      ) : null}

      {id === "warehouse-kanban-board" ? (
        <div className="w-full max-w-[1120px] overflow-x-auto md-scrollbar">
          <WarehouseKanbanBoardPreview />
        </div>
      ) : null}

      {id === "geo-panel" ? (
        <div className="w-full max-w-[980px]">
          <CustomerFootprintMap customers={customers.slice(0, 3)} onOpenCustomer={() => undefined} />
        </div>
      ) : null}

      {id === "record-header" ? (
        <div className="w-full max-w-[980px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <CustomerDetailHero />
          <CustomerMetricsGrid />
        </div>
      ) : null}

      {id === "tabs" ? (
        <div className="w-full max-w-[920px] rounded-[var(--md-radius-xl)] bg-white/55 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <TabsRail
            tabs={[
              { label: "Overview" },
              { label: "Contacts", value: "4" },
              { label: "Bookings", value: "6 active" },
              { label: "Documents", value: "94" },
              { label: "Activity" },
            ]}
            activeTab={previewCustomerTab}
            onChange={setPreviewCustomerTab}
          />
        </div>
      ) : null}

      {id === "active-bookings-panel" ? (
        <div className="w-full max-w-[980px]">
          <ActiveBookingsPanel />
        </div>
      ) : null}

      {id === "lane-mix-panel" ? (
        <div className="w-full max-w-[760px]">
          <LaneMixPanel />
        </div>
      ) : null}

      {id === "booking-metric-card" ? (
        <div className="grid w-full max-w-[760px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bookingMetrics.slice(0, 3).map((metric) => (
            <BookingMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}

      {id === "your-jobs-panel" ? (
        <div className="w-full max-w-[1120px]">
          <YourJobsPanel
            favouriteIds={previewFavouriteBookingIds}
            onToggleFavourite={togglePreviewFavouriteBooking}
            onOpenJobDrilldown={(jobId) => toast.success(`${jobId} opened`)}
            animated
          />
        </div>
      ) : null}

      {id === "booking-advanced-search" ? (
        <div className="w-full max-w-[1120px]">
          <BookingAdvancedSearch
            criteria={previewBookingSearchCriteria}
            onCriteriaChange={setPreviewBookingSearchCriteria}
            resultCount={previewBookingSearchCount}
            totalCount={bookings.length}
          />
        </div>
      ) : null}

      {id === "bookings-table" ? (
        <div className="w-full max-w-[1120px] overflow-x-auto md-scrollbar">
          <BookingsTable
            rows={bookings.slice(0, 4)}
            selectedIds={previewBookingSelectedIds}
            favouriteIds={previewFavouriteBookingIds}
            onToggleBooking={togglePreviewBooking}
            onToggleFavourite={togglePreviewFavouriteBooking}
            onOpenBooking={(booking) => toast.success(`${booking.id} opened`)}
          />
        </div>
      ) : null}

      {id === "booking-board-preview" ? (
        <div className="w-full max-w-[980px]">
          <BookingBoardPreview onOpenBooking={(booking) => toast.success(`${booking.id} opened`)} />
        </div>
      ) : null}

      {id === "domestic-job-stage-rail" ? (
        <div className="w-full max-w-[1120px]">
          <DomesticJobStageRail stages={roadJobStages} activeStage="ready" onStageChange={(stage) => toast.success(`${stage} selected`)} />
        </div>
      ) : null}

      {id === "domestic-road-job-card" ? (
        <div className="grid w-full max-w-[980px] gap-2.5">
          {[domesticRoadJobs[2], domesticRoadJobs[0]].map((job) => (
            <DomesticRoadJobCard
              key={job.id}
              job={job}
              favourite={previewRoadFavouriteBookingIds.has(job.bookingId)}
              onToggleFavourite={() => setPreviewRoadFavouriteBookingIds((current) => {
                const next = new Set(current)
                if (next.has(job.bookingId)) next.delete(job.bookingId)
                else next.add(job.bookingId)
                return next
              })}
              onOpenBooking={(roadJob) => toast.success(`${roadJob.bookingId} opened`)}
            />
          ))}
        </div>
      ) : null}

      {id === "domestic-road-kanban-board" ? (
        <div className="w-full overflow-hidden">
          <DomesticRoadKanbanBoard
            jobs={previewRoadJobs}
            favouriteIds={previewRoadFavouriteBookingIds}
            onMoveJob={(jobId, stage) => setPreviewRoadJobs((current) => current.map((job) => job.id === jobId && job.stage !== stage ? { ...job, stage, ...roadJobStageStatus[stage] } : job))}
            onToggleFavourite={(job) => setPreviewRoadFavouriteBookingIds((current) => {
              const next = new Set(current)
              if (next.has(job.bookingId)) next.delete(job.bookingId)
              else next.add(job.bookingId)
              return next
            })}
            onOpenBooking={(job) => toast.success(`${job.bookingId} opened`)}
          />
        </div>
      ) : null}

      {id === "report-template-card" ? (
        <div className="grid w-full max-w-[860px] gap-4 md:grid-cols-2">
          <ReportTemplateCard
            template={reportTemplates[0]}
            onRun={(template) => toast.success(`${template.title} started`)}
            onEdit={(template) => toast.success(`${template.title} opened`)}
          />
          <NewReportTemplateCard onCreate={() => toast.success("Blank template created")} />
        </div>
      ) : null}

      {id === "generated-report-table" ? (
        <div className="md-scrollbar w-full min-w-0 max-w-full overflow-x-auto rounded-[var(--md-radius-xl)] pb-1">
          <GeneratedReportsTable
            reports={generatedReports.slice(0, 4)}
            onView={(report) => toast.success(`${report.title} opened`)}
            onDownload={(report) => toast.success(`${report.title} prepared`)}
          />
        </div>
      ) : null}

      {id === "report-document-page" ? (
        <div className="w-full max-w-[560px]">
          <ReportDocumentPage page={monthlyReviewPages[0]} totalPages={monthlyReviewPages.length} className="max-w-[520px]" />
        </div>
      ) : null}

      {id === "report-thumbnail-rail" ? (
        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[rgba(251,253,253,0.36)] p-4 shadow-[var(--md-shadow-line)]">
          <ReportPageThumbnailRail pages={monthlyReviewPages} activePageId={previewReportPageId} onChange={setPreviewReportPageId} className="max-w-full lg:h-auto lg:w-full lg:flex-row lg:overflow-x-auto" />
        </div>
      ) : null}

      {id === "report-page-controls" ? (
        <div className="flex w-full max-w-[620px] items-center justify-center rounded-[var(--md-radius-xl)] bg-white/55 p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <ReportPageControls
            page={previewReportControlPage}
            totalPages={monthlyReviewPages.length}
            onPrevious={() => setPreviewReportControlPage((page) => Math.max(page - 1, 1))}
            onNext={() => setPreviewReportControlPage((page) => Math.min(page + 1, monthlyReviewPages.length))}
          />
        </div>
      ) : null}

      {id === "report-widget-palette" ? (
        <div className="h-[620px] w-full max-w-[470px] overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]">
          <ReportWidgetPalette
            widgets={reportWidgets}
            query={previewWidgetQuery}
            onQueryChange={setPreviewWidgetQuery}
            activeWidgetId={previewWidgetId}
            onAddWidget={(widget) => {
              setPreviewWidgetId(widget.id)
              toast.success(`${widget.title} selected`)
            }}
          />
        </div>
      ) : null}

      {id === "report-data-editor" ? (
        <div className="grid w-full max-w-[620px] place-items-center rounded-[var(--md-radius-xl)] bg-white/45 p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <div className="w-full max-w-[420px] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
            <p className="text-[14px] font-medium text-[var(--md-ink)]">Graph data picker</p>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">Used after a graph is dropped into a report or manual dashboard.</p>
            <Button type="button" className="mt-4 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--md-accent)]/88" onClick={() => setPreviewDataEditorOpen(true)}>
              Open data editor
            </Button>
          </div>
          <ReportBlockDataEditorDialog
            block={monthlyReviewPages[1].blocks[1]}
            open={previewDataEditorOpen}
            onOpenChange={setPreviewDataEditorOpen}
            onSave={(block) => toast.success(`${block.title} preview updated`)}
          />
        </div>
      ) : null}

      {id === "booking-arrival-card" ? (
        <div className="w-full max-w-[860px]">
          <BookingArrivalCard />
        </div>
      ) : null}

      {id === "booking-exception-panel" ? (
        <div className="w-full max-w-[860px]">
          <BookingExceptionPanel />
        </div>
      ) : null}

      {id === "booking-checklist" ? (
        <div className="w-full max-w-[680px]">
          <BookingResolutionChecklist />
        </div>
      ) : null}

      {id === "booking-ask-panel" ? (
        <div className="h-[620px] w-full max-w-[380px]">
          <BookingAskPanel />
        </div>
      ) : null}

      {id === "dexter-prompt-composer" ? (
        <div className="w-full max-w-[760px]">
          <DexterPromptComposer
            value={previewDexterPrompt}
            selectedSpecialist={previewDexterSpecialist}
            attachments={previewDexterAttachments}
            onChange={setPreviewDexterPrompt}
            onOpenAttachments={() => toast.success("Attachment palette opened")}
            onOpenSpecialists={() => toast.success("Specialist picker opened")}
            onRemoveAttachment={togglePreviewDexterAttachment}
            onSend={() => toast.success("Dexter conversation started")}
          />
        </div>
      ) : null}

      {id === "dexter-specialist-picker" ? (
        <div className="w-full max-w-[760px]">
          <DexterSpecialistPicker
            specialists={defaultDexterSpecialists}
            selectedId={previewDexterSpecialistId}
            onSelect={setPreviewDexterSpecialistId}
          />
        </div>
      ) : null}

      {id === "dexter-specialist-menu" ? (
        <div className="w-full max-w-[760px] rounded-[var(--md-radius-xl)] bg-[rgba(11,20,19,0.16)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)] backdrop-blur-md">
          <DexterSpecialistMenu
            specialists={defaultDexterSpecialists}
            selectedId={previewDexterSpecialistId}
            onSelect={setPreviewDexterSpecialistId}
          />
        </div>
      ) : null}

      {id === "dexter-attachment-palette" ? (
        <div className="w-full max-w-[860px]">
          <DexterAttachmentPalette
            query={previewDexterAttachmentQuery}
            items={defaultDexterAttachments}
            selectedIds={previewDexterAttachmentIds}
            recommendedIds={["marlow", "md-22414", "ci-rev2"]}
            onQueryChange={setPreviewDexterAttachmentQuery}
            onToggle={togglePreviewDexterAttachment}
          />
        </div>
      ) : null}

      {id === "dexter-history-list" ? (
        <div className="h-[560px] w-full max-w-[340px] overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]">
          <DexterHistoryList
            items={[
              { id: "customs-risk", title: "At-risk customs this week", summary: "4 flagged - drafts ready for review", time: "11:42" },
              { id: "marlow-qbr", title: "Marlow Apparel - QBR prep", summary: "Snapshot, talking points, agenda draft", time: "10:05" },
              { id: "daily", title: "Daily briefing - 11 Jun", summary: "Quiet night. 23 in transit, 2 need you.", time: "07:00" },
            ]}
            activeId="customs-risk"
            onSelect={(itemId) => toast.success(`${itemId} opened`)}
            onNew={() => toast.success("New Dexter thread")}
          />
        </div>
      ) : null}

      {id === "dexter-monitor-card" ? (
        <div className="w-full max-w-[420px]">
          <DexterMonitorCard
            monitor={{
              title: "Berth queue - MD-22479",
              body: "Watching Rotterdam congestion. Re-pings if ETA shifts more than 6h.",
              meta: "since Wed 09:18",
              detail: "last ping 36 min ago",
              tone: "amber",
            }}
          />
        </div>
      ) : null}

      {id === "dexter-monitor-detail" ? (
        <div className="relative h-[720px] w-full max-w-[980px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] shadow-[var(--md-shadow-line)]">
          <div className="absolute inset-0 grid place-items-center bg-[rgba(11,20,19,0.2)] text-[13px] text-white backdrop-blur-[6px]">
            Thread content blurred behind the drawer
          </div>
          <div className="absolute inset-y-0 right-0 w-[min(580px,100%)]">
            <DexterMonitorDetailSheet
              monitor={{
                title: "Berth queue - MD-22479",
                body: "Watching Rotterdam congestion. Re-pings if ETA shifts more than 6h.",
                meta: "since Wed 09:18",
                detail: "last ping 36 min ago",
                tone: "amber",
              }}
              floating={false}
              onClose={() => toast.success("Monitor detail closed")}
            />
          </div>
        </div>
      ) : null}

      {id === "dexter-response-blocks" ? (
        <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-2">
          <div className="grid gap-4">
            <DexterCustomerSnapshot />
            <DexterChecklistCard
              items={[
                { label: "Pull open bookings arriving this week - 23 found.", done: true },
                { label: "Cross-check HS codes against active regulations.", done: true },
                { label: "Draft notifications for approval." },
              ]}
            />
          </div>
          <DexterRiskTable />
        </div>
      ) : null}

      {id === "side-panels" ? (
        <div className="grid w-full max-w-[980px] gap-[var(--md-page-stack-gap)] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
            <CustomerActivityPanel />
          </div>
          <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
            <DexterPulsePanel />
            <AccountPanel />
          </div>
        </div>
      ) : null}

      {id === "crm-sales-command-center" ? (
        <div className="w-full max-w-[1120px]">
          <CrmSalesCommandCenter />
        </div>
      ) : null}

      {id === "crm-metrics-grid" ? (
        <div className="w-full max-w-[980px]">
          <CrmMetricsGrid metrics={crmSummaryMetrics} />
        </div>
      ) : null}

      {id === "crm-sales-funnel-panel" ? (
        <div className="w-full max-w-[680px]">
          <CrmSalesFunnelPanel />
        </div>
      ) : null}

      {id === "crm-revenue-mix-panel" ? (
        <div className="w-full max-w-[680px]">
          <CrmRevenueMixPanel />
        </div>
      ) : null}

      {id === "crm-forecast-panel" ? (
        <div className="w-full max-w-[680px]">
          <CrmForecastPanel />
        </div>
      ) : null}

      {id === "crm-priority-actions-panel" ? (
        <div className="w-full max-w-[760px]">
          <CrmPriorityActionsPanel />
        </div>
      ) : null}

      {id === "crm-pipeline-board" ? (
        <div className="w-full max-w-[1180px]">
          <CrmPipelineBoard
            selectedDealId={previewCrmDealId}
            onSelectDeal={(deal) => setPreviewCrmDealId(deal.id)}
          />
        </div>
      ) : null}

      {id === "crm-asset-folder-card" ? (
        <div className="grid w-full max-w-[980px] gap-3 md:grid-cols-3">
          {previewMarketingFolders.map((folder) => (
            <CrmAssetFolderCard
              key={folder.id}
              folder={folder}
              selected={folder.id === previewMarketingFolderId}
              onSelect={(nextFolder) => setPreviewMarketingFolderId(nextFolder.id)}
            />
          ))}
        </div>
      ) : null}

      {id === "crm-asset-row" ? (
        <div className="w-full max-w-[920px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)]">
          <div className="grid gap-1 rounded-[var(--md-radius-lg)] bg-white/62 p-1 shadow-[var(--md-shadow-line)]">
            {previewMarketingAssets.map((asset) => (
              <CrmAssetRow
                key={asset.id}
                asset={asset}
                onOpen={(selectedAsset) => toast.success(`${selectedAsset.name} opened`)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {id === "crm-contact-table" ? (
        <div className="w-full max-w-[1120px]">
          <CrmContactTable
            contacts={crmContacts}
            selectedEmail={previewCrmContactEmail}
            onSelectContact={(contact) => setPreviewCrmContactEmail(contact.email)}
          />
        </div>
      ) : null}

      {id === "crm-lead-detail-panel" ? (
        <div className="grid w-full max-w-[980px] gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <div className="px-5 py-4">
              <SectionHeader title="Lead selector" meta="pick a lead to inspect the detail panel" />
            </div>
            <div className="px-5 pb-5">
              <div className="grid gap-2">
                {customers.slice(0, 4).map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={cn(
                      "grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] bg-white/55 px-3 py-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/80",
                      previewCrmLeadId === customer.id && "bg-white shadow-[inset_0_0_0_1px_rgba(14,125,116,0.24),0_0_0_3px_rgba(14,125,116,0.08)]",
                    )}
                    onClick={() => setPreviewCrmLeadId(customer.id)}
                  >
                    <CustomerAvatar initials={customer.initials} tone={customer.avatarTone} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{customer.name}</span>
                      <span className="block truncate text-[12px] text-[var(--md-text)]">{customer.location}</span>
                    </span>
                    <StatusPill tone={customer.status === "Premium" ? "teal" : customer.status === "Trial" ? "amber" : "neutral"}>{customer.status}</StatusPill>
                  </button>
                ))}
              </div>
            </div>
          </Surface>
          <CrmLeadDetailPanel
            lead={previewCrmLead}
            onOpenCustomer={(lead) => toast.success(`${lead.name} opened in Customers`)}
            onConvertToCustomer={(lead) => toast.success(`${lead.name} moved to Customers`)}
          />
        </div>
      ) : null}

      {id === "crm-activity-timeline" ? (
        <div className="w-full max-w-[860px]">
          <CrmActivityTimeline activities={crmActivities} />
        </div>
      ) : null}

      {id === "crm-lead-signals" ? (
        <div className="w-full max-w-[760px]">
          <CrmLeadSignalList signals={crmAccountSignals} onOpenLead={(signal) => toast.success(`${signal.account} opened`)} />
        </div>
      ) : null}

      {id === "crm-settings-builder" ? (
        <div className="w-full max-w-[1180px]">
          <CrmSettingsBuilder />
        </div>
      ) : null}

      {id === "settings-rail" ? (
        <div className="w-full max-w-[340px] overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]">
          <SettingsRail
            groups={settingsPreviewGroups}
            activeTab={previewSettingsTab}
            onChange={setPreviewSettingsTab}
            onBack={() => undefined}
            className="min-h-0"
          />
        </div>
      ) : null}

      {id === "settings-panel-row" ? (
        <div className="w-full max-w-[820px]">
          <SettingsPanel title="Working schedule" description="Used to schedule notifications, AI digest delivery, and out-of-hours escalation.">
            <SettingsFieldRow label="Time zone">
              <SettingsInput value="Europe/Berlin - UTC+1" readOnly />
            </SettingsFieldRow>
            <SettingsFieldRow label="Working hours" description="Dexter will not send non-critical pings outside these hours.">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <SettingsInput value="08:00" readOnly />
                <span className="text-center text-[13px] text-[var(--md-text)]">to</span>
                <SettingsInput value="18:30" readOnly />
              </div>
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
      ) : null}

      {id === "settings-integration-row" ? (
        <div className="w-full max-w-[820px]">
          <SettingsPanel title="Connected tools" description="Personal accounts Multideck can use for drafts, reminders, files, and approved updates.">
            <SettingsIntegrationRow
              icon={Mail}
              title="Gmail"
              description="Connect your Google inbox for customer replies, quote follow-ups, and approved Dexter drafts."
              status="Ready"
              statusTone="ready"
              actionLabel="Connect"
              onAction={() => toast.success("Gmail connection flow opened")}
            />
            <SettingsIntegrationRow
              icon={Cloud}
              title="Google Drive"
              description="Attach folders for invoices, packing lists, customer reports, and onboarding documents."
              status="Connected"
              statusTone="connected"
              actionLabel="Manage"
              onAction={() => toast.success("Google Drive settings opened")}
            />
          </SettingsPanel>
        </div>
      ) : null}

      {id === "settings-controls" ? (
        <div className="w-full max-w-[820px]">
          <SettingsPanel title="Approval rule" description="Compact controls for repeated settings rows.">
            <SettingsFieldRow label="Outbound emails to customers">
              <SettingsChoiceGroup
                options={["Always ask", "Ask if > EUR 1k impact", "Never ask"]}
                value={previewSettingsChoice}
                onChange={setPreviewSettingsChoice}
              />
            </SettingsFieldRow>
            <SettingsFieldRow label="Display name">
              <SettingsInput defaultValue="Elena Moreno - Northwind Forwarding" />
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
      ) : null}

      {id === "settings-option-card" ? (
        <div className="grid w-full max-w-[920px] gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Off", "No background agents. Manual chats only."],
            ["Manual", "Dexter answers when asked. Never acts."],
            ["Suggest", "Drafts and proposes. Always asks before sending or changing data."],
            ["Autopilot", "Acts within your rules for low-risk changes."],
          ].map(([label, description]) => (
            <SettingsOptionCard
              key={label}
              label={label}
              description={description}
              selected={previewSettingsOption === label}
              onClick={() => setPreviewSettingsOption(label)}
            />
          ))}
        </div>
      ) : null}

      {id === "settings-summary-card" ? (
        <div className="w-full max-w-[380px]">
          <SettingsSummaryCard
            title="At a glance"
            rows={[
              ["Member since", "Jan 2024"],
              ["Bookings handled", "1,847"],
              ["Active boards", "3"],
              ["Role", "Admin - Ops"],
            ]}
            actionLabel="Review"
          />
        </div>
      ) : null}

      {id === "auth-narrative-panel" ? (
        <div className="relative h-[520px] w-full max-w-[620px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[#062420] shadow-[var(--md-shadow-line)]">
          <div className="absolute left-1/2 top-0 h-[900px] w-[860px] origin-top -translate-x-1/2 scale-[0.56]">
            <FreightNarrative step="signin" componentPreview className="min-h-[900px] w-[860px]" />
          </div>
        </div>
      ) : null}

      {id === "auth-sign-in-panel" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <SignInPanel
            email={previewAuthEmail}
            onEmailChange={setPreviewAuthEmail}
          />
        </div>
      ) : null}

      {id === "auth-workspace-router" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <WorkspaceRouterPanel
            initialWorkspace="dev"
            workspaces={[{ slug: "example", name: "Example company" }]}
            onContinue={(workspace) => toast.success(`${workspace}.multideck.app selected`)}
          />
        </div>
      ) : null}

      {id === "auth-provider-selector" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <AuthProviderSelector onSelect={(provider) => { toast.success(`${provider} sign-in selected`) }} />
        </div>
      ) : null}

      {id === "auth-identity-manager" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <AuthIdentityManager preview />
        </div>
      ) : null}

      {id === "auth-verification-panel" ? (
        <div className="w-full max-w-[680px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <VerifyPanel
            email={previewAuthEmail}
            code={previewAuthCode}
            onCodeChange={setPreviewAuthCode}
            onBack={() => undefined}
            onComplete={() => undefined}
          />
        </div>
      ) : null}

      {id === "auth-code-input" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <CodeInput code={previewAuthCode} onCodeChange={setPreviewAuthCode} onComplete={() => undefined} />
        </div>
      ) : null}

      {id === "auth-signed-out-panel" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-[var(--md-page-section-gap)] shadow-[var(--md-shadow-line)]">
          <SignedOutPanel onSignBackIn={() => undefined} onSwitchAccount={() => setPreviewAuthEmail("")} />
        </div>
      ) : null}
    </div>
  )
}

function GallerySidebar({
  query,
  setQuery,
  activeSection,
  setActiveSection,
  selectedId,
  setSelectedId,
  filtered,
}: {
  query: string
  setQuery: (value: string) => void
  activeSection: string
  setActiveSection: (value: string) => void
  selectedId: string
  setSelectedId: (value: string) => void
  filtered: typeof galleryComponents
}) {
  const groupedComponents = useMemo(() => groupGalleryComponents(filtered), [filtered])

  return (
    <aside className="sticky top-[84px] hidden h-[calc(100vh-108px)] min-h-0 lg:block">
      <ScrollArea className="h-full pr-4">
        <div className="flex flex-col gap-[var(--md-page-section-gap)]">
          <div>
            <p className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">Sections</p>
            <nav className="mt-3 flex flex-col gap-1">
              {sectionLinks.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "h-8 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/45 hover:text-[var(--md-ink)]",
                    activeSection === item && "bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                  )}
                  onClick={() => setActiveSection(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div>
            <p className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">Components</p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.2} />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter components..."
                className="h-9 rounded-[var(--md-radius-md)] border-0 bg-white/60 pl-9 text-[13px] shadow-[var(--md-shadow-line)]"
              />
            </div>
            <nav className="mt-[var(--md-gap-md)] flex flex-col gap-[var(--md-page-stack-gap)]" aria-label="Component groups">
              {groupedComponents.length > 0 ? (
                groupedComponents.map((group, groupIndex) => (
                  <section key={group.label} className={cn("border-t border-[rgba(11,20,19,0.07)] pt-4", groupIndex === 0 && "border-t-0 pt-0")}>
                    <div className="mb-2 flex items-end justify-between gap-3 px-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[12px] font-medium text-[var(--md-ink)]">{group.label}</h3>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]">{group.helper}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/45 px-2 py-0.5 text-[10.5px] font-medium text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">{group.components.length}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.components.map((component) => {
                        const Icon = galleryIcons[component.id as GalleryIconKey] ?? Component
                        return (
                          <button
                            key={component.id}
                            type="button"
                            className={cn(
                              "flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/45 hover:text-[var(--md-ink)]",
                              selectedId === component.id && "bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                            )}
                            onClick={() => {
                              setActiveSection("Components")
                              setSelectedId(component.id)
                            }}
                          >
                            <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} />
                            <span className="truncate">{component.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))
              ) : (
                <div className="rounded-[var(--md-radius-lg)] bg-white/45 px-3 py-4 text-[13px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                  No components match that filter.
                </div>
              )}
            </nav>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

function RightRail({ selected }: { selected: (typeof galleryComponents)[number] }) {
  return (
    <aside className="sticky top-[84px] hidden h-[calc(100vh-108px)] min-h-0 xl:block">
      <ScrollArea className="h-full pl-4">
        <div className="flex flex-col gap-[var(--md-page-section-gap)]">
          <div>
            <p className="text-[12px] font-medium text-[var(--md-text)]">On This Page</p>
            <nav className="mt-4 flex flex-col gap-3">
              {rightRail.map((item) => (
                <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} className="text-[13px] font-medium text-[var(--md-subtle)] hover:text-[var(--md-ink)]">
                  {item}
                </a>
              ))}
            </nav>
          </div>

          <Surface tone="soft" padding="md" className="rounded-[var(--md-radius-xl)]">
            <p className="text-[15px] font-medium leading-5 text-[var(--md-ink)]">Component contract</p>
            <p className="mt-3 text-[13px] leading-6 text-[var(--md-text)]">
              {selected.name} should stay token-led, composable, and usable inside dense operational screens.
            </p>
            <Button variant="ghost" className="mt-[var(--md-page-stack-gap)] h-9 rounded-[var(--md-radius-md)] bg-white/50 px-3 text-[13px] shadow-[var(--md-shadow-line)]">
              View source
            </Button>
          </Surface>
        </div>
      </ScrollArea>
    </aside>
  )
}

export function ComponentsGalleryPage() {
  const [activeSection, setActiveSection] = useState(getInitialSection)
  const [selectedId, setSelectedId] = useState(getInitialComponentId)
  const [query, setQuery] = useState("")
  const selected = galleryComponents.find((component) => component.id === selectedId) ?? galleryComponents[0]
  const SelectedIcon = galleryIcons[selected.id as GalleryIconKey] ?? Component
  const selectedIndex = galleryComponents.findIndex((component) => component.id === selected.id)

  const filtered = useMemo(() => {
    return galleryComponents.filter((component) => `${component.name} ${component.description} ${component.category}`.toLowerCase().includes(query.toLowerCase()))
  }, [query])

  function moveSelection(direction: -1 | 1) {
    const nextIndex = (selectedIndex + direction + galleryComponents.length) % galleryComponents.length
    setSelectedId(galleryComponents[nextIndex].id)
  }

  return (
    <div className="grid gap-[var(--md-page-section-gap)] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,880px)_260px]">
      <GallerySidebar
        query={query}
        setQuery={setQuery}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        filtered={filtered}
      />

      <main className="min-w-0 overflow-hidden pb-[var(--md-page-bottom-pad)]">
        {activeSection === "Introduction" ? (
          <section id="introduction">
            <div className="max-w-[760px]">
              <p className="text-[12px] font-medium text-[var(--md-subtle)]">Introduction</p>
              <h1 className="mt-3 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Multideck component system</h1>
              <p className="mt-3 text-[15px] leading-7 text-[var(--md-text)]">
                This page is the working library for the Multideck interface. It shows the reusable product pieces reps should use when building, explaining, or reviewing freight workflows, so every screen feels calm, consistent, and ready for real operators.
              </p>
            </div>

            <Surface padding="lg" className="mt-[var(--md-page-stack-gap)] rounded-[var(--md-radius-xl)]">
              <div className="grid gap-[var(--md-page-stack-gap)] md:grid-cols-3">
                {introNotes.map((item) => (
                  <div key={item.title}>
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">{item.title}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{item.body}</p>
                  </div>
                ))}
              </div>
            </Surface>
          </section>
        ) : null}

        {activeSection === "Components" ? (
          <>
            <div id="components" className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-[720px]">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)]">
                  <SelectedIcon className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
                  <span>{selected.category}</span>
                </div>
                <h1 className="mt-4 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{selected.name}</h1>
                <p className="mt-3 text-[16px] leading-7 text-[var(--md-text)]">{selected.description}</p>
                <FoundOnLinks links={selected.foundOn} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <CopyButton value={selected.componentCode} />
                <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-lg)] bg-white/50 shadow-[var(--md-shadow-line)]" onClick={() => moveSelection(-1)}>
                  <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-lg)] bg-white/50 shadow-[var(--md-shadow-line)]" onClick={() => moveSelection(1)}>
                  <ArrowRight data-icon="inline-start" strokeWidth={1.2} />
                </Button>
              </div>
            </div>

            <Tabs defaultValue="preview" className="mt-[var(--md-page-section-gap)]">
              <TabsList variant="line" className="h-10 rounded-none bg-transparent p-0">
                <TabsTrigger value="preview" className={galleryTabTriggerClass}>
                  Preview
                </TabsTrigger>
                <TabsTrigger value="code" className={galleryTabTriggerClass}>
                  Code
                </TabsTrigger>
                <TabsTrigger value="usage" className={galleryTabTriggerClass}>
                  Usage
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" id="preview" className="mt-[var(--md-page-stack-gap)]">
                <Surface padding="lg" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
                  <ComponentPreview id={selected.id} />
                </Surface>
              </TabsContent>

              <TabsContent value="code" id="code" className="mt-[var(--md-page-stack-gap)]">
                <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
                  <CodeBlock code={selected.componentCode} />
                </Surface>
              </TabsContent>

              <TabsContent value="usage" id="usage" className="mt-[var(--md-page-stack-gap)]">
                <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
                  <CodeBlock code={selected.usageCode} />
                </Surface>
              </TabsContent>
            </Tabs>

            <section id="purpose" className="mt-[var(--md-page-section-gap)]">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Purpose</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">{selected.description}</p>
            </section>

            <section id="usage" className="mt-[var(--md-page-section-gap)]">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Usage</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">{selected.details}</p>
            </section>

            <section id="token-dependency" className="mt-[var(--md-page-section-gap)]">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Token dependency</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">
                Uses shared Multideck color, radius, motion, spacing, and depth variables from `src/styles.css`.
              </p>
            </section>
          </>
        ) : null}
      </main>

      {activeSection === "Components" ? <RightRail selected={selected} /> : null}
    </div>
  )
}
