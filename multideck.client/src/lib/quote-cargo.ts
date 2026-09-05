// The version snapshot is authoritative. Keep decimal input as text and do not
// turn legacy shipment summaries into allocations without an operator action.
export const quoteCargoTextFields = ['description', 'commodity', 'packageType', 'hsCode', 'countryOfOrigin'] as const
export const quoteCargoNumberFields = ['packageQuantity', 'grossWeightKg', 'netWeightKg', 'volumeCbm', 'chargeableWeightKg', 'length', 'width', 'height'] as const
export type QuoteCargoLine = { id: string; lengthUnit: string; isHazardous: boolean; isTemperatureControlled: boolean }
  & Record<typeof quoteCargoTextFields[number] | typeof quoteCargoNumberFields[number], string>

export function newQuoteCargoLine(): QuoteCargoLine {
  return { id: crypto.randomUUID(), description: '', commodity: '', packageType: '', hsCode: '', countryOfOrigin: '',
    packageQuantity: '', grossWeightKg: '', netWeightKg: '', volumeCbm: '', chargeableWeightKg: '',
    length: '', width: '', height: '', lengthUnit: 'cm', isHazardous: false, isTemperatureControlled: false }
}

export function readQuoteCargoLines(value: unknown): QuoteCargoLine[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 500) throw new Error('The saved Quote cargo list is invalid. Reload before editing this Quote.')
  const ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('A saved Quote cargo line is invalid.')
    const record = item as Record<string, unknown>
    const allowed = ['id', 'lengthUnit', 'isHazardous', 'isTemperatureControlled', ...quoteCargoTextFields, ...quoteCargoNumberFields]
    if (Object.keys(record).some(key => !allowed.includes(key))) throw new Error('This Quote contains cargo fields that require a newer editor. Reload before editing.')
    if (typeof record.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.id) || ids.has(record.id.toLowerCase())) throw new Error('Saved Quote cargo identifiers are invalid.')
    ids.add(record.id.toLowerCase())
    const line = { id: record.id } as QuoteCargoLine
    for (const key of quoteCargoTextFields) {
      if (record[key] != null && typeof record[key] !== 'string') throw new Error(`Saved cargo ${key} must be text.`)
      line[key] = record[key] as string ?? ''
    }
    for (const key of quoteCargoNumberFields) {
      if (record[key] != null && typeof record[key] !== 'string' && typeof record[key] !== 'number') throw new Error(`Saved cargo ${key} must be a number.`)
      line[key] = record[key] == null ? '' : String(record[key])
    }
    for (const key of ['isHazardous', 'isTemperatureControlled'] as const) {
      if (record[key] !== undefined && typeof record[key] !== 'boolean') throw new Error('Saved cargo safety flags are invalid.')
      line[key] = record[key] === true
    }
    line.lengthUnit = typeof record.lengthUnit === 'string' ? record.lengthUnit : 'cm'
    if (!['cm', 'm', 'in'].includes(line.lengthUnit)) throw new Error('Saved cargo dimensions use an unsupported unit.')
    return line
  })
}

export function quoteCargoTotal(lines: readonly QuoteCargoLine[], key: typeof quoteCargoNumberFields[number]) {
  const values = lines.map(line => line[key].trim())
  if (!values.length || values.some(value => value.length > 32 || !/^[0-9]+(?:\.[0-9]+)?$/.test(value))) return ''
  const precision = Math.max(...values.map(value => value.split('.')[1]?.length ?? 0))
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.')
    return sum + BigInt(whole + fraction.padEnd(precision, '0'))
  }, 0n).toString().padStart(precision + 1, '0')
  return precision ? `${total.slice(0, -precision)}.${total.slice(-precision)}`.replace(/\.?0+$/, '') : total
}

export function quoteCargoSummary(lines: readonly QuoteCargoLine[]) {
  const unique = (key: 'commodity' | 'packageType') => {
    const values = [...new Set(lines.map(line => line[key].trim()).filter(Boolean))]
    return values.length === 1 && lines.every(line => line[key].trim()) ? values[0] : ''
  }
  return { packageQuantity: quoteCargoTotal(lines, 'packageQuantity'), grossWeightKg: quoteCargoTotal(lines, 'grossWeightKg'),
    volumeCbm: quoteCargoTotal(lines, 'volumeCbm'), chargeableWeightKg: quoteCargoTotal(lines, 'chargeableWeightKg'),
    commodity: unique('commodity'), packageType: unique('packageType') }
}
