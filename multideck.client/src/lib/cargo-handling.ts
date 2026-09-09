export const handlingKinds = ['hazardous', 'temperatureControlled', 'oversized', 'fragile', 'foodGrade'] as const
export type HandlingKind = typeof handlingKinds[number]
export type HandlingDetail = { tbc: boolean; details: Record<string, string> }
export type CargoHandling = Partial<Record<HandlingKind, HandlingDetail>>
export const handlingLabels: Record<HandlingKind, string> = {
  hazardous: 'Hazardous', temperatureControlled: 'Temperature controlled', oversized: 'Oversized', fragile: 'Fragile', foodGrade: 'Food grade',
}
export const handlingFields: Record<HandlingKind, readonly (readonly [string, string])[]> = {
  hazardous: [['unNumber', 'UN number'], ['properShippingName', 'Proper shipping name'], ['class', 'Hazard class'], ['packingGroup', 'Packing group (or N/A)'], ['notes', 'Additional dangerous goods details']],
  temperatureControlled: [['setPoint', 'Required temperature'], ['unit', 'Temperature unit (C or F)'], ['notes', 'Temperature / ventilation instructions']],
  oversized: [], fragile: [], foodGrade: [],
}

export function readCargoHandling(raw: unknown): CargoHandling {
  if (raw == null || raw === '') return {}
  if (typeof raw !== 'string') throw new Error('Cargo handling details must be stored as text.')
  const value = JSON.parse(raw) as CargoHandling
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid cargo handling details.')
  for (const [key, item] of Object.entries(value)) {
    if (!handlingKinds.includes(key as HandlingKind) || !item || typeof item.tbc !== 'boolean'
      || !item.details || typeof item.details !== 'object' || Array.isArray(item.details)
      || Object.keys(item).some(field => !['tbc', 'details'].includes(field))
      || Object.entries(item.details).some(([field, text]) => !handlingFields[key as HandlingKind].some(([name]) => name === field) || typeof text !== 'string' || text.length > 4000)) {
      throw new Error('Unsupported cargo handling details. Reload before editing.')
    }
  }
  return value
}

const unresolved = (value: unknown) => typeof value !== 'string' || !value.trim() || /\bTBC\b/i.test(value)
export function cargoHandlingMissing(handling: CargoHandling, line: { description?: string | null; length?: unknown; width?: unknown; height?: unknown }): string[] {
  return handlingKinds.filter(kind => {
    const item = handling[kind]
    if (!item) return false
    if (item.tbc || Object.values(item.details).some(value => /\bTBC\b/i.test(value))) return true
    if (kind === 'oversized') return [line.length, line.width, line.height].some(value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) <= 0)
    if (kind === 'fragile' || kind === 'foodGrade') return unresolved(line.description)
    if (kind === 'temperatureControlled') return !/^-?[0-9]+(?:\.[0-9]+)?$/.test(item.details.setPoint ?? '') || !['C', 'F'].includes(item.details.unit?.toUpperCase())
    return !/^\d{4}$/.test(item.details.unNumber ?? '') || ['properShippingName', 'class', 'packingGroup'].some(key => unresolved(item.details[key]))
  }).map(kind => handlingLabels[kind])
}
