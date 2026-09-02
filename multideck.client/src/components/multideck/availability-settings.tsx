import { useEffect, useMemo, useState } from "react"
import { LoaderCircle, TriangleAlert, X } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { MultideckDatePicker } from "@/components/multideck/date-picker"
import { MeetingTimeField, TimeZoneSelect } from "@/components/multideck/meeting-time-picker"
import { SettingsFieldRow, SettingsPanel } from "@/components/multideck/settings-components"
import { WorkingHoursEditor } from "@/components/multideck/working-hours-editor"
import { getCalendarAvailability, saveCalendarAvailability, type CalendarAvailabilityPreferences } from "@/lib/calendar-api"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type Exception = CalendarAvailabilityPreferences["exceptions"][number]

const NOTICE_CHOICES: Array<[number, string]> = [[0, "None"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [1440, "1 day"], [2880, "2 days"]]
const HORIZON_CHOICES: Array<[number, string]> = [[7, "1 week"], [14, "2 weeks"], [30, "30 days"], [60, "60 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"]]
const BUFFER_CHOICES: Array<[number, string]> = [[0, "None"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"]]
const INCREMENT_CHOICES: Array<[number, string]> = [[15, "Every 15 minutes"], [30, "Every 30 minutes"], [60, "Every hour"]]

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function RuleSelect({ label, value, choices, onChange, disabled }: { label: string; value: number; choices: Array<[number, string]>; onChange: (value: number) => void; disabled?: boolean }) {
  const options = choices.some(([minutes]) => minutes === value) ? choices : [...choices, [value, `${value}`] as [number, string]].sort((left, right) => left[0] - right[0])
  return (
    <label className="grid gap-1.5 text-[12px] text-[var(--md-text)]">
      {label}
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
        <SelectTrigger aria-label={label} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
          {options.map(([amount, text]) => <SelectItem key={amount} value={String(amount)} className="text-[13px]">{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}

/**
 * The operator's personal availability: timezone, working hours, date
 * exceptions and the booking rules that decide which free times booking links
 * may offer. Saves as one preference set from the dedicated Availability
 * settings section.
 */
export function AvailabilitySettingsPanel({
  id = "availability",
  title = "Availability",
  className,
}: {
  id?: string
  title?: string
  className?: string
}) {
  const { language } = useLanguage()
  const [saved, setSaved] = useState<CalendarAvailabilityPreferences | null>(null)
  const [draft, setDraft] = useState<CalendarAvailabilityPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(null)
    getCalendarAvailability(controller.signal)
      .then((value) => { setSaved(value); setDraft(value) })
      .catch((reason) => { if (reason instanceof DOMException && reason.name === "AbortError") return; setLoadError(reason instanceof Error ? reason.message : "Your availability could not be loaded.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  // Deep links such as /settings#availability land on this panel.
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }))
    return () => window.cancelAnimationFrame(frame)
  }, [id])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), [language])

  function update(patch: Partial<CalendarAvailabilityPreferences>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setError(null)
  }

  function addException(date: string | null) {
    if (!date || !draft) return
    if (draft.exceptions.some((exception) => exception.date === date)) { setError("That date already has an exception."); return }
    update({ exceptions: [...draft.exceptions, { date, unavailable: true }].sort((left, right) => left.date.localeCompare(right.date)) })
  }

  function patchException(index: number, patch: Partial<Exception>) {
    if (!draft) return
    update({ exceptions: draft.exceptions.map((exception, exceptionIndex) => exceptionIndex === index ? { ...exception, ...patch } : exception) })
  }

  async function save() {
    if (!draft || saving) return
    const emptyDays = Object.values(draft.workingHours).every((ranges) => !ranges.length)
    if (emptyDays) { setError("Turn on at least one working day, or no booking link can offer a time."); return }
    setSaving(true); setError(null)
    try {
      const result = await saveCalendarAvailability(draft)
      setSaved(result.availability); setDraft(result.availability)
      toast.success("Availability saved", { description: "Booking links now offer times from these hours." })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Availability could not be saved.")
    } finally { setSaving(false) }
  }

  const busy = loading || saving || !draft

  return (
    <SettingsPanel
      id={id}
      title={title}
      description="When people can book time with you. Booking links use these hours unless a link sets its own."
      className={cn("scroll-mt-6", className)}
    >
      {loadError && !draft ? (
        <div role="alert" className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-[12px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" />{loadError}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setReload((value) => value + 1)} className="h-8 rounded-[var(--md-radius-md)]">Try again</Button>
        </div>
      ) : null}

      <SettingsFieldRow label="Timezone" description="Working hours and booking times are read in this zone.">
        {draft ? <TimeZoneSelect variant="field" value={draft.timeZone} onChange={(timeZone) => update({ timeZone })} /> : <div className="h-10 w-full max-w-[320px] animate-pulse rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]" aria-hidden="true" />}
      </SettingsFieldRow>

      <SettingsFieldRow label="Working hours" description="Your normal week. Turn a day off to keep it clear." align="start">
        {draft ? <WorkingHoursEditor value={draft.workingHours} onChange={(workingHours) => update({ workingHours })} disabled={saving} className="-mx-2" /> : <div className="grid gap-1" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-9 animate-pulse rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]" />)}</div>}
      </SettingsFieldRow>

      <SettingsFieldRow label="Date exceptions" description="Block a day or offer different hours without changing your normal week." align="start">
        <div className="grid gap-1">
          {draft?.exceptions.map((exception, index) => {
            const unavailable = exception.unavailable !== false
            const range = exception.ranges?.[0] ?? ["09:00", "17:00"]
            const label = dateLabel.format(new Date(`${exception.date}T12:00:00`))
            return (
              <div key={`${exception.date}-${index}`} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--md-radius-lg)] px-2 py-1 transition-colors hover:bg-[var(--md-surface-tint)] sm:grid-cols-[minmax(120px,150px)_auto_minmax(0,1fr)_auto]">
                <span className="truncate text-[12.5px] font-medium text-[var(--md-ink)]">{label}</span>
                <label className="flex items-center gap-2 text-[11.5px] text-[var(--md-subtle)]">
                  <Switch size="sm" checked={!unavailable} disabled={saving} aria-label={`Offer hours on ${label}`} onCheckedChange={(available) => patchException(index, available ? { unavailable: false, ranges: [[range[0], range[1]]] } : { unavailable: true, ranges: undefined })} />
                  <span className="hidden sm:inline">{unavailable ? "Unavailable" : "Available"}</span>
                </label>
                {unavailable ? (
                  <span className="col-span-2 text-[11.5px] text-[var(--md-subtle)] sm:col-span-1">All day</span>
                ) : (
                  <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                    <MeetingTimeField label={`${label} starts`} value={range[0]} onChange={(time) => patchException(index, { unavailable: false, ranges: [[time, range[1] > time ? range[1] : time]] })} />
                    <span className="text-[12px] text-[var(--md-subtle)]" aria-hidden="true">–</span>
                    <MeetingTimeField label={`${label} finishes`} value={range[1]} notBefore={range[0]} onChange={(time) => patchException(index, { unavailable: false, ranges: [[range[0], time]] })} />
                  </div>
                )}
                <Button type="button" variant="ghost" size="icon" disabled={saving} aria-label={`Remove exception for ${label}`} onClick={() => update({ exceptions: draft.exceptions.filter((_, exceptionIndex) => exceptionIndex !== index) })} className="col-start-2 row-start-1 size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-ink)] sm:col-start-auto sm:row-start-auto"><X className="size-3.5" /></Button>
              </div>
            )
          })}
          {draft && !draft.exceptions.length ? <p className="px-2 py-2 text-[12px] text-[var(--md-subtle)]">No exceptions. Your normal week applies every day.</p> : null}
          <MultideckDatePicker
            value={null}
            onChange={addException}
            placeholder="Add a date"
            title="Add a date exception"
            minDate={todayKey()}
            disabled={busy}
            compact
            closeOnSelect
            triggerClassName="mt-1 h-8 w-auto justify-self-start rounded-[var(--md-radius-md)] px-2.5 text-[12px] text-[var(--md-accent)] shadow-none hover:bg-[var(--md-accent-a10)]"
            popoverClassName="w-[min(92vw,320px)]"
          />
        </div>
      </SettingsFieldRow>

      <SettingsFieldRow label="Booking rules" description="How much notice you need and how far ahead people may book." align="start">
        <div className="grid gap-3 sm:grid-cols-2">
          <RuleSelect label="Minimum notice" value={draft?.minimumNoticeMinutes ?? 120} choices={NOTICE_CHOICES} disabled={busy} onChange={(minimumNoticeMinutes) => update({ minimumNoticeMinutes })} />
          <RuleSelect label="Book up to" value={draft?.bookingHorizonDays ?? 60} choices={HORIZON_CHOICES} disabled={busy} onChange={(bookingHorizonDays) => update({ bookingHorizonDays })} />
          <RuleSelect label="Buffer before" value={draft?.bufferBeforeMinutes ?? 15} choices={BUFFER_CHOICES} disabled={busy} onChange={(bufferBeforeMinutes) => update({ bufferBeforeMinutes })} />
          <RuleSelect label="Buffer after" value={draft?.bufferAfterMinutes ?? 15} choices={BUFFER_CHOICES} disabled={busy} onChange={(bufferAfterMinutes) => update({ bufferAfterMinutes })} />
          <RuleSelect label="Offer start times" value={draft?.slotIncrementMinutes ?? 30} choices={INCREMENT_CHOICES} disabled={busy} onChange={(slotIncrementMinutes) => update({ slotIncrementMinutes })} />
        </div>
      </SettingsFieldRow>

      <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
        {error ? <p role="alert" className="flex items-center gap-2 text-[12px] text-[var(--md-red)] sm:me-auto"><TriangleAlert className="size-3.5 shrink-0" />{error}</p> : null}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(saved); setError(null) }} className="h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]">Discard</Button>
        <Button type="button" disabled={busy || !dirty} onClick={() => void save()} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-55">
          {saving ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {saving ? "Saving availability" : "Save availability"}
        </Button>
      </div>
    </SettingsPanel>
  )
}
