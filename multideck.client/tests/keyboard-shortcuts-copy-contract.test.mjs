import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/data/keyboard-shortcuts-data.ts", import.meta.url), "utf8")

test("keyboard shortcut descriptions stay concise enough for one desktop line", () => {
  const descriptions = [...source.matchAll(/description:\s*"([^"]+)"/gu)].map((match) => match[1])

  assert.ok(descriptions.length >= 30, "Every shortcut and group should provide a description.")
  for (const description of descriptions) {
    assert.ok(description.length <= 52, `Description is too long for one line: ${description}`)
  }
})
