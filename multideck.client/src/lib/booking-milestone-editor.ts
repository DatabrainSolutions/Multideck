import type { BookingMilestoneSave, BookingMilestoneStatus, BookingWorkflowMilestone } from './booking-workflow-api'
import { changeRouteCutoff, routeCutoffInputValue } from './booking-route-cutoffs.ts'
import { routeScheduleParts } from './booking-route-schedule.ts'

export const milestoneFields = [
  { key: 'plannedAt', label: 'Planned time', time: true, limit: 80 },
  { key: 'estimatedAt', label: 'Estimated time', time: true, limit: 80 },
  { key: 'actualAt', label: 'Actual time', time: true, limit: 80 },
  { key: 'location', label: 'Location', time: false, limit: 180 },
  { key: 'locationUnlocode', label: 'Location code', time: false, limit: 10 },
  { key: 'externalReference', label: 'External reference', time: false, limit: 180 },
  { key: 'notes', label: 'Notes', time: false, limit: 8000 },
] as const
export const milestoneStatuses: BookingMilestoneStatus[] = ['planned', 'completed', 'exception', 'voided']
export type MilestoneDraft = Record<(typeof milestoneFields)[number]['key'] | 'type' | 'status' | 'reason', string>
export class MilestoneInputError extends Error {
  field: string
  constructor(field: string, message: string) { super(message); this.field = field }
}
export function milestoneDraft(item?: BookingWorkflowMilestone): MilestoneDraft {
  return { type: item?.type ?? '', status: item?.status ?? 'planned', reason: '',
    ...Object.fromEntries(milestoneFields.map(({ key, time }) => [key, time ? routeCutoffInputValue(item?.[key]) : item?.[key] ?? ''])) } as MilestoneDraft
}
export function milestoneTimeLabel(value: string | null, locale: 'en-GB' | 'en-US') {
  if (!value) return 'Not recorded'
  const parts = routeScheduleParts(value)
  if (parts.invalid || !parts.time) return `Saved value needs review: ${value}`
  return `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(parts.timestamp))} at ${parts.timestamp.slice(11, -1)} UTC`
}
export function milestoneChanges(draft: MilestoneDraft, types: readonly { code: string }[], original?: BookingWorkflowMilestone, mode?: string | null): BookingMilestoneSave['changes'] {
  if (!original && (!types.some(type => type.code === draft.type) || draft.type === 'customs_released')) throw new MilestoneInputError('type', 'Choose an active operational milestone.')
  if (!milestoneStatuses.includes(draft.status as BookingMilestoneStatus) || (!original && draft.status === 'voided')) throw new MilestoneInputError('status', 'Choose a valid milestone status.')
  if (!draft.reason.trim() || draft.reason.length > 2000) throw new MilestoneInputError('reason', 'Explain why this milestone is being recorded or corrected.')
  if (original && (!original.operatorEditable || original.status === 'voided' || original.type !== draft.type)) throw new MilestoneInputError('status', 'This saved milestone is read-only.')
  const changes: BookingMilestoneSave['changes'] = {}
  const initial = milestoneDraft(original)
  if (original?.status !== draft.status) changes.status = draft.status as BookingMilestoneStatus
  for (const { key, time, limit } of milestoneFields) {
    // Omitted fields are evidence, not an invitation to normalise saved text or precision.
    if (draft[key] === initial[key]) continue
    if (time && original?.[key] && routeScheduleParts(original[key]).invalid) throw new MilestoneInputError(key, 'The saved time needs review before it can be changed.')
    let value: string | null
    try { value = time ? changeRouteCutoff(original?.[key], draft[key]) || null : draft[key].trim() || null }
    catch { throw new MilestoneInputError(key, 'Enter a complete, valid date and time in UTC, or clear the field.') }
    if (value && value.length > limit) throw new MilestoneInputError(key, 'This value is too long.')
    if (key === 'locationUnlocode') value = value?.toUpperCase() ?? null
    if (value !== (original?.[key] ?? null)) changes[key] = value
  }
  const actual = Object.hasOwn(changes, 'actualAt') ? changes.actualAt : original?.actualAt
  if (draft.status === 'completed' && (!actual || routeScheduleParts(actual).invalid || !routeScheduleParts(actual).time)) throw new MilestoneInputError('actualAt', 'A completed milestone needs its actual event time.')
  if (original && original.recordedMode !== mode && (Object.keys(changes).length !== 1 || changes.status !== 'voided')) throw new MilestoneInputError('status', 'The leg mode changed. You can retain or void this old evidence, not repurpose it.')
  return changes
}

/** Only known operational fields belong in this inline audit view. */
export function milestoneHistoryChanges(metadata?: Record<string, unknown> | null) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const before = record(metadata?.before), after = record(metadata?.after)
  return [...milestoneFields, { key: 'status', label: 'Status', time: false }].flatMap(field => {
    const old = before[field.key], next = after[field.key]
    if (!Object.hasOwn(after, field.key) || old === next || (old == null && next == null) || (old != null && typeof old !== 'string') || (next != null && typeof next !== 'string')) return []
    return [{ ...field, before: old as string | null | undefined, after: next as string | null | undefined }]
  })
}
