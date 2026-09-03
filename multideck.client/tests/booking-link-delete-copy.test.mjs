import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const page = await readFile(new URL("../src/pages/booking-links-page.tsx", import.meta.url), "utf8")

test("booking-link removal consistently uses delete wording and a trash icon", () => {
  assert.match(page, /<Trash2 className="size-3.5" \/>Delete booking link/)
  assert.match(page, /<DialogTitle>Delete this booking link\?<\/DialogTitle>/)
  assert.match(page, /deleting \? "Deleting…" : "Delete booking link"/)
  assert.match(page, /toast.success\("Booking link deleted"/)
  assert.match(page, /The booking link could not be deleted\./)
  assert.doesNotMatch(page, /Archive booking link|Archive this booking link|Archiving…|Booking link archived/)
})

test("delete preserves the confirmed soft-removal and meeting-history contract", () => {
  assert.match(page, /await updateBookingLink\(deleteTarget.id, \{ status: "archived" \}\)/)
  assert.match(page, /await updateBookingLink[\s\S]*?setLinks[\s\S]*?toast.success\("Booking link deleted"/)
  assert.match(page, /Existing meetings are unchanged\./)
  assert.match(page, /disabled=\{deleting\}>Keep booking link/)
  assert.match(page, /onClick=\{\(\) => void deleteLink\(\)\} disabled=\{deleting\}/)
})
