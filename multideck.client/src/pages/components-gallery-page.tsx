import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { AiBrain, ArrowLeft, ArrowRight, Bell, BrainCircuit, Check, Clipboard, Cloud, Component, Download, Eye, FileText, Folder, Forklift, Home03, Image, KeyRound, Mail, Moon02, Pencil, Pin, Search, Settings2, Ship, Trash2, UserRound } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import toastErrorIcon from "@/assets/toasts/toast-error.png"
import toastGeneralIcon from "@/assets/toasts/toast-general.png"
import toastSuccessIcon from "@/assets/toasts/toast-success.png"
import { Button } from "@/components/ui/button"
import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import {
  RegisterFacetSelect,
  RegisterRefreshButton,
  RegisterSearchField,
  RegisterToolbarActions,
  RegisterToolbarDivider,
  RegisterViewSwitch,
  registerButtonClass,
} from "@/components/multideck/register-toolbar"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { DriveFileTile, DriveFolderTile } from "@/components/multideck/drive-components"
import { accentShiftDurationMs, useAccentPresetId } from "@/lib/accent-theme"
import type { DriveFile, DriveFolder, DriveFolderStats } from "@/lib/drive-api"
import { cn } from "@/lib/utils"
import type { ApiLead, ApiLeadDetail } from "@/lib/lead-api"
import { activityItems, cityQueues, crmAccountSignals, crmActivities, crmContacts, crmLeadFieldSettings, crmPipelineSettings, crmPipelineStages, crmSummaryMetrics, customerFilters, customerScopeTabs, customers, customsQueue, galleryComponents, galleryIcons, generatedReports, initialFavouriteBookingIds, liveBookings, marlowContacts, marlowMetrics, metricCards, quoteAuditEvents, reportTemplates, bookingFilters, bookingMetrics, bookings, warehouseOrders, warehouseProducts, warehouseStockRows } from "@/data/multideck-data"
import { AnimatedList } from "@/components/multideck/animated-list"
import { AppBreadcrumbs } from "@/components/multideck/app-breadcrumbs"
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
import { CrmActivityTimeline, CrmContactTable, CrmForecastPanel, CrmLeadDetailPanel, CrmLeadQualificationTable, CrmLeadSignalList, CrmMetricsGrid, CrmPipelineBoard, CrmPriorityActionsPanel, CrmRevenueMixPanel, CrmSalesCommandCenter, CrmSalesFunnelPanel, CrmSettingsBuilder } from "@/components/multideck/crm-components"
import { CopyableField } from "@/components/multideck/copyable-field"
import { ContactCardLayoutPicker, ContactCardSocialLinksEditor } from "@/components/multideck/contact-card-design"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { AutomationRunHistory } from "@/components/multideck/contact-card-automation"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { CrmPipelineEditor } from "@/components/multideck/crm-pipeline-editor"
import { ChoiceControl, FilterChips, SegmentedControl, TabsRail } from "@/components/multideck/workflow-components"
import { EmailMessageRenderer } from "@/components/multideck/email-message-renderer"
import { EmailDeliveryStatus } from "@/components/multideck/email-delivery-status"
import { InboxThreadRow } from "@/components/multideck/inbox-thread-row"
import { MailboxProviderSwitch } from "@/components/multideck/mailbox-provider-switch"
import { MailComposer, type ComposerState } from "@/components/multideck/mail-composer"
import { ThreadSummary } from "@/components/multideck/thread-summary"
import type { InboxThreadListItem, Mailbox, MailProvider, ThreadSummaryState } from "@/lib/inbox-api"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, TablePillKindContext, toneToVar } from "@/components/multideck/status-pill"
import { ScreeningListFreshness, ScreeningMatchList, ScreeningMatchRow, ScreeningOutcomePill, ScreeningResultSummary } from "@/components/multideck/screening-components"
import { CodeInput, FreightNarrative, SignInPanel, SignedOutPanel, VerifyPanel, WorkspaceRouterPanel } from "@/components/multideck/auth-flow"
import { AuthIdentityManager, AuthProviderSelector } from "@/components/multideck/auth-provider-selector"
import { DashboardPriorityQueue } from "@/components/multideck/dashboard-priority-queue"
import { DashboardPerformancePanel } from "@/components/multideck/dashboard-performance-panel"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { DashboardCoveragePanel } from "@/components/multideck/dashboard-coverage-panel"
import { DashboardBreakdownPanel } from "@/components/multideck/dashboard-breakdown-panel"
import type { DashboardKpi, DashboardPriorityItem, DashboardTrendPoint } from "@/lib/dashboard-live-data"
import { BookingArrivalCard, BookingAskPanel, BookingBoardPreview, BookingExceptionPanel, BookingMetricCard, BookingResolutionChecklist, BookingsTable, YourJobsPanel, bookingSearchFieldOptions, bookingViewModes, bookingViewOptions, type BookingViewMode } from "@/components/multideck/booking-components"
import { AdvancedFilterPopover } from "@/components/multideck/advanced-filter-popover"
import { DomesticJobStageRail, DomesticRoadJobCard, DomesticRoadKanbanBoard, domesticRoadJobs, roadJobStageStatus, roadJobStages } from "@/components/multideck/domestic-road-components"
import { WarehouseKanbanBoardPreview, WarehouseOrdersTable, WarehouseProductsTable, WarehouseStockTable } from "@/components/multideck/warehouse-components"
import { WarehouseFormField } from "@/components/multideck/warehouse-management-components"
import { WarehouseExceptionSummary, WarehouseObjectSummary, WarehouseQuantityUomField } from "@/components/multideck/warehouse-inventory-workspace"
import { PurchaseOrderLineEditor } from "@/components/multideck/warehouse-purchase-orders-workspace"
import { RateChargeLineEditor } from "@/components/multideck/rate-charge-line-editor"
import { RatePricingRuleControl } from "@/components/multideck/rate-pricing-rule-control"
import type { WarehousePurchaseOrderLine, WarehousePurchaseOrderReference } from "@/lib/warehouse"
import type { WarehouseHandlingUnit, WarehouseInventoryException } from "@/lib/warehouse"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DexterAttachmentPalette,
  DexterChecklistCard,
  DexterCustomerSnapshot,
  DexterHistoryList,
  DexterMonitorCard,
  DexterMonitorDetailSheet,
  DexterModelMenu,
  DexterMentionInput,
  DexterPromptComposer,
  DexterRiskTable,
  DexterRoleMenu,
  DexterSpecialistPicker,
  defaultDexterAttachments,
  defaultDexterSpecialists,
  type DexterAccessMode,
  type DexterMentionItem,
  type DexterSpecialistId,
} from "@/components/multideck/agent-dexter-components"
import { DexterActionApproval } from "@/components/multideck/dexter-action-approval"
import { DexterInlineCitation } from "@/components/multideck/dexter-inline-citation"
import { DexterEmailAttachmentCard } from "@/components/multideck/dexter-email-attachment-card"
import { DexterEmailComposeCard } from "@/components/multideck/dexter-email-compose-card"
import { WatchModeAurora } from "@/components/multideck/aurora-background"
import { defaultDexterModelId, type DexterModelId } from "@/data/dexter-models"
import { defaultDexterMentionItems } from "@/data/dexter-mentions"
import type { AutomationRun, CardLayout, CardSocialLink } from "@/data/contact-card-data"
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
  SettingsProgressRing,
  SettingsRail,
  SettingsSummaryCard,
  type SettingsTabGroup,
} from "@/components/multideck/settings-components"
import { Table, TableBody } from "@/components/ui/table"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"
import { AIEdgeGlow } from "@/components/multideck/ai-edge-glow"
import { DashboardCustomisePanel } from "@/components/multideck/dashboard-customise-panel"
import { MultideckDatePicker, MultideckDateRangePicker, MultideckDateTimePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import { SidebarItemMenu } from "@/components/multideck/sidebar-item-menu"
import { SidebarArrangeCanvas, type SidebarArrangeItem } from "@/components/multideck/sidebar-arrange"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterSummonPrompt } from "@/components/multideck/dexter-summon-prompt"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { KeyboardShortcutsPanel } from "@/components/multideck/keyboard-shortcuts-panel"
import { chord, pointerGesture, sequence } from "@/lib/keyboard-shortcut-binding"
import type { SummonTarget } from "@/lib/dexter-summon-context"
import { DexterCompanionSidebar } from "@/components/multideck/dexter-companion-sidebar"
import { PageSettingsMenu } from "@/components/multideck/page-settings-menu"
import { AuditTimeline } from "@/components/multideck/audit-timeline"
import { AuditWorkspace, QUOTE_AUDIT_SAMPLE_DATA } from "@/components/multideck/audit-workspace"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { UnifiedQuoteChargesWorkspace, type UnifiedQuoteChargeRow } from "@/components/multideck/unified-quote-charges-workspace"
import { quoteMatchesSearch, quoteSearchFieldOptions, type QuoteSearchQuery } from "@/lib/quote-filters"
import { matchesFilterQuery, type FilterFieldOption, type FilterQuery } from "@/lib/advanced-filters"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { DocumentEvidenceViewer } from "@/components/multideck/document-evidence-viewer"
import { PdfDocumentViewerDialog } from "@/components/multideck/pdf-document-viewer-dialog"
import { DocumentExtractionProgress } from "@/components/multideck/document-extraction-progress"
import { DocumentWorkspace, documentWorkspaceSampleDocuments } from "@/components/multideck/document-workspace"
import { useLanguage } from "@/i18n/language-provider"

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
    ids: ["metric-card", "performance-panel", "breakdown-panel", "line-chart", "area-chart", "bar-chart", "stacked-bar-chart", "donut-chart", "funnel-chart", "heatmap-chart", "radial-goal-chart", "scatter-chart", "mixed-chart"],
  },
  {
    label: "Button & control components",
    helper: "Navigation and input controls",
    ids: ["command", "app-breadcrumbs", "sidebar", "sidebar-item-menu", "sidebar-arrange-canvas", "theme-toggle", "page-settings-menu", "date-range-picker", "segmented-control", "choice-control", "checkbox", "filter-chips", "tabs", "multi-select-menu", "context-menu", "register-toolbar", "pagination", "kbd", "shortcut-keys", "settings-controls", "settings-option-card"],
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
    ids: ["pdf-document-viewer-dialog", "document-workspace", "document-extraction-progress", "document-evidence-viewer", "audit-timeline", "audit-workspace", "booking-row", "interactive-map", "animated-list", "world-clock", "timezone-work-queue", "queue-row", "customer-avatar", "customer-metric-card", "contact-profile", "primary-contacts-panel", "data-table", "unified-quote-charges-workspace", "quote-search-builder", "warehouse-table", "warehouse-form-field", "warehouse-quantity-uom-field", "purchase-order-line-editor", "rate-charge-line-editor", "rate-pricing-rule-control", "warehouse-object-summary", "warehouse-exception-summary", "warehouse-kanban-board", "dot-grid-loader", "geo-panel", "record-header", "active-bookings-panel", "your-jobs-panel", "priority-queue", "coverage-panel", "lane-mix-panel", "booking-metric-card", "booking-search-builder", "bookings-table", "booking-board-preview", "domestic-job-stage-rail", "domestic-road-job-card", "domestic-road-kanban-board", "booking-arrival-card", "booking-exception-panel", "booking-checklist", "booking-ask-panel", "side-panels", "screening-outcome-pill", "screening-list-freshness", "screening-match-row", "screening-match-list", "screening-result-summary"],
  },
  {
    label: "CRM",
    helper: "Leads, contacts, deals, activity, Drive, settings",
    ids: ["crm-sales-command-center", "crm-metrics-grid", "crm-sales-funnel-panel", "crm-revenue-mix-panel", "crm-forecast-panel", "crm-priority-actions-panel", "crm-pipeline-board", "crm-pipeline-editor", "drive-folder-tile", "drive-file-tile", "crm-lead-qualification-table", "copyable-field", "crm-lead-detail-panel", "contact-create-dialog", "crm-contact-table", "crm-activity-timeline", "crm-lead-signals", "crm-settings-builder"],
  },
  {
    label: "Agent Dexter",
    helper: "Prompt, context, specialists, answers",
    ids: ["dashboard-customise-panel", "dexter-action-pill", "dexter-companion-sidebar", "dexter-summon-prompt", "dexter-mention-input", "dexter-prompt-composer", "dexter-email-compose-card", "watch-mode-aurora", "context-usage-meter", "dexter-live-reasoning", "dexter-reasoning-summary", "dexter-action-approval", "dexter-specialist-picker", "dexter-specialist-menu", "dexter-attachment-palette", "dexter-history-list", "dexter-monitor-card", "dexter-monitor-detail", "dexter-response-blocks"],
  },
  {
    label: "Feedback",
    helper: "Status and notifications",
    ids: ["status-pill", "ai-edge-glow", "toast"],
  },
  {
    label: "Settings",
    helper: "Configuration surfaces",
    ids: ["settings-rail", "settings-panel-row", "settings-integration-row", "settings-summary-card", "settings-progress-ring", "keyboard-shortcuts-panel"],
  },
]

/** Deadlines are stamped relative to load so the buckets always demonstrate. */
const previewNow = Date.now()
const previewPriorityItems: DashboardPriorityItem[] = [
  { id: "p1", kind: "exception", reference: "MD-22479", task: "Resolve tracking exception", customer: "Halo Retail Group", context: "Ningbo → Rotterdam", status: "Exception", owner: "Amelia Rowe", dueAt: previewNow - 78 * 60_000, dueKind: "action", tone: "red", bookingId: "MD-22479" },
  { id: "p2", kind: "exception", reference: "MD-22466", task: "Review revised delivery plan", customer: "Northwind Foods", context: "Frankfurt → JFK", status: "Delayed", owner: "Amelia Rowe", dueAt: previewNow + 42 * 60_000, dueKind: "action", tone: "amber", bookingId: "MD-22466" },
  { id: "p3", kind: "quote-send", reference: "Q-1043", task: "Send priced quote", customer: "Marlow Apparel", context: "GBFXT → USLAX", status: "Ready to send", owner: "Amelia Rowe", dueAt: previewNow + 105 * 60_000, dueKind: "cutoff", tone: "green", quoteReference: "Q-1043" },
  { id: "p4", kind: "quote-progress", reference: "Q-1051", task: "Progress carrier pricing", customer: "Bright Harbour Ltd", context: "SGSIN → NLRTM", status: "In progress", owner: "Tomas Berg", dueAt: previewNow + 5 * 60 * 60_000, dueKind: "cutoff", tone: "blue", quoteReference: "Q-1051" },
  { id: "p5", kind: "quote-progress", reference: "Q-1058", task: "Progress customer approval", customer: "Aster Components", context: "CNSHA → GBSOU", status: "Awaiting customer", owner: "Tomas Berg", dueAt: previewNow + 3 * 24 * 60 * 60_000, dueKind: "departure", tone: "neutral", quoteReference: "Q-1058" },
]

const previewPerformanceKpis: DashboardKpi[] = [
  { label: "Active jobs", value: "24", change: "3 need action", detail: "3 need action", tone: "amber", series: [18, 19, 21, 20, 22, 23, 22, 24, 23, 24], delta: { direction: "up", text: "+33%", caption: "vs start of period" } },
  { label: "Booking exceptions", value: "3", change: "21 on track", detail: "21 on track", tone: "red", series: [5, 5, 4, 4, 4, 3, 3, 4, 3, 3], delta: { direction: "down", text: "-40%", caption: "vs start of period" } },
  { label: "Open quotes", value: "11", change: "4 ready", detail: "4 ready to send", tone: "green", series: [9, 10, 10, 12, 11, 11, 12, 11, 11, 11], delta: { direction: "up", text: "+22%", caption: "vs start of period" } },
  { label: "Ready quotes", value: "4", change: "15 total", detail: "15 quotes in period", tone: "teal", series: [2, 3, 3, 3, 4, 4, 5, 4, 4, 4], delta: { direction: "up", text: "+100%", caption: "vs start of period" } },
]

const previewPerformanceTrends: Record<string, DashboardTrendPoint[]> = Object.fromEntries(
  previewPerformanceKpis.map((kpi) => [
    kpi.label,
    (kpi.series ?? []).map((value, index) => ({ period: `W${index + 1}`, value })),
  ]),
)

const previewBookingDateFields = new Set(["date", "departure", "arrival"])

const previewBookingFilterFields: readonly FilterFieldOption[] = bookingSearchFieldOptions.map((option) => (
  previewBookingDateFields.has(option.value)
    ? { value: option.value, label: option.label, kind: "date" as const }
    : { value: option.value, label: option.label, placeholder: option.placeholder }
))

function previewBookingFilterValue(booking: (typeof bookings)[number], field: string) {
  const customFields = booking.customFields.flatMap((entry) => [entry.label, entry.value])
  if (field === "date") return [booking.departureDate, booking.arrivalDate]
  if (field === "departure") return booking.departureDate
  if (field === "arrival") return booking.arrivalDate
  if (field === "invoice") return booking.invoice
  if (field === "jobRef") return booking.jobRef
  if (field === "customerRef") return booking.customerRef
  if (field === "supplierRef") return booking.supplierRef
  if (field === "destination") return [booking.destination, booking.route]
  if (field === "origin") return [booking.origin, booking.route]
  if (field === "vessel") return [booking.vessel, booking.carrier]
  if (field === "vin") return booking.vin
  if (field === "customFields") return customFields
  return [booking.id, booking.customer, booking.route, booking.carrier, booking.container, booking.invoice, booking.jobRef, booking.customerRef, booking.supplierRef, booking.origin, booking.destination, booking.vessel, booking.vin, ...customFields]
}

type PreviewChargeRow = {
  id: string
  description: string
  supplier: string
  scope: string
  status: "Approved" | "Review" | "Blocked"
  cost: number
  sell: number
}

const previewChargeRows: PreviewChargeRow[] = [
  { id: "FRT", description: "International freight", supplier: "Bluewave Ocean", scope: "Ocean", status: "Approved", cost: 840, sell: 980 },
  { id: "OCART", description: "Pickup transport", supplier: "Severn Road Logistics", scope: "Road", status: "Review", cost: 610, sell: 630 },
  { id: "DTHC", description: "Destination handling", supplier: "Kobe Gateway Agency", scope: "Destination", status: "Blocked", cost: 304, sell: 360 },
]

const previewUnifiedChargeRowsSeed: UnifiedQuoteChargeRow[] = [
  { id: "preview-frt", code: "FRT", description: "International freight", supplierId: "supplier-bluewave", customerId: "customer-harbourworks", cost: 840, costCurrency: "USD", sell: 980, sellCurrency: "USD", costRoe: 1.25, sellRoe: 1.25, costRoeSource: "rate", sellRoeSource: "rate" },
  { id: "preview-ocart", code: "OCART", description: "Pickup transport", supplierId: "supplier-severn", customerId: "customer-harbourworks", cost: 610, costCurrency: "GBP", sell: 630, sellCurrency: "GBP", costRoe: 1, sellRoe: 1, costRoeSource: "rate", sellRoeSource: "rate" },
  { id: "preview-dthc", code: "DTHC", description: "Destination handling", supplierId: "supplier-kobe", customerId: "customer-harbourworks", cost: 380, costCurrency: "USD", sell: 450, sellCurrency: "USD", costRoe: 1.25, sellRoe: 1.25, costRoeSource: "rate", sellRoeSource: "rate" },
]

const previewChargeColumns: DataTableColumn<PreviewChargeRow>[] = [
  { id: "code", label: "Code", width: 100, cell: (row) => <span dir="ltr">{row.id}</span>, sortValue: (row) => row.id },
  { id: "description", label: "Description", kind: "long-text", width: 220, cell: (row) => row.description, sortValue: (row) => row.description },
  { id: "supplier", label: "Supplier", kind: "identity", width: 210, cell: (row) => row.supplier, sortValue: (row) => row.supplier },
  { id: "scope", label: "Scope", kind: "attribute", width: 130, cell: (row) => <StatusPill tone={row.scope === "Ocean" ? "blue" : row.scope === "Road" ? "amber" : "teal"}>{row.scope}</StatusPill> },
  { id: "status", label: "Status", kind: "status", width: 126, cell: (row) => <StatusPill tone={row.status === "Approved" ? "green" : row.status === "Review" ? "amber" : "red"}>{row.status}</StatusPill> },
  { id: "cost", label: "Cost", kind: "number", width: 110, cell: (row) => `£${row.cost.toFixed(2)}`, sortValue: (row) => row.cost },
  { id: "sell", label: "Sell", kind: "number", width: 110, cell: (row) => `£${row.sell.toFixed(2)}`, sortValue: (row) => row.sell },
]

/* Stands in for a real preview seed: the same kind of ~1 KB inline image a stored
   file carries, so the tile can demonstrate its instant first paint offline. Two
   flat rects rather than a gradient, because a gradient needs a fragment reference
   and a data URI is the wrong place to be escaping one. */
function previewSeed(base: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 6"><rect width="8" height="6" fill="${base}"/><rect x="3" y="2" width="6" height="5" fill="${accent}" opacity="0.7"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const previewDriveTimestamp = "2026-08-05T09:12:00.000Z"

const previewDriveFolders: DriveFolder[] = [
  { id: "preview-brand", parentId: null, name: "Brand", colour: "teal", icon: "palette", createdAt: previewDriveTimestamp, updatedAt: previewDriveTimestamp },
  { id: "preview-graphics", parentId: null, name: "Graphics", colour: "violet", icon: "image", createdAt: previewDriveTimestamp, updatedAt: previewDriveTimestamp },
  { id: "preview-decks", parentId: null, name: "Customer decks", colour: "ember", icon: "presentation", createdAt: previewDriveTimestamp, updatedAt: previewDriveTimestamp },
]

const previewDriveFolderStats = new Map<string, DriveFolderStats>([
  ["preview-brand", { folderCount: 2, fileCount: 9, byteTotal: 48 * 1024 * 1024, lastActivityAt: previewDriveTimestamp }],
  ["preview-graphics", { folderCount: 0, fileCount: 14, byteTotal: 312 * 1024 * 1024, lastActivityAt: previewDriveTimestamp }],
  ["preview-decks", { folderCount: 0, fileCount: 0, byteTotal: 0, lastActivityAt: null }],
])

const previewDriveFiles: DriveFile[] = [
  {
    id: "preview-logo",
    folderId: "preview-brand",
    name: "multideck-primary-logo.svg",
    mimeType: "image/svg+xml",
    sizeBytes: 126_976,
    storagePath: "preview/files/logo.svg",
    thumbnailPath: null,
    previewSeed: previewSeed("#e6efed", "#bcd6d1"),
    previewWidth: 1200,
    previewHeight: 400,
    createdAt: previewDriveTimestamp,
    updatedAt: previewDriveTimestamp,
  },
  {
    id: "preview-hero",
    folderId: "preview-graphics",
    name: "peak-season-capacity-hero.png",
    mimeType: "image/png",
    sizeBytes: 19_508_428,
    storagePath: "preview/files/hero.png",
    thumbnailPath: null,
    previewSeed: previewSeed("#2f5f7d", "#9dc0d4"),
    previewWidth: 2400,
    previewHeight: 1350,
    createdAt: previewDriveTimestamp,
    updatedAt: previewDriveTimestamp,
  },
  {
    id: "preview-review",
    folderId: "preview-decks",
    name: "quarterly-review.pdf",
    mimeType: "application/pdf",
    sizeBytes: 3_251_200,
    storagePath: "preview/files/review.pdf",
    thumbnailPath: null,
    previewSeed: previewSeed("#f6f6f4", "#dedbd2"),
    previewWidth: 1240,
    previewHeight: 1754,
    createdAt: previewDriveTimestamp,
    updatedAt: previewDriveTimestamp,
  },
  {
    id: "preview-tariff",
    folderId: "preview-decks",
    name: "2026-tariff-schedule.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 88_064,
    storagePath: "preview/files/tariff.xlsx",
    thumbnailPath: null,
    previewSeed: null,
    previewWidth: null,
    previewHeight: null,
    createdAt: previewDriveTimestamp,
    updatedAt: previewDriveTimestamp,
  },
]

const previewCrmLeads: ApiLead[] = [
  {
    id: "lead-northstar",
    editVersion: 1,
    companyName: "Northstar Components",
    initials: "NC",
    primaryContactName: "Amelia Hart",
    primaryContactEmail: "amelia@northstar.example",
    countryCode: "GB",
    sourceCode: "REFERRAL",
    sourceName: "Customer referral",
    ownerId: "owner-elena",
    ownerName: "Elena Moreno",
    ownerInitials: "EM",
    statusCode: "QUALIFYING",
    statusName: "Qualifying",
    isOpen: true,
    isConverted: false,
    isDisqualified: false,
    ratingCode: "WARM",
    ratingName: "Warm",
    qualificationScore: 72,
    qualificationCriteriaMet: 3,
    conversionProbability: 64,
    lastActivityAt: "2026-07-28T14:30:00Z",
    lastActivitySubject: "Discovery call completed",
    nextFollowUpAt: "2026-07-30T09:00:00Z",
    createdAt: "2026-07-08T10:00:00Z",
    valueAmount: 92000,
    valueCurrencyCode: "GBP",
    valueContext: "UK–Benelux road tender · Discovery",
    tradeLane: "UK–Benelux",
    serviceInterest: "Road freight",
    openOpportunityCount: 1,
  },
  {
    id: "lead-atlas",
    editVersion: 1,
    companyName: "Atlas Retail Supply",
    initials: "AR",
    primaryContactName: "Ravi Shah",
    primaryContactEmail: "ravi@atlasretail.example",
    countryCode: "NL",
    sourceCode: "INBOUND",
    sourceName: "Website enquiry",
    ownerId: null,
    ownerName: null,
    ownerInitials: null,
    statusCode: "NEW",
    statusName: "New",
    isOpen: true,
    isConverted: false,
    isDisqualified: false,
    ratingCode: "UNRATED",
    ratingName: "Unrated",
    qualificationScore: null,
    qualificationCriteriaMet: 0,
    conversionProbability: null,
    lastActivityAt: null,
    lastActivitySubject: null,
    nextFollowUpAt: null,
    createdAt: "2026-07-27T08:10:00Z",
    valueAmount: null,
    valueCurrencyCode: null,
    valueContext: "Ocean FCL enquiry",
    tradeLane: "Shanghai–Rotterdam",
    serviceInterest: "Ocean FCL",
    openOpportunityCount: 0,
  },
]

const previewCrmLeadDetails: ApiLeadDetail[] = previewCrmLeads.map((lead, index) => ({
  ...lead,
  company: index === 0
    ? {
        organisationId: "org-northstar",
        email: "hello@northstar.example",
        website: "https://northstar.example",
        phone: "+44 121 555 0142",
        address: "Foundry House, Birmingham B4 6QE, United Kingdom",
      }
    : {
        organisationId: null,
        email: null,
        website: null,
        phone: null,
        address: null,
      },
  contacts: index === 0
    ? [
        { id: "contact-amelia", name: "Amelia Hart", initials: "AH", roleCode: "primary_contact", email: "amelia@northstar.example", phone: "+44 121 555 0188", isPrimary: true, lastContactAt: "2026-07-28T14:30:00Z" },
        { id: "contact-james", name: "James Harrison", initials: "JH", roleCode: "procurement_director", email: "james@northstar.example", phone: null, isPrimary: false, lastContactAt: "2026-07-25T10:00:00Z" },
        { id: "contact-maya", name: "Maya Chen", initials: "MC", roleCode: "logistics_manager", email: "maya@northstar.example", phone: null, isPrimary: false, lastContactAt: "2026-07-21T09:00:00Z" },
      ]
    : [
        { id: "contact-ravi", name: "Ravi Shah", initials: "RS", roleCode: "primary_contact", email: "ravi@atlasretail.example", phone: null, isPrimary: true, lastContactAt: null },
      ],
  activities: index === 0
    ? [
        { id: "activity-discovery", typeCode: "call", subject: "Discovery call completed", summary: "Confirmed weekly import profile and decision process.", activityAt: "2026-07-28T14:30:00Z" },
        { id: "activity-follow-up", typeCode: "email", subject: "Service overview shared", summary: "Road tender scope and next-step options sent.", activityAt: "2026-07-24T09:15:00Z" },
      ]
    : [],
}))

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
/* The value beside each swatch is read back off the page rather than written down
   here: the accent tokens are operator-chosen now, and the neutrals already
   differed between light and dark, so a literal in this list could only ever be
   right for one of the four combinations. */
const colourTokens = [
  ["Ink", "--md-ink"],
  ["Text", "--md-text"],
  ["Subtle", "--md-subtle"],
  ["Background", "--md-bg"],
  ["Strong bg", "--md-bg-strong"],
  ["Surface", "--md-surface"],
  ["Tint", "--md-surface-tint"],
  ["Field", "--md-field-bg"],
  ["Selected", "--md-selected-bg"],
  ["Accent", "--md-accent"],
  ["Green", "--md-green"],
  ["Amber", "--md-amber"],
  ["Red", "--md-red"],
  ["Blue", "--md-blue"],
  ["AI cyan", "--md-ai-cyan"],
  ["AI magenta", "--md-ai-magenta"],
  ["AI gold", "--md-ai-gold"],
  ["AI orange", "--md-ai-orange"],
]

function rgbToHex(value: string) {
  const channels = value.match(/[\d.]+/g)
  if (!channels || channels.length < 3) return value

  return `#${channels
    .slice(0, 3)
    .map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0"))
    .join("")}`
}

function ColourTokenSwatch({ label, token }: { label: string; token: string }) {
  const accentPresetId = useAccentPresetId()
  const { resolvedTheme } = useTheme()
  const swatchRef = useRef<HTMLDivElement>(null)
  const [resolved, setResolved] = useState("")

  useEffect(() => {
    const element = swatchRef.current
    if (!element) return

    const read = () => setResolved(rgbToHex(window.getComputedStyle(element).backgroundColor))

    read()
    // Read again once the accent cross-fade has landed, so the caption reports the
    // colour that settled rather than one sampled mid-transition.
    const timer = window.setTimeout(read, accentShiftDurationMs + 80)
    return () => window.clearTimeout(timer)
  }, [accentPresetId, resolvedTheme])

  return (
    <div className="rounded-[var(--md-radius-lg)] bg-white/60 p-2 shadow-[var(--md-shadow-line)]">
      <div
        ref={swatchRef}
        className="h-20 rounded-[var(--md-radius-md)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]"
        style={{ background: `var(${token})` }}
      />
      <div className="mt-3 px-1 pb-1">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        <p className="mt-1 text-[11px] text-[var(--md-text)]">{token}</p>
        <p className="mt-1 text-[11px] text-[var(--md-subtle)]">{resolved}</p>
      </div>
    </div>
  )
}
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
      { id: "agent-dexter", label: "Agent Dexter", icon: AiBrain },
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
          "overflow-auto p-[var(--md-page-stack-gap)] text-[12px] leading-6 text-[#d8e2df] md-scrollbar transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
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

const previewSidebarRows: SidebarArrangeItem[] = [
  { id: "overview", label: "Overview", icon: galleryIcons.sidebar },
  { id: "bookings", label: "Bookings", icon: Ship },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "customers", label: "Customers", icon: UserRound },
]

const previewSidebarOrder = previewSidebarRows.map((row) => row.id)

/* ------------------------------------------------------------------------- *
 * Inbox preview data. Small, self-contained samples so each mail component can
 * be inspected here without a connected Gmail or Outlook account.
 * ------------------------------------------------------------------------- */

const previewInboxSummary: ThreadSummaryState = {
  status: "ready",
  text: "Marlow Apparel is waiting on the dual-use licence reference for MD-22455 before the broker will release the declaration. Claire has asked twice and flagged that the Felixstowe free-time window closes on 2 August.",
  keyPoints: [],
  sourceMessageIds: ["msg-1", "msg-2"],
  model: "gpt-5.6-luna",
  updatedAt: "2026-07-31T09:37:00Z",
  error: null,
}

const previewInboxThreads: InboxThreadListItem[] = [
  {
    id: "preview-thread-1",
    mailboxId: "preview-mbx",
    provider: "gmail",
    subject: "MD-22455 customs hold \u2014 licence confirmation still outstanding",
    preview: "Hi Harry, the broker has come back asking for the dual-use licence reference before they will release the declaration.",
    participants: [{ address: "claire.osei@marlowapparel.co.uk", displayName: "Claire Osei" }],
    lastMessageAt: "2026-07-31T09:23:00Z",
    unreadCount: 2,
    messageCount: 4,
    hasAttachments: true,
    starred: true,
    archived: false,
    summary: previewInboxSummary,
  },
  {
    id: "preview-thread-2",
    mailboxId: "preview-mbx",
    provider: "gmail",
    subject: "Re: Felixstowe berthing window moved \u2014 revised ETA for MSC ANTONIA",
    preview: "The berth has slipped to the 03:40 window on Saturday. Attaching the revised proforma so you can update the customer.",
    participants: [{ address: "operations@mscagency.example", displayName: "MSC Agency Operations" }],
    lastMessageAt: "2026-07-30T16:05:00Z",
    unreadCount: 0,
    messageCount: 2,
    hasAttachments: true,
    starred: false,
    archived: false,
    summary: { status: "none", text: null, keyPoints: [], sourceMessageIds: [], model: null, updatedAt: null, error: null },
  },
]

function previewMailbox(overrides: Partial<Mailbox> & Pick<Mailbox, "id" | "displayName" | "address">): Mailbox {
  return {
    connectionId: "preview-conn",
    provider: "gmail",
    kind: "personal",
    unreadCount: 0,
    isDefault: false,
    inboundEnabled: true,
    outboundEnabled: true,
    status: "connected",
    lastSyncedAt: "2026-07-31T09:38:00Z",
    indexStatus: "ready",
    indexedCount: 2_480,
    estimatedTotal: 2_480,
    indexPercent: 100,
    coreCoverageStart: "2025-07-31T09:38:00Z",
    wasteCoverageStart: "2026-07-01T09:38:00Z",
    coreRetentionMonths: 12,
    wasteRetentionDays: 30,
    error: null,
    ...overrides,
  }
}

const previewMailboxes: Mailbox[] = [
  previewMailbox({ id: "preview-mbx", displayName: "Harry Phillips", address: "harry.phillips@northwind-forwarding.com", unreadCount: 12, isDefault: true }),
  previewMailbox({ id: "preview-ops", displayName: "Operations desk", address: "ops@northwind-forwarding.com", kind: "shared", unreadCount: 4 }),
  previewMailbox({ id: "preview-customs", displayName: "Customs & compliance", address: "customs@northwind-forwarding.com", kind: "group", outboundEnabled: false }),
  previewMailbox({ id: "preview-finance", displayName: "Finance & receivables", address: "finance@northwind-forwarding.com", provider: "outlook", kind: "shared", unreadCount: 7, isDefault: true, status: "reauthorization_required", error: "Microsoft revoked the mail token." }),
]

/**
 * Everything real mail throws at the renderer: a remote image, so the blocked
 * state is visible; an inline signature logo, which must arrive without a frame
 * around it; a layout table, which must not be drawn as a grid; a table that
 * asked for borders, which must keep them; and emoji, which must come through
 * in colour.
 */
const previewEmailSignatureLogo = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTUiIGZpbGw9IiMyZjZmNjMiLz48L3N2Zz4="
const previewEmailHtml = `<div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="40"><img src="${previewEmailSignatureLogo}" alt="" width="32" height="32" /></td>
      <td><strong>Northgate brokers</strong><br />Customs desk</td>
    </tr>
  </table>
  <p>Hi Harry,</p>
  <p>The broker has come back asking for the <strong>dual-use licence reference</strong> before they will release the declaration for MD-22455. 🎉</p>
  <p><img src="https://images.example.com/tracking-pixel.png" alt="Remote tracking image" width="360" height="90" /></p>
  <p>Free time at Felixstowe ends on <strong>2 August</strong>, after which demurrage starts at GBP 145 per day. ⚠️</p>
  <table border="1" cellpadding="0" cellspacing="0">
    <tr><th>Container</th><th>Free time ends</th></tr>
    <tr><td>MSKU 442 118 9</td><td>2 August</td></tr>
  </table>
  <p>Best regards,<br />Claire Osei ✅</p>
</div>`


// A stand-in scanned page for the gallery. Real documents are white regardless of theme,
// so this placeholder keeps paper colours rather than surface tokens.
const previewDocumentPageMarkup = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1130">',
  '<rect width="800" height="1130" fill="#ffffff"/>',
  '<rect x="56" y="56" width="196" height="20" rx="4" fill="#c9d2d0"/>',
  '<rect x="56" y="92" width="120" height="10" rx="3" fill="#e2e7e6"/>',
  '<rect x="560" y="56" width="184" height="10" rx="3" fill="#e2e7e6"/>',
  '<rect x="560" y="76" width="140" height="10" rx="3" fill="#e2e7e6"/>',
  '<rect x="56" y="320" width="688" height="1" fill="#d8dedd"/>',
  '<rect x="56" y="336" width="96" height="9" rx="3" fill="#c9d2d0"/>',
  '<rect x="200" y="336" width="180" height="9" rx="3" fill="#c9d2d0"/>',
  '<rect x="620" y="336" width="124" height="9" rx="3" fill="#c9d2d0"/>',
  ...[380, 420, 460].flatMap((y) => [
    `<rect x="56" y="${y}" width="80" height="9" rx="3" fill="#e2e7e6"/>`,
    `<rect x="200" y="${y}" width="248" height="9" rx="3" fill="#e2e7e6"/>`,
    `<rect x="620" y="${y}" width="124" height="9" rx="3" fill="#e2e7e6"/>`,
  ]),
  '<rect x="560" y="560" width="184" height="12" rx="3" fill="#c9d2d0"/>',
  "</svg>",
].join("")

const previewDocumentPageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(previewDocumentPageMarkup)}`

function createGalleryDeclarationPdf() {
  const pageOne = [
    "BT /F1 17 Tf 56 780 Td (CDS export declaration) Tj ET",
    "BT /F1 9 Tf 56 754 Td (MRN 26GB 0000 0000 0000 00) Tj ET",
    "0.82 G 56 730 m 539 730 l S",
    "BT /F1 10 Tf 56 690 Td (Declaration details) Tj ET",
    "0.9 G 56 668 m 539 668 l S 56 632 m 539 632 l S 56 596 m 539 596 l S",
    "BT /F1 9 Tf 68 646 Td (Exporter) Tj ET BT /F1 9 Tf 240 646 Td (Jenkar Shipping Ltd) Tj ET",
    "BT /F1 9 Tf 68 610 Td (Destination) Tj ET BT /F1 9 Tf 240 610 Td (United Kingdom) Tj ET",
    "BT /F1 9 Tf 68 574 Td (Items) Tj ET BT /F1 9 Tf 240 574 Td (2) Tj ET",
  ].join("\n")
  const pageTwo = [
    "BT /F1 17 Tf 56 780 Td (Goods items) Tj ET",
    "0.82 G 56 750 m 539 750 l S",
    "BT /F1 10 Tf 56 714 Td (Item 1) Tj ET",
    "BT /F1 9 Tf 68 684 Td (Commodity code) Tj ET BT /F1 9 Tf 240 684 Td (8471 30 00 00) Tj ET",
    "BT /F1 9 Tf 68 656 Td (Description) Tj ET BT /F1 9 Tf 240 656 Td (Portable computers) Tj ET",
    "0.9 G 56 624 m 539 624 l S",
    "BT /F1 10 Tf 56 588 Td (Item 2) Tj ET",
    "BT /F1 9 Tf 68 558 Td (Commodity code) Tj ET BT /F1 9 Tf 240 558 Td (8528 52 10 00) Tj ET",
    "BT /F1 9 Tf 68 530 Td (Description) Tj ET BT /F1 9 Tf 240 530 Td (Computer monitors) Tj ET",
  ].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${pageOne.length} >>\nstream\n${pageOne}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${pageTwo.length} >>\nstream\n${pageTwo}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: "application/pdf" })
}

const previewExtractionStages = [
  { id: "reading", label: "Reading the document", detail: "Opening the PDF and collecting its text and layout.", ceiling: 24, expectedMs: 1_400 },
  { id: "extracting", label: "Finding the item lines", detail: "Picking out goods rows, quantities, values and codes.", ceiling: 88, expectedMs: 9_000 },
  { id: "organising", label: "Preparing the review", detail: "Grouping by commodity code and locating each line on the page.", ceiling: 99, expectedMs: 1_200 },
]

const previewEvidenceBoxes = [
  { id: "line-1", page: 1, box: { x: 0.07, y: 0.336, width: 0.86, height: 0.02 }, label: "Line 1" },
  { id: "line-2", page: 1, box: { x: 0.07, y: 0.371, width: 0.86, height: 0.02 }, label: "Line 2" },
  { id: "line-3", page: 1, box: { x: 0.07, y: 0.407, width: 0.86, height: 0.02 }, label: "Line 3", approximate: true, tone: "amber" as const },
]

function DocumentEvidenceViewerPreview() {
  const [activeBoxId, setActiveBoxId] = useState("line-2")

  return (
    <DocumentEvidenceViewer
      className="h-[420px]"
      pages={[{ page: 1, width: 800, height: 1130, url: previewDocumentPageUrl }]}
      boxes={previewEvidenceBoxes}
      activeBoxId={activeBoxId}
      onSelectBox={setActiveBoxId}
      title="Your invoice"
      meta={<StatusPill>3 of 3 located</StatusPill>}
      empty="The document preview is still being prepared."
    />
  )
}

function PdfDocumentViewerDialogPreview() {
  const [open, setOpen] = useState(false)
  const previewPdf = useMemo(createGalleryDeclarationPdf, [])
  return <div className="grid min-h-[240px] w-full max-w-[720px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 shadow-[var(--md-shadow-line)]">
    <div className="text-center"><FileText className="mx-auto size-7 text-[var(--md-accent)]" /><h3 className="mt-3 text-[15px] font-medium text-[var(--md-ink)]">Accepted declaration PDF</h3><p className="mt-1 text-[12px] text-[var(--md-text)]">Open the focused reader to inspect its zoom and download controls.</p><Button type="button" variant="ghost" className="mt-4 bg-black text-white shadow-none hover:bg-black/80 hover:text-white" onClick={() => setOpen(true)}>Open PDF viewer</Button></div>
    <PdfDocumentViewerDialog open={open} onOpenChange={setOpen} blob={previewPdf} title="CDS export declaration" fileName="CDS-Export-MRN.pdf" meta="MRN 26GB 0000 0000 0000 00" onDownload={async () => undefined} />
  </div>
}

const previewAutomationRuns: AutomationRun[] = [
  {
    id: "gallery-run-failed",
    exchangeId: "exchange-gallery-1",
    leadId: null,
    status: "failed",
    startedAt: "2026-08-03T10:42:18.000Z",
    completedAt: "2026-08-03T10:42:18.684Z",
    durationMs: 684,
    recordsAffected: 1,
    trigger: "Contact details shared",
    errorSummary: "The deal stage no longer exists in the selected pipeline.",
    recovery: "Choose a current stage in the Add to CRM step, publish the change, then rerun the failed steps.",
    input: { name: "Nadia Perera", email: "nadia@halcyontextiles.com", company: "Halcyon Textiles" },
    rerunOf: null,
    isTest: false,
    steps: [
      { id: "gallery-step-1", actionId: "add-lead", kind: "add-to-crm", label: "Add lead to CRM", status: "succeeded", detail: "Created lead and kept the submitted details.", startedAt: "2026-08-03T10:42:18.000Z", durationMs: 416 },
      { id: "gallery-step-2", actionId: "add-deal", kind: "add-to-crm", label: "Create deal", status: "failed", detail: "Stage ‘Qualified’ was not found.", startedAt: "2026-08-03T10:42:18.416Z", durationMs: 268 },
    ],
  },
  {
    id: "gallery-run-success",
    exchangeId: "exchange-gallery-2",
    leadId: "lead-gallery-2",
    status: "succeeded",
    startedAt: "2026-08-03T09:18:04.000Z",
    completedAt: "2026-08-03T09:18:04.521Z",
    durationMs: 521,
    recordsAffected: 2,
    trigger: "Contact details shared",
    errorSummary: null,
    recovery: null,
    input: { name: "Owen Hughes", email: "owen@northgate.example", company: "Northgate" },
    rerunOf: null,
    isTest: false,
    steps: [
      { id: "gallery-step-3", actionId: "add-lead", kind: "add-to-crm", label: "Add lead to CRM", status: "succeeded", detail: "Matched the existing lead and refreshed its details.", startedAt: "2026-08-03T09:18:04.000Z", durationMs: 521 },
    ],
  },
]

const galleryRegisterViews = ["Stock", "Objects", "Movements", "Exceptions"] as const

const previewWarehouseObject: WarehouseHandlingUnit = {
  id: "gallery-pallet", facilityId: "gallery-facility", parentHandlingUnitId: null,
  typeCode: "pallet", typeName: "Pallet", code: "PLT-000184", sscc: null,
  externalReference: "ASN-4419", customerOrgId: "gallery-customer", customerName: "Marlow Apparel",
  locationId: "gallery-location", locationCode: "A-03-02", inventoryStatusCode: "available",
  inventoryStatusName: "Available", customsStatusCode: "free_circulation", lifecycleStatusCode: "open",
  consumedIntoHandlingUnitId: null, grossWeightKg: 486.5, netWeightKg: 452, volumeCbm: 1.28,
  sealed: false, updatedAt: "2026-08-04T09:30:00Z",
  contents: [
    { balanceId: "gallery-balance-1", itemId: "gallery-item-1", sku: "INK-BLK-25", description: "Black industrial ink", quantity: 387.5, uomCode: "KG", statusCode: "available", customsStatusCode: "free_circulation", lotNumber: "LOT-442", batchNumber: null },
    { balanceId: "gallery-balance-2", itemId: "gallery-item-2", sku: "CAP-38MM", description: "38 mm closure caps", quantity: 2_400, uomCode: "EA", statusCode: "available", customsStatusCode: "free_circulation", lotNumber: null, batchNumber: null },
  ],
  events: [],
}

const previewWarehouseException: WarehouseInventoryException = {
  id: "gallery-exception", facilityId: "gallery-facility", typeCode: "location_empty", statusCode: "open", severityCode: "high",
  balanceId: "gallery-balance-1", title: "Expected stock missing from B-01-04",
  description: "The bin was scanned and physically confirmed empty. Stock is held as unlocated while the count is investigated.",
  expectedLocationId: "gallery-location", expectedLocationCode: "B-01-04", actualLocationId: null, actualLocationCode: null,
  movementGroupId: "gallery-movement", raisedAt: "2026-08-04T10:15:00Z", resolvedAt: null, metadata: {},
}

const previewPurchaseOrderReference: WarehousePurchaseOrderReference = {
  facilities: [{ id: "gallery-facility", code: "FXT-DC1", name: "Felixstowe DC" }],
  organisations: [{ id: "gallery-customer", name: "Marlow Apparel Ltd" }],
  currencies: ["GBP", "EUR", "USD"],
  items: [
    { id: "gallery-item-rsj", customerOrgId: "gallery-customer", facilityId: "gallery-facility", sku: "MAR-RSJ-118", description: "Rain shell jacket", uomCode: "EA", quantityBasisCode: "count", allowsFractionalQuantity: false },
    { id: "gallery-item-act", customerOrgId: "gallery-customer", facilityId: "gallery-facility", sku: "MAR-ACT-044", description: "Thermal activewear carton", uomCode: "CTN", quantityBasisCode: "count", allowsFractionalQuantity: false },
  ],
}

function ComponentPreview({ id }: { id: string }) {
  const { language, t } = useLanguage()
  const [previewSidebarPinnedIds, setPreviewSidebarPinnedIds] = useState<string[]>([])
  const [previewArrangeOrder, setPreviewArrangeOrder] = useState<string[]>(previewSidebarOrder)
  const [previewArrangePinned, setPreviewArrangePinned] = useState<string[]>([])
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [previewBookingFilter, setPreviewBookingFilter] = useState<string>(bookingFilters[0])
  const [previewTableView, setPreviewTableView] = useState<"All" | "Profitable">("All")
  const [previewTableSearch, setPreviewTableSearch] = useState("")
  const [previewTableStatus, setPreviewTableStatus] = useState("")
  const [previewBookingView, setPreviewBookingView] = useState<BookingViewMode>("Table")
  const [previewChoiceMode, setPreviewChoiceMode] = useState("OCEAN")
  const [previewInboxThreadId, setPreviewInboxThreadId] = useState("preview-thread-1")
  const [previewInboxStarred, setPreviewInboxStarred] = useState<Set<string>>(new Set(["preview-thread-1"]))
  const [previewMailProvider, setPreviewMailProvider] = useState<MailProvider>("gmail")
  const [previewMailboxId, setPreviewMailboxId] = useState("preview-mbx")
  const [previewSummaryState, setPreviewSummaryState] = useState<ThreadSummaryState>(previewInboxSummary)
  const [previewComposer, setPreviewComposer] = useState<ComposerState>({
    mode: "reply_all",
    threadId: "preview-thread-1",
    sourceMessageId: "msg-2",
    subject: "",
    bodyText: "Licence reference is GB/DU/2026/44189, valid to 31 December 2026. Passing it to the broker now.",
    to: [],
    cc: [{ address: "broker@northgate.example", displayName: "Northgate brokers" }],
    bcc: [],
    showCc: true,
    showBcc: false,
    attachments: [],
    trackOpens: true,
    presentation: "open",
  })
  const [previewCheckbox, setPreviewCheckbox] = useState(true)
  const [previewWarehouseQuantity, setPreviewWarehouseQuantity] = useState("12.5")
  const [galleryRegisterView, setGalleryRegisterView] = useState<(typeof galleryRegisterViews)[number]>("Stock")
  const [galleryRegisterCondition, setGalleryRegisterCondition] = useState("")
  const [galleryRegisterSearch, setGalleryRegisterSearch] = useState("")
  const [galleryRegisterPending, setGalleryRegisterPending] = useState(false)
  const [previewPurchaseOrderLines, setPreviewPurchaseOrderLines] = useState<WarehousePurchaseOrderLine[]>([
    { itemId: "gallery-item-rsj", sku: "MAR-RSJ-118", supplierItemCode: "YH-1440", description: "Rain shell jacket · navy · mixed sizes", quantity: 780, uomCode: "EA", unitPrice: 18.4, taxRate: 0, requestedDeliveryDate: "2026-08-18" },
  ])
  const [previewRateCharges, setPreviewRateCharges] = useState([{ id: "gallery-charge-1", description: "Ocean freight", basis: "per container", buyAmount: 1850, sellAmount: 0 }])
  const [previewRatePricing, setPreviewRatePricing] = useState({ pricingMode: "markup_percent" as const, markupPercent: 12, markupAmount: 0, sellTotal: 0 })
  const [previewContactLayout, setPreviewContactLayout] = useState<CardLayout>("editorial")
  const [previewMarketingOptIn, setPreviewMarketingOptIn] = useState(true)
  const [previewSocialLinks, setPreviewSocialLinks] = useState<CardSocialLink[]>([
    { id: "gallery-linkedin", kind: "linkedin", value: "linkedin.com/in/maya-stone", enabled: true },
    { id: "gallery-facebook", kind: "facebook", value: "facebook.com/maya.stone", enabled: true },
    { id: "gallery-instagram", kind: "instagram", value: "@maya.moves.freight", enabled: true },
    { id: "gallery-whatsapp", kind: "whatsapp", value: "+44 7700 900000", enabled: true },
    { id: "gallery-email", kind: "email", value: "maya@multideck.app", enabled: true },
    { id: "gallery-website", kind: "website", value: "multideck.app", enabled: true },
  ])
  const [previewCustomerView, setPreviewCustomerView] = useState<CustomerViewMode>("List")
  const [previewSelectedIds, setPreviewSelectedIds] = useState<Set<string>>(new Set(["marlow-apparel"]))
  const [previewCustomerTab, setPreviewCustomerTab] = useState("Overview")
  const [previewAuthEmail, setPreviewAuthEmail] = useState("john.doe@multideck.app")
  const [previewAuthCode, setPreviewAuthCode] = useState("742")
  const [previewSettingsTab, setPreviewSettingsTab] = useState("profile")
  const [previewSettingsChoice, setPreviewSettingsChoice] = useState("Always ask")
  const [previewSettingsOption, setPreviewSettingsOption] = useState("Suggest")
  const [previewScreenGlow, setPreviewScreenGlow] = useState(false)
  const [summonPreviewQuestion, setSummonPreviewQuestion] = useState("Is this account safe to book again?")
  const [summonPreviewAnswer, setSummonPreviewAnswer] = useState("")
  // The prompt only reads the kind and the label off its target, so the preview
  // stands one up rather than hit-testing a real node on the gallery page.
  const summonPreviewTarget = useMemo<SummonTarget>(
    () => ({
      element: document.createElement("div"),
      kind: "row",
      label: "Marlow Freight · MD-22455",
      value: null,
      text: "",
    }),
    [],
  )
  const [previewReportPageId, setPreviewReportPageId] = useState(monthlyReviewPages[0].id)
  const [previewReportControlPage, setPreviewReportControlPage] = useState(1)
  const [previewWidgetQuery, setPreviewWidgetQuery] = useState("")
  const [previewWidgetId, setPreviewWidgetId] = useState(reportWidgets[0].id)
  const [previewDataEditorOpen, setPreviewDataEditorOpen] = useState(false)
  const [previewFavouriteBookingIds, setPreviewFavouriteBookingIds] = useState<Set<string>>(() => new Set(initialFavouriteBookingIds))
  const [previewRoadFavouriteBookingIds, setPreviewRoadFavouriteBookingIds] = useState<Set<string>>(() => new Set(["MD-22676"]))
  const [previewRoadJobs, setPreviewRoadJobs] = useState(() => [...domesticRoadJobs])
  const [previewDateRange, setPreviewDateRange] = useState<MultideckDateRange>({ start: "2026-05-25", end: "2026-06-04" })
  const [previewSingleDate, setPreviewSingleDate] = useState<string | null>("2026-06-04")
  const [previewDateTime, setPreviewDateTime] = useState("2026-06-04T09:30")
  const [previewDateComparisonEnabled, setPreviewDateComparisonEnabled] = useState(false)
  const [previewDateComparisonRange, setPreviewDateComparisonRange] = useState<MultideckDateRange>({ start: "2026-05-14", end: "2026-05-24" })
  const [previewBookingSearch, setPreviewBookingSearch] = useState<FilterQuery>({
    match: "any",
    groups: [
      {
        id: "preview-search-main",
        match: "all",
        conditions: [
          { id: "preview-booking-search-invoice", field: "invoice", operator: "contains", value: "INV-MAR" },
          { id: "preview-booking-search-destination", field: "destination", operator: "contains", value: "Felixstowe" },
        ],
      },
      {
        id: "preview-search-vin",
        match: "all",
        conditions: [{ id: "preview-booking-search-vin", field: "vin", operator: "starts-with", value: "WVW" }],
      },
    ],
  })
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
  const [previewDexterMentions, setPreviewDexterMentions] = useState<DexterMentionItem[]>([])
  const [previewDexterSpecialistId, setPreviewDexterSpecialistId] = useState<DexterSpecialistId>("auto")
  const [previewDexterModelId, setPreviewDexterModelId] = useState<DexterModelId>(defaultDexterModelId)
  const [previewDexterAccessMode, setPreviewDexterAccessMode] = useState<DexterAccessMode>("approve")
  const [previewDexterAttachmentQuery, setPreviewDexterAttachmentQuery] = useState("")
  const [previewDexterAttachmentIds, setPreviewDexterAttachmentIds] = useState<Set<string>>(new Set(["marlow", "md-22414"]))
  const [previewCrmDealId, setPreviewCrmDealId] = useState(crmPipelineStages[0].deals[0].id)
  const [previewCrmLeadId, setPreviewCrmLeadId] = useState(previewCrmLeads[0].id)
  const [previewCrmContactEmail, setPreviewCrmContactEmail] = useState(crmContacts[0].email)
  const [previewContactCreateOpen, setPreviewContactCreateOpen] = useState(false)
  const [previewDriveRenamingId, setPreviewDriveRenamingId] = useState<string | null>(null)
  const [previewTransportModes, setPreviewTransportModes] = useState(["Sea FCL", "Road"])
  const [previewUnifiedChargeRows, setPreviewUnifiedChargeRows] = useState<UnifiedQuoteChargeRow[]>(previewUnifiedChargeRowsSeed)
  const previewNow = useLiveNow()
  const countPreviewBookingMatches = useCallback((query: FilterQuery) => (
    bookings.filter((booking) => matchesFilterQuery(booking, query, previewBookingFilterValue)).length
  ), [])
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

  const previewDexterAttachments = defaultDexterAttachments.filter((attachment) => previewDexterAttachmentIds.has(attachment.id))
  const previewCrmLead = previewCrmLeadDetails.find((lead) => lead.id === previewCrmLeadId) ?? previewCrmLeadDetails[0]

  return (
    <div className="grid min-h-[430px] min-w-0 place-items-center overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] p-[var(--md-gap-xl)]">
      {previewScreenGlow ? (
        <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden>
          <AIEdgeGlow active variant="screen" className="h-screen w-screen rounded-none" />
        </div>
      ) : null}

      {id === "app-breadcrumbs" ? (
        <div className="w-full max-w-[760px] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <AppBreadcrumbs
            route="/crm/leads/northstar-components/convert"
            leafLabel="Northstar Components"
            navigate={(path) => toast.success(`Navigate to ${path}`)}
          />
        </div>
      ) : null}

      {id === "colours" ? (
        <div className="w-full max-w-[720px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colourTokens.map(([label, token]) => (
              <ColourTokenSwatch key={token} label={label} token={token} />
            ))}
          </div>
        </div>
      ) : null}

      {id === "hugeicons-system" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              ["Home", Home03],
              ["Dexter", AiBrain],
              ["Warehouse", Forklift],
              ["Appearance", Moon02],
              ["Settings", Settings2],
            ].map(([label, Icon]) => (
              <div key={label as string} className="grid min-h-24 place-items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                <Icon className="size-6 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
                <span className="text-[11px] font-medium text-[var(--md-ink)]">{t(label as string)}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-5 text-[var(--md-text)]">{t("Every glyph inherits current colour, keeps a calm rounded stroke, and can participate in shared hover, pressed, loading, and morphing states.")}</p>
        </div>
      ) : null}

      {id === "typography" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="flex flex-col gap-[var(--md-page-stack-gap)]">
            {typographyRows.map(([spec, use, sample], index) => (
              <div key={spec} className="grid gap-3 border-b border-[rgba(11,20,19,0.06)] pb-5 last:border-b-0 last:pb-0 md:grid-cols-[150px_1fr]">
                <div>
                  <p className="text-[11px] text-[var(--md-subtle)]">{spec}</p>
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
        <div className="grid w-full max-w-[640px] gap-4 rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div><p className="mb-2 text-[11px] font-medium text-[var(--md-subtle)]">Workflow statuses</p><TablePillKindContext.Provider value="status"><div className="flex flex-wrap gap-2"><StatusPill tone="purple">New</StatusPill><StatusPill tone="orange">Contacted</StatusPill><StatusPill tone="blue">Qualified</StatusPill><StatusPill tone="amber">Nurturing</StatusPill><StatusPill tone="green">Converted</StatusPill><StatusPill tone="red">Disqualified</StatusPill></div></TablePillKindContext.Provider></div>
          <div><p className="mb-2 text-[11px] font-medium text-[var(--md-subtle)]">Descriptive attributes</p><TablePillKindContext.Provider value="attribute"><div className="flex flex-wrap gap-2"><StatusPill tone="teal">Ocean</StatusPill><StatusPill tone="blue">Customer</StatusPill><StatusPill tone="amber">Express</StatusPill><StatusPill tone="neutral">Standard</StatusPill></div></TablePillKindContext.Provider></div>
        </div>
      ) : null}

      {id === "screening-outcome-pill" ? (
        <div className="flex w-full max-w-[560px] flex-wrap items-center justify-center gap-2 rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <ScreeningOutcomePill outcome="clear" />
          <ScreeningOutcomePill outcome="possible_match" />
          <ScreeningOutcomePill outcome="match" stale />
        </div>
      ) : null}

      {id === "screening-list-freshness" ? (
        <div className="w-full max-w-[640px] rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <ScreeningListFreshness
            list={{ loaded: true, sourceName: "UK OFSI consolidated list", publisher: "UK Office of Financial Sanctions Implementation", entryCount: 18420, downloadedAt: new Date().toISOString(), stale: false }}
            action={<Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)]">Refresh list</Button>}
          />
        </div>
      ) : null}

      {id === "screening-match-row" ? (
        <div className="w-full max-w-[640px] overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 shadow-[var(--md-shadow-line)]">
          <ScreeningMatchRow match={{ groupId: "G-88", listedName: "ALFA SHIPPING LTD", matchKind: "exact", score: 1, regime: "Russia", groupType: "Entity", listedOn: "2022-03-01", ukRef: "RUS1234", country: "IR", listingNotes: "Involved in providing logistical support to the Russian government." }} />
          <ScreeningMatchRow match={{ groupId: "G-88", listedName: "ALPHA SHIPPING", matchKind: "similar", score: 0.86, regime: "Russia", groupType: "Entity", listedOn: "2022-03-01", ukRef: "RUS1234", country: "IR", listingNotes: "Involved in providing logistical support to the Russian government." }} />
        </div>
      ) : null}

      {id === "screening-match-list" ? (
        <div className="w-full max-w-[640px] overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 shadow-[var(--md-shadow-line)]">
          <ScreeningMatchList matches={[
            "SHIPPING LTD", "SHIPPING", "TRADING", "LOGISTICS", "MARINE", "HOLDINGS", "INDUSTRIES",
            "EXPORT", "AGENCY", "LINE", "GROUP", "PARTNERS", "SERVICES",
          ].map((suffix, index) => ({
            groupId: `G-${88 + index}`,
            listedName: `ALFA ${suffix}`,
            matchKind: index === 0 ? "exact" as const : "similar" as const,
            score: index === 0 ? 1 : 0.86 - index * 0.002,
            regime: index % 3 === 0 ? "Russia" : index % 3 === 1 ? "Iran" : "Belarus",
            groupType: "Entity",
            listedOn: index > 10 ? "2014-03-18" : "2022-03-01",
            ukRef: `RUS${1234 + index}`,
            country: "IR",
            listingNotes: "Involved in providing logistical support to a designated government.",
          }))} />
        </div>
      ) : null}

      {id === "screening-result-summary" ? (
        <div className="w-full max-w-[640px] overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 py-4 shadow-[var(--md-shadow-line)]">
          <ScreeningResultSummary subjectName="ALFA SHIPPING LTD" country="IR" outcome="match" />
        </div>
      ) : null}

      {id === "kbd" ? (
        <div className="flex w-full max-w-[560px] flex-wrap items-center justify-center gap-4 rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <Kbd>Ctrl</Kbd>
          <Kbd>⌘K</Kbd>
          <KbdGroup><Kbd>Ctrl</Kbd><Kbd>B</Kbd></KbdGroup>
        </div>
      ) : null}

      {id === "shortcut-keys" ? (
        <div className="grid w-full max-w-[560px] gap-3 rounded-[var(--md-radius-xl)] bg-white/60 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          {[
            { label: "Search bookings and quotes", binding: chord("K", { mod: true }) },
            { label: "New booking", binding: chord("B", { mod: true, shift: true }) },
            { label: "Go to Bookings", binding: sequence("G", "B") },
            { label: "Summon Dexter", binding: pointerGesture({ mod: true }) },
            { label: "Turned off", binding: null },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-[var(--md-ink)]">{row.label}</span>
              <ShortcutKeys binding={row.binding} emptyLabel="Off" />
            </div>
          ))}
        </div>
      ) : null}

      {id === "keyboard-shortcuts-panel" ? (
        <div className="w-full max-w-[820px] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
          <KeyboardShortcutsPanel />
        </div>
      ) : null}

      {id === "dexter-summon-prompt" ? (
        <div className="grid w-full max-w-[560px] place-items-center rounded-[var(--md-radius-xl)] bg-white/54 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="w-full max-w-[384px]">
            <DexterSummonPrompt
              target={summonPreviewTarget}
              status={summonPreviewAnswer ? "done" : "ready"}
              question={summonPreviewQuestion}
              answer={summonPreviewAnswer}
              error={null}
              copied={false}
              onQuestionChange={setSummonPreviewQuestion}
              onSubmit={() =>
                setSummonPreviewAnswer(
                  "Marlow Freight is 14 days over its agreed terms on three invoices totalling €18,400. Two sailings are booked for next week, so worth a call before they load.",
                )
              }
              onClose={() => setSummonPreviewAnswer("")}
              onCopy={() => toast.success("Answer copied")}
              onAskAnother={() => setSummonPreviewAnswer("")}
              onContinueInDexter={() => toast.success("Opening this thread in the Dexter workspace")}
            />
          </div>
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
        <div className="relative flex min-h-[300px] w-full max-w-[760px] items-start justify-center overflow-hidden rounded-[var(--md-radius-xl)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--md-surface)_72%,transparent),color-mix(in_srgb,var(--md-surface-tint)_72%,transparent))] p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_78%,transparent)] px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
            onClick={() => {
              toast.success(t("Customer CSV prepared"), {
                description: t("The export is ready to download."),
              })
              toast.warning(t("Declaration needs attention"), {
                description: t("Two checks still need review."),
              })
              toast.info(t("New notification"), {
                description: t("A booking was assigned to you."),
              })
            }}
          >
            {t("Trigger toast stack")}
          </Button>

          <div aria-hidden="true" className="md-toast-gallery-stack pointer-events-none absolute bottom-5 end-5 flex w-[min(520px,calc(100%-40px))] flex-col gap-2">
            <div data-type="info" className="md-toast flex">
              <div className="md-toast-icon shrink-0" data-icon="">
                <img alt="" className="md-toast-status-art" data-toast-icon-kind="general" src={toastGeneralIcon} />
              </div>
              <div className="min-w-0 flex-1" data-content="">
                <p className="md-toast-title" data-title="">{t("New notification")}</p>
                <p className="md-toast-description" data-description="">{t("A booking was assigned to you.")}</p>
              </div>
              <button className="md-toast-close" tabIndex={-1} type="button"><span className="md-toast-dismiss-label">{t("Dismiss")}</span></button>
            </div>
            <div data-type="warning" className="md-toast flex">
              <div className="md-toast-icon shrink-0" data-icon="">
                <img alt="" className="md-toast-status-art" data-toast-icon-kind="warning" src={toastErrorIcon} />
              </div>
              <div className="min-w-0 flex-1" data-content="">
                <p className="md-toast-title" data-title="">{t("Declaration needs attention")}</p>
                <p className="md-toast-description" data-description="">{t("Two checks still need review.")}</p>
              </div>
              <button className="md-toast-close" tabIndex={-1} type="button"><span className="md-toast-dismiss-label">{t("Dismiss")}</span></button>
            </div>
            <div data-type="success" className="md-toast flex">
              <div className="md-toast-icon shrink-0" data-icon="">
                <img alt="" className="md-toast-status-art" data-toast-icon-kind="success" src={toastSuccessIcon} />
              </div>
              <div className="min-w-0 flex-1" data-content="">
                <p className="md-toast-title" data-title="">{t("Customer CSV prepared")}</p>
                <p className="md-toast-description" data-description="">{t("The export is ready to download.")}</p>
              </div>
              <button className="md-toast-close" tabIndex={-1} type="button"><span className="md-toast-dismiss-label">{t("Dismiss")}</span></button>
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
            <SidebarNavItem item={{ label: "Agent Dexter", icon: AiBrain }} accent="dexter" onClick={() => undefined} />
            <SidebarNavItem item={{ label: "Home", icon: galleryIcons.sidebar }} onClick={() => undefined} affordance="branch" />
            <SidebarNavItem item={{ label: "Operations", icon: Ship }} onClick={() => undefined} affordance="branch" />
            <SidebarNavItem item={{ label: "Sales", icon: galleryIcons["crm-pipeline-board"] }} onClick={() => undefined} affordance="branch" />
            <SidebarNavItem item={{ label: "CRM", icon: galleryIcons["crm-metrics-grid"] }} onClick={() => undefined} affordance="branch" />
          </div>
          <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
            <SidebarNavItem item={{ label: "Agent Dexter", icon: AiBrain }} accent="dexter" onClick={() => undefined} />
            <div className="mb-3 flex items-center gap-2 px-2 text-[12px] font-medium text-[var(--md-subtle)]">
              <ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              <span>Operations</span>
            </div>
            <SidebarNavItem
              item={{ label: "Bookings & jobs", icon: Ship }}
              onClick={() => undefined}
              expanded
              affordance="group"
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

      {id === "sidebar-item-menu" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
          <p className="mb-2 px-2 text-[11px] text-[var(--md-subtle)]">Right-click a row to pin or reorder it.</p>
          {previewSidebarRows.map((row) => {
            const pinned = previewSidebarPinnedIds.includes(row.id)

            return (
              <SidebarItemMenu
                key={row.id}
                pinned={pinned}
                onTogglePin={() =>
                  setPreviewSidebarPinnedIds((current) =>
                    current.includes(row.id) ? current.filter((entry) => entry !== row.id) : [...current, row.id],
                  )
                }
                onReorder={() => undefined}
              >
                <SidebarNavItem
                  item={{ label: row.label, icon: row.icon }}
                  trailing={pinned ? <Pin className="size-3 -rotate-[32deg] text-[var(--md-accent)]" strokeWidth={1.6} /> : undefined}
                  onClick={() => undefined}
                />
              </SidebarItemMenu>
            )
          })}
        </div>
      ) : null}

      {id === "sidebar-arrange-canvas" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] px-4 pb-4 pt-1 shadow-[var(--md-shadow-line)]">
          <SidebarArrangeCanvas
            items={previewSidebarRows}
            order={previewArrangeOrder}
            pinned={previewArrangePinned}
            defaultOrder={previewSidebarOrder}
            onSave={(next) => {
              setPreviewArrangeOrder(next.order)
              setPreviewArrangePinned(next.pinned)
            }}
            onCancel={() => undefined}
          />
        </div>
      ) : null}

      {id === "theme-toggle" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
          <ThemeToggle className="bg-[var(--md-glass)]" />
        </div>
      ) : null}

      {id === "pdf-document-viewer-dialog" ? <PdfDocumentViewerDialogPreview /> : null}

      {id === "document-workspace" ? (
        <div className="w-full max-w-[1120px]">
          <DocumentWorkspace documents={documentWorkspaceSampleDocuments} />
        </div>
      ) : null}

      {id === "document-extraction-progress" ? (
        <div className="w-full max-w-[720px]">
          <DocumentExtractionProgress
            title="Preparing invoice lines"
            detail="This may take a moment. You can review every line before applying it."
            fileName="northwind-commercial-invoice.pdf"
            pageCount={3}
            previewUrl={previewDocumentPageUrl}
            stages={previewExtractionStages}
            activeStageId="extracting"
            footnote="Nothing is added to the declaration until you approve it."
            onCancel={() => toast.info("Would cancel the import")}
          />
        </div>
      ) : null}

      {id === "document-evidence-viewer" ? (
        <div className="w-full max-w-[520px]">
          <DocumentEvidenceViewerPreview />
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
        <div className="grid w-full max-w-[620px] gap-4 rounded-[var(--md-radius-xl)] bg-white/54 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--md-ink)]">Collection dates</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">A paired range that can expand into a side-by-side comparison without losing context.</p>
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
            comparison={{
              enabled: previewDateComparisonEnabled,
              value: previewDateComparisonRange,
              onEnabledChange: setPreviewDateComparisonEnabled,
              onChange: setPreviewDateComparisonRange,
              options: [
                { id: "previous-period", label: "Previous period", range: { start: "2026-05-14", end: "2026-05-24" } },
                { id: "last-thirty", label: "Last 30 days", range: { start: "2026-04-25", end: "2026-05-24" } },
                { id: "custom", label: "Custom", range: null },
              ],
            }}
          />
          <div className="grid gap-3 border-t border-[var(--md-border)] pt-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">Single date</p>
              <MultideckDatePicker value={previewSingleDate} onChange={setPreviewSingleDate} title="Expiry date" description="Pick the date this stock expires." />
            </div>
            <div className="grid gap-1.5">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">Date and time</p>
              <MultideckDateTimePicker value={previewDateTime} onChange={setPreviewDateTime} title="Appointment" description="Pick the appointment date and time." />
            </div>
          </div>
        </div>
      ) : null}

      {id === "inbox-thread-row" ? (
        <div className="w-full max-w-[420px] rounded-[var(--md-radius-xl)] bg-white/50 p-2 shadow-[var(--md-shadow-line)]">
          <div className="flex flex-col gap-0.5">
            {previewInboxThreads.map((item) => (
              <InboxThreadRow
                key={item.id}
                thread={{ ...item, starred: previewInboxStarred.has(item.id) }}
                selected={item.id === previewInboxThreadId}
                ownAddresses={["harry.phillips@northwind-forwarding.com"]}
                selectionLayoutId="preview-inbox-thread-selection"
                onSelect={() => setPreviewInboxThreadId(item.id)}
                onToggleStar={() =>
                  setPreviewInboxStarred((current) => {
                    const next = new Set(current)
                    if (next.has(item.id)) next.delete(item.id)
                    else next.add(item.id)
                    return next
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {id === "email-delivery-status" ? (
        <div className="flex w-full max-w-[520px] flex-wrap items-center justify-center gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <EmailDeliveryStatus
            delivery={{
              status: "sent",
              sentAt: "2026-08-03T14:42:00.000Z",
              deliveredAt: null,
              openedAt: null,
              repliedAt: null,
              failedAt: null,
              bouncedAt: null,
              openTrackingEnabled: false,
              confidence: "none",
            }}
          />
          <EmailDeliveryStatus
            delivery={{
              status: "opened_estimated",
              sentAt: "2026-08-03T14:42:00.000Z",
              deliveredAt: null,
              openedAt: "2026-08-03T14:48:00.000Z",
              repliedAt: null,
              failedAt: null,
              bouncedAt: null,
              openTrackingEnabled: true,
              confidence: "estimated",
            }}
          />
          <EmailDeliveryStatus
            delivery={{
              status: "bounced",
              sentAt: "2026-08-03T14:42:00.000Z",
              deliveredAt: null,
              openedAt: null,
              repliedAt: null,
              failedAt: null,
              bouncedAt: "2026-08-03T14:43:00.000Z",
              openTrackingEnabled: true,
              confidence: "confirmed",
            }}
          />
        </div>
      ) : null}

      {id === "mailbox-provider-switch" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-white/50 p-3 shadow-[var(--md-shadow-line)]">
          <MailboxProviderSwitch
            providers={["gmail", "outlook"]}
            provider={previewMailProvider}
            onProviderChange={(next) => {
              setPreviewMailProvider(next)
              const first = previewMailboxes.find((mailbox) => mailbox.provider === next)
              if (first) setPreviewMailboxId(first.id)
            }}
            mailboxes={previewMailboxes.filter((mailbox) => mailbox.provider === previewMailProvider)}
            selectedMailboxId={previewMailboxId}
            onMailboxChange={(mailbox) => setPreviewMailboxId(mailbox.id)}
            onReconnect={() => toast.success("Would open the provider sign-in")}
          />
        </div>
      ) : null}

      {id === "email-message-renderer" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3.5 shadow-[var(--md-shadow-line)]">
          <EmailMessageRenderer sanitizedHtml={previewEmailHtml} bodyText={null} />
        </div>
      ) : null}

      {id === "thread-summary" ? (
        <div className="grid w-full max-w-[620px] gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Ready", value: previewInboxSummary },
              { label: "Generating", value: { ...previewInboxSummary, status: "pending" as const, text: null } },
              { label: "Out of date", value: { ...previewInboxSummary, status: "stale" as const } },
              { label: "Failed", value: { ...previewInboxSummary, status: "failed" as const, text: null, error: "Dexter could not reach the model." } },
              { label: "Not summarised", value: { status: "none" as const, text: null, keyPoints: [], sourceMessageIds: [], model: null, updatedAt: null, error: null } },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={previewSummaryState.status === option.value.status}
                className={cn(
                  "h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium shadow-[var(--md-shadow-line)] transition-[background-color,color] duration-150",
                  previewSummaryState.status === option.value.status
                    ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]"
                    : "bg-[var(--md-surface)] text-[var(--md-text)] hover:bg-[var(--md-hover)]",
                )}
                onClick={() => setPreviewSummaryState(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {previewSummaryState.status === "none" ? (
            <DexterActionPill
              label="Summarise"
              onClick={() => setPreviewSummaryState({ ...previewInboxSummary, status: "pending", text: null })}
            />
          ) : (
            <ThreadSummary
              summary={previewSummaryState}
              sources={[
                { messageId: "msg-1", label: "Claire Osei" },
                { messageId: "msg-2", label: "Compliance team" },
              ]}
              onRegenerate={() => setPreviewSummaryState({ ...previewInboxSummary, status: "pending", text: null })}
              onOpenSource={(messageId) => toast.success(`Would scroll to ${messageId}`)}
            />
          )}
        </div>
      ) : null}

      {id === "mail-composer" ? (
        <div className="w-full max-w-[620px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] py-3 shadow-[var(--md-shadow-line)]">
          <MailComposer
            state={previewComposer}
            onStateChange={setPreviewComposer}
            mailbox={previewMailboxes[0]}
            status="idle"
            error={null}
            threadSubject="Dual-use licence for the Rotterdam consignment"
            replyAudience={{
              label: "Everyone on this message",
              detail: "Multideck resolves the full list from the message you are replying to when it sends.",
            }}
            canSend={previewComposer.bodyText.trim().length > 0}
            onSend={() => toast.success("Would send with mode and source message only")}
            onSaveDraft={() => toast.success("Draft saved")}
            onDiscard={() => setPreviewComposer((current) => ({ ...current, bodyText: "", presentation: "docked" }))}
            onComposeWithDexter={() => toast.success("Dexter would prepare wording in place")}
            dexterAction={previewComposer.mode === "reply" || previewComposer.mode === "reply_all" ? "reply" : "compose"}
          />
        </div>
      ) : null}

      {id === "segmented-control" ? (
        <div className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-white/50 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <SegmentedControl options={bookingViewModes} value={previewBookingView} onChange={setPreviewBookingView} />
        </div>
      ) : null}

      {id === "choice-control" ? (
        <div className="grid w-full max-w-[620px] gap-5 rounded-[var(--md-radius-xl)] bg-white/50 p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <div className="grid gap-2">
            <span className="text-[12px] font-medium text-[var(--md-text)]">Two choices</span>
            <ChoiceControl options={bookingViewModes} value={previewBookingView} onChange={setPreviewBookingView} ariaLabel="Booking view" />
          </div>
          <div className="grid gap-2">
            <span className="text-[12px] font-medium text-[var(--md-text)]">Five or more choices</span>
            <ChoiceControl options={["OCEAN", "AIR", "ROAD", "FAS", "FSA"]} value={previewChoiceMode} onChange={setPreviewChoiceMode} ariaLabel="Transport mode" />
          </div>
        </div>
      ) : null}

      {id === "checkbox" ? (
        <label className="flex w-full max-w-[420px] cursor-pointer items-center gap-3 rounded-[var(--md-radius-xl)] bg-white/50 p-[var(--md-gap-xl)] text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          <Checkbox checked={previewCheckbox} onCheckedChange={(checked) => setPreviewCheckbox(checked === true)} />
          Include customs documents
        </label>
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
            rows={previewChargeRows.filter((row) => (previewTableView === "All" || row.sell > row.cost) && (!previewTableStatus || row.status === previewTableStatus) && (!previewTableSearch.trim() || `${row.id} ${row.description} ${row.supplier}`.toLowerCase().includes(previewTableSearch.trim().toLowerCase())))}
            getRowKey={(row) => row.id}
            storageKey="gallery-charge-table"
            ariaLabel="Quote charges preview"
            toolbarTabs={<RegisterViewSwitch options={["All", "Profitable"] as const} value={previewTableView} onChange={setPreviewTableView} counts={{ All: previewChargeRows.length, Profitable: previewChargeRows.filter((row) => row.sell > row.cost).length }} ariaLabel="Charge view" compact />}
            toolbarSearch={<RegisterSearchField value={previewTableSearch} onChange={setPreviewTableSearch} onClear={() => setPreviewTableSearch("")} label="Search charges" placeholder="Search charges…" />}
            toolbarFilters={<RegisterFacetSelect label="Status" allLabel="All statuses" value={previewTableStatus} options={["Approved", "Review", "Blocked"].map((status) => ({ value: status, label: status }))} onChange={setPreviewTableStatus} className="w-[132px]" />}
          />
        </div>
      ) : null}

      {id === "unified-quote-charges-workspace" ? (
        <div className="w-full max-w-[1320px]">
          <UnifiedQuoteChargesWorkspace rows={previewUnifiedChargeRows} onRowsChange={setPreviewUnifiedChargeRows} storageKey="gallery-unified-quote-charges" />
        </div>
      ) : null}

      {id === "quote-search-builder" ? (
        <div className="flex w-full max-w-[1120px] justify-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4">
          <AdvancedFilterPopover
            fields={quoteSearchFieldOptions}
            value={previewQuoteSearch}
            onChange={setPreviewQuoteSearch}
            storageKey="gallery-quote-filters"
            label="Advanced search"
            title="Advanced quote search"
            itemLabel="quotes"
            align="center"
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
            <Input id="gallery-facility-code" dir="ltr" defaultValue="FXT-DC1" className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" />
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
            <Input id="gallery-country" dir="ltr" defaultValue="GBR" className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" />
          </WarehouseFormField>
        </div>
      ) : null}

      {id === "warehouse-quantity-uom-field" ? (
        <div className="w-full max-w-[420px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <WarehouseQuantityUomField label="Quantity to sample" value={previewWarehouseQuantity} onChange={setPreviewWarehouseQuantity} uomCode="KG" max={387.5} />
        </div>
      ) : null}

      {id === "purchase-order-line-editor" ? (
        <div className="w-full max-w-[980px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <PurchaseOrderLineEditor
            lines={previewPurchaseOrderLines}
            items={previewPurchaseOrderReference.items}
            facilityId="gallery-facility"
            customerOrgId="gallery-customer"
            itemLoading={false}
            itemsHaveMore={false}
            onItemSearch={() => undefined}
            onItemSelected={() => undefined}
            onChange={setPreviewPurchaseOrderLines}
          />
        </div>
      ) : null}

      {id === "rate-charge-line-editor" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <RateChargeLineEditor charges={previewRateCharges} onChange={setPreviewRateCharges} />
        </div>
      ) : null}

      {id === "rate-pricing-rule-control" ? (
        <div className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <RatePricingRuleControl value={previewRatePricing} onChange={setPreviewRatePricing} />
        </div>
      ) : null}

      {id === "warehouse-object-summary" ? (
        <div className="w-full max-w-[480px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <WarehouseObjectSummary unit={previewWarehouseObject} />
        </div>
      ) : null}

      {id === "warehouse-exception-summary" ? (
        <div className="w-full max-w-[560px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <WarehouseExceptionSummary exception={previewWarehouseException} />
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

      {id === "priority-queue" ? (
        <div className="md-kpi-scope w-full max-w-[1120px]">
          <DashboardPriorityQueue
            items={previewPriorityItems}
            operatorName="Amelia Rowe"
            onOpenItem={(item) => toast.success(`${item.reference} opened`)}
            onHandOverToDexter={(item) => toast.success(`${item.reference} handed over to Dexter`)}
          />
        </div>
      ) : null}

      {id === "performance-panel" ? (
        <div className="md-kpi-scope w-full max-w-[1120px]">
          <KpiStrip
            kpis={previewPerformanceKpis}
            selectedLabel={previewPerformanceKpis[0].label}
            spark={false}
            markerId="gallery-performance-rule"
            className="mb-[var(--md-gap-lg)]"
          />
          <DashboardPerformancePanel
            kpis={previewPerformanceKpis}
            trends={previewPerformanceTrends}
            metricLabel={previewPerformanceKpis[0].label}
          />
        </div>
      ) : null}

      {id === "breakdown-panel" ? (
        <div className="grid w-full max-w-[720px] gap-[var(--md-gap-lg)] sm:grid-cols-2">
          <DashboardBreakdownPanel
            title="Mode mix"
            subtitle="Live bookings by transport mode"
            slices={[
              { label: "Ocean", value: 12, color: "var(--md-accent)" },
              { label: "Air", value: 6, color: "var(--md-blue)" },
              { label: "Road", value: 3, color: "var(--md-green)" },
            ]}
            variant="segmented"
            totalLabel="in transit"
          />
          <DashboardBreakdownPanel
            title="Quote pipeline"
            subtitle="Open quotes by workflow stage"
            slices={[
              { label: "Carrier pricing", value: 8, color: "var(--md-accent)" },
              { label: "Awaiting customer", value: 5, color: "var(--md-accent-tint)" },
              { label: "Internal review", value: 3, color: "var(--md-accent-glow-core)" },
              { label: "Drafting", value: 1, color: "var(--md-blue)" },
            ]}
            variant="columns"
          />
        </div>
      ) : null}

      {id === "coverage-panel" ? (
        <div className="w-full max-w-[420px]">
          <DashboardCoveragePanel onViewQueue={(code) => toast.success(`${code} queue opened`)} />
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

      {id === "booking-search-builder" ? (
        <div className="flex w-full max-w-[1120px] justify-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4">
          <AdvancedFilterPopover
            fields={previewBookingFilterFields}
            value={previewBookingSearch}
            onChange={setPreviewBookingSearch}
            storageKey="gallery-booking-filters"
            label="Advanced search"
            title="Advanced booking search"
            itemLabel="bookings"
            countMatches={countPreviewBookingMatches}
            totalCount={bookings.length}
            align="center"
          />
        </div>
      ) : null}

      {id === "bookings-table" ? (
        <div className="w-full max-w-[1120px] overflow-x-auto md-scrollbar">
          <BookingsTable
            rows={bookings.slice(0, 4)}
            favouriteIds={previewFavouriteBookingIds}
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
            onMoveJob={(_jobId, _stage, orderedJobs) => setPreviewRoadJobs(orderedJobs)}
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
            <Button type="button" className="mt-4 h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent)]/88" onClick={() => setPreviewDataEditorOpen(true)}>
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

      {id === "dexter-mention-input" ? (
        <div className="w-full max-w-[760px] rounded-[var(--md-radius-xl)] bg-[var(--md-composer-panel-bg)] p-5 shadow-[var(--md-shadow-line)]">
          <DexterMentionInput
            value={previewDexterPrompt}
            items={defaultDexterMentionItems}
            selectedMentions={previewDexterMentions}
            placeholder="Type @ to mention workspace context"
            minHeight={76}
            maxHeight={232}
            canSend={Boolean(previewDexterPrompt.trim())}
            onChange={setPreviewDexterPrompt}
            onMentionsChange={setPreviewDexterMentions}
            onSend={() => toast.success("Mention-aware prompt ready")}
          />
          <p className="mt-3 text-[11.5px] text-[var(--md-subtle)]">Type @, then use the arrow keys and Enter to add a reference.</p>
        </div>
      ) : null}

      {id === "dexter-inline-citation" ? (
        <div className="w-full max-w-[680px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 text-[13px] leading-6 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          <p>
            <DexterInlineCitation
              href="/crm/leads/8f81256b-3f0a-4c48-9d95-bd40ec63dc66"
              title="Northwind Logistics"
            >
              Northwind has a follow-up due today
            </DexterInlineCitation>
            . I would prioritise it before the afternoon quote review.
          </p>
        </div>
      ) : null}

      {id === "dexter-email-attachment-card" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <DexterEmailAttachmentCard
            attachment={{
              id: "gallery-email-attachment",
              provider: "gmail",
              mailboxId: "gallery-mailbox",
              threadId: "gallery-thread",
              messageId: "gallery-message",
              subject: "Booking confirmation · MD-22455",
              fileName: "booking-confirmation.txt",
              mimeType: "text/plain",
              sizeBytes: 1_824,
              sourceUrl: "/inbox?provider=gmail&mailbox=931169d1-3a01-4c57-ac36-290a559d21bc&thread=45b92d1f-4d13-4d79-80c1-4cb338c5d2de",
            }}
            loadAttachment={async () => {
              const url = URL.createObjectURL(new Blob([
                "Booking confirmation\nReference: MD-22455\nVessel: Aurora North\nStatus: Confirmed",
              ], { type: "text/plain" }))
              return { url, revoke: () => URL.revokeObjectURL(url) }
            }}
            variant="watch"
            onAskDexter={() => toast.success("Attachment added to Dexter")}
          />
        </div>
      ) : null}

      {id === "dexter-email-compose-card" ? (
        <div className="w-full max-w-[720px]">
          <DexterEmailComposeCard
            messageId="gallery-dexter-message"
            preview
            draft={{
              id: "gallery-dexter-email-draft",
              requestedAction: "create_draft",
              mode: "reply",
              mailboxId: "preview-mailbox",
              threadId: "gallery-thread",
              sourceMessageId: "gallery-source-message",
              to: [{ address: "maya@pacificgoods.example", displayName: "Maya Chen" }],
              cc: [],
              bcc: [],
              subject: "Re: Felixstowe handover",
              bodyText: "Hi Maya,\n\nThanks for checking. The cleared documents are with the local team, and I’ll confirm the handover time as soon as the carrier updates the booking.\n\nBest,\nHarry",
              trackOpens: false,
              delivery: { status: "draft", sendRequestId: null, messageId: null, threadId: null, updatedAt: null },
            }}
          />
        </div>
      ) : null}

      {id === "dexter-prompt-composer" ? (
        <div className="w-full max-w-[760px]">
          <DexterPromptComposer
            value={previewDexterPrompt}
            selectedSpecialistId={previewDexterSpecialistId}
            selectedModelId={previewDexterModelId}
            accessMode={previewDexterAccessMode}
            contextUsedTokens={40_000}
            contextMaxTokens={128_000}
            attachments={previewDexterAttachments}
            mentionItems={defaultDexterMentionItems}
            selectedMentions={previewDexterMentions}
            onChange={setPreviewDexterPrompt}
            onMentionsChange={setPreviewDexterMentions}
            onOpenAttachments={() => toast.success("File chooser opened")}
            attachmentActionLabel="Upload files"
            onSelectSpecialist={setPreviewDexterSpecialistId}
            onSelectModel={setPreviewDexterModelId}
            onAccessModeChange={setPreviewDexterAccessMode}
            onRemoveAttachment={togglePreviewDexterAttachment}
            onSend={() => toast.success("Dexter conversation started")}
          />
        </div>
      ) : null}

      {id === "watch-mode-aurora" ? (
        <div className="relative h-[420px] w-full max-w-[820px] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] shadow-[var(--md-shadow-line)]">
          <WatchModeAurora active />
          <div className="relative z-10 flex h-full items-center justify-center px-6 text-center">
            <div>
              <BrainCircuit className="mx-auto size-6 text-[var(--md-accent)]" strokeWidth={1.35} />
              <p className="mt-4 text-[20px] font-medium text-[var(--md-ink)]">What do you want me to watch?</p>
              <p className="mt-2 text-[13px] text-[var(--md-text)]">A subtle, accent-matched mode cue rises from the bottom edge.</p>
            </div>
          </div>
        </div>
      ) : null}

      {id === "dexter-live-reasoning" ? (
        <div className="w-full max-w-[680px] py-1">
          <Reasoning defaultOpen={false} isStreaming className="mb-0">
            <ReasoningTrigger
              className="min-h-8 text-[12.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]"
              getThinkingMessage={() => <span>Reasoning</span>}
            />
            <ReasoningContent className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
              {"Understanding your request\n\nChecking connected workspace data\n\nPreparing a grounded response"}
            </ReasoningContent>
          </Reasoning>
        </div>
      ) : null}

      {id === "dexter-reasoning-summary" ? (
        <div className="w-full max-w-[680px] py-1">
          <Reasoning defaultOpen={false} isStreaming={false} className="mb-0">
            <ReasoningTrigger
              className="min-h-8 text-[12.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]"
              getThinkingMessage={() => <span>Reasoning summary</span>}
            />
            <ReasoningContent className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">
              {"Matched the booking reference to the attached Marlow Apparel context.\n\nCompared the current milestones and exception data before preparing the answer."}
            </ReasoningContent>
          </Reasoning>
        </div>
      ) : null}

      {id === "dexter-action-approval" ? (
        <div className="w-full max-w-[680px]">
          <DexterActionApproval
            action={{
              id: "preview-update-lead",
              title: "Update Northwind Logistics",
              description: "Change the lead status to Qualified and assign the next follow-up to 4 August.",
              changes: [
                { field: "status", value: "Qualified", before: "New", after: "Qualified", beforeKnown: true, kind: "changed" },
                { field: "next follow up", value: "4 August 2026", before: null, after: "4 August 2026", beforeKnown: true, kind: "added" },
              ],
            }}
            onDecision={(decision) => toast.success(decision === "approve" ? "Change approved" : "Change denied")}
          />
        </div>
      ) : null}

      {id === "context-usage-meter" ? (
        <div className="flex w-full max-w-[360px] justify-center rounded-[var(--md-radius-xl)] bg-[var(--md-composer-panel-bg)] p-[var(--md-gap-xl)] shadow-[var(--md-shadow-line)]">
          <Context
            usedTokens={40_000}
            maxTokens={128_000}
            label={t("Conversation context")}
            description={t("How much of this chat Dexter can keep in mind.")}
            locale={language}
          >
            <ContextTrigger className="md-composer-chip h-9 rounded-full px-2.5 text-[12.5px] text-[var(--md-text)]" />
            <ContextContent side="top" sideOffset={10}>
              <ContextContentHeader />
            </ContextContent>
          </Context>
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
        <div className="flex w-full max-w-[760px] justify-start rounded-[var(--md-radius-xl)] bg-[var(--md-composer-shell-bg)] p-[var(--md-gap-lg)] shadow-[var(--md-shadow-line)]">
          <DexterRoleMenu
            specialists={defaultDexterSpecialists}
            selectedId={previewDexterSpecialistId}
            onSelect={setPreviewDexterSpecialistId}
          />
        </div>
      ) : null}

      {id === "dexter-model-menu" ? (
        <div className="flex w-full max-w-[760px] justify-start rounded-[var(--md-radius-xl)] bg-[var(--md-composer-inner-bg)] p-[var(--md-gap-lg)] shadow-[var(--md-shadow-line)]">
          <DexterModelMenu selectedId={previewDexterModelId} onSelect={setPreviewDexterModelId} />
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
            onUploadFiles={(files) => toast.success(`${files.length} local ${files.length === 1 ? "file" : "files"} selected`)}
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
        <div className="grid w-full max-w-[336px] gap-2.5">
          <DexterMonitorCard
            monitor={{
              id: "gallery-monitor-fired",
              title: "Berth queue - MD-22479",
              body: "Watching Rotterdam congestion. Re-pings if ETA shifts more than 6h.",
              detail: "MD-22479 ETA moved from 04 Jun to 06 Jun.",
              triggerCount: 2,
              latestEvent: {
                id: "gallery-monitor-event",
                title: "ETA shifted",
                body: "MD-22479 ETA moved from 04 Jun to 06 Jun.",
                changed: {},
                createdAt: new Date(Date.now() - 36 * 60_000).toISOString(),
              },
            }}
          />
          <DexterMonitorCard
            monitor={{
              id: "gallery-monitor-armed",
              title: "Marlow quote accepted",
              body: "Alert me when a live quote for Marlow Apparel becomes accepted.",
              detail: "No alerts yet",
            }}
            index={1}
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
                id: "gallery-email-watch",
                title: "Berth queue - MD-22479",
                body: "Watching Rotterdam congestion. Re-pings if ETA shifts more than 6h.",
                detail: "Email from Maria Chen: Invoice for MD-22479",
                ruleLabel: "Emails from maria@example.com that mention “MD-22479”.",
                targetLabel: "MD-22479",
                capability: "email",
                status: "active",
                healthStatus: "healthy",
                lastSourceCheckAt: "2026-08-02T16:14:02Z",
                triggerCount: 1,
                latestEvent: {
                  id: "gallery-watch-event",
                  title: "Invoice received",
                  body: "New matching email from Maria Chen: Invoice for MD-22479",
                  changed: {},
                  createdAt: "2026-08-02T16:13:29Z",
                  context: {
                    kind: "email",
                    availability: "available",
                    provider: "gmail",
                    mailboxId: "gallery-mailbox",
                    messageId: "gallery-message",
                    threadId: "gallery-thread",
                    senderName: "Maria Chen",
                    senderEmail: "maria@example.com",
                    subject: "Invoice for MD-22479",
                    receivedAt: "2026-08-02T16:13:29Z",
                    preview: "Please find the final supplier invoice attached for the Rotterdam shipment.",
                    sourceUrl: "/inbox?provider=gmail&mailbox=gallery-mailbox&thread=gallery-thread",
                    attachments: [{
                      id: "gallery-email-attachment",
                      provider: "gmail",
                      mailboxId: "gallery-mailbox",
                      messageId: "gallery-message",
                      threadId: "gallery-thread",
                      subject: "Invoice for MD-22479",
                      fileName: "invoice-md-22479.pdf",
                      mimeType: "application/pdf",
                      sizeBytes: 284220,
                      sourceUrl: "/inbox?provider=gmail&mailbox=gallery-mailbox&thread=gallery-thread",
                    }],
                  },
                },
              }}
              floating={false}
              onClose={() => toast.success("Monitor detail closed")}
              onAskEvent={() => toast.success("Update added to Dexter")}
              onAskAttachment={() => toast.success("Attachment added to Dexter")}
              onSetStatus={(status) => toast.success(`Watch ${status === "paused" ? "paused" : "resumed"}`)}
              onDelete={() => toast.success("Watch deleted")}
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

      {id === "drive-folder-tile" ? (
        <div className="md-drive-grid w-full max-w-[760px]">
          {previewDriveFolders.map((folder) => (
            <DriveFolderTile
              key={folder.id}
              folder={folder}
              stats={previewDriveFolderStats.get(folder.id)}
              renaming={previewDriveRenamingId === folder.id}
              onOpen={(target) => toast.success(`${target.name} opened`)}
              onRename={(target, name) => {
                setPreviewDriveRenamingId(null)
                toast.success(`${target.name} renamed to ${name}`)
              }}
              onStartRename={(target) => setPreviewDriveRenamingId(target.id)}
              onCancelRename={() => setPreviewDriveRenamingId(null)}
              onCustomise={(target) => toast.success(`${target.name} appearance opened`)}
              onDelete={(target) => toast.success(`${target.name} delete confirmed`)}
            />
          ))}
        </div>
      ) : null}

      {id === "drive-file-tile" ? (
        <div className="md-drive-grid w-full max-w-[760px]">
          {previewDriveFiles.map((file, index) => (
            <DriveFileTile
              key={file.id}
              file={file}
              thumbnailUrl={null}
              pending={index === previewDriveFiles.length - 1}
              progress={0.42}
              renaming={previewDriveRenamingId === file.id}
              onOpen={(target) => toast.success(`${target.name} opened`)}
              onRename={(target, name) => {
                setPreviewDriveRenamingId(null)
                toast.success(`${target.name} renamed to ${name}`)
              }}
              onStartRename={(target) => setPreviewDriveRenamingId(target.id)}
              onCancelRename={() => setPreviewDriveRenamingId(null)}
              onDownload={(target) => toast.success(`${target.name} downloaded`)}
              onDelete={(target) => toast.success(`${target.name} delete confirmed`)}
            />
          ))}
        </div>
      ) : null}

      {id === "dot-grid-loader" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid min-h-[132px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
            <DotGridLoader label="Loading…" />
          </div>
          <div className="grid min-h-[132px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
            <DotGridLoader />
          </div>
          <div className="grid min-h-[132px] place-items-center gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
            <div className="flex h-8 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 shadow-[var(--md-shadow-line)]">
              <DotGridLoader size="sm" />
              <span className="text-[12px] text-[var(--md-text)]">Toolbar size</span>
            </div>
          </div>
        </div>
      ) : null}

      {id === "register-toolbar" ? (
        <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 bg-[color-mix(in_srgb,var(--md-surface)_92%,transparent)] px-2 py-1 shadow-[inset_0_-1px_0_rgba(11,20,19,0.05)]">
            <div className="flex min-w-0 items-center gap-2">
              <RegisterViewSwitch
                options={galleryRegisterViews}
                value={galleryRegisterView}
                onChange={setGalleryRegisterView}
                counts={{ Stock: 33, Objects: 32, Movements: 71, Exceptions: 13 }}
                ariaLabel="Inventory view"
              />
              <RegisterToolbarDivider />
              <button type="button" className={registerButtonClass}>New</button>
            </div>
            <div className="ms-auto flex min-w-[min(100%,560px)] flex-1 flex-wrap items-center justify-end gap-1.5">
              <RegisterToolbarActions pending={galleryRegisterPending}>
                <RegisterFacetSelect
                  label="Condition"
                  allLabel="All conditions"
                  value={galleryRegisterCondition}
                  options={[{ value: "available", label: "Available" }, { value: "quarantine", label: "Quarantine" }]}
                  onChange={setGalleryRegisterCondition}
                  className="w-[132px] sm:w-[150px]"
                />
                <RegisterSearchField
                  value={galleryRegisterSearch}
                  onChange={setGalleryRegisterSearch}
                  onClear={() => setGalleryRegisterSearch("")}
                  label="Search warehouse records"
                  placeholder="SKU, pallet, batch"
                />
                <RegisterRefreshButton pending={galleryRegisterPending} onRefresh={() => setGalleryRegisterPending((current) => !current)} />
              </RegisterToolbarActions>
            </div>
          </div>
          <p className="px-3 py-6 text-center text-[12px] text-[var(--md-text)]">
            The table body goes here. Press refresh to see the revalidation mark appear beside the filters.
          </p>
        </div>
      ) : null}

      {id === "context-menu" ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className="grid h-[132px] w-full max-w-[420px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background-color] duration-160 hover:bg-[var(--md-surface-tint)]"
            >
              Right-click anywhere in here
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => toast.success("Preview opened")}>
              <Eye strokeWidth={1.3} />
              Preview
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => toast.success("Rename started")}>
              <Pencil strokeWidth={1.3} />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => toast.success("Download started")}>
              <Download strokeWidth={1.3} />
              Download
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => toast.success("Delete confirmed")}>
              <Trash2 strokeWidth={1.3} />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
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

      {id === "contact-create-dialog" ? (
        <div className="grid w-full max-w-[520px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-8 shadow-[var(--md-shadow-line)]">
          <Button onClick={() => setPreviewContactCreateOpen(true)}>New contact</Button>
          <ContactCreateDialog
            open={previewContactCreateOpen}
            onOpenChange={setPreviewContactCreateOpen}
            accounts={[
              { id: "preview-marlow", name: "Marlow Apparel" },
              { id: "preview-northstar", name: "Northstar Components" },
            ]}
            onCreated={() => setPreviewContactCreateOpen(false)}
          />
        </div>
      ) : null}

      {id === "crm-lead-qualification-table" ? (
        <div className="w-full max-w-[1240px]">
          <CrmLeadQualificationTable
            leads={previewCrmLeads}
            onOpenLead={(lead) => setPreviewCrmLeadId(lead.id)}
            emptyMessage="No leads have been recorded yet."
          />
        </div>
      ) : null}

      {id === "copyable-field" ? (
        <div className="grid w-full max-w-[520px] gap-4 rounded-[var(--md-radius-xl)] bg-white/60 p-5 shadow-[var(--md-shadow-line)]">
          <div>
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">Company email</p>
            <CopyableField label="Company email" value="ops@northstar.example" className="mt-1">
              <a href="mailto:ops@northstar.example" className="truncate text-[14px] font-medium text-[var(--md-accent)] hover:underline">
                ops@northstar.example
              </a>
            </CopyableField>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">Open opportunities</p>
            <CopyableField label="Open opportunities" value="4" className="mt-1">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">4</p>
            </CopyableField>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">Address</p>
            <CopyableField
              label="Address"
              value="Unit 14, Northgate Logistics Park, Trafford Way, Manchester M17 8QP, United Kingdom"
              className="mt-1 max-w-full"
              contentClassName="max-w-full"
            >
              <span className="break-words text-[14px] font-medium text-[var(--md-ink)]">
                Unit 14, Northgate Logistics Park, Trafford Way, Manchester M17 8QP, United Kingdom
              </span>
            </CopyableField>
          </div>
        </div>
      ) : null}

      {id === "crm-lead-detail-panel" ? (
        <div className="w-full max-w-[1320px]">
          <CrmLeadDetailPanel
            lead={previewCrmLead}
            onStartQualification={(lead) => toast.success(`${lead.companyName} qualification opened`)}
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
          <CrmSettingsBuilder pipelines={crmPipelineSettings} fields={crmLeadFieldSettings} />
        </div>
      ) : null}

      {id === "crm-pipeline-editor" ? (
        <div className="w-full max-w-[1380px]">
          <CrmPipelineEditor pipelines={crmPipelineSettings} />
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

      {id === "settings-progress-ring" ? (
        <div className="grid w-full max-w-[820px] gap-4 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)] sm:grid-cols-2">
          <SettingsProgressRing value={86} label="Profile readiness" detail="Identity details are ready for customer-facing ownership." />
          <SettingsProgressRing value={68} label="Monthly AI budget" detail="EUR 1,024 of EUR 1,500 used." tone="blue" />
        </div>
      ) : null}

      {id === "contact-card-layout-picker" ? (
        <div className="w-full max-w-[860px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <ContactCardLayoutPicker value={previewContactLayout} onChange={setPreviewContactLayout} />
        </div>
      ) : null}

      {id === "contact-card-social-links-editor" ? (
        <div className="w-full max-w-[760px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <ContactCardSocialLinksEditor links={previewSocialLinks} onChange={setPreviewSocialLinks} />
        </div>
      ) : null}

      {id === "automation-run-history" ? (
        <div className="w-full max-w-[920px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <AutomationRunHistory runs={previewAutomationRuns} onRerun={async () => undefined} />
        </div>
      ) : null}

      {id === "marketing-opt-in-control" ? (
        <div className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]">
          <MarketingOptInControl
            checked={previewMarketingOptIn}
            source="manual_override"
            updatedAt="2026-08-03T14:30:00.000Z"
            onCheckedChange={async (checked) => setPreviewMarketingOptIn(checked)}
          />
        </div>
      ) : null}

      {id === "auth-narrative-panel" ? (
        <div className="relative h-[520px] w-full max-w-[620px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-accent-abyss)] shadow-[var(--md-shadow-line)]">
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
