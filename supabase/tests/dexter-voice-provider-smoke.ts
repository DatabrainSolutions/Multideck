// Explicit opt-in, bounded provider smoke. No microphone, records or secrets logged.
// npx deno run --allow-env --env-file=supabase/.env.local --allow-net=api.openai.com supabase/tests/dexter-voice-provider-smoke.ts
import WebSocket from "npm:ws@8.18.3"
import { voiceModel, voiceOptions } from "../functions/dexter-voice/contract.ts"
const key = Deno.env.get("OPENAI_API_KEY")
if (!key) throw new Error("OPENAI_API_KEY is required")
const requested=Deno.args.find(arg=>arg.startsWith("--voice="))?.split("=")[1]
const voices = requested ? voiceOptions.filter(voice=>voice.id===requested) : Deno.args.includes("--all-voices") ? voiceOptions : voiceOptions.slice(0, 1)
for (const voice of voices) {
  await new Promise<void>((resolve, reject) => {
    let frames = 0, captions = 0, interval: ReturnType<typeof setInterval>, deadline: ReturnType<typeof setTimeout>
    const eventTypes = new Set<string>(); let peak = 0
    const ws = new WebSocket("wss://api.openai.com/v1/live/sessions", { headers: { Authorization: `Bearer ${key}` } })
    const timer = setTimeout(() => { clearInterval(interval); ws.terminate(); reject(new Error("Provider smoke timed out")) }, 25000)
    const finish = (error?: Error) => { clearTimeout(timer); clearTimeout(deadline); clearInterval(interval); ws.terminate(); error ? reject(error) : resolve() }
    const send = (event: unknown) => ws.send(JSON.stringify(event))
    ws.on("open", () => send({ type: "session.start", session: { model: voiceModel, store: false,
      audio: { format: { type: "audio/pcm", rate: 24000 }, output: { voice: voice.id } }, delegation: { type: "client" },
      instructions: "Speak English. Immediately say: Hello, I'm Dexter. This is a short voice preview. Then remain silent.", input: [] } }))
    ws.on("message", (raw: { toString(): string }) => {
      const event = JSON.parse(raw.toString())
      eventTypes.add(event.type)
      if (event.type === "session.started") {
        const silence = btoa("\0".repeat(2400))
        interval = setInterval(() => send({ type: "session.input_audio.append", audio: silence }), 50)
        send({ type: "session.commentary.append", event_id: crypto.randomUUID(), delegation_id: null, content: "Hello, I'm Dexter. What can I help you with today?" })
        deadline = setTimeout(() => { clearInterval(interval); send({ type: "session.close" }) }, 16000)
      }
      if (event.type === "session.output_audio.delta") {
        frames++
        const pcm = Uint8Array.from(atob(event.delta), char => char.charCodeAt(0))
        for (const sample of new Int16Array(pcm.buffer)) peak = Math.max(peak, Math.abs(sample))
      }
      if (event.type === "session.output_transcript.delta") captions++
      if (event.type === "error") finish(new Error(`Provider rejected session: ${event.error?.code || event.code || "unknown"}`))
      if (event.type === "session.closed") {
        console.log(JSON.stringify({ voice: voice.id, audioFrames: frames, transcriptFragments: captions, peak, seconds: event.usage?.seconds, eventTypes: [...eventTypes] }))
        finish(frames > 0 && captions > 0 && event.usage?.seconds > 0 ? undefined : new Error("Missing audio, captions or final duration"))
      }
    })
    ws.on("error", () => finish(new Error("Provider connection failed")))
  })
}
