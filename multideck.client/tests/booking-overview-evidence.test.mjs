import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { routeScheduleParts } from '../src/lib/booking-route-schedule.ts'
import { bookingRecordAvailability } from '../src/lib/booking-record-availability.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
const { transformSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')

test('workspace summary uses saved journey endpoints and only explicit planned dates', () => {
  const start = source.indexOf('function bookingWorkspaceRecord(')
  const code = transformSync(source.slice(start, source.indexOf('\nconst statusTone:', start)), { loader: 'ts' }).code
  const mocks = {
    asRecord: value => value ?? {}, bookingQuoteHandoff: () => ({ quote: {}, facts: {} }),
    bookingParty: () => null, recordText: (record, key) => record[key] ?? '',
    bookingWorkspaceMode: value => value, bookingWorkspaceDirection: value => value,
  }
  const project = new Function(...Object.keys(mocks), `${code};return bookingWorkspaceRecord`)(...Object.values(mocks))
  const workspace = { booking: { bookingReference: 'INTERNAL-QA', origin: 'Stale header origin', destination: 'Stale header destination',
    readyDate: '2026-09-01', requiredDeliveryDate: '2026-09-30', predictedDeliveryAt: '2026-09-29' },
    routes: [{ origin: 'Rail origin', originUnlocode: '', destination: 'Interchange', plannedDepartureAt: '2026-09-21T00:00:00Z' },
      { origin: 'Interchange', destination: 'Road destination', destinationUnlocode: ' ', plannedArrivalAt: '2026-09-22T00:00:00Z' }],
    containers: [], cargo: [], documents: [] }
  const before = JSON.stringify(workspace)
  const saved = project(workspace).booking
  assert.equal(saved.origin, 'Rail origin')
  assert.equal(saved.destination, 'Road destination')
  assert.equal(saved.route, 'Rail origin → Road destination')
  assert.equal(saved.departureDate, '2026-09-21')
  assert.equal(saved.arrivalDate, '2026-09-22')
  assert.equal(saved.eta, '', 'A planned date must not become an estimate')
  assert.equal(JSON.stringify(workspace), before)
  const missing = project({ ...workspace, routes: [{ origin: '', destination: '', plannedArrivalAt: null }] }).booking
  assert.equal(missing.origin, '')
  assert.equal(missing.destination, '')
  assert.equal(missing.departureDate, '')
  assert.equal(missing.arrivalDate, '')
  const noRoutes = project({ ...workspace, routes: [] }).booking
  assert.equal(noRoutes.origin, 'Stale header origin')
  assert.equal(noRoutes.arrivalDate, '')
})

function component(name, end, language, resultName = name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0)
  const code = transformSync(source.slice(start, source.indexOf(`function ${end}(`, start)), {
    loader: 'tsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  }).code
  // Only shared presentation primitives and locale context are substituted.
  // The actual product components and data-availability rule execute unchanged.
  const wrapper = ({ children }) => React.createElement('div', null, children)
  const mocks = {
    React, routeScheduleParts, CompactSectionShell: ({ title, children }) => React.createElement('section', null, React.createElement('h3', null, title), children), useLanguage: () => ({ language, t: value => value }),
    bookingRecordAvailability, Surface: wrapper, StatusPill: wrapper,
    AiBrain: () => null, Database: () => null, ChartBar: () => null,
    toneToVar: () => 'currentColor', Progress: wrapper,
    BookingSectionHeading: ({ title }) => React.createElement('h2', null, title),
    bookingLocationFlag: () => null, bookingModeKey: value => value.toLowerCase(),
    Plane: () => null, Ship: () => null, Truck: () => null, Route: () => null,
    ArrowDownToLine: () => null, ArrowUpFromLine: () => null,
    ArrowRight: () => null, CalendarClock: () => null,
  }
  return new Function(...Object.keys(mocks), `${code};return ${resultName}`)(...Object.values(mocks))
}

test('record availability distinguishes absent data from an empty or populated saved list', () => {
  for (const records of [undefined, null]) assert.equal(bookingRecordAvailability(records).label, 'Not loaded')
  assert.equal(bookingRecordAvailability([]).label, 'No records')
  const documents = Object.freeze([{ id: 'issued-pdf', title: 'JQ20022.pdf' }])
  assert.deepEqual(bookingRecordAvailability(documents), { label: 'Records available', tone: 'teal' })
  assert.equal(documents.length, 1)
})

for (const language of ['en-GB', 'en-US']) {
  test(`${language}: compact route summary retains origin, destination and mode`, () => {
    const View = component('BookingRouteSummary', 'BookingDetailHeader', language)
    const html = renderToStaticMarkup(React.createElement(View, { record: { booking: { origin: 'GBFXT', destination: 'NLRTM', mode: 'Sea' } } }))
    assert.match(html, /GBFXT/); assert.match(html, /NLRTM/); assert.match(html, /Sea/)
    assert.doesNotMatch(html, /ETA|Planned arrival/)
  })
  test(`${language}: actual forecast view never turns status, carrier or dates into a probability`, () => {
    const View = component('BookingDexterForecastStatus', 'BookingOverviewSignals', language)
    for (const status of ['On track', 'Delayed', 'Exception', 'Completed']) {
      const html = renderToStaticMarkup(React.createElement(View, { record: {
        booking: { status, progress: 100, carrier: 'Carrier', departureDate: '2026-09-18', eta: '2026-10-18' },
      } }))
      assert.match(html, /Forecast unavailable/)
      assert.match(html, /Planned dates are not an on-time probability/)
      assert.doesNotMatch(html, /[0-9]+%|<svg|Confidence|78/)
    }
  })
  test(`${language}: actual context reads saved documents, declarations and charges independently`, () => {
    const View = component('BookingAvailabilityInspector', 'BookingDecisionOverview', language)
    const record = { booking: {}, workspace: {
      documents: [{ id: 'accepted-pdf' }], declarations: [], charges: [],
    } }
    const render = value => renderToStaticMarkup(React.createElement(View, { record: value }))
    const html = render(record)
    assert.match(html, /Saved workspace data/)
    assert.match(html, /Documents<\/p><div>Records available/)
    assert.match(html, /Customs declarations<\/p><div>No records/)
    assert.match(html, /Charge lines<\/p><div>No records/)
    assert.doesNotMatch(html, /Not connected|Prototype fixture|Operational readiness/)
    assert.match(render({ booking: {} }), /Documents<\/p><div>Not loaded/)
    assert.match(render({ ...record, workspace: { ...record.workspace, documents: [] } }), /Documents<\/p><div>No records/)
  })

}

test('Details document availability is derived and cannot be manually overwritten', () => {
  assert.match(source, /label="Documents" value=\{t\(bookingRecordAvailability\(workspace.documents\).label\)\} \/>/)
  assert.doesNotMatch(source, /editDetail\("documentsStatus"\)/)
})
