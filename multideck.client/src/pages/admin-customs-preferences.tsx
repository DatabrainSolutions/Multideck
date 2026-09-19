import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { generateDucr } from "@/lib/customs-ducr"
import { getCustomsReferencePreferences, type CustomsReferencePreferencesState } from "@/lib/customs-reference-preferences"

export function AdminCustomsPreferences() {
  const { t } = useLanguage()
  const [state, setState] = useState<CustomsReferencePreferencesState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    getCustomsReferencePreferences().then((value) => { if (active) setState(value) })
      .catch((reason: Error) => { if (active) setError(reason.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const change = (patch: Partial<CustomsReferencePreferencesState["settings"]>) => {
    setState((current) => current ? { ...current, settings: { ...current.settings, ...patch } } : current)
    setFeedback("")
  }
  const save = async () => {
    if (!state) return
    setSaving(true); setError(""); setFeedback("")
    try {
      setState(await getCustomsReferencePreferences(state.settings, state.version))
      setFeedback("Customs preferences saved.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Customs preferences could not be saved.") }
    finally { setSaving(false) }
  }
  const selectedEori = state?.settings.officeEoris[state.settings.defaultOfficeId] || state?.settings.eori || ""
  const preview = generateDucr(selectedEori, "JC000123", new Date().getFullYear())
  return <section id="customs-preferences" className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
    <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Customs preferences")}</h2>
    <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Registered identifiers and badge codes shared by your customs team. Existing declaration references stay unchanged.")}</p>
    {loading ? <p role="status" className="mt-4 text-[12px]">{t("Loading customs preferences…")}</p> : null}
    {state ? <fieldset disabled={saving || !state.canManage} className="mt-4 min-w-0 space-y-4 disabled:opacity-70">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[11px] text-[var(--md-text)]"><span>{t("Company registered EORI")}</span><Input value={state.settings.eori} maxLength={17} onChange={(event) => change({ eori: event.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
        <label className="grid gap-1.5 text-[11px] text-[var(--md-text)]"><span>{t("Default customs office")}</span><Select value={state.settings.defaultOfficeId || "company"} onValueChange={(value) => change({ defaultOfficeId: value === "company" ? "" : value })}><SelectTrigger aria-label={t("Default customs office")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">{t("Company EORI")}</SelectItem>{state.offices.map((office) => <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>)}</SelectContent></Select></label>
      </div>
      <p className="text-[11px] leading-5 text-[var(--md-subtle)]">{t("Use the full registered EORI, including its country prefix. Do not construct it from a VAT number or an unregistered office suffix.")}</p>
      {state.offices.length ? <div className="grid gap-3 sm:grid-cols-2">{state.offices.map((office) => <label key={office.id} className="grid gap-1.5 text-[11px] text-[var(--md-text)]"><span>{office.name} · {t("EORI override (optional)")}</span><Input placeholder={t("Use company EORI")} maxLength={17} value={state.settings.officeEoris[office.id] || ""} onChange={(event) => change({ officeEoris: { ...state.settings.officeEoris, [office.id]: event.target.value.toUpperCase().replace(/\s/g, "") } })} /></label>)}</div> : null}
      <p className="text-[12px] text-[var(--md-text)]">{t("DUCR preview")}: <span className="font-medium">{preview || t("Enter a valid EORI to see a preview")}</span></p>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--md-hairline)] pt-4"><h3 className="text-[13px] font-medium">{t("Badge codes")}</h3><Button type="button" variant="outline" disabled={state.settings.badges.length >= 100} onClick={() => change({ badges: [...state.settings.badges, { id: crypto.randomUUID(), code: "", provider: "", portCode: "", portName: "", active: true }] })}>{t("Add badge")}</Button></div>
      {!state.settings.badges.length ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Add a provider, port and badge code to make it available on declarations.")}</p> : null}
      {state.settings.badges.map((badge, index) => <div key={badge.id} className="grid gap-3 border-b border-[var(--md-hairline)] pb-4 sm:grid-cols-2 lg:grid-cols-5">
        {([['provider', 'Provider'], ['portName', 'Port name'], ['portCode', 'UN/LOCODE'], ['code', 'Badge code']] as const).map(([key, label]) => <label key={key} className="grid gap-1.5 text-[11px] text-[var(--md-text)]"><span>{t(label)}</span><Input aria-label={`${t(label)} ${index + 1}`} value={badge[key]} maxLength={key === 'portCode' ? 5 : key === 'code' ? 40 : key === 'provider' ? 80 : 180} onChange={(event) => change({ badges: state.settings.badges.map((entry) => entry.id === badge.id ? { ...entry, [key]: key === 'code' || key === 'portCode' ? event.target.value.toUpperCase().replace(/\s/g, '') : event.target.value } : entry) })} /></label>)}
        <label className="grid gap-1.5 text-[11px] text-[var(--md-text)]"><span>{t("Availability")}</span><Select value={badge.active ? 'active' : 'inactive'} onValueChange={(value) => change({ badges: state.settings.badges.map((entry) => entry.id === badge.id ? { ...entry, active: value === 'active' } : entry) })}><SelectTrigger aria-label={`${t("Badge availability")} ${index + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t("Active")}</SelectItem><SelectItem value="inactive">{t("Inactive")}</SelectItem></SelectContent></Select></label>
        {!badge.code && !badge.provider && !badge.portName && !badge.portCode ? <Button type="button" variant="ghost" className="justify-self-start" onClick={() => change({ badges: state.settings.badges.filter((entry) => entry.id !== badge.id) })}>{t("Discard empty badge")}</Button> : null}
      </div>)}
      <div className="flex justify-end"><Button type="button" onClick={() => void save()}>{t(saving ? "Saving…" : "Save customs preferences")}</Button></div>
    </fieldset> : null}
    {error ? <div role="alert" className="mt-3 text-[12px] text-[var(--md-red)]"><p>{t(error)}</p><Button type="button" variant="ghost" onClick={() => setRetry((value) => value + 1)}>{t("Reload preferences")}</Button></div> : null}
    {feedback ? <p role="status" className="mt-3 text-[12px] text-[var(--md-green)]">{t(feedback)}</p> : null}
  </section>
}
