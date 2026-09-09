export const transcriptionModel = "gemini-3.5-transcribe"
export const maximumRecordingBytes = 8 * 1024 * 1024
export const maximumRecordingSeconds = 180
export const maximumVocabularyTerms = 100
export const maximumVocabularyTermLength = 80

const supportedAudioTypes = new Set([
  "audio/aac",
  "audio/aiff",
  "audio/flac",
  "audio/l16",
  "audio/m4a",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
])

export type JsonObject = Record<string, unknown>

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function normalizeVocabulary(value: unknown) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const terms: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string") continue
    const term = entry.replace(/\s+/g, " ").trim().slice(0, maximumVocabularyTermLength)
    const key = term.toLocaleLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length >= maximumVocabularyTerms) break
  }
  return terms
}

export function normalizeMimeType(value: string) {
  const mimeType = value.split(";", 1)[0].trim().toLocaleLowerCase()
  return supportedAudioTypes.has(mimeType) ? mimeType : ""
}

export function normalizeDurationSeconds(value: unknown) {
  const durationMs = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN
  if (!Number.isFinite(durationMs) || durationMs < 250 || durationMs > maximumRecordingSeconds * 1000) return null
  return Math.round(durationMs) / 1000
}

export function readTranscriptText(value: unknown) {
  if (!isJsonObject(value)) return ""
  if (typeof value.output_text === "string") return value.output_text.trim()

  const steps = Array.isArray(value.steps) ? value.steps : []
  const stepText = steps
    .filter(isJsonObject)
    .filter((step) => step.type === "model_output")
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter(isJsonObject)
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => String(content.text).trim())
    .filter(Boolean)
    .join("\n")
    .trim()
  if (stepText) return stepText

  const outputs = Array.isArray(value.outputs) ? value.outputs : []
  return outputs
    .filter(isJsonObject)
    .filter((output) => output.type === "text" && typeof output.text === "string")
    .map((output) => String(output.text).trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

export function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
