import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")

test("pinned table surfaces avoid stale backdrop-filter compositor layers", () => {
  const pinnedHeader = source.match(/isPinned && "z-\[3\][^"]+"/u)?.[0] ?? ""
  const pinnedCell = source.match(/isPinned && "z-\[2\][^"]*"/u)?.[0] ?? ""

  assert.match(pinnedHeader, /bg-\[var\(--md-table-pinned-bg\)\]/u)
  assert.doesNotMatch(pinnedHeader, /backdrop-blur/u)
  assert.doesNotMatch(pinnedCell, /backdrop-blur/u)
  assert.match(source, /isPinned && \(isSelected \? "bg-\[var\(--md-table-pinned-selected-bg\)\]" : "bg-\[var\(--md-table-pinned-bg\)\]"\)/u)
  assert.equal(source.match(/key=\{`\$\{column\.id\}:\$\{isPinned \? "pinned" : "unpinned"\}`\}/gu)?.length, 2)
})
