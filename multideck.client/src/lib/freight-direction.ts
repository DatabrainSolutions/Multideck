export type FreightDirection = "Export" | "Import" | "Domestic" | "Cross trade"

export type FreightCountry = {
  code: string
  name: string
  alpha3?: string | null
}

function normalizedCountryText(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleUpperCase()
}

export function countryCodeFromFreightLocation(
  value: string | null | undefined,
  unlocode: string | null | undefined,
  countries: readonly FreightCountry[] = [],
) {
  const normalizedUnlocode = normalizedCountryText(unlocode).replace(/[^A-Z0-9]/g, "")
  if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(normalizedUnlocode)) return normalizedUnlocode.slice(0, 2)

  const normalizedValue = normalizedCountryText(value)
  if (/^[A-Z]{2}$/.test(normalizedValue)) return normalizedValue
  const country = countries.find((option) => (
    normalizedCountryText(option.name) === normalizedValue
    || normalizedCountryText(option.code) === normalizedValue
    || normalizedCountryText(option.alpha3) === normalizedValue
  ))
  return country?.code.trim().toLocaleUpperCase() || null
}

export function calculateFreightDirection(input: {
  operatingCountryCode: string | null | undefined
  originCountryCode: string | null | undefined
  destinationCountryCode: string | null | undefined
}): FreightDirection | null {
  const operating = normalizedCountryText(input.operatingCountryCode)
  const origin = normalizedCountryText(input.originCountryCode)
  const destination = normalizedCountryText(input.destinationCountryCode)
  if (![operating, origin, destination].every((value) => /^[A-Z]{2}$/.test(value))) return null
  if (origin === operating && destination === operating) return "Domestic"
  if (origin === operating) return "Export"
  if (destination === operating) return "Import"
  return "Cross trade"
}

export function calculateQuoteFreightDirection(input: {
  operatingCountryCode: string | null | undefined
  originCountry?: string | null
  originUnlocode?: string | null
  destinationCountry?: string | null
  destinationUnlocode?: string | null
  countries?: readonly FreightCountry[]
}) {
  const countries = input.countries ?? []
  return calculateFreightDirection({
    operatingCountryCode: input.operatingCountryCode,
    originCountryCode: countryCodeFromFreightLocation(input.originCountry, input.originUnlocode, countries),
    destinationCountryCode: countryCodeFromFreightLocation(input.destinationCountry, input.destinationUnlocode, countries),
  })
}

