import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import {
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  LayoutPanelTop,
  Maximize2,
  MousePointerClick,
  Pilcrow,
  RotateCcw,
  Table2,
  TextCursorInput,
  TextQuote,
  X,
  Zap,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import { useLanguage } from "@/i18n/language-provider"
import { modifierLabels } from "@/lib/keyboard-shortcut-binding"
import { usePlatformShortcutLabels } from "@/lib/keyboard-shortcuts"
import { summonPlaceholder, type SummonTarget, type SummonTargetKind } from "@/lib/dexter-summon-context"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

export type SummonPromptStatus = "ready" | "thinking" | "streaming" | "done" | "error"

const kindIcons: Record<SummonTargetKind, LucideIcon> = {
  field: TextCursorInput,
  control: MousePointerClick,
  cell: Table2,
  text: Pilcrow,
  chart: BarChart3,
  table: Table2,
  row: Table2,
  panel: LayoutPanelTop,
  region: LayoutPanelTop,
  selection: TextQuote,
}

const composerMaxHeight = 96

/** Three dots that breathe out of phase, reused from the Dexter waiting state. */
function ThinkingDots() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {["first", "second", "third"].map((name, index) => (
        <motion.span
          key={name}
          className="size-1.5 rounded-full bg-[var(--md-accent)]"
          animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.25, 1, 0.25], scale: [0.86, 1, 0.86] }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 1.05, repeat: Infinity, ease: "easeInOut", delay: index * 0.12 }
          }
        />
      ))}
    </span>
  )
}

/**
 * The summon composer: the Dexter prompt box with everything an answer-in-place
 * does not need taken out. No role picker, no attachments, no model choice — the
 * summon is always Fast, and its context is the thing it is pinned to.
 */
export function DexterSummonPrompt({
  target,
  status,
  question,
  answer,
  error,
  copied,
  onQuestionChange,
  onSubmit,
  onClose,
  onCopy,
  onAskAnother,
  onContinueInDexter,
}: {
  target: SummonTarget
  status: SummonPromptStatus
  question: string
  answer: string
  error: string | null
  copied: boolean
  onQuestionChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
  onCopy: () => void
  onAskAnother: () => void
  onContinueInDexter: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const platform = usePlatformShortcutLabels()
  const agentName = useAiAgentName()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const KindIcon = kindIcons[target.kind]
  const modifier = modifierLabels(platform).mod
  const busy = status === "thinking" || status === "streaming"
  const canSend = question.trim().length > 0 && !busy
  const hasAnswer = answer.trim().length > 0

  const resize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return

    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, composerMaxHeight)}px`
  }, [])

  useLayoutEffect(resize, [question, resize])

  useLayoutEffect(() => {
    // Synchronous on purpose. Deferring to a frame reads better by a hair, but a
    // throttled frame — a background tab, a slow first paint — would leave the box
    // open with nowhere to type, and being able to type is the whole point.
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (status !== "streaming") return

    const element = answerRef.current
    if (!element) return
    // Follow the stream only while the operator is already at the bottom.
    if (element.scrollHeight - element.scrollTop - element.clientHeight > 48) return
    element.scrollTop = element.scrollHeight
  }, [answer, status])

  return (
    <div
      className="md-summon-prompt md-composer-bloom relative w-full overflow-hidden rounded-[22px]"
      role="dialog"
      aria-modal="false"
      aria-label={`${t("Ask")} ${agentName} ${t("about")} ${target.label}`}
    >
      <span aria-hidden="true" className="md-composer-bloom__shader">
        <SpectralBloomShader shape="composer" />
      </span>
      <span aria-hidden="true" className="md-composer-bloom__contrast" />

      <header className="relative z-[2] flex h-9 min-w-0 items-center gap-1.5 ps-1.5 pe-1">
        <DexterBrandMark className="size-6 shrink-0" />
        <span className="md-summon-chip min-w-0 max-w-[46%]">
          <KindIcon className="size-3 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" />
          <span className="truncate">{target.label}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="md-summon-chip md-summon-chip--fast shrink-0">
              <Zap className="size-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
              <span>{t("Fast")}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{t("Summoned answers always use the Fast engine.")}</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("Close")}
          onClick={onClose}
          className="ms-auto size-7 shrink-0 rounded-full text-white/75 hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </Button>
      </header>

      <div className="relative z-[2] mx-1.5 mb-1.5 rounded-[16px] bg-[var(--md-composer-panel-bg)] shadow-[inset_0_0_0_1px_var(--md-composer-panel-line)]">
        <AnimatePresence initial={false}>
          {busy && !hasAnswer ? (
            <motion.div
              key="thinking"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
              className="overflow-hidden"
            >
              <p className="flex items-center gap-2 px-3 pt-2.5 text-[12px] text-[var(--md-subtle)]" role="status" aria-live="polite">
                <ThinkingDots />
                {t("Reading what you pointed at…")}
              </p>
            </motion.div>
          ) : null}

          {hasAnswer ? (
            <motion.div
              key="answer"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
              className="overflow-hidden"
            >
              <div
                ref={answerRef}
                className="md-scrollbar max-h-[232px] overflow-y-auto px-3 pt-2.5 text-[12.5px] leading-[1.55] text-[var(--md-ink)]"
                aria-live="polite"
              >
                <p className="whitespace-pre-wrap text-pretty">{answer}</p>
              </div>
              <div className="flex items-center gap-1 px-2 pt-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCopy}
                  className="h-7 rounded-[var(--md-radius-md)] px-2 text-[11.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]"
                >
                  {copied ? (
                    <Check className="size-3 text-[var(--md-accent)]" strokeWidth={1.6} aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" strokeWidth={1.4} aria-hidden="true" />
                  )}
                  {copied ? t("Copied") : t("Copy")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onAskAnother}
                  className="h-7 rounded-[var(--md-radius-md)] px-2 text-[11.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]"
                >
                  <RotateCcw className="size-3" strokeWidth={1.4} aria-hidden="true" />
                  {t("Ask another")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onContinueInDexter}
                  className="ms-auto h-7 rounded-[var(--md-radius-md)] px-2 text-[11.5px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
                >
                  <Maximize2 className="size-3" strokeWidth={1.4} aria-hidden="true" />
                  {t("Open in full")}
                </Button>
              </div>
            </motion.div>
          ) : null}

          {error ? (
            <motion.p
              key="error"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
              className="overflow-hidden px-3 pt-2.5 text-[12px] leading-5 text-[var(--md-red)]"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="flex items-end gap-2 px-2.5 py-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={question}
            dir="auto"
            spellCheck={false}
            placeholder={t(summonPlaceholder(target.kind))}
            onChange={(event) => onQuestionChange(event.target.value)}
            onInput={resize}
            onKeyDown={(event) => {
              // The box is one or two lines, so Enter sends and Shift+Enter wraps.
              // The Dexter composer's ⌘↵ also works, for muscle memory.
              if (event.key !== "Enter") return
              if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return

              event.preventDefault()
              if (canSend) onSubmit()
            }}
            className="md-summon-input min-h-6 w-full flex-1 resize-none bg-transparent py-1 text-[13px] leading-[1.45] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
          />
          <motion.div
            className="flex shrink-0 items-center gap-1.5 pb-0.5"
            animate={{ scale: canSend ? 1 : 0.94, opacity: canSend ? 1 : 0.5 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring)}
          >
            <span aria-hidden="true" title={`${modifier} + Enter`} className="hidden items-center sm:inline-flex">
              <KbdGroup dir="ltr" data-i18n-skip>
                <Kbd className="h-[18px] min-w-[18px] bg-[var(--md-field-bg)] px-1 text-[10.5px]">↵</Kbd>
              </KbdGroup>
            </span>
            <DexterActionPill
              type="button"
              icon={ArrowUp}
              iconOnly
              label={t("Ask")}
              className="size-8 min-w-0 rounded-full p-0"
              onClick={onSubmit}
              disabled={!canSend}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
