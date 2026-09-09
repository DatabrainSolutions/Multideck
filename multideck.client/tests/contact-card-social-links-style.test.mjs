import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(
  new URL("../src/components/multideck/contact-card-design.tsx", import.meta.url),
  "utf8",
)

test("social-link rows sit directly on the settings surface", () => {
  const row = source.match(/<div key=\{link\.id\} className="([^"]+)"/)?.[1] ?? ""
  assert.match(row, /border-b/)
  assert.match(row, /last:border-0/)
  assert.doesNotMatch(row, /bg-\[var\(--md-surface-tint\)\]/)
  assert.doesNotMatch(row, /rounded-\[var\(--md-radius-lg\)\]/)
})
