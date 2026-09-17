import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import WebSocket from "npm:ws@8.18.3"
import { loadDexterActor } from "../agent-dexter/security.ts"
import { redactModelSecrets } from "../_shared/model-gateway.ts"
import { readAllowedAppOrigins } from "../_shared/backend.ts"
import { cumulativeVoiceSeconds, delegatedPrompt, isVoiceId, transcriptFragment, voiceModel, type VoiceFragment } from "./contract.ts"

type Json = Record<string, any>
const object = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value))
const url = Deno.env.get("SUPABASE_URL") || ""
const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } })
function headers(request: Request) {
  const origin = request.headers.get("origin") || ""
  return { "Access-Control-Allow-Origin": readAllowedAppOrigins().has(origin) ? origin : "null", "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" }
}
function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers(request), "Content-Type": "application/json" } })
}
async function authenticate(token: string) {
  if (!token || token.length > 12000) throw new Error("authentication_required")
  const client = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error("authentication_required")
  const actor = await loadDexterActor(admin, data.user.id)
  const reconciliation = await admin.rpc("multideck_voice_reconcile", { p_company_id: actor.companyId })
  if (reconciliation.error) throw new Error("voice_access_unavailable")
  const preferences = await client.rpc("multideck_voice_preferences", { p_voice: null })
  if (preferences.error) throw new Error("voice_access_unavailable")
  return { client, actor, preferences: preferences.data }
}
function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "voice_unavailable"
  if (code.includes("voice_daily_limit")) return "Your five minutes of voice are used for today. You can carry on typing, or speak again tomorrow."
  if (code.includes("voice_already_active")) return "Voice is already open on another device or tab. End that conversation first."
  if (code.includes("usage_allowance_reached")) return "Your workspace AI allowance is used. Contact your administrator to continue."
  if (code.includes("authentication")) return "Sign in again to use voice."
  if (code.includes("voice_access")) return "Voice is not available for your account yet. You can continue typing."
  return "Voice could not connect. You can continue typing and try again shortly."
}
function disabled() {
  return ["DEXTER_AI_EGRESS_DISABLED", "DEXTER_OPENAI_DISABLED", "DEXTER_DEXTER_VOICE_DISABLED"].some(key => /^(1|true|yes|on)$/i.test(Deno.env.get(key) || ""))
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) })
  if (headers(request)["Access-Control-Allow-Origin"] === "null") return json(request, { message: "This workspace origin is not authorised." }, 403)
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    if (request.method !== "POST") return json(request, { message: "Method not allowed." }, 405)
    try {
      const { client, actor, preferences } = await authenticate((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""))
      const raw = await request.text()
      if (raw.length > 4096) return json(request, { message: "Request too large." }, 413)
      const body = JSON.parse(raw)
      if (body.operation === "preferences") return json(request, preferences)
      if (body.operation === "save_preferences" && isVoiceId(body.voice)) {
        const { data, error } = await client.rpc("multideck_voice_preferences", { p_voice: body.voice })
        if (error) throw error
        return json(request, data)
      }
      if (body.operation === "history" && typeof body.conversationId === "string") {
        const { data, error } = await admin.from("AI_DexterVoiceSessions").select("id,transcript,seconds,created_at,usage_confirmed")
          .eq("company_id", actor.companyId).eq("user_id", actor.userId).eq("conversation_id", body.conversationId)
          .gt("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(10)
        if (error) throw error
        return json(request, { sessions: data })
      }
      return json(request, { message: "Check the voice settings and try again." }, 400)
    } catch (error) { return json(request, { message: errorMessage(error) }, 403) }
  }

  // No bearer tokens in URLs. This socket receives one authenticated start
  // frame before it can reserve usage, connect to OpenAI, or accept audio.
  const { socket: downstream, response } = Deno.upgradeWebSocket(request)
  let upstream: WebSocket | null = null
  let context: Awaited<ReturnType<typeof authenticate>> | null = null
  let reservation: { id: string; seconds: number; conversationId: string | null } | null = null
  let initialising = false, ready = false, closing = false, settled = false
  let closeReason = "closed"
  let providerId: string | null = null, startedAt = 0, observedSeconds = 0, lastDelegationMs = -1
  let transcript: VoiceFragment[] = []
  const eventIds = new Set<string>(), delegations = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  const send = (event: Json) => { if (downstream.readyState === 1) downstream.send(JSON.stringify(event)) }
  const providerSend = (event: Json) => { if (upstream?.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(event)) }
  const authTimer = setTimeout(() => { downstream.close(1008, "Authentication required") }, 8000)
  async function settle(confirmed: boolean, reason: string) {
    if (settled) return
    settled = true
    clearTimeout(authTimer); clearTimeout(timer); clearTimeout(closeTimer); clearInterval(heartbeat)
    const seconds = confirmed ? observedSeconds : startedAt ? Math.max(observedSeconds, Math.min(reservation?.seconds || 300, (Date.now() - startedAt) / 1000)) : 0
    if (reservation && context) {
      const { error } = await admin.rpc("multideck_voice_settle", {
        p_session_id: reservation.id, p_company_id: context.actor.companyId, p_user_id: context.actor.userId,
        p_seconds: seconds, p_confirmed: confirmed, p_provider_id: providerId, p_transcript: transcript, p_reason: reason,
      })
      if (error) { console.error("Voice settlement failed", error.code); send({ type: "voice.error", message: "Your voice usage is still being reconciled." }) }
    }
    send({ type: "voice.ended", seconds, confirmed, reason })
    upstream?.terminate()
    if (downstream.readyState < 2) downstream.close(1000)
  }
  function close(reason = "user_ended") {
    if (closing || settled) return
    closing = true
    closeReason = reason
    clearTimeout(timer); clearInterval(heartbeat)
    send({ type: "voice.finishing", reason })
    if (ready) {
      providerSend({ type: "session.close" })
      closeTimer = setTimeout(() => { void settle(false, reason) }, 5000)
    } else void settle(false, reason)
  }
  downstream.onclose = () => close("disconnected")
  downstream.onerror = () => close("connection_error")
  downstream.onmessage = async ({ data }) => {
    try {
      if (typeof data !== "string" || data.length > 70000) throw new Error("invalid_voice_frame")
      const event = JSON.parse(data)
      if (!object(event)) throw new Error("invalid_voice_frame")
      if (!context) {
        if (event.type !== "voice.start" || initialising) throw new Error("authentication_required")
        initialising = true
        context = await authenticate(String(event.token || ""))
        clearTimeout(authTimer)
        if (settled || downstream.readyState !== 1) return
        const key = Deno.env.get("OPEN_API_KEY")?.trim() || Deno.env.get("OPENAI_API_KEY")?.trim() || ""
        if (!key || disabled()) throw new Error("voice_disabled")
        const preview = event.preview === true
        const voice = isVoiceId(event.voice) ? event.voice : context.preferences.voice
        const conversationId = preview ? null : event.conversationId || null
        const { data: prepared, error: prepareError } = await context.client.rpc("multideck_dexter_prepare_conversation", { p_conversation_id: conversationId })
        if (prepareError) throw new Error("conversation_unavailable")
        const { data: reserved, error } = await admin.rpc("multideck_voice_reserve", { p_company_id: context.actor.companyId,
          p_user_id: context.actor.userId, p_conversation_id: conversationId, p_voice: voice, p_preview: preview })
        if (error) throw new Error(error.message)
        reservation = reserved
        if (settled || downstream.readyState !== 1) {
          // A tab closed during authentication/reservation: release before egress.
          settled = false; await settle(true, "cancelled_before_connection"); return
        }
        const history = (Array.isArray(prepared?.history) ? prepared.history : []).slice(-12).map((item: Json) => ({ type: "message",
          role: item.role === "assistant" ? "assistant" : "user", content: [{ type: item.role === "assistant" ? "output_text" : "input_text", text: String(redactModelSecrets(item.content || "")).slice(0,1500) }] }))
        upstream = new WebSocket("wss://api.openai.com/v1/live/sessions", { headers: { Authorization: `Bearer ${key}` }, maxPayload: 2 * 1024 * 1024 })
        timer = setTimeout(() => { send({ type: "voice.error", message: "Voice took too long to connect. Please try again." }); close("connect_timeout") }, 15000)
        upstream.on("open", () => providerSend({ type: "session.start", session: {
          model: voiceModel, store: false, audio: { format: { type: "audio/pcm", rate: 24000 }, output: { voice } },
          delegation: { type: "client" }, input: preview ? [] : history,
          instructions: preview
            ? "You are Dexter, Multideck's AI assistant. Speak only English. Immediately say: Hello, I'm Dexter. What can I help you with today? Then remain silent. This is a voice preview; never delegate or take actions."
            : "You are Dexter, Multideck's AI assistant. Speak concise, natural English (British English by default). Listen and allow interruptions. For EVERY business question, lookup or action, delegate to the existing Dexter backend. It has the tools, verified records and action approvals. Never invent data or claim an action succeeded without a backend result. Ask for clarification when speech is ambiguous. An approval card remains authoritative: tell the user to review it in chat. A spoken yes must not bypass the existing approval controls. Be quiet while work runs unless a brief acknowledgement helps. Do not read markdown, IDs or tables aloud. A correction changes the task; delegate it. Voice may end while backend work continues in chat.",
        } }))
        upstream.on("message", async (raw: { toString(): string }) => {
          try {
            const message = JSON.parse(raw.toString()) as Json
            if (message.type === "session.started") {
              ready = true; providerId = message.session.id; startedAt = Date.now(); clearTimeout(timer)
              send({ type: "voice.ready", sessionId: reservation!.id, conversationId: reservation!.conversationId,
                seconds: reservation!.seconds, voice, startedAt: new Date(startedAt).toISOString() })
              timer = setTimeout(() => close(preview ? "preview_complete" : context?.preferences.dailyUnlimited ? "session_complete" : "daily_limit"), reservation!.seconds * 1000)
              heartbeat = setInterval(() => {
                if (!context || disabled()) { close("access_changed"); return }
                void context.client.rpc("multideck_voice_preferences", { p_voice: null }).then(({ error }) => {
                  if (error) close("access_changed")
                })
                // Preserve captions on an interrupted worker; never save audio.
                void admin.from("AI_DexterVoiceSessions").update({ transcript, seconds: observedSeconds })
                  .eq("id", reservation!.id).then(({ error }) => { if (error) close("checkpoint_failed") })
              }, 10000)
              if (preview) providerSend({ type: "session.commentary.append", event_id: crypto.randomUUID(), delegation_id: null,
                content: "Hello, I'm Dexter. What can I help you with today?" })
              return
            }
            observedSeconds = cumulativeVoiceSeconds(observedSeconds, message.usage)
            const fragment = transcriptFragment(message)
            if (fragment && !eventIds.has(fragment.id)) {
              eventIds.add(fragment.id); transcript.push(fragment)
              send(message)
            } else if (message.type === "session.delegation.created" && !preview && !closing) {
              const id = message.delegation?.id
              if (typeof id !== "string" || delegations.has(id)) return
              delegations.add(id)
              const offset = Number(message.offset_ms)
              const prompt = delegatedPrompt(transcript, lastDelegationMs, offset)
              if (prompt) { lastDelegationMs = offset; send({ type: "voice.request", delegationId: id, prompt }) }
              else providerSend({ type: "session.commentary.append", delegation_id: id, content: "Please ask the user to repeat their request; no complete request text is available yet." })
            } else if (message.type === "session.closed") {
              await settle(true, closing ? closeReason : String(message.reason)); return
            } else if (message.type === "error") {
              send({ type: "voice.error", message: "The voice connection encountered a problem. Your chat remains available." }); close("provider_error")
            } else if (message.type === "session.output_audio.delta" || message.type === "session.input_audio.muted" || message.type === "session.input_audio.unmuted") send(message)
          } catch { close("invalid_provider_event") }
        })
        upstream.on("error", () => { send({ type: "voice.error", message: "Voice could not connect to the provider. You can continue typing." }); void settle(false, "provider_error") })
        upstream.on("close", () => { void settle(false, "provider_disconnected") })
        return
      }
      if (event.type === "voice.close") { close(); return }
      if (!ready || closing) return
      if (event.type === "session.input_audio.append" && typeof event.audio === "string" && event.audio.length <= 6400) {
        if ((upstream?.bufferedAmount || 0) > 256000) { close("slow_connection"); return }
        providerSend({ type: event.type, audio: event.audio }); return
      }
      if (["session.input_audio.mute", "session.input_audio.unmute"].includes(event.type)) { providerSend({ type: event.type }); return }
      if (event.type === "voice.result" && delegations.has(event.delegationId) && typeof event.content === "string") {
        providerSend({ type: "session.commentary.append", event_id: crypto.randomUUID(), delegation_id: event.delegationId,
          content: String(redactModelSecrets(event.content)).slice(0,1000) }); return
      }
      if (event.type === "voice.link" && typeof event.conversationId === "string") {
        const { error } = await context.client.rpc("multideck_dexter_prepare_conversation", { p_conversation_id: event.conversationId })
        if (error) throw new Error("conversation_unavailable")
        await admin.from("AI_DexterVoiceSessions").update({ conversation_id: event.conversationId }).eq("id", reservation!.id)
      }
    } catch (error) {
      const code=error instanceof Error ? error.message : "unknown"
      console.error("Voice request failed", { stage: reservation ? "reserved" : context ? "authorised" : "authentication",
        code: /^[a-z_]+$/.test(code) ? code : "database_or_transport_error" })
      send({ type: "voice.error", message: errorMessage(error) }); close("request_error")
    }
  }
  return response
})
