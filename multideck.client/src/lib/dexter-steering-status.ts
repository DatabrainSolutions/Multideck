export type SteeringStatus = 'pending' | 'claimed' | 'submitted' | 'queued' | 'incorporated' | 'failed' | 'unconfirmed'
/** HTTP acknowledgement and SSE can arrive out of order; a committed correction stays committed. */
export function mergeSteeringStatus(current: SteeringStatus, incoming: SteeringStatus): SteeringStatus {
  if (current === 'incorporated' || incoming === 'incorporated') return 'incorporated'
  const terminal = ['failed', 'unconfirmed']
  if (terminal.includes(incoming)) return incoming
  if (terminal.includes(current)) return current
  const order = ['pending', 'claimed', 'submitted', 'queued']
  return order.indexOf(incoming) >= order.indexOf(current) ? incoming : current
}
