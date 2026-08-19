import { useEffect, useState, type FormEvent } from "react"
import { LoaderCircle, RefreshCw, ShieldCheck } from "@/components/icons/hugeicons"
import { ScreeningListFreshness, ScreeningMatchList, ScreeningOutcomePill, ScreeningResultSummary } from "@/components/multideck/screening-components"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import {
  getScreeningCheck,
  getScreeningWorkspace,
  refreshScreeningList,
  runScreeningCheck,
  type ScreeningCheck,
  type ScreeningListStatus,
} from "@/lib/screening-api"

export function ScreeningPage() {
  const { t } = useLanguage()
  const [list, setList] = useState<ScreeningListStatus | null>(null)
  const [checks, setChecks] = useState<ScreeningCheck[]>([])
  const [active, setActive] = useState<ScreeningCheck | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [country, setCountry] = useState("")
  const [running, setRunning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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

  useEffect(() => {
    void loadWorkspace()
  }, [])

  async function onScreen(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setRunning(true)
    setError(null)
    try {
      const result = await runScreeningCheck({ subjectName: name.trim(), country: country.trim() || null })
      setActive(result)
      setChecks((current) => [result, ...current.filter((check) => check.id !== result.id)].slice(0, 40))
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

  return (
    <div className="md-page md-page-stack">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-5 text-[var(--md-accent)]" />
          <h1 className="text-[24px] font-medium text-[var(--md-ink)]">{t("Compliance controls")}</h1>
        </div>
        <p className="mt-2 max-w-[52rem] text-[13px] leading-5 text-[var(--md-text)]">
          {t("Screen a customer, shipper or consignee against the UK OFSI consolidated list kept in this workspace. A match is a review item, not a legal determination.")}
        </p>
      </section>

      <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
        <ScreeningListFreshness
          list={list}
          action={
            <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)]" onClick={() => void onRefresh()} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {t(refreshing ? "Refreshing list…" : "Refresh list")}
            </Button>
          }
        />
      </Surface>

      <div className="md-panel-grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="md-panel-column">
          <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Screen a party")}</h2>
            <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end" onSubmit={(event) => void onScreen(event)}>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Name")}</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Customer, shipper or consignee")} className="h-9 rounded-[var(--md-radius-md)]" dir="auto" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Country")}</span>
                <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("Optional")} className="h-9 rounded-[var(--md-radius-md)]" dir="ltr" />
              </label>
              <Button type="submit" disabled={running || !name.trim()} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[var(--md-accent-ink)]">
                {running ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {t(running ? "Screening…" : "Screen")}
              </Button>
            </form>
            <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">
              {t("Exact names and close spellings are both returned. Similar names are treated as possible matches.")}
            </p>
            {error ? <p className="mt-3 text-[12px] text-[var(--md-red)]">{error}</p> : null}
          </Surface>

          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Latest result")}</h2>
              {active ? <ScreeningOutcomePill outcome={active.outcome} stale={active.listStale} /> : null}
            </div>
            {active ? (
              <div>
                <ScreeningResultSummary subjectName={active.subjectName} country={active.country} outcome={active.outcome} />
                {active.matches?.length
                  ? <ScreeningMatchList matches={active.matches} />
                  : active.outcome === "clear" || active.outcome === "unavailable"
                    ? null
                    : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("No listed names matched this search.")}</p>}
              </div>
            ) : (
              <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("Screen a name to see the current list result here.")}</p>
            )}
          </Surface>
        </div>

        <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
          <div className="px-5 py-4">
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Recent screens")}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("from the last 3 months")}</p>
          </div>
          {loadState === "loading" ? (
            <div className="grid min-h-28 place-items-center border-t border-[rgba(11,20,19,0.06)]">
              <LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" />
            </div>
          ) : loadState === "error" ? (
            <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("Party screening could not be loaded.")}</p>
          ) : checks.length ? checks.map((check) => (
            <button
              key={check.id}
              type="button"
              onClick={() => {
                setActive(check)
                void getScreeningCheck(check.id).then(setActive).catch(() => undefined)
              }}
              className="grid w-full gap-1 border-t border-[rgba(11,20,19,0.06)] px-5 py-3 text-start hover:bg-[var(--md-hover)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{check.subjectName}</p>
                <ScreeningOutcomePill outcome={check.outcome} stale={check.listStale} />
              </div>
              <p className="text-[12px] text-[var(--md-text)]">
                {check.matchCount ? `${check.matchCount} ${t(check.matchCount === 1 ? "listed name" : "listed names")}` : t("No listed names")}
              </p>
            </button>
          )) : (
            <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">{t("No screening results are recorded in the last 3 months.")}</p>
          )}
        </Surface>
      </div>
    </div>
  )
}
