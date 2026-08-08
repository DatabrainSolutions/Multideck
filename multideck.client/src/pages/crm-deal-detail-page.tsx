import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Building2, RefreshCw, Trophy } from "lucide-react"
import { toast } from "sonner"

import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldCard, InlineSelectField } from "@/components/multideck/inline-field"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { getPipelineSettings, type ApiPipeline } from "@/lib/pipeline-api"
import { listDeals, updateDeal, type ApiDeal, type UpdateDealInput } from "@/lib/deal-api"

/** The deal's own address, so a deal can be linked to and returned from. */
export function dealDetailPath(deal: { id: string }) {
  return `/crm/deals/${encodeURIComponent(deal.id)}`
}

/** Matches `/crm/deals/<id>` and hands back the id. */
export function crmDealDetailId(route: string) {
  const match = /^\/crm\/deals\/([^/]+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * A deal on its own screen, edited where it is read.
 *
 * It replaces a drawer that could only show four facts and change none of them.
 * Everything the pipeline knows about the deal is here, and every field writes on
 * its own — the stage is the one exception, because moving a deal has side effects
 * the board owns.
 */
export function CrmDealDetailPage({ dealId, navigate }: { dealId: string; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [deal, setDeal] = useState<ApiDeal | null>(null)
  const [pipelines, setPipelines] = useState<ApiPipeline[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    Promise.all([listDeals({ forceRefresh: reloadToken > 0 }), getPipelineSettings({ forceRefresh: reloadToken > 0 })])
      .then(([deals, settings]) => {
        if (!active) return
        const found = deals.find((candidate) => candidate.id === dealId) ?? null
        if (!found) {
          setError(t("This deal is not in your pipeline any more."))
          setState("error")
          return
        }
        setDeal(found)
        setPipelines(settings.pipelines)
        setState("ready")
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : t("The CRM service could not be reached."))
        setState("error")
      })
    return () => { active = false }
  }, [dealId, reloadToken, t])

  /**
   * One field's change. Only the key that changed is sent, so two people editing
   * different fields on the same deal cannot overwrite each other. It throws on
   * failure: the field that was edited catches it and shows the reason itself.
   */
  const patch = useCallback(async (change: UpdateDealInput) => {
    setDeal(await updateDeal(dealId, change))
  }, [dealId])

  const money = useMemo(() => (amount: number | null, currency: string | null) => {
    if (amount === null) return ""
    try {
      return new Intl.NumberFormat(language, { style: "currency", currency: currency || "GBP", maximumFractionDigits: 0 }).format(amount)
    } catch {
      return `${currency ?? ""} ${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(amount)}`.trim()
    }
  }, [language])

  const backButton = (
    <button
      type="button"
      onClick={() => navigate("/crm/deals")}
      className="group -ms-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
      {t("Back to deals")}
    </button>
  )

  if (state === "loading") {
    return <div className="md-page md-page-stack">{backButton}<Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label="Loading deal" minHeight={0} /></Surface></div>
  }

  if (state === "error" || !deal) {
    return (
      <div className="md-page md-page-stack">
        {backButton}
        <Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Deal unavailable")}</p>
            {error ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{error}</p> : null}
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw className="size-4" strokeWidth={1.5} />{t("Try again")}</Button>
              <Button variant="ghost" onClick={() => navigate("/crm/deals")}>{t("Back to deals")}</Button>
            </div>
          </div>
        </Surface>
      </div>
    )
  }

  const currentDeal = deal
  const pipeline = pipelines.find((candidate) => candidate.id === currentDeal.pipelineId)
  const stages = pipeline?.stages ?? []
  const stageIndex = stages.findIndex((stage) => stage.id === currentDeal.pipelineStageId)

  return (
    <div className="md-page md-page-stack">
      {backButton}

      <motion.header
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
        className="grid gap-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <DealTitleField value={currentDeal.name} onSave={(name) => patch({ name })} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={currentDeal.isWon ? "green" : "blue"}>{currentDeal.isWon ? t("Won") : currentDeal.pipelineStageName}</StatusPill>
              <button
                type="button"
                onClick={() => navigate(`/crm/accounts/${currentDeal.organisationId}`)}
                className="group inline-flex min-w-0 items-center gap-1.5 rounded-[var(--md-radius-sm)] text-[13px] font-medium text-[var(--md-accent)] outline-none transition-colors duration-150 hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
              >
                <Building2 className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate" dir="auto">{currentDeal.companyName}</span>
                <ArrowRight className="size-3 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
              </button>
              <span className="text-[12.5px] text-[var(--md-text)]">{currentDeal.pipelineName}</span>
            </div>
          </div>
          {currentDeal.isWon ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-accent-a10)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-accent)]">
              <Trophy className="size-3.5" strokeWidth={1.5} />
              {t("Converted to a customer")}
            </span>
          ) : null}
        </div>
      </motion.header>

      {/* The stage rail is the deal's journey. It is read-only here on purpose:
          moving a deal fires conversion rules the board owns, so it stays where
          the drag that triggers it lives. */}
      {stages.length ? (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: 0.04 }}
          className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]"
        >
          <div className="relative h-1.5 rounded-full bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.05)]">
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-0 start-0 w-full origin-left rounded-full bg-[var(--md-accent)] rtl:origin-right"
              initial={shouldReduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: stages.length > 1 ? Math.max(0.02, (stageIndex + 1) / stages.length) : 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.morph}
            />
          </div>
          <ol className="mt-2.5 flex items-center justify-between gap-2">
            {stages.map((stage, index) => (
              <li
                key={stage.id}
                className={`flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 ${index === 0 ? "justify-start" : index === stages.length - 1 ? "justify-end" : "justify-center"} ${index <= stageIndex ? "font-medium text-[var(--md-ink)]" : "text-[var(--md-subtle)]"}`}
              >
                <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${index <= stageIndex ? "bg-[var(--md-accent)]" : "bg-[var(--md-line)]"}`} />
                <span className="truncate">{stage.name}</span>
              </li>
            ))}
          </ol>
        </motion.div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("Expected value"), value: money(currentDeal.expectedValueAmount, currentDeal.currencyCode) || "—" },
          { label: t("Expected margin"), value: money(currentDeal.expectedMarginAmount, currentDeal.currencyCode) || "—" },
          { label: t("Probability"), value: currentDeal.probabilityPct == null ? "—" : `${Math.round(currentDeal.probabilityPct)}%` },
          { label: t("Expected close"), value: currentDeal.expectedCloseDate ? formatDate(currentDeal.expectedCloseDate, language) : "—" },
        ].map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.04) }}
          >
            <Surface padding="none" className="rounded-[var(--md-radius-xl)]">
              <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-text)]">{metric.label}</p>
                <p className="shrink-0 text-[18px] font-medium tabular-nums text-[var(--md-ink)]">{metric.value}</p>
              </div>
            </Surface>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)] xl:items-start">
        <div className="grid content-start gap-[var(--md-page-stack-gap)]">
          <InlineFieldCard title="What they need">
            <InlineField label="Customer need" kind="textarea" align="start" value={currentDeal.customerNeed ?? ""} placeholder="What problem are they actually trying to solve?" onSave={(customerNeed) => patch({ customerNeed: customerNeed || null })} />
            <InlineField label="Our answer" kind="textarea" align="start" value={currentDeal.valueProposition ?? ""} placeholder="Why us, in the words you would say out loud" onSave={(valueProposition) => patch({ valueProposition: valueProposition || null })} />
            <InlineField label="Service" value={currentDeal.serviceInterest ?? ""} onSave={(serviceInterest) => patch({ serviceInterest: serviceInterest || null })} />
          </InlineFieldCard>

          <InlineFieldCard title="The freight">
            <InlineField label="Origin" value={currentDeal.originName ?? ""} onSave={(originName) => patch({ originName: originName || null })} />
            <InlineField label="Destination" value={currentDeal.destinationName ?? ""} onSave={(destinationName) => patch({ destinationName: destinationName || null })} />
            <InlineField label="Trade lane" value={currentDeal.tradeLane ?? ""} onSave={(tradeLane) => patch({ tradeLane: tradeLane || null })} />
            <InlineField label="Mode" value={currentDeal.modeCode ?? ""} onSave={(modeCode) => patch({ modeCode: modeCode || null })} />
            <InlineField label="Direction" value={currentDeal.directionCode ?? ""} onSave={(directionCode) => patch({ directionCode: directionCode || null })} />
          </InlineFieldCard>
        </div>

        <div className="grid content-start gap-[var(--md-page-stack-gap)]">
          <InlineFieldCard title="Commercials">
            <InlineField
              label="Expected value"
              kind="number"
              value={currentDeal.expectedValueAmount == null ? "" : String(currentDeal.expectedValueAmount)}
              onSave={(value) => patch({ expectedValueAmount: value === "" ? null : Number(value) })}
            />
            <InlineField
              label="Expected margin"
              kind="number"
              value={currentDeal.expectedMarginAmount == null ? "" : String(currentDeal.expectedMarginAmount)}
              onSave={(value) => patch({ expectedMarginAmount: value === "" ? null : Number(value) })}
            />
            <InlineField label="Currency" value={currentDeal.currencyCode ?? ""} placeholder="GBP" hint="Three-letter currency code" onSave={(currencyCode) => patch({ currencyCode: currencyCode || null })} />
            <InlineField
              label="Expected close"
              kind="date"
              value={currentDeal.expectedCloseDate ? currentDeal.expectedCloseDate.slice(0, 10) : ""}
              onSave={(expectedCloseDate) => patch({ expectedCloseDate: expectedCloseDate || null })}
            />
            <InlineField label="Probability" value={currentDeal.probabilityPct == null ? "" : `${Math.round(currentDeal.probabilityPct)}%`} readOnly />
            <InlineField label="Stage" value={currentDeal.pipelineStageName} readOnly />
          </InlineFieldCard>

          <InlineFieldCard title="Who is on it">
            <InlineField label="Owner" value={currentDeal.ownerName ?? ""} readOnly />
            <InlineField label="Main contact" value={currentDeal.primaryContactName ?? ""} readOnly />
            <InlineField label="Account" value={currentDeal.companyName} readOnly />
            <InlineField label="Type" value={currentDeal.opportunityTypeName} readOnly />
            <InlineField label="Created" value={formatDate(currentDeal.createdAt, language)} readOnly />
          </InlineFieldCard>

          <InlineFieldCard title="Next step">
            <InlineField
              label="Due"
              kind="date"
              value={currentDeal.nextActionDueAt ? currentDeal.nextActionDueAt.slice(0, 10) : ""}
              onSave={(nextActionDueAt) => patch({ nextActionDueAt: nextActionDueAt || null })}
            />
          </InlineFieldCard>
        </div>
      </div>
    </div>
  )
}

/** The deal name, edited in place at heading size. */
function DealTitleField({ value, onSave }: { value: string; onSave: (next: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === value.trim()) { setDraft(value); return }
    try {
      await onSave(next)
    } catch (error) {
      setDraft(value)
      toast.error(error instanceof Error ? error.message : t("The deal name could not be saved."))
    }
  }

  const headingClass = "text-[24px] font-medium leading-tight tracking-[-0.015em] text-[var(--md-ink)]"

  if (editing) {
    return (
      <input
        autoFocus
        dir="auto"
        value={draft}
        aria-label={t("Deal name")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); void commit() }
          if (event.key === "Escape") { event.preventDefault(); setDraft(value); setEditing(false) }
        }}
        className={`${headingClass} w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] px-2 py-0.5 shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      dir="auto"
      className={`${headingClass} -mx-2 rounded-[var(--md-radius-md)] px-2 py-0.5 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]`}
    >
      <h1>{value}</h1>
    </button>
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}
