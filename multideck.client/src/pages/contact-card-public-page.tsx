import { useEffect, useMemo, useRef, useState } from "react"
import { TriangleAlert } from "@/components/icons/hugeicons"
import {
  EMPTY_PUBLIC_FORM,
  PublicCardExchange,
  PublicCardFooter,
  PublicCardForm,
  PublicCardPhases,
  PublicCardShell,
  type PublicFormErrors,
  type PublicFormValues,
} from "@/components/multideck/contact-card-public-view"
import { useLanguage } from "@/i18n/language-provider"
import {
  buildVCard,
  downloadFile,
  loadPublicCard,
  recordFormStarted,
  recordScan,
  submitExchange,
} from "@/lib/contact-card-store"
import type { ContactCard } from "@/data/contact-card-data"
import { browserCardVisit, createCardVisit } from "@/lib/contact-card-visit"
import { contactCardSubmissionError } from "@/lib/contact-card-errors"

type LoadState = "loading" | "ready" | "missing" | "error"

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function LoadingSkeleton() {
  return (
    <div className="animate-pulse pt-2" aria-hidden="true">
      <div className="size-13 rounded-full bg-[var(--card-surface-muted)]" />
      <div className="mt-5 h-7 w-3/4 rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)]" />
      <div className="mt-3 h-5 w-full rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)]" />
      <div className="mt-8 space-y-[18px]">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="h-4 w-24 rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)]" />
            <div className="mt-1.5 h-[52px] w-full rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)]" />
          </div>
        ))}
      </div>
      <div className="mt-7 h-[54px] w-full rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)]" />
    </div>
  )
}

function PublicNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="pt-6 text-start">
      <span className="grid size-10 place-items-center rounded-[var(--card-radius-field)] bg-[var(--card-surface-muted)] text-[var(--card-subtle)]">
        <TriangleAlert className="size-5" strokeWidth={1.4} />
      </span>
      <h1 className="mt-4 text-[23px] font-medium leading-[1.2] text-[var(--card-ink)]" style={{ textWrap: "balance" }}>
        {title}
      </h1>
      <p className="mt-2.5 text-[15px] leading-[1.55] text-[var(--card-text)]" style={{ textWrap: "pretty" }}>
        {body}
      </p>
    </div>
  )
}

export function ContactCardPublicPage({ slug }: { slug: string }) {
  const preview = new URLSearchParams(window.location.search).get("preview") === "1"
  return <ContactCardPublicJourney key={`${slug}:${preview}`} slug={slug} preview={preview} />
}

function ContactCardPublicJourney({ slug, preview }: { slug: string; preview: boolean }) {
  const { t } = useLanguage()
  const [visit] = useState(() => preview ? createCardVisit(slug, null) : browserCardVisit(slug))
  const requestVisitRef = useRef(visit)

  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [card, setCard] = useState<ContactCard | null>(null)
  const [phase, setPhase] = useState<"form" | "done">("form")
  const [values, setValues] = useState<PublicFormValues>(EMPTY_PUBLIC_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [validationAttempt, setValidationAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const pendingInputRef = useRef<PublicFormValues | null>(null)
  const [slow, setSlow] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  const scanIdRef = useRef<string | null>(null)
  const scanPromiseRef = useRef<Promise<string | null> | null>(null)
  const startedRef = useRef(false)
  const submittingRef = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let cancelled = false

    loadPublicCard(slug, preview)
      .then((found) => {
        if (cancelled) return
        if (!found) {
          setLoadState("missing")
          return
        }
        setCard(found)
        setLoadState("ready")
        const scanPromise = recordScan(found.id, preview || found.status !== "published", visit).catch(() => null)
        scanPromiseRef.current = scanPromise
        void scanPromise.then((scanId) => {
          if (!cancelled) scanIdRef.current = scanId
        })
      })
      .catch(() => {
        if (!cancelled) setLoadState("error")
      })

    return () => {
      cancelled = true
    }
  }, [preview, slug, visit])

  const errors = useMemo<PublicFormErrors>(() => {
    if (!submitted || !card) return {}

    const next: PublicFormErrors = {}
    if (!values.firstName.trim()) next.firstName = t("Add your first name.")
    if (!values.lastName.trim()) next.lastName = t("Add your last name.")
    if (!values.email.trim()) next.email = t("Add your email address.")
    else if (!EMAIL_SHAPE.test(values.email.trim())) next.email = t("Enter an email address in the format name@example.com.")
    if (!values.company.trim()) next.company = t("Add your company.")
    if (card.phoneField === "required" && !values.phone.trim()) next.phone = t("Add your phone number.")
    return next
  }, [card, submitted, t, values])

  useEffect(() => {
    if (validationAttempt > 0) formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus()
  }, [validationAttempt])

  function change<K extends keyof PublicFormValues>(key: K, value: PublicFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (!startedRef.current && card) {
      startedRef.current = true
      void Promise.resolve(scanIdRef.current ?? scanPromiseRef.current)
        .then((scanId) => recordFormStarted(card.id, scanId))
        .then((recorded) => { startedRef.current = recorded })
    }
  }

  function isInvalid(current: PublicFormValues, target: ContactCard) {
    return (
      !current.firstName.trim() ||
      !current.lastName.trim() ||
      !EMAIL_SHAPE.test(current.email.trim()) ||
      !current.company.trim() ||
      (target.phoneField === "required" && !current.phone.trim())
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!card || submittingRef.current) return

    setSubmitted(true)
    setSubmitError(null)

    if (isInvalid(values, card)) {
      // Send focus to the first problem rather than scrolling independently of it.
      setValidationAttempt((attempt) => attempt + 1)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    const slowTimer = window.setTimeout(() => setSlow(true), 5000)
    let submissionAttempted = false

    try {
      let scanId = scanIdRef.current ?? await scanPromiseRef.current
      // A failed initial telemetry request must not strand a completed form.
      // Once obtained, retain this scan for every retry of the submission.
      if (!scanId && !preview) scanId = await recordScan(card.id, false, requestVisitRef.current)
      scanIdRef.current = scanId
      pendingInputRef.current ??= { ...values }
      submissionAttempted = true
      await submitExchange(card.id, scanId, pendingInputRef.current, preview || card.status !== "published")
      // Only now does the exchange exist. Nothing is promised before this point.
      setPhase("done")
    } catch (error) {
      const failure = contactCardSubmissionError(error, submissionAttempted)
      setSubmitError(t(failure.message))
      setPendingConfirmation(failure.pending)
      if (!failure.pending) pendingInputRef.current = null
      if (failure.renew) {
        scanIdRef.current = null
        scanPromiseRef.current = null
        requestVisitRef.current = { ...visit, requestId: crypto.randomUUID() }
      }
    } finally {
      submittingRef.current = false
      window.clearTimeout(slowTimer)
      setSlow(false)
      setSubmitting(false)
    }
  }

  function addToContacts() {
    if (!card) return
    downloadFile(`${card.slug}.vcf`, buildVCard(card), "text/vcard")
    setDownloaded(true)
  }

  if (loadState === "loading") {
    return (
      <div className="min-h-dvh">
        <PublicCardShell className="min-h-dvh" card={null} preview={preview}>
          <LoadingSkeleton />
        </PublicCardShell>
      </div>
    )
  }

  if (loadState === "error") {
    return (
      <div className="min-h-dvh">
        <PublicCardShell className="min-h-dvh" card={null} preview={preview}>
          <PublicNotice title={t("This didn't load")} body={t("Check your connection and reload the page.")} />
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-[var(--card-radius-field)] bg-[var(--card-action-bg)] px-5 py-3 text-[var(--card-action-ink)] transition-transform duration-150 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100">{t("Try again")}</button>
        </PublicCardShell>
      </div>
    )
  }

  if (loadState === "missing" || !card) {
    return (
      <div className="min-h-dvh">
        <PublicCardShell className="min-h-dvh" card={null} preview={preview}>
          <PublicNotice title={t("This code isn't active")} body={t("It may have expired or been replaced. Ask for a new one.")} />
        </PublicCardShell>
      </div>
    )
  }

  if (card.status !== "published" && !preview) {
    return (
      <div className="min-h-dvh">
        <PublicCardShell className="min-h-dvh" card={card} preview={preview}>
          <PublicNotice title={t("This code isn't active")} body={t("The card is not being shared at the moment. Ask for a new one.")} />
        </PublicCardShell>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <PublicCardShell className="min-h-dvh" card={card} preview={preview}>
        <PublicCardPhases
          phase={phase}
          form={
            <PublicCardForm
              card={card}
              values={values}
              errors={errors}
              submitting={submitting}
              pendingConfirmation={pendingConfirmation}
              slow={slow}
              submitError={submitError}
              onChange={change}
              onSubmit={handleSubmit}
              formRef={formRef}
            />
          }
          exchange={
            <PublicCardExchange card={card} headingRef={headingRef} onAddToContacts={addToContacts} downloaded={downloaded} />
          }
        />
        <PublicCardFooter card={card} />
      </PublicCardShell>
    </div>
  )
}
