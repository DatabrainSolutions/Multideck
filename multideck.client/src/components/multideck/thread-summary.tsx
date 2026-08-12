import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AiBrain, RefreshCw } from "@/components/icons/hugeicons"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import type { ThreadSummaryState } from "@/lib/inbox-api"
import { cn } from "@/lib/utils"

/**
 * Dexter's read of the selected thread, above the message trail.
 *
 * The summary answers one question — what is this thread about and what is still
 * open — and never speaks for the operator. The wording stays hedged and
 * attributed, and every claim the API gives message ids for is linked back to the
 * message it came from, so the summary is a shortcut into the thread rather than
 * a replacement for it.
 *
 * The block reserves its own height, so a summary arriving or regenerating never
 * moves the messages beneath it. The shader respects reduced motion and the dark
 * scrim keeps each state readable while the bloom moves behind it.
 */

export type ThreadSummarySource = {
  messageId: string
  label: string
}

function SummaryShell({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode
  tone?: "default" | "warning" | "failed"
  className?: string
}) {
  return (
    <section
      aria-live="polite"
      data-tone={tone}
      className={cn(
        "md-dexter-summary relative isolate overflow-hidden rounded-[var(--md-radius-xl)] px-3.5 py-3",
        className,
      )}
    >
      <span aria-hidden="true" className="md-dexter-summary__shader">
        <SpectralBloomShader shape="composer" />
      </span>
      <span aria-hidden="true" className="md-dexter-summary__scrim" />
      <div className="relative z-[2]">{children}</div>
    </section>
  )
}

function SummaryHeader({
  status,
  updatedLabel,
  onRegenerate,
  busy,
}: {
  status: ThreadSummaryState["status"]
  updatedLabel: string | null
  onRegenerate?: () => void
  busy: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="flex min-w-0 items-center gap-2">
      <AiBrain className="size-3.5 shrink-0 text-white/90" strokeWidth={1.5} aria-hidden="true" />
      <p className="min-w-0 truncate text-[11.5px] font-medium uppercase tracking-[0.07em] text-white/90">
        {t("Dexter summary")}
      </p>
      {status === "stale" ? (
        <span className="shrink-0 rounded-[var(--md-radius-sm)] bg-[rgba(255,214,150,0.18)] px-1.5 py-px text-[10.5px] font-medium text-[#ffddb0]">
          {t("Out of date")}
        </span>
      ) : null}
      <span className="ms-auto flex shrink-0 items-center gap-2">
        {updatedLabel ? (
          <span data-i18n-skip dir="auto" className="hidden text-[10.5px] tabular-nums text-white/60 sm:inline">
            {updatedLabel}
          </span>
        ) : null}
        {onRegenerate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Summarise this thread again")}
            title={t("Summarise this thread again")}
            disabled={busy}
            className="size-7 rounded-full text-white/65 transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/10 hover:text-white active:scale-[0.96] disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={onRegenerate}
          >
            <RefreshCw className={cn("size-3.5", busy && "animate-spin motion-reduce:animate-none")} strokeWidth={1.5} />
          </Button>
        ) : null}
      </span>
    </div>
  )
}

export function ThreadSummary({
  summary,
  sources = [],
  onRegenerate,
  onOpenSource,
  className,
}: {
  summary: ThreadSummaryState
  /** Messages the summary drew on. Only rendered when the API supplied ids. */
  sources?: ThreadSummarySource[]
  onRegenerate?: () => void
  onOpenSource?: (messageId: string) => void
  className?: string
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const pending = summary.status === "pending"
  const updatedLabel = summary.updatedAt
    ? new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(summary.updatedAt))
    : null

  if (summary.status === "none") {
    return null
  }

  if (summary.status === "failed") {
    return (
      <SummaryShell tone="failed" className={className}>
        <SummaryHeader status={summary.status} updatedLabel={null} busy={false} />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-white/88" role="alert">
            {summary.error?.trim() || t("Unable to summarise this thread. Read the messages below, or try again.")}
          </p>
          {onRegenerate ? (
            <Button
              type="button"
              variant="ghost"
              className="h-8 shrink-0 rounded-[var(--md-radius-md)] bg-white/12 px-3 text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/18 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={onRegenerate}
            >
              {t("Try again")}
            </Button>
          ) : null}
        </div>
      </SummaryShell>
    )
  }

  return (
    <SummaryShell tone={summary.status === "stale" ? "warning" : "default"} className={className}>
      <SummaryHeader
        status={summary.status}
        updatedLabel={pending ? null : updatedLabel}
        onRegenerate={onRegenerate}
        busy={pending}
      />

      {/* One reserved block for both states, so arrival changes the words and not
          the height of everything below. */}
      <div className="relative mt-2 min-h-[3.75rem]">
        <AnimatePresence initial={false} mode="wait">
          {pending ? (
            <motion.div
              key="pending"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
              className="flex flex-col gap-2"
            >
              <p className="text-[12.5px] leading-[1.5] text-white/80">{t("Dexter is reading this thread...")}</p>
              <span aria-hidden="true" className="h-[9px] w-[86%] rounded-full bg-white/12" />
              <span aria-hidden="true" className="h-[9px] w-[64%] rounded-full bg-white/12" />
            </motion.div>
          ) : (
            <motion.div
              key="ready"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.enter)}
            >
              <p
                data-i18n-skip
                dir="auto"
                className="text-pretty text-[12.5px] leading-[1.55] text-white"
              >
                {summary.text}
              </p>

              {summary.keyPoints.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {summary.keyPoints.map((point) => (
                    <li
                      key={point}
                      data-i18n-skip
                      dir="auto"
                      className="flex gap-2 text-[12px] leading-[1.5] text-white/82"
                    >
                      <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-white/70" />
                      <span className="min-w-0">{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-2 text-[11px] leading-[1.45] text-white/58">
                {summary.status === "stale"
                  ? t("Written before the latest reply arrived. Check the messages below.")
                  : t("Dexter wrote this from the messages below. Check them before you act on it.")}
              </p>

              {sources.length > 0 && onOpenSource ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sources.map((source, index) => (
                    <button
                      key={source.messageId}
                      type="button"
                      className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] outline-none transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/16 focus-visible:ring-[3px] focus-visible:ring-white/25 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                      onClick={() => onOpenSource(source.messageId)}
                    >
                      {t("Source")} <span data-i18n-skip dir="ltr" className="tabular-nums">{index + 1}</span>
                      <span className="sr-only">: </span>
                      <span data-i18n-skip dir="auto" className="font-normal text-white/70"> {source.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SummaryShell>
  )
}
