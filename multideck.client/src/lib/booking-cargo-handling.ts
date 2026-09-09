import type { BookingWorkflowCargo } from './booking-workflow-api'

const safetyLabels = ['hazardous', 'temperature controlled']
const tokens = (value: string) => value.split(/[;,|]/).map(token => token.trim()).filter(Boolean)
const recordedHandling = (cargo: BookingWorkflowCargo) => {
  const nested = cargo.cargoData?.cargoData as Record<string, unknown> | undefined
  return [cargo.knownCargo, cargo.cargoData?.knownCargo, nested?.knownCargo].find(value => typeof value === 'string') as string | undefined
}

export function bookingCargoOtherHandling(value: string) {
  return tokens(value).filter(token => !safetyLabels.includes(token.toLowerCase())).join('; ')
}

export function bookingCargoSafetyConflict(cargo: BookingWorkflowCargo | undefined, recorded: string) {
  const previous = tokens(recorded).map(token => token.toLowerCase())
  return (previous.includes('hazardous') && cargo?.isHazardous !== true)
    || (previous.includes('temperature controlled') && cargo?.isTemperatureControlled !== true)
}

/** Compatibility text follows explicit line flags; it never changes DG records. */
export function bookingCargoHandlingSummary(cargo: BookingWorkflowCargo, previousCargo = cargo) {
  const recorded = recordedHandling(cargo)
  const previous = tokens(recordedHandling(previousCargo) ?? '').map(token => token.toLowerCase())
  const labels = tokens(bookingCargoOtherHandling(recorded ?? ''))
    .filter(token => !['general cargo', 'general merchandise'].includes(token.toLowerCase()))
  // Missing old flags remain unconfirmed, not an implicit negative decision.
  if (cargo.isTemperatureControlled === true || (cargo.isTemperatureControlled == null && previous.includes('temperature controlled'))) labels.unshift('Temperature controlled')
  if (cargo.isHazardous === true || (cargo.isHazardous == null && previous.includes('hazardous'))) labels.unshift('Hazardous')
  return [...new Map(labels.map(label => [label.toLowerCase(), label])).values()].join('; ') || 'General merchandise'
}
