export type MeetingComposerContext = {
  startAt?: string
  endAt?: string
  source?: "calendar" | "crm"
  linkedRecord?: { type: "lead" | "account" | "job"; id: string; name?: string }
  title?: string
  attendees?: Array<{ name: string; email: string }>
  meetingId?: string
}

export const OPEN_MEETING_COMPOSER_EVENT = "multideck:calendar:open-meeting-composer"

/** Opens the centre-stage New meeting dialog from anywhere in the app shell. */
export function openMeetingComposer(context: MeetingComposerContext = {}) {
  window.dispatchEvent(new CustomEvent<MeetingComposerContext>(OPEN_MEETING_COMPOSER_EVENT, { detail: context }))
}

export function subscribeMeetingComposer(listener: (context: MeetingComposerContext) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<MeetingComposerContext>).detail ?? {})
  window.addEventListener(OPEN_MEETING_COMPOSER_EVENT, handler)
  return () => window.removeEventListener(OPEN_MEETING_COMPOSER_EVENT, handler)
}
