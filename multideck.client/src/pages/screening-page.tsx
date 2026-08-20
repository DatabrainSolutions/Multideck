import { useEffect, useMemo, useState, type FormEvent } from "react"
import { CheckCircle2, Download, FileText, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from "@/components/icons/hugeicons"
import { Pagination } from "@/components/multideck/pagination"
import { ScreeningListFreshness, ScreeningMatchList, ScreeningOutcomePill, ScreeningResultSummary } from "@/components/multideck/screening-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import {
  decideScreeningCheck,
  downloadScreeningControlReport,
  getScreeningCheck,
  getScreeningControlReport,
  getScreeningWorkspace,
  refreshScreeningList,
  runScreeningCheck,
  type ScreeningCheck,
  type ScreeningControlReport,
  type ScreeningListStatus,
  type ScreeningSourceArea,
} from "@/lib/screening-api"

const RECENT_PAGE_SIZE = 10

const sourceAreas: { value: ScreeningSourceArea; label: string }[] = [
  { value: "manual", label: "Standalone compliance check" },
  { value: "customer", label: "Customer" },
  { value: "crm", label: "CRM" },
  { value: "quote", label: "Quote" },
  { value: "booking", label: "Booking" },
  { value: "customs", label: "Customs declaration" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other workflow" },
]

const subjectRoles = ["Party", "Customer", "Supplier", "Carrier", "Agent", "Shipper", "Consignee", "Consignor", "Contact", "Customs declarant"]

function decisionTone(check: ScreeningCheck) {
  if (check.decisionCode === "sanctioned") return "red" as const
  if (check.decisionCode === "review_required") return "amber" as const
  if (check.decisionCode === "unavailable") return "neutral" as const
  return "green" as const
}

function decisionLabel(check: ScreeningCheck) {
  if (check.decisionCode === "automatic_clear") return "Automatic clear"
  if (check.decisionCode === "manual_clean") return "Manual clear"
  if (check.decisionCode === "sanctioned") return "Sanctioned"
  if (check.decisionCode === "unavailable") return "Do not rely on this result"
  return "Review required"
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function ScreeningPage() {
  const { t, language } = useLanguage()
  const [list, setList] = useState<ScreeningListStatus | null>(null)
  const [checks, setChecks] = useState<ScreeningCheck[]>([])
  const [active, setActive] = useState<ScreeningCheck | null>(null)
  const [controlReport, setControlReport] = useState<ScreeningControlReport | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [country, setCountry] = useState("")
  const [sourceArea, setSourceArea] = useState<ScreeningSourceArea>("manual")
  const [sourceReference, setSourceReference] = useState("")
  const [subjectRole, setSubjectRole] = useState("Party")
  const [includeSimilar, setIncludeSimilar] = useState(false)
  const [running, setRunning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deciding, setDeciding] = useState<"manual_clean" | "sanctioned" | null>(null)
  const [reporting, setReporting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [recentPage, setRecentPage] = useState(1)

  const recentPageCount = Math.max(1, Math.ceil(checks.length / RECENT_PAGE_SIZE))
  const visibleRecent = useMemo(() => checks.slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE), [checks, recentPage])

  async function loadWorkspace() {
    setLoadState("loading")
    setError(null)
    try {
      const workspace = await getScreeningWorkspace()
      setList(workspace.list)
      setChecks(workspace.checks)
      const checkId = new URLSearchParams(window.location.search).get("check")
      if (checkId) {
        try {
          const fromList = workspace.checks.find((check) => check.id === checkId)
          setActive(fromList?.matches ? fromList : await getScreeningCheck(checkId))
        } catch {
          /* keep the workspace even if the linked result is gone */
        }
      }
      setLoadState("ready")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Party screening could not be loaded."))
      setLoadState("error")
    }
  }

  useEffect(() => { void loadWorkspace() }, [])
  useEffect(() => { if (recentPage > recentPageCount) setRecentPage(recentPageCount) }, [recentPage, recentPageCount])

  function updateCheck(check: ScreeningCheck) {
    setActive(check)
    setChecks((current) => [check, ...current.filter((item) => item.id !== check.id)].slice(0, 500))
    setRecentPage(1)
  }

  async function onScreen(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setRunning(true)
    setError(null)
    try {
      const result = await runScreeningCheck({
        subjectName: name.trim(),
        country: country.trim() || null,
        sourceArea,
        sourceLabel: sourceReference.trim() || null,
        subjectRole: subjectRole.toLowerCase().replace(/\s+/g, "_"),
        includeSimilar,
      })
      updateCheck(result)
      setControlReport(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The name could not be screened."))
    } finally {
      setRunning(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const result = await refreshScreeningList()
      setList(result.list)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The government list could not be refreshed."))
    } finally {
      setRefreshing(false)
    }
  }

  async function onDecision(action: "manual_clean" | "sanctioned") {
    if (!active) return
    setDeciding(action)
    setError(null)
    try {
      const result = await decideScreeningCheck(active.id, action)
      updateCheck(result)
      setControlReport(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The screening decision could not be recorded."))
    } finally {
      setDeciding(null)
    }
  }

  async function onRunReport() {
    setReporting(true)
    setError(null)
    try {
      setControlReport(await getScreeningControlReport())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The screening report could not be generated."))
    } finally {
      setReporting(false)
    }
  }

  async function onDownloadReport() {
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadScreeningControlReport()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "multideck-party-screening-report.csv"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("The detailed screening report could not be downloaded."))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="md-page md-page-stack">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-5 text-[var(--md-accent)]" />
          <h1 className="text-[24px] font-medium text-[var(--md-ink)]">{t("Compliance controls")}</h1>
        </div>
        <p className="mt-2 max-w-[58rem] text-[13px] leading-5 text-[var(--md-text)]">
          {t("Screen parties from any Multideck workflow - including CRM, quotes, bookings, customs and documents - against the UK Sanctions List held in this tenant workspace. A name match is a review item, not a legal determination.")}
        </p>
      </section>

      <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
        <ScreeningListFreshness
          list={list}
          action={<Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)]" onClick={() => void onRefresh()} disabled={refreshing}>{refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{t(refreshing ? "Refreshing list…" : "Refresh list")}</Button>}
        />
      </Surface>

      <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Screening report")}</h2>
            <p className="mt-1 max-w-[48rem] text-[12px] leading-5 text-[var(--md-text)]">{t("Source: current UK Sanctions List from FCDO/OFSI, stored in this tenant workspace. Exact normalised names always match; similar names use the optional 82% trigram and word-similarity review rule.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)]" onClick={() => void onDownloadReport()} disabled={downloading}>{downloading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{t("Download detailed report")}</Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-sidebar-bg)] text-[var(--md-ink)]" onClick={() => void onRunReport()} disabled={reporting}>{reporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}{t(reporting ? "Running report…" : "Run screening report")}</Button>
          </div>
        </div>
        {controlReport ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Screened" value={controlReport.report.screened} />
          <Metric label="Automatic clear" value={controlReport.report.automaticClear} tone="green" />
          <Metric label="Manual clear" value={controlReport.report.manualClear} tone="green" />
          <Metric label="Current possible matches" value={controlReport.report.reviewRequired} tone="amber" />
          <Metric label="Sanctioned" value={controlReport.report.sanctioned} tone="red" />
          <Metric label="Next rescreen due" value={formatDate(controlReport.report.nextRescreenDueAt, language) || "-"} />
        </div> : null}
      </Surface>

      <div className="md-panel-grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="md-panel-column">
          <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Screen a party")}</h2>
            <form className="mt-4 grid gap-3" onSubmit={(event) => void onScreen(event)}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <label className="grid gap-1.5"><span className="text-[12px] font-medium text-[var(--md-text)]">{t("Name")}</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Customer, shipper or consignee")} className="h-9 rounded-[var(--md-radius-md)]" dir="auto" /></label>
                <label className="grid gap-1.5"><span className="text-[12px] font-medium text-[var(--md-text)]">{t("Country")}</span><Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("Optional")} className="h-9 rounded-[var(--md-radius-md)]" dir="ltr" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <NativeSelect label={t("Workflow context")} value={sourceArea} onChange={(value) => setSourceArea(value as ScreeningSourceArea)} options={sourceAreas.map((item) => ({ value: item.value, label: t(item.label) }))} />
                <NativeSelect label={t("Party role")} value={subjectRole} onChange={setSubjectRole} options={subjectRoles.map((role) => ({ value: role, label: t(role) }))} />
              </div>
              {sourceArea !== "manual" ? <label className="grid gap-1.5"><span className="text-[12px] font-medium text-[var(--md-text)]">{t("Workflow reference")}</span><Input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder={t("Quote, booking, declaration or document reference")} className="h-9 rounded-[var(--md-radius-md)]" dir="auto" /></label> : null}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="flex max-w-[34rem] cursor-pointer items-start gap-2 text-[12px] leading-5 text-[var(--md-text)]"><input type="checkbox" checked={includeSimilar} onChange={(event) => setIncludeSimilar(event.target.checked)} className="mt-1 size-3.5 accent-[var(--md-accent)]" /><span><strong className="font-medium text-[var(--md-ink)]">{t("Include similar names")}</strong><br />{t("Use the 82% fuzzy match rule for human review. Exact names are always checked.")}</span></label>
                <Button type="submit" disabled={running || !name.trim()} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{running ? <LoaderCircle className="size-4 animate-spin" /> : null}{t(running ? "Screening…" : "Screen")}</Button>
              </div>
            </form>
            {error ? <p className="mt-3 text-[12px] text-[var(--md-red)]">{error}</p> : null}
          </Surface>

          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Latest result")}</h2>{active ? <div className="flex flex-wrap items-center gap-2"><ScreeningOutcomePill outcome={active.outcome} stale={active.listStale} /><StatusPill tone={decisionTone(active)}>{t(decisionLabel(active))}</StatusPill></div> : null}</div>
            {active ? <div>
              <ScreeningResultSummary subjectName={active.subjectName} country={active.country} outcome={active.outcome} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 text-[12px] text-[var(--md-text)]"><span>{t("Context")}: {t(sourceAreas.find((item) => item.value === active.sourceArea)?.label ?? "Other workflow")}</span><span>{t("Role")}: {t(active.subjectRole.replace(/_/g, " "))}</span><span>{t("Rescreen due")}: {formatDate(active.rescreenDueAt, language) || "-"}</span></div>
              {active.decisionCode === "review_required" ? <div className="flex flex-wrap gap-2 border-t border-[rgba(11,20,19,0.06)] px-5 py-3"><Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)]" onClick={() => void onDecision("manual_clean")} disabled={deciding !== null}>{deciding === "manual_clean" ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{t("Mark clean")}</Button><Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[var(--md-red)]" onClick={() => void onDecision("sanctioned")} disabled={deciding !== null}>{deciding === "sanctioned" ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}{t("Mark sanctioned")}</Button></div> : null}
              {active.matches?.length ? <ScreeningMatchList matches={active.matches} /> : active.outcome === "clear" || active.outcome === "unavailable" ? null : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("No listed names matched this search.")}</p>}
            </div> : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("Screen a name to see the current list result here.")}</p>}
          </Surface>
        </div>

        <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
          <div className="px-5 py-4"><h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Recent screens")}</h2><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("from the last 3 months")}</p></div>
          {loadState === "loading" ? <div className="grid min-h-28 place-items-center border-t border-[rgba(11,20,19,0.06)]"><LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /></div> : null}
          {loadState === "error" ? <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("Party screening could not be loaded.")}</p> : null}
          {loadState === "ready" && visibleRecent.map((check) => <button key={check.id} type="button" onClick={() => { setActive(check); void getScreeningCheck(check.id).then(setActive).catch(() => undefined) }} className="grid w-full gap-1 border-t border-[rgba(11,20,19,0.06)] px-5 py-3 text-start hover:bg-[var(--md-hover)]"><div className="flex items-center justify-between gap-3"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{check.subjectName}</p><StatusPill tone={decisionTone(check)}>{t(decisionLabel(check))}</StatusPill></div><p className="text-[12px] text-[var(--md-text)]">{t(check.subjectRole.replace(/_/g, " "))} · {formatDate(check.createdAt, language)}{check.sourceLabel ? ` · ${check.sourceLabel}` : ""}</p></button>)}
          {loadState === "ready" && !checks.length ? <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("No screening results are recorded in the last 3 months.")}</p> : null}
          {loadState === "ready" && checks.length > RECENT_PAGE_SIZE ? <div className="border-t border-[rgba(11,20,19,0.06)] p-3"><Pagination page={recentPage} pageCount={recentPageCount} totalItems={checks.length} pageSize={RECENT_PAGE_SIZE} onPageChange={setRecentPage} itemLabel="screening results" className="rounded-[var(--md-radius-lg)]" /></div> : null}
        </Surface>
      </div>
    </div>
  )
}

function NativeSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5"><span className="text-[12px] font-medium text-[var(--md-text)]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-[var(--md-radius-md)] border border-[rgba(11,20,19,0.12)] bg-[var(--md-surface)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" dir="auto">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "amber" | "red" }) {
  const toneClass = tone === "green" ? "bg-[rgba(22,163,74,0.06)]" : tone === "amber" ? "bg-[rgba(245,158,11,0.08)]" : tone === "red" ? "bg-[rgba(185,28,28,0.06)]" : "bg-[var(--md-hover)]"
  return <div className={`rounded-[var(--md-radius-lg)] px-3 py-3 ${toneClass}`}><p className="text-[11px] font-medium text-[var(--md-text)]">{label}</p><p className="mt-1 text-[19px] font-medium text-[var(--md-ink)]">{value}</p></div>
}
