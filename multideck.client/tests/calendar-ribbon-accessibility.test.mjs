import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/calendar-view.tsx", import.meta.url), "utf8")
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
const ribbon = source.split("export function CalendarDayRibbon")[1].split("export function CalendarView")[0]

function token(name, dark) {
  const block = styles.match(dark ? /\n\.dark \{([\s\S]*?)\n\}/ : /\n:root \{([\s\S]*?)\n\}/)[1]
  const value = block.match(new RegExp(`${name}:\\s*(#[a-f0-9]{6});`, "i"))?.[1]
  assert.ok(value, `Missing ${name} in ${dark ? "dark" : "light"} theme`)
  return value
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => {
    const value = Number.parseInt(part, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test("operational ribbons remain native, labelled record links without clipped text", () => {
  assert.match(ribbon, /<a\s+href=\{ribbon.route\}/)
  for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) assert.ok(ribbon.includes(`event.${modifier}`))
  assert.match(ribbon, /event.button !== 0/)
  assert.match(ribbon, /\{ribbon.title\}/)
  assert.match(ribbon, /min-h-8/)
  assert.match(ribbon, /text-\[12px\]/)
  assert.match(ribbon, /whitespace-normal \[overflow-wrap:anywhere\]/)
  assert.doesNotMatch(ribbon, /truncate|outline-none|active:scale|<button/)
})

test("all ribbon text pairs pass AA in light and dark themes", () => {
  const toneSource = source.split("const ribbonTones:")[1].split("function EventBlock")[0]
  const pairs = [...toneSource.matchAll(/bg-\[var\((--[\w-]+)\)\] text-\[var\((--[\w-]+)\)\]/g)]
  assert.equal(pairs.length, 7)
  for (const dark of [false, true]) {
    for (const [, background, foreground] of pairs) {
      const ratio = contrast(token(background, dark), token(foreground, dark))
      assert.ok(ratio >= 4.5, `${foreground} on ${background} (${dark ? "dark" : "light"}): ${ratio.toFixed(2)}:1`)
      assert.ok(contrast(token("--md-ink", dark), token(background, dark)) >= 3, `Focus contrast on ${background}`)
    }
    assert.ok(contrast(token("--md-ink", dark), token("--md-surface-tint", dark)) >= 3)
  }
})

test("ribbons have visible focus, touch targets and forced-colour support", () => {
  assert.match(styles, /\.md-calendar-day-ribbon:focus-visible\s*\{\s*outline: 2px solid var\(--md-ink\);\s*outline-offset: 2px;/)
  assert.match(styles, /@media \(pointer: coarse\)\s*\{\s*\.md-calendar-day-ribbon\s*\{\s*min-height: 44px;/)
  assert.match(styles, /@media \(forced-colors: active\)[\s\S]*\.md-calendar-day-ribbon:focus-visible\s*\{\s*outline-color: Highlight;/)
})
