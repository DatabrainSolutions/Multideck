import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import {
  AiBrain,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Check,
  Clock,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { getPhoneCall, listPhoneCalls } from "@/lib/phone-calls-api"
import type {
  PhoneCallAttentionItem,
  PhoneCallActionDraft,
  PhoneCallCoverageItem,
  PhoneCallDetail,
  PhoneCallEvidence,
  PhoneCallMatchCandidate,
  PhoneCallMatchStatus,
  PhoneCallMetric,
  PhoneCallListItem,
  PhoneCallOutcome,
  PhoneCallProviderStatus,
  PhoneCallReason,
  PhoneCallSuggestedAction,
  PhoneCallTranscriptSegment,
  PhoneCallTranscriptStatus,
  PhoneCallVolumePoint,
} from "@/lib/phone-calls-api"
import { cn } from "@/lib/utils"
import { StatusPill } from "./status-pill"
import { Surface } from "./surface"

const outcomeTone: Record<PhoneCallOutcome, "green" | "red" | "amber" | "blue" | "neutral"> = {
  answered: "green",
  missed: "red",
  declined: "red",
  voicemail: "amber",
  abandoned: "amber",
  unknown: "neutral",
}

const transcriptTone: Record<PhoneCallTranscriptStatus, "green" | "amber" | "red" | "neutral"> = {
  complete: "green",
  partial: "amber",
  pending: "amber",
  failed: "red",
  unavailable: "neutral",
}

const matchTone: Record<PhoneCallMatchStatus, "green" | "amber" | "red"> = {
  matched: "green",
  review: "amber",
  unmatched: "red",
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
}

function formatTime(value: string, language: string, timezone?: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date)
}

function evidenceLabel(evidence: PhoneCallEvidence) {
  if (evidence.kind === "derived") return "Derived"
  if (evidence.source === "3cx") return "3CX confirmed"
  if (evidence.source === "elevenlabs") return "ElevenLabs confirmed"
  if (evidence.source === "twilio") return "Twilio confirmed"
  return "Provider confirmed"
}

function translatedMetricDetail(metric: PhoneCallMetric, t: (text: string) => string): ReactNode {
  const volume = metric.detail.match(/^(\d+) inbound · (\d+) outbound$/)
  if (metric.id === "volume" && volume) {
    return <><bdi data-i18n-skip>{volume[1]}</bdi> {t("inbound calls")} · <bdi data-i18n-skip>{volume[2]}</bdi> {t("outbound calls")}</>
  }
  const answered = metric.detail.match(/^(\d+) calls$/)
  if (metric.id === "answered" && answered) return <><bdi data-i18n-skip>{answered[1]}</bdi> {t("calls")}</>
  const transfer = metric.detail.match(/^(\d+) of (\d+) offered$/)
  if (metric.id === "transfer" && transfer) {
    return <><bdi data-i18n-skip>{transfer[1]}</bdi> {t("of")} <bdi data-i18n-skip>{transfer[2]}</bdi> {t("offered")}</>
  }
  const followup = metric.detail.match(/^(\d+) answered calls with approved follow-up$/)
  if (metric.id === "followup" && followup) return <><bdi data-i18n-skip>{followup[1]}</bdi> {t("answered calls with approved follow-up")}</>
  const completedFollowup = metric.detail.match(/^(\d+) of (\d+) approved follow-ups completed$/)
  if (metric.id === "followup" && completedFollowup) {
    return <><bdi data-i18n-skip>{completedFollowup[1]}</bdi> {t("of")} <bdi data-i18n-skip>{completedFollowup[2]}</bdi> {t("approved follow-ups completed")}</>
  }
  return t(metric.detail)
}

export function PhoneCallEvidenceLabel({ evidence, className }: { evidence: PhoneCallEvidence; className?: string }) {
  const { language, t } = useLanguage()
  const observedDate = evidence.observedAt ? new Date(evidence.observedAt) : null
  const observedAt = observedDate && !Number.isNaN(observedDate.getTime())
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(observedDate)
    : null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]",
        evidence.kind === "derived" && "bg-[var(--md-accent-a08)] text-[var(--md-accent)]",
        className,
      )}
      title={observedAt ? `${t("Observed")} ${observedAt}` : undefined}
    >
      {evidence.kind === "derived" ? <AiBrain className="size-2.5" strokeWidth={1.5} /> : <Check className="size-2.5" strokeWidth={1.5} />}
      {t(evidenceLabel(evidence))}
    </span>
  )
}

export function PhoneCallOutcomePill({ outcome }: { outcome: PhoneCallOutcome }) {
  const { t } = useLanguage()
  return <StatusPill kind="status" tone={outcomeTone[outcome]}>{t(humanize(outcome))}</StatusPill>
}

export function PhoneCallMatchPill({ status }: { status: PhoneCallMatchStatus }) {
  const { t } = useLanguage()
  const label = status === "matched" ? "Matched" : status === "review" ? "Needs review" : "Unmatched"
  return <StatusPill kind="status" tone={matchTone[status]}>{t(label)}</StatusPill>
}

export function PhoneCallTranscriptPill({ status }: { status: PhoneCallTranscriptStatus }) {
  const { t } = useLanguage()
  const label = status === "pending" ? "Processing" : humanize(status)
  return <StatusPill kind="status" tone={transcriptTone[status]}>{t(label)}</StatusPill>
}

export function PhoneCallMetricStrip({ metrics }: { metrics: PhoneCallMetric[] }) {
  const { t } = useLanguage()
  return (
    <Surface padding="none" className="grid min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, index) => (
        <article
          key={metric.id}
          className="min-w-0 px-4 py-3.5 shadow-[var(--md-stroke-bottom)] sm:shadow-[var(--md-stroke-bottom),var(--md-stroke-right)] xl:shadow-[var(--md-stroke-right)] xl:last:shadow-none"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-[11.5px] font-medium text-[var(--md-text)]">{t(metric.label)}</p>
            <PhoneCallEvidenceLabel evidence={metric.evidence} />
          </div>
          <p
            data-i18n-skip
            dir="ltr"
            className={cn(
              "mt-2 text-[24px] font-medium leading-none tabular-nums text-[var(--md-ink)]",
              metric.tone === "red" && "text-[var(--md-red)]",
              metric.tone === "amber" && "text-[var(--md-amber-strong)]",
              (metric.tone === "green" || metric.tone === "teal") && "text-[var(--md-accent)]",
              metric.tone === "blue" && "text-[var(--md-blue)]",
            )}
          >
            {metric.value}
          </p>
          {metric.comparison ? <p className="mt-2 truncate text-[11px] text-[var(--md-text)]">{t(metric.comparison)}</p> : null}
          <p className="mt-1 truncate text-[10.5px] text-[var(--md-subtle)]">{translatedMetricDetail(metric, t)}</p>
          <span className="sr-only">{t("Metric position")} {index + 1}</span>
        </article>
      ))}
    </Surface>
  )
}

export type PhoneCallAnalysisFocus = "follow_up" | "service" | "demand"

export function PhoneCallAnalysisLauncher({
  totalCalls,
  onAnalyse,
}: {
  totalCalls: number
  onAnalyse: (focus: PhoneCallAnalysisFocus) => void
}) {
  const { t } = useLanguage()
  const focuses: Array<{ id: PhoneCallAnalysisFocus; label: string; detail: string }> = [
    { id: "follow_up", label: "Prioritise follow-up", detail: "Find unresolved requests, open actions and calls without a safe CRM match." },
    { id: "service", label: "Explain service pressure", detail: "Compare confirmed outcomes, transfers and handling time without mixing evidence sources." },
    { id: "demand", label: "Summarise demand", detail: "Group assistant-captured call reasons and identify changes worth acting on." },
  ]

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AiBrain aria-hidden="true" className="size-4 text-[var(--md-accent)]" strokeWidth={1.35} />
            <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("AI-assisted analysis")}</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Dexter reads the live calls in this period only after you choose a question.")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a08)] px-2 py-1 text-[10.5px] font-medium text-[var(--md-accent)]">
          <Sparkles aria-hidden="true" className="size-3" />
          {t("Runs on request")}
        </span>
      </div>
      {totalCalls > 0 ? (
        <div className="grid md:grid-cols-3">
          {focuses.map((focus) => (
            <button
              key={focus.id}
              type="button"
              className="group min-h-24 min-w-0 px-4 py-3 text-start shadow-[var(--md-stroke-bottom)] transition-colors hover:bg-[var(--md-hover)] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a20)] md:shadow-[var(--md-stroke-right)] md:last:shadow-none"
              onClick={() => onAnalyse(focus.id)}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[var(--md-ink)]">{t(focus.label)}</span>
                <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--md-subtle)] transition-transform group-hover:translate-x-0.5 rtl:scale-x-[-1] rtl:group-hover:-translate-x-0.5" />
              </span>
              <span className="mt-1.5 block text-[10.5px] leading-4 text-[var(--md-text)]">{t(focus.detail)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-[11.5px] leading-5 text-[var(--md-text)]">
          {t("AI analysis will become available after the first authorised provider call arrives.")}
        </div>
      )}
    </Surface>
  )
}

export function PhoneCallProviderHealth({ providers = [] }: { providers?: PhoneCallProviderStatus[] }) {
  const { language, t } = useLanguage()
  const formatter = useMemo(() => new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }), [language])
  const state = (provider: PhoneCallProviderStatus) => {
    if (provider.state === "healthy") return { label: "Healthy", tone: "green" as const, icon: Check }
    if (provider.state === "delayed") return { label: "Delayed", tone: "amber" as const, icon: Clock }
    if (provider.state === "error") return { label: "Needs attention", tone: "red" as const, icon: TriangleAlert }
    return { label: "Not connected", tone: "neutral" as const, icon: ArrowLeftRight }
  }

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Live data sources")}</h2>
        <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Recovery worker health from the selected Supabase project")}</p>
      </div>
      <div>
        {providers.length ? providers.map((provider) => {
          const status = state(provider)
          const StatusIcon = status.icon
          const succeeded = provider.lastSucceededAt ? new Date(provider.lastSucceededAt) : null
          const readableSucceeded = succeeded && !Number.isNaN(succeeded.getTime()) ? formatter.format(succeeded) : null
          return (
            <article key={provider.provider} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-start gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)] last:shadow-none sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center">
              <span className={cn("grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)]", provider.state === "healthy" && "bg-[var(--md-accent-a08)] text-[var(--md-accent)]", provider.state === "delayed" && "bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] text-[var(--md-amber-strong)]", provider.state === "error" && "bg-[color-mix(in_srgb,var(--md-red)_9%,var(--md-surface))] text-[var(--md-red)]")}>
                <StatusIcon aria-hidden="true" className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-[var(--md-ink)]">{t(provider.label)}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[var(--md-subtle)]">{t(provider.detail)}</p>
                <p className="mt-1 text-[10px] text-[var(--md-text)]">
                  {readableSucceeded ? <>{t("Last successful check")} <time dateTime={provider.lastSucceededAt ?? undefined}>{readableSucceeded}</time></> : t("No successful checks yet")}
                </p>
              </div>
              <StatusPill className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end" tone={status.tone}>{t(status.label)}</StatusPill>
            </article>
          )
        }) : (
          <div className="px-4 py-5 text-[11.5px] leading-5 text-[var(--md-text)]" role="status">
            {t("Provider health is temporarily unavailable. Call records remain available; refresh to retry the connection check.")}
          </div>
        )}
      </div>
    </Surface>
  )
}

const volumeChartConfig: ChartConfig = {
  inboundAnswered: { label: "Inbound answered", color: "var(--md-accent)" },
  inboundMissed: { label: "Inbound missed", color: "var(--md-red)" },
  outboundAnswered: { label: "Outbound answered", color: "var(--md-blue)" },
  outboundMissed: { label: "Outbound missed", color: "var(--md-amber)" },
  answerRate: { label: "Answer rate", color: "var(--md-ink)" },
}

export function PhoneCallVolumeChart({ data, timezone }: { data: PhoneCallVolumePoint[]; timezone: string }) {
  const { t } = useLanguage()
  const localizedChartConfig = useMemo<ChartConfig>(() => Object.fromEntries(
    Object.entries(volumeChartConfig).map(([key, item]) => [key, { ...item, label: t(String(item.label)) }]),
  ), [t])
  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <div>
          <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Call volume over time")}</h2>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Deduplicated calls and available outcomes")} · <bdi>{timezone}</bdi></p>
        </div>
        <PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} />
      </div>
      {data.length ? (
        <div className="p-3 pt-4">
          <ChartContainer config={localizedChartConfig} className="h-[300px] w-full [aspect-ratio:auto]">
            <ComposedChart accessibilityLayer data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--md-hairline)" strokeOpacity={0.75} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={9} tick={{ fill: "var(--md-text)", fontSize: 10.5 }} />
              <YAxis yAxisId="calls" tickLine={false} axisLine={false} width={28} tick={{ fill: "var(--md-subtle)", fontSize: 10 }} />
              <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} width={34} tickFormatter={(value) => `${value}%`} tick={{ fill: "var(--md-subtle)", fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]" />} />
              <Bar yAxisId="calls" dataKey="inboundAnswered" stackId="calls" fill="var(--color-inboundAnswered)" radius={[0, 0, 2, 2]} />
              <Bar yAxisId="calls" dataKey="inboundMissed" stackId="calls" fill="var(--color-inboundMissed)" />
              <Bar yAxisId="calls" dataKey="outboundAnswered" stackId="calls" fill="var(--color-outboundAnswered)" />
              <Bar yAxisId="calls" dataKey="outboundMissed" stackId="calls" fill="var(--color-outboundMissed)" radius={[2, 2, 0, 0]} />
              <Line yAxisId="rate" type="monotone" dataKey="answerRate" stroke="var(--color-answerRate)" strokeWidth={1.8} dot={false} activeDot={{ r: 3 }} />
            </ComposedChart>
          </ChartContainer>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[10.5px] text-[var(--md-text)]">
            {Object.entries(localizedChartConfig).map(([key, item]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: `var(--color-${key})` }} />
                {String(item.label)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[300px] place-items-center p-6 text-center">
          <div><Phone className="mx-auto size-5 text-[var(--md-subtle)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No calls in this period")}</p></div>
        </div>
      )}
    </Surface>
  )
}

export function PhoneCallAttentionList({ items, onOpen, onViewAll }: { items: PhoneCallAttentionItem[]; onOpen: (callId: string) => void; onViewAll: () => void }) {
  const { language, t } = useLanguage()
  const formatter = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Action needed")}</h2>
        <Button variant="ghost" size="sm" onClick={onViewAll}>{t("View all")} <ArrowRight className="size-3 rtl:scale-x-[-1]" /></Button>
      </div>
      {items.length ? (
        <ul>
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)] last:shadow-none sm:grid-cols-[28px_minmax(0,1fr)_auto]">
              <span className={cn("grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a08)] text-[var(--md-accent)]", item.tone === "red" && "bg-[color-mix(in_srgb,var(--md-red)_9%,var(--md-surface))] text-[var(--md-red)]", item.tone === "amber" && "bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] text-[var(--md-amber-strong)]")}>
                {item.tone === "red" ? <Phone className="size-3.5" /> : <MessageCircle className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">{item.title}</p>
                <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]"><time dateTime={item.occurredAt}>{formatter.format(new Date(item.occurredAt))}</time> · {t(item.stateLabel)}</p>
              </div>
              <Button className="col-span-2 w-full sm:col-span-1 sm:w-auto" variant="outline" size="sm" onClick={() => onOpen(item.callId)}>{t("Review")}</Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid min-h-[240px] place-items-center p-6 text-center"><div><Check className="mx-auto size-5 text-[var(--md-accent)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No call actions need review")}</p><p className="mt-1 text-[11.5px] text-[var(--md-text)]">{t("New suggestions and unmatched callers will appear here.")}</p></div></div>
      )}
    </Surface>
  )
}

export function PhoneCallReasonList({ reasons }: { reasons: PhoneCallReason[] }) {
  const { t } = useLanguage()
  const maximum = Math.max(...reasons.map((reason) => reason.count), 1)
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]"><div><h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Common reasons")}</h2><p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{t("Derived from answered call summaries")}</p></div><PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} /></div>
      {reasons.length ? <ol className="px-4 py-2">
        {reasons.slice(0, 5).map((reason, index) => (
          <li key={reason.id} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 shadow-[var(--md-stroke-bottom)] last:shadow-none">
            <span className="text-[11px] tabular-nums text-[var(--md-subtle)]">{index + 1}</span>
            <div className="min-w-0"><p className="truncate text-[12px] text-[var(--md-ink)]" dir="auto" title={reason.label}>{reason.label}</p><span className="relative mt-1.5 block h-1 overflow-hidden rounded-full bg-[var(--md-surface-tint)]"><span className="absolute inset-y-0 start-0 rounded-full bg-[var(--md-accent)]" style={{ width: `${Math.max(4, reason.count / maximum * 100)}%` }} /></span></div>
            <span className="text-[11px] tabular-nums text-[var(--md-text)]" dir="ltr">{reason.count} ({Math.round(reason.share)}%)</span>
          </li>
        ))}
      </ol> : <div className="grid min-h-[180px] place-items-center p-5 text-center text-[11.5px] text-[var(--md-text)]">{t("No call reasons are available for this period.")}</div>}
    </Surface>
  )
}

export function PhoneCallCoverage({ items }: { items: PhoneCallCoverageItem[] }) {
  const { t } = useLanguage()
  const style: Record<PhoneCallCoverageItem["id"], string> = {
    company: "var(--md-accent)",
    contact: "var(--md-blue)",
    lead: "var(--md-purple)",
    needs_review: "var(--md-amber)",
    unmatched: "var(--md-red)",
  }
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)]"><div><h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("CRM record coverage")}</h2><p className="mt-1 text-[10.5px] text-[var(--md-subtle)]">{t("Company, contact and lead links are counted separately")}</p></div><PhoneCallEvidenceLabel evidence={{ kind: "derived", source: "multideck", observedAt: null }} /></div>
      {items.length ? <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => {
          const icon = item.id === "company" ? <Building2 aria-hidden="true" className="size-3.5" /> : item.id === "contact" ? <UserRound aria-hidden="true" className="size-3.5" /> : item.id === "lead" ? <Sparkles aria-hidden="true" className="size-3.5" /> : item.id === "needs_review" ? <TriangleAlert aria-hidden="true" className="size-3.5" /> : <X aria-hidden="true" className="size-3.5" />
          return (
            <div key={item.id} className="min-w-0">
              <span aria-hidden="true" className="mb-3 block h-0.5 w-7 rounded-full" style={{ background: style[item.id] }} />
              <div className="flex min-w-0 items-center gap-2" style={{ color: style[item.id] }}>
                {icon}
                <dt className="truncate text-[11px] font-medium text-[var(--md-text)]">{t(item.label)}</dt>
              </div>
              <dd className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap tabular-nums" data-i18n-skip dir="ltr">
                <span className="text-[24px] font-medium leading-none text-[var(--md-ink)]">{item.count}</span>
                <span className="text-[10.5px] text-[var(--md-subtle)]">{Math.round(item.share)}%</span>
              </dd>
            </div>
          )
        })}
      </dl> : <div className="grid min-h-[180px] place-items-center p-5 text-center text-[11.5px] text-[var(--md-text)]">{t("No CRM coverage is available for this period.")}</div>}
    </Surface>
  )
}

function TranscriptSpeakerIcon({ role }: { role: PhoneCallTranscriptSegment["speakerRole"] }) {
  if (role === "caller") return <UserRound aria-hidden="true" className="size-3.5 text-[var(--md-blue)]" strokeWidth={1.4} />
  if (role === "receptionist") return <AiBrain aria-hidden="true" className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.4} />
  return <Phone aria-hidden="true" className="size-3.5 text-[var(--md-text)]" strokeWidth={1.4} />
}

const genericTranscriptSpeakerLabels = new Set(["", "agent", "receptionist", "employee", "handler", "handler transcript", "3cx", "jenkar team", "caller", "external"])

function TranscriptSpeakerLabel({ segment }: { segment: PhoneCallTranscriptSegment }) {
  const { t } = useLanguage()
  const speakerLabel = segment.speakerLabel.trim()
  const isGenericLabel = genericTranscriptSpeakerLabels.has(speakerLabel.toLocaleLowerCase("en-GB").replaceAll(/\s+/g, " "))

  if (segment.speakerRole === "receptionist") return <span>{t("Agent")}</span>
  if (segment.speakerRole === "employee") {
    return isGenericLabel ? <span>{t("Handler")}</span> : (
      <span className="inline-flex min-w-0 flex-wrap items-baseline gap-1.5">
        <span className="min-w-0 truncate" dir="auto">{speakerLabel}</span>
        <span aria-hidden="true" className="text-[var(--md-subtle)]">·</span>
        <span>{t("Handler")}</span>
      </span>
    )
  }
  if (isGenericLabel) return <span>{t(segment.speakerRole === "caller" ? "Caller" : "External")}</span>
  return <span className="min-w-0 truncate" dir="auto">{speakerLabel}</span>
}

function transcriptBoundaryLabel(segment: PhoneCallTranscriptSegment) {
  if (segment.source !== "3cx") return "Agent conversation resumes"
  if (segment.text.trim()) return "Handler conversation begins"
  return segment.state === "failed" ? "Handler transcript is unavailable" : "Handler transcript is pending"
}

export function UnifiedPhoneCallTranscript({ call, showProvenance = false }: { call: Pick<PhoneCallDetail, "transcriptSegments" | "transcriptStatus" | "timezone" | "transfer">; showProvenance?: boolean }) {
  const { language, t } = useLanguage()
  const groups = useMemo(() => call.transcriptSegments.map((segment, index) => ({ segment, index })).sort((leftItem, rightItem) => {
    const left = leftItem.segment
    const right = rightItem.segment
    const leftTime = left.startedAt ? new Date(left.startedAt).getTime() : Number.NaN
    const rightTime = right.startedAt ? new Date(right.startedAt).getTime() : Number.NaN
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime
    const leftGlobal = Number.isFinite(left.globalSequence) ? Number(left.globalSequence) : null
    const rightGlobal = Number.isFinite(right.globalSequence) ? Number(right.globalSequence) : null
    if (leftGlobal !== null && rightGlobal !== null && leftGlobal !== rightGlobal) return leftGlobal - rightGlobal
    const leftSource = Number.isFinite(left.sourceSequence) ? Number(left.sourceSequence) : null
    const rightSource = Number.isFinite(right.sourceSequence) ? Number(right.sourceSequence) : null
    if (leftSource !== null && rightSource !== null && leftSource !== rightSource) return leftSource - rightSource
    if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(leftTime) ? -1 : 1
    if (leftGlobal !== null || rightGlobal !== null) return leftGlobal === null ? 1 : -1
    if (leftSource !== null || rightSource !== null) return leftSource === null ? 1 : -1
    const offsetDifference = (left.offsetMs ?? 0) - (right.offsetMs ?? 0)
    return offsetDifference || leftItem.index - rightItem.index
  }).map(({ segment }) => segment), [call.transcriptSegments])
  const transferAt = call.transfer.acceptedAt || call.transfer.offeredAt
  const transferLabel = call.transfer.acceptedAt ? "Transfer accepted by Jenkar team" : "Transfer offered to Jenkar team"
  const transferInsertionIndex = useMemo(() => {
    if (!transferAt) return -1
    const transferTime = new Date(transferAt).getTime()
    if (Number.isFinite(transferTime)) {
      const timedIndex = groups.findIndex((segment) => {
        if (!segment.startedAt) return false
        const segmentTime = new Date(segment.startedAt).getTime()
        return Number.isFinite(segmentTime) && transferTime <= segmentTime
      })
      if (timedIndex >= 0) return timedIndex
    }
    const handlerIndex = groups.findIndex((segment) => segment.source === "3cx")
    return handlerIndex >= 0 ? handlerIndex : groups.length
  }, [groups, transferAt])
  const transferMarker = transferAt ? (
    <li className="m-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a07)] px-3 py-2.5 text-[11.5px] text-[var(--md-text)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)]">
      <ArrowLeftRight aria-hidden="true" className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} />
      <span className="font-medium text-[var(--md-ink)]">{t(transferLabel)}</span>
      <span data-i18n-skip dir="ltr">{formatTime(transferAt, language, call.timezone)}</span>
      {call.transcriptStatus === "complete" ? null : <PhoneCallTranscriptPill status={call.transcriptStatus} />}
    </li>
  ) : null
  return (
    <div className="min-w-0">
      <div className="hidden grid-cols-[80px_172px_minmax(0,1fr)] gap-3 px-3 py-2 text-[10.5px] font-medium text-[var(--md-subtle)] shadow-[var(--md-stroke-bottom)] sm:grid">
        <span>{t("Time")}</span><span>{t("Speaker")}</span><span>{t("Message")}</span>
      </div>
      {groups.length ? (
        <ol aria-label={t("Call transcript")}>
          {groups.map((segment, index) => {
            const previous = groups[index - 1]
            const sourceChanged = previous && previous.source !== segment.source
            return (
              <Fragment key={segment.id}>
                {transferInsertionIndex === index ? transferMarker : null}
                {sourceChanged ? (
                  <li className="m-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 text-[11.5px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                    <ArrowLeftRight aria-hidden="true" className="size-4 text-[var(--md-accent)]" strokeWidth={1.4} />
                    <span className="font-medium text-[var(--md-ink)]">{t(transcriptBoundaryLabel(segment))}</span>
                    {showProvenance ? <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--md-subtle)]" role="note"><span>{t("Evidence source")}</span><bdi dir="ltr">{previous.sourceLabel} → {segment.sourceLabel}</bdi></span> : null}
                  </li>
                ) : null}
                <li className="grid min-w-0 gap-1.5 px-3 py-3 shadow-[var(--md-stroke-bottom)] sm:grid-cols-[80px_172px_minmax(0,1fr)] sm:gap-3">
                  {segment.startedAt ? <time dateTime={segment.startedAt} data-i18n-skip dir="ltr" className="text-[10.5px] tabular-nums text-[var(--md-subtle)] sm:text-[11.5px]">{formatTime(segment.startedAt, language, call.timezone)}</time> : <span className="text-[10.5px] text-[var(--md-subtle)] sm:text-[11.5px]">{t("Time not supplied")}</span>}
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-[11.5px] font-medium text-[var(--md-text)]"><TranscriptSpeakerIcon role={segment.speakerRole} /><TranscriptSpeakerLabel segment={segment} /></span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-5 text-[var(--md-ink)]" dir="auto">{segment.text || t(segment.state === "failed" ? "Transcript segment could not be prepared." : "Transcript segment is still processing.")}</p>
                    {showProvenance ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--md-subtle)]" role="note" aria-label={t("Transcript evidence")}>
                        <span>{t("Evidence source")} <bdi dir="ltr">{segment.sourceLabel}</bdi></span>
                        <span className="inline-flex items-center gap-1.5">{t("Segment state")} <PhoneCallTranscriptPill status={segment.state === "complete" ? "complete" : segment.state === "failed" ? "failed" : "pending"} /></span>
                      </div>
                    ) : null}
                  </div>
                </li>
              </Fragment>
            )
          })}
          {transferInsertionIndex === groups.length ? transferMarker : null}
        </ol>
      ) : (
        <>
          {transferMarker ? <ol aria-label={t("Call transcript")}>{transferMarker}</ol> : null}
          <div className="grid min-h-[280px] place-items-center p-6 text-center"><div><Clock aria-hidden="true" className="mx-auto size-5 text-[var(--md-subtle)]" /><p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(call.transcriptStatus === "failed" ? "Transcript could not be prepared" : call.transcriptStatus === "unavailable" ? "Transcript is unavailable" : "Transcript is still processing")}</p><p className="mt-1 text-[11.5px] text-[var(--md-text)]">{t(call.transcriptStatus === "unavailable" ? "The provider did not make a transcript available for this call." : "Call facts remain available while the conversation is completed.")}</p></div></div>
        </>
      )}
      {call.transcriptStatus === "partial" || call.transcriptStatus === "pending" ? (
        <div className="flex items-start gap-2.5 bg-[color-mix(in_srgb,var(--md-amber)_8%,var(--md-surface))] px-4 py-3 text-[11.5px] text-[var(--md-text)]" role="status">
          <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--md-amber-strong)]" /><p>{t(call.transcriptStatus === "partial" ? "The available transcript is shown. Some timing, speaker or provider-completion detail is not confirmed." : "The available transcript is shown. A provider segment is still processing and will be added without changing the completed portion.")}</p>
        </div>
      ) : null}
    </div>
  )
}

type PhoneCallLinkedRecordType = "company" | "lead"

function formatLinkedCallDate(value: string, language: string, timezone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(date)
}

function linkedCallBelongsToRecord(call: PhoneCallDetail, recordType: PhoneCallLinkedRecordType, recordId: string) {
  if (call.matchStatus !== "matched") return false
  return recordType === "company" ? call.company?.id === recordId : call.lead?.id === recordId
}

function PhoneCallLinkedRecordView({
  recordType,
  calls,
  total,
  state,
  error,
  timezone,
  expandedId,
  expandedCall,
  detailState,
  detailError,
  onRetry,
  onToggle,
  onOpenFullCall,
}: {
  recordType: PhoneCallLinkedRecordType
  calls: PhoneCallListItem[]
  total: number
  state: "loading" | "ready" | "error"
  error: string
  timezone: string
  expandedId: string | null
  expandedCall: PhoneCallDetail | null
  detailState: "idle" | "loading" | "ready" | "error"
  detailError: string
  onRetry: () => void
  onToggle: (callId: string) => void
  onOpenFullCall: (callId: string) => void
}) {
  const { language, t } = useLanguage()
  const detailIdPrefix = useId()
  const recordLabel = recordType === "company" ? "company" : "lead"

  return (
    <Surface padding="none" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 shadow-[var(--md-stroke-bottom)] sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Phone calls")}</h2>
          <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Only safely matched calls appear here.")}</p>
        </div>
        {state === "ready" ? <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[10.5px] font-medium text-[var(--md-text)]" aria-label={`${total} ${t(total === 1 ? "linked call" : "linked calls")}`}><bdi data-i18n-skip>{total}</bdi></span> : null}
      </div>

      {state === "loading" ? (
        <div className="grid gap-2 p-3 sm:p-4" role="status" aria-live="polite">
          <span className="sr-only">{t("Loading linked phone calls…")}</span>
          {[0, 1].map((item) => <span key={item} aria-hidden="true" className="h-[62px] animate-pulse rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] motion-reduce:animate-none" />)}
        </div>
      ) : state === "error" ? (
        <div className="grid min-h-32 place-items-center gap-3 px-4 py-6 text-center" role="alert">
          <div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Linked phone calls could not be loaded.")}</p>{error ? <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]" dir="auto">{error}</p> : null}</div>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" className="size-3.5" />{t("Try again")}</Button>
        </div>
      ) : calls.length ? (
        <ol aria-label={t("Safely linked phone calls")}>
          {calls.map((call) => {
            const isExpanded = expandedId === call.id
            const detailId = `${detailIdPrefix}-${call.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`
            return (
              <li key={call.id} className="shadow-[var(--md-stroke-bottom)] last:shadow-none">
                <button type="button" className="group grid min-h-[62px] w-full min-w-0 grid-cols-[minmax(0,1fr)_24px] gap-2 px-4 py-3 text-start outline-none transition-colors hover:bg-[var(--md-hover)] focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a20)] sm:grid-cols-[minmax(180px,1fr)_auto_24px] sm:items-center sm:px-5" aria-expanded={isExpanded} aria-controls={detailId} onClick={() => onToggle(call.id)}>
                  <span className="min-w-0"><span className="block truncate text-[12.5px] font-medium text-[var(--md-ink)]" dir="auto">{call.callerName || t("Unknown caller")}</span><time dateTime={call.startedAt} className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--md-subtle)]">{formatLinkedCallDate(call.startedAt, language, timezone)}</time></span>
                  <span className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1"><PhoneCallOutcomePill outcome={call.outcome} /><PhoneCallTranscriptPill status={call.transcriptStatus} /><span className="text-[10.5px] text-[var(--md-subtle)]">{t(call.direction === "inbound" ? "Inbound" : "Outbound")}</span></span>
                  <ArrowRight aria-hidden="true" className={cn("col-start-2 row-start-1 size-4 justify-self-end text-[var(--md-subtle)] transition-transform rtl:rotate-180 sm:col-auto sm:row-auto", isExpanded && "rotate-90 rtl:rotate-90")} strokeWidth={1.4} />
                </button>
                {isExpanded ? (
                  <div id={detailId} className="bg-[var(--md-surface-soft)] px-3 py-3 sm:px-4" aria-busy={detailState === "loading"}>
                    {detailState === "loading" ? <div className="flex min-h-32 items-center justify-center gap-2 text-[11.5px] text-[var(--md-subtle)]" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading conversation…")}</div> : detailState === "error" ? <div className="grid min-h-32 place-items-center gap-3 text-center" role="alert"><p className="text-[11.5px] text-[var(--md-text)]" dir="auto">{t(detailError || "This call is no longer safely linked to this record.")}</p><Button type="button" size="sm" variant="outline" onClick={() => onToggle(call.id)}>{t("Try again")}</Button></div> : detailState === "ready" && expandedCall ? <div className="overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><span className="sr-only" role="status">{t("Conversation loaded.")}</span><div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 shadow-[var(--md-stroke-bottom)]"><div><p className="text-[11.5px] font-medium text-[var(--md-ink)]">{t("Conversation")}</p><p className="mt-0.5 text-[10px] text-[var(--md-subtle)]">{t("Agent and Handler transcript")}</p></div><Button asChild size="sm" variant="ghost"><a href={`/crm/phone-calls/${encodeURIComponent(call.id)}`} onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpenFullCall(call.id) }}>{t("Open full call")}<ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" /></a></Button></div><UnifiedPhoneCallTranscript call={expandedCall} /></div> : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="grid min-h-32 place-items-center px-5 py-6 text-center"><div><Phone aria-hidden="true" className="mx-auto size-5 text-[var(--md-subtle)]" /><p className="mt-2 text-[12px] font-medium text-[var(--md-ink)]">{t(recordLabel === "company" ? "No confirmed calls are linked to this company yet." : "No confirmed calls are linked to this lead yet.")}</p><p className="mt-1 text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Calls awaiting identity review stay in Phone Calls until an operator confirms the match.")}</p></div></div>
      )}
    </Surface>
  )
}

export function PhoneCallLinkedRecordSection({ recordType, recordId, navigate }: { recordType: PhoneCallLinkedRecordType; recordId: string; navigate: (path: string) => void }) {
  const [calls, setCalls] = useState<PhoneCallListItem[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedCall, setExpandedCall] = useState<PhoneCallDetail | null>(null)
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [detailError, setDetailError] = useState("")
  const detailAbortRef = useRef<AbortController | null>(null)
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])

  useEffect(() => {
    const controller = new AbortController()
    setState("loading")
    setError("")
    setExpandedId(null)
    setExpandedCall(null)
    listPhoneCalls({ offset: 0, limit: 5, timezone, matchStatus: "matched", companyId: recordType === "company" ? recordId : null, leadId: recordType === "lead" ? recordId : null, sort: { id: "startedAt", direction: "desc" } }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        const safelyLinkedRows = result.rows.filter((row) => row.matchStatus === "matched" && (recordType === "company" ? row.company?.id === recordId : row.lead?.id === recordId))
        setCalls(safelyLinkedRows)
        setTotal(safelyLinkedRows.length === result.rows.length ? result.total : safelyLinkedRows.length)
        setState("ready")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setCalls([])
        setTotal(0)
        setError(cause instanceof Error ? cause.message : "")
        setState("error")
      })
    return () => controller.abort()
  }, [recordId, recordType, reloadToken, timezone])

  useEffect(() => () => detailAbortRef.current?.abort(), [])

  const openConversation = useCallback((callId: string) => {
    detailAbortRef.current?.abort()
    if (expandedId === callId && detailState !== "error") {
      setExpandedId(null)
      setExpandedCall(null)
      setDetailState("idle")
      return
    }
    const controller = new AbortController()
    detailAbortRef.current = controller
    setExpandedId(callId)
    setExpandedCall(null)
    setDetailError("")
    setDetailState("loading")
    getPhoneCall(callId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        if (!linkedCallBelongsToRecord(detail, recordType, recordId)) throw new Error("This call is no longer safely linked to this record.")
        setExpandedCall(detail)
        setDetailState("ready")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setExpandedCall(null)
        setDetailError(cause instanceof Error ? cause.message : "")
        setDetailState("error")
      })
  }, [detailState, expandedId, recordId, recordType])

  return <PhoneCallLinkedRecordView recordType={recordType} calls={calls} total={total} state={state} error={error} timezone={timezone} expandedId={expandedId} expandedCall={expandedCall} detailState={detailState} detailError={detailError} onRetry={() => setReloadToken((value) => value + 1)} onToggle={openConversation} onOpenFullCall={(callId) => navigate(`/crm/phone-calls/${callId}`)} />
}

function candidateIcon(candidate: PhoneCallMatchCandidate) {
  if (candidate.recordType === "company") return Building2
  return UserRound
}

export function PhoneCallIdentityMatchReview({
  call,
  readOnly = false,
  busyId,
  onLink,
  onCreateContact,
  onLeaveUnmatched,
}: {
  call: Pick<PhoneCallDetail, "callerName" | "callerPhone" | "capturedCallerName" | "capturedCompanyName" | "callReason" | "matchStatus" | "matchCandidates" | "company" | "contact" | "lead">
  readOnly?: boolean
  busyId?: string | null
  onLink: (candidate: PhoneCallMatchCandidate) => void
  onCreateContact: () => void
  onLeaveUnmatched: () => void
}) {
  const { t } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const previousMatchStatus = useRef(call.matchStatus)

  useEffect(() => {
    if (previousMatchStatus.current !== call.matchStatus) rootRef.current?.focus()
    previousMatchStatus.current = call.matchStatus
  }, [call.matchStatus])

  const linkedRecords = [
    call.contact ? { id: `contact:${call.contact.id}`, label: "Contact", name: call.contact.name, icon: UserRound } : null,
    call.company ? { id: `company:${call.company.id}`, label: "Company", name: call.company.name, icon: Building2 } : null,
    call.lead ? { id: `lead:${call.lead.id}`, label: "Lead", name: call.lead.name, icon: UserRound } : null,
  ].filter((record): record is NonNullable<typeof record> => Boolean(record))
  return (
    <div ref={rootRef} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-text)]"><UserRound className="size-4" /></span><div className="min-w-0"><p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]" dir="auto">{call.callerName || t("Unknown caller")}</p><p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{call.callerPhone}</p></div></div>
        <PhoneCallMatchPill status={call.matchStatus} />
      </div>
      {(call.capturedCallerName || call.capturedCompanyName || call.callReason) ? (
        <dl className="mt-3 grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
          {call.capturedCallerName ? <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Captured name")}</dt><dd className="mt-0.5 text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{call.capturedCallerName}</dd></div> : null}
          {call.capturedCompanyName ? <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Captured company")}</dt><dd className="mt-0.5 text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{call.capturedCompanyName}</dd></div> : null}
          {call.callReason ? <div><dt className="text-[10px] text-[var(--md-subtle)]">{t("Call reason")}</dt><dd className="mt-0.5 text-[11.5px] leading-4 text-[var(--md-ink)]" dir="auto">{call.callReason}</dd></div> : null}
        </dl>
      ) : null}
      {call.matchStatus === "matched" && linkedRecords.length ? (
        <div className="mt-3 grid gap-2">
          {linkedRecords.map((record) => {
            const Icon = record.icon
            return (
              <div key={record.id} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a07)] p-2.5 shadow-[inset_0_0_0_1px_var(--md-accent-a14)]">
                <span className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Icon className="size-3.5" /></span>
                <div className="min-w-0"><p className="text-[10px] text-[var(--md-subtle)]">{t(`Linked ${record.label.toLowerCase()}`)}</p><p className="mt-0.5 truncate text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{record.name}</p></div>
              </div>
            )
          })}
        </div>
      ) : call.matchCandidates.length ? (
        <div className="mt-3 grid gap-2">
          {call.matchCandidates.map((candidate) => {
            const Icon = candidateIcon(candidate)
            const recordTypeLabel = candidate.recordType === "company" ? "Company" : candidate.recordType === "lead" ? "Lead" : "Contact"
            return (
              <div key={candidate.id} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2.5 shadow-[var(--md-shadow-line)] sm:grid-cols-[28px_minmax(0,1fr)_auto]">
                <span className="grid size-7 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]"><Icon className="size-3.5" /></span>
                <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="min-w-0 text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{candidate.name}</p><StatusPill tone={candidate.confidence === "high" ? "green" : candidate.confidence === "medium" ? "amber" : "neutral"}>{t(candidate.confidence === "high" ? "High confidence" : candidate.confidence === "medium" ? "Medium confidence" : "Lower confidence")}</StatusPill></div><p className="mt-0.5 text-[10px] font-medium text-[var(--md-text)]">{t(recordTypeLabel)}</p>{candidate.secondaryLabel ? <p className="mt-0.5 text-[10px] leading-4 text-[var(--md-subtle)]" dir="auto">{candidate.secondaryLabel}</p> : null}{candidate.reasons.length ? <p className="mt-0.5 text-[10px] leading-4 text-[var(--md-subtle)]" dir="auto">{candidate.reasons.join(" · ")}</p> : null}</div>
                {readOnly ? null : <Button className="col-span-2 w-full sm:col-span-1 sm:w-auto" size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => onLink(candidate)}>{busyId === candidate.id ? t("Linking…") : t(candidate.recordType === "company" ? "Link company" : candidate.recordType === "lead" ? "Link lead" : "Link contact")}</Button>}
              </div>
            )
          })}
        </div>
      ) : <p className="mt-3 text-[11.5px] leading-5 text-[var(--md-text)]">{t("No safe CRM match was found. Leave this call unmatched or open Contacts with the captured caller details.")}</p>}
      {readOnly && call.matchStatus !== "matched" ? <p className="mt-3 text-[10.5px] text-[var(--md-subtle)]">{t("Review access is required to change this identity match.")}</p> : null}
      {call.matchStatus !== "matched" && !readOnly ? <div className="mt-3 flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={onCreateContact}>{t("Open contacts")}</Button><Button size="sm" variant="ghost" disabled={Boolean(busyId)} onClick={onLeaveUnmatched}>{t("Leave unmatched")}</Button></div> : null}
    </div>
  )
}

function actionDraftText(action: PhoneCallSuggestedAction) {
  return action.draft.title?.trim() || action.title
}

function formatActionDate(value: string, language: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date)
}

function todayForAction() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function PhoneCallSuggestedActions({
  actions,
  leadCandidates = [],
  readOnly = false,
  busyId,
  onReview,
}: {
  actions: PhoneCallSuggestedAction[]
  leadCandidates?: PhoneCallMatchCandidate[]
  readOnly?: boolean
  busyId?: string | null
  onReview: (action: PhoneCallSuggestedAction, decision: "approve" | "dismiss", editedDraft?: Partial<PhoneCallActionDraft>) => void
}) {
  const { language, t } = useLanguage()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState("")
  const [editedDueDate, setEditedDueDate] = useState("")
  const [editedLeadId, setEditedLeadId] = useState("")
  const [focusReviewedId, setFocusReviewedId] = useState<string | null>(null)
  const reviewedActionRefs = useRef(new Map<string, HTMLElement>())
  const pending = actions.filter((action) => action.status === "pending" || action.status === "failed")
  const reviewed = actions.filter((action) => action.status === "approved" || action.status === "dismissed")

  useEffect(() => {
    if (!focusReviewedId || !reviewed.some((action) => action.id === focusReviewedId)) return
    reviewedActionRefs.current.get(focusReviewedId)?.focus()
    setFocusReviewedId(null)
  }, [focusReviewedId, reviewed])

  const submitReview = (action: PhoneCallSuggestedAction, decision: "approve" | "dismiss", editedDraft?: Partial<PhoneCallActionDraft>) => {
    setFocusReviewedId(action.id)
    onReview(action, decision, editedDraft)
  }

  if (!pending.length && !reviewed.length) return <div className="py-4 text-center"><Check className="mx-auto size-4 text-[var(--md-accent)]" /><p className="mt-2 text-[11.5px] text-[var(--md-text)]">{t("No suggested actions need review.")}</p></div>

  return (
    <div className="grid gap-3">
      {pending.map((action) => {
        const editing = editingId === action.id
        const dueDate = String(action.draft.scheduledDate || "")
        const safeLeadCandidates = leadCandidates.filter((candidate) => candidate.recordType === "lead")
        const suggestedLead = safeLeadCandidates.find((candidate) => candidate.id === action.draft.leadId) ?? null
        const selectedLead = editing
          ? safeLeadCandidates.find((candidate) => candidate.id === editedLeadId) ?? null
          : suggestedLead
        const todoDraftInvalid = editing && action.type === "todo" && (!editedText.trim() || !editedDueDate)
        const todoValidationId = `phone-call-action-${action.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-requirements`
        const approveDraft = action.type === "todo"
          ? { ...action.draft, title: editing ? editedText.trim() : actionDraftText(action), scheduledDate: editing ? editedDueDate : dueDate || todayForAction() }
          : action.type === "lead_link" && selectedLead
            ? { ...action.draft, leadId: selectedLead.id, leadLabel: selectedLead.name }
            : undefined
        return (
          <article key={action.id} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]" aria-busy={busyId === action.id}>
            <div className="flex items-start gap-2.5"><span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a09)] text-[var(--md-accent)]", action.confidence === "low" && "bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] text-[var(--md-amber-strong)]")}><Sparkles className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-medium text-[var(--md-accent)]">{t(action.confidence === "high" ? "High confidence" : action.confidence === "medium" ? "Medium confidence" : "Lower confidence")}</p><p className="mt-1 text-[12px] font-medium leading-5 text-[var(--md-ink)]" dir="auto">{action.title}</p>{action.reason ? <p className="mt-1 text-[10.5px] leading-4 text-[var(--md-text)]" dir="auto">{action.reason}</p> : null}</div></div>
            {editing && action.type === "todo" ? <div className="mt-3 grid gap-3"><Textarea autoFocus value={editedText} onChange={(event) => setEditedText(event.target.value)} className="min-h-24 bg-[var(--md-field-bg)] text-[13px]" aria-label={t("Edit suggestion")} aria-invalid={!editedText.trim()} aria-describedby={todoDraftInvalid ? todoValidationId : undefined} /><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]"><span>{t("Due date")}</span><Input type="date" value={editedDueDate} dir="ltr" onChange={(event) => setEditedDueDate(event.target.value)} aria-invalid={!editedDueDate} aria-describedby={todoDraftInvalid ? todoValidationId : undefined} /></label>{todoDraftInvalid ? <p id={todoValidationId} className="text-[10.5px] leading-4 text-[var(--md-red)]">{t("Add a title and due date before approval.")}</p> : null}</div> : action.type === "todo" ? <p className="mt-2 text-[10.5px] text-[var(--md-subtle)]">{dueDate ? <>{t("Due date")}: <time dateTime={dueDate}>{formatActionDate(dueDate, language)}</time></> : t("Due today if approved")}</p> : null}
            {action.type === "lead_link" ? (
              <div className="mt-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2.5 py-2 text-[10.5px] leading-4 text-[var(--md-text)]">
                <p><span className="text-[var(--md-subtle)]">{t("Lead target")}:</span> <span className="font-medium text-[var(--md-ink)]" dir="auto">{selectedLead?.name || t("No safe lead selected")}</span></p>
                {selectedLead?.secondaryLabel ? <p className="mt-1 text-[var(--md-subtle)]" dir="auto">{selectedLead.secondaryLabel}</p> : null}
                {editing ? (
                  <fieldset className="mt-3 grid gap-2">
                    <legend className="text-[10.5px] font-medium text-[var(--md-ink)]">{t("Choose a safe lead match")}</legend>
                    {safeLeadCandidates.map((candidate) => (
                      <label key={candidate.id} className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 py-2 shadow-[var(--md-shadow-line)]", candidate.id === editedLeadId && "shadow-[inset_0_0_0_1px_var(--md-accent)]")}>
                        <input type="radio" name={`phone-call-action-lead-${action.id}`} value={candidate.id} checked={candidate.id === editedLeadId} onChange={() => setEditedLeadId(candidate.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--md-accent)]" />
                        <span className="min-w-0"><span className="block font-medium text-[var(--md-ink)]" dir="auto">{candidate.name}</span>{candidate.secondaryLabel ? <span className="mt-0.5 block text-[var(--md-subtle)]" dir="auto">{candidate.secondaryLabel}</span> : null}<span className="mt-0.5 block text-[var(--md-subtle)]">{t(candidate.confidence === "high" ? "High confidence" : candidate.confidence === "medium" ? "Medium confidence" : "Lower confidence")}</span></span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <p className="mt-2 text-[var(--md-subtle)]">{t(safeLeadCandidates.length ? "Only the call's reviewed lead candidates can be approved here. Identity match remains separate." : "No safe lead candidates are available for this call. Dismiss this suggestion or review Identity match.")}</p>
              </div>
            ) : null}
            {action.error ? <p className="mt-2 text-[11px] text-[var(--md-red)]" role="alert">{action.error}</p> : null}
            {readOnly ? <p className="mt-3 text-[10.5px] text-[var(--md-subtle)]">{t("Review access is required to approve or dismiss this suggestion.")}</p> : <div className="mt-3 flex flex-wrap justify-end gap-2">
              {editing ? <Button size="sm" variant="ghost" disabled={Boolean(busyId)} onClick={() => { setEditingId(null); setEditedLeadId("") }}>{t("Cancel")}</Button> : action.type === "todo" ? <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => { setEditingId(action.id); setEditedText(actionDraftText(action)); setEditedDueDate(dueDate || todayForAction()) }}><Pencil aria-hidden="true" className="size-3" />{t("Edit suggestion")}</Button> : action.type === "lead_link" && safeLeadCandidates.length ? <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => { setEditingId(action.id); setEditedLeadId(suggestedLead?.id || safeLeadCandidates[0].id) }}><Pencil aria-hidden="true" className="size-3" />{t("Choose lead")}</Button> : null}
              <Button size="sm" disabled={Boolean(busyId) || todoDraftInvalid || (action.type === "lead_link" && !selectedLead)} aria-describedby={todoDraftInvalid ? todoValidationId : undefined} onClick={() => submitReview(action, "approve", approveDraft)}>{busyId === action.id ? t("Saving…") : t("Approve")}</Button>
              <Button size="sm" variant="ghost" disabled={Boolean(busyId)} onClick={() => submitReview(action, "dismiss")}><X aria-hidden="true" className="size-3" />{t("Dismiss")}</Button>
            </div>}
          </article>
        )
      })}
      {reviewed.length ? <div className="grid gap-2" aria-live="polite"><p className="text-[10.5px] font-medium text-[var(--md-subtle)]">{t("Reviewed actions")}</p>{reviewed.map((action) => {
        const actionState = action.status === "dismissed" ? "Dismissed" : action.todoTaskStatus === "completed" ? "Completed" : action.todoTaskStatus === "open" ? "Open in To Do" : "Approved"
        const actionTone = action.status === "dismissed" ? "neutral" : action.todoTaskStatus === "completed" ? "green" : "blue"
        return <article ref={(element) => { if (element) reviewedActionRefs.current.set(action.id, element); else reviewedActionRefs.current.delete(action.id) }} tabIndex={-1} key={action.id} className="grid min-w-0 gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 outline-none shadow-[var(--md-shadow-line)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><StatusPill tone={actionTone}>{t(actionState)}</StatusPill><p className="min-w-0 text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{action.title}</p></div>{action.reviewedAt ? <time className="mt-1 block text-[10px] text-[var(--md-subtle)]" dateTime={action.reviewedAt}>{new Intl.DateTimeFormat(language).format(new Date(action.reviewedAt))}</time> : null}</div>{action.todoTaskId ? <Button asChild size="sm" variant="outline" className="w-full sm:w-auto"><a href={`/to-do${action.draft.scheduledDate ? `?date=${encodeURIComponent(action.draft.scheduledDate)}` : ""}`}>{t("Open created To Do")}</a></Button> : null}</article>
      })}</div> : null}
    </div>
  )
}

const phoneCallTranscriptPreview: PhoneCallDetail = {
    id: "preview-call", editVersion: 1, callerName: "Alex Thompson", callerPhone: "+44 7712 345678", company: null, contact: null, lead: null,
    matchStatus: "review", direction: "inbound", outcome: "answered", startedAt: "2026-08-22T09:21:03Z", endedAt: null, durationSeconds: 245,
    answerSeconds: 8, handlingSeconds: 237, transcriptStatus: "partial", followUpStatus: "suggested", summary: null, summarySource: "none", meetingNotes: null,
    capturedCallerName: "Alex Thompson", capturedCompanyName: "Global Retail", callReason: "A revised quote for a Hamburg shipment",
    participants: [], matchCandidates: [], suggestedActions: [], transfer: { offeredAt: "2026-08-22T09:22:17Z", acceptedAt: "2026-08-22T09:24:06Z", completedAt: null, status: "accepted" },
    providerReferences: [], aiDisclosureStatus: "disclosed", recordingConsentStatus: "received", transcriptionConsentStatus: "received", consentDisclosureVersion: "jenkar-receptionist-v1", consentDisclosedAt: "2026-08-22T09:21:04Z", consentEvidence: { provider: "elevenlabs", sourceEventId: "preview-consent-event", updatedAt: "2026-08-22T09:21:05Z", sourceFields: ["ai_disclosure_status", "recording_consent_status", "transcription_consent_status"] }, recordingConsent: "received", recordingState: "recorded", retentionUntil: null, timezone: "Europe/London",
    transcriptSegments: [
      { id: "a", source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Receptionist", speakerRole: "receptionist", startedAt: "2026-08-22T09:21:03Z", offsetMs: 0, text: "Hi, thanks for calling Jenkar. How can I help today?", state: "complete" },
      { id: "b", source: "elevenlabs", sourceLabel: "ElevenLabs", speakerLabel: "Caller", speakerRole: "caller", startedAt: "2026-08-22T09:21:10Z", offsetMs: 7000, text: "I need a revised quote for a shipment to Hamburg.", state: "complete" },
      { id: "c", source: "3cx", sourceLabel: "3CX", speakerLabel: "Handler transcript", speakerRole: "employee", startedAt: null, sourceSequence: 1, globalSequence: 3, timingProvenance: "source_boundary_only", speakerProvenance: "unknown", offsetMs: null, text: "Hi Alex, it’s Chris with Jenkar. I have your request here.", state: "processing" },
    ],
}

export function PhoneCallSourceBoundaryPreview() {
  return <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]"><UnifiedPhoneCallTranscript call={phoneCallTranscriptPreview} showProvenance /></Surface>
}

export function PhoneCallLinkedRecordPreview() {
  const linkedCall: PhoneCallDetail = { ...phoneCallTranscriptPreview, company: { id: "preview-company", name: "Global Retail" }, matchStatus: "matched" }
  return <PhoneCallLinkedRecordView recordType="company" calls={[linkedCall]} total={1} state="ready" error="" timezone="Europe/London" expandedId={linkedCall.id} expandedCall={linkedCall} detailState="ready" detailError="" onRetry={() => undefined} onToggle={() => undefined} onOpenFullCall={() => undefined} />
}
