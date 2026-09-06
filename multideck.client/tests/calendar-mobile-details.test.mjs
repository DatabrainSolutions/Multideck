import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/multideck/meeting-details-popover.tsx", import.meta.url), "utf8")
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

test("calendar event details become a full-screen mobile sheet with a back action", () => {
  assert.match(source, /window\.matchMedia\("\(max-width: 767px\)"\)/)
  assert.match(source, /<Sheet open=\{Boolean\(selection\)\}/)
  assert.match(source, /md-calendar-mobile-details[^\"]*inset-0![^\"]*h-\[100dvh\]![^\"]*w-screen!/) 
  assert.match(source, /aria-label="Back to calendar"/)
  assert.match(source, /<ArrowLeft className="size-5"/)
  assert.match(source, /pt-\[max\(8px,env\(safe-area-inset-top\)\)\]/)
  assert.match(source, /pb-\[max\(16px,env\(safe-area-inset-bottom\)\)\]/)
})

test("mobile event details slide horizontally and respect reduced motion", () => {
  assert.match(styles, /\.md-calendar-mobile-details\[data-state="open"\]/)
  assert.match(styles, /translate3d\(100%, 0, 0\)/)
  assert.match(styles, /animation: md-calendar-mobile-details-in var\(--md-motion-panel\) both/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.md-calendar-mobile-details\[data-state\][\s\S]*animation: none/)
})

test("desktop keeps the anchored event card and detached action rail", () => {
  assert.match(source, /<Popover key=\{selection\.event\.id\} open/)
  assert.match(source, /side="right"/)
  assert.match(source, /!mobile \? <motion\.div variants=\{row\} role="group" aria-label="Event actions"/)
})
