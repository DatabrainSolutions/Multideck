import { BookingDetailWorkspace, CargoWiseReferenceWorkspace } from "@/components/multideck/booking-components"

export function BookingDetailPage({
  navigate,
  bookingId,
  variant = "workspace",
}: {
  navigate: (path: string) => void
  bookingId: string
  variant?: "workspace" | "cargowise-reference"
}) {
  if (variant === "cargowise-reference") return <CargoWiseReferenceWorkspace navigate={navigate} bookingId={bookingId} />
  return <BookingDetailWorkspace navigate={navigate} bookingId={bookingId} />
}
