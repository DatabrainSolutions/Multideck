export { mileageMapLink, mileageStatusLabels, loadMileagePhotos, uploadMileagePhoto, readMileagePhoto } from '../../src/lib/mileage-api'
export type { MileageTrip, MileageRate, MileageContext, MileageDetail, MileageVisit, MileageEvent, MileageStatus, MileagePhoto, MileageRouteData } from '../../src/lib/mileage-api'
export async function mileageRequest<T>(action: string, data: object = {}): Promise<T> {
  const user = sessionStorage.getItem('mileage-qa-user') || '1'
  const response = await fetch('/__mileage_test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, action, data }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
export const calculateMileageRoute = (input: object) => mileageRequest<{ id: string; distance_miles: number; route_data: import('../../src/lib/mileage-api').MileageRouteData }>('__route', input)
