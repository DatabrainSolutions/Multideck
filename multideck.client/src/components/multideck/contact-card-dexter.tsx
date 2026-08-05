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
import { proposeContactCardAutomation, type DexterAutomationProposal } from "@/lib/dexter-api"
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_CONDITION_LABELS,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

export type DexterProposal = DexterAutomationProposal

const EXAMPLES = [
  "Email everyone who scans, 15 minutes later",
  "Only follow up with real companies, not personal emails",
  "Remind me to call anyone from an existing customer",
  "Add new leads to the event follow-up list and tell me",
]

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

type Phase = "prompt" | "thinking" | "proposal" | "error"

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
  const { t, language } = useLanguage()
  const agentName = useAiAgentName()
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)

  const [phase, setPhase] = useState<Phase>("prompt")
  const [prompt, setPrompt] = useState("")
  const [proposal, setProposal] = useState<DexterProposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      window.setTimeout(() => textareaRef.current?.focus(), 220)
      return
    }
    setPhase("prompt")
    setPrompt("")
    setProposal(null)
    setError(null)
    setAccepted(new Set())
  }, [open])

  async function submit(value: string) {
    if (!value.trim()) return
    setPhase("thinking")
    setError(null)
    try {
      const next = await proposeContactCardAutomation({ cardId: card.id, message: value.trim(), locale: language })
      setProposal(next)
      setAccepted(new Set([...next.conditions.map((item) => item.id), ...next.actions.map((item) => item.id)]))
      setPhase("proposal")
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : t("Dexter could not suggest automation steps."))
      setPhase("error")
    }
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
          ) : phase === "error" ? (
            <motion.div
              key="error"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.12 : 0.24, ease: mdEaseOut }}
              className="grid gap-4 py-4"
              role="alert"
            >
              <div className="flex items-start gap-3 rounded-[var(--md-radius-md)] bg-[rgba(180,57,57,0.08)] p-3.5 text-[var(--md-red)]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />
                <div>
                  <p className="text-[13px] font-medium">{t("Dexter could not suggest the steps")}</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">{error}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => setPhase("prompt")}>{t("Edit description")}</Button>
                <Button className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => void submit(prompt)}>{t("Try again")}</Button>
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
