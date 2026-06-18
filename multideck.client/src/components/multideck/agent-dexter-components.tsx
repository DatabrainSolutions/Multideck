import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  Boxes,
  Check,
  FileText,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { StatusTone } from "@/data/multideck-data"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"

export type DexterSpecialistId = "auto" | "customs" | "customer" | "sales" | "ops" | "analytics"

export type DexterSpecialist = {
  id: DexterSpecialistId
  name: string
  label?: string
  description: string
  icon: LucideIcon
}

export type DexterAttachment = {
  id: string
  type: "customer" | "booking" | "document"
  title: string
  meta: string
  tone: StatusTone
  icon: LucideIcon
}

export type DexterHistoryItem = {
  id: string
  title: string
  summary: string
  time: string
}

export type DexterMonitor = {
  title: string
  body: string
  meta: string
  detail: string
  tone: StatusTone
}

const specialistTone: Record<DexterSpecialistId, string> = {
  auto: "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]",
  customs: "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]",
  customer: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]",
  sales: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]",
  ops: "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]",
  analytics: "bg-[rgba(46,142,96,0.1)] text-[var(--md-green)]",
}

function AttachmentIcon({ attachment }: { attachment: DexterAttachment }) {
  const Icon = attachment.icon

  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
      <Icon className="size-3.5" strokeWidth={1.2} />
    </span>
  )
}

export function DexterBrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
        className,
      )}
    >
      <Sparkles className="size-4" strokeWidth={1.2} />
    </span>
  )
}

export function DexterSpecialistChip({
  specialist,
  onClick,
}: {
  specialist: DexterSpecialist
  onClick?: () => void
}) {
  const Icon = specialist.icon

  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-2 rounded-full bg-[rgba(14,125,116,0.08)] px-3 text-[13px] font-medium text-[var(--md-accent)] shadow-[0_0_0_1px_rgba(14,125,116,0.18)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[rgba(14,125,116,0.12)]"
      onClick={onClick}
    >
      <Icon className="size-3.5" strokeWidth={1.2} />
      {specialist.name}
    </button>
  )
}

export function DexterPromptComposer({
  value,
  selectedSpecialist,
  attachments = [],
  placeholder = "Ask anything - \"chase the late B/L on MD-22455\", \"quote 2 reefers to Ningbo\"...",
  onChange,
  onOpenAttachments,
  onOpenSpecialists,
  onRemoveAttachment,
  onSend,
  compact = false,
  className,
}: {
  value: string
  selectedSpecialist: DexterSpecialist
  attachments?: DexterAttachment[]
  placeholder?: string
  onChange: (value: string) => void
  onOpenAttachments: () => void
  onOpenSpecialists: () => void
  onRemoveAttachment?: (id: string) => void
  onSend: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] bg-[var(--md-surface)] p-1.5 shadow-[0_0_0_1px_rgba(14,125,116,0.36),0_18px_44px_rgba(42,52,50,0.12),inset_0_0_0_1px_rgba(255,255,255,0.92)]",
        className,
      )}
    >
      <div className="flex min-h-[132px] flex-col rounded-[16px] bg-[var(--md-composer-inner-bg)] px-4 py-3 sm:px-5 sm:py-4">
        {attachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => {
              const Icon = attachment.icon

              return (
                <span
                  key={attachment.id}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.08)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[0_0_0_1px_rgba(14,125,116,0.2)]"
                >
                  <Icon className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.2} />
                  <span className="truncate">{attachment.title}</span>
                  <span className="text-[var(--md-text)]">- {attachment.type}</span>
                  {onRemoveAttachment ? (
                    <button
                      type="button"
                      className="ml-0.5 rounded-full text-[var(--md-subtle)] hover:text-[var(--md-ink)]"
                      onClick={() => onRemoveAttachment(attachment.id)}
                      aria-label={`Remove ${attachment.title}`}
                    >
                      <X className="size-3" strokeWidth={1.3} />
                    </button>
                  ) : null}
                </span>
              )
            })}
          </div>
        ) : null}

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            "min-h-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-6 text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]",
            compact ? "min-h-[56px]" : "min-h-[78px]",
          )}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-full bg-white/70 px-3 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-white hover:text-[var(--md-ink)]"
            onClick={onOpenAttachments}
          >
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            Attach
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-full bg-white/70 px-3 text-[13px] font-medium text-[var(--md-accent)] shadow-[0_0_0_1px_rgba(14,125,116,0.18)] hover:bg-white"
            onClick={onOpenSpecialists}
          >
            <selectedSpecialist.icon data-icon="inline-start" strokeWidth={1.2} />
            {selectedSpecialist.name}
          </Button>
          <span className="ml-auto hidden items-center gap-1 text-[12px] text-[var(--md-subtle)] sm:inline-flex">
            <span className="text-[15px] leading-none">↵</span>
            to send
          </span>
          <Button
            type="button"
            size="icon-lg"
            className="ml-auto rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent)] hover:text-white sm:ml-0"
            onClick={onSend}
            aria-label="Send prompt"
          >
            <ArrowUp className="size-4" strokeWidth={1.4} />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DexterSpecialistPicker({
  specialists,
  selectedId,
  onSelect,
  className,
}: {
  specialists: DexterSpecialist[]
  selectedId: DexterSpecialistId
  onSelect: (id: DexterSpecialistId) => void
  className?: string
}) {
  return (
    <Surface padding="md" className={cn("rounded-[var(--md-radius-xl)]", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">Specialists</h2>
        <p className="text-[13px] text-[var(--md-text)]">On Auto, Dexter picks the right one for each request.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {specialists.map((specialist) => {
          const Icon = specialist.icon
          const selected = specialist.id === selectedId

          return (
            <button
              key={specialist.id}
              type="button"
              className={cn(
                "grid grid-cols-[38px_1fr_18px] items-center gap-3 rounded-[var(--md-radius-lg)] p-3 text-left transition-[background,color,box-shadow,opacity,transform] duration-200",
                selected ? "bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-hover)]",
              )}
              onClick={() => onSelect(specialist.id)}
            >
              <span className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)]", specialistTone[specialist.id])}>
                <Icon className="size-4" strokeWidth={1.2} />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--md-ink)]">{specialist.name}</span>
                  {specialist.label ? (
                    <span className="rounded-full bg-[rgba(14,125,116,0.1)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--md-accent)]">
                      {specialist.label}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{specialist.description}</span>
              </span>
              {selected ? <Check className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} /> : null}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

export function DexterSpecialistMenu({
  specialists,
  selectedId,
  onSelect,
  className,
}: {
  specialists: DexterSpecialist[]
  selectedId: DexterSpecialistId
  onSelect: (id: DexterSpecialistId) => void
  className?: string
}) {
  return (
    <Surface padding="sm" className={cn("max-h-[min(360px,calc(100vh-220px))] w-[300px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-composer-inner-bg)] backdrop-blur-xl", className)}>
      <div className="px-2 py-2">
        <p className="text-[12px] font-medium text-[var(--md-ink)]">Specialist</p>
        <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">Choose the lane for this reply.</p>
      </div>
      <div className="md-scrollbar mt-1 grid max-h-[292px] gap-1 overflow-y-auto pr-1">
        {specialists.map((specialist) => {
          const Icon = specialist.icon
          const selected = specialist.id === selectedId

          return (
            <button
              key={specialist.id}
              type="button"
              className={cn(
                "grid grid-cols-[30px_1fr_16px] items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-2 text-left transition-[background,color,box-shadow,opacity,transform] duration-200",
                selected ? "bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-hover)]",
              )}
              onClick={() => onSelect(specialist.id)}
            >
              <span className={cn("grid size-7 place-items-center rounded-[var(--md-radius-sm)]", specialistTone[specialist.id])}>
                <Icon className="size-3.5" strokeWidth={1.2} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{specialist.name}</span>
                <span className="block truncate text-[11px] text-[var(--md-text)]">{specialist.description}</span>
              </span>
              {selected ? <Check className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.4} /> : null}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

export function DexterAttachmentPalette({
  query,
  items,
  selectedIds,
  recommendedIds = [],
  onQueryChange,
  onToggle,
  onClose,
  className,
}: {
  query: string
  items: DexterAttachment[]
  selectedIds: Set<string>
  recommendedIds?: string[]
  onQueryChange: (value: string) => void
  onToggle: (id: string) => void
  onClose?: () => void
  className?: string
}) {
  const filtered = items.filter((item) => `${item.title} ${item.meta} ${item.type}`.toLowerCase().includes(query.toLowerCase()))
  const recommended = recommendedIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is DexterAttachment => Boolean(item))
    .filter((item) => `${item.title} ${item.meta} ${item.type}`.toLowerCase().includes(query.toLowerCase()))

  function selectItem(id: string) {
    onToggle(id)
    onClose?.()
  }

  return (
    <Surface padding="none" className={cn("flex max-h-[min(620px,calc(100vh-220px))] flex-col overflow-hidden rounded-[var(--md-radius-2xl)]", className)}>
      <div className="flex items-center gap-3 border-b border-[rgba(11,20,19,0.06)] px-5 py-4">
        <Search className="size-4 text-[var(--md-text)]" strokeWidth={1.2} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search bookings, customers, documents..."
          className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
        />
        {onClose ? (
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" onClick={onClose}>
            <X className="size-4" strokeWidth={1.2} />
          </Button>
        ) : (
          <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[11px] font-medium text-[var(--md-text)]">esc</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-3">
        {["All 12", "Bookings 6", "Customers 2", "Documents 4"].map((filter, index) => (
          <span
            key={filter}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium shadow-[var(--md-shadow-line)]",
              index === 0 ? "bg-[var(--md-ink)] text-white" : "bg-white/64 text-[var(--md-text)]",
            )}
          >
            {filter}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md-scrollbar">
        {recommended.length > 0 ? (
          <div className="mb-3 rounded-[var(--md-radius-xl)] bg-[rgba(233,242,240,0.72)] p-2 shadow-[var(--md-shadow-line)]">
            <div className="px-2 py-2">
              <p className="text-[12px] font-medium text-[var(--md-ink)]">Recommended from this thread</p>
              <p className="mt-1 text-[11px] text-[var(--md-text)]">Based on the customer, booking IDs, and documents already mentioned.</p>
            </div>
            <div className="grid gap-1">
              {recommended.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="grid min-h-12 grid-cols-[32px_1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-3 py-2 text-left text-[13px] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-white/64"
                  onClick={() => selectItem(item.id)}
                >
                  <AttachmentIcon attachment={item} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--md-ink)]">{item.title}</span>
                    <span className="block truncate text-[12px] text-[var(--md-text)]">{item.meta}</span>
                  </span>
                  <span className="text-[12px] font-medium text-[var(--md-accent)]">{selectedIds.has(item.id) ? "Attached" : "Attach"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {["booking", "customer", "document"].map((type) => {
          const group = filtered.filter((item) => item.type === type && !recommendedIds.includes(item.id))
          if (group.length === 0) return null

          return (
            <div key={type} className="mt-2">
              <p className="px-2 py-2 text-[12px] font-medium capitalize text-[var(--md-subtle)]">{type}s</p>
              <div className="grid gap-1">
                {group.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "grid min-h-12 grid-cols-[32px_minmax(96px,150px)_1fr_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-3 py-2 text-left text-[13px] transition-[background,color,box-shadow,opacity,transform] duration-200",
                      selectedIds.has(item.id) ? "bg-[var(--md-bg-strong)]" : "hover:bg-[var(--md-hover)]",
                    )}
                    onClick={() => selectItem(item.id)}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
                    <span className="font-medium text-[var(--md-ink)]">{item.title}</span>
                    <span className="truncate text-[var(--md-text)]">{item.meta}</span>
                    <span className="text-[12px] font-medium text-[var(--md-accent)]">{selectedIds.has(item.id) ? "Attached" : "Attach"}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-[var(--md-surface-tint)] px-5 py-3 text-[12px] text-[var(--md-text)]">
        <span className="font-medium text-[var(--md-accent)]">Attached items become live context</span>
        <span>Dexter sees their full timeline, docs, and customer state.</span>
      </div>
    </Surface>
  )
}

export function DexterHistoryList({
  items,
  activeId,
  onSelect,
  onNew,
}: {
  items: DexterHistoryItem[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <aside className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--md-sidebar-bg)] shadow-[inset_-1px_0_0_rgba(11,20,19,0.07)]">
      <div className="flex h-[72px] items-center justify-between gap-3 border-b border-[rgba(11,20,19,0.07)] px-5">
        <h2 className="text-[18px] font-medium text-[var(--md-ink)]">History</h2>
        <Button className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[13px] text-white hover:bg-[var(--md-accent)]/90" onClick={onNew}>
          <Plus data-icon="inline-start" strokeWidth={1.2} />
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md-scrollbar">
        <p className="px-2 py-3 text-[12px] font-medium text-[var(--md-subtle)]">Today</p>
        <div className="grid gap-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-[var(--md-radius-lg)] px-3 py-3 text-left transition-[background,color,box-shadow,opacity,transform] duration-200",
                activeId === item.id ? "bg-white shadow-[var(--md-shadow-line)]" : "hover:bg-white/52",
              )}
              onClick={() => onSelect(item.id)}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{item.title}</span>
                  <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{item.summary}</span>
                </span>
                <span className="shrink-0 text-[12px] text-[var(--md-subtle)]">{item.time}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

export function DexterMonitorCard({
  monitor,
  onClick,
}: {
  monitor: DexterMonitor
  onClick?: () => void
}) {
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      <Surface padding="md" className="rounded-[var(--md-radius-xl)] bg-[rgba(233,242,240,0.66)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:scale-[1.01] hover:bg-[rgba(233,242,240,0.86)]">
      <div className="flex items-start gap-2">
        <span className="mt-1 size-2.5 rounded-full" style={{ background: toneToVar(monitor.tone) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{monitor.title}</p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{monitor.body}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(11,20,19,0.05)] pt-3 text-[11px] text-[var(--md-subtle)]">
        <span>{monitor.meta}</span>
        <span>{monitor.detail}</span>
      </div>
      </Surface>
    </button>
  )
}

export function DexterMonitorStack({
  monitors,
  onCollapse,
  onAsk,
  onSelectMonitor,
}: {
  monitors: DexterMonitor[]
  onCollapse?: () => void
  onAsk?: () => void
  onSelectMonitor?: (monitor: DexterMonitor) => void
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--md-line)] bg-[var(--md-composer-inner-bg)]">
      <div className="border-b border-[var(--md-line)] px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[17px] font-medium text-[var(--md-ink)]">
            <span className="size-2 rounded-full bg-[var(--md-green)]" />
            Watching for you
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--md-text)]">{monitors.length} monitors</span>
            {onCollapse ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-[var(--md-radius-md)] bg-white/55 px-2.5 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white hover:text-[var(--md-ink)]"
                onClick={onCollapse}
                aria-label="Collapse watching panel"
              >
                Collapse
                <ArrowRight className="size-3" strokeWidth={1.2} />
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">Background monitors Dexter runs on your behalf. Pause anytime.</p>
      </div>
      <div className="grid gap-3 overflow-y-auto p-4 md-scrollbar">
        {monitors.map((monitor) => (
          <DexterMonitorCard key={monitor.title} monitor={monitor} onClick={() => onSelectMonitor?.(monitor)} />
        ))}
        <button
          type="button"
          className="h-12 rounded-[var(--md-radius-lg)] border-0 border-dashed bg-transparent text-[13px] font-medium text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(90,103,100,0.18)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/55 hover:text-[var(--md-ink)]"
          onClick={onAsk}
        >
          <Sparkles className="mr-2 inline size-3.5" strokeWidth={1.2} />
          Ask Dexter to watch something else
        </button>
      </div>
    </aside>
  )
}

export function DexterMonitorDetailSheet({
  monitor,
  onClose,
  floating = true,
}: {
  monitor: DexterMonitor
  onClose: () => void
  floating?: boolean
}) {
  const chartPoints = "0,88 44,82 88,80 132,72 176,68 220,56 264,52 308,35 352,30 396,18 440,22 484,50"

  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--md-surface)] shadow-[-18px_0_40px_rgba(11,20,19,0.12),inset_1px_0_0_rgba(255,255,255,0.84)]",
        floating ? "fixed inset-y-0 right-0 z-50 w-[min(580px,calc(100vw-24px))]" : "h-full w-full",
      )}
    >
      <header className="border-b border-[rgba(11,20,19,0.07)] px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)]">
        <div className="flex items-start justify-between gap-[var(--md-gap-lg)]">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[18px] font-medium text-[var(--md-ink)]">
              <span className="size-2.5 rounded-full" style={{ background: toneToVar(monitor.tone) }} />
              {monitor.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--md-text)]">
              <StatusPill tone="green">Active</StatusPill>
              <StatusPill tone="amber">Fired once</StatusPill>
              <span>checks every 30 min - last 36 min ago</span>
            </div>
          </div>
          <button type="button" className="rounded-full p-1 text-[var(--md-subtle)] hover:text-[var(--md-ink)]" onClick={onClose} aria-label="Close monitor detail">
            <X className="size-4" strokeWidth={1.3} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--md-gap-xl)] py-[var(--md-page-stack-gap)] md-scrollbar">
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)] bg-[rgba(233,242,240,0.78)]">
          <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--md-ink)]">
            <Sparkles className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
            Watching
          </p>
          <p className="mt-3 text-[14px] leading-7 text-[var(--md-ink)]">
            Rotterdam terminal congestion for this booking. If the ETA shifts by more than <strong>6 hours</strong>, Dexter pings you and drafts a customer note - nothing sends without approval.
          </p>
        </Surface>

        <div className="mt-4 flex flex-col gap-2">
          {[
            ["MD-22479 - Ningbo to Rotterdam", Boxes],
            ["Northwind GmbH - Jonas Weber", Users],
          ].map(([label, Icon]) => {
            const RowIcon = Icon as LucideIcon

            return (
              <button key={label as string} type="button" className="inline-flex w-fit items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-bg-strong)] px-3 py-2 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                <RowIcon className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.2} />
                {label as string}
                <ArrowRight className="size-3 text-[var(--md-subtle)]" strokeWidth={1.2} />
              </button>
            )
          })}
        </div>

        <Surface padding="lg" className="mt-[var(--md-page-stack-gap)] rounded-[var(--md-radius-xl)]">
          <div className="flex items-start justify-between gap-[var(--md-gap-lg)]">
            <div>
              <p className="text-[14px] font-medium text-[var(--md-ink)]">Berth queue - last 7 days</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">hours waiting</p>
            </div>
            <p className="text-[18px] font-medium text-[var(--md-amber)]">28h</p>
          </div>
          <svg viewBox="0 0 484 150" className="mt-[var(--md-page-stack-gap)] h-[150px] w-full overflow-visible" role="img" aria-label="Berth queue last seven days">
            <defs>
              <linearGradient id="dexter-monitor-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(221,138,43,0.22)" />
                <stop offset="100%" stopColor="rgba(221,138,43,0)" />
              </linearGradient>
            </defs>
            <line x1="0" x2="484" y1="74" y2="74" stroke="rgba(209,78,78,0.42)" strokeDasharray="4 6" />
            <polygon points={`0,150 ${chartPoints} 484,150`} fill="url(#dexter-monitor-fill)" />
            <polyline points={chartPoints} fill="none" stroke="var(--md-amber)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            <circle cx="484" cy="50" r="4" fill="var(--md-amber)" />
          </svg>
          <div className="flex justify-between text-[11px] text-[var(--md-subtle)]">
            <span>Jun 5</span>
            <span className="text-[var(--md-red)]">-- fires above this line</span>
            <span>today</span>
          </div>
        </Surface>

        <section className="mt-[var(--md-gap-xl)]">
          <h3 className="text-[14px] font-medium text-[var(--md-text)]">Activity</h3>
          <div className="mt-3 grid gap-4 border-l border-[rgba(90,103,100,0.22)] pl-4">
            {[
              ["Today 11:06", "Queue easing - 31h to 28h. No action needed.", "teal"],
              ["Thu 06:40", "ETA shifted +8h - monitor fired.", "amber"],
              ["Wed 14:02", "Queue 22h to 26h - within threshold, kept watching.", "neutral"],
              ["Wed 09:18", "Created from thread \"At-risk customs this week\".", "neutral"],
            ].map(([time, text, tone]) => (
              <div key={time} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--md-surface)] shadow-[0_0_0_3px_var(--md-surface)]" style={{ background: tone === "amber" ? "var(--md-amber)" : tone === "teal" ? "var(--md-accent)" : "var(--md-subtle)" }} />
                <p className="text-[12px] text-[var(--md-subtle)]">{time}</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--md-ink)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-[var(--md-page-section-gap)]">
          <h3 className="text-[14px] font-medium text-[var(--md-text)]">Conditions</h3>
          <div className="mt-3 divide-y divide-[rgba(11,20,19,0.07)] text-[13px]">
            <div className="flex justify-between gap-4 py-3">
              <span className="text-[var(--md-text)]">Fires when</span>
              <span className="font-medium text-[var(--md-ink)]">ETA shifts more than 6h</span>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <span className="text-[var(--md-text)]">Checks</span>
              <span className="font-medium text-[var(--md-ink)]">Every 30 min - terminal feed + carrier API</span>
            </div>
          </div>
        </section>
      </div>

      <footer className="grid grid-cols-[1fr_1.2fr_auto] gap-[var(--md-gap-md)] border-t border-[var(--md-line)] px-[var(--md-gap-xl)] py-[var(--md-gap-lg)]">
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] bg-white/60 text-[13px] shadow-[var(--md-shadow-line)]">Pause</Button>
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] bg-white/60 text-[13px] shadow-[var(--md-shadow-line)]">Edit conditions</Button>
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] bg-[rgba(209,78,78,0.08)] px-4 text-[13px] text-[var(--md-red)] shadow-[0_0_0_1px_rgba(209,78,78,0.16)]">Delete</Button>
      </footer>
    </aside>
  )
}

export function DexterCustomerSnapshot() {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(14,125,116,0.1)] text-[12px] font-medium text-[var(--md-accent)]">MA</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[var(--md-ink)]">Marlow Apparel Ltd</p>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Customer since 2023 - contact Sandra Hale - next QBR Thu 14:00</p>
        </div>
        <button type="button" className="text-[12px] font-medium text-[var(--md-accent)]">
          Open customer <ArrowRight className="inline size-3" strokeWidth={1.2} />
        </button>
      </div>
      <div className="grid divide-y divide-[var(--md-line)] border-t border-[var(--md-line)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {[
          ["Bookings YTD", "38"],
          ["On-time", "94.2%"],
          ["Spend YTD", "EUR 412k"],
          ["Open exceptions", "1"],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-[12px] text-[var(--md-text)]">{label}</p>
            <p className="mt-2 text-[18px] font-medium text-[var(--md-ink)]">{value}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterChecklistCard({
  items,
}: {
  items: { label: string; done?: boolean }[]
}) {
  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white",
                item.done ? "bg-[var(--md-green)]" : "bg-[var(--md-accent)]",
              )}
            >
              {item.done ? <Check className="size-3" strokeWidth={1.6} /> : <span className="size-2 rounded-full bg-white" />}
            </span>
            <p className="text-[14px] leading-5 text-[var(--md-text)]">{item.label}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterRiskTable() {
  const rows = [
    ["MD-22455", "Shanghai", "Long Beach", "Export licence missing - on hold", "Northwind GmbH", "red" as StatusTone],
    ["MD-22479", "Ningbo", "Rotterdam", "Berth queue +36h - ETA slipping", "Northwind GmbH", "amber" as StatusTone],
    ["MD-22414", "Qingdao", "Felixstowe", "CI value 12% over packing list", "Aldridge & Sons", "amber" as StatusTone],
    ["MD-22442", "Shenzhen", "Oakland", "HS 8542 - USTR list-3 risk", "Pacific Goods Co", "blue" as StatusTone],
  ]

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="text-[13px] font-medium text-[var(--md-text)]">4 bookings - customs risk</p>
        <button type="button" className="text-[12px] font-medium text-[var(--md-accent)]">
          Open in board <ArrowRight className="inline size-3" strokeWidth={1.2} />
        </button>
      </div>
      <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
        {rows.map(([id, from, to, issue, customer, tone]) => (
          <div
            key={id}
            className="grid min-w-0 grid-cols-[18px_minmax(72px,0.7fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)] items-center gap-x-3 gap-y-2 px-5 py-4 text-[13px] max-xl:grid-cols-[18px_84px_minmax(0,1fr)]"
          >
            <span className="size-2.5 rounded-full" style={{ background: toneToVar(tone as StatusTone) }} />
            <span className="min-w-0 font-medium text-[var(--md-ink)]">{id}</span>
            <span className="min-w-0 break-words font-medium text-[var(--md-ink)]">
              {from} <ArrowRight className="inline size-3" strokeWidth={1.2} /> {to}
            </span>
            <span className="min-w-0 break-words text-[var(--md-text)] max-xl:col-span-2 max-xl:col-start-2">{issue}</span>
            <span className="min-w-0 break-words text-[var(--md-text)] max-xl:col-span-2 max-xl:col-start-2">{customer}</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function DexterSuggestionGrid({
  onPick,
}: {
  onPick: (prompt: string, specialistId: DexterSpecialistId) => void
}) {
  const suggestions = [
    { title: "Triage my morning", body: "Which bookings need me first today?", icon: Zap, specialistId: "ops" as DexterSpecialistId },
    { title: "Draft a quote", body: "Yantian to Felixstowe - 2x40HC - week 28", icon: PackageCheck, specialistId: "sales" as DexterSpecialistId },
    { title: "Explain a delay", body: "Why is MD-22479 slipping in Rotterdam?", icon: BarChart3, specialistId: "analytics" as DexterSpecialistId },
    { title: "Prep a customer review", body: "Summarize Marlow Apparel's last quarter", icon: MessageCircle, specialistId: "analytics" as DexterSpecialistId },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {suggestions.map((suggestion) => {
        const Icon = suggestion.icon
        const prompt = `${suggestion.title}. ${suggestion.body}`

        return (
          <button
            key={suggestion.title}
            type="button"
            className="grid grid-cols-[26px_1fr] items-start gap-3 rounded-[var(--md-radius-lg)] bg-white/70 px-5 py-4 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:scale-[1.01] hover:bg-white"
            onClick={() => onPick(prompt, suggestion.specialistId)}
          >
            <Icon className="mt-1 size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
            <span>
              <span className="block text-[14px] font-medium text-[var(--md-ink)]">{suggestion.title}</span>
              <span className="mt-1 block text-[13px] text-[var(--md-text)]">{suggestion.body}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export const defaultDexterSpecialists: DexterSpecialist[] = [
  { id: "auto", name: "Auto", label: "Default", description: "Dexter reads the request and routes it to the right specialist.", icon: Sparkles },
  { id: "sales", name: "Sales & quoting", description: "Rates, quotes, margins, win-back drafts", icon: PackageCheck },
  { id: "customs", name: "Customs & compliance", description: "HS codes, holds, licences, document checks", icon: ShieldCheck },
  { id: "ops", name: "Ops & exceptions", description: "Delays, reroutes, terminals, carrier escalations", icon: Zap },
  { id: "customer", name: "Customer comms", description: "Updates and replies, in each customer's tone", icon: MessageCircle },
  { id: "analytics", name: "Analytics & reporting", description: "Trends, carrier scorecards, spend deep-dives", icon: BarChart3 },
]

export const defaultDexterAttachments: DexterAttachment[] = [
  { id: "md-22455", type: "booking", title: "MD-22455", meta: "Shanghai to Long Beach - Northwind GmbH - on hold", tone: "red", icon: Boxes },
  { id: "md-22479", type: "booking", title: "MD-22479", meta: "Ningbo to Rotterdam - Northwind GmbH - delayed", tone: "amber", icon: Boxes },
  { id: "md-22414", type: "booking", title: "MD-22414", meta: "Qingdao to Felixstowe - Aldridge & Sons - at risk", tone: "amber", icon: Boxes },
  { id: "marlow", type: "customer", title: "Marlow Apparel Ltd", meta: "38 bookings YTD - contact Sandra Hale", tone: "teal", icon: Users },
  { id: "northwind", type: "customer", title: "Northwind GmbH", meta: "12 active bookings - contact Jonas Weber", tone: "teal", icon: Users },
  { id: "co-cn", type: "document", title: "CO-CN-44128.pdf", meta: "Certificate of origin - parsed 98% - MD-22455", tone: "blue", icon: FileText },
  { id: "ci-rev2", type: "document", title: "CI-22455-rev2.pdf", meta: "Commercial invoice - parsed 99% - MD-22455", tone: "blue", icon: FileText },
]
