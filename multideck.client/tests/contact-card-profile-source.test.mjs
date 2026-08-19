import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const contactCardsPage = readFileSync(new URL("../src/pages/contact-cards-page.tsx", import.meta.url), "utf8")
const settingsPage = readFileSync(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")
const contactCardComponents = readFileSync(new URL("../src/components/multideck/contact-card-components.tsx", import.meta.url), "utf8")
const contactCardStore = readFileSync(new URL("../src/lib/contact-card-store.ts", import.meta.url), "utf8")
const translations = readFileSync(new URL("../src/i18n/translate.ts", import.meta.url), "utf8")

test("contact-card identity fields are read-only and direct people to profile settings", () => {
  assert.match(contactCardsPage, /function LockedProfileValue/)
  assert.match(contactCardsPage, /aria-readonly="true"/)
  assert.match(contactCardsPage, /<LockKeyhole/)
  assert.match(contactCardsPage, /Update profile/)
  assert.doesNotMatch(contactCardsPage, /function ProfileImageControl/)
})

test("profile details refresh the card snapshot while visibility remains card-specific", () => {
  assert.match(contactCardsPage, /person: \{ \.\.\.current\.person, \.\.\.profileValues \}/)
  assert.match(contactCardsPage, /set\(\{ showPhone: checked === true \}\)/)
  assert.match(contactCardsPage, /set\(\{ showWebsite: checked === true \}\)/)
})

test("profile settings own phone, website and title", () => {
  assert.match(settingsPage, /website: readProfileMetadataValue\(metadata, \["website", "website_url"\]\)/)
  assert.match(settingsPage, /website: profile\.website\.trim\(\)/)
  assert.match(settingsPage, /updateProfileField\("website", event\.target\.value\)/)
  assert.match(settingsPage, /updateProfileField\("roleTitle", event\.target\.value\)/)
})

test("the live profile photo takes precedence over the legacy card snapshot", () => {
  assert.match(contactCardComponents, /const personPhoto = profilePhotoUrl \|\| card\.person\.profileImageDataUrl/)
  assert.match(contactCardStore, /contact-card-profile\?slug=/)
  assert.match(contactCardStore, /person: \{ \.\.\.card\.person, \.\.\.ownerProfile \}/)
})

test("new profile-owned card copy is translated for supported RTL and European languages", () => {
  assert.match(translations, /"Update profile": \{ de: "Profil aktualisieren", fr: "Mettre à jour le profil", ar: "تحديث الملف الشخصي" \}/)
  assert.match(translations, /"Show phone number": \{ de:/)
  assert.match(translations, /"Managed in profile settings": \{ de:/)
})
