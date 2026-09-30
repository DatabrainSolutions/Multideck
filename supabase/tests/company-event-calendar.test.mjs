import assert from 'node:assert/strict'
import test from 'node:test'
import { importTypeScriptGraph } from './import-typescript-graph.mjs'

const { companyEventCalendarFile, companyEventGoogleCalendarUrl } = await importTypeScriptGraph(new URL('../../shared/company-event-calendar.ts', import.meta.url))
const event = { id: 'ed998f55-4d76-45f1-ac63-73972679ba77', editVersion: 2, title: 'Team lunch, Leeds', startsAt: '2026-10-03T15:00:00Z', endsAt: '2026-10-03T17:00:00Z', timezone: 'Europe/Athens', location: 'Bar & Bistro; Leeds', details: 'First line\nSecond line' }
const url = `https://jenkar.multideck.app/events/${event.id}`

test('calendar links preserve real instants, event timezone, encoded location and tenant deep link', () => {
  const link = new URL(companyEventGoogleCalendarUrl(event, url))
  assert.equal(link.origin, 'https://calendar.google.com')
  assert.equal(link.searchParams.get('action'), 'TEMPLATE')
  assert.equal(link.searchParams.get('dates'), '20261003T150000Z/20261003T170000Z')
  assert.equal(link.searchParams.get('ctz'), 'Europe/Athens')
  assert.equal(link.searchParams.get('location'), event.location)
  assert.equal(link.searchParams.get('text'), event.title)
  assert.match(link.searchParams.get('details'), /https:\/\/jenkar.multideck.app\/events\//)
})

test('calendar files are personal imports with stable tenant-specific identity and full Unicode-safe details', () => {
  const long = { ...event, details: 'É🎉'.repeat(2000) + '\r\nATTENDEE:mailto:unexpected@example.invalid' }
  const file = companyEventCalendarFile(long, url, new Date('2026-09-26T08:00:00Z'))
  const unfolded = file.replace(/\r\n /g, '')
  assert.match(unfolded, /METHOD:PUBLISH/)
  assert.match(unfolded, /UID:company-event-ed998f55-4d76-45f1-ac63-73972679ba77@jenkar.multideck.app/)
  assert.match(unfolded, /DTSTART:20261003T150000Z\r\nDTEND:20261003T170000Z/)
  assert.match(unfolded, /LOCATION:Bar & Bistro\\; Leeds/)
  assert.ok(unfolded.includes('É🎉'.repeat(2000)))
  assert.ok(unfolded.includes('\\nATTENDEE:mailto:unexpected@example.invalid'))
  assert.doesNotMatch(file, /\r\n(?:ATTENDEE|ORGANIZER):/)
  for (const line of file.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75)
  assert.ok(file.endsWith('END:VCALENDAR\r\n'))
})

test('unknown end time remains unspecified and invalid dates/links cannot create an import', () => {
  const file = companyEventCalendarFile({ ...event, endsAt: null }, url)
  assert.doesNotMatch(file, /DTEND:/)
  assert.throws(() => companyEventCalendarFile({ ...event, startsAt: 'not a date' }, url))
  assert.throws(() => companyEventCalendarFile(event, 'javascript:alert(1)'))
})
