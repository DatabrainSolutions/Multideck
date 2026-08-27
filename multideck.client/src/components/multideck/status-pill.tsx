import { createContext, useContext, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StatusTone } from "@/data/multideck-data"

export const TablePillKindContext = createContext<"status" | "attribute" | null>(null)

export function StatusPill({
  tone = "neutral",
  kind,
  indicator,
  children,
  className,
}: {
  tone?: StatusTone
  /** Status and attribute pills share the established filled table treatment. */
  kind?: "status" | "attribute"
  indicator?: ReactNode | false
  children: ReactNode
  className?: string
}) {
  const tableKind = useContext(TablePillKindContext)
  const resolvedKind = kind ?? tableKind ?? "status"
  const showIndicator = indicator !== false && indicator != null

  return (
    <Badge
      variant="secondary"
      data-pill-kind={resolvedKind}
      data-tone={tone}
      data-table-pill="true"
      className={cn(
        "md-status-pill h-6 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-normal leading-none tabular-nums shadow-none",
        tableToneClass[tone],
        className,
      )}
    >
      {showIndicator ? indicator : null}
      {children}
    </Badge>
  )
}

const tableToneClass: Record<StatusTone, string> = {
  green: "bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)]",
  amber: "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]",
  red: "bg-[var(--md-status-red-bg)] text-[var(--md-status-red-ink)]",
  blue: "bg-[var(--md-status-blue-bg)] text-[var(--md-status-blue-ink)]",
  orange: "bg-[var(--md-status-orange-bg)] text-[var(--md-status-orange-ink)]",
  purple: "bg-[var(--md-status-purple-bg)] text-[var(--md-status-purple-ink)]",
  teal: "bg-[var(--md-status-teal-bg)] text-[var(--md-status-teal-ink)]",
  neutral: "bg-[var(--md-status-blue-bg)] text-[var(--md-status-blue-ink)]",
}

export function toneToVar(tone: StatusTone) {
  return {
    green: "var(--md-green)",
    amber: "var(--md-amber)",
    red: "var(--md-red)",
    blue: "var(--md-blue)",
    orange: "var(--md-orange)",
    purple: "var(--md-purple)",
    neutral: "var(--md-subtle)",
    teal: "var(--md-accent)",
  }[tone]
}

/** Stable category colour for neutral attribute pills. */
export function attributeToneFor(value: string): StatusTone {
  const palette: StatusTone[] = ["teal", "blue", "amber", "green", "red"]
  const hash = Array.from(value).reduce((total, character) => ((total * 31) + character.codePointAt(0)!) >>> 0, 0)
  return palette[hash % palette.length]
}
