import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp, CircleCheck, CirclePause, CirclePlay, Filter, Health, LoaderCircle, Mail, MorphingIcon, Plus, RotateCcw, TestTube2, Trash2, TriangleAlert, Workflow, X } from "@/components/icons/hugeicons"
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
import { Textarea } from "@/components/ui/textarea"
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
  rerunAutomationRun,
  resumeAutomation,
  sendAutomationTest,
  testAutomation,
  turnAutomationOff,
  updateCard,
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
  type AutomationRun,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

/** Sensible starting configuration for a node dropped from the palette. */
function defaultActionConfig(kind: AutomationActionKind, card: ContactCard): Record<string, string> {
  const existing = card.automation.actions.find((action) => action.kind === kind)?.config
  if (existing) return { ...existing }
  switch (kind) {
    case "add-to-crm": {
      const pipeline = card.automation.actions.find((action) => action.config.pipelineId)?.config
      return {
        destination: "crm",
        recordType: "lead",
        duplicateHandling: "create",
        owner: card.person.fullName,
        ownerId: card.ownerUserId,
        pipeline: pipeline?.pipeline ?? "",
        pipelineId: pipeline?.pipelineId ?? "",
        stage: pipeline?.stage ?? "",
        stageId: pipeline?.stageId ?? "",
        dealName: `${card.person.company || "New"} enquiry`,
        customNotes: "",
      }
    }
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

type FieldMapping = { source: string; target: string }

const SOURCE_FIELDS = [
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "phone", label: "Phone" },
]

const CRM_TARGETS = {
  lead: [
    { value: "firstName", label: "First name" },
    { value: "lastName", label: "Last name" },
    { value: "email", label: "Email" },
    { value: "company", label: "Company" },
    { value: "phone", label: "Phone" },
  ],
  deal: [
    { value: "name", label: "Deal name" },
    { value: "contactEmail", label: "Contact email" },
    { value: "company", label: "Company" },
    { value: "customerNeed", label: "Customer need" },
  ],
} as const

function readMappings(value: string | undefined): FieldMapping[] {
  try {
    const parsed = JSON.parse(value ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((item): item is FieldMapping => typeof item?.source === "string" && typeof item?.target === "string") : []
  } catch {
    return []
  }
}

const DELAYS = [0, 15, 60, 240, 1440]

const MAX_CONDITIONS = 5
const MAX_ACTIONS = 8

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

/* -------------------------------------------------------------------------- */
/* In-canvas inspectors                                                        */
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

function InspectorShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useLanguage()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 shadow-[inset_0_-1px_0_rgba(11,20,19,0.07)]">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{eyebrow}</p>
          <h3 className="mt-0.5 truncate text-[15px] font-medium text-[var(--md-ink)]">{title}</h3>
        </div>
        <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Close details")} onClick={onClose}>
          <X className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md-scrollbar">{children}</div>
    </div>
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

  if (!open || !draft) return null
  const definition = AUTOMATION_CONDITION_LABELS[draft.kind]

  return (
    <InspectorShell eyebrow={t("Condition")} title={t(definition.label)} onClose={onClose}>
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
    </InspectorShell>
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

  if (!open || !draft) return null
  const definition = AUTOMATION_ACTION_LABELS[draft.kind]
  const setConfig = (key: string, value: string) => setDraft({ ...draft, config: { ...draft.config, [key]: value } })
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === draft.config.pipelineId)
  const mappings = readMappings(draft.config.fieldMappings)
  const targetOptions = draft.config.recordType === "deal" ? CRM_TARGETS.deal : CRM_TARGETS.lead
  const setMappings = (next: FieldMapping[]) => setConfig("fieldMappings", JSON.stringify(next))

  return (
    <InspectorShell eyebrow={t("Action")} title={t(definition.label)} onClose={onClose}>
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

        {draft.kind === "add-to-crm" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Destination")}>
                <Select value="crm" disabled>
                  <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="crm">{t("CRM")}</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label={t("Record type")}>
                <Select
                  value={draft.config.recordType ?? "lead"}
                  onValueChange={(recordType) => {
                    const defaults = recordType === "deal"
                      ? [{ source: "company", target: "name" }, { source: "email", target: "contactEmail" }]
                      : SOURCE_FIELDS.map((field) => ({ source: field.value, target: field.value }))
                    setDraft({ ...draft, config: { ...draft.config, recordType, fieldMappings: JSON.stringify(defaults) } })
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">{t("Lead")}</SelectItem>
                    <SelectItem value="deal">{t("Deal")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t("Duplicate handling")} hint={t("Each valid submission creates a separate lead so an anonymous visitor cannot overwrite an existing CRM record.")}>
              <Select value="create" disabled>
                <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">{t("Create a separate lead for review")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("Owner")}>
              <Select
                value={draft.config.ownerId ?? ""}
                onValueChange={(value) => {
                  const owner = owners.find((item) => item.id === value)
                  setDraft({ ...draft, config: { ...draft.config, ownerId: value, owner: owner?.name ?? "" } })
                }}
              >
                <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue placeholder={t("Choose an owner")} /></SelectTrigger>
                <SelectContent>{owners.map((owner) => <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            <Field label={t("Pipeline")}>
              <Select
                value={draft.config.pipelineId ?? ""}
                onValueChange={(value) => {
                  const pipeline = pipelines.find((item) => item.id === value)
                  const stage = pipeline?.stages.find((item) => item.isDefaultEntry) ?? pipeline?.stages[0]
                  setDraft({ ...draft, config: { ...draft.config, pipelineId: value, pipeline: pipeline?.name ?? "", stageId: stage?.id ?? "", stage: stage?.name ?? "" } })
                }}
              >
                <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue placeholder={t("Choose a pipeline")} /></SelectTrigger>
                <SelectContent>{pipelines.map((pipeline) => <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={draft.config.recordType === "deal" ? t("Deal stage") : t("Lead stage")}>
              <Select value={draft.config.stageId ?? ""} disabled={!selectedPipeline} onValueChange={(value) => {
                const stage = selectedPipeline?.stages.find((item) => item.id === value)
                setDraft({ ...draft, config: { ...draft.config, stageId: value, stage: stage?.name ?? "" } })
              }}>
                <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue placeholder={t("Choose a stage")} /></SelectTrigger>
                <SelectContent>{(selectedPipeline?.stages ?? []).map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            {draft.config.recordType === "deal" ? (
              <Field label={t("Deal name")} hint={t("Use {company} to insert the submitted company name.")}>
                <Input className="h-9 text-[13px]" value={draft.config.dealName ?? "{company} enquiry"} onChange={(event) => setConfig("dealName", event.target.value)} />
              </Field>
            ) : null}

            <div>
              <div className="mb-2">
                <p className="text-[12.5px] font-medium text-[var(--md-text)]">{t("Map fields")}</p>
                <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Choose exactly where each submitted value is saved.")}</p>
              </div>
              <div className="grid gap-1.5">
                {mappings.map((mapping, index) => (
                  <div key={`${mapping.source}-${index}`} className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_32px] items-center gap-1.5">
                    <Select value={mapping.source} onValueChange={(source) => setMappings(mappings.map((item, itemIndex) => itemIndex === index ? { ...item, source } : item))}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{SOURCE_FIELDS.map((field) => <SelectItem key={field.value} value={field.value}>{t(field.label)}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-center text-[var(--md-subtle)]" aria-hidden="true">→</span>
                    <Select value={mapping.target} onValueChange={(target) => setMappings(mappings.map((item, itemIndex) => itemIndex === index ? { ...item, target } : item))}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{targetOptions.map((field) => <SelectItem key={field.value} value={field.value}>{t(field.label)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Remove mapping")} onClick={() => setMappings(mappings.filter((_, itemIndex) => itemIndex !== index))}>
                      <X className="size-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" className="h-8 justify-start rounded-[var(--md-radius-md)] px-2 text-[12px] text-[var(--md-accent)]" onClick={() => setMappings([...mappings, { source: "email", target: draft.config.recordType === "deal" ? "contactEmail" : "email" }])}>
                  + {t("Add mapping")}
                </Button>
              </div>
            </div>
          </>
        ) : null}

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
    </InspectorShell>
  )
}

/* -------------------------------------------------------------------------- */
/* Publish confirmation                                                        */
/* -------------------------------------------------------------------------- */

type AutomationMutationKind = "publish" | "pause" | "resume" | "off"

function useConfirmedAutomationMutation() {
  const { t } = useLanguage()
  const [saving, setSaving] = useState<AutomationMutationKind | null>(null)

  async function run(kind: AutomationMutationKind, mutation: () => Promise<void>, successMessage: string) {
    if (saving) return false
    setSaving(kind)
    try {
      await mutation()
      toast.success(t(successMessage))
      return true
    } catch (cause) {
      const reason = cause instanceof Error ? t(cause.message) : t("The automation could not be saved.")
      toast.error(`${reason} ${t("The previous confirmed setting has been restored. Check your connection and try again.")}`)
      return false
    } finally {
      setSaving(null)
    }
  }

  return { saving, run }
}

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
  confirming = false,
}: {
  card: ContactCard
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  confirming?: boolean
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
    <Dialog open={open} onOpenChange={(next) => { if (!confirming) onOpenChange(next) }}>
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
            disabled={testing || confirming}
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
            <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" disabled={confirming} onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button
              className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              disabled={confirming}
              onClick={onConfirm}
            >
              {confirming ? t("Saving…") : t("Turn on")}
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

export function AutomationRunHistory({ runs, onRerun }: { runs: AutomationRun[]; onRerun: (run: AutomationRun) => Promise<void> }) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState<string | null>(runs.find((run) => run.status === "failed")?.id ?? null)
  const [rerunning, setRerunning] = useState<string | null>(null)

  async function rerun(run: AutomationRun) {
    setRerunning(run.id)
    try {
      await onRerun(run)
      toast.success(t("Failed steps reran successfully"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to rerun these steps. Check the setup and try again."))
    } finally {
      setRerunning(null)
    }
  }

  if (runs.length === 0) {
    return <PanelMessage title={t("Nothing has run yet")} body={t("Runs appear here as soon as someone shares their details or you test the automation.")} />
  }

  return (
    <div className="overflow-hidden rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]">
      <div className="hidden grid-cols-[110px_minmax(180px,1fr)_100px_90px_36px] gap-3 bg-[var(--md-surface-tint)] px-3 py-2 text-[11px] font-medium text-[var(--md-subtle)] sm:grid">
        <span>{t("Status")}</span><span>{t("Started")}</span><span>{t("Duration")}</span><span>{t("Records")}</span><span />
      </div>
      <div className="divide-y divide-[rgba(11,20,19,0.07)]">
        {runs.map((run) => {
          const open = expanded === run.id
          const tone = run.status === "failed" ? "red" : run.status === "succeeded" ? "green" : "neutral"
          return (
            <div key={run.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : run.id)}
                className="grid w-full gap-2 px-3 py-2.5 text-start transition-colors duration-[140ms] hover:bg-[var(--md-surface-tint)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a22)] sm:grid-cols-[110px_minmax(180px,1fr)_100px_90px_36px] sm:items-center sm:gap-3"
              >
                <span><StatusPill tone={tone}>{t(run.status === "failed" ? "Failed" : run.status === "succeeded" ? "Succeeded" : run.status === "running" ? "Running" : "Skipped")}</StatusPill>{run.isTest ? <span className="ms-1.5 text-[10px] text-[var(--md-subtle)]">{t("Test")}</span> : null}</span>
                <span className="text-[12.5px] text-[var(--md-text)] tabular-nums">{new Date(run.startedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}<span className="ms-2 text-[var(--md-subtle)]">{run.trigger}</span></span>
                <span className="text-[12px] text-[var(--md-subtle)] tabular-nums">{run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}</span>
                <span className="text-[12px] text-[var(--md-subtle)] tabular-nums">{run.recordsAffected}</span>
                <span className="grid size-8 place-items-center text-[var(--md-subtle)]"><MorphingIcon from={ChevronDown} to={ChevronUp} active={open} className="size-4" strokeWidth={1.5} /></span>
              </button>

              {open ? (
                <div className="grid gap-4 bg-[var(--md-surface-soft)] px-3 pb-4 pt-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(300px,1.1fr)]">
                  <div className="grid gap-3">
                    {run.status === "failed" ? (
                      <div className="rounded-[var(--md-radius-md)] bg-[rgba(209,78,78,0.08)] p-3">
                        <p className="text-[12px] font-medium text-[var(--md-red)]">{t("What happened")}</p>
                        <p className="mt-1 text-[13px] leading-5 text-[var(--md-ink)]">{run.errorSummary}</p>
                        <p className="mt-2 text-[12px] font-medium text-[var(--md-text)]">{t("How to fix it")}</p>
                        <p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">{run.recovery ?? t("Review the failed step, save the correction, then rerun it.")}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[12px] font-medium text-[var(--md-text)]">{t("Preserved input")}</p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-line)]">
                        {Object.entries(run.input).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-[10.5px] text-[var(--md-subtle)]">{key}</dt><dd className="truncate text-[12px] text-[var(--md-ink)]" dir="auto">{String(value)}</dd></div>)}
                      </dl>
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-[var(--md-text)]">{t("Step trace")}</p>
                    <ol className="mt-2 grid gap-1.5">
                      {run.steps.map((step) => (
                        <li key={step.id} className={cn("grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 py-2 shadow-[var(--md-shadow-line)]", step.status === "failed" && "bg-[rgba(209,78,78,0.06)]")}>
                          <span className={cn("mt-0.5 size-3.5 rounded-full", step.status === "succeeded" ? "bg-[var(--md-green)]" : step.status === "failed" ? "bg-[var(--md-red)]" : "bg-[var(--md-subtle)]")} />
                          <span className="min-w-0"><span className="block text-[12.5px] text-[var(--md-ink)]">{step.label}</span><span className="mt-0.5 block text-[11.5px] leading-4 text-[var(--md-subtle)]">{step.detail}</span></span>
                          <span className="text-[11px] text-[var(--md-subtle)] tabular-nums">{step.durationMs}ms</span>
                        </li>
                      ))}
                    </ol>
                    {run.status === "failed" && !run.isTest ? (
                      <Button className="mt-3 h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)]" disabled={rerunning === run.id} onClick={() => void rerun(run)}>
                        {rerunning === run.id ? <LoaderCircle data-icon="inline-start" className="animate-spin" strokeWidth={1.5} /> : <RotateCcw data-icon="inline-start" strokeWidth={1.5} />}
                        {t("Rerun failed steps")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CrmFieldMappingPanel({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const automationMutation = useConfirmedAutomationMutation()
  const crmAction = card.automation.actions.find((action) => action.kind === "add-to-crm")
  const customNotes = crmAction?.config.customNotes ?? ""

  function updateCustomNotes(value: string) {
    updateAutomation(card.id, (automation) => ({
      ...automation,
      actions: automation.actions.map((action) => action.kind === "add-to-crm"
        ? { ...action, enabled: true, config: { ...action.config, duplicateHandling: "create", recordType: "lead", customNotes: value } }
        : { ...action, enabled: false }),
    }))
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <Surface padding="md" className="p-5">
        <SectionHeader
          title={t("Lead creation")}
          meta={t("Names, email, company and phone are mapped automatically. These details are added to every new lead created by this card.")}
          action={card.automation.hasUnpublishedChanges ? (
            <Button
              className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)]"
              disabled={automationMutation.saving !== null}
              onClick={() => { void automationMutation.run("publish", () => publishAutomation(card.id), "Lead settings saved") }}
            >
              {t(automationMutation.saving === "publish" ? "Saving…" : "Save changes")}
            </Button>
          ) : null}
        />

        <div className="mt-5 grid gap-5">
          <label className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
            <span><span className="block text-[13px] font-medium text-[var(--md-ink)]">{t("Lead source")}</span><span className="mt-0.5 block text-[11.5px] text-[var(--md-subtle)]">{t("Applied to every submission")}</span></span>
            <Input value={card.leadSource} onChange={(event) => updateCard(card.id, (current) => ({ ...current, leadSource: event.target.value }))} placeholder={t("Add a lead source")} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base sm:text-[13px]" />
          </label>

          <div className="h-px bg-[var(--md-line)]" />

          <label className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
            <span><span className="block text-[13px] font-medium text-[var(--md-ink)]">{t("Custom notes")}</span><span className="mt-0.5 block text-[11.5px] leading-4 text-[var(--md-subtle)]">{t("Added to the lead’s Notes section after a submission")}</span></span>
            <Textarea
              value={customNotes}
              onChange={(event) => updateCustomNotes(event.target.value)}
              placeholder={t("Add context for the lead record")}
              className="min-h-24 resize-y rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base sm:text-[13px]"
            />
          </label>
        </div>
      </Surface>
    </div>
  )
}

export function CardAutomationPanel({ card }: { card: ContactCard }) {
  return <CrmFieldMappingPanel card={card} />
}

function LegacyCardAutomationPanel({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const { automation } = card
  const health = automationHealth(automation)
  const automationMutation = useConfirmedAutomationMutation()

  const [editingCondition, setEditingCondition] = useState<AutomationCondition | null>(null)
  const [editingAction, setEditingAction] = useState<AutomationAction | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  /** Where a newly added step should land once it is saved. */
  const [pendingInsert, setPendingInsert] = useState<{ group: "condition" | "action"; index: number } | null>(null)

  const hasLiveExternal = automation.actions.some((action) => action.enabled && isExternalAction(action))

  const runLog = useMemo(() => [...automation.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12), [automation.runs])

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
    void automationMutation.run("publish", () => publishAutomation(card.id), "Automation published")
  }

  function saveCondition(condition: AutomationCondition) {
    updateAutomation(card.id, (current) => ({
      ...current,
      conditions: current.conditions.some((item) => item.id === condition.id)
        ? current.conditions.map((item) => (item.id === condition.id ? condition : item))
        : insertAt(current.conditions, condition, pendingInsert?.group === "condition" ? pendingInsert.index : undefined),
    }))
    setPendingInsert(null)
    setEditingCondition(null)
  }

  function saveAction(action: AutomationAction) {
    updateAutomation(card.id, (current) => ({
      ...current,
      actions: current.actions.some((item) => item.id === action.id)
        ? current.actions.map((item) => (item.id === action.id ? action : item))
        : insertAt(current.actions, action, pendingInsert?.group === "action" ? pendingInsert.index : undefined),
    }))
    setPendingInsert(null)
    setEditingAction(null)
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      {/* Health first: at an event, the fastest action must be to stop it. */}
      <StatusBand
        tone={health.tone === "amber" ? "warning" : health.tone === "green" ? "positive" : "neutral"}
        icon={Health}
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
              <Button
                variant="outline"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
                disabled={automationMutation.saving !== null}
                onClick={() => { void automationMutation.run("pause", () => pauseAutomation(card.id), "Automation paused") }}
              >
                <CirclePause data-icon="inline-start" strokeWidth={1.4} />
                {t(automationMutation.saving === "pause" ? "Saving…" : "Pause")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
                disabled={automationMutation.saving !== null}
                onClick={() => { void automationMutation.run("resume", () => resumeAutomation(card.id), "Automation resumed") }}
              >
                <CirclePlay data-icon="inline-start" strokeWidth={1.4} />
                {t(automationMutation.saving === "resume" ? "Saving…" : automation.state === "off" ? "Turn on" : "Resume")}
              </Button>
            )}
            {automation.state !== "off" ? (
              <Button
                variant="ghost"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px] text-[var(--md-text)]"
                disabled={automationMutation.saving !== null}
                onClick={() => { void automationMutation.run("off", () => turnAutomationOff(card.id), "Automation turned off") }}
              >
                {t(automationMutation.saving === "off" ? "Saving…" : "Turn off")}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Automation canvas")}</p>
            <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Select a step to edit it without leaving the flow.")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
              onClick={() => void testAutomation(card.id).then(() => toast.success(t("Test run added to the history"))).catch((error) => toast.error(error instanceof Error ? error.message : t("Unable to test this automation.")))}
            >
              <TestTube2 data-icon="inline-start" strokeWidth={1.5} />
              {t("Test automation")}
            </Button>
            {automation.hasUnpublishedChanges ? (
              <Button className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)]" onClick={publish}>
                {t("Publish changes")}
              </Button>
            ) : null}
          </div>
        </div>
        <AutomationCanvas
          card={card}
          onEditCondition={(condition) => { setEditingAction(null); setEditingCondition(condition) }}
          onEditAction={(action) => { setEditingCondition(null); setEditingAction(action) }}
          onAddCondition={(index) => {
            if (automation.conditions.length >= MAX_CONDITIONS) {
              toast.error(t("An automation can have up to five conditions."))
              return
            }
            setPendingInsert({ group: "condition", index })
            setEditingAction(null)
            setEditingCondition({ id: newId("condition"), kind: "new-lead", negated: false, value: "", enabled: true })
          }}
          onAddAction={(kind, index) => {
            if (automation.actions.length >= MAX_ACTIONS) {
              toast.error(t("An automation can have up to eight actions."))
              return
            }
            setPendingInsert({ group: "action", index })
            setEditingCondition(null)
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
          inspector={
            editingCondition ? (
              <ConditionDrawer condition={editingCondition} open onClose={() => setEditingCondition(null)} onSave={saveCondition} />
            ) : editingAction ? (
              <ActionDrawer action={editingAction} open onClose={() => setEditingAction(null)} onSave={saveAction} />
            ) : null
          }
        />
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader title={t("Run history")} meta={t("Open any run to see each step, preserved input and a clear recovery path.")} />
        <div className="mt-3">
          <AutomationRunHistory runs={runLog} onRerun={async (run) => rerunAutomationRun(run.id)} />
        </div>
      </Surface>

      <PublishDialog
        card={card}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        confirming={automationMutation.saving === "publish"}
        onConfirm={() => {
          void automationMutation.run("publish", () => publishAutomation(card.id), "Automation is live").then((saved) => {
            if (saved) setPublishOpen(false)
          })
        }}
      />
    </div>
  )
}

/** Compact automation summary for the card overview. */
export function AutomationSummaryBand({ card, onOpen }: { card: ContactCard; onOpen: () => void }) {
  const { t } = useLanguage()
  const automationMutation = useConfirmedAutomationMutation()
  const health = automationHealth(card.automation)
  const enabled = card.automation.actions.filter((action) => action.enabled).length

  return (
    <StatusBand
      tone={health.tone === "amber" ? "warning" : "neutral"}
      icon={Health}
      title={`${t("Automation")} · ${t(health.label)}`}
      detail={
        <>
          {health.detail} <span className="tabular-nums">{enabled}</span> {t("actions enabled.")}
        </>
      }
      actions={
        <>
          {card.automation.state === "active" ? (
            <Button
              variant="outline"
              className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
              disabled={automationMutation.saving !== null}
              onClick={() => { void automationMutation.run("pause", () => pauseAutomation(card.id), "Automation paused") }}
            >
              <CirclePause data-icon="inline-start" strokeWidth={1.4} />
              {t(automationMutation.saving === "pause" ? "Saving…" : "Pause")}
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
  const automationMutation = useConfirmedAutomationMutation()

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
        disabled={automationMutation.saving !== null}
        onCheckedChange={(checked) => {
          void automationMutation.run(
            checked ? "resume" : "off",
            () => checked ? resumeAutomation(card.id) : turnAutomationOff(card.id),
            checked ? "Automation resumed" : "Automation turned off",
          )
        }}
      />
    </div>
  )
}
