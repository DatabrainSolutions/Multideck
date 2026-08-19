import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const apiSource = await readFile(new URL("../src/lib/customs-drafts-api.ts", import.meta.url), "utf8")
const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const translations = await readFile(new URL("../src/i18n/customs-declaration-phrases.ts", import.meta.url), "utf8")

test("the declaration register keeps submitter attribution on each saved row", () => {
  assert.match(apiSource, /submittedBy: string \| null/u)
  assert.match(apiSource, /\.rpc\("multideck_customs_declaration_register_page"/u)
  assert.match(apiSource, /rows: Array\.isArray\(response\.rows\) \? response\.rows as CustomsDraftSummary\[\] : \[\]/u)
  assert.match(apiSource, /limit: Math\.max\(1, Math\.min\(input\.limit, 50\)\)/u)
  assert.match(apiSource, /\.limit\(customsDeclarationItemReadLimit\)/u)
})

test("the declaration register shows the authenticated submitter in a narrow avatar column", () => {
  assert.match(appSource, /<CustomsDeclarationsPage[^>]+currentUser=\{currentUser\}/u)
  assert.match(pageSource, /id: "submittedBy"[\s\S]*width: 64[\s\S]*maxWidth: 64/u)
  assert.match(pageSource, /draft\.submittedBy === currentUser\?\.id/u)
  assert.match(pageSource, /<AvatarImage src=\{currentUser\.profilePhotoUrl\} alt=""/u)
  assert.match(pageSource, /aria-label=\{`\$\{t\("Submitted by"\)\}: \$\{name\}`\}/u)
})

test("the submitter label is available in every supported declaration language", () => {
  assert.match(translations, /"Submitted by": \{ de: "[^"]+", fr: "[^"]+", ar: "[^"]+" \}/u)
})
