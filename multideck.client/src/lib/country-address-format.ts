export type CountryOption = { code: string; name: string }

const isoCountryCodes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ")

export function completeCountryOptions(source: CountryOption[], locale = "en-GB") {
  const displayNames = new Intl.DisplayNames([locale], { type: "region" })
  const supplied = new Map(source.map((country) => [country.code.toUpperCase(), country.name]))
  return isoCountryCodes
    .map((code) => ({ code, name: supplied.get(code) || displayNames.of(code) || code }))
    .sort((left, right) => left.name.localeCompare(right.name, locale))
}

export type AddressFieldKey = "line1" | "line2" | "townCity" | "countyState" | "postZipCode"
export type AddressFieldFormat = { key: AddressFieldKey; label: string; dir?: "ltr" }

export function addressFieldsForCountry(countryCode: string | null | undefined): AddressFieldFormat[] {
  const code = countryCode?.toUpperCase() ?? ""
  if (code === "US") return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "City" },
    { key: "countyState", label: "State" },
    { key: "postZipCode", label: "ZIP code", dir: "ltr" },
  ]
  if (code === "CA") return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "City" },
    { key: "countyState", label: "Province or territory" },
    { key: "postZipCode", label: "Postal code", dir: "ltr" },
  ]
  if (code === "AU") return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "Suburb or locality" },
    { key: "countyState", label: "State or territory" },
    { key: "postZipCode", label: "Postcode", dir: "ltr" },
  ]
  if (code === "IE") return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "Town or city" },
    { key: "countyState", label: "County" },
    { key: "postZipCode", label: "Eircode", dir: "ltr" },
  ]
  if (code === "GB") return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "Town or city" },
    { key: "countyState", label: "County" },
    { key: "postZipCode", label: "Postcode", dir: "ltr" },
  ]
  if (code === "JP") return [
    { key: "postZipCode", label: "Postal code", dir: "ltr" },
    { key: "countyState", label: "Prefecture" },
    { key: "townCity", label: "City, ward or town" },
    { key: "line1", label: "District and building" },
    { key: "line2", label: "Additional address information" },
  ]
  return [
    { key: "line1", label: "Address line 1" },
    { key: "line2", label: "Address line 2" },
    { key: "townCity", label: "Town or city" },
    { key: "countyState", label: "Region, state or province" },
    { key: "postZipCode", label: "Postal code", dir: "ltr" },
  ]
}
