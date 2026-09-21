import { supabase, getSupabaseSession, supabaseFunctionsUrl, supabasePublicApiKey } from '@/lib/supabase'

export type MileageRouteData = { duration?: string; provider?: string; points?: [number, number][]; stops?: [number, number][]; locationLabels?: string[]; note?: string }
export type MileagePhoto = { id: string; kind: 'before' | 'after'; url: string }
export type MileageStatus = 'draft' | 'pending' | 'ready' | 'rejected' | 'paid'
export type MileageTrip = {
  id: string; user_id: string; employee_name: string; account_id: string | null; company_name: string | null; trip_date: string;
  purpose: string; origin: string; destination: string; waypoints: string[]; round_trip: boolean;
  vehicle_type: 'car' | 'motorcycle' | 'bicycle'; vehicle_name: string; company_car: boolean;
  fuel_type: 'petrol' | 'diesel' | 'electric' | null; engine_cc: number | null; charging: 'home' | 'public' | null;
  distance_miles: number; distance_source: 'manual' | 'google' | 'route'; distance_reason: string | null; route_quote_id: string | null;
  route_data: MileageRouteData | null; evidence_ids: string[];
  status: MileageStatus; amount: number; rate_snapshot: MileageRate; version: number;
  submitted_at: string | null; approval_required: boolean | null; denial_reason: string | null;
  paid_at: string | null; payment_reference: string | null; created_at: string;
}
export type MileageRate = { amount: number; label: string; source: string; taxYear: number; highMiles?: number; lowMiles?: number; highRatePence?: number; lowRatePence?: number; ratePence?: number }
export type MileageContext = {
  userId: string; admin: boolean; finance: boolean; approver: boolean;
  settings: { approval_required: boolean; approver_ids: string[]; electric_override_pence: number | null; version: number };
  users: { id: string; name: string }[];
  openingBalances: { user_id: string; tax_year: number; miles: number }[];
}
export type MileageEvent = { id: string; actor_name: string; action: string; created_at: string; detail: { reason?: string; reference?: string } }
export type MileageDetail = { trip: MileageTrip; companyName: string | null; events: MileageEvent[] }
export type MileageVisit = { id: string; trip_date: string; employee_name: string; purpose: string; can_open: boolean }
export async function mileageRequest<T>(action: string, data: object = {}): Promise<T> {
  if (!supabase) throw new Error('Sign in to use mileage claims.')
  const { data: result, error } = await supabase.rpc('multideck_mileage', { p_action: action, p_data: data })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Mileage claims have not been enabled in this workspace yet. Contact your administrator.')
    throw new Error(error.message)
  }
  return result as T
}
export async function calculateMileageRoute(input: object) {
  const session = await getSupabaseSession()
  if (!session) throw new Error('Sign in again to calculate a route.')
  const response = await fetch(`${supabaseFunctionsUrl}/mileage-route`, {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey }, body: JSON.stringify(input),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.detail || 'The route could not be calculated. Try again.')
  return result as { id: string; distance_miles: number; route_data: MileageTrip['route_data'] }
}
export function mileageMapLink(trip: Pick<MileageTrip, 'origin' | 'destination' | 'waypoints' | 'round_trip' | 'vehicle_type'>) {
  const stops = trip.round_trip ? [...trip.waypoints, trip.destination] : trip.waypoints
  const params = new URLSearchParams({ api: '1', origin: trip.origin, destination: trip.round_trip ? trip.origin : trip.destination, travelmode: trip.vehicle_type === 'bicycle' ? 'bicycling' : 'driving' })
  if (stops.length) params.set('waypoints', stops.join('|'))
  return `https://www.google.com/maps/dir/?${params}`
}
export const mileageStatusLabels: Record<MileageStatus, string> = { draft: 'Draft', pending: 'Awaiting approval', ready: 'Ready for payment', rejected: 'Returned', paid: 'Paid' }

async function evidenceRequest<T>(data: FormData | object): Promise<T> {
  const session = await getSupabaseSession()
  if (!session) throw new Error('Sign in again to attach photos.')
  const multipart = data instanceof FormData
  const response = await fetch(`${supabaseFunctionsUrl}/mileage-evidence`, {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    body: multipart ? data : JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.detail || 'The photo could not be saved. Try again.')
  return result as T
}
export const loadMileagePhotos = (tripId: string) => evidenceRequest<MileagePhoto[]>({ trip_id: tripId })
export const readMileagePhoto = (id: string) => evidenceRequest<{ reading: number | null; unit: 'miles' | 'km' | null }>({ action: 'read', id })
export async function uploadMileagePhoto(tripId: string, kind: MileagePhoto['kind'], file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photo smaller than 5 MB.')
  const form = new FormData(); form.set('trip_id', tripId); form.set('kind', kind); form.set('file', file)
  return evidenceRequest<MileagePhoto>(form)
}
