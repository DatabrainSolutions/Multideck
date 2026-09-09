import { supabase } from "@/lib/supabase"

export type TranscriptionPreferences = {
  customVocabulary: string[]
}

export class TranscriptionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "TranscriptionError"
  }
}

type FunctionErrorBody = { code?: unknown; message?: unknown }

async function functionError(error: unknown, fallback: string) {
  let status = 503
  let code = "transcription_unavailable"
  let message = fallback
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    status = error.context.status
    try {
      const body = await error.context.clone().json() as FunctionErrorBody
      if (typeof body.code === "string" && body.code.trim()) code = body.code
      if (typeof body.message === "string" && body.message.trim()) message = body.message
    } catch {
      // Keep the safe product-facing fallback.
    }
  }
  return new TranscriptionError(code, message, status)
}

async function invokeJson<T>(body: Record<string, unknown>, fallback: string) {
  if (!supabase) throw new TranscriptionError("not_configured", fallback, 503)
  const { data, error } = await supabase.functions.invoke<T>("transcription", { body })
  if (error) throw await functionError(error, fallback)
  return data
}

function normalizeVocabulary(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((term): term is string => typeof term === "string" && Boolean(term.trim())).slice(0, 100)
}

export async function getTranscriptionPreferences(): Promise<TranscriptionPreferences> {
  const data = await invokeJson<{ customVocabulary?: unknown }>(
    { operation: "get_preferences" },
    "Transcription settings could not be loaded.",
  )
  return { customVocabulary: normalizeVocabulary(data?.customVocabulary) }
}

export async function saveTranscriptionPreferences(customVocabulary: string[]): Promise<TranscriptionPreferences> {
  const data = await invokeJson<{ customVocabulary?: unknown }>(
    { operation: "save_preferences", customVocabulary },
    "Transcription settings were not saved. Try again.",
  )
  return { customVocabulary: normalizeVocabulary(data?.customVocabulary) }
}

export async function transcribeRecording(audio: Blob, durationMs: number) {
  if (!supabase) throw new TranscriptionError("not_configured", "Dictation is temporarily unavailable.", 503)
  const form = new FormData()
  form.set("operation", "transcribe")
  form.set("durationMs", String(Math.max(0, Math.round(durationMs))))
  const extension = audio.type.includes("wav") ? "wav" : audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm"
  form.set("audio", audio, `dictation.${extension}`)

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 55_000)
  try {
    const { data, error } = await supabase.functions.invoke<{ text?: unknown }>("transcription", {
      body: form,
      signal: controller.signal,
    })
    if (error) throw await functionError(error, "That dictation could not be transcribed. Try again.")
    if (typeof data?.text !== "string" || !data.text.trim()) {
      throw new TranscriptionError("empty_transcript", "No clear speech was detected. Try again closer to the microphone.", 422)
    }
    return data.text.trim()
  } catch (error) {
    if (error instanceof TranscriptionError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranscriptionError("transcription_timeout", "Transcription took too long. Try a shorter dictation.", 504)
    }
    throw await functionError(error, "That dictation could not be transcribed. Try again.")
  } finally {
    window.clearTimeout(timeoutId)
  }
}
