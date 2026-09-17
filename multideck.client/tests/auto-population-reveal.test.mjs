import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const source = readFileSync(new URL('../src/components/multideck/auto-populated-field.tsx', import.meta.url), 'utf8')
const code = transformSync(source.slice(source.indexOf('const REVEAL_DURATION_MS'), source.indexOf('export function useAutoPopulationMorph')), { loader: 'tsx' }).code

class Element extends EventTarget {
  constructor() {
    super(); this.style = { setProperty(key, value) { this[key] = value } }; this.dataset = {}; this.attributes = new Map()
    this.children = []; this.clientLeft = 1; this.clientTop = 1; this.scrollLeft = 0; this.scrollTop = 0
    this.bounds = { left: 20.5, top: 10.25, width: 260.75, height: 32 }
  }
  setAttribute(name, value) { this.attributes.set(name, value) }
  removeAttribute(name) { this.attributes.delete(name) }
  querySelectorAll() { return this.children }
  closest() { return this.button ?? null }
  append(child) { this.children.push(child); child.parentElement = this }
  getBoundingClientRect() { return this.bounds }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this) }
  cloneNode() {
    const clone = new this.constructor(); clone.attributes = new Map(this.attributes); clone.children = this.children.map(child => child.cloneNode()); return clone
  }
  animate(frames, options) {
    let resolve, reject
    const animation = { frames, options, cancelled: false, finished: new Promise((yes, no) => { resolve = yes; reject = no }), finish() { resolve() }, cancel() { this.cancelled = true; reject() } }
    // Native WAAPI rejections are handled by the implementation for the sweep.
    animation.finished.catch(() => {})
    this.animations ??= []; this.animations.push(animation); return animation
  }
}
class Input extends Element { value = '' }
class Textarea extends Input {}
function harness(Kind = Input) {
  const element = new Kind(), parent = new Element(), preference = new EventTarget(), document = new EventTarget(), observers = []
  parent.bounds = { left: 10, top: 5, width: 400, height: 80 }; parent.append(element)
  element.value = '1 Harbour Exchange\nLondon'; element.setAttribute('id', 'address'); element.setAttribute('name', 'address'); element.scrollLeft = 14; element.scrollTop = 6
  preference.matches = false; document.visibilityState = 'visible'; document.createElement = () => new Element()
  const computed = { color: 'rgb(20, 30, 40)', getPropertyValue: key => ({ font: '14px sans-serif', padding: '4px 10px', textOverflow: 'ellipsis' })[key], *[Symbol.iterator]() { yield* ['font', 'padding', 'textOverflow'] } }
  const mocks = { window: { getComputedStyle: () => computed, matchMedia: () => preference }, document, HTMLInputElement: Input, HTMLTextAreaElement: Textarea,
    ResizeObserver: class { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) } observe() {} disconnect() { this.disconnected = true } }, }
  const create = new Function(...Object.keys(mocks), `${code}; return createAutoPopulationReveal`)(...Object.values(mocks))
  return { element, parent, document, preference, observers, start: () => create(element) }
}

test('the mirror preserves native values, scroll and fractional positioning without joining the form', () => {
  for (const Kind of [Input, Textarea]) {
    const h = harness(Kind), original = h.element.value, stop = h.start(), reveal = h.parent.children[1], mirror = reveal.children[0]
    assert.equal(h.element.value, original); assert.equal(mirror.value, original)
    assert.equal(mirror.disabled, true); assert.equal(mirror.attributes.has('id'), false); assert.equal(mirror.attributes.has('name'), false)
    assert.equal(reveal.inert, true); assert.equal(reveal.attributes.get('aria-hidden'), 'true')
    assert.equal(reveal.style.left, '9.5px'); assert.equal(reveal.style.top, '4.25px'); assert.equal(reveal.style.width, '260.75px')
    assert.equal(mirror.scrollLeft, 14); assert.equal(mirror.scrollTop, 6); assert.equal(mirror.style.textOverflow, 'ellipsis')
    stop(); assert.equal(h.parent.children.length, 1); assert.equal(h.element.dataset.autoPopulationRevealing, undefined)
  }
})
test('completion and cancellation remove all motion, observers and event listeners', async () => {
  const h = harness(), stop = h.start(), reveal = h.parent.children[1]
  assert.equal(reveal.animations[0].options.duration, 640)
  reveal.animations[0].finish(); await Promise.resolve()
  assert.equal(h.parent.children.length, 1); assert.equal(h.observers[0].disconnected, true)
  assert.equal(reveal.animations[0].cancelled, true); assert.equal(reveal.children[0].animations[0].cancelled, true)
  stop(); assert.equal(h.element.dataset.autoPopulationRevealing, undefined)
})
test('a cancelled predecessor cannot reveal the native text underneath its replacement', async () => {
  const h = harness(), stopFirst = h.start(); stopFirst(); const stopSecond = h.start()
  await Promise.resolve() // rejected old finished promise runs after the replacement starts
  assert.equal(h.parent.children.length, 2); assert.equal(h.element.dataset.autoPopulationRevealing, 'true')
  stopSecond(); await Promise.resolve(); assert.equal(h.parent.children.length, 1)
})
test('typing, focusing and scrolling immediately return control to the native field', () => {
  for (const event of ['beforeinput', 'input', 'pointerdown', 'keydown', 'focus', 'scroll']) {
    const h = harness(); h.start(); h.element.dispatchEvent(new Event(event))
    assert.equal(h.parent.children.length, 1, event); assert.equal(h.element.dataset.autoPopulationRevealing, undefined, event)
  }
})
test('span-based selectors cancel when their enclosing button receives input', () => {
  const h = harness(Element); h.element.button = new Element(); h.start(); h.element.button.dispatchEvent(new Event('keydown'))
  assert.equal(h.parent.children.length, 1)
})
test('resizing tracks the control; switching tabs or reducing motion ends the reveal', () => {
  const h = harness(); h.start(); h.element.bounds.width = 120.5; h.observers[0].callback()
  assert.equal(h.parent.children[1].style.width, '120.5px')
  h.preference.matches = true; h.preference.dispatchEvent(new Event('change')); assert.equal(h.parent.children.length, 1)
  h.preference.matches = false; h.start(); h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.parent.children.length, 1)
})
