import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const apiSource = await readFile(new URL("../src/lib/customs-drafts-api.ts", import.meta.url), "utf8")
const pageSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")

test("the declaration register resolves the assigned workspace user on each saved row", () => {
  assert.match(apiSource, /assignedUserId: string \| null/u)
  assert.match(apiSource, /assignee: CustomsAssignee \| null/u)
  assert.match(apiSource, /\.rpc\("multideck_customs_declaration_register_page"/u)
  assert.match(apiSource, /getCustomsDeclarationAssigneesByIds/u)
  assert.match(apiSource, /limit: Math\.max\(1, Math\.min\(input\.limit, 50\)\)/u)
  assert.match(apiSource, /\.limit\(customsDeclarationItemReadLimit\)/u)
})

test("the declaration register preserves profile pictures in a narrow assignee avatar column", () => {
  assert.match(appSource, /<CustomsDeclarationsPage[^>]+currentUser=\{currentUser\}/u)
  assert.match(pageSource, /id: "assignedTo"[\s\S]*width: 64[\s\S]*maxWidth: 64/u)
  assert.match(pageSource, /createProfilePhotoSignedUrls/u)
  assert.match(pageSource, /resolvedPhotoUrl = photoUrl \?\? legacyCurrentUser\?\.profilePhotoUrl \?\? null/u)
  assert.match(pageSource, /<AvatarImage src=\{resolvedPhotoUrl\} alt=""/u)
  assert.match(pageSource, /!draft\.assignmentSupported && draft\.submittedBy === currentUser\?\.id/u)
  assert.match(pageSource, /aria-label=\{`\$\{t\("Assigned to"\)\}: \$\{name\}`\}/u)
})
