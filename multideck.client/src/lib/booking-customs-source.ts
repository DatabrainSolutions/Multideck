import type { BookingWorkflowCargo, BookingWorkflowParty } from "./booking-workflow-api.ts"
import { unpadCustomsDecimal } from "./booking-customs-prefill.ts"

export type CustomsCargoRow = {
  description: string
  packageQuantity: string
  packageType: string
  grossWeightKg: string
  netWeightKg: string
  hsCode: string
  countryOfOrigin: string
  declaredValue: string
  declaredValueCurrency: string
}

export type CustomsPartyFields = {
  direction: string
  exporterName: string
  exporterAddress: string
  exporterCountry: string
  exporterIdentifier: string
  importerName: string
  importerAddress: string
  importerCountry: string
  importerIdentifier: string
  importerIdentifierType: string
}

export function customsCountry(party?: BookingWorkflowParty) {
  return party?.countryCode || party?.address?.match(/(?:^|[,\s])([A-Z]{2})\s*$/)?.[1] || ""
}

export function customsRegistration(party?: BookingWorkflowParty) {
  return ["eori", "vat", "eori_or_vat"].includes(String(party?.identifierType ?? "").toLowerCase())
    ? String(party?.identifierValue ?? "") : ""
}

export function customsReceivingFields(parties: readonly BookingWorkflowParty[], direction: string) {
  const role = direction.toLowerCase() === "import" ? "importer" : "consignee"
  const party = parties.find((item) => item.role.toLowerCase() === role)
  return {
    importerName: String(party?.name ?? ""),
    importerAddress: String(party?.address ?? ""),
    importerCountry: customsCountry(party),
    importerIdentifier: customsRegistration(party),
    importerIdentifierType: party?.identifierType?.toLowerCase() === "vat" ? "vat" : "eori",
  }
}

function unlinkedIdentity(party: BookingWorkflowParty | undefined, name: string, address: string) {
  if (party?.name && party.name.trim() !== name.trim()) {
    return { organisationId: null, addressId: null, contactId: null, identifierType: null, identifierValue: null }
  }
  return party?.address && party.address.trim() !== address.trim() ? { addressId: null } : {}
}

/** Never turn a Booking account code into an EORI or overwrite the operational shipper. */
export function customsPartiesForSave(parties: readonly BookingWorkflowParty[], fields: CustomsPartyFields): BookingWorkflowParty[] {
  const isImport = fields.direction.toLowerCase() === "import"
  const shipper = parties.find((party) => party.role.toLowerCase() === "shipper")
  const consignor = parties.find((party) => party.role.toLowerCase() === "consignor")
  const consignee = parties.find((party) => party.role.toLowerCase() === "consignee")
  const importer = parties.find((party) => party.role.toLowerCase() === "importer")
  const result = parties.filter((party) => !["consignor", "importer"].includes(party.role.toLowerCase()))
    .map((party) => party.role.toLowerCase() === "consignee"
      ? {
          ...party,
          ...(isImport ? { isPrimary: false } : {
            ...unlinkedIdentity(party, fields.importerName, fields.importerAddress),
            name: fields.importerName,
            address: fields.importerAddress,
            countryCode: fields.importerCountry.toUpperCase(),
            isPrimary: true,
          }),
        }
      : party)
  result.push({
    ...(consignor ?? shipper),
    ...unlinkedIdentity(consignor ?? shipper, fields.exporterName, fields.exporterAddress),
    role: "consignor", sequence: 1,
    name: fields.exporterName, address: fields.exporterAddress,
    countryCode: fields.exporterCountry.toUpperCase(),
    identifierType: "eori", identifierValue: fields.exporterIdentifier, isPrimary: true,
  })
  if (isImport) result.push({
    ...importer,
    ...unlinkedIdentity(importer, fields.importerName, fields.importerAddress),
    role: "importer", sequence: 1,
    name: fields.importerName, address: fields.importerAddress,
    countryCode: fields.importerCountry.toUpperCase(),
    identifierType: fields.importerIdentifierType === "vat" ? "vat" : "eori",
    identifierValue: fields.importerIdentifier, isPrimary: true,
  })
  else if (importer) result.push({ ...importer, isPrimary: false })
  if (!isImport && !consignee && [fields.importerName, fields.importerAddress, fields.importerCountry].some(Boolean)) {
    result.push({ role: "consignee", sequence: 20, name: fields.importerName,
      address: fields.importerAddress, countryCode: fields.importerCountry.toUpperCase(), isPrimary: true })
  }
  return result
}

export function customsCargoRows(cargo: readonly BookingWorkflowCargo[]): CustomsCargoRow[] {
  return cargo.map((line) => ({
    description: String(line.description ?? ""),
    packageQuantity: String(unpadCustomsDecimal(line.packageQuantity ?? line.pieces ?? "")),
    packageType: String(line.packageType ?? ""),
    grossWeightKg: String(unpadCustomsDecimal(line.grossWeightKg ?? "")),
    netWeightKg: String(unpadCustomsDecimal(line.netWeightKg ?? "")),
    hsCode: String(line.hsCode ?? ""),
    countryOfOrigin: String(line.countryOfOrigin ?? ""),
    declaredValue: String(unpadCustomsDecimal(line.declaredValue ?? "")),
    declaredValueCurrency: String(line.declaredValueCurrency ?? ""),
  }))
}

/** Retain every line's stable ID, handling, dimensions, and equipment links. */
export function customsCargoForSave(cargo: readonly BookingWorkflowCargo[], rows: readonly CustomsCargoRow[]): BookingWorkflowCargo[] {
  if (cargo.length !== rows.length) throw new Error("Cargo changed while Customs was being edited. Reload the Booking and try again.")
  return cargo.map((line, index) => ({
    ...line,
    description: rows[index].description,
    pieces: rows[index].packageQuantity || null,
    packageQuantity: rows[index].packageQuantity || null,
    packageType: rows[index].packageType,
    grossWeightKg: rows[index].grossWeightKg || null,
    netWeightKg: rows[index].netWeightKg || null,
    hsCode: rows[index].hsCode,
    countryOfOrigin: rows[index].countryOfOrigin.toUpperCase(),
    declaredValue: rows[index].declaredValue || null,
    declaredValueCurrency: rows[index].declaredValueCurrency.toUpperCase(),
  }))
}
