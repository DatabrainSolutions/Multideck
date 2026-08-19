import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Pagination } from "@/components/multideck/pagination"
import { StatusPill } from "@/components/multideck/status-pill"
import { Input } from "@/components/ui/input"
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
    match.country,
    match.listedOn ? `${t("Listed")} ${formatScreeningDate(match.listedOn, language)}` : null,
  ].filter(Boolean)

  return (
    <div className="grid gap-2 border-t border-[rgba(11,20,19,0.06)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium text-[var(--md-ink)]">{match.listedName}</p>
        <StatusPill tone={match.matchKind === "exact" ? "red" : "amber"}>
          {t(match.matchKind === "exact" ? "Exact name" : "Similar name")}
        </StatusPill>
      </div>
      {match.regime ? (
        <p className="text-[13px] leading-5 text-[var(--md-ink)]">
          <span className="text-[var(--md-text)]">{t("Sanctions programme")}</span>
          {": "}
          {match.regime}
        </p>
      ) : null}
      {match.ukRef ? (
        <p className="text-[13px] leading-5 text-[var(--md-ink)]" dir="ltr">
          <span className="text-[var(--md-text)]">{t("UK list reference")}</span>
          {": "}
          {match.ukRef}
        </p>
      ) : null}
      {facts.length ? <p className="text-[12px] leading-5 text-[var(--md-text)]">{facts.join(" · ")}</p> : null}
      {match.listingNotes ? (
        <div>
          <p className="text-[12px] font-medium text-[var(--md-text)]">{t("Why listed")}</p>
          <p className="mt-1 text-[13px] leading-5 text-[var(--md-ink)]" dir="auto">{match.listingNotes}</p>
        </div>
      ) : null}
    </div>
  )
}

export const SCREENING_MATCH_PAGE_SIZE = 12

export function ScreeningMatchList({ matches }: { matches: ScreeningMatch[] }) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(1)
  const needle = filter.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!needle) return matches
    return matches.filter((match) => (
      [match.listedName, match.regime, match.ukRef, match.listingNotes, match.country, match.groupType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ))
  }, [matches, needle])
  const pageCount = Math.max(1, Math.ceil(visible.length / SCREENING_MATCH_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paged = visible.slice((currentPage - 1) * SCREENING_MATCH_PAGE_SIZE, currentPage * SCREENING_MATCH_PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [needle, matches])

  if (!matches.length) return null

  return (
    <div>
      {matches.length > 6 ? (
        <div className="grid gap-2 border-t border-[rgba(11,20,19,0.06)] px-5 py-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Filter listed names")}</span>
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("Name, programme or UK reference")}
              className="h-9 rounded-[var(--md-radius-md)]"
              dir="auto"
            />
          </label>
        </div>
      ) : null}
      {paged.map((match) => (
        <ScreeningMatchRow key={`${match.groupId}-${match.listedName}-${match.ukRef ?? ""}`} match={match} />
      ))}
      {needle && !visible.length ? (
        <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-text)]">
          {t("No listed names match this filter.")}
        </p>
      ) : null}
      {visible.length ? (
        <div className="border-t border-[rgba(11,20,19,0.06)] p-3">
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            totalItems={visible.length}
            pageSize={SCREENING_MATCH_PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="listed names"
            className="rounded-[var(--md-radius-lg)]"
          />
        </div>
      ) : null}
    </div>
  )
}

export function ScreeningResultSummary({
  subjectName,
  country,
  outcome,
}: {
  subjectName: string
  country?: string | null
  outcome: ScreeningOutcome
}) {
  const { t } = useLanguage()
  const explanation = outcome === "match"
    ? t("This name matches a person or organisation on the UK OFSI consolidated list. Review the sanctions programme and listing notes below before proceeding.")
    : outcome === "possible_match"
      ? t("This name is similar to a listed person or organisation. Confirm whether it is the same party, then review the sanctions details below.")
      : outcome === "unavailable"
        ? t("The UK OFSI list is not available in this workspace, so this name could not be screened.")
        : t("No listed names matched this search. That is not a legal clearance.")

  return (
    <div className="px-5 pb-3">
      <p className="text-[13px] text-[var(--md-ink)]">
        {subjectName}
        {country ? ` · ${country}` : ""}
      </p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{explanation}</p>
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
