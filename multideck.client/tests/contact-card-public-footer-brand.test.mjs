import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(
  new URL("../src/components/multideck/contact-card-public-view.tsx", import.meta.url),
  "utf8",
)

test("the public contact-card footer inherits the company identity", () => {
  assert.match(source, /PublicCardFooter\(\{ card \}: \{ card: ContactCard \}\)/)
  assert.match(source, /card\.branding\.logoDataUrl/)
  assert.match(source, /card\.tenantName \|\| card\.person\.company/)
  assert.doesNotMatch(source, /multideckFullLogo|Powered by Multideck/)
})

test("the footer logo is centred beneath the card content", () => {
  assert.match(source, /className="mt-8 flex w-full justify-center"/)
})
