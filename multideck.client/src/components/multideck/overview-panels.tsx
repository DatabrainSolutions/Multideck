import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  activityItems,
  cityQueues,
  customsQueue,
  digestItems,
  liveShipments,
  metricCards,
  shipmentModes,
  type StatusTone,
} from "@/data/multideck-data"
import { MetricCard } from "./metric-card"
import { SectionHeader, Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"

const InteractiveShipmentMap = lazy(() =>
  import("./interactive-shipment-map").then((module) => ({
    default: module.InteractiveShipmentMap,
  })),
)

export function useLiveNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  return now
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const zonedTime = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))

  return Math.round((zonedTime - date.getTime()) / 60_000)
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
}

function getLocalZoneLabel(date: Date, timeZone: string) {
  if (timeZone === "Europe/London") {
    return getTimeZoneOffsetMinutes(date, timeZone) === 60 ? "BST" : "GMT"
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date)

  return parts.find((part) => part.type === "timeZoneName")?.value ?? "Local"
}

function formatHourDelta(minutes: number) {
  if (minutes === 0) return ""

  const sign = minutes > 0 ? "+" : "-"
  const absoluteMinutes = Math.abs(minutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const remainingMinutes = absoluteMinutes % 60

  if (remainingMinutes === 0) return `${sign}${hours}h`
  return `${sign}${hours}h ${remainingMinutes}m`
}

function getWorkTone(date: Date, timeZone: string): StatusTone {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  )

  if (hour >= 8 && hour < 17) return "green"
  if (hour >= 17 && hour < 19) return "amber"
  return "neutral"
}

function getCityClock(city: (typeof cityQueues)[number], now: Date) {
  const localTimeZone = getLocalTimeZone()
  const localOffset = getTimeZoneOffsetMinutes(now, localTimeZone)
  const cityOffset = getTimeZoneOffsetMinutes(now, city.timeZone)
  const localLabel = getLocalZoneLabel(now, localTimeZone)
  const delta = formatHourDelta(cityOffset - localOffset)

  return {
    comparison: delta ? `${localLabel} ${delta}` : localLabel,
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: city.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    tone: getWorkTone(now, city.timeZone),
  }
}

export function OverviewHero() {
  return (
    <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-[680px]">
        <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Good morning, Elena.</h1>
        <p className="mt-2 text-[15px] leading-6 text-[var(--md-text)]">
          <span className="font-medium text-[var(--md-ink)]">2 exceptions</span> need a decision, and{" "}
          <span className="font-medium text-[var(--md-ink)]">18 documents</span> are ready for review.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup type="single" defaultValue="today" className="rounded-[var(--md-radius-lg)] bg-transparent p-0">
          {["today", "week", "month", "quarter"].map((value) => (
            <ToggleGroupItem key={value} value={value} className="h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium capitalize text-[var(--md-text)] data-[state=on]:bg-white/60 data-[state=on]:text-[var(--md-ink)] data-[state=on]:shadow-[var(--md-shadow-line)]">
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
          Customise
        </Button>
      </div>
    </div>
  )
}

export function MetricsGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metricCards.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  )
}

export function WorldClockCell({
  city,
  selected,
  onSelect,
  now,
}: {
  city: (typeof cityQueues)[number]
  selected: boolean
  onSelect: () => void
  now?: Date
}) {
  const clock = getCityClock(city, now ?? new Date())

  return (
    <button
      type="button"
      className={cn(
        "flex min-h-[96px] min-w-[145px] flex-col justify-between border-r border-[rgba(11,20,19,0.08)] bg-transparent px-4 py-3 text-left transition-all duration-200 hover:bg-[rgba(255,255,255,0.45)]",
        selected && "bg-[rgba(255,255,255,0.4)]",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: toneToVar(clock.tone) }} />
        <p className="text-[12px] font-medium text-[var(--md-text)]">{city.code}</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{city.city}</p>
          <p className={cn("text-[18px] font-medium leading-tight text-[var(--md-ink)]", clock.tone === "neutral" && "text-[var(--md-subtle)]")}>{clock.time}</p>
        </div>
        <span className={cn("max-w-[70px] text-right text-[12px] font-medium leading-snug text-[var(--md-text)]", clock.tone === "neutral" && "text-[var(--md-subtle)]")}>{clock.comparison}</span>
      </div>
    </button>
  )
}

export function WorldClockPanel() {
  const [selected, setSelected] = useState("LDN")
  const now = useLiveNow()
  const londonClock = getCityClock(cityQueues[0], now)

  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <SectionHeader title="World clock" meta={`Reference - London ${londonClock.time} - click a city for local context`} />
        <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-[var(--md-text)]">
          {[
            ["Working", "green"],
            ["Closing soon", "amber"],
            ["After hours", "neutral"],
          ].map(([label, tone]) => (
            <span key={label} className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: toneToVar(tone as StatusTone) }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto border-t border-[rgba(11,20,19,0.08)] md-scrollbar">
        <div className="grid min-w-[1120px] grid-cols-8">
          {cityQueues.map((city) => (
            <WorldClockCell key={city.code} city={city} selected={selected === city.code} onSelect={() => setSelected(city.code)} now={now} />
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function ShipmentRow({
  shipment,
  compact,
}: {
  shipment: (typeof liveShipments)[number]
  compact?: boolean
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(76px,110px)_1fr_auto] items-center gap-3 py-2", compact && "py-1.5")}>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{shipment.id}</p>
        <p className="truncate text-[11px] text-[var(--md-subtle)]">{shipment.mode}</p>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--md-ink)]">
          <span className="truncate">{shipment.from}</span>
          <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
          <span className="truncate">{shipment.to}</span>
        </div>
        <Progress
          value={shipment.progress}
          className="mt-2 h-1.5 rounded-full bg-[rgba(90,103,100,0.08)] [&>div]:bg-[var(--progress-color)]"
          style={{ "--progress-color": toneToVar(shipment.tone) } as CSSProperties}
        />
      </div>
      <div className="text-right">
        <p className="text-[11px] text-[var(--md-subtle)]">ETA</p>
        <p className="text-[12px] font-medium text-[var(--md-ink)]">{shipment.eta}</p>
        <p className="text-[11px] text-[var(--md-text)]">{shipment.time}</p>
      </div>
    </div>
  )
}

export function LiveShipmentsPanel() {
  return (
    <Surface className="min-h-[420px] overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <SectionHeader title="Live shipments" meta="23 in transit - 4 modes - updated 41s ago" />
        <div className="flex flex-wrap gap-2">
          {shipmentModes.map((mode) => {
            const Icon = mode.icon
            return (
              <StatusPill key={mode.label} tone={mode.tone}>
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3" strokeWidth={1.2} />
                  {mode.label} {mode.count}
                </span>
              </StatusPill>
            )
          })}
        </div>
      </div>
      <Suspense fallback={<div className="h-[310px] bg-[var(--md-bg-strong)]" />}>
        <InteractiveShipmentMap />
      </Suspense>
    </Surface>
  )
}

export function MorningDigestPanel() {
  return (
    <Surface tone="selected" className="flex min-h-[516px] flex-col rounded-[var(--md-radius-xl)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--md-accent)] text-white">
            <Sparkles className="size-4" strokeWidth={1.2} />
          </span>
          <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Morning digest</h2>
        </div>
        <span className="text-[13px] font-medium text-[var(--md-text)]">09:00 - AI</span>
      </div>
      <p className="mt-8 text-[19px] font-medium leading-6 text-[var(--md-ink)]">Two shipments need you today.</p>
      <div className="mt-6 flex flex-col gap-5">
        {digestItems.map((item, index) => (
          <div key={item} className="grid grid-cols-[28px_1fr] gap-4">
            <span className={cn("pt-0.5 text-[13px] font-medium", index === 0 ? "text-[var(--md-red)]" : index === 1 ? "text-[var(--md-amber)]" : "text-[var(--md-green)]")}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-[15px] leading-6 text-[var(--md-ink)]">{item}</p>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-auto h-10 justify-between rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[14px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70">
        Open daily briefing
        <ArrowRight data-icon="inline-end" strokeWidth={1.2} />
      </Button>
    </Surface>
  )
}

export function ActivityPanel() {
  return (
    <Surface className="min-h-[360px]">
      <SectionHeader
        title="Activity"
        action={
          <ToggleGroup type="single" defaultValue="all" className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-0.5">
            {["all", "ai"].map((value) => (
              <ToggleGroupItem key={value} value={value} className="h-6 rounded-[var(--md-radius-sm)] px-2 text-[11px] uppercase data-[state=on]:bg-white data-[state=on]:shadow-[var(--md-shadow-line)]">
                {value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <ScrollArea className="mt-3 h-[282px] pr-3">
        <div className="flex flex-col gap-3">
          {activityItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="grid grid-cols-[28px_1fr_auto] gap-3">
                <div className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                  <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.title}</p>
                  <p className="text-[11px] text-[var(--md-subtle)]">{item.source}</p>
                </div>
                <span className="pt-1 text-[11px] text-[var(--md-subtle)]">{item.time}</span>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </Surface>
  )
}

export function QueueRow({
  item,
}: {
  item: (typeof customsQueue)[number]
}) {
  return (
    <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
      <TableCell className="w-[110px] py-3 pl-0 text-[12px] font-medium text-[var(--md-ink)]">{item.id}</TableCell>
      <TableCell className="py-3 text-[13px] text-[var(--md-ink)]">{item.entry}</TableCell>
      <TableCell className="py-3 text-right">
        <StatusPill tone={item.tone}>{item.status}</StatusPill>
      </TableCell>
    </TableRow>
  )
}

export function CustomsQueuePanel() {
  return (
    <Surface className="min-h-[260px]">
      <SectionHeader title="Customs queue" meta="11 in flight - 18 cleared in 24h" />
      <Table className="mt-3">
        <TableBody>
          {customsQueue.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </TableBody>
      </Table>
    </Surface>
  )
}
