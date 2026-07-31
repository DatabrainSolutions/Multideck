import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  GripVertical,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Settings2,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { useLanguage } from "@/i18n/language-provider"
import type { ApiLead, ApiLeadContact, ApiLeadDetail } from "@/lib/lead-api"
import {
  createLeadField,
  createPipeline,
  deleteLeadField,
  deletePipeline,
  getPipelineSettings,
  reorderLeadFields,
  reorderPipelines,
  saveLeadField,
  savePipeline,
  type ApiLeadField,
  type ApiPipeline,
} from "@/lib/pipeline-api"
import { cn } from "@/lib/utils"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"
import {
  dealCardFieldDefinitions,
  dealCardFieldLimit,
  useDealCardFields,
  type DealCardFieldKey,
} from "@/lib/deal-card-fields"
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
  type StatusTone,
} from "@/data/multideck-data"
import { CustomerAvatar } from "./customer-components"
import { AuditTimeline, type AuditTimelineEvent } from "./audit-timeline"
import { CopyableField } from "./copyable-field"
import { CrmPipelineEditor, type CrmPipelineEditorSave, type CrmPipelineEditorSource } from "./crm-pipeline-editor"
import { SectionHeader, Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"

type CrmMetric = (typeof crmSummaryMetrics)[number]
export type CrmDeal = {
  id: string
  title: string
  account: string
  contact: string
  value: string
  due: string
  owner: string
  status: string
  summary: string
  nextStep: string
  tone: StatusTone
  cardFields?: Partial<Record<DealCardFieldKey, string>>
}

export type CrmPipelineStage = {
  id: string
  title: string
  tone: StatusTone
  deals: readonly CrmDeal[]
}

export type CrmPipelineBoardData = {
  id: string
  name: string
  stages: readonly CrmPipelineStage[]
}
type CrmContact = (typeof crmContacts)[number]
type CrmActivity = (typeof crmActivities)[number]
type CrmLeadSignal = (typeof crmAccountSignals)[number]
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

function cloneStages(stages: readonly CrmPipelineStage[]) {
  return stages.map((stage) => ({ ...stage, deals: [...stage.deals] }))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function stageMeta(count: number) {
  return count === 1 ? "1 deal" : `${count} deals`
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
        <span className="grid size-10 place-items-center rounded-[var(--md-radius-md)] bg-white/82 text-[var(--md-accent)] shadow-[var(--md-shadow-line),0_8px_18px_var(--md-accent-a08)]">
          <Icon className="size-5" strokeWidth={1.2} />
        </span>
        <StatusPill tone="green" className="bg-white/64 text-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_0_0_1px_var(--md-accent-a08)]">{folder.itemCount} items</StatusPill>
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
  isClickSuppressed,
  onSelect,
  onPointerDown,
  onKeyDown,
  visibleFields,
}: {
  deal: CrmDeal
  selected?: boolean
  isDragging?: boolean
  isClickSuppressed: () => boolean
  onSelect?: (deal: CrmDeal) => void
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>, deal: CrmDeal) => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>, deal: CrmDeal) => void
  visibleFields: readonly DealCardFieldKey[]
}) {
  return (
    <button
      type="button"
      data-crm-deal-id={deal.id}
      data-kanban-card={deal.id}
      data-task-id={deal.id}
      data-kanban-dragging={isDragging ? "true" : undefined}
      aria-pressed={selected}
      aria-grabbed={isDragging}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
      style={{ "--md-crm-deal-tone": toneToVar(deal.tone) } as CSSProperties}
      className={cn(
        "md-kanban-card md-crm-deal-card group overflow-hidden",
        selected && "bg-[var(--md-crm-deal-selected-bg)]",
      )}
      onClick={() => {
        if (isClickSuppressed()) return
        onSelect?.(deal)
      }}
      onPointerDown={(event) => onPointerDown?.(event, deal)}
      onKeyDown={(event) => onKeyDown?.(event, deal)}
    >
      <DealCardBody deal={deal} visibleFields={visibleFields} />
    </button>
  )
}

function dealCardValue(deal: CrmDeal, key: DealCardFieldKey) {
  const savedValue = deal.cardFields?.[key]
  if (savedValue) return savedValue
  if (key === "expectedValue") return deal.value
  if (key === "primaryContact") return deal.contact
  if (key === "owner") return deal.owner
  if (key === "expectedClose") return deal.due
  if (key === "nextAction") return deal.nextStep
  return "Not recorded"
}

function DealCardBody({
  deal,
  visibleFields,
}: {
  deal: CrmDeal
  visibleFields: readonly DealCardFieldKey[]
}) {
  const { t } = useLanguage()

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-medium leading-5 text-[var(--md-ink)]">{deal.title}</h3>
          <p className="mt-1 truncate text-[11.5px] text-[var(--md-text)]">{deal.account}</p>
        </div>
        <StatusPill tone={deal.tone}>{deal.status}</StatusPill>
      </div>
      <dl className="grid gap-1.5" aria-label={t("Deal card details")}>
        {visibleFields.map((key) => {
          const definition = dealCardFieldDefinitions.find((field) => field.key === key)
          if (!definition) return null
          return (
            <div key={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-baseline gap-2">
              <dt className="truncate text-[10.5px] text-[var(--md-subtle)]">{t(definition.label)}</dt>
              <dd className="truncate text-end text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">
                {dealCardValue(deal, key)}
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="flex justify-end">
        <span className="grid size-7 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-colors group-hover:text-[var(--md-accent)]">
          <ArrowRight data-icon="inline-end" className="size-4" strokeWidth={1.2} />
        </span>
      </div>
    </>
  )
}

export function CrmPipelineBoard({
  pipelines = crmPipelineBoards,
  stages = crmPipelineStages,
  commandHeader,
  selectedDealId,
  onSelectDeal,
  onPipelineChange,
  onOpenSettings,
  onMoveDeal,
}: {
  pipelines?: readonly CrmPipelineBoardData[]
  stages?: readonly CrmPipelineStage[]
  commandHeader?: {
    title: string
    instruction: string
    actions?: ReactNode
  }
  selectedDealId?: string
  onSelectDeal?: (deal: CrmDeal) => void
  onPipelineChange?: (pipeline: CrmPipelineBoardData) => void
  onOpenSettings?: () => void
  onMoveDeal?: (dealId: string, pipelineId: string, stageId: string) => Promise<void> | void
}) {
  const { t } = useLanguage()
  const [visibleDealCardFields] = useDealCardFields()
  const [activePipelineId, setActivePipelineId] = useState(pipelines[0]?.id ?? "custom")
  const activePipeline = pipelines.find((pipeline) => pipeline.id === activePipelineId) ?? pipelines[0]
  const activeStages = activePipeline?.stages ?? stages
  const [boardStages, setBoardStages] = useState(() => cloneStages(activeStages))
  const kanbanColumns = boardStages.map((stage) => ({ id: stage.id, tasks: stage.deals }))
  const kanban = useKanbanPointerDrag({
    columns: kanbanColumns,
    getId: (deal) => deal.id,
    onCommit: ({ cardId, columns }) => {
      setBoardStages((currentStages) => currentStages.map((stage) => ({
        ...stage,
        deals: columns.find((column) => column.id === stage.id)?.tasks ?? stage.deals,
      })))
      const destination = columns.find((column) => column.tasks.some((deal) => deal.id === cardId))
      if (destination && activePipeline) {
        void onMoveDeal?.(cardId, activePipeline.id, destination.id)
      }
    },
    formatKeyboardAnnouncement: (deal, columnId) => `${deal.title} moved to ${boardStages.find((stage) => stage.id === columnId)?.title ?? columnId}`,
  })

  useEffect(() => {
    setBoardStages(cloneStages(activeStages))
  }, [activeStages])

  useEffect(() => {
    if (pipelines.length > 0 && !pipelines.some((pipeline) => pipeline.id === activePipelineId)) {
      setActivePipelineId(pipelines[0].id)
    }
  }, [activePipelineId, pipelines])

  function switchPipeline(pipeline: CrmPipelineBoardData) {
    setActivePipelineId(pipeline.id)
    onPipelineChange?.(pipeline)
  }

  const dealCount = boardStages.reduce((sum, stage) => sum + stage.deals.length, 0)
  const pipelineControls = (
    <div className={cn("flex items-center gap-2", commandHeader && "min-w-0 flex-wrap sm:flex-nowrap")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-10 justify-between gap-3 rounded-[var(--md-radius-lg)] bg-white/55 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78 sm:min-w-[210px]",
              commandHeader && "min-w-0 flex-1 sm:flex-none",
            )}
          >
            {activePipeline?.name ?? t("Pipeline")}
            <ChevronDown data-icon="inline-end" className="size-4" strokeWidth={1.2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[230px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
          <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Switch pipeline")}</DropdownMenuLabel>
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
          aria-label={t("Open pipeline settings")}
          className="size-10 shrink-0 rounded-[var(--md-radius-lg)] bg-white/55 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78"
          onClick={onOpenSettings}
        >
          <Settings2 data-icon="inline-start" className="size-4" strokeWidth={1.2} />
        </Button>
      ) : null}
    </div>
  )

  return (
    <div ref={kanban.boardRef} className={cn("grid min-w-0", commandHeader ? "gap-4" : "gap-3")}>
      {commandHeader ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-5">
            <h1 className="shrink-0 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{commandHeader.title}</h1>
            <div className="min-w-0 text-[12px] leading-5">
              <p className="font-medium text-[var(--md-text)]">
                {activePipeline?.name ?? t("Pipeline")} · {boardStages.length} {t("stages")} · {dealCount} {t("leads")}
              </p>
              <p className="text-[var(--md-subtle)]">{commandHeader.instruction}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            {pipelineControls}
            {commandHeader.actions}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{activePipeline?.name ?? t("Pipeline")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{boardStages.length} {t("stages")} · {dealCount} {t("leads")}</p>
          </div>
          {pipelineControls}
        </div>
      )}

      <div className="md-scrollbar min-w-0 overflow-x-auto pb-1">
        <div
          className="grid gap-3"
          style={{
            minWidth: Math.max(760, boardStages.length * 250),
            gridTemplateColumns: `repeat(${boardStages.length}, minmax(235px, 1fr))`,
          }}
        >
        {kanban.previewColumns.map((column) => {
          const stage = boardStages.find((candidate) => candidate.id === column.id)
          if (!stage) return null

          return (
            <Surface
              key={stage.id}
              data-crm-stage-id={stage.id}
              data-column-id={stage.id}
              data-drop-target={kanban.activeColumnId === stage.id ? "true" : undefined}
              padding="none"
              className="md-kanban-column"
              style={{ "--md-kanban-status-color": toneToVar(stage.tone) } as CSSProperties}
            >
              <header>
                <div className="min-w-0">
                  <h2 className="truncate">{stage.title}</h2>
                  <p className="mt-0.5 text-[11px] text-[var(--md-text)]">{stageMeta(column.tasks.length)}</p>
                </div>
                <span className="size-2.5 rounded-full" style={{ background: toneToVar(stage.tone) }} />
              </header>
              <div data-kanban-list>
                {column.tasks.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    selected={selectedDealId === deal.id}
                    isDragging={kanban.activeCardId === deal.id}
                    isClickSuppressed={kanban.isClickSuppressed}
                    onSelect={onSelectDeal}
                    onPointerDown={(event) => kanban.handlePointerDown(event, deal.id)}
                    onKeyDown={(event) => kanban.handleKeyDown(event, deal.id)}
                    visibleFields={visibleDealCardFields}
                  />
                ))}
                {column.tasks.length === 0 ? <p className="md-kanban-empty">No deals in this stage</p> : null}
              </div>
            </Surface>
          )
        })}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{kanban.keyboardAnnouncement}</p>
      {kanban.activeTask && kanban.overlayStyle ? createPortal(
        <div className="md-kanban-drag-preview" style={kanban.overlayStyle}>
          <div className="md-kanban-drag-preview-card group">
            <DealCardBody deal={kanban.activeTask} visibleFields={visibleDealCardFields} />
          </div>
        </div>,
        document.body,
      ) : null}
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

function leadStatusTone(lead: ApiLead): StatusTone {
  if (lead.isDisqualified) return "red"
  if (lead.isConverted) return "teal"
  if (lead.isOpen) return lead.qualificationScore !== null && lead.qualificationScore >= 70 ? "green" : "blue"
  return "neutral"
}

function formatLeadDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}

function formatLeadRelativeDate(value: string, locale: string) {
  const target = new Date(value)
  const differenceDays = Math.round((target.getTime() - Date.now()) / 86_400_000)
  if (Math.abs(differenceDays) < 14) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(differenceDays, "day")
  }
  return formatLeadDate(value, locale)
}

function formatLeadCurrency(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: Math.abs(value) >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}`
  }
}

function formatLeadAge(value: string, locale: string) {
  const created = new Date(value)
  const ageDays = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000))
  if (ageDays < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day")
  if (ageDays < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-ageDays, "day")

  const ageMonths = Math.max(1, Math.floor(ageDays / 30))
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-ageMonths, "month")
}

function formatLeadCountry(countryCode: string | null, locale: string) {
  if (!countryCode) return null

  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? countryCode
  } catch {
    return countryCode
  }
}

function leadContactRoleKey(roleCode: string | null, isPrimary: boolean) {
  if (!roleCode) return isPrimary ? "Primary contact" : "Company contact"
  return ({
    primary_contact: "Primary contact",
    procurement_director: "Procurement director",
    logistics_manager: "Logistics manager",
    finance_manager: "Finance manager",
    operations_director: "Operations director",
    operations_manager: "Operations manager",
    quality_manager: "Quality manager",
    supply_chain_manager: "Supply chain manager",
    founder: "Founder",
  } as Record<string, string>)[roleCode.toLowerCase()] ?? "Company contact"
}

function leadWebsiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`
}

const emptyLeadOwnerPhotoUrls = new Map<string, string>()

function LeadOwner({ lead, photoUrl }: { lead: ApiLead; photoUrl?: string }) {
  const { t } = useLanguage()

  if (!lead.ownerName) return <span className="text-[12px] text-[var(--md-subtle)]">{t("Unassigned")}</span>

  return (
    <div className="flex min-w-[150px] items-center gap-2.5">
      <Avatar aria-label={lead.ownerName}>
        {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
        <AvatarFallback className="bg-[var(--md-accent-a11)] text-[11px] font-medium text-[var(--md-accent)]">{lead.ownerInitials ?? "—"}</AvatarFallback>
      </Avatar>
      <span className="truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.ownerName}</span>
    </div>
  )
}

function LegacyCrmLeadQualificationTable({
  leads,
  selectedIds,
  onToggleLead,
  onOpenLead,
  emptyMessage,
  ownerPhotoUrls = emptyLeadOwnerPhotoUrls,
}: {
  leads: readonly ApiLead[]
  selectedIds: Set<string>
  onToggleLead: (id: string) => void
  onOpenLead: (lead: ApiLead) => void
  emptyMessage: string
  ownerPhotoUrls?: ReadonlyMap<string, string>
}) {
  const { language, t } = useLanguage()

  return (
    <div className="md-scrollbar overflow-x-auto rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)] dark:bg-[var(--md-surface)]">
      <Table className="min-w-[1510px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
            <TableHead className="w-12 px-2" />
            <TableHead className="min-w-[240px] text-[12px] font-medium text-[var(--md-text)]">{t("Lead")}</TableHead>
            <TableHead className="min-w-[210px] text-[12px] font-medium text-[var(--md-text)]">{t("Primary contact")}</TableHead>
            <TableHead className="min-w-[150px] text-[12px] font-medium text-[var(--md-text)]">{t("Source")}</TableHead>
            <TableHead className="min-w-[170px] text-[12px] font-medium text-[var(--md-text)]">{t("Owner")}</TableHead>
            <TableHead className="min-w-[190px] text-[12px] font-medium text-[var(--md-text)]">{t("Stage and qualification")}</TableHead>
            <TableHead className="min-w-[220px] text-[12px] font-medium text-[var(--md-text)]">{t("Engagement")}</TableHead>
            <TableHead className="min-w-[150px] text-[12px] font-medium text-[var(--md-text)]">{t("Next follow-up")}</TableHead>
            <TableHead className="min-w-[140px] text-[12px] font-medium text-[var(--md-text)]">{t("Created and age")}</TableHead>
            <TableHead className="min-w-[180px] text-end text-[12px] font-medium text-[var(--md-text)]">{t("Lead value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length ? leads.map((lead) => {
            const selected = selectedIds.has(lead.id)
            const followUpOverdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < Date.now()
            const createdDaysAgo = Math.max(Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000), 0)

            return (
              <TableRow
                key={lead.id}
                data-state={selected ? "selected" : undefined}
                className={cn(
                  "min-h-[76px] border-[rgba(11,20,19,0.045)] bg-white hover:bg-[#f8faf9] dark:bg-[var(--md-surface)] dark:hover:bg-[var(--md-surface-soft)]",
                  selected && "bg-[var(--md-surface-tint)] hover:bg-[var(--md-hover)] dark:bg-[var(--md-surface-tint)]",
                )}
              >
                <TableCell className="w-12 px-2">
                  <button
                    type="button"
                    aria-label={`${t("Select lead")} ${lead.companyName}`}
                    aria-pressed={selected}
                    className="grid size-10 place-items-center rounded-[var(--md-radius-md)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a16)]"
                    onClick={() => onToggleLead(lead.id)}
                  >
                    <span className={cn(
                      "grid size-[18px] place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform]",
                      selected && "bg-[var(--md-accent)] shadow-[0_0_0_3px_var(--md-accent-a12)]",
                    )}>
                      <span className={cn("size-1.5 rounded-full bg-white opacity-0", selected && "opacity-100")} />
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[var(--md-radius-md)] text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                    aria-label={`${t("Open lead details for")} ${lead.companyName}`}
                    onClick={() => onOpenLead(lead)}
                  >
                    <CustomerAvatar initials={lead.initials} tone="teal" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.companyName}</span>
                      <span className="mt-1 block truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">
                        {[lead.countryCode, lead.serviceInterest ?? lead.tradeLane].filter(Boolean).join(" · ") || t("Commercial lead")}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  {lead.primaryContactName || lead.primaryContactEmail ? (
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.primaryContactName ?? t("Contact not named")}</p>
                      {lead.primaryContactEmail ? <p className="mt-1 truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{lead.primaryContactEmail}</p> : null}
                    </div>
                  ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No primary contact")}</span>}
                </TableCell>
                <TableCell>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.sourceName}</p>
                  <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{lead.sourceCode}</p>
                </TableCell>
                <TableCell><LeadOwner lead={lead} photoUrl={lead.ownerId ? ownerPhotoUrls.get(lead.ownerId) : undefined} /></TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={leadStatusTone(lead)}>{lead.statusName}</StatusPill>
                    <StatusPill tone="neutral">{lead.ratingName}</StatusPill>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--md-subtle)]">
                    {lead.qualificationScore !== null
                      ? <><span data-i18n-skip dir="ltr">{new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(lead.qualificationScore)}/100</span> · {lead.qualificationCriteriaMet}/4 {t("criteria met")}</>
                      : t("No qualification score")}
                  </p>
                </TableCell>
                <TableCell>
                  {lead.lastActivityAt ? (
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip={Boolean(lead.lastActivitySubject)} dir="auto">{lead.lastActivitySubject ?? t("Interaction recorded")}</p>
                      <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{formatLeadRelativeDate(lead.lastActivityAt, language)}</p>
                    </div>
                  ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No activity recorded")}</span>}
                </TableCell>
                <TableCell>
                  {lead.nextFollowUpAt ? (
                    <div>
                      <p className={cn("text-[13px] font-medium", followUpOverdue ? "text-[var(--md-danger)]" : "text-[var(--md-ink)]")} data-i18n-skip dir="auto">
                        {formatLeadRelativeDate(lead.nextFollowUpAt, language)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{formatLeadDate(lead.nextFollowUpAt, language)}</p>
                    </div>
                  ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("Not scheduled")}</span>}
                </TableCell>
                <TableCell>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{formatLeadDate(lead.createdAt, language)}</p>
                  <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
                    <span data-i18n-skip dir="ltr">{new Intl.NumberFormat(language).format(createdDaysAgo)}</span> {t(createdDaysAgo === 1 ? "day old" : "days old")}
                  </p>
                </TableCell>
                <TableCell className="text-end">
                  {lead.valueAmount !== null && lead.valueCurrencyCode ? (
                    <p className="text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{formatLeadCurrency(lead.valueAmount, lead.valueCurrencyCode, language)}</p>
                  ) : lead.openOpportunityCount ? (
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">
                      <span data-i18n-skip dir="ltr">{lead.openOpportunityCount}</span> {t(lead.openOpportunityCount === 1 ? "open opportunity" : "open opportunities")}
                    </p>
                  ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No value recorded")}</span>}
                  {lead.valueContext ? <p className="mt-1 max-w-[190px] truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{lead.valueContext}</p> : null}
                </TableCell>
              </TableRow>
            )
          }) : (
            <TableRow>
              <TableCell colSpan={10} className="h-36 text-center text-[13px] text-[var(--md-text)]">{emptyMessage}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function CrmLeadQualificationTable({
  leads,
  onOpenLead,
  emptyMessage,
  ownerPhotoUrls = emptyLeadOwnerPhotoUrls,
  toolbarLeading,
  toolbarActions,
  emptyState,
}: {
  leads: readonly ApiLead[]
  onOpenLead: (lead: ApiLead) => void
  emptyMessage: string
  ownerPhotoUrls?: ReadonlyMap<string, string>
  toolbarLeading?: ReactNode
  toolbarActions?: ReactNode
  emptyState?: ReactNode
}) {
  const { language, t } = useLanguage()
  const columns = useMemo<DataTableColumn<ApiLead>[]>(() => [
    {
      id: "lead",
      label: "Lead",
      width: 240,
      minWidth: 190,
      maxWidth: 360,
      defaultPinned: true,
      resizable: true,
      sortValue: (lead) => lead.companyName,
      cell: (lead) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10" aria-label={lead.companyName}>
            <AvatarFallback className="bg-[var(--md-accent-a12)] text-[13px] font-medium text-[var(--md-accent)]">
              {lead.initials}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.companyName}</span>
            <span className="mt-1 block truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">
              {[lead.countryCode, lead.serviceInterest ?? lead.tradeLane].filter(Boolean).join(" · ") || t("Commercial lead")}
            </span>
          </span>
        </div>
      ),
    },
    {
      id: "primary-contact",
      label: "Primary contact",
      width: 210,
      minWidth: 170,
      maxWidth: 320,
      resizable: true,
      sortValue: (lead) => lead.primaryContactName ?? lead.primaryContactEmail,
      cell: (lead) => lead.primaryContactName || lead.primaryContactEmail ? (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.primaryContactName ?? t("Contact not named")}</p>
          {lead.primaryContactEmail ? <p className="mt-1 truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{lead.primaryContactEmail}</p> : null}
        </div>
      ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No primary contact")}</span>,
    },
    {
      id: "source",
      label: "Source",
      width: 150,
      minWidth: 120,
      maxWidth: 260,
      resizable: true,
      sortValue: (lead) => lead.sourceName,
      cell: (lead) => (
        <>
          <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.sourceName}</p>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{lead.sourceCode}</p>
        </>
      ),
    },
    {
      id: "owner",
      label: "Owner",
      width: 170,
      minWidth: 140,
      maxWidth: 260,
      resizable: true,
      sortValue: (lead) => lead.ownerName,
      cell: (lead) => <LeadOwner lead={lead} photoUrl={lead.ownerId ? ownerPhotoUrls.get(lead.ownerId) : undefined} />,
    },
    {
      id: "qualification",
      label: "Stage and qualification",
      width: 190,
      minWidth: 165,
      maxWidth: 300,
      resizable: true,
      sortValue: (lead) => lead.qualificationScore ?? lead.statusName,
      cell: (lead) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={leadStatusTone(lead)}>{lead.statusName}</StatusPill>
            <StatusPill tone="neutral">{lead.ratingName}</StatusPill>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--md-subtle)]">
            {lead.qualificationScore !== null
              ? <><span data-i18n-skip dir="ltr">{new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(lead.qualificationScore)}/100</span> · {lead.qualificationCriteriaMet}/4 {t("criteria met")}</>
              : t("No qualification score")}
          </p>
        </>
      ),
    },
    {
      id: "engagement",
      label: "Engagement",
      width: 220,
      minWidth: 180,
      maxWidth: 360,
      resizable: true,
      sortValue: (lead) => lead.lastActivityAt,
      cell: (lead) => lead.lastActivityAt ? (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip={Boolean(lead.lastActivitySubject)} dir="auto">{lead.lastActivitySubject ?? t("Interaction recorded")}</p>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{formatLeadRelativeDate(lead.lastActivityAt, language)}</p>
        </div>
      ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No activity recorded")}</span>,
    },
    {
      id: "follow-up",
      label: "Next follow-up",
      width: 150,
      minWidth: 130,
      maxWidth: 240,
      resizable: true,
      sortValue: (lead) => lead.nextFollowUpAt,
      cell: (lead) => {
        const overdue = lead.nextFollowUpAt !== null && new Date(lead.nextFollowUpAt).getTime() < Date.now()
        return lead.nextFollowUpAt ? (
          <div>
            <p className={cn("text-[13px] font-medium", overdue ? "text-[var(--md-danger)]" : "text-[var(--md-ink)]")} data-i18n-skip dir="auto">{formatLeadRelativeDate(lead.nextFollowUpAt, language)}</p>
            <p className="mt-1 text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{formatLeadDate(lead.nextFollowUpAt, language)}</p>
          </div>
        ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("Not scheduled")}</span>
      },
    },
    {
      id: "created",
      label: "Created and age",
      width: 140,
      minWidth: 125,
      maxWidth: 220,
      resizable: true,
      sortValue: (lead) => lead.createdAt,
      cell: (lead) => {
        const daysOld = Math.max(Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000), 0)
        return (
          <>
            <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{formatLeadDate(lead.createdAt, language)}</p>
            <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
              <span data-i18n-skip dir="ltr">{new Intl.NumberFormat(language).format(daysOld)}</span> {t(daysOld === 1 ? "day old" : "days old")}
            </p>
          </>
        )
      },
    },
    {
      id: "value",
      label: "Lead value",
      width: 180,
      minWidth: 150,
      maxWidth: 280,
      resizable: true,
      cellClassName: "text-end",
      headerClassName: "text-end",
      sortValue: (lead) => lead.valueAmount ?? lead.openOpportunityCount,
      cell: (lead) => (
        <>
          {lead.valueAmount !== null && lead.valueCurrencyCode ? (
            <p className="text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{formatLeadCurrency(lead.valueAmount, lead.valueCurrencyCode, language)}</p>
          ) : lead.openOpportunityCount ? (
            <p className="text-[13px] font-medium text-[var(--md-ink)]">
              <span data-i18n-skip dir="ltr">{lead.openOpportunityCount}</span> {t(lead.openOpportunityCount === 1 ? "open opportunity" : "open opportunities")}
            </p>
          ) : <span className="text-[12px] text-[var(--md-subtle)]">{t("No value recorded")}</span>}
          {lead.valueContext ? <p className="mt-1 max-w-[190px] truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="auto">{lead.valueContext}</p> : null}
        </>
      ),
    },
  ], [language, ownerPhotoUrls, t])

  return (
    <DataTable
      ariaLabel="CRM leads"
      columnsButtonLabel="Manage lead columns"
      columns={columns}
      rows={[...leads]}
      getRowKey={(lead) => lead.id}
      storageKey="crm-leads"
      rowClassName="min-h-[76px] bg-white hover:bg-[#f8faf9] dark:bg-[var(--md-surface)] dark:hover:bg-[var(--md-surface-soft)]"
      onRowClick={onOpenLead}
      toolbarLeading={toolbarLeading}
      toolbarActions={toolbarActions}
      emptyState={emptyState ?? <p className="text-[13px] text-[var(--md-text)]">{emptyMessage}</p>}
    />
  )
}

const LeadCompanyOverviewShaderCanvas = lazy(() => import("./lead-company-overview-shader"))

function LeadCompanyOverviewShader() {
  return (
    <Suspense
      fallback={(
        <span
          className="block size-full"
          style={{ background: "radial-gradient(circle at 50% 100%, #5366e5 0%, #06030a 68%)" }}
        />
      )}
    >
      <LeadCompanyOverviewShaderCanvas />
    </Suspense>
  )
}

export function CrmLeadDetailPanel({
  lead,
  onBack,
  onStartQualification,
  ownerPhotoUrl,
}: {
  lead: ApiLeadDetail
  onBack?: () => void
  onStartQualification?: (lead: ApiLead) => void
  ownerPhotoUrl?: string
}) {
  const { language, t } = useLanguage()
  const qualification = lead.qualificationScore !== null
    ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(lead.qualificationScore)}/100`
    : t("Not scored")
  const contactCount = `${new Intl.NumberFormat(language).format(lead.contacts.length)} ${t(lead.contacts.length === 1 ? "contact" : "contacts")}`
  const companyRows = [
    {
      key: "email",
      label: t("Company email"),
      value: lead.company.email,
      copyValue: lead.company.email,
      icon: Mail,
      href: lead.company.email ? `mailto:${lead.company.email}` : null,
      direction: "ltr" as const,
    },
    {
      key: "website",
      label: t("Website"),
      value: lead.company.website?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ?? null,
      copyValue: lead.company.website,
      icon: Globe2,
      href: lead.company.website ? leadWebsiteHref(lead.company.website) : null,
      direction: "ltr" as const,
      external: true,
    },
    {
      key: "phone",
      label: t("Company phone"),
      value: lead.company.phone,
      copyValue: lead.company.phone,
      icon: Phone,
      href: lead.company.phone ? `tel:${lead.company.phone}` : null,
      direction: "ltr" as const,
    },
    {
      key: "address",
      label: t("Address"),
      value: lead.company.address,
      copyValue: lead.company.address,
      icon: Building2,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "owner",
      label: t("Owner"),
      value: lead.ownerName,
      copyValue: lead.ownerName,
      icon: UsersRound,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "created",
      label: t("Created"),
      value: formatLeadDate(lead.createdAt, language),
      copyValue: formatLeadDate(lead.createdAt, language),
      icon: CalendarDays,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "record-age",
      label: t("Record age"),
      value: formatLeadAge(lead.createdAt, language),
      copyValue: formatLeadAge(lead.createdAt, language),
      icon: Clock3,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "lead-source",
      label: t("Lead source"),
      value: lead.sourceName,
      copyValue: lead.sourceName,
      icon: FileText,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "country",
      label: t("Country"),
      value: formatLeadCountry(lead.countryCode, language),
      copyValue: formatLeadCountry(lead.countryCode, language),
      icon: MapPin,
      href: null,
      direction: "auto" as const,
    },
    {
      key: "freight-interests",
      label: t("Freight interests"),
      value: [lead.serviceInterest, lead.tradeLane].filter(Boolean).join(" · ") || null,
      copyValue: [lead.serviceInterest, lead.tradeLane].filter(Boolean).join(" · ") || null,
      icon: Target,
      href: null,
      direction: "auto" as const,
    },
  ]
  const companyOverviewRows = companyRows.filter(({ key }) => !["country", "freight-interests"].includes(key))

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
        <header className="px-5 py-5 shadow-[var(--md-stroke-bottom)] sm:px-6">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              className="-ms-2 mb-4 h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]"
              onClick={onBack}
            >
              <ArrowLeft data-icon="inline-start" className="size-3.5" strokeWidth={1.3} aria-hidden="true" />
              {t("Back to leads")}
            </Button>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <CustomerAvatar
                initials={lead.initials}
                tone="teal"
                size="lg"
                className="size-14 rounded-full text-[18px]"
              />
              <div className="min-w-0">
                <CopyableField label={t("Company")} value={lead.companyName} className="-my-1">
                  <h1 className="truncate text-[24px] font-medium leading-8 text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.companyName}</h1>
                </CopyableField>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill tone={leadStatusTone(lead)}>{lead.statusName}</StatusPill>
                  <StatusPill tone="neutral">{lead.ratingName}</StatusPill>
                  <CopyableField label={t("Source")} value={lead.sourceName} className="-my-2">
                    <span className="text-[12px] text-[var(--md-text)]">
                      {t("Source")}: <bdi data-i18n-skip dir="auto">{lead.sourceName}</bdi>
                    </span>
                  </CopyableField>
                </div>
              </div>
            </div>
            {onStartQualification ? (
              <Button
                className="h-10 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() => onStartQualification(lead)}
              >
                {t("Continue qualification")}
              </Button>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-2 bg-[var(--md-surface-soft)] shadow-[var(--md-stroke-bottom)] lg:grid-cols-3 2xl:grid-cols-5">
          <div className="min-w-0 px-5 py-4 sm:px-6 lg:shadow-[var(--md-stroke-right)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Owner")}</p>
            {lead.ownerName ? (
              <div className="mt-1 flex min-w-0 items-center gap-2.5">
                <Avatar aria-label={lead.ownerName} className="size-8 shrink-0">
                  {ownerPhotoUrl ? <AvatarImage src={ownerPhotoUrl} alt="" /> : null}
                  <AvatarFallback className="bg-[var(--md-accent-a11)] text-[11px] font-medium text-[var(--md-accent)]">{lead.ownerInitials ?? "—"}</AvatarFallback>
                </Avatar>
                <CopyableField label={t("Owner")} value={lead.ownerName} className="-my-1 min-w-0">
                  <p className="min-w-0 truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{lead.ownerName}</p>
                </CopyableField>
              </div>
            ) : <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Unassigned")}</p>}
          </div>
          <div className="min-w-0 px-5 py-4 sm:px-6 lg:shadow-[var(--md-stroke-right)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Qualification score")}</p>
            <CopyableField label={t("Qualification score")} value={qualification} className="mt-1 -me-2">
              <p className="text-[18px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{qualification}</p>
            </CopyableField>
          </div>
          <div className="min-w-0 px-5 py-4 sm:px-6 lg:shadow-[var(--md-stroke-right)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Qualification criteria")}</p>
            <CopyableField label={t("Qualification criteria")} value={`${lead.qualificationCriteriaMet}/4`} className="mt-1 -me-2">
              <p className="text-[15px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="ltr">{lead.qualificationCriteriaMet}/4</p>
            </CopyableField>
            <p className="mt-1 text-[11px] text-[var(--md-text)]">{t("criteria met")}</p>
          </div>
          <div className="min-w-0 px-5 py-4 sm:px-6 lg:shadow-[var(--md-stroke-right)]">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Lead value")}</p>
            {lead.valueAmount !== null && lead.valueCurrencyCode ? (
              <CopyableField
                label={t("Lead value")}
                value={formatLeadCurrency(lead.valueAmount, lead.valueCurrencyCode, language)}
                copyValue={[formatLeadCurrency(lead.valueAmount, lead.valueCurrencyCode, language), lead.valueContext].filter(Boolean).join(" · ")}
                className="mt-1 -me-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
                    {formatLeadCurrency(lead.valueAmount, lead.valueCurrencyCode, language)}
                  </p>
                  {lead.valueContext ? <p className="mt-1 truncate text-[11px] text-[var(--md-text)]" data-i18n-skip dir="auto">{lead.valueContext}</p> : null}
                </div>
              </CopyableField>
            ) : <p className="mt-2 truncate text-[15px] font-medium text-[var(--md-ink)]">{t("Not recorded")}</p>}
          </div>
          <div className="col-span-2 min-w-0 px-5 py-4 sm:px-6 lg:col-span-1">
            <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Next follow-up")}</p>
            {lead.nextFollowUpAt ? (
              <CopyableField
                label={t("Next follow-up")}
                value={formatLeadDate(lead.nextFollowUpAt, language)}
                copyValue={`${formatLeadDate(lead.nextFollowUpAt, language)} · ${formatLeadRelativeDate(lead.nextFollowUpAt, language)}`}
                className="mt-1 -me-2"
              >
                <div>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{formatLeadDate(lead.nextFollowUpAt, language)}</p>
                  <p className="mt-1 text-[11px] text-[var(--md-text)]" data-i18n-skip dir="auto">{formatLeadRelativeDate(lead.nextFollowUpAt, language)}</p>
                </div>
              </CopyableField>
            ) : <p className="mt-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Not scheduled")}</p>}
          </div>
        </div>

        <div className="px-5 py-6 sm:px-6">
          <SectionHeader title={t("Contacts")} meta={contactCount} />
          {lead.contacts.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {lead.contacts.map((contact) => (
                <LeadContactCard key={contact.id} contact={contact} language={language} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-8 text-center shadow-[var(--md-shadow-line)]">
              <UsersRound className="mx-auto size-5 text-[var(--md-subtle)]" strokeWidth={1.3} aria-hidden="true" />
              <p className="mt-2 text-[13px] text-[var(--md-text)]">{t("No contacts have been recorded for this lead.")}</p>
            </div>
          )}
        </div>

        <section
          className="px-5 py-6 shadow-[var(--md-stroke-top)] sm:px-6"
          aria-labelledby={`lead-customer-information-${lead.id}`}
        >
          <h2 id={`lead-customer-information-${lead.id}`} className="text-[14px] font-medium text-[var(--md-ink)]">
            {t("Customer information")}
          </h2>
          <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
            {companyRows.map(({ key, label, value, copyValue, icon: Icon, href, direction, external }) => (
              <div
                key={key}
                className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-3.5 shadow-[var(--md-stroke-top)] first:shadow-none sm:[&:nth-child(2)]:shadow-none"
              >
                <Icon className="mt-0.5 size-4 text-[var(--md-accent)]" strokeWidth={1.25} aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-[var(--md-subtle)]">{label}</dt>
                  <dd className="mt-1 min-w-0 text-[13px] font-medium leading-5 text-[var(--md-ink)]">
                    {value && copyValue ? (
                      <CopyableField
                        label={label}
                        value={value}
                        copyValue={copyValue}
                        className="-my-2 max-w-full"
                        contentClassName="max-w-full"
                      >
                        {href ? (
                          <a
                            href={href}
                            target={external ? "_blank" : undefined}
                            rel={external ? "noreferrer" : undefined}
                            className="inline-flex max-w-full items-center gap-1 text-[var(--md-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-ring)]"
                            dir={direction}
                            data-i18n-skip
                          >
                            <span className="break-all">{value}</span>
                            {external ? <ExternalLink className="size-3 shrink-0" strokeWidth={1.3} aria-hidden="true" /> : null}
                          </a>
                        ) : <span className="break-words" data-i18n-skip dir={direction}>{value}</span>}
                      </CopyableField>
                    ) : <span className="text-[var(--md-subtle)]">{t("Not recorded")}</span>}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-0 shadow-[var(--md-stroke-top)] lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <section className="min-w-0 px-5 py-5 sm:px-6 lg:shadow-[var(--md-stroke-right)]" aria-labelledby={`lead-activity-${lead.id}`}>
            <h2 id={`lead-activity-${lead.id}`} className="text-[14px] font-medium text-[var(--md-ink)]">{t("Activity")}</h2>
            {lead.activities.length ? (
              <ol className="mt-3">
                {lead.activities.slice(0, 5).map((activity) => {
                  const ActivityIcon = activity.typeCode === "call" ? Phone : activity.typeCode === "email" ? Mail : FileText
                  return (
                    <li key={activity.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 py-3 shadow-[var(--md-stroke-top)] first:shadow-none">
                      <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">
                        <ActivityIcon className="size-3.5" strokeWidth={1.3} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <CopyableField label={t("Activity subject")} value={activity.subject} className="-my-2">
                          <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{activity.subject}</span>
                        </CopyableField>
                        {activity.summary ? (
                          <CopyableField label={t("Activity note")} value={activity.summary} className="-my-2 mt-0.5">
                            <span className="block line-clamp-2 text-[11px] leading-4 text-[var(--md-text)]" data-i18n-skip dir="auto">{activity.summary}</span>
                          </CopyableField>
                        ) : null}
                      </span>
                      <CopyableField
                        label={t("Activity date")}
                        value={formatLeadRelativeDate(activity.activityAt, language)}
                        copyValue={formatLeadDate(activity.activityAt, language)}
                        className="-my-2"
                      >
                        <time className="whitespace-nowrap text-[11px] text-[var(--md-subtle)]" dateTime={activity.activityAt} data-i18n-skip dir="auto">
                          {formatLeadRelativeDate(activity.activityAt, language)}
                        </time>
                      </CopyableField>
                    </li>
                  )
                })}
              </ol>
            ) : <p className="mt-3 text-[12px] text-[var(--md-text)]">{t("No activity recorded")}</p>}
          </section>

          <section className="min-w-0 px-5 py-5 sm:px-6" aria-labelledby={`lead-context-${lead.id}`}>
            <h2 id={`lead-context-${lead.id}`} className="text-[14px] font-medium text-[var(--md-ink)]">{t("Lead context")}</h2>
            <dl className="mt-3">
              {[
                [t("Service interest"), lead.serviceInterest],
                [t("Trade lane"), lead.tradeLane],
                [t("Conversion probability"), lead.conversionProbability !== null ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(lead.conversionProbability * (lead.conversionProbability <= 1 ? 100 : 1))}%` : null],
                [t("Open opportunities"), new Intl.NumberFormat(language).format(lead.openOpportunityCount)],
                [t("Last activity"), lead.lastActivityAt ? formatLeadDate(lead.lastActivityAt, language) : null],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] gap-4 py-2.5 shadow-[var(--md-stroke-top)] first:shadow-none">
                  <dt className="text-[11px] text-[var(--md-subtle)]">{label}</dt>
                  <dd className="min-w-0 text-[12px] font-medium text-[var(--md-ink)]">
                    {value ? (
                      <CopyableField label={label ?? ""} value={value} className="-my-2">
                        <span className="block truncate" data-i18n-skip dir="auto">{value}</span>
                      </CopyableField>
                    ) : <span>{t("Not recorded")}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </Surface>

      <aside
        className="relative min-w-0 self-start overflow-hidden rounded-[var(--md-radius-xl)] bg-[#06030a] px-5 py-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_var(--md-accent-veil-ring-a16),0_16px_36px_var(--md-accent-veil-cast-a18)] xl:sticky xl:top-[76px]"
        aria-labelledby={`lead-company-${lead.id}`}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 scale-[1.04]">
          <LeadCompanyOverviewShader />
        </span>
        <div className="relative z-10 [text-shadow:0_1px_10px_rgba(0,0,0,0.32)]">
          <h2 id={`lead-company-${lead.id}`} className="text-[13px] font-medium text-white/72">{t("Company overview")}</h2>
          <div className="mt-4 flex items-center gap-3">
            <CustomerAvatar
              initials={lead.initials}
              tone="teal"
              className="size-12 rounded-full bg-white/13 text-[15px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
            />
            <CopyableField
              label={t("Company")}
              value={lead.companyName}
              className="-my-2 min-w-0"
              contentClassName="min-w-0"
              buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10"
              tone="inverse"
            >
              <p className="break-words text-[17px] font-medium leading-6 text-white" data-i18n-skip dir="auto">{lead.companyName}</p>
            </CopyableField>
          </div>

          <dl className="mt-3.5">
            {companyOverviewRows.map(({ key, label, value, copyValue, icon: Icon, href, direction, external }) => (
              <div key={key} className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] first:shadow-none">
                <Icon className="mt-0.5 size-4 text-white/54" strokeWidth={1.25} aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[10.5px] text-white/58">{label}</dt>
                  <dd className="mt-0.5 min-w-0 text-[12px] font-medium leading-[18px] text-white/90">
                  {value && copyValue ? (
                    <CopyableField
                      label={label}
                      value={value}
                      copyValue={copyValue}
                      className="-my-2 max-w-full"
                      contentClassName="max-w-full"
                      buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10"
                      tone="inverse"
                    >
                      {href ? (
                        <a
                          href={href}
                          target={external ? "_blank" : undefined}
                          rel={external ? "noreferrer" : undefined}
                          className="inline-flex max-w-full items-center gap-1 text-[var(--md-accent-lift-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                          dir={direction}
                          data-i18n-skip
                        >
                          <span className={cn("min-w-0", key === "phone" ? "whitespace-nowrap" : "[overflow-wrap:anywhere]")}>{value}</span>
                          {external ? <ExternalLink className="size-3 shrink-0" strokeWidth={1.3} aria-hidden="true" /> : null}
                        </a>
                      ) : <span data-i18n-skip dir={direction}>{value}</span>}
                    </CopyableField>
                  ) : <span className="text-white/48">{t("Not recorded")}</span>}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          {lead.nextFollowUpAt ? (
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <CalendarDays className="mt-0.5 size-4 text-[var(--md-accent-lift-strong)]" strokeWidth={1.25} aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="text-[10.5px] font-normal text-white/58">{t("Upcoming follow-up")}</h3>
                <CopyableField
                  label={t("Upcoming follow-up")}
                  value={formatLeadDate(lead.nextFollowUpAt, language)}
                  className="-my-2 mt-0.5"
                  buttonClassName="size-6 before:-inset-0.5 [@media(hover:none)]:size-10"
                  tone="inverse"
                >
                  <p className="text-[12px] font-medium leading-[18px] text-white" data-i18n-skip dir="auto">{formatLeadDate(lead.nextFollowUpAt, language)}</p>
                </CopyableField>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function LeadContactCard({
  contact,
  language,
}: {
  contact: ApiLeadContact
  language: string
}) {
  const { t } = useLanguage()
  const name = contact.name ?? t("Unnamed contact")
  const role = t(leadContactRoleKey(contact.roleCode, contact.isPrimary))

  return (
    <article className={cn(
      "relative min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] transition-[background,box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] motion-reduce:transform-none",
      contact.isPrimary && "shadow-[inset_2px_0_0_var(--md-accent),var(--md-shadow-line)] rtl:shadow-[inset_-2px_0_0_var(--md-accent),var(--md-shadow-line)]",
    )}>
      <div className="flex items-start gap-3">
        <CustomerAvatar initials={contact.initials} tone="teal" className="rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CopyableField label={t("Contact name")} value={name} className="-my-2 min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip={Boolean(contact.name) || undefined} dir="auto">{name}</h3>
            </CopyableField>
            {contact.isPrimary ? <StatusPill tone="teal">{t("Primary")}</StatusPill> : null}
          </div>
          <CopyableField label={t("Contact role")} value={role} className="-my-2 mt-0.5">
            <p className="text-[11px] text-[var(--md-text)]">{role}</p>
          </CopyableField>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5">
        {contact.email ? (
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.25} aria-hidden="true" />
            <CopyableField label={t("Email")} value={contact.email} className="-my-2 min-w-0">
            <a href={`mailto:${contact.email}`} className="inline-flex min-w-0 items-center gap-2 text-[12px] text-[var(--md-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-ring)]" aria-label={`${t("Email")} ${name}`}>
              <span className="truncate" data-i18n-skip dir="ltr">{contact.email}</span>
            </a>
            </CopyableField>
          </div>
        ) : <p className="text-[11px] text-[var(--md-subtle)]">{t("No email recorded")}</p>}
        {contact.phone ? (
          <div className="flex min-w-0 items-center gap-2">
            <Phone className="size-3.5 shrink-0 text-[var(--md-text)]" strokeWidth={1.25} aria-hidden="true" />
            <CopyableField label={t("Phone")} value={contact.phone} className="-my-2 min-w-0">
            <a href={`tel:${contact.phone}`} className="inline-flex min-w-0 items-center gap-2 text-[12px] text-[var(--md-text)] hover:text-[var(--md-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-ring)]" aria-label={`${t("Call")} ${name}`}>
              <span className="truncate" data-i18n-skip dir="ltr">{contact.phone}</span>
            </a>
            </CopyableField>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 pt-3 shadow-[var(--md-stroke-top)]">
        <p className="text-[11px] text-[var(--md-subtle)]">{t("Last contact")}</p>
        {contact.lastContactAt ? (
          <CopyableField
            label={t("Last contact")}
            value={formatLeadRelativeDate(contact.lastContactAt, language)}
            className="-my-2 min-w-0 flex-1 justify-end"
            contentClassName="text-end"
          >
            <p className="truncate text-end text-[11px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">
              {formatLeadRelativeDate(contact.lastContactAt, language)}
            </p>
          </CopyableField>
        ) : <p className="text-end text-[11px] font-medium text-[var(--md-ink)]">{t("No activity recorded")}</p>}
      </div>
    </article>
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
  loading,
  error,
  onRetry,
  onOpenContext,
}: {
  activities?: readonly CrmActivity[]
  compact?: boolean
  loading?: boolean
  error?: string
  onRetry?: () => void
  onOpenContext?: (route: string) => void
}) {
  const timelineEvents: AuditTimelineEvent[] = activities.map((item, index) => {
    const timeMatch = item.time.match(/^(.*)\s(\d{2}:\d{2})$/)
    const [actor, source = "CRM"] = item.source.split(" · ")
    const normalizedTitle = item.title.toLowerCase()
    const normalizedSource = item.source.toLowerCase()
    const isDealActivity = normalizedTitle.includes("quote") && normalizedTitle.includes("accepted")

    let kind: AuditTimelineEvent["kind"] = "note"
    let statusLabel = "CRM note"
    if (item.tone === "red") {
      kind = "exception"
      statusLabel = "Exception"
    } else if (normalizedSource.startsWith("email")) {
      kind = "email"
      statusLabel = normalizedTitle.includes("requested") ? "Request" : "Email"
    } else if (normalizedSource.startsWith("ai") || normalizedSource.startsWith("dexter")) {
      kind = "automation"
      statusLabel = "AI signal"
    } else if (normalizedTitle.includes("quote")) {
      kind = "pricing"
      statusLabel = "Quote"
    }

    return {
      id: `crm-activity-${index}-${item.time.replaceAll(" ", "-")}`,
      title: item.title,
      detail: item.detail,
      date: timeMatch?.[1] ?? item.time,
      time: timeMatch?.[2],
      actor,
      source,
      state: "completed",
      kind,
      tone: item.tone,
      statusLabel,
      contextLabel: item.account,
      contextRoute: isDealActivity ? "/crm/deals" : "/crm/leads",
    }
  })

  return (
    <AuditTimeline
      events={timelineEvents}
      title="Relationship activity"
      description={compact ? "Latest customer signals" : "AI, email, sales, and booking events"}
      loading={loading}
      error={error}
      emptyMessage="No relationship activity yet."
      onRetry={onRetry}
      onContextSelect={onOpenContext ? (event) => onOpenContext(event.contextRoute ?? "/crm/leads") : undefined}
      groupConsecutiveDates
      showCompletedCheck={false}
      compact={compact}
    />
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
  disabled = false,
  busy = false,
  first = false,
  last = false,
  onSelect,
  onMove,
  onEdit,
  onRemove,
}: {
  field: { label: string; type: string; options: readonly string[] }
  selected: string[]
  disabled?: boolean
  busy?: boolean
  first?: boolean
  last?: boolean
  onSelect: (option: string) => void
  /** Omitted for preview rows, which have no saved record behind them to manage. */
  onMove?: (offset: -1 | 1) => void
  onEdit?: () => void
  onRemove?: () => void
}) {
  const { t } = useLanguage()
  const multi = field.type === "Multi-select dropdown"
  const label = selected.length > 0 ? selected.join(", ") : "Choose"
  const manageable = Boolean(onMove || onEdit || onRemove)

  return (
    <div
      className={cn(
        "grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-center",
        // Rows are wrapped one level deep now that each can reveal an editor, so the divider is
        // driven by the row's position in the list rather than a first-child selector.
        first ? undefined : "shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-[var(--md-ink)]" dir="auto">{field.label}</p>
          <StatusPill tone={multi ? "teal" : "neutral"}>{field.type}</StatusPill>
          {manageable ? (
            <span className="flex items-center gap-0.5">
              {onMove ? (
                <>
                  <button
                    type="button"
                    aria-label={`${t("Move field earlier")}: ${field.label}`}
                    title={t("Move field earlier")}
                    disabled={disabled || busy || first}
                    onClick={() => onMove(-1)}
                    className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" strokeWidth={1.6} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("Move field later")}: ${field.label}`}
                    title={t("Move field later")}
                    disabled={disabled || busy || last}
                    onClick={() => onMove(1)}
                    className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" strokeWidth={1.6} />
                  </button>
                </>
              ) : null}
              {onEdit ? (
                <button
                  type="button"
                  aria-label={`${t("Edit field")}: ${field.label}`}
                  title={t("Edit field")}
                  disabled={disabled || busy}
                  onClick={onEdit}
                  className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-accent)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                >
                  <SlidersHorizontal className="size-3.5" strokeWidth={1.6} />
                </button>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`${t("Remove field")}: ${field.label}`}
                  title={t("Remove field")}
                  disabled={disabled || busy}
                  onClick={onRemove}
                  className="grid size-7 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] hover:text-[var(--md-red)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--md-red)_20%,transparent)] disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.6} />
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]" dir="auto">{field.options.join(" · ")}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            disabled={disabled}
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

type SettingsField = { id: string | null; label: string; type: string; options: readonly string[] }

type LeadFieldDraft = { label: string; type: string; options: string[] }

const leadFieldTypes = ["Dropdown", "Multi-select dropdown"]

/**
 * Inline editor for a company lead field. One option per line keeps the control honest about what a
 * dropdown will offer, and the same form covers adding a field and reworking an existing one.
 */
function LeadFieldComposer({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial?: SettingsField
  busy: boolean
  onCancel: () => void
  onSubmit: (draft: LeadFieldDraft) => void
}) {
  const { t } = useLanguage()
  const [label, setLabel] = useState(initial?.label ?? "")
  const [type, setType] = useState(initial?.type ?? leadFieldTypes[0])
  const [options, setOptions] = useState((initial?.options ?? []).join("\n"))

  const parsed = options
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
  const ready = label.trim().length > 0 && parsed.length > 0

  return (
    <form
      className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || busy) return
        onSubmit({ label: label.trim(), type, options: parsed })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Field name")}</span>
          <Input
            autoFocus
            dir="auto"
            value={label}
            placeholder={t("Lead source")}
            onChange={(event) => setLabel(event.target.value)}
            className="h-10 rounded-[var(--md-radius-lg)] text-[13px]"
          />
        </label>
        <div className="grid gap-1.5">
          <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Field type")}</span>
          <div role="radiogroup" aria-label={t("Field type")} className="flex gap-1.5">
            {leadFieldTypes.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === type}
                onClick={() => setType(option)}
                className={cn(
                  "h-10 flex-1 rounded-[var(--md-radius-lg)] px-2 text-[12px] font-medium transition-[background,box-shadow,color] duration-150",
                  option === type
                    ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[inset_0_0_0_1.5px_var(--md-accent)]"
                    : "text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]",
                )}
              >
                {t(option)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="grid gap-1.5">
        <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Options, one per line")}</span>
        <Textarea
          dir="auto"
          value={options}
          rows={4}
          onChange={(event) => setOptions(event.target.value)}
          className="min-h-[88px] rounded-[var(--md-radius-lg)] text-[13px] leading-5"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!ready || busy} className="h-9 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium">
          {busy ? t("Saving…") : initial ? t("Save field") : t("Add field")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium"
        >
          {t("Cancel")}
        </Button>
        <p className="ms-auto text-[11px] text-[var(--md-subtle)]">
          <span data-i18n-skip dir="ltr">{parsed.length}</span> {t(parsed.length === 1 ? "option" : "options")}
        </p>
      </div>
    </form>
  )
}

function toEditorSource(pipeline: ApiPipeline): CrmPipelineEditorSource {
  return {
    id: pipeline.id,
    name: pipeline.name,
    owner: pipeline.owner,
    defaultStage: pipeline.defaultStage,
    conversionStage: pipeline.conversionStage,
    automation: pipeline.automation,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      tone: stage.tone,
      rule: stage.rule,
      probability: stage.probability,
    })),
  }
}

/**
 * Pipeline and lead field configuration for the whole company. Left to its own devices it reads and
 * writes the workspace's saved settings; the components gallery passes static data instead so the
 * preview never needs a signed-in session.
 */
export function CrmSettingsBuilder({
  pipelines: staticPipelines,
  fields: staticFields,
  canEdit = true,
  addStageRequestKey = 0,
  stacked = false,
}: {
  pipelines?: readonly CrmPipelineSetting[]
  fields?: readonly CrmLeadFieldSetting[]
  canEdit?: boolean
  addStageRequestKey?: number
  stacked?: boolean
}) {
  const { t } = useLanguage()
  const [dealCardFields, setDealCardFields] = useDealCardFields()
  const preview = staticPipelines !== undefined || staticFields !== undefined

  const [serverPipelines, setServerPipelines] = useState<ApiPipeline[]>([])
  const [serverFields, setServerFields] = useState<ApiLeadField[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(preview ? "ready" : "loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedFieldOptions, setSelectedFieldOptions] = useState<Record<string, string[]>>({})
  /** null while the composer is closed, "new" while adding, otherwise the field being reworked. */
  const [composerTarget, setComposerTarget] = useState<"new" | string | null>(null)
  const [fieldBusy, setFieldBusy] = useState(false)

  useEffect(() => {
    if (preview) return undefined

    let isMounted = true
    setLoadState("loading")
    setLoadError(null)

    getPipelineSettings()
      .then((settings) => {
        if (!isMounted) return
        setServerPipelines(settings.pipelines)
        setServerFields(settings.fields)
        setSelectedFieldOptions(Object.fromEntries(settings.fields.map((field) => [field.id, field.activeOptions])))
        setLoadState("ready")
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        setLoadError(error instanceof Error ? error.message : t("We could not load pipeline settings."))
        setLoadState("error")
      })

    return () => {
      isMounted = false
    }
  }, [preview, reloadToken, t])

  const editorPipelines = useMemo<readonly CrmPipelineEditorSource[]>(() => {
    if (staticPipelines) return staticPipelines
    return serverPipelines.map(toEditorSource)
  }, [serverPipelines, staticPipelines])

  const fields = useMemo<SettingsField[]>(() => {
    if (staticFields) {
      return staticFields.map((field) => ({ id: null, label: field.label, type: field.type, options: field.options }))
    }
    return serverFields.map((field) => ({ id: field.id, label: field.label, type: field.type, options: field.options }))
  }, [serverFields, staticFields])

  const conversionSummary = staticPipelines?.[0] ?? serverPipelines[0]

  function toggleDealCardField(key: DealCardFieldKey) {
    if (dealCardFields.includes(key)) {
      if (dealCardFields.length === 1) return
      setDealCardFields(dealCardFields.filter((field) => field !== key))
      return
    }

    if (dealCardFields.length >= dealCardFieldLimit) return
    setDealCardFields([...dealCardFields, key])
  }

  useEffect(() => {
    if (!staticFields) return
    setSelectedFieldOptions(Object.fromEntries(staticFields.map((field) => [field.label, field.activeOption.split(", ").filter(Boolean)])))
  }, [staticFields])

  /**
   * A pipeline with no id has only ever existed in the operator's browser, so it is created rather
   * than updated. Either way the id it was saved under goes back to the editor, which keys its
   * drafts on the workspace's identifiers once the save lands.
   */
  async function handleSavePipeline(pipeline: CrmPipelineEditorSave) {
    const body = {
      name: pipeline.name,
      owner: pipeline.owner,
      automation: pipeline.automation,
      stages: pipeline.stages,
    }

    if (!pipeline.id) {
      const created = await createPipeline(body)
      setServerPipelines((current) => [...current, created])
      return created.id
    }

    const saved = await savePipeline(pipeline.id, body)
    setServerPipelines((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)))
    return saved.id
  }

  async function handleDeletePipeline(pipelineId: string) {
    await deletePipeline(pipelineId)
    setServerPipelines((current) => current.filter((entry) => entry.id !== pipelineId))
  }

  async function handleReorderPipelines(pipelineIds: string[]) {
    setServerPipelines(await reorderPipelines(pipelineIds))
  }

  function fieldKey(field: SettingsField) {
    // Preview rows have no saved record, so they fall back to the label they were declared with.
    return field.id ?? field.label
  }

  function updateField(field: SettingsField, option: string) {
    const key = fieldKey(field)
    const existing = selectedFieldOptions[key] ?? []
    const next =
      field.type === "Multi-select dropdown"
        ? existing.includes(option)
          ? existing.filter((item) => item !== option)
          : [...existing, option]
        : [option]

    // Show the choice immediately and put it back if the workspace rejects the change.
    setSelectedFieldOptions((current) => ({ ...current, [key]: next }))
    if (!field.id) return

    void saveLeadField(field.id, { activeOptions: next }).catch((error: unknown) => {
      setSelectedFieldOptions((current) => ({ ...current, [key]: existing }))
      toast.error(error instanceof Error ? t(error.message) : t("We could not save this lead field."))
    })
  }

  async function runFieldChange(change: () => Promise<void>, fallback: string) {
    if (fieldBusy) return

    setFieldBusy(true)
    try {
      await change()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? t(error.message) : t(fallback))
    } finally {
      setFieldBusy(false)
    }
  }

  function submitField(draft: LeadFieldDraft) {
    const target = composerTarget

    void runFieldChange(async () => {
      if (target === "new") {
        const created = await createLeadField({ label: draft.label, type: draft.type, options: draft.options })
        setServerFields((current) => [...current, created])
        setSelectedFieldOptions((current) => ({ ...current, [created.id]: created.activeOptions }))
        toast.success(t("Lead field added"))
      } else if (target) {
        // Options the operator removed cannot stay selected, so the selection is trimmed to match.
        const kept = (selectedFieldOptions[target] ?? []).filter((option) => draft.options.includes(option))
        const saved = await saveLeadField(target, {
          label: draft.label,
          type: draft.type,
          options: draft.options,
          activeOptions: kept,
        })
        setServerFields((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)))
        setSelectedFieldOptions((current) => ({ ...current, [saved.id]: saved.activeOptions }))
        toast.success(t("Lead field saved"))
      }
      setComposerTarget(null)
    }, "We could not save this lead field.")
  }

  function removeField(field: SettingsField) {
    if (!field.id) return
    const id = field.id

    void runFieldChange(async () => {
      await deleteLeadField(id)
      setServerFields((current) => current.filter((entry) => entry.id !== id))
      setSelectedFieldOptions((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      if (composerTarget === id) setComposerTarget(null)
      toast.success(t("Lead field removed"))
    }, "We could not delete this lead field.")
  }

  function moveField(index: number, offset: -1 | 1) {
    const to = index + offset
    if (to < 0 || to >= serverFields.length || fieldBusy) return

    const previous = serverFields
    const next = [...serverFields]
    const [moving] = next.splice(index, 1)
    next.splice(to, 0, moving)

    // Show the new order straight away and roll back to the saved one if the write fails.
    setServerFields(next)
    setFieldBusy(true)

    void reorderLeadFields(next.map((field) => field.id))
      .then((saved) => setServerFields(saved))
      .catch((error: unknown) => {
        setServerFields(previous)
        toast.error(error instanceof Error ? t(error.message) : t("We could not save the field order."))
      })
      .finally(() => setFieldBusy(false))
  }

  if (loadState === "error") {
    return (
      <Surface padding="lg" className="rounded-[var(--md-radius-xl)]" role="alert">
        <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("We could not load pipeline settings.")}</p>
        <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]" dir="auto">{loadError ? t(loadError) : null}</p>
        <Button
          variant="ghost"
          className="mt-4 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
          onClick={() => setReloadToken((token) => token + 1)}
        >
          {t("Retry")}
        </Button>
      </Surface>
    )
  }

  return (
    <div className="grid min-w-0 gap-[var(--md-page-stack-gap)]">
      <CrmPipelineEditor
        pipelines={editorPipelines}
        loading={loadState === "loading"}
        canEdit={canEdit}
        onSave={preview ? undefined : handleSavePipeline}
        onDeletePipeline={preview ? undefined : handleDeletePipeline}
        onReorderPipelines={preview ? undefined : handleReorderPipelines}
        addStageRequestKey={addStageRequestKey}
        stacked={stacked}
      />

      <div
        className={cn(
          "grid min-w-0 items-start gap-[var(--md-page-stack-gap)]",
          !stacked && "2xl:grid-cols-[minmax(0,1fr)_380px]",
        )}
      >
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <SectionHeader
              title={t("Deal card fields")}
              meta={t("Choose up to 3 details shown on your deal cards.")}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                >
                  <SlidersHorizontal data-icon="inline-start" strokeWidth={1.2} />
                  {t("Choose fields")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-[360px] w-[260px] overflow-y-auto rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]"
              >
                <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">
                  <span data-i18n-skip dir="ltr">{dealCardFields.length} / {dealCardFieldLimit}</span> {t("fields selected")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {dealCardFieldDefinitions.map((field) => {
                  const checked = dealCardFields.includes(field.key)
                  return (
                    <DropdownMenuCheckboxItem
                      key={field.key}
                      checked={checked}
                      disabled={!checked && dealCardFields.length >= dealCardFieldLimit}
                      onCheckedChange={() => toggleDealCardField(field.key)}
                      onSelect={(event) => event.preventDefault()}
                      className="text-[13px]"
                    >
                      {t(field.label)}
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="px-5 pb-5">
            <div className="flex flex-wrap gap-2" aria-label={t("Selected deal card fields")}>
              {dealCardFields.map((key) => {
                const field = dealCardFieldDefinitions.find((definition) => definition.key === key)
                if (!field) return null
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={dealCardFields.length === 1}
                    onClick={() => toggleDealCardField(key)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] px-3 text-[12px] font-medium text-[var(--md-accent)] transition-colors hover:bg-[var(--md-accent-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] disabled:cursor-default disabled:opacity-65"
                    aria-label={`${t("Remove")} ${t(field.label)}`}
                  >
                    <Check className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                    {t(field.label)}
                    {dealCardFields.length > 1 ? <X className="size-3.5" strokeWidth={1.4} aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[var(--md-subtle)]">
              {t("Changes appear on deal cards immediately. Deal name, company and status always stay visible.")}
            </p>
            <p className="sr-only" aria-live="polite">
              <span data-i18n-skip dir="ltr">{dealCardFields.length} / {dealCardFieldLimit}</span> {t("fields selected")}
            </p>
          </div>
        </Surface>

        <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
              <Settings2 className="size-4" strokeWidth={1.2} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">{t("Customer conversion")}</p>
              <p className="mt-1 text-[13px] leading-6 text-[var(--md-text)]">{conversionSummary?.automation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone="teal">{t("Default")}: {conversionSummary?.defaultStage}</StatusPill>
                <StatusPill tone="green">{t("Convert")}: {conversionSummary?.conversionStage}</StatusPill>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}
