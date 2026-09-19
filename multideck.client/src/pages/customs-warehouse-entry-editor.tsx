import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WarehouseEntryWorksheet } from "../../../supabase/functions/_shared/customs-warehousing.mts"

/** Declaration-wide evidence, not a reusable gallery primitive. */
export function WarehouseEntryEditor({ value, onChange, warehouseIdentifier, supported, t }: {
  value?: WarehouseEntryWorksheet; onChange: (value: WarehouseEntryWorksheet) => void
  warehouseIdentifier: string; supported: boolean; t: (value: string) => string
}) {
  const control = "h-8 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-input-bg)] px-2 text-[12px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]"
  const initial: WarehouseEntryWorksheet = { event: "entry", warehouseCountry: "GB", warehouseIdentifier, authorisationNumber: "", holderEori: "", validFrom: "", validTo: "", activeAuthorisationEvidence: "", goodsCoveredEvidence: "", entryConditionsEvidence: "", securityReviewEvidence: "", representation: "" }
  const patch = (change: Partial<WarehouseEntryWorksheet>) => onChange({ ...(value ?? initial), ...change })
  const fields = [
    ["warehouseIdentifier", "Warehouse identifier covered by the authorisation"],
    ["authorisationNumber", "Authorisation decision number"], ["holderEori", "Authorisation holder EORI"],
    ["validFrom", "Authorisation valid from", "date"], ["validTo", "Authorisation valid until", "date"],
    ["activeAuthorisationEvidence", "Active authorisation — evidence reference"],
    ["goodsCoveredEvidence", "Coverage for all goods — evidence reference"],
    ["entryConditionsEvidence", "Entry conditions — evidence reference"],
    ["securityReviewEvidence", "Security conditions — review reference"],
  ] as const
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium text-[var(--md-ink)]">{t("Warehouse entry evidence — shared by all items")}</summary>
    <p>{t("This estimates suspended duty and VAT on entry, not the final bill on release. Evidence applies to every item in this declaration. Save the draft before calculating.")}</p>
    {!supported ? <p role="status">{t("This estimate supports GB H2 standard entries under 7100. Other warehouse routes still need their own rules. Your evidence is retained.")}</p> : null}
    {!value ? <Button type="button" variant="outline" onClick={() => onChange(initial)}>{t("Add warehouse entry evidence")}</Button> : <>
      <p className="break-words">{t("Warehouse on declaration")}: {warehouseIdentifier || t("Not selected")}. {t("Warehouse country: Great Britain. This worksheet does not cover NI or overseas warehouses.")}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {fields.map(([key, label, ...type]) => <label key={key} className="min-w-0">{t(label)}<Input className={control} type={type[0] ?? "text"} value={value[key]} onChange={event => patch({ [key]: event.target.value })} /></label>)}
        <label>{t("Who is making the entry?")}<select className={control} value={value.representation} onChange={event => patch({ representation: event.target.value as WarehouseEntryWorksheet["representation"] })}><option value="">{t("Select representation")}</option><option value="holder">{t("Authorisation holder")}</option><option value="agent">{t("Agent acting for the holder")}</option></select></label>
        {value.representation === "agent" ? <>
          <label>{t("Prior written holder approval — reference")}<Input className={control} value={value.agentApprovalEvidence ?? ""} onChange={event => patch({ agentApprovalEvidence: event.target.value })} /></label>
          <label>{t("Returning the declaration copy — arrangements")}<Input className={control} value={value.declarationCopyEvidence ?? ""} onChange={event => patch({ declarationCopyEvidence: event.target.value })} /></label>
        </> : null}
      </div>
      <p>{t("Entry conditions should cover entry without delay, unchanged goods and applicable warehouse requirements. Security review does not mean adding guarantee fields to an H2 declaration. Document references are operator evidence, not automatic HMRC verification.")}</p>
      {value.warehouseIdentifier !== warehouseIdentifier ? <p role="status" className="text-[var(--md-red)]">{t("The warehouse differs from the declaration. Review the authorisation before changing the evidence identifier.")}</p> : null}
    </>}
  </details>
}
