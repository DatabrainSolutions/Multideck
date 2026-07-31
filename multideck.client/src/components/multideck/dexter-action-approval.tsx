import { useId } from "react"
import { Check, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterPendingAction } from "@/lib/dexter-api"

export type DexterActionDecision = "approve" | "decline"

export type DexterActionApprovalProps = {
  action: DexterPendingAction
  pendingDecision?: DexterActionDecision | null
  error?: string | null
  onDecision: (decision: DexterActionDecision) => void
}

export function DexterActionApproval({
  action,
  pendingDecision = null,
  error = null,
  onDecision,
}: DexterActionApprovalProps) {
  const { t } = useLanguage()
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const isProcessing = pendingDecision !== null

  return (
    <section
      aria-busy={isProcessing}
      aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
      aria-labelledby={titleId}
      className="mt-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]"
      data-dexter-action={action.id}
      data-state={isProcessing ? "processing" : error ? "error" : "pending"}
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
        <dl className="mt-4 grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-bg)] p-3">
          {action.changes.map((change) => (
            <div
              key={`${change.field}-${change.value}`}
              className="grid grid-cols-[minmax(100px,0.7fr)_minmax(0,1fr)] gap-3 text-[12.5px] max-[460px]:grid-cols-1 max-[460px]:gap-0.5"
            >
              <dt className="capitalize text-[var(--md-subtle)]">{change.field}</dt>
              <dd className="break-words text-[var(--md-ink)]">
                <bdi>{change.value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
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
    </section>
  )
}
