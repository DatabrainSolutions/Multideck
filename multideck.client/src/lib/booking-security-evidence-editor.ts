import type { BookingSecurityEvidence, BookingSecurityEvidenceSave } from './booking-workflow-api'
import { changeRouteCutoff, routeCutoffInputValue } from './booking-route-cutoffs.ts'

export const securityEvidenceFields = [
  { key: 'securityStatus', label: 'Security status as supplied', max: 80 },
  { key: 'screeningMethod', label: 'Screening method as supplied', max: 80 },
  { key: 'screenedByName', label: 'Screened by as supplied', max: 180 },
  { key: 'agentReference', label: 'Agent reference as supplied', max: 80 },
  { key: 'screenedAt', label: 'Screened at (UTC)', max: 80 },
  { key: 'sourceReference', label: 'Source reference', max: 500 },
  { key: 'notes', label: 'Notes', max: 8000 },
] as const
export type SecurityEvidenceDraft = Record<typeof securityEvidenceFields[number]['key'] | 'reason' | 'recordStatus', string>
export class SecurityEvidenceInputError extends Error {
  constructor(public field: string, message: string) { super(message) }
}
export function securityEvidenceDraft(original?: BookingSecurityEvidence): SecurityEvidenceDraft {
  return { reason: '', recordStatus: original?.recordStatus ?? 'recorded',
    ...Object.fromEntries(securityEvidenceFields.map(({ key }) => [key,
      key === 'screenedAt' ? routeCutoffInputValue(original?.screenedAt) : original?.[key] ?? ''])) } as SecurityEvidenceDraft
}
export function securityEvidenceChanges(draft: SecurityEvidenceDraft, original?: BookingSecurityEvidence): BookingSecurityEvidenceSave['changes'] {
  if (!draft.reason.trim() || draft.reason.length > 2000) throw new SecurityEvidenceInputError('reason', 'Enter a reason of up to 2,000 characters.')
  if (original && (!original.operatorEditable || original.recordStatus === 'voided')) throw new Error('This retained evidence is read-only.')
  if (draft.recordStatus === 'voided') {
    if (!original) throw new SecurityEvidenceInputError('recordStatus', 'Record evidence before voiding it.')
    return { recordStatus: 'voided' }
  }
  if (draft.recordStatus !== 'recorded') throw new SecurityEvidenceInputError('recordStatus', 'Choose Recorded or Voided.')
  if (!draft.sourceReference.trim()) throw new SecurityEvidenceInputError('sourceReference', 'Record where these supplied details came from.')
  if (!draft.securityStatus.trim() && !draft.screeningMethod.trim() && !draft.screenedAt.trim()) {
    throw new SecurityEvidenceInputError('securityStatus', 'Enter at least one supplied status, method or screening time. Do not infer clearance.')
  }
  const changes: BookingSecurityEvidenceSave['changes'] = {}, initial = securityEvidenceDraft(original)
  for (const { key, label, max } of securityEvidenceFields) {
    if (draft[key] === initial[key]) continue
    let value: string | null
    try { value = key === 'screenedAt' ? changeRouteCutoff(original?.screenedAt, draft[key]) || null : draft[key].trim() ? draft[key] : null }
    catch { throw new SecurityEvidenceInputError(key, 'Enter a complete, valid date and time in UTC, or clear the field.') }
    if (value && value.length > max) throw new SecurityEvidenceInputError(key, `${label} must be ${max} characters or fewer.`)
    if (value !== (original?.[key] ?? null)) {
      if (key === 'sourceReference') changes.sourceReference = draft.sourceReference
      else changes[key] = value
    }
  }
  return changes
}
