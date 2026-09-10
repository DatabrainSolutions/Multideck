type Value = Record<string, unknown>
const fields: Record<string, string> = {
  name: 'Address name', line1: 'Address line 1', line2: 'Address line 2', townCity: 'Town or city',
  countyState: 'County or state', postZipCode: 'Postcode', countryCode: 'Country', unlocode: 'Location code',
  email: 'Email', phone: 'Phone', timeZone: 'Time zone', capabilities: 'Address uses',
  weeklyHours: 'Weekly opening hours', openingOverrides: 'Opening exceptions',
}
const object = (value: unknown): value is Value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const canonical = (value: unknown): string => JSON.stringify(Array.isArray(value)
  ? value.map(canonical).sort() : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value)
function display(value: unknown, field: string): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (!Array.isArray(value)) return String(value)
  if (!value.length) return 'None'
  return value.map(item => {
    if (!object(item)) return String(item)
    if (field === 'capabilities') return `${item.code}${item.isDefault ? ' (default)' : ''}`
    if (field === 'weeklyHours') return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(item.dayOfWeek)]}: ${item.opensAt}–${item.closesAt}`
    if (field === 'openingOverrides') return `${item.date}: ${item.isClosed ? 'Closed' : `${item.opensAt}–${item.closesAt}`}${item.note ? ` — ${item.note}` : ''}`
    return `${item.name ?? item.officeId}${item.isPrimary ? ' (primary)' : ''}`
  }).join('; ')
}

/** Every replaced value must have an authorised before snapshot and be reviewable. */
export function companyEditActionReview(records: Map<string, Value>, args: Value, action: string) {
  const company = records.get(String(args.target_id ?? ''))
  if (!company || company.sourceTable !== 'Org_Master' || !Number.isInteger(company.editVersion)
    || company.editVersion !== args.expected_version || typeof company.name !== 'string')
    throw new Error('Read the current company, including its saved edit version, before preparing this change.')
  let before: Value; let after: Value; let labels: Record<string,string>; let title: string; let description: string
  if (action === 'update_company_foundation') {
    if (!Array.isArray(company.responsibleOffices) || !Array.isArray(args.office_assignments)
      || !['accountCode','scopeCode','isPotential'].every(field => Object.hasOwn(company,field)))
      throw new Error('Read the complete company setup before preparing this change.')
    const offices = company.responsibleOffices.filter(object)
    const known = new Map(offices.map(office => [office.officeId, office.name]))
    if (args.office_assignments.some(office => !object(office) || !known.has(office.officeId)))
      throw new Error('Use the company form to assign a new responsible office, where available offices can be verified.')
    before = {accountCode: company.accountCode, scopeCode: company.scopeCode, isPotential: company.isPotential,
      offices: offices.map(office => ({officeId: office.officeId, name: office.name, isPrimary: office.isPrimary}))}
    after = {accountCode: args.account_code, scopeCode: args.scope_code, isPotential: args.is_potential,
      offices: args.office_assignments.filter(object).map(office => ({...office, name: known.get(office.officeId)}))}
    labels = {accountCode: 'Account code', scopeCode: 'Scope', isPotential: 'Potential customer', offices: 'Responsible offices'}
    title = 'Update company'; description = `Update ${company.name}.`
  } else {
    if (!object(args.address) || !Array.isArray(company.addresses)) throw new Error('Read the complete saved addresses before preparing this change.')
    const address = args.address_id == null ? null : company.addresses.find(item => object(item) && item.addressId === args.address_id)
    if (args.address_id != null && !object(address)) throw new Error('Read this exact address on the selected company before preparing its changes.')
    if (!Object.keys(fields).every(field => Object.hasOwn(args.address as Value, field)
      && (address == null || Object.hasOwn(address, field))))
      throw new Error('Read all saved address fields, weekly hours and opening exceptions before preparing this replacement.')
    before = object(address) ? address : {}; after = args.address; labels = fields
    title = address ? 'Update company address' : 'Add company address'
    description = `${address ? 'Update the saved address for' : 'Add an address to'} ${company.name}${object(address) && address.name ? ` (${address.name})` : ''}.`
  }
  const changes = Object.entries(labels).filter(([field]) => canonical(before[field] ?? null) !== canonical(after[field] ?? null))
    .map(([field,label]) => ({field: label, before: display(before[field],field), after: display(after[field],field),
      value: display(after[field],field), beforeKnown: true, kind: before[field] == null ? 'added' : after[field] == null ? 'removed' : 'changed'}))
  if (!changes.length) throw new Error('The proposed values already match this saved company record.')
  return {title, description, changes}
}
