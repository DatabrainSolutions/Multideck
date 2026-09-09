import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("customs sections share one gliding selection surface", () => {
  assert.match(source, /<LayoutGroup id=\{`customs-\$\{kind\}-sections`\}>/u)
  assert.match(source, /<nav className="relative isolate max-w-full overflow-x-auto/u)
  assert.match(source, /"relative flex min-h-10 items-center/u)
  assert.doesNotMatch(source, /"relative isolate flex min-h-10[^\n]*overflow-hidden/u)
  assert.match(source, /layoutId=\{`customs-\$\{kind\}-active-tab`\}/u)
  assert.match(source, /shadow-\[inset_0_0_0_1px_var\(--md-accent-a14\),0_2px_5px_rgba\(11,20,19,0\.06\)\]/u)
  assert.match(source, /transition=\{reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.spring\)\}/u)
})

test("customs content stays quiet while the highlight carries the movement", () => {
  assert.match(source, /<AnimatePresence initial=\{false\} mode="popLayout">/u)
  assert.doesNotMatch(source, /direction \* 22/u)
  assert.doesNotMatch(source, /blur\(2px\)/u)
  assert.match(source, /aria-controls=\{`customs-panel-\$\{entry\.id\}`\}/u)
  assert.match(source, /id=\{`customs-panel-\$\{tab\}`\}/u)
})

test("customs section motion respects the user's reduced-motion preference", () => {
  assert.match(source, /const shouldReduceMotion = Boolean\(useReducedMotion\(\)\)/u)
  assert.match(source, /reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.spring\)/u)
  assert.match(source, /transition=\{reduceMotion\(shouldReduceMotion, mdMotion\.micro\)\}/u)
  assert.match(source, /motion-reduce:transition-none/u)
})
