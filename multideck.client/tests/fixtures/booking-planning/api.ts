import { bookingPlanningSavePayload, readBookingPlanningWorkspace } from '../../../src/lib/booking-planning-charges'
export const jobId = '11111111-1111-4111-8111-111111111111'
let response = { supported: true, editable: true, blockedReason: null as string | null,
  bookingUpdatedAt: '2026-09-19T12:00:00Z',
  chargeSet: { job_id: jobId, revision: 0, base_currency: 'GBP', rows: [] as unknown[] },
  currencies: ['GBP', 'EUR', 'USD'].map(code => ({ code, name: code, symbol: code, decimalPlaces: 2 })),
  parties: [{ id: '22222222-2222-4222-8222-222222222222', code: 'TEST', name: 'Fixture supplier', roles: ['supplier'] }],
}
let failSave = false
let failRefresh = false
export function failNextSave() { failSave = true }
export function failNextRefresh() { failRefresh = true }
export function setReadOnly(value: boolean) { response.editable = !value; response.blockedReason = value ? 'Read-only fixture' : null }
export async function getBookingPlanningCharges() { return readBookingPlanningWorkspace(structuredClone(response), jobId) }
export async function saveBookingPlanningCharges(payload: ReturnType<typeof bookingPlanningSavePayload>) {
  if (failSave) { failSave = false; throw new Error('Simulated save failure. Your entries are retained.') }
  if (!response.editable) throw new Error('Read-only fixture')
  if (payload.expectedRevision !== response.chargeSet.revision) throw new Error('Planning charges changed. Reload before saving.')
  response = { ...response, chargeSet: { ...response.chargeSet, revision: response.chargeSet.revision + 1, rows: structuredClone(payload.rows) } }
  return getBookingPlanningCharges()
}
export async function getBookingWorkflow() {
  if (failRefresh) { failRefresh = false; throw new Error('Simulated refresh failure') }
  return { booking: { jobId }, savedRevision: response.chargeSet.revision }
}
