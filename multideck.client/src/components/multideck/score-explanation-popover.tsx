import { useState, type ReactNode } from "react"

import { DexterInlineCitation } from "@/components/multideck/dexter-inline-citation"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { useLanguage } from "@/i18n/language-provider"
import type { AccountScoreExplanation } from "@/lib/customer-api"
import { cn } from "@/lib/utils"

type ScoreKind = "health" | "churnRisk"

function confidenceLabel(confidence: number | null, t: (text: string) => string) {
  if (confidence === null) return t("Confidence not recorded")
  if (confidence >= 0.75) return t("High confidence")
  if (confidence >= 0.45) return t("Medium confidence")
  return t("Low confidence")
}

function formattedDate(value: string | null, language: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date)
}

export function ScoreExplanationPopover({
  kind,
  score,
  explanation,
  children,
  className,
}: {
  kind: ScoreKind
  score: number | null
  explanation: AccountScoreExplanation | null
  children: ReactNode
  className?: string
}) {
  const { language, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const label = t(kind === "health" ? "Health" : "Churn risk")
  const percentage = score === null ? t("not calculated") : `${Math.round(score)}%`
  const updated = formattedDate(explanation?.calculatedAt ?? null, language)

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${label}: ${percentage}. ${t("Show score explanation")}`}
          className={cn(
            "flex w-full min-w-0 items-center gap-2.5 rounded-[var(--md-radius-lg)] text-start outline-none transition-[background-color,box-shadow,transform] duration-150 hover:bg-[var(--md-surface-tint)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
            className,
          )}
          onClick={() => setOpen((current) => !current)}
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={8}
        role="dialog"
        aria-label={`${t("Score explanation")}: ${label}`}
        className="z-50 w-[min(360px,calc(100vw-24px))] origin-(--radix-hover-card-content-transform-origin) rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none motion-reduce:transition-none"
      >
        <div className="rounded-t-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] px-4 py-3 shadow-[var(--md-stroke-bottom)]">
          <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Calculated signal")}</p>
          <h3 className="mt-0.5 text-[14px] font-medium leading-5 text-[var(--md-ink)]">
            {score === null ? t(`${label} has not been calculated`) : `${t("Why")} ${label.toLocaleLowerCase(language)} ${t("is")} ${percentage}`}
          </h3>
        </div>

        {explanation ? (
          <div className="px-4 py-3.5">
            <p className="text-[12.5px] leading-5 text-[var(--md-ink)]" dir="auto" data-i18n-skip>{explanation.summary}</p>
            <p className="mt-2 text-[11px] leading-4 text-[var(--md-subtle)]">
              {t("Derived from linked records")} · {confidenceLabel(explanation.confidence, t)}
              {updated ? ` · ${t("Updated")} ${updated}` : ""}
            </p>
            <div className="mt-3 border-t border-[var(--md-line)] pt-3">
              <p className="mb-2 text-[11px] font-medium text-[var(--md-text)]">{t("Evidence")}</p>
              <div className="grid gap-2 text-[12px] leading-5 text-[var(--md-text)]">
                {explanation.sources.map((source) => (
                  <p key={source.id} className="min-w-0" dir="auto" data-i18n-skip>
                    <DexterInlineCitation href={source.href} title={source.title}>{source.claim}</DexterInlineCitation>
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3.5">
            <p className="text-[12.5px] font-medium leading-5 text-[var(--md-ink)]">
              {score === null ? t("No score is available yet.") : t("No evidence-backed explanation is recorded for this score.")}
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">
              {score === null
                ? t("The signal will stay empty until a calculation is recorded.")
                : t("The percentage remains visible, but Multideck will not infer a reason without linked source records.")}
            </p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
