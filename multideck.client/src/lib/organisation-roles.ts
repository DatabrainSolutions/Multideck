export const customerClassificationNames = [
  "Potential Customer",
  "Customer",
] as const

const legacyKeyCustomerRole = "key customer account"

const customerClassificationKeys = new Set(
  customerClassificationNames.map((name) => normaliseOrganisationRole(name)),
)

export function normaliseOrganisationRole(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

export function isCustomerClassification(value: string) {
  return customerClassificationKeys.has(normaliseOrganisationRole(value))
}

export function organisationIsCustomer(types: readonly string[]) {
  return types.some((type) =>
    isCustomerClassification(type) || normaliseOrganisationRole(type) === legacyKeyCustomerRole,
  )
}

export function isLegacyKeyCustomerRole(value: string) {
  return normaliseOrganisationRole(value) === legacyKeyCustomerRole
}

export function selectCustomerClassification(
  currentTypeIds: readonly string[],
  selectedTypeId: string,
  organisationTypes: ReadonlyArray<{ id: string; name: string }>,
) {
  const customerTypeIds = new Set(
    organisationTypes.filter((type) => isCustomerClassification(type.name)).map((type) => type.id),
  )
  return [...new Set([...currentTypeIds.filter((id) => !customerTypeIds.has(id)), selectedTypeId])]
}

export function clearCustomerClassification(
  currentTypeIds: readonly string[],
  organisationTypes: ReadonlyArray<{ id: string; name: string }>,
) {
  const customerTypeIds = new Set(
    organisationTypes.filter((type) => isCustomerClassification(type.name)).map((type) => type.id),
  )
  return currentTypeIds.filter((id) => !customerTypeIds.has(id))
}
