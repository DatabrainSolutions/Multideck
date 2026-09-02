import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CalendarDays, Check, ChevronLeft, Clock3, Mail, MapPin, Phone, Plus, RefreshCw, ShieldCheck, TriangleAlert, Video } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AvailabilityPicker } from "@/components/multideck/availability-picker"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { safeTimeZone } from "@/components/multideck/meeting-time-picker"
import { VerificationCodeInput } from "@/components/multideck/verification-code-input"
import { PublicBrandIdentity } from "@/components/multideck/public-brand-identity"
import { useLanguage } from "@/i18n/language-provider"
import { createPublicBookingHold, downloadMeetingCalendarFile, getManagedMeeting, getPublicBooking, getPublicBookingSlots, resendPublicBookingCode, verifyPublicBooking, type BookingHold, type BookingQuestion, type CalendarEvent, type PublicBooking } from "@/lib/calendar-api"
import { mdMotion } from "@/lib/motion"
import { publicBrandTheme } from "@/lib/public-brand-theme"
import { startPublicBrandRefresh } from "@/lib/public-brand-refresh"
import { cn } from "@/lib/utils"

type Step = "time" | "details" | "verify" | "confirmed"

const stepOrder: Step[] = ["time", "details", "verify", "confirmed"]
const resendCooldownSeconds = 30
const videoProviders = new Set(["google_meet", "microsoft_teams", "zoom"])

/** Shared primitives, tinted through the brand contract rather than by rewriting tokens. */
const fieldClass = "h-10 rounded-[var(--brand-control-radius,var(--md-radius-lg))] bg-[var(--brand-field,var(--md-field-bg))] text-[var(--brand-ink,var(--md-ink))] hover:bg-[var(--brand-field-hover,var(--md-field-bg-hover))] focus-visible:bg-[var(--brand-field-hover,var(--md-field-bg-hover))] focus-visible:border-[var(--brand-a48,var(--md-accent-a48))] focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))] aria-invalid:border-[var(--brand-danger,var(--md-red))] aria-invalid:ring-[color-mix(in_srgb,var(--brand-danger,var(--md-red))_22%,transparent)]"
const primaryButtonClass = "rounded-[var(--brand-control-radius)] bg-[var(--brand-accent,var(--md-accent))] text-[var(--brand-accent-ink,var(--md-accent-ink))] hover:bg-[var(--brand-accent,var(--md-accent))] hover:opacity-90 focus-visible:ring-[var(--brand-a28,var(--md-accent-a28))]"
const quietButtonClass = "rounded-[var(--brand-control-radius)] text-[var(--brand-text,var(--md-text))] hover:bg-[var(--brand-hover,var(--md-hover))] hover:text-[var(--brand-ink,var(--md-ink))]"

function countdown(msRemaining: number) {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function Fact({ icon: Icon, children }: { icon: typeof Clock3; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-[12px] leading-5 text-[var(--brand-text,var(--md-text))]"><Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--brand-subtle,var(--md-subtle))]" strokeWidth={1.5} />{children}</li>
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return <p id={id} role="alert" className="text-[11px] text-[var(--brand-danger,var(--md-red))]">{children}</p>
}

export function PublicBookingPage({ organiserSlug, bookingSlug }: { organiserSlug: string; bookingSlug: string }) {
  const { language } = useLanguage()
  const [booking, setBooking] = useState<PublicBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [slotsBusy, setSlotsBusy] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [loadedUntil, setLoadedUntil] = useState(() => new Date(Date.now() + 45 * 86_400_000))
  const [timeZone, setTimeZone] = useState(() => safeTimeZone(null))

  const [step, setStep] = useState<Step>("time")
  const [selected, setSelected] = useState<string | null>(null)
  const [details, setDetails] = useState({ name: "", email: "", website: "" })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showOptional, setShowOptional] = useState(false)

  const [hold, setHold] = useState<BookingHold | null>(null)
  const [code, setCode] = useState("")
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const [meeting, setMeeting] = useState<CalendarEvent | null>(null)
  const [managePath, setManagePath] = useState<string | null>(null)
  const [finalising, setFinalising] = useState(false)
  const [finalisationDelayed, setFinalisationDelayed] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const detailsForm = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError(null)
    void getPublicBooking(organiserSlug, bookingSlug)
      .then((result) => { if (!cancelled) setBooking(result) })
      .catch((reason) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "This booking page could not be loaded.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookingSlug, organiserSlug])

  const bookingLoaded = Boolean(booking)
  useEffect(() => {
    if (!bookingLoaded) return
    return startPublicBrandRefresh(
      () => getPublicBooking(organiserSlug, bookingSlug),
      ({ branding }) => setBooking((current) => current && JSON.stringify(current.branding) !== JSON.stringify(branding) ? { ...current, branding } : current),
    )
  }, [bookingLoaded, bookingSlug, organiserSlug])

  useEffect(() => {
    if (!bookingLoaded || step !== "time") return
    let cancelled = false
    setSlotsBusy(true)
    void getPublicBookingSlots(organiserSlug, bookingSlug, new Date().toISOString(), loadedUntil.toISOString())
      .then((result) => { if (!cancelled) { setSlots(result.slots); setSlotsError(null) } })
      .catch((reason) => { if (!cancelled) setSlotsError(reason instanceof Error ? reason.message : "Available times could not be loaded.") })
      .finally(() => { if (!cancelled) { setSlotsLoading(false); setSlotsBusy(false) } })
    return () => { cancelled = true }
  }, [bookingLoaded, bookingSlug, loadedUntil, organiserSlug, step])

  useEffect(() => {
    if (!finalising || !managePath) return
    const token = managePath.split("/").at(-1)
    if (!token) return
    let attempts = 0
    const interval = window.setInterval(() => {
      attempts += 1
      void getManagedMeeting(token).then((result) => {
        setMeeting(result.meeting)
        if (result.meeting.status === "confirmed") { setFinalising(false); setFinalisationDelayed(false); setError(null); window.clearInterval(interval) }
        if (result.meeting.status === "sync_failed" || result.meeting.status === "cancelled") { setFinalising(false); setFinalisationDelayed(false); setError(result.meeting.syncError || "The provider could not confirm the meeting. No booking was completed."); window.clearInterval(interval) }
      }).catch(() => undefined)
      if (attempts >= 40) {
        window.clearInterval(interval)
        setFinalising(false)
        setFinalisationDelayed(true)
        setError("Confirmation is taking longer than expected. No booking is being claimed yet; check the status again or use your private management link.")
      }
    }, 3000)
    return () => window.clearInterval(interval)
  }, [finalising, managePath])

  // The hold countdown and the resend cooldown are both read off one clock, so
  // they cannot drift apart or leave a stale value on screen.
  useEffect(() => {
    if (step !== "verify" || !hold) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [hold, step])

  const brand = booking?.branding
  const scope = useMemo(() => publicBrandTheme(brand), [brand])

  const requiredQuestions = booking?.questions.filter((question) => question.required) ?? []
  const optionalQuestions = booking?.questions.filter((question) => !question.required) ?? []
  const stepIndex = stepOrder.indexOf(step)
  const confirmationFailed = Boolean(meeting && (meeting.status === "sync_failed" || meeting.status === "cancelled"))
  const confirmationWaiting = Boolean(meeting && !finalising && (finalisationDelayed || meeting.status === "provisioning" || meeting.status === "sync_pending"))
  const holdExpiresAt = hold ? Date.parse(hold.expiresAt) : Number.NaN
  const holdRemaining = Number.isFinite(holdExpiresAt) ? holdExpiresAt - now : Number.NaN
  const holdExpired = step === "verify" && Number.isFinite(holdRemaining) && holdRemaining <= 0
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const selectedLabel = selected
    ? new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(selected))
    : null

  function answer(question: BookingQuestion, value: string) {
    setAnswers((current) => ({ ...current, [question.id]: value }))
    setFieldErrors((current) => ({ ...current, [question.id]: "" }))
  }

  function chooseTime(slot: string) {
    setSelected(slot)
    setError(null)
    setStep("details")
  }

  function backToTimes() {
    setStep("time")
    setHold(null)
    setCode("")
    setError(null)
    setNotice(null)
  }

  async function holdTime() {
    if (!selected || !booking) return
    const problems: Record<string, string> = {}
    if (!details.name.trim()) problems.name = "Enter your name."
    if (!/^\S+@\S+\.\S+$/.test(details.email.trim())) problems.email = "Enter an email address we can send the invite to."
    for (const question of booking.questions) {
      if (question.required && !answers[question.id]?.trim()) problems[question.id] = `${question.label} is required.`
    }
    setFieldErrors(problems)
    if (Object.keys(problems).length) {
      if (optionalQuestions.some((question) => problems[question.id])) setShowOptional(true)
      const firstProblem = detailsForm.current?.querySelector<HTMLElement>("[aria-invalid='true']")
      firstProblem?.focus()
      return
    }
    setSubmitting(true); setError(null)
    try {
      const result = await createPublicBookingHold(organiserSlug, bookingSlug, {
        ...details,
        company: answers.company,
        phone: answers.phone,
        startAt: selected,
        endAt: new Date(Date.parse(selected) + booking.durationMinutes * 60_000).toISOString(),
        timeZone,
        answers,
      })
      setHold(result)
      setCode("")
      setResendAt(Date.now() + resendCooldownSeconds * 1000)
      setStep("verify")
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "That time could not be held."
      setError(message)
      if (/unavailable|no longer/i.test(message)) { setSelected(null); setStep("time") }
    } finally { setSubmitting(false) }
  }

  async function verify(entered = code) {
    if (!hold || entered.length !== 6 || submitting) return
    setSubmitting(true); setError(null); setNotice(null)
    try {
      const result = await verifyPublicBooking(organiserSlug, bookingSlug, hold.holdId, entered)
      setMeeting(result.meeting); setManagePath(result.managePath); setFinalising(Boolean(result.finalising)); setFinalisationDelayed(false); setStep("confirmed")
      if (!result.confirmed && !result.finalising) setError(result.meeting.syncError || "The provider could not confirm the meeting. No booking was completed.")
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The booking could not be verified."
      setError(message)
      setCode("")
      if (/expired|no longer available|choose (?:a )?(?:fresh|new|another) (?:slot|time)/i.test(message)) {
        setSelected(null); setHold(null); setStep("time")
      }
    } finally { setSubmitting(false) }
  }

  async function resend() {
    if (!hold || resendIn > 0) return
    setError(null); setNotice(null)
    setResendAt(Date.now() + resendCooldownSeconds * 1000)
    try {
      const result = await resendPublicBookingCode(organiserSlug, bookingSlug, hold.holdId)
      setNotice(result.previewCode ? `Verification code for testing: ${result.previewCode}` : "A new code is on its way.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The code could not be resent.")
    }
  }

  async function checkFinalisation() {
    const token = managePath?.split("/").at(-1)
    if (!token) return
    setSubmitting(true); setError(null)
    try {
      const result = await getManagedMeeting(token)
      setMeeting(result.meeting)
      if (result.meeting.status === "confirmed") { setFinalising(false); setFinalisationDelayed(false) }
      else if (result.meeting.status === "sync_failed" || result.meeting.status === "cancelled") {
        setFinalising(false); setFinalisationDelayed(false); setError(result.meeting.syncError || "The provider could not confirm the meeting. No booking was completed.")
      } else { setFinalising(true); setFinalisationDelayed(false) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The booking status could not be checked.")
    } finally { setSubmitting(false) }
  }

  if (loading) return <main className="grid min-h-screen place-items-center" style={{ ...publicBrandTheme(null), background: "var(--brand-bg)", color: "var(--brand-ink)" }}><DotGridLoader label="Loading booking page…" /></main>

  const header = <header className="mb-5 flex items-center justify-between gap-4">
    <PublicBrandIdentity key={brand?.logoUrl ?? "no-logo"} brand={brand} />
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--brand-surface,var(--md-surface))] px-3 py-1.5 text-[10.5px] font-medium text-[var(--brand-text,var(--md-text))] shadow-[inset_0_0_0_1px_var(--brand-line,var(--md-line))]"><ShieldCheck className="size-3" strokeWidth={1.5} />{booking?.localPreview ? "Test booking" : "Secure booking"}</span>
  </header>

  if (loadError && !booking) return <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-14" style={{ ...scope, background: "var(--brand-bg,var(--md-bg))", color: "var(--brand-ink,var(--md-ink))" }}>
    <div className="mx-auto w-full max-w-[520px]">
      {header}
      <section role="alert" className="grid min-h-64 place-items-center bg-[var(--brand-surface,var(--md-surface))] p-8 text-center shadow-[inset_0_0_0_1px_var(--brand-line,var(--md-line)),0_18px_60px_rgba(11,20,19,.07)]" style={{ borderRadius: "var(--brand-radius,var(--md-radius-2xl))" }}>
        <div>
          <TriangleAlert className="mx-auto size-6 text-[var(--brand-danger,var(--md-red))]" strokeWidth={1.4} />
          <h1 className="mt-4 text-[18px] font-medium">This booking page is unavailable</h1>
          <p className="mt-2 text-[12.5px] leading-5 text-[var(--brand-text,var(--md-text))]">{loadError}</p>
        </div>
      </section>
    </div>
  </main>

  if (!booking) return null

  const paneHeading = step === "details" ? "Your details" : step === "verify" ? "Confirm it's you" : "Pick a time"

  return <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12" style={{ ...scope, background: "var(--brand-bg,var(--md-bg))", color: "var(--brand-ink,var(--md-ink))" }}>
    <div className="mx-auto w-full max-w-[920px]">
      {header}
      <section className="overflow-hidden bg-[var(--brand-surface,var(--md-surface))] shadow-[inset_0_0_0_1px_var(--brand-line,var(--md-line)),0_18px_60px_rgba(11,20,19,.07)] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]" style={{ borderRadius: "var(--brand-radius,var(--md-radius-2xl))" }}>
        <aside className="border-b border-[var(--brand-line,var(--md-line))] bg-[var(--brand-secondary-tint)] p-5 sm:p-6 lg:border-b-0 lg:border-e">
          <div className="flex items-center gap-2">
            <MeetingProviderMark provider={booking.provider} className="size-6" />
            <p className="truncate text-[11.5px] font-medium text-[var(--brand-subtle,var(--md-subtle))]">{booking.organiser.name}</p>
          </div>
          <h1 className="mt-2.5 text-[19px] font-medium leading-6 tracking-[-.015em]">{booking.title}</h1>
          <ul className="mt-3.5 grid gap-2">
            <Fact icon={Clock3}>{booking.durationMinutes} minutes</Fact>
            {booking.provider === "phone" ? <Fact icon={Phone}>Phone call</Fact> : null}
            {videoProviders.has(booking.provider) ? <Fact icon={Video}>{meetingProviderLabels[booking.provider]}</Fact> : null}
            {booking.location ? <Fact icon={MapPin}>{booking.location}</Fact> : booking.provider === "in_person" ? <Fact icon={MapPin}>In person</Fact> : null}
          </ul>
          {booking.description ? <p className="mt-3.5 text-[12px] leading-5 text-[var(--brand-text,var(--md-text))]">{booking.description}</p> : null}
          <AnimatePresence initial={false}>
            {selectedLabel && step !== "confirmed" ? <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-4 rounded-[var(--brand-control-radius,var(--md-radius-lg))] bg-[var(--brand-a08,var(--md-accent-a08))] p-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-[.07em] text-[var(--brand-subtle,var(--md-subtle))]">Your time</p>
              <p className="mt-1 text-[12.5px] font-medium leading-5 text-[var(--brand-ink,var(--md-ink))]">{selectedLabel}</p>
              <p className="mt-0.5 text-[11px] text-[var(--brand-subtle,var(--md-subtle))]">{timeZone.replace(/_/g, " ")}</p>
              {step === "details" ? <button type="button" onClick={backToTimes} className="mt-1.5 text-[11px] font-medium text-[var(--brand-accent,var(--md-accent))] underline-offset-2 hover:underline">Change</button> : null}
            </motion.div> : null}
          </AnimatePresence>
        </aside>

        <div className="flex min-h-[380px] flex-col p-5 sm:p-6">
          {step !== "confirmed" ? <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-medium">{paneHeading}</h2>
            <span className="text-[11px] font-medium text-[var(--brand-subtle,var(--md-subtle))]">Step {stepIndex + 1} of 3</span>
          </div> : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: mdMotion.exit }}
              transition={mdMotion.enter}
              className="flex flex-1 flex-col"
            >
              {step === "time" ? <>
                <AvailabilityPicker
                  brandTheme={scope}
                  slots={slots}
                  selected={selected}
                  onSelect={chooseTime}
                  timeZone={timeZone}
                  onTimeZoneChange={setTimeZone}
                  loading={slotsLoading}
                  busy={slotsBusy && !slotsLoading}
                  monthsAhead={6}
                  onVisibleMonthChange={(month) => {
                    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1)
                    if (monthEnd > loadedUntil) setLoadedUntil(monthEnd)
                  }}
                  emptyHint={`${booking.organiser.name} has nothing free in the booking window. Existing meetings, held times and connected-calendar busy time are already accounted for.`}
                />
                {error || slotsError ? <p role="alert" className="mt-4 text-[11.5px] leading-5 text-[var(--brand-danger,var(--md-red))]">{error || slotsError}</p> : null}
              </> : null}

              {step === "details" ? <form
                ref={detailsForm}
                noValidate
                onSubmit={(event) => { event.preventDefault(); void holdTime() }}
                className="flex flex-1 flex-col"
              >
                <button type="button" onClick={backToTimes} className="-mt-1 mb-4 inline-flex w-fit items-center gap-1 text-[11.5px] font-medium text-[var(--brand-text,var(--md-text))] hover:text-[var(--brand-ink,var(--md-ink))] lg:hidden"><ChevronLeft className="size-3.5" strokeWidth={1.6} />Change time</button>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[11.5px] font-medium">Name
                    <Input autoComplete="name" autoFocus value={details.name} aria-invalid={Boolean(fieldErrors.name) || undefined} aria-describedby={fieldErrors.name ? "booking-name-error" : undefined} onChange={(event) => { const name = event.currentTarget.value; setDetails((current) => ({ ...current, name })); setFieldErrors((current) => ({ ...current, name: "" })) }} className={fieldClass} />
                    <FieldError id="booking-name-error">{fieldErrors.name}</FieldError>
                  </label>
                  <label className="grid gap-1.5 text-[11.5px] font-medium">Email
                    <Input type="email" inputMode="email" autoComplete="email" value={details.email} aria-invalid={Boolean(fieldErrors.email) || undefined} aria-describedby={fieldErrors.email ? "booking-email-error" : undefined} onChange={(event) => { const email = event.currentTarget.value; setDetails((current) => ({ ...current, email })); setFieldErrors((current) => ({ ...current, email: "" })) }} className={fieldClass} />
                    <FieldError id="booking-email-error">{fieldErrors.email}</FieldError>
                  </label>
                  {requiredQuestions.map((question) => <QuestionField key={question.id} question={question} value={answers[question.id] ?? ""} error={fieldErrors[question.id]} onChange={(value) => answer(question, value)} />)}
                </div>

                {optionalQuestions.length ? <div className="mt-3.5">
                  {showOptional
                    ? <div className="grid gap-3.5 sm:grid-cols-2">{optionalQuestions.map((question) => <QuestionField key={question.id} question={question} value={answers[question.id] ?? ""} error={fieldErrors[question.id]} onChange={(value) => answer(question, value)} />)}</div>
                    : <button type="button" onClick={() => setShowOptional(true)} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--brand-text,var(--md-text))] hover:text-[var(--brand-ink,var(--md-ink))]"><Plus className="size-3.5" strokeWidth={1.6} />Add {optionalQuestions.length === 1 ? optionalQuestions[0].label.toLowerCase() : `${optionalQuestions.length} optional details`}</button>}
                </div> : null}

                <label className="hidden" aria-hidden="true">Website<Input tabIndex={-1} autoComplete="off" value={details.website} onChange={(event) => setDetails((current) => ({ ...current, website: event.target.value }))} /></label>

                {error ? <p role="alert" className="mt-4 text-[11.5px] text-[var(--brand-danger,var(--md-red))]">{error}</p> : null}
                <div className="mt-auto flex items-center justify-end gap-3 pt-5">
                  <p className="me-auto hidden text-[11px] leading-4 text-[var(--brand-subtle,var(--md-subtle))] sm:block">We email a six-digit code to check the address before anything is booked.</p>
                  <Button type="submit" size="lg" className={primaryButtonClass} disabled={submitting}>{submitting ? "Holding your time…" : "Continue"}</Button>
                </div>
              </form> : null}

              {step === "verify" && hold ? <div className="flex flex-1 flex-col">
                <p className="text-[12.5px] leading-5 text-[var(--brand-text,var(--md-text))]">
                  {hold.previewCode ? "No email is sent while testing. Use the code below to walk the whole verification journey." : <>Enter the six-digit code we sent to <span className="font-medium text-[var(--brand-ink,var(--md-ink))]">{hold.email}</span>.</>}
                </p>
                {hold.previewCode ? <p className="mt-3 w-fit rounded-full bg-[var(--brand-a08,var(--md-accent-a08))] px-3 py-1.5 text-[11.5px] font-medium text-[var(--brand-accent,var(--md-accent))]">Verification code for testing: {hold.previewCode}</p> : null}

                <VerificationCodeInput
                  className="mt-4"
                  value={code}
                  onChange={(value) => { setCode(value); setError(null) }}
                  onComplete={(value) => void verify(value)}
                  disabled={submitting || holdExpired}
                  invalid={Boolean(error)}
                  autoFocus
                  firstBoxId="booking-code-1"
                  describedBy="booking-code-status"
                />

                <p id="booking-code-status" className="mt-3 text-[11.5px] leading-5 text-[var(--brand-subtle,var(--md-subtle))]" role="status">
                  {holdExpired
                    ? "This time is no longer held for you."
                    : Number.isFinite(holdRemaining)
                      ? <>We are holding this time for another <span className="font-medium tabular-nums text-[var(--brand-ink,var(--md-ink))]">{countdown(holdRemaining)}</span>.</>
                      : "We are holding this time while you verify."}
                </p>
                {error ? <p role="alert" className="mt-2 text-[11.5px] text-[var(--brand-danger,var(--md-red))]">{error}</p> : null}
                {notice ? <p role="status" className="mt-2 text-[11.5px] text-[var(--brand-accent,var(--md-accent))]">{notice}</p> : null}

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                  <button type="button" onClick={backToTimes} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--brand-text,var(--md-text))] hover:text-[var(--brand-ink,var(--md-ink))]"><ChevronLeft className="size-3.5" strokeWidth={1.6} />Choose another time</button>
                  {holdExpired
                    ? <Button size="lg" className={cn("ms-auto", primaryButtonClass)} onClick={backToTimes}>Pick a new time</Button>
                    : <>
                      <button type="button" onClick={() => void resend()} disabled={resendIn > 0} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--brand-text,var(--md-text))] hover:text-[var(--brand-ink,var(--md-ink))] disabled:pointer-events-none disabled:opacity-50"><Mail className="size-3.5" strokeWidth={1.6} />{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button>
                      <Button size="lg" className={cn("ms-auto", primaryButtonClass)} disabled={submitting || code.length !== 6} onClick={() => void verify()}>{submitting ? "Confirming…" : "Confirm booking"}</Button>
                    </>}
                </div>
              </div> : null}

              {step === "confirmed" && meeting ? <div className="flex flex-1 flex-col">
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", confirmationFailed ? "bg-[color-mix(in_srgb,var(--brand-danger,var(--md-red))_12%,var(--brand-surface,var(--md-surface)))] text-[var(--brand-danger,var(--md-red))]" : "bg-[var(--brand-a14,var(--md-accent-a14))] text-[var(--brand-accent,var(--md-accent))]")}>
                    {finalising ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : confirmationFailed || confirmationWaiting ? <TriangleAlert className="size-4.5" strokeWidth={1.5} /> : <Check className="size-4.5" strokeWidth={1.8} />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-medium leading-5">{finalising ? `Creating your ${meetingProviderLabels[booking.provider]} link…` : confirmationFailed ? "This booking was not confirmed" : confirmationWaiting ? "Confirmation is taking longer than expected" : "You're booked in"}</h3>
                    <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--brand-text,var(--md-text))]">
                      {finalising ? "Stay here while the provider creates the real event and joining details. Nothing is claimed as booked yet."
                        : confirmationFailed ? "The time has not been presented as booked. The organiser can recover the provider connection before a new booking is attempted."
                        : confirmationWaiting ? "The provider has not finished creating the real event. Check again before relying on this time."
                        : `${new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(meeting.startAt))} · ${timeZone.replace(/_/g, " ")}`}
                    </p>
                  </div>
                </div>
                {!finalising && !confirmationFailed && !confirmationWaiting ? <p className="mt-4 rounded-[var(--brand-control-radius,var(--md-radius-lg))] bg-[var(--brand-tint,var(--md-surface-tint))] p-3.5 text-[11.5px] leading-5 text-[var(--brand-text,var(--md-text))]">A confirmation is on its way to <span className="font-medium text-[var(--brand-ink,var(--md-ink))]">{details.email}</span>, with a private link to reschedule or cancel.</p> : null}
                {error ? <p role="alert" className="mt-4 text-[11.5px] leading-5 text-[var(--brand-danger,var(--md-red))]">{error}</p> : null}
                {!finalising ? <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  {!confirmationFailed && !confirmationWaiting ? <Button variant="ghost" size="lg" className={quietButtonClass} onClick={() => downloadMeetingCalendarFile(meeting)}><CalendarDays className="size-4" strokeWidth={1.5} />Add to calendar</Button> : null}
                  {confirmationWaiting ? <Button variant="ghost" size="lg" className={quietButtonClass} disabled={submitting} onClick={() => void checkFinalisation()}><RefreshCw className="size-4" strokeWidth={1.5} />{submitting ? "Checking…" : "Check status"}</Button> : null}
                  {managePath ? <Button size="lg" asChild className={cn("ms-auto", primaryButtonClass)}><a href={managePath}>{confirmationFailed || confirmationWaiting ? "View details" : "Manage booking"}</a></Button> : null}
                </div> : null}
              </div> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
      <footer className="mt-4 text-center text-[10.5px] text-[var(--brand-subtle,var(--md-subtle))]">{brand ? `${brand.displayName} · Scheduling powered by Multideck` : "Multideck · Built-in scheduling for freight teams"}</footer>
    </div>
  </main>
}

function QuestionField({ question, value, error, onChange }: { question: BookingQuestion; value: string; error?: string; onChange: (value: string) => void }) {
  const errorId = `booking-${question.id}-error`
  const long = question.type === "long_text"
  return <label className={cn("grid gap-1.5 text-[11.5px] font-medium", long && "sm:col-span-2")}>
    <span>{question.label}{!question.required ? <span className="ms-1.5 font-normal text-[var(--brand-subtle,var(--md-subtle))]">Optional</span> : null}</span>
    {long
      ? <Textarea value={value} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} className={cn(fieldClass, "h-auto min-h-20 py-2")} />
      : <Input autoComplete={question.id === "company" ? "organization" : question.id === "phone" ? "tel" : "off"} inputMode={question.id === "phone" ? "tel" : undefined} value={value} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} className={fieldClass} />}
    <FieldError id={errorId}>{error}</FieldError>
  </label>
}
