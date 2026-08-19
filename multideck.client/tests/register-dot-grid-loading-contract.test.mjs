import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const registerFiles = [
  "src/pages/bookings-page.tsx",
  "src/pages/contact-cards-page.tsx",
  "src/pages/crm-accounts-page.tsx",
  "src/pages/crm-contacts-page.tsx",
  "src/pages/crm-page.tsx",
  "src/pages/customers-page.tsx",
  "src/pages/customs-declarations-page.tsx",
  "src/pages/quotes-register-page.tsx",
]

test("primary data-loading surfaces reuse the dotted-square loader", async () => {
  for (const file of registerFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8")
    assert.match(source, /DotGridLoader/, `${file} should use the shared dotted-square loader`)
  }
})

test("CRM register loading states do not render a spinning circle", async () => {
  for (const file of ["src/pages/crm-accounts-page.tsx", "src/pages/crm-contacts-page.tsx"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8")
    assert.doesNotMatch(source, /LoaderCircle[^>]*animate-spin/, `${file} should not use a circular loading animation`)
  }
})
