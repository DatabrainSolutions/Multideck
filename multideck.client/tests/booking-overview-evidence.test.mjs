import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { bookingRecordAvailability } from '../src/lib/booking-record-availability.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
const { transformSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')

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
    React, useLanguage: () => ({ language, t: value => value }),
    bookingRecordAvailability, Surface: wrapper, StatusPill: wrapper,
    AiBrain: () => null, Database: () => null, ChartBar: () => null,
    toneToVar: () => 'currentColor', Progress: wrapper,
    BookingSectionHeading: ({ title }) => React.createElement('h2', null, title),
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
    const View = component('BookingAvailabilityInspector', 'bookingSignalAvailable', language)
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
  test(`${language}: recorded information is not presented as operational approval`, () => {
    const View = component('bookingSignalAvailable', 'BookingDecisionOverview', language, 'BookingOperationalCoverage')
    // This extraction starts with the production availability helper.
    const coverageSource = source.slice(source.indexOf('function bookingSignalAvailable('), source.indexOf('function BookingDecisionOverview('))
    assert.ok(coverageSource.includes('Field presence only;'))
    assert.doesNotMatch(coverageSource, /"Ready"|"Not ready"|booking controls ready|Commercial close-out/)
    for (const booking of [{}, { carrier: 'Carrier', currentLocation: 'Port', progress: 100,
      departureDate: '2026-09-18', eta: '2026-10-18', value: '100', invoice: 'Invoice' }]) {
      const html = renderToStaticMarkup(React.createElement(View, { record: { booking } }))
      assert.match(html, /Booking information coverage/)
      assert.match(html, /Field presence only; not departure clearance or financial close-out approval/)
      assert.doesNotMatch(html, /Ready|Not ready|Operational readiness/)
    }
  })
}

test('Details document availability is derived and cannot be manually overwritten', () => {
  assert.match(source, /label="Documents" value=\{t\(bookingRecordAvailability\(workspace.documents\).label\)\} \/>/)
  assert.doesNotMatch(source, /editDetail\("documentsStatus"\)/)
})
