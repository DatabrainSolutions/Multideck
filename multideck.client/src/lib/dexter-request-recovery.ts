/** Tab-local recovery references. The server rechecks ownership on every read. */
export type DexterRecovery = {
  runId: string
  clientSessionId: string
  conversationId: string | null
  prompt: string
  model: 'fast' | 'smart' | 'worker'
  createdAt: number
  composerText: string
  correction?: {id: string; input: string; runId: string}
}
const key = (owner: string) => `multideck:dexter:request:${owner}`
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
export function readDexterRecovery(owner: string): DexterRecovery | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(owner)) ?? 'null')
    if (!value || !uuid(value.runId) || !uuid(value.clientSessionId)
      || (value.conversationId !== null && !uuid(value.conversationId))
      || typeof value.prompt !== 'string' || value.prompt.length > 8000
      || typeof value.composerText !== 'string' || value.composerText.length > 8000
      || !['fast', 'smart', 'worker'].includes(value.model)
      || !Number.isFinite(value.createdAt) || Date.now() - value.createdAt > 86400000) return null
    if (value.correction && (!uuid(value.correction.id) || value.correction.runId !== value.runId
      || typeof value.correction.input !== 'string' || value.correction.input.length > 8000)) return null
    return value
  } catch { return null }
}
export function writeDexterRecovery(owner: string, value: DexterRecovery) {
  try { sessionStorage.setItem(key(owner), JSON.stringify(value)) } catch { /* Storage may be disabled. */ }
}
export function clearDexterRecovery(owner: string, runId: string) {
  if (readDexterRecovery(owner)?.runId !== runId) return
  try { sessionStorage.removeItem(key(owner)) } catch { /* Storage may be disabled. */ }
}
