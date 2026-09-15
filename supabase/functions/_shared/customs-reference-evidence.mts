import type { TariffSnapshot } from "./customs-tariff-reference.mts"

type Lookup = TariffSnapshot | { error: string }
/** One immutable response per fetched snapshot, with explicit item/dataset links.
 * Deduplicate only the exact fetched object: equal requests can have amended
 * responses and must never be merged by commodity/date alone. */
export function retainTariffEvidence(duty: Record<string, Lookup> | undefined, vat: Record<string, Lookup>) {
  const snapshots: { id: string; snapshot: TariffSnapshot }[] = []
  const identities = new Map<TariffSnapshot, string>()
  const retain = (lookups: Record<string, Lookup>) => Object.fromEntries(Object.entries(lookups).sort(([a], [b]) => a.localeCompare(b)).map(([itemId, lookup]) => {
    if ("error" in lookup) return [itemId, { error: lookup.error }]
    let id = identities.get(lookup)
    if (!id) { id = `tariff-${snapshots.length + 1}`; identities.set(lookup, id); snapshots.push({ id, snapshot: lookup }) }
    return [itemId, { snapshotId: id }]
  }))
  const dutyByItem = duty ? retain(duty) : null
  const vatByItem = retain(vat)
  return { format: "tariff-reference-evidence-v1" as const, snapshots, dutyByItem, vatByItem }
}
