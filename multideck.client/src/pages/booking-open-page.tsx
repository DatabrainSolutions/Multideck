import { workspaceStorageKey } from "@/lib/workspace-environment"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { openBookingWorkflow } from "@/lib/booking-workflow-api"

const requestStorageKey = workspaceStorageKey("multideck.booking.open-request")

function requestKey() {
  const saved = window.sessionStorage.getItem(requestStorageKey)
  if (saved) return saved
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(requestStorageKey, next)
  return next
}

export function BookingOpenPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (started.current) return
    started.current = true
    setError(null)
    void openBookingWorkflow(requestKey()).then((result) => {
      window.sessionStorage.removeItem(requestStorageKey)
      navigate(result.route || `/bookings/${result.bookingReference.toLowerCase()}`)
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : t("The new booking could not be opened."))
    })
  }, [attempt, navigate, t])

  function retry() {
    started.current = false
    setAttempt((current) => current + 1)
  }

  return (
    <main className="grid min-h-full place-items-center bg-[var(--md-analytics-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
      {error ? (
        <Surface padding="lg" className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] text-center">
          <h1 className="text-[20px] font-medium">{t("Booking could not be opened")}</h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/bookings")}>{t("Return to bookings")}</Button>
            <Button onClick={retry}>{t("Try again")}</Button>
          </div>
        </Surface>
      ) : (
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <DotGridLoader size="md" />
          <p className="text-[13px] text-[var(--md-text)]">{t("Opening a new booking...")}</p>
        </div>
      )}
    </main>
  )
}
