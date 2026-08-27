import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  bytesToBase64,
  isJsonObject,
  maximumRecordingBytes,
  normalizeDurationSeconds,
  normalizeMimeType,
  normalizeVocabulary,
  readTranscriptText,
  transcriptionModel,
  type JsonObject,
} from "./contract.ts"

type WorkspaceUser = {
  User_ID: string
  Company_ID: string
  User_AccessStatus: string | null
}

function corsHeaders(request: Request) {
  const configuredOrigin = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app"
  const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigins.has(requestOrigin) ? requestOrigin : configuredOrigin,
    "Cache-Control": "no-store",
    Vary: "Origin",
  }
}

function json(request: Request, body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  })
}

function fail(request: Request, code: string, message: string, status: number) {
  return json(request, { code, message }, status)
}

async function requestBody(request: Request) {
  const contentType = request.headers.get("content-type")?.toLocaleLowerCase() ?? ""
  if (contentType.startsWith("multipart/form-data")) return request.formData()
  const value = await request.json().catch(() => null)
  return isJsonObject(value) ? value : null
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return fail(request, "method_not_allowed", "Method not allowed.", 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? ""
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !geminiApiKey) {
    return fail(request, "transcription_unavailable", "Dictation is temporarily unavailable. Try again shortly.", 503)
  }

  const authorization = request.headers.get("Authorization")?.trim() ?? ""
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return fail(request, "authentication_required", "Sign in again before using dictation.", 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) {
    return fail(request, "authentication_required", "Sign in again before using dictation.", 401)
  }

  const { data: workspaceUser, error: workspaceError } = await admin
    .from("cmp_Users")
    .select("User_ID,Company_ID,User_AccessStatus")
    .eq("Auth_User_ID", authData.user.id)
    .maybeSingle<WorkspaceUser>()
  if (workspaceError) {
    console.error("Transcription workspace lookup failed", workspaceError.code ?? "unknown")
    return fail(request, "transcription_unavailable", "Dictation is temporarily unavailable. Try again shortly.", 503)
  }
  if (!workspaceUser || !workspaceUser.Company_ID || (workspaceUser.User_AccessStatus ?? "active") !== "active") {
    return fail(request, "workspace_profile_missing", "Your account is not connected to an active Multideck workspace.", 403)
  }

  const body = await requestBody(request).catch(() => null)
  if (!body) return fail(request, "invalid_request", "Check the dictation request and try again.", 400)
  const operation = body instanceof FormData ? String(body.get("operation") ?? "") : String(body.operation ?? "")

  if (operation === "get_preferences") {
    const { data, error } = await admin
      .from("AI_TranscriptionPreferences")
      .select("TranscriptionPreference_CustomVocabulary")
      .eq("TranscriptionPreference_UserID", workspaceUser.User_ID)
      .maybeSingle<{ TranscriptionPreference_CustomVocabulary: unknown }>()
    if (error) {
      console.error("Transcription preferences could not be read", error.code ?? "unknown")
      return fail(request, "preferences_unavailable", "Transcription settings could not be loaded.", 503)
    }
    return json(request, { customVocabulary: normalizeVocabulary(data?.TranscriptionPreference_CustomVocabulary) })
  }

  if (operation === "save_preferences") {
    if (body instanceof FormData) return fail(request, "invalid_request", "Check the transcription settings and try again.", 400)
    const customVocabulary = normalizeVocabulary(body.customVocabulary)
    const { error } = await admin.from("AI_TranscriptionPreferences").upsert({
      TranscriptionPreference_UserID: workspaceUser.User_ID,
      TranscriptionPreference_CustomVocabulary: customVocabulary,
      TranscriptionPreference_UpdatedAt: new Date().toISOString(),
    }, { onConflict: "TranscriptionPreference_UserID" })
    if (error) {
      console.error("Transcription preferences could not be saved", error.code ?? "unknown")
      return fail(request, "preferences_unavailable", "Transcription settings were not saved. Try again.", 503)
    }
    return json(request, { customVocabulary })
  }

  if (operation !== "transcribe" || !(body instanceof FormData)) {
    return fail(request, "invalid_request", "Check the dictation request and try again.", 400)
  }

  const audio = body.get("audio")
  const durationSeconds = normalizeDurationSeconds(body.get("durationMs"))
  if (!(audio instanceof File) || audio.size === 0 || audio.size > maximumRecordingBytes || !durationSeconds) {
    return fail(request, "invalid_recording", "That recording could not be processed. Try a shorter dictation.", 400)
  }
  const mimeType = normalizeMimeType(audio.type)
  if (!mimeType) return fail(request, "unsupported_recording", "This browser recorded an unsupported audio format.", 415)

  const { data: preferences, error: preferencesError } = await admin
    .from("AI_TranscriptionPreferences")
    .select("TranscriptionPreference_CustomVocabulary")
    .eq("TranscriptionPreference_UserID", workspaceUser.User_ID)
    .maybeSingle<{ TranscriptionPreference_CustomVocabulary: unknown }>()
  if (preferencesError) {
    console.error("Transcription preferences could not be read", preferencesError.code ?? "unknown")
    return fail(request, "transcription_unavailable", "Dictation is temporarily unavailable. Try again shortly.", 503)
  }

  const { data: reservation, error: reservationError } = await admin.rpc("multideck_transcription_reserve", {
    p_user_id: workspaceUser.User_ID,
    p_company_id: workspaceUser.Company_ID,
    p_duration_seconds: durationSeconds,
    p_model: transcriptionModel,
  })
  if (reservationError || typeof reservation !== "string") {
    if (reservationError?.message?.includes("TRANSCRIPTION_ALLOWANCE_REACHED")) {
      return fail(request, "transcription_allowance_reached", "Contact your administrator to increase transcription model usage.", 429)
    }
    console.error("Transcription allowance reservation failed", reservationError?.code ?? "unknown")
    return fail(request, "transcription_unavailable", "Dictation is temporarily unavailable. Try again shortly.", 503)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)
  let outcome: "succeeded" | "failed" = "failed"
  let providerRequestId: string | null = null
  let errorCode: string | null = "provider_failed"
  try {
    const bytes = new Uint8Array(await audio.arrayBuffer())
    const customVocabulary = normalizeVocabulary(preferences?.TranscriptionPreference_CustomVocabulary)
    const provider = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        model: transcriptionModel,
        store: false,
        input: [{ type: "audio", data: bytesToBase64(bytes), mime_type: mimeType }],
        generation_config: {
          transcription_config: {
            language_codes: [],
            mode: { type: "smart" },
            ...(customVocabulary.length > 0 ? { custom_vocabulary: customVocabulary } : {}),
          },
        },
      }),
      signal: controller.signal,
    })
    providerRequestId = provider.headers.get("x-request-id") || provider.headers.get("request-id")
    const providerBody = await provider.json().catch(() => null)
    if (!providerRequestId && isJsonObject(providerBody) && typeof providerBody.id === "string") {
      providerRequestId = providerBody.id
    }
    if (!provider.ok) {
      errorCode = `provider_${provider.status}`
      console.warn("Gemini transcription request failed", provider.status)
      return fail(request, "transcription_failed", "That dictation could not be transcribed. Try again.", 502)
    }
    // A successful provider response has consumed model usage even when it
    // contains no recognisable speech, so keep it inside the monthly cap.
    outcome = "succeeded"
    const text = readTranscriptText(providerBody)
    if (!text) {
      errorCode = "empty_transcript"
      return fail(request, "no_speech_detected", "No clear speech was detected. Try again closer to the microphone.", 422)
    }
    errorCode = null
    return json(request, { text })
  } catch (error) {
    errorCode = error instanceof DOMException && error.name === "AbortError" ? "provider_timeout" : "provider_unreachable"
    return fail(
      request,
      errorCode === "provider_timeout" ? "transcription_timeout" : "transcription_failed",
      errorCode === "provider_timeout" ? "Transcription took too long. Try a shorter dictation." : "That dictation could not be transcribed. Try again.",
      errorCode === "provider_timeout" ? 504 : 502,
    )
  } finally {
    clearTimeout(timeoutId)
    const { error: settlementError } = await admin.rpc("multideck_transcription_settle", {
      p_reservation_id: reservation,
      p_user_id: workspaceUser.User_ID,
      p_company_id: workspaceUser.Company_ID,
      p_outcome: outcome,
      p_provider_request_id: providerRequestId,
      p_error_code: errorCode,
    })
    if (settlementError) console.error("Transcription allowance settlement failed", settlementError.code ?? "unknown")
  }
})
