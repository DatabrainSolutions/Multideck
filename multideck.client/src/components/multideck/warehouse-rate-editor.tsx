import { ArrowDownToLine, ArrowUpFromLine, Clock3, PackageCheck } from "@/components/icons/hugeicons"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { pricingBases, pricingCurrencies, pricingPeriods, pricingStages, type PricingStage, type WarehouseRate } from "@/lib/warehouse-pricing"
import "./warehouse-pricing.css"

const stageIcons = [ArrowDownToLine, Clock3, ArrowUpFromLine, PackageCheck]

/** A keyboard-accessible stage selector; selecting a stage filters the charge list. */
export function WarehousePricingFlow({ value, onChange, counts }: { value: PricingStage; onChange: (value: PricingStage) => void; counts: Partial<Record<PricingStage, number>> }) {
  const { t } = useLanguage()
  return <nav className="warehouse-pricing-flow" aria-label={t("Pricing stages")}>
    {pricingStages.map((stage, index) => {
      const Icon = stageIcons[index]
      return <button type="button" key={stage.value} aria-pressed={value === stage.value} onClick={() => onChange(stage.value)}>
        <Icon aria-hidden="true" className="size-4" />
        <span><strong>{t(stage.label)}</strong><small>{t(stage.description)}</small></span>
        <span className="warehouse-pricing-count">{counts[stage.value] ?? 0}</span>
      </button>
    })}
  </nav>
}

/** One charge, composed identically for defaults and customer overrides. */
export function WarehouseRateEditor({ rate, onChange, disabled = false, codeLocked = false }: { rate: WarehouseRate; onChange: (rate: WarehouseRate) => void; disabled?: boolean; codeLocked?: boolean }) {
  const { t } = useLanguage()
  function update<K extends keyof WarehouseRate>(key: K, value: WarehouseRate[K]) { onChange({ ...rate, [key]: value }) }
  const select = (label: string, key: "basis" | "period" | "currency", options: ReadonlyArray<{ value: string; label: string }>) => <label className="warehouse-pricing-field">
    <span>{t(label)}</span><Select value={rate[key]} onValueChange={v => update(key, v as never)} disabled={disabled}>
      <SelectTrigger aria-label={t(label)}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>)}</SelectContent>
    </Select></label>
  return <fieldset disabled={disabled} className="warehouse-rate-editor">
    <legend className="sr-only">{t("Charge details")}</legend>
    <label className="warehouse-pricing-field"><span>{t("Charge name")}</span><Input value={rate.name} maxLength={120} onChange={e => update("name", e.target.value)} placeholder={t("e.g. Standard pallet storage")} required /></label>
    <label className="warehouse-pricing-field"><span>{t("Charge code")}</span><Input value={rate.code} maxLength={40} readOnly={codeLocked} onChange={e => update("code", e.target.value.toUpperCase().replace(/\s/g, "_"))} placeholder="PALLET_STORAGE" required /><small>{t(codeLocked ? "Matches an inherited default." : "The same code links a customer rate to its default.")}</small></label>
    {select("Measurement", "basis", pricingBases)}
    {select("Frequency", "period", pricingPeriods.filter(p => rate.stage === "storage" ? p.value !== "once" : p.value === "once"))}
    <label className="warehouse-pricing-field"><span>{t("Rate per measurement")}</span><Input type="number" min="0" max="1000000" step="0.0001" value={Number.isNaN(rate.amount) ? "" : rate.amount} onChange={e => update("amount", e.target.value === "" ? NaN : Number(e.target.value))} required /></label>
    {select("Currency", "currency", pricingCurrencies.map(c => ({ value: c, label: c })))}
    <label className="warehouse-pricing-field"><span>{t("Minimum charge")}</span><Input type="number" min="0" max="1000000" step="0.0001" value={Number.isNaN(rate.minimum) ? "" : rate.minimum} onChange={e => update("minimum", e.target.value === "" ? NaN : Number(e.target.value))} required /><small>{t(rate.stage === "storage" ? "Once per stay, after free periods." : "Per booking or transaction.")}</small></label>
    {rate.stage === "storage" ? <label className="warehouse-pricing-field"><span>{t("Free periods")}</span><Input type="number" min="0" max="365" step="1" value={Number.isNaN(rate.freePeriods) ? "" : rate.freePeriods} onChange={e => update("freePeriods", e.target.value === "" ? NaN : Number(e.target.value))} required /><small>{t("Uses the selected frequency; 0 means none.")}</small></label> : <div />}
    <label className="warehouse-pricing-field"><span>{t("Effective from")}</span><Input type="date" value={rate.from} onChange={e => update("from", e.target.value)} required /></label>
    <label className="warehouse-pricing-field"><span>{t("Effective until (optional)")}</span><Input type="date" min={rate.from} value={rate.to} onChange={e => update("to", e.target.value)} /><small>{t("Includes this date; blank means no end date.")}</small></label>
    <p className="warehouse-pricing-help">{t("A zero rate and zero minimum waive this charge. Amounts exclude tax.")}</p>
  </fieldset>
}
