import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getBookingOperationalCharges, getBookingWorkflow, saveBookingOperationalCharges, getBookingQuoteChargeReview, applyBookingQuoteChargeReview, type BookingWorkflowWorkspace } from "@/lib/booking-workflow-api"
import { operationalChargeSavePayload, operationalEditorRows, type OperationalChargeWorkspace, type BookingQuoteChargeReview, type QuoteChargeDecision } from "@/lib/booking-operational-charges"
import { UnifiedQuoteChargesWorkspace, type UnifiedQuoteChargeRow } from "./unified-quote-charges-workspace"
import { DotGridLoader } from "./dot-grid-loader"

/** Booking composition around the existing Quote editor, not a second table UI. */
export function BookingOperationalChargesWorkspace({ jobId, reference, blocked, onPendingChange, onSaved, fallback }: {
  jobId: string; reference: string; blocked: boolean; onPendingChange: (pending: boolean) => void
  onSaved: (workspace: BookingWorkflowWorkspace) => Promise<void>; fallback: React.ReactNode
}) {
  const { t } = useLanguage()
  const [workspace, setWorkspace] = useState<OperationalChargeWorkspace | null>(null)
  const [rows, setRows] = useState<UnifiedQuoteChargeRow[]>([])
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("")
  const [dialog, setDialog] = useState<"save" | "reload" | null>(null), [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState(false)
  const [quoteReview, setQuoteReview] = useState<BookingQuoteChargeReview | null>(null)
  const [decisions, setDecisions] = useState<Record<string, QuoteChargeDecision>>({})
  const [reviewReason, setReviewReason] = useState("")
  const quoteTrigger = useRef<HTMLButtonElement>(null), reviewReasonRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLInputElement>(null), saveTrigger = useRef<HTMLButtonElement>(null), reloadTrigger = useRef<HTMLButtonElement>(null)
  const dialogTrigger = useRef<"save" | "reload">("save")
  const busy = useRef(false), generation = useRef(0)
  const translate = useRef(t)
  translate.current = t

  useEffect(() => {
    const current = generation.current
    void getBookingOperationalCharges(jobId).then(result => {
      if (current !== generation.current) return
      setWorkspace(result); setRows(operationalEditorRows(result))
    }).catch(cause => { if (current === generation.current) setError(cause instanceof Error ? cause.message : translate.current("Charges could not be loaded.")) })
      .finally(() => { if (current === generation.current) setLoading(false) })
    return () => { generation.current += 1; onPendingChange(false) }
  }, [jobId, onPendingChange])

  async function reload() {
    if (busy.current) return
    busy.current = true; setLoading(true); setError(null); setDialog(null)
    const current = generation.current
    try {
      const result = await getBookingOperationalCharges(jobId)
      await onSaved(await getBookingWorkflow(reference))
      if (current !== generation.current) return
      setWorkspace(result); setRows(operationalEditorRows(result)); setDirty(false); setNeedsRefresh(false); setNotice(""); onPendingChange(false)
    } catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : t("Charges could not be loaded. Your entries are retained.")) }
    finally { if (current === generation.current) { busy.current = false; setLoading(false) } }
  }

  async function save() {
    if (busy.current || blocked || !workspace?.supported || !workspace.editable) return
    if (!needsRefresh && !reason.trim()) { setReasonError(true); reasonRef.current?.focus(); return }
    busy.current = true; setSaving(true); setError(null); setNotice(""); onPendingChange(true)
    const current = generation.current
    let committed = needsRefresh
    try {
      if (!committed) {
        const result = await saveBookingOperationalCharges(operationalChargeSavePayload(workspace, rows, reason))
        if (current !== generation.current) return
        setWorkspace(result); setRows(operationalEditorRows(result)); setDirty(false); setNeedsRefresh(true); setDialog(null); setReason(""); committed = true
      }
      await onSaved(await getBookingWorkflow(reference))
      if (current !== generation.current) return
      setNeedsRefresh(false); onPendingChange(false); setNotice(t("Booking charges saved."))
    } catch (cause) {
      if (current === generation.current) setError(committed ? t("Charges were saved, but the Booking could not refresh. Retry refresh; do not save again.") : cause instanceof Error ? cause.message : t("Charges could not be saved. Your entries are retained."))
    } finally { if (current === generation.current) { busy.current = false; setSaving(false) } }
  }

  async function reviewQuote() {
    if (busy.current || dirty || needsRefresh || blocked) return
    busy.current = true; setLoading(true); setError(null)
    const current = generation.current
    try {
      const result = await getBookingQuoteChargeReview(jobId)
      if (current !== generation.current) return
      setQuoteReview(result); setDecisions({}); setReviewReason("")
      if (result) onPendingChange(true)
      else setNotice(t("There are no pending Quote charge changes."))
    } catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : t("Quote charge changes could not be loaded.")) }
    finally { if (current === generation.current) { busy.current = false; setLoading(false) } }
  }

  async function applyReview() {
    if (busy.current || blocked || !quoteReview?.editable) return
    if (!reviewReason.trim()) { setError(t("Enter a reason for the charge decisions.")); reviewReasonRef.current?.focus(); return }
    busy.current = true; setSaving(true); setError(null)
    const current = generation.current
    let committed = false
    try {
      const result = await applyBookingQuoteChargeReview(jobId, quoteReview.reviewId, quoteReview.token,
        quoteReview.items.map(item => ({ key: item.key, action: decisions[item.key] ?? "keep" })), reviewReason)
      if (current !== generation.current) return
      committed = true; setWorkspace(result); setRows(operationalEditorRows(result)); setQuoteReview(null); setNeedsRefresh(true)
      await onSaved(await getBookingWorkflow(reference))
      if (current !== generation.current) return
      setNeedsRefresh(false); onPendingChange(false); setNotice(t("Quote charge decisions saved. Unselected changes were kept out of the Booking."))
    } catch (cause) { if (current === generation.current) setError(committed ? t("Decisions were saved, but the Booking could not refresh. Retry refresh; do not apply again.")
      : cause instanceof Error ? cause.message : t("Quote charge decisions could not be applied.")) }
    finally { if (current === generation.current) { busy.current = false; setSaving(false) } }
  }

  if (workspace?.supported === false) return <>{fallback}</>
  const available = workspace?.supported ? workspace : null
  const readOnly = blocked || loading || saving || needsRefresh || !available?.editable
  const removedCount = available?.lines.filter(line => line.values && !rows.some(row => row.id === line.id)).length ?? 0
  return <section className="grid min-w-0 gap-3" aria-label={t("Booking charges")} aria-busy={loading || saving}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[14px] font-medium">{t("Booking charges")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button ref={quoteTrigger} variant="outline" size="sm" disabled={blocked || loading || saving || dirty || needsRefresh} onClick={() => void reviewQuote()}>{t("Review Quote charges")}</Button>
        <Button ref={reloadTrigger} variant="outline" size="sm" disabled={loading || saving || needsRefresh} onClick={() => { dialogTrigger.current = "reload"; dirty ? setDialog("reload") : void reload() }}>{t("Reload charges")}</Button>
        {available?.editable ? <Button ref={saveTrigger} size="sm" disabled={blocked || loading || saving || (!dirty && !needsRefresh)} onClick={() => { dialogTrigger.current = "save"; needsRefresh ? void save() : setDialog("save") }}>
          {saving ? <DotGridLoader size="sm" decorative /> : null}{t(needsRefresh ? "Retry refresh" : "Save charges")}
        </Button> : null}
      </div>
    </div>
    <p role="status" className="text-[12px] text-[var(--md-text)]">{notice || (dirty ? t("Unsaved Booking charges") : "")}</p>
    {error ? <p role="alert" className="text-[13px] text-[var(--md-status-red-ink)]">{error}</p> : null}
    {available?.blockedReason ? <p className="text-[12px] text-[var(--md-text)]">{t(available.blockedReason)}</p> : null}
    {loading && !available ? <DotGridLoader label="Loading Booking charges" /> : null}
    {available?.baseCurrency ? <UnifiedQuoteChargesWorkspace rows={rows} readOnly={readOnly}
      rowReadOnlyReason={id => available.lines.find(line => line.id === id)?.blockedReason ?? undefined}
      onRowsChange={next => { if (readOnly) return; setRows(next); setDirty(true); setNotice(""); onPendingChange(true) }}
      currencies={available.currencies} parties={available.parties} exchangeRates={[]} baseCurrency={available.baseCurrency}
      storageKey={`booking-${jobId}-operational-charges`}
      createRow={() => ({ id: crypto.randomUUID(), code: "", description: "", cost: 0, sell: 0, costCurrency: available.baseCurrency!, sellCurrency: available.baseCurrency!,
        costRoe: 1, sellRoe: 1, costRoeSource: "manual", sellRoeSource: "manual", quantity: 1, calculationBasis: "fixed", supplierId: null,
        customerId: null })} /> : null}
    {available?.lines.filter(line => !line.values).map(line => <div key={line.id} className="grid gap-1 py-2 text-[12px]">
      <span>{String(line.snapshot.JobCostingLine_Description ?? t("Historical charge"))}</span>
      <span className="text-[var(--md-text)]">{t(line.blockedReason ?? "Historical charge values require review.")}</span>
    </div>)}
    <Dialog open={dialog !== null} onOpenChange={open => { if (!saving && !open) setDialog(null) }}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); (dialogTrigger.current === "save" ? saveTrigger : reloadTrigger).current?.focus() }}><DialogHeader><DialogTitle>{t(dialog === "reload" ? "Discard unsaved charge edits?" : "Save Booking charges?")}</DialogTitle>
        <DialogDescription>{t(dialog === "reload" ? "Reloading replaces your unsaved entries, not saved charges or their audit history."
          : removedCount ? "Removed lines leave the working charges. Their complete details remain in Audit and will not return automatically." : "Changes apply to this Booking only. The accepted Quote and its documents remain unchanged.")}</DialogDescription></DialogHeader>
        {dialog === "save" ? <label className="grid gap-2 text-[13px]">{t("Reason for changes (required)")}<Input ref={reasonRef} value={reason} maxLength={2000} disabled={saving}
          aria-invalid={reasonError} aria-describedby={reasonError ? "booking-charge-reason-error" : undefined}
          onChange={event => { setReason(event.target.value); setReasonError(false) }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save() } }} />
          {reasonError ? <span id="booking-charge-reason-error">{t("Enter a reason for these changes.")}</span> : null}</label> : null}
        {dialog === "save" && error ? <p role="alert" className="text-[13px] text-[var(--md-status-red-ink)]">{error}</p> : null}
        <DialogFooter><Button variant="ghost" disabled={saving} onClick={() => setDialog(null)}>{t("Keep editing")}</Button>
          <Button disabled={saving || (dialog === "save" && blocked)} onClick={() => dialog === "reload" ? void reload() : void save()}>{saving ? <DotGridLoader size="sm" decorative /> : null}{t(dialog === "reload" ? "Discard edits and reload" : "Save charges")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={quoteReview !== null} onOpenChange={open => { if (!saving && !open) { setQuoteReview(null); onPendingChange(false) } }}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={event => { event.preventDefault(); quoteTrigger.current?.focus() }}>
        <DialogHeader><DialogTitle>{t("Review Quote charge changes")}</DialogTitle><DialogDescription>{t("Keep is selected by default. Booking-added lines stay separate. Removed lines return only if you explicitly choose Restore.")}</DialogDescription></DialogHeader>
        {quoteReview?.blockedReason ? <p className="text-[13px]">{t(quoteReview.blockedReason)}</p> : null}
        <div className="grid gap-3">{quoteReview?.items.map(item => <div key={item.key} className="grid gap-2 py-2 shadow-[var(--md-stroke-bottom)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{String(item.before?.description ?? item.proposed?.description ?? t("Charge line"))}</span>
            <Select value={decisions[item.key] ?? "keep"} disabled={saving || !quoteReview.editable || Boolean(item.blockedReason) || item.kind === "preserve"}
              onValueChange={value => setDecisions(current => ({ ...current, [item.key]: value as QuoteChargeDecision }))}>
              <SelectTrigger className="w-44" aria-label={`${t("Decision for")} ${String(item.before?.description ?? item.proposed?.description ?? t("charge"))}`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="keep">{t("Keep current")}</SelectItem>{item.kind !== "preserve" && item.kind !== "keep" ? <SelectItem value={item.kind}>{t(({ add: "Add Quote line", replace: "Use Quote values", remove: "Remove line", restore: "Restore removed line" } as const)[item.kind])}</SelectItem> : null}</SelectContent>
            </Select>
          </div>
          {item.blockedReason ? <p className="text-[12px] text-[var(--md-text)]">{t(item.blockedReason)}</p> : null}
          <details className="text-[12px]"><summary className="cursor-pointer">{t("Compare line details")}</summary>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
              <span>{t("Field")}</span><span>{t("Current Booking")}</span><span>{t("Accepted Quote")}</span>
              {Object.entries({ code: "Code", description: "Description", cost: "Cost", costCurrency: "Cost currency", costRoe: "Cost exchange rate", sell: "Sell", sellCurrency: "Sell currency", sellRoe: "Sell exchange rate", quantity: "Quantity", calculationBasis: "Calculation basis", supplierId: "Supplier", customerId: "Customer", internalNotes: "Internal notes", customerNotes: "Customer notes", showToCustomer: "Show to customer" }).map(([key, label]) => {
                const before = { ...item.before, ...item.beforeNotes }[key], after = { ...item.proposed, ...item.proposedNotes }[key]
                const display = (value: unknown) => value == null || value === "" ? t("Not recorded") : key.endsWith("Id") ? available?.parties.find(party => party.id === value)?.name ?? String(value) : typeof value === "boolean" ? t(value ? "Yes" : "No") : String(value)
                return <div key={key} className="contents"><span>{t(label)}</span><span className="break-words">{display(before)}</span><span className="break-words">{display(after)}</span></div>
              })}
            </div>
          </details>
        </div>)}</div>
        <label className="grid gap-2 text-[13px]">{t("Reason for decisions (required)")}<Input ref={reviewReasonRef} value={reviewReason} disabled={saving} maxLength={2000} onChange={event => setReviewReason(event.target.value)} /></label>
        {error ? <p role="alert" className="text-[13px] text-[var(--md-status-red-ink)]">{error}</p> : null}
        <DialogFooter><Button variant="ghost" disabled={saving} onClick={() => { setQuoteReview(null); onPendingChange(false) }}>{t("Cancel")}</Button>
          <Button disabled={saving || blocked || !quoteReview?.editable} onClick={() => void applyReview()}>{saving ? <DotGridLoader size="sm" decorative /> : null}{t("Apply charge decisions")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
