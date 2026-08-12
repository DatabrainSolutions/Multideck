export const CUSTOMS_STATUS_POLL_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000, 45_000, 60_000] as const

const TERMINAL_CUSTOMS_STATUSES = new Set(["accepted", "released", "cleared", "rejected", "cancelled"])
const PENDING_CUSTOMS_STATUSES = new Set(["submitted", "acknowledged", "pending", "queued", "processing"])

export function normaliseCustomsStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() ?? ""
}

export function isTerminalCustomsStatus(status: string | null | undefined) {
  return TERMINAL_CUSTOMS_STATUSES.has(normaliseCustomsStatus(status))
}

export function shouldPollCustomsStatus(status: string | null | undefined) {
  return PENDING_CUSTOMS_STATUSES.has(normaliseCustomsStatus(status))
}

export function customsStatusPollDelay(attempt: number) {
  return CUSTOMS_STATUS_POLL_DELAYS_MS[attempt] ?? null
}
