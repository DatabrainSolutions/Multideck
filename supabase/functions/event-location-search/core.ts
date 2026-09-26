export type LocationSuggestion = { id: string; label: string; detail: string; value: string }

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function locationQuery(value: unknown): string {
  const query = text(value)
  if (query.length < 3 || query.length > 240) throw new Error("Enter between 3 and 240 characters.")
  return query
}

/** Public place data only: never infer an address which the provider did not return. */
export function locationSuggestions(payload: unknown): LocationSuggestion[] {
  const features = (payload as { features?: unknown[] } | null)?.features
  if (!Array.isArray(features)) throw new Error("Invalid place search response.")
  const seen = new Set<string>()
  return features.flatMap((feature: any) => {
    const p = feature?.properties
    if (!p || typeof p !== "object") return []
    const street = [text(p.housenumber), text(p.street)].filter(Boolean).join(" ")
    const city = text(p.city) || text(p.town) || text(p.village) || text(p.locality)
    const label = text(p.name) || street || city
    if (!label) return []
    const parts = [label, street, city, text(p.state), text(p.postcode), text(p.country)]
      .filter((part, index, all) => part && all.findIndex(candidate => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index)
    const value = parts.join(", ")
    if (value.length > 240 || seen.has(value.toLocaleLowerCase())) return []
    seen.add(value.toLocaleLowerCase())
    return [{ id: `${p.osm_type ?? "place"}:${p.osm_id ?? value}`, label, detail: parts.slice(1).join(", "), value }]
  }).slice(0, 5)
}
