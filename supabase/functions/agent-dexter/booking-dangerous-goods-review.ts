type RecordValue = Record<string, unknown>
const labels: Record<string, string> = { unNumber: 'UN number', properShippingName: 'Proper shipping name', class: 'Class',
  packingGroup: 'Packing group', flashPoint: 'Flash point', marinePollutant: 'Marine pollutant', limitedQuantity: 'Limited quantity',
  emergencyContact: 'Emergency contact', notes: 'Notes', sourceReference: 'Source reference', status: 'Status' }
const limits: Record<string, number> = { unNumber: 10, properShippingName: 240, class: 20, packingGroup: 20,
  flashPoint: 40, emergencyContact: 180, notes: 8000, sourceReference: 500, status: 20 }
function display(value: unknown, field: string): string | null {
  if (value === null) return null
  if (field === 'marinePollutant' || field === 'limitedQuantity') {
    if (typeof value !== 'boolean') throw new Error('Use Yes, No or Not recorded for supplied dangerous-goods flags.')
    return value ? 'Yes' : 'No'
  }
  if (typeof value !== 'string' || value.trim().length > limits[field]) throw new Error('Provide supported supplied text or an explicit clear.')
  if (field === 'status' && !['recorded', 'voided'].includes(value.trim())) throw new Error('Use Recorded or Voided, not a compliance approval.')
  return value.trim() || null
}

/** Review only this request's permission-checked source reads. The approved
 * executor rechecks identity, ownership, timestamps and supplied values. */
export function bookingDangerousGoodsActionReview(records: Map<string, RecordValue>, args: RecordValue) {
  const isNew = args.record_id === null
  const record = records.get(String(isNew ? args.cargo_id : args.record_id))
  if (!record || record.sourceTable !== (isNew ? 'Job_Cargo' : 'Job_CargoDangerousGoods')
    || record.recordId !== (isNew ? args.cargo_id : args.record_id) || record.bookingId !== args.target_id
    || typeof record.bookingReference !== 'string' || !record.bookingReference.trim()
    || !Number.isInteger(record.lineNumber) || Number(record.lineNumber) < 1
    || typeof args.expected_updated_at !== 'string' || !args.expected_updated_at
    || typeof args.expected_cargo_updated_at !== 'string' || !args.expected_cargo_updated_at
    || (isNew ? record.updatedAt : record.bookingUpdatedAt) !== args.expected_updated_at
    || record.cargoUpdatedAt !== args.expected_cargo_updated_at) {
    throw new Error('Read the exact current Booking cargo and dangerous-goods evidence before requesting approval.')
  }
  if (isNew ? args.expected_record_updated_at !== null || record.archived !== false
    : record.cargoId !== args.cargo_id || record.operatorEditable !== true || record.source !== 'operator'
      || typeof args.expected_record_updated_at !== 'string' || !args.expected_record_updated_at
      || record.updatedAt !== args.expected_record_updated_at) {
    throw new Error('Legacy, retired and voided evidence cannot be rewritten. Read an active operator record or create a new entry.')
  }
  if (!Array.isArray(args.changes) || args.changes.length < 1 || args.changes.length > 11
    || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 2000) {
    throw new Error('Provide explicit dangerous-goods changes and a reason.')
  }
  const seen = new Set<string>(), next: RecordValue = isNew ? { status: 'recorded' } : { ...record }
  const changes = args.changes.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Choose a field and supplied value.')
    const item = entry as RecordValue, field = typeof item.field === 'string' ? item.field : ''
    if (!Object.hasOwn(labels, field) || seen.has(field) || !Object.hasOwn(item, 'value')
      || Object.keys(item).some(key => !['field', 'value'].includes(key)) || (!isNew && !Object.hasOwn(record, field))) {
      throw new Error('Each available dangerous-goods field needs one change with known before evidence.')
    }
    seen.add(field)
    const before = isNew ? null : display(record[field], field), after = display(item.value, field)
    next[field] = typeof item.value === 'string' ? item.value.trim() || null : item.value
    if (field === 'status' && after === null) throw new Error('Status cannot be cleared.')
    return { field: labels[field], before, after, value: after, beforeKnown: true,
      kind: after === null ? 'removed' : before === null ? 'added' : 'changed' }
  })
  if (!next.sourceReference || (!next.unNumber && !next.properShippingName && !next.class)) {
    throw new Error('Include a source reference and at least one supplied UN number, shipping name or class.')
  }
  if (next.status === 'voided' && (isNew || seen.size !== 1 || !seen.has('status'))) {
    throw new Error('Void an existing record without changing its supplied values.')
  }
  const target = `${record.bookingReference} · Cargo ${record.lineNumber} · Dangerous-goods evidence`
  return { title: `${isNew ? 'Record' : next.status === 'voided' ? 'Void' : 'Correct'} ${target}`,
    description: `Review supplied evidence only—not classification, completeness or transport approval. Unknown is not No. `
      + `Only the listed fields change; the cargo hazardous flag and customer Quotes stay unchanged. History is retained. Reason: ${args.reason.trim().slice(0, 500)}`,
    changes }
}
