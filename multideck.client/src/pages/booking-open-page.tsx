import { workspaceStorageKey } from "@/lib/workspace-environment"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { openBookingWorkflow, type BookingOpeningDirection } from "@/lib/booking-workflow-api"

function requestKey(requestStorageKey: string) {
  const saved = window.sessionStorage.getItem(requestStorageKey)
  if (saved) return saved
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(requestStorageKey, next)
  return next
}

export function BookingOpenPage({ navigate, initialMode }: { navigate: (path: string) => void; initialMode?: "road" }) {
  const { t } = useLanguage()
  const pending = useRef<ReturnType<typeof openBookingWorkflow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [direction, setDirection] = useState<BookingOpeningDirection | "">("")
  const [requestedDirection, setRequestedDirection] = useState<BookingOpeningDirection | null>(null)

  useEffect(() => {
    if (!requestedDirection) return
    let cancelled = false
    const requestStorageKey = workspaceStorageKey(`multideck.booking.open-request${initialMode === "road" ? ".road" : ""}`)
    setError(null)
    pending.current ??= Promise.resolve().then(() => openBookingWorkflow(requestKey(requestStorageKey), initialMode, requestedDirection))
    void pending.current.then((result) => {
      if (cancelled) return
      window.sessionStorage.removeItem(requestStorageKey)
      navigate(result.route || `/bookings/${result.bookingReference.toLowerCase()}`)
    }).catch((reason) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : t("The new booking could not be opened."))
    })
    return () => { cancelled = true }
  }, [attempt, initialMode, navigate, requestedDirection, t])

  function retry() {
    pending.current = null
    setAttempt((current) => current + 1)
  }

  return (
    <main className="grid min-h-full place-items-center bg-[var(--md-analytics-bg)] px-[var(--md-page-pad)] text-[var(--md-ink)]">
      {!requestedDirection ? (
        <Surface padding="lg" className="w-full max-w-[520px] rounded-[var(--md-radius-xl)]">
          <h1 className="text-[18px] font-medium">{t(initialMode === "road" ? "New road job" : "New booking")}</h1>
          <p id="booking-opening-direction-help" className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">
            {t("Choose the direction relative to the office that owns this Booking. It is needed to allocate the correct reference; no route or dates will be assumed.")}
          </p>
          <form className="mt-4" onSubmit={event => { event.preventDefault(); if (direction) setRequestedDirection(direction) }}>
            <label htmlFor="booking-opening-direction" className="text-[13px] font-medium">{t("Direction")}</label>
            <select id="booking-opening-direction" required value={direction} aria-describedby="booking-opening-direction-help"
              className="mt-2 h-10 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
              onChange={event => setDirection(event.target.value as BookingOpeningDirection)}>
              <option value="" disabled>{t("Choose direction")}</option>
              <option value="import">{t("Import")}</option>
              <option value="export">{t("Export")}</option>
              <option value="domestic">{t("Domestic")}</option>
              <option value="cross_trade">{t("Cross trade")}</option>
            </select>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => navigate(initialMode === "road" ? "/road-control" : "/bookings")}>{t("Cancel")}</Button>
              <Button type="submit">{t("Open booking")}</Button>
            </div>
          </form>
        </Surface>
      ) : error ? (
        <Surface padding="lg" className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] text-center">
          <h1 className="text-[20px] font-medium">{t("Booking could not be opened")}</h1>
          <p role="alert" className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{error}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="ghost" onClick={() => navigate(initialMode === "road" ? "/road-control" : "/bookings")}>{t(initialMode === "road" ? "Return to Road control" : "Return to bookings")}</Button>
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
