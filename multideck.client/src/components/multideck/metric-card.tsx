import { useId } from "react"
import { cn } from "@/lib/utils"
import type { StatusTone } from "@/data/operational-data"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"

function Sparkline({ values, tone, small = false }: { values: number[]; tone: StatusTone; small?: boolean }) {
  const id = useId().replace(/:/g, "")
  const width = small ? 118 : 150
  const height = small ? 40 : 56
  const insetX = small ? 7 : 9
  const insetY = small ? 6 : 7
  const plotWidth = width - insetX * 2
  const plotHeight = height - insetY * 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const points = values.map((value, index) => {
    const x = insetX + (index / (values.length - 1)) * plotWidth
    const y = insetY + plotHeight - ((value - min) / range) * plotHeight
    return [x, y] as const
  })
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${path} L ${width - insetX} ${height - insetY} L ${insetX} ${height - insetY} Z`
  const color = toneToVar(tone)

  return (
    <svg className={cn("shrink-0", small ? "h-10 w-[118px]" : "h-14 w-[150px]")} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={small ? "2.4" : "3"} />
      <circle cx={points.at(-1)?.[0]} cy={points.at(-1)?.[1]} r={small ? "2.8" : "3.5"} fill={color} stroke="var(--md-surface)" strokeWidth="2" />
    </svg>
  )
}

export function MetricCard({
  label,
  scope,
  value,
  change,
  detail,
  tone,
  series,
  compact = false,
  slim = false,
  className,
}: {
  label: string
  scope: string
  value: string
  change: string
  detail: string
  tone: StatusTone
  series?: number[]
  compact?: boolean
  slim?: boolean
  className?: string
}) {
  if (slim) {
    return (
      <Surface padding="sm" className={cn("min-h-[72px] rounded-[var(--md-radius-xl)]", className)}>
        <div className="flex h-full min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium leading-4 text-[var(--md-text)]">
              {label}
              {scope ? <span className="text-[var(--md-subtle)]"> - {scope}</span> : null}
            </p>
            <strong className="mt-1 block max-w-full whitespace-nowrap text-[26px] font-medium leading-none tracking-normal text-[var(--md-ink)] tabular-nums">{value}</strong>
          </div>
          {series ? <Sparkline values={series} tone={tone} small /> : null}
        </div>
      </Surface>
    )
  }

  return (
    <Surface padding="md" className={cn("min-h-[128px] rounded-[var(--md-radius-xl)]", compact && "min-h-[142px]", className)}>
      <div className="flex h-full min-w-0 flex-col justify-between gap-[var(--md-page-stack-gap)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-[13px] font-medium leading-5 text-[var(--md-text)]", !compact && "truncate")}>
              {label}
              {scope ? <span className="text-[var(--md-subtle)]"> - {scope}</span> : null}
            </p>
          </div>
        </div>
        <div className={cn("flex min-w-0 items-end justify-between gap-4", compact && "gap-3")}>
          <div className="min-w-0">
            <strong className={cn("block max-w-full whitespace-nowrap text-[40px] font-medium leading-none tracking-normal text-[var(--md-ink)] tabular-nums", compact && "text-[clamp(28px,4.2vw,34px)]")}>{value}</strong>
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
              <StatusPill tone={tone}>{change}</StatusPill>
              <span className="min-w-0 text-[13px] leading-5 text-[var(--md-text)]">{detail}</span>
            </div>
          </div>
          {series && !compact ? <Sparkline values={series} tone={tone} /> : null}
        </div>
      </div>
    </Surface>
  )
}
