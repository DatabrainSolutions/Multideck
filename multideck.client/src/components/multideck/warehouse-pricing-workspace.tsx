import { useEffect, useMemo, useState } from "react"
import { Plus, Pencil, Trash2, ArrowRight } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Surface } from "@/components/multideck/surface"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { WarehousePricingFlow, WarehouseRateEditor } from "@/components/multideck/warehouse-rate-editor"
import { warehousePricingCard } from "@/lib/warehouse-pricing-api"
import { newWarehouseRate, pricingBases, pricingPeriods, pricingStages, previewWarehouseRates, resolveWarehouseRates, validateWarehouseRates, type PricingStage, type PricingScenario, type WarehousePricingState, type WarehouseRate } from "@/lib/warehouse-pricing"
import { useLanguage } from "@/i18n/language-provider"

function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }

export function WarehousePricingWorkspace({ customerOrgId = null, customerName, navigate }: { customerOrgId?: string | null; customerName?: string; navigate?: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [state, setState] = useState<WarehousePricingState | null>(null)
  const [rates, setRates] = useState<WarehouseRate[]>([])
  const [stage, setStage] = useState<PricingStage>("storage")
  const [editing, setEditing] = useState<WarehouseRate | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [scenario, setScenario] = useState<PricingScenario>(() => ({ date: today(), pallet: 10, unit: 100, m3: 10, kg: 1000, nights: 7, hours: 168, receipt: 1, dispatch: 1, transaction: 0 }))
  const dirty = Boolean(state && JSON.stringify(rates) !== JSON.stringify(state.rates))

  useEffect(() => {
    let alive = true
    setState(null); setEditing(null); setError(""); setSaved(false)
    warehousePricingCard(customerOrgId).then(data => { if (alive) { setState(data); setRates(data.rates) } }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [customerOrgId, reload])
  useEffect(() => {
    if (!dirty && !editing) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [dirty, editing])
  const resolved = useMemo(() => resolveWarehouseRates(customerOrgId ? state?.defaults ?? [] : rates, customerOrgId ? rates : [], scenario.date), [customerOrgId, state, rates, scenario.date])
  const counts = Object.fromEntries(pricingStages.map(s => [s.value, resolved.filter(r => r.stage === s.value).length]))
  const preview = useMemo(() => {
    try { return { rows: previewWarehouseRates(resolved, scenario), error: "" } }
    catch (e) { return { rows: [], error: e instanceof Error ? e.message : "Invalid preview" } }
  }, [resolved, scenario])
  const totals = preview.rows.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.rate.currency]: (sum[row.rate.currency] ?? 0) + row.total }), {})
  const ownRates = rates.filter(rate => rate.stage === stage)
  const inherited = customerOrgId ? resolved.filter(rate => rate.stage === stage && rate.source === "default") : []
  const money = (value: number, currency: string) => new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 4 }).format(value)
  const dateLabel = (date: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
  function edit(rate: WarehouseRate) { setEditing({ ...rate }); setError(""); setSaved(false) }
  function applyRate() {
    if (!editing) return
    const next = [...rates.filter(r => r.id !== editing.id), editing]
    const validation = validateWarehouseRates(next)
    if (validation) { setError(validation); return }
    setRates(next); setEditing(null); setError(""); setSaved(false)
  }
  async function save() {
    if (!state || busy) return
    setBusy(true); setError(""); setSaved(false)
    try { const result = await warehousePricingCard(customerOrgId, { rates, version: state.version, defaultVersion: state.defaultVersion }); setState(result); setRates(result.rates); setSaved(true) }
    catch (e) { setError(e instanceof Error ? e.message : "The rates could not be saved.") }
    finally { setBusy(false) }
  }
  function reloadSaved() {
    if ((dirty || editing) && !window.confirm(t("Discard your unsaved changes and reload the saved rates?"))) return
    setReload(x => x + 1)
  }

  if (!state) return <Surface padding="lg">{error ? <InlineNotice tone="error" title={t("Pricing is unavailable")} action={<Button variant="outline" onClick={reloadSaved}>{t("Try again")}</Button>}>{t(error)}</InlineNotice> : <DotGridLoaderPanel label="Loading warehouse pricing" />}</Surface>

  return <div className="warehouse-pricing-workspace">
    <div className="warehouse-pricing-heading">
      <div><p className="warehouse-pricing-eyebrow">{t(customerOrgId ? "Customer rate card" : "Default rate card")}</p><h2 data-i18n-skip>{customerOrgId ? customerName : t("Warehouse pricing")}</h2><p>{t(customerOrgId ? "Customer rates replace matching charge codes. Everything else follows your defaults." : "Set the standard charges for all facilities. Agree customer exceptions in their account’s Warehouse tab.")}</p></div>
      {customerOrgId && navigate ? <Button variant="outline" onClick={() => { if (!(dirty || editing) || window.confirm(t("Leave this page and discard unsaved pricing changes?"))) navigate("/warehouse/pricing") }}>{t("View defaults")}<ArrowRight className="size-4" /></Button> : null}
    </div>
    <WarehousePricingFlow value={stage} onChange={value => { if (!editing || window.confirm(t("Discard the charge you are editing?"))) { setEditing(null); setStage(value); setError("") } }} counts={counts} />
    <div className="warehouse-pricing-columns">
      <Surface padding="lg" className="warehouse-pricing-main">
        <div className="warehouse-pricing-section-heading"><div><h3>{t(pricingStages.find(s => s.value === stage)!.label)}</h3><p>{t(customerOrgId ? "Your rates and inherited defaults" : "Standard charges and scheduled rates")}</p></div>
          {state.canManage && !editing ? <Button variant="outline" disabled={busy} onClick={() => edit(newWarehouseRate(stage, scenario.date))}><Plus className="size-4" />{t("Add charge")}</Button> : null}
        </div>
        {error && <InlineNotice tone="error" title={t("Pricing needs attention")} action={!editing ? <Button variant="outline" onClick={reloadSaved}>{t("Reload saved rates")}</Button> : undefined}>{t(error)}</InlineNotice>}
        {saved && <InlineNotice tone="success" title={t("Pricing saved")}>{t("The rate card is saved for your team.")}</InlineNotice>}
        {!state.canManage && <InlineNotice>{t("You can view pricing. Warehouse write permission is needed to make changes.")}</InlineNotice>}
        {editing ? <form onSubmit={event => { event.preventDefault(); applyRate() }}>
          <WarehouseRateEditor rate={editing} onChange={setEditing} disabled={busy} codeLocked={Boolean(customerOrgId && state.defaults.some(r => r.code === editing.code))} />
          <div className="warehouse-pricing-form-actions"><Button type="button" variant="ghost" onClick={() => { setEditing(null); setError("") }}>{t("Cancel")}</Button><Button type="submit">{t("Apply to rate card")}</Button></div>
        </form> : <>
          {!ownRates.length && !inherited.length && <div className="warehouse-pricing-empty"><Clock3Placeholder /><h4>{t("No charges configured")}</h4><p>{t("Add a charge to define the measurement, price and when it applies. No price has been assumed.")}</p></div>}
          {[...ownRates.map(rate => ({ ...rate, source: customerOrgId ? "customer" : "default" })), ...inherited].map(rate => {
            const isInherited = Boolean(customerOrgId && rate.source === "default")
            const active = rate.from <= scenario.date && (!rate.to || rate.to >= scenario.date)
            return <div className="warehouse-pricing-row" key={`${rate.source}-${rate.id}`}>
              <div className="warehouse-pricing-row-main"><div><h4 data-i18n-skip>{rate.name}</h4><span className="warehouse-pricing-source">{t(isInherited ? "Inherited default" : customerOrgId ? "Customer rate" : "Default")}{!active ? ` · ${t(rate.from > scenario.date ? "Scheduled" : "Expired")}` : ""}</span></div><strong>{money(rate.amount, rate.currency)}</strong></div>
              <p>{t(pricingBases.find(b => b.value === rate.basis)!.label)} · {t(pricingPeriods.find(p => p.value === rate.period)!.label)}{rate.freePeriods ? ` · ${rate.freePeriods} ${t(rate.freePeriods === 1 ? "free period" : "free periods")}` : ""}{rate.minimum ? ` · ${t("Minimum")} ${money(rate.minimum, rate.currency)}` : ""}</p>
              <div className="warehouse-pricing-row-bottom"><span>{rate.code} · {dateLabel(rate.from)}{rate.to ? ` – ${dateLabel(rate.to)}` : ` · ${t("No end date")}`}</span>
                {state.canManage && <div>{isInherited ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => edit({ ...rate, id: crypto.randomUUID(), from: scenario.date, to: "" })}>{t("Set customer rate")}</Button> : <><Button variant="ghost" size="sm" disabled={busy} aria-label={`${t("Edit")} ${rate.name}`} onClick={() => edit(rate)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="sm" disabled={busy} aria-label={`${t(customerOrgId && state.defaults.some(r => r.code === rate.code) ? "Use default for" : "Remove")} ${rate.name}`} onClick={() => { setRates(rates.filter(r => r.id !== rate.id)); setSaved(false) }}>{customerOrgId && state.defaults.some(r => r.code === rate.code) ? t("Use default") : <Trash2 className="size-3.5" />}</Button></>}</div>}
              </div>
            </div>
          })}
        </>}
        <div className="warehouse-pricing-save"><span>{t(editing ? "Apply this charge, then save the rate card." : dirty ? "Unsaved changes · preview includes your changes" : state.version ? `Saved rate card · version ${state.version}` : customerOrgId ? "Using default pricing" : "No saved rates yet")}</span><div>{dirty && <Button variant="ghost" disabled={busy || Boolean(editing)} onClick={() => { setRates(state.rates); setError(""); setSaved(false) }}>{t("Discard changes")}</Button>}{state.canManage && <Button disabled={!dirty || busy || Boolean(editing)} onClick={save}>{t(busy ? "Saving…" : "Save pricing")}</Button>}</div></div>
      </Surface>
      <Surface padding="lg" className="warehouse-pricing-preview">
        <h3>{t("Try a storage scenario")}</h3><p>{t("Estimate the complete stay before saving your rates.")}</p>
        <label className="warehouse-pricing-field"><span>{t("Pricing date")}</span><Input type="date" value={scenario.date} onChange={e => setScenario({ ...scenario, date: e.target.value })} /></label>
        <div className="warehouse-pricing-scenario">
          {([['pallet','Pallets'],['unit','Units'],['m3','Cubic metres'],['kg','Kilograms'],['nights','Nights kept'],['hours','Hours kept'],['receipt','Inbound bookings'],['dispatch','Outbound bookings'],['transaction','Transactions']] as const).filter(([key]) => ["receipt","dispatch","transaction"].includes(key) || key === "nights" && resolved.some(r => ["night","week"].includes(r.period)) || key === "hours" && resolved.some(r => ["hour","day"].includes(r.period)) || resolved.some(r => r.basis === key)).map(([key, label]) => <label className="warehouse-pricing-field" key={key}><span>{t(label)}</span><Input type="number" min="0" max="1000000" step={["nights","pallet","unit","receipt","dispatch","transaction"].includes(key) ? "1" : "0.001"} value={Number.isNaN(scenario[key]) ? "" : scenario[key]} onChange={e => setScenario({ ...scenario, [key]: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>)}
        </div>
        {preview.error ? <InlineNotice tone="error">{t(preview.error)}</InlineNotice> : <div aria-live="polite">
          {preview.rows.map(row => <div className="warehouse-pricing-preview-line" key={row.rate.code}><div><span data-i18n-skip>{row.rate.name}</span><small>{row.quantity} × {row.billablePeriods} × {money(row.rate.amount, row.rate.currency)}{row.occurrences !== 1 ? ` × ${row.occurrences}` : ""}{row.rate.minimum > 0 ? ` · ${t("Minimum applied if needed")}` : ""}</small></div><strong>{money(row.total, row.rate.currency)}</strong></div>)}
          {Object.entries(totals).map(([currency, total]) => <div className="warehouse-pricing-total" key={currency}><span>{t("Estimated net")} · {currency}</span><strong>{money(total, currency)}</strong></div>)}
          {!preview.rows.length && <p className="warehouse-pricing-help">{t("No rates apply on this date. This is not a zero-price agreement.")}</p>}
        </div>}
        <p className="warehouse-pricing-help">{t("Assumes the same quantity for each booking and throughout the stay. Nights and hours are supplied separately; rates are fixed at the pricing date. Tax and invoice posting are not included.")}</p>
      </Surface>
    </div>
  </div>
}

function Clock3Placeholder() { return <div className="warehouse-pricing-empty-mark" aria-hidden="true">＋</div> }
