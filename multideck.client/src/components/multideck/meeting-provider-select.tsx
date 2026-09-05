import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import type { CalendarConnection, CalendarProvider } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

const videoProviders: CalendarProvider[] = ["google_meet", "microsoft_teams", "zoom"]
const otherProviders: CalendarProvider[] = ["phone", "in_person", "multideck"]

export function isVideoMeetingProvider(provider: CalendarProvider) {
  return videoProviders.includes(provider)
}

export function meetingProviderConnection(provider: CalendarProvider, connections: CalendarConnection[]) {
  const code = provider === "google_meet" ? "google" : provider === "microsoft_teams" ? "microsoft" : provider === "zoom" ? "zoom" : null
  return code ? connections.find((connection) => connection.provider === code) ?? null : null
}

export function isMeetingProviderReady(provider: CalendarProvider, connections: CalendarConnection[]) {
  return !isVideoMeetingProvider(provider) || meetingProviderConnection(provider, connections)?.status === "connected"
}

/**
 * One dropdown for how a meeting is joined. Video platforms keep their real logos,
 * and a platform that is not connected yet can still be chosen so the operator sees
 * exactly what to connect rather than a dead option.
 */
export function MeetingProviderSelect({ value, onChange, connections, onConnect, disabled, className }: {
  value: CalendarProvider
  onChange: (provider: CalendarProvider) => void
  connections: CalendarConnection[]
  onConnect?: () => void
  disabled?: boolean
  className?: string
}) {
  const ready = isMeetingProviderReady(value, connections)

  function item(provider: CalendarProvider) {
    const providerReady = isMeetingProviderReady(provider, connections)
    return (
      <SelectItem key={provider} value={provider} className="pe-8">
        <MeetingProviderMark provider={provider} className="size-4" />
        <span className="flex-1">{meetingProviderLabels[provider]}</span>
        {!providerReady ? <span className="text-[11px] text-[var(--md-subtle)] [[data-slot=select-value]_&]:hidden">Not connected</span> : null}
      </SelectItem>
    )
  }

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <Select value={value} onValueChange={(next) => onChange(next as CalendarProvider)} disabled={disabled}>
        <SelectTrigger aria-label="How attendees join" className="h-9 min-w-[200px] rounded-[var(--md-radius-lg)] text-[13px] text-[var(--md-ink)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[500] min-w-[240px]">
          {videoProviders.map(item)}
          <SelectSeparator />
          {otherProviders.map(item)}
        </SelectContent>
      </Select>
      {isVideoMeetingProvider(value) && !ready ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-[var(--md-amber-strong)]">
            {meetingProviderLabels[value]} is not connected.
            {onConnect ? <button type="button" onClick={onConnect} className="font-medium text-[var(--md-accent)] hover:underline">Connect in Settings</button> : null}
          </span>
      ) : null}
    </div>
  )
}
