import { supabase } from "@/lib/supabase"
export { voiceOptions, dailyVoiceSeconds, delegatedPrompt, transcriptFragment } from "../../../supabase/functions/dexter-voice/contract"
export type { VoiceId, VoiceFragment } from "../../../supabase/functions/dexter-voice/contract"
import type { VoiceId } from "../../../supabase/functions/dexter-voice/contract"

export type VoicePreferences = { voice: VoiceId; remainingSeconds: number; dailySeconds: number; resetsAt: string }
export async function voiceRequest<T = VoicePreferences>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Voice is not connected to this workspace.")
  const { data, error } = await supabase.functions.invoke<T>("dexter-voice", { body })
  if (error) {
    const detail = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null
    throw new Error(detail?.message || "Voice is temporarily unavailable. You can continue typing.")
  }
  if (!data) throw new Error("Voice settings could not be loaded.")
  return data
}
