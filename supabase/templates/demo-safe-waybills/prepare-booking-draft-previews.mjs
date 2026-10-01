// Local QA only: fictional source -> production mapper -> local Carbone -> DOCX.
// Does not contact the backend, publish a source or generate a live Job document.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { resolve } from 'node:path'
const require = createRequire(new URL('../../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../functions/_shared/transport-document.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports })
const { transportDocumentDataset } = module.exports
const out = resolve(process.argv[2])
const stress = process.argv.includes('--stress')
const carbone = createRequire(`${out}/package.json`)('carbone')
// Community-engine layout QA cannot validate the hosted image/watermark
// formatters. Retain the inspected placeholder artwork; verify provider output
// separately after the approved shared-development release.
carbone.addFormatters({
  ellipsis: (value, length) => String(value ?? '').slice(0, length),
  imageFit: value => value,
  barcode: value => value,
  drop: value => value,
})
const logoDataUri = 'data:image/png;base64,' + readFileSync(new URL('multideck-logo.png', import.meta.url)).toString('base64')
const base = {
  company: { name: 'Example Freight Ltd', logoDataUri }, job: { bookingReference: 'DEMO-BOOKING-001', collectionAddress: '1 Fictional Factory Road, Demo City', deliveryAddress: '2 Fictional Harbour Road, Demo Town' },
  shipper: { name: 'Example Manufacturing Ltd', address: '1 Fictional Factory Road, Demo City, DEMO 1AA, United Kingdom', countryCode: 'GB' },
  consignee: { name: 'Example Receiving Ltd', address: '2 Fictional Harbour Road, Demo Town, DEMO 2BB, India', countryCode: 'IN' },
  notify: { name: 'Example Notify Ltd', address: '3 Fictional Avenue, Demo Town', countryCode: 'IN' },
  deliveryAgent: { name: 'Example Delivery Agent Ltd', address: '4 Fictional Street, Demo Town', countryCode: 'IN' },
  routing: [{ id: 'demo-route', mode: 'sea', isMainCarriage: true, carrierName: 'Example Demo Airlines', vessel: 'Example Demo Vessel', voyageNumber: 'DEMO-V01',
    carrierAddressLine1: '5 Fictional Airline Road', carrierAddressCity: 'Demo City', masterTransportReference: '000-00000000', houseTransportReference: 'DEMO-HOUSE-001', carrierBookingReference: 'DEMO-CARRIER-001',
    origin: { name: 'Felixstowe', unlocode: 'GBFXT', iataCode: 'LHR' }, destination: { name: 'Demo destination', unlocode: 'INAIS', iataCode: 'JFK' }, plannedDepartureAt: '2026-10-01', plannedArrivalAt: '2026-10-20' }],
  cargo: [{ id: 'demo-cargo-1', lineNumber: 1, description: 'Fictional machine parts for demonstration only', packageQuantity: '40', packageType: 'Pallets', grossWeight: '40000', chargeableWeight: '45000', volume: '50', marksAndNumbers: 'DEMO-MARKS-001', hsCode: 'DEMO-CODE', handling: 'Fragile' },
    { id: 'demo-cargo-2', lineNumber: 2, description: 'Fictional display goods — full descriptions are retained in the schedule rather than clipped into the first-page box.', packageQuantity: '3', packageType: 'Cartons', grossWeight: '100', chargeableWeight: '150', volume: '1', marksAndNumbers: 'DEMO-MARKS-002', hsCode: '', handling: '' }],
  equipment: [{ id: 'demo-unit-1', kind: 'container', number: 'DEMO-CTR-001', type: '40GP', seal: 'DEMO-SEAL-001' }, { id: 'demo-unit-2', kind: 'container', number: 'DEMO-CTR-002', type: '40GP', seal: 'DEMO-SEAL-002' }],
  allocations: [{ cargoId: 'demo-cargo-1', containerId: 'demo-unit-1', packageQuantity: '18' }, { cargoId: 'demo-cargo-1', containerId: 'demo-unit-2', packageQuantity: '22' }, { cargoId: 'demo-cargo-2', containerId: 'demo-unit-2', packageQuantity: '3' }],
}
const entries = {}
const specs = [['MAWB', 'Master_Air_Waybill', 'air'], ['MNG_AWB', 'MNG_Air_Waybill', 'air'],
  ['JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859', 'FIATA_Waybill', 'sea'], ['FIATA_BOL_REFERENCE', 'FIATA_BOL_reference', 'sea']]
for (const [code, name, family] of specs) {
  const source = structuredClone(base)
  if (stress) {
    source.cargo = Array.from({ length: 20 }, (_, index) => ({ ...base.cargo[0], id: `stress-${index + 1}`, lineNumber: index + 1,
      description: `DEMO-LINE-${index + 1} ` + 'Fictional long goods description for pagination review. '.repeat(10) + `END-LINE-${index + 1}`,
      packageQuantity: '2', grossWeight: '0.1', chargeableWeight: '0.2', volume: '0.01' }))
    source.allocations = source.cargo.flatMap(line => source.equipment.map(unit => ({ cargoId: line.id, containerId: unit.id, packageQuantity: '1' })))
  }
  source.routing[0].mode = family
  if (family === 'air') {
    source.equipment.forEach(unit => { unit.kind = 'uld'; unit.type = 'AKE' })
    source.routing[0].origin = { name: 'London Heathrow', unlocode: 'GBLHR', iataCode: 'LHR' }
    source.routing[0].destination = { name: 'New York JFK', unlocode: 'USJFK', iataCode: 'JFK' }
  }
  const data = JSON.parse(JSON.stringify(transportDocumentDataset(source, family)))
  const path = new URL(`${name}_booking_draft.docx`, import.meta.url)
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
  entries[hash] = { code, source: `supabase/templates/demo-safe-waybills/${name}_booking_draft.docx`, sampleData: data }
  const prefix = stress ? `${name}-stress` : `${name}-filled`
  writeFileSync(`${out}/${stress ? `${name}-stress` : name}-dataset.json`, JSON.stringify(data, null, 2))
  await new Promise((resolveRender, reject) => carbone.render(path.pathname, data, { lang: 'en-gb' }, (error, bytes) => {
    if (error) return reject(error)
    writeFileSync(`${out}/${prefix}.docx`, bytes)
    resolveRender()
  }))
  console.log(`${code}: fictional local Carbone render complete`)
}
if (!stress) writeFileSync(`${out}/booking-draft-catalogue.json`, JSON.stringify(entries, null, 2))
