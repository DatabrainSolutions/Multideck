/** One in-flight calculation per editor. A failed or superseded save must never
 * calculate the previously saved draft, and an uncertain POST is never retried. */
export function createCustomsCalculationRunner<T>(prepare: () => Promise<void>, calculate: () => Promise<T>) {
  let pending: Promise<T> | null = null
  return () => {
    if (pending) return pending
    const operation = Promise.resolve().then(prepare).then(calculate)
    pending = operation.finally(() => { pending = null })
    return pending
  }
}
