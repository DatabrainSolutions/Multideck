import { useId, type CSSProperties, type ReactNode } from "react"
import type { LucideIcon } from "@/components/icons/hugeicons"
import { ArrowLeft, Check, ChevronRight } from "@/components/icons/hugeicons"
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
import { ChoiceControl } from "@/components/multideck/workflow-components"
import { SectionHeader } from "@/components/multideck/surface"
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
                      selected && "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
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
  title,
  description,
  actions,
  icon: Icon,
  descriptionPlacement = "aside",
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  icon?: LucideIcon
  descriptionPlacement?: "aside" | "under-title"
}) {
  if (descriptionPlacement === "under-title") {
    return (
      <header className="grid gap-3 py-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-[var(--md-page-section-gap)]">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-balance text-[24px] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--md-ink)]">
            {Icon ? <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Icon className="size-4" strokeWidth={1.4} aria-hidden="true" /></span> : null}
            <span>{title}</span>
          </h1>
          {description ? <p className="mt-2 max-w-[65ch] text-pretty text-[14px] leading-6 text-[var(--md-text)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </header>
    )
  }

  return (
    <header className="grid gap-3 py-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,560px)] lg:items-end lg:gap-[var(--md-page-section-gap)]">
      <h1 className="flex items-center gap-2.5 text-balance text-[24px] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--md-ink)]">
        {Icon ? <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Icon className="size-4" strokeWidth={1.4} aria-hidden="true" /></span> : null}
        <span>{title}</span>
      </h1>
      <div className="min-w-0 lg:justify-self-end lg:text-end">
        {description ? <p className="max-w-[65ch] text-pretty text-[14px] leading-6 text-[var(--md-text)] lg:ms-auto">{description}</p> : null}
        {actions ? <div className={cn("flex flex-wrap items-center gap-2 lg:justify-end", description && "mt-3")}>{actions}</div> : null}
      </div>
    </header>
  )
}

export function SettingsPanel({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string
  title: ReactNode
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        "md-settings-panel overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]",
        className,
      )}
    >
      <div className="px-5 py-4">
        <SectionHeader title={title} meta={description} action={action} metaClassName="text-[13px] leading-5" />
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
  labelFor,
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  align?: "center" | "start"
  labelFor?: string
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
        {labelFor ? (
          <label htmlFor={labelFor} className="text-[13px] font-medium text-[var(--md-ink)]">{label}</label>
        ) : (
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        )}
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
        "h-10 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px]",
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
        "min-h-[104px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 py-2.5 text-[16px] leading-6 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[13px] sm:leading-5",
        className,
      )}
      {...props}
    />
  )
}

export function SettingsSelect({
  value,
  options,
  optionLabels,
  onChange,
  className,
  ariaLabel,
}: {
  value: string
  options: string[]
  optionLabels?: Record<string, string>
  onChange?: (value: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-10 min-w-[220px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] sm:text-[13px]",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
        {options.map((option) => (
          <SelectItem key={option} value={option} className="text-[13px]">
            {optionLabels?.[option] ?? option}
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
  disabled = false,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  meta?: ReactNode
  disabled?: boolean
}) {
  const switchId = useId()
  const descriptionId = `${switchId}-description`

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(160px,260px)_minmax(0,1fr)] md:items-center">
      <div className="min-w-0">
        <label htmlFor={switchId} className={cn("text-[13px] font-medium text-[var(--md-ink)]", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>{title}</label>
        <p id={descriptionId} className="mt-1 max-w-[260px] text-[12px] leading-5 text-[var(--md-text)]">{description}</p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-4">
        {meta ? <div className="min-w-0 text-[12px] text-[var(--md-text)]">{meta}</div> : <span />}
        <Switch id={switchId} aria-describedby={descriptionId} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  )
}

export function SettingsIntegrationRow({
  icon: Icon,
  logoSrc,
  title,
  description,
  status,
  statusTone = "ready",
  actionLabel,
  action,
  onAction,
  disabled = false,
}: {
  icon?: LucideIcon
  logoSrc?: string
  title: string
  description?: string
  status: string
  statusTone?: "connected" | "ready" | "review" | "workspace"
  actionLabel?: string
  action?: ReactNode
  onAction?: () => void
  disabled?: boolean
}) {
  const statusClass = {
    connected: "bg-[var(--md-accent-a10)] text-[var(--md-green)] shadow-[inset_0_0_0_1px_var(--md-accent-a18)]",
    ready: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)] shadow-[inset_0_0_0_1px_rgba(74,125,156,0.18)]",
    review: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[inset_0_0_0_1px_rgba(221,138,43,0.18)]",
    workspace: "bg-[rgba(90,103,100,0.09)] text-[var(--md-text)] shadow-[inset_0_0_0_1px_rgba(90,103,100,0.16)]",
  }[statusTone]

  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center">
      <div className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
        {logoSrc ? (
          <img src={logoSrc} alt="" aria-hidden="true" className="size-[19px] object-contain" />
        ) : Icon ? (
          <Icon className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} aria-hidden="true" />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{title}</p>
          <span className={cn("rounded-[var(--md-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium", statusClass)}>
            {status}
          </span>
        </div>
        {description ? <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{description}</p> : null}
      </div>
      {action ?? (actionLabel ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-fit rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] hover:bg-white/75 active:scale-[0.96] motion-reduce:active:scale-100"
          onClick={onAction}
          disabled={disabled}
        >
          {actionLabel}
        </Button>
      ) : null)}
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
        "hover:bg-[rgba(233,242,240,0.78)] hover:shadow-[inset_0_0_0_1px_var(--md-accent-a16),0_0_0_1px_rgba(11,20,19,0.04)]",
        selected && "bg-[var(--md-accent-a08)] shadow-[inset_0_0_0_1px_var(--md-accent-a55),0_0_0_1px_var(--md-accent-a12)]",
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
          {selected ? <Check className="size-2.5 text-[var(--md-accent-ink)]" strokeWidth={2} /> : null}
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
  ariaLabel = "Choose an option",
  className,
}: {
  options: string[]
  value: string
  onChange?: (value: string) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <ChoiceControl
      options={options}
      value={value}
      onChange={(nextValue) => onChange?.(nextValue)}
      ariaLabel={ariaLabel}
      className={className}
    />
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
            className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
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

export function SettingsProgressRing({
  value,
  label,
  detail,
  tone = "accent",
  className,
}: {
  value: number
  label: string
  detail?: string
  tone?: "accent" | "green" | "amber" | "blue"
  className?: string
}) {
  const clampedValue = Math.max(0, Math.min(100, value))
  const toneValue = {
    accent: "var(--md-accent)",
    green: "var(--md-green)",
    amber: "var(--md-amber)",
    blue: "var(--md-blue)",
  }[tone]
  const style = {
    "--md-settings-progress": `${clampedValue}%`,
    "--md-settings-progress-color": toneValue,
  } as CSSProperties

  return (
    <div
      role="img"
      aria-label={`${label}: ${clampedValue}%${detail ? `. ${detail}` : ""}`}
      className={cn("flex items-center gap-4", className)}
    >
      <span className="md-settings-progress-ring relative grid size-[74px] shrink-0 place-items-center rounded-full" style={style}>
        <span className="absolute inset-[7px] rounded-full bg-[var(--md-surface)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.05)]" aria-hidden="true" />
        <span className="relative text-[15px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>
          {clampedValue}%
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--md-ink)]">{label}</span>
        {detail ? <span className="mt-1 block text-pretty text-[12px] leading-5 text-[var(--md-text)]">{detail}</span> : null}
      </span>
    </div>
  )
}
