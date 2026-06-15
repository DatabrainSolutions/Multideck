import type { ComponentPropsWithoutRef, ReactNode } from "react"
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
