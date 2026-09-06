type RecordValue = Record<string, unknown>
type Locale = 'en-GB' | 'en-US'

const labels: Record<string, string> = {
  carrierBookingReference: 'Carrier booking reference', masterTransportReference: 'Master transport reference',
  houseTransportReference: 'House transport reference', serviceLevel: 'Service level', transportMeansName: 'Transport service',
  vessel: 'Vessel', voyageNumber: 'Voyage number', flightNumber: 'Flight number', vehicleRegistration: 'Vehicle registration',
  trailerNumber: 'Trailer number', railService: 'Rail service', plannedPickupAt: 'Planned collection',
  plannedDepartureAt: 'Planned departure', plannedArrivalAt: 'Planned arrival', plannedDeliveryAt: 'Planned delivery',
  cargoCutoffAt: 'Cargo cut-off', documentationCutoffAt: 'Documentation cut-off', vgmCutoffAt: 'VGM cut-off',
}
const fieldModes: Record<string, string[]> = {
  vessel: ['sea'], voyageNumber: ['sea'], flightNumber: ['air'], vehicleRegistration: ['road', 'courier'],
  trailerNumber: ['road', 'courier'], railService: ['rail'], vgmCutoffAt: ['sea'],
}

function displayValue(value: unknown, field: string, locale: Locale): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error('Provide a text value or an explicit clear for the routing field.')
  const text = value.trim()
  if (!text) return null
  if (!field.endsWith('At')) return text
  // Keep the source's wall time, offset and fractional seconds. Browser/server
  // timezone and JavaScript millisecond precision must not change the review.
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(:\d{2}(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(text)
  const date = match ? new Date(`${match[1]}T12:00:00Z`) : null
  if (!match || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]
    || (field.endsWith('CutoffAt') && !match[2]) || Number(match[1].slice(0, 4)) === 0) {
    throw new Error('Use a valid ISO date; cut-offs also need a time and explicit timezone.')
  }
  const time = match[2] ?? '00:00'
  const seconds = match[3] ?? ''
  const zone = match[4] ?? 'Z'
  const offset = zone === 'Z' ? [0, 0] : zone.slice(1).split(':').map(Number)
  if (Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59 || Number(seconds.slice(1) || 0) >= 60
    || offset[0] > 14 || offset[1] > 59 || (offset[0] === 14 && offset[1] !== 0)) {
    throw new Error('Use a valid time and timezone for the routing field.')
  }
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  const zoneLabel = zone === 'Z' || zone === '+00:00' || zone === '-00:00' ? 'UTC' : `UTC${zone}`
  return `${day} at ${time}${seconds} ${zoneLabel}`
}

/** Build the review from this request's permission-checked domain read, never
 * from the Booking header, another leg, or model-supplied before/label fields.
 * The canonical executor still rechecks both timestamps under locks at approval.
 */
export function bookingRouteActionReview(records: Map<string, RecordValue>, args: RecordValue, locale: Locale) {
  const record = records.get(String(args.route_id ?? ''))
  const field = String(args.field ?? '')
  if (!Object.hasOwn(labels, field) || !Object.hasOwn(args, 'value')) throw new Error('Choose an available routing field and its new value.')
  if (!record || record.sourceTable !== 'Job_Routing' || record.recordId !== args.route_id || record.bookingId !== args.target_id
    || typeof args.expected_updated_at !== 'string' || !args.expected_updated_at
    || typeof args.expected_route_updated_at !== 'string' || !args.expected_route_updated_at
    || record.updatedAt !== args.expected_updated_at || record.routeUpdatedAt !== args.expected_route_updated_at
    || !Object.hasOwn(record, field) || typeof record.bookingReference !== 'string' || !record.bookingReference.trim()
    || !Number.isInteger(record.legNumber) || Number(record.legNumber) < 1 || typeof record.mode !== 'string' || !record.mode) {
    throw new Error('Read the exact current Booking routing leg before requesting approval.')
  }
  if (fieldModes[field] && !fieldModes[field].includes(record.mode)) throw new Error('That field does not belong to this routing leg mode.')
  const before = displayValue(record[field], field, locale)
  const after = displayValue(args.value, field, locale)
  const mode = record.mode.charAt(0).toUpperCase() + record.mode.slice(1)
  const target = `${record.bookingReference} · Leg ${record.legNumber} · ${mode}`
  const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : ''
  return {
    title: `Edit ${target}`,
    description: `Review ${labels[field].toLowerCase()} for ${target}. Only this field will change. Other routing fields, cargo, equipment and the accepted Quote remain unchanged.${reason ? ` Reason: ${reason}` : ''}`,
    changes: [{ field: labels[field], before, after, value: after, beforeKnown: true,
      kind: after === null ? 'removed' : before === null ? 'added' : 'changed' }],
  }
}
