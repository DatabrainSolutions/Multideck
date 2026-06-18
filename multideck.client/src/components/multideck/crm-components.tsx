import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react"
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Folder,
  GripVertical,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Settings2,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  crmAccountSignals,
  crmActivities,
  crmContacts,
  crmDashboardFocus,
  crmForecastTrend,
  crmLeadFieldSettings,
  crmPipelineBoards,
  crmPipelineSettings,
  crmPipelineStages,
  crmPriorityActions,
  crmRevenueMix,
  crmSalesFunnel,
  crmSummaryMetrics,
  customers,
  type StatusTone,
} from "@/data/multideck-data"
import { CustomerAvatar, CustomerSparkline } from "./customer-components"
import { SectionHeader, Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"

type CrmMetric = (typeof crmSummaryMetrics)[number]
type CrmPipelineStage = (typeof crmPipelineStages)[number]
type CrmDeal = CrmPipelineStage["deals"][number]
type CrmPipelineBoardData = (typeof crmPipelineBoards)[number]
type CrmContact = (typeof crmContacts)[number]
type CrmActivity = (typeof crmActivities)[number]
type CrmLeadSignal = (typeof crmAccountSignals)[number]
type CrmLead = (typeof customers)[number]
type CrmPipelineSetting = (typeof crmPipelineSettings)[number]
type CrmLeadFieldSetting = (typeof crmLeadFieldSettings)[number]
type CrmDashboardFocus = (typeof crmDashboardFocus)[number]
type CrmSalesFunnelStage = (typeof crmSalesFunnel)[number]
type CrmRevenueMixItem = (typeof crmRevenueMix)[number]
type CrmForecastTrendItem = (typeof crmForecastTrend)[number]
type CrmPriorityAction = (typeof crmPriorityActions)[number]

export type CrmAssetFolder = {
  id: string
  name: string
  description: string
  itemCount: number
  size: string
  updated: string
  owner: string
  tone: StatusTone
  icon?: LucideIcon
}

export type CrmAssetFile = {
  id: string
  folderId: string
  name: string
  type: string
  size: string
  updated: string
  owner: string
  usage: string
  tone: StatusTone
  icon?: LucideIcon
}

type DragState = {
  dealId: string
  originStageId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  tilt: number
  anchor: number
  left: number
  top: number
  width: number
  height: number
  moved: boolean
}

type DropPreview = {
  stageId: string
  index: number
}

function cloneStages(stages: readonly CrmPipelineStage[]) {
  return stages.map((stage) => ({ ...stage, deals: [...stage.deals] }))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function stageMeta(count: number) {
  return count === 1 ? "1 deal" : `${count} deals`
}

function getStageIdFromPoint(clientX: number, clientY: number, draggedDealId?: string) {
  return document.elementsFromPoint(clientX, clientY).reduce<string | null>((match, element) => {
    if (match) return match
    if (draggedDealId && element.closest<HTMLElement>("[data-crm-deal-id]")?.dataset.crmDealId === draggedDealId) return null
    return element.closest<HTMLElement>("[data-crm-stage-id]")?.dataset.crmStageId ?? null
  }, null)
}

function getStageElement(stageId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-crm-stage-id]")).find((element) => element.dataset.crmStageId === stageId) ?? null
  )
}

function getDropPreviewFromPoint(clientX: number, clientY: number, draggedDealId: string): DropPreview | null {
  const stageId = getStageIdFromPoint(clientX, clientY, draggedDealId)
  if (!stageId) return null

  const stageElement = getStageElement(stageId)
  if (!stageElement) return { stageId, index: 0 }

  const dealElements = Array.from(stageElement.querySelectorAll<HTMLElement>("[data-crm-deal-id]")).filter(
    (element) => element.dataset.crmDealId !== draggedDealId,
  )

  const index = dealElements.findIndex((element) => {
    const rect = element.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  })

  return { stageId, index: index === -1 ? dealElements.length : index }
}

function customerTone(status: CrmLead["status"]): StatusTone {
  if (status === "Premium") return "teal"
  if (status === "Trial") return "amber"
  if (status === "New") return "green"
  return "neutral"
}

function percentWidth(value: number) {
  return `${clamp(value, 0, 100)}%`
}

function CrmMiniStat({
  item,
  icon: Icon,
}: {
  item: CrmDashboardFocus
  icon: LucideIcon
}) {
  return (
    <div className="rounded-[var(--md-radius-lg)] bg-white/62 p-3 shadow-[var(--md-shadow-line)] dark:bg-[var(--md-glass-strong)]">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
          <Icon className="size-4" strokeWidth={1.2} />
        </span>
        <span className="size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
      </div>
      <p className="mt-4 text-[12px] font-medium text-[var(--md-text)]">{item.label}</p>
      <p className="mt-1 text-[22px] font-medium leading-none text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.value}</p>
      <p className="mt-2 text-[12px] leading-5 text-[var(--md-subtle)]">{item.detail}</p>
    </div>
  )
}

export function CrmSalesCommandCenter({
  focus = crmDashboardFocus,
}: {
  focus?: readonly CrmDashboardFocus[]
}) {
  const icons = [CircleDollarSign, Target, TrendingUp]

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[linear-gradient(135deg,var(--md-surface)_0%,var(--md-surface-soft)_54%,color-mix(in_srgb,var(--md-accent)_14%,var(--md-surface))_100%)]">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)] lg:p-5">
        <div className="flex min-h-[214px] flex-col justify-between rounded-[var(--md-radius-lg)] bg-[var(--md-green-card)] p-5 shadow-[var(--md-shadow-green-card)]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="teal">Sales dashboard</StatusPill>
              <StatusPill tone="green">Live CRM</StatusPill>
            </div>
            <h2 className="mt-5 max-w-[560px] text-[24px] font-medium leading-tight text-[var(--md-ink)]">
              See pipeline pressure, forecast confidence, and the sales work that needs attention now.
            </h2>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Focus", "Pacific quote"],
              ["Next best move", "Marlow capacity review"],
              ["Risk", "Aldridge blocker"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[var(--md-radius-md)] bg-white/56 px-3 py-2.5 shadow-[var(--md-shadow-line)] dark:bg-[var(--md-glass-strong)]">
                <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
                <p className="mt-1 truncate text-[13px] font-medium text-[var(--md-ink)]">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {focus.map((item, index) => (
            <CrmMiniStat key={item.label} item={item} icon={icons[index] ?? BarChart3} />
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function CrmSalesFunnelPanel({
  stages = crmSalesFunnel,
}: {
  stages?: readonly CrmSalesFunnelStage[]
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Sales funnel" meta="lead volume to committed revenue" />
      </div>
      <div className="grid gap-3 px-5 pb-5">
        {stages.map((stage) => (
          <div key={stage.stage} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{stage.stage}</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">
                  <span data-i18n-skip dir="ltr">{stage.count}</span> leads · <span data-i18n-skip dir="ltr">{stage.value}</span>
                </p>
              </div>
              <span className="text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{stage.conversion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: percentWidth(stage.conversion), background: toneToVar(stage.tone) }}
              />
            </div>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function CrmRevenueMixPanel({
  mix = crmRevenueMix,
}: {
  mix?: readonly CrmRevenueMixItem[]
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Revenue mix" meta="where open value is coming from" />
      </div>
      <div className="px-5 pb-5">
        <div className="flex h-4 overflow-hidden rounded-full bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]" aria-hidden="true">
          {mix.map((item) => (
            <span key={item.label} style={{ width: percentWidth(item.share), background: toneToVar(item.tone) }} />
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          {mix.map((item) => (
            <div key={item.label} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-3 py-2.5 transition-colors hover:bg-[var(--md-surface-soft)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
                  <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{item.label}</p>
                </div>
                <p className="mt-1 truncate text-[12px] text-[var(--md-subtle)]">{item.detail}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{item.value}</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{item.share}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function CrmForecastPanel({
  trend = crmForecastTrend,
}: {
  trend?: readonly CrmForecastTrendItem[]
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Forecast shape" meta="commit and best case by week" />
      </div>
      <div className="px-5 pb-5">
        <div className="grid min-h-[178px] grid-cols-4 items-end gap-3">
          {trend.map((item) => (
            <div key={item.period} className="grid gap-2">
              <div className="flex h-[128px] items-end rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
                <div
                  className="w-full rounded-[var(--md-radius-sm)]"
                  style={{
                    height: percentWidth(item.attainment),
                    background: `linear-gradient(180deg, ${toneToVar(item.tone)}, color-mix(in srgb, ${toneToVar(item.tone)} 66%, transparent))`,
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{item.period}</p>
                <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{item.commit} / {item.bestCase}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function CrmPriorityActionsPanel({
  actions = crmPriorityActions,
}: {
  actions?: readonly CrmPriorityAction[]
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Priority actions" meta="ranked by revenue and urgency" />
      </div>
      <div className="px-5 pb-5">
        {actions.map((action) => (
          <button
            key={`${action.account}-${action.title}`}
            type="button"
            className="grid w-full gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-4 text-left transition-[background,box-shadow] hover:bg-white/25 first:shadow-none sm:grid-cols-[1fr_auto]"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium leading-5 text-[var(--md-ink)]">{action.title}</span>
                <StatusPill tone={action.tone}>{action.due}</StatusPill>
              </span>
              <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{action.account} · owner {action.owner}</span>
            </span>
            <span className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{action.impact}</span>
              <span className="grid size-7 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                <ArrowRight data-icon="inline-end" className="size-4" strokeWidth={1.2} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </Surface>
  )
}

export function CrmMetricCard({ metric }: { metric: CrmMetric }) {
  return (
    <Surface padding="md" className="min-h-[116px] rounded-[var(--md-radius-xl)]">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--md-text)]">{metric.label}</p>
          <span className="mt-1 size-2.5 rounded-full" style={{ background: toneToVar(metric.tone) }} />
        </div>
        <div>
          <strong className="text-[30px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{metric.value}</strong>
          <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{metric.detail}</p>
        </div>
      </div>
    </Surface>
  )
}

export function CrmMetricsGrid({ metrics = crmSummaryMetrics }: { metrics?: readonly CrmMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <CrmMetricCard key={metric.label} metric={metric} />
      ))}
    </div>
  )
}

export function CrmAssetFolderCard({
  folder,
  selected,
  onSelect,
}: {
  folder: CrmAssetFolder
  selected?: boolean
  onSelect?: (folder: CrmAssetFolder) => void
}) {
  const Icon = folder.icon ?? Folder

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group grid min-h-[168px] content-between rounded-[var(--md-radius-xl)] bg-[var(--md-green-card)] p-4 text-left shadow-[var(--md-shadow-green-card)] transition-[background,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-green-card-hover)] hover:shadow-[var(--md-shadow-green-card-hover)]",
        selected && "bg-[var(--md-green-card-selected)] shadow-[var(--md-shadow-green-card-selected)]",
      )}
      onClick={() => onSelect?.(folder)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-[var(--md-radius-md)] bg-white/82 text-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9),0_0_0_1px_rgba(14,125,116,0.12),0_8px_18px_rgba(14,125,116,0.08)]">
          <Icon className="size-5" strokeWidth={1.2} />
        </span>
        <StatusPill tone="green" className="bg-white/64 text-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_0_0_1px_rgba(14,125,116,0.08)]">{folder.itemCount} items</StatusPill>
      </div>
      <div className="mt-5">
        <h3 className="text-[14px] font-medium leading-5 text-[var(--md-ink)]">{folder.name}</h3>
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--md-text)]">{folder.description}</p>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] pt-3 text-[11px] text-[var(--md-subtle)]">
          <span>{folder.updated}</span>
          <span data-i18n-skip dir="ltr">{folder.size}</span>
        </div>
      </div>
    </button>
  )
}

export function CrmAssetRow({
  asset,
  onOpen,
}: {
  asset: CrmAssetFile
  onOpen?: (asset: CrmAssetFile) => void
}) {
  const Icon = asset.icon ?? FileText

  return (
    <button
      type="button"
      className="grid w-full gap-3 rounded-[var(--md-radius-lg)] px-3 py-3 text-left transition-[background,box-shadow] hover:bg-[var(--md-surface-soft)] hover:shadow-[var(--md-shadow-line)] sm:grid-cols-[minmax(0,1fr)_96px_108px_120px] sm:items-center"
      onClick={() => onOpen?.(asset)}
    >
      <span className="grid min-w-0 grid-cols-[36px_1fr] items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          <Icon className="size-4" strokeWidth={1.2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{asset.name}</span>
          <span className="mt-1 block truncate text-[12px] text-[var(--md-subtle)]">{asset.usage}</span>
        </span>
      </span>
      <span className="text-[12px] font-medium text-[var(--md-text)]" data-i18n-skip dir="ltr">{asset.type}</span>
      <span className="text-[12px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{asset.size}</span>
      <span className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-[12px] text-[var(--md-text)]">{asset.updated}</span>
        <span className="size-2.5 rounded-full" style={{ background: toneToVar(asset.tone) }} aria-hidden="true" />
      </span>
    </button>
  )
}

function DealCard({
  deal,
  selected,
  isDragging,
  suppressClick,
  dragStyle,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  deal: CrmDeal
  selected?: boolean
  isDragging?: boolean
  suppressClick?: boolean
  dragStyle?: CSSProperties
  onSelect?: (deal: CrmDeal) => void
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>, deal: CrmDeal) => void
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      data-crm-deal-id={deal.id}
      aria-pressed={selected}
      aria-grabbed={isDragging}
      className={cn(
        "group relative w-full touch-none select-none overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-crm-deal-bg)] p-4 text-left shadow-[var(--md-crm-deal-shadow)] transition-[background,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-crm-deal-hover-bg)] hover:shadow-[var(--md-crm-deal-hover-shadow)]",
        selected && "bg-[var(--md-crm-deal-selected-bg)] shadow-[var(--md-crm-deal-selected-shadow)]",
        isDragging && "z-20 cursor-grabbing opacity-95 transition-none",
      )}
      style={dragStyle}
      onClick={() => {
        if (suppressClick) return
        onSelect?.(deal)
      }}
      onPointerDown={(event) => onPointerDown?.(event, deal)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: toneToVar(deal.tone) }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium leading-5 text-[var(--md-ink)]">{deal.title}</h3>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{deal.account}</p>
        </div>
        <StatusPill tone={deal.tone}>{deal.status}</StatusPill>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[var(--md-text)]">{deal.summary}</p>
      <div className="mt-4 flex items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] pt-3">
        <div>
          <p className="text-[16px] font-medium leading-none text-[var(--md-ink)]">{deal.value}</p>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]">{deal.owner} · {deal.due}</p>
        </div>
        <span className="grid size-7 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-accent)]">
          <ArrowRight data-icon="inline-end" className="size-4" strokeWidth={1.2} />
        </span>
      </div>
    </button>
  )
}

function DealDropPlaceholder({ height }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(14,125,116,0.08)] opacity-95 shadow-[inset_0_0_0_1px_rgba(14,125,116,0.22),0_8px_18px_rgba(14,125,116,0.06)] transition-[min-height,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ minHeight: height ? Math.max(112, height) : 156 }}
    >
      <span className="h-1 w-12 rounded-full bg-[rgba(14,125,116,0.38)]" />
    </div>
  )
}

function buildDealNodes({
  stage,
  dragState,
  dropPreview,
  selectedDealId,
  suppressClickId,
  onSelectDeal,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  stage: CrmPipelineStage
  dragState: DragState | null
  dropPreview: DropPreview | null
  selectedDealId?: string
  suppressClickId: string | null
  onSelectDeal?: (deal: CrmDeal) => void
  onDragStart: (event: PointerEvent<HTMLButtonElement>, deal: CrmDeal, stageId: string) => void
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void
}) {
  const nodes: ReactNode[] = []
  const activeDealId = dragState?.dealId
  const shouldShowPlaceholder = Boolean(dragState && dropPreview?.stageId === stage.id)
  let visibleIndex = 0
  let placeholderPlaced = false

  const addPlaceholder = () => {
    nodes.push(<DealDropPlaceholder key="drop-preview" height={dragState?.height} />)
    placeholderPlaced = true
  }

  stage.deals.forEach((deal) => {
    if (shouldShowPlaceholder && !placeholderPlaced && visibleIndex === dropPreview?.index) {
      addPlaceholder()
    }

    const activeDrag = activeDealId === deal.id ? dragState : null
    const isDragging = Boolean(activeDrag)
    const dragStyle: CSSProperties | undefined = activeDrag
      ? {
          position: "fixed",
          left: activeDrag.left,
          top: activeDrag.top,
          width: activeDrag.width,
          transform: `translate3d(${activeDrag.x}px, ${activeDrag.y}px, 0) rotate(${activeDrag.tilt}deg) scale(1.015)`,
          transformOrigin: `${50 + activeDrag.anchor * 100}% 50%`,
          willChange: "transform",
        }
      : undefined

    nodes.push(
      <DealCard
        key={deal.id}
        deal={deal}
        selected={selectedDealId === deal.id}
        isDragging={isDragging}
        suppressClick={suppressClickId === deal.id}
        dragStyle={dragStyle}
        onSelect={onSelectDeal}
        onPointerDown={(event, draggedDeal) => onDragStart(event, draggedDeal, stage.id)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      />,
    )

    if (!isDragging) visibleIndex += 1
  })

  if (shouldShowPlaceholder && !placeholderPlaced) {
    addPlaceholder()
  }

  return nodes
}

export function CrmPipelineBoard({
  pipelines = crmPipelineBoards,
  stages = crmPipelineStages,
  selectedDealId,
  onSelectDeal,
  onPipelineChange,
  onOpenSettings,
}: {
  pipelines?: readonly CrmPipelineBoardData[]
  stages?: readonly CrmPipelineStage[]
  selectedDealId?: string
  onSelectDeal?: (deal: CrmDeal) => void
  onPipelineChange?: (pipeline: CrmPipelineBoardData) => void
  onOpenSettings?: () => void
}) {
  const [activePipelineId, setActivePipelineId] = useState(pipelines[0]?.id ?? "custom")
  const activePipeline = pipelines.find((pipeline) => pipeline.id === activePipelineId) ?? pipelines[0]
  const activeStages = activePipeline?.stages ?? stages
  const [boardStages, setBoardStages] = useState(() => cloneStages(activeStages))
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [suppressClickId, setSuppressClickId] = useState<string | null>(null)

  useEffect(() => {
    setBoardStages(cloneStages(activeStages))
    setDragState(null)
    setDropPreview(null)
    setOverStageId(null)
  }, [activeStages])

  function switchPipeline(pipeline: CrmPipelineBoardData) {
    setActivePipelineId(pipeline.id)
    onPipelineChange?.(pipeline)
  }

  function updateDropPreview(clientX: number, clientY: number, draggedDealId: string) {
    const nextDropPreview = getDropPreviewFromPoint(clientX, clientY, draggedDealId)
    setDropPreview((current) => {
      if (current?.stageId === nextDropPreview?.stageId && current?.index === nextDropPreview?.index) return current
      return nextDropPreview
    })
    setOverStageId((current) => (current === nextDropPreview?.stageId ? current : nextDropPreview?.stageId ?? null))
  }

  function moveDeal(dealId: string, destinationStageId: string, destinationIndex: number) {
    setBoardStages((currentStages) => {
      let movedDeal: CrmDeal | null = null
      const withoutDeal = currentStages.map((stage) => {
        const nextDeals = stage.deals.filter((deal) => {
          if (deal.id !== dealId) return true
          movedDeal = deal
          return false
        })
        return { ...stage, deals: nextDeals }
      })

      if (!movedDeal) return currentStages

      return withoutDeal.map((stage) => {
        if (stage.id !== destinationStageId) return stage
        const insertAt = clamp(destinationIndex, 0, stage.deals.length)
        return {
          ...stage,
          deals: [...stage.deals.slice(0, insertAt), movedDeal as CrmDeal, ...stage.deals.slice(insertAt)],
        }
      })
    })
  }

  function handleDragStart(event: PointerEvent<HTMLButtonElement>, deal: CrmDeal, stageId: string) {
    if (event.button !== 0) return

    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({
      dealId: deal.id,
      originStageId: stageId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
      y: 0,
      tilt: anchor * -10,
      anchor,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    })
    updateDropPreview(event.clientX, event.clientY, deal.id)
  }

  function handleDragMove(event: PointerEvent<HTMLButtonElement>) {
    setDragState((current) => {
      if (!current || current.pointerId !== event.pointerId) return current

      const x = event.clientX - current.startX
      const y = event.clientY - current.startY
      const moved = current.moved || Math.hypot(x, y) > 6
      const tilt = clamp(current.anchor * -10 + x / 55, -8, 8)
      return { ...current, x, y, tilt, moved }
    })
    const activeDealId = dragState?.dealId ?? event.currentTarget.dataset.crmDealId
    if (activeDealId) {
      updateDropPreview(event.clientX, event.clientY, activeDealId)
    }
  }

  function handleDragEnd(event: PointerEvent<HTMLButtonElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const destinationPreview =
      dropPreview ?? getDropPreviewFromPoint(event.clientX, event.clientY, dragState.dealId) ?? { stageId: dragState.originStageId, index: 0 }

    if (dragState.moved) {
      moveDeal(dragState.dealId, destinationPreview.stageId, destinationPreview.index)
      setSuppressClickId(dragState.dealId)
      window.setTimeout(() => setSuppressClickId(null), 80)
    }

    setDragState(null)
    setDropPreview(null)
    setOverStageId(null)
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{activePipeline?.name ?? "Pipeline"}</p>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{boardStages.length} stages · {boardStages.reduce((sum, stage) => sum + stage.deals.length, 0)} leads</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/55 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78 sm:min-w-[210px]"
              >
                {activePipeline?.name ?? "Pipeline"}
                <ChevronDown data-icon="inline-end" className="size-4" strokeWidth={1.2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[230px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
              <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">Switch pipeline</DropdownMenuLabel>
              {pipelines.map((pipeline) => (
                <DropdownMenuItem key={pipeline.id} className="text-[13px]" onSelect={() => switchPipeline(pipeline)}>
                  {pipeline.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {onOpenSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open pipeline settings"
              className="size-10 rounded-[var(--md-radius-lg)] bg-white/55 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78"
              onClick={onOpenSettings}
            >
              <Settings2 data-icon="inline-start" className="size-4" strokeWidth={1.2} />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="md-scrollbar min-w-0 overflow-x-auto pb-1">
        <div
          className="grid gap-3"
          style={{
            minWidth: Math.max(760, boardStages.length * 250),
            gridTemplateColumns: `repeat(${boardStages.length}, minmax(235px, 1fr))`,
          }}
        >
        {boardStages.map((stage) => {
          const stageIsTarget = Boolean(dragState && overStageId === stage.id)

          return (
            <Surface
              key={stage.id}
              data-crm-stage-id={stage.id}
              padding="none"
              tone="soft"
              className={cn(
                "rounded-[var(--md-radius-xl)] bg-[var(--md-crm-stage-bg)] px-4 py-4 sm:px-5",
                stageIsTarget && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.2),0_0_0_3px_rgba(14,125,116,0.08)]",
              )}
            >
              <div className="flex items-center justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-medium text-[var(--md-ink)]">{stage.title}</h2>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{stageMeta(stage.deals.length)}</p>
                </div>
                <span className="size-2.5 rounded-full" style={{ background: toneToVar(stage.tone) }} />
              </div>
              <div className="grid min-h-[128px] gap-3">
                {buildDealNodes({
                  stage,
                  dragState,
                  dropPreview,
                  selectedDealId,
                  suppressClickId,
                  onSelectDeal,
                  onDragStart: handleDragStart,
                  onDragMove: handleDragMove,
                  onDragEnd: handleDragEnd,
                })}
              </div>
            </Surface>
          )
        })}
        </div>
      </div>
    </div>
  )
}

export function CrmDealDetailPanel({ deal }: { deal?: CrmDeal }) {
  const activeDeal = deal ?? crmPipelineStages[1].deals[0]

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader
          title="Selected deal"
          meta={activeDeal.account}
          action={<StatusPill tone={activeDeal.tone}>{activeDeal.status}</StatusPill>}
        />
      </div>
      <div className="shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] px-5 py-5">
        <h2 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{activeDeal.title}</h2>
        <p className="mt-3 text-[13px] leading-6 text-[var(--md-text)]">{activeDeal.summary}</p>
        <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)] sm:grid-cols-3">
          {[
            ["Value", activeDeal.value],
            ["Contact", activeDeal.contact],
            ["Due", activeDeal.due],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)]">
              <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
              <p className="mt-1 truncate text-[13px] font-medium text-[var(--md-ink)]">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-[var(--md-page-stack-gap)] rounded-[var(--md-radius-lg)] bg-white/72 p-[var(--md-gap-lg)] shadow-[var(--md-shadow-line)]">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">Next step</p>
          <p className="mt-2 text-[14px] font-medium leading-6 text-[var(--md-ink)]">{activeDeal.nextStep}</p>
        </div>
      </div>
    </Surface>
  )
}

export function CrmLeadDetailPanel({
  lead = customers[0],
  onOpenCustomer,
  onConvertToCustomer,
}: {
  lead?: CrmLead
  onOpenCustomer?: (lead: CrmLead) => void
  onConvertToCustomer?: (lead: CrmLead) => void
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Lead detail" meta="conversion handoff" />
      </div>
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 items-start gap-4">
          <CustomerAvatar initials={lead.initials} tone={lead.avatarTone} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{lead.name}</h2>
              <StatusPill tone={customerTone(lead.status)}>{lead.status}</StatusPill>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{lead.location}</p>
            <p className="mt-3 text-[13px] leading-6 text-[var(--md-text)]">
              Lead record is ready to connect back into the main Multideck customer workspace when the commercial handoff is approved.
            </p>
          </div>
        </div>
        <UserCheck className="size-5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} />
      </div>

      <div className="grid gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] px-5 py-4 sm:grid-cols-3">
        {[
          ["Active work", lead.active],
          ["Billed YTD", lead.billedYtd],
          ["On-time", lead.onTime],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-3 shadow-[var(--md-shadow-line)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-4">
        <CustomerSparkline values={lead.bookings30d} tone={lead.sparkTone} className="w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
            onClick={() => onOpenCustomer?.(lead)}
          >
            Open in Customers
          </Button>
          <Button
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
            onClick={() => onConvertToCustomer?.(lead)}
          >
            Turn into customer
          </Button>
        </div>
      </div>
    </Surface>
  )
}

export function CrmContactTable({
  contacts = crmContacts,
  selectedEmail,
  onSelectContact,
}: {
  contacts?: readonly CrmContact[]
  selectedEmail?: string
  onSelectContact?: (contact: CrmContact) => void
}) {
  return (
    <div className="md-scrollbar overflow-x-auto rounded-[var(--md-radius-xl)]">
      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
            <TableHead className="pl-0 text-[12px] font-medium text-[var(--md-text)]">Contact</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Lead</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Relationship</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Last touch</TableHead>
            <TableHead className="text-right text-[12px] font-medium text-[var(--md-text)]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow
              key={contact.email}
              className={cn(
                "h-[74px] cursor-pointer border-[rgba(11,20,19,0.04)] hover:bg-white/35",
                selectedEmail === contact.email && "bg-white/50",
              )}
              onClick={() => onSelectContact?.(contact)}
            >
              <TableCell className="min-w-[260px] pl-0">
                <div className="flex items-center gap-3">
                  <CustomerAvatar initials={contact.initials} tone={contact.tone} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name}</p>
                    <p className="truncate text-[12px] text-[var(--md-text)]">{contact.role}</p>
                    <p data-i18n-skip dir="ltr" className="truncate text-[12px] text-[var(--md-subtle)]">{contact.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="min-w-[210px] text-[13px] font-medium text-[var(--md-ink)]">{contact.account}</TableCell>
              <TableCell className="min-w-[170px]">
                <StatusPill tone={contact.primary ? "teal" : "neutral"}>{contact.relationship}</StatusPill>
              </TableCell>
              <TableCell className="min-w-[260px] text-[13px] text-[var(--md-text)]">{contact.lastTouch}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Mail data-icon="inline-start" strokeWidth={1.2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Phone data-icon="inline-start" strokeWidth={1.2} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function CrmActivityTimeline({
  activities = crmActivities,
  compact,
}: {
  activities?: readonly CrmActivity[]
  compact?: boolean
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Relationship activity" meta={compact ? "latest signals" : "AI, email, sales, and booking events"} />
      </div>
      <div className="px-5 pb-4">
        {activities.map((item) => (
          <div key={`${item.time}-${item.title}`} className="grid grid-cols-[92px_18px_1fr] gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-4 first:shadow-none sm:grid-cols-[120px_18px_1fr]">
            <p className="text-[12px] leading-5 text-[var(--md-text)]">{item.time}</p>
            <span className="mt-1.5 size-2.5 rounded-full" style={{ background: toneToVar(item.tone as StatusTone) }} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-medium leading-5 text-[var(--md-ink)]">{item.title}</p>
                <StatusPill tone={item.tone}>{item.account}</StatusPill>
              </div>
              <p className="mt-1 text-[12px] text-[var(--md-subtle)]">{item.source}</p>
              {!compact ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{item.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function CrmLeadSignalList({
  signals = crmAccountSignals,
  onOpenLead,
}: {
  signals?: readonly CrmLeadSignal[]
  onOpenLead?: (signal: CrmLeadSignal) => void
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-5 py-4">
        <SectionHeader title="Lead signals" meta="ranked by commercial impact" />
      </div>
      <div className="px-5 pb-5">
        {signals.map((signal) => (
          <button
            key={signal.account}
            type="button"
            className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-4 text-left transition-[background,color,box-shadow,opacity,transform] hover:bg-white/25 first:shadow-none"
            onClick={() => onOpenLead?.(signal)}
          >
            <CustomerAvatar initials={signal.initials} tone={signal.tone} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{signal.account}</span>
              <span className="mt-1 block text-[13px] leading-5 text-[var(--md-text)]">{signal.signal}</span>
              <span className="mt-1 block text-[12px] leading-5 text-[var(--md-subtle)]">{signal.detail}</span>
            </span>
            <span className="flex flex-col items-end gap-2">
              <StatusPill tone={signal.statusTone}>{signal.status}</StatusPill>
              <span className="text-[12px] font-medium text-[var(--md-ink)]">{signal.metric}</span>
            </span>
          </button>
        ))}
      </div>
    </Surface>
  )
}

function DropdownFieldRow({
  field,
  selected,
  onSelect,
}: {
  field: CrmLeadFieldSetting
  selected: string[]
  onSelect: (option: string) => void
}) {
  const multi = field.type === "Multi-select dropdown"
  const label = selected.length > 0 ? selected.join(", ") : "Choose"

  return (
    <div className="grid gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-4 first:shadow-none sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{field.label}</p>
          <StatusPill tone={multi ? "teal" : "neutral"}>{field.type}</StatusPill>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{field.options.join(" · ")}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-10 justify-between rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
          >
            <span className="truncate">{label}</span>
            <ChevronDown data-icon="inline-end" className="size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[240px] rounded-[var(--md-radius-lg)]">
          <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">{field.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {field.options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={selected.includes(option)}
              className="text-[13px]"
              onSelect={(event) => {
                if (multi) event.preventDefault()
              }}
              onCheckedChange={() => onSelect(option)}
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function CrmSettingsBuilder({
  pipelines = crmPipelineSettings,
  fields = crmLeadFieldSettings,
}: {
  pipelines?: readonly CrmPipelineSetting[]
  fields?: readonly CrmLeadFieldSetting[]
}) {
  const [activePipelineName, setActivePipelineName] = useState(pipelines[0]?.name ?? "")
  const [pipelineDrafts, setPipelineDrafts] = useState(() =>
    Object.fromEntries(
      pipelines.map((pipeline) => [
        pipeline.name,
        {
          name: pipeline.name,
          stages: pipeline.stages.map((stage) => stage.name),
        },
      ]),
    ),
  )
  const [selectedFieldOptions, setSelectedFieldOptions] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(fields.map((field) => [field.label, field.activeOption.split(", ").filter(Boolean)])),
  )
  const activePipeline = pipelines.find((pipeline) => pipeline.name === activePipelineName) ?? pipelines[0]
  const activeDraft = pipelineDrafts[activePipelineName] ?? {
    name: activePipeline?.name ?? "Pipeline",
    stages: activePipeline?.stages.map((stage) => stage.name) ?? [],
  }

  function updateField(field: CrmLeadFieldSetting, option: string) {
    setSelectedFieldOptions((current) => {
      const existing = current[field.label] ?? []
      if (field.type === "Multi-select dropdown") {
        const next = existing.includes(option) ? existing.filter((item) => item !== option) : [...existing, option]
        return { ...current, [field.label]: next }
      }

      return { ...current, [field.label]: [option] }
    })
  }

  function updatePipelineName(value: string) {
    setPipelineDrafts((current) => ({
      ...current,
      [activePipelineName]: {
        ...activeDraft,
        name: value,
      },
    }))
  }

  function updateColumnCount(value: string) {
    const count = clamp(Number(value) || 1, 1, 8)

    setPipelineDrafts((current) => {
      const currentStages = activeDraft.stages
      const nextStages = Array.from({ length: count }, (_, index) => currentStages[index] ?? `Column ${index + 1}`)

      return {
        ...current,
        [activePipelineName]: {
          ...activeDraft,
          stages: nextStages,
        },
      }
    })
  }

  function updateStageName(index: number, value: string) {
    setPipelineDrafts((current) => {
      const nextStages = activeDraft.stages.map((stageName, stageIndex) => (stageIndex === index ? value : stageName))

      return {
        ...current,
        [activePipelineName]: {
          ...activeDraft,
          stages: nextStages,
        },
      }
    })
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1fr)_430px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeader title="Pipeline builder" meta="Stages, defaults, and conversion rules" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                <SlidersHorizontal data-icon="inline-start" strokeWidth={1.2} />
                {activePipeline?.name ?? "Pipeline"}
                <ChevronDown data-icon="inline-end" className="size-4" strokeWidth={1.2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[230px] rounded-[var(--md-radius-lg)]">
              <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">Default pipeline</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem key={pipeline.name} className="text-[13px]" onSelect={() => setActivePipelineName(pipeline.name)}>
                  {pipeline.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-5 pb-5">
          <div className="grid gap-3 pb-4 sm:grid-cols-[minmax(0,1fr)_150px]">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-[var(--md-subtle)]">Pipeline name</span>
              <Input
                value={activeDraft.name}
                onChange={(event) => updatePipelineName(event.target.value)}
                className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/60 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-[var(--md-subtle)]">Columns</span>
              <Input
                type="number"
                min={1}
                max={8}
                value={activeDraft.stages.length}
                onChange={(event) => updateColumnCount(event.target.value)}
                className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/60 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
              />
            </label>
          </div>

          {activeDraft.stages.map((stageName, index) => {
            const stage = activePipeline?.stages[index] ?? { name: stageName, tone: "neutral" as StatusTone, rule: "New pipeline column ready to configure." }

            return (
              <div key={`${activePipelineName}-${index}`} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-4 first:shadow-none">
                <GripVertical className="size-4 text-[var(--md-subtle)]" strokeWidth={1.2} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="grid min-w-[190px] flex-1 gap-1.5">
                      <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--md-subtle)]">
                        <span data-i18n-skip dir="ltr">{index + 1}.</span>
                        <span>Column name</span>
                      </span>
                      <Input
                        value={stageName}
                        onChange={(event) => updateStageName(index, event.target.value)}
                        className="h-9 rounded-[var(--md-radius-md)] border-0 bg-white/60 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                      />
                    </label>
                    <StatusPill tone={stage.tone}>{stage.tone}</StatusPill>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{stage.rule}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
                  <MoreHorizontal data-icon="inline-start" strokeWidth={1.2} />
                </Button>
              </div>
            )
          })}
          <Button variant="ghost" className="mt-2 h-10 rounded-[var(--md-radius-lg)] bg-white/55 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80">
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            Add stage
          </Button>
        </div>
      </Surface>

      <div className="grid gap-[var(--md-page-stack-gap)]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <SectionHeader title="Lead fields" meta="Dropdown and multi-select dropdown controls" />
            <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              Add dropdown
            </Button>
          </div>
          <div className="px-5 pb-5">
            {fields.map((field) => (
              <DropdownFieldRow
                key={field.label}
                field={field}
                selected={selectedFieldOptions[field.label] ?? []}
                onSelect={(option) => updateField(field, option)}
              />
            ))}
          </div>
        </Surface>

        <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
              <Settings2 className="size-4" strokeWidth={1.2} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">Customer conversion</p>
              <p className="mt-1 text-[13px] leading-6 text-[var(--md-text)]">{activePipeline?.automation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone="teal">Default: {activePipeline?.defaultStage}</StatusPill>
                <StatusPill tone="green">Convert: {activePipeline?.conversionStage}</StatusPill>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}
