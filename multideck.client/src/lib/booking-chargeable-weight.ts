import type { BookingWorkflowCargo } from './booking-workflow-api'

export function bookingChargeableWeightError(value: BookingWorkflowCargo['chargeableWeightKg']) {
  return bookingChargeableWeightSummary([{ chargeableWeightKg: value }]).invalid
    ? 'Enter a non-negative decimal up to 999999999999, or leave blank when unknown.' : ''
}

/** Exact operational line subtotal. Missing/invalid lines never count as zero. */
export function bookingChargeableWeightSummary(lines: readonly BookingWorkflowCargo[]) {
  let missing = 0
  let invalid = 0
  const values: string[] = []
  for (const line of lines) {
    const raw = line.chargeableWeightKg
    if (raw == null || String(raw).trim() === '') { missing++; continue }
    const text = String(raw).trim()
    if (text.length > 64 || !/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?$/.test(text)) { invalid++; continue }
    const normalized = text.replaceAll(',', '')
    const [whole, fraction = ''] = normalized.split('.')
    if (BigInt(whole + fraction) > 999999999999n * 10n ** BigInt(fraction.length)) { invalid++; continue }
    values.push(normalized)
  }
  const precision = Math.max(0, ...values.map(value => value.split('.')[1]?.length ?? 0))
  const digits = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.')
    return sum + BigInt(whole + fraction.padEnd(precision, '0'))
  }, 0n).toString().padStart(precision + 1, '0')
  const subtotal = !values.length ? null : precision
    ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}`.replace(/\.?0+$/, '')
    : digits
  return { subtotal, missing, invalid, recorded: values.length, complete: lines.length > 0 && !missing && !invalid }
}
