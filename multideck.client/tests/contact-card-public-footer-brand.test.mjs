import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(
  new URL("../src/components/multideck/contact-card-public-view.tsx", import.meta.url),
  "utf8",
)

test("the public contact-card footer uses the canonical Multideck logo", () => {
  assert.match(source, /import multideckFullLogo from "@\/assets\/brand\/multideck-full-logo\.svg"/)
  assert.match(source, /aria-label=\{t\("Multideck"\)\}/)
  assert.match(source, /maskImage: `url\(\$\{multideckFullLogo\}\)`/)
  assert.doesNotMatch(source, /Powered by Multideck/)
})

test("the footer logo is centred beneath the card content", () => {
  assert.match(source, /className="mt-8 flex w-full justify-center"/)
})
