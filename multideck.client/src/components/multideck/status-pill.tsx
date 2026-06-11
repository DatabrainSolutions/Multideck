import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StatusTone } from "@/data/multideck-data"

const toneClass: Record<StatusTone, string> = {
  green: "bg-[rgba(46,142,96,0.1)] text-[var(--md-green)] shadow-[0_0_0_1px_rgba(46,142,96,0.1)]",
  amber: "bg-[rgba(221,138,43,0.1)] text-[var(--md-amber)] shadow-[0_0_0_1px_rgba(221,138,43,0.1)]",
  red: "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)] shadow-[0_0_0_1px_rgba(209,78,78,0.1)]",
  blue: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)] shadow-[0_0_0_1px_rgba(74,125,156,0.1)]",
  neutral: "bg-[rgba(90,103,100,0.08)] text-[var(--md-text)] shadow-[0_0_0_1px_rgba(90,103,100,0.08)]",
  teal: "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)] shadow-[0_0_0_1px_rgba(14,125,116,0.1)]",
}

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone
  children: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("h-[21px] rounded-full px-[9px] text-[11.5px] font-medium leading-none", toneClass[tone], className)}
    >
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
