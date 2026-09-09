import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appShellSource = await readFile(new URL("../src/components/multideck/app-shell.tsx", import.meta.url), "utf8")
const quoteSource = await readFile(new URL("../src/pages/quotes-page.tsx", import.meta.url), "utf8")
const quoteStyles = await readFile(new URL("../src/quotes-transfer.css", import.meta.url), "utf8")

test("the shared application shell cannot become a horizontal page scroller", () => {
  assert.match(appShellSource, /h-screen w-full max-w-full overflow-hidden/u)
  assert.match(appShellSource, /flex h-screen w-full min-h-0 min-w-0 overflow-hidden/u)
  assert.match(appShellSource, /min-h-0 min-w-0 max-w-full flex-1 overscroll-x-none/u)
  assert.match(appShellSource, /overflow-x-clip overflow-y-auto md-scrollbar/u)
})

test("quote detail adapts to its available shell width instead of viewport breakpoints", () => {
  assert.match(quoteSource, /className="md-quote-workspace min-h-full min-w-0 max-w-full overflow-x-clip/u)
  assert.match(quoteSource, /md-quote-workspace-header grid min-w-0/u)
  assert.match(quoteSource, /md-quote-record-header flex min-w-0 gap-2/u)
  assert.match(quoteSource, /md-quote-cargowise-primary-grid grid min-w-0/u)
  assert.match(quoteSource, /md-quote-cargowise-intelligence-grid grid min-w-0/u)
  assert.match(quoteStyles, /container-name: quote-workspace/u)
  assert.match(quoteStyles, /@container quote-workspace \(min-width: 720px\)/u)
  assert.match(quoteStyles, /@container quote-workspace \(min-width: 960px\)/u)
})
