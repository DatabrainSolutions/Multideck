import { Switch } from "@/components/ui/switch"
import { MeetingTimeField } from "@/components/multideck/meeting-time-picker"
import type { CalendarAvailabilityPreferences } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

export type WorkingHours = CalendarAvailabilityPreferences["workingHours"]

export const weekdayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
export type WeekdayKey = (typeof weekdayKeys)[number]
export const weekdayLabels: Record<WeekdayKey, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" }

export const defaultWorkingHours: WorkingHours = { monday: [["09:00", "17:00"]], tuesday: [["09:00", "17:00"]], wednesday: [["09:00", "17:00"]], thursday: [["09:00", "17:00"]], friday: [["09:00", "17:00"]], saturday: [], sunday: [] }

const FALLBACK_RANGE: [string, string] = ["09:00", "17:00"]

function firstRange(value: WorkingHours, day: WeekdayKey): [string, string] | null {
  const range = value[day]?.[0]
  return range ? [range[0], range[1]] : null
}

/**
 * The week as seven quiet rows: a switch per day, then start and finish using
 * the same on-brand time fields as the meeting composer. Days that are off
 * read "Unavailable" instead of showing disabled inputs. One range per day.
 */
export function WorkingHoursEditor({ value, onChange, disabled = false, className }: {
  value: WorkingHours
  onChange: (next: WorkingHours) => void
  disabled?: boolean
  className?: string
}) {
  const monday = firstRange(value, "monday")
  const weekdaysDiffer = monday ? weekdayKeys.slice(1, 5).some((day) => { const range = firstRange(value, day); return !range || range[0] !== monday[0] || range[1] !== monday[1] }) : false

  function setDay(day: WeekdayKey, range: [string, string] | null) {
    onChange({ ...value, [day]: range ? [range] : [] })
  }

  function applyMondayToWeekdays() {
    if (!monday) return
    const next = { ...value }
    for (const day of weekdayKeys.slice(0, 5)) next[day] = [[monday[0], monday[1]]]
    onChange(next)
  }

  return (
    <div className={cn("grid gap-1", className)}>
      {weekdayKeys.map((day) => {
        const range = firstRange(value, day)
        const enabled = range !== null
        const current = range ?? FALLBACK_RANGE
        return (
          <div key={day} className="grid min-h-10 grid-cols-[minmax(84px,108px)_auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--md-radius-lg)] px-2 py-1 transition-colors hover:bg-[var(--md-surface-tint)]">
            <span className={cn("text-[12.5px] font-medium", enabled ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)]")}>{weekdayLabels[day]}</span>
            <Switch size="sm" checked={enabled} disabled={disabled} aria-label={`${enabled ? "Turn off" : "Turn on"} ${weekdayLabels[day]}`} onCheckedChange={(next) => setDay(day, next ? current : null)} />
            {enabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <MeetingTimeField label={`${weekdayLabels[day]} starts`} value={current[0]} onChange={(time) => setDay(day, [time, current[1] > time ? current[1] : time])} />
                <span className="text-[12px] text-[var(--md-subtle)]" aria-hidden="true">–</span>
                <MeetingTimeField label={`${weekdayLabels[day]} finishes`} value={current[1]} notBefore={current[0]} onChange={(time) => setDay(day, [current[0], time])} />
                {day === "monday" && weekdaysDiffer && !disabled ? (
                  <button type="button" onClick={applyMondayToWeekdays} className="h-6 rounded-full px-2 text-[11px] font-medium text-[var(--md-accent)] transition-colors hover:bg-[var(--md-accent-a10)]">Use Mon–Fri</button>
                ) : null}
              </div>
            ) : (
              <span className="text-[11.5px] text-[var(--md-subtle)]">Unavailable</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
