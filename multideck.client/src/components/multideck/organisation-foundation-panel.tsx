import { AddressSearch } from "@/components/multideck/address-search"
import { useEffect, useMemo, useState } from "react"
import { Building2, Clock, MapPin, Plus, RefreshCw, Trash2 } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import { addressFieldsForCountry, completeCountryOptions } from "@/lib/country-address-format"
import {
  archiveOrganisationAddress,
  getCustomer,
  listAccountsPage,
  saveOrganisationAddress,
  saveRelatedPartyDefault,
  updateOrganisationFoundation,
  type ApiCustomer,
  type ApiCustomerDetail,
  type CustomerReference,
  type OrganisationAddress,
  type OrganisationOpeningOverride,
  type RelatedPartyDefault,
  type UpsertOrganisationAddressInput,
  type UpsertRelatedPartyDefaultInput,
} from "@/lib/customer-api"
import { cn } from "@/lib/utils"

type FoundationDraft = {
  accountCode: string
  scopeCode: "standard" | "national" | "global"
  isPotential: boolean
  officeAssignments: Array<{ officeId: string; isPrimary: boolean }>
}

type AddressDraft = UpsertOrganisationAddressInput
type RelatedDefaultDraft = UpsertRelatedPartyDefaultInput

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const fieldClass = "h-8 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] sm:text-[13px]"
const selectClass = cn(fieldClass, "w-full border-0 outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]")
const compactFieldClass = "h-8 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2.5 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] sm:text-[12px]"

function addressDraft(address?: OrganisationAddress | null): AddressDraft {
  return {
    name: address?.name ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    townCity: address?.townCity ?? "",
    countyState: address?.countyState ?? "",
    postZipCode: address?.postZipCode ?? "",
    countryCode: address?.countryCode ?? "",
    unlocode: address?.unlocode ?? "",
    email: address?.email ?? "",
    phone: address?.phone ?? "",
    timeZone: address?.timeZone ?? "Europe/London",
    capabilities: (address?.capabilities ?? []).map((item) => ({ code: item.code, isDefault: item.isDefault })),
    weeklyHours: (address?.weeklyHours ?? []).map(({ dayOfWeek, opensAt, closesAt, sortOrder = 0 }) => ({ dayOfWeek, opensAt: opensAt.slice(0, 5), closesAt: closesAt.slice(0, 5), sortOrder })),
    openingOverrides: (address?.openingOverrides ?? []).map(({ date, isClosed, opensAt, closesAt, note }) => ({ date, isClosed, opensAt: opensAt?.slice(0, 5) ?? null, closesAt: closesAt?.slice(0, 5) ?? null, note })),
  }
}

function foundationDraft(account: ApiCustomerDetail): FoundationDraft {
  return {
    accountCode: account.accountCode ?? "",
    scopeCode: account.scopeCode,
    isPotential: account.isPotential,
    officeAssignments: account.officeAssignments.map((item) => ({ officeId: item.officeId, isPrimary: item.isPrimary })),
  }
}

function relatedDefaultDraft(rule?: RelatedPartyDefault | null): RelatedDefaultDraft {
  return {
    partyRoleCode: rule?.partyRoleCode ?? "delivery_agent",
    destinationCountryCode: rule?.destinationCountryCode ?? null,
    destinationUnlocode: rule?.destinationUnlocode ?? null,
    destinationPostcode: rule?.destinationPostcode ?? null,
    targetOrganisationId: rule?.targetOrganisationId ?? "",
    targetAddressId: rule?.targetAddressId ?? null,
    targetContactId: rule?.targetContactId ?? null,
    priority: rule?.priority ?? 100,
    effectiveFrom: rule?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: rule?.effectiveTo ?? null,
    isActive: rule?.isActive ?? true,
  }
}

export function OrganisationFoundationPanel({
  account,
  reference,
  onChange,
  view = "setup",
}: {
  account: ApiCustomerDetail
  reference: CustomerReference
  onChange: (account: ApiCustomerDetail) => void
  view?: "setup" | "addresses"
}) {
  const { language, t } = useLanguage()
  const [setupOpen, setSetupOpen] = useState(false)
  const [setup, setSetup] = useState(() => foundationDraft(account))
  const [addressOpen, setAddressOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<OrganisationAddress | null>(null)
  const [address, setAddress] = useState<AddressDraft>(() => addressDraft())
  const [archiveTarget, setArchiveTarget] = useState<OrganisationAddress | null>(null)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [editingRelated, setEditingRelated] = useState<RelatedPartyDefault | null>(null)
  const [related, setRelated] = useState<RelatedDefaultDraft>(() => relatedDefaultDraft())
  const [companies, setCompanies] = useState<ApiCustomer[]>([])
  const [targetCompany, setTargetCompany] = useState<ApiCustomerDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!setupOpen) setSetup(foundationDraft(account))
  }, [account, setupOpen])

  useEffect(() => {
    if (!relatedOpen || companies.length) return
    listAccountsPage({ organisationType: "company", limit: 100, offset: 0 })
      .then((page) => setCompanies(page.rows.filter((item) => item.id !== account.id)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : t("Companies could not be loaded.")))
  }, [account.id, companies.length, relatedOpen, t])

  useEffect(() => {
    if (!relatedOpen || !related.targetOrganisationId) {
      setTargetCompany(null)
      return
    }
    let active = true
    getCustomer(related.targetOrganisationId).then((value) => { if (active) setTargetCompany(value) }).catch(() => { if (active) setTargetCompany(null) })
    return () => { active = false }
  }, [related.targetOrganisationId, relatedOpen])

  const primaryOffice = account.officeAssignments.find((item) => item.isPrimary)
  const mainAddress = account.addresses.find((item) => item.capabilities.some((capability) => capability.code === "main" && capability.isDefault)) ?? account.addresses.find((item) => item.capabilities.some((capability) => capability.code === "main")) ?? account.addresses[0] ?? null
  const countryOptions = useMemo(() => completeCountryOptions(reference.countries ?? [], language), [language, reference.countries])
  const formattedAddressFields = addressFieldsForCountry(address.countryCode)

  function openAddress(next?: OrganisationAddress) {
    setEditingAddress(next ?? null)
    setAddress(addressDraft(next))
    setError(null)
    setAddressOpen(true)
  }

  function openRelated(next?: RelatedPartyDefault) {
    setEditingRelated(next ?? null)
    setRelated(relatedDefaultDraft(next))
    setError(null)
    setRelatedOpen(true)
  }

  async function saveSetup() {
    setSaving(true); setError(null)
    try {
      const officesChanged = setup.officeAssignments.length !== account.officeAssignments.length
        || setup.officeAssignments.some((office) => !account.officeAssignments.some(
          (saved) => saved.officeId === office.officeId && saved.isPrimary === office.isPrimary,
        ))
      const updated = await updateOrganisationFoundation(account.id, {
        ...setup,
        officeAssignments: officesChanged ? setup.officeAssignments : undefined,
      }, account.editVersion)
      onChange(updated); setSetupOpen(false); toast.success(t("Main details saved"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Main details could not be saved."))
    } finally { setSaving(false) }
  }

  async function saveAddress() {
    if (!address.capabilities.length) {
      setError(t("Choose at least one purpose for this address."))
      return
    }
    setSaving(true); setError(null)
    try {
      const updated = await saveOrganisationAddress(account.id, address, account.editVersion, editingAddress?.id)
      onChange(updated); setAddressOpen(false); toast.success(t("Address saved"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The address could not be saved."))
    } finally { setSaving(false) }
  }

  async function archiveAddress() {
    if (!archiveTarget) return
    setSaving(true); setError(null)
    try {
      const updated = await archiveOrganisationAddress(account.id, archiveTarget.id, account.editVersion)
      onChange(updated); setArchiveTarget(null); toast.success(t("Address archived"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The address could not be archived."))
    } finally { setSaving(false) }
  }

  async function saveRelated() {
    setSaving(true); setError(null)
    try {
      const updated = await saveRelatedPartyDefault(account.id, related, account.editVersion, editingRelated?.id)
      onChange(updated); setRelatedOpen(false); toast.success(t("Related-party default saved"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The related-party default could not be saved."))
    } finally { setSaving(false) }
  }

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]" aria-labelledby={`company-foundation-${account.id}`}>
      {view === "setup" ? <><header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)] sm:px-5">
        <div>
          <h2 id={`company-foundation-${account.id}`} className="text-[13px] font-medium text-[var(--md-ink)]">{t("Main Details")}</h2>
        </div>
        <Button variant="outline" className="h-8" onClick={() => { setSetup(foundationDraft(account)); setError(null); setSetupOpen(true) }}>{t("Edit main details")}</Button>
      </header>

      <div className="grid gap-px bg-[var(--md-line)] sm:grid-cols-2 lg:grid-cols-4">
        <FoundationFact label="Full name" value={account.name} />
        <FoundationFact label="Organisation code" value={account.accountCode || t("Not assigned")} />
        <FoundationFact label="Scope" value={t(account.scopeCode === "standard" ? "Standard" : account.scopeCode === "national" ? "National" : "Global")} />
        <FoundationFact label="Lifecycle" value={t(account.isPotential ? "Potential" : "Active")} />
        <FoundationFact label="Responsible branch" value={primaryOffice?.name || t("Not assigned")} />
        <FoundationFact label="Main address" value={mainAddress ? [mainAddress.line1, mainAddress.townCity, mainAddress.postZipCode, mainAddress.countryCode].filter(Boolean).join(", ") : t("Not assigned")} />
        <FoundationFact label="Main email" value={mainAddress?.email || account.address?.mainEmail || t("Not assigned")} />
        <FoundationFact label="Main phone" value={mainAddress?.phone || account.address?.mainPhone || t("Not assigned")} />
      </div>
      </> : null}

      {view === "addresses" ? <section className="px-4 py-4 sm:px-5" aria-labelledby={`company-addresses-${account.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id={`company-addresses-${account.id}`} className="text-[12.5px] font-medium text-[var(--md-ink)]">{t("Addresses & billing")}</h3>
          </div>
          <Button variant="ghost" className="h-8" onClick={() => openAddress()}><Plus className="size-3.5" />{t("Add address")}</Button>
        </div>
        {account.addresses.length ? (
          <div className="mt-3 overflow-x-auto rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]">
            <table className="w-full min-w-[680px] text-start text-[12px]">
              <thead className="bg-[var(--md-surface-soft)] text-[10.5px] text-[var(--md-subtle)]"><tr><th className="px-3 py-2 text-start font-medium">{t("Name")}</th><th className="px-3 py-2 text-start font-medium">{t("Address")}</th><th className="px-3 py-2 text-start font-medium">{t("Purposes")}</th><th className="px-3 py-2 text-start font-medium">{t("Opening hours")}</th></tr></thead>
              <tbody>{account.addresses.map((item) => {
                const selected = editingAddress?.id === item.id
                return <tr key={item.id} role="button" tabIndex={0} aria-selected={selected} onClick={() => openAddress(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAddress(item) } }} className={cn("cursor-pointer border-t border-[var(--md-line)] outline-none transition-colors hover:bg-[var(--md-surface-tint)] focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)]", selected && "bg-[var(--md-accent-a08)]")}>
                  <td className="px-3 py-2.5 font-medium text-[var(--md-ink)]" dir="auto">{item.name || item.line1 || item.townCity || t("Address")}</td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]" dir="auto">{[item.line1, item.townCity, item.postZipCode, item.countryCode].filter(Boolean).join(", ")}</td>
                  <td className="px-3 py-2.5 text-[var(--md-text)]">{item.capabilities.map((capability) => `${t(capability.name)}${capability.isDefault ? ` · ${t("Default")}` : ""}`).join(", ") || t("No purpose assigned")}</td>
                  <td className="px-3 py-2.5 text-[var(--md-subtle)]">{item.weeklyHours.length ? t("Recorded") : t("Not recorded")}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        ) : <EmptyFoundation icon={MapPin} text={t("Add the company's main, office, postal, pickup, delivery or billing addresses.")} />}
      </section> : null}

      {view === "setup" ? <section className="border-t border-[var(--md-line)] px-4 py-4 sm:px-5" aria-labelledby={`related-defaults-${account.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id={`related-defaults-${account.id}`} className="text-[12.5px] font-medium text-[var(--md-ink)]">{t("Related-party defaults")}</h3>
          </div>
          <Button variant="ghost" className="h-8" onClick={() => openRelated()}><Plus className="size-3.5" />{t("Add default")}</Button>
        </div>
        {account.relatedPartyDefaults.length ? (
          <div className="mt-3 divide-y divide-[var(--md-line)] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 shadow-[var(--md-shadow-line)]">
            {account.relatedPartyDefaults.map((item) => (
              <button key={item.id} type="button" className="grid w-full gap-1 py-2.5 text-start sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center sm:gap-3" onClick={() => openRelated(item)}>
                <span className="text-[12px] font-medium text-[var(--md-ink)]">{humanize(item.partyRoleCode)}</span>
                <span className="truncate text-[12px] text-[var(--md-text)]">{item.targetOrganisationName}</span>
                <span className="text-[10.5px] text-[var(--md-subtle)]">{[item.destinationPostcode, item.destinationUnlocode, item.destinationCountryCode].filter(Boolean).join(" · ") || t("All destinations")}</span>
              </button>
            ))}
          </div>
        ) : <EmptyFoundation icon={Building2} text={t("No related-party defaults")} />}
      </section> : null}

      {view === "setup" ? <Dialog open={setupOpen} onOpenChange={(open) => { if (!saving) setSetupOpen(open); if (!open) setError(null) }}>
        <DialogContent className="max-h-[min(760px,calc(100vh-32px))] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader><DialogTitle>{t("Edit main details")}</DialogTitle><DialogDescription>{t("Maintain the organisation code, lifecycle, account scope and responsible branch. Addresses and organisation roles are managed in their dedicated areas.")}</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <Field label="Organisation code"><Input value={setup.accountCode} maxLength={8} onChange={(event) => setSetup((value) => ({ ...value, accountCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) }))} className={fieldClass} dir="ltr" aria-describedby="company-code-help" /><span id="company-code-help" className="text-[10.5px] font-normal text-[var(--md-subtle)]">{t("Maximum eight letters or numbers for accounting-system compatibility.")}</span></Field>
            <Field label="Scope"><select value={setup.scopeCode} onChange={(event) => setSetup((value) => ({ ...value, scopeCode: event.target.value as FoundationDraft["scopeCode"] }))} className={selectClass}><option value="standard">{t("Standard")}</option><option value="national">{t("National")}</option><option value="global">{t("Global")}</option></select></Field>
            <div className="flex items-center justify-between gap-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Potential organisation")}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t("Turn this off only when the main address and responsible branch are ready.")}</p></div><Switch checked={setup.isPotential} onCheckedChange={(isPotential) => setSetup((value) => ({ ...value, isPotential }))} /></div>
            <fieldset><legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Responsible offices")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{reference.offices.map((office) => {
              const selected = setup.officeAssignments.find((item) => item.officeId === office.id)
              return <div key={office.id} className={cn("rounded-[var(--md-radius-lg)] p-3 shadow-[var(--md-shadow-line)]", selected ? "bg-[var(--md-accent-a08)]" : "bg-[var(--md-surface-soft)]")}><label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-[var(--md-ink)]"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => setSetup((value) => ({ ...value, officeAssignments: event.target.checked ? [...value.officeAssignments, { officeId: office.id, isPrimary: value.officeAssignments.length === 0 }] : value.officeAssignments.filter((item) => item.officeId !== office.id) }))} />{office.name}</label>{selected ? <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-[var(--md-text)]"><input type="radio" name="primary-office" checked={selected.isPrimary} onChange={() => setSetup((value) => ({ ...value, officeAssignments: value.officeAssignments.map((item) => ({ ...item, isPrimary: item.officeId === office.id })) }))} />{t("Responsible branch")}</label> : null}</div>
            })}</div></fieldset>
            <DialogError error={error} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSetupOpen(false)} disabled={saving}>{t("Cancel")}</Button><Button onClick={() => void saveSetup()} disabled={saving || !setup.accountCode.trim()}>{saving ? t("Saving…") : t("Save main details")}</Button></DialogFooter>
        </DialogContent>
      </Dialog> : null}

      {view === "addresses" && addressOpen ? <section className="border-t border-[var(--md-line)] px-4 py-4 sm:px-5" aria-labelledby={`address-form-${account.id}`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 id={`address-form-${account.id}`} className="text-[13px] font-medium text-[var(--md-ink)]">{t(editingAddress ? "Edit operational address" : "Add operational address")}</h3><p className="mt-1 text-[11.5px] leading-4 text-[var(--md-subtle)]">{t("Select another table row to change the address shown here. Assign every purpose this address serves, then mark defaults and local opening hours.")}</p></div><Button variant="ghost" className="h-8" onClick={() => { setAddressOpen(false); setEditingAddress(null); setError(null) }} disabled={saving}>{t("Close form")}</Button></div>
          <div className="grid gap-5">
            <AddressSearch key={editingAddress?.id ?? "new"} disabled={saving} onSelect={selected => setAddress(current => ({ ...current, ...selected }))} />
            <Field label="Country"><select value={address.countryCode ?? ""} onChange={event => setAddress(current => ({ ...current, countryCode: event.target.value }))} className={selectClass}><option value="">{t("Choose country")}</option>{countryOptions.map(country => <option key={country.code} value={country.code}>{country.name} · {country.code}</option>)}</select></Field>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(270px,2fr)]">
              <section aria-labelledby={`address-details-${account.id}`}>
                <h4 id={`address-details-${account.id}`} className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Address details")}</h4>
                <div className="grid gap-1.5">
                  <InlineField label="Address name"><Input value={address.name ?? ""} onChange={(event) => setAddress((value) => ({ ...value, name: event.target.value }))} className={compactFieldClass} /></InlineField>
                  {formattedAddressFields.map((field) => <InlineField key={field.key} label={field.label}><Input value={address[field.key] ?? ""} onChange={(event) => setAddress((value) => ({ ...value, [field.key]: event.target.value }))} className={compactFieldClass} dir={field.dir} /></InlineField>)}
                  <InlineField label="Time zone"><Input value={address.timeZone} onChange={(event) => setAddress((value) => ({ ...value, timeZone: event.target.value }))} className={compactFieldClass} dir="ltr" /></InlineField>
                  <InlineField label="UN/LOCODE"><Input value={address.unlocode ?? ""} maxLength={5} onChange={(event) => setAddress((value) => ({ ...value, unlocode: event.target.value.toUpperCase() }))} className={compactFieldClass} dir="ltr" /></InlineField>
                  <InlineField label="Switchboard phone"><Input value={address.phone ?? ""} onChange={(event) => setAddress((value) => ({ ...value, phone: event.target.value }))} className={compactFieldClass} dir="ltr" /></InlineField>
                </div>
              </section>
              <fieldset className="min-w-0"><legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Address purposes and defaults")}</legend><p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Choose each purpose this address serves. A selected purpose can also be its default address.")}</p><div className="mt-2 divide-y divide-[var(--md-line)] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 shadow-[var(--md-shadow-line)]">{account.addressCapabilities.map((capability) => {
                const selected = address.capabilities.find((item) => item.code === capability.code)
                return <div key={capability.code} className={cn("grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5", selected && "text-[var(--md-ink)]")}><label className="flex min-w-0 cursor-pointer items-center gap-2 text-[11.5px] font-medium"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => setAddress((value) => ({ ...value, capabilities: event.target.checked ? [...value.capabilities, { code: capability.code, isDefault: false }] : value.capabilities.filter((item) => item.code !== capability.code) }))} /><span className="truncate">{t(capability.name)}</span></label><label className={cn("flex cursor-pointer items-center gap-1.5 text-[10.5px] text-[var(--md-text)]", !selected && "pointer-events-none opacity-35")}><input type="checkbox" checked={selected?.isDefault ?? false} disabled={!selected} onChange={(event) => setAddress((value) => ({ ...value, capabilities: value.capabilities.map((item) => item.code === capability.code ? { ...item, isDefault: event.target.checked } : item) }))} />{t("Default")}</label></div>
              })}</div></fieldset>
            </div>
            <fieldset><legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Weekly opening hours")}</legend><div className="mt-2 divide-y divide-[var(--md-line)] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 shadow-[var(--md-shadow-line)]">{dayNames.map((day, dayOfWeek) => {
              const interval = address.weeklyHours.find((item) => item.dayOfWeek === dayOfWeek)
              return <div key={day} className="grid min-h-12 grid-cols-2 items-center gap-x-2 gap-y-1 py-2 text-base sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:py-1 sm:text-[13px]"><label className="col-span-2 flex items-center gap-2 text-[11.5px] font-medium text-[var(--md-ink)] sm:col-span-1"><input type="checkbox" checked={Boolean(interval)} onChange={(event) => setAddress((value) => ({ ...value, weeklyHours: event.target.checked ? [...value.weeklyHours, { dayOfWeek, opensAt: "09:00", closesAt: "17:00", sortOrder: 0 }] : value.weeklyHours.filter((item) => item.dayOfWeek !== dayOfWeek) }))} />{t(day)}</label><Input type="time" value={interval?.opensAt ?? "09:00"} disabled={!interval} onChange={(event) => setAddress((value) => ({ ...value, weeklyHours: value.weeklyHours.map((item) => item.dayOfWeek === dayOfWeek ? { ...item, opensAt: event.target.value } : item) }))} className="h-8 px-2 text-[12px]" dir="ltr" /><Input type="time" value={interval?.closesAt ?? "17:00"} disabled={!interval} onChange={(event) => setAddress((value) => ({ ...value, weeklyHours: value.weeklyHours.map((item) => item.dayOfWeek === dayOfWeek ? { ...item, closesAt: event.target.value } : item) }))} className="h-8 px-2 text-[12px]" dir="ltr" /></div>
            })}</div></fieldset>
            <fieldset><div className="flex items-center justify-between"><legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Dated overrides")}</legend><Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setAddress((value) => ({ ...value, openingOverrides: [...value.openingOverrides, { date: "", isClosed: true, opensAt: null, closesAt: null, note: null }] }))}><Plus className="size-3" />{t("Add override")}</Button></div><div className="mt-2 grid gap-2">{address.openingOverrides.map((override, index) => <OverrideRow key={`${override.date}-${index}`} value={override} onChange={(next) => setAddress((value) => ({ ...value, openingOverrides: value.openingOverrides.map((item, itemIndex) => itemIndex === index ? next : item) }))} onRemove={() => setAddress((value) => ({ ...value, openingOverrides: value.openingOverrides.filter((_, itemIndex) => itemIndex !== index) }))} />)}</div></fieldset>
            <DialogError error={error} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div>{editingAddress ? <Button variant="ghost" className="text-[var(--md-red)]" onClick={() => { setAddressOpen(false); setArchiveTarget(editingAddress) }} disabled={saving}><Trash2 className="size-3.5" />{t("Archive")}</Button> : null}</div><div className="flex gap-2"><Button variant="outline" onClick={() => { setAddressOpen(false); setEditingAddress(null); setError(null) }} disabled={saving}>{t("Cancel")}</Button><Button onClick={() => void saveAddress()} disabled={saving || !address.capabilities.length}>{saving ? t("Saving…") : t("Save address")}</Button></div></div>
      </section> : null}

      {view === "addresses" ? <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open && !saving) setArchiveTarget(null) }}><DialogContent className="sm:max-w-[460px]"><DialogHeader><DialogTitle>{t("Archive this address?")}</DialogTitle><DialogDescription>{t("It will stop appearing in operational choices. Assign replacement defaults first if this address is currently a default.")}</DialogDescription></DialogHeader><DialogError error={error} /><DialogFooter><Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={saving}>{t("Cancel")}</Button><Button variant="destructive" onClick={() => void archiveAddress()} disabled={saving}>{saving ? t("Archiving…") : t("Archive address")}</Button></DialogFooter></DialogContent></Dialog> : null}

      {view === "setup" ? <Dialog open={relatedOpen} onOpenChange={(open) => { if (!saving) setRelatedOpen(open); if (!open) setError(null) }}><DialogContent className="max-h-[min(760px,calc(100vh-32px))] overflow-y-auto sm:max-w-[660px]"><DialogHeader><DialogTitle>{t(editingRelated ? "Edit related-party default" : "Add related-party default")}</DialogTitle><DialogDescription>{t("More specific destination evidence wins before priority. The selected company remains reviewable on each booking.")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Party role"><Input value={related.partyRoleCode} onChange={(event) => setRelated((value) => ({ ...value, partyRoleCode: event.target.value.toLowerCase().replace(/\s+/g, "_") }))} className={fieldClass} dir="ltr" /></Field><Field label="Related company"><select value={related.targetOrganisationId} onChange={(event) => setRelated((value) => ({ ...value, targetOrganisationId: event.target.value, targetAddressId: null, targetContactId: null }))} className={selectClass}><option value="">{t("Choose a company")}</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field><Field label="Destination country"><Input value={related.destinationCountryCode ?? ""} maxLength={2} onChange={(event) => setRelated((value) => ({ ...value, destinationCountryCode: event.target.value.toUpperCase() || null }))} className={fieldClass} dir="ltr" /></Field><Field label="Destination UN/LOCODE"><Input value={related.destinationUnlocode ?? ""} maxLength={5} onChange={(event) => setRelated((value) => ({ ...value, destinationUnlocode: event.target.value.toUpperCase() || null }))} className={fieldClass} dir="ltr" /></Field><Field label="Destination postcode"><Input value={related.destinationPostcode ?? ""} onChange={(event) => setRelated((value) => ({ ...value, destinationPostcode: event.target.value.toUpperCase() || null }))} className={fieldClass} dir="ltr" /></Field><Field label="Priority"><Input type="number" min={1} max={10000} value={related.priority} onChange={(event) => setRelated((value) => ({ ...value, priority: Number(event.target.value) || 100 }))} className={fieldClass} dir="ltr" /></Field><Field label="Related address"><select value={related.targetAddressId ?? ""} onChange={(event) => setRelated((value) => ({ ...value, targetAddressId: event.target.value || null }))} className={selectClass} disabled={!targetCompany}><option value="">{t("Use company only")}</option>{targetCompany?.addresses.map((item) => <option key={item.id} value={item.id}>{item.name || item.line1 || item.townCity || t("Address")}</option>)}</select></Field><Field label="Related contact"><select value={related.targetContactId ?? ""} onChange={(event) => setRelated((value) => ({ ...value, targetContactId: event.target.value || null }))} className={selectClass} disabled={!targetCompany}><option value="">{t("No default contact")}</option>{targetCompany?.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><DialogError error={error} /><DialogFooter><Button variant="outline" onClick={() => setRelatedOpen(false)} disabled={saving}>{t("Cancel")}</Button><Button onClick={() => void saveRelated()} disabled={saving || !related.targetOrganisationId || !related.partyRoleCode}>{saving ? t("Saving…") : t("Save default")}</Button></DialogFooter></DialogContent></Dialog> : null}
    </Surface>
  )
}

function FoundationFact({ label, value }: { label: string; value: string }) {
  const { t } = useLanguage()
  return <div className="min-w-0 bg-[var(--md-surface-soft)] px-4 py-3"><p className="text-[10.5px] text-[var(--md-subtle)]">{t(label)}</p><p className="mt-0.5 truncate text-[12.5px] font-medium text-[var(--md-ink)]" dir="auto">{value}</p></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  return <label className="grid min-w-0 grid-cols-[min(32%,100px)_minmax(0,1fr)] items-start gap-2 text-[11.5px] text-[var(--md-text)]"><span className="pt-2 text-end leading-4">{t(label)}</span><span className="block min-w-0 text-base sm:text-[13px]">{children}</span></label>
}

function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  return <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--md-text)] sm:grid-cols-[124px_minmax(0,1fr)] sm:items-center sm:gap-2"><span>{t(label)}</span>{children}</label>
}

function DialogError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] px-3 py-2 text-[12px] leading-5 text-[var(--md-red)]">{error}</p> : null
}

function EmptyFoundation({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return <div className="mt-3 flex items-center gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-4 text-[11.5px] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]"><Icon className="size-4 shrink-0" /><span>{text}</span></div>
}

function OverrideRow({ value, onChange, onRemove }: { value: Omit<OrganisationOpeningOverride, "id">; onChange: (value: Omit<OrganisationOpeningOverride, "id">) => void; onRemove: () => void }) {
  const { t } = useLanguage()
  return <div className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2.5 shadow-[var(--md-shadow-line)] sm:grid-cols-[140px_90px_1fr_1fr_32px] sm:items-center"><Input type="date" value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} className="h-8 px-2 text-[12px]" dir="ltr" /><label className="flex items-center gap-2 text-[11px] text-[var(--md-text)]"><input type="checkbox" checked={value.isClosed} onChange={(event) => onChange({ ...value, isClosed: event.target.checked, opensAt: event.target.checked ? null : "09:00", closesAt: event.target.checked ? null : "17:00" })} />{t("Closed")}</label><Input type="time" value={value.opensAt ?? "09:00"} disabled={value.isClosed} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} className="h-8 px-2 text-[12px]" dir="ltr" /><Input type="time" value={value.closesAt ?? "17:00"} disabled={value.isClosed} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} className="h-8 px-2 text-[12px]" dir="ltr" /><Button variant="ghost" size="icon" className="size-8 text-[var(--md-red)]" aria-label={t("Remove override")} onClick={onRemove}><Trash2 className="size-3.5" /></Button></div>
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
}
