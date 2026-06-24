import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { ArrowLeft, Check, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type SettingsTabItem = {
  id: string
  label: string
  badge?: string
  icon?: LucideIcon
}

export type SettingsTabGroup = {
  label: string
  items: SettingsTabItem[]
}

export function SettingsRail({
  groups,
  activeTab,
  onChange,
  onBack,
  className,
}: {
  groups: SettingsTabGroup[]
  activeTab: string
  onChange: (tab: string) => void
  onBack?: () => void
  className?: string
}) {
  return (
    <aside
      className={cn(
        "relative flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[var(--md-sidebar-bg)] px-[var(--md-page-stack-gap)] py-[var(--md-gap-xl)] shadow-[var(--md-stroke-right)] lg:sticky lg:top-0 lg:w-[260px] lg:shrink-0",
        className,
      )}
    >
      <button
        type="button"
        className="mb-[var(--md-gap-xl)] inline-flex w-fit items-center gap-[var(--md-gap-sm)] rounded-[var(--md-radius-md)] text-[13px] font-medium text-[var(--md-text)] transition-colors hover:text-[var(--md-ink)]"
        onClick={onBack}
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.4} />
        Back
      </button>

      <div>
        <h1 className="text-[24px] font-medium leading-tight text-[var(--md-ink)]">Settings</h1>
        <p className="mt-2 max-w-[210px] text-[13px] leading-5 text-[var(--md-text)]">
          Manage your account, workspace, and integrations.
        </p>
      </div>

      <nav className="md-scrollbar mt-[var(--md-page-section-gap)] flex min-h-0 flex-1 flex-col gap-[var(--md-page-section-gap)] overflow-y-auto pb-[var(--md-gap-lg)]">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-1 text-[12px] font-medium text-[var(--md-subtle)]">{group.label}</p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const selected = activeTab === item.id

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "group flex min-h-8 items-center gap-2 rounded-[var(--md-radius-md)] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--md-ink)] transition-[background,color,box-shadow,opacity,transform] duration-200",
                      "hover:bg-[rgba(251,253,253,0.44)] hover:text-[var(--md-accent)]",
                      selected && "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
                    )}
                    onClick={() => onChange(item.id)}
                  >
                    {Icon ? <Icon className="size-3.5 shrink-0" strokeWidth={1.3} /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-[var(--md-radius-sm)] bg-[rgba(221,138,43,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--md-amber)]">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-[var(--md-page-stack-gap)] lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-[720px]">
        <p className="text-[12px] font-medium text-[var(--md-text)]">{eyebrow}</p>
        <h2 className="mt-2 text-[24px] font-medium leading-tight text-[var(--md-ink)]">{title}</h2>
        <p className="mt-2 text-[14px] leading-6 text-[var(--md-text)]">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function SettingsPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-[var(--md-ink)]">{title}</h3>
          {description ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="divide-y divide-[rgba(11,20,19,0.07)] shadow-[var(--md-stroke-top)]">{children}</div>
    </section>
  )
}

export function SettingsFieldRow({
  label,
  description,
  children,
  align = "center",
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  align?: "center" | "start"
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-3 px-5 py-4 md:grid-cols-[minmax(160px,260px)_minmax(0,1fr)]",
        align === "center" ? "md:items-center" : "md:items-start",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        {description ? <p className="mt-1 max-w-[260px] text-[12px] leading-5 text-[var(--md-text)]">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function SettingsInput({
  className,
  dir,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      dir={dir ?? "auto"}
      className={cn(
        "h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        className,
      )}
      {...props}
    />
  )
}

export function SettingsTextarea({
  className,
  dir,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      dir={dir ?? "auto"}
      className={cn(
        "min-h-[88px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 py-2 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        className,
      )}
      {...props}
    />
  )
}

export function SettingsSelect({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: string
  options: string[]
  onChange?: (value: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-9 min-w-[220px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
        {options.map((option) => (
          <SelectItem key={option} value={option} className="text-[13px]">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SettingsToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  meta,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  meta?: ReactNode
}) {
  return (
    <SettingsFieldRow label={title} description={description}>
      <div className="flex items-center justify-between gap-4">
        {meta ? <div className="min-w-0 text-[12px] text-[var(--md-text)]">{meta}</div> : <span />}
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </SettingsFieldRow>
  )
}

export function SettingsIntegrationRow({
  icon: Icon,
  title,
  description,
  status,
  statusTone = "ready",
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description: string
  status: string
  statusTone?: "connected" | "ready" | "review" | "workspace"
  actionLabel: string
  onAction?: () => void
}) {
  const statusClass = {
    connected: "bg-[rgba(46,142,96,0.1)] text-[var(--md-green)] shadow-[inset_0_0_0_1px_rgba(46,142,96,0.18)]",
    ready: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)] shadow-[inset_0_0_0_1px_rgba(74,125,156,0.18)]",
    review: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[inset_0_0_0_1px_rgba(221,138,43,0.18)]",
    workspace: "bg-[rgba(90,103,100,0.09)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(90,103,100,0.16)]",
  }[statusTone]

  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center">
      <div className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
        <Icon className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{title}</p>
          <span className={cn("rounded-[var(--md-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium", statusClass)}>
            {status}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{description}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-fit rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

export function SettingsOptionCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string
  description: string
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-h-[100px] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200",
        "hover:bg-[rgba(233,242,240,0.78)] hover:shadow-[inset_0_0_0_1px_rgba(14,125,116,0.16),0_0_0_1px_rgba(11,20,19,0.04)]",
        selected && "bg-[rgba(14,125,116,0.08)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.55),0_0_0_1px_rgba(14,125,116,0.12)]",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-4 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(90,103,100,0.22)]",
            selected && "bg-[var(--md-accent)] shadow-none",
          )}
        >
          {selected ? <Check className="size-2.5 text-white" strokeWidth={2} /> : null}
        </span>
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">{description}</p>
    </button>
  )
}

export function SettingsChoiceGroup({
  options,
  value,
  onChange,
  className,
}: {
  options: string[]
  value: string
  onChange?: (value: string) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option === value

        return (
          <button
            key={option}
            type="button"
            className={cn(
              "h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200",
              "hover:text-[var(--md-ink)]",
              selected && "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            )}
            onClick={() => onChange?.(option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function SettingsSummaryCard({
  title,
  rows,
  actionLabel,
  onAction,
}: {
  title: string
  rows: Array<[string, string]>
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <aside className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-[var(--md-page-stack-gap)] shadow-[var(--md-shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-[var(--md-text)]">{title}</p>
        {actionLabel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
            onClick={onAction}
          >
            {actionLabel}
            <ChevronRight className="size-3" strokeWidth={1.4} />
          </Button>
        ) : null}
      </div>
      <div className="mt-[var(--md-page-stack-gap)] divide-y divide-[rgba(11,20,19,0.07)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <span className="text-[13px] text-[var(--md-text)]">{label}</span>
            <span className="text-right text-[13px] font-medium text-[var(--md-ink)]">{value}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
