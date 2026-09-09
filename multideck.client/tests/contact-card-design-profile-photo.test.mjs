import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("contact-card design preview receives the owner's signed profile photo", async () => {
  const page = await readFile(new URL("../src/pages/contact-cards-page.tsx", import.meta.url), "utf8")
  const design = await readFile(new URL("../src/components/multideck/contact-card-design.tsx", import.meta.url), "utf8")

  assert.match(page, /<CardDesignPanel card=\{card\} profilePhotoUrl=\{ownerProfilePhotoUrl\}/)
  assert.match(design, /person: \{ \.\.\.card\.person, profileImageDataUrl: profilePhotoUrl \}/)
  assert.match(design, /<CardPreview card=\{previewCard\}/)
})
