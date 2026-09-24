import { normalizeMileageRoute, decodePolyline } from './mileage-route.ts'

type Input = ReturnType<typeof normalizeMileageRoute>
type Point = [number, number]
export function mileageStops(input: Pick<Input, 'origin' | 'destination' | 'waypoints' | 'round_trip'>) {
  return [input.origin, ...input.waypoints, input.destination, ...(input.round_trip ? [input.origin] : [])]
}
export function readOsrmRoute(data: { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: number[][] } }[]; waypoints?: { location: number[] }[] }) {
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route || !Number.isFinite(route.distance) || route.distance <= 0 || route.distance / 1609.344 > 10000) throw new Error('No road route was found. Check the journey locations.')
  const points = route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as Point)
  if (!points || points.length < 2 || points.some(([lat,lng]) => !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180)) throw new Error('The route map could not be read. Try again.')
  return { distance_miles: Math.round(route.distance / 1609.344 * 100) / 100, route_data: { provider: 'OpenStreetMap / OSRM', duration: `${Math.round(route.duration)}s`, points, stops: (data.waypoints ?? []).map(w => [w.location[1],w.location[0]] as Point) } }
}
const headers = { 'User-Agent': 'Multideck-Mileage/1.0 (https://multideck.app)', Accept: 'application/json' }
async function get(url: string, notFound?: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (response.status === 404 && notFound) throw new Error(notFound)
  if (!response.ok) throw new Error('The map service is temporarily unavailable. Your trip details are safe; try again.')
  return response.json()
}
export async function calculateRoadRoute(input: Input, options: { googleKey?: string; osrmBase?: string; photonBase?: string; reserve: (provider: string) => Promise<void> }) {
  if (options.googleKey) {
    const stops = input.round_trip ? [...input.waypoints, input.destination] : input.waypoints
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': options.googleKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation' },
      body: JSON.stringify({ origin: { address: input.origin }, destination: { address: input.round_trip ? input.origin : input.destination }, intermediates: stops.map(address => ({ address })), travelMode: input.vehicle_type === 'bicycle' ? 'BICYCLE' : 'DRIVE', regionCode: 'GB', units: 'IMPERIAL' }),
    })
    if (!response.ok) throw new Error('The route could not be calculated. Check the addresses and try again.')
    const route = (await response.json()).routes?.[0]
    if (!Number.isFinite(route?.distanceMeters) || route.distanceMeters <= 0 || route.distanceMeters / 1609.344 > 10000) throw new Error('No supported route was found. Check the journey locations.')
    return { distance_miles: Math.round(route.distanceMeters / 1609.344 * 100) / 100, route_data: { provider: 'Google Maps', duration: route.duration, points: decodePolyline(route.polyline?.encodedPolyline ?? ''), stops: [...(route.legs ?? []).map((leg: { startLocation: { latLng: { latitude: number; longitude: number } } }) => [leg.startLocation.latLng.latitude,leg.startLocation.latLng.longitude]), ...(route.legs?.length ? [[route.legs.at(-1).endLocation.latLng.latitude,route.legs.at(-1).endLocation.latLng.longitude]] : [])] } }
  }
  const locations = mileageStops(input)
  const coordinates = new Map<string, Point>()
  for (const location of new Set(locations)) {
    const postcode = location.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)?.[1]
    if (postcode) {
      const result = await get(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, `Check the postcode in “${location}”.`)
      if (!result.result) throw new Error(`Check the postcode in “${location}”.`)
      coordinates.set(location, [result.result.longitude,result.result.latitude])
    } else {
      await options.reserve('photon')
      const url = new URL(options.photonBase || 'https://photon.komoot.io/api/')
      url.searchParams.set('q',location);url.searchParams.set('limit','2');url.searchParams.set('lang','en')
      const result = await get(url.toString())
      // Never silently choose between ambiguous places when the result affects reimbursement.
      if (result.features?.length !== 1) throw new Error(`Add a full postcode to “${location}” so we can locate the correct stop.`)
      coordinates.set(location,result.features[0].geometry.coordinates)
    }
  }
  await options.reserve('osrm')
  const base = options.osrmBase || `https://routing.openstreetmap.de/routed-${input.vehicle_type === 'bicycle' ? 'bike' : 'car'}`
  const path = locations.map(name => coordinates.get(name)!.join(',')).join(';')
  const result = readOsrmRoute(await get(`${base.replace(/\/$/,'')}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`))
  return { ...result, route_data: { ...result.route_data, locationLabels: locations, note: 'Postcode locations are approximate. Review the route and adjust mileage if needed.' } }
}
