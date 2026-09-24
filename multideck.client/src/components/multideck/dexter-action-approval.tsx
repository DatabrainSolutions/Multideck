import { useId } from "react"
import { Check, LoaderCircle, Minus, Plus, X } from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterActionChange, DexterPendingAction } from "@/lib/dexter-api"
import { cn } from "@/lib/utils"
import { mdEaseOut } from "@/lib/motion"
import { presentDexterApproval, formatDexterApprovalValue } from "@/lib/dexter-approval-presentation"

export type DexterActionDecision = "approve" | "decline"

export type DexterActionApprovalProps = {
  action: DexterPendingAction
  isPreparing?: boolean
  pendingDecision?: DexterActionDecision | null
  error?: string | null
  onDecision: (decision: DexterActionDecision) => void
}

function changeKind(change: DexterActionChange) {
  if (change.kind) return change.kind
  return change.before === null ? "added" : "changed"
}

function ChangeValue({
  label,
  value,
  tone,
  field,
}: {
  label: string
  value: string | null | undefined
  tone: "before" | "after"
  field: string
}) {
  const { language, t } = useLanguage()
  const displayValue = formatDexterApprovalValue(value, language)
  const Icon = tone === "before" ? Minus : Plus

  return (
    <div
      className="min-w-0"
    >
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--md-subtle)]">
        <Icon className="size-3" strokeWidth={1.6} aria-hidden="true" />
        {label}
      </span>
      <span className="mt-1 block whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--md-ink)]">
        <bdi>{value === null || value === undefined || value === "" ? t("Not set") : displayValue}</bdi>
      </span>
    </div>
  )
}

export function DexterActionApproval({
  action,
  isPreparing = false,
  pendingDecision = null,
  error = null,
  onDecision,
}: DexterActionApprovalProps) {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const review = presentDexterApproval(action.changes)
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const resolvedStatus = action.status && action.status !== "prepared" ? action.status : null
  const statusLabel = resolvedStatus === "succeeded" ? "Completed" : resolvedStatus === "declined" ? "Denied" : resolvedStatus === "superseded" ? "Replaced by your correction" : resolvedStatus === "expired" ? "Expired" : resolvedStatus === "failed" ? "Failed" : resolvedStatus === "approved" || resolvedStatus === "executing" ? "Processing" : "Unavailable"
  const awaitingPreparation = isPreparing && !resolvedStatus
  const isProcessing = awaitingPreparation || pendingDecision !== null || resolvedStatus === "approved" || resolvedStatus === "executing"
  const isDisabled = isProcessing || Boolean(resolvedStatus)

  return (
    <motion.section
      aria-busy={isProcessing}
      aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
      aria-labelledby={titleId}
      className="mt-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]"
      data-dexter-action={action.id}
      data-state={awaitingPreparation ? "preparing" : pendingDecision ? "processing" : resolvedStatus ?? (error ? "error" : "pending")}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: mdEaseOut }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]"
        >
          <Check className="size-4" strokeWidth={1.4} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-[14px] font-medium text-[var(--md-ink)]">
            {action.title}
          </h3>
          {action.target ? <p className="mt-1 text-[12.5px] text-[var(--md-ink)]">
            {action.target.url && /^\/(?!\/)[^\\]*$/.test(action.target.url)
              ? <a href={action.target.url} className="text-[var(--md-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{action.target.label}</a>
              : action.target.label}
          </p> : null}
          <p id={descriptionId} className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">
            {action.description}
          </p>
        </div>
      </div>

      {review.changes.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">
            {t("Review proposed changes")}
          </p>
          <dl className="mt-2 divide-y divide-[var(--md-line)]">
            {review.changes.map((change, index) => {
              const kind = changeKind(change)
              const after = change.after !== undefined ? change.after : change.value
              const beforeKnown = change.beforeKnown ?? change.before !== undefined

              return (
                <motion.div
                  key={`${change.field}-${change.before ?? "unknown"}-${after ?? "removed"}`}
                  className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(120px,0.65fr)_minmax(0,2fr)] sm:gap-4"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, filter: "blur(5px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={shouldReduceMotion ? { duration: 0 } : {
                    duration: 0.26,
                    delay: 0.06 + Math.min(index, 5) * 0.035,
                    ease: mdEaseOut,
                  }}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <dt className="min-w-0 text-[12px] font-medium text-[var(--md-text)]">
                      {change.field}
                    </dt>

                  </div>
                  <dd
                    className={cn(
                      "grid gap-2",
                      kind === "changed" && beforeKnown ? "sm:grid-cols-2" : "grid-cols-1",
                    )}
                  >
                    {kind !== "added" && beforeKnown ? (
                      <ChangeValue field={change.field} label={t(kind === "removed" ? "Removed" : "Previous value")} value={change.before} tone="before" />
                    ) : null}
                    {kind === "removed" && !beforeKnown ? <ChangeValue field={change.field} label={t("Change")} value={t("Clear this value")} tone="after" /> : null}
                    {kind !== "removed" ? (
                      <ChangeValue field={change.field} label={t(kind === "added" ? "Added" : "New value")} value={after} tone="after" />
                    ) : null}
                  </dd>
                </motion.div>
              )
            })}
          </dl>
        </div>
      ) : null}

      {review.issue && !resolvedStatus ? <p className="mt-3 text-[12.5px] leading-5 text-[var(--md-text)]" role="status">{t(review.issue)}</p> : null}

      {error ? (
        <p
          id={errorId}
          className="mt-3 text-[12.5px] leading-5 text-[var(--md-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {awaitingPreparation ? (
        <p className="mt-3 text-[12px] leading-5 text-[var(--md-subtle)]" role="status" aria-live="polite">
          {t("Preparing approval...")}
        </p>
      ) : null}

      {resolvedStatus ? <p className="mt-3 text-[12px] text-[var(--md-subtle)]" role="status">{t(statusLabel)}</p> : null}
      <div className={cn("mt-4 flex flex-wrap justify-end gap-2", resolvedStatus && "hidden")}>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--md-radius-lg)] px-4"
          disabled={isDisabled}
          data-decision="decline"
          onClick={() => onDecision("decline")}
        >
          {pendingDecision === "decline" ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.4} />
          ) : (
            <X className="size-3.5" strokeWidth={1.4} />
          )}
          {pendingDecision === "decline" ? t("Denying...") : t("Deny")}
        </Button>
        <Button
          type="button"
          className="min-h-11 rounded-[var(--md-radius-lg)] px-4"
          disabled={isDisabled || Boolean(review.issue)}
          data-decision="approve"
          onClick={() => onDecision("approve")}
        >
          {pendingDecision === "approve" ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.4} />
          ) : (
            <Check className="size-3.5" strokeWidth={1.4} />
          )}
          {pendingDecision === "approve" ? t("Approving...") : t("Approve")}
        </Button>
      </div>
    </motion.section>
  )
}
