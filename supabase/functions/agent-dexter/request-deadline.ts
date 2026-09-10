/** Stop starting new work before the two-minute recovery lease expires. */
export function requestDeadline(now: () => number = Date.now, durationMs = 95_000) {
  const endsAt = now() + durationMs
  return () => Math.max(0, endsAt - now())
}
