import type { BookingCargoAllocation, BookingWorkflowCargo, BookingWorkflowContainer, BookingWorkflowRoute, BookingWorkflowWorkspace } from './booking-workflow-api'

export const allocationMeasures = [
  ['packageQuantity', 'Packages / pieces', 6], ['grossWeightKg', 'Gross weight (kg)', 2], ['volumeCbm', 'Volume (CBM)', 6],
] as const
export type AllocationMeasure = typeof allocationMeasures[number][0]
export type AllocationIssue = { id: string; field: keyof BookingCargoAllocation; message: string }
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

/** Fixed-scale integers avoid rounding cargo quantities through JS Number. */
function decimal(value: unknown, scale: number, allowGrouping = false): bigint | null | undefined {
  if (value == null || String(value).trim() === '') return null
  let text = String(value).trim()
  if (allowGrouping && /^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$/.test(text)) text = text.replaceAll(',', '')
  if (text.length > 64 || !/^[0-9]+(\.[0-9]+)?$/.test(text)) return undefined
  const [whole, fraction = ''] = text.split('.')
  if (/[1-9]/.test(fraction.slice(scale))) return undefined
  const amount = BigInt(whole + fraction.slice(0, scale).padEnd(scale, '0'))
  return amount < 10n ** 18n ? amount : undefined
}
function decimalText(value: bigint, scale: number) {
  const absolute = (value < 0n ? -value : value).toString().padStart(scale + 1, '0')
  const text = `${absolute.slice(0, -scale)}.${absolute.slice(-scale)}`.replace(/\.?0+$/, '')
  return `${value < 0n ? '-' : ''}${text}`
}
function cargoMeasure(cargo: BookingWorkflowCargo, field: AllocationMeasure) {
  return field === 'packageQuantity' && (cargo.packageQuantity == null || String(cargo.packageQuantity).trim() === '')
    ? cargo.pieces : cargo[field]
}

export function newBookingCargoAllocation(): BookingCargoAllocation {
  return { id: crypto.randomUUID(), cargoId: '', containerId: '', routeId: null,
    packageQuantity: null, grossWeightKg: null, volumeCbm: null, notes: null, archived: false }
}

export function analyseCargoAllocations(cargo: readonly BookingWorkflowCargo[], equipment: readonly BookingWorkflowContainer[], routes: readonly BookingWorkflowRoute[], lines: readonly BookingCargoAllocation[]) {
  const issues: AllocationIssue[] = []
  const groups = new Map<string, BookingCargoAllocation[]>()
  const ids = new Set<string>(); const slots = new Set<string>()
  for (const line of lines) {
    const problem = (field: keyof BookingCargoAllocation, message: string) => issues.push({ id: line.id, field, message })
    if (!uuid.test(line.id) || ids.has(line.id.toLowerCase()) || line.archived) problem('cargoId', 'This allocation identity is unavailable. Reload the Booking.')
    ids.add(line.id.toLowerCase())
    if (!cargo.some(item => item.id && item.id === line.cargoId)) problem('cargoId', 'Choose a saved cargo line from this Booking.')
    if (!equipment.some(item => item.id && item.id === line.containerId)) problem('containerId', 'Choose saved equipment from this Booking.')
    if (line.routeId && !routes.some(item => item.id === line.routeId)) problem('routeId', 'Choose a saved routing leg from this Booking.')
    const slot = `${line.cargoId}:${line.containerId}:${line.routeId ?? ''}`
    if (slots.has(slot)) problem('containerId', 'This cargo and equipment already have an allocation for this routing scope.')
    slots.add(slot)
    for (const [field, label, scale] of allocationMeasures) {
      if (decimal(line[field], scale) === undefined) problem(field, `${label}: enter a non-negative decimal with up to ${18 - scale} whole digits and ${scale} decimal places.`)
    }
    if (Array.from(line.notes ?? '').length > 2000) problem('notes', 'Use 2000 characters or fewer for allocation notes.')
    const key = `${line.cargoId}:${line.routeId ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), line])
  }
  if (lines.length > 1000) issues.push({ id: lines[1000].id, field: 'cargoId', message: 'A Booking supports up to 1000 cargo allocations.' })
  const wholeJourneyCargo = new Set(lines.filter(line => !line.routeId).map(line => line.cargoId))
  for (const line of lines) {
    if (line.routeId && wholeJourneyCargo.has(line.cargoId)) issues.push({ id: line.id, field: 'routeId', message: 'Use either whole-journey or individual-leg allocations for this cargo line, not both.' })
  }
  const balances = [...groups.values()].flatMap(group => {
    const goods = cargo.find(item => item.id === group[0].cargoId)
    if (!goods) return []
    const remaining = {} as Record<AllocationMeasure, string | null>
    for (const [field, label, scale] of allocationMeasures) {
      const total = decimal(cargoMeasure(goods, field), scale, true)
      const values = group.map(line => decimal(line[field], scale))
      const assigned = values.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
      if (total != null && assigned > total) {
        issues.push({ id: group[0].id, field, message: `${label}: the allocations exceed this cargo line's recorded total.` })
      }
      remaining[field] = total == null || values.some(value => value == null) ? null : decimalText(total - assigned, scale)
    }
    return [{ cargoId: group[0].cargoId, routeId: group[0].routeId, remaining }]
  })
  return { issues, balances }
}

/** Explicit operator convenience, never inferred from container totals or VGM. */
export function remainingForAllocation(cargo: readonly BookingWorkflowCargo[], lines: readonly BookingCargoAllocation[], target: BookingCargoAllocation) {
  const goods = cargo.find(item => item.id === target.cargoId)
  const remaining: Partial<Record<AllocationMeasure, string>> = {}
  for (const [field, , scale] of allocationMeasures) {
    const total = goods ? decimal(cargoMeasure(goods, field), scale, true) : null
    const values = lines.filter(line => line.id !== target.id && line.cargoId === target.cargoId && line.routeId === target.routeId).map(line => decimal(line[field], scale))
    const assigned = values.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
    if (total != null && !values.some(value => value == null) && assigned <= total) remaining[field] = decimalText(total - assigned, scale)
  }
  return remaining
}

/** Omitted capability != empty list. Only submit a plan the operator could read. */
export function bookingCargoAllocationPayload(workspace: BookingWorkflowWorkspace, baseline: BookingWorkflowWorkspace) {
  const current = workspace.cargoAllocationState; const saved = baseline.cargoAllocationState
  if (!current) return {}
  if (!saved || current.jobId !== baseline.booking.jobId || workspace.booking.jobId !== baseline.booking.jobId) throw new Error('Reload this Booking before editing cargo allocations.')
  const project = (lines: BookingCargoAllocation[]) => lines.map(({ archived: _archived, ...line }) => line)
  const lines = project(current.allocations)
  if (!lines.length && JSON.stringify(lines) === JSON.stringify(project(saved.allocations))) return {}
  return { cargoAllocations: lines, expectedUpdatedAt: baseline.booking.updatedAt }
}
