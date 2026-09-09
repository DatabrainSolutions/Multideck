import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { DictationStatusPill, type DictationStatusPhase } from "@/components/multideck/dictation-status-pill"
import { useLanguage } from "@/i18n/language-provider"
import {
  readPreferredMicrophone,
  subscribePreferredMicrophone,
  systemDefaultMicrophone,
} from "@/lib/dictation-preferences"
import {
  keyNameFromEvent,
  shortcutPlatform,
  shortcutStepKeys,
  type ShortcutBinding,
} from "@/lib/keyboard-shortcut-binding"
import { useShortcutAction, useShortcutBinding } from "@/lib/keyboard-shortcuts"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { transcribeRecording, TranscriptionError } from "@/lib/transcription-api"

type DictationPhase = "idle" | DictationStatusPhase
type DictationTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

type RecordingSession = {
  recorder: MediaRecorder
  stream: MediaStream
  target: DictationTarget
  chunks: Blob[]
  startedAt: number
  stopMeter: () => void
  maximumTimer: number
  failed: boolean
}

const dictatableInputTypes = new Set(["text", "search", "email", "url", "tel"])
const maximumRecordingMs = 180_000

function transcriptionFailureLabel(error: unknown) {
  if (!(error instanceof TranscriptionError)) return "Transcription failed"
  if (error.code === "no_speech_detected" || error.code === "empty_transcript") return "No clear audio detected"
  if (error.code === "transcription_timeout") return "Transcription timed out"
  if (error.code === "transcription_allowance_reached") return "Contact admin to increase usage"
  if (error.code === "not_configured" || error.code === "transcription_unavailable") return "Dictation temporarily unavailable"
  return "Transcription failed"
}

function dictationTargetFrom(value: EventTarget | null): DictationTarget | null {
  if (!(value instanceof Element)) return null
  if (value.closest("[data-dictation='off']")) return null

  const input = value.closest("input")
  if (input instanceof HTMLInputElement) {
    if (!dictatableInputTypes.has(input.type.toLocaleLowerCase()) || input.disabled || input.readOnly) return null
    return input
  }
  const textarea = value.closest("textarea")
  if (textarea instanceof HTMLTextAreaElement) {
    if (textarea.disabled || textarea.readOnly) return null
    return textarea
  }
  const editable = value.closest("[contenteditable='true']")
  return editable instanceof HTMLElement ? editable : null
}

function withWordSpacing(before: string, transcript: string, after: string) {
  const prefix = before && !/\s$/u.test(before) && !/^[,.;:!?)]/u.test(transcript) ? " " : ""
  const suffix = after && !/^\s/u.test(after) && !/[\s([]$/u.test(transcript) ? " " : ""
  return `${prefix}${transcript}${suffix}`
}

function dispatchTextInput(target: HTMLElement, text: string) {
  try {
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function insertTranscript(target: DictationTarget, transcript: string) {
  if (!target.isConnected) return false

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const value = target.value
    const start = target.selectionStart ?? value.length
    const end = target.selectionEnd ?? start
    const inserted = withWordSpacing(value.slice(0, start), transcript, value.slice(end))
    const next = `${value.slice(0, start)}${inserted}${value.slice(end)}`
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (setter) setter.call(target, next)
    else target.value = next
    dispatchTextInput(target, inserted)
    target.focus({ preventScroll: true })
    const caret = start + inserted.length
    try {
      target.setSelectionRange(caret, caret)
    } catch {
      // Some specialised text-like inputs do not expose a selection range.
    }
    return true
  }

  target.focus({ preventScroll: true })
  const selection = window.getSelection()
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !target.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
  }
  const before = range.startContainer.textContent?.slice(0, range.startOffset) ?? ""
  const inserted = withWordSpacing(before, transcript, "")
  range.deleteContents()
  const node = document.createTextNode(inserted)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  dispatchTextInput(target, inserted)
  return true
}

function preferredRecorderType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function pcm16Wav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  write(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true)
  })
  return buffer
}

/** MediaRecorder containers differ by browser; Gemini receives one stable WAV. */
async function transcriptionWav(recording: Blob) {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) throw new Error("Audio decoding is unavailable")

  const context = new AudioContextConstructor()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const sampleRate = 16_000
    const sampleCount = Math.max(1, Math.ceil(decoded.duration * sampleRate))
    const mono = new Float32Array(sampleCount)
    for (let outputIndex = 0; outputIndex < sampleCount; outputIndex += 1) {
      const sourcePosition = outputIndex * decoded.sampleRate / sampleRate
      const sourceIndex = Math.min(Math.floor(sourcePosition), decoded.length - 1)
      const nextIndex = Math.min(sourceIndex + 1, decoded.length - 1)
      const mix = sourcePosition - sourceIndex
      let sample = 0
      for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex += 1) {
        const channel = decoded.getChannelData(channelIndex)
        sample += channel[sourceIndex] + (channel[nextIndex] - channel[sourceIndex]) * mix
      }
      mono[outputIndex] = sample / Math.max(decoded.numberOfChannels, 1)
    }
    return new Blob([pcm16Wav(mono, sampleRate)], { type: "audio/wav" })
  } finally {
    void context.close().catch(() => undefined)
  }
}

function releaseEndsBinding(event: KeyboardEvent, binding: ShortcutBinding | null) {
  if (!binding || binding.kind !== "chord" || binding.steps.length === 0) return false
  const step = binding.steps[binding.steps.length - 1]
  const key = keyNameFromEvent(event)
  if (shortcutStepKeys(step).includes(key)) return true
  if (event.key === "Shift" && step.shift) return true
  if (event.key === "Alt" && step.alt) return true
  if (!step.mod) return false
  const platform = shortcutPlatform()
  return platform === "apple" ? event.key === "Meta" : event.key === "Control"
}

function startAudioMeter(stream: MediaStream, onLevel: (level: number) => void) {
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return () => undefined

  let context: AudioContext
  let source: MediaStreamAudioSourceNode
  let analyser: AnalyserNode
  try {
    context = new AudioContextConstructor()
    source = context.createMediaStreamSource(stream)
    analyser = context.createAnalyser()
  } catch {
    // The visual meter is optional; recording must still work when a browser
    // refuses to create an analyser after microphone permission is granted.
    return () => undefined
  }
  void context.resume().catch(() => undefined)
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)
  const samples = new Uint8Array(analyser.frequencyBinCount)
  let frame = 0
  const measure = () => {
    analyser.getByteFrequencyData(samples)
    const average = samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1)
    onLevel(Math.min(1, average / 92))
    frame = requestAnimationFrame(measure)
  }
  frame = requestAnimationFrame(measure)

  return () => {
    cancelAnimationFrame(frame)
    source.disconnect()
    analyser.disconnect()
    void context.close().catch(() => undefined)
  }
}

async function microphoneStream(deviceId: string) {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId !== systemDefaultMicrophone ? { deviceId: { exact: deviceId } } : {}),
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio })
  } catch (error) {
    if (deviceId === systemDefaultMicrophone || !(error instanceof DOMException) || error.name !== "NotFoundError") throw error
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  }
}

export function DictationController() {
  const { t } = useLanguage()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const shortcut = useShortcutBinding("dictation.toggle")
  const [phase, setPhase] = useState<DictationPhase>("idle")
  const [level, setLevel] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const phaseRef = useRef<DictationPhase>(phase)
  const activeTargetRef = useRef<DictationTarget | null>(null)
  const sessionRef = useRef<RecordingSession | null>(null)
  const completionTimerRef = useRef<number | null>(null)
  const holdActiveRef = useRef(false)
  const holdAttemptRef = useRef(0)
  const holdBindingRef = useRef<ShortcutBinding | null>(null)
  const shortcutRef = useRef(shortcut)
  const microphoneRef = useRef(readPreferredMicrophone())
  phaseRef.current = phase
  shortcutRef.current = shortcut

  const changePhase = useCallback((next: DictationPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const showComplete = useCallback(() => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
    setStatusMessage(null)
    changePhase("complete")
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      changePhase("idle")
    }, 1_000)
  }, [changePhase])

  const showError = useCallback((message: string, failurePhase: "error" | "allowance" = "error") => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
    setStatusMessage(t(message))
    changePhase(failurePhase)
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      setStatusMessage(null)
      changePhase("idle")
    }, 4_000)
  }, [changePhase, t])

  useEffect(() => subscribePreferredMicrophone((deviceId) => {
    microphoneRef.current = deviceId
  }), [])

  const finishRecording = useCallback(async (session: RecordingSession) => {
    session.stream.getTracks().forEach((track) => track.stop())
    session.stopMeter()
    window.clearTimeout(session.maximumTimer)
    const durationMs = Math.max(0, performance.now() - session.startedAt)
    const recording = new Blob(session.chunks, { type: session.recorder.mimeType || session.chunks[0]?.type || "audio/webm" })
    sessionRef.current = null
    setLevel(0)

    if (durationMs < 250) {
      changePhase("idle")
      return
    }
    if (session.failed) {
      showError("Microphone stopped unexpectedly")
      return
    }
    if (recording.size === 0) {
      showError("No clear audio detected")
      return
    }

    try {
      const audio = await transcriptionWav(recording)
      const transcript = await transcribeRecording(audio, durationMs)
      if (!insertTranscript(session.target, transcript)) {
        showError("Field closed before dictation finished")
        return
      }
      showComplete()
    } catch (error) {
      const allowanceReached = error instanceof TranscriptionError && error.code === "transcription_allowance_reached"
      showError(transcriptionFailureLabel(error), allowanceReached ? "allowance" : "error")
    }
  }, [changePhase, showComplete, showError])

  const stopRecording = useCallback(() => {
    const session = sessionRef.current
    if (!session || session.recorder.state === "inactive") return
    changePhase("polishing")
    session.recorder.requestData()
    session.recorder.stop()
  }, [changePhase])

  const startRecording = useCallback(async (target: DictationTarget | null, attempt: number) => {
    if (phaseRef.current !== "idle") return
    if (!target || !target.isConnected) {
      toast.info(t("Select a text field before starting dictation."))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showError("Dictation is not supported in this browser")
      return
    }

    try {
      const stream = await microphoneStream(microphoneRef.current)
      // Microphone permission can settle after the operator has released and
      // begun another hold. Only the newest press may claim the returned stream.
      if (!holdActiveRef.current || attempt !== holdAttemptRef.current || phaseRef.current !== "idle") {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const mimeType = preferredRecorderType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const session: RecordingSession = {
        recorder,
        stream,
        target,
        chunks: [],
        startedAt: performance.now(),
        stopMeter: startAudioMeter(stream, setLevel),
        maximumTimer: 0,
        failed: false,
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) session.chunks.push(event.data)
      }
      recorder.onerror = () => {
        session.failed = true
        if (recorder.state !== "inactive") recorder.stop()
      }
      recorder.onstop = () => void finishRecording(session)
      session.maximumTimer = window.setTimeout(() => stopRecording(), maximumRecordingMs)
      sessionRef.current = session
      activeTargetRef.current = target
      changePhase("transcribing")
      recorder.start(250)
    } catch (error) {
      if (attempt !== holdAttemptRef.current) return
      holdActiveRef.current = false
      holdBindingRef.current = null
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
      showError(denied ? "Microphone access blocked" : "Selected microphone unavailable")
    }
  }, [changePhase, finishRecording, showError, stopRecording, t])

  const beginHeldDictation = useCallback(() => {
    if (phaseRef.current === "polishing") {
      toast.info(t("Finishing your dictation…"))
      return
    }
    if (phaseRef.current === "complete" || phaseRef.current === "error") {
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
      setStatusMessage(null)
      changePhase("idle")
    }
    const attempt = holdAttemptRef.current + 1
    holdAttemptRef.current = attempt
    holdActiveRef.current = true
    holdBindingRef.current = shortcutRef.current
    void startRecording(activeTargetRef.current, attempt)
  }, [changePhase, startRecording, t])

  useShortcutAction("dictation.toggle", ({ event }) => {
    if (!(event instanceof KeyboardEvent)) {
      toast.info(t("Choose a keyboard shortcut for push-to-talk dictation."))
      return
    }
    beginHeldDictation()
  })

  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (!holdActiveRef.current || !releaseEndsBinding(event, holdBindingRef.current)) return
      holdActiveRef.current = false
      holdBindingRef.current = null
      if (phaseRef.current === "transcribing") stopRecording()
    }
    const cancelHold = () => {
      holdActiveRef.current = false
      holdBindingRef.current = null
      if (phaseRef.current === "transcribing") stopRecording()
    }
    window.addEventListener("keyup", release, { capture: true })
    window.addEventListener("blur", cancelHold)
    return () => {
      window.removeEventListener("keyup", release, { capture: true })
      window.removeEventListener("blur", cancelHold)
    }
  }, [stopRecording])

  useEffect(() => {
    activeTargetRef.current = dictationTargetFrom(document.activeElement)
    const focusTarget = (event: FocusEvent) => {
      const target = dictationTargetFrom(event.target)
      if (!target) return
      activeTargetRef.current = target
    }
    const clearTarget = () => {
      window.setTimeout(() => {
        if (phaseRef.current !== "idle") return
        activeTargetRef.current = dictationTargetFrom(document.activeElement)
      }, 0)
    }
    document.addEventListener("focusin", focusTarget)
    document.addEventListener("focusout", clearTarget)
    return () => {
      document.removeEventListener("focusin", focusTarget)
      document.removeEventListener("focusout", clearTarget)
    }
  }, [])

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
    holdActiveRef.current = false
    holdAttemptRef.current += 1
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    window.clearTimeout(session.maximumTimer)
    session.stopMeter()
    session.stream.getTracks().forEach((track) => track.stop())
    session.recorder.ondataavailable = null
    session.recorder.onerror = null
    session.recorder.onstop = null
    if (session.recorder.state !== "inactive") session.recorder.stop()
  }, [])

  if (typeof document === "undefined") return null
  const visiblePhase = phase === "idle" ? null : phase

  return createPortal(
    <div className="md-dictation-status-dock" aria-hidden={visiblePhase ? undefined : "true"}>
      <AnimatePresence initial={false}>
        {visiblePhase ? (
          <motion.div
            key="dictation-status"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
            transition={reduceMotion(shouldReduceMotion, visiblePhase === "complete" ? mdMotion.fast : mdMotion.enter)}
          >
            <DictationStatusPill phase={visiblePhase} level={level} message={statusMessage} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
