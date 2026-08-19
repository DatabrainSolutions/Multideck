import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AiEditing, ArrowUp, Building2, LoaderCircle, Megaphone, Plus, RefreshCw, UserRound, UsersRound, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { StatusPill } from "@/components/multideck/status-pill"
import { SettingsInput, SettingsPageHeader, SettingsPanel, SettingsTextarea } from "@/components/multideck/settings-components"
import { WizardDialog, WizardSaveNowButton, type WizardStep } from "@/components/multideck/wizard-dialog"
import { useLanguage } from "@/i18n/language-provider"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  draftBroadcastWithAI, getBroadcastState, listBroadcastUsersPage, previewBroadcastAudience, saveBroadcastDraft, sendBroadcast,
  type BroadcastAudience, type BroadcastAudienceMode, type BroadcastHistoryItem, type BroadcastState,
} from "@/lib/developer-broadcast-api"

type BroadcastPreview = Awaited<ReturnType<typeof previewBroadcastAudience>>
type BroadcastStep = "audience" | "compose" | "preview" | "confirm"

async function accessToken() {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error("Sign in again before managing broadcasts.")
  return data.session.access_token
}

function audienceLabel(mode: BroadcastAudienceMode) {
  return mode === "all" ? "All active users" : mode === "departments" ? "Selected departments" : "Selected users"
}

function statusTone(status: BroadcastHistoryItem["status"]): "green" | "amber" | "red" | "blue" {
  return status === "sent" ? "green" : status === "failed" || status === "partially_failed" ? "red" : status === "sending" ? "amber" : "blue"
}

function countLabel(value: number, label: string) {
  return <div><p className="text-[22px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{label}</p></div>
}

function historyDate(item: BroadcastHistoryItem) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.sentAt ?? item.createdAt))
}

function HistoryRecipients({ item, t }: { item: BroadcastHistoryItem; t: (text: string) => string }) {
  return <div className="tabular-nums"><p className="font-medium text-[var(--md-ink)]">{item.recipientCount} {t(item.recipientCount === 1 ? "recipient" : "recipients")}</p>{item.status === "draft" ? <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Not sent")}</p> : <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{item.deliveredCount} {t("accepted")} · {item.failedCount} {t("failed")}</p>}</div>
}

function BroadcastHistory({ state, busy, loadingMore, openWizard, onLoadMore, t }: { state: BroadcastState | null; busy: BroadcastSettingsBusy; loadingMore: boolean; openWizard: (trigger?: HTMLButtonElement) => void; onLoadMore: () => void; t: (text: string) => string }) {
  const history = state?.history ?? []
  const columns = useMemo<DataTableColumn<BroadcastHistoryItem>[]>(() => [{
    id: "subject",
    label: "Subject",
    width: 300,
    minWidth: 240,
    resizable: true,
    sortValue: (item) => item.subject,
    cellClassName: "w-[38%] max-w-[520px] px-5 py-3.5",
    cell: (item) => <><p className="line-clamp-2 font-medium leading-[1.4] text-[var(--md-ink)]" data-i18n-skip dir="auto">{item.subject}</p>{item.error ? <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[var(--md-red)]">{item.error}</p> : null}</>,
  }, {
    id: "audience",
    label: "Audience",
    width: 165,
    minWidth: 140,
    sortValue: (item) => audienceLabel(item.audienceMode),
    cellClassName: "px-4 py-3.5 text-[var(--md-text)]",
    cell: (item) => t(audienceLabel(item.audienceMode)),
  }, {
    id: "recipients",
    label: "Recipients",
    width: 170,
    minWidth: 150,
    sortValue: (item) => item.recipientCount,
    cellClassName: "px-4 py-3.5",
    cell: (item) => <HistoryRecipients item={item} t={t} />,
  }, {
    id: "status",
    label: "Status",
    kind: "status",
    width: 130,
    minWidth: 110,
    sortValue: (item) => item.status,
    cellClassName: "px-4 py-3.5",
    cell: (item) => <StatusPill tone={statusTone(item.status)} indicator={false}>{t(item.status.replace("_", " "))}</StatusPill>,
  }, {
    id: "activity",
    label: "Activity",
    kind: "date",
    align: "end",
    width: 160,
    minWidth: 140,
    sortValue: (item) => new Date(item.sentAt ?? item.createdAt).getTime(),
    cellClassName: "px-5 py-3.5 text-end tabular-nums",
    cell: (item) => <><p className="text-[var(--md-ink)]">{historyDate(item)}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(item.sentAt ? "Sent" : "Created")}</p></>,
  }], [t])
  if (!history.length) return <div className="px-5 py-12 text-center"><p className="text-[13px] font-medium text-[var(--md-ink)]">{busy === "load" ? t("Loading broadcast history…") : t("No broadcasts yet")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Start a new broadcast to create the first reviewed draft.")}</p>{busy !== "load" ? <Button type="button" variant="outline" className="mt-4 h-9 rounded-[var(--md-radius-md)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={(event) => openWizard(event.currentTarget)}><Plus className="size-4" />{t("New broadcast")}</Button> : null}</div>

  return <>
    <ul className="divide-y divide-[rgba(11,20,19,0.07)] sm:hidden" aria-label={t("Recent broadcasts")}>
      {history.map((item) => <li key={item.id} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-[14px] font-medium leading-[1.35] text-[var(--md-ink)]" data-i18n-skip dir="auto">{item.subject}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t(audienceLabel(item.audienceMode))}</p></div><StatusPill tone={statusTone(item.status)} indicator={false}>{t(item.status.replace("_", " "))}</StatusPill></div>{item.error ? <p className="mt-2 text-[12px] leading-[1.45] text-[var(--md-red)]" role="status">{item.error}</p> : null}<div className="mt-3 flex items-end justify-between gap-4"><HistoryRecipients item={item} t={t} /><div className="text-end tabular-nums"><p className="text-[12px] text-[var(--md-ink)]">{historyDate(item)}</p><p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{t(item.sentAt ? "Sent" : "Created")}</p></div></div></li>)}
    </ul>
    <DataTable
      ariaLabel="Recent broadcasts"
      columns={columns}
      rows={history}
      getRowKey={(item) => item.id}
      storageKey="broadcast-history"
      showToolbar={false}
      showColumnManager={false}
      minimumWidth={760}
      rowClassName="align-top"
      exportConfig={{ fileName: "broadcast-history", recordCategory: "Broadcast details" }}
      className="hidden sm:block [&_[data-table-surface]]:rounded-none [&_[data-table-surface]]:shadow-none"
      tableClassName="text-[13px]"
    />
    {state?.historyHasMore ? <div className="flex justify-center px-4 py-3"><Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium" disabled={loadingMore} onClick={onLoadMore}>{t(loadingMore ? "Loading older broadcasts…" : "Load older broadcasts")}</Button></div> : null}
  </>
}

type BroadcastSettingsBusy = "load" | "preview" | "ai" | "draft" | "send" | null

function ServerEmailPreview({ preview, loading, t }: { preview: BroadcastPreview | null; loading: boolean; t: (text: string) => string }) {
  if (loading) return <div className="grid min-h-[430px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"><span className="flex items-center gap-2 text-[13px] text-[var(--md-text)]"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />{t("Preparing branded preview…")}</span></div>
  if (!preview?.emailPreview?.html) return <div className="grid min-h-[430px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] px-6 text-center shadow-[var(--md-shadow-line)]"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Preview is not ready")}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add a subject and message, then return to preview.")}</p></div></div>
  return <iframe title={t("Branded Multideck email preview")} sandbox="" srcDoc={preview.emailPreview.html} className="h-[min(58dvh,650px)] min-h-[430px] w-full rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]" />
}

export function BroadcastSettings() {
  const { t } = useLanguage()
  const [state, setState] = useState<BroadcastState | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState<BroadcastStep>("audience")
  const [audience, setAudience] = useState<BroadcastAudience>({ mode: "all", departmentIds: [], userIds: [] })
  const [preview, setPreview] = useState<BroadcastPreview | null>(null)
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [aiDirection, setAiDirection] = useState("")
  const [busy, setBusy] = useState<BroadcastSettingsBusy>("load")
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false)
  const [broadcastUsers, setBroadcastUsers] = useState<BroadcastState["users"]>([])
  const [broadcastUserQuery, setBroadcastUserQuery] = useState("")
  const [broadcastUsersHaveMore, setBroadcastUsersHaveMore] = useState(false)
  const [loadingBroadcastUsers, setLoadingBroadcastUsers] = useState(false)
  const [broadcastUsersError, setBroadcastUsersError] = useState("")
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const previewRequest = useRef(0)
  const wizardTrigger = useRef<HTMLButtonElement | null>(null)

  const load = useCallback(async () => {
    setBusy("load"); setError("")
    try {
      const next = await getBroadcastState(await accessToken(), { historyLimit: 20, historyOffset: 0 })
      setState(next)
      setBroadcastUsers([])
      setBroadcastUsersHaveMore(false)
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("Broadcasts could not be loaded.")) }
    finally { setBusy(null) }
  }, [t])

  useEffect(() => { void load() }, [load])

  const loadBroadcastUserPage = useCallback(async (query: string, offset: number, append: boolean) => {
    if (!state) return
    setLoadingBroadcastUsers(true)
    setBroadcastUsersError("")
    try {
      const page = await listBroadcastUsersPage(await accessToken(), { query, limit: 25, offset })
      const rows = page.rows
      const hasMore = page.hasMore
      setBroadcastUsers((current) => {
        if (!append) return rows
        const byId = new Map(current.map((user) => [user.id, user]))
        rows.forEach((user) => byId.set(user.id, user))
        return [...byId.values()]
      })
      setBroadcastUsersHaveMore(hasMore)
    } catch (caught) {
      setBroadcastUsersError(caught instanceof Error ? caught.message : t("Users could not be loaded."))
      if (!append) setBroadcastUsers([])
      setBroadcastUsersHaveMore(false)
    } finally {
      setLoadingBroadcastUsers(false)
    }
  }, [state, t])

  useEffect(() => {
    if (!wizardOpen || audience.mode !== "users" || !state) return
    const timer = window.setTimeout(() => void loadBroadcastUserPage(broadcastUserQuery, 0, false), broadcastUserQuery.trim() ? 220 : 0)
    return () => window.clearTimeout(timer)
  }, [audience.mode, broadcastUserQuery, loadBroadcastUserPage, state, wizardOpen])
  useEffect(() => {
    if (wizardOpen || !wizardTrigger.current) return
    const frame = window.requestAnimationFrame(() => wizardTrigger.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [wizardOpen])

  const audienceComplete = audience.mode === "all" || (audience.mode === "departments" ? audience.departmentIds.length > 0 : audience.userIds.length > 0)
  const composeComplete = Boolean(subject.trim() && message.trim())
  const steps = useMemo<WizardStep[]>(() => [
    { id: "audience", label: "Audience", hint: "Choose the recipients and review automatic exclusions.", complete: audienceComplete && Boolean(preview?.audience.recipientCount) },
    { id: "compose", label: "Compose", hint: "Write the message manually or ask Luna for an editable first draft.", complete: composeComplete },
    { id: "preview", label: "Preview", hint: "Review the exact branded email shell and refine any detail before sending.", complete: Boolean(preview?.emailPreview?.html) },
    { id: "confirm", label: "Confirm", hint: "Confirm the saved audience and message once. Multideck prevents duplicate dispatch.", complete: false },
  ], [audienceComplete, composeComplete, preview])

  useEffect(() => {
    if (!state || !wizardOpen) return
    if (audience.mode === "departments" && !audience.departmentIds.length) { setPreview(null); return }
    if (audience.mode === "users" && !audience.userIds.length) { setPreview(null); return }
    const request = ++previewRequest.current
    setBusy((current) => current ?? "preview")
    const timer = window.setTimeout(async () => {
      try {
        const next = await previewBroadcastAudience(await accessToken(), audience, { subject, body: message })
        if (request === previewRequest.current) { setPreview(next); setError("") }
      } catch (caught) {
        if (request === previewRequest.current) setError(caught instanceof Error ? caught.message : t("Audience preview could not be loaded."))
      } finally { if (request === previewRequest.current) setBusy((current) => current === "preview" ? null : current) }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [audience, message, state, subject, t, wizardOpen])

  function openWizard(trigger?: HTMLButtonElement) {
    if (trigger) wizardTrigger.current = trigger
    setAudience({ mode: "all", departmentIds: [], userIds: [] }); setSubject(""); setMessage(""); setAiDirection(""); setPreview(null); setError(""); setStatus(""); setBroadcastUserQuery(""); setBroadcastUsersError(""); setStep("audience"); setWizardOpen(true)
  }

  function changeAudience(mode: BroadcastAudienceMode) { setAudience((current) => ({ ...current, mode })) }
  function toggleDepartment(id: string) { setAudience((current) => ({ ...current, departmentIds: current.departmentIds.includes(id) ? current.departmentIds.filter((item) => item !== id) : [...current.departmentIds, id] })) }
  function toggleUser(id: string) { setAudience((current) => ({ ...current, userIds: current.userIds.includes(id) ? current.userIds.filter((item) => item !== id) : [...current.userIds, id] })) }

  async function prepareWithAI() {
    setBusy("ai"); setError("")
    try {
      const result = await draftBroadcastWithAI(await accessToken(), { direction: aiDirection, subject, body: message })
      setSubject(result.draft.subject); setMessage(result.draft.body); setStatus(t("AI prepared a draft. Review and edit it before sending."))
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("AI could not prepare a draft. Your wording is unchanged.")) }
    finally { setBusy(null) }
  }

  async function confirmSend() {
    if (!audienceComplete || !composeComplete || !preview?.audience.recipientCount) { setError(t("Complete the audience and message before sending.")); return }
    setBusy("send"); setError(""); setStatus("")
    try {
      const saved = await saveBroadcastDraft(await accessToken(), { subject, body: message, audience })
      const result = await sendBroadcast(await accessToken(), saved.draft)
      setState((current) => current ? { ...current, history: [result.broadcast, ...current.history.filter((item) => item.id !== result.broadcast.id)] } : current)
      setWizardOpen(false)
      setStatus(t("Broadcast accepted by Resend."))
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("Unable to send this broadcast. The draft and audience were preserved.")) }
    finally { setBusy(null) }
  }

  async function saveDraft() {
    if (!audienceComplete || !composeComplete || !preview?.audience.recipientCount) { setError(t("Complete the audience and message before saving this draft.")); return }
    setBusy("draft"); setError(""); setStatus("")
    try {
      const saved = await saveBroadcastDraft(await accessToken(), { subject, body: message, audience })
      setState((current) => current ? { ...current, history: [saved.draft, ...current.history.filter((item) => item.id !== saved.draft.id)] } : current)
      setWizardOpen(false)
      setStatus(t("Broadcast saved as a draft. Nothing was sent."))
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("Unable to save this draft. Your audience and message were preserved.")) }
    finally { setBusy(null) }
  }

  async function loadOlderHistory() {
    if (!state?.historyHasMore || loadingOlderHistory) return
    setLoadingOlderHistory(true)
    setError("")
    try {
      const next = await getBroadcastState(await accessToken(), { historyLimit: state.historyLimit ?? 20, historyOffset: state.history.length })
      setState((current) => current ? {
        ...current,
        history: [...current.history, ...next.history.filter((item) => !current.history.some((existing) => existing.id === item.id))],
        historyTotal: next.historyTotal,
        historyOffset: next.historyOffset,
        historyLimit: next.historyLimit,
        historyHasMore: next.historyHasMore,
      } : current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Older broadcasts could not be loaded."))
    } finally {
      setLoadingOlderHistory(false)
    }
  }

  const recipientCount = preview?.audience.recipientCount ?? 0
  const excludedCount = preview?.audience.excludedCount ?? 0
  const submitDisabled = busy !== null || !state?.deliveryConfigured || !audienceComplete || !composeComplete || !recipientCount || !preview?.emailPreview?.html

  return (
    <>
      <SettingsPageHeader title={t("Broadcast")} description={t("Create a branded email for workspace users. Review every recipient and the final message before sending.")} descriptionPlacement="under-title" icon={Megaphone} actions={<div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => void load()} disabled={busy !== null}><RefreshCw className={cn("size-3.5", busy === "load" && "animate-spin motion-reduce:animate-none")} />{t("Refresh")}</Button><Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={(event) => openWizard(event.currentTarget)}><Plus className="size-4" strokeWidth={1.5} />{t("New broadcast")}</Button></div>} />

      {error && !wizardOpen ? <div className="mt-5 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] p-4 shadow-[var(--md-shadow-line)]" role="alert"><p className="text-[13px] font-medium text-[var(--md-red)]">{t("Unable to complete the broadcast request.")}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{error}</p></div> : null}
      {status ? <p className="mt-5 rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a08)] px-4 py-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" role="status" aria-live="polite">{status}</p> : null}

      <div className="mt-5">
        <SettingsPanel title={t("Recent broadcasts")} description={t("Draft, sent, and failed delivery history is retained for audit.")}>
          <BroadcastHistory state={state} busy={busy} loadingMore={loadingOlderHistory} openWizard={openWizard} onLoadMore={() => void loadOlderHistory()} t={t} />
        </SettingsPanel>
      </div>

      <WizardDialog open={wizardOpen} onOpenChange={(open) => busy !== "send" && busy !== "draft" && setWizardOpen(open)} title="New broadcast" description="Create one reviewed administrative email for selected workspace users." steps={steps} activeStepId={step} onStepChange={(next) => setStep(next as BroadcastStep)} submitLabel="Send broadcast" onSubmit={() => void confirmSend()} saving={busy === "send"} submitDisabled={submitDisabled} secondaryAction={<WizardSaveNowButton label="Save as draft" onSubmit={() => void saveDraft()} saving={busy === "draft"} disabled={busy !== null || !audienceComplete || !composeComplete || !recipientCount} />} bodyMinHeight={510} className="sm:max-w-[880px]">
        {error ? <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] px-4 py-3" role="alert"><p className="text-[12px] leading-5 text-[var(--md-red)]">{error}</p></div> : null}
        {step === "audience" ? <AudienceStep state={state} audience={audience} preview={preview} busy={busy === "preview"} users={broadcastUsers} userQuery={broadcastUserQuery} usersHaveMore={broadcastUsersHaveMore} usersLoading={loadingBroadcastUsers} usersError={broadcastUsersError} onUserQuery={setBroadcastUserQuery} onLoadMoreUsers={() => void loadBroadcastUserPage(broadcastUserQuery, broadcastUsers.length, true)} onModeChange={changeAudience} onDepartmentToggle={toggleDepartment} onUserToggle={toggleUser} t={t} /> : null}
        {step === "compose" ? <ComposeStep subject={subject} message={message} direction={aiDirection} busy={busy === "ai"} onSubject={setSubject} onMessage={setMessage} onDirection={setAiDirection} onAI={() => void prepareWithAI()} t={t} /> : null}
        {step === "preview" ? <div className="grid gap-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-3 shadow-[var(--md-shadow-line)]"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(audienceLabel(audience.mode))} · <span className="tabular-nums">{recipientCount}</span> {t("recipients")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{excludedCount} {t("excluded automatically")}</p></div><Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => setStep("audience")}>{t("Edit audience")}</Button></div><div className="grid gap-4 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]"><div className="grid content-start gap-4"><label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Subject")}<SettingsInput value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} /></label><label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Message")}<SettingsTextarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={20000} className="min-h-[300px]" /></label><p className="text-[12px] leading-5 text-[var(--md-text)]">{t("Changes update the server-rendered branded preview. Nothing is sent from this step.")}</p></div><ServerEmailPreview preview={preview} loading={busy === "preview"} t={t} /></div></div> : null}
        {step === "confirm" ? <div className="grid gap-5"><div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)] sm:grid-cols-3">{countLabel(recipientCount, t("Recipients"))}{countLabel(excludedCount, t("Excluded"))}<div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t(audienceLabel(audience.mode))}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Saved on confirmation")}</p></div></div><ServerEmailPreview preview={preview} loading={busy === "preview"} t={t} /><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-[58ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("Confirming sends this exact audience and message through the approved Multideck sender.")}</p><div className="flex gap-2"><Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => setStep("audience")}>{t("Edit audience")}</Button><Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => setStep("preview")}>{t("Edit message")}</Button></div></div></div> : null}
      </WizardDialog>
    </>
  )
}

function AudienceStep({
  state,
  audience,
  preview,
  busy,
  users,
  userQuery,
  usersHaveMore,
  usersLoading,
  usersError,
  onUserQuery,
  onLoadMoreUsers,
  onModeChange,
  onDepartmentToggle,
  onUserToggle,
  t,
}: {
  state: BroadcastState | null
  audience: BroadcastAudience
  preview: BroadcastPreview | null
  busy: boolean
  users: BroadcastState["users"]
  userQuery: string
  usersHaveMore: boolean
  usersLoading: boolean
  usersError: string
  onUserQuery: (value: string) => void
  onLoadMoreUsers: () => void
  onModeChange: (mode: BroadcastAudienceMode) => void
  onDepartmentToggle: (id: string) => void
  onUserToggle: (id: string) => void
  t: (text: string) => string
}) {
  return <>
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("Broadcast audience")}>
      {(["all", "departments", "users"] as BroadcastAudienceMode[]).map((mode) => {
        const selected = audience.mode === mode
        const Icon = mode === "all" ? UsersRound : mode === "departments" ? Building2 : UserRound
        return <button key={mode} type="button" role="radio" aria-checked={selected} onClick={() => onModeChange(mode)} className={cn("min-h-[82px] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,color,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-a08)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100", selected && "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[inset_0_0_0_1px_var(--md-accent-a45)]")}><span className="flex items-center justify-between gap-3"><Icon className="size-4" strokeWidth={1.4} /><span className={cn("size-2 rounded-full bg-[var(--md-line)]", selected && "bg-[var(--md-accent)]")} /></span><span className="mt-3 block text-[13px] font-medium text-[var(--md-ink)]">{t(audienceLabel(mode))}</span></button>
      })}
    </div>

    {audience.mode === "departments" ? <div><p className="mb-3 text-[12px] font-medium text-[var(--md-ink)]">{t("Departments")}</p><div className="grid gap-2 sm:grid-cols-2">{state?.departments.filter((item) => item.isActive).map((department) => <label key={department.id} className="flex min-h-11 items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 shadow-[var(--md-shadow-line)]"><Checkbox checked={audience.departmentIds.includes(department.id)} onCheckedChange={() => onDepartmentToggle(department.id)} /><span className="min-w-0 break-words text-[13px] text-[var(--md-ink)]" data-i18n-skip dir="auto">{department.name}</span></label>)}</div>{!state?.departments.some((item) => item.isActive) ? <p className="text-[12px] leading-5 text-[var(--md-text)]">{t("No active departments yet. Add department membership while editing users.")}</p> : null}</div> : null}

    {audience.mode === "users" ? <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3"><label className="grid min-w-0 flex-1 gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">{t("Search users")}<SettingsInput value={userQuery} onChange={(event) => onUserQuery(event.target.value)} placeholder={t("Search by name or email")} /></label><p className="pb-2 text-[12px] tabular-nums text-[var(--md-subtle)]">{audience.userIds.length} {t("selected")}</p></div>
      <div className="max-h-[280px] space-y-2 overflow-y-auto pe-1" aria-busy={usersLoading}>
        {users.map((user) => <label key={user.id} className="flex min-h-12 items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 shadow-[var(--md-shadow-line)]"><Checkbox checked={audience.userIds.includes(user.id)} onCheckedChange={() => onUserToggle(user.id)} /><span className="min-w-0 flex-1"><span className="block break-words text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{user.name}</span><span className="block break-all text-[12px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{user.email}</span></span></label>)}
        {!users.length && !usersLoading ? <p className="px-2 py-4 text-center text-[12px] text-[var(--md-text)]">{t("No users found")}</p> : null}
      </div>
      {usersError ? <p className="text-[12px] text-[var(--md-red)]" role="status">{usersError}</p> : null}
      {usersHaveMore ? <Button type="button" variant="ghost" className="h-8 justify-self-center rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium" disabled={usersLoading} onClick={onLoadMoreUsers}>{t(usersLoading ? "Loading more users…" : "Load more users")}</Button> : null}
    </div> : null}

    <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)] sm:grid-cols-3" aria-busy={busy}>{countLabel(preview?.audience.recipientCount ?? 0, t("Recipients"))}{countLabel(preview?.audience.excludedCount ?? 0, t("Excluded"))}<div><p className="text-[13px] font-medium text-[var(--md-ink)]">{busy ? t("Updating audience…") : t(audienceLabel(audience.mode))}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Live recipient summary")}</p></div></div>
    {preview?.recipients.some((item) => item.status === "excluded") ? <div><p className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Excluded recipients")}</p><div className="space-y-2">{preview.recipients.filter((item) => item.status === "excluded").map((recipient) => <div key={recipient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5"><div className="min-w-0"><p className="break-words text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip dir="auto">{recipient.name}</p><p className="break-all text-[12px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{recipient.email}</p></div><StatusPill tone="amber" indicator={false}>{t(recipient.exclusionReason ?? "Excluded")}</StatusPill></div>)}</div></div> : null}
  </>
}

function ComposeStep({ subject, message, direction, busy, onSubject, onMessage, onDirection, onAI, t }: { subject: string; message: string; direction: string; busy: boolean; onSubject: (value: string) => void; onMessage: (value: string) => void; onDirection: (value: string) => void; onAI: () => void; t: (text: string) => string }) {
  const shouldReduceMotion = useReducedMotion()
  const [promptOpen, setPromptOpen] = useState(false)
  const promptInputRef = useRef<HTMLInputElement>(null)
  const promptTriggerRef = useRef<HTMLButtonElement>(null)
  const promptWasOpenRef = useRef(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (promptOpen) {
        promptWasOpenRef.current = true
        promptInputRef.current?.focus()
      } else if (promptWasOpenRef.current) {
        promptWasOpenRef.current = false
        promptTriggerRef.current?.focus()
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [promptOpen])

  function submitAIDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!direction.trim() && !subject.trim() && !message.trim())) return
    onAI()
  }

  return <>
    <label className="grid gap-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Subject")}<SettingsInput value={subject} onChange={(event) => onSubject(event.target.value)} maxLength={200} placeholder={t("Add a clear subject")} /></label>
    <label className="grid gap-2 text-[13px] font-medium text-[var(--md-ink)]">{t("Message")}<SettingsTextarea value={message} onChange={(event) => onMessage(event.target.value)} maxLength={20000} className="min-h-[220px]" placeholder={t("Write the message workspace users should receive")} /></label>
    <div className="flex min-w-0 justify-end">
      <motion.div
        initial={false}
        animate={{ width: promptOpen ? "100%" : 40 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "h-10 max-w-[520px] overflow-hidden rounded-full",
          promptOpen && "bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {promptOpen ? (
            <motion.form
              key="ai-prompt"
              id="broadcast-ai-prompt"
              data-wizard-escape-contained="true"
              className="flex h-10 w-full items-center gap-1.5 px-2"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(3px)" }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
              onSubmit={submitAIDraft}
              onKeyDownCapture={(event) => {
                if (event.key !== "Escape" || busy) return
                event.preventDefault()
                event.stopPropagation()
                event.nativeEvent.stopImmediatePropagation()
                setPromptOpen(false)
              }}
            >
              <AiEditing className="ms-1 size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
              <input
                ref={promptInputRef}
                value={direction}
                onChange={(event) => onDirection(event.target.value.slice(0, 2000))}
                disabled={busy}
                aria-label={t("Ask Luna to draft this email")}
                placeholder={t("How should this email be written?")}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--md-text)_70%,transparent)] disabled:opacity-70 sm:text-[13px]"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={t("Close AI prompt")}
                title={t("Close AI prompt")}
                onClick={() => setPromptOpen(false)}
                className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <X className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
              </button>
              <button
                type="submit"
                disabled={busy || (!direction.trim() && !subject.trim() && !message.trim())}
                aria-label={t("Draft email with AI")}
                title={t("Draft email with AI")}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,opacity,scale] duration-150 hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {busy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUp className="size-3.5" strokeWidth={1.7} aria-hidden="true" />}
              </button>
            </motion.form>
          ) : (
            <motion.button
              key="ai-pencil"
              ref={promptTriggerRef}
              type="button"
              aria-expanded="false"
              aria-controls="broadcast-ai-prompt"
              aria-label={t("Ask Luna to draft this email")}
              title={t("Ask Luna to draft this email")}
              onClick={() => setPromptOpen(true)}
              className="grid size-10 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background-color,color,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
              transition={{ type: "spring", duration: shouldReduceMotion ? 0 : 0.3, bounce: 0 }}
            >
              <AiEditing className="size-4" strokeWidth={1.4} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  </>
}
