import { useCallback, useEffect, useRef, useState } from "react"
import { getSupabaseSession, supabaseFunctionsUrl } from "@/lib/supabase"
import { readPreferredMicrophone, systemDefaultMicrophone } from "@/lib/dictation-preferences"
import { transcriptFragment, voiceRequest, type VoiceFragment, type VoiceId, type VoicePreferences } from "@/lib/dexter-voice-api"
import type { VoiceTranscriptSession } from "@/lib/dexter-voice-transcript"

export type VoicePhase = "idle" | "connecting" | "listening" | "finishing" | "ended" | "error"
type VoiceResult = { content: string; conversationId?: string }
type VoiceOptions = { conversationId?: string | null; onConversation?: (id: string) => void; onRequest?: (prompt: string) => Promise<VoiceResult>; onUpdate?: (prompt: string) => Promise<VoiceResult> }
export function useDexterVoice(options: VoiceOptions = {}) {
  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [fragments, setFragments] = useState<VoiceFragment[]>([])
  const [muted, setMuted] = useState(false)
  const [working, setWorking] = useState(false)
  const [allowance, setAllowance] = useState<VoicePreferences | null>(null)
  const [endReason, setEndReason] = useState<string | null>(null)
  const [sessionInfo, setSessionInfo] = useState({id:"",created_at:""})
  const [pastSessions, setPastSessions] = useState<VoiceTranscriptSession[]>([])
  const currentTranscript = useRef<VoiceTranscriptSession | null>(null)
  currentTranscript.current = sessionInfo.id ? {...sessionInfo, transcript:fragments} : null
  const inFlight = useRef(false)
  const optionsRef = useRef(options); optionsRef.current = options
  const level = useRef({ input: 0, output: 0 })
  const socket = useRef<WebSocket | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const microphone = useRef<MediaStream | null>(null)
  const worklet = useRef<AudioWorkletNode | null>(null)
  const generation = useRef(0), ready = useRef(false), starting = useRef(false)
  const finishing = useRef(false), mounted = useRef(true)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const requests = useRef(new Set<string>())
  const cleanup = useCallback(() => {
    clearTimeout(timeout.current)
    ready.current = false; starting.current = false
    microphone.current?.getTracks().forEach(track => track.stop()); microphone.current = null
    worklet.current?.disconnect(); worklet.current = null
    void audio.current?.close(); audio.current = null
    if (socket.current) {
      socket.current.onopen = null; socket.current.onmessage = null
      socket.current.onclose = null; socket.current.onerror = null
      socket.current.close(); socket.current = null
    }
    level.current = { input: 0, output: 0 }
  }, [])
  const send = useCallback((event: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(event))
  }, [])
  const end = useCallback(() => {
    if (finishing.current) return
    finishing.current = true
    microphone.current?.getTracks().forEach(track => { track.enabled = false })
    if (socket.current?.readyState === WebSocket.OPEN) {
      setPhase("finishing"); send({ type: "voice.close" })
      timeout.current = setTimeout(() => { cleanup(); if (mounted.current) { setPhase("ended"); setEndReason("disconnected") } }, 7000)
    } else {
      generation.current++; cleanup(); setPhase("ended")
    }
  }, [cleanup, send])
  useEffect(() => {
    mounted.current = true
    const leave = () => { send({ type: "voice.close" }); cleanup() }
    window.addEventListener("pagehide", leave)
    return () => { mounted.current = false; generation.current++; window.removeEventListener("pagehide", leave); leave() }
  }, [cleanup, send])
  useEffect(() => {
    let cancelled=false
    setPastSessions([])
    if (options.conversationId) void voiceRequest<{sessions:VoiceTranscriptSession[]}>({operation:"history",conversationId:options.conversationId})
      .then(data=>{if(!cancelled)setPastSessions(data.sessions)})
      .catch(()=>{/* Chat stays usable if optional earlier voice captions cannot load. */})
    return()=>{cancelled=true}
  }, [options.conversationId])

  const start = useCallback(async (voice?: VoiceId, preview = false) => {
    if (starting.current || ready.current) return
    const previous = currentTranscript.current
    if (previous?.transcript.length) setPastSessions(sessions => [...sessions.filter(session => session.id !== previous.id), previous])
    const run = ++generation.current
    starting.current = true; finishing.current = false; requests.current.clear(); chain.current = Promise.resolve()
    setPhase("connecting"); setError(null); setEndReason(null); setFragments([]); setMuted(false); setWorking(false)
    setSessionInfo({id:crypto.randomUUID(),created_at:new Date().toISOString()})
    const current = () => mounted.current && run === generation.current && !finishing.current
    try {
      if (!window.AudioContext || !window.isSecureContext || (!preview && !navigator.mediaDevices?.getUserMedia)) throw new Error("Voice needs a supported browser with microphone access. Try Chrome on HTTPS.")
      // Create/resume from the click before any network work for autoplay rules.
      const context = new AudioContext({ sampleRate: 24000 }); audio.current = context
      await context.resume()
      const settings = await voiceRequest({ operation: "preferences" })
      if (!current()) return
      setAllowance(settings)
      if (settings.remainingSeconds <= 0) throw new Error("Your five minutes of voice are used for today. Carry on typing, or speak again tomorrow.")
      await context.audioWorklet.addModule("/audio/dexter-voice-worklet.js")
      if (!current()) return
      const processor = new AudioWorkletNode(context, "dexter-voice-audio", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
      worklet.current = processor; processor.connect(context.destination)
      if (!preview) {
        const preferred = readPreferredMicrophone()
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(preferred !== systemDefaultMicrophone ? { deviceId: { ideal: preferred } } : {}) } })
        if (!current()) { stream.getTracks().forEach(track => track.stop()); return }
        microphone.current = stream; context.createMediaStreamSource(stream).connect(processor)
      }
      processor.port.onmessage = ({ data }) => {
        if (data.type === "playback_overflow") { setError("Audio playback fell behind. Please reconnect to continue speaking."); end(); return }
        if (data.type === "level") { level.current = { input: data.input, output: data.output }; return }
        if (data.type !== "input" || !ready.current || finishing.current) return
        if ((socket.current?.bufferedAmount || 0) > 128000) { setError("Your connection is too slow for voice. Try again when it improves."); end(); return }
        const bytes = new Uint8Array(data.buffer)
        send({ type: "session.input_audio.append", audio: btoa(String.fromCharCode(...bytes)) })
      }
      const session = await getSupabaseSession()
      if (!current()) return
      if (!session?.access_token || !supabaseFunctionsUrl) throw new Error("Sign in again to use voice.")
      const connection = new WebSocket(`${supabaseFunctionsUrl.replace(/^http/, "ws")}/dexter-voice`)
      socket.current = connection
      timeout.current = setTimeout(() => { if (current()) { setError("Voice took too long to connect. Please try again."); end() } }, 25000)
      connection.onopen = () => send({ type: "voice.start", token: session.access_token, voice: voice || settings.voice, preview,
        conversationId: optionsRef.current.conversationId || null })
      connection.onmessage = ({ data }) => {
        if (!mounted.current || run !== generation.current) return
        try {
          const event = JSON.parse(data)
          if (event.type === "voice.ready") {
            if (!preview && event.conversationId) optionsRef.current.onConversation?.(event.conversationId)
            setSessionInfo({id:event.sessionId,created_at:event.startedAt || new Date().toISOString()})
            clearTimeout(timeout.current); ready.current = true; starting.current = false; setPhase("listening")
          } else if (event.type === "session.output_audio.delta") {
            const bytes = Uint8Array.from(atob(event.delta), char => char.charCodeAt(0))
            processor.port.postMessage({ type: "audio", buffer: bytes.buffer }, [bytes.buffer])
          } else if (event.type === "voice.request") {
            if (preview || requests.current.has(event.delegationId)) return
            requests.current.add(event.delegationId)
            if (inFlight.current) {
              // Steer the current Dexter run; do not run a correction as a second job.
              void optionsRef.current.onUpdate?.(event.prompt).then(result=>{
                if(current())send({type:"voice.result",delegationId:event.delegationId,content:result.content})
              }).catch(()=>{if(current())send({type:"voice.result",delegationId:event.delegationId,content:"The follow-up could not be confirmed. Please check the current request in chat before retrying."})})
              return
            }
            // One work owner; never replay a failed action or run on caption gaps.
            chain.current = chain.current.then(async () => {
              if (!current()) return
              setWorking(true)
              inFlight.current=true
              try {
                const result = await optionsRef.current.onRequest?.(event.prompt)
                if (!result) throw new Error("This voice request could not be started. Please continue in chat.")
                if (run === generation.current && ready.current) {
                  if (result.conversationId) send({ type: "voice.link", conversationId: result.conversationId })
                  send({ type: "voice.result", delegationId: event.delegationId, content: result.content })
                }
              } catch (error) {
                if (mounted.current && run === generation.current) {
                  const message = error instanceof Error ? error.message : "That request could not be completed. Check the chat before retrying."
                  setError(message); send({ type: "voice.result", delegationId: event.delegationId, content: message })
                }
              } finally { inFlight.current=false; if (mounted.current && run === generation.current) setWorking(false) }
            })
          } else if (event.type === "voice.error") setError(event.message)
          else if (event.type === "voice.finishing") { finishing.current = true; setPhase("finishing"); setEndReason(event.reason) }
          else if (event.type === "voice.ended") {
            finishing.current = true
            cleanup(); setPhase("ended"); setEndReason(reason => reason || event.reason)
            window.dispatchEvent(new CustomEvent("multideck:voice-usage-changed"))
            void voiceRequest({ operation: "preferences" }).then(value => { if (mounted.current) setAllowance(value) }).catch(() => {})
          } else {
            const fragment = transcriptFragment(event)
            if (fragment) setFragments(previous => previous.some(item => item.id === fragment.id) ? previous : [...previous, fragment])
          }
        } catch { setError("The voice connection was interrupted. Your chat is still available."); end() }
      }
      connection.onclose = () => { cleanup(); if (mounted.current && run === generation.current) { setPhase("ended"); setEndReason("disconnected") } }
      connection.onerror = () => {
        if (finishing.current || !mounted.current || run !== generation.current) return
        setError("Voice could not connect. You can continue typing."); end()
      }
    } catch (error) {
      cleanup()
      if (mounted.current && run === generation.current) {
        setPhase("error")
        setError(error instanceof DOMException && error.name === "NotAllowedError" ? "Allow microphone access in your browser to speak to Dexter." : error instanceof Error ? error.message : "Voice could not start.")
      }
    } finally { if (!current()) cleanup() }
  }, [cleanup, end, send])
  const toggleMute = () => {
    const next = !muted; setMuted(next)
    microphone.current?.getTracks().forEach(track => { track.enabled = !next })
    worklet.current?.port.postMessage({ type: "mute", muted: next })
    send({ type: next ? "session.input_audio.mute" : "session.input_audio.unmute" })
  }
  const transcriptSessions = [...pastSessions.filter(session=>session.id!==sessionInfo.id), ...(sessionInfo.id ? [{...sessionInfo,transcript:fragments}] : [])]
  return { phase, error, fragments, transcriptSessions, muted, working, allowance, endReason, level, start, end, toggleMute,
    active: ["connecting", "listening", "finishing"].includes(phase),
    reset: () => { generation.current++; finishing.current=true; send({type:"voice.close"}); cleanup(); setFragments([]); setSessionInfo({id:"",created_at:""});setPastSessions([]);setPhase("idle") },
    dismiss: () => { if (!ready.current && !starting.current) { setPhase("idle"); setError(null) } } }
}
