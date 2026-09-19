/** GPT-Live's wire contract; shared with the browser and executable tests. */
export const voiceModel = "gpt-live-1"
export const dailyVoiceSeconds = 300
export const voiceOptions = [
  { id: "vesper", name: "Vesper", detail: "British · masculine" },
  { id: "willow", name: "Willow", detail: "Irish · feminine" },
  { id: "stone", name: "Stone", detail: "Irish · masculine" },
  { id: "quartz", name: "Quartz", detail: "Australian · feminine" },
  { id: "ripple", name: "Ripple", detail: "Australian · masculine" },
  { id: "gleam", name: "Gleam", detail: "North American · feminine" },
  { id: "meridian", name: "Meridian", detail: "North American · masculine" },
  { id: "beacon", name: "Beacon", detail: "Filipino · masculine" },
  { id: "delta", name: "Delta", detail: "Southern US · feminine" },
  { id: "cinder", name: "Cinder", detail: "Southern US · masculine" },
] as const
export type VoiceId = typeof voiceOptions[number]["id"]
export function isVoiceId(value: unknown): value is VoiceId {
  return voiceOptions.some(voice => voice.id === value)
}
export type VoiceFragment = { role: "user" | "assistant"; delta: string; startMs: number; endMs: number; id: string }
export type VoiceTurn = Omit<VoiceFragment, "delta"> & { content: string }
/** Only adjacent speech belongs together. Never stitch across another speaker. */
export function voiceTranscriptTurns(fragments: VoiceFragment[]): VoiceTurn[] {
  const turns: VoiceTurn[] = []
  const seen = new Set<string>()
  for (const fragment of [...fragments].sort((a, b) => a.startMs - b.startMs)) {
    if (seen.has(fragment.id)) continue
    seen.add(fragment.id)
    const previous = turns.at(-1)
    if (previous?.role === fragment.role && fragment.startMs - previous.endMs < 2000) {
      previous.content += fragment.delta
      previous.endMs = Math.max(previous.endMs, fragment.endMs)
    } else turns.push({role:fragment.role, content:fragment.delta, startMs:fragment.startMs, endMs:fragment.endMs, id:fragment.id})
  }
  return turns
}
export function transcriptFragment(event: Record<string, unknown>): VoiceFragment | null {
  if (!["session.input_transcript.delta", "session.output_transcript.delta"].includes(String(event.type))) return null
  if (typeof event.delta !== "string" || !Number.isFinite(event.start_ms) || !Number.isFinite(event.end_ms)) return null
  return { role: event.type === "session.input_transcript.delta" ? "user" : "assistant", delta: event.delta,
    startMs: Number(event.start_ms), endMs: Number(event.end_ms), id: String(event.event_id) }
}
/** Delegations mark work requests; caption gaps must never trigger tools. */
export function delegatedPrompt(fragments: VoiceFragment[], afterMs: number, offsetMs: number) {
  const eligible = fragments.filter(item => item.endMs > afterMs && item.startMs <= offsetMs)
  const turns = voiceTranscriptTurns(eligible)
  let last = turns.length - 1
  while (last >= 0 && turns[last].role !== "user") last--
  if (last < 0) return ""
  let first = last
  while (first > 0 && turns[first-1].role === "user") first--
  return turns.slice(first,last+1).map(turn => turn.content.trim()).join(" ")
}
export function voiceCostGbp(seconds: number) { return Math.max(0, seconds) / 60 * 0.05 / 1.3 }
export function cumulativeVoiceSeconds(previous: number, usage: unknown) {
  const seconds = usage && typeof usage === "object" ? (usage as { seconds?: unknown }).seconds : null
  return typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(previous, seconds, 0) : previous
}
