type RecordValue = Record<string, unknown>
type Query = (search: string) => PromiseLike<{ data: unknown; error: unknown }>
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const isUuid = (value: string) => new RegExp(`^${uuid}$`, 'i').test(value)
const object = (value: unknown): value is RecordValue => Boolean(value && typeof value === 'object' && !Array.isArray(value))

/** Resolve through the signed-in operator's domain read, never a service-role
 * lookup or model-authored label. The create RPC still rechecks current access. */
export async function resolveBookingMilestoneWatchTarget(
  prompt: string,
  target: { id: string; search: string },
  query: Query,
): Promise<{ ok: true; targetId: string; targetLabel: string } | { ok: false; message: string }> {
  const namedIds = [...new Set([...prompt.matchAll(new RegExp(
    `\\b(?:milestone(?:\\s+(?:id|record))?|booking_milestones(?:\\s+record)?)\\s*[:#=]?\\s*["']?(${uuid})\\b`, 'gi',
  ))].map(match => match[1].toLowerCase()))]
  if (namedIds.length > 1) return { ok: false, message: 'Choose one exact milestone to watch.' }

  // A named operator ID wins over a compiler-generated descriptive search.
  // Without one, keep the existing human-reference lookup, but never create an
  // unverified or all-milestones watch from an empty/invalid target.
  const explicitId = namedIds[0]
  const search = explicitId || target.search.trim() || target.id.trim()
  if (!search) return { ok: false, message: 'Choose the exact saved milestone to watch.' }
  const expectedId = explicitId || (isUuid(search) ? search.toLowerCase() : '')
  const { data, error } = await query(search)
  if (error) return { ok: false, message: 'Dexter could not verify that milestone. Check your access and try again.' }
  const candidates = object(data) && Array.isArray(data.data) ? data.data.filter(object) : []
  if (candidates.length !== 1) return { ok: false, message: candidates.length > 1
    ? 'More than one milestone matches. Choose the exact milestone in the Booking before setting up this watch.'
    : 'That milestone could not be verified in your current workspace. Check the reference and your access.' }
  const record = candidates[0]
  const id = typeof record.recordId === 'string' ? record.recordId.toLowerCase() : ''
  if (!isUuid(id) || (expectedId && id !== expectedId) || record.sourceTable !== 'Job_RouteMilestones'
    || record.source !== 'operator' || record.operatorEditable !== true || record.type === 'customs_released'
    || typeof record.bookingReference !== 'string' || !record.bookingReference.trim()
    || !Number.isInteger(record.legNumber) || Number(record.legNumber) < 1
    || typeof record.name !== 'string' || !record.name.trim()) {
    return { ok: false, message: 'Choose an active operator-recorded milestone you can access in this workspace.' }
  }
  return { ok: true, targetId: id,
    targetLabel: `${record.bookingReference.trim()} · Leg ${record.legNumber} · ${record.name.trim()}` }
}
