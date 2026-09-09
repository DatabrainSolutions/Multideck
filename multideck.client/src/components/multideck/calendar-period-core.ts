export type CalendarPeriodView = "Week" | "Month"

export function parseCalendarDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function addCalendarDays(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count)
}

/** A grid endpoint of 1440 minutes belongs to midnight on the following day. */
export function calendarTimePartsAtMinutes(dateKey: string, minutes: number) {
  const whole = Math.max(0, Math.round(minutes))
  const day = addCalendarDays(parseCalendarDateKey(dateKey), Math.floor(whole / 1440))
  return {
    dateKey: calendarDateKey(day),
    time: `${String(Math.floor(whole / 60) % 24).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`,
  }
}

export function startOfCalendarWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function calendarPeriodDates(view: CalendarPeriodView, anchor: Date, fixedSixWeekMonth = false) {
  if (view === "Week") {
    const start = startOfCalendarWeek(anchor)
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index))
  }

  const monthStart = startOfCalendarMonth(anchor)
  const firstWeekday = (monthStart.getDay() + 6) % 7
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const dayCount = fixedSixWeekMonth || firstWeekday + daysInMonth > 35 ? 42 : 35
  const gridStart = addCalendarDays(monthStart, -firstWeekday)
  return Array.from({ length: dayCount }, (_, index) => addCalendarDays(gridStart, index))
}

export function moveCalendarPeriod(anchor: Date, view: CalendarPeriodView, direction: -1 | 1) {
  return view === "Week"
    ? addCalendarDays(anchor, direction * 7)
    : new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
}

export function formatCalendarPeriodLabel(view: CalendarPeriodView, locale: string, anchor: Date, separator = "–") {
  if (view === "Month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(startOfCalendarMonth(anchor))
  }

  const start = startOfCalendarWeek(anchor)
  const end = addCalendarDays(start, 6)
  const startLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start)
  const endLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end)
  return `${startLabel} ${separator} ${endLabel}`
}
