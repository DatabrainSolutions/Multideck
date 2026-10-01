import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DotGridLoader } from "./dot-grid-loader"
import { UnifiedQuoteChargesWorkspace, type UnifiedQuoteChargeRow } from "./unified-quote-charges-workspace"
import { useLanguage } from "@/i18n/language-provider"
import { bookingPlanningEditorRows, bookingPlanningSavePayload, type BookingPlanningWorkspace } from "@/lib/booking-planning-charges"
import { getBookingPlanningCharges, getBookingWorkflow, saveBookingPlanningCharges, type BookingWorkflowWorkspace } from "@/lib/booking-workflow-api"

/** Booking-specific page composition; the reusable controls remain the Quote editor. */
export function BookingPlanningChargesWorkspace({ jobId, reference, blocked, onPendingChange, onSaved }: {
  jobId: string
  reference: string
  blocked: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: (workspace: BookingWorkflowWorkspace) => Promise<void>
}) {
  const { t } = useLanguage()
  const [workspace, setWorkspace] = useState<BookingPlanningWorkspace | null>(null)
  const [rows, setRows] = useState<UnifiedQuoteChargeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [confirmReload, setConfirmReload] = useState(false)
  const requestRef = useRef(false)
  const generationRef = useRef(0)
  const reloadTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    void getBookingPlanningCharges(jobId).then(result => {
      if (cancelled) return
      setWorkspace(result)
      setRows(result.supported && result.chargeSet ? bookingPlanningEditorRows(result.chargeSet) : [])
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Planning charges could not be loaded.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; generationRef.current += 1; onPendingChange(false) }
  }, [jobId, onPendingChange])

  async function refreshBooking() {
    await onSaved(await getBookingWorkflow(reference))
  }

  async function save() {
    if (requestRef.current || blocked || !workspace?.supported || !workspace.chargeSet || !workspace.editable) return
    requestRef.current = true
    const generation = generationRef.current
    setSaving(true); setError(null); setNotice(""); onPendingChange(true)
    let committed = needsRefresh
    try {
      if (!committed) {
        const result = await saveBookingPlanningCharges(bookingPlanningSavePayload(workspace.chargeSet, rows))
        if (generation !== generationRef.current) return
        setWorkspace(result)
        setRows(bookingPlanningEditorRows(result.chargeSet!))
        setDirty(false)
        setNeedsRefresh(true)
        committed = true
      }
      await refreshBooking()
      if (generation !== generationRef.current) return
      setNeedsRefresh(false); onPendingChange(false); setNotice(t("Planning charges saved."))
    } catch (reason) {
      if (generation !== generationRef.current) return
      setError(committed ? t("Charges were saved, but the Booking could not refresh. Retry refresh; do not save them again.")
        : reason instanceof Error ? reason.message : t("Planning charges could not be saved. Your entries are retained."))
      onPendingChange(true)
    } finally {
      if (generation === generationRef.current) { requestRef.current = false; setSaving(false) }
    }
  }

  async function reload() {
    if (requestRef.current) return
    requestRef.current = true
    const generation = generationRef.current
    setLoading(true); setError(null); setConfirmReload(false)
    try {
      const result = await getBookingPlanningCharges(jobId)
      await refreshBooking()
      if (generation !== generationRef.current) return
      setWorkspace(result); setRows(result.supported && result.chargeSet ? bookingPlanningEditorRows(result.chargeSet) : [])
      setDirty(false); setNeedsRefresh(false); setNotice(""); onPendingChange(false)
    } catch (reason) {
      if (generation === generationRef.current) setError(reason instanceof Error ? reason.message : t("Planning charges could not be loaded. Your entries are retained."))
    } finally {
      if (generation === generationRef.current) { requestRef.current = false; setLoading(false) }
    }
  }

  const set = workspace?.supported ? workspace.chargeSet : null
  const readOnly = blocked || loading || saving || needsRefresh || !workspace?.supported || !workspace.editable
  return <section className="grid min-w-0 gap-3" aria-label={t("Provisional planning charges")} aria-busy={loading || saving}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-[14px] font-medium">{t("Planning charges")}</h2>
        <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Excluded from financial figures while this Booking is Provisional.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button ref={reloadTriggerRef} variant="outline" size="sm" disabled={saving || loading || needsRefresh} onClick={() => dirty ? setConfirmReload(true) : void reload()}>{t("Reload charges")}</Button>
        {workspace?.supported && workspace.editable ? <Button size="sm" disabled={blocked || saving || loading} onClick={() => void save()}>
          {saving ? <DotGridLoader size="sm" decorative /> : null}{t(needsRefresh ? "Retry refresh" : "Save planning charges")}
        </Button> : null}
      </div>
    </div>
    <p role="status" className="text-[12px] text-[var(--md-text)]">{notice || (dirty ? t("Unsaved planning charges") : "")}</p>
    {error ? <p role="alert" className="text-[13px] text-[var(--md-status-red-ink)]">{error}</p> : null}
    {workspace?.supported && workspace.blockedReason ? <p className="text-[13px] text-[var(--md-text)]">{t(workspace.blockedReason)}</p> : null}
    {workspace?.supported === false ? <p className="text-[13px] text-[var(--md-text)]">{t("Planning charges are not enabled on this backend yet.")}</p> : null}
    {blocked ? <p className="text-[12px] text-[var(--md-text)]">{t("Wait for Booking changes to finish before editing charges.")}</p> : null}
    {loading && !workspace ? <DotGridLoader label="Loading planning charges" /> : null}
    {workspace?.supported && set ? <UnifiedQuoteChargesWorkspace
      rows={rows} readOnly={readOnly}
      onRowsChange={next => { if (readOnly) return; setRows(next); setDirty(true); setNotice(""); onPendingChange(true) }}
      currencies={workspace.currencies.some(currency => currency.code === set.baseCurrency) ? workspace.currencies
        : [{ code: set.baseCurrency, symbol: set.baseCurrency, decimalPlaces: 4 }, ...workspace.currencies]}
      parties={workspace.parties} exchangeRates={[]}
      baseCurrency={set.baseCurrency} storageKey={`booking-${jobId}-planning-charges`}
      createRow={() => ({ id: crypto.randomUUID(), code: "", description: "", cost: 0, sell: 0,
        costCurrency: set.baseCurrency, sellCurrency: set.baseCurrency, costRoe: 1, sellRoe: 1,
        costRoeSource: "manual", sellRoeSource: "manual", quantity: 1, calculationBasis: "fixed",
        supplierId: null, customerId: workspace.parties.find(party => party.roles?.includes("customer"))?.id ?? null })}
    /> : null}
    <Dialog open={confirmReload} onOpenChange={setConfirmReload}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); reloadTriggerRef.current?.focus() }}><DialogHeader><DialogTitle>{t("Discard unsaved charge edits?")}</DialogTitle>
        <DialogDescription>{t("Reloading replaces your unsaved entries with the latest saved charges. It does not discard saved charges or their audit history.")}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="ghost" onClick={() => setConfirmReload(false)}>{t("Keep editing")}</Button>
          <Button variant="outline" onClick={() => void reload()}>{t("Discard edits and reload")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
