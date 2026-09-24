export function normalizePostcode(value: string) {
  const compact = value.replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : value.trim()
}
export function normalizeMileageRoute(raw: unknown) {
  const data = raw as Record<string, unknown>
  if (!data || typeof data !== 'object') throw new Error('Enter a start and destination.')
  const address = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) throw new Error('Each address must contain 1–500 characters.')
    return value.trim()
  }
  if (!Array.isArray(data.waypoints) || data.waypoints.length > 10) throw new Error('Use up to 10 intermediate stops.')
  if (typeof data.round_trip !== 'boolean') throw new Error('Choose whether the trip returns to the start.')
  if (!['car', 'motorcycle', 'bicycle'].includes(String(data.vehicle_type))) throw new Error('Choose a supported vehicle.')
  const original = { origin: address(data.origin), destination: address(data.destination), waypoints: data.waypoints.map(address), round_trip: data.round_trip, vehicle_type: String(data.vehicle_type) }
  return { ...original, origin: normalizePostcode(original.origin), destination: normalizePostcode(original.destination), waypoints: original.waypoints.map(normalizePostcode), original }
}
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []; let index = 0; let lat = 0; let lng = 0
  const next = () => {
    let result = 0; let shift = 0; let byte: number
    do {
      if (index >= encoded.length || shift > 30) throw new Error('The map route could not be read.')
      byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5
    } while (byte >= 32)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < encoded.length) { lat += next(); lng += next(); points.push([lat / 1e5, lng / 1e5]) }
  return points
}
