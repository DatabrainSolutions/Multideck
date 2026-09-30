export type LocationSuggestion = { id: string; label: string; detail: string; value: string; address: { line1: string; line2: string; townCity: string; countyState: string; postZipCode: string; countryCode: string } }

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
    // Photon postcode features carry the postcode in name, not postcode.
    // Only use that name when the provider explicitly identifies this feature.
    const postcode = text(p.postcode) || (p.osm_key === "place" && p.osm_value === "postcode" ? text(p.name) : "")
    const label = text(p.name) || street || city
    if (!label) return []
    const parts = [label, street, city, text(p.state), postcode, text(p.country)]
      .filter((part, index, all) => part && all.findIndex(candidate => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index)
    const value = parts.join(", ")
    if (value.length > 240 || seen.has(value.toLocaleLowerCase())) return []
    seen.add(value.toLocaleLowerCase())
    const countryCode = text(p.countrycode).toUpperCase()
    return [{ id: `${p.osm_type ?? "place"}:${p.osm_id ?? value}`, label, detail: parts.slice(1).join(", "), value,
      address: { line1: street, line2: "", townCity: city, countyState: text(p.state), postZipCode: postcode, countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "" } }]
  }).slice(0, 5)
}
