import type { DexterActionChange } from './dexter-api'

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const key = (value: string) => value.replace(/[ _-]/g, '').toLowerCase()
const labels: Record<string, string> = {
  title: 'Next action', type: 'Action type', ownerId: 'Assigned to', dueAt: 'Due', taskDate: 'Task date',
  primaryContactId: 'Main contact', actionId: 'Current action', pipelineStageId: 'Stage', reasonCode: 'Loss reason',
  note: 'Outcome', details: 'Details', competitor: 'Competitor', revisitDate: 'Revisit date', reason: 'Reason',
}
const values: Record<string, string> = {
  follow_up: 'Follow up', call: 'Call', email: 'Email', meeting: 'Meeting', quote: 'Quote', other: 'Other',
  set_next_action: 'Set next action', complete_next_action: 'Complete next action', assign: 'Update assignments',
  mark_lost: 'Mark deal lost', reopen: 'Reopen deal', no_response: 'No response', service_fit: 'Service fit',
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validCalendarDate = (value: string) => {
  const day = value.slice(0, 10)
  const timestamp = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day
}
const humanLabel = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase())

/** A saved approval is evidence, not a source of guessed names or previous values. */
export function presentDexterApproval(changes: unknown) {
  const result: DexterActionChange[] = []
  let incomplete = !Array.isArray(changes)
  const entries = Array.isArray(changes) ? changes : []
  const scalar = (value: unknown, field: string): string | null => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return String(value)
      incomplete = true; return 'Value unavailable'
    }
    if (typeof value !== 'string') { incomplete = true; return 'Details unavailable' }
    if (/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) && (!validCalendarDate(value) || !Number.isFinite(Date.parse(value)))) { incomplete = true; return 'Date unavailable — prepare this change again' }
    if (uuid.test(value)) { incomplete = true; return 'Name unavailable — prepare this change again' }
    return ['type', 'operation', 'reasonCode'].includes(field) ? values[value] ?? humanLabel(value) : value
  }
  const expand = (field: string, before: unknown, after: unknown, beforeKnown: boolean, depth = 0, kind?: DexterActionChange["kind"]) => {
    if (depth > 4 || result.length >= 60) { incomplete = true; return }
    if (record(after) || record(before)) {
      const previous = record(before) ? before : {}
      const next = record(after) ? after : {}
      for (const child of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        expand(field === 'Input' ? child : `${field} · ${humanLabel(child)}`, previous[child], next[child], beforeKnown, depth + 1)
      }
      return
    }
    if (Array.isArray(after) || Array.isArray(before)) {
      const previous = Array.isArray(before) ? before : []
      const next = Array.isArray(after) ? after : []
      for (let index = 0; index < Math.max(previous.length, next.length); index++) expand(`${field} ${index + 1}`, previous[index], next[index], beforeKnown, depth + 1)
      return
    }
    const oldValue = scalar(before, field), newValue = scalar(after, field)
    result.push({field: field === 'operation' ? 'Change' : depth > 0 ? labels[field] ?? humanLabel(field) : humanLabel(field), value: newValue ?? '', before: oldValue, after: newValue, beforeKnown,
      kind: kind ?? (beforeKnown && newValue === null ? 'removed' : beforeKnown && oldValue === null ? 'added' : 'changed')})
  }
  for (const change of entries) {
    if (!record(change) || typeof change.field !== "string" || !change.field.trim()) { incomplete = true; continue }
    const fieldKey = key(change.field)
    if (['expectedversion', 'expectedsnapshothash', 'expectedupdatedat'].includes(fieldKey)) continue
    const decode = (value: unknown): unknown => {
      if (typeof value !== 'string' || !/^[\s]*[\[{]/.test(value)) return value
      try { return JSON.parse(value) } catch {
        if (fieldKey !== 'input') return value
        incomplete = true; return 'Details unavailable'
      }
    }
    const after = change.after !== undefined ? change.after : change.value
    expand(fieldKey === 'input' ? 'Input' : fieldKey === 'operation' ? 'operation' : change.field,
      decode(change.before), decode(after), typeof change.beforeKnown === "boolean" ? change.beforeKnown : change.before !== undefined, 0,
      change.kind === "added" || change.kind === "removed" || change.kind === "changed" ? change.kind : undefined)
  }
  return { changes: result, issue: incomplete || (entries.length > 0 && !result.length)
    ? 'This saved proposal is missing readable details. Ask Dexter to prepare the change again before approving it.' : null }
}

export function formatDexterApprovalValue(value: string | null | undefined, language: string) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) && !validCalendarDate(value)) return value
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) {
    return new Intl.DateTimeFormat(language, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'}).format(new Date(value))
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))) {
    return new Intl.DateTimeFormat(language, {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${value}T00:00:00Z`))
  }
  return value
}
