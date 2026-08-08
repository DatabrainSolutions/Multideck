import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type SurfaceTone = "panel" | "soft" | "selected" | "tint"
type SurfacePadding = "none" | "xs" | "sm" | "md" | "lg"

const toneClass: Record<SurfaceTone, string> = {
  panel: "bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]",
  soft: "bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]",
  selected: "bg-white/70 shadow-[var(--md-shadow-line)]",
  tint: "bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]",
}

const paddingClass: Record<SurfacePadding, string> = {
  none: "",
  xs: "p-[var(--md-gap-xs)]",
  sm: "p-[var(--md-gap-sm)]",
  md: "p-[var(--md-gap-lg)]",
  lg: "p-[var(--md-gap-xl)]",
}

export function Surface({
  tone = "panel",
  padding = "md",
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  tone?: SurfaceTone
  padding?: SurfacePadding
  className?: string
  children: ReactNode
}) {
  return <section className={cn("rounded-[var(--md-radius-lg)]", toneClass[tone], paddingClass[padding], className)} {...props}>{children}</section>
}

export function SectionHeader({
  eyebrow,
  title,
  meta,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  meta?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-[var(--md-gap-md)]", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-medium text-[var(--md-subtle)]">{eyebrow}</p> : null}
        <h2 className="truncate text-[14px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta ? <p className="mt-1 text-[12px] text-[var(--md-text)]">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/**
 * A titled card of facts. Used both on a page and inside a record drawer, so the
 * same record reads identically whichever surface it is opened on. Omit the title
 * for a plain block.
 */
export function FactCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const { t } = useLanguage()

  return (
    <section className={cn("grid gap-3.5 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3.5 shadow-[var(--md-shadow-line)]", className)}>
      {title ? <h3 className="text-[11.5px] font-medium leading-4 text-[var(--md-text)]">{t(title)}</h3> : null}
      {children}
    </section>
  )
}

/**
 * Label beside value, hairline separated rather than boxed — six stacked boxes
 * read as six objects when they are one list. Renders nothing when the value is
 * empty, so a sparse record simply has a shorter list instead of a column of
 * dashes. Set `code` for SKUs, references and measurements: they stay
 * left-to-right, untranslated, and on tabular figures so a list of them lines up.
 */
export function FactRow({ label, value, code }: { label: string; value: string | null | undefined; code?: boolean }) {
  const { t } = useLanguage()
  if (!value) return null

  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-3 py-[6px] first:pt-0 last:pb-0">
      <dt className="text-[11.5px] leading-4 text-[var(--md-text)]">{t(label)}</dt>
      <dd
        title={value}
        data-i18n-skip={code ? true : undefined}
        dir={code ? "ltr" : "auto"}
        className={cn("min-w-0 truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]", code && "tabular-nums")}
      >
        {value}
      </dd>
    </div>
  )
}

/** One key figure with its unit, for the top of a record. */
export function FactFigure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const { t } = useLanguage()

  return (
    <div>
      <p dir="ltr" className="text-[26px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[var(--md-ink)]">
        {value}
        {unit ? <span className="ms-1.5 text-[13px] font-normal tracking-normal text-[var(--md-text)]">{unit}</span> : null}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-4 text-[var(--md-text)]">{t(label)}</p>
    </div>
  )
}
