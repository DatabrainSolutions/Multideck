import { Button } from "@/components/ui/button"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { BookingOpenPage } from "@/pages/booking-open-page"

export function DomesticRoadBookingPage({ navigate, roadJobId }: { navigate: (path: string) => void; roadJobId?: string }) {
  const { t } = useLanguage()
  if (!roadJobId) return <BookingOpenPage navigate={navigate} initialMode="road" />

  // Historical RD references discarded prefix and leading digits. Never guess
  // a Booking identity or substitute sample records for an unresolved link.
  return (
    <div className="md-page md-page-stack">
      <Surface padding="lg">
        <h1 className="text-[18px] font-medium">{t("Open this job from Road control")}</h1>
        <p className="mt-2 text-[13px] text-[var(--md-text)]">
          {t("This older Road link does not contain a complete Booking reference. Choose the saved job from Road control to view its current details.")}
        </p>
        <Button className="mt-4" onClick={() => navigate("/road-control")}>{t("Return to Road control")}</Button>
      </Surface>
    </div>
  )
}
