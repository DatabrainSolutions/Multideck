type RecordValue = Record<string, unknown>
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const object = (value: unknown): value is RecordValue => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export async function resolveBookingDangerousGoodsWatchTarget(prompt: string, target: { id: string; search: string },
  query: (search: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ ok: true; targetId: string; targetLabel: string } | { ok: false; message: string }> {
  const named = [...new Set([...prompt.matchAll(new RegExp(
    `\\b(?:dangerous[- ]goods(?:\\s+(?:id|record))?|booking_dangerous_goods(?:\\s+record)?)\\s*[:#=]?\\s*["']?(${uuid})\\b`, 'gi',
  ))].map(match => match[1].toLowerCase()))]
  if (named.length > 1) return { ok: false, message: 'Choose one exact dangerous-goods record to watch.' }
  const search = named[0] || target.search.trim() || target.id.trim()
  if (!search) return { ok: false, message: 'Choose the exact saved dangerous-goods record to watch.' }
  const expected = named[0] || (new RegExp(`^${uuid}$`, 'i').test(search) ? search.toLowerCase() : '')
  const { data, error } = await query(search)
  const rows = object(data) && Array.isArray(data.data) ? data.data.filter(object) : []
  if (error || rows.length !== 1) return { ok: false, message: 'Choose one exact dangerous-goods record that can be verified in your workspace.' }
  const record = rows[0], id = typeof record.recordId === 'string' ? record.recordId.toLowerCase() : ''
  if (!new RegExp(`^${uuid}$`, 'i').test(id) || (expected && id !== expected)
    || record.sourceTable !== 'Job_CargoDangerousGoods' || record.source !== 'operator' || record.operatorEditable !== true
    || typeof record.targetLabel !== 'string' || !record.targetLabel.trim()) {
    return { ok: false, message: 'Choose an active operator-recorded dangerous-goods entry you can access.' }
  }
  return { ok: true, targetId: id, targetLabel: record.targetLabel }
}
