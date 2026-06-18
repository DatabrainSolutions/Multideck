import { BookingDetailWorkspace } from "@/components/multideck/booking-components"

export function BookingDetailPage({
  navigate,
  bookingId,
}: {
  navigate: (path: string) => void
  bookingId: string
}) {
  return <BookingDetailWorkspace navigate={navigate} bookingId={bookingId} />
}
