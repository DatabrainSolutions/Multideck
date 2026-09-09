import { useId } from "react"
import { Check, LoaderCircle, Minus, Pencil, Plus, X } from "@/components/icons/hugeicons"
import { motion, useReducedMotion } from "motion/react"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterActionChange, DexterPendingAction } from "@/lib/dexter-api"
import { cn } from "@/lib/utils"
import { mdEaseOut } from "@/lib/motion"

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
}: {
  label: string
  value: string | null | undefined
  tone: "before" | "after"
}) {
  const { t } = useLanguage()
  const Icon = tone === "before" ? Minus : Plus

  return (
    <div
      className={cn(
        "min-w-0 rounded-[var(--md-radius-md)] px-3 py-2.5",
        tone === "before"
          ? "bg-[color-mix(in_srgb,var(--md-red)_9%,var(--md-surface))] text-[var(--md-red)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-red)_13%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--md-green)_9%,var(--md-surface))] text-[var(--md-green)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-green)_13%,transparent)]",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="size-3" strokeWidth={1.6} aria-hidden="true" />
        {label}
      </span>
      <span className="mt-1.5 block break-words text-[12.5px] leading-5 text-[var(--md-ink)]">
        <bdi>{value === null || value === undefined || value === "" ? t("Not set") : value}</bdi>
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
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const isProcessing = isPreparing || pendingDecision !== null

  return (
    <motion.section
      aria-busy={isProcessing}
      aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
      aria-labelledby={titleId}
      className="mt-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]"
      data-dexter-action={action.id}
      data-state={isPreparing ? "preparing" : pendingDecision ? "processing" : error ? "error" : "pending"}
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
          <p id={descriptionId} className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">
            {action.description}
          </p>
        </div>
      </div>

      {action.changes.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11.5px] font-medium text-[var(--md-subtle)]">
            {t("Review proposed changes")}
          </p>
          <dl className="mt-2 grid gap-2">
            {action.changes.map((change, index) => {
              const kind = changeKind(change)
              const after = change.after ?? change.value
              const beforeKnown = change.beforeKnown ?? change.before !== undefined
              const KindIcon = kind === "added" ? Plus : kind === "removed" ? Minus : Pencil

              return (
                <motion.div
                  key={`${change.field}-${change.before ?? "unknown"}-${after ?? "removed"}`}
                  className="rounded-[var(--md-radius-lg)] bg-[var(--md-bg)] p-3 shadow-[var(--md-shadow-line)]"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, filter: "blur(5px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={shouldReduceMotion ? { duration: 0 } : {
                    duration: 0.26,
                    delay: 0.06 + Math.min(index, 5) * 0.035,
                    ease: mdEaseOut,
                  }}
                >
                  <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                    <dt className="min-w-0 capitalize text-[12px] font-medium text-[var(--md-ink)]">
                      {change.field}
                    </dt>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium",
                        kind === "removed"
                          ? "bg-[color-mix(in_srgb,var(--md-red)_10%,var(--md-surface))] text-[var(--md-red)]"
                          : "bg-[color-mix(in_srgb,var(--md-green)_10%,var(--md-surface))] text-[var(--md-green)]",
                      )}
                    >
                      <KindIcon className="size-2.5" strokeWidth={1.7} aria-hidden="true" />
                      {t(kind === "added" ? "Added" : kind === "removed" ? "Removed" : "Changed")}
                    </span>
                  </div>
                  <dd
                    className={cn(
                      "grid gap-2",
                      kind === "changed" && beforeKnown ? "sm:grid-cols-2" : "grid-cols-1",
                    )}
                  >
                    {kind !== "added" && beforeKnown ? (
                      <ChangeValue label={t(kind === "removed" ? "Removed" : "Previous value")} value={change.before} tone="before" />
                    ) : null}
                    {kind !== "removed" ? (
                      <ChangeValue label={t(kind === "added" ? "Added" : "New value")} value={after} tone="after" />
                    ) : null}
                  </dd>
                </motion.div>
              )
            })}
          </dl>
        </div>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="mt-3 text-[12.5px] leading-5 text-[var(--md-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isPreparing ? (
        <p className="mt-3 text-[12px] leading-5 text-[var(--md-subtle)]" role="status" aria-live="polite">
          {t("Preparing approval...")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--md-radius-lg)] px-4"
          disabled={isProcessing}
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
          disabled={isProcessing}
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
