import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
const require = createRequire(import.meta.url)
function sourceModule(path) {
  const source = buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
  const module = { exports: {} }
  new Function('module', 'exports', 'require', source)(module, module.exports, require)
  return module.exports
}
const { importerCompanyPatch, formattedImporterAddress, applyImporterDefaults } = sourceModule('../src/lib/customs-importer.ts')
const { createStandaloneDeclarationDraft, createExportDeclarationItem } = sourceModule('../src/lib/customs-declaration.ts')
const defaults = { dutyPaymentMethod: 'E', vatPaymentMethod: 'E', defermentAccount: '1234567', cguDocumentId: 'GBCGU12345', dpoDocumentId: 'GBDPO67890', cguHolderEori: 'GB123456789000', dpoHolderEori: 'GB123456789000' }
test('company tax-party preference uses VAT and FR1, retaining manual parties and later overrides', () => {
  const company = { id: 'customer-one', name: 'Customer Name', addresses: [], operations: { customs: { vatNumber: 'GB123456789', eoriNumber: 'GB999999999000', domesticDutyTaxUseCustomerByDefault: true } } }
  const source = { ...createStandaloneDeclarationDraft('import'), ...importerCompanyPatch(company) }
  const initial = applyImporterDefaults(source)
  assert.equal(initial.domesticDutyTaxParties.length, 1)
  assert.deepEqual(initial.domesticDutyTaxParties[0], { id: source.domesticDutyTaxParties[0].id, partyId: 'GB123456789', roleCode: 'FR1', useCustomer: true })
  const manual = { id: 'manual', partyId: 'FR123456789', roleCode: 'FR3' }
  const appended = applyImporterDefaults({ ...source, domesticDutyTaxParties: [manual] })
  assert.deepEqual(appended.domesticDutyTaxParties[0], manual)
  assert.equal(appended.domesticDutyTaxParties[1].roleCode, 'FR1')
  const overridden = { ...initial, domesticDutyTaxParties: [{ ...initial.domesticDutyTaxParties[0], useCustomer: false, roleCode: 'FR2' }] }
  assert.deepEqual(applyImporterDefaults(JSON.parse(JSON.stringify(overridden))).domesticDutyTaxParties, overridden.domesticDutyTaxParties)
  assert.deepEqual(applyImporterDefaults({ ...initial, domesticDutyTaxParties: [] }).domesticDutyTaxParties, [])
  assert.deepEqual(applyImporterDefaults({ ...source, importerUseCustomerTaxPartyDefault: false }).domesticDutyTaxParties, source.domesticDutyTaxParties)
})
function draftWithLines(count) {
  return { ...createStandaloneDeclarationDraft('import'), importerPaymentDefaults: defaults, items: Array.from({ length: count }, (_, index) => ({ ...createExportDeclarationItem(index + 1), dutyCalculations: [{ id: `tax-${index}`, taxType: 'A00', paymentMethod: '', baseQuantity: '1', unitCode: 'KGM', declaredTax: '' }] })) }
}
test('fills twenty duty lines, two documents per item and two header holders exactly once', () => {
  const source = draftWithLines(20)
  const result = applyImporterDefaults(source)
  assert.equal(result.items.length, 20)
  for (const item of result.items) {
    assert.equal(item.dutyCalculations[0].paymentMethod, 'E')
    assert.deepEqual(item.additionalDocuments.filter(doc => doc.category === 'C').map(doc => doc.type), ['505', '506'])
  }
  assert.equal(result.primaryDefermentAccount, '1234567')
  assert.equal(result.additionalAuthorisationHolders.length, 2)
  assert.deepEqual(applyImporterDefaults(result), result)
  assert.equal(source.items[0].dutyCalculations[0].paymentMethod, '')
})
test('preserves overrides and only applies duty authorisations to deferred A-series taxes', () => {
  const source = draftWithLines(3)
  source.items[0].dutyCalculations[0].paymentMethod = 'A'
  source.items[1].dutyCalculations[0].taxType = 'B00'
  source.items[2].dutyCalculations[0].taxType = ''
  const result = applyImporterDefaults(source)
  assert.equal(result.items[0].dutyCalculations[0].paymentMethod, 'A')
  assert.equal(result.items[1].dutyCalculations[0].paymentMethod, 'E')
  assert.equal(result.items[2].dutyCalculations[0].paymentMethod, '')
  assert.equal(result.additionalAuthorisationHolders.length, 0)
  assert.equal(result.items.flatMap(item => item.additionalDocuments).filter(doc => doc.type === '505').length, 0)
  const custom = draftWithLines(1)
  custom.items[0].additionalDocumentCategory = 'C'
  custom.items[0].additionalDocumentType = '505'
  custom.items[0].additionalDocumentId = 'MANUAL'
  custom.primaryDefermentAccount = '7654321'
  const kept = applyImporterDefaults(custom)
  assert.equal(kept.primaryDefermentAccount, '7654321')
  assert.equal(kept.items[0].additionalDocumentId, 'MANUAL')
  assert.equal(kept.items[0].additionalDocuments.filter(doc => doc.type === '505').length, 0)
})
test('office EORI takes priority, company EORI is the fallback, foreign addresses are not selected', () => {
  const address = { id: 'office-one', line1: '18 Rue des Ateliers', line2: 'Building 2', townCity: 'Lyon', postZipCode: '69002', countryCode: 'FR' }
  const company = { id: 'company', name: 'Test company', address, addresses: [address, { ...address, id: 'office-two' }], operations: { customs: { ...defaults, eoriNumber: 'FR123456789', addressEoris: { 'office-one': 'FR987654321' } } } }
  const selected = importerCompanyPatch(company)
  assert.equal(selected.importerEori, 'FR987654321')
  assert.equal(formattedImporterAddress(selected), '18 Rue des Ateliers\nBuilding 2\n69002 Lyon\nFR')
  assert.equal(importerCompanyPatch(company, 'office-two').importerEori, 'FR123456789')
  assert.deepEqual(importerCompanyPatch(company, 'someone-elses-address'), {})
  assert.equal(JSON.parse(JSON.stringify(selected)).importerAddressId, 'office-one')
})
test('export drafts and manually cleared fields are not rewritten by source lookup alone', () => {
  const source = { ...draftWithLines(1), direction: 'export' }
  assert.equal(applyImporterDefaults(source), source)
  assert.equal(applyImporterDefaults({ ...source, direction: 'import', importerPaymentDefaults: undefined }).items[0].dutyCalculations[0].paymentMethod, '')
})
