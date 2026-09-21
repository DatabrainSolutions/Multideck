export const meetingEmailPresentation = {
  booking_verification: { title: "Verify your email", eyebrow: "Booking verification" },
  standalone_confirmation: { title: "Your meeting is confirmed", eyebrow: "Meeting confirmed" },
  management: { title: "Your meeting details", eyebrow: "Meeting confirmed" },
  rescheduled: { title: "Your meeting has moved", eyebrow: "Meeting updated" },
  cancelled: { title: "Your meeting has been cancelled", eyebrow: "Meeting cancelled" },
  reminder: { title: "Your meeting is coming up", eyebrow: "Meeting reminder" },
  group_reschedule_request: { title: "An attendee proposed new times", eyebrow: "Action required" },
  group_reschedule_outcome: { title: "The organiser responded", eyebrow: "Meeting update" },
} as const
