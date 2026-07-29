import { useEffect, useState } from "react"
import type { StatusTone } from "@/data/multideck-data"

/**
 * World-clock maths for the dashboard. Formatters are the expensive part of
 * `Intl`, so every distinct timezone + options combination is built once and
 * reused. The clock rail computes eight cities per tick, and without this cache
 * that is dozens of formatter constructions on every repaint.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone, ...options })
    formatterCache.set(key, formatter)
  }
  return formatter
}

export function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const zonedTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )

  return Math.round((zonedTime - date.getTime()) / 60_000)
}

export function getLocalZoneLabel(date: Date, timeZone: string) {
  if (timeZone === "Europe/London") {
    return getTimeZoneOffsetMinutes(date, timeZone) === 60 ? "BST" : "GMT"
  }

  const parts = getFormatter(timeZone, { timeZoneName: "short" }).formatToParts(date)
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "Local"
}

export function formatHourDelta(minutes: number) {
  if (minutes === 0) return ""

  const sign = minutes > 0 ? "+" : "-"
  const absoluteMinutes = Math.abs(minutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const remainingMinutes = absoluteMinutes % 60

  if (remainingMinutes === 0) return `${sign}${hours}h`
  return `${sign}${hours}h ${remainingMinutes}m`
}

export function getCityHour(date: Date, timeZone: string) {
  return Number(getFormatter(timeZone, { hour: "numeric", hourCycle: "h23" }).format(date))
}

export function getWorkTone(date: Date, timeZone: string): StatusTone {
  const hour = getCityHour(date, timeZone)

  if (hour >= 16 && hour < 17) return "amber"
  if (hour >= 8 && hour < 16) return "green"
  return "neutral"
}

export function getWorkStatusLabel(tone: StatusTone) {
  if (tone === "amber") return "Closing soon"
  if (tone === "green") return "Working"
  return "OOH"
}

export function formatCityTime(date: Date, timeZone: string) {
  return getFormatter(timeZone, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
}

export type CityClockInput = {
  code: string
  city: string
  timeZone: string
}

export type CityClock = {
  code: string
  city: string
  timeZone: string
  time: string
  comparison: string
  tone: StatusTone
  hour: number
}

export function computeCityClock(city: CityClockInput, now: Date, localTimeZone: string): CityClock {
  const localOffset = getTimeZoneOffsetMinutes(now, localTimeZone)
  const cityOffset = getTimeZoneOffsetMinutes(now, city.timeZone)
  const localLabel = getLocalZoneLabel(now, localTimeZone)
  const delta = formatHourDelta(cityOffset - localOffset)

  return {
    code: city.code,
    city: city.city,
    timeZone: city.timeZone,
    time: formatCityTime(now, city.timeZone),
    comparison: delta ? `${localLabel} ${delta}` : localLabel,
    tone: getWorkTone(now, city.timeZone),
    hour: getCityHour(now, city.timeZone),
  }
}

/**
 * A minute-aligned tick that stays honest over time. `setInterval` drifts and
 * keeps firing in a background tab; this schedules the next update for the top
 * of the coming minute, pauses while the tab is hidden, and resyncs the moment
 * it becomes visible again.
 */
export function useMinuteTick() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId: number | undefined

    function scheduleNext() {
      const current = new Date()
      const msToNextMinute = 60_000 - (current.getTime() % 60_000)
      timeoutId = window.setTimeout(() => {
        setNow(new Date())
        scheduleNext()
      }, msToNextMinute + 20)
    }

    function handleVisibility() {
      if (document.hidden) {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        return
      }
      setNow(new Date())
      scheduleNext()
    }

    scheduleNext()
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  return now
}
