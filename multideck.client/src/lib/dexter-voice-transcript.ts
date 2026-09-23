import type { DexterMessage } from "./dexter-api"
import { voiceTranscriptTurns, type VoiceFragment } from "../../../supabase/functions/dexter-voice/contract"

export type VoiceTranscriptSession = { id: string; created_at: string; transcript: VoiceFragment[] }
const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** Captions own turn order. Saved answers own rich content and action metadata;
 * they must never collapse several exchanges into one bubble. */
export function mergeVoiceTranscript(messages: DexterMessage[], sessions: VoiceTranscriptSession[]): DexterMessage[] {
  const replaced = new Set<string>()
  const spoken: DexterMessage[] = []
  for (const session of sessions) {
    const start = Date.parse(session.created_at)
    if (!Number.isFinite(start)) continue
    const turns = voiceTranscriptTurns(session.transcript).filter(turn => turn.content.trim())
    const rows: DexterMessage[] = turns.map(turn => ({
      id:`voice-${session.id}-${turn.id}`, renderKey:`voice-${session.id}-${turn.id}`,
      role:turn.role, content:turn.content.trim(), createdAt:new Date(start+turn.startMs).toISOString(), voiceTranscript:true,
    }))
    const users = turns.map((turn,index) => ({turn,index})).filter(({turn}) => turn.role === "user")
    const claimed = new Set<number>()
    for (const request of messages) {
      if (request.role !== "user" || replaced.has(request.id)) continue
      const timestamp = Date.parse(request.createdAt)
      if (timestamp < start-3000 || timestamp > start+(turns.at(-1)?.endMs || 0)+60000) continue
      const text = normalise(request.content)
      if (!text) continue
      let matched: number[] | undefined
      // Older sessions may contain a saved request combining several utterances.
      // Match the full span, but keep every caption turn and attach the result
      // only to the final request. A substring such as "Hello" is never enough.
      for (let first=0; first<users.length && !matched; first++) {
        let combined = ""
        const indices: number[] = []
        for (let last=first; last<users.length; last++) {
          const {turn,index} = users[last]
          if (claimed.has(index)) break
          combined = [combined,normalise(turn.content)].filter(Boolean).join(" ")
          indices.push(index)
          if (combined === text) { matched=indices; break }
          if (!text.startsWith(combined+" ")) break
        }
      }
      if (!matched) continue
      matched.forEach(index => claimed.add(index))
      const userIndex = matched.at(-1)!
      replaced.add(request.id)
      rows[userIndex] = {...request, ...rows[userIndex], id:request.id}
      const response = messages.find(message => message.role === "assistant" && message.responseToUserMessageId === request.id)
      if (!response || replaced.has(response.id)) continue
      let responseIndex = -1
      for (let index=userIndex+1; index<turns.length && turns[index].role !== "user"; index++) responseIndex=index
      if (responseIndex < 0) continue
      // Spoken captions are a summary, not the written result. Keep the complete
      // backend Markdown so citations, email links and other evidence survive.
      // Earlier acknowledgements remain independent bubbles with stable keys.
      replaced.add(response.id)
      rows[responseIndex] = {...response, ...rows[responseIndex], id:response.id,
        content:response.content.trim() ? response.content : rows[responseIndex].content}
    }
    spoken.push(...rows)
  }
  return [...messages.filter(message => !replaced.has(message.id)), ...spoken]
    .sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt))
}
