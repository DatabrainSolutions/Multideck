export function additionalCustomsPartyIssues(input: Record<string, unknown>) {
  const issues: {field: string; message: string}[] = []
  const text = (field: string) => typeof input[field] === "string" ? String(input[field]).trim() : ""
  for (const party of ["representative", "seller", "buyer"]) {
    const title = party[0].toUpperCase() + party.slice(1)
    const suffixes = ["Name", "AddressLine", "City", "Postcode", "Country", "Eori"]
    if (!text(party) && !suffixes.some(suffix => text(`${party}${suffix}`))) continue
    if (!text(party)) issues.push({field: party, message: `Select or enter the ${party} company.`})
    if (text(`${party}Eori`)) {
      if (!/^[A-Z]{2}[A-Z0-9]{3,15}$/.test(text(`${party}Eori`))) issues.push({field: `${party}Eori`, message: `${title}: enter a valid EORI number.`})
    } else {
      for (const suffix of ["Name", "AddressLine", "City", "Postcode", "Country"]) {
        if (!(suffix === "Name" ? text(`${party}Name`) || text(party) : text(`${party}${suffix}`))) issues.push({field: `${party}${suffix}`, message: `${title}: complete the ${suffix === "AddressLine" ? "street address" : suffix.toLowerCase()} when no EORI is supplied.`})
      }
    }
    if (text(`${party}Country`) && !/^[A-Z]{2}$/.test(text(`${party}Country`))) issues.push({field: `${party}Country`, message: `${title}: select a valid country.`})
  }
  return issues
}
