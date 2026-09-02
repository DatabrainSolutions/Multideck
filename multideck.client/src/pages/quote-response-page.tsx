import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Download, FileText, LoaderCircle, MessageSquareText, Shield, Trash2, XCircle, type LucideIcon } from "@/components/icons/hugeicons"
import { errorStateAnimationData } from "@/assets/error-state-animation"
import { BrandLockup } from "@/components/multideck/auth-flow"
import { ImageLightbox } from "@/components/multideck/image-lightbox"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { releasePdfPageImages, renderPdfPageImages, type RenderedPdfPage } from "@/lib/customs-invoice-pdf-preview"
import { getCustomerQuote, submitCustomerQuoteResponse, uploadCompetitorQuote, type QuoteResponseDecision, type QuoteResponseResult, type QuoteResponseView } from "@/lib/quote-response-api"
import { formatQuoteLossReason, quoteLossReasons } from "@/lib/quote-loss-reasons"
import { publicBrandTheme, type PublicBranding } from "@/lib/public-brand-theme"
import { cn } from "@/lib/utils"

type ResponseTone = "green" | "amber" | "red"

const responseChoices: Array<{ id: QuoteResponseDecision; label: string; description: string; tone: ResponseTone; icon: LucideIcon }> = [
  { id: "accepted", label: "Accept quote", description: "Confirm the quote and begin the booking.", tone: "green", icon: CheckCircle2 },
  { id: "challenged", label: "Ask for changes", description: "Tell the freight team what should be reviewed.", tone: "amber", icon: MessageSquareText },
  { id: "declined", label: "Decline quote", description: "Close the quote and share the reason.", tone: "red", icon: XCircle },
]

const toneClasses: Record<ResponseTone, string> = {
  green: "bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)]",
  amber: "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]",
  red: "bg-[var(--md-status-red-bg)] text-[var(--md-status-red-ink)]",
}

function formatDate(value: string | null | undefined, locale?: string) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

function quoteResponseSummary(view: Extract<QuoteResponseView, { state: "active" }>, locale?: string) {
  const quote = view.quote.snapshot.quote ?? {}
  const totals = new Map<string, number>()
  for (const charge of quote.charges ?? []) {
    if (charge.showToCustomer === false) continue
    const currency = String(charge.sellCurrency || quote.currency || "GBP").toUpperCase()
    const amount = Number(charge.sellAmount ?? charge.sellLocal ?? 0)
    if (Number.isFinite(amount)) totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }
  const price = Array.from(totals.entries()).map(([currency, amount]) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
    } catch {
      return `${currency} ${amount.toFixed(2)}`
    }
  }).join(" · ") || "—"
  return {
    route: [quote.loadingPoint, quote.dischargePoint].filter(Boolean).join(" → ") || "—",
    price,
    validUntil: formatDate(quote.validTo, locale),
  }
}

export function QuoteResponsePage({ token }: { token: string }) {
  const { language, t, direction } = useLanguage()
  const reducedMotion = Boolean(useReducedMotion())
  const [view, setView] = useState<QuoteResponseView | null>(null)
  const [decision, setDecision] = useState<QuoteResponseDecision | null>(null)
  const [message, setMessage] = useState("")
  const [competitorQuote, setCompetitorQuote] = useState<File | null>(null)
  const [competitorPreviewUrl, setCompetitorPreviewUrl] = useState("")
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null)
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false)
  const [lossReason, setLossReason] = useState("")
  const [lossDetails, setLossDetails] = useState("")
  const [result, setResult] = useState<QuoteResponseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [validationAttempted, setValidationAttempted] = useState(false)
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    void getCustomerQuote(token).then((next) => { if (active) setView(next) }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "This quote could not be loaded.")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!competitorQuote?.type.startsWith("image/")) {
      setCompetitorPreviewUrl("")
      return
    }
    const previewUrl = URL.createObjectURL(competitorQuote)
    setCompetitorPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [competitorQuote])

  const activeView = view?.state === "active" ? view : null
  const messageRequired = decision === "challenged"
  function chooseDecision(next: QuoteResponseDecision) {
    if (decision !== next) {
      setMessage("")
      setCompetitorQuote(null)
      setUploadedDocumentId(null)
    }
    setDecision(next)
    setError("")
    setValidationAttempted(false)
    if (next === "declined") {
      setLossReason("")
      setLossDetails("")
      setDeclineDialogOpen(true)
    }
  }

  async function submitResponse(nextDecision = decision, nextMessage = message) {
    if (!nextDecision || submitting) return
    if (nextDecision === "challenged" && !nextMessage.trim()) {
      setValidationAttempted(true)
      setError("Tell the freight team what needs to change.")
      window.requestAnimationFrame(() => messageInputRef.current?.focus())
      return
    }
    setSubmitting(true)
    setError("")
    try {
      let documentId = uploadedDocumentId
      if (nextDecision === "challenged" && competitorQuote && !documentId) {
        const upload = await uploadCompetitorQuote(token, competitorQuote)
        documentId = upload.documentId
        setUploadedDocumentId(documentId)
      }
      setResult(await submitCustomerQuoteResponse(token, nextDecision, nextMessage, documentId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your response could not be submitted.")
    } finally { setSubmitting(false) }
  }

  if (loading) return <QuoteResponseFrame><div role="status" className="grid min-h-[420px] place-items-center text-center"><div><LoaderCircle className="mx-auto size-6 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" /><p className="mt-3 text-[14px] text-[var(--md-text)]">{t("Loading your secure quote…")}</p></div></div></QuoteResponseFrame>

  if (result || view?.state === "responded") {
    const answered = result?.decision ?? (view?.state === "responded" ? view.decision : undefined)
    const tone = answered === "accepted" ? "green" : answered === "challenged" ? "amber" : "red"
    const OutcomeIcon = answered === "accepted" ? CheckCircle2 : answered === "challenged" ? MessageSquareText : XCircle
    return <QuoteResponseFrame brand={view?.branding}><main className="mx-auto grid min-h-[520px] max-w-[620px] place-items-center px-5 py-12 text-center"><div role="status"><span className={cn("mx-auto grid size-12 place-items-center rounded-[var(--md-radius-lg)]", toneClasses[tone])}><OutcomeIcon className="size-6" aria-hidden="true" /></span><h1 className="mt-5 text-balance text-[26px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">{t(answered === "accepted" ? "Quote accepted" : answered === "challenged" ? "Review requested" : "Quote declined")}</h1><p className="mx-auto mt-3 max-w-[54ch] text-pretty text-[15px] leading-6 text-[var(--md-text)]">{t(answered === "accepted" ? "Thank you. The freight team has received your acceptance and the booking has been created." : answered === "challenged" ? "Thank you. The freight team will review your message and come back to you." : "Thank you. The freight team has received your response.")}</p>{result?.booking?.bookingReference ? <p className="mt-4 text-[13px] font-medium text-[var(--md-accent)]">{t("Booking reference")}: <span dir="ltr">{result.booking.bookingReference}</span></p> : null}<p className="mt-8 text-[12px] text-[var(--md-subtle)]">{t("You can close this page safely.")}</p></div></main></QuoteResponseFrame>
  }

  if (error && !activeView) return <QuoteResponseUnavailable message={error} brand={view?.branding} />
  if (view?.state === "expired" || view?.state === "revoked") return <QuoteResponseUnavailable brand={view.branding} message={view.state === "expired" ? "This secure quote link has expired. Please ask your freight contact for a new link." : "This quote link has been replaced. Please use the latest email from your freight team."} />
  if (!activeView) return <QuoteResponseUnavailable message="This quote is no longer available." brand={view?.branding} />

  const selectedChoice = responseChoices.find((choice) => choice.id === decision) ?? null
  const summary = quoteResponseSummary(activeView, language)
  const SelectedChoiceIcon = selectedChoice?.icon ?? MessageSquareText
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }
  return <QuoteResponseFrame brand={activeView.branding}>
    <main dir={direction} className="mx-auto grid w-full max-w-[1380px] gap-4 px-3 py-4 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5">
      <div className="order-2 min-w-0 lg:order-1"><QuotePdfPreview document={activeView.document} reference={activeView.quote.reference} version={activeView.quote.versionNumber} /></div>
      <aside className="order-1 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)] sm:p-5 lg:order-2 lg:sticky lg:top-[78px]">
        <div className="flex items-center gap-2 text-[var(--md-accent)]"><Shield className="size-4" /><span className="text-[12px] font-medium">{t("Secure response")}</span></div>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
          {[["Quote", activeView.quote.reference], ["Total", summary.price], ["Route", summary.route], ["Valid until", summary.validUntil]].map(([label, value], index) => <div key={label} className={cn("min-w-0 px-2.5 py-2", index < 2 && "border-b border-[var(--md-line)]", index % 2 === 0 && "border-e border-[var(--md-line)]")}><dt className="text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</dt><dd className="mt-0.5 truncate text-[11.5px] font-medium tabular-nums text-[var(--md-ink)]" title={value} data-i18n-skip dir={label === "Route" ? "auto" : "ltr"}>{value}</dd></div>)}
        </dl>
        <h2 id="quote-response-choice-heading" className="mt-3 text-balance text-[20px] font-medium tracking-[-0.025em] text-[var(--md-ink)]">{t("How would you like to respond?")}</h2>
        <p className="mt-2 text-pretty text-[13px] leading-5 text-[var(--md-text)]">{t("Nothing is recorded until you confirm your choice.")}</p>
        <div role="group" aria-labelledby="quote-response-choice-heading" className="mt-4 grid gap-2">{responseChoices.map((choice) => {
          const Icon = choice.icon
          const selected = decision === choice.id
          return <button key={choice.id} type="button" aria-pressed={selected} onClick={() => chooseDecision(choice.id)} className={cn("group flex min-h-[68px] items-start gap-3 rounded-[var(--md-radius-xl)] px-3.5 py-3 text-start outline-none shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,filter,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:brightness-[0.98] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a28)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100", selected ? cn(toneClasses[choice.tone], "shadow-[inset_0_0_0_2px_currentColor]") : choice.id === "accepted" ? toneClasses.green : choice.id === "declined" ? "bg-[var(--md-surface-tint)] text-[var(--md-status-red-ink)]" : "bg-[var(--md-surface-tint)] text-[var(--md-ink)]")}><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,currentColor_9%,transparent)]"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-[13px] font-medium">{t(choice.label)}</span><span className="mt-1 block text-pretty text-[11px] leading-4 opacity-75">{t(choice.description)}</span></span></button>
        })}</div>
        <AnimatePresence initial={false} mode="wait">{decision && decision !== "declined" && selectedChoice ? <motion.div key={decision} initial={reducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -3 }} transition={transition} className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">{t(decision === "accepted" ? "Message (optional)" : "What should we review?")}<Textarea ref={messageInputRef} value={message} onChange={(event) => { setMessage(event.target.value); if (event.target.value.trim()) { setValidationAttempted(false); setError("") } }} maxLength={4000} required={messageRequired} aria-invalid={validationAttempted && messageRequired && !message.trim()} aria-describedby={validationAttempted && messageRequired && !message.trim() ? "quote-response-message-error" : undefined} className="min-h-28 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface-tint)] text-base leading-5 shadow-[var(--md-shadow-line)] sm:text-[14px]" placeholder={t(decision === "challenged" ? "Tell the freight team what needs to change" : "Add a note for the freight team")} /></label>
          {decision === "challenged" ? (
            <div className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
              <span>{t("Supporting attachment (optional)")}</span>
              {competitorQuote?.type.startsWith("image/") && competitorPreviewUrl ? (
                <ImageLightbox items={[{
                  id: `quote-response-${competitorQuote.name}-${competitorQuote.lastModified}`,
                  src: competitorPreviewUrl,
                  alt: competitorQuote.name,
                }]}>
                  {({ open, layoutIdFor, registerTrigger }) => {
                    const imageId = `quote-response-${competitorQuote.name}-${competitorQuote.lastModified}`
                    return (
                      <div role="list" aria-label={t("Supporting images")}>
                        <div role="listitem" className="grid w-20 gap-1.5">
                          <motion.button
                            ref={(node) => registerTrigger(imageId, node)}
                            type="button"
                            layoutId={layoutIdFor(imageId)}
                            aria-label={t("Open image preview: {name}").replace("{name}", competitorQuote.name)}
                            onClick={() => open(imageId)}
                            className="size-20 overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a28)]"
                          >
                            <img src={competitorPreviewUrl} alt="" className="size-full rounded-[var(--md-radius-lg)] object-cover" />
                          </motion.button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            aria-label={t("Remove supporting image")}
                            onClick={() => { setCompetitorQuote(null); setUploadedDocumentId(null) }}
                            className="w-full rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  }}
                </ImageLightbox>
              ) : (
                <label className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                  <FileText className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{competitorQuote?.name || t("Attach PDF or image, up to 10 MB")}</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={t("Supporting attachment (optional)")} className="absolute inset-0 cursor-pointer opacity-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a28)]" onChange={(event) => { setCompetitorQuote(event.target.files?.[0] ?? null); setUploadedDocumentId(null) }} />
                </label>
              )}
            </div>
          ) : null}
          {error ? <p id="quote-response-message-error" role="alert" className="flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t(error)}</p> : null}
          <Button type="button" disabled={submitting} aria-busy={submitting} onClick={() => void submitResponse()} className={cn("h-11 w-full rounded-[var(--md-radius-lg)] text-[13px] font-medium shadow-none hover:brightness-[0.97]", toneClasses[selectedChoice.tone])}>{submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <SelectedChoiceIcon className="size-4" aria-hidden="true" />}{t(submitting ? "Submitting response…" : decision === "accepted" ? "Confirm acceptance" : decision === "challenged" ? "Send review request" : "Confirm decline")}</Button>
        </motion.div> : null}</AnimatePresence>
        <p className="mt-4 text-pretty text-[11px] leading-4 text-[var(--md-subtle)]">{activeView.expiresAt ? <>{t("This private link expires on")} {formatDate(activeView.expiresAt, language)}. {t("Please do not forward it.")}</> : t("This private link stays active until you respond. Please do not forward it.")}</p>
      </aside>
    </main>
    <Dialog open={declineDialogOpen} onOpenChange={(open) => {
      if (submitting) return
      setDeclineDialogOpen(open)
      if (!open) setDecision(null)
    }}>
      <DialogContent className="rounded-[var(--md-radius-2xl)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("Why are you declining this quote?")}</DialogTitle>
          <DialogDescription>{t("Choose the main reason and add any detail that will help the freight team.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {quoteLossReasons.map((reason) => <Button key={reason} type="button" variant="ghost" aria-pressed={lossReason === reason} className={cn("h-auto min-h-10 justify-start whitespace-normal rounded-[var(--md-radius-lg)] px-3 py-2 text-start text-[12px] shadow-[var(--md-shadow-line)]", lossReason === reason && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]")} onClick={() => setLossReason(reason)}>{t(reason)}</Button>)}
        </div>
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t(lossReason === "Other" ? "Reason" : "Additional detail (optional)")}</span><Textarea value={lossDetails} onChange={(event) => setLossDetails(event.target.value)} maxLength={4000} placeholder={t("Add useful context for the freight team")} className="min-h-24 rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] shadow-[var(--md-shadow-line)]" /></label>
        {error ? <p role="alert" className="flex items-start gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_9%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{t(error)}</p> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => { setDeclineDialogOpen(false); setDecision(null) }}>{t("Cancel")}</Button>
          <Button type="button" disabled={!lossReason || (lossReason === "Other" && !lossDetails.trim()) || submitting} className="bg-[var(--md-red)] text-white hover:bg-[var(--md-red-strong)]" onClick={() => void submitResponse("declined", formatQuoteLossReason(lossReason, lossDetails))}>{submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <XCircle className="size-4" />}{t(submitting ? "Submitting response…" : "Confirm decline")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </QuoteResponseFrame>
}

function QuotePdfPreview({ document, reference, version }: { document: Extract<QuoteResponseView, { state: "active" }>["document"]; reference: string; version: number }) {
  const { t } = useLanguage()
  const reducedMotion = Boolean(useReducedMotion())
  const [pages, setPages] = useState<RenderedPdfPage[]>([])
  const [blobUrl, setBlobUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    let received: RenderedPdfPage[] = []
    let objectUrl = ""
    setLoading(true); setError(""); setPages([])
    void fetch(document.url, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("The quote PDF could not be opened.")
      const blob = await response.blob()
      objectUrl = URL.createObjectURL(blob)
      setBlobUrl(objectUrl)
      await renderPdfPageImages(blob, { signal: controller.signal, onPage: (page) => { received = [...received, page]; setPages(received) } })
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The quote PDF could not be opened.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); releasePdfPageImages(received); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [document.url])
  return <section aria-labelledby="quote-document-title" className="min-w-0 overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
    <header className="flex min-h-[64px] items-center justify-between gap-3 px-4 shadow-[var(--md-stroke-bottom)] sm:px-5"><div className="min-w-0"><p id="quote-document-title" className="truncate text-[14px] font-medium text-[var(--md-ink)]"><span dir="ltr">{reference}</span></p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Quote PDF")} · {t("Version")} {version}</p></div><Button asChild variant="outline" size="sm" className="shrink-0 rounded-[var(--md-radius-lg)]"><a href={blobUrl || document.url} download={document.fileName}><Download className="size-4" />{t("Download PDF")}</a></Button></header>
    <div dir="ltr" className="md-scrollbar min-h-[560px] overflow-auto bg-[var(--md-pdf-stage)] p-3 sm:min-h-[720px] sm:p-5 lg:max-h-[calc(100vh-150px)]">{pages.length ? <div className="mx-auto grid max-w-[860px] gap-4">{pages.map((page) => <motion.img key={page.page} src={page.url} alt={`${t("Quote PDF page")} ${page.page}`} className="block h-auto w-full bg-white shadow-[0_16px_48px_rgba(11,20,19,0.16)]" initial={reducedMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />)}</div> : <div className="grid min-h-[520px] place-items-center px-5 text-center"><div className="max-w-[320px]">{loading ? <LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" /> : <FileText className="mx-auto size-6 text-[var(--md-subtle)]" />}<p role={error ? "alert" : "status"} className={cn("mt-3 text-[13px] leading-5", error ? "text-[var(--md-red)]" : "text-[var(--md-text)]")}>{t(error || "Preparing the quote PDF…")}</p>{error ? <a href={document.url} className="mt-3 inline-flex text-[12px] font-medium text-[var(--md-accent)] underline underline-offset-4">{t("Open the PDF directly")}</a> : null}</div></div>}</div>
  </section>
}

function QuoteResponseFrame({ children, brand }: { children: ReactNode; brand?: PublicBranding | null }) {
  const { t, direction } = useLanguage()
  const appearance = brand?.appearanceMode ?? "light"
  const style = {
    ...publicBrandTheme(brand),
    "--md-ink": "var(--brand-ink)",
    "--md-text": "var(--brand-text)",
    "--md-subtle": "var(--brand-subtle)",
    "--md-bg": "var(--brand-bg)",
    "--md-sidebar-bg": "var(--brand-surface)",
    "--md-surface": "var(--brand-surface)",
    "--md-surface-soft": "var(--brand-tint)",
    "--md-surface-tint": "var(--brand-tint)",
    "--md-hover": "var(--brand-hover)",
    "--md-line": "var(--brand-line)",
    "--md-hairline": "var(--brand-line)",
    "--md-accent": "var(--brand-accent)",
    "--md-accent-hover": "var(--brand-accent)",
    "--md-accent-a28": "var(--brand-a28)",
    "--md-green": "var(--brand-accent)",
    "--md-red": "var(--brand-danger)",
    "--md-pdf-stage": "color-mix(in srgb,var(--brand-ink) 6%,var(--brand-bg))",
    "--background": "var(--brand-bg)",
    "--foreground": "var(--brand-ink)",
    "--card": "var(--brand-surface)",
    "--popover": "var(--brand-surface)",
    "--primary": "var(--brand-accent)",
    "--primary-foreground": "var(--brand-accent-ink)",
    "--secondary": "var(--brand-tint)",
    "--muted": "var(--brand-tint)",
    "--muted-foreground": "var(--brand-text)",
    "--border": "var(--brand-line)",
    "--input": "var(--brand-line)",
    "--ring": "var(--brand-accent)",
  } as CSSProperties
  return <div dir={direction} data-customer-theme={appearance} className="quote-response-shell min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]" style={style}><header className="sticky top-0 z-30 flex min-h-[62px] items-center justify-between bg-[color-mix(in_srgb,var(--md-sidebar-bg)_90%,transparent)] px-4 shadow-[var(--md-stroke-bottom)] backdrop-blur-xl sm:px-6">{brand?.logoUrl ? <img src={brand.logoUrl} alt={brand.displayName} className="max-h-8 max-w-[220px] object-contain" /> : brand ? <span className="text-[17px] font-medium text-[var(--md-ink)]">{brand.displayName}</span> : <BrandLockup />}<span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Secure quote")}</span></header>{children}</div>
}

function QuoteResponseUnavailable({ message, brand }: { message: string; brand?: PublicBranding | null }) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  return <QuoteResponseFrame brand={brand}><main className="mx-auto grid min-h-[520px] max-w-[620px] place-items-center px-5 py-12 text-center"><div><span className="mx-auto block size-[168px] sm:size-[184px]" aria-hidden="true"><DotLottieReact data={errorStateAnimationData} autoplay={!reducedMotion} loop={!reducedMotion} className="size-full" /></span><h1 className="mt-2 text-balance text-[24px] font-medium tracking-[-0.03em] text-[var(--md-ink)]">{t("Quote link unavailable")}</h1><p role="alert" className="mx-auto mt-3 max-w-[54ch] text-pretty text-[15px] leading-6 text-[var(--md-text)]">{t(message)}</p></div></main></QuoteResponseFrame>
}
