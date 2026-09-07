type RecordValue = Record<string, unknown>
const labels: Record<string, string> = {
  securityStatus: 'Security status as supplied', screeningMethod: 'Screening method as supplied',
  screenedByName: 'Screened by as supplied', agentReference: 'Agent reference as supplied',
  screenedAt: 'Screened at', sourceReference: 'Source reference', notes: 'Notes', recordStatus: 'Record status',
}
const limits: Record<string, number> = { securityStatus: 80, screeningMethod: 80, screenedByName: 180,
  agentReference: 80, screenedAt: 80, sourceReference: 500, notes: 8000, recordStatus: 20 }
function supplied(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > limits[field]) throw new Error('Provide supported supplied text or an explicit clear.')
  if (field === 'recordStatus' && !['recorded', 'voided'].includes(value)) throw new Error('Choose Recorded or Voided, not a clearance decision.')
  // Preserve nonblank source strings, including whitespace and punctuation.
  return value.trim() ? value : null
}

/** Consumes only this request's permission-checked reads. The executor must
 * independently recheck access, all timestamps and canonical field validation. */
export function bookingSecurityEvidenceActionReview(records: Map<string, RecordValue>, args: RecordValue) {
  const isNew = args.record_id === null
  const record = records.get(String(isNew ? args.cargo_id : args.record_id))
  if (!record || record.sourceTable !== (isNew ? 'Job_Cargo' : 'booking_api.cargo_security_evidence')
    || record.recordId !== (isNew ? args.cargo_id : args.record_id) || record.bookingId !== args.target_id
    || typeof record.bookingReference !== 'string' || !record.bookingReference.trim()
    || !Number.isInteger(record.lineNumber) || Number(record.lineNumber) < 1
    || typeof args.expected_updated_at !== 'string' || !args.expected_updated_at
    || typeof args.expected_cargo_updated_at !== 'string' || !args.expected_cargo_updated_at
    || (isNew ? record.updatedAt : record.bookingUpdatedAt) !== args.expected_updated_at
    || record.cargoUpdatedAt !== args.expected_cargo_updated_at) {
    throw new Error('Read the exact current Booking cargo and screening evidence before requesting approval.')
  }
  if (isNew ? args.expected_record_updated_at !== null || record.archived !== false
    : record.cargoId !== args.cargo_id || record.operatorEditable !== true || record.source !== 'operator'
      || record.recordStatus !== 'recorded' || typeof args.expected_record_updated_at !== 'string'
      || !args.expected_record_updated_at || record.updatedAt !== args.expected_record_updated_at) {
    throw new Error('Retired or voided screening evidence cannot be rewritten. Read an active record or create a new entry.')
  }
  if (!Array.isArray(args.changes) || args.changes.length < 1 || args.changes.length > 8
    || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 2000) {
    throw new Error('Provide explicit screening evidence changes and a reason.')
  }
  const seen = new Set<string>(), next: RecordValue = isNew ? { recordStatus: 'recorded' } : { ...record }
  const changes = args.changes.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Choose a field and supplied value.')
    const item = entry as RecordValue, field = typeof item.field === 'string' ? item.field : ''
    if (!Object.hasOwn(labels, field) || seen.has(field) || !Object.hasOwn(item, 'value')
      || Object.keys(item).some(key => !['field', 'value'].includes(key)) || (!isNew && !Object.hasOwn(record, field))) {
      throw new Error('Each available screening field needs one change with known before evidence.')
    }
    seen.add(field)
    const before = isNew ? null : supplied(record[field], field), after = supplied(item.value, field)
    next[field] = after
    if (field === 'recordStatus' && after === null) throw new Error('Record status cannot be cleared.')
    return { field: labels[field], before, after, value: after, beforeKnown: true,
      kind: after === null ? 'removed' : before === null ? 'added' : 'changed' }
  })
  if (!next.sourceReference || (!next.securityStatus && !next.screeningMethod && !next.screenedAt)) {
    throw new Error('Include a source reference and at least one supplied status, method or screening time.')
  }
  if (next.recordStatus === 'voided' && (isNew || seen.size !== 1 || !seen.has('recordStatus'))) {
    throw new Error('Void an existing record without changing its supplied values.')
  }
  return { title: `${isNew ? 'Record' : next.recordStatus === 'voided' ? 'Void' : 'Correct'} ${record.bookingReference} · Cargo ${record.lineNumber} · Screening evidence`,
    description: 'Review supplied evidence only—not clearance, agent verification or an air waybill. Unknown stays not recorded. '
      + `Only the listed fields change; customer Quotes and issued documents stay unchanged. History is retained. Reason: ${args.reason}`,
    changes }
}
