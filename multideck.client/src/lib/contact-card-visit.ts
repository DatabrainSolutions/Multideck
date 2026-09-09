export type CardVisit = { requestId: string; sessionId: string }
type VisitStorage = Pick<Storage, "getItem" | "setItem">
const SESSION_LENGTH = 30 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** One request per page open; one anonymous session per card/tab until 30
 * minutes of inactivity. No fingerprint, cross-site identifier or localStorage. */
export function createCardVisit(slug: string, storage: VisitStorage | null, now = Date.now(), uuid: () => string = () => crypto.randomUUID()): CardVisit {
  const requestId = uuid()
  let sessionId = uuid()
  const key = `multideck:card-session:${slug}`
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null") as { id?: unknown; until?: unknown } | null
    if (saved && typeof saved.id === "string" && UUID.test(saved.id) && typeof saved.until === "number" && saved.until > now && saved.until <= now + SESSION_LENGTH) sessionId = saved.id
    storage?.setItem(key, JSON.stringify({ id: sessionId, until: now + SESSION_LENGTH }))
  } catch { /* Storage may be unavailable in private or embedded browsers. */ }
  return { requestId, sessionId }
}

export function browserCardVisit(slug: string) {
  let storage: VisitStorage | null = null
  try { storage = window.sessionStorage } catch { /* No persistence available. */ }
  return createCardVisit(slug, storage)
}
