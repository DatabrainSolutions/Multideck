/** Discard history fetched across a confirmed calculation/override write.
 * Callers retain their displayed history and refresh warning on a null result.
 * Failed requests remain errors; this helper never retries a write or read. */
export async function readCalculationHistoryAtRevision<T>(request: () => Promise<T>, revision: () => number): Promise<T | null> {
  const startedAt = revision()
  const response = await request()
  return startedAt === revision() ? response : null
}
