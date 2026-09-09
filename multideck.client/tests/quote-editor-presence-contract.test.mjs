import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [quotePage, adminApi, app] = await Promise.all([
  read("../src/pages/quotes-page.tsx"),
  read("../src/lib/admin-audit-api.ts"),
  read("../src/App.tsx"),
])

test("quote presence extends the existing authenticated workspace heartbeat", () => {
  assert.match(app, /recordWorkspacePresence\(route\)/)
  assert.match(adminApi, /export async function getQuoteEditorPresence/)
  assert.match(adminApi, /edgeFetch\("admin-audit", "\/presence\/quote"/)
  assert.match(adminApi, /body: JSON\.stringify\(\{ route \}\)/)
})

test("quote editor awareness is non-blocking, current and hidden with the tab", () => {
  assert.match(quotePage, /getQuoteEditorPresence\(quoteRoute\)/)
  assert.match(quotePage, /window\.setInterval\(refreshEditors, 20_000\)/)
  assert.match(quotePage, /document\.visibilityState !== "visible"/)
  assert.match(quotePage, /else setQuoteEditors\(\[\]\)/)
  assert.match(quotePage, /Presence is supporting awareness only[\s\S]*must not[\s\S]*interrupt quote editing or autosave/)
})

test("the quote header names colleagues without blocking editing", () => {
  assert.match(quotePage, /function QuoteCoEditorWarning/)
  assert.match(quotePage, /also has this quote open/)
  assert.match(quotePage, /Coordinate before making overlapping changes\./)
  assert.match(quotePage, /role="status"/)
  assert.match(quotePage, /aria-live="polite"/)
  assert.match(quotePage, /quoteEditors\.length \? <QuoteCoEditorWarning/)
  assert.doesNotMatch(quotePage, /disabled=\{[^}]*quoteEditors|quoteEditors[^\n]*throw new Error/)
})
