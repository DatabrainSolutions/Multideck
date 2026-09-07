type RecordValue = Record<string, unknown>
type Locale = 'en-GB' | 'en-US'
const labels: Record<string, string> = { status: 'Status', plannedAt: 'Planned time', estimatedAt: 'Estimated time',
  actualAt: 'Actual time', locationUnlocode: 'Location code', location: 'Location', externalReference: 'External reference', notes: 'Notes' }

function display(value: unknown, field: string, locale: Locale): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error('Use text or an explicit clear for milestone values.')
  const text = value.trim()
  if (!text) return null
  if (!field.endsWith('At')) {
    if (field === 'status') {
      if (!['planned', 'completed', 'exception', 'voided'].includes(text)) throw new Error('Choose an available milestone status.')
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
    if (text.length > (field === 'notes' ? 8000 : field === 'locationUnlocode' ? 10 : 180)) throw new Error('That milestone value is too long.')
    return field === 'locationUnlocode' ? text.toUpperCase() : text
  }
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d(?:\.\d{1,6})?)?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.exec(text)
  const date = match ? new Date(`${match[1]}T12:00:00Z`) : null
  if (!match || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] || match[1].startsWith('0000')) {
    throw new Error('A milestone needs a valid date, time and explicit timezone. Do not infer midnight.')
  }
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  const zone = ['Z', '+00:00', '-00:00'].includes(match[5]) ? 'UTC' : `UTC${match[5]}`
  return `${day} at ${match[2]}:${match[3]}${match[4] ?? ''} ${zone}`
}

/** Use only this request's permission-checked reads. The executor independently
 * validates the same identities and timestamps after explicit approval. */
export function bookingMilestoneActionReview(records: Map<string, RecordValue>, args: RecordValue, locale: Locale) {
  const isNew = args.milestone_id === null
  const record = records.get(String(isNew ? args.route_id : args.milestone_id))
  const type = isNew ? records.get(String(args.type)) : record
  if (!record || !type || record.sourceTable !== (isNew ? 'Job_Routing' : 'Job_RouteMilestones')
    || record.recordId !== (isNew ? args.route_id : args.milestone_id) || record.bookingId !== args.target_id
    || typeof record.bookingReference !== 'string' || !record.bookingReference.trim()
    || !Number.isInteger(record.legNumber) || Number(record.legNumber) < 1 || typeof record.mode !== 'string' || !record.mode
    || typeof args.expected_updated_at !== 'string' || !args.expected_updated_at
    || typeof args.expected_route_updated_at !== 'string' || !args.expected_route_updated_at
    || (isNew ? record.updatedAt : record.bookingUpdatedAt) !== args.expected_updated_at
    || record.routeUpdatedAt !== args.expected_route_updated_at) {
    throw new Error('Read the exact current Booking leg and milestone evidence before requesting approval.')
  }
  if (isNew) {
    if (type.sourceTable !== 'sys_JobMilestoneTypes' || type.code !== args.type || typeof type.name !== 'string'
      || args.type === 'customs_released' || args.expected_milestone_updated_at !== null) {
      throw new Error('Read the active operational milestone choice before proposing a new record.')
    }
  } else if (record.routeId !== args.route_id || record.type !== args.type || record.operatorEditable !== true
    || record.source !== 'operator' || record.type === 'customs_released'
    || typeof args.expected_milestone_updated_at !== 'string' || !args.expected_milestone_updated_at
    || record.updatedAt !== args.expected_milestone_updated_at || typeof record.name !== 'string') {
    throw new Error('Read an exact editable operator milestone and its current timestamp.')
  }
  if (!Array.isArray(args.changes) || args.changes.length < 1 || args.changes.length > 8
    || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 2000) {
    throw new Error('Provide explicit milestone changes and a reason.')
  }
  const next: RecordValue = isNew ? { status: 'planned', actualAt: null } : { ...record }
  const seen = new Set<string>()
  const changes = args.changes.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Choose a milestone field and value.')
    const item = entry as RecordValue
    const field = typeof item.field === 'string' ? item.field : ''
    if (!Object.hasOwn(labels, field) || seen.has(field) || !Object.hasOwn(item, 'value')
      || Object.keys(item).some(key => !['field', 'value'].includes(key)) || (!isNew && !Object.hasOwn(record, field))) {
      throw new Error('Each available milestone field needs one explicit change with known before evidence.')
    }
    seen.add(field)
    const before = isNew ? null : display(record[field], field, locale)
    const after = display(item.value, field, locale)
    next[field] = typeof item.value === 'string' ? item.value.trim() || null : item.value
    if (field === 'status' && after === null) throw new Error('Milestone status cannot be cleared.')
    return { field: labels[field], before, after, value: after, beforeKnown: true,
      kind: after === null ? 'removed' : before === null ? 'added' : 'changed' }
  })
  if (next.status === 'completed' && !next.actualAt) throw new Error('Include the actual event time when marking a milestone Completed.')
  if (isNew && next.status === 'voided') throw new Error('Record a milestone before voiding it.')
  const oldMode = !isNew && record.recordedMode !== record.mode
  if (oldMode && !(seen.size === 1 && seen.has('status') && next.status === 'voided')) {
    throw new Error('The leg mode changed. Retain or void old evidence; do not repurpose it.')
  }
  if (isNew) {
    changes.unshift({ field: 'Milestone', before: null, after: String(type.name), value: String(type.name), beforeKnown: true, kind: 'added' })
    if (!seen.has('status')) changes.push({ field: 'Status', before: null, after: 'Planned', value: 'Planned', beforeKnown: true, kind: 'added' })
  }
  const mode = record.mode.charAt(0).toUpperCase() + record.mode.slice(1)
  const target = `${record.bookingReference} · Leg ${record.legNumber} · ${mode} · ${type.name}`
  return {
    title: `${isNew ? 'Record' : 'Correct'} ${target}`,
    description: `Review ${target}, an operator-recorded milestone. Only the listed fields change; planned, estimated and actual times remain independent. `
      + `The accepted Quote, route dates and other milestones remain unchanged. Corrections retain audit history. `
      + (oldMode ? `This evidence was recorded under ${String(record.recordedMode ?? 'an unknown mode')}; voiding retains it. ` : '')
      + `Reason: ${args.reason.trim().slice(0, 500)}`,
    changes,
  }
}
