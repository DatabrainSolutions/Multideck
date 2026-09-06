import { Building2, Link2 as Link, Phone } from "@/components/icons/hugeicons"
import googleCalendarMark from "@/assets/calendar/google-calendar.svg"
import googleMeetMark from "@/assets/calendar/google-meet.svg"
import microsoftTeamsMark from "@/assets/calendar/microsoft-teams.svg"
import zoomMark from "@/assets/calendar/zoom.svg"
import microsoftMark from "@/assets/auth/microsoft.svg"
import type { CalendarProvider } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

export const meetingProviderLabels: Record<CalendarProvider, string> = {
  multideck: "No video link",
  google_meet: "Google Meet",
  microsoft_teams: "Microsoft Teams",
  zoom: "Zoom",
  phone: "Phone call",
  in_person: "In person",
}

export function MeetingProviderMark({ provider, calendarSource, className, appearance = "default" }: { provider: CalendarProvider; calendarSource?: "google" | "microsoft" | null; className?: string; appearance?: "default" | "event" }) {
  if (appearance === "event") {
    return <span className={cn("grid size-4 shrink-0 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-event-icon)]", className)}><Link className="size-3" strokeWidth={1.4} aria-hidden="true" /></span>
  }
  if (provider === "google_meet" || provider === "microsoft_teams" || provider === "zoom") {
    return <img src={provider === "google_meet" ? googleMeetMark : provider === "microsoft_teams" ? microsoftTeamsMark : zoomMark} alt="" className={cn("size-5 shrink-0", className)} />
  }
  if (provider === "multideck" && calendarSource) {
    return <img src={calendarSource === "google" ? googleCalendarMark : microsoftMark} alt="" className={cn("size-5 shrink-0", className)} />
  }
  const Icon = provider === "phone" ? Phone : provider === "in_person" ? Building2 : Link
  return <span className={cn("grid size-5 shrink-0 place-items-center rounded-md bg-[var(--brand-tint,var(--md-surface-tint))] text-[var(--brand-text,var(--md-text))]", className)}><Icon className="size-3" strokeWidth={1.4} /></span>
}
