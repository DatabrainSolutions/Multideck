import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const detail = readFileSync(new URL("../src/pages/crm-contact-detail-page.tsx", import.meta.url), "utf8")

test("contact detail presents stored codes as localised human values", () => {
  assert.match(detail, /const \{ language, t \} = useLanguage\(\)/)
  assert.match(detail, /value: roleLabel/)
  assert.match(detail, /value: influenceLabel/)
  assert.match(detail, /value: channelLabel/)
  assert.match(detail, /value: preferredLanguageLabel/)
  assert.match(detail, /localizeContactValue\(currentContact\.marketingConsentSource, t\)/)
  assert.match(detail, /localizeContactValue\(item\.status, t\)/)
  assert.match(detail, /localizeContactValue\(item\.source, t\)/)
  assert.match(detail, /return t\(readable\)/)
  assert.match(detail, /new Intl\.DisplayNames\(\[language\], \{ type: "language" \}\)/)
})

test("contact dates follow the selected app language", () => {
  assert.match(detail, /new Intl\.DateTimeFormat\(language,/)
  assert.match(detail, /new Intl\.RelativeTimeFormat\(language,/)
  assert.doesNotMatch(detail, /Intl\.DateTimeFormat\(undefined,/)
  assert.match(detail, /formatDate\(item\.effectiveAt, language\)/)
  assert.match(detail, /relativeDate\(currentContact\.lastContactAt, language\)/)
})

test("presentation labels never replace stored values in contact writes", () => {
  assert.match(detail, /role: contact\.role/)
  assert.match(detail, /influenceLevel: contact\.influenceLevel/)
  assert.match(detail, /preferredChannel: contact\.preferredChannel/)
  assert.match(detail, /preferredLanguage: contact\.preferredLanguage/)
  assert.match(detail, /patch\(\{ role: role === unsetContactValue \? null : role \}\)/)
  assert.match(detail, /patch\(\{ influenceLevel: influenceLevel === unsetContactValue \? null : influenceLevel \}\)/)
  assert.match(detail, /patch\(\{ preferredChannel: preferredChannel === unsetContactValue \? null : preferredChannel \}\)/)
  assert.match(detail, /patch\(\{ preferredLanguage: preferredLanguage === unsetContactValue \? null : preferredLanguage \}\)/)
})

test("editable contact codes use labelled choices instead of exposing database values", () => {
  assert.match(detail, /InlineSelectField label="Role"/)
  assert.match(detail, /InlineSelectField label="Influence"/)
  assert.match(detail, /InlineSelectField label="Preferred channel"/)
  assert.match(detail, /InlineSelectField label="Language"/)
  assert.match(detail, /\{ value: "decision_maker", label: "Decision maker" \}/)
  assert.match(detail, /\{ value: "en-GB", label: "British English" \}/)
  assert.match(detail, /\{ value: "en-US", label: "American English" \}/)
  assert.doesNotMatch(detail, /<InlineField label="Role" value=\{currentContact\.role/)
})
