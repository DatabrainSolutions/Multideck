export type BookingMatchSignals = {
  references: string[]
  senderOrganisationIds: string[]
  origin: string | null
  destination: string | null
  plannedArrivalAt: string | null
}

export type BookingMatchCandidate = {
  id: string
  label: string
  bookingReference: string | null
  customerId: string | null
  carrierId: string | null
  supplierId: string | null
  status: string | null
  origin: string | null
  destination: string | null
  plannedArrivalAt: string | null
}

export type ScoredBookingMatchCandidate = BookingMatchCandidate & {
  score: number
  reasons: string[]
}

export type BookingMatchDecision =
  | { state: "matched"; candidate: ScoredBookingMatchCandidate; candidates: ScoredBookingMatchCandidate[] }
  | { state: "ambiguous"; candidate: null; candidates: ScoredBookingMatchCandidate[] }
  | { state: "no_match"; candidate: null; candidates: ScoredBookingMatchCandidate[] }

export function normalizeBookingMatchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function sameOperationalPlace(left: string | null, right: string | null) {
  const first = normalizeBookingMatchText(left)
  const second = normalizeBookingMatchText(right)
  if (!first || !second) return false
  return first === second || (Math.min(first.length, second.length) >= 5 && (first.includes(second) || second.includes(first)))
}

function dateProximityScore(left: string | null, right: string | null) {
  if (!left || !right) return 0
  const first = Date.parse(left)
  const second = Date.parse(right)
  if (!Number.isFinite(first) || !Number.isFinite(second)) return 0
  const days = Math.abs(first - second) / 86_400_000
  if (days <= 2) return 0.1
  if (days <= 7) return 0.05
  return 0
}

export function scoreBookingMatchCandidate(candidate: BookingMatchCandidate, signals: BookingMatchSignals): ScoredBookingMatchCandidate {
  const reasons: string[] = []
  const candidateReference = normalizeBookingMatchText(candidate.bookingReference)
  const referenceMatch = Boolean(candidateReference && signals.references.some((reference) => normalizeBookingMatchText(reference) === candidateReference))
  const senderMatch = signals.senderOrganisationIds.some((organisationId) =>
    organisationId === candidate.customerId || organisationId === candidate.carrierId || organisationId === candidate.supplierId)

  let score = 0
  if (referenceMatch) {
    score = 0.96
    reasons.push("normalised_reference")
  }
  if (senderMatch) {
    score = Math.max(score, 0.64)
    reasons.push("sender_organisation")
  }
  if (sameOperationalPlace(signals.origin, candidate.origin)) {
    score += referenceMatch ? 0.01 : 0.12
    reasons.push("origin")
  }
  if (sameOperationalPlace(signals.destination, candidate.destination)) {
    score += referenceMatch ? 0.01 : 0.13
    reasons.push("destination")
  }
  const arrivalScore = dateProximityScore(signals.plannedArrivalAt, candidate.plannedArrivalAt)
  if (arrivalScore) {
    score += referenceMatch ? Math.min(arrivalScore, 0.01) : arrivalScore
    reasons.push("arrival_window")
  }
  if (["open", "active", "in_progress", "booked", "confirmed"].includes(String(candidate.status ?? "").toLowerCase())) {
    score += referenceMatch ? 0 : 0.02
    reasons.push("active_booking")
  }

  return { ...candidate, score: Math.min(0.99, Number(score.toFixed(4))), reasons }
}

export function decideBookingMatch(candidates: BookingMatchCandidate[], signals: BookingMatchSignals): BookingMatchDecision {
  const ranked = candidates.map((candidate) => scoreBookingMatchCandidate(candidate, signals))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
  const first = ranked[0]
  if (!first || first.score < 0.6) return { state: "no_match", candidate: null, candidates: ranked.slice(0, 4) }

  const second = ranked[1]
  const margin = second ? first.score - second.score : 1
  const strongReference = first.reasons.includes("normalised_reference") && first.score >= 0.96 && margin >= 0.05
  const corroboratedSender = first.reasons.includes("sender_organisation")
    && first.reasons.some((reason) => reason === "origin" || reason === "destination" || reason === "arrival_window" || reason === "normalised_reference")
    && first.score >= 0.82
    && margin >= 0.12

  if (strongReference || corroboratedSender) {
    return { state: "matched", candidate: first, candidates: ranked.slice(0, 4) }
  }
  return { state: "ambiguous", candidate: null, candidates: ranked.slice(0, 4) }
}
