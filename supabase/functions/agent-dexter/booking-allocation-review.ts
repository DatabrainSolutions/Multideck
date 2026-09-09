type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const rows = (value: unknown) => Array.isArray(value) ? value.filter(object) : []
const fields = ['cargoId', 'containerId', 'routeId', 'packageQuantity', 'grossWeightKg', 'volumeCbm', 'notes'] as const

/** Never borrow a Booking header or a truncated/different plan for approval. */
export function bookingAllocationActionRecord(records: Map<string, RecordValue>, args: RecordValue) {
  const record = [...records.values()].find(value => value.allocationScope === 'booking_plan' && value.complete === true
    && value.bookingId === args.target_id && value.updatedAt === args.expected_updated_at && value.reviewHash === args.expected_review_hash)
  if (!record || !Array.isArray(record.allocations)) throw new Error('Read the complete current Booking allocation plan before requesting approval.')
  return record
}

export function bookingAllocationActionChanges(args: RecordValue, current?: RecordValue) {
  const record = bookingAllocationActionRecord(new Map([['plan', current ?? {}]]), args)
  if (!Array.isArray(args.allocations) || args.allocations.length > 1000 || !args.allocations.every(object)) {
    throw new Error('Provide a complete allocation plan with at most 1000 rows.')
  }
  const before = rows(record.allocations), after = rows(args.allocations)
  if (new Set(after.map(line => line.id)).size !== after.length || after.some(line => typeof line.id !== 'string' || !line.id)) {
    throw new Error('Every allocation needs its own stable identity.')
  }
  const label = (collection: unknown, id: unknown, keys: string[]) => {
    const item = rows(collection).find(value => value.id === id)
    return item ? keys.map(key => item[key]).filter(value => value != null && value !== '').join(' · ') || String(id) : String(id ?? 'Not selected')
  }
  const summary = (line: RecordValue) => [
    `Cargo: ${label(record.cargo, line.cargoId, ['description'])} (${line.cargoId})`,
    `Equipment: ${label(record.equipment, line.containerId, ['number', 'type'])} (${line.containerId})`,
    line.routeId ? `Leg: ${label(record.routes, line.routeId, ['order', 'mode'])} (${line.routeId})` : 'Whole journey',
    ...(['packageQuantity', 'grossWeightKg', 'volumeCbm'] as const).map((field, index) => `${['Packages / pieces', 'Gross weight (kg)', 'Volume (CBM)'][index]}: ${line[field] == null || line[field] === '' ? 'Unknown' : String(line[field])}`),
    `Notes: ${line.notes == null || line.notes === '' ? 'None' : String(line.notes)}`,
  ].join(' · ')
  const ids = [...new Set([...before, ...after].map(line => String(line.id)))]
  return ids.flatMap(id => {
    const old = before.find(line => line.id === id), next = after.find(line => line.id === id)
    if (old && next && fields.every(field => (old[field] ?? null) === (next[field] ?? null))) return []
    const oldText = old ? summary(old) : null, newText = next ? summary(next) : null
    return [{ field: `Allocation ${id}`, before: oldText, after: newText, value: newText, beforeKnown: true,
      kind: !next ? 'removed' : !old ? 'added' : 'changed' }]
  })
}
