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
  const { t } = useLanguage()
  const preview = useMemo(() => new URLSearchParams(window.location.search).get("preview") === "1", [])

  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [card, setCard] = useState<ContactCard | null>(null)
  const [phase, setPhase] = useState<"form" | "done">("form")
  const [values, setValues] = useState<PublicFormValues>(EMPTY_PUBLIC_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [slow, setSlow] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  const scanIdRef = useRef<string | null>(null)
  const scanPromiseRef = useRef<Promise<string | null> | null>(null)
  const startedRef = useRef(false)
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
        const scanPromise = recordScan(found.id, preview || found.status !== "published").catch(() => null)
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
  }, [preview, slug])

  useEffect(() => {
    if (phase !== "done") return
    // Tell screen-reader users the transaction completed, rather than leaving
    // them at the top of a page that silently changed underneath them.
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

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

  function change<K extends keyof PublicFormValues>(key: K, value: PublicFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (!startedRef.current && card) {
      startedRef.current = true
      const currentScanId = scanIdRef.current
      if (currentScanId) recordFormStarted(card.id, currentScanId)
      else void scanPromiseRef.current?.then((scanId) => recordFormStarted(card.id, scanId))
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
    if (!card || submitting) return

    setSubmitted(true)
    setSubmitError(null)

    if (isInvalid(values, card)) {
      // Send focus to the first problem rather than scrolling independently of it.
      window.requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus()
      })
      return
    }

    setSubmitting(true)
    const slowTimer = window.setTimeout(() => setSlow(true), 5000)

    try {
      const scanId = scanIdRef.current ?? await scanPromiseRef.current
      await submitExchange(card.id, scanId, values, preview || card.status !== "published")
      // Only now does the exchange exist. Nothing is promised before this point.
      setPhase("done")
    } catch {
      setSubmitError(t("Unable to send your details. Check your connection and try again."))
    } finally {
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
        <PublicCardShell card={null} preview={preview}>
          <LoadingSkeleton />
        </PublicCardShell>
      </div>
    )
  }

  if (loadState === "error") {
    return (
      <div className="min-h-dvh">
        <PublicCardShell card={null} preview={preview}>
          <PublicNotice title={t("This didn't load")} body={t("Check your connection and reload the page.")} />
        </PublicCardShell>
      </div>
    )
  }

  if (loadState === "missing" || !card) {
    return (
      <div className="min-h-dvh">
        <PublicCardShell card={null} preview={preview}>
          <PublicNotice title={t("This code isn't active")} body={t("It may have expired or been replaced. Ask for a new one.")} />
        </PublicCardShell>
      </div>
    )
  }

  if (card.status !== "published" && !preview) {
    return (
      <div className="min-h-dvh">
        <PublicCardShell card={card} preview={preview}>
          <PublicNotice title={t("This code isn't active")} body={t("The card is not being shared at the moment. Ask for a new one.")} />
        </PublicCardShell>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <PublicCardShell card={card} preview={preview}>
        <PublicCardPhases
          phase={phase}
          form={
            <PublicCardForm
              card={card}
              values={values}
              errors={errors}
              submitting={submitting}
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
        <PublicCardFooter />
      </PublicCardShell>
    </div>
  )
}
