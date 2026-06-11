import { useId } from "react"
import { cn } from "@/lib/utils"
import type { StatusTone } from "@/data/multideck-data"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"

function Sparkline({ values, tone }: { values: number[]; tone: StatusTone }) {
  const id = useId().replace(/:/g, "")
  const width = 150
  const height = 56
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 12) - 6
    return [x, y] as const
  })
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${path} L ${width} ${height} L 0 ${height} Z`
  const color = toneToVar(tone)

  return (
    <svg className="h-14 w-[150px] shrink-0 overflow-visible" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <circle cx={points.at(-1)?.[0]} cy={points.at(-1)?.[1]} r="3.5" fill={color} stroke="var(--md-surface)" strokeWidth="2" />
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
  className,
}: {
  label: string
  scope: string
  value: string
  change: string
  detail: string
  tone: StatusTone
  series?: number[]
  className?: string
}) {
  return (
    <Surface padding="md" className={cn("min-h-[128px] rounded-[var(--md-radius-xl)]", className)}>
      <div className="flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--md-text)]">
              {label}
              {scope ? <span className="text-[var(--md-subtle)]"> - {scope}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <strong className="text-[40px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{value}</strong>
            <div className="mt-4 flex items-center gap-2">
              <StatusPill tone={tone}>{change}</StatusPill>
              <span className="text-[13px] text-[var(--md-text)]">{detail}</span>
            </div>
          </div>
          {series ? <Sparkline values={series} tone={tone} /> : null}
        </div>
      </div>
    </Surface>
  )
}
