import { BookingDetailWorkspace } from "@/components/multideck/booking-components"
import type { AuthUserSummary } from "@/lib/auth-user"

export function BookingDetailPage({
  navigate,
  bookingId,
  currentUser,
}: {
  navigate: (path: string) => void
  bookingId: string
  currentUser: AuthUserSummary | null
}) {
  return <BookingDetailWorkspace navigate={navigate} bookingId={bookingId} currentUser={currentUser} />
}
