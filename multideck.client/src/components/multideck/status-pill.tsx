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
  /** The semantic tone is carried by the indicator; the shell follows the table theme. */
  kind?: "status" | "attribute"
  indicator?: ReactNode | false
  children: ReactNode
  className?: string
}) {
  const tableKind = useContext(TablePillKindContext)
  const resolvedKind = kind ?? tableKind ?? "status"
  const showIndicator = indicator !== false

  return (
    <Badge
      variant="secondary"
      data-pill-kind={resolvedKind}
      className={cn("h-[21px] rounded-full bg-[var(--md-surface)] px-[9px] text-[11.5px] font-medium leading-none tabular-nums text-[var(--md-ink)] shadow-[0_0_0_1px_var(--md-line)]", className)}
    >
      {showIndicator ? (indicator ?? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: toneToVar(tone) }} />
      )) : null}
      {children}
    </Badge>
  )
}

export function toneToVar(tone: StatusTone) {
  return {
    green: "var(--md-green)",
    amber: "var(--md-amber)",
    red: "var(--md-red)",
    blue: "var(--md-blue)",
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
