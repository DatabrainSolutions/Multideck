import type { BookingDangerousGoods, BookingDangerousGoodsSave } from './booking-workflow-api'

export const dangerousGoodsFields = [
  { key: 'unNumber', label: 'UN number', max: 10 }, { key: 'properShippingName', label: 'Proper shipping name', max: 240 },
  { key: 'class', label: 'Class', max: 20 }, { key: 'packingGroup', label: 'Packing group', max: 20 },
  { key: 'flashPoint', label: 'Flash point as supplied, including unit', max: 40 },
  { key: 'marinePollutant', label: 'Marine pollutant', max: 0 }, { key: 'limitedQuantity', label: 'Limited quantity', max: 0 },
  { key: 'emergencyContact', label: 'Emergency contact', max: 180 },
  { key: 'sourceReference', label: 'Source reference', max: 500 }, { key: 'notes', label: 'Notes', max: 8000 },
] as const
export type DangerousGoodsField = typeof dangerousGoodsFields[number]['key']
export type DangerousGoodsDraft = Record<DangerousGoodsField | 'reason' | 'status', string>
export class DangerousGoodsInputError extends Error {
  constructor(public field: string, message: string) { super(message) }
}
export function dangerousGoodsDraft(original?: BookingDangerousGoods): DangerousGoodsDraft {
  const draft = { reason: '', status: original?.status ?? 'recorded' } as DangerousGoodsDraft
  for (const { key } of dangerousGoodsFields) {
    const value = original?.[key]
    draft[key] = typeof value === 'boolean' ? value ? 'yes' : 'no' : value ?? ''
  }
  return draft
}
export function dangerousGoodsChanges(draft: DangerousGoodsDraft, original?: BookingDangerousGoods): BookingDangerousGoodsSave['changes'] {
  if (!draft.reason.trim() || draft.reason.length > 2000) throw new DangerousGoodsInputError('reason', 'Enter a reason of up to 2,000 characters.')
  if (original && (!original.operatorEditable || original.source !== 'operator')) throw new Error('This retained evidence is read-only.')
  if (draft.status === 'voided') {
    if (!original) throw new DangerousGoodsInputError('status', 'Record evidence before voiding it.')
    return { status: 'voided' }
  }
  if (draft.status !== 'recorded') throw new DangerousGoodsInputError('status', 'Choose Recorded or Voided.')
  if (!draft.sourceReference.trim()) throw new DangerousGoodsInputError('sourceReference', 'Record where these supplied details came from.')
  if (!draft.unNumber.trim() && !draft.properShippingName.trim() && !draft.class.trim()) {
    throw new DangerousGoodsInputError('unNumber', 'Enter at least one supplied UN number, shipping name or class. Do not infer a classification.')
  }
  const changes: BookingDangerousGoodsSave['changes'] = {}
  const initial = dangerousGoodsDraft(original)
  for (const { key, label, max } of dangerousGoodsFields) {
    if (original && draft[key] === initial[key]) continue
    if (key === 'marinePollutant' || key === 'limitedQuantity') {
      if (!['', 'yes', 'no'].includes(draft[key])) throw new DangerousGoodsInputError(key, 'Choose Yes, No or Not recorded.')
      const value = draft[key] === '' ? null : draft[key] === 'yes'
      if (value !== (original?.[key] ?? null)) changes[key] = value
    } else {
      const value = draft[key].trim() || null
      if (value && value.length > max) throw new DangerousGoodsInputError(key, `${label} must be ${max} characters or fewer.`)
      if (value !== (original?.[key] ?? null)) changes[key] = value
    }
  }
  return changes
}
