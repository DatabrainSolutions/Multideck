import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown } from "@/components/icons/hugeicons"
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
  compact = false,
  className,
}: {
  list: ScreeningListStatus | null
  action?: ReactNode
  compact?: boolean
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
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:justify-between", compact ? "sm:items-center" : "sm:items-start", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("font-medium text-[var(--md-ink)]", compact ? "text-[13px]" : "text-[14px]")}>{t(list?.sourceName || "UK OFSI consolidated list")}</p>
          <StatusPill tone={!loaded ? "neutral" : list?.stale ? "amber" : "green"}>
            {t(!loaded ? "Not loaded" : list?.stale ? "Needs refresh" : "Current")}
          </StatusPill>
        </div>
        {compact ? (
          <p className="mt-1 text-[11.5px] leading-4 text-[var(--md-text)]">
            {downloaded ? <>{t("Updated")} <bdi>{downloaded}</bdi></> : t("No local copy")}
            {list?.stale ? <> · {t("Refresh before relying on a no-match result.")}</> : null}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
              {list?.publisher ? `${t(list.publisher)} · ` : null}
              {loaded ? `${Number(list?.entryCount ?? 0).toLocaleString()} ${t("names")}` : t("No local copy")}
              {downloaded ? ` · ${t("Updated")} ${downloaded}` : ""}
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{meta}</p>
          </>
        )}
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
    <article className="grid gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-shadow-line)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 break-words text-[13px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">{match.listedName}</p>
        <StatusPill tone={match.matchKind === "exact" ? "red" : "amber"}>
          {t(match.matchKind === "exact" ? "Exact name" : "Similar name")}
        </StatusPill>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {match.regime ? <ScreeningFact label={t("Sanctions programme")} value={match.regime} /> : null}
        {match.ukRef ? <ScreeningFact label={t("UK list reference")} value={match.ukRef} code /> : null}
      </div>
      {facts.length ? <p className="text-[12px] leading-5 text-[var(--md-text)]" dir="auto">{facts.join(" · ")}</p> : null}
      {match.listingNotes ? (
        <details className="group/listing">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-[var(--md-radius-sm)] text-[12px] font-medium text-[var(--md-accent)] outline-none transition-[color,transform] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a18)] active:scale-[0.96] marker:hidden motion-reduce:transition-none motion-reduce:active:scale-100">
            <span>{t("Why listed")}</span>
            <ChevronDown className="size-3.5 transition-transform duration-150 group-open/listing:rotate-180 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <p className="mt-2 max-w-[75ch] break-words text-pretty text-[13px] leading-5 text-[var(--md-ink)]" dir="auto">{match.listingNotes}</p>
        </details>
      ) : null}
    </article>
  )
}

function ScreeningFact({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-4 text-[var(--md-subtle)]">{label}</p>
      <p className="mt-0.5 break-words text-[12.5px] font-medium leading-4 text-[var(--md-ink)]" dir={code ? "ltr" : "auto"} data-i18n-skip={code || undefined}>{value}</p>
    </div>
  )
}

export const SCREENING_MATCH_PAGE_SIZE = 12

export function ScreeningMatchList({ matches, className }: { matches: ScreeningMatch[]; className?: string }) {
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
    <div className={cn("grid gap-3 px-4 pb-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Listed matches")}</h3>
        <p className="text-[12px] tabular-nums text-[var(--md-subtle)]"><bdi>{matches.length.toLocaleString()}</bdi> {t(matches.length === 1 ? "result" : "results")}</p>
      </div>
      {matches.length > 6 ? (
        <div className="grid gap-2">
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
        <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-4 shadow-[var(--md-shadow-line)]">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No listed names match this filter")}</p>
          <button type="button" className="mt-2 text-[12px] font-medium text-[var(--md-accent)] underline decoration-from-font underline-offset-4" onClick={() => setFilter("")}>{t("Clear filter")}</button>
        </div>
      ) : null}
      {visible.length > SCREENING_MATCH_PAGE_SIZE ? (
        <div className="pt-1">
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
  className,
}: {
  subjectName: string
  country?: string | null
  outcome: ScreeningOutcome
  className?: string
}) {
  const { t } = useLanguage()
  const explanation = outcome === "match"
    ? t("Listed name found. Review the programme and listing details before continuing.")
    : outcome === "possible_match"
      ? t("Similar listed name found. Confirm the party before continuing.")
      : outcome === "unavailable"
        ? t("The UK list is unavailable, so no result was returned.")
        : t("No listed names matched. This is not legal clearance.")

  return (
    <div className={cn("mx-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-shadow-line)]", className)}>
      <p className="break-words text-[14px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">
        {subjectName}{country ? <> · <bdi dir="ltr" data-i18n-skip>{country}</bdi></> : null}
      </p>
      <p className="mt-1 max-w-[75ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">{explanation}</p>
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
