import { workspaceStorageKey } from "@/lib/workspace-environment"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getBookingOpeningModes, openBookingWorkflow, type BookingOpeningDirection } from "@/lib/booking-workflow-api"

function requestKey(requestStorageKey: string) {
  const saved = window.sessionStorage.getItem(requestStorageKey)
  if (saved) return saved
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(requestStorageKey, next)
  return next
}

export function BookingOpenPage({ navigate, initialMode, onCancel, returnFocus }: {
  navigate: (path: string) => void
  initialMode?: "road"
  onCancel?: () => void
  returnFocus?: () => void
}) {
  const { t } = useLanguage()
  const pending = useRef<ReturnType<typeof openBookingWorkflow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [direction, setDirection] = useState<BookingOpeningDirection | "">("")
  const [mode, setMode] = useState(initialMode ?? "")
  const [modes, setModes] = useState<{ code: string; name: string }[]>([])
  const [modeError, setModeError] = useState(false)
  const [requestedDirection, setRequestedDirection] = useState<BookingOpeningDirection | null>(null)

  useEffect(() => {
    let cancelled = false
    void getBookingOpeningModes().then(sources => { if (!cancelled) { setModes(sources.modes); setModeError(!sources.modes.length) } })
      .catch(() => { if (!cancelled) setModeError(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!requestedDirection) return
    let cancelled = false
    const requestStorageKey = workspaceStorageKey(`multideck.booking.open-request${initialMode === "road" ? ".road" : ""}`)
    setError(null)
    pending.current ??= Promise.resolve().then(() => openBookingWorkflow(requestKey(requestStorageKey), initialMode, requestedDirection, mode))
    void pending.current.then((result) => {
      if (cancelled) return
      window.sessionStorage.removeItem(requestStorageKey)
      navigate(result.route || `/bookings/${result.bookingReference.toLowerCase()}`)
    }).catch((reason) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : t("The new booking could not be opened."))
    })
    return () => { cancelled = true }
  }, [attempt, initialMode, mode, navigate, requestedDirection, t])

  function retry() {
    pending.current = null
    setAttempt((current) => current + 1)
  }

  const creating = Boolean(requestedDirection) && !error
  const cancel = onCancel ?? (() => navigate(initialMode === "road" ? "/road-control" : "/bookings"))

  return (
    <Dialog open onOpenChange={open => { if (!open && !creating) cancel() }}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-6 text-[var(--md-ink)] sm:max-w-[460px]"
        showCloseButton={!creating}
        closeLabel={t("Close")}
        onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
        onEscapeKeyDown={event => { if (creating) event.preventDefault() }}
        onPointerDownOutside={event => { if (creating) event.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-[18px] font-medium">{t(initialMode === "road" ? "New road job" : "New booking")}</DialogTitle>
          <DialogDescription className="text-[13px] leading-6 text-[var(--md-text)]">
            {t("Choose the mode and direction for your office. The booking starts as Provisional; add the remaining details next.")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={event => {
          event.preventDefault()
          if (!mode || !direction || creating) return
          if (error) retry()
          else setRequestedDirection(direction)
        }}>
          <div className="md-horizontal-field">
            <label htmlFor="booking-opening-mode" className="text-[13px] font-medium">{t("Mode")}</label>
            <Select value={mode} onValueChange={setMode} disabled={Boolean(requestedDirection) || initialMode === "road" || !modes.length}>
              <SelectTrigger id="booking-opening-mode" aria-required="true" className="w-full">
                <SelectValue placeholder={t(modeError ? "Modes unavailable" : modes.length ? "Choose mode" : "Loading…")} />
              </SelectTrigger>
              <SelectContent>
                {modes.map(option => <SelectItem key={option.code || option.name} value={(option.code || option.name).toLowerCase()}>{t(option.name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {modeError ? <p role="alert" className="text-[13px] leading-5 text-[var(--md-status-red-ink)]">{t("Modes could not be loaded. Close and reopen this dialog to try again.")}</p> : null}
          <div className="md-horizontal-field">
            <label htmlFor="booking-opening-direction" className="text-[13px] font-medium">{t("Direction")}</label>
            <Select value={direction} onValueChange={value => setDirection(value as BookingOpeningDirection)} disabled={Boolean(requestedDirection)}>
              <SelectTrigger id="booking-opening-direction" aria-required="true" className="w-full">
                <SelectValue placeholder={t("Choose direction")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="import">{t("Import")}</SelectItem>
                <SelectItem value="export">{t("Export")}</SelectItem>
                <SelectItem value="domestic">{t("Domestic")}</SelectItem>
                <SelectItem value="cross_trade">{t("Cross trade")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <p role="alert" className="text-[13px] leading-5 text-[var(--md-status-red-ink)]">{error}</p> : null}
          {creating ? <div role="status" aria-live="polite" className="flex items-center gap-2 text-[13px] text-[var(--md-text)]">
            <DotGridLoader size="sm" />{t("Creating booking…")}
          </div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={creating} onClick={cancel}>{t("Cancel")}</Button>
            <Button type="submit" disabled={!mode || !direction || creating || !modes.length} title={!mode || !direction ? t("Choose a mode and direction first") : undefined}>
              {t(error ? "Try again" : creating ? "Creating…" : "Create provisional booking")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
