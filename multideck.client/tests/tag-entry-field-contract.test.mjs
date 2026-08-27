import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [component, settings, galleryData, galleryPage] = await Promise.all([
  read("../src/components/multideck/tag-entry-field.tsx"),
  read("../src/pages/settings-page.tsx"),
  read("../src/data/multideck-data.ts"),
  read("../src/pages/components-gallery-page.tsx"),
])

test("tag entry supports single, comma-separated and pasted terms", () => {
  assert.match(component, /event\.key !== "Enter" && event\.key !== ","/)
  assert.match(component, /handlePaste/)
  assert.match(component, /split\(\/\[,\\n\]\/u\)/)
  assert.match(component, /toLocaleLowerCase/)
  assert.match(component, /slice\(0, maxTerms\)/)
})

test("tags use accessible stable controls and reduced transform-only motion", () => {
  assert.match(component, /useReducedMotion/)
  assert.match(component, /AnimatePresence initial=\{false\} mode="popLayout"/)
  assert.match(component, /key=\{term\.toLocaleLowerCase\(\)\}/)
  assert.match(component, /aria-label=\{removeLabel\(term\)\}/)
  assert.match(component, /role="status" aria-live="polite"/)
  assert.doesNotMatch(component, /filter:|blur\(|height:\s*"auto"/)
})

test("transcription settings use the reusable tag field and the gallery documents it", () => {
  assert.match(settings, /<TagEntryField/)
  assert.match(settings, /const maximumTranscriptionTerms = 100/)
  assert.match(settings, /maxTerms=\{maximumTranscriptionTerms\}/)
  assert.match(settings, /Saved privately to your profile\. Add terms the speech model may mishear\./)
  assert.doesNotMatch(settings, /id="transcription-dictionary"[\s\S]{0,120}<SettingsTextarea/)
  assert.match(galleryData, /id: "tag-entry-field"/)
  assert.match(galleryData, /Dexter voice settings/)
  assert.match(galleryPage, /id === "tag-entry-field"/)
})
