import { useId, useState, type ReactNode } from "react"
import { Check, Clock3, Pencil, ArrowUpRight } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import type { ApiDeal, DealLossReasonCode, DealNextAction, DealPeople, LoseDealInput, SetDealNextActionInput } from "@/lib/deal-api"
import { dealActionTypes, dealLocalDateTime, dealLossReasons, validateDealLoss, validateDealNextAction } from "@/lib/deal-workflow"

export type DealNextActionPanelProps = {
  deal: Pick<ApiDeal, "nextAction" | "actionHistory" | "ownerId" | "nextActionDueAt" | "isWon" | "wonAt" | "isLost" | "statusCode">
  owners: DealPeople["owners"]
  canEdit: boolean
  onSave: (input: SetDealNextActionInput) => Promise<void>
  onComplete: (actionId: string, note: string) => Promise<void>
  onOpenTasks?: (dueAt: string) => void
  actionControls?: ReactNode
}

/** One shared next action, linked to its assignee's Tasks and retained in deal history. */
export function DealNextActionPanel({ deal, owners, canEdit, onSave, onComplete, onOpenTasks, actionControls }: DealNextActionPanelProps) {
  const { t, language } = useLanguage()
  const formId = useId()
  const [editing, setEditing] = useState(false)
  const [completionTarget, setCompletionTarget] = useState<DealNextAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: "", type: "follow_up" as SetDealNextActionInput["type"], ownerId: "", dueAt: "" })
  const [completionNote, setCompletionNote] = useState("")
  const actionOwners = owners.filter((owner) => owner.canOwnAction !== false)
  const action = deal.nextAction
  const closed = Boolean(deal.isWon || deal.wonAt || deal.isLost || deal.statusCode.toLowerCase().includes("lost"))
  const history = (deal.actionHistory ?? []).filter((item) => item.id !== action?.id)
  const overdue = Boolean(action && new Date(action.dueAt).getTime() < Date.now())
  const formatDate = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))

  function startEditing() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    setDraft({ title: action?.title ?? "", type: action?.type ?? "follow_up", ownerId: actionOwners.find((owner) => owner.id === action?.ownerId)?.id ?? actionOwners.find((owner) => owner.id === deal.ownerId)?.id ?? "", dueAt: dealLocalDateTime(action?.dueAt ?? deal.nextActionDueAt ?? tomorrow) })
    setError(null)
    setEditing(true)
  }

  async function save() {
    if (busy) return
    const validation = validateDealNextAction(draft)
    if (validation) { setError(t(validation)); return }
    if (!actionOwners.some((owner) => owner.id === draft.ownerId)) { setError(t("Choose a colleague with permission to manage deals.")); return }
    setBusy(true)
    setError(null)
    try {
      await onSave({ ...draft, title: draft.title.trim(), dueAt: new Date(draft.dueAt).toISOString(), taskDate: draft.dueAt.slice(0, 10) })
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("This action could not be saved. Your changes are still here."))
    } finally { setBusy(false) }
  }

  async function complete() {
    if (!completionTarget || completionTarget.id !== action?.id || busy) return
    setBusy(true)
    setError(null)
    try {
      await onComplete(completionTarget.id, completionNote)
      setCompletionTarget(null)
      setCompletionNote("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("This action could not be completed. Try again."))
    } finally { setBusy(false) }
  }

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Next action")}</h2>
        {canEdit && !closed && action ? <Button variant="ghost" size="sm" onClick={startEditing}><Pencil className="size-3.5" />{t(action ? "Change action" : "Set next action")}</Button> : null}
      </div>
      <div className="px-5 pb-5 pt-3">
        {action ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--md-text)]">
              <span>{t(dealActionTypes.find((type) => type.value === action.type)?.label ?? "Follow up")}</span>
              {overdue ? <StatusPill tone="amber">{t("Overdue")}</StatusPill> : null}
            </div>
            <p className="mt-2 break-words text-[16px] font-medium leading-6 text-[var(--md-ink)]" data-i18n-skip dir="auto">{action.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--md-text)]">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /><span data-i18n-skip>{formatDate(action.dueAt)}</span></span>
              <span data-i18n-skip dir="auto">{action.ownerName || t("Assigned colleague")}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {actionControls}
              {canEdit && !closed ? <Button variant={actionControls ? "outline" : "default"} size="sm" onClick={() => { setCompletionTarget(action); setError(null) }}><Check className="size-3.5" />{t("Complete action")}</Button> : null}
              {action.taskId && onOpenTasks ? <Button size="sm" variant="ghost" onClick={() => onOpenTasks(action.dueAt)}>{t("Open Tasks")}<ArrowUpRight className="size-3.5" /></Button> : null}
            </div>
            {action.taskId ? <p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Also in the assigned colleague’s Tasks. Completing it there updates this deal.")}</p> : null}
          </>
        ) : (
          <div className="py-1">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(closed ? "This deal is closed" : history.some((item) => item.status === "completed") ? "What happens next?" : "Give this deal a clear next step")}</p>
            <p className="mt-1 max-w-lg text-[12px] leading-5 text-[var(--md-text)]">{t(closed ? "Previous actions stay in the history below." : "Decide what needs to happen, who will do it and when. It will appear in their Tasks.")}</p>
            {canEdit && !closed ? <Button className="mt-3" size="sm" onClick={startEditing}>{t("Set next action")}</Button> : null}
            {deal.nextActionDueAt && !closed ? <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Previously scheduled")}: <span data-i18n-skip>{formatDate(deal.nextActionDueAt)}</span></p> : null}
          </div>
        )}
        {history.length ? (
          <details className="mt-5 text-[12px]">
            <summary className="w-fit cursor-pointer rounded-md text-[var(--md-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">{t("Action history")} · {history.length}</summary>
            <ol className="mt-3 grid gap-4">
              {history.map((item) => <li key={item.id} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="min-w-0 break-words font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{item.title}</p><span className="text-[11px] text-[var(--md-subtle)]">{t(item.status === "completed" ? "Completed" : item.status === "superseded" ? "Replaced" : "Cancelled")}</span></div>
                <p className="text-[11px] text-[var(--md-text)]" data-i18n-skip>{item.ownerName} · {t(item.completedAt ? "Completed" : "Was due")} {formatDate(item.completedAt ?? item.dueAt)}</p>
                {item.completionNote ? <p className="whitespace-pre-wrap break-words leading-5 text-[var(--md-text)]" data-i18n-skip dir="auto">{item.completionNote}</p> : null}
              </li>)}
            </ol>
          </details>
        ) : null}
      </div>

      <Dialog open={editing} onOpenChange={(open) => { if (!busy) setEditing(open) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader><DialogTitle>{t(action ? "Change next action" : "Set next action")}</DialogTitle><DialogDescription>{t("Give the deal one clear commitment. It will be scheduled in the assigned colleague’s Tasks.")}</DialogDescription></DialogHeader>
          <form id={formId} onSubmit={(event) => { event.preventDefault(); void save() }}><fieldset disabled={busy} className="grid gap-4">
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("What needs to happen?")}</span><Input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={240} placeholder={t("e.g. Confirm weekly volumes with the buyer")} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Action type")}</span><Select value={draft.type} onValueChange={(type) => setDraft({ ...draft, type: type as SetDealNextActionInput["type"] })}><SelectTrigger className="w-full" aria-label={t("Action type")}><SelectValue /></SelectTrigger><SelectContent>{dealActionTypes.map((type) => <SelectItem key={type.value} value={type.value}>{t(type.label)}</SelectItem>)}</SelectContent></Select></label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Assigned to")}</span><Select value={draft.ownerId} onValueChange={(ownerId) => setDraft({ ...draft, ownerId })}><SelectTrigger className="w-full" aria-label={t("Assigned to")}><SelectValue placeholder={t("Choose a colleague")} /></SelectTrigger><SelectContent>{actionOwners.map((owner) => <SelectItem key={owner.id} value={owner.id}><span data-i18n-skip>{owner.name}</span></SelectItem>)}</SelectContent></Select></label>
            </div>
            {!actionOwners.length ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{t("No colleagues with permission to manage deals are available to assign this action.")}</p> : null}
            <label className="grid min-w-0 gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Due date and time")}</span><Input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} className="min-w-0" /><span className="text-[11px] font-normal text-[var(--md-subtle)]">{t("Shown in your local time")}</span></label>
            {error ? <p role="alert" className="text-[12px] leading-5 text-[var(--md-red)]">{error}</p> : null}
          </fieldset></form>
          <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>{t("Cancel")}</Button><Button form={formId} type="submit" disabled={busy || !canEdit || !actionOwners.length}>{t(busy ? "Saving…" : "Save next action")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(completionTarget)} onOpenChange={(open) => { if (!busy && !open) setCompletionTarget(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader><DialogTitle>{t("Complete action")}</DialogTitle><DialogDescription data-i18n-skip>{completionTarget?.title}</DialogDescription></DialogHeader>
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Outcome (optional)")}</span><Textarea autoFocus disabled={busy} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={2000} placeholder={t("What did you learn or agree?")} /></label>
          <p className="text-[12px] leading-5 text-[var(--md-text)]">{t(completionTarget && completionTarget.id !== action?.id ? "This action has changed or been completed. Close this dialog to review the latest action." : "This also completes the linked task. Set the next action afterwards to keep the deal moving.")}</p>
          {error ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{error}</p> : null}
          <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setCompletionTarget(null)}>{t("Cancel")}</Button><Button disabled={busy || !completionTarget || completionTarget.id !== action?.id || !canEdit} onClick={() => void complete()}>{t(busy ? "Completing…" : "Complete action")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Surface>
  )
}

/** Shared loss capture for a deal page and a board move into a lost stage. */
export function DealLossDialog({ open, onOpenChange, dealName, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; dealName: string; onConfirm: (input: LoseDealInput) => Promise<void>
}) {
  const { t } = useLanguage()
  const formId = useId()
  const [reasonCode, setReasonCode] = useState<DealLossReasonCode | "">("")
  const [details, setDetails] = useState("")
  const [competitor, setCompetitor] = useState("")
  const [revisitDate, setRevisitDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    if (busy) return
    const validation = validateDealLoss({ reasonCode, details, revisitDate })
    if (validation) { setError(t(validation)); return }
    setBusy(true)
    setError(null)
    try {
      await onConfirm({ reasonCode: reasonCode as DealLossReasonCode, details: details.trim() || null, competitor: competitor.trim() || null, revisitDate: revisitDate || null })
      onOpenChange(false)
      setReasonCode(""); setDetails(""); setCompetitor(""); setRevisitDate("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("This deal could not be marked lost. Your notes are still here.")) }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden rounded-[var(--md-radius-2xl)] sm:max-w-[540px]">
    <DialogHeader className="shrink-0 pe-8"><DialogTitle>{t("Why was this deal lost?")}</DialogTitle><DialogDescription>{t("Choose the main reason. It will be saved to the deal history and Sales insights.")} <span className="mt-1 block break-words font-medium" data-i18n-skip dir="auto">{dealName}</span></DialogDescription></DialogHeader>
    <form id={formId} className="-mx-1 min-h-0 overflow-y-auto overscroll-contain px-1" onSubmit={(event) => { event.preventDefault(); void confirm() }}><fieldset disabled={busy} className="grid gap-4">
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" role="group" aria-label={t("Main reason")}>
        {dealLossReasons.map((reason) => <Button key={reason.code} type="button" variant="ghost" aria-pressed={reasonCode === reason.code} className={cn("h-auto min-h-11 justify-start whitespace-normal rounded-[var(--md-radius-lg)] px-3 py-2 text-start text-[12px] shadow-[var(--md-shadow-line)]", reasonCode === reason.code && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]")} onClick={() => setReasonCode(reason.code)}>{t(reason.label)}</Button>)}
      </div>
      <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t(reasonCode === "other" ? "Reason" : "Additional detail (optional)")}</span><Textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} placeholder={t("Add useful context for the sales team")} className="min-h-24" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Competitor (optional)")}</span><Input value={competitor} onChange={(event) => setCompetitor(event.target.value)} maxLength={160} /></label>
        <label className="grid min-w-0 gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Revisit on (optional)")}</span><Input type="date" value={revisitDate} onChange={(event) => setRevisitDate(event.target.value)} className="min-w-0" /></label>
      </div>
      <p className="text-[11px] leading-5 text-[var(--md-text)]">{t("The deal leaves the open forecast. Its current action will be cancelled; the history stays available.")} {revisitDate ? t("The revisit date also adds a follow-up task.") : ""}</p>
    </fieldset></form>
    {error ? <p role="alert" className="shrink-0 text-[12px] leading-5 text-[var(--md-red)]">{error}</p> : null}
    <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end"><Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" form={formId} disabled={busy || !reasonCode || (reasonCode === "other" && !details.trim())} className="bg-[var(--md-red)] text-white hover:bg-[var(--md-red-strong)]">{t(busy ? "Saving…" : "Mark deal lost")}</Button></DialogFooter>
  </DialogContent></Dialog>
}
