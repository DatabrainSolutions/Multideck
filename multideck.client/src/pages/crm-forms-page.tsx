import { useState } from "react"
import { Bell, FileCheck2, FileText, Link2, LockKeyhole, Send, Signature } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"

const plannedTemplates = [
  { name: "Credit application", purpose: "Collect credit and trading details before account approval.", fields: ["Organisation", "Credit limit", "Accounts contact", "Trade references"] },
  { name: "Power of attorney", purpose: "Capture authorisation details for customs representation.", fields: ["Organisation", "Authority scope", "Effective date", "Authorised signatory"] },
  { name: "Customer onboarding", purpose: "Gather operational, billing and compliance setup information.", fields: ["Organisation", "Billing", "Operations contacts", "Trading lanes"] },
  { name: "Supplier form", purpose: "Collect supplier identity, payment and service details.", fields: ["Supplier", "Payment details", "Services", "Compliance"] },
]

export function CrmFormsPage() {
  const { t } = useLanguage()
  const [view, setView] = useState("Templates")
  const [selectedName, setSelectedName] = useState(plannedTemplates[0].name)
  const selected = plannedTemplates.find((template) => template.name === selectedName) ?? plannedTemplates[0]

  return (
    <div className="md-page md-page-stack-compact">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t("Forms")}</h1><StatusPill tone="amber">{t("Planned")}</StatusPill></div>
          <p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{t("Preview the intended form library, data mapping and request workflow. Creation, sending and electronic signatures are not connected yet.")}</p>
        </div>
        <SegmentedControl options={[t("Templates"), t("Requests")]} value={t(view)} onChange={(value) => setView(value === t("Requests") ? "Requests" : "Templates")} ariaLabel={t("Forms view")} />
      </div>

      <Surface padding="md" className="rounded-[var(--md-radius-xl)]" role="status">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]"><LockKeyhole className="size-4" strokeWidth={1.3} /></span>
          <div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Not connected yet")}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("This is an honest workflow preview. Nothing on this page saves, sends, signs or schedules reminders, and no form API calls are made.")}</p></div>
        </div>
      </Surface>

      {view === "Templates" ? (
        <div className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
          <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
            <div className="px-4 py-4"><SectionHeader title={t("Template library")} meta={t("Planned form types")} /></div>
            <div className="grid gap-1 p-2 pt-0">
              {plannedTemplates.map((template) => (
                <button key={template.name} type="button" onClick={() => setSelectedName(template.name)} className={`w-full rounded-[var(--md-radius-lg)] px-3 py-3 text-start transition-colors ${selected.name === template.name ? "bg-[var(--md-selected-bg)] shadow-[var(--md-shadow-line)]" : "hover:bg-[var(--md-surface-soft)]"}`}>
                  <span className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium text-[var(--md-ink)]">{t(template.name)}</span><StatusPill tone="neutral">{t("Planned")}</StatusPill></span>
                  <span className="mt-1 block text-[11px] leading-4 text-[var(--md-subtle)]">{t(template.purpose)}</span>
                </button>
              ))}
            </div>
          </Surface>

          <div className="grid min-w-0 gap-[var(--md-page-stack-gap-compact)]">
            <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><SectionHeader title={t(selected.name)} meta={t(selected.purpose)} /><Button disabled><FileCheck2 className="size-4" />{t("Save template")}</Button></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {selected.fields.map((field, index) => <div key={field} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]"><p className="text-[10px] font-medium text-[var(--md-subtle)]">{t("Field")} {index + 1}</p><p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{t(field)}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Input type and validation will be configured when Forms is connected.")}</p></div>)}
              </div>
            </Surface>
            <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
              <SectionHeader title={t("CRM data mapping")} meta={t("Intended field connections")} />
              <div className="mt-4 grid gap-2">
                {selected.fields.map((field) => <div key={field} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-3"><span className="text-[12px] font-medium text-[var(--md-ink)]">{t(field)}</span><Link2 className="size-3.5 text-[var(--md-subtle)]" /><span className="text-[12px] text-[var(--md-subtle)]">{t("Not mapped")}</span></div>)}
              </div>
            </Surface>
          </div>
        </div>
      ) : (
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><SectionHeader title={t("Form requests")} meta={t("No requests have been created")} /><div className="flex flex-wrap gap-2"><Button disabled variant="outline"><Bell className="size-4" />{t("Send reminder")}</Button><Button disabled><Send className="size-4" />{t("Send form")}</Button></div></div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["Recipient", "Template", "Requested", "Status", "Signature"].map((heading) => <TableHead key={heading}>{t(heading)}</TableHead>)}</TableRow></TableHeader><TableBody><TableRow><TableCell colSpan={5} className="h-48 text-center"><div className="mx-auto max-w-md"><span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)]"><FileText className="size-4" /></span><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No form requests yet")}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-subtle)]">{t("Requests will appear here with sent, viewed, completed and signature status after Forms is connected.")}</p><Button disabled className="mt-4"><Signature className="size-4" />{t("Create request")}</Button></div></TableCell></TableRow></TableBody></Table></div>
        </Surface>
      )}
    </div>
  )
}
