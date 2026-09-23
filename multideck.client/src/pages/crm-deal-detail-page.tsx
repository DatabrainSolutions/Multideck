import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Building2, Mail, Phone, RefreshCw, Trophy } from "@/components/icons/hugeicons"
import { toast } from "sonner"

import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldCard, InlineSelectField } from "@/components/multideck/inline-field"
import { DealLossDialog, DealNextActionPanel } from "@/components/multideck/crm-deal-actions"
import { ContactEmailAction } from "@/components/multideck/contact-email-action"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { getPipelineSettings, type ApiPipeline } from "@/lib/pipeline-api"
import { getDeal, getDealPeople, updateDeal, completeDealNextAction, setDealNextAction, loseDeal, reopenDeal, markDealWon, moveDealStage, type ApiDeal, type DealPeople, type UpdateDealInput } from "@/lib/deal-api"
import { dealLocalDateTime, dealLossReasons, formatDealDate as formatDate, isLostDealStage, isOpenDealStage } from "@/lib/deal-workflow"
import { CrmConflictError, CrmMutationOutcomeUnknownError } from "@/lib/crm-supabase"

const dealModeOptions = [
  { value: "__none", label: "Not decided" },
  { value: "air", label: "Air" },
  { value: "ocean", label: "Ocean" },
  { value: "road", label: "Road" },
  { value: "rail", label: "Rail" },
  { value: "multimodal", label: "Multimodal" },
] as const

const dealDirectionOptions = [
  { value: "__none", label: "Not decided" },
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
  { value: "cross_trade", label: "Cross trade" },
] as const

/** The deal's own address, so a deal can be linked to and returned from. */
export function dealDetailPath(deal: { id: string }) {
  return `/crm/deals/${encodeURIComponent(deal.id)}`
}

/** Matches `/crm/deals/<id>` and hands back the id. */
export function crmDealDetailId(route: string) {
  const match = /^\/crm\/deals\/([^/]+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}

/** Keep the next commitment, its people and the commercial decision in one record. */
export function CrmDealDetailPage({ dealId, navigate }: { dealId: string; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [deal, setDeal] = useState<ApiDeal | null>(null)
  const [pipelines, setPipelines] = useState<ApiPipeline[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [people, setPeople] = useState<DealPeople | null>(null)
  const [peopleError, setPeopleError] = useState<string | null>(null)
  const [lossOpen, setLossOpen] = useState(false)
  const [lossStageId, setLossStageId] = useState<string | undefined>()
  const [winStageId, setWinStageId] = useState<string | null>(null)
  const [winning, setWinning] = useState(false)
  const [winError, setWinError] = useState<string | null>(null)
  const [stageSaving, setStageSaving] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenStageId, setReopenStageId] = useState("")
  const [reopenReason, setReopenReason] = useState("")
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)
  const dealRef = useRef<ApiDeal | null>(null)
  const dealSaveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    dealRef.current = null
    setPeople(null)
    setPeopleError(null)
    getDealPeople(dealId).then((result) => { if (active) setPeople(result) }).catch((cause) => { if (active) setPeopleError(cause instanceof Error ? cause.message : t("People for this deal could not be loaded.")) })
    Promise.all([getDeal(dealId, { forceRefresh: reloadToken > 0 }), getPipelineSettings({ forceRefresh: reloadToken > 0 })])
      .then(([found, settings]) => {
        if (!active) return
        if (!found) {
          setError(t("This deal is not in your pipeline any more."))
          setState("error")
          return
        }
        dealRef.current = found
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

  // Every deal mutation shares the same queue and version. Failures preserve each
  // editor's draft, while stale records are refreshed before an explicit retry.
  const saveDeal = useCallback((operation: (current: ApiDeal) => Promise<ApiDeal>) => {
    const save = dealSaveQueue.current.then(async () => {
      const current = dealRef.current
      if (!current) throw new Error(t("This deal is not ready to edit yet."))
      try {
        const next = await operation(current)
        dealRef.current = next
        setDeal(next)
      } catch (cause) {
        if (cause instanceof CrmConflictError || cause instanceof CrmMutationOutcomeUnknownError) {
          const latest = await getDeal(dealId, { forceRefresh: true }).catch(() => null)
          if (latest) { dealRef.current = latest; setDeal(latest) }
        }
        throw cause
      }
    })
    dealSaveQueue.current = save.catch(() => undefined)
    return save
  }, [dealId, t])

  const patch = useCallback((change: UpdateDealInput) => saveDeal((current) => updateDeal(dealId, change, current.editVersion)), [dealId, saveDeal])

  const requestedReturn = new URLSearchParams(window.location.search).get("from")
  const returnTo = requestedReturn && /^\/crm(?:\?(?:[^#]*)|$|\/(?:insights|deals)(?:\?|$))/.test(requestedReturn) ? requestedReturn.replace(/^\/crm\/insights/, "/crm") : "/crm/deals"
  const returnLabel = returnTo === "/crm" || returnTo.startsWith("/crm?") ? "Back to dashboard" : "Back to deals"

  const backButton = (
    <button
      type="button"
      onClick={() => navigate(returnTo)}
      className="group -ms-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
      {t(returnLabel)}
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
              <Button variant="ghost" onClick={() => navigate(returnTo)}>{t(returnLabel)}</Button>
            </div>
          </div>
        </Surface>
      </div>
    )
  }

  const currentDeal = deal
  const pipeline = pipelines.find((candidate) => candidate.id === currentDeal.pipelineId)
  const stages = pipeline?.stages ?? []
  const isLost = Boolean(currentDeal.isLost || currentDeal.statusCode.toLowerCase().includes("lost"))
  const isClosed = Boolean(currentDeal.isWon || currentDeal.wonAt || isLost)
  const canEdit = people?.canEdit === true
  const mainContact = people?.contacts.find((contact) => contact.id === currentDeal.primaryContactId)
  const conversionStage = stages.find((stage) => stage.isConversion)
  const openStages = stages.filter(isOpenDealStage)
  const ownerOptions = [
    { value: "__none", label: t("Unassigned") },
    ...(people?.owners ?? []).map((owner) => ({ value: owner.id, label: owner.name })),
    ...(currentDeal.ownerId && !people?.owners.some((owner) => owner.id === currentDeal.ownerId) ? [{ value: currentDeal.ownerId, label: currentDeal.ownerName ?? t("Previous owner") }] : []),
  ]
  const contactOptions = [
    { value: "__none", label: t("No main contact") },
    ...(people?.contacts ?? []).map((contact) => ({ value: contact.id, label: contact.name || contact.email || t("Unnamed contact") })),
    ...(currentDeal.primaryContactId && !people?.contacts.some((contact) => contact.id === currentDeal.primaryContactId) ? [{ value: currentDeal.primaryContactId, label: currentDeal.primaryContactName ?? t("Previous contact") }] : []),
  ]
  const openLoss = (stageId?: string) => { setLossStageId(stageId); setLossOpen(true) }
  const changeStage = async (stageId: string) => {
    const selected = stages.find((stage) => stage.id === stageId)
    if (!selected || !canEdit || isClosed) return
    if (selected.isConversion) { setWinError(null); setWinStageId(stageId); return }
    if (isLostDealStage(selected)) { openLoss(stageId); return }
    await saveDeal((current) => moveDealStage(current.id, current.pipelineId, stageId))
  }

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
            <DealTitleField readOnly={!canEdit} value={currentDeal.name} onSave={(name) => patch({ name })} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isClosed ? <StatusPill tone={isLost ? "red" : "green"}>{t(isLost ? "Lost" : "Won")}</StatusPill> : <Select value={currentDeal.pipelineStageId} disabled={!canEdit || stageSaving} onValueChange={async (stageId) => { setStageSaving(true); try { await changeStage(stageId) } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("The stage could not be changed.")) } finally { setStageSaving(false) } }}><SelectTrigger aria-label={t("Deal stage")} className="h-8 w-auto max-w-[240px] gap-2 rounded-full bg-[var(--md-surface)] px-3 text-[12px]"><span className="text-[var(--md-subtle)]">{t(stageSaving ? "Moving…" : "Stage")}</span><SelectValue /></SelectTrigger><SelectContent>{stages.filter(isOpenDealStage).map((stage) => <SelectItem key={stage.id} value={stage.id}><span data-i18n-skip>{stage.name}</span></SelectItem>)}</SelectContent></Select>}
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
          ) : canEdit && !isClosed ? (
            <div className="flex flex-wrap items-center gap-2">
              {conversionStage ? <Button variant="outline" onClick={() => { setWinError(null); setWinStageId(conversionStage.id) }}><Trophy className="size-4" />{t("Mark won")}</Button> : null}
              <Button variant="ghost" className="text-[var(--md-text)]" onClick={() => openLoss()}>{t("Mark lost")}</Button>
            </div>
          ) : null}
        </div>
      </motion.header>

      {peopleError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-3 text-[12px] text-[var(--md-text)]"><p>{peopleError} {t("Editing is unavailable until permissions can be checked.")}</p><Button variant="outline" size="sm" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button></div> : null}
      {isLost ? (
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Lost")}: {t(currentDeal.loss?.reasonName || "Reason not recorded")}</h2>
              {currentDeal.loss?.details ? <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--md-text)]" data-i18n-skip dir="auto">{currentDeal.loss.details}</p> : !currentDeal.loss?.reasonCode ? <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">{t("No structured loss reason was recorded for this deal.")}</p> : null}
              <p className="mt-2 text-[12px] text-[var(--md-text)]">
                {currentDeal.loss?.competitor ? <span>{t("Competitor")}: <span data-i18n-skip>{currentDeal.loss.competitor}</span> · </span> : null}
                {t("Closed")}: {formatDate(currentDeal.loss?.lostAt ?? currentDeal.lostAt, language)}
                {currentDeal.loss?.revisitDate ? ` · ${t("Revisit")}: ${formatDate(currentDeal.loss.revisitDate, language)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? <Button variant="outline" size="sm" onClick={() => { setReopenStageId(openStages.find((stage) => stage.isDefaultEntry)?.id ?? openStages[0]?.id ?? ""); setReopenError(null); setReopenOpen(true) }}>{t("Reopen deal")}</Button> : null}
              <Button variant="ghost" size="sm" onClick={() => navigate("/crm")}>{t("View CRM dashboard")}<ArrowRight className="size-3.5" /></Button>
            </div>
          </div>
        </Surface>
      ) : null}

      <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="min-w-0"><DealNextActionPanel
            deal={currentDeal}
            owners={people?.owners ?? []}
            canEdit={canEdit}
            onSave={(input) => saveDeal((current) => setDealNextAction(current.id, current.editVersion, input))}
            onComplete={(actionId, note) => saveDeal((current) => completeDealNextAction(current.id, current.editVersion, actionId, note))}
            actionControls={mainContact && !isClosed && (currentDeal.nextAction?.type === "email" || currentDeal.nextAction?.type === "follow_up") && mainContact.email
              ? <ContactEmailAction email={mainContact.email} name={mainContact.name} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[var(--md-accent-ink)] hover:text-[var(--md-accent-ink)]"><Mail className="size-3.5" />{t("Write email")}</ContactEmailAction>
              : mainContact && !isClosed && currentDeal.nextAction?.type === "call" && mainContact.phone
                ? <Button asChild size="sm"><a href={`tel:${mainContact.phone}`}><Phone className="size-3.5" />{t("Call contact")}</a></Button>
                : mainContact && !isClosed && currentDeal.nextAction?.type === "call"
                  ? <Button variant="outline" size="sm" onClick={() => navigate(`/crm/contacts/${mainContact.id}`)}>{t("Open contact")}</Button>
                  : undefined}
            onOpenTasks={currentDeal.nextAction?.ownerId === people?.currentUserId ? (dueAt) => navigate(`/to-do?date=${currentDeal.nextAction?.taskScheduledDate ?? dealLocalDateTime(dueAt).slice(0, 10)}`) : undefined}
          /></div>
        <div className="min-w-0"><InlineFieldCard title="Who is on it">
            <InlineSelectField label="Owner" value={currentDeal.ownerId ?? "__none"} options={ownerOptions} readOnly={!canEdit} onSave={async (ownerId) => {
              await patch({ ownerId: ownerId === "__none" ? null : ownerId })
              const action = dealRef.current?.nextAction
              toast.success(action && action.ownerId !== ownerId ? `${t("Deal owner updated. The next action stays with")} ${action.ownerName ?? t("its assigned colleague")}.` : t("Deal owner updated"))
            }} />
            <InlineSelectField label="Main contact" value={currentDeal.primaryContactId ?? "__none"} options={contactOptions} readOnly={!canEdit} onSave={(primaryContactId) => patch({ primaryContactId: primaryContactId === "__none" ? null : primaryContactId })} />
            <p className="px-1 pt-2 text-[11px] leading-5 text-[var(--md-subtle)]">{t("The deal owner leads the sale. Changing owner keeps the next action with its current assignee.")}</p>
          </InlineFieldCard></div>
        <div className="min-w-0"><InlineFieldCard title="What they need">
            <InlineField label="Customer need" kind="textarea" align="start" value={currentDeal.customerNeed ?? ""} placeholder="What problem are they actually trying to solve?" readOnly={!canEdit} onSave={(customerNeed) => patch({ customerNeed: customerNeed || null })} />
            <InlineField label="Our answer" kind="textarea" align="start" value={currentDeal.valueProposition ?? ""} placeholder="Why us, in the words you would say out loud" readOnly={!canEdit} onSave={(valueProposition) => patch({ valueProposition: valueProposition || null })} />
            <InlineField label="Service" value={currentDeal.serviceInterest ?? ""} readOnly={!canEdit} onSave={(serviceInterest) => patch({ serviceInterest: serviceInterest || null })} />
          </InlineFieldCard></div>
        <div className="min-w-0 xl:row-span-2"><InlineFieldCard title="Commercials">
            <InlineField
              label="Expected value"
              kind="number"
              value={currentDeal.expectedValueAmount == null ? "" : String(currentDeal.expectedValueAmount)}
              readOnly={!canEdit} onSave={(value) => patch({ expectedValueAmount: value === "" ? null : Number(value) })}
            />
            <InlineField
              label="Expected margin"
              kind="number"
              value={currentDeal.expectedMarginAmount == null ? "" : String(currentDeal.expectedMarginAmount)}
              readOnly={!canEdit} onSave={(value) => patch({ expectedMarginAmount: value === "" ? null : Number(value) })}
            />
            <InlineField label="Currency" value={currentDeal.currencyCode ?? ""} placeholder="GBP" hint="Three-letter currency code" readOnly={!canEdit} onSave={(currencyCode) => patch({ currencyCode: currencyCode || null })} />
            <InlineField
              label="Expected close"
              kind="date"
              value={currentDeal.expectedCloseDate ? currentDeal.expectedCloseDate.slice(0, 10) : ""}
              readOnly={!canEdit} onSave={(expectedCloseDate) => patch({ expectedCloseDate: expectedCloseDate || null })}
            />
            <InlineField label="Probability" value={currentDeal.probabilityPct == null ? "" : `${Math.round(currentDeal.probabilityPct)}%`} readOnly />
            <details className="px-1 py-2 text-[12px] text-[var(--md-text)]"><summary className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">{t("Deal details")}</summary><div className="mt-2"><InlineField label="Type" value={currentDeal.opportunityTypeName} readOnly /><InlineField label="Created" value={formatDate(currentDeal.createdAt, language)} readOnly /></div></details>
            {currentDeal.outcomeHistory?.length ? <details className="px-1 py-2 text-[12px] text-[var(--md-text)]"><summary className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">{t("Outcome history")} · {currentDeal.outcomeHistory.length}</summary><ol className="mt-3 grid gap-4">{currentDeal.outcomeHistory.map((outcome) => <li key={outcome.id}><div className="flex flex-wrap justify-between gap-1"><span className="font-medium text-[var(--md-ink)]">{t(outcome.event === "lost" ? "Lost" : outcome.event === "won" ? "Won" : "Reopened")}{outcome.event === "lost" && outcome.reasonCode ? ` · ${t(dealLossReasons.find((reason) => reason.code === outcome.reasonCode)?.label ?? outcome.reasonCode)}` : ""}</span><span className="text-[11px] text-[var(--md-subtle)]">{formatDate(outcome.occurredAt, language)}</span></div>{outcome.reason || outcome.details ? <p className="mt-1 whitespace-pre-wrap break-words leading-5" data-i18n-skip dir="auto">{outcome.reason || outcome.details}</p> : null}{outcome.event === "lost" && outcome.competitor ? <p className="mt-1 text-[11px]">{t("Competitor")}: <span data-i18n-skip>{outcome.competitor}</span></p> : null}</li>)}</ol></details> : null}
          </InlineFieldCard></div>
        <div className="min-w-0"><InlineFieldCard title="The freight">
            <InlineField label="Origin" value={currentDeal.originName ?? ""} readOnly={!canEdit} onSave={(originName) => patch({ originName: originName || null })} />
            <InlineField label="Destination" value={currentDeal.destinationName ?? ""} readOnly={!canEdit} onSave={(destinationName) => patch({ destinationName: destinationName || null })} />
            <InlineField label="Trade lane" value={currentDeal.tradeLane ?? ""} readOnly={!canEdit} onSave={(tradeLane) => patch({ tradeLane: tradeLane || null })} />
            <InlineSelectField
              label="Mode"
              value={currentDeal.modeCode ?? "__none"}
              options={dealModeOptions}
              readOnly={!canEdit} onSave={(modeCode) => patch({ modeCode: modeCode === "__none" ? null : modeCode })}
            />
            <InlineSelectField
              label="Direction"
              value={currentDeal.directionCode ?? "__none"}
              options={dealDirectionOptions}
              readOnly={!canEdit} onSave={(directionCode) => patch({ directionCode: directionCode === "__none" ? null : directionCode })}
            />
          </InlineFieldCard></div>
      </div>
      <DealLossDialog open={lossOpen} onOpenChange={setLossOpen} dealName={currentDeal.name} onConfirm={(input) => saveDeal((current) => loseDeal(current.id, current.editVersion, { ...input, ...(lossStageId ? { pipelineStageId: lossStageId } : {}) }))} />
      <Dialog open={reopenOpen} onOpenChange={(open) => { if (!reopening) setReopenOpen(open) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader><DialogTitle>{t("Reopen this deal?")}</DialogTitle><DialogDescription>{t("Bring the opportunity back into the pipeline. The previous loss and its notes stay in the history.")}</DialogDescription></DialogHeader>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Return to stage")}</span><Select value={reopenStageId} disabled={reopening} onValueChange={setReopenStageId}><SelectTrigger className="w-full" aria-label={t("Return to stage")}><SelectValue placeholder={t("Choose an open stage")} /></SelectTrigger><SelectContent>{openStages.map((stage) => <SelectItem key={stage.id} value={stage.id}><span data-i18n-skip>{stage.name}</span></SelectItem>)}</SelectContent></Select></label>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("What has changed?")}</span><Textarea autoFocus disabled={reopening} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} maxLength={2000} placeholder={t("e.g. Customer is ready to revisit the lane, or this was closed by mistake")} /></label>
          {!openStages.length ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{t("This pipeline needs an open stage before the deal can be reopened.")}</p> : null}
          {reopenError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{reopenError}</p> : null}
          <DialogFooter><Button variant="ghost" disabled={reopening} onClick={() => setReopenOpen(false)}>{t("Cancel")}</Button><Button disabled={reopening || !canEdit || !reopenStageId || !reopenReason.trim()} onClick={async () => { if (reopening || !reopenReason.trim()) return; setReopening(true); setReopenError(null); try { await saveDeal((current) => reopenDeal(current.id, current.editVersion, reopenStageId, reopenReason)); setReopenOpen(false); setReopenReason(""); toast.success(t("Deal reopened. Set the next action to keep it moving.")) } catch (cause) { setReopenError(cause instanceof Error ? cause.message : t("This deal could not be reopened.")) } finally { setReopening(false) } }}>{t(reopening ? "Reopening…" : "Reopen deal")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(winStageId)} onOpenChange={(open) => { if (!winning && !open) setWinStageId(null) }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>{t("Mark this deal won?")}</DialogTitle><DialogDescription>{t("This records the win and activates the company as a customer. Its deal history stays available.")}</DialogDescription></DialogHeader>
          <p className="text-[14px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{currentDeal.name}</p>
          {winError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{winError}</p> : null}
          <DialogFooter><Button variant="ghost" disabled={winning} onClick={() => setWinStageId(null)}>{t("Cancel")}</Button><Button disabled={winning || !canEdit} onClick={async () => { if (!winStageId || winning) return; setWinning(true); setWinError(null); try { await saveDeal((current) => markDealWon(current.id, winStageId)); setWinStageId(null); toast.success(t("Deal marked won and customer activated")) } catch (cause) { setWinError(cause instanceof Error ? cause.message : t("This deal could not be marked won.")) } finally { setWinning(false) } }}>{t(winning ? "Saving…" : "Mark won and activate customer")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The deal name, edited in place at heading size. */
function DealTitleField({ value, onSave, readOnly = false }: { value: string; onSave: (next: string) => Promise<void>; readOnly?: boolean }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const saving = useRef(false)
  const cancelled = useRef(false)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  async function commit() {
    if (saving.current || cancelled.current) return
    const next = draft.trim()
    if (!next) { setSaveError(t("Give this deal a name.")); return }
    if (next === value.trim()) { setEditing(false); return }
    saving.current = true
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(next)
      setEditing(false)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t("The deal name could not be saved. Your change is still here."))
    } finally { saving.current = false; setIsSaving(false) }
  }

  const headingClass = "text-[24px] font-medium leading-tight tracking-[-0.015em] text-[var(--md-ink)]"

  if (readOnly) return <h1 className={headingClass} data-i18n-skip dir="auto">{value}</h1>

  if (editing) {
    return (
      <div className="grid gap-1"><input
        autoFocus
        dir="auto"
        value={draft}
        aria-label={t("Deal name")}
        aria-invalid={Boolean(saveError)}
        aria-busy={isSaving}
        readOnly={isSaving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); void commit() }
          if (event.key === "Escape" && !saving.current) { event.preventDefault(); cancelled.current = true; setDraft(value); setEditing(false) }
        }}
        className={`${headingClass} w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] px-2 py-0.5 shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]`}
      />{isSaving ? <span role="status" className="text-[11px] text-[var(--md-subtle)]">{t("Saving…")}</span> : null}{saveError ? <p role="alert" className="max-w-lg text-[12px] leading-5 text-[var(--md-red)]">{saveError}</p> : null}</div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { cancelled.current = false; setSaveError(null); setEditing(true) }}
      dir="auto"
      className={`${headingClass} -mx-2 rounded-[var(--md-radius-md)] px-2 py-0.5 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]`}
    >
      <h1>{value}</h1>
    </button>
  )
}
