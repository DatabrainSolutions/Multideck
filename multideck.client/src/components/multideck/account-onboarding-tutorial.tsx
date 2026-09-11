import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Check, Copy, Microphone as Mic, CirclePlay as Play, Sparkles } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { DexterMentionInput } from "@/components/multideck/agent-dexter-components"
import { DexterActionPill, SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DictationStatusPill, type DictationStatusPhase } from "@/components/multideck/dictation-status-pill"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { useShortcutBinding } from "@/lib/keyboard-shortcuts"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { useLanguage } from "@/i18n/language-provider"

const lessons = [
  { label: "Ask a question", prompt: "What can you help me with?", heading: "Start with a question.", detail: "Use your own words. There’s no special way to ask.", reasoning: "I’ll explain the main ways I can help, starting with the work you do every day.", response: "I can find information, explain what’s happening, prepare work and help update records you can access." },
  { label: "Find information", prompt: "Find shipments arriving this week", heading: "Now, find what you need.", detail: "Tell Dexter what you’re looking for. Be specific about the dates or customer.", reasoning: "I’ll check the arrival dates and show matching shipments, with a link back to each record.", response: "Here are two example shipments arriving this week. In your workspace, each reference opens its record." },
  { label: "Get work done", prompt: "Create a task to check this shipment tomorrow", heading: "Give Dexter a job.", detail: "Ask for an outcome. Review the proposed change before it happens.", reasoning: "I’ll prepare a task for tomorrow and show the details for your approval before anything changes.", response: "I’ve prepared a task for you to review. Check the details, then approve it when you’re happy." },
]

type PracticePhase = "idle" | "reasoning" | "answer" | "ready"

export function AccountOnboardingTutorial({ stage, busy, onStage }: { stage: number; busy: boolean; onStage: (stage: number) => Promise<boolean> }) {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const lesson = lessons[Math.min(stage, 2)]
  const [prompt, setPrompt] = useState("")
  const [sentPrompt, setSentPrompt] = useState("")
  const [phase, setPhase] = useState<PracticePhase>("idle")
  const [reasoning, setReasoning] = useState("")
  const [answer, setAnswer] = useState("")
  const [reasoningOpen, setReasoningOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const copyReset = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responseRef = useRef<HTMLDivElement>(null)
  const lessonHeading = useRef<HTMLHeadingElement>(null)
  const complete = stage === 3
  const submitted = phase !== "idle"
  const streaming = phase === "reasoning" || phase === "answer"

  useEffect(() => () => { if (copyReset.current) clearTimeout(copyReset.current) }, [])
  useEffect(() => {
    if (submitted) responseRef.current?.focus({ preventScroll: true })
  }, [submitted])

  useEffect(() => {
    if (!submitted || complete) return
    const summary = t(lesson.reasoning)
    const response = t(lesson.response)
    if (reduced) { setReasoning(summary); setAnswer(response); setReasoningOpen(false); setPhase("ready"); return }
    // This deliberately finite practice sequence demonstrates a streamed reply.
    // No model is called and no workspace action happens behind the animation.
    const started = performance.now()
    const summaryWords = summary.split(" ")
    const answerWords = response.split(" ")
    let frame = 0
    let handedOff = false
    const tick = (now: number) => {
      const elapsed = now - started
      setReasoning(summaryWords.slice(0, Math.max(1, Math.ceil(elapsed / 42))).join(" "))
      if (elapsed >= 1050) {
        if (!handedOff) { handedOff = true; setReasoningOpen(false); setPhase("answer") }
        setAnswer(answerWords.slice(0, Math.ceil((elapsed - 1050) / 32)).join(" "))
      }
      if (elapsed < 1050 + answerWords.length * 32) frame = requestAnimationFrame(tick)
      else { setAnswer(response); setPhase("ready") }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [submitted, complete, lesson, reduced, t])

  async function copyPrompt() {
    setFeedback(null)
    try {
      await navigator.clipboard.writeText(t(lesson.prompt))
      setCopied(true)
      if (copyReset.current) clearTimeout(copyReset.current)
      copyReset.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setFeedback("Copy isn’t available here. Choose Use this prompt to put it in the message box.")
    }
  }

  function send(value = prompt) {
    if (busy || submitted || !value.trim()) return
    const matchesExercise = stage === 0 ? /(?:what|how|can|help).*(?:help|do|work|you|me)/i.test(value)
      : stage === 1 ? /(?:find|show|list|which)/i.test(value) && /shipment/i.test(value) && /week/i.test(value)
      : /(?:create|add|make|remind|set)/i.test(value) && /(?:task|check|shipment)/i.test(value) && /tomorrow/i.test(value)
    if (!matchesExercise) { setFeedback("For this practice, use the suggested prompt. You can ask your own questions once you’re in Dexter."); return }
    setFeedback(null); setSentPrompt(value.trim()); setReasoningOpen(true); setPhase("reasoning")
  }

  async function next() {
    if (streaming || busy || !await onStage(stage + 1)) return
    setPhase("idle"); setPrompt(""); setAnswer(""); setReasoning(""); setFeedback(null); setCopied(false)
  }

  return <div className="md-onboarding-tutorial" data-dictation="off">
    <div className="md-onboarding-lesson-track" aria-label="Dexter practice progress">
      {lessons.map((item, index) => <span key={item.label} aria-current={index === stage ? "step" : undefined} className={index <= stage ? "is-current" : ""}><span>{index < stage ? <Check className="size-3" /> : index + 1}</span>{t(item.label)}</span>)}
    </div>
    <AnimatePresence initial={false} mode="wait">
      <motion.div className="md-onboarding-lesson" key={stage} initial={reduced ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -6 }} transition={reduceMotion(reduced, mdMotion.micro)} onAnimationComplete={() => { if (stage > 0 && !submitted) lessonHeading.current?.focus({ preventScroll: true }) }}>
      {complete ? <div className="md-onboarding-tutorial-complete" role="status"><motion.span className="md-onboarding-success-mark" initial={reduced ? false : { scale: 0.95 }} animate={{ scale: 1 }} transition={mdMotion.spring}><Check /></motion.span><h2>{t("You’ve got it.")}</h2><p>{t("Ask. Find. Get things done. Dexter is ready whenever you are.")}</p><p className="md-onboarding-muted">{t("You can also ask Dexter to watch for changes. You choose what to watch and when to be notified.")}</p></div> : <>
        {!submitted ? <div className="md-onboarding-lesson-copy"><h2 ref={lessonHeading} tabIndex={-1}>{t(lesson.heading)}</h2><p>{t(lesson.detail)}</p></div> : null}
        {submitted ? <div ref={responseRef} tabIndex={-1} className="md-onboarding-practice-response" aria-label={t("Dexter example conversation")} aria-busy={streaming}>
          <motion.p className="md-onboarding-sent-prompt" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion(reduced, mdMotion.fast)}>{sentPrompt}</motion.p>
          <Reasoning open={reasoningOpen} onOpenChange={setReasoningOpen} isStreaming={phase === "reasoning"} className="mb-2 py-1">
            <ReasoningTrigger className="min-h-8 text-[12.5px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]" getThinkingMessage={() => phase === "reasoning" && !reduced ? <Shimmer duration={1.2}>{t("Reasoning")}</Shimmer> : <span>{t("Reasoning summary")}</span>} />
            <ReasoningContent className="mt-0 pt-3 pb-4 text-[13px] leading-5 text-[var(--md-text)]">{reasoning}</ReasoningContent>
          </Reasoning>
          <div className="md-onboarding-stream-answer" aria-hidden={streaming}>{answer}</div>
          <span className="sr-only" role="status">{phase === "ready" ? t(lesson.response) : t("Dexter is preparing an example reply.")}</span>
          {phase === "ready" ? <motion.div initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion(reduced, mdMotion.fast)}>
            {stage === 1 ? <div className="md-dexter-markdown__table-wrap md-onboarding-results"><div className="md-dexter-markdown__table-scroll"><table className="md-dexter-markdown__table"><caption>{t("Example results")}</caption><thead><tr>{["Shipment", "Route", "Arrival"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody><tr><td>MD-10042</td><td>Shanghai → Felixstowe</td><td><span>{t("This week")}</span></td></tr><tr><td>MD-10043</td><td>Rotterdam → Hull</td><td><span>{t("This week")}</span></td></tr></tbody></table></div></div> : null}
            {stage === 2 ? <div className="md-onboarding-proposal"><div><small>{t("Proposed task")}</small><strong>{t("Check the example shipment")}</strong><span>{t("Assigned to you · Due tomorrow")}</span></div><Button disabled={busy} onClick={() => void next()}>{t(busy ? "Saving…" : "Approve practice task")}<Check className="size-4" /></Button></div> : <Button className="md-onboarding-practice-next" disabled={busy} onClick={() => void next()}>{t(stage === 0 ? "Let’s find something" : "Let’s try an action")}<ArrowRight className="size-4" /></Button>}
          </motion.div> : null}
        </div> : <>
          <div className="md-onboarding-prompt-example">
            <motion.button className="md-onboarding-suggested-prompt" type="button" aria-label={t(copied ? "Prompt copied" : "Copy suggested prompt")} onClick={() => void copyPrompt()} whileTap={reduced ? undefined : { scale: 0.98 }} transition={mdMotion.spring}>
              <span>{t(lesson.prompt)}</span>
              <span className="md-onboarding-copy-icon" aria-hidden="true">
                <motion.span animate={{ opacity: copied ? 0 : 1, scale: copied ? 0.72 : 1, rotate: copied ? -18 : 0 }} transition={reduceMotion(reduced, mdMotion.fast)}><Copy className="size-4" /></motion.span>
                <motion.span animate={{ opacity: copied ? 1 : 0, scale: copied ? 1 : 0.72, rotate: copied ? 0 : 18 }} transition={reduceMotion(reduced, mdMotion.fast)}><Check className="size-4" /></motion.span>
              </span>
            </motion.button>
            <span className="md-onboarding-copy-help" role="status">{t(copied ? "Copied. Paste it below." : "Copy, then paste below.")} <button type="button" onClick={() => { setPrompt(t(lesson.prompt)); setFeedback(null) }}>{t("Use this prompt")}</button></span>
          </div>
          <div className="md-composer-bloom md-onboarding-composer">
            <span aria-hidden="true" className="md-composer-bloom__shader"><SpectralBloomShader shape="composer" /></span>
            <span aria-hidden="true" className="md-composer-bloom__contrast" />
            <div className="md-onboarding-composer-heading">Dexter <span>{t("Your work, a little lighter.")}</span></div>
            <div className="md-onboarding-composer-input">
              <DexterMentionInput value={prompt} items={[]} selectedMentions={[]} onMentionsChange={() => {}} placeholder={t("Ask Dexter…")} ariaLabel={t("Practice message to Dexter")} minHeight={48} maxHeight={80} canSend={Boolean(prompt.trim()) && !busy} onChange={setPrompt} onSend={send} />
              <div className="flex items-center justify-between gap-3"><span>{t("Paste your prompt, then send it.")}</span><DexterActionPill label={t("Send practice prompt")} iconOnly className="size-10 min-w-0 rounded-full p-0" iconElement={<ArrowRight className="relative z-10 size-4" />} disabled={!prompt.trim() || busy} onClick={() => send()} /></div>
            </div>
          </div>
        </>}
        {feedback ? <p role="alert" className="md-onboarding-error">{t(feedback)}</p> : null}
      </>}
      </motion.div>
    </AnimatePresence>
  </div>
}

export function AccountOnboardingDictation() {
  const { t } = useLanguage()
  const reduced = Boolean(useReducedMotion())
  const binding = useShortcutBinding("dictation.toggle")
  const [replay, setReplay] = useState(0)
  const [phase, setPhase] = useState<DictationStatusPhase>(reduced ? "complete" : "transcribing")
  const [level, setLevel] = useState(0.45)
  useEffect(() => {
    if (reduced) { setPhase("complete"); return }
    setPhase("transcribing")
    let frame = 0
    let lastLevel = 0
    const started = performance.now()
    const tick = (now: number) => {
      const elapsed = now - started
      if (elapsed < 2200) {
        if (elapsed - lastLevel > 90) { setLevel(0.25 + Math.abs(Math.sin(elapsed / 210)) * 0.7); lastLevel = elapsed }
      } else if (elapsed < 3400) setPhase("polishing")
      else { setPhase("complete"); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [replay, reduced])

  return <div className="md-onboarding-dictation" data-dictation="off">
    <motion.div className="md-onboarding-large-key" animate={{ y: phase === "transcribing" && !reduced ? 3 : 0 }} transition={reduceMotion(reduced, mdMotion.spring)}><ShortcutKeys binding={binding} keyClassName="md-onboarding-keycap" /></motion.div>
    <p>{binding ? t("Hold this shortcut while a text field is selected. Speak, then release to insert your words.") : t("Choose a transcription shortcut in Settings → Keyboard shortcuts to use hold-to-speak.")}</p>
    <div className="md-onboarding-dictation-demo">
      <div className="md-onboarding-dictation-pill"><DictationStatusPill phase={phase} level={level} /></div>
      <svg viewBox="0 0 560 112" role="img" aria-labelledby="onboarding-dictation-title">
        <title id="onboarding-dictation-title">{t("Demonstration: hold the shortcut, speak, release, and your words appear in the prompt.")}</title>
        <rect x="1" y="8" width="558" height="102" rx="20" fill="var(--md-surface)" stroke="var(--md-border)" />
        <text x="24" y="40" fill="var(--md-subtle)" fontSize="13">{t("Message Dexter")}</text>
        <motion.g initial={false} animate={{ opacity: phase === "complete" ? 1 : 0, x: phase === "complete" || reduced ? 0 : 4 }} transition={reduceMotion(reduced, mdMotion.fast)}><text x="24" y="75" fill="var(--md-ink)" fontSize="15">{t("Find shipments arriving this week")}</text></motion.g>
        <motion.path d="M24 58v21" stroke="var(--md-accent)" strokeWidth="2" initial={false} animate={{ opacity: phase === "complete" ? 0 : 1 }} transition={reduceMotion(reduced, mdMotion.fast)} />
      </svg>
    </div>
    <div className="md-onboarding-dictation-caption"><Mic className="size-3.5" /><span>{t("A demonstration. Your microphone is off.")}</span><button type="button" onClick={() => setReplay((value) => value + 1)}><Play className="size-3" />{t("Replay")}</button></div>
    <p className="md-onboarding-muted">{t("Works in Dexter, emails and text fields across Multideck. You can change the shortcut in Settings.")}</p>
  </div>
}
