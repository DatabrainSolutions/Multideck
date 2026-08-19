import type { ReactNode } from "react"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import type { ScreeningListStatus, ScreeningMatch, ScreeningOutcome } from "@/lib/screening-api"
import { cn } from "@/lib/utils"

const outcomeTone: Record<ScreeningOutcome, "green" | "amber" | "red" | "neutral"> = {
  clear: "green",
  possible_match: "amber",
  match: "red",
  unavailable: "neutral",
}

const outcomeLabel: Record<ScreeningOutcome, string> = {
  clear: "No match",
  possible_match: "Possible match",
  match: "Match",
  unavailable: "List unavailable",
}

export function screeningOutcomeLabel(outcome: ScreeningOutcome) {
  return outcomeLabel[outcome]
}

export function ScreeningOutcomePill({
  outcome,
  stale = false,
  className,
}: {
  outcome: ScreeningOutcome
  stale?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <StatusPill tone={outcomeTone[outcome]}>{t(outcomeLabel[outcome])}</StatusPill>
      {stale ? <StatusPill tone="amber">{t("List stale")}</StatusPill> : null}
    </span>
  )
}

export function ScreeningListFreshness({
  list,
  action,
  className,
}: {
  list: ScreeningListStatus | null
  action?: ReactNode
  className?: string
}) {
  const { t, language } = useLanguage()
  const loaded = Boolean(list?.loaded)
  const downloaded = list?.downloadedAt ? formatScreeningTime(list.downloadedAt, language) : null
  const meta = !loaded
    ? t("The UK OFSI list has not been loaded into this workspace yet.")
    : list?.stale
      ? t("This list is older than 36 hours. Refresh before relying on a no-match result.")
      : t("Names are screened against the copy stored in this workspace, not a live government website.")

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{t(list?.sourceName || "UK OFSI consolidated list")}</p>
          <StatusPill tone={!loaded ? "neutral" : list?.stale ? "amber" : "green"}>
            {t(!loaded ? "Not loaded" : list?.stale ? "Needs refresh" : "Current")}
          </StatusPill>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
          {list?.publisher ? `${t(list.publisher)} · ` : null}
          {loaded ? `${Number(list?.entryCount ?? 0).toLocaleString()} ${t("names")}` : t("No local copy")}
          {downloaded ? ` · ${t("Updated")} ${downloaded}` : ""}
        </p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{meta}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function ScreeningMatchRow({ match }: { match: ScreeningMatch }) {
  const { t, language } = useLanguage()
  const facts = [
    match.groupType,
    match.regime,
    match.country,
    match.listedOn ? `${t("Listed")} ${formatScreeningDate(match.listedOn, language)}` : null,
    match.ukRef,
  ].filter(Boolean)

  return (
    <div className="grid gap-1 border-t border-[rgba(11,20,19,0.06)] px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{match.listedName}</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{facts.join(" · ") || t("Listed name")}</p>
      </div>
      <StatusPill tone={match.matchKind === "exact" ? "red" : "amber"}>
        {t(match.matchKind === "exact" ? "Exact name" : "Similar name")}
      </StatusPill>
    </div>
  )
}

function formatScreeningTime(value: string, language: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)
}

function formatScreeningDate(value: string, language: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date)
}
