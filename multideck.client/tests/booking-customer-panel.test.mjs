import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/components/multideck/booking-customer-panel.tsx', import.meta.url), 'utf8')
const code = transformSync(source.replace(/^import .*\n/gm, '').replace(/export /g, ''), { loader: 'tsx', jsxFactory: 'React.createElement' }).code
class CustomerApiError extends Error { constructor(status) { super(); this.status = status } }
function harness(initialState = null, selection = null) {
  let state = initialState, index = 0, effect
  const mocks = { React, useEffect: fn => { effect ??= fn }, useState: () => index++ === 0 ? [state, value => { state = value }] : [index === 2 ? 0 : selection, () => {}],
    useId: () => 'customer-panel', useLanguage: () => ({ t: value => value }), useReducedMotion: () => true, CustomerApiError, getCustomer: () => Promise.reject(new Error()), mdMotion: { micro: {} },
    motion: { div: ({ initial, animate, transition, ...props }) => React.createElement('div', props) },
    CompactSectionShell: ({ title, action, children }) => React.createElement('section', null, title, action, children),
    Button: ({ variant, size, ...props }) => React.createElement('button', props), ArrowLeft: () => null, ArrowUpRight: () => null, Building2: () => null, Mail: () => null, Phone: () => null }
  const module = new Function(...Object.keys(mocks), `${code}; return { BookingCustomerPanel, customerContactHref }`)(...Object.values(mocks))
  return { ...module, render(props) { index = 0; effect = undefined; return renderToStaticMarkup(module.BookingCustomerPanel(props)) }, runEffect: () => effect(), state: () => state }
}
const account = (id = 'a') => ({ id, name: `Account ${id}`, accountCode: '', metadata: {}, engagement: null, address: null, contacts: [] })
test('unassigned, loading, missing data and denied states never invent customer details', () => {
  assert.match(harness().render({ onAssignCustomer() {} }), /No customer assigned.*Assign customer/)
  assert.match(harness().render({ customerId: 'a' }), /Loading customer/)
  const sparse = harness({ id: 'a', data: account() }).render({ customerId: 'a' })
  assert.match(sparse, /No account email saved/); assert.match(sparse, /No preferences saved/); assert.match(sparse, /No contacts linked/)
  assert.match(harness({ id: 'a', error: 'You don’t have access to this customer.' }).render({ customerId: 'a' }), /role="alert".*You don’t have access.*Try again/)
})
test('customer switch hides old data before the next effect; late responses cannot replace it', async () => {
  const h = harness({ id: 'a', data: account() })
  let resolveA, resolveB
  h.render({ customerId: 'a', loadCustomer: () => new Promise(resolve => { resolveA = resolve }) })
  const cancelA = h.runEffect()
  cancelA()
  assert.doesNotMatch(h.render({ customerId: 'b', loadCustomer: () => new Promise(resolve => { resolveB = resolve }) }), /Account a/)
  h.runEffect(); resolveB(account('b')); await Promise.resolve(); resolveA(account('a')); await Promise.resolve()
  assert.equal(h.state().data.id, 'b')
})
test('wrong customer response fails closed and denied reads keep details hidden', async () => {
  for (const loadCustomer of [async () => account('other'), async () => { throw new CustomerApiError(403) }]) {
    const h = harness(); h.render({ customerId: 'a', loadCustomer }); h.runEffect()
    await Promise.resolve(); await Promise.resolve()
    assert.equal(h.state().data, undefined); assert.ok(h.state().error)
  }
})
test('contacts must belong to the account; selected contact leads; saved channel restrictions are honoured', () => {
  const data = { ...account(), metadata: { communicationChannels: { email: false } }, contacts: [
    { id: 'other', accountId: 'b', name: 'Unrelated', email: 'other@example.com' },
    { id: 'second', accountId: 'a', name: 'Second person', email: 'second@example.com' },
    { id: 'selected', accountId: 'a', name: 'Selected person', email: 'first@example.com', phone: '+44 113 555 0101' },
  ] }
  const html = harness({ id: 'a', data }).render({ customerId: 'a', contactId: 'selected' })
  assert.doesNotMatch(html, /Unrelated|mailto:/); assert.match(html, /Do not use.*Email/)
  assert.ok(html.indexOf('Selected person') < html.indexOf('Second person'))
  assert.match(html, /View contact: Selected person/)
  const detail = harness({ id: 'a', data }, { customerId: 'a', contactId: 'selected' }).render({ customerId: 'a', contactId: 'selected' })
  assert.doesNotMatch(detail, /Account a|\/crm\/accounts\/a/); assert.match(detail, /title="\+44 113 555 0101"/); assert.match(detail, /Call Selected person: \+44 113 555 0101/); assert.doesNotMatch(detail, />\+44 113 555 0101</);
  assert.match(detail, /tel:\+441135550101/); assert.match(detail, /\/crm\/contacts\/selected/); assert.match(detail, /Back to customer/)
})
test('contact links are data-only and reject injected headers or URL schemes', () => {
  const { customerContactHref: href } = harness()
  assert.equal(href('email', 'alex+freight@example.com'), 'mailto:alex%2Bfreight@example.com')
  for (const value of ['a@example.com?bcc=bad@example.com', 'a@example.com\r\nBcc:bad@example.com', 'javascript:alert(1)', '']) assert.equal(href('email', value), null)
  assert.equal(href('phone', '+44 (113) 555-0101'), 'tel:+441135550101')
  assert.equal(href('phone', 'javascript:alert(1)'), null)
})
