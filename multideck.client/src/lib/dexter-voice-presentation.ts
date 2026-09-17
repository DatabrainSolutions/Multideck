/** Do not mistake a connection error or the workspace AI cap for the daily cap. */
export function hasReachedDailyVoiceLimit(voice: {
  phase: string
  active: boolean
  endReason: string | null
  allowance: {remainingSeconds: number} | null
}) {
  return voice.phase !== "idle" && (voice.endReason === "daily_limit"
    || (!voice.active && voice.allowance?.remainingSeconds === 0))
}
