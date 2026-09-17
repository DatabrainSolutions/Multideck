import { selectTariffExchangeRate, TARIFF_EXCHANGE_RATE_SOURCE } from "./customs-tariff-exchange-rate.mts"

/** Fixed official source, bounded response and immutable-ready evidence.
 * Persist the returned snapshot with a calculation, not just the chosen rate.
 * No fallback to invoice FX or a stale cached month is permitted. */
export async function fetchTariffExchangeReference(calculationDate: string) {
  const response = await fetch(TARIFF_EXCHANGE_RATE_SOURCE, {
    redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
  })
  if (!response.ok || !response.body) throw new Error("The official tariff conversion publication is unavailable.")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1_000_000) throw new Error("The tariff conversion publication exceeds the supported size.")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const publicationJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  let payload: unknown
  try { payload = JSON.parse(publicationJson) } catch { throw new Error("The official tariff conversion publication is not valid JSON.") }
  const selectedRate = selectTariffExchangeRate(payload, calculationDate)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return {
    source: TARIFF_EXCHANGE_RATE_SOURCE, retrievedAt: new Date().toISOString(),
    contentSha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join(""),
    publicationJson, selectedRate,
  }
}
