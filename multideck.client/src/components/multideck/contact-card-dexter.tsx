import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Check, Filter, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { ACTION_ICONS } from "@/components/multideck/contact-card-canvas"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseOut, staggerRamp } from "@/lib/motion"
import { useAiAgentName } from "@/lib/user-preferences"
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_CONDITION_LABELS,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCondition,
  type AutomationConditionKind,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

export type DexterProposal = {
  summary: string
  conditions: AutomationCondition[]
  actions: AutomationAction[]
}

const EXAMPLES = [
  "Email everyone who scans, 15 minutes later",
  "Only follow up with real companies, not personal emails",
  "Remind me to call anyone from an existing customer",
  "Add new leads to the event follow-up list and tell me",
]

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`
}

function condition(kind: AutomationConditionKind, negated = false, value = ""): AutomationCondition {
  return { id: newId("condition"), kind, negated, value, enabled: true }
}

function action(kind: AutomationActionKind, config: Record<string, string>, delayMinutes = 0): AutomationAction {
  return { id: newId("action"), kind, enabled: true, config, delayMinutes }
}

/**
 * Turns a plain-language request into a proposal.
 *
 * This is a local, deterministic stand-in for the real assistant: it reads the
 * phrasing for intent so the interaction is honest about what it produced, and
 * every step it suggests still has to be reviewed and accepted before anything
 * is added. Swapping this for a model call should not change the surrounding UI.
 */
export function proposeAutomation(prompt: string, card: ContactCard): DexterProposal {
  const text = prompt.toLowerCase()
  const has = (...terms: string[]) => terms.some((term) => text.includes(term))

  const conditions: AutomationCondition[] = []
  const actions: AutomationAction[] = []
  const connectedPipeline = card.automation.actions.find((item) => item.kind === "pipeline-stage")?.config

  if (has("real compan", "not personal", "personal email", "free email", "gmail", "business email", "work email")) {
    conditions.push(condition("free-email", true))
  }
  if (has("existing customer", "known customer", "current customer", "already a customer")) {
    conditions.push(condition("known-company"))
  }
  if (has("new lead", "not already", "first time", "haven't met", "havent met", "new people")) {
    conditions.push(condition("new-lead"))
  }
  if (has("during the event", "event dates", "at the show", "while the event")) {
    conditions.push(condition("within-dates", false, card.context))
  }

  if (has("email", "follow up", "follow-up", "send", "reply", "get in touch")) {
    const delay = has("immediately", "straight away", "right away")
      ? 0
      : has("hour", "an hour")
        ? 60
        : has("next day", "tomorrow", "day later")
          ? 1440
          : 15
    actions.push(action("send-email", { template: "Nice to meet you", from: card.person.email }, delay))
  }
  if (has("remind", "task", "call", "phone", "ring", "chase")) {
    actions.push(action("create-task", { assignee: card.person.fullName, dueInDays: has("same day", "today") ? "0" : "1" }))
  }
  if (has("tell me", "notify", "alert", "let me know", "ping")) {
    actions.push(action("notify-user", { user: card.person.fullName }))
  }
  if (has("list", "newsletter", "campaign", "mailing")) {
    actions.push(action("add-to-list", { list: "Event follow-up" }))
  }
  if (has("pipeline", "deal", "opportunity", "stage")) {
    if (connectedPipeline?.pipelineId && connectedPipeline.stageId) {
      actions.push(action("pipeline-stage", { ...connectedPipeline }))
    }
  }
  if (has("assign", "owner", "give it to", "hand to")) {
    actions.push(action("assign-owner", { owner: card.person.fullName, ownerId: card.ownerUserId }))
  }

  // Never return an empty proposal: fall back to the safe, internal-only pair.
  if (actions.length === 0) {
    actions.push(action("assign-owner", { owner: card.person.fullName, ownerId: card.ownerUserId }))
    actions.push(action("create-task", { assignee: card.person.fullName, dueInDays: "1" }))
  }

  const external = actions.some((item) => AUTOMATION_ACTION_LABELS[item.kind].external)

  const summary = [
    conditions.length > 0
      ? `Runs only when ${conditions.length === 1 ? "one condition is" : `all ${conditions.length} conditions are`} met`
      : "Runs on every exchange",
    `${actions.length} ${actions.length === 1 ? "step" : "steps"}`,
    external ? "one of which emails the lead" : "all inside the workspace",
  ].join(" · ")

  return { summary, conditions, actions }
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

type Phase = "prompt" | "thinking" | "proposal"

export function AskDexterDrawer({
  card,
  open,
  onClose,
  onApply,
}: {
  card: ContactCard
  open: boolean
  onClose: () => void
  onApply: (proposal: DexterProposal) => void
}) {
  const { t } = useLanguage()
  const agentName = useAiAgentName()
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)

  const [phase, setPhase] = useState<Phase>("prompt")
  const [prompt, setPrompt] = useState("")
  const [proposal, setProposal] = useState<DexterProposal | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      window.setTimeout(() => textareaRef.current?.focus(), 220)
      return
    }
    setPhase("prompt")
    setPrompt("")
    setProposal(null)
    setAccepted(new Set())
  }, [open])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  function submit(value: string) {
    if (!value.trim()) return
    setPhase("thinking")
    // A real request would land here; the delay keeps the working state honest.
    timerRef.current = window.setTimeout(() => {
      const next = proposeAutomation(value, card)
      setProposal(next)
      setAccepted(new Set([...next.conditions.map((item) => item.id), ...next.actions.map((item) => item.id)]))
      setPhase("proposal")
    }, 1100)
  }

  const acceptedCount = accepted.size

  function toggle(id: string) {
    setAccepted((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <SideDrawer open={open} onClose={onClose} eyebrow={t("Automation")} title={`${t("Ask")} ${agentName}`} width={480}>
      <div className="flex h-full flex-col gap-[var(--md-gap-lg)] p-1">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "prompt" ? (
            <motion.div
              key="prompt"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.24, ease: mdEaseOut }}
              className="grid gap-[var(--md-gap-lg)]"
            >
              <div className="flex items-start gap-3">
                <DexterBrandMark className="mt-0.5 shrink-0" />
                <p className="text-[13.5px] leading-[1.55] text-[var(--md-text)]">
                  {t("Describe what should happen when someone shares their details on this card. I'll suggest the steps — nothing is added until you accept it.")}
                </p>
              </div>

              <Textarea
                ref={textareaRef}
                rows={4}
                value={prompt}
                placeholder={t("For example: email everyone 15 minutes later, but only if they used a work address.")}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(prompt)
                }}
                className="min-h-[104px] resize-none text-[13.5px]"
              />

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Or start from one of these")}</p>
                <div className="mt-2 grid gap-1.5">
                  {EXAMPLES.map((example, index) => (
                    <motion.button
                      key={example}
                      type="button"
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: mdEaseOut, delay: reduce ? 0 : staggerRamp(index) }}
                      onClick={() => {
                        setPrompt(example)
                        submit(example)
                      }}
                      className="flex items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2.5 text-start text-[13px] text-[var(--md-text)] transition-[background-color,color,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-a10)] hover:text-[var(--md-ink)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)] motion-reduce:transition-none"
                    >
                      <Sparkles className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1">{example}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} />
                    </motion.button>
                  ))}
                </div>
              </div>

              <Button
                className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                disabled={!prompt.trim()}
                onClick={() => submit(prompt)}
              >
                {t("Suggest the steps")}
              </Button>
            </motion.div>
          ) : phase === "thinking" ? (
            <motion.div
              key="thinking"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: mdEaseOut }}
              className="grid gap-3 py-6"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <DexterBrandMark />
                <span className="inline-flex items-center gap-2 text-[13.5px] text-[var(--md-text)]">
                  <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.6} />
                  {t("Working out the steps…")}
                </span>
              </div>
              {/* Placeholder rows sized like the real proposal, so nothing jumps. */}
              <div className="grid gap-2 pt-2">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-[58px] animate-pulse rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)]" />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="proposal"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.28, ease: mdEaseOut }}
              className="grid gap-[var(--md-gap-lg)]"
            >
              <div className="flex items-start gap-3">
                <DexterBrandMark className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13.5px] leading-[1.5] text-[var(--md-ink)]">{t("Here's what I'd add")}</p>
                  <p className="mt-1 text-[12.5px] text-[var(--md-subtle)]">{proposal?.summary}</p>
                </div>
              </div>

              <div className="grid gap-1.5">
                {proposal?.conditions.map((item, index) => (
                  <ProposalRow
                    key={item.id}
                    index={index}
                    reduce={reduce}
                    icon={Filter}
                    eyebrow={t("Only if")}
                    title={AUTOMATION_CONDITION_LABELS[item.kind].describe(item)}
                    checked={accepted.has(item.id)}
                    onToggle={() => toggle(item.id)}
                  />
                ))}

                {proposal?.actions.map((item, index) => (
                  <ProposalRow
                    key={item.id}
                    index={(proposal?.conditions.length ?? 0) + index}
                    reduce={reduce}
                    icon={ACTION_ICONS[item.kind]}
                    eyebrow={t(AUTOMATION_ACTION_LABELS[item.kind].label)}
                    title={AUTOMATION_ACTION_LABELS[item.kind].describe(item)}
                    external={AUTOMATION_ACTION_LABELS[item.kind].external}
                    checked={accepted.has(item.id)}
                    onToggle={() => toggle(item.id)}
                  />
                ))}
              </div>

              <p className="text-[12px] leading-5 text-[var(--md-subtle)]">
                {t("These are added as a draft. Nothing runs until you publish, and anything that emails a lead asks for confirmation first.")}
              </p>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" className="h-10 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => setPhase("prompt")}>
                  {t("Try a different description")}
                </Button>
                <Button
                  className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] text-[13px] text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                  disabled={acceptedCount === 0}
                  onClick={() => {
                    if (!proposal) return
                    onApply({
                      summary: proposal.summary,
                      conditions: proposal.conditions.filter((item) => accepted.has(item.id)),
                      actions: proposal.actions.filter((item) => accepted.has(item.id)),
                    })
                  }}
                >
                  {t("Add")} {acceptedCount} {acceptedCount === 1 ? t("step") : t("steps")}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SideDrawer>
  )
}

function ProposalRow({
  index,
  reduce,
  icon: Icon,
  eyebrow,
  title,
  external,
  checked,
  onToggle,
}: {
  index: number
  reduce: boolean
  icon: typeof Filter
  eyebrow: string
  title: string
  external?: boolean
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()

  return (
    <motion.label
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: mdEaseOut, delay: reduce ? 0 : staggerRamp(index) }}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--md-radius-md)] p-3 text-start",
        "transition-[background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        checked ? "bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a22)]" : "bg-[var(--md-surface-tint)]",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />

      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-[180ms] motion-reduce:transition-none",
          checked ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-[var(--md-surface)] text-transparent shadow-[var(--md-shadow-line)]",
        )}
      >
        <Check className="size-3" strokeWidth={2.6} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">
          <Icon className="size-3" strokeWidth={1.6} />
          {eyebrow}
          {external ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--md-radius-sm)] bg-[rgba(221,138,43,0.14)] px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[var(--md-amber)]">
              <TriangleAlert className="size-2.5" strokeWidth={2} />
              {t("Reaches the lead")}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[13px] leading-[1.4] text-[var(--md-ink)]">{title}</span>
      </span>
    </motion.label>
  )
}
