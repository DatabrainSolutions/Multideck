import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CircleCheck, CirclePause, CirclePlay, Filter, LoaderCircle, Mail, TriangleAlert, Workflow, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { PanelMessage, StatusBand, automationHealth } from "@/components/multideck/contact-card-components"
import { AutomationCanvas } from "@/components/multideck/contact-card-canvas"
import { ACTION_ICONS } from "@/components/multideck/contact-card-canvas"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import {
  pauseAutomation,
  publishAutomation,
  resumeAutomation,
  sendAutomationTest,
  turnAutomationOff,
  updateAutomation,
  useContactCardStore,
} from "@/lib/contact-card-store"
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_CONDITION_LABELS,
  formatDelay,
  isExternalAction,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCondition,
  type AutomationConditionKind,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

/** Sensible starting configuration for a node dropped from the palette. */
function defaultActionConfig(kind: AutomationActionKind, card: ContactCard): Record<string, string> {
  const existing = card.automation.actions.find((action) => action.kind === kind)?.config
  if (existing) return { ...existing }
  switch (kind) {
    case "assign-owner":
      return { owner: card.person.fullName, ownerId: card.ownerUserId }
    case "pipeline-stage":
      return {}
    case "add-to-list":
      return { list: "Event follow-up" }
    case "create-task":
      return { assignee: card.person.fullName, assigneeId: card.ownerUserId, dueInDays: "1" }
    case "notify-user":
      return { user: card.person.fullName, userId: card.ownerUserId }
    case "send-email":
      return { template: "", from: card.person.email }
  }
}

const DELAYS = [0, 15, 60, 240, 1440]

const MAX_CONDITIONS = 5
const MAX_ACTIONS = 8

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`
}

/* -------------------------------------------------------------------------- */
/* Drawers                                                                     */
/* -------------------------------------------------------------------------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[var(--md-text)]">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-[12px] text-[var(--md-subtle)]">{hint}</span> : null}
    </label>
  )
}

function ConditionDrawer({
  condition,
  open,
  onClose,
  onSave,
}: {
  condition: AutomationCondition | null
  open: boolean
  onClose: () => void
  onSave: (condition: AutomationCondition) => void
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<AutomationCondition | null>(condition)

  useEffect(() => setDraft(condition), [condition])

  if (!draft) return null
  const definition = AUTOMATION_CONDITION_LABELS[draft.kind]

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={t("Condition")} title={t(definition.label)} icon={Filter} width={440}>
      <div className="space-y-[var(--md-gap-lg)] p-1">
        <Field label={t("Condition")}>
          <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as AutomationConditionKind, value: "" })}>
            <SelectTrigger className="h-9 w-full text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(AUTOMATION_CONDITION_LABELS).map(([kind, item]) => (
                <SelectItem key={kind} value={kind}>
                  {t(item.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("Match")}>
          <Select value={draft.negated ? "not" : "is"} onValueChange={(value) => setDraft({ ...draft, negated: value === "not" })}>
            <SelectTrigger className="h-9 w-full text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="is">{t("Is")}</SelectItem>
              <SelectItem value="not">{t("Is not")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {definition.needsValue ? (
          <Field
            label={draft.kind === "email-domain" ? t("Domain") : t("Dates")}
            hint={draft.kind === "email-domain" ? t("One domain, without the @.") : undefined}
          >
            <Input
              className="h-9 text-[13px]"
              dir="ltr"
              value={draft.value}
              placeholder={draft.kind === "email-domain" ? "example.com" : "12–14 Aug 2026"}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            />
          </Field>
        ) : null}

        <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Reads as")}</p>
          <p className="mt-1 text-[13px] text-[var(--md-ink)]">{definition.describe(draft)}</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
            onClick={() => onSave(draft)}
          >
            {t("Save condition")}
          </Button>
        </div>
      </div>
    </SideDrawer>
  )
}

function ActionDrawer({
  action,
  open,
  onClose,
  onSave,
}: {
  action: AutomationAction | null
  open: boolean
  onClose: () => void
  onSave: (action: AutomationAction) => void
}) {
  const { t } = useLanguage()
  const { owners, pipelines } = useContactCardStore()
  const [draft, setDraft] = useState<AutomationAction | null>(action)

  useEffect(() => setDraft(action), [action])

  if (!draft) return null
  const definition = AUTOMATION_ACTION_LABELS[draft.kind]
  const setConfig = (key: string, value: string) => setDraft({ ...draft, config: { ...draft.config, [key]: value } })
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === draft.config.pipelineId)

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={t("Action")} title={t(definition.label)} icon={ACTION_ICONS[draft.kind]} width={440}>
      <div className="space-y-[var(--md-gap-lg)] p-1">
        <Field label={t("Action")}>
          <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as AutomationActionKind, config: {} })}>
            <SelectTrigger className="h-9 w-full text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(AUTOMATION_ACTION_LABELS).map(([kind, item]) => (
                <SelectItem key={kind} value={kind}>
                  {t(item.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {draft.kind === "assign-owner" ? (
          <Field label={t("Owner")}>
            <Select
              value={draft.config.ownerId ?? ""}
              onValueChange={(value) => {
                const owner = owners.find((item) => item.id === value)
                setDraft({ ...draft, config: { ...draft.config, ownerId: value, owner: owner?.name ?? "" } })
              }}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue placeholder={t("Choose an owner")} />
              </SelectTrigger>
              <SelectContent>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {draft.kind === "pipeline-stage" ? (
          <>
            <Field label={t("Pipeline")}>
              <Select
                value={draft.config.pipelineId ?? ""}
                onValueChange={(value) => {
                  const pipeline = pipelines.find((item) => item.id === value)
                  const stage = pipeline?.stages.find((item) => item.isDefaultEntry) ?? pipeline?.stages[0]
                  setDraft({
                    ...draft,
                    config: {
                      ...draft.config,
                      pipelineId: value,
                      pipeline: pipeline?.name ?? "",
                      stageId: stage?.id ?? "",
                      stage: stage?.name ?? "",
                    },
                  })
                }}
              >
                <SelectTrigger className="h-9 w-full text-[13px]">
                  <SelectValue placeholder={t("Choose a pipeline")} />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Stage")}>
              <Select
                value={draft.config.stageId ?? ""}
                disabled={!selectedPipeline}
                onValueChange={(value) => {
                  const stage = selectedPipeline?.stages.find((item) => item.id === value)
                  setDraft({ ...draft, config: { ...draft.config, stageId: value, stage: stage?.name ?? "" } })
                }}
              >
                <SelectTrigger className="h-9 w-full text-[13px]">
                  <SelectValue placeholder={t("Choose a stage")} />
                </SelectTrigger>
                <SelectContent>
                  {(selectedPipeline?.stages ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}

        {draft.kind === "add-to-list" ? (
          <Field label={t("List")}>
            <Input className="h-9 text-[13px]" value={draft.config.list ?? ""} onChange={(event) => setConfig("list", event.target.value)} />
          </Field>
        ) : null}

        {draft.kind === "create-task" ? (
          <>
            <Field label={t("Assign the task to")}>
              <Select
                value={draft.config.assigneeId ?? ""}
                onValueChange={(value) => {
                  const owner = owners.find((item) => item.id === value)
                  setDraft({ ...draft, config: { ...draft.config, assigneeId: value, assignee: owner?.name ?? "" } })
                }}
              >
                <SelectTrigger className="h-9 w-full text-[13px]">
                  <SelectValue placeholder={t("Choose a person")} />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Due in days")}>
              <Input
                type="number"
                min={0}
                max={30}
                className="h-9 text-[13px] tabular-nums"
                value={draft.config.dueInDays ?? "1"}
                onChange={(event) => setConfig("dueInDays", event.target.value)}
              />
            </Field>
          </>
        ) : null}

        {draft.kind === "notify-user" ? (
          <Field label={t("Notify")}>
            <Select
              value={draft.config.userId ?? ""}
              onValueChange={(value) => {
                const owner = owners.find((item) => item.id === value)
                setDraft({ ...draft, config: { ...draft.config, userId: value, user: owner?.name ?? "" } })
              }}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue placeholder={t("Choose a person")} />
              </SelectTrigger>
              <SelectContent>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {draft.kind === "send-email" ? (
          <>
            <div className="flex items-start gap-2.5 rounded-[var(--md-radius-md)] bg-[rgba(221,138,43,0.08)] p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" strokeWidth={1.5} />
              <p className="text-[12.5px] leading-5 text-[var(--md-text)]">
                {t("This is the only step that reaches someone outside the workspace. It needs a publish confirmation before it runs.")}
              </p>
            </div>
            <Field label={t("Template")}>
              <Input className="h-9 text-[13px]" value={draft.config.template ?? ""} onChange={(event) => setConfig("template", event.target.value)} />
            </Field>
            <Field label={t("Send from")}>
              <Input
                className="h-9 text-[13px]"
                dir="ltr"
                value={draft.config.from ?? ""}
                placeholder="name@multideck.solutions"
                onChange={(event) => setConfig("from", event.target.value)}
              />
            </Field>
            <Field label={t("Delay")}>
              <Select value={String(draft.delayMinutes)} onValueChange={(value) => setDraft({ ...draft, delayMinutes: Number(value) })}>
                <SelectTrigger className="h-9 w-full text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELAYS.map((delay) => (
                    <SelectItem key={delay} value={String(delay)}>
                      {delay === 0 ? t("Immediately") : formatDelay(delay)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}

        <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3">
          <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Reads as")}</p>
          <p className="mt-1 text-[13px] text-[var(--md-ink)]">{definition.describe(draft)}</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
            onClick={() => onSave(draft)}
          >
            {t("Save action")}
          </Button>
        </div>
      </div>
    </SideDrawer>
  )
}

/* -------------------------------------------------------------------------- */
/* Publish confirmation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The gate in front of anything that reaches a real person. It states the
 * consequence in plain sentences and offers a test send, which is the thing
 * that actually stops a broken template reaching a hundred strangers.
 */
function PublishDialog({
  card,
  open,
  onOpenChange,
  onConfirm,
}: {
  card: ContactCard
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useLanguage()
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState(false)

  const externalActions = card.automation.actions.filter((action) => action.enabled && isExternalAction(action))
  const internalCount = card.automation.actions.filter((action) => action.enabled && !isExternalAction(action)).length

  useEffect(() => {
    if (!open) {
      setTested(false)
      setTesting(false)
    }
  }, [open])

  async function runTest() {
    setTesting(true)
    try {
      await sendAutomationTest()
      setTested(true)
      toast.success(t("Test sent to you only. Nothing reached a lead."))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("The test could not be sent."))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{t("Turn this automation on?")}</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            {t("This starts immediately and applies to every future exchange on this card.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {externalActions.map((action) => (
            <div key={action.id} className="rounded-[var(--md-radius-md)] bg-[rgba(221,138,43,0.08)] p-3.5">
              <p className="text-[13.5px] leading-6 text-[var(--md-ink)]">
                {t("Everyone who shares their details will receive")}{" "}
                <strong className="font-medium">“{action.config.template || t("a template")}”</strong> {t("from")}{" "}
                <bdi className="font-medium" dir="ltr" data-i18n-skip>
                  {action.config.from || card.person.email}
                </bdi>
                {action.delayMinutes > 0 ? `, ${formatDelay(action.delayMinutes)} ${t("after they submit")}` : `, ${t("immediately")}`}.
              </p>
            </div>
          ))}

          {internalCount > 0 ? (
            <p className="text-[13px] text-[var(--md-text)]">
              {internalCount} {t("other actions stay inside the workspace: assignment, pipeline, tasks and notifications.")}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
            onClick={runTest}
            disabled={testing}
          >
            {testing ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" strokeWidth={1.4} />
            ) : tested ? (
              <CircleCheck data-icon="inline-start" strokeWidth={1.4} />
            ) : (
              <Mail data-icon="inline-start" strokeWidth={1.4} />
            )}
            {tested ? t("Test sent") : t("Send me a test first")}
          </Button>

          <div className="flex gap-2 sm:justify-end">
            <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button
              className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              onClick={onConfirm}
            >
              {t("Turn on")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function CardAutomationPanel({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const { automation } = card
  const health = automationHealth(automation)

  const [editingCondition, setEditingCondition] = useState<AutomationCondition | null>(null)
  const [editingAction, setEditingAction] = useState<AutomationAction | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  /** Where a newly added step should land once it is saved. */
  const [pendingInsert, setPendingInsert] = useState<{ group: "condition" | "action"; index: number } | null>(null)

  const hasLiveExternal = automation.actions.some((action) => action.enabled && isExternalAction(action))

  const runLog = useMemo(() => [...card.exchanges].reverse().slice(0, 8), [card.exchanges])

  function toggleStep(id: string) {
    updateAutomation(card.id, (current) => ({
      ...current,
      conditions: current.conditions.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
      actions: current.actions.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    }))
  }

  function removeStep(id: string) {
    updateAutomation(card.id, (current) => ({
      ...current,
      conditions: current.conditions.filter((item) => item.id !== id),
      actions: current.actions.filter((item) => item.id !== id),
    }))
  }

  function move<T>(items: readonly T[], from: number, to: number) {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  function reorder(group: "condition" | "action", from: number, to: number) {
    updateAutomation(card.id, (current) =>
      group === "condition"
        ? { ...current, conditions: move(current.conditions, from, to) }
        : { ...current, actions: move(current.actions, from, to) },
    )
  }

  /** Insert at the point the person pressed +, rather than always appending. */
  function insertAt<T>(items: T[], item: T, index: number | undefined) {
    const next = [...items]
    next.splice(index ?? next.length, 0, item)
    return next
  }

  function publish() {
    if (hasLiveExternal) {
      setPublishOpen(true)
      return
    }
    publishAutomation(card.id)
    toast.success(t("Automation published"))
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      {/* Health first: at an event, the fastest action must be to stop it. */}
      <StatusBand
        tone={health.tone === "amber" ? "warning" : health.tone === "green" ? "positive" : "neutral"}
        icon={health.tone === "amber" ? TriangleAlert : Zap}
        title={`${t("Automation")} · ${t(health.label)}`}
        detail={
          <>
            {health.detail}
            {automation.lastRunAt ? (
              <>
                {" "}
                {t("Last run")} {new Date(automation.lastRunAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                <span className="tabular-nums">{automation.runsToday}</span> {t("runs today")}
                {automation.failures > 0 ? (
                  <>
                    {" · "}
                    <span className="font-medium text-[var(--md-amber)] tabular-nums">{automation.failures}</span> {t("failed")}
                  </>
                ) : null}
              </>
            ) : (
              ` ${t("It has not run yet.")}`
            )}
          </>
        }
        actions={
          <>
            {automation.state === "active" ? (
              <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => pauseAutomation(card.id)}>
                <CirclePause data-icon="inline-start" strokeWidth={1.4} />
                {t("Pause")}
              </Button>
            ) : (
              <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => resumeAutomation(card.id)}>
                <CirclePlay data-icon="inline-start" strokeWidth={1.4} />
                {automation.state === "off" ? t("Turn on") : t("Resume")}
              </Button>
            )}
            {automation.state !== "off" ? (
              <Button
                variant="ghost"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)]"
                onClick={() => turnAutomationOff(card.id)}
              >
                {t("Turn off")}
              </Button>
            ) : null}
          </>
        }
      />

      <AnimatePresence initial={false}>
        {automation.hasUnpublishedChanges ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
          >
            <StatusBand
              tone="neutral"
              icon={Workflow}
              title={t("Unpublished changes")}
              detail={t("Your edits are saved as a draft. Publish them to change what happens on the next exchange.")}
              actions={
                <Button
                  className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                  onClick={publish}
                >
                  {t("Publish")}
                </Button>
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Surface padding="none" className="overflow-hidden p-3">
        <AutomationCanvas
          card={card}
          onEditCondition={setEditingCondition}
          onEditAction={setEditingAction}
          onAddAction={(kind, index) => {
            setPendingInsert({ group: "action", index })
            setEditingAction({
              id: newId("action"),
              kind,
              enabled: true,
              config: defaultActionConfig(kind, card),
              delayMinutes: kind === "send-email" ? 15 : 0,
            })
          }}
          onToggleStep={toggleStep}
          onRemoveStep={removeStep}
          onReorder={reorder}
        />
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Run log")} meta={t("The most recent exchanges and what the automation did.")} />
        <div className="mt-3">
          {runLog.length === 0 ? (
            <PanelMessage title={t("Nothing has run yet")} body={t("Runs appear here as soon as someone shares their details.")} />
          ) : (
            <ul className="divide-y divide-[rgba(11,20,19,0.06)]">
              {runLog.map((exchange) => (
                <li key={exchange.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--md-ink)]">
                      {exchange.firstName} {exchange.lastName}
                      <span className="text-[var(--md-subtle)]"> · {exchange.company}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--md-subtle)]">{exchange.automationDetail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[12px] text-[var(--md-subtle)] tabular-nums">
                      {new Date(exchange.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <StatusPill
                      tone={
                        exchange.automationOutcome === "failed"
                          ? "red"
                          : exchange.automationOutcome === "ran"
                            ? "green"
                            : "neutral"
                      }
                    >
                      {t(
                        exchange.automationOutcome === "ran"
                          ? "Ran"
                          : exchange.automationOutcome === "failed"
                            ? "Failed"
                            : exchange.automationOutcome === "skipped"
                              ? "Skipped"
                              : "Off",
                      )}
                    </StatusPill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>

      <ConditionDrawer
        condition={editingCondition}
        open={editingCondition !== null}
        onClose={() => setEditingCondition(null)}
        onSave={(condition) => {
          updateAutomation(card.id, (current) => ({
            ...current,
            conditions: current.conditions.some((item) => item.id === condition.id)
              ? current.conditions.map((item) => (item.id === condition.id ? condition : item))
              : insertAt(current.conditions, condition, pendingInsert?.group === "condition" ? pendingInsert.index : undefined),
          }))
          setPendingInsert(null)
          setEditingCondition(null)
        }}
      />

      <ActionDrawer
        action={editingAction}
        open={editingAction !== null}
        onClose={() => setEditingAction(null)}
        onSave={(action) => {
          updateAutomation(card.id, (current) => ({
            ...current,
            actions: current.actions.some((item) => item.id === action.id)
              ? current.actions.map((item) => (item.id === action.id ? action : item))
              : insertAt(current.actions, action, pendingInsert?.group === "action" ? pendingInsert.index : undefined),
          }))
          setPendingInsert(null)
          setEditingAction(null)
        }}
      />

      <PublishDialog
        card={card}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onConfirm={() => {
          publishAutomation(card.id)
          setPublishOpen(false)
          toast.success(t("Automation is live"))
        }}
      />
    </div>
  )
}

/** Compact automation summary for the card overview. */
export function AutomationSummaryBand({ card, onOpen }: { card: ContactCard; onOpen: () => void }) {
  const { t } = useLanguage()
  const health = automationHealth(card.automation)
  const enabled = card.automation.actions.filter((action) => action.enabled).length

  return (
    <StatusBand
      tone={health.tone === "amber" ? "warning" : "neutral"}
      icon={health.tone === "amber" ? TriangleAlert : Zap}
      title={`${t("Automation")} · ${t(health.label)}`}
      detail={
        <>
          {health.detail} <span className="tabular-nums">{enabled}</span> {t("actions enabled.")}
        </>
      }
      actions={
        <>
          {card.automation.state === "active" ? (
            <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => pauseAutomation(card.id)}>
              <CirclePause data-icon="inline-start" strokeWidth={1.4} />
              {t("Pause")}
            </Button>
          ) : null}
          <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)]" onClick={onOpen}>
            {t("Open automation")}
          </Button>
        </>
      }
    />
  )
}

/** Exposed for the settings tab so a card can opt out entirely. */
export function AutomationEnableRow({ card }: { card: ContactCard }) {
  const { t } = useLanguage()

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-[var(--md-ink)]">{t("Run an automation on every exchange")}</p>
        <p className="mt-1 text-[12.5px] text-[var(--md-text)]">
          {t("Optional. Off means a lead is still created, but nothing is routed or sent.")}
        </p>
      </div>
      <Switch
        checked={card.automation.state !== "off"}
        aria-label={t("Run an automation on every exchange")}
        onCheckedChange={(checked) => (checked ? resumeAutomation(card.id) : turnAutomationOff(card.id))}
      />
    </div>
  )
}
