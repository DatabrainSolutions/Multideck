import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"

export type BookingMeetingCrmInput = {
  meetingId: string
  organiserUserId: string
  bookingLinkId: string
  attendeeName: string
  attendeeEmail: string
  attendeePhone?: string | null
  companyEntered?: string | null
}

/**
 * Links a confirmed booking to one normalised CRM lead and one timeline event.
 * The database function owns the lock and idempotency boundary so concurrent
 * booking verification or provider retries cannot create duplicate CRM work.
 */
export async function linkBookingMeetingToCrm(admin: SupabaseClient, input: BookingMeetingCrmInput) {
  const { data, error } = await admin.rpc("multideck_calendar_match_or_create_booking_lead", {
    p_meeting_id: input.meetingId,
    p_organiser_user_id: input.organiserUserId,
    p_booking_link_id: input.bookingLinkId,
    p_attendee_name: input.attendeeName,
    p_attendee_email: input.attendeeEmail,
    p_attendee_phone: input.attendeePhone ?? null,
    p_company_entered: input.companyEntered ?? null,
  })
  if (error || typeof data !== "string" || !data) {
    throw new HttpError(500, "The confirmed booking could not be linked to CRM.")
  }
  return data
}
