import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, AudioWaveform, Check, CirclePlay, Microphone, Square, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { useDexterVoice } from "@/hooks/use-dexter-voice"
import { voiceOptions, voiceRequest, type VoiceId } from "@/lib/dexter-voice-api"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import "./dexter-voice-controls.css"

type VoicePanelState = Pick<ReturnType<typeof useDexterVoice>, "phase" | "muted" | "working" | "active" | "end" | "dismiss" | "toggleMute" | "error" | "endReason">
export function DexterVoicePanel({ voice, autoFocus = true }: { voice: VoicePanelState; autoFocus?: boolean }) {
  const { t } = useLanguage()
  const endButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (autoFocus) endButton.current?.focus({ preventScroll: true }) }, [autoFocus])
  if (voice.phase === "idle") return null
  const status = voice.phase === "connecting" ? "Connecting…" : voice.phase === "finishing" ? "Finishing…"
    : voice.phase === "error" ? "Voice unavailable" : voice.phase === "ended" ? "Voice ended" : voice.muted ? "Microphone muted" : "Listening"
  return <section className="md-voice-panel" aria-label={t("Voice conversation")} onKeyDown={event => {
    if (event.key === "Escape" && voice.active) { event.preventDefault(); event.stopPropagation(); voice.end() }
  }}>
    <div className="flex items-center gap-3">
      <AudioWaveform className="size-5 shrink-0 text-[var(--md-accent)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p role="status" className="text-[13px] text-[var(--md-ink)]">{t(status)}{voice.working ? ` · ${t("Working in chat")}` : ""}</p>
      </div>
      <Button variant="ghost" size="icon" disabled={voice.phase !== "listening"} onClick={voice.toggleMute}
        aria-label={t(voice.muted ? "Unmute microphone" : "Mute microphone")} aria-pressed={voice.muted}
        className={cn("size-11 shrink-0 rounded-full", voice.muted && "text-[var(--md-red)]")}><Microphone className="size-4" /></Button>
      <Button ref={endButton} variant="ghost" size="icon" disabled={voice.phase === "finishing"} onClick={voice.active ? voice.end : voice.dismiss}
        aria-label={t(voice.active ? "End voice conversation" : "Return to typing")} className="size-11 shrink-0 rounded-full bg-[var(--md-hover)]"><X className="size-4" /></Button>
    </div>
    {voice.error ? <p role="alert" className="mt-2 text-[12px] leading-5 text-[var(--md-red)]">{t(voice.error)}</p> : null}
  </section>
}

/** Anchored above the composer, never over the conversation or a running timer. */
export function DexterVoiceLimitNotice({ visible }: { visible: boolean }) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => { if (!visible) setDismissed(false) }, [visible])
  return <AnimatePresence initial={false}>
    {visible && !dismissed ? <motion.div key="voice-daily-limit" className="md-voice-limit-notice"
      initial={{opacity:0, y:reducedMotion ? 0 : 8, scale:reducedMotion ? 1 : 0.985}}
      animate={{opacity:1, y:0, scale:1}} exit={{opacity:0, y:reducedMotion ? 0 : 4}}
      transition={{duration:reducedMotion ? 0 : 0.22, ease:[0.22,1,0.36,1]}}>
      <span className="md-voice-limit-notice__icon" aria-hidden="true"><AlertCircle className="size-4" /></span>
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{t("Voice is finished for today")}</p>
        <p className="mt-0.5 text-[12px] leading-[18px] text-[var(--md-text)]">{t("Your 5 minutes reset at midnight (UK time). You can keep typing.")}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="-me-1 -mt-1 size-9 shrink-0 rounded-full"
        aria-label={t("Dismiss voice limit notice")} onClick={event => {
          const composer = event.currentTarget.closest(".md-voice-limit-notice")?.parentElement
          setDismissed(true)
          composer?.querySelector<HTMLElement>('[role="combobox"][contenteditable="true"], textarea')?.focus()
        }}><X className="size-3.5" /></Button>
    </motion.div> : null}
  </AnimatePresence>
}

export function DexterVoiceSettings() {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<VoiceId>("vesper")
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false)
  const [previewId, setPreviewId] = useState<VoiceId | null>(null)
  const preview = useDexterVoice()
  const mounted = useRef(true)
  const load = async () => {
    setLoading(true); setError(null)
    try { const preferences = await voiceRequest({ operation: "preferences" }); if (mounted.current) setSelected(preferences.voice) }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Voice settings could not be loaded.") }
    finally { if (mounted.current) setLoading(false) }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [])
  const choose = async (voice: VoiceId) => {
    if (saving || selected === voice) return
    setSaving(true); setSaved(false); setError(null)
    try { const preferences = await voiceRequest({ operation: "save_preferences", voice }); if (mounted.current) { setSelected(preferences.voice); setSaved(true) } }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Your voice could not be saved.") }
    finally { if (mounted.current) setSaving(false) }
  }
  return <div className="p-5">
    <p className="mb-4 max-w-[65ch] text-[13px] leading-5 text-[var(--md-text)]">{t("Start a conversation from the sound wave in an empty prompt. Voice and previews share five minutes each day.")}</p>
    {loading ? <p role="status" className="text-[13px] text-[var(--md-subtle)]">{t("Loading your voice…")}</p> :
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2" role="group" aria-label={t("Dexter voice")}>
        {voiceOptions.map(voice => <div key={voice.id} className={cn("md-voice-choice", selected === voice.id && "md-voice-choice--selected")}>
          <button type="button" aria-pressed={selected === voice.id} disabled={saving || Boolean(error)} onClick={() => void choose(voice.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-3 ps-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">
            <span className="grid size-5 shrink-0 place-items-center text-[var(--md-accent)]">{selected === voice.id ? <Check className="size-4" /> : <AudioWaveform className="size-4 opacity-40" />}</span>
            <span><span className="block text-[13px] font-medium text-[var(--md-ink)]">{voice.name}</span><span className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{t(voice.detail)}</span></span>
          </button>
          <Button type="button" variant="ghost" size="icon" className="me-1 size-11 rounded-full" aria-label={`${t(preview.active && previewId === voice.id ? "Stop preview" : "Preview voice")} ${voice.name}`}
            disabled={Boolean(error) || (preview.active && previewId !== voice.id)} onClick={() => {
              if (preview.active) preview.end()
              else { setPreviewId(voice.id); void preview.start(voice.id, true) }
            }}>{preview.active && previewId === voice.id ? <Square className="size-3.5" /> : <CirclePlay className="size-4" />}</Button>
        </div>)}
      </div>}
    {error || preview.error ? <div role="alert" className="mt-3 text-[12px] text-[var(--md-red)]">{t(error || preview.error || "")} {error ? <Button variant="ghost" onClick={() => void load()}>{t("Retry")}</Button> : null}</div> : null}
    <p role="status" className="mt-3 min-h-5 text-[11px] text-[var(--md-subtle)]">{t(saving ? "Saving voice…" : saved ? "Voice saved across your devices." : preview.active ? "Playing an AI voice preview…" : "Your allowance resets at midnight, UK time. Voice also contributes to AI usage.")}</p>
  </div>
}
